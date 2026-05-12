// Yjs document schema for Ajmo plans — mirrors backend/app/services/collab/schema.py.
// Whenever you change this, change the Python side too — the materializer
// reads exactly the keys and field sets defined here.
//
// Scope: live-edited collaborative content. ADR 2026-05-06 (revised) extends
// the Y.Doc beyond items/day_notes to include likes, ratings, and comments —
// they need the same sub-100ms propagation as notes, and Hocuspocus awareness
// (presence, typing) is the natural carrier for the cursor-style UX. The
// plan_meta map is a broadcast mirror only — REST is the source of truth at
// rest for plan title/dates/cover, the saving client writes the patch into
// plan_meta after a successful PATCH so other connected clients see the
// change without refreshing. The materializer never reads or writes
// plan_meta; the seed never populates it.
//
// root (Y.Doc)
// ├── items:     Y.Map<Y.Array<Y.Map>>      day_id → ordered items
// │                                         each item map's `notes` field is a Y.Text (see Phase 7f)
// ├── day_notes: Y.Map<Y.Text>              day_id → free-text notes for the day
// ├── plan_meta: Y.Map<string|null>         broadcast mirror of editable plan fields
// ├── likes:     Y.Map<Y.Map<true>>         item_id → user_id → present-iff-liked
// ├── ratings:   Y.Map<Y.Map<number>>       item_id → user_id → 1..5
// └── comments:  Y.Array<Y.Map>             flat list of comment rows; thread by parent_id
//
// `day_notes` and item-level `notes` used to be plain strings (`Y.Map.set("notes", str)`).
// As of Phase 7f they're `Y.Text` so that two collaborators editing the same note from
// different network sides both have their typing land instead of one silently winning by
// Lamport clock. Read paths (frontend hooks, backend materializer/seed) tolerate both
// shapes during the rollout window — legacy plans whose yjs_state predates the migration
// still work, and the first write upgrades the slot to a Y.Text.

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

// Comment fields stored on each Y.Map inside ROOT_COMMENTS. Mirrors the
// `plan_comments` table; `id` is a UUID generated client-side at post time so
// the row stays stable across reorders (none today, but keeps the option) and
// the materializer can upsert by id without round-tripping the DB to allocate
// it.
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

// Awareness state shape — what each connected client publishes via
// provider.awareness.setLocalState. Other clients subscribe via
// `awareness.on('change', ...)`. This is ephemeral (does NOT persist via the
// Hocuspocus database extension), and the materializer ignores it.
//
// `editing` is the only "where is this user right now" signal — it's set
// only when the local user has focus on a free-text editing surface
// (day notes, item notes, chat composer, item-comment composer). Hover or
// idle viewing intentionally does not publish presence; that was too noisy
// in practice (UX feedback 2026-05-06).
export interface AwarenessUser {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export type EditingKind = "day_notes" | "item_notes" | "chat" | "item_comment";

export interface EditingTarget {
  kind: EditingKind;
  id: string; // dayId | itemId | "plan" (for chat) | itemId (for item_comment)
}

export interface AwarenessState {
  user: AwarenessUser;
  editing: EditingTarget | null;
}
