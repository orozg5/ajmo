"""Pexels image lookup for places.

Single image source. Free, search-based — `query="{name} {destination}"` is
expected to return at least one visually relevant photo for any input. The
photo will not always be the actual venue (Pexels is stock, not place-keyed),
but for a travel UI a relevant image beats a missing thumbnail.

All failures return None silently. There is no retry and no secondary image
provider — `image_url=None` is an acceptable end state and the frontend is
expected to render a placeholder.
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
REQUEST_TIMEOUT_SECONDS = 5.0


async def fetch_pexels_image(name: str, destination: str) -> str | None:
    """Return the first matching Pexels photo URL for `name` in `destination`.

    Picks the `large` size (~940px wide), good middle-ground between page
    weight and visual quality. Returns None on miss, network error, or
    malformed payload.
    """
    if not name or not name.strip():
        return None

    query_parts = [name.strip()]
    if destination and destination.strip():
        query_parts.append(destination.strip())
    query = " ".join(query_parts)

    headers = {"Authorization": settings.PEXELS_API_KEY}
    params = {"query": query, "per_page": 1, "orientation": "landscape"}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(PEXELS_SEARCH_URL, headers=headers, params=params)
    except httpx.HTTPError as exc:
        logger.warning("Pexels search failed for %r: %s", query, exc)
        return None

    if response.status_code >= 400:
        logger.warning("Pexels HTTP %s for %r", response.status_code, query)
        return None

    try:
        payload = response.json()
    except ValueError:
        logger.warning("Pexels payload not JSON for %r", query)
        return None

    photos = payload.get("photos") or []
    if not photos:
        return None

    src = photos[0].get("src") or {}
    url = src.get("large") or src.get("medium") or src.get("original")
    if isinstance(url, str) and url:
        return url
    return None
