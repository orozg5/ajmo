import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.auth import get_current_user
from app.schemas.itinerary import (
    PlanHotelCreate,
    PlanHotelResponse,
    PlanHotelUpdate,
)
from app.services.plans.hotels import (
    create_hotel,
    delete_hotel,
    list_hotels,
    update_hotel,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["hotels"])


@router.get("/{plan_id}/hotels")
async def list_hotels_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[PlanHotelResponse]:
    """Return all hotels for a plan."""
    try:
        return await list_hotels(plan_id)
    except Exception:
        logger.exception("Unexpected error listing hotels for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to list hotels")


@router.post("/{plan_id}/hotels", status_code=201)
async def create_hotel_route(
    plan_id: str,
    body: PlanHotelCreate,
    current_user: str = Depends(get_current_user),
) -> PlanHotelResponse:
    """Book a hotel spanning one or more days."""
    try:
        if body.check_out_day_number < body.check_in_day_number:
            raise ValueError("check_out_day_number must be >= check_in_day_number")
        return await create_hotel(plan_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating hotel in plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to create hotel")


@router.patch("/{plan_id}/hotels/{hotel_id}")
async def update_hotel_route(
    plan_id: str,
    hotel_id: str,
    body: PlanHotelUpdate,
    current_user: str = Depends(get_current_user),
) -> PlanHotelResponse:
    """Update any subset of a hotel's fields."""
    try:
        patch = body.model_dump(exclude_unset=True)
        updated = await update_hotel(hotel_id, patch)
        if updated is None:
            raise HTTPException(status_code=404, detail=f"Hotel {hotel_id!r} not found")
        return updated
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error updating hotel %s", hotel_id)
        raise HTTPException(status_code=500, detail="Failed to update hotel")


@router.delete("/{plan_id}/hotels/{hotel_id}", status_code=204)
async def delete_hotel_route(
    plan_id: str,
    hotel_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    """Delete a hotel by id."""
    try:
        await delete_hotel(hotel_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error deleting hotel %s", hotel_id)
        raise HTTPException(status_code=500, detail="Failed to delete hotel")
