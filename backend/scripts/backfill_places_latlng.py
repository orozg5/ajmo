"""One-shot backfill: populate places.lat/lng/timezone for rows pre-Phase-4.

Walks every `places` row where lat or lng is null, geocodes "{name}, {destination}"
via Photon (primary) then Nominatim (fallback), resolves timezone offline via
timezonefinder, and writes the result back. Idempotent: rows already populated
are skipped.

With `--force`, re-geocodes rows whose existing coord falls outside the
resolved country's bbox — used once after Group C landed to clean up stale
bad pins (e.g. "Central Park, Manhattan" geocoded to the wrong continent).

Usage:
    cd backend
    .venv/Scripts/python -m scripts.backfill_places_latlng [--dry-run] [--limit N] [--sleep-ms N] [--force]

Defaults: no limit, 1100ms sleep between rows (respects Nominatim 1 req/s).
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
from app.services.places.country_codes import coord_in_country_bbox, resolve_country_code
from app.services.places.geocoding import (
    close_geocoder_client,
    geocode_with_validation,
    resolve_timezone,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("backfill_latlng")


def row_has_bad_coord(row: dict) -> bool:
    """True when the row's existing coord sits outside its destination's country bbox."""
    lat = row.get("lat")
    lng = row.get("lng")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return False
    country_code = resolve_country_code(row.get("destination") or "")
    if country_code is None:
        return False
    return not coord_in_country_bbox(float(lat), float(lng), country_code)


async def backfill(dry_run: bool, limit: int | None, sleep_ms: int, force: bool) -> None:
    supabase = get_supabase_client()
    if force:
        query = supabase.table("places").select("id, name, destination, lat, lng")
    else:
        query = (
            supabase.table("places")
            .select("id, name, destination, lat, lng")
            .or_("lat.is.null,lng.is.null")
        )
    if limit is not None:
        query = query.limit(limit)

    result = query.execute()
    rows = result.data or []
    if force:
        rows = [r for r in rows if r.get("lat") is None or r.get("lng") is None or row_has_bad_coord(r)]
    if not rows:
        logger.info("no places rows need backfill — nothing to do")
        return

    if dry_run:
        logger.info("[dry-run] would geocode %d places rows", len(rows))
        for row in rows[:20]:
            logger.info("  candidate: id=%s name=%r dest=%r lat=%s lng=%s",
                        row["id"], row["name"], row["destination"], row.get("lat"), row.get("lng"))
        return

    logger.info("backfilling %d places rows (sleep=%dms between calls, force=%s)",
                len(rows), sleep_ms, force)

    filled = 0
    missed = 0
    for row in rows:
        destination = row["destination"]
        country_code = resolve_country_code(destination)
        destination_tokens = [t.strip().lower() for t in destination.split(",") if t.strip()]
        query_text = f"{row['name']}, {destination}"
        geo = await geocode_with_validation(
            query_text,
            country_code=country_code,
            destination_tokens=destination_tokens,
        )
        if geo is None:
            missed += 1
            logger.warning("no geocode result for %r (country=%s)", query_text, country_code)
            await asyncio.sleep(sleep_ms / 1000)
            continue

        tz = resolve_timezone(geo.lat, geo.lng)
        supabase.table("places").update(
            {"lat": geo.lat, "lng": geo.lng, "timezone": tz}
        ).eq("id", row["id"]).execute()
        filled += 1
        logger.info(
            "updated %s (%s) → lat=%.4f lng=%.4f tz=%s source=%s",
            row["name"], destination, geo.lat, geo.lng, tz, geo.source,
        )
        await asyncio.sleep(sleep_ms / 1000)

    logger.info("done — %d filled, %d missed", filled, missed)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print candidate count without writing")
    parser.add_argument("--limit", type=int, default=None, help="max rows to process")
    parser.add_argument(
        "--sleep-ms", type=int, default=1100,
        help="delay between rows in ms (default 1100, respects Nominatim 1 req/s)",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="also re-geocode rows whose existing coord falls outside the country bbox",
    )
    args = parser.parse_args()

    async def runner() -> None:
        try:
            await backfill(args.dry_run, args.limit, args.sleep_ms, args.force)
        finally:
            await close_geocoder_client()

    asyncio.run(runner())


if __name__ == "__main__":
    main()
