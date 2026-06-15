import asyncio
import logging

from app.config import chain_for_feature
from app.db import get_supabase_client
from app.services.ai.enrichment import build_cache_key, get_cached_attraction
from app.services.ai.llm import call_structured, stream_structured
from app.services.ai.schemas import SuggestionItem, SuggestionsResponse
from app.services.places.repository import get_place_by_slug, resolve_slug_alias
from app.services.plans.destinations import get_destinations_for_plan

logger = logging.getLogger(__name__)


TARGET_SUGGESTION_COUNT = 5


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

    seen: set[str] = set()
    merged: list[str] = []
    for name in (item_names or []) + (exclude_names or []):
        key = name.strip().lower()
        if key and key not in seen:
            seen.add(key)
            merged.append(name)

    prompt = f"""You are a travel assistant. Suggest {TARGET_SUGGESTION_COUNT} things to do, see, or eat across these destinations: {destinations_str}.

Each suggestion must be an attraction, a restaurant, or an activity. Do NOT suggest hotels or transportation — those belong to other parts of the plan.

Traveler preferences:
- Interests: {interests}
- Dietary restrictions: {dietary}
- Budget: {budget}
- Extra notes: {notes}"""

    if merged:
        prompt += f"\n\nDo not suggest any of these (already in the plan or recently shown): {', '.join(merged)}"

    prompt += """

Rules:
- item_type must be one of: attraction, restaurant, activity.
- destination_city must be one of the provided cities.
- one_line: short single-phrase hook, e.g. "Modern art · Free entry Thu".
- price_hint: e.g. "Free", "~€15", "€€", or null when unknown.
- Mix the three types — don't return all attractions.
- Spread suggestions across all provided destinations.
- Suggest well-known, real places only."""

    return prompt


async def enrich_suggestion_metadata(suggestion: dict) -> dict:
    """Zero-token cache check; returns `cached: False` when only stable place data is available so the frontend re-runs /ai/enrich-batch for volatile fields."""
    name = suggestion["name"]
    destination_city = suggestion.get("destination_city") or ""
    item_type = suggestion["item_type"]

    raw_slug = build_cache_key(name, destination_city, item_type)
    canonical_slug = await resolve_slug_alias(raw_slug)
    lookup_slug = canonical_slug if canonical_slug else raw_slug

    cached_data, stable = await asyncio.gather(
        get_cached_attraction(lookup_slug),
        get_place_by_slug(lookup_slug, item_type),
    )

    if cached_data is not None:
        enriched = {**stable, **cached_data} if stable else cached_data
        cached = True
    elif stable:
        enriched = stable
        cached = False
    else:
        enriched = None
        cached = False

    return {
        **suggestion,
        "slug": lookup_slug,
        "cached": cached,
        "enriched": enriched,
    }


def format_destinations(destinations: list[dict], fallback: str) -> tuple[str, set[str] | None]:
    if destinations:
        return (
            ", ".join(f"{d['city']} ({d['country']})" for d in destinations),
            {d["city"] for d in destinations},
        )
    return fallback, None


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


async def call_llm_for_suggestions(
    prompt: str,
    temperature: float = 0.5,
    *,
    provider: str | None = None,
) -> list[dict]:
    response: SuggestionsResponse = await call_structured(
        "suggestions",
        SuggestionsResponse,
        prompt,
        temperature=temperature,
        max_tokens=2048,
        provider_override=provider,
    )
    return [item.model_dump() for item in response.suggestions]


async def top_up_suggestions(
    current: list[dict],
    plan_id: str,
    existing_item_names: list[str],
    preferences: dict | None,
    cities: set[str] | None,
    destinations_str: str,
) -> list[dict]:
    """Append fresh suggestions to `current` until count reaches the target; bumps temperature per attempt and falls back to gemini if the local chain runs dry."""
    if len(current) >= TARGET_SUGGESTION_COUNT:
        return current

    seen_slugs: set[str] = {s["slug"] for s in current if s.get("slug")}
    seen_names: set[str] = {s["name"].lower() for s in current if s.get("name")}
    existing_lower: set[str] = {n.lower() for n in existing_item_names}

    primary_chain = ",".join(chain_for_feature("suggestions"))
    attempts: list[tuple[float, str | None]] = [(0.6, None), (0.9, None), (0.7, "gemini")]

    for attempt, (temp, provider_override) in enumerate(attempts):
        if len(current) >= TARGET_SUGGESTION_COUNT:
            break
        target_provider = provider_override or primary_chain
        logger.info(
            "Top-up attempt %d for plan %s at temp=%.2f via %s (have %d/%d)",
            attempt + 1, plan_id, temp, target_provider,
            len(current), TARGET_SUGGESTION_COUNT,
        )
        already_collected = [s["name"] for s in current if s.get("name")]
        prompt = build_suggestions_prompt(
            destinations_str, existing_item_names, preferences, already_collected,
        )
        try:
            new_suggestions = await call_llm_for_suggestions(
                prompt, temperature=temp, provider=provider_override,
            )
        except Exception as exc:
            logger.warning(
                "Top-up attempt %d failed for plan %s: %s",
                attempt + 1, plan_id, exc,
            )
            continue

        if cities is not None:
            new_suggestions = [s for s in new_suggestions if s.get("destination_city") in cities]

        skip_now = existing_lower | seen_names
        name_fresh = [s for s in new_suggestions if s.get("name", "").lower() not in skip_now]
        if not name_fresh:
            continue

        enriched_list = list(
            await asyncio.gather(*[enrich_suggestion_metadata(s) for s in name_fresh])
        )

        for item in enriched_list:
            if len(current) >= TARGET_SUGGESTION_COUNT:
                break
            slug = item.get("slug")
            name_lower = item.get("name", "").lower()
            if name_lower in skip_now:
                continue
            if slug and slug in seen_slugs:
                continue
            current.append(item)
            seen_names.add(name_lower)
            if slug:
                seen_slugs.add(slug)

    return current


async def get_suggestions(
    plan_id: str,
    existing_item_names: list[str],
    preferences: dict | None,
    force_refresh: bool = False,
    exclude_names: list[str] | None = None,
) -> list[dict]:
    """Return AI suggestions, reading plans.suggestions unless force_refresh; cached entries are filtered against existing items on read."""
    existing_set = {name.lower() for name in existing_item_names}

    if not force_refresh:
        saved = await read_plan_suggestions(plan_id)
        if saved is not None:
            filtered = [s for s in saved if s.get("name", "").lower() not in existing_set]
            if filtered and len(filtered) >= TARGET_SUGGESTION_COUNT:
                logger.info(
                    "Loaded suggestions from plans.suggestions for plan %s (%d after filtering items)",
                    plan_id, len(filtered),
                )
                return filtered
            if filtered:
                logger.info(
                    "plans.suggestions for plan %s short (%d) — topping up to %d",
                    plan_id, len(filtered), TARGET_SUGGESTION_COUNT,
                )
                plan_destinations = await get_destinations_for_plan(plan_id)
                if plan_destinations:
                    destinations_str, cities = format_destinations(plan_destinations, "")
                    filtered = await top_up_suggestions(
                        filtered, plan_id, existing_item_names, preferences,
                        cities, destinations_str,
                    )
                    await save_plan_suggestions(plan_id, filtered)
                return filtered
            logger.info(
                "plans.suggestions for plan %s fully covered by existing items; regenerating",
                plan_id,
            )

    plan_destinations = await get_destinations_for_plan(plan_id)
    if not plan_destinations:
        return []
    destinations_str, cities = format_destinations(plan_destinations, "")

    logger.info("Generating suggestions for plan %s (force=%s)", plan_id, force_refresh)
    prompt = build_suggestions_prompt(destinations_str, existing_item_names, preferences, exclude_names)
    suggestions = await call_llm_for_suggestions(prompt)

    if cities is not None:
        suggestions = [s for s in suggestions if s.get("destination_city") in cities]

    skip_initial = {n.lower() for n in existing_item_names}
    if exclude_names:
        skip_initial |= {n.lower() for n in exclude_names}
    suggestions = [s for s in suggestions if s.get("name", "").lower() not in skip_initial]

    enriched = list(
        await asyncio.gather(*[enrich_suggestion_metadata(s) for s in suggestions])
    )

    # slug_aliases can collapse two LLM names onto the same canonical slug; without this dedupe the strip renders duplicate React keys.
    deduped: list[dict] = []
    seen_slugs: set[str] = set()
    for item in enriched:
        slug = item.get("slug")
        if slug and slug in seen_slugs:
            continue
        if slug:
            seen_slugs.add(slug)
        deduped.append(item)

    if len(deduped) < TARGET_SUGGESTION_COUNT:
        deduped = await top_up_suggestions(
            deduped, plan_id, existing_item_names, preferences, cities, destinations_str,
        )

    await save_plan_suggestions(plan_id, deduped)
    return deduped


async def get_next_suggestion(
    plan_id: str,
    existing_item_names: list[str],
    preferences: dict | None,
    exclude_names: list[str],
    *,
    exclude_slugs: list[str] | None = None,
) -> dict | None:
    """Return one suggestion absent from the plan, exclude_names, and exclude_slugs (alias-collision guard against the frontend's slug-keyed dedupe silently dropping a result)."""
    saved = await read_plan_suggestions(plan_id)
    skip_names = {name.lower() for name in exclude_names} | {
        name.lower() for name in existing_item_names
    }
    skip_slugs = {slug for slug in (exclude_slugs or []) if slug}

    def is_fresh(suggestion: dict) -> bool:
        if suggestion.get("name", "").lower() in skip_names:
            return False
        slug = suggestion.get("slug")
        if slug and slug in skip_slugs:
            return False
        return True

    if saved:
        for suggestion in saved:
            if is_fresh(suggestion):
                logger.info("Next suggestion served from plans.suggestions for plan %s", plan_id)
                return suggestion

    plan_destinations = await get_destinations_for_plan(plan_id)
    if not plan_destinations:
        return None
    destinations_str, cities = format_destinations(plan_destinations, "")

    logger.info("All saved suggestions exhausted for plan %s — calling LLM", plan_id)
    llm_exclude = list(skip_names)
    prompt = build_suggestions_prompt(destinations_str, existing_item_names, preferences, llm_exclude)

    attempts: list[tuple[float, str | None]] = [(0.5, None), (0.85, None), (1.1, None), (0.7, "gemini")]
    primary_chain = ",".join(chain_for_feature("suggestions"))
    for attempt, (temp, provider_override) in enumerate(attempts):
        if attempt > 0:
            target = provider_override or primary_chain
            logger.warning(
                "LLM suggestions retry %d for plan %s at temp=%.2f via %s",
                attempt, plan_id, temp, target,
            )
        try:
            new_suggestions = await call_llm_for_suggestions(
                prompt, temperature=temp, provider=provider_override,
            )
        except Exception as exc:
            logger.warning(
                "LLM suggestions attempt %d failed for plan %s (%s): %s",
                attempt, plan_id, provider_override or primary_chain, exc,
            )
            continue
        if cities is not None:
            new_suggestions = [s for s in new_suggestions if s.get("destination_city") in cities]
        name_fresh = [s for s in new_suggestions if s.get("name", "").lower() not in skip_names]
        if not name_fresh:
            continue
        enriched_list = list(
            await asyncio.gather(*[enrich_suggestion_metadata(s) for s in name_fresh])
        )
        slug_fresh = [s for s in enriched_list if is_fresh(s)]
        if slug_fresh:
            updated = (saved or []) + enriched_list
            await save_plan_suggestions(plan_id, updated)
            return slug_fresh[0]

    logger.warning("LLM exhausted (incl. cloud fallback) for plan %s — returning None", plan_id)
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
    """Yield enriched suggestion dicts as they become available; cache miss emits each item once the next starts forming."""
    existing_set = {name.lower() for name in existing_item_names}
    saved = await read_plan_suggestions(plan_id)
    if saved is not None:
        filtered = [s for s in saved if s.get("name", "").lower() not in existing_set]
        if filtered:
            logger.info(
                "Stream: serving %d cached suggestions for plan %s",
                len(filtered), plan_id,
            )
            for suggestion in filtered:
                yield suggestion
            return
        logger.info(
            "Stream: plans.suggestions for plan %s fully covered by existing items; regenerating",
            plan_id,
        )

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
