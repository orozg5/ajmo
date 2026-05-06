// Yjs document schema for Ajmo plans — mirrors backend/app/services/collab/schema.py.
// Whenever you change this, change the Python side too — the materializer
// reads exactly the keys and field sets defined here.
//
// Scope: items + day notes are the live-edited collab content. The plan_meta
// map is a broadcast mirror only — REST is the source of truth at rest, the
// saving client writes the patch into plan_meta after a successful PATCH so
// other connected clients see the change without refreshing. The materializer
// never reads or writes plan_meta; the seed never populates it.
//
// root (Y.Doc)
// ├── items:     Y.Map<Y.Array<Y.Map>>   day_id → ordered items
// ├── day_notes: Y.Map<string>           day_id → notes text
// └── plan_meta: Y.Map<string|null>      broadcast mirror of editable plan fields

export const ROOT_ITEMS = "items";
export const ROOT_DAY_NOTES = "day_notes";
export const ROOT_PLAN_META = "plan_meta";

export const ITEM_FIELDS = [
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
] as const;

export type ItemField = (typeof ITEM_FIELDS)[number];

export const PLAN_META_FIELDS = [
  "title",
  "description",
  "date_from",
  "date_to",
  "visibility",
  "cover_image_path",
  "cover_image_url",
] as const;

export type PlanMetaField = (typeof PLAN_META_FIELDS)[number];

export type PlanMetaPatch = Partial<Record<PlanMetaField, string | null>>;
