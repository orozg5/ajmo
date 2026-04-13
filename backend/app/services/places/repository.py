import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


# ── Places ────────────────────────────────────────────────────────────────────


async def upsert_place(data: dict) -> dict | None:
    """
    Upsert a place into the permanent places table.
    On conflict (slug, item_type) the existing row is left unchanged.
    Failure is non-fatal — logged as warning, returns None.
    """
    supabase = get_supabase_client()
    try:
        response = (
            supabase.table("places")
            .upsert(data, on_conflict="slug,item_type")
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception as exc:
        logger.warning("places upsert failed for slug=%s: %s", data.get("slug"), exc)
        return None


async def autocomplete_places(q: str, destination: str, item_type: str) -> list[dict]:
    """
    Return up to 10 places whose name starts with q, scoped to destination + item_type.
    Uses case-insensitive prefix match on the name column.
    """
    supabase = get_supabase_client()
    response = (
        supabase.table("places")
        .select("*")
        .ilike("name", f"%{q}%")
        .eq("destination", destination)
        .eq("item_type", item_type)
        .limit(10)
        .execute()
    )
    return response.data or []


# ── Slug aliases ──────────────────────────────────────────────────────────────


async def get_place_by_slug(slug: str, item_type: str) -> dict | None:
    """
    Fetch stable fields for a place by its canonical slug + item_type.
    Returns None on miss or any DB error.
    """
    supabase = get_supabase_client()
    try:
        result = (
            supabase.table("places")
            .select("name, description, location, image_url")
            .eq("slug", slug)
            .eq("item_type", item_type)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as exc:
        logger.warning("get_place_by_slug failed for slug=%s: %s", slug, exc)
        return None


async def resolve_slug_alias(raw_slug: str) -> str | None:
    """
    Look up a raw input slug in the alias table.
    Returns the canonical_slug string if found, otherwise None.
    Any DB error (missing table, network issue) is caught and treated as a miss.
    """
    supabase = get_supabase_client()
    try:
        result = (
            supabase.table("slug_aliases")
            .select("canonical_slug")
            .eq("raw_slug", raw_slug)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["canonical_slug"]
        return None
    except Exception as exc:
        logger.warning("resolve_slug_alias failed for %s: %s", raw_slug, exc)
        return None


async def store_slug_alias(raw_slug: str, canonical_slug: str) -> None:
    """
    Write a raw_slug → canonical_slug mapping into slug_aliases.
    Upserts so re-running enrichment on the same input is idempotent.
    Failure is non-fatal — logged as warning.
    """
    supabase = get_supabase_client()
    try:
        supabase.table("slug_aliases").upsert(
            {"raw_slug": raw_slug, "canonical_slug": canonical_slug}
        ).execute()
    except Exception as exc:
        logger.warning(
            "slug_alias write failed raw=%s canonical=%s: %s",
            raw_slug, canonical_slug, exc,
        )
