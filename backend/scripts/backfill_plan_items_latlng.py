"""One-shot backfill: copy places.lat/lng/timezone into plan_items.ai_data for items pre-Phase-4.

Walks every plan_items row whose ai_data is non-null but lacks numeric lat/lng, looks up
the matching places row by name + item_type (disambiguated by destination city), and
merges the stable coordinates into the item's ai_data JSONB. Idempotent: items already
populated are skipped.

Usage:
    cd backend
    .venv/Scripts/python -m scripts.backfill_plan_items_latlng [--dry-run] [--limit N]
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.db import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("backfill_plan_items_latlng")


def find_place_match(
    candidates: list[dict], city: str, country: str
) -> dict | None:
    """Pick the best places row from candidates using destination substring match."""
    if not candidates:
        return None
    city_lower = city.lower()
    country_lower = country.lower()
    for cand in candidates:
        dest_str = str(cand.get("destination") or "").lower()
        if city_lower in dest_str or country_lower in dest_str:
            return cand
    return candidates[0]


async def backfill(dry_run: bool, limit: int | None) -> None:
    supabase = get_supabase_client()

    dest_result = (
        supabase.table("plan_destinations")
        .select("id, city, country")
        .execute()
    )
    destinations_map: dict[str, tuple[str, str]] = {
        d["id"]: (d["city"], d["country"]) for d in (dest_result.data or [])
    }

    item_query = (
        supabase.table("plan_items")
        .select("id, title, item_type, destination_id, ai_data")
    )
    if limit is not None:
        item_query = item_query.limit(limit)

    all_rows = item_query.execute().data or []

    candidates: list[dict] = []
    for row in all_rows:
        ai_data = row.get("ai_data")
        if not isinstance(ai_data, dict):
            continue
        lat = ai_data.get("lat")
        lng = ai_data.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            continue
        candidates.append(row)

    if not candidates:
        logger.info("no plan_items rows need backfill — nothing to do")
        return

    if dry_run:
        logger.info("[dry-run] would backfill %d plan_items rows", len(candidates))
        return

    logger.info("backfilling %d plan_items rows", len(candidates))

    filled = 0
    missed = 0
    for row in candidates:
        ai_data = row["ai_data"]
        dest_id = row.get("destination_id")
        dest = destinations_map.get(dest_id) if dest_id else None
        if not dest:
            missed += 1
            logger.warning(
                "item %s has no resolvable destination — skipping",
                row["id"],
            )
            continue

        city, country = dest
        canonical_name = ai_data.get("canonical_name") or row["title"]
        places_result = (
            supabase.table("places")
            .select("name, destination, lat, lng, timezone")
            .eq("item_type", row["item_type"])
            .ilike("name", canonical_name)
            .execute()
        )
        place = find_place_match(places_result.data or [], city, country)
        if not place or place.get("lat") is None or place.get("lng") is None:
            missed += 1
            logger.warning(
                "no place match for item %s (title=%r type=%s city=%s)",
                row["id"], row["title"], row["item_type"], city,
            )
            continue

        new_ai_data = {
            **ai_data,
            "lat": place["lat"],
            "lng": place["lng"],
            "timezone": place.get("timezone") or ai_data.get("timezone"),
        }
        supabase.table("plan_items").update({"ai_data": new_ai_data}).eq(
            "id", row["id"]
        ).execute()
        filled += 1
        logger.info(
            "updated %s → lat=%.4f lng=%.4f",
            row["title"], place["lat"], place["lng"],
        )

    logger.info("done — %d filled, %d missed", filled, missed)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print candidate count without writing")
    parser.add_argument("--limit", type=int, default=None, help="max rows to process")
    args = parser.parse_args()

    asyncio.run(backfill(args.dry_run, args.limit))


if __name__ == "__main__":
    main()
