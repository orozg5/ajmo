import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.schemas.ai import (
    AiSuggestionItemResponse,
    AiSuggestionsResponse,
    CrossCityTransportRequest,
    DayTransportRequest,
    EnrichedItemResponse,
    EnrichBatchRequest,
    EnrichRequest,
    NextSuggestionRequest,
    SuggestionsRequest,
    TransportSuggestionItem,
    TransportSuggestionsResponse,
)
from app.services.ai.enrichment import get_place_data
from app.services.ai.suggestions import get_next_suggestion, get_suggestions
from app.services.ai.transport import get_cross_city_suggestions, get_same_day_suggestions
from app.services.plans.days import list_days_with_items
from app.services.plans.crud import get_plan
from app.services.users.preferences import get_preferences

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/enrich")
async def enrich_item_route(body: EnrichRequest, request: Request) -> EnrichedItemResponse:
    """
    Enrich a travel item with live AI-generated data.
    Supports item_type: attraction, restaurant, hotel, transport, activity.
    Checks the 24-hour cache first; falls back to Tavily + Gemini on a miss.
    Cancels the enrichment pipeline if the client disconnects mid-request.
    """
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
        # Tavily returned no results
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        # LLM returned unparseable JSON or invalid item_type
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error in enrichment pipeline")
        raise HTTPException(status_code=500, detail="Enrichment pipeline failed")


@router.post("/enrich-batch")
async def enrich_batch_route(body: EnrichBatchRequest) -> list[EnrichedItemResponse]:
    """
    Enrich up to 5 travel items concurrently.
    Each item follows the same enrichment pipeline as POST /ai/enrich.
    Returns results in the same order as the input items.
    """
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
async def suggest_items_route(body: SuggestionsRequest) -> AiSuggestionsResponse:
    """
    Generate AI suggestions for a travel plan based on destination, existing items,
    and the user's saved preferences. Reads from plans.suggestions (JSONB); calls
    LLM only on a miss or when force_refresh=True.
    """
    try:
        plan = await get_plan(body.plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    destination: str | None = plan.get("destination")
    if not destination:
        raise HTTPException(status_code=422, detail="Plan has no destination set")

    try:
        days = await list_days_with_items(body.plan_id)
    except Exception:
        logger.exception("Failed to list days for plan %s", body.plan_id)
        raise HTTPException(status_code=500, detail="Failed to load itinerary")

    # Collect existing item names across ALL days to avoid duplicate suggestions
    existing_names: list[str] = [
        item["title"] for day in days for item in day.get("items", [])
    ]

    # Preferences are optional — missing preferences degrade gracefully
    try:
        preferences = await get_preferences(body.user_id)
    except Exception:
        logger.warning("Could not load preferences for user %s — proceeding without", body.user_id)
        preferences = None

    try:
        suggestions = await get_suggestions(
            destination,
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
async def next_suggestion_route(body: NextSuggestionRequest) -> AiSuggestionItemResponse:
    """
    Return a single new suggestion not in exclude_names.

    Checks plans.suggestions first (zero tokens). Calls LLM with temperature=0.6
    only if all saved suggestions are exhausted.
    """
    try:
        plan = await get_plan(body.plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    destination: str | None = plan.get("destination")
    if not destination:
        raise HTTPException(status_code=422, detail="Plan has no destination set")

    try:
        days = await list_days_with_items(body.plan_id)
    except Exception:
        logger.exception("Failed to list days for plan %s", body.plan_id)
        raise HTTPException(status_code=500, detail="Failed to load itinerary")

    existing_names: list[str] = [
        item["title"] for day in days for item in day.get("items", [])
    ]

    try:
        preferences = await get_preferences(body.user_id)
    except Exception:
        logger.warning("Could not load preferences for user %s — proceeding without", body.user_id)
        preferences = None

    try:
        suggestion = await get_next_suggestion(
            body.plan_id,
            destination,
            existing_names,
            preferences,
            body.exclude_names,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error generating next suggestion")
        raise HTTPException(status_code=500, detail="Failed to generate suggestion")

    if suggestion is None:
        raise HTTPException(status_code=404, detail="No new suggestion could be generated")

    return AiSuggestionItemResponse(**suggestion)


@router.post("/transport-suggestions/day")
async def get_day_transport_route(
    body: DayTransportRequest,
) -> TransportSuggestionsResponse:
    """
    Generate transport suggestions for all consecutive item pairs within a single day.

    Pairs span across destination boundaries within the day, so same-day cross-city
    travel (e.g. Rocky Steps → White House when Philly and DC share a day) is included.
    Results are cached in plans.transport_suggestions["same_day"][day_id].
    """
    try:
        suggestions_data = await get_same_day_suggestions(body.plan_id, body.day_id)
        suggestions = [TransportSuggestionItem(**s) for s in suggestions_data]
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error generating day transport suggestions")
        raise HTTPException(status_code=500, detail="Failed to generate transport suggestions")

    return TransportSuggestionsResponse(suggestions=suggestions)


@router.post("/transport-suggestions/cross-city")
async def get_cross_city_transport_route(
    body: CrossCityTransportRequest,
) -> TransportSuggestionsResponse:
    """
    Generate transport suggestions for inter-city transitions only.

    For each consecutive destination pair: last item of city A -> first item of city B.
    Response includes source_city, destination_city, source_day_number, destination_day_number
    so the frontend can render "Philadelphia → Washington DC" context in the day picker.
    Results are cached in plans.transport_suggestions["cross_city"].
    """
    try:
        suggestions_data = await get_cross_city_suggestions(body.plan_id)
        suggestions = [TransportSuggestionItem(**s) for s in suggestions_data]
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error generating cross-city transport suggestions")
        raise HTTPException(status_code=500, detail="Failed to generate transport suggestions")

    return TransportSuggestionsResponse(suggestions=suggestions)
