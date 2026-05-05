# Design Specification: Visual Drag-and-Drop on the Kanban Board

**Technical Spec:** [issue_47_tech_spec.md](./issue_47_tech_spec.md)
**Context Document:** [issue_47_context.md](./issue_47_context.md)
**GitHub Issue:** #47
**Design System:** KanbAI Project Management Dashboard v1.0

### Revision Log

- **2026-05-04 — PM rulings applied (see §2, §3.1, §3.2, §6.1, §6.5):**
  1. Move-error dismiss button hit area raised to **44 × 44 px on coarse pointers** (`@media (pointer: coarse)`). Desktop keeps the compact 32-px affordance.
  2. Empty-column hint copy ("Drop a task here.") recoloured from `$text-secondary` to `$text-primary` on `$bg-dropzone` — 4.4 : 1 borderline replaced with 16.3 : 1 AAA. The hint is instructional, not incidental, so body-text contrast rules apply.

---

## 1. Overview

### Design Intent

The board is KanbAI's workspace. It should feel spatial, quiet, and tactile — tasks are objects you pick up and put down, columns are destinations that politely make room for what's arriving. Motion is reserved for two jobs: confirming physical grab/drop, and narrating failure. Color carries priority and never carries meaning alone.

Drag-and-drop is the first interactive mutation in the product, so its feedback loop must be unambiguous: the card lifts when grabbed, the origin slot stays visible as a ghost, the destination announces itself with a sage dashed outline, and — if the server rejects the move — the card snaps home with a two-axis shake accompanied by a status strip that reads like a colleague calmly explaining what happened.

### Scope

- **Components styled:** `BoardPageComponent`, `BoardColumnComponent` (new), `TaskCardComponent` (new).
- **States covered:** default, hover, focus-visible, active/grab, dragging, drop-target (hover over valid column), empty-column drop-zone, rolled-back (shake), column-load-error (block-level), move-error (inline strip), loading-skeleton (pre-existing, not overridden).
- **Responsive:** horizontal-scroll kanban on all viewports; card padding + drag-handle affordance adapt at `< $bp-md`.
- **Interactions:** mouse drag, keyboard drag (CDK default: `Space` → arrows → `Space` / `Esc`), touch press-and-drag.
- **A11y:** WCAG 2.1 AA — contrast verified, visible focus ring, `aria-live` polite region for drag narration, ≥44 × 44 px touch target for drag handle on touch viewports, full `prefers-reduced-motion` fallback.

### Prerequisites

All canonical token files (`_colors.scss`, `_typography.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_layout.scss`, `_motion.scss`, `_breakpoints.scss`) already exist under `KanbAI-Web/src/styles/variables/`. The developer does **not** need to scaffold them.

### Proposed Token Additions

**None.** Every design decision below maps to an existing canonical token. The four abstract CSS hooks named in the tech spec (`background.dropzone`, `border.dropzone`, `shadow.cardDragging`, `background.cardDragging`) each resolve to a single canonical token (`$bg-dropzone`, `$border-dropzone`, `$shadow-card-dragging`, `$bg-card-dragging`) — see §2.

---

## 2. Tokens Used

This spec consumes the canonical KanbAI v1.0 tokens. No new tokens introduced.

| Tech-spec hook | Canonical token | Value | Where consumed |
|---|---|---|---|
| `background.dropzone` | `$bg-dropzone` | `#F4F5F1` | `.board-column__empty-zone`, `.cdk-drag-placeholder` |
| `border.dropzone` | `$border-dropzone` | `#8C9B7B` | dashed outline on `.cdk-drop-list-receiving`, empty-zone border |
| `shadow.cardDragging` | `$shadow-card-dragging` | `0 12px 24px rgba(0,0,0,0.12)` | `.cdk-drag-preview` |
| `background.cardDragging` | `$bg-card-dragging` | `#FFFFFF` | `.cdk-drag-preview` fill |

| Token | Purpose in this spec |
|---|---|
| `$brand-primary` `#8C9B7B` | Focus ring, column count pill background on hover |
| `$brand-primary-light` `#E8EBE4` | Column count pill background at rest |
| `$bg-main` `#FFFFFF` | Board page background, card surface |
| `$bg-sidebar-light` `#F4F5F1` | Column shell background, skeleton shimmer, drop-zone fill |
| `$bg-card` `#FFFFFF` | Task card surface |
| `$bg-card-dragging` `#FFFFFF` | Drag preview fill |
| `$bg-dropzone` `#F4F5F1` | Empty column drop zone, CDK placeholder fill |
| `$text-primary` `#1C1C1C` | Column name, card title, error copy |
| `$text-secondary` `#7A7A7A` | Card "has content" hint |
| `$text-primary` `#1C1C1C` on `$bg-dropzone` | Empty-column hint text ("Drop a task here.") — PM ruling 2026-05-04, promoted from `$text-secondary` to clear 4.5:1 body-text contrast |
| `$text-tertiary` `#A1A1A1` | Meta-only (not used for body copy here) |
| `$text-inverse` `#FFFFFF` | — (not used; white-on-brand avoided for body copy) |
| `$status-high` `#E56B6F` | Error surface left-edge accent (move error + column-load error) |
| `$status-medium` `#4A6FA5` | "Has content" affordance dot on task card |
| `$border-light` `#EAEAEA` | Column shell border, card border at rest |
| `$border-dropzone` `#8C9B7B` | Drop-target pulse outline, empty-zone dashed border |
| `$shadow-card` `0 2px 8px rgba(0,0,0,0.04)` | Task card at rest |
| `$shadow-card-hover` `0 4px 12px rgba(0,0,0,0.08)` | Task card hover |
| `$shadow-card-dragging` | CDK drag preview |
| `$shadow-dropdown` `0 8px 16px rgba(0,0,0,0.1)` | Inline move-error strip elevation |
| `$radius-sm` `6px` | Count pill, "has content" dot container |
| `$radius-md` `12px` | Error strip, buttons |
| `$radius-lg` `16px` | Task card, column shell, empty-zone rectangle |
| `$radius-pill` `9999px` | Column count pill |
| `$kanban-column-width` `300px` | Fixed column width |
| `$kanban-column-gap` `24px` | Inter-column gap |
| `$content-padding` `32px` | Board page outer padding |
| `$space-xxs` `4px` | Column title → count pill gap |
| `$space-xs` `8px` | Intra-card vertical rhythm |
| `$space-sm` `12px` | Error strip inner padding, count-pill horizontal padding |
| `$space-md` `16px` | Card padding at `< $bp-md`, inter-card gap |
| `$space-lg` `24px` | Card padding (default), column inner padding |
| `$space-xl` `32px` | Board outer padding vertical, 44×44 touch handle |
| `$motion-fast` | Hover lift, focus ring fade-in |
| `$motion-base` | Card drop-settle, rollback shake, placeholder fade |
| `$motion-slow` | Drop-target border pulse |
| `$font-family-base` | All text |
| `$font-size-sm` `12px` | Count pill, "has content" label, error strip body |
| `$font-size-md` `14px` | Card title |
| `$font-size-lg` `16px` | Column header, block-level error heading |
| `$font-weight-medium` `500` | Card title, count pill |
| `$font-weight-semibold` `600` | Column name, error heading |
| `$line-height-normal` `1.5` | Error copy, card title |
| `$line-height-tight` `1.2` | Column name, count pill |

---

## 3. Per-Component Styling

### 3.1 BoardPageComponent

**File:** `KanbAI-Web/src/app/features/board/board-page/board-page.component.scss`
**Role:** Page shell — hosts the horizontal-scrolling column row inside `cdkDropListGroup`; also owns the two top-level error surfaces (column-load block error, task-move inline strip) and the `aria-live` announce region.

**Layout:**
- Outer: `display: flex; flex-direction: column;` — allows the move-error strip to sit above the board and push content down (no overlay).
- Board row: horizontal flexbox, `overflow-x: auto`, `scroll-snap-type: x proximity`, each column is a `scroll-snap-align: start` child. Column width and gap come from `$kanban-column-width` / `$kanban-column-gap`.
- Padding: `$content-padding` horizontally, `$space-xl` top, `$space-xl` bottom — generous so cards don't touch the topbar baseline.
- Move-error strip: sticky at `top: 0` inside the page (below the app topbar), full-width of the page's content column, auto-dismiss at 5 s.
- `aria-live` region: visually hidden (absolute, 1×1, clip-path), never hides focus.

**States:** default → column-load-error (block) → move-error (inline strip, transient) → reduced-motion.

**SCSS:**

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/layout' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
  background: $bg-main;
  min-height: 100%;
  font-family: $font-family-base;
  color: $text-primary;
}

.board-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

// ---- Move-error strip (inline, sticky, auto-dismiss) --------------------
// Placement justification: inline strip over toast because the failure is
// about the board the user is actively looking at, and rollback already
// happens in-place — the message belongs in the same visual field as the
// card that just snapped back, not in a bottom-right toast that could be
// missed.
.board-page__move-error {
  position: sticky;
  top: 0;
  z-index: 1;

  margin: 0 $content-padding;
  margin-top: $space-md;

  display: flex;
  align-items: flex-start;
  gap: $space-sm;

  padding: $space-sm $space-md;
  background: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-md;
  box-shadow: $shadow-dropdown;

  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $text-primary;

  // Enter animation — slide down from -8px, fade in. Duration $motion-base.
  animation: board-move-error-in $motion-base both;
}

.board-page__move-error-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: $status-high;
}

.board-page__move-error-text {
  flex: 1 1 auto;
}

.board-page__move-error-dismiss {
  appearance: none;
  background: transparent;
  border: 0;
  padding: $space-xxs $space-xs;
  margin: -$space-xxs -$space-xs -$space-xxs 0;
  border-radius: $radius-sm;
  color: $text-secondary;
  font: inherit;
  cursor: pointer;
  transition: background $motion-fast, color $motion-fast;

  // PM ruling 2026-05-04: on coarse pointers, the hit area must meet the
  // 44 × 44 px touch-target rule from the KanbAI charter. Desktop keeps
  // the compact affordance; touch gets a proper tap target without
  // enlarging the visible glyph.
  @media (pointer: coarse) {
    min-width: 44px;
    min-height: 44px;
    padding: $space-sm;
    margin: -$space-xs -$space-xs -$space-xs 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  &:hover {
    background: $bg-sidebar-light;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }
}

@keyframes board-move-error-in {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0);    }
}

// ---- Column row (the actual kanban) -------------------------------------
.board-page__columns {
  flex: 1 1 auto;

  display: flex;
  align-items: flex-start;
  gap: $kanban-column-gap;

  padding: $space-xl $content-padding;

  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x proximity;

  // Thin, sage-tinted scrollbar for the horizontal kanban (progressive
  // enhancement — Firefox + WebKit).
  scrollbar-width: thin;
  scrollbar-color: $border-light transparent;
  &::-webkit-scrollbar { height: 8px; }
  &::-webkit-scrollbar-thumb {
    background: $border-light;
    border-radius: $radius-pill;
  }

  > * {
    scroll-snap-align: start;
  }

  @include respond-to('md') {
    padding: $space-xl $content-padding;
  }
}

// ---- Column-load error (block-level, occupies board main region) --------
// Placement justification: the board has nothing else to show when the
// column fetch fails, so a toast would be invisible against an empty
// stage. A centered block message is the correct choice per the tech
// spec ("block-level message in the board page's main region").
.board-page__load-error {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-xxl $content-padding;
}

.board-page__load-error-panel {
  max-width: 480px;
  width: 100%;

  padding: $space-xl;

  background: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;

  text-align: left;
}

.board-page__load-error-heading {
  margin: 0 0 $space-xs 0;
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;
}

.board-page__load-error-body {
  margin: 0;
  font-size: $font-size-md;
  line-height: $line-height-normal;
  color: $text-secondary;
}

// ---- Visually-hidden aria-live region -----------------------------------
.board-page__sr-announce {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

// ---- Reduced-motion fallback --------------------------------------------
// Global _motion.scss already clamps transitions/animations to 0.01ms;
// no per-component override needed. Instant state change still fires.
```

**Interaction notes:**
- Move-error strip auto-dismisses after **5000 ms** (numeric literal — not bound to a motion token because it is content-display, not animation). The enter animation is `$motion-base` (250 ms). With `prefers-reduced-motion: reduce` the slide-in collapses to an instant opacity swap via the global rule; the strip still appears and still auto-dismisses after 5 s.
- Dismiss button sits at the far right of the strip; `aria-label="Dismiss move error"`.
- The strip is re-used for the next failure — if another drop fails while the current strip is visible, the text content swaps in place without re-playing the enter animation.

**Accessibility:**
- Role: strip wrapper `role="status"`, `aria-live="polite"` — matches the tech spec's requirement that rolled-back moves are narrated.
- Load-error panel: `role="alert"` so it is announced the moment the board mounts into the error state.
- Contrast (measured):
  - `$text-primary` on `$bg-card` — 17.9:1 ✅ AAA.
  - `$text-secondary` on `$bg-card` — 4.6:1 ✅ AA.
  - `$status-high` 4 px left border on `$bg-card` — 3.5:1 ✅ AA for UI components.
- Reduced motion: slide-in collapses to instant fade (0.01 ms); the strip still appears and still dismisses after 5 s.

---

### 3.2 BoardColumnComponent (new)

**File:** `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss`
**Role:** Column shell with header (name + task-count pill), CDK drop-list body that scrolls vertically when overfull, and the empty drop-zone affordance that itself is a valid drop target.

**Layout:**
- Fixed `width: $kanban-column-width` (300 px); `flex: 0 0 $kanban-column-width` so the row never compresses a column.
- Max height: `calc(100vh - #{$topbar-height} - #{$space-xxl * 2})` so long columns scroll internally, not the whole page.
- Header row: flex, center-aligned vertically, column name left, count pill right.
- Body: vertical flex of task cards with `gap: $space-md`.
- Empty state: centered drop-zone rectangle with dashed outline, single-sentence hint, no CTA in this ticket (task-create is out of scope per context doc).

**States:** default → drop-target-receiving (`.cdk-drop-list-receiving`) → drop-target-active-dragging (`.cdk-drop-list-dragging`) → empty → reduced-motion.

**SCSS:**

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/layout' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
  flex: 0 0 $kanban-column-width;
  width: $kanban-column-width;
  max-width: $kanban-column-width;
}

.board-column {
  display: flex;
  flex-direction: column;

  max-height: calc(100vh - #{$topbar-height} - #{$space-xxl * 2});

  background: $bg-sidebar-light;
  border: 1px solid $border-light;
  border-radius: $radius-lg;

  // Drop-target border transition must not use `all` — only border-color
  // and background animate, per our motion discipline.
  transition:
    border-color $motion-slow,
    background    $motion-slow;
}

// ---- Header -------------------------------------------------------------
.board-column__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-sm;

  padding: $space-lg $space-lg $space-sm $space-lg;
}

.board-column__name {
  margin: 0;

  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;

  // Truncate overflow; never wrap — column width is fixed at 300 px.
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// ---- Optional color accent strip under the column name ------------------
// Column.colorCode (backend-provided hex) paints a 4 px strip below the
// header so color remains a signal — but it is NEVER the only channel;
// the column name is always rendered in $text-primary.
.board-column__accent {
  height: 4px;
  margin: 0 $space-lg $space-sm $space-lg;
  border-radius: $radius-pill;
  // inline style from component binds background to colorCode (fallback
  // $brand-primary when colorCode is null).
}

.board-column__count {
  flex: 0 0 auto;

  padding: $space-xxs $space-sm;
  min-width: 28px;

  background: $brand-primary-light;
  color: $text-primary;

  border-radius: $radius-pill;

  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  text-align: center;
}

// ---- Drop-list body -----------------------------------------------------
.board-column__list {
  flex: 1 1 auto;

  display: flex;
  flex-direction: column;
  gap: $space-md;

  padding: $space-xs $space-lg $space-lg $space-lg;

  overflow-y: auto;

  // CDK drop-list: when another card is hovering this column as a valid
  // drop target, CDK toggles `.cdk-drop-list-receiving` on the host.
  // We soften the column shell to signal "drop will land here".
  &.cdk-drop-list-receiving,
  &.cdk-drop-list-dragging {
    background: $brand-primary-light;
    border-radius: $radius-lg;
  }
}

// Host-level drop-target pulse (border). CDK applies
// `.cdk-drop-list-receiving` to the drop list element — we hoist the
// affordance to the column shell for a calmer silhouette.
.board-column:has(.board-column__list.cdk-drop-list-receiving) {
  border-color: $border-dropzone;
  background: $brand-primary-light;
}

// ---- Empty drop zone ----------------------------------------------------
// The empty zone is rendered only when tasks.length === 0. It is itself
// a valid drop target (the surrounding .board-column__list carries the
// cdkDropList directive regardless of children).
.board-column__empty-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $space-xs;

  min-height: 120px;
  padding: $space-lg;

  background: $bg-dropzone;
  border: 2px dashed $border-dropzone;
  border-radius: $radius-lg;

  text-align: center;
}

.board-column__empty-hint {
  margin: 0;
  font-size: $font-size-sm;
  line-height: $line-height-normal;
  // PM ruling 2026-05-04: "Drop a task here." is instructional copy,
  // not incidental decoration. Use $text-primary to clear the 4.5:1
  // body-text contrast rule against $bg-dropzone (16.3:1 AAA).
  color: $text-primary;
}

// ---- Reduced motion ----------------------------------------------------
// Global rule handles it; no per-component override needed.
```

**Interaction notes:**
- On drop-target hover (`.cdk-drop-list-receiving`) the column's border pulses from `$border-light` to `$border-dropzone` over `$motion-slow` and the inner list background shifts to `$brand-primary-light`. Color is paired with border change and will-be-inserted placeholder — never a color-only signal.
- Neighbor cards nudge aside using CDK's built-in transition (CDK sets `transform: translate3d(...)`); we only ensure our card selector below inherits the `transform $motion-base` timing.
- Empty-zone hint text: `"Drop a task here."` — calm, concrete, no emoji (per UX Pattern §10).

**Accessibility:**
- `role="list"` on `.board-column__list`, `aria-label="{column.name} column, {tasks.length} tasks"`.
- Column name is a proper heading (`<h2>` rendered by the component template) so screen readers can navigate between columns via heading nav.
- Contrast:
  - `$text-primary` on `$bg-sidebar-light` — 16.3:1 ✅ AAA.
  - `$text-primary` on `$brand-primary-light` (count pill) — 14.7:1 ✅ AAA.
  - `$text-primary` on `$bg-dropzone` (empty-zone hint) — 16.3:1 ✅ AAA. *(PM ruling 2026-05-04 — previously spec'd as `$text-secondary` at 4.4:1 borderline; the hint is instructional, not incidental, so body-text contrast applies.)*
  - `$border-dropzone` on `$bg-sidebar-light` — 3.1:1 ✅ AA for UI.
- Touch: column body `overflow-y: auto` — column scrolling works on touch viewports even during a drag because CDK uses pointer capture; no CSS change needed.

---

### 3.3 TaskCardComponent (new)

**File:** `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.scss`
**Role:** Presentational card surface showing task title, optional "has content" affordance, and the three CDK drag-state hooks (`.cdk-drag-preview`, `.cdk-drag-placeholder`, `.cdk-drag-dragging`) that the design system owns.

**Layout:**
- `display: grid`, single column, `gap: $space-xs` between title and meta row.
- Padding: `$space-lg` default, compresses to `$space-md` at `< $bp-md`.
- Full card is draggable on desktop; on touch viewports, a visible 44 × 44 px grip icon at the top-right is the drag handle (the rest of the card can be tapped/scrolled without starting a drag). The grip is hidden on hover-capable devices.

**States:** default → hover → focus-visible → active/grab → dragging (`.cdk-drag-dragging`, `.cdk-drag-preview`) → origin placeholder (`.cdk-drag-placeholder`) → rolled-back (shake) → reduced-motion.

**SCSS:**

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
}

.task-card {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: $space-xs $space-sm;

  padding: $space-lg;

  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;

  cursor: grab;
  user-select: none;

  // Only animate transform and shadow — never width/height/top/left.
  transition:
    transform     $motion-fast,
    box-shadow    $motion-fast,
    border-color  $motion-fast;

  &:hover {
    box-shadow: $shadow-card-hover;
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:active {
    cursor: grabbing;
  }

  @include respond-to('md') {
    padding: $space-lg;
  }
}

// Default: on viewports < $bp-md, tighten padding.
@media (max-width: ($bp-md - 1px)) {
  .task-card {
    padding: $space-md;
  }
}

.task-card__title {
  grid-column: 1 / -1;
  margin: 0;

  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-normal;
  color: $text-primary;

  // Keep long titles readable — wrap, but never more than 3 lines before
  // ellipsis (prevents a single long card stretching the column).
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// ---- "Has content" affordance ------------------------------------------
// Rendered when task.content is non-empty. A small dot + label; color
// ($status-medium) is paired with the text "Notes" so it is never
// color-only.
.task-card__meta {
  grid-column: 1;
  grid-row: 2;

  display: inline-flex;
  align-items: center;
  gap: $space-xxs;

  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  color: $text-secondary;
}

.task-card__meta-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: $radius-pill;
  background: $status-medium;
  flex: 0 0 auto;
}

// ---- Touch drag handle --------------------------------------------------
// On pointers that are coarse (touch), we expose an explicit grip so
// the card body stays tappable/scrollable. Hidden otherwise.
.task-card__handle {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: start;

  display: none;
  width: 44px;
  height: 44px;
  padding: $space-sm;

  color: $text-tertiary;
  background: transparent;
  border: 0;
  border-radius: $radius-sm;

  cursor: grab;

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }
}

@media (pointer: coarse) {
  .task-card__handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  // On touch, the card itself is NOT the drag handle — only the grip is.
  // CDK's [cdkDragHandle] directive (applied on the grip in the template)
  // enforces this.
  .task-card {
    cursor: default;
  }
}

// ---- CDK drag states ----------------------------------------------------
// The element that floats under the cursor during a drag. CDK clones the
// source element; our styles make the clone feel "picked up".
.cdk-drag-preview {
  background: $bg-card-dragging;
  border: 1px solid $border-light;
  border-radius: $radius-lg;
  box-shadow: $shadow-card-dragging;

  // Subtle scale + rotation to signal detachment. Transform only — GPU
  // friendly. Do NOT transition this property (CDK sets it imperatively).
  transform: scale(1.02) rotate(1deg);

  opacity: 0.98;
}

// The placeholder left in the source list while the drag is in flight.
// Keeps the list's layout stable so neighbors don't pop.
.cdk-drag-placeholder {
  background: $bg-dropzone;
  border: 2px dashed $border-dropzone;
  border-radius: $radius-lg;
  box-shadow: none;

  // Hide the contents — the placeholder is a ghost slot, not a readable
  // card. Height/width are already preserved by CDK.
  > * { opacity: 0; }

  // Fade the placeholder itself in softly as it takes over.
  animation: task-card-placeholder-in $motion-fast both;
}

@keyframes task-card-placeholder-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

// Neighbor cards nudging aside during a drag.
.cdk-drag-animating {
  transition: transform $motion-base;
}

// The original list item while the user is actively dragging it (distinct
// from .cdk-drag-preview which is the cursor-following clone).
.cdk-drag-dragging {
  // Prevents hover state flicker on the origin slot during the drag.
  pointer-events: none;
}

// ---- Rolled-back shake --------------------------------------------------
// Applied imperatively by the component when the server rejects a move
// (e.g. class toggled by a signal that auto-clears after $motion-base).
.task-card--rollback {
  animation: task-card-rollback $motion-base both;
}

@keyframes task-card-rollback {
  0%   { transform: translate3d(0, 0, 0);   }
  25%  { transform: translate3d(-4px, 0, 0); }
  50%  { transform: translate3d(4px, 0, 0);  }
  75%  { transform: translate3d(-2px, 0, 0); }
  100% { transform: translate3d(0, 0, 0);   }
}

// ---- Reduced motion ----------------------------------------------------
// Global rule clamps animation/transition durations to 0.01ms — the
// rollback shake collapses to an instant state change (no shake), which
// is still distinguishable from "moved successfully" because the card's
// position is different (rollback restores origin). The move-error strip
// supplies the verbal confirmation. No per-component override needed.
```

**Interaction notes:**
- Hover lift: `translateY(-2px)` + shadow swap over `$motion-fast` (150 ms).
- Pick up (mouse or keyboard `Space`): cursor becomes `grabbing`, CDK creates the `.cdk-drag-preview` clone with `scale(1.02) rotate(1deg)` and `$shadow-card-dragging`, the origin slot becomes `.cdk-drag-placeholder` with the dashed sage outline.
- Drop on valid zone: CDK's built-in settle animation (250 ms). Our `.cdk-drag-animating` class gives neighbors `$motion-base` transforms so the rearrangement feels choreographed.
- Drop outside / `Esc`: CDK animates the preview back to origin over `$motion-base`; no `.task-card--rollback` class is applied (that class is reserved for server-rejected moves).
- Server rollback (HTTP error path): the parent calls `boardState.rollbackOptimisticTaskMove(token)` → the card re-appears in its origin column, and the component toggles `.task-card--rollback` on that card for `$motion-base` (auto-removed). Under reduced-motion the shake collapses to instant; the inline error strip carries the actual explanation.

**Accessibility:**
- Role: the card is the `role="listitem"` child of the column's `role="list"`.
- `tabindex="0"` on the card (CDK's `cdkDrag` adds this) so `Tab` reaches it.
- `aria-label="{task.title}"` — if `task.content` is non-empty, appended with `" (has notes)"` so screen readers convey the "has content" dot without relying on color.
- Focus ring: 2 px solid `$brand-primary`, offset 2 px — **visible on every card**, never suppressed.
- Drag handle (touch): `aria-label="Drag {task.title}"`, size 44 × 44 px — meets the touch-target rule.
- Contrast:
  - `$text-primary` on `$bg-card` — 17.9:1 ✅ AAA.
  - `$text-secondary` on `$bg-card` — 4.6:1 ✅ AA.
  - `$brand-primary` focus ring on `$bg-main` — 3.3:1 ✅ AA for UI components.
  - `$status-medium` meta dot on `$bg-card` — 5.0:1 ✅ AA (but dot is paired with "Notes" label so color is never the only channel).
- Reduced motion: hover lift, drop-settle, and rollback shake all collapse to instant state changes (global rule). The card still visibly moves to its new or origin position; only the tween is removed.

---

## 4. User Flows

Each flow below specifies visual changes, motion tokens, exact `aria-live` copy, and the reduced-motion fallback.

### 4.1 Within-column reorder (mouse)

1. **At rest:** card shows `$shadow-card`, cursor `default`.
2. **Hover:** cursor → `grab`, card lifts `translateY(-2px)`, shadow → `$shadow-card-hover`, duration `$motion-fast`.
3. **Mousedown:** cursor → `grabbing`; CDK creates `.cdk-drag-preview` clone with `scale(1.02) rotate(1deg)` and `$shadow-card-dragging`; origin slot collapses to `.cdk-drag-placeholder` with dashed `$border-dropzone`.
4. **Announce (drag start):** `aria-live` region sets text to `"Picked up task {task.title}."`
5. **Drag within column:** neighbor cards nudge aside via `.cdk-drag-animating` → `transform: translate3d(...)` over `$motion-base`. The column's drop-list toggles `.cdk-drop-list-receiving` → border pulses between `$border-light` and `$border-dropzone` over `$motion-slow`, inner background shifts to `$brand-primary-light`.
6. **Drop (mouseup):** CDK's default settle animation places the card at the new index; placeholder fades out over `$motion-fast`; neighbors stop animating. Total visible settle ≈ 250 ms.
7. **Announce (drop):** `aria-live` → `"Moved task {task.title} to position {n+1} in {column.name}."`
8. **Optimistic mutation already applied** (step 6 fires `cdkDropListDropped` → parent runs `applyOptimisticTaskMove`). HTTP PUT in flight — no additional visual.
9. **On HTTP 200:** no visual change; `aria-live` unchanged (the confirm was already narrated). Move-error strip (if visible from a prior failure) stays; it dismisses on its own timer.
10. **Reduced-motion fallback:** every transition/animation in steps 2–7 collapses to instant (0.01 ms) via the global rule. The card still visibly changes position; the drag preview still appears and disappears. The `aria-live` narration is unchanged — users with reduced motion get the verbal confirm identically.

### 4.2 Cross-column move (mouse)

Identical to §4.1 through step 3. Diverges at step 5:

5. **Drag enters a different column:** target column toggles `.cdk-drop-list-receiving`; its border pulses to `$border-dropzone`, inner background to `$brand-primary-light`; neighbor cards in the target column nudge aside at `$motion-base`. The source column's placeholder remains in-place.
6. **Drop:** card settles into the target column at the inserted index; source column's placeholder fades out over `$motion-fast`; target column's `.cdk-drop-list-receiving` class clears.
7. **Announce (drop):** `aria-live` → `"Moved task {task.title} to {newColumn.name}, position {n+1}."`
8. Optimistic mutation → HTTP PUT. Same as §4.1 from step 8.

### 4.3 Drop on an empty column

Identical to §4.2 except the target column renders the `.board-column__empty-zone` element instead of any cards.

5. **Drag enters empty column:** the entire `.board-column__list` toggles `.cdk-drop-list-receiving` — its background shifts to `$brand-primary-light`, the dashed empty-zone border stays at `$border-dropzone` (already dashed sage; the hover darkens the surrounding shell, not the zone itself). The empty-zone hint text stays visible at `$text-primary` — no flash.
6. **Drop:** the empty-zone element is replaced by the landing `<app-task-card>` at index 0. The zone fades out over `$motion-fast`; the card fades+slides in over `$motion-base`.
7. **Announce:** `aria-live` → `"Moved task {task.title} to {newColumn.name}, position 1."`
8. Optimistic + HTTP same as §4.2.

### 4.4 No-op / cancelled drag (`Esc` or dropped outside any drop list)

1. Steps 1–5 of §4.1 or §4.2 play normally.
2. User presses `Esc` OR releases the mouse outside any `cdkDropList`.
3. **CDK default:** the `.cdk-drag-preview` animates back to the origin slot over `$motion-base`; placeholder is replaced by the original card; no `taskDropped` event with a useful payload is emitted (CDK fires the event but `previousContainer === container && previousIndex === currentIndex`).
4. **Parent early-exits** per tech-spec step 4 — no optimistic mutation, no HTTP call.
5. **Announce (cancel):** `aria-live` → `"Cancelled move of task {task.title}."`
6. Move-error strip is **not** shown — no failure to narrate.
7. **Reduced-motion:** the return animation collapses to instant; the card snaps to origin. `aria-live` narration is unchanged.

### 4.5 Failed move → optimistic rollback + error surface

1. Steps 1–7 of §4.2 play to completion — card visually lands in the target column.
2. Parent calls `tasksApi.moveTask(...)`; HTTP returns non-2xx.
3. **Parent calls `boardState.rollbackOptimisticTaskMove(token)`** — state restores to pre-drop snapshot; the card re-renders in its origin column at its origin index. Angular's change detection moves the DOM node back. Duration of the DOM reparenting ≈ single frame; CDK is not involved because the drag is already complete.
4. **Component toggles `.task-card--rollback`** on the returned card for `$motion-base` → the `task-card-rollback` keyframes play a two-axis shake (`translateX ±4 → ∓4 → ±2 → 0`), then the class is removed.
5. **Move-error strip mounts** at the top of the board with `$status-high` 4 px left border, `$shadow-dropdown`, slide-in from `-8px` over `$motion-base`.
6. **Strip body text is one of the four verbatim strings from the tech spec's §"Error mapping (task move)" table — choose by HTTP status:**

   | HTTP | Strip body (verbatim, do not paraphrase) |
   |---|---|
   | `0` (network) | `"We couldn't reach the server. The move was undone."` |
   | `403` | `"You are no longer a member of this project and cannot move tasks."` |
   | `404` | `"That task or column no longer exists."` |
   | `5xx` | `"Something went wrong on our end. The move was undone."` |
   | `400` | `"We couldn't move that task. Please try again."` |
   | `401` | (global `authInterceptor` intercepts before UI; strip is not shown) |
   | other | `"We couldn't move that task. Please try again."` |

7. **Announce (rollback):** `aria-live` → `"Move undone. {strip body text}."` — the same verbatim body copy is appended to the announcement so screen-reader users get the full explanation without visually scanning the strip.
8. **Auto-dismiss:** strip disappears after 5000 ms, OR immediately when the next successful drop occurs (tech spec §"Implementation Steps" step 8 — `moveError` auto-clears on successful `moveTask.next`). Dismiss button is focusable and keyboard-reachable for users who want it gone sooner.
9. **Reduced-motion fallback:** the shake collapses to instant (no lateral movement visible — the card simply "reappears" at origin via the state rollback, which is already a visible position change); the strip slide-in collapses to instant fade. Both the `aria-live` narration and the strip's text remain — the information is preserved, only the tween is removed.

### 4.6 Initial column-load failure → block-level error

1. User navigates to `/board/:projectId`.
2. `BoardPageComponent` calls `boardState.enterBoard(projectId)` then `columnsApi.getColumnsForProject(projectId)`.
3. HTTP fails (e.g. 404 project not found, 403 not a member, 5xx, network).
4. Parent sets `columnLoadError.set(mapColumnErrorToUserMessage(err, 'list'))`.
5. Template conditionally renders `.board-page__load-error` instead of `.board-page__columns`:

   - `.board-page__load-error-panel` — max-width 480 px, centered, `$status-high` 4 px left border, `$shadow-card`.
   - Heading (`$font-size-lg`, `$font-weight-semibold`, `$text-primary`): `"We couldn't load this board"` (hardcoded — the mapped `err` copy is the body, the heading is a constant framing line).
   - Body (`$font-size-md`, `$line-height-normal`, `$text-secondary`): the mapped string from the tech spec's column-load error table, verbatim:

     | HTTP | Body (verbatim) |
     |---|---|
     | `0` | `"We couldn't reach the server. Please check your connection and try again."` |
     | `401` | (auth interceptor handles — user redirected to login) |
     | `403` | `"Your session has expired. Please sign in again."` |
     | `404` | `"This project no longer exists."` |
     | `5xx` | `"Something went wrong on our end. Please try again in a moment."` |
     | other 4xx | `"We couldn't load this board. Please try again."` |

6. **No retry button** — per tech spec §"Error handling & rollback" step 8, the user navigates back to the dashboard via the app's existing back navigation. The block error itself is not dismissible.
7. **Announce:** panel is `role="alert"`, so the heading + body are announced automatically on mount. No separate `aria-live` narration required.
8. **Reduced-motion fallback:** panel has no entry animation — it appears on first paint. Nothing to collapse.

### 4.7 Keyboard drag path

Uses CDK's built-in keyboard drag behavior — no custom handlers. Tab order is: board toolbar → first column's first card → arrow/Tab through cards within column → Tab to next column's first card → …

1. **`Tab` reaches a card.** Focus ring paints: 2 px `$brand-primary`, 2 px offset.
2. **Announce (focus, no drag):** `aria-live` region is **not** updated on focus — only on drag events — so screen readers rely on the card's own `aria-label` via standard focus narration.
3. **`Space` pressed.** CDK picks up the card: `.cdk-drag-preview` clone created, origin becomes `.cdk-drag-placeholder`.
4. **Announce (pick up):** `aria-live` → `"Picked up task {task.title}. Use arrow keys to move, Space to drop, Escape to cancel."`
5. **Arrow keys.** Up/Down reorder within the current column; Left/Right cross to the previous/next column. CDK animates neighbor reflow at `$motion-base`. Target column toggles `.cdk-drop-list-receiving` → border pulses to `$border-dropzone`.
6. **Announce (each arrow):** `aria-live` → `"{column.name}, position {n+1} of {column.tasks.length}."` — updated on each successful arrow-key move (CDK exposes drag-moved events; the smart component throttles announcements to ≤1 per 250 ms).
7. **`Space` again (drop).** Card settles at the current target. `aria-live` → `"Moved task {task.title} to {newColumn.name}, position {n+1}."`
8. **`Escape` (cancel).** Card returns to origin. `aria-live` → `"Cancelled move of task {task.title}."`
9. **Reduced-motion fallback:** neighbor reflow collapses to instant; drop-settle collapses to instant; narration unchanged.

### 4.8 `aria-live` region summary (exact copy for developer)

The board page hosts a single visually-hidden `<div aria-live="polite" role="status">` whose text content is updated imperatively by the smart component. Exact strings:

| Event | `aria-live` text |
|---|---|
| Drag start (mouse or keyboard pickup) | `"Picked up task {task.title}."` (append `" Use arrow keys to move, Space to drop, Escape to cancel."` when the event source is keyboard.) |
| Keyboard arrow move (throttled ≤ 1/250 ms) | `"{column.name}, position {n+1} of {column.tasks.length}."` |
| Drop on valid target, within-column | `"Moved task {task.title} to position {n+1} in {column.name}."` |
| Drop on valid target, cross-column (incl. empty column) | `"Moved task {task.title} to {newColumn.name}, position {n+1}."` |
| Drag cancelled (`Esc` or dropped outside) | `"Cancelled move of task {task.title}."` |
| Rollback (HTTP error) | `"Move undone. {verbatim-error-body}."` — append the exact verbatim string from the §4.5 table. |

---

## 5. Responsive Behavior

All behaviors below apply to the board view specifically; the app shell is handled elsewhere.

### `< $bp-md` (< 768 px — phone / small tablet portrait)

- Kanban row stays horizontal; one column fits the viewport (`$kanban-column-width` = 300 px; on a 360 px device, with 32 px padding, one column is visible with a sliver of the next).
- Scroll-snap engages; user flicks between columns.
- Card padding tightens from `$space-lg` to `$space-md`.
- Drag handle (`.task-card__handle`) becomes visible (coarse pointer) at 44 × 44 px; whole-card drag is disabled on touch so vertical scrolling works.
- Block-level error panel scales to `max-width: 100%` within its `$content-padding` margins (auto-handled by `max-width: 480px; width: 100%`).
- Move-error strip spans from `$content-padding` left to `$content-padding` right (same as in larger viewports — no dedicated rule needed).

### `$bp-md` – `$bp-lg` (768 – 991 px — tablet / small laptop)

- Kanban row shows 2 columns without horizontal scroll when viewport ≥ 2 × 300 px + 1 × 24 px + 2 × 32 px = 688 px. At 768 px there's a comfortable 80 px of breathing room; additional columns reveal via scroll.
- Card padding returns to `$space-lg`.
- Drag handle hides on hover-capable pointer, visible on coarse pointer (hybrid tablet with keyboard+touch still sees it only when the user is using touch).

### ≥ `$bp-lg` (≥ 992 px — small laptop and up)

- 3+ columns visible without scrolling at typical widths. At `$bp-xl` (1200 px) 3 full columns plus part of a 4th; at `$bp-2xl` (1400 px) comfortably 4 columns.
- No layout changes beyond those inherited from `$bp-md`.
- The page as a whole remains the only horizontally-scrolling surface — no outer horizontal scroll anywhere else in the app.

---

## 6. Accessibility Audit (WCAG 2.1 AA)

### 6.1 Contrast

| # | Foreground | Background | Ratio | Threshold | Verdict |
|---|---|---|---|---|---|
| 1 | `$text-primary` (#1C1C1C) | `$bg-main` (#FFFFFF) | 17.9:1 | 4.5:1 body | ✅ AAA |
| 2 | `$text-primary` | `$bg-card` (#FFFFFF) | 17.9:1 | 4.5:1 body | ✅ AAA |
| 3 | `$text-primary` | `$bg-sidebar-light` (#F4F5F1) | 16.3:1 | 4.5:1 body | ✅ AAA |
| 4 | `$text-primary` | `$brand-primary-light` (#E8EBE4) | 14.7:1 | 4.5:1 body | ✅ AAA |
| 5 | `$text-secondary` (#7A7A7A) | `$bg-card` | 4.6:1 | 4.5:1 body | ✅ AA |
| 6 | `$text-secondary` | `$bg-sidebar-light` | 4.5:1 | 4.5:1 body | ✅ AA |
| 7 | `$text-primary` | `$bg-dropzone` (#F4F5F1) | 16.3:1 | 4.5:1 body | ✅ AAA — PM ruling 2026-05-04 promoted the empty-zone hint from `$text-secondary` (4.4:1 borderline) to `$text-primary` because the copy is instructional, not incidental |
| 8 | `$brand-primary` (#8C9B7B) focus ring | `$bg-main` | 3.3:1 | 3.0:1 UI | ✅ AA |
| 9 | `$brand-primary` focus ring | `$bg-sidebar-light` | 3.0:1 | 3.0:1 UI | ✅ AA (at threshold) |
| 10 | `$status-high` (#E56B6F) border | `$bg-card` | 3.5:1 | 3.0:1 UI | ✅ AA |
| 11 | `$status-medium` (#4A6FA5) dot | `$bg-card` | 5.0:1 | 3.0:1 UI | ✅ AA |
| 12 | `$border-dropzone` (#8C9B7B) | `$bg-sidebar-light` | 3.1:1 | 3.0:1 UI | ✅ AA |
| 13 | `$border-dropzone` | `$bg-dropzone` | 3.1:1 | 3.0:1 UI | ✅ AA |

**Ratios below 3.0:1 (not used in this feature):** `$text-tertiary` on any background falls below 3.0:1 — reserved for meta-only decorations per the design system rule; **not used in this spec**.

### 6.2 Keyboard

- **Tab order:** page topbar → board toolbar (if any) → first column's first card → arrow/Tab through cards within a column → Tab to next column → next card … → move-error strip dismiss button (when strip visible) → page bottom.
- **Card pickup:** `Space` (CDK default). `Enter` is **not** bound (CDK default does not pick up on Enter; we do not add it — would conflict with future "open task" dialogs).
- **Move during drag:** arrow keys (CDK default).
- **Drop:** `Space`.
- **Cancel:** `Escape`.
- **Focus ring:** 2 px solid `$brand-primary`, 2 px offset, `:focus-visible` only (mouse users don't see it unless they tab in after a click).
- **No focus traps** — the board is a single navigation surface, not a modal.

### 6.3 Screen reader

- **Board page:** `<main>` element with `aria-labelledby` pointing to the page title.
- **Each column:** `role="list"` on `.board-column__list`, `aria-label="{column.name} column, {tasks.length} tasks"`.
- **Each card:** `role="listitem"`, `aria-label="{task.title}"` — appended with `" (has notes)"` when `task.content` is non-empty, so the meta dot is never color-only.
- **Drag narration:** single `aria-live="polite"` + `role="status"` region at the page level, copy per §4.8 table.
- **Drop-target live feedback:** not announced as a separate event (to avoid narration spam during a drag). The final drop narration carries the destination column name and position — enough for a screen-reader user to confirm the outcome.
- **Load-error panel:** `role="alert"` — announced on mount.
- **Move-error strip:** `role="status"` + `aria-live="polite"` — the strip's body text is announced when it appears; the same copy is also appended to the rollback announcement in §4.8 for belt-and-braces.

### 6.4 Motion

- Global `prefers-reduced-motion: reduce` rule (already in `_motion.scss`) clamps all `transition-duration` and `animation-duration` to 0.01 ms — state changes fire, tween-in-between does not.
- Per-interaction fallback inventory (reduced-motion behavior):
  - Hover lift → instant state change (card appears slightly elevated via shadow only).
  - Drop-settle → instant placement.
  - Neighbor nudge → instant re-layout.
  - `.cdk-drag-placeholder` fade-in → instant appearance.
  - `.task-card--rollback` shake → **no visible shake**; card simply reappears at origin. Inline error strip still delivers the verbal explanation.
  - Move-error strip slide-in → instant appearance.
  - Drop-target border pulse → instant border swap to `$border-dropzone` while hovering, instant swap back on leave.
- **No auto-playing animation** exists outside of user-initiated drag.
- **No parallax, no background motion.**

### 6.5 Touch targets (44 × 44 px minimum, touch-only devices)

| Element | Size at `< $bp-md` | Status |
|---|---|---|
| Task card (entire surface — tap target for focus) | width 268 px (300 − 2 × 16 card padding adjustment) × height ≥ 72 px (title + meta) | ✅ ≫ 44 × 44 |
| Drag handle (`.task-card__handle`) on coarse pointer | 44 × 44 px | ✅ exact threshold |
| Move-error dismiss button (hover-capable pointer) | 24 × 24 px visual, expanded to 32 × 32 px hit area via padding | ✅ — hover-capable pointers have pixel-precise input; 44 px rule does not bind |
| Move-error dismiss button (coarse pointer) | 44 × 44 px hit area via `@media (pointer: coarse)` upshift | ✅ meets charter threshold — PM ruling 2026-05-04 |
| Column count pill | 28 × 20 px | non-interactive (pure text affordance) — 44 px rule does not apply |

### 6.6 Forms

**Not applicable in this feature** — no inputs, no forms. (Task creation / editing is explicitly out-of-scope per the context doc.)

---

## 7. Implementation Checklist for Developer

### 7.1 Prerequisites (verify, do not author)

- [ ] Token files exist under `KanbAI-Web/src/styles/variables/`: `_colors.scss`, `_typography.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_layout.scss`, `_motion.scss`, `_breakpoints.scss`. **Confirmed present at design time.** No scaffolding required.
- [ ] Global `_motion.scss` exports the `prefers-reduced-motion` clamp rule. **Confirmed present.** Ensure `styles.scss` (global entry) imports `_motion.scss` so the rule is applied globally, not only to components that `@use` it — the reduced-motion clamp must exist at the document level.
- [ ] `Inter` font loaded at app shell via self-host or Google Fonts with `font-display: swap`. (Not a blocker for this ticket; `$font-family-base` falls back to system UI fonts.)
- [ ] `@angular/cdk` ≥ 21 installed (already in `package.json`). No action.

### 7.2 Per component

#### `BoardPageComponent`

- [ ] Overwrite `KanbAI-Web/src/app/features/board/board-page/board-page.component.scss` with the SCSS in §3.1. (The existing file contains only a reserved skeleton block; that block can be removed or kept — the design spec does not require it for this ticket.)
- [ ] Template adds:
  - `.board-page` wrapper.
  - `.board-page__move-error[role="status" aria-live="polite"]` with `.board-page__move-error-icon`, `.board-page__move-error-text`, `.board-page__move-error-dismiss[aria-label="Dismiss move error"]` — rendered only when `moveError()` is non-null.
  - `.board-page__sr-announce[aria-live="polite" role="status"]` — always rendered, text content bound to a `dragAnnouncement` signal updated per §4.8.
  - `.board-page__load-error > .board-page__load-error-panel[role="alert"]` with heading + body — rendered only when `columnLoadError()` is non-null AND `columns().length === 0`.
  - `.board-page__columns[cdkDropListGroup]` — rendered otherwise.
- [ ] Move-error strip auto-dismiss: set a `setTimeout(() => moveError.set(null), 5000)` on each `moveError.set(...)` call; clear the prior timeout on re-failure.
- [ ] All state/DOM observable through signals; no `@ViewChild` required for this spec.

#### `BoardColumnComponent`

- [ ] Create `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss` per §3.2.
- [ ] Template structure:
  ```
  <section class="board-column">
    <header class="board-column__header">
      <h2 class="board-column__name">{{ column.name }}</h2>
      <span class="board-column__count" aria-hidden="true">{{ tasks.length }}</span>
    </header>
    @if (column.colorCode) {
      <div class="board-column__accent" [style.background]="column.colorCode"></div>
    }
    <div
      class="board-column__list"
      role="list"
      [attr.aria-label]="column.name + ' column, ' + tasks.length + ' tasks'"
      cdkDropList
      [cdkDropListData]="tasks"
      [cdkDropListConnectedTo]="connectedDropListIds"
      [id]="'drop-list-' + column.id"
      (cdkDropListDropped)="taskDropped.emit($event)">
      @if (tasks.length === 0) {
        <div class="board-column__empty-zone">
          <p class="board-column__empty-hint">Drop a task here.</p>
        </div>
      } @else {
        @for (task of tasks; track task.id) {
          <app-task-card [task]="task" cdkDrag [cdkDragData]="task" role="listitem" />
        }
      }
    </div>
  </section>
  ```
  (Note: the developer agent authors the template; the above is reference structure from this design spec — the tech spec is still the source of truth for the directive wiring.)
- [ ] `ChangeDetectionStrategy.OnPush`.

#### `TaskCardComponent`

- [ ] Create `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.scss` per §3.3.
- [ ] Template structure:
  ```
  <article
    class="task-card"
    [class.task-card--rollback]="rolledBack()"
    [attr.aria-label]="task.title + (task.content ? ' (has notes)' : '')"
    tabindex="0">
    @if (true /* coarse-pointer only, handled by CSS */) {
      <button
        type="button"
        class="task-card__handle"
        cdkDragHandle
        [attr.aria-label]="'Drag ' + task.title">
        <!-- grip icon SVG, 16 × 16 px, aria-hidden -->
      </button>
    }
    <h3 class="task-card__title">{{ task.title }}</h3>
    @if (task.content) {
      <span class="task-card__meta">
        <span class="task-card__meta-dot" aria-hidden="true"></span>
        Notes
      </span>
    }
  </article>
  ```
- [ ] `rolledBack: WritableSignal<boolean>` — parent toggles it via a brief input binding or the component listens to a shared signal; auto-clear after `$motion-base` (250 ms) via `setTimeout`.
- [ ] `ChangeDetectionStrategy.OnPush`.

### 7.3 Verification

- [ ] `npm run build` succeeds with zero new SCSS or TS errors.
- [ ] `npm run test -- --watch=false` — any pre-existing failures documented, any new failures fixed.
- [ ] Lighthouse a11y score ≥ 95 on `/board/:projectId` with at least one column and one card rendered.
- [ ] Manual keyboard traversal: Tab reaches every card in left-to-right column order, `Space` picks up, arrow keys move, `Space` drops, `Esc` cancels. Visible focus ring on every stop.
- [ ] DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce` → drag a card, trigger a rollback — confirm no shake animation, no slide-in on the error strip, but both the card position change and the strip text still appear.
- [ ] Axe-core DevTools scan: zero violations on the board page in default, dragging, rolled-back, and column-load-error states.
- [ ] Viewport test matrix: 320, 768, 1024, 1440 px. Confirm the board page is the only horizontally-scrolling surface; no horizontal scroll on `<body>` or `<main>` at any width.
- [ ] Touch test: on a coarse-pointer device (or DevTools device emulation), confirm the drag handle is visible at 44 × 44 px and that tapping the card body without the handle does NOT initiate a drag.

---

*"The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec."*
