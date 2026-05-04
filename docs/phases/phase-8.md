# Phase 8 — Onboarding + motion polish

**Exit bar**: the app is thesis-defence-ready. Motion is cohesive across every surface; empty states land everywhere; a first-run tour walks new users through the product; mobile is first-class; WCAG AA across all core flows.

## In scope

### Motion pass

- [ ] Full framer-motion audit beyond Phase 2: drag animations (dnd-kit + framer layout), day transitions, map fly-to easing, sheet snap animations, micro-interactions on item add/remove, success flashes on save.
- [ ] Shared-element transitions between dashboard card → plan editor (layout id).
- [ ] Reduced-motion fallbacks verified on every animated surface.

### First-run tour

- [ ] Library choice: `driver.js` or hand-rolled `<TourProvider>`. Decide in-session; prefer hand-rolled if shadcn Popover + Portal is enough.
- [ ] Five-step tour: dashboard → wizard CTA → itinerary sidebar → map → collab indicators.
- [ ] Dismissible; `profiles.tour_completed_at` tracked server-side so repeat devices don't re-tour.

### Empty states everywhere

- [ ] Dashboard sections with no content: illustrated SVG + headline + CTA.
- [ ] Plan with no days.
- [ ] Day with no items.
- [ ] Friends list empty.
- [ ] Comments empty.
- [ ] Activity feed empty.
- [ ] Search no-results.

### Print + PDF export

- [ ] `@media print` CSS — hides nav, collapses cards, one day per page.
- [ ] `Ctrl/Cmd + P` produces a clean printable itinerary with cover image, dates, destinations, per-day items with times.

### Accessibility audit

- [ ] Run `@axe-core/react` — fix all violations.
- [ ] Keyboard-driven DnD end-to-end verified.
- [ ] Map: screen-reader labels on markers and controls; zoom/pan controls reachable by keyboard.
- [ ] Color contrast ≥ 4.5:1 on all text; ≥ 3:1 on UI components.

### Mobile

- [ ] Bottom-sheet map (snap points).
- [ ] Collapsible day sidebar → horizontal scroll chips on small screens.
- [ ] Thumb-friendly tap targets (≥44×44px).
- [ ] Pull-to-refresh on dashboard.

## Out of scope

- Internationalization (stays English-only for thesis).
- Native mobile apps.
- Admin / moderation tooling.

## Verification

- Lighthouse: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, PWA ≥ 90.
- axe-core: 0 violations on `/`, `/plans/[id]`, `/settings/profile`, `/social/friends`.
- New-account first-login triggers the tour once; subsequent logins don't.
- Print preview of a 5-day plan looks clean.
- Keyboard-only run: can create plan → add item → reorder → invite friend → sign out. No mouse.
