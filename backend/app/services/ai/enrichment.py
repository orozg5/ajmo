import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

from tavily import AsyncTavilyClient
from tavily.errors import BadRequestError

from app.config import settings
from app.db import get_supabase_client
from app.services.ai.llm import call_structured, stream_structured
from app.services.ai.schemas import EnrichmentResponse
from app.services.places.country_codes import resolve_country_code
from app.services.places.geocoding import geocode_with_validation, resolve_timezone
from app.services.places.images import fetch_wikipedia_image
from app.services.places.repository import (
    get_place_by_slug,
    resolve_slug_alias,
    store_slug_alias,
    upsert_place,
)

logger = logging.getLogger(__name__)


# ── Per-type configuration ────────────────────────────────────────────────────

SEARCH_QUERY_TEMPLATES = {
    "attraction": "{name} {destination} attraction hours price",
    "restaurant": "{name} {destination} restaurant cuisine price hours reservation",
    "hotel":      "{name} {destination} hotel amenities check-in booking",
    "transport":  "{name} {destination} transport schedule price booking",
    "activity":   "{name} {destination} activity price booking tips",
}

STABLE_FIELDS = ["canonical_name", "description", "location", "image_url"]

FRESH_FIELDS = {
    "attraction": ["opening_hours", "price_range", "tips"],
    "restaurant": ["cuisine", "price_range", "opening_hours", "reservation_tips"],
    "hotel":      ["amenities", "check_in_time", "price_range", "booking_tips"],
    "transport":  ["schedule", "price_range", "booking_tips"],
    "activity":   ["duration", "price_range", "booking_tips", "tips"],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

LEADING_ARTICLE_RE = re.compile(r"^(the|a|an)\s+", re.IGNORECASE)


def build_cache_key(name: str, destination: str, item_type: str) -> str:
    """Generate a deterministic slug keyed on name + destination + type.

    Leading articles (the, a, an) are stripped before slugifying so variants
    like "Eiffel Tower" and "The Eiffel Tower" collapse to one key.
    """
    normalized_name = LEADING_ARTICLE_RE.sub("", name).strip()
    raw = f"{normalized_name} {destination}".lower()
    slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return f"{slug}-{item_type}"


# ── Cache layer ───────────────────────────────────────────────────────────────


async def get_cached_attraction(cache_key: str) -> dict | None:
    supabase = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    result = (
        supabase.table("ai_attraction_cache")
        .select("data")
        .eq("cache_key", cache_key)
        .gt("expires_at", now_iso)
        .execute()
    )

    if result.data:
        return result.data[0]["data"]
    return None


async def store_attraction_cache(cache_key: str, data: dict) -> None:
    supabase = get_supabase_client()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=24)

    supabase.table("ai_attraction_cache").upsert(
        {
            "cache_key": cache_key,
            "data": data,
            "fetched_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }
    ).execute()


# ── Tavily search ─────────────────────────────────────────────────────────────


async def search_item(name: str, destination: str, item_type: str, *, deep: bool = False) -> str:
    """Fetch Tavily context; advanced depth for hotels or a deep retry."""
    client = AsyncTavilyClient(api_key=settings.TAVILY_API_KEY)
    query = SEARCH_QUERY_TEMPLATES[item_type].format(name=name, destination=destination)

    search_depth = "advanced" if (item_type == "hotel" or deep) else "basic"
    max_results = 8 if item_type == "hotel" else 5

    try:
        response = await client.search(
            query=query,
            search_depth=search_depth,
            max_results=max_results,
            include_answer=True,
        )
    except BadRequestError as exc:
        raise RuntimeError(f"Tavily rejected query: {exc}") from exc

    results = response.get("results", [])
    if not results:
        raise RuntimeError(f"Tavily returned no results for: {query!r}")

    context_parts: list[str] = []
    if response.get("answer"):
        context_parts.append(response["answer"])
    for r in results:
        if r.get("content"):
            context_parts.append(r["content"])

    return "\n\n".join(context_parts)


# ── LLM enrichment ────────────────────────────────────────────────────────────


def build_prompt(name: str, destination: str, item_type: str, search_context: str) -> str:
    """Type-aware extraction prompt. Structured output handles JSON shape."""
    fresh = ", ".join(FRESH_FIELDS[item_type])
    return f"""You are a travel information assistant extracting facts about a {item_type}.

Name: {name}
Destination: {destination}

Search results:
{search_context}

Extract: canonical_name, description, location (specific street address with number OR named area — never just the city), image_url, and these type-specific fields when known: {fresh}.
Set any field to null when the search results do not support a confident answer. Never invent facts."""


async def enrich_with_llm(name: str, destination: str, item_type: str, search_context: str) -> dict:
    """Structured enrichment via call_structured. Returns a plain dict."""
    prompt = build_prompt(name, destination, item_type, search_context)
    response: EnrichmentResponse = await call_structured(
        "enrich", EnrichmentResponse, prompt, temperature=0.0, max_tokens=1024,
    )
    return response.model_dump(mode="json", exclude_none=False)


# ── Orchestrator ──────────────────────────────────────────────────────────────


async def get_place_data(name: str, destination: str, item_type: str) -> dict:
    """Unified lookup: slug_aliases → ai_attraction_cache → places → LLM fallback.

    Returns full merged place data (stable + fresh).
    """
    raw_slug = build_cache_key(name, destination, item_type)

    canonical_slug = await resolve_slug_alias(raw_slug)
    lookup_slug = canonical_slug if canonical_slug else raw_slug

    cached = await get_cached_attraction(lookup_slug)
    if cached is not None:
        logger.info("Cache hit: %s (lookup_slug=%s)", raw_slug, lookup_slug)
        if canonical_slug is None:
            await store_slug_alias(raw_slug, raw_slug)
        stable = await get_place_by_slug(lookup_slug, item_type)
        if stable:
            return {**stable, **cached, "place_id": stable.get("id")}
        return cached

    logger.info("Cache miss: %s — fetching live data", raw_slug)

    search_context = await search_item(name, destination, item_type)
    data = await enrich_with_llm(name, destination, item_type, search_context)

    canonical_name = data.get("canonical_name") or name
    canonical_slug = build_cache_key(canonical_name, destination, item_type)

    existing_cache = await get_cached_attraction(canonical_slug)
    if existing_cache is not None:
        await store_slug_alias(raw_slug, canonical_slug)
        stable = await get_place_by_slug(canonical_slug, item_type)
        if stable:
            return {**stable, **existing_cache, "place_id": stable.get("id")}
        return existing_cache

    country_code = resolve_country_code(destination)
    destination_tokens = [t.strip().lower() for t in destination.split(",") if t.strip()]
    location_query = data.get("location") or canonical_name
    geo, wiki_image = await asyncio.gather(
        geocode_with_validation(
            f"{location_query}, {destination}",
            country_code=country_code,
            destination_tokens=destination_tokens,
        ),
        fetch_wikipedia_image(canonical_name, destination),
    )
    data["lat"] = geo.lat if geo else None
    data["lng"] = geo.lng if geo else None
    data["timezone"] = resolve_timezone(geo.lat, geo.lng) if geo else None
    if wiki_image:
        data["image_url"] = wiki_image

    stable_payload = {
        "slug": canonical_slug,
        "item_type": item_type,
        "name": canonical_name,
        "destination": destination,
        "description": data.get("description"),
        "location": data.get("location"),
        "image_url": data.get("image_url"),
        "lat": data["lat"],
        "lng": data["lng"],
        "timezone": data["timezone"],
        "categories": data.get("categories"),
    }
    upserted = await upsert_place(stable_payload)
    if upserted:
        data["place_id"] = upserted.get("id")

    fresh_data = {k: data[k] for k in FRESH_FIELDS[item_type] if k in data}
    try:
        await store_attraction_cache(canonical_slug, fresh_data)
    except Exception as exc:
        logger.warning("Cache write failed for key %s: %s", canonical_slug, exc)

    await store_slug_alias(raw_slug, canonical_slug)

    return data


async def stream_place_data(name: str, destination: str, item_type: str):
    """Yield enrichment field updates as the LLM streams.

    Cache hit: emits all merged (stable + fresh) fields immediately.
    Cache miss: runs Tavily, streams the LLM, emits each field when it first
    appears or changes in the accumulating partial. Persists at stream end.
    """
    raw_slug = build_cache_key(name, destination, item_type)
    canonical_slug = await resolve_slug_alias(raw_slug)
    lookup_slug = canonical_slug if canonical_slug else raw_slug

    cached = await get_cached_attraction(lookup_slug)
    if cached is not None:
        logger.info("Stream cache hit: %s (lookup_slug=%s)", raw_slug, lookup_slug)
        if canonical_slug is None:
            await store_slug_alias(raw_slug, raw_slug)
        stable = await get_place_by_slug(lookup_slug, item_type)
        if stable:
            place_id = stable.pop("id", None)
            if place_id is not None:
                yield {"field": "place_id", "value": place_id}
        merged = {**(stable or {}), **cached}
        for field, value in merged.items():
            yield {"field": field, "value": value}
        return

    logger.info("Stream cache miss: %s — streaming enrichment", raw_slug)
    search_context = await search_item(name, destination, item_type)
    prompt = build_prompt(name, destination, item_type, search_context)

    seen: dict[str, object] = {}
    final = None
    async for partial in stream_structured(
        "enrich", EnrichmentResponse, prompt, temperature=0.0, max_tokens=1024,
    ):
        final = partial
        dumped = partial.model_dump(mode="json", exclude_none=True)
        for field, value in dumped.items():
            if seen.get(field) != value:
                seen[field] = value
                yield {"field": field, "value": value}

    if final is None:
        return

    data = final.model_dump(mode="json", exclude_none=False)
    canonical_name = data.get("canonical_name") or name
    canonical_slug_final = build_cache_key(canonical_name, destination, item_type)

    existing_cache = await get_cached_attraction(canonical_slug_final)
    if existing_cache is None:
        country_code = resolve_country_code(destination)
        destination_tokens = [t.strip().lower() for t in destination.split(",") if t.strip()]
        location_query = data.get("location") or canonical_name
        geo, wiki_image = await asyncio.gather(
            geocode_with_validation(
                f"{location_query}, {destination}",
                country_code=country_code,
                destination_tokens=destination_tokens,
            ),
            fetch_wikipedia_image(canonical_name, destination),
        )
        lat = geo.lat if geo else None
        lng = geo.lng if geo else None
        tz = resolve_timezone(geo.lat, geo.lng) if geo else None
        image_url = wiki_image or data.get("image_url")

        upserted = await upsert_place({
            "slug": canonical_slug_final,
            "item_type": item_type,
            "name": canonical_name,
            "destination": destination,
            "description": data.get("description"),
            "location": data.get("location"),
            "image_url": image_url,
            "lat": lat,
            "lng": lng,
            "timezone": tz,
            "categories": data.get("categories"),
        })
        if upserted and upserted.get("id"):
            yield {"field": "place_id", "value": upserted["id"]}
        for field, value in (("lat", lat), ("lng", lng), ("timezone", tz)):
            if value is not None:
                yield {"field": field, "value": value}
        if wiki_image:
            yield {"field": "image_url", "value": wiki_image}

        fresh_data = {k: data[k] for k in FRESH_FIELDS[item_type] if k in data}
        try:
            await store_attraction_cache(canonical_slug_final, fresh_data)
        except Exception as exc:
            logger.warning("Cache write failed for key %s: %s", canonical_slug_final, exc)

    await store_slug_alias(raw_slug, canonical_slug_final)
