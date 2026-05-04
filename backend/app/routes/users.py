import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.schemas.users import (
    ProfileResponse,
    ProfileUpdate,
    UserPreferencesResponse,
    UserPreferencesUpdate,
)
from app.services.users.preferences import get_preferences, upsert_preferences
from app.services.users.profile import get_profile, update_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_me_route(
    current_user: str = Depends(get_current_user),
) -> ProfileResponse:
    try:
        profile = await get_profile(current_user)
        if profile is None:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error fetching profile for user %s", current_user)
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


@router.patch("/me")
async def patch_me_route(
    body: ProfileUpdate,
    current_user: str = Depends(get_current_user),
) -> ProfileResponse:
    try:
        payload = body.model_dump(mode="json", exclude_none=True)
        return await update_profile(current_user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error updating profile for user %s", current_user)
        raise HTTPException(status_code=500, detail="Failed to update profile")


@router.get("/me/preferences")
async def get_user_preferences_route(
    current_user: str = Depends(get_current_user),
) -> UserPreferencesResponse:
    try:
        prefs = await get_preferences(current_user)
        if prefs is None:
            # First-login users have no row yet; return an empty response rather than
            # 404 so the settings form shows a clean slate instead of an error toast.
            return UserPreferencesResponse(user_id=current_user)
        return prefs
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
