"""Supabase Storage signed-upload URL helpers.

Service role generates a short-lived signed URL that the browser uses to
upload directly to Supabase Storage. The browser never sees the service-role
key. After a successful upload the public URL is the canonical read address.
"""

import logging
import uuid
from typing import Literal

from app.config import settings
from app.db import get_supabase_client

logger = logging.getLogger(__name__)

Bucket = Literal["plan-covers", "user-avatars"]

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}


def normalise_extension(filename: str | None) -> str:
    if not filename:
        return "jpg"
    parts = filename.rsplit(".", 1)
    if len(parts) != 2:
        return "jpg"
    ext = parts[1].lower()
    return ext if ext in ALLOWED_EXTENSIONS else "jpg"


def build_path(bucket: Bucket, owner_id: str, extension: str) -> str:
    """Path scheme:
    - plan-covers: {owner_id}/{uuid}.{ext}
    - user-avatars: {owner_id}/{uuid}.{ext}

    First folder = auth.uid() so storage.objects RLS can validate writes.
    Covers can be uploaded before a plan row exists (wizard flow), so the
    path intentionally does not include a plan id.
    """
    filename = f"{uuid.uuid4().hex}.{extension}"
    return f"{owner_id}/{filename}"


def public_url(bucket: Bucket, path: str) -> str:
    base = settings.SUPABASE_URL.rstrip("/")
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


async def create_signed_upload(
    bucket: Bucket,
    owner_id: str,
    filename: str | None,
) -> dict:
    """Generate a signed upload URL for the browser."""
    supabase = get_supabase_client()
    extension = normalise_extension(filename)
    path = build_path(bucket, owner_id, extension)

    try:
        response = supabase.storage.from_(bucket).create_signed_upload_url(path)
    except Exception as exc:
        logger.exception("Failed to create signed upload URL for %s/%s", bucket, path)
        raise ValueError(f"Storage unavailable: {exc}") from exc

    signed_url = response.get("signed_url") or response.get("signedUrl")
    token = response.get("token")
    if not signed_url:
        raise ValueError("Supabase did not return a signed URL")

    return {
        "bucket": bucket,
        "path": path,
        "signed_url": signed_url,
        "token": token,
        "public_url": public_url(bucket, path),
    }
