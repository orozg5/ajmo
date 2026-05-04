"""Signed upload URL endpoints for Supabase Storage buckets."""
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.schemas.storage import (
    PlanCoverSignedRequest,
    SignedUploadResponse,
    UserAvatarSignedRequest,
)
from app.services.storage.signed import create_signed_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/storage", tags=["storage"])


@router.post("/plan-covers/signed")
async def create_plan_cover_signed_route(
    body: PlanCoverSignedRequest,
    current_user: str = Depends(get_current_user),
) -> SignedUploadResponse:
    """Mint a signed URL to upload a plan cover into the current user's folder.

    RLS on `storage.objects` constrains writes to the authenticated user's
    folder prefix, so the cover can be uploaded before a plan row exists
    (wizard flow). The signed URL inherits the service-role mint and is
    short-lived — a rogue caller still can't overwrite another user's file
    because the path is server-generated.
    """
    try:
        result = await create_signed_upload(
            bucket="plan-covers",
            owner_id=current_user,
            filename=body.filename,
        )
        return SignedUploadResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating plan cover signed URL")
        raise HTTPException(status_code=500, detail="Failed to create signed URL")


@router.post("/user-avatars/signed")
async def create_user_avatar_signed_route(
    body: UserAvatarSignedRequest,
    current_user: str = Depends(get_current_user),
) -> SignedUploadResponse:
    """Mint a signed URL to upload the current user's avatar."""
    try:
        result = await create_signed_upload(
            bucket="user-avatars",
            owner_id=current_user,
            filename=body.filename,
        )
        return SignedUploadResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating avatar signed URL")
        raise HTTPException(status_code=500, detail="Failed to create signed URL")
