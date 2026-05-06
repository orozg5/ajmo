import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.auth import get_current_user
from app.schemas.destinations import DestinationCreate, DestinationResponse, DestinationUpdate
from app.services.plans.destinations import (
    create_destination,
    delete_destination,
    get_destinations_for_plan,
    update_destination,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["destinations"])


@router.post("/{plan_id}/destinations", status_code=201)
async def create_destination_route(
    plan_id: str,
    body: DestinationCreate,
    current_user: str = Depends(get_current_user),
) -> DestinationResponse:
    """Add a destination to a plan."""
    try:
        return await create_destination(
            plan_id,
            body.country,
            body.city,
            body.sort_order,
            body.day_numbers,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating destination for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to create destination")


@router.get("/{plan_id}/destinations")
async def get_destinations_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[DestinationResponse]:
    """List all destinations for a plan."""
    try:
        return await get_destinations_for_plan(plan_id)
    except Exception:
        logger.exception("Unexpected error fetching destinations for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to fetch destinations")


@router.patch("/{plan_id}/destinations/{destination_id}")
async def update_destination_route(
    plan_id: str,
    destination_id: str,
    body: DestinationUpdate,
    current_user: str = Depends(get_current_user),
) -> DestinationResponse:
    """Update a destination's country/city/sort_order or replace its day assignments."""
    try:
        result = await update_destination(
            destination_id,
            body.country,
            body.city,
            body.sort_order,
            body.day_numbers,
        )
        if result is None:
            raise HTTPException(status_code=404, detail=f"Destination {destination_id!r} not found")
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error updating destination %s", destination_id)
        raise HTTPException(status_code=500, detail="Failed to update destination")


@router.delete("/{plan_id}/destinations/{destination_id}", status_code=204)
async def delete_destination_route(
    plan_id: str,
    destination_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    """Delete a destination from a plan."""
    try:
        await delete_destination(destination_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error deleting destination %s", destination_id)
        raise HTTPException(status_code=500, detail="Failed to delete destination")
