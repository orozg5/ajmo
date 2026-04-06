import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.constants import VALID_ITEM_TYPES
from app.schemas.itinerary import PlanItemCreate, PlanItemNotesUpdate, PlanItemResponse
from app.services.plans.items import create_item, delete_item, update_item_notes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["itinerary"])


@router.post("/{plan_id}/days/{day_id}/items", status_code=201)
async def create_item_route(plan_id: str, day_id: str, body: PlanItemCreate) -> PlanItemResponse:
    """Add an item to a day."""
    if body.item_type not in VALID_ITEM_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"item_type must be one of {sorted(VALID_ITEM_TYPES)}",
        )
    try:
        return await create_item(plan_id, day_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating item in day %s", day_id)
        raise HTTPException(status_code=500, detail="Failed to create item")


@router.patch("/{plan_id}/items/{item_id}")
async def update_item_notes_route(plan_id: str, item_id: str, body: PlanItemNotesUpdate) -> PlanItemResponse:
    """Update the notes field of an item."""
    try:
        return await update_item_notes(item_id, body.notes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error updating notes for item %s", item_id)
        raise HTTPException(status_code=500, detail="Failed to update notes")


@router.delete("/{plan_id}/items/{item_id}", status_code=204)
async def delete_item_route(plan_id: str, item_id: str) -> Response:
    """Delete an item by id."""
    try:
        await delete_item(item_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error deleting item %s", item_id)
        raise HTTPException(status_code=500, detail="Failed to delete item")
