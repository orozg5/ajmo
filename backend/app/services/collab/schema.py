"""Yjs document schema for Ajmo plans.

The same schema lives in `frontend/src/lib/yjs/schema.ts`. Whenever you change
either side, change both — the materializer assumes the field set defined
here is exactly what the frontend writes.

Scope: live-collaborative content. ADR 2026-05-06 (revised) extends the Y.Doc
beyond items + day_notes to include likes, ratings, and comments — those
surfaces need the same sub-100ms propagation as notes, and Hocuspocus
awareness is the natural carrier for presence (focused item) + typing flags.
The plan skeleton (days, destinations) and hotels stay REST-driven.
Plan-meta is REST-driven *at rest* but mirrored into a `plan_meta` Y.Map
purely as a broadcast channel; the materializer never reads or writes that
root.

```
root (Y.Doc)
├── items:      Y.Map<Y.Array<Y.Map>>  # day_id → ordered list of items
├── day_notes:  Y.Map<string>          # day_id → notes text
├── plan_meta:  Y.Map<string|null>     # broadcast mirror of plan title/dates/cover/visibility
├── likes:      Y.Map<Y.Map<bool>>     # item_id → user_id → True (presence == liked)
├── ratings:    Y.Map<Y.Map<int>>      # item_id → user_id → stars 1..5
└── comments:   Y.Array<Y.Map>         # flat list; thread by parent_id; soft-delete via deleted_at
```
"""
from __future__ import annotations

ROOT_ITEMS = "items"
ROOT_DAY_NOTES = "day_notes"
ROOT_PLAN_META = "plan_meta"
ROOT_LIKES = "likes"
ROOT_RATINGS = "ratings"
ROOT_COMMENTS = "comments"

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

COMMENT_FIELDS = (
    "id",
    "plan_item_id",
    "parent_id",
    "author_id",
    "body",
    "created_at",
    "updated_at",
    "deleted_at",
)
