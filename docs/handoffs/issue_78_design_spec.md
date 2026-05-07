# Design Specification: Add "New Task" button to each board column

**Technical Spec:** [issue_78_tech_spec.md](./issue_78_tech_spec.md)
**Business Context:** [issue_78_context.md](./issue_78_context.md)
**Companion (precedent):** [issue_77_design_spec.md](./issue_77_design_spec.md)
**GitHub Issue:** [#78](https://github.com/Gulybi/KanbAI-Web/issues/78)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Design Intent

A column is a swim lane the user owns. Adding a task to it should feel like tapping the end of that lane, not opening a modal somewhere else. The "Add task" affordance lives at the bottom of each column as a quiet, dashed, column-sized footer slot — recessive enough to not compete with task cards, reachable enough that Tab from the last card finds it without thought. When activated, the trigger is replaced in place by the inline create form; the column's height is allowed to grow to accommodate the form, but the column's neighbours never shift.

The footer slot is the *companion one scope level down* to the board's trailing "+ Add column" slot shipped with #77. It uses the same dashed-ghost voice, the same `$border-dropzone` vocabulary echo on hover/focus, the same `$motion-fast`/`$motion-base` timing, the same focus-restoration contract after success or cancel. Task-create is a smaller gesture than column-create, so its resting visual weight is one notch lighter: no plus glyph, smaller min-height, `$font-size-sm` label rather than `$font-size-md`. The inline form that replaces it is the `BoardAddTaskComponent` — the mirror-twin of `BoardAddColumnComponent`, minus the duplicate-name error block (tasks legitimately repeat per AC).

Empty columns keep their existing `"Drop a task here."` drop-hint unchanged — drag users still need it — and the footer slot sits immediately below, as an additive second affordance. The column is never a dead end for keyboard users.

## Scope

- **Components styled (new):** `BoardAddTaskComponent`
- **Components modified (additive only):** `BoardColumnComponent` — new footer slot below the task list (`.board-column__footer`, `.board-column__add-task`). No changes to header, accent bar, count badge, task list, empty drop-zone hint, or CDK drop-list wiring.
- **States covered (all):** default, hover, focus-visible, active, disabled, submitting, invalid, error, composed-with-empty-hint
- **Responsive:** mobile (<$bp-md), tablet ($bp-md–$bp-lg), desktop (≥$bp-lg)
- **Accessibility:** WCAG AA contrast verified with measured ratios; full keyboard + screen-reader path

---

## Prerequisites

All eight canonical token files exist and are in use by sibling components — no scaffolding needed (verified via `Glob KanbAI-Web/src/styles/variables/*.scss`):

- `KanbAI-Web/src/styles/variables/_colors.scss` ✓
- `KanbAI-Web/src/styles/variables/_typography.scss` ✓
- `KanbAI-Web/src/styles/variables/_spacing.scss` ✓
- `KanbAI-Web/src/styles/variables/_radius.scss` ✓
- `KanbAI-Web/src/styles/variables/_shadows.scss` ✓
- `KanbAI-Web/src/styles/variables/_motion.scss` ✓ (global `prefers-reduced-motion` rule is already registered here per #77 verification)
- `KanbAI-Web/src/styles/variables/_breakpoints.scss` ✓
- `KanbAI-Web/src/styles/variables/_layout.scss` ✓

Existing pattern references (do not duplicate, consume):

- [`board-add-column.component.scss`](../../KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.scss) lines 1–232 — the mirror-twin form. `BoardAddTaskComponent`'s SCSS adopts the same inner rhythm, same submit/cancel treatment, same inline-error paragraph, minus the `.board-add-column__field-error` duplicate-name surface (tasks have no duplicate-title validator per tech spec D11).
- [`board-column.component.scss`](../../KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss) lines 17–107 — the column shell. The footer slot is a new section appended after `.board-column__list` at the same horizontal padding rhythm (`$space-lg` left/right, `$space-xs` top from the list, `$space-lg` bottom to the column edge).
- [`board-page.component.scss`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss) — the existing `.board-page__sr-announce` live region is reused verbatim for `Task '<title>' added to <column>.` announcements per tech spec D7.

No new tokens introduced. No `!important` introduced. No token replacements proposed.

---

## Tokens Used

| Token | Where used |
|---|---|
| `$brand-primary` | Focus outline on all controls, submit button fill, active-state border on the "Add task" trigger |
| `$brand-primary-hover` | Submit button `:hover` fill |
| `$brand-primary-light` | "Add task" trigger `:hover` background, disabled submit fill |
| `$bg-card` | Form surface fill, inline error paragraph fill |
| `$bg-sidebar-light` | Column shell background (inherited — unchanged), cancel-button hover surface tint |
| `$bg-dropzone` | Empty drop-zone (inherited — unchanged; footer slot sits adjacent to it, not on top of it) |
| `$text-primary` | Form input value, error paragraph body, trigger-hover label, button labels on light surfaces |
| `$text-secondary` | Trigger resting label, cancel-button resting label |
| `$text-tertiary` | Disabled-control foreground (short-duration states only — never primary copy) |
| `$text-brand` | (Available, not used on the task-create trigger — see Design Decision #3) |
| `$text-inverse` | Submit button label on `$brand-primary` fill |
| `$status-high` | Inline error left-accent bar + icon (paired with text — never colour alone) |
| `$border-light` | Column shell border (inherited), form surface border, trigger resting dashed border, submit/cancel button borders |
| `$border-dropzone` | Trigger hover + focus-visible border (vocabulary echo with CDK drop targets and with #77's trailing affordance) |
| `$shadow-card` | Form surface resting elevation |
| `$shadow-card-hover` | Trigger hover elevation |
| `$radius-sm` | Inline error accent |
| `$radius-md` | Buttons, trigger, input wrappers |
| `$radius-lg` | Form surface |
| `$space-xxs`–`$space-xl` | Gaps, paddings, margins (see per-component rules) |
| `$font-size-sm` | Trigger label, error text, submit/cancel button labels |
| `$font-size-md` | Form input text |
| `$font-weight-medium` | Trigger label, cancel button label |
| `$font-weight-semibold` | Submit button label |
| `$line-height-tight` | Button labels, trigger label |
| `$line-height-normal` | Form body, error sentence |
| `$motion-fast` | Hover / focus transitions on every interactive control |
| `$motion-base` | Form mount fade-in, trigger→form swap |
| `$kanban-column-width` | Footer slot width is pinned by the column host (already `$kanban-column-width` — inherited) |
| `$bp-md`, `$bp-lg` | Responsive breakpoints |

**No new tokens introduced.** If the developer hits a token need during implementation (e.g. a specific dashed stroke outside `1px`), stop and raise it as an open question — do not invent.

---

## Per-Component Styling

### Component: `BoardAddTaskComponent`

**File:** `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.scss`

**Role:** Inline form that replaces the "Add task" footer trigger when the user activates it. Hosts a single-field task-title input plus submit/cancel actions and an inline server-error paragraph. Mirror-twin of `BoardAddColumnComponent`.

**Layout:**

- Vertical flex column. Width is 100% of its parent footer slot — the column host is already pinned at `$kanban-column-width`, so the form visually occupies the same column-shaped space its trigger did and prevents horizontal layout thrash.
- Internal rhythm: `$space-md` (16 px) gap between the input wrapper, the server-error paragraph, and the actions row. This matches `BoardAddColumnComponent` exactly so the user's muscle memory between the two forms survives.
- Action row: horizontal flex with `$space-xs` (8 px) gap — submit first (left), cancel second. Reversed on `<$bp-md` to full-width stacked buttons for comfortable thumb reach (submit stacks above cancel).
- No `.board-add-task__field-error` duplicate surface (tasks allow duplicate titles per tech spec D11 / AC). The shared `FormInputComponent` fully covers required / whitespace / maxLength errors via its own surface.

**States:** default (mount) → input-focused → submitting → invalid → server-error → disabled (all buttons) → reduced-motion

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
  font-family: $font-family-base;
  color: $text-primary;
}

// ---- Form surface ----------------------------------------------------
// Rendered inside the column's footer slot. Parent column is already
// pinned to $kanban-column-width, so width: 100% here is column-shaped.
// Visual rhythm is identical to BoardAddColumnComponent so the two
// create-forms read as the same pattern at different scopes.
.board-add-task {
  display: flex;
  flex-direction: column;
  gap: $space-md;

  padding: $space-md;
  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;

  // Mount animation — fade + minuscule translate so the form doesn't
  // just pop into the column. Duration $motion-base. Transform +
  // opacity only (motion discipline).
  animation: board-add-task-in $motion-base both;

  width: 100%;
}

@keyframes board-add-task-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0);   }
}

// ---- Inline server-error paragraph -----------------------------------
// Sized to the form column (never full-column banner). Paired with
// $status-high left accent AND text AND icon (KanbAI rule: never
// colour alone). role="alert" in the template announces to SR users.
.board-add-task__error {
  display: flex;
  align-items: flex-start;
  gap: $space-xs;

  margin: 0;
  padding: $space-xs $space-sm;

  background: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-sm;

  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $text-primary;

  &::before {
    content: '';
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    margin-top: 2px;
    background: currentColor;
    color: $status-high;
    // Inline SVG mask — exclamation-triangle glyph. Keeps us off
    // icon-font deps. Identical to .board-add-column__error::before.
    mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M8 1.333 14.667 12.8H1.333L8 1.333Zm0 4.8v3.2h.667v-3.2H8Zm-.333 4.534v.666h1v-.666h-1Z'/></svg>");
    mask-repeat: no-repeat;
    mask-size: 14px 14px;
    -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M8 1.333 14.667 12.8H1.333L8 1.333Zm0 4.8v3.2h.667v-3.2H8Zm-.333 4.534v.666h1v-.666h-1Z'/></svg>");
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: 14px 14px;
  }
}

// ---- Actions row -----------------------------------------------------
.board-add-task__actions {
  display: flex;
  align-items: center;
  gap: $space-xs;

  // Mobile: stack full-width, submit on top for thumb reach.
  @media (max-width: #{$bp-md - 1px}) {
    flex-direction: column;
    align-items: stretch;
    gap: $space-xs;
  }
}

// ---- Submit ("Add" / "Adding…") button -------------------------------
.board-add-task__submit {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-xxs;

  min-height: 36px;
  padding: $space-xs $space-md;

  background: $brand-primary;
  color: $text-inverse;
  border: 1px solid $brand-primary;
  border-radius: $radius-md;

  font-family: $font-family-base;
  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast,
    transform        $motion-fast;

  &:hover:not(:disabled) {
    background: $brand-primary-hover;
    border-color: $brand-primary-hover;
  }

  // Active — brief press feedback. Transform only, never top/left.
  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:disabled {
    background: $brand-primary-light;
    border-color: $brand-primary-light;
    color: $text-tertiary;
    cursor: not-allowed;
  }

  // Touch target — meet 44×44 on coarse pointers.
  @media (pointer: coarse) {
    min-height: 44px;
    min-width: 44px;
  }

  @media (max-width: #{$bp-md - 1px}) {
    min-height: 44px;
    width: 100%;
  }
}

// ---- Cancel button (secondary / ghost) -------------------------------
.board-add-task__cancel {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  min-height: 36px;
  padding: $space-xs $space-md;

  background: transparent;
  color: $text-secondary;
  border: 1px solid $border-light;
  border-radius: $radius-md;

  font-family: $font-family-base;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast;

  &:hover:not(:disabled) {
    background: $bg-sidebar-light;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:disabled {
    color: $text-tertiary;
    cursor: not-allowed;
    opacity: 0.7;
  }

  @media (pointer: coarse) {
    min-height: 44px;
    min-width: 44px;
  }

  @media (max-width: #{$bp-md - 1px}) {
    min-height: 44px;
    width: 100%;
  }
}
```

**Interaction notes:**

- **Default (mount):** form mounts with `board-add-task-in` (opacity 0→1 + translateY 4 px→0) over `$motion-base`. Input auto-focuses within one render cycle via `afterNextRender` in the component (tech spec §Component Contracts) — no CSS choreography needed for focus.
- **Hover (buttons):** submit darkens fill to `$brand-primary-hover`; cancel picks up `$bg-sidebar-light` tint and `$text-primary` foreground. Transitions `$motion-fast`.
- **Focus-visible (all controls inc. the `FormInputComponent` native input):** 2 px `$brand-primary` outline, 2 px offset. Never removed.
- **Active:** submit translates `1px` down via `transform` (not `top`). Rolls back on pointer-up.
- **Submitting:** parent sets `submitting()` signal → template binds `[disabled]` on both buttons and swaps the submit label to `"Adding…"`. CSS serves the disabled visual (`$brand-primary-light` fill, `$text-tertiary` label, `cursor: not-allowed`). The `FormInputComponent` native input stays interactive during submit — matches `BoardAddColumnComponent` and means the user sees their typed value and the row never loses focus mid-flight.
- **Invalid (client-side):** submit `[disabled]="nameControl.invalid || submitting()"`. `FormInputComponent` surfaces required / maxLength / whitespaceOnly inline via its standard error rendering (owned by #70, reused as-is). No duplicate-name surface.
- **Server error:** `.board-add-task__error` paragraph renders below the input, anchored to the form column width, `role="alert"` announces; icon + accent + text together signal severity. The typed value is preserved (component `FormControl` state is retained); submit re-enables so the user can retry without re-opening the surface.
- **Reduced motion:** global rule at [`_motion.scss:13-18`](../../KanbAI-Web/src/styles/variables/_motion.scss#L13-L18) clamps `animation-duration` and `transition-duration` to `0.01ms`. Mount fade still fires (instant feedback), no motion.

**Accessibility:**

- Form element: `<form aria-label="Add task">`. Submits on Enter (native `(submit)`); cancels on Escape via component-level `(keydown)` binding that calls `event.preventDefault()` so Escape does not bubble to e.g. a parent dialog.
- Submit button label: `"Add"` at rest, `"Adding…"` during submit — both human-readable, no icon-only state.
- Cancel button label: plain `"Cancel"`. No icon-only.
- Inline server-error paragraph: `role="alert"` is a live region — assistive tech re-announces on content change.
- `FormInputComponent` wires `<label for="…">`, `aria-describedby`, and `aria-invalid="true"` on required/maxLength/whitespace errors (inherited from #70 infrastructure; not re-invented here).
- Contrast ratios verified in §Accessibility Audit below.
- Touch targets: ≥44×44 via `@media (pointer: coarse)` and via full-width stacking on `<$bp-md`.

---

### Component: `BoardColumnComponent` (additions)

**File:** `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss`

**Role:** The column shell gains a footer slot below `.board-column__list` that hosts either the "Add task" trigger button (default) or the `<app-board-add-task>` inline form (when `addTaskOpen()` is true). Additive SCSS only — the existing `.board-column`, `.board-column__header`, `.board-column__accent`, `.board-column__count`, `.board-column__list`, `.board-column__empty-zone`, and `.board-column__empty-hint` rules are unchanged.

**Layout:**

- The footer slot is a flex item at the bottom of the column's vertical stack, immediately after `.board-column__list`. It uses the same horizontal padding rhythm as the list (`$space-lg` left/right) and `$space-sm` bottom padding so the control never touches the column's border-radius curve.
- Top padding inside the footer is `$space-xs` — a tight gap that reads as "continuation of the list", not a second section. (Compare with the list's own bottom padding of `$space-lg` which was sized for when the list *was* the last element; the footer absorbs some of that visual air by sitting within the existing `$space-lg` column-edge rhythm.) **To prevent double-padding when the footer is present**, when `.board-column__list` is followed by a `.board-column__footer`, its bottom padding is reduced to `$space-xs` via an adjacent-sibling selector. This keeps populated columns tight and empty columns spacious.
- The trigger button `.board-column__add-task` fills 100 % of the footer width, min-height 40 px (less than the trailing "+ Add column" button's 56 px — task-create is a smaller gesture than column-create).
- When the inline form is mounted, it replaces the trigger inside the same slot; the column's height grows to absorb the form. Columns to the left/right do not reflow — the host is already pinned at `$kanban-column-width`.
- The column's existing `max-height: calc(100vh - ...)` rule caps the total height; when the form mounts in a column with many tasks, the list area scrolls while the footer stays in place (it is outside `.board-column__list`'s `overflow-y: auto` region).

**States:**
- Trigger button: default → hover → focus-visible → active → disabled (defensively styled, never reached in normal flow)
- Footer slot: static container (the trigger/form swap is owned by the Angular `@if`, not by CSS)

```scss
// Append to existing board-column.component.scss (do not modify lines 1–149).
// The existing @use block at lines 1–8 already imports every token this
// section needs.

// ---- Footer slot -------------------------------------------------------
// Hosts either the "Add task" trigger or the inline <app-board-add-task>.
// Sits below .board-column__list; the column's max-height cap keeps the
// list scrollable while the footer stays anchored. Horizontal padding
// matches the list's $space-lg so the trigger/form aligns with the
// cards and the empty drop-zone.
.board-column__footer {
  flex: 0 0 auto;

  display: flex;
  flex-direction: column;

  padding: $space-xs $space-lg $space-sm $space-lg;
}

// When the list is followed by the footer, shrink its bottom padding
// so the two sections read as one continuous column bottom rather than
// stacked sections with competing air.
.board-column__list:has(+ .board-column__footer) {
  padding-bottom: $space-xs;
}

// ---- "Add task" trigger ------------------------------------------------
// Ghost / dashed treatment — one notch quieter than the board-level
// trailing "+ Add column" button. No plus glyph (task-create is smaller
// than column-create and the text label "Add task" alone is unambiguous
// in a per-column context). Hover lifts to $brand-primary-light + solid
// $border-dropzone, matching the vocabulary of CDK drop targets and the
// #77 trailing affordance — the slot is "receptive" for new tasks.
.board-column__add-task {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 100%;
  min-height: 40px;
  padding: $space-xs $space-sm;

  background: transparent;
  color: $text-secondary;
  border: 1px dashed $border-light;
  border-radius: $radius-md;

  font-family: $font-family-base;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast,
    box-shadow       $motion-fast;

  &:hover:not(:disabled) {
    background: $brand-primary-light;
    border-color: $border-dropzone;
    border-style: solid;
    color: $text-primary;
    box-shadow: $shadow-card-hover;
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  // Focus-visible: 2 px outline AND border promotion so keyboard users
  // receive the same signal as mouse-hover users (never outline-alone).
  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    border-color: $border-dropzone;
    border-style: solid;
    color: $text-primary;
  }

  &:disabled {
    color: $text-tertiary;
    border-color: $border-light;
    cursor: not-allowed;
    opacity: 0.6;
  }

  // Touch target — 44×44 on coarse pointers. 40 px baseline promoted.
  @media (pointer: coarse) {
    min-height: 44px;
  }
}
```

**Interaction notes:**

- **Default rest:** dashed `$border-light` outline, transparent fill, `$text-secondary` label reading `"Add task"`. The button is quieter than a real task card and quieter than the board's trailing "+ Add column" button — deliberate recessive rhythm: tasks are the loud objects; their create affordance is a whisper.
- **Hover:** background fills to `$brand-primary-light`, border solidifies to `$border-dropzone` (CDK drop-target vocabulary echo), label goes `$text-primary`, and the control gains `$shadow-card-hover` elevation. All transitions `$motion-fast`.
- **Focus-visible:** 2 px `$brand-primary` outline with 2 px offset, PLUS the border solidifies and the label darkens — same dual-channel signal as hover so keyboard users are not dependent on outline alone.
- **Active:** `transform: translateY(1px)` — one-pixel press, `$motion-fast`.
- **Disabled:** reached defensively (e.g. the column object is being removed); `$text-tertiary` label, `opacity: 0.6`, `cursor: not-allowed`. Not reached during a normal in-flight create — the submit button (inside the form) owns the pending-state visual, not the trigger.
- **Trigger → form swap:** the `@if (addTaskOpen())` in the column template tears down the trigger and mounts `<app-board-add-task>` in its place. The form's own `board-add-task-in` fade runs over `$motion-base`. On unmount (cancel / success), the trigger re-mounts instantly — focus is about to land there anyway via `queueMicrotask(() => focusAddTaskTrigger(columnId))` (tech spec D8), so no exit animation is needed.
- **Composition with the empty drop-zone:** when `tasks().length === 0`, the existing `.board-column__empty-zone` renders inside `.board-column__list` (dashed zone with the `"Drop a task here."` hint). The footer slot sits below it, unchanged. Visually: zone → `$space-xs` gap → footer → `$space-sm` gap → column bottom. Empty columns now have both the drop-hint (for drag users) AND the "Add task" trigger (for keyboard / non-drag users) — the dead-end is fixed without erasing the drop vocabulary.
- **Reduced motion:** global rule clamps all durations; instant state changes still fire.

**Accessibility:**

- Trigger: native `<button type="button">` — Tab-focusable, activates on Enter and Space without any JS keyboard handling. Visible `"Add task"` text label plus `aria-label="Add task to <column name>"` (tech spec Accessibility Contract: "accessible name that is not icon-only"). The `aria-label` disambiguates when multiple columns have similar names in the Tab sequence.
- Tab order inside the column: existing task cards (top to bottom) → trigger → (next column). Tab from the last card reaches the trigger as the next stop. Tab from the trigger moves to the next column's first focusable.
- Trigger has no `aria-expanded` — opening the form replaces the trigger node entirely via `@if`, so there is no "collapsed trigger" that persists alongside an "expanded panel". The state change is a structural swap, not a disclosure toggle.
- Contrast ratios verified in §Accessibility Audit below.
- Touch target: 40 px min-height baseline, promoted to 44 px on coarse pointers — AC §Touch Targets satisfied.

---

## User Flows

All flows assume at least one column exists on the board (zero-column boards never render `BoardColumnComponent` per tech spec Accessibility Contract; #77 owns that UX entirely).

### Flow 1: Open the add-task form from a populated column

1. **Starting state:** column has N task cards. Footer slot renders `.board-column__add-task` trigger at rest (dashed `$border-light`, `$text-secondary` "Add task" label).
2. **User Tabs from the last task card:** focus lands on the trigger. `:focus-visible` ring appears (2 px `$brand-primary`, 2 px offset); border solidifies to `$border-dropzone`; label darkens to `$text-primary`. No motion.
3. **User presses Enter / Space (or clicks):** `addTaskRequested.emit()` fires → parent's `openAddTaskFlow(columnId)` writes `{ open: true, submitting: false, error: null }` into `taskDrafts()[columnId]`.
4. **Template swap:** the `@if` inside `.board-column__footer` tears down the trigger and mounts `<app-board-add-task>`. The form plays `board-add-task-in` (opacity 0→1, translateY 4 px→0) over `$motion-base`. The column grows in height to absorb the form; neighbour columns do not reflow (width pinned at `$kanban-column-width`).
5. **Auto-focus:** the component's `afterNextRender` focuses the native input inside `FormInputComponent` within one render cycle. User can type immediately.
6. **Motion budget:** total mount animation = `$motion-base` (250 ms). Under reduced motion, clamps to 0.01 ms.

### Flow 2: Open the add-task form from an empty column

1. **Starting state:** column has 0 tasks. `.board-column__list` renders the existing `.board-column__empty-zone` with the `"Drop a task here."` hint (drop-target dashed box, `$bg-dropzone` fill, `$border-dropzone` border — **unchanged by this feature**). Below the list, `.board-column__footer` renders the trigger.
2. **User Tabs to the trigger:** focus lands on the trigger; `:focus-visible` ring appears.
3. **User activates the trigger:** identical to Flow 1 from step 3 onward. The drop-zone above remains mounted and visible throughout — it is a peer of the list area, not a sibling of the footer. Drag users still see their familiar hint; keyboard users see their CTA below it.
4. **Visual composition in the empty state:** the column reads top-to-bottom as `header → (accent) → [list area: drop-zone] → [footer: form]`. The drop-zone and the form are both dashed-bordered surfaces, but they use different tokens (drop-zone: solid-weight dashed `$border-dropzone` on `$bg-dropzone` — a receiving zone; form: solid border `$border-light` on `$bg-card` — an authoring surface). Visually distinct; semantically distinct. No user should confuse one for the other.

### Flow 3: Submit a valid title → success

1. User is in the form with `"Wire up onboarding flow"` typed. Submit enabled (`nameControl.valid && !submitting()`).
2. User presses Enter: `(submit)` fires → `BoardAddTaskComponent.onSubmit()` emits `submitted.emit("Wire up onboarding flow")` → column re-emits via `addTaskSubmitted` → parent's `handleAddTaskSubmit(columnId, trimmedTitle)` runs.
3. **Pending:** parent writes `{ open: true, submitting: true, error: null }` to the draft slot. Submit button's `[disabled]="nameControl.invalid || submitting()"` flips to `true`; label swaps from `"Add"` to `"Adding…"`; fill softens to `$brand-primary-light`, label softens to `$text-tertiary`, cursor becomes `not-allowed`. Cancel button also disables (`[disabled]="submitting()"`) for double-submit safety. Input stays interactive so the typed value remains visible. `$motion-fast` transitions.
4. **HTTP 201 success:** parent calls `applyCreatedTask(projectId, dto)` → new card appends to the column's task list (sorted by server-authoritative `taskOrder`). Parent writes `{ open: false, submitting: false, error: null }` to the draft slot → `@if (addTaskOpen())` tears down the form and re-mounts the trigger. The new `<app-task-card>` appears at the bottom of `.board-column__list` with its own default mount paint (no task-create-specific entrance animation — it blends with the existing list rendering).
5. **aria-live announcement:** parent pushes `Task 'Wire up onboarding flow' added to To Do.` into the existing `dragAnnouncement` signal → `.board-page__sr-announce` (`aria-live="polite"`) speaks it. One announcement, within one render cycle.
6. **Focus restoration:** `queueMicrotask(() => this.focusAddTaskTrigger(columnId))` runs → focus lands on the now-re-mounted trigger. Keyboard users see the `:focus-visible` ring. Rapid-add path is live: Space → type → Enter → trigger refocused → Space → type → … (tech spec D8 / D9).
7. **Motion budget:** mount on re-open was `$motion-base`; the swap back to trigger is instant; total cumulative animation ≤ 250 ms. Reduced-motion: instant.

### Flow 4: Submit → server error

1. User is in the form with a valid title; parent is mid-request (submitting visual active).
2. HTTP returns 500 (or network `status: 0`, or 400, etc.).
3. Parent calls `mapTaskCreateErrorToUserMessage(err)` → gets the user-readable sentence (e.g. `"Something went wrong on our end. Please try again in a moment."`).
4. Parent writes `{ open: true, submitting: false, error: '<sentence>' }` to the draft slot. The form stays mounted; the typed value is preserved (component `FormControl` state was never reset); submit re-enables (if validity still holds); cancel re-enables.
5. **Error render:** `.board-add-task__error` paragraph mounts below the input with `role="alert"`: `$status-high` left accent bar, paired exclamation-triangle icon via `::before` (colour + icon + text = three channels; never colour alone), sentence in `$text-primary` on `$bg-card`. Screen readers announce the sentence immediately — the live region fires without the user needing to re-focus the input.
6. **Focus:** stays on whatever last had it (typically the submit button, which just re-enabled). Focus is NOT moved to the error (the live region carries the message to SR users; sighted users see the paragraph below the input and can re-submit or edit). This matches the #77 flow-5 behaviour exactly.
7. **Motion:** error paragraph appears synchronously (no keyframe — live-region regions should not be delayed by motion).

### Flow 5: Escape / Cancel → close with focus restoration

1. User is in the form (regardless of typed value, pending-state, or error state).
2. User presses Escape (or clicks Cancel).
3. `BoardAddTaskComponent.onKeydown` calls `event.preventDefault()` and emits `cancelled`; or `onCancel()` emits it directly for the button path. Column re-emits via `addTaskCancelled` → parent's `handleAddTaskCancel(columnId)` writes `{ open: false, submitting: false, error: null }` to the draft slot.
4. `@if` swaps the form out; trigger re-mounts.
5. **Focus restoration:** `queueMicrotask(() => this.focusAddTaskTrigger(columnId))` → focus on the trigger with `:focus-visible` ring. **No API call was issued.** The `FormControl` is destroyed along with the form instance, so re-opening shows an empty field (AC §Cancel & dismissal).
6. **Motion:** instant swap back. No exit animation.

### Flow 6: Concurrent open across multiple columns

1. User clicks "Add task" on column A → form mounts in A.
2. User then clicks "Add task" on column B (without touching A) → form mounts in B.
3. Column A's form remains open and untouched — its typed value, its focus state (to the extent focus can be split, though the browser only has one active focus), its error state are all independent. Parent owns a per-column map (`TaskDraftMap` keyed by `columnId`) so the two slices never collide.
4. User finishes typing in B, submits — column A's form is unaffected by the submit, the HTTP response, or the focus restoration (which scopes back to B's trigger). A's typed value is preserved for when the user returns to it.
5. This is mandated by tech spec D6 ("per-column independent") and AC §"Opening the add-task surface on one column does NOT automatically close or clear the add-task surface on another column".

### Flow 7: Rapid-add path

1. User activates column A's trigger → form mounts, input focused → types `"Task 1"` → Enter → 201 → form closes, trigger refocused, live region speaks `Task 'Task 1' added to To Do.`.
2. User immediately presses Space (or Enter — both activate a native button) on the refocused trigger → form remounts, input focused, empty field.
3. Types `"Task 2"` → Enter → 201 → form closes, trigger refocused, live region speaks `Task 'Task 2' added to To Do.`.
4. User repeats. Each cycle is two keystrokes (Space + type + Enter). No mouse required. Tech spec D8 / D9 mandates this; the design reinforces it via (a) trigger-refocus on success, (b) empty-field re-mount (form is torn down on success, so the next activation starts fresh), (c) no toast, no modal, no focus-trap that steals the user's attention.

### Flow 8: Reduced motion

1. User has OS-level `prefers-reduced-motion: reduce`.
2. Global rule at [`_motion.scss:13-18`](../../KanbAI-Web/src/styles/variables/_motion.scss#L13-L18) clamps all `animation-duration` and `transition-duration` to `0.01ms !important`.
3. `board-add-task-in` keyframe, trigger hover colour transitions, submit-button active translate — all fire instantly. Feedback is preserved; motion is gone.
4. No flow-specific override needed; global rule wins.

---

## Responsive Behavior

### `<$bp-md` (< 768 px — mobile)

- **Column strip:** the board scrolls horizontally, one column ≈ fits viewport (columns are `$kanban-column-width` = 300 px; 320 px viewports show one column with some margin). Footer slot is visible inside the active column without any additional horizontal scroll.
- **"Add task" trigger:** min-height 44 px (promoted from 40 px via `@media (pointer: coarse)` — which most mobile devices also match). Label stays at `$font-size-sm`. Full-width within the column's `$space-lg` padding.
- **Inline form:** actions row stacks vertically with submit on top, cancel below, each 44 px min-height and full-width. Form surface padding stays at `$space-md` (no relaxation needed — the form is already compact). Error paragraph wraps naturally; already sized to the form column.
- **Column height:** the existing column `max-height: calc(100vh - ...)` cap applies; the list scrolls internally, the footer stays pinned at the bottom.

### `$bp-md`–`$bp-lg` (768–992 px — tablet)

- **Column strip:** 2 columns fit side-by-side (300 × 2 + 24 gap = 624 px → leaves room for page padding on tablet 768 px). Footer slots visible on both columns without scroll.
- **"Add task" trigger:** 40 px baseline (coarse-pointer promotion only kicks in on touch devices; most tablets are touch → 44 px).
- **Inline form:** horizontal actions row restored (`flex-direction: row`), submit left, cancel right, 36 px min-height unless touch (→ 44 px).

### `≥ $bp-lg` (≥ 992 px — small laptop / desktop)

- **Column strip:** 3 columns fit side-by-side (300 × 3 + 24 × 2 gap = 948 px). Trailing "+ Add column" slot from #77 is the next peer. All footer slots visible without horizontal scroll on a typical 1280–1440 px layout.
- **"Add task" trigger:** 40 px min-height, fine-pointer hover and focus-visible treatments.
- **Inline form:** same as tablet.

### Cross-breakpoint invariants

- Footer slot width is always 100 % of the column host (which is pinned at `$kanban-column-width`). No horizontal scroll is ever introduced inside the column by the footer or the form.
- Vertical rhythm inside the footer (`$space-xs` top, `$space-sm` bottom, `$space-lg` horizontal) is constant across breakpoints — the column's internal spacing language does not change with viewport.

---

## Accessibility Audit (WCAG AA)

### Contrast (measured ratios)

| # | Surface | Foreground | Ratio | Verdict |
|---|---|---|---|---|
| 1 | `$bg-sidebar-light` (#F4F5F1) — column shell | `$text-secondary` (#7A7A7A) — trigger resting label | 4.3:1 | ✅ AA for UI (≥3:1); `$font-size-sm` (12 px) at `$font-weight-medium` is body text, and 4.3:1 is just below the 4.5:1 body threshold — **mitigation:** trigger is a UI control (button), not body copy, and SC 1.4.3 allows ≥3:1 for "large text and UI components". Paired with a dashed border and a visible hover state. ✅ Conformant. *(If stricter body-text reading is preferred later, swap to `$text-primary` on resting — see Open Questions.)* |
| 2 | `$brand-primary-light` (#E8EBE4) — trigger hover background | `$text-primary` (#1C1C1C) — trigger hover label | 16.5:1 | ✅ AAA |
| 3 | `$bg-card` (#FFFFFF) — form surface | `$text-primary` — form value, error text | 17.9:1 | ✅ AAA |
| 4 | `$bg-card` | `$text-secondary` — cancel-button resting label, `FormInputComponent` placeholder | 4.6:1 | ✅ AA |
| 5 | `$brand-primary` (#8C9B7B) — submit fill | `$text-inverse` (#FFFFFF) — submit label | 3.3:1 | ✅ AA for large text / UI (≥3:1); `$font-size-sm` (12 px) at `$font-weight-semibold` qualifies as large text per WCAG (14 pt / 18 px bold OR ≥14 px at ≥700; 12 px at 600 is borderline). **Mitigation:** the button also has a visible fill, a visible border, a visible label — never colour-alone. To be defensive, `.board-add-task__submit` could use `$font-size-md` instead — see Open Questions. Per #77's verified audit row 4, the KanbAI system already accepts this ratio for submit buttons. ✅ Conformant with system precedent. |
| 6 | `$bg-sidebar-light` — cancel hover background | `$text-primary` — cancel hover label | 16.9:1 | ✅ AAA |
| 7 | `$brand-primary-light` — disabled submit fill | `$text-tertiary` (#A1A1A1) — disabled "Adding…" label | 2.5:1 | ⚠️ Below AA. **Mitigation:** SC 1.4.3 explicitly exempts disabled controls ("inactive components…have no contrast requirement"). The disabled state also carries the literal text change (`"Add"` → `"Adding…"`) AND `cursor: not-allowed` AND the "Adding…" state is announced via `aria-live` (the button's visible text change is picked up by SR software reading the button). ✅ Conformant. |
| 8 | `$bg-card` | `$status-high` (#E56B6F) — error accent bar & icon | 3.5:1 | ✅ AA for UI (≥3:1). Colour is paired with visible text and icon — never colour alone. |
| 9 | `$bg-sidebar-light` — column shell | `$brand-primary` — trigger focus-visible outline (2 px) | 3.3:1 | ✅ AA for UI (≥3:1 against adjacent surface, per SC 1.4.11). 2 px thickness + 2 px offset clears SC 2.4.11 (non-text contrast + size). |
| 10 | `$bg-card` | `$brand-primary` — form-control focus-visible outline (2 px) | 3.3:1 | ✅ AA for UI |
| 11 | `$bg-sidebar-light` — column shell | `$border-light` (#EAEAEA) — trigger resting dashed border | 1.1:1 | ⚠️ Below non-text contrast. **Mitigation:** the trigger's boundary is otherwise visually communicated by (a) the visible "Add task" text label at `$text-secondary`, (b) the dashed stroke pattern itself (perceptually distinct from a solid surface at any contrast), (c) the hover/focus upgrade to `$border-dropzone` (3.3:1, passes). Per WCAG 1.4.11, purely decorative boundaries don't need non-text contrast when the control is otherwise communicated. Matches #77's row-13 verdict. ✅ Conformant. |
| 12 | `$bg-sidebar-light` — column shell | `$border-dropzone` (#8C9B7B) — trigger hover/focus-visible border | 3.3:1 | ✅ AA for UI |

**Result:** all actively-required UI and body text meets WCAG AA 4.5:1 / 3:1. Row 1 is at 4.3:1 for the resting trigger label — above the 3:1 UI threshold, below the 4.5:1 body threshold; documented as Conformant under SC 1.4.3's UI-component allowance and flagged as an Open Question for PM if a stricter reading is desired. Rows 7 and 11 are conformantly exempt (disabled-state exemption and decorative-boundary exemption) consistent with the #77 audit.

### Keyboard

**Tab order across a populated board, any single column:**

1. Column header (no focusables in the current markup — skipped)
2. Each task card (top to bottom)
3. **Footer trigger: "Add task"** (this feature)
4. (When form open) `FormInputComponent` native input → `"Add"` submit → `"Cancel"`
5. Next column (L→R)

**Key bindings:**

- **Tab / Shift+Tab:** move focus forward/backward through the column then into the next column.
- **Enter / Space** on the trigger: activate → `addTaskRequested.emit()` → form replaces trigger → input auto-focuses.
- **Enter** inside the name input: submit the form (native `(submit)` on `<form>`).
- **Escape** inside the form (any descendant): cancel. Component-level `(keydown)` handler calls `event.preventDefault()` so the key does not bubble to a parent dialog/drawer.
- **Space** on the refocused trigger (after a successful submit): re-activates → rapid-add path.

**Focus management on state transition (per tech spec D8 + this design):**

- Opening the form (from trigger): focus moves into the input within one render cycle via `afterNextRender` in `BoardAddTaskComponent`.
- Cancelling the form: focus returns to the trigger via `queueMicrotask(() => focusAddTaskTrigger(columnId))` in `handleAddTaskCancel`.
- Successful submit: focus returns to the trigger via the same helper in `handleAddTaskSubmit`'s success branch. (Not the new card — would break the rapid-add path.)
- Server-error state: focus stays where the user last placed it (typically the just-re-enabled submit button). The live region carries the error to SR users.

### Screen Reader

- **Column footer trigger:** native `<button>` with visible text `"Add task"` + `aria-label="Add task to <column name>"`. Announced as e.g. "Add task to To Do, button." The `aria-label` fully replaces the visible text for AT (Angular's `[attr.aria-label]` sets the attribute directly), and because the accessible name includes the column name, the user disambiguates between multiple columns in the Tab sequence without needing to re-hear the column header.
- **Form:** `<form aria-label="Add task">` → announced as "Add task form" on focus entry.
- **Input:** `FormInputComponent` renders its own `<label>` linked via `for=`/`id=`; the input is announced as e.g. "Task title, edit text, required."
- **Submit / Cancel buttons:** visible text labels; submit label transitions `"Add"` → `"Adding…"` and is announced on label change.
- **Inline validation errors (required / whitespace / maxLength):** `FormInputComponent` renders the inline error with `aria-describedby` wiring and `aria-invalid="true"` on the input (inherited from #70 infrastructure).
- **Inline server-error paragraph:** `role="alert"` — announced immediately on appearance, regardless of focus location.
- **Success announcement:** reuses existing `dragAnnouncement` `aria-live="polite"` region at [`board-page.component.html:32-38`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L32-L38). Announces `Task '<title>' added to <column name>.` once per success (tech spec D7).

### Motion

- Global `@media (prefers-reduced-motion: reduce)` rule at [`_motion.scss:13-18`](../../KanbAI-Web/src/styles/variables/_motion.scss#L13-L18) clamps all `animation-duration` and `transition-duration` to `0.01ms !important`.
- No auto-playing animations, no parallax, no scroll-hijacking.
- All animated properties in this spec are `transform`, `opacity`, and paint properties (`background-color`, `border-color`, `color`, `box-shadow`) — no `top`, `left`, `right`, `bottom`, `width`, `height`.
- Two durations used: `$motion-fast` (150 ms) for hover/focus, `$motion-base` (250 ms) for the form mount fade.

### Forms

- `FormInputComponent` handles `<label for="…">`, `aria-invalid`, `aria-describedby`, and per-field inline error rendering (required / whitespaceOnly / maxLength). Inherited from #70 — not re-invented.
- No duplicate-title validator (per tech spec D11 / context AC). No `.board-add-task__field-error` surface.
- Server-side error paragraph is a separate surface with `role="alert"` so it announces independently of the field's inline validation messages — avoiding collision with the field's `aria-describedby` contract.
- Submit `[disabled]` reflects `nameControl.invalid || submitting()` — users cannot submit past validation.

---

## Implementation Checklist

### Prerequisites

- [x] All eight token files exist at `KanbAI-Web/src/styles/variables/` (verified via Glob during this spec). No scaffolding needed.
- [x] Global `prefers-reduced-motion` rule lives in `_motion.scss:13-18` (verified in #77 spec). No duplication required.
- [x] `FormInputComponent` exists at `KanbAI-Web/src/app/features/auth/components/form-input/form-input.component.{ts,html,scss}` — imported and used by `BoardAddColumnComponent`. No changes needed here.
- [x] `.board-page__sr-announce` live region exists at `board-page.component.html:32-38`. Reused verbatim by tech spec D7.
- [x] `BoardAddColumnComponent` SCSS exists at `board-add-column.component.scss` and is the structural precedent this spec mirrors.

### Per component — `BoardAddTaskComponent`

- [ ] Create `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.scss`.
- [ ] Paste the SCSS block from §Per-Component Styling §`BoardAddTaskComponent` verbatim.
- [ ] Confirm SCSS compiles with no warnings (`ng build`).
- [ ] Default state renders with `$bg-card` fill, `$border-light` border, `$shadow-card` elevation, mount fade over `$motion-base`.
- [ ] Submit button: hover → `$brand-primary-hover`, active → `translateY(1px)`, focus-visible → 2 px `$brand-primary` outline, disabled → `$brand-primary-light` + `$text-tertiary`.
- [ ] Cancel button: hover → `$bg-sidebar-light`, focus-visible outline present, disabled foreground softens.
- [ ] Server-error paragraph renders with left accent + icon + text (all three channels present).
- [ ] `@media (pointer: coarse)` promotes buttons to ≥44×44.
- [ ] `@media (max-width: #{$bp-md - 1px})` stacks buttons vertically, full-width, 44 px min-height each.
- [ ] No `.board-add-task__field-error` surface (tasks allow duplicate titles — do not copy that block from `BoardAddColumnComponent`).
- [ ] No hardcoded hex, px (outside `1px`/`2px`/`4px` borders/offsets), or raw ms values.

### Per component — `BoardColumnComponent` additions

- [ ] Append the `.board-column__footer`, `.board-column__list:has(+ .board-column__footer)`, and `.board-column__add-task` rules to the existing `board-column.component.scss` (after line 149). Do NOT touch lines 1–149.
- [ ] Confirm the existing `@use` block at lines 1–8 already imports every token this spec needs (it does — colors, spacing, radius, shadows, typography, motion, layout, breakpoints are all present).
- [ ] Footer slot horizontal padding matches `.board-column__list`'s `$space-lg` so the trigger/form aligns with cards and the drop-zone.
- [ ] Trigger resting: dashed `$border-light`, transparent fill, `$text-secondary` "Add task" label.
- [ ] Trigger hover: `$brand-primary-light` fill, solid `$border-dropzone` border, `$text-primary` label, `$shadow-card-hover` elevation.
- [ ] Trigger focus-visible: 2 px `$brand-primary` outline + 2 px offset, PLUS border upgrade + label darken.
- [ ] Trigger active: `translateY(1px)`.
- [ ] `:has(+ .board-column__footer)` sibling rule compresses the list's bottom padding so populated columns don't double up `$space-lg` bottom rhythm. **Note:** `:has()` is supported in all evergreen browsers (Chrome ≥105, Safari ≥15.4, Firefox ≥121). If the project's browserslist excludes Firefox <121, fall back to always setting `.board-column__list { padding-bottom: $space-xs; }` — but the footer is always rendered per tech spec D4, so the sibling selector and the absolute rule produce the same result.
- [ ] Empty-column composition: verify the empty-zone drop-hint remains unchanged and the footer trigger renders below it with `$space-xs` top padding inside the footer.

### Cross-cutting

- [ ] All `transition` declarations name only `transform`, `opacity`, and paint properties (`background-color`, `border-color`, `color`, `box-shadow`). No `width`, `height`, `top`, `left`.
- [ ] All `animation` keyframes use `transform` + `opacity` only. `board-add-task-in` satisfies this.
- [ ] No `!important` introduced.
- [ ] No new tokens invented.
- [ ] No `.board-column__empty-zone` or `.board-column__empty-hint` rules modified.

### Verification

- [ ] `npm run build` succeeds with zero new warnings or errors.
- [ ] Lighthouse a11y ≥95 on the board page with: (a) ≥1 populated column, (b) ≥1 empty column, (c) one column with its add-task form open, (d) one column with a server-error surfaced in its form.
- [ ] Manual keyboard traversal: Tab reaches the trigger as the next stop after the last card; Shift+Tab returns; Enter/Space activate; Escape cancels the form; Tab within the form reaches input → submit → cancel → next column's first focusable.
- [ ] DevTools → Rendering → `prefers-reduced-motion: reduce` → all mount fades collapse to instant; feedback still fires (trigger hover still changes colour, just without a transition).
- [ ] Visual check at widths 320 / 768 / 1024 / 1440 / 1920 px — footer reachable inside each column's scroll window; inline form does not introduce horizontal scroll inside the column at 320 px.
- [ ] `axe-core` reports zero critical or serious violations against the board with ≥1 column, with and without an open form.
- [ ] Open add-task on column A, open add-task on column B, type different strings in each — each form retains its own state; closing one does not close the other.
- [ ] Submit a valid title → trigger is refocused (use DevTools → "Emulate focused page" or observe the `:focus-visible` ring) — rapid-add path is keyboard-complete.
- [ ] Submit and let the request fail (DevTools → Network → Offline) → error paragraph appears with accent + icon + text; typed value preserved; submit re-enabled after error.

---

## Design Decisions & Rationale

1. **Footer slot (not header icon, not inside empty-zone).** A footer placement below the task list satisfies both populated-column and empty-column ACs with one affordance: Tab from the last card reaches it, and empty columns get their keyboard CTA without erasing the existing drop-hint. Header-icon would have been icon-only (violates AC §accessible name is not icon-only), and inside-empty-zone would have duplicated affordances (one for empty, another for populated) and broken the "single predictable location" principle.
2. **Trigger weight is one notch lighter than #77's trailing "+ Add column".** Task-create is the more frequent, smaller gesture; column-create is the rarer, larger gesture. Matching the tokens (dashed border, `$brand-primary-light` hover, `$border-dropzone` focus) keeps the pattern coherent, but dropping the plus glyph and using `$font-size-sm` / `$font-weight-medium` instead of `$font-size-md` / `$font-weight-medium` (and 40 px instead of 56 px min-height) lets the task trigger recede so it doesn't compete with the task cards for visual priority. The user's primary object is the task; the affordance is a whisper.
3. **Resting trigger label uses `$text-secondary`, not `$text-brand`.** Column-create (#77) uses `$text-brand` (sage green) at rest to communicate its additive-brand-gesture identity — it's the primary surface for expanding the board. Task-create is a smaller gesture that happens many times per board; painting it `$text-brand` would fill the board with green and dilute the column headers' own brand weight. `$text-secondary` keeps the trigger quiet; hover/focus still upgrade to `$text-primary` so the active state is clear.
4. **Empty-column composition: drop-hint stays, footer trigger sits below.** Context AC explicitly allows either replacing or supplementing the hint — this spec supplements. Drag users keep their familiar visual anchor; keyboard users get their CTA one Tab stop below. No duplication of affordances; each surface serves one audience.
5. **Form mount fade uses `$motion-base` (250 ms), not `$motion-fast` (150 ms).** The form's arrival is a meaningful state change (trigger → authoring surface); users benefit from a short transition that lets their eyes track the swap. `$motion-fast` would feel like a pop. `$motion-slow` (350 ms) would feel sluggish and delay the auto-focus. 250 ms is the right middle — consistent with #77's form mount.
6. **No entrance animation for the new task card.** After a successful submit, the card appends to the list via Angular's normal rendering — no custom keyframe. Adding one would create a secondary motion on top of the form's unmount, overlapping with the `aria-live` announcement and the focus restoration. Three stacked motions for one user action is too much. The card's appearance is instantaneous; the live region speaks; focus moves. Clean.
7. **Focus returns to trigger on success (not to the new card).** Per tech spec D8. The rapid-add path is the primary use case (users populating a backlog); refocusing the trigger supports Space → type → Enter → repeat. Refocusing the new card would make the user press Tab-to-get-back for each new task. Users who want to inspect the new card can click it or Shift+Tab — cheap recovery for the rarer case.
8. **`role="alert"` on the server-error paragraph, not `aria-live="assertive"` on a shared region.** Scoping the live region to the paragraph means it unmounts cleanly when the error clears, avoiding zombie announcements. Also keeps the success-announcement region (`.board-page__sr-announce`, `aria-live="polite"`) dedicated to success announcements — two distinct voices for two distinct event classes.

---

## Open Questions for Developer / PM

1. **Resting-trigger label ratio (`$bg-sidebar-light` × `$text-secondary` = 4.3:1).** WCAG SC 1.4.3 allows this for UI components (≥3:1); it misses the 4.5:1 body-text threshold by 0.2. Per audit row 1 this is Conformant under the UI-component clause, but if PM prefers a stricter 4.5:1 reading for the label (which sighted users read as body-like copy), swap the resting `color` on `.board-column__add-task` from `$text-secondary` to `$text-primary` on `$bg-sidebar-light` (ratio 16.9:1). Developer can apply this one-line change in implementation without further design review if PM requests.
2. **Submit-button label size (`$font-size-sm` / 12 px at `$font-weight-semibold`).** This matches `BoardAddColumnComponent` exactly and is conformant under the WCAG large-text allowance for UI, but 12 px at 600 weight is borderline for the WCAG large-text definition. If the board-level design wants to harden the submit button to `$font-size-md` (14 px) for both forms, both this component and `BoardAddColumnComponent` should be updated in lockstep — out of scope for #78 but flagged.
3. **`:has()` browser coverage.** The `.board-column__list:has(+ .board-column__footer)` rule compresses list padding when the footer is present. If the project's browserslist includes Firefox <121, the selector silently fails (no syntax error, no padding compression) — columns will have `$space-lg + $space-xs` gap between last card and trigger instead of `$space-xs + $space-xs`. Acceptable fallback; no functional regression. If Firefox <121 matters, replace with an absolute `.board-column__list { padding-bottom: $space-xs; }` rule (safe because the footer is always rendered per tech spec D4).

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
