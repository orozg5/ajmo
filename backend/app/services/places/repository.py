import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


async def upsert_place(data: dict) -> dict | None:
    """First-write-wins safety net against double-writes from concurrent enrichments. Non-fatal on failure."""
    supabase = get_supabase_client()
    try:
        response = (
            supabase.table("places")
            .upsert(data, on_conflict="slug,item_type", ignore_duplicates=True)
            .execute()
        )
        if response.data:
            return response.data[0]
        existing = (
            supabase.table("places")
            .select("*")
            .eq("slug", data["slug"])
            .eq("item_type", data["item_type"])
            .limit(1)
            .execute()
        )
        return existing.data[0] if existing.data else None
    except Exception as exc:
        logger.warning("places upsert failed for slug=%s: %s", data.get("slug"), exc)
        return None


async def autocomplete_places(q: str, destination: str, item_type: str) -> list[dict]:
    supabase = get_supabase_client()
    response = (
        supabase.table("places")
        .select("*")
        .ilike("name", f"{q}%")
        .eq("destination", destination)
        .eq("item_type", item_type)
        .limit(10)
        .execute()
    )
    return response.data or []


async def get_place_by_slug(slug: str, item_type: str) -> dict | None:
    supabase = get_supabase_client()
    try:
        result = (
            supabase.table("places")
            .select("id, name, description, location, image_url, lat, lng, timezone, categories")
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
    """DB errors treated as a miss."""
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
    """Upsert so re-running enrichment is idempotent; non-fatal on failure."""
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
