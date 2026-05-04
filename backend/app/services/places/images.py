"""Wikipedia thumbnail fetch for places (key-free, no hard rate limit).

Used to override LLM-generated `image_url` which is often hallucinated or
broken. Silently falls through on any failure — image is a nice-to-have.
"""
from __future__ import annotations

import logging
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


WIKIPEDIA_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
REQUEST_TIMEOUT_SECONDS = 5.0


async def fetch_wikipedia_image(name: str, destination: str) -> str | None:
    """Return a Wikipedia thumbnail URL for `name`, or None on miss.

    `destination` is used only for logging — Wikipedia's summary endpoint is
    title-keyed and canonical_name usually disambiguates without context.
    """
    if not name or not name.strip():
        return None

    title = quote(name.strip().replace(" ", "_"), safe="")
    url = WIKIPEDIA_SUMMARY_URL.format(title=title)

    try:
        async with httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"User-Agent": settings.GEOCODER_USER_AGENT},
        ) as wiki_client:
            response = await wiki_client.get(url, follow_redirects=True)
    except httpx.HTTPError as exc:
        logger.warning("Wikipedia image fetch failed for %r (%s): %s", name, destination, exc)
        return None

    if response.status_code == 404:
        return None
    if response.status_code >= 400:
        logger.warning(
            "Wikipedia image HTTP %s for %r (%s)", response.status_code, name, destination,
        )
        return None

    try:
        payload = response.json()
    except ValueError as exc:
        logger.warning("Wikipedia image payload not JSON for %r: %s", name, exc)
        return None

    thumbnail = payload.get("thumbnail") or {}
    source = thumbnail.get("source")
    if isinstance(source, str) and source:
        return source
    return None
