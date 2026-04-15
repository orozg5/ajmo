import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.schemas.users import UserPreferencesResponse, UserPreferencesUpdate
from app.services.users.preferences import get_preferences, upsert_preferences

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/preferences")
async def get_user_preferences_route(
    current_user: str = Depends(get_current_user),
) -> UserPreferencesResponse:
    try:
        prefs = await get_preferences(current_user)
        if prefs is None:
            raise HTTPException(status_code=404, detail="Preferences not set")
        return prefs
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error fetching preferences for user %s", current_user)
        raise HTTPException(status_code=500, detail="Failed to fetch preferences")


@router.put("/me/preferences")
async def put_user_preferences_route(
    body: UserPreferencesUpdate,
    current_user: str = Depends(get_current_user),
) -> UserPreferencesResponse:
    try:
        payload = body.model_dump(mode="json")
        return await upsert_preferences(current_user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error upserting preferences for user %s", current_user)
        raise HTTPException(status_code=500, detail="Failed to save preferences")
