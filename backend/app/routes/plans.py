import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.auth import get_current_user
from app.schemas.plans import PlanCreate, PlanResponse, PlanUpdate
from app.services.plans.crud import (
    create_plan,
    delete_plan,
    get_plan,
    list_user_plans,
    update_plan,
)
from app.services.plans.days import DateShrinkBlocked

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("", status_code=201)
async def create_plan_route(
    body: PlanCreate,
    current_user: str = Depends(get_current_user),
) -> PlanResponse:
    """Create a new travel plan."""
    try:
        data = body.model_dump(mode="json")
        data["owner_id"] = current_user  # always use the authenticated user, ignore any client value
        return await create_plan(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating plan")
        raise HTTPException(status_code=500, detail="Failed to create plan")


@router.get("/{plan_id}")
async def get_plan_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> PlanResponse:
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
    current_user: str = Depends(get_current_user),
    scope: Literal["owner", "member", "public"] = Query("owner"),
) -> list[PlanResponse]:
    """List plans for the authenticated user in the requested scope.

    scope=owner returns plans the user owns (default).
    scope=public returns plans with visibility='public' the user does not own (Discover).
    scope=member returns plans the user joined (empty until Phase 5 writes membership).
    """
    try:
        return await list_user_plans(current_user, scope=scope)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error listing plans for user %s scope=%s", current_user, scope)
        raise HTTPException(status_code=500, detail="Failed to list plans")


@router.patch("/{plan_id}")
async def update_plan_route(
    plan_id: str,
    body: PlanUpdate,
    current_user: str = Depends(get_current_user),
) -> PlanResponse:
    """Partially update a plan. Owner-only — non-owners receive 404. yjs_state is never touched here."""
    try:
        payload = body.model_dump(mode="json", exclude_unset=True)
        return await update_plan(plan_id, current_user, payload)
    except DateShrinkBlocked as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error updating plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to update plan")


@router.delete("/{plan_id}", status_code=204)
async def delete_plan_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    """Delete a plan by id. Owner-only — non-owners receive 404."""
    try:
        await delete_plan(plan_id, current_user)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error deleting plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to delete plan")
