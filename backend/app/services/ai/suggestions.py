import logging
from typing import Optional

from app.constants import VALID_ITEM_TYPES
from app.db import get_supabase_client
from app.services.ai.llm import call_llm_with_fallback, parse_llm_json
from app.services.ai.enrichment import build_cache_key, get_cached_attraction
from app.services.places.repository import resolve_slug_alias

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _build_suggestions_prompt(
    destination: str,
    item_names: list[str],
    preferences: Optional[dict],
    exclude_names: list[str] | None = None,
) -> str:
    prefs = preferences or {}
    interests = ", ".join(prefs.get("interest_tags") or []) or "general sightseeing"
    dietary = ", ".join(prefs.get("dietary") or []) or "no restrictions"
    budget = prefs.get("budget") or "mid-range"
    notes = prefs.get("custom_notes") or "none"
    existing = ", ".join(item_names) if item_names else "nothing yet"

    prompt = f"""You are a travel assistant. Suggest 5 things to do, see, or eat in {destination}.

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
{"suggestions": [{"name": "...", "item_type": "attraction|restaurant|hotel|transport|activity", "one_line": "...", "price_hint": "..."}]}

Rules:
- one_line: max 40 chars, e.g. "Modern art · Free entry Thu"
- price_hint: e.g. "Free", "~€15", "€€", or null
- item_type must be one of: attraction, restaurant, hotel, transport, activity
- Suggest a varied mix of types (not all attractions)
- Suggest well-known, real places"""

    return prompt


async def _enrich_suggestion_metadata(suggestion: dict, destination: str) -> dict:
    """
    Zero-token DB check: resolves slug and marks cached=True if the place is already
    in ai_attraction_cache (not expired). Adds slug and cached fields to the suggestion.
    """
    name = suggestion["name"]
    item_type = suggestion["item_type"]
    raw_slug = build_cache_key(name, destination, item_type)
    canonical_slug = await resolve_slug_alias(raw_slug)
    lookup_slug = canonical_slug if canonical_slug else raw_slug
    cached_data = await get_cached_attraction(lookup_slug)
    return {
        **suggestion,
        "slug": lookup_slug,
        "cached": cached_data is not None,
    }


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


async def _call_llm_for_suggestions(prompt: str, temperature: float = 0.4) -> list[dict]:
    raw_text = await call_llm_with_fallback(prompt, temperature=temperature)
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
                "one_line": str(item["one_line"])[:60] if item.get("one_line") else None,
                "price_hint": str(item["price_hint"]) if item.get("price_hint") else None,
            }
        )

    return valid


# ── Orchestrator ──────────────────────────────────────────────────────────────


async def get_suggestions(
    destination: str,
    plan_id: str,
    existing_item_names: list[str],
    preferences: Optional[dict],
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

    logger.info("Generating suggestions for plan %s (force=%s) — calling LLM", plan_id, force_refresh)
    prompt = _build_suggestions_prompt(destination, existing_item_names, preferences, exclude_names)
    suggestions = await _call_llm_for_suggestions(prompt, temperature=0.4)

    enriched = []
    for suggestion in suggestions:
        enriched.append(await _enrich_suggestion_metadata(suggestion, destination))

    await save_plan_suggestions(plan_id, enriched)
    return enriched


async def get_next_suggestion(
    plan_id: str,
    destination: str,
    existing_item_names: list[str],
    preferences: Optional[dict],
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

    logger.info("All saved suggestions exhausted for plan %s — calling LLM", plan_id)
    prompt = _build_suggestions_prompt(destination, existing_item_names, preferences, exclude_names)
    new_suggestions = await _call_llm_for_suggestions(prompt, temperature=0.6)

    for suggestion in new_suggestions:
        if suggestion.get("name", "").lower() not in exclude_set:
            enriched = await _enrich_suggestion_metadata(suggestion, destination)
            updated = (saved or []) + [enriched]
            await save_plan_suggestions(plan_id, updated)
            return enriched

    return None
