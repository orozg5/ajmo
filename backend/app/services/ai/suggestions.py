import asyncio
import logging

from app.db import get_supabase_client
from app.services.ai.enrichment import build_cache_key, get_cached_attraction
from app.services.ai.llm import call_structured, stream_structured
from app.services.ai.schemas import SuggestionItem, SuggestionsResponse
from app.services.places.repository import get_place_by_slug, resolve_slug_alias
from app.services.plans.destinations import get_destinations_for_plan

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────


def build_suggestions_prompt(
    destinations_str: str,
    item_names: list[str],
    preferences: dict | None,
    exclude_names: list[str] | None = None,
) -> str:
    prefs = preferences or {}
    interests = ", ".join(prefs.get("interest_tags") or []) or "general sightseeing"
    dietary = ", ".join(prefs.get("dietary") or []) or "no restrictions"
    budget = prefs.get("budget") or "mid-range"
    notes = prefs.get("custom_notes") or "none"
    existing = ", ".join(item_names) if item_names else "nothing yet"

    prompt = f"""You are a travel assistant. Suggest 5 things to do, see, or eat across these destinations: {destinations_str}.

Traveler preferences:
- Interests: {interests}
- Dietary restrictions: {dietary}
- Budget: {budget}
- Extra notes: {notes}

Already planned across all days: {existing}
Do NOT suggest any of the already-planned items."""

    if exclude_names:
        excluded_str = ", ".join(exclude_names)
        prompt += f"\nAlready suggested or added (do NOT repeat): {excluded_str}"

    prompt += """

Rules:
- destination_city must be one of the provided cities.
- one_line: short single-phrase hook, e.g. "Modern art · Free entry Thu".
- price_hint: e.g. "Free", "~€15", "€€", or null when unknown.
- Mix item types — don't return all attractions.
- Spread suggestions across all provided destinations.
- Suggest well-known, real places only."""

    return prompt


async def enrich_suggestion_metadata(suggestion: dict) -> dict:
    """Zero-token cache check. Embeds enriched data if cached; None on miss."""
    name = suggestion["name"]
    destination_city = suggestion.get("destination_city") or ""
    item_type = suggestion["item_type"]

    raw_slug = build_cache_key(name, destination_city, item_type)
    canonical_slug = await resolve_slug_alias(raw_slug)
    lookup_slug = canonical_slug if canonical_slug else raw_slug

    cached_data = await get_cached_attraction(lookup_slug)
    if cached_data is not None:
        stable = await get_place_by_slug(lookup_slug, item_type)
        enriched = {**stable, **cached_data} if stable else cached_data
    else:
        enriched = None

    return {
        **suggestion,
        "slug": lookup_slug,
        "cached": enriched is not None,
        "enriched": enriched,
    }


def format_destinations(destinations: list[dict], fallback: str) -> tuple[str, set[str] | None]:
    if destinations:
        return (
            ", ".join(f"{d['city']} ({d['country']})" for d in destinations),
            {d["city"] for d in destinations},
        )
    return fallback, None


# ── plans.suggestions storage ─────────────────────────────────────────────────


async def read_plan_suggestions(plan_id: str) -> list | None:
    supabase = get_supabase_client()
    result = (
        supabase.table("plans")
        .select("suggestions")
        .eq("id", plan_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0].get("suggestions")
    return None


async def save_plan_suggestions(plan_id: str, suggestions: list) -> None:
    supabase = get_supabase_client()
    supabase.table("plans").update({"suggestions": suggestions}).eq("id", plan_id).execute()


# ── LLM call ──────────────────────────────────────────────────────────────────


async def call_llm_for_suggestions(prompt: str) -> list[dict]:
    response: SuggestionsResponse = await call_structured(
        "suggestions", SuggestionsResponse, prompt, temperature=0.5, max_tokens=2048,
    )
    return [item.model_dump() for item in response.suggestions]


# ── Orchestrator ──────────────────────────────────────────────────────────────


async def get_suggestions(
    plan_id: str,
    existing_item_names: list[str],
    preferences: dict | None,
    force_refresh: bool = False,
    exclude_names: list[str] | None = None,
) -> list[dict]:
    """Return AI suggestions. Reads plans.suggestions unless force_refresh."""
    if not force_refresh:
        saved = await read_plan_suggestions(plan_id)
        if saved is not None:
            logger.info("Loaded suggestions from plans.suggestions for plan %s", plan_id)
            return saved

    plan_destinations = await get_destinations_for_plan(plan_id)
    if not plan_destinations:
        return []
    destinations_str, cities = format_destinations(plan_destinations, "")

    logger.info("Generating suggestions for plan %s (force=%s)", plan_id, force_refresh)
    prompt = build_suggestions_prompt(destinations_str, existing_item_names, preferences, exclude_names)
    suggestions = await call_llm_for_suggestions(prompt)

    if cities is not None:
        suggestions = [s for s in suggestions if s.get("destination_city") in cities]

    enriched = list(
        await asyncio.gather(*[enrich_suggestion_metadata(s) for s in suggestions])
    )

    await save_plan_suggestions(plan_id, enriched)
    return enriched


async def get_next_suggestion(
    plan_id: str,
    existing_item_names: list[str],
    preferences: dict | None,
    exclude_names: list[str],
) -> dict | None:
    """Return one suggestion not in exclude_names, LLM-called only if needed."""
    saved = await read_plan_suggestions(plan_id)
    exclude_set = {name.lower() for name in exclude_names}

    if saved:
        for suggestion in saved:
            if suggestion.get("name", "").lower() not in exclude_set:
                logger.info("Next suggestion served from plans.suggestions for plan %s", plan_id)
                return suggestion

    plan_destinations = await get_destinations_for_plan(plan_id)
    if not plan_destinations:
        return None
    destinations_str, cities = format_destinations(plan_destinations, "")

    logger.info("All saved suggestions exhausted for plan %s — calling LLM", plan_id)
    prompt = build_suggestions_prompt(destinations_str, existing_item_names, preferences, exclude_names)
    new_suggestions = await call_llm_for_suggestions(prompt)

    if cities is not None:
        new_suggestions = [s for s in new_suggestions if s.get("destination_city") in cities]

    for suggestion in new_suggestions:
        if suggestion.get("name", "").lower() not in exclude_set:
            enriched = await enrich_suggestion_metadata(suggestion)
            updated = (saved or []) + [enriched]
            await save_plan_suggestions(plan_id, updated)
            return enriched

    return None


async def enrich_and_filter_suggestion(
    item: SuggestionItem,
    cities: set[str] | None,
) -> dict | None:
    dumped = item.model_dump()
    if cities is not None and dumped.get("destination_city") not in cities:
        return None
    return await enrich_suggestion_metadata(dumped)


async def stream_suggestions(
    plan_id: str,
    existing_item_names: list[str],
    preferences: dict | None,
):
    """Yield enriched suggestion dicts as they become available.

    Cache hit: yields cached suggestions one at a time. Cache miss: streams
    from the LLM, emits each item once the next one starts forming (last is
    flushed after the stream ends), then persists the full list.
    """
    saved = await read_plan_suggestions(plan_id)
    if saved is not None:
        logger.info("Stream: serving cached suggestions for plan %s", plan_id)
        for suggestion in saved:
            yield suggestion
        return

    plan_destinations = await get_destinations_for_plan(plan_id)
    if not plan_destinations:
        return
    destinations_str, cities = format_destinations(plan_destinations, "")

    logger.info("Stream: generating suggestions for plan %s", plan_id)
    prompt = build_suggestions_prompt(destinations_str, existing_item_names, preferences)

    emitted = 0
    accumulated: list[dict] = []
    last: SuggestionsResponse | None = None

    async for partial in stream_structured(
        "suggestions", SuggestionsResponse, prompt, temperature=0.5, max_tokens=2048,
    ):
        last = partial
        items = partial.suggestions or []
        while emitted < len(items) - 1:
            enriched = await enrich_and_filter_suggestion(items[emitted], cities)
            emitted += 1
            if enriched is not None:
                accumulated.append(enriched)
                yield enriched

    if last is not None:
        items = last.suggestions or []
        while emitted < len(items):
            enriched = await enrich_and_filter_suggestion(items[emitted], cities)
            emitted += 1
            if enriched is not None:
                accumulated.append(enriched)
                yield enriched

    if accumulated:
        await save_plan_suggestions(plan_id, accumulated)
