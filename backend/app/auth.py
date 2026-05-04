"""FastAPI authentication dependency using Supabase JWT verification."""
from __future__ import annotations

import logging

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer()

# Fetches Supabase's public signing keys and caches them in memory.
# Supports ES256 (current default for hosted Supabase) and RS256/HS256 for
# older or self-hosted setups. Keys are fetched once on first use.
jwks_client = PyJWKClient(
    f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
    cache_keys=True,
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """Validate Supabase JWT and return the authenticated user UUID (sub claim).

    Raises HTTPException 401 on any validation failure.
    HTTPBearer automatically raises 403 if the Authorization header is missing or malformed.
    """
    token = credentials.credentials
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256", "HS256"],
            audience="authenticated",
            # Tolerate small clock drift between the Supabase auth server and the
            # local dev machine, which otherwise rejects freshly-issued tokens
            # with ImmatureSignatureError (iat a second or two in the future).
            leeway=10,
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        logger.warning("JWT validation failed (%s): %s", type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail="Invalid token")
