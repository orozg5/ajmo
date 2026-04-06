import logging

from fastapi import APIRouter, HTTPException, Query

from app.schemas.users import UserPreferencesResponse, UserPreferencesUpdate
from app.services.users.preferences import get_preferences, upsert_preferences

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/preferences")
async def get_user_preferences(
    user_id: str = Query(..., description="UUID of the user"),
) -> UserPreferencesResponse:
    try:
        prefs = await get_preferences(user_id)
        if prefs is None:
            raise HTTPException(status_code=404, detail="Preferences not set")
        return prefs
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error fetching preferences for user %s", user_id)
        raise HTTPException(status_code=500, detail="Failed to fetch preferences")


@router.put("/me/preferences")
async def put_user_preferences(body: UserPreferencesUpdate) -> UserPreferencesResponse:
    try:
        payload = body.model_dump(mode="json", exclude={"user_id"})
        return await upsert_preferences(body.user_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error upserting preferences for user %s", body.user_id)
        raise HTTPException(status_code=500, detail="Failed to save preferences")
