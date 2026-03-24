import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.constants import VALID_ITEM_TYPES
from app.schemas.responses import EnrichedItemResponse
from app.services.ai_enrichment import get_enriched_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class EnrichRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Name of the item")
    destination: str = Field(..., min_length=1, description="City or country")
    item_type: str = Field(..., description="One of: attraction, restaurant, hotel, transport, activity")

    @field_validator("item_type")
    @classmethod
    def validate_item_type(cls, v: str) -> str:
        if v not in VALID_ITEM_TYPES:
            raise ValueError(f"item_type must be one of {sorted(VALID_ITEM_TYPES)}")
        return v


@router.post("/enrich")
async def enrich_item(body: EnrichRequest, request: Request) -> EnrichedItemResponse:
    """
    Enrich a travel item with live AI-generated data.
    Supports item_type: attraction, restaurant, hotel, transport, activity.
    Checks the 24-hour cache first; falls back to Tavily + Gemini on a miss.
    Cancels the enrichment pipeline if the client disconnects mid-request.
    """
    enrichment = asyncio.create_task(
        get_enriched_data(body.name, body.destination, body.item_type)
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
