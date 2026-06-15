"""Plan hotels: a hotel line item spans one or more days in a plan's itinerary."""
import logging
from datetime import datetime, timezone

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


PLACE_FIELDS = "id, slug, name, image_url, description, location, lat, lng"


async def hydrate_place_fields(hotels: list[dict]) -> None:
    place_ids = [hotel["place_id"] for hotel in hotels if hotel.get("place_id")]
    if not place_ids:
        return
    supabase = get_supabase_client()
    places_result = (
        supabase.table("places")
        .select(PLACE_FIELDS)
        .in_("id", place_ids)
        .execute()
    )
    places_by_id = {row["id"]: row for row in (places_result.data or [])}

    slugs = [row["slug"] for row in places_by_id.values() if row.get("slug")]
    cache_by_slug: dict[str, dict] = {}
    if slugs:
        now_iso = datetime.now(timezone.utc).isoformat()
        cache_result = (
            supabase.table("ai_attraction_cache")
            .select("cache_key, data")
            .in_("cache_key", slugs)
            .gt("expires_at", now_iso)
            .execute()
        )
        cache_by_slug = {
            row["cache_key"]: row.get("data") or {}
            for row in (cache_result.data or [])
        }

    for hotel in hotels:
        place = places_by_id.get(hotel.get("place_id"))
        if not place:
            continue
        hotel["place_name"] = place.get("name")
        hotel["place_image_url"] = place.get("image_url")
        hotel["place_description"] = place.get("description")
        hotel["place_location"] = place.get("location")
        hotel["place_lat"] = place.get("lat")
        hotel["place_lng"] = place.get("lng")
        cache = cache_by_slug.get(place.get("slug") or "")
        if cache:
            hotel["place_check_in_time"] = cache.get("check_in_time")
            hotel["place_price_range"] = cache.get("price_range")


async def list_hotels(plan_id: str) -> list[dict]:
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_hotels")
        .select("*")
        .eq("plan_id", plan_id)
        .order("check_in_day_number")
        .execute()
    )
    hotels = result.data or []
    await hydrate_place_fields(hotels)
    return hotels


async def create_hotel(plan_id: str, payload: dict) -> dict:
    supabase = get_supabase_client()
    insert_payload = {**payload, "plan_id": plan_id}
    result = supabase.table("plan_hotels").insert(insert_payload).execute()
    if not result.data:
        raise ValueError(f"Failed to create hotel in plan {plan_id!r}")
    created = result.data[0]
    await hydrate_place_fields([created])
    return created


async def update_hotel(hotel_id: str, payload: dict) -> dict | None:
    if not payload:
        return None
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_hotels")
        .update(payload)
        .eq("id", hotel_id)
        .execute()
    )
    if not result.data:
        return None
    updated = result.data[0]
    await hydrate_place_fields([updated])
    return updated


async def delete_hotel(hotel_id: str) -> None:
    supabase = get_supabase_client()
    result = supabase.table("plan_hotels").delete().eq("id", hotel_id).execute()
    if not result.data:
        raise ValueError(f"Hotel {hotel_id!r} not found")
