import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.schemas.responses import PlanResponse
from app.services.plans import (
    create_plan,
    delete_plan,
    get_plan,
    list_user_plans,
    update_plan,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["plans"])


class PlanCreate(BaseModel):
    owner_id: str = Field(..., description="UUID of the plan owner")
    title: str = Field(..., min_length=1, description="Plan title")
    description: Optional[str] = None
    destination: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    is_public: bool = False
    cover_image_url: Optional[str] = None


class PlanUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    destination: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    is_public: Optional[bool] = None
    cover_image_url: Optional[str] = None


@router.post("", status_code=201)
async def create_plan_route(body: PlanCreate) -> PlanResponse:
    """Create a new travel plan."""
    try:
        return await create_plan(body.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating plan")
        raise HTTPException(status_code=500, detail="Failed to create plan")


@router.get("/{plan_id}")
async def get_plan_route(plan_id: str) -> PlanResponse:
    """Fetch a single plan by id."""
    try:
        return await get_plan(plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error fetching plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to fetch plan")


@router.get("")
async def list_plans_route(
    owner_id: str = Query(..., description="UUID of the plan owner"),
) -> list[PlanResponse]:
    """List all plans belonging to a user."""
    try:
        return await list_user_plans(owner_id)
    except Exception:
        logger.exception("Unexpected error listing plans for owner %s", owner_id)
        raise HTTPException(status_code=500, detail="Failed to list plans")


@router.patch("/{plan_id}")
async def update_plan_route(plan_id: str, body: PlanUpdate) -> PlanResponse:
    """Partially update a plan. yjs_state is never touched here."""
    try:
        return await update_plan(plan_id, body.model_dump(mode="json", exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error updating plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to update plan")


@router.delete("/{plan_id}", status_code=204)
async def delete_plan_route(plan_id: str) -> Response:
    """Delete a plan by id."""
    try:
        await delete_plan(plan_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error deleting plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to delete plan")
