"""One-shot backfill: populate plan_items.sort_key for pre-Phase-3 rows.

Walks every plan_day, sorts its items by current sort_order, then assigns
sequential fractional-indexing keys via generate_key_between(prev, None).
Rows that already have a sort_key are skipped, so the script is idempotent.

Usage:
    cd backend
    .venv/Scripts/python -m scripts.backfill_sort_keys
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from fractional_indexing import generate_key_between

from app.db import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("backfill")


def backfill() -> None:
    supabase = get_supabase_client()
    days_result = supabase.table("plan_days").select("id, plan_id, day_number").execute()
    days = days_result.data or []
    if not days:
        logger.info("no plan_days found — nothing to backfill")
        return

    total_updated = 0
    total_days = 0
    total_skipped = 0

    for day in days:
        day_id = day["id"]
        items_result = (
            supabase.table("plan_items")
            .select("id, sort_key, sort_order")
            .eq("day_id", day_id)
            .execute()
        )
        items = items_result.data or []
        if not items:
            continue

        to_update = [item for item in items if not item.get("sort_key")]
        if not to_update:
            total_skipped += len(items)
            continue

        existing_keys = sorted(
            [item["sort_key"] for item in items if item.get("sort_key")],
        )
        prev_key = existing_keys[-1] if existing_keys else None

        to_update.sort(key=lambda i: i.get("sort_order") or 0)

        total_days += 1
        for item in to_update:
            new_key = generate_key_between(prev_key, None)
            supabase.table("plan_items").update({"sort_key": new_key}).eq(
                "id", item["id"]
            ).execute()
            prev_key = new_key
            total_updated += 1

        logger.info(
            "plan %s day %s — assigned %d new sort_keys",
            day["plan_id"],
            day["day_number"],
            len(to_update),
        )

    logger.info(
        "done — %d items updated across %d days (%d already had sort_key)",
        total_updated,
        total_days,
        total_skipped,
    )


if __name__ == "__main__":
    backfill()
