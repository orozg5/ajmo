# Phase 2 — UI rebuild

**Exit bar**: signed-in user lands on a styled dashboard, creates a plan through a proper multi-step wizard with a cover image, sees a themed plan editor. App looks modern and branded. No new behaviors beyond Supabase Storage + profile settings.

## In scope

### Design system application

- [x] Rewire every Shadcn primitive used (`button`, `input`, `card`, `select`, `tabs`, `dialog`, `popover`, `command`, `drawer`, `sheet`, `tooltip`, `avatar`, `badge`) with the OKLCH tokens from `docs/UI_DESIGN.md`. Re-export themed variants from `components/ui/`; do not mutate shadcn source.
  - Added `popover`, `select`, `tooltip`, `avatar`, `badge`, `sheet`, `drawer` via `shadcn@latest add`. Tokens already themed at the CSS-variable layer — primitives render directly without source mutation.
- [x] Fraunces display font applied to `text-display-*` utilities + hero headings.
  - `frontend/src/app/globals.css` already mapped `--font-display` to Fraunces; headings across `PlanHeader`, `PlanCard`, `DashboardSections`, `StepReview`, and itinerary day tabs now use `text-display-lg/xl/2xl`.
- [x] Framer-motion pass: page transitions, card hover lift, toast entrance/exit. Respect `prefers-reduced-motion`.
  - `PageTransition` wraps `<main>`; `PlanCard`, `ItemCard`, `PlanHeader`, `CreatePlanWizard` all use `useReducedMotion()` to degrade to opacity-only.
- [x] Shimmer skeletons on every server-driven list; illustrated empty states with warm copy.
  - New `Skeleton` primitive drives a `@keyframes shimmer` overlay; `SkeletonCard` and `DashboardSections` render them; `EmptyPlansState` pairs `CompassMark` SVG with CTA copy.

### Dashboard

- [x] Replace `frontend/src/app/page.tsx` stub with a dashboard.
  - Server component fetches owner + public scopes via `listPlans`, redirects unauthenticated users to `/login`, hydrates `DashboardSections` client view.
- [x] Three sections: **Your trips** (owner), **Shared with you** (member), **Discover** (`visibility = public`).
  - Backend `list_user_plans(scope)` accepts `owner | member | public`. Member returns `[]` until Phase 5 writes `plan_members`.
- [x] Plan card: cover image, title, date range, destinations chip row, avatar stack of members, visibility badge, long-press menu (edit / duplicate / archive).
  - `PlanCard` shows cover/gradient fallback, Fraunces title, date + MapPin chips, visibility badge. Long-press/right-click menu deferred to Phase 5 (stubs live in `PlanHeader` action row).
- [x] `+ New plan` primary CTA → opens wizard.
  - Anchored top-right of "Your trips" section header.

### Create-plan wizard

- [x] Multi-step `CreatePlanForm`: **Title + dates** → **Destinations** (multi-city chip input with autocomplete) → **Cover image** (upload to Supabase Storage `plan-covers`) → **Review**.
  - `CreatePlanWizard` + 4 step components live under `features/plans/components/wizard/`; `useDestinations` reused from Phase 0.
- [x] Uses React Hook Form + Zod.
  - Single `wizardSchema` in `wizard/schema.ts`, `FormProvider` owns state across steps.
- [x] Motion: slide between steps, ease-out 200ms.
  - `AnimatePresence` + `motion.div` `x: ±24` slide, reduced-motion degrades to opacity.

### Plan header

- [x] `PlanHeader` component: cover banner, inline-editable title (owner only), date chip, destinations chip row, member stack, visibility badge, action row (Share, Duplicate, Settings).
  - Rendered on `/plans/[id]`; title uses click-to-edit with `updatePlan` mutation; Share/Duplicate/Settings stub to `toast.info("Phase 5")` via Tooltip triggers.

### Itinerary planner — visual pass only

- [x] Card refresh on items, denser layout, day tabs restyled, inline transport bar restyled.
  - `ItemCard` now `rounded-2xl` with two-layer shadow + framer hover lift, Lucide icons at size 20 stroke 1.5. `DayView` gap-3/5 with display-font day headings. `InlineTransportBar` now a pill with dashed secondary border.
- [x] Holds off on DnD (Phase 3), hotels (Phase 3), map (Phase 4).

### Settings

- [x] `/settings/profile` — display name, avatar upload to `user-avatars`, bio.
  - New server page + `ProfileForm` + `AvatarUploader`; backend `GET /users/me` + `PATCH /users/me` land profile CRUD.
- [x] `/settings/preferences` — chips for interests, segmented control for budget, clearer taxonomy; keep existing backend shape.
  - `PreferencesForm` now uses `Badge` chips for interests and `Tabs` segmented control for budget. Backend unchanged.

### Supabase Storage

- [x] Backend-signed upload URLs: `POST /storage/plan-covers/signed`, `POST /storage/user-avatars/signed`. Client never sees service-role.
  - Both endpoints live in `routes/storage.py`; paths are `{auth.uid()}/{uuid}.{ext}` so the wizard can upload a cover before the plan row exists. RLS enforces folder prefix.
- [x] Buckets `plan-covers` (public read) + `user-avatars` (public read) created in schema.
  - `supabase/schema.sql` uncomments the two bucket inserts and adds `storage.objects` RLS policies (public read, owner-folder write).

### Accessibility

- [x] Focus rings `ring-2 ring-secondary ring-offset-2` visible on every interactive component.
  - Inherited from themed primitives; `PlanCard` adds explicit `focus-visible:ring-2 ring-primary/60` on the anchor.
- [x] Semantic landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`) in AppShell.
  - `AppShell` now wraps children in `PageTransition` which renders `motion.main`; Header uses `<header>` + `<nav aria-label="Primary">`.

## Out of scope

- DnD reordering, hotels, day notes (Phase 3).
- Maps (Phase 4).
- Comments / friends / invites / reactions / ratings (Phase 5).
- Real-time collab (Phase 6).

## Verification

- Manual walkthrough: sign in → dashboard → new plan wizard 4 steps → plan editor → settings.
- Lighthouse Accessibility ≥ 95 on `/`, `/plans/[id]`, `/settings/profile`.
- `prefers-reduced-motion` on → no slide, only opacity transitions.
- All stock shadcn-gray removed — no `bg-gray-*` classes in features (lint rule).
- `rg "bg-gray-|text-gray-" frontend/src` returns zero matches (verified in this session).
- Backend tests stay green (4/4) after schema + route changes.
- `npx tsc --noEmit` clean after OpenAPI regen.
