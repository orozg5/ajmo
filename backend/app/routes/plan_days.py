import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.auth import get_current_user
from app.schemas.itinerary import PlanDayCreate, PlanDayUpdate, PlanDayWithItemsResponse
from app.services.plans.crud import get_plan
from app.services.plans.days import (
    create_day,
    delete_day,
    initialize_days,
    list_days_with_items,
    update_day,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["days"])


@router.post("/{plan_id}/days/initialize")
async def initialize_days_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[PlanDayWithItemsResponse]:
    """Idempotent — safe to call on every page load."""
    try:
        plan = await get_plan(plan_id)
        await initialize_days(plan_id, plan.get("date_from"), plan.get("date_to"))
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
    try:
        day_number = body.day_number
        if day_number is None:
            existing = await list_days_with_items(plan_id)
            day_number = (max((d["day_number"] for d in existing), default=0)) + 1
        return await create_day(plan_id, day_number, body.date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating day for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to create day")


@router.patch("/{plan_id}/days/{day_id}")
async def update_day_route(
    plan_id: str,
    day_id: str,
    body: PlanDayUpdate,
    current_user: str = Depends(get_current_user),
) -> dict:
    try:
        patch = body.model_dump(exclude_unset=True)
        updated = await update_day(day_id, patch)
        if updated is None:
            raise HTTPException(status_code=404, detail=f"Day {day_id!r} not found")
        return updated
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error updating day %s", day_id)
        raise HTTPException(status_code=500, detail="Failed to update day")


@router.delete("/{plan_id}/days/{day_id}", status_code=204)
async def delete_day_route(
    plan_id: str,
    day_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    """Cascade-deletes items."""
    try:
        await delete_day(day_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error deleting day %s", day_id)
        raise HTTPException(status_code=500, detail="Failed to delete day")
