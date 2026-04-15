import asyncio
import logging

from app.constants import VALID_ITEM_TYPES
from app.db import get_supabase_client
from app.services.ai.llm import call_llm_with_fallback, parse_llm_json
from app.services.ai.enrichment import build_cache_key, get_cached_attraction
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

Return ONLY valid JSON with no markdown, no explanation:
{"suggestions": [{"name": "...", "item_type": "attraction|restaurant|hotel|transport|activity", "destination_city": "...", "one_line": "...", "price_hint": "..."}]}

Rules:
- destination_city: must be exactly one of the city names from the destinations list
- one_line: max 40 chars, e.g. "Modern art · Free entry Thu"
- price_hint: e.g. "Free", "~€15", "€€", or null
- item_type must be one of: attraction, restaurant, hotel, transport, activity
- Suggest a varied mix of types (not all attractions)
- Suggest well-known, real places
- Spread suggestions across all provided destinations"""

    return prompt


async def enrich_suggestion_metadata(suggestion: dict) -> dict:
    """
    Zero-token cache check for a suggestion. Embeds enriched data if already cached
    so the frontend can add items without a second round-trip. On a cache miss,
    returns enriched=None — the frontend calls /ai/enrich on demand when the user
    actually adds the item.
    """
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
    """Build the destinations string and city set used in LLM prompts."""
    if destinations:
        return (
            ", ".join(f"{d['city']} ({d['country']})" for d in destinations),
            {d["city"] for d in destinations},
        )
    return fallback, None


# ── plans.suggestions storage ─────────────────────────────────────────────────


async def read_plan_suggestions(plan_id: str) -> list | None:
    """Read plans.suggestions JSONB column. Returns None if column is NULL."""
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
    """Overwrite plans.suggestions JSONB column for the given plan."""
    supabase = get_supabase_client()
    supabase.table("plans").update({"suggestions": suggestions}).eq("id", plan_id).execute()


# ── LLM call ──────────────────────────────────────────────────────────────────


async def call_llm_for_suggestions(
    prompt: str,
    temperature: float = 0.4,
    model_state: dict | None = None,
) -> list[dict]:
    raw_text = await call_llm_with_fallback(prompt, temperature=temperature, model_state=model_state)
    parsed = parse_llm_json(raw_text)

    suggestions = parsed.get("suggestions", [])
    if not isinstance(suggestions, list):
        raise ValueError("LLM suggestions response missing 'suggestions' list")

    valid = []
    for item in suggestions:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        item_type = item.get("item_type")
        if not name or item_type not in VALID_ITEM_TYPES:
            continue
        valid.append(
            {
                "name": str(name),
                "item_type": str(item_type),
                "destination_city": str(item["destination_city"]) if item.get("destination_city") else None,
                "one_line": str(item["one_line"])[:60] if item.get("one_line") else None,
                "price_hint": str(item["price_hint"]) if item.get("price_hint") else None,
            }
        )

    return valid


# ── Orchestrator ──────────────────────────────────────────────────────────────


async def get_suggestions(
    plan_id: str,
    existing_item_names: list[str],
    preferences: dict | None,
    force_refresh: bool = False,
    exclude_names: list[str] | None = None,
) -> list[dict]:
    """
    Return AI-generated place suggestions for a travel plan.

    Reads from plans.suggestions (JSONB) unless force_refresh=True.
    On a miss (or forced refresh), calls Gemini (with Groq fallback), runs a zero-token
    pre-warm check per suggestion (slug_aliases → ai_attraction_cache), then writes the
    enriched list back to plans.suggestions.
    """
    if not force_refresh:
        saved = await read_plan_suggestions(plan_id)
        if saved is not None:
            logger.info("Loaded suggestions from plans.suggestions for plan %s", plan_id)
            return saved

    plan_destinations = await get_destinations_for_plan(plan_id)
    if not plan_destinations:
        return []
    destinations_str, cities = format_destinations(plan_destinations, "")

    logger.info("Generating suggestions for plan %s (force=%s) — calling LLM", plan_id, force_refresh)
    prompt = build_suggestions_prompt(destinations_str, existing_item_names, preferences, exclude_names)
    suggestions = await call_llm_for_suggestions(prompt, temperature=0.4)

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
    """
    Return a single new suggestion not in exclude_names.

    Checks plans.suggestions first (zero tokens). Calls LLM with temperature=0.6
    only if all saved suggestions are exhausted or absent.
    """
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
    new_suggestions = await call_llm_for_suggestions(prompt, temperature=0.6)

    if cities is not None:
        new_suggestions = [s for s in new_suggestions if s.get("destination_city") in cities]

    for suggestion in new_suggestions:
        if suggestion.get("name", "").lower() not in exclude_set:
            enriched = await enrich_suggestion_metadata(suggestion)
            updated = (saved or []) + [enriched]
            await save_plan_suggestions(plan_id, updated)
            return enriched

    return None
