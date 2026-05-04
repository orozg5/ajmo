import logging

from fastapi import APIRouter, HTTPException, Query

from app.constants import VALID_ITEM_TYPES
from app.schemas.places import PlaceSuggestionResponse
from app.services.places.repository import autocomplete_places

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/autocomplete")
async def autocomplete_places_route(
    q: str = Query(..., max_length=200),
    destination: str = Query(..., max_length=120),
    item_type: str = Query(...),
) -> list[PlaceSuggestionResponse]:
    """
    Return up to 10 place suggestions whose name prefix-matches q.
    Scoped to destination and item_type.

    Query params:
      q           — partial name typed by the user (e.g. "Eiffel")
      destination — plan destination (e.g. "Paris")
      item_type   — one of: attraction, restaurant, hotel, transport, activity
    """
    if item_type not in VALID_ITEM_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"item_type must be one of: {', '.join(sorted(VALID_ITEM_TYPES))}",
        )
    if not q.strip():
        return []
    try:
        return await autocomplete_places(q.strip(), destination, item_type)
    except Exception:
        logger.exception("Unexpected error in autocomplete for q=%s", q)
        raise HTTPException(status_code=500, detail="Autocomplete failed")
