// Mirrors backend/app/services/collab/schema.py — change both sides together; the materializer reads exactly these keys.
//
// `day_notes` and item-level `notes` are `Y.Text` so concurrent edits merge instead of last-writer-wins. Pre-Phase-7f plans still hold plain strings in these slots; read paths tolerate both shapes and the first write upgrades the slot to a Y.Text.

export const ROOT_ITEMS = "items";
export const ROOT_DAY_NOTES = "day_notes";
export const ROOT_PLAN_META = "plan_meta";
export const ROOT_LIKES = "likes";
export const ROOT_RATINGS = "ratings";
export const ROOT_COMMENTS = "comments";

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

// `id` is generated client-side at post time so the materializer can upsert by id without a DB round-trip to allocate one.
export const COMMENT_FIELDS = [
  "id",
  "plan_item_id",
  "parent_id",
  "author_id",
  "body",
  "created_at",
  "updated_at",
  "deleted_at",
] as const;

export type CommentField = (typeof COMMENT_FIELDS)[number];

// Awareness is ephemeral (not persisted, materializer ignores it). `editing` is set only on focus of a free-text surface — hover/idle viewing intentionally does not publish presence (too noisy in practice).
export interface AwarenessUser {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export type EditingKind = "day_notes" | "item_notes" | "chat" | "item_comment";

export interface EditingTarget {
  kind: EditingKind;
  id: string;
}

export interface AwarenessState {
  user: AwarenessUser;
  editing: EditingTarget | null;
}
