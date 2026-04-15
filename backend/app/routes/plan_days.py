import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.auth import get_current_user
from app.schemas.itinerary import PlanDayCreate, PlanDayWithItemsResponse
from app.services.plans.crud import get_plan
from app.services.plans.days import (
    create_day,
    delete_day,
    initialize_days,
    list_days_with_items,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["days"])


@router.post("/{plan_id}/days/initialize")
async def initialize_days_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[PlanDayWithItemsResponse]:
    """Idempotent setup: create days from the plan's date range if none exist.
    Safe to call on every page load."""
    try:
        plan = await get_plan(plan_id)
        await initialize_days(plan_id, plan.get("date_from"), plan.get("date_to"))
        # initialize_days returns days without items; fetch full view
        return await list_days_with_items(plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error initializing days for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to initialize days")


@router.get("/{plan_id}/days")
async def list_days_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[PlanDayWithItemsResponse]:
    """Return all days for a plan with their items."""
    try:
        return await list_days_with_items(plan_id)
    except Exception:
        logger.exception("Unexpected error listing days for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to list days")


@router.post("/{plan_id}/days", status_code=201)
async def create_day_route(
    plan_id: str,
    body: PlanDayCreate,
    current_user: str = Depends(get_current_user),
) -> PlanDayWithItemsResponse:
    """Add a new day to the plan. day_number auto-assigned if not provided."""
    try:
        day_number = body.day_number
        if day_number is None:
            # Assign max + 1
            existing = await list_days_with_items(plan_id)
            day_number = (max((d["day_number"] for d in existing), default=0)) + 1
        return await create_day(plan_id, day_number, body.date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating day for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to create day")


@router.delete("/{plan_id}/days/{day_id}", status_code=204)
async def delete_day_route(
    plan_id: str,
    day_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    """Delete a day and all its items (cascade)."""
    try:
        await delete_day(day_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error deleting day %s", day_id)
        raise HTTPException(status_code=500, detail="Failed to delete day")
