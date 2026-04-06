import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from tavily import AsyncTavilyClient

from app.config import settings
from app.db import get_supabase_client
from app.services.ai.llm import call_llm_with_fallback, parse_llm_json
from app.services.places.repository import (
    get_place_by_slug,
    resolve_slug_alias,
    store_slug_alias,
    upsert_place,
)

logger = logging.getLogger(__name__)


# ── Per-type configuration ────────────────────────────────────────────────────

# Fields that must be JSON arrays of strings in the LLM response
_LIST_FIELDS = {"tips", "amenities"}

_SEARCH_QUERY_TEMPLATES = {
    "attraction": "{name} {destination} attraction hours price",
    "restaurant": "{name} {destination} restaurant cuisine price hours reservation",
    "hotel":      "{name} {destination} hotel amenities check-in booking",
    "transport":  "{name} {destination} transport schedule price booking",
    "activity":   "{name} {destination} activity price booking tips",
}

# Stable fields returned by Gemini → stored permanently in the places table
_STABLE_FIELDS = ["canonical_name", "description", "location", "image_url"]

# Fresh (volatile) fields returned by Gemini → stored in ai_attraction_cache (24h TTL)
# description intentionally excluded here — it lives in places (stable)
_FRESH_FIELDS = {
    "attraction": ["opening_hours", "price_range", "tips"],
    "restaurant": ["cuisine", "price_range", "opening_hours", "reservation_tips"],
    "hotel":      ["amenities", "check_in_time", "price_range", "booking_tips"],
    "transport":  ["schedule", "price_range", "booking_tips"],
    "activity":   ["duration", "price_range", "booking_tips", "tips"],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

_LEADING_ARTICLE_RE = re.compile(r"^(the|a|an)\s+", re.IGNORECASE)


def build_cache_key(name: str, destination: str, item_type: str) -> str:
    """
    Generate a deterministic slug used as the primary key in ai_attraction_cache.
    ("Eiffel Tower", "Paris", "attraction") → "eiffel-tower-paris-attraction"
    ("The Eiffel Tower", "Paris", "attraction") → "eiffel-tower-paris-attraction"
    Leading articles (the, a, an) are stripped before slugifying so variants map to the same key.
    """
    normalized_name = _LEADING_ARTICLE_RE.sub("", name).strip()
    raw = f"{normalized_name} {destination}".lower()
    slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return f"{slug}-{item_type}"


# ── Cache layer ───────────────────────────────────────────────────────────────


async def get_cached_attraction(cache_key: str) -> Optional[dict]:
    """
    Return cached data for cache_key if found and not yet expired.
    Uses server-side gt("expires_at") filter so expired rows are skipped cleanly.
    """
    supabase_client = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    result = (
        supabase_client.table("ai_attraction_cache")
        .select("data")
        .eq("cache_key", cache_key)
        .gt("expires_at", now_iso)
        .execute()
    )

    if result.data:
        return result.data[0]["data"]
    return None


async def store_attraction_cache(cache_key: str, data: dict) -> None:
    """Upsert enriched data into ai_attraction_cache with a 24-hour TTL."""
    supabase_client = get_supabase_client()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=24)

    supabase_client.table("ai_attraction_cache").upsert(
        {
            "cache_key": cache_key,
            "data": data,
            "fetched_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }
    ).execute()


# ── Tavily search ─────────────────────────────────────────────────────────────


async def search_item(name: str, destination: str, item_type: str) -> str:
    """
    Search Tavily for live web data about the item.
    Returns a single string of concatenated result snippets for the LLM.
    Raises RuntimeError if no results are returned (guards against empty LLM prompt).
    """
    client = AsyncTavilyClient(api_key=settings.TAVILY_API_KEY)
    query = _SEARCH_QUERY_TEMPLATES[item_type].format(name=name, destination=destination)

    response = await client.search(
        query=query,
        search_depth="basic",
        max_results=5,
        include_answer=True,
    )

    results = response.get("results", [])
    if not results:
        raise RuntimeError(f"Tavily returned no results for: {query!r}")

    # Build context: prepend Tavily's own synthesized answer first, then raw snippets
    context_parts: list[str] = []
    if response.get("answer"):
        context_parts.append(response["answer"])
    for r in results:
        if r.get("content"):
            context_parts.append(r["content"])

    return "\n\n".join(context_parts)


# ── LLM enrichment ────────────────────────────────────────────────────────────


def _build_prompt(name: str, destination: str, item_type: str, search_context: str) -> str:
    """Build a type-aware extraction prompt for the LLM."""
    all_fields = _STABLE_FIELDS + _FRESH_FIELDS[item_type]
    schema = {
        f: ["<item 1>", "<item 2>"] if f in _LIST_FIELDS else "<value or null>"
        for f in all_fields
    }
    fields_json = json.dumps(schema, indent=2)
    return f"""You are a travel information assistant.
Based on the search results below, extract structured information about this {item_type}.

Name: {name}
Destination: {destination}

Search results:
{search_context}

Respond with ONLY a valid JSON object (no markdown, no explanation) with exactly these keys:
{fields_json}

Rules:
- canonical_name: the official full name of this place (e.g. "Hilton Paris Opera" not "Hilton"). Use the most complete, commonly recognised name.
- location: the address or area (e.g. "Champ de Mars, Paris" or "5 Avenue Anatole France, 75007 Paris").
- image_url: a direct URL to a representative image if found in the search results; null otherwise.
- Use null for any field you cannot determine.
- List fields (shown as arrays above) must be JSON arrays of strings, never a single string."""


async def enrich_with_llm(name: str, destination: str, item_type: str, search_context: str) -> dict:
    """
    Pass Tavily context to the primary LLM (Gemini) and extract structured data.
    Falls back to Groq automatically if Gemini hits a quota/rate limit.
    """
    prompt = _build_prompt(name, destination, item_type, search_context)
    raw_text = await call_llm_with_fallback(prompt, temperature=0)
    parsed = parse_llm_json(raw_text)

    # Ensure all expected keys exist (fill missing optional ones with None)
    for key in _STABLE_FIELDS + _FRESH_FIELDS[item_type]:
        parsed.setdefault(key, None)

    # Coerce all fields to their expected types based on schema
    for key in list(parsed.keys()):
        value = parsed[key]
        if value is None:
            continue
        if key in _LIST_FIELDS:
            # Expected: list[str]
            if isinstance(value, list):
                parsed[key] = [str(v) for v in value if v is not None]
            else:
                parsed[key] = [str(value)]
        else:
            # Expected: str
            if isinstance(value, list):
                parsed[key] = ", ".join(str(v) for v in value if v is not None) or None
            elif not isinstance(value, str):
                parsed[key] = str(value)

    return parsed


# ── Orchestrator ──────────────────────────────────────────────────────────────


async def get_place_data(name: str, destination: str, item_type: str) -> dict:
    """
    Unified lookup: slug_aliases → ai_attraction_cache → places → LLM fallback.
    Used by both enrichment and suggestions. Returns full merged place data.

    1. Build a raw slug from user input
    2. Resolve raw slug → canonical slug via slug_aliases (skips Gemini on repeat inputs)
    3. Return cached data if available and not expired (TTL 24 h)
    4. Search Tavily for live web context
    5. Extract structured JSON via Gemini LLM (includes canonical_name)
    6. Build canonical slug from canonical_name
    7. Split response: stable fields → upsert places, fresh fields → ai_attraction_cache
    8. Store slug alias (raw → canonical) for future pre-check resolution
    9. Return the full structured data
    """
    # Step 1: raw slug from user input
    raw_slug = build_cache_key(name, destination, item_type)

    # Step 2: alias resolution — resolve raw slug to canonical slug if known
    canonical_slug = await resolve_slug_alias(raw_slug)
    lookup_slug = canonical_slug if canonical_slug else raw_slug

    # Step 3: cache check using resolved slug
    cached = await get_cached_attraction(lookup_slug)
    if cached is not None:
        logger.info("Cache hit: %s (lookup_slug=%s)", raw_slug, lookup_slug)
        if canonical_slug is None:
            # raw_slug was already canonical — store self-alias so future lookups skip this miss
            await store_slug_alias(raw_slug, raw_slug)
        stable = await get_place_by_slug(lookup_slug, item_type)
        if stable:
            return {**stable, **cached}
        return cached

    logger.info("Cache miss: %s — fetching live data", raw_slug)

    # Step 4: Tavily web search
    search_context = await search_item(name, destination, item_type)

    # Step 5: LLM enrichment (response now includes canonical_name, location, image_url)
    data = await enrich_with_llm(name, destination, item_type, search_context)

    # Step 6: build canonical slug from the name Gemini confirmed
    canonical_name = data.get("canonical_name") or name
    canonical_slug = build_cache_key(canonical_name, destination, item_type)

    # Step 6b: canonical slug may already be cached (different raw input, same place)
    existing_cache = await get_cached_attraction(canonical_slug)
    if existing_cache is not None:
        await store_slug_alias(raw_slug, canonical_slug)
        stable = await get_place_by_slug(canonical_slug, item_type)
        if stable:
            return {**stable, **existing_cache}
        return existing_cache

    # Step 7a: upsert stable fields into the permanent places table
    stable_payload = {
        "slug": canonical_slug,
        "item_type": item_type,
        "name": canonical_name,
        "destination": destination,
        "description": data.get("description"),
        "location": data.get("location"),
        "image_url": data.get("image_url"),
    }
    await upsert_place(stable_payload)

    # Step 7b: store fresh fields in ai_attraction_cache (24h TTL)
    fresh_data = {k: data[k] for k in _FRESH_FIELDS[item_type] if k in data}
    try:
        await store_attraction_cache(canonical_slug, fresh_data)
    except Exception as exc:
        logger.warning("Cache write failed for key %s: %s", canonical_slug, exc)

    # Step 8: record alias so next request with the same raw input skips Gemini
    await store_slug_alias(raw_slug, canonical_slug)

    # Step 9: return full data (stable + fresh merged) to the client
    return data
