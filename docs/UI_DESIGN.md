# UI Design

## Palette (OKLCH)

```
--primary        oklch(0.67 0.17 45)    terracotta — CTAs, active
--secondary      oklch(0.62 0.14 235)   cobalt — links, focus rings
--accent         oklch(0.78 0.12 75)    amber — highlights, badges
--surface        oklch(0.95 0.03 85)    sand — card bg
--muted          oklch(0.92 0.02 85)    subtle surface
--ink            oklch(0.20 0.02 260)   text
--ink-subtle     oklch(0.46 0.02 260)   muted text
--border         oklch(0.88 0.02 85)
--destructive    oklch(0.57 0.20 25)    red-orange
```

Dark mode: mirror L values, drop chroma ~20%. Keep hue identical for brand consistency.

## Typography

- **Body + UI**: Geist Sans (variable).
- **Code**: Geist Mono.
- **Display**: Fraunces (variable serif, optical sizing) — used for headings, hero numerals, marketing surfaces. Via `next/font/google`.

Scale (Tailwind-compatible):
- `text-display-2xl` 4.5rem / 4.75rem / serif / opsz 144.
- `text-display-xl` 3.5rem / 3.75rem.
- `text-display-lg` 2.5rem / 2.75rem.
- `text-xl` 1.25rem / 1.75rem — section headings.
- `text-base` 1rem / 1.5rem — body.
- `text-sm` 0.875rem / 1.25rem — meta.
- `text-xs` 0.75rem / 1rem — labels.

## Motion

- Library: `framer-motion`.
- Durations: 150-250ms default, 350ms for page transitions.
- Easings: `ease-out` for entrance, `ease-in` for exit, custom bezier for drag.
- Respect `prefers-reduced-motion` — fall back to opacity-only transitions.

## Density + surfaces

- Cards: `rounded-2xl`, two-layer shadow (`shadow-sm` stack with longer second layer).
- Gaps: 4px (tight), 8px, 12px (default), 16px, 24px, 32px (section break).
- Corner radii token: `--radius-sm 8px`, `--radius 12px`, `--radius-lg 20px`, `--radius-xl 28px`.

## Icons

- Lucide only (already in deps). No mixing.
- Sizes: 16 / 20 / 24 / 32. Stroke 1.5 default.

## Loading + empty states

- Skeletons: shimmer on `bg-muted` with animated gradient. Always visible on any server-driven surface.
- Empty states: inline SVG illustration + headline + 1-line body + primary CTA. Warm copy ("No plans yet — let's go somewhere").

## Toasts

- `sonner` top-right. Themed `--primary` success, `--destructive` error.
- Duration 4s default; 8s for error.
- Dismissible.

## Errors

- App-level `<ErrorBoundary />` with branded fallback (Fraunces heading, reload CTA).
- Per-route boundaries for each top-level route.

## Focus rings

- `ring-2 ring-secondary ring-offset-2 ring-offset-background`.

## Wireframes (ASCII)

### Dashboard

```
┌────────────────────────────────────────────────────────────────┐
│ Ajmo  [logo]                        Plans  Friends  [avatar]   │ header
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   Your trips                                     [+ New plan]  │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│   │ cover    │ │ cover    │ │ cover    │                       │
│   │          │ │          │ │          │                       │
│   │ Title    │ │ Title    │ │ Title    │                       │
│   │ dates    │ │ dates    │ │ dates    │                       │
│   │ 👥👥👥   │ │ 👥👥     │ │ 👥       │                       │
│   └──────────┘ └──────────┘ └──────────┘                       │
│                                                                │
│   Shared with you                                              │
│   ┌──────────┐ ┌──────────┐                                    │
│   └──────────┘ └──────────┘                                    │
│                                                                │
│   Discover                                                     │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│   └──────────┘ └──────────┘ └──────────┘                       │
└────────────────────────────────────────────────────────────────┘
```

### Plan editor

```
┌────────────────────────────────────────────────────────────────┐
│ header                                                         │
├───────────┬──────────────────────────────────┬─────────────────┤
│ Days      │                                  │                 │
│ Day 1 ●   │  Day 1 — Fri, Apr 19             │      MAP        │
│ Day 2     │  ─────────────────────────────── │                 │
│ Day 3     │  Rome, Italy                     │   [pins]        │
│ Day 4     │   ┌─────────────────────────┐    │                 │
│           │   │ Colosseum    9:00 · €16 │    │                 │
│ [+ Hotel] │   └─────────────────────────┘    │                 │
│ [+ Day]   │   [walk 8 min · free]            │                 │
│           │   ┌─────────────────────────┐    │                 │
│ notes...  │   │ Roman Forum            │    │                 │
│           │   └─────────────────────────┘    │                 │
│           │   + add                          │                 │
│           │                                  │                 │
│           │  Naples, Italy                   │                 │
│           │   [train 1h · €12]               │                 │
│           │   ┌─────────────────────────┐    │                 │
│           │   │ Castel dell'Ovo        │    │                 │
│           │   └─────────────────────────┘    │                 │
└───────────┴──────────────────────────────────┴─────────────────┘
```
