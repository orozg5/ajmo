import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from app.auth import get_current_user
from app.constants import validate_item_type
from app.schemas.ai import (
    AiSuggestionItemResponse,
    AiSuggestionsResponse,
    CrossCityTransportRequest,
    EnrichedItemResponse,
    EnrichBatchRequest,
    EnrichRequest,
    NextSuggestionRequest,
    SuggestionsRequest,
    TransportSuggestionItem,
    TransportSuggestionsResponse,
)
from app.services.ai.enrichment import get_place_data, stream_place_data
from app.services.ai.suggestions import (
    get_next_suggestion,
    get_suggestions,
    stream_suggestions,
)
from app.services.ai.transport import (
    get_cross_city_suggestions,
    stream_cross_city_suggestions,
)
from app.services.plans.days import list_days_with_items
from app.services.users.preferences import get_preferences


def sse_event(event: str, data: object) -> str:
    payload = data if isinstance(data, str) else json.dumps(data, default=str)
    return f"event: {event}\ndata: {payload}\n\n"

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/enrich")
async def enrich_item_route(body: EnrichRequest, request: Request) -> EnrichedItemResponse:
    """Cancels the enrichment pipeline if the client disconnects mid-request."""
    enrichment = asyncio.create_task(
        get_place_data(body.name, body.destination, body.item_type)
    )

    async def poll_disconnect() -> None:
        while True:
            if await request.is_disconnected():
                return
            await asyncio.sleep(0.1)

    disconnect = asyncio.create_task(poll_disconnect())

    done, pending = await asyncio.wait(
        {enrichment, disconnect},
        return_when=asyncio.FIRST_COMPLETED,
    )

    for t in pending:
        t.cancel()
        # Don't await after cancel — poll_disconnect's is_disconnected() can block
        # indefinitely on a live connection, hanging the response on fast (cache hit) paths

    if disconnect in done:
        logger.info("Client disconnected — enrichment cancelled for %s", body.name)
        return Response(status_code=499)

    try:
        return enrichment.result()
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error in enrichment pipeline")
        raise HTTPException(status_code=500, detail="Enrichment pipeline failed")


@router.post("/enrich-batch")
async def enrich_batch_route(body: EnrichBatchRequest) -> list[EnrichedItemResponse]:
    tasks = [
        get_place_data(item.name, item.destination, item.item_type)
        for item in body.items
    ]
    try:
        results = await asyncio.gather(*tasks)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error in enrich-batch")
        raise HTTPException(status_code=500, detail="Batch enrichment failed")
    return [EnrichedItemResponse(**r) for r in results]


@router.post("/suggestions")
async def suggest_items_route(
    body: SuggestionsRequest,
    current_user: str = Depends(get_current_user),
) -> AiSuggestionsResponse:
    try:
        days = await list_days_with_items(body.plan_id)
    except Exception:
        logger.exception("Failed to list days for plan %s", body.plan_id)
        raise HTTPException(status_code=500, detail="Failed to load itinerary")

    existing_names: list[str] = [
        item["title"] for day in days for item in day.get("items", [])
    ]

    try:
        preferences = await get_preferences(current_user)
    except Exception:
        logger.warning("Could not load preferences for user %s — proceeding without", current_user)
        preferences = None

    try:
        suggestions = await get_suggestions(
            body.plan_id,
            existing_names,
            preferences,
            body.force_refresh,
            body.exclude_names or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error generating suggestions")
        raise HTTPException(status_code=500, detail="Failed to generate suggestions")

    return AiSuggestionsResponse(suggestions=suggestions)


@router.post("/suggestions/next")
async def next_suggestion_route(
    body: NextSuggestionRequest,
    current_user: str = Depends(get_current_user),
) -> AiSuggestionItemResponse:
    try:
        days = await list_days_with_items(body.plan_id)
    except Exception:
        logger.exception("Failed to list days for plan %s", body.plan_id)
        raise HTTPException(status_code=500, detail="Failed to load itinerary")

    existing_names: list[str] = [
        item["title"] for day in days for item in day.get("items", [])
    ]

    try:
        preferences = await get_preferences(current_user)
    except Exception:
        logger.warning("Could not load preferences for user %s — proceeding without", current_user)
        preferences = None

    try:
        suggestion = await get_next_suggestion(
            body.plan_id,
            existing_names,
            preferences,
            body.exclude_names,
            exclude_slugs=body.exclude_slugs,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error generating next suggestion")
        raise HTTPException(status_code=500, detail="Failed to generate suggestion")

    if suggestion is None:
        raise HTTPException(status_code=404, detail="No new suggestion could be generated")

    return AiSuggestionItemResponse(**suggestion)


@router.post("/transport-suggestions/cross-city")
async def get_cross_city_transport_route(
    body: CrossCityTransportRequest,
    current_user: str = Depends(get_current_user),
) -> TransportSuggestionsResponse:
    """Inter-city transitions only (last item of city A → first item of city B); cached in plans.transport_suggestions['cross_city']."""
    try:
        suggestions_data = await get_cross_city_suggestions(body.plan_id)
        suggestions = [TransportSuggestionItem(**s) for s in suggestions_data]
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error generating cross-city transport suggestions")
        raise HTTPException(status_code=500, detail="Failed to generate transport suggestions")

    return TransportSuggestionsResponse(suggestions=suggestions)


@router.get("/enrich/stream")
async def enrich_stream_route(
    request: Request,
    name: str = Query(..., min_length=1, max_length=200),
    destination: str = Query(..., min_length=1, max_length=120),
    item_type: str = Query(...),
) -> StreamingResponse:
    """Stream AI enrichment field-by-field as the LLM generates them."""
    try:
        validated_type = validate_item_type(item_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    async def event_stream():
        try:
            async for update in stream_place_data(name, destination, validated_type):
                if await request.is_disconnected():
                    return
                yield sse_event("field", update)
            yield sse_event("done", {})
        except Exception:
            logger.exception("enrich_stream_route failed for %s", name)
            yield sse_event("error", {"message": "Enrichment stream failed"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/suggestions/stream")
async def suggestions_stream_route(
    request: Request,
    plan_id: str = Query(..., description="UUID of the plan"),
    current_user: str = Depends(get_current_user),
) -> StreamingResponse:
    """Stream AI suggestions one-by-one; cache hits emit immediately, misses stream from the LLM and persist the full list at the end."""
    async def event_stream():
        try:
            days = await list_days_with_items(plan_id)
            existing_names = [
                item["title"] for day in days for item in day.get("items", [])
            ]

            try:
                preferences = await get_preferences(current_user)
            except Exception:
                logger.warning(
                    "Could not load preferences for user %s — proceeding without",
                    current_user,
                )
                preferences = None

            async for suggestion in stream_suggestions(plan_id, existing_names, preferences):
                if await request.is_disconnected():
                    return
                yield sse_event("suggestion", suggestion)
            yield sse_event("done", {})
        except Exception:
            logger.exception("suggestions_stream_route failed for plan %s", plan_id)
            yield sse_event("error", {"message": "Suggestions stream failed"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/transport-suggestions/stream")
async def transport_stream_route(
    request: Request,
    plan_id: str = Query(..., description="UUID of the plan"),
    current_user: str = Depends(get_current_user),
) -> StreamingResponse:
    """Stream cross-city transport pairs; same-day same-city routing is handled by the frontend via OSRM and /transit/directions."""
    async def event_stream():
        try:
            async for pair in stream_cross_city_suggestions(plan_id):
                if await request.is_disconnected():
                    return
                yield sse_event("pair", pair)
            yield sse_event("done", {})
        except Exception:
            logger.exception(
                "transport_stream_route failed for plan %s",
                plan_id,
            )
            yield sse_event("error", {"message": "Transport stream failed"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
