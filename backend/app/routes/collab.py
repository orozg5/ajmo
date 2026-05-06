"""Internal endpoints called by the Hocuspocus collab service.

These three routes are *not* exposed to user JWTs — they're guarded by a
shared secret header. The collab service is the only intended caller.
"""
from __future__ import annotations

import logging
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.services.collab import materializer
from app.services.collab.authorize import resolve_role
from app.services.collab.seed import build_seed_update_b64

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/collab", tags=["internal"])


def verify_secret(x_collab_secret: str | None = Header(default=None)) -> None:
    """Reject inbound calls without the matching shared secret header.

    secrets.compare_digest avoids a timing-side-channel leak on the secret.
    """
    if x_collab_secret is None or not secrets.compare_digest(
        x_collab_secret, settings.COLLAB_SHARED_SECRET
    ):
        raise HTTPException(status_code=403, detail="Forbidden")


class AuthorizeRequest(BaseModel):
    token: str
    plan_id: str


class AuthorizeResponse(BaseModel):
    ok: bool
    role: Literal["viewer", "editor", "owner"]
    userId: str
    planId: str


class ChangedRequest(BaseModel):
    plan_id: str
    user_id: str | None = None


class ChangedResponse(BaseModel):
    ok: bool


class SeedResponse(BaseModel):
    update_b64: str


@router.post("/authorize")
async def authorize_route(
    body: AuthorizeRequest,
    _secret: None = Depends(verify_secret),
) -> AuthorizeResponse:
    try:
        user_id, role = await resolve_role(body.token, body.plan_id)
    except PermissionError as exc:
        logger.info("collab/authorize denied: %s", exc)
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception:
        logger.exception("collab/authorize crashed for plan %s", body.plan_id)
        raise HTTPException(status_code=500, detail="Authorize failed")
    return AuthorizeResponse(ok=True, role=role, userId=user_id, planId=body.plan_id)


@router.post("/changed")
async def changed_route(
    body: ChangedRequest,
    _secret: None = Depends(verify_secret),
) -> ChangedResponse:
    materializer.schedule(body.plan_id)
    return ChangedResponse(ok=True)


@router.get("/seed")
async def seed_route(
    plan_id: str = Query(...),
    _secret: None = Depends(verify_secret),
) -> SeedResponse:
    try:
        update_b64 = await build_seed_update_b64(plan_id)
    except Exception:
        logger.exception("collab/seed crashed for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Seed build failed")
    return SeedResponse(update_b64=update_b64)
