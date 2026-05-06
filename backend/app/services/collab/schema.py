"""Yjs document schema for Ajmo plans.

The same schema lives in `frontend/src/lib/yjs/schema.ts`. Whenever you change
either side, change both — the materializer assumes the field set defined
here is exactly what the frontend writes.

Scope: only the live-edited content lives in Yjs. The plan skeleton (days,
destinations) and hotels are REST-driven. Plan-meta is REST-driven *at rest*
but mirrored into a `plan_meta` Y.Map purely as a broadcast channel so
collaborators see title/date/cover changes without refreshing — the
materializer never reads or writes that root.

```
root (Y.Doc)
├── items:      Y.Map<Y.Array<Y.Map>>  # day_id → ordered list of items
├── day_notes:  Y.Map<string>          # day_id → notes text
└── plan_meta:  Y.Map<string|null>     # broadcast mirror of plan title/dates/cover/visibility
```
"""
from __future__ import annotations

ROOT_ITEMS = "items"
ROOT_DAY_NOTES = "day_notes"
ROOT_PLAN_META = "plan_meta"

ITEM_FIELDS = (
    "id",
    "day_id",
    "destination_id",
    "place_id",
    "added_by",
    "item_type",
    "title",
    "notes",
    "location",
    "start_time",
    "end_time",
    "duration_minutes",
    "sort_key",
    "sort_order",
    "ai_data",
)

PLAN_META_FIELDS = (
    "title",
    "description",
    "date_from",
    "date_to",
    "visibility",
    "cover_image_path",
    "cover_image_url",
)
