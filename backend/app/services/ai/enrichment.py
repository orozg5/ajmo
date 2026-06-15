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
from app.services.places.geocoding import geocode_with_fallbacks, resolve_timezone
from app.services.places.images import fetch_pexels_image
from app.services.places.repository import (
    get_place_by_slug,
    resolve_slug_alias,
    store_slug_alias,
    upsert_place,
)

logger = logging.getLogger(__name__)


SEARCH_QUERY_TEMPLATES = {
    "attraction": "{name} {destination} attraction hours price",
    "restaurant": "{name} {destination} restaurant cuisine price hours reservation",
    "hotel":      "{name} {destination} hotel amenities check-in booking",
    "transport":  "{name} {destination} transport schedule price booking",
    "activity":   "{name} {destination} activity price booking tips",
}

STABLE_FIELDS = ["canonical_name", "description", "location"]

FRESH_FIELDS = {
    "attraction": ["opening_hours", "price_range", "tips"],
    "restaurant": ["cuisine", "price_range", "opening_hours", "reservation_tips"],
    "hotel":      ["amenities", "check_in_time", "price_range", "booking_tips"],
    "transport":  ["schedule", "price_range", "booking_tips"],
    "activity":   ["duration", "price_range", "booking_tips", "tips"],
}


LEADING_ARTICLE_RE = re.compile(r"^(the|a|an)\s+", re.IGNORECASE)

NAME_TOKEN_STOPWORDS = {
    "the", "a", "an", "and", "of", "in", "at", "on",
    "le", "la", "les", "l", "du", "de", "des", "d",
    "el", "il", "lo", "gli", "los", "las", "y",
    "der", "die", "das", "den", "dem", "und",
    "hotel", "hotels", "restaurant", "restaurants", "cafe",
    "bar", "tavern", "inn", "lodge", "resort", "motel",
}


def build_cache_key(name: str, destination: str, item_type: str) -> str:
    """Leading articles (the/a/an) are stripped so 'Eiffel Tower' and 'The Eiffel Tower' collapse to one key."""
    normalized_name = LEADING_ARTICLE_RE.sub("", name).strip()
    raw = f"{normalized_name} {destination}".lower()
    slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return f"{slug}-{item_type}"


def names_share_significant_token(a: str, b: str) -> bool:
    """Detect LLM substitutions (e.g. 'Hotel Lutetia' → 'Les Botanistes') while letting canonical expansions ('Hilton' → 'Hilton Paris Opera') match on the brand token."""
    def significant_tokens(s: str) -> set[str]:
        return {
            t for t in re.split(r"[^a-z0-9]+", s.lower())
            if t and t not in NAME_TOKEN_STOPWORDS
        }
    return bool(significant_tokens(a) & significant_tokens(b))


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


async def search_item(name: str, destination: str, item_type: str, *, deep: bool = False) -> str:
    """Advanced depth for hotels or a deep retry; basic otherwise."""
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
    for r in results[:3]:
        content = r.get("content")
        if not content:
            continue
        snippet = content[:300] if len(content) > 300 else content
        title = r.get("title")
        context_parts.append(f"{title}: {snippet}" if title else snippet)

    return "\n\n".join(context_parts)


def build_prompt(name: str, destination: str, item_type: str, search_context: str) -> str:
    fresh = ", ".join(FRESH_FIELDS[item_type])
    return f"""You are a travel information assistant extracting facts about a {item_type}.

Name: {name}
Destination: {destination}

Search results:
{search_context}

Extract: canonical_name, description, location (specific street address with number OR named area — never just the city), and these type-specific fields when known: {fresh}.
canonical_name MUST refer to the same {item_type} as the input Name above. You may correct spelling or add an official brand prefix/suffix (e.g. "Hilton" → "Hilton Paris Opera", "Hotel Lutetia" → "Mandarin Oriental Lutetia"), but never substitute a different establishment.
List fields must contain unique items only, no duplicates, at most 10 entries.
Set any field to null when the search results do not support a confident answer. Never invent facts. Do not output an image URL — image lookup is handled outside the LLM."""


async def enrich_with_llm(name: str, destination: str, item_type: str, search_context: str) -> dict:
    prompt = build_prompt(name, destination, item_type, search_context)
    response: EnrichmentResponse = await call_structured(
        "enrich", EnrichmentResponse, prompt, temperature=0.0, max_tokens=1024,
    )
    return response.model_dump(mode="json", exclude_none=False)


INFLIGHT: dict[str, asyncio.Task[dict]] = {}
"""Single-flight: concurrent callers with the same slug share one task instead of duplicating Tavily + LLM work."""


async def get_place_data(name: str, destination: str, item_type: str) -> dict:
    """Unified lookup: slug_aliases → ai_attraction_cache → places → LLM fallback."""
    raw_slug = build_cache_key(name, destination, item_type)

    existing = INFLIGHT.get(raw_slug)
    if existing is not None and not existing.done():
        logger.info("Single-flight: awaiting in-flight enrichment for %s", raw_slug)
        return await existing

    task = asyncio.create_task(compute_place_data(raw_slug, name, destination, item_type))
    INFLIGHT[raw_slug] = task
    task.add_done_callback(
        lambda t: INFLIGHT.pop(raw_slug, None) if INFLIGHT.get(raw_slug) is t else None
    )
    return await task


async def compute_place_data(raw_slug: str, name: str, destination: str, item_type: str) -> dict:
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
    if not names_share_significant_token(name, canonical_name):
        logger.warning(
            "LLM substituted entity for %r → %r — discarding LLM enrichment, falling back to input name",
            name, canonical_name,
        )
        canonical_name = name
        data["canonical_name"] = name
        data["description"] = None
        data["location"] = None
        data["categories"] = None
        for fresh_field in FRESH_FIELDS[item_type]:
            data[fresh_field] = None
    canonical_slug = build_cache_key(canonical_name, destination, item_type)

    existing_cache = await get_cached_attraction(canonical_slug)
    if existing_cache is not None:
        await store_slug_alias(raw_slug, canonical_slug)
        stable = await get_place_by_slug(canonical_slug, item_type)
        if stable:
            return {**stable, **existing_cache, "place_id": stable.get("id")}
        return existing_cache

    existing_place = await get_place_by_slug(canonical_slug, item_type)
    if existing_place is not None:
        fresh_data = {k: data[k] for k in FRESH_FIELDS[item_type] if k in data}
        try:
            await store_attraction_cache(canonical_slug, fresh_data)
        except Exception as exc:
            logger.warning("Cache write failed for key %s: %s", canonical_slug, exc)
        await store_slug_alias(raw_slug, canonical_slug)
        return {**existing_place, **fresh_data, "place_id": existing_place.get("id")}

    country_code = resolve_country_code(destination)
    location_query = data.get("location")
    geo, image_url = await asyncio.gather(
        geocode_with_fallbacks(
            canonical_name,
            destination,
            country_code=country_code,
            location_query=location_query,
        ),
        fetch_pexels_image(canonical_name, destination),
    )
    final_lat: float | None = geo.lat if geo is not None else None
    final_lng: float | None = geo.lng if geo is not None else None
    data["lat"] = final_lat
    data["lng"] = final_lng
    data["timezone"] = (
        resolve_timezone(final_lat, final_lng)
        if final_lat is not None and final_lng is not None
        else None
    )
    data["image_url"] = image_url

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
    """Yield enrichment field updates as the LLM streams; cache hit emits all known fields immediately."""
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
    if not names_share_significant_token(name, canonical_name):
        logger.warning(
            "LLM substituted entity for %r → %r — discarding LLM enrichment, falling back to input name",
            name, canonical_name,
        )
        canonical_name = name
        data["canonical_name"] = name
        data["description"] = None
        data["location"] = None
        data["categories"] = None
        for fresh_field in FRESH_FIELDS[item_type]:
            data[fresh_field] = None
    canonical_slug_final = build_cache_key(canonical_name, destination, item_type)

    existing_cache = await get_cached_attraction(canonical_slug_final)
    if existing_cache is None:
        existing_place = await get_place_by_slug(canonical_slug_final, item_type)
        if existing_place is not None:
            place_id = existing_place.get("id")
            if place_id is not None:
                yield {"field": "place_id", "value": place_id}
            for field in ("image_url", "lat", "lng", "timezone"):
                value = existing_place.get(field)
                if value is not None:
                    yield {"field": field, "value": value}
            fresh_data = {k: data[k] for k in FRESH_FIELDS[item_type] if k in data}
            try:
                await store_attraction_cache(canonical_slug_final, fresh_data)
            except Exception as exc:
                logger.warning("Cache write failed for key %s: %s", canonical_slug_final, exc)
        else:
            country_code = resolve_country_code(destination)
            location_query = data.get("location")
            geo, image_url = await asyncio.gather(
                geocode_with_fallbacks(
                    canonical_name,
                    destination,
                    country_code=country_code,
                    location_query=location_query,
                ),
                fetch_pexels_image(canonical_name, destination),
            )
            lat: float | None = geo.lat if geo is not None else None
            lng: float | None = geo.lng if geo is not None else None
            tz = resolve_timezone(lat, lng) if lat is not None and lng is not None else None

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
            if image_url:
                yield {"field": "image_url", "value": image_url}

            fresh_data = {k: data[k] for k in FRESH_FIELDS[item_type] if k in data}
            try:
                await store_attraction_cache(canonical_slug_final, fresh_data)
            except Exception as exc:
                logger.warning("Cache write failed for key %s: %s", canonical_slug_final, exc)

    await store_slug_alias(raw_slug, canonical_slug_final)
