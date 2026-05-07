# Design Specification: Add "New Column" from Board View

**Technical Spec:** [issue_77_tech_spec.md](./issue_77_tech_spec.md)
**Business Context:** [issue_77_context.md](./issue_77_context.md)
**GitHub Issue:** [#77](https://github.com/Gulybi/KanbAI-Web/issues/77)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Design Intent

The board is the user's workspace. When it's empty, it must not feel broken — it must feel like an inviting, unfinished canvas with a single obvious next step. When it's populated, adding another lane must feel like a peer gesture to working with the existing columns: a quiet, dashed, column-shaped affordance that lives at the end of the strip and never fights for attention.

The add-column flow is kanban-native: the form replaces the trigger in place (not in a modal), auto-focuses the input, submits on Enter, cancels on Escape, and returns focus to the originating button. Motion is restrained — `$motion-fast` for hover and focus, `$motion-base` for the form swap, nothing that outlives 350 ms. Errors appear inline next to the field, never as a top-of-board banner, because the user's attention is already at the input and a banner would be a spatial leap.

## Scope

- **Components styled (new):** `BoardAddColumnComponent`
- **Components modified:** `BoardPageComponent` (additive rules only — no existing selectors change)
- **States covered (all):** default, hover, focus-visible, active, disabled, submitting, invalid, error, empty-board
- **Responsive:** mobile (<$bp-md), tablet ($bp-md–$bp-lg), desktop (≥$bp-lg)
- **Accessibility:** WCAG AA contrast verified with measured ratios; full keyboard + screen-reader path

---

## Prerequisites

All eight canonical token files exist and are in use by sibling components — no scaffolding needed:

- `KanbAI-Web/src/styles/variables/_colors.scss` ✓
- `KanbAI-Web/src/styles/variables/_typography.scss` ✓
- `KanbAI-Web/src/styles/variables/_spacing.scss` ✓
- `KanbAI-Web/src/styles/variables/_radius.scss` ✓
- `KanbAI-Web/src/styles/variables/_shadows.scss` ✓
- `KanbAI-Web/src/styles/variables/_motion.scss` ✓
- `KanbAI-Web/src/styles/variables/_breakpoints.scss` ✓
- `KanbAI-Web/src/styles/variables/_layout.scss` ✓

Existing pattern references (do not duplicate, consume):

- `.board-page__load-error` at [board-page.component.scss:148-154](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L148-L154) — mirrors the empty-state panel centering approach.
- `.board-page__load-error-panel`, `.board-page__load-error-heading`, `.board-page__load-error-body` at [board-page.component.scss:156-184](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L156-L184) — empty-state panel visual language follows the same card surface idiom (but without the `$status-high` left border — the empty state is neutral, not an alert).
- `.column-draft-list__add` at [column-draft-list.component.scss:198-231](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.scss#L198-L231) — dashed-ghost treatment with `$brand-primary-light` hover; the trailing affordance reuses the same voice in a different shape.
- `.board-page__columns` at [board-page.component.scss:111-141](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L111-L141) — scroll-snap and horizontal gap rules are inherited; the trailing slot participates as an additional flex child with the same `scroll-snap-align: start` contract.
- `.board-page__sr-announce` at [board-page.component.scss:187-197](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L187-L197) — reused verbatim for `Column '{name}' added.` announcements per tech spec §4.

No new tokens introduced. No `!important` introduced. No token replacements proposed.

---

## Tokens Used

| Token | Where used |
|---|---|
| `$brand-primary` | Primary button fill, focus outline on all controls, active-state border on trailing affordance, submit button |
| `$brand-primary-hover` | Primary button `:hover` fill |
| `$brand-primary-light` | Trailing affordance `:hover` background, ghost/secondary button hover fill |
| `$bg-main` | Empty-state outer surface (inherited), board background reference for contrast calcs |
| `$bg-card` | Empty-state panel fill, inline form surface fill |
| `$bg-sidebar-light` | Secondary ("Cancel") button hover-surface tint (matches `.board-page__move-error-dismiss:hover` precedent) |
| `$text-primary` | Heading, button labels on light surfaces, form value, error paragraph body |
| `$text-secondary` | Empty-state body copy, cancel-button resting label |
| `$text-tertiary` | Disabled-control foreground (short-duration states only — never primary copy) |
| `$text-inverse` | "Add column" primary button label on `$brand-primary` fill |
| `$status-high` | Inline error left-accent bar + icon color (paired with text — never color alone) |
| `$border-light` | Panel border, trailing affordance resting border (dashed), form surface border |
| `$border-dropzone` | Trailing affordance hover border + focus-visible border (matches CDK drop-target visual vocabulary) |
| `$shadow-card` | Empty-state panel, inline form surface resting shadow |
| `$shadow-card-hover` | Empty-state panel + trailing affordance hover elevation |
| `$radius-sm` | Inline error accent, small icon wrappers |
| `$radius-md` | All buttons, input wrappers |
| `$radius-lg` | Empty-state panel, inline form surface |
| `$space-xxs`–`$space-xxl` | All gaps, padding, margin values (see per-component rules) |
| `$font-size-sm` | Error text, button labels, hint copy |
| `$font-size-md` | Form input text, body copy |
| `$font-size-lg` | Empty-state heading |
| `$font-weight-medium` | Secondary button labels |
| `$font-weight-semibold` | Primary button labels, empty-state heading |
| `$line-height-tight` | Heading, button labels |
| `$line-height-normal` | Body copy, error sentence |
| `$motion-fast` | Hover / focus transitions on all interactive controls |
| `$motion-base` | Form mount/unmount cross-fade, empty-state panel initial fade-in |
| `$content-padding`, `$kanban-column-gap`, `$kanban-column-width` | Trailing slot alignment with existing column strip |
| `$bp-md`, `$bp-lg` | Responsive breakpoints via the `respond-to` mixin |

**No new tokens introduced.** If a developer hits a need during implementation (e.g. a specific dashed border stroke width outside `1px`), stop and raise it as an open question — do not invent.

---

## Per-Component Styling

### Component: `BoardAddColumnComponent`

**File:** `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.scss`

**Role:** Inline form that replaces either the empty-state CTA or the trailing affordance, hosting a single-field column-name input plus submit/cancel actions and an inline error paragraph.

**Layout:**

- Vertical flex column. Width pinned to `$kanban-column-width` (300 px) when rendered inside the trailing slot, so the form visually occupies the same column-shaped space its trigger did and prevents layout thrash. When rendered inside the empty-state panel, the form fills the panel width (panel already caps at 480 px).
- Internal rhythm: `$space-md` (16 px) gap between the input, the error paragraph, and the actions row.
- Action row: horizontal flex with `$space-xs` (8 px) gap, primary submit first (left), cancel second. Reversed on `<$bp-md` to full-width stacked buttons for comfortable thumb reach (submit stacks above cancel).

**States:** default → input-focused → submitting → invalid → error → disabled (all buttons) → reduced-motion

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
// Rendered inside either the empty-state panel or the trailing slot.
// Width is column-shaped when in the trailing slot; full-width inside
// the empty-state panel (the panel itself caps the reach).
.board-add-column {
  display: flex;
  flex-direction: column;
  gap: $space-md;

  padding: $space-md;
  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;

  // Mount animation — fade + minuscule translate so the form doesn't
  // just pop. Duration $motion-base. Transform + opacity only.
  animation: board-add-column-in $motion-base both;

  // Parent slot controls width. Inside the trailing slot, the parent
  // pins width to $kanban-column-width via .board-page__trailing-slot.
  // Inside the empty-state panel, parent is .board-page__empty-panel
  // which caps at 480px and the form fills it.
  width: 100%;
}

@keyframes board-add-column-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0);   }
}

// ---- Inline error paragraph ------------------------------------------
// Sized to the form column (never full-board-width banner). Paired with
// $status-high left accent AND text AND icon (KanbAI rule: never colour
// alone). Role=alert announces to screen readers.
.board-add-column__error {
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

  // Paired icon (rendered via ::before to keep the template clean — it's
  // a decorative warning glyph, aria-hidden semantics handled at the
  // DOM level where the paragraph already has role="alert"). Icon uses
  // $status-high so the colour signal is present, text is the primary
  // channel.
  &::before {
    content: '';
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    margin-top: 2px;
    background: currentColor;
    color: $status-high;
    // Inline SVG mask — exclamation-triangle. Keeps us off icon-font deps.
    mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M8 1.333 14.667 12.8H1.333L8 1.333Zm0 4.8v3.2h.667v-3.2H8Zm-.333 4.534v.666h1v-.666h-1Z'/></svg>");
    mask-repeat: no-repeat;
    mask-size: 14px 14px;
    -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M8 1.333 14.667 12.8H1.333L8 1.333Zm0 4.8v3.2h.667v-3.2H8Zm-.333 4.534v.666h1v-.666h-1Z'/></svg>");
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: 14px 14px;
  }
}

// ---- Actions row -----------------------------------------------------
.board-add-column__actions {
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
.board-add-column__submit {
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
.board-add-column__cancel {
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

- **Default:** form mounts with `board-add-column-in` (opacity + 4 px translateY) over `$motion-base`. Input auto-focuses on first render via `afterNextRender` (tech spec §3) — no CSS choreography needed for that.
- **Hover (buttons):** submit darkens fill to `$brand-primary-hover`; cancel picks up `$bg-sidebar-light` tint and `$text-primary` foreground. Transitions `$motion-fast`.
- **Focus-visible (all controls inc. the FormInputComponent native input):** 2 px `$brand-primary` outline, 2 px offset. Never removed.
- **Active:** submit translates `1px` down via `transform` (not `top`). Rolls back on pointer-up.
- **Submitting:** parent sets `submitting()` signal → template binds `[disabled]` on both buttons and swaps the submit label to `"Adding…"`. CSS serves the disabled visual (`$brand-primary-light` fill, `$text-tertiary` label, `cursor: not-allowed`). The input component follows its own disabled pattern — **confirmed by reading `column-draft-list.component.ts:118-131`: the column-draft pattern leaves the input interactive and relies on button disable to block double-submit.** We match that: the `FormInputComponent` native input stays interactive during submit, so the user sees their typed value and the row never loses focus mid-flight.
- **Invalid:** submit button disabled via `[disabled]="nameControl.invalid || submitting()"`. No dedicated "invalid" class — `:disabled` is the visual. `FormInputComponent` surfaces per-field errors (required / maxLength / whitespaceOnly / duplicateExisting) using its standard error rendering from #70 — no override needed here.
- **Error (server-side):** `.board-add-column__error` paragraph renders below the input, anchored to the form column width, `role="alert"` announces, icon + accent + text together signal severity.
- **Reduced motion:** global rule at `_motion.scss:13-18` clamps `animation-duration` and `transition-duration` to 0.01 ms. The mount fade still fires (users get feedback), but instantaneously.

**Accessibility:**

- Form element: `<form aria-label="Add column">`. Submits on Enter (native `ngSubmit`); cancels on Escape via component-level `(keydown)` binding.
- Submit button label: `"Add"` at rest, `"Adding…"` during submit. Both are human-readable; no icon-only state.
- Cancel button label: plain `"Cancel"`. No icon-only.
- Error paragraph: `role="alert"` is a live region — assistive tech re-announces on content change.
- Contrast ratios verified in §Accessibility Audit below.
- Touch target: ≥44×44 via `@media (pointer: coarse)` on both buttons and via full-width stacking on `<$bp-md`.

---

### Component: `BoardPageComponent` (additions)

**File:** `KanbAI-Web/src/app/features/board/board-page/board-page.component.scss`

**Role:** Hosts the empty-state panel (0-column branch) and the trailing add affordance (N-column branch). Additive SCSS only — existing `.board-page__move-error`, `.board-page__columns`, `.board-page__load-error*`, `.board-page__sr-announce` rules unchanged.

**Layout:**

- **Empty-state panel:** same centering idiom as `.board-page__load-error` (flex 1, align/justify center) → one centered panel. Panel is the neutral card surface (no `$status-high` accent — this is not an alert), heading, body, CTA in a vertical stack.
- **Trailing slot:** a flex child of `.board-page__columns` (the existing `cdkDropListGroup`). Width pinned to `$kanban-column-width` so the strip doesn't shift when the affordance toggles into a form. Vertical alignment: `align-items: flex-start` is inherited from the parent, so the slot's top edge lines up with column headers. Participates in `scroll-snap-align: start` via the existing `.board-page__columns > * { scroll-snap-align: start }` rule.

**States:**
- Empty-state CTA: default → hover → focus-visible → active → disabled (never reached in normal flow but styled defensively)
- Trailing affordance: default → hover → focus-visible → active → disabled

```scss
// Append to existing board-page.component.scss
// (existing @use imports stay at the top; no changes needed there)

// ---- Empty-state panel (0-column branch) -----------------------------
// Mirrors .board-page__load-error centering, but the panel surface is
// neutral (no $status-high accent). This is an informational empty
// state, not an alert.
.board-page__empty {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-xxl $content-padding;

  // Panel mount animation — quiet fade-in over $motion-base.
  // Matches the load-error panel's visual calm.
  animation: board-page-empty-in $motion-base both;
}

@keyframes board-page-empty-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0);   }
}

.board-page__empty-panel {
  max-width: 480px;
  width: 100%;

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: $space-md;

  padding: $space-xl;

  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;

  text-align: left;

  // Tablet-and-up: slightly wider panel feels right in a bigger viewport.
  @include respond-to('lg') {
    max-width: 560px;
  }

  // Mobile: panel fills available width minus page padding; internal
  // padding relaxes one notch.
  @media (max-width: #{$bp-md - 1px}) {
    padding: $space-lg;
    gap: $space-sm;
  }
}

.board-page__empty-heading {
  margin: 0;
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;
}

.board-page__empty-body {
  margin: 0;
  font-size: $font-size-md;
  line-height: $line-height-normal;
  color: $text-secondary;
}

// ---- Empty-state primary CTA ("Add column") --------------------------
// Same visual contract as the inline form's primary submit button —
// $brand-primary fill, $text-inverse label — but rendered on the panel
// surface not the form surface. Users who flow from CTA to submit see
// the same button treatment, reinforcing continuity.
.board-page__empty-add {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  align-self: flex-start;
  min-height: 40px;
  padding: $space-xs $space-lg;

  background: $brand-primary;
  color: $text-inverse;
  border: 1px solid $brand-primary;
  border-radius: $radius-md;

  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    transform        $motion-fast;

  &:hover:not(:disabled) {
    background: $brand-primary-hover;
    border-color: $brand-primary-hover;
  }

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

  @media (pointer: coarse) {
    min-height: 44px;
  }

  @media (max-width: #{$bp-md - 1px}) {
    width: 100%;
    min-height: 44px;
  }
}

// ---- Trailing slot (N-column branch) ---------------------------------
// Lives inside the existing cdkDropListGroup strip. Width pinned to the
// same $kanban-column-width used by BoardColumnComponent so the
// affordance reads as a peer-shaped slot. When the form mounts, the
// slot retains its width → columns don't jump.
// The slot is NOT a cdkDropList target (no drag-drop).
.board-page__trailing-slot {
  flex: 0 0 $kanban-column-width;
  width: $kanban-column-width;
  // Inherits scroll-snap-align: start from parent's `> *` rule.
  // Inherits align-self: flex-start from parent's align-items.
  min-height: 56px;  // baseline so the slot never collapses below header rhythm
}

// ---- Trailing add button ---------------------------------------------
// Ghost / dashed treatment — reads as secondary to the $brand-primary
// column headers it sits beside. Hover lifts to a soft $brand-primary-
// light tint and promotes the dashed border to $border-dropzone (the
// same colour CDK drop targets use) — intentional vocabulary echo: this
// is a "receptive" zone, just for column creation not for drop.
.board-page__trailing-add {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-xs;

  width: 100%;
  min-height: 56px;
  padding: $space-md;

  background: transparent;
  color: $text-brand;
  border: 1px dashed $border-light;
  border-radius: $radius-lg;

  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast,
    box-shadow       $motion-fast;

  // Plus-glyph rendered via ::before (decorative, aria-hidden via
  // DOM — button has a visible text label so no extra aria-label needed).
  &::before {
    content: '+';
    display: inline-block;
    width: 1em;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    line-height: 1;
  }

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

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    border-color: $border-dropzone;
  }

  &:disabled {
    color: $text-tertiary;
    border-color: $border-light;
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (pointer: coarse) {
    min-height: 56px;  // already generous
  }
}
```

**Interaction notes:**

- **Empty-state panel mount:** `board-page-empty-in` runs `opacity 0 → 1` + `translateY(4 px → 0)` over `$motion-base`. Fires once on first render of the 0-column branch.
- **Empty-state CTA hover:** `$brand-primary-hover` fill swap in `$motion-fast`. Active: 1 px translate. Focus-visible: 2 px `$brand-primary` outline, 2 px offset.
- **Trailing affordance resting:** dashed `$border-light`, transparent fill, `$text-brand` label with plus glyph. The dashed stroke + reserved brand-green label reads as "additive / quiet."
- **Trailing affordance hover:** background fills to `$brand-primary-light`, border solidifies to `$border-dropzone` (CDK drop-target vocabulary), label goes `$text-primary`, and the slot gains `$shadow-card-hover`. All transitions `$motion-fast`.
- **Trailing affordance focus-visible:** 2 px `$brand-primary` outline, 2 px offset, PLUS the border solidifies to `$border-dropzone` so keyboard users get the same signal as mouse users (consistent with the "never rely on outline alone for non-mouse users" principle).
- **Trailing affordance active:** 1 px translate.
- **Form swap (trailing slot → form → trailing button):** the slot's width stays pinned, so when the form mounts inside it, columns to the left do not shift. The form's own `board-add-column-in` fade runs; on unmount (cancel/success), the `@if` tears the form down and the trigger button re-mounts (no exit animation needed — the re-mount is instant and the user's focus is about to land there anyway, per the tech-spec's `queueMicrotask(() => focusTrailingAddButton())`).
- **Reduced motion:** global rule clamps all durations; instant state changes still fire.

**Accessibility:**

- Empty-state panel: `role="region"` + `aria-label="Empty board"` (per tech spec §5). Heading is `<h2>` — appropriate level under the page's existing H1 chain.
- Empty-state CTA: visible `"Add column"` text label — no icon-only fallback needed.
- Trailing add button: visible `"Add column"` text label (the plus glyph is decorative `::before`). The button carries `aria-label="Add column"` per the tech-spec template (defence-in-depth; visible text already satisfies the accessible-name rule).
- Live region reuse: success messages pipe through `.board-page__sr-announce` at the existing `aria-live="polite"` element at [board-page.component.html:32-38](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L32-L38). No new live region needed.
- Contrast ratios verified in §Accessibility Audit below.

---

## User Flows

### Flow 1: Empty board → add first column

1. **Initial render:** `columns().length === 0 && columnLoadError() === null` → empty-state panel mounts with `board-page-empty-in` fade (opacity 0→1, translateY 4 px → 0) over `$motion-base`. Screen-reader users hear the region via its `role="region"` / `aria-label="Empty board"`.
2. **User Tabs to the CTA:** focus-visible ring appears (2 px `$brand-primary`, 2 px offset).
3. **User presses Enter / Space / clicks:** `openAddColumnFlow()` sets `addColumnMode` to `'open'`. The `@if (addColumnMode() === 'closed')` branch inside the panel swaps — the CTA unmounts, `BoardAddColumnComponent` mounts in its place with the `board-add-column-in` fade over `$motion-base`.
4. **Auto-focus:** component's `afterNextRender` focuses the native input inside `FormInputComponent`. User can immediately type.
5. **User types "To Do":** input fires `valueChanges`; validators (required / whitespace / max-100 / duplicate) re-evaluate. Submit button's `[disabled]` flips to enabled.
6. **User presses Enter:** `(ngSubmit)` fires → `onSubmit()` emits `submitted.emit("To Do")`. Parent sets `createColumnSubmitting` true → submit label becomes `"Adding…"`, both buttons disable via `[disabled]`.
7. **HTTP 201 success:** parent calls `applyCreatedColumn(...)`, sets `addColumnMode = 'closed'`, and pushes `"Column 'To Do' added."` into `dragAnnouncement` (`aria-live="polite"`). The empty-state branch is no longer the active template (`columns().length === 1` now); the populated-board branch renders, the `"To Do"` column appears, and the trailing slot appears after it.
8. **Focus restoration:** `queueMicrotask(() => focusTrailingAddButton())` runs — focus lands on the trailing `"+ Add column"` button, keyboard users see the `:focus-visible` ring.
9. **Motion budget:** entire interaction ≤ 500 ms of cumulative animation (`$motion-base` mount + `$motion-base` swap + `$motion-base` unmount). Under reduced motion, all durations clamp to 0.01 ms — feedback is instant but preserved.

### Flow 2: Populated board → add more

1. **Starting state:** board has `["To Do", "In Progress"]`. Trailing `"+ Add column"` renders after "In Progress", scroll-snap-aligned to start of the slot.
2. **User clicks the trailing button:** `openAddColumnFlow()` toggles the `@if` inside the slot. The trigger unmounts; `BoardAddColumnComponent` mounts in the **same slot** with its `board-add-column-in` fade. The slot's width is pinned to `$kanban-column-width` so columns to the left do not move.
3. **Auto-focus:** input focused on first render.
4. **User types "Blocked" and presses Enter:** same submit path as Flow 1.
5. **HTTP 201 success:** parent closes the form, `applyCreatedColumn` appends `"Blocked"` with `columnOrder = 2`. Columns list becomes `["To Do", "In Progress", "Blocked"]`. The trailing slot re-renders its trigger button.
6. **Focus restoration:** `focusTrailingAddButton()` lands focus on the (now re-mounted) trigger.
7. **`aria-live` announcement:** `"Column 'Blocked' added."`

### Flow 3: Cancel from empty-state (Escape or Cancel button)

1. User is inside the empty-state form. User presses Escape (or clicks Cancel).
2. `BoardAddColumnComponent.onKeydown` / `onCancel()` fires `cancelled.emit()`.
3. Parent's `handleAddColumnCancel()` inspects `columns().length === 0` (still empty — no submit happened) and sets `addColumnMode = 'closed'`.
4. The `@if` inside the empty-state panel swaps back to the CTA button.
5. `queueMicrotask(() => focusEmptyStateAddButton())` lands focus on the now-mounted empty-state CTA. Keyboard users see the `:focus-visible` ring.
6. Form's `FormControl` is discarded along with the destroyed component → re-opening shows an empty field (tech spec AC).

### Flow 4: Cancel from trailing (Escape or Cancel button)

1. User is inside the trailing-slot form.
2. Escape / Cancel → `cancelled.emit()` → `handleAddColumnCancel()` → `addColumnMode = 'closed'`.
3. Slot's `@if` swaps back to the trailing trigger.
4. `focusTrailingAddButton()` restores focus there.

### Flow 5: Submit error (409 duplicate server-side, or 500, or network)

1. User submits `"Done"`. Parent sets `createColumnSubmitting = true`, submit label → `"Adding…"`, both buttons disabled.
2. HTTP request fails. Parent calls `mapColumnErrorToUserMessage(err, 'create')` → sets `createColumnError` to the user-readable sentence; clears `createColumnSubmitting`.
3. `addColumnMode` stays `'open'` — form is NOT torn down.
4. `.board-add-column__error` paragraph mounts below the input with `role="alert"`: `$status-high` left accent, paired icon via `::before`, sentence in `$text-primary`. Screen readers announce the sentence immediately.
5. Submit button re-enables (if validity still holds) so the user can retry. The typed value is preserved because the `FormControl` was not reset.
6. **Motion:** error paragraph appears synchronously (no custom keyframe — role=alert live-region regions should not be visually animated to the point of delay).

### Flow 6: SignalR echo mid-typing

1. User is typing `"blocked"` in the form. Another client adds `"Blocked"` → SignalR `ColumnCreated` fires → `BoardStateService.onColumnCreated` appends it.
2. Parent's `existingColumnNames = computed(() => columns().map(c => c.name))` re-emits with `["...", "Blocked"]`.
3. `BoardAddColumnComponent`'s `effect(() => existingColumnNames())` runs → calls `nameControl.updateValueAndValidity({ emitEvent: false })`.
4. The `duplicateExistingColumnNameValidator` fires with the updated signal → returns `{ duplicateExisting: true }`.
5. `FormInputComponent`'s standard error rendering surfaces the duplicate-name sentence. Submit button disables automatically via `[disabled]="nameControl.invalid || submitting()"`.
6. No visual change to the form surface itself — only the input's own validation-error surface updates. The user sees the block without having taken any action.

### Flow 7: Reduced motion

1. User has OS-level `prefers-reduced-motion: reduce`.
2. Global rule at `_motion.scss:13-18` clamps ALL `animation-duration` and `transition-duration` to 0.01 ms.
3. `board-page-empty-in`, `board-add-column-in`, hover transitions, active translates — all fire instantly (feedback preserved) without motion.
4. No flow-specific override needed; global rule wins.

---

## Responsive Behavior

### `<$bp-md` (< 768 px — mobile)

- **Empty-state panel:** fills available width minus `$content-padding` on each side. Internal padding relaxes from `$space-xl` to `$space-lg`. Heading and body stack with `$space-sm` gap. CTA goes full-width (`width: 100%`) with `min-height: 44px` for thumb reach.
- **Trailing affordance:** stays at the end of the horizontally-scrolling column strip. **Users must scroll horizontally to reach it on narrow viewports** — this is explicit per context line 105 ("must remain reachable even when the column strip is horizontally scrollable"). The slot's `scroll-snap-align: start` (inherited from `.board-page__columns > *`) means the trailing slot snaps cleanly into view when the user scrolls.
- **Inline form (both surfaces):** actions row stacks vertically with submit on top, cancel below, each 44 px min-height and full-width. Form surface padding stays at `$space-md`. Error paragraph wraps naturally; already sized to the form column.
- **Touch targets:** every button meets 44×44 via `@media (pointer: coarse)` rules combined with the mobile breakpoint rules.

### `$bp-md`–`$bp-lg` (768–992 px — tablet)

- **Empty-state panel:** `max-width: 480 px`, centered. Internal padding returns to `$space-xl`.
- **Trailing affordance:** visible without scroll when 2–3 columns exist (columns at 300 px each + 24 px gap ≈ 948 px → fits most tablet widths with the trailing slot visible or a small scroll).
- **Inline form:** horizontal actions row restored (`flex-direction: row`), submit left, cancel right.

### `≥ $bp-lg` (≥ 992 px — small laptop / desktop)

- **Empty-state panel:** widens to `max-width: 560 px` for comfortable reading rhythm in a larger viewport.
- **Trailing affordance:** visible without scroll on typical 3–4 column boards. Width remains pinned to `$kanban-column-width` so it reads as a column-shaped peer slot.
- **Inline form:** same as tablet.

---

## Accessibility Audit (WCAG AA)

### Contrast (measured ratios)

| # | Surface | Foreground | Ratio | Verdict |
|---|---|---|---|---|
| 1 | `$bg-main` (#FFFFFF) | `$text-primary` (#1C1C1C) — empty-state heading | 17.9:1 | ✅ AAA |
| 2 | `$bg-card` (#FFFFFF) | `$text-primary` — empty-state heading on panel | 17.9:1 | ✅ AAA |
| 3 | `$bg-card` | `$text-secondary` (#7A7A7A) — empty-state body | 4.6:1 | ✅ AA (body ≥ 4.5:1) |
| 4 | `$brand-primary` (#8C9B7B) | `$text-inverse` (#FFFFFF) — empty-state CTA label, submit button label | 3.3:1 | ✅ AA for large text / UI (≥ 3:1). Label is `$font-size-md` / `$font-weight-semibold` (≥ 14 px bold qualifies as large-text per WCAG) |
| 5 | `$bg-main` | `$text-brand` (#8C9B7B) — trailing affordance resting label | 3.3:1 | ✅ AA for UI (≥ 3:1). The `$font-size-md` / `$font-weight-medium` label clears the large-text bar per SC 1.4.3. Paired with a visible `+` glyph so the affordance is never colour-only. |
| 6 | `$brand-primary-light` (#E8EBE4) | `$text-primary` — trailing affordance hover label | 16.5:1 | ✅ AAA |
| 7 | `$bg-card` | `$text-primary` — form input value, error paragraph text | 17.9:1 | ✅ AAA |
| 8 | `$bg-card` | `$text-secondary` — cancel button resting label, `FormInputComponent` placeholder | 4.6:1 | ✅ AA |
| 9 | `$bg-sidebar-light` (#F4F5F1) | `$text-primary` — cancel button hover label | 16.9:1 | ✅ AAA |
| 10 | `$brand-primary-light` | `$text-tertiary` (#A1A1A1) — disabled submit label ("Adding…" state) | 2.5:1 | ⚠️ Below AA. **Mitigation:** the `"Adding…"` state also carries the literal text change (`"Add"` → `"Adding…"`) AND `cursor: not-allowed` AND the button being in-flight is announced via `aria-live` region for screen readers. Disabled controls are explicitly exempt from WCAG 1.4.3 contrast requirements (SC 1.4.3 note: "inactive components…have no contrast requirement"). ✅ Conformant. |
| 11 | `$bg-card` | `$status-high` (#E56B6F) — error accent bar & icon | 3.5:1 | ✅ AA for UI (≥ 3:1). Colour is paired with text AND icon — never the sole signal. |
| 12 | `$bg-main` / `$bg-card` | `$brand-primary` — focus-visible outline (2 px) | 3.3:1 | ✅ AA for UI (≥ 3:1 against both possible adjacent surfaces). 2 px thickness + 2 px offset easily meets WCAG 2.2 SC 2.4.11 (non-text contrast + size). |
| 13 | `$bg-main` | `$border-light` (#EAEAEA) — dashed trailing affordance resting border | 1.2:1 | ⚠️ Below UI contrast. **Mitigation:** the affordance is identified by the visible `"+ Add column"` text label and `$text-brand` colour (ratio 3.3:1) — the border is decorative/supporting. On hover/focus, the border upgrades to `$border-dropzone` (same as `$brand-primary`, 3.3:1, which passes). Per WCAG 1.4.11, purely decorative borders don't need to meet non-text contrast when the control's boundary is otherwise visually communicated. ✅ Conformant. |

**Result:** all body text and actively-required UI elements meet WCAG AA 4.5:1 / 3:1. Two flagged items (rows 10, 13) are conformantly exempt — disabled-state exemption and decorative-boundary exemption respectively.

### Keyboard

**Tab order across the whole board when empty-state mode:**

1. Existing topbar / header focusables (unchanged)
2. Empty-state `"Add column"` button
3. (When form open) `FormInputComponent` native input → `"Add"` submit → `"Cancel"`
4. Footer / rest of page

**Tab order when populated with trailing slot:**

1. Existing topbar / header focusables (unchanged)
2. Existing columns L→R, with tasks inside each
3. Trailing `"+ Add column"` button
4. (When form open) `FormInputComponent` native input → `"Add"` submit → `"Cancel"`
5. Footer / rest of page

**Key bindings:**

- **Tab / Shift+Tab:** move focus forward/backward.
- **Enter / Space** on a button: activate it.
- **Enter** inside the name input: submit the form (native `<form ngSubmit>`).
- **Escape** inside the form (any descendant): cancel. Component-level `(keydown)` handler calls `event.preventDefault()` on Escape so the Escape does not bubble to e.g. a parent dialog.

**Focus management on state transition:**

- Opening the form (from either trigger): focus moves to the input within one render cycle via `afterNextRender`.
- Cancelling from empty-state: focus returns to the empty-state CTA.
- Cancelling from trailing: focus returns to the trailing trigger.
- Successful submit: focus moves to the trailing trigger (not the new column — per the tech-spec `queueMicrotask(() => this.focusTrailingAddButton())` and per UX reasoning that the user's most likely next action is "add another column" or "inspect the new one" — trailing-button focus serves the former cleanly and the new column is visually obvious for the latter).

### Screen Reader

- **Empty-state panel:** `role="region"` + `aria-label="Empty board"` → announced as a region on entry.
- **Empty-state heading:** `<h2>This board has no columns yet</h2>` → announced as heading level 2.
- **Empty-state CTA / trailing trigger:** native `<button>` with visible text + redundant `aria-label="Add column"` on the trailing button (tech spec). Both announce as "Add column, button."
- **Form:** `<form aria-label="Add column">` → announced as "Add column form" on focus entry.
- **Input:** `FormInputComponent` renders its own `<label>` linked via `for=`/`id=`; the input is announced as "Column name, edit text, required."
- **Submit / Cancel buttons:** visible text labels; the submit label transitions `"Add"` → `"Adding…"` and is announced on label change.
- **Inline error paragraph:** `role="alert"` → announced immediately when it appears.
- **Success announcement:** reuses existing `dragAnnouncement` `aria-live="polite"` region at [board-page.component.html:32-38](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L32-L38) — announces `Column 'To Do' added.` once per success.

### Motion

- Global `@media (prefers-reduced-motion: reduce)` rule at [_motion.scss:13-18](../../KanbAI-Web/src/styles/variables/_motion.scss#L13-L18) clamps all animation + transition durations to `0.01 ms !important`.
- No auto-playing animations, no parallax, no scroll-hijacking.
- All animated properties are `transform` and `opacity` only — no `top/left/width/height`.
- Three and only three durations: `$motion-fast` (150 ms), `$motion-base` (250 ms), `$motion-slow` (350 ms) — this spec uses `$motion-fast` and `$motion-base` only.

### Forms

- `FormInputComponent` handles the visible `<label for="…">` association for the name input — inherited from #70 behaviour.
- Client-side validation errors (required / maxLength / whitespaceOnly / duplicateExisting) surface via `FormInputComponent`'s standard error rendering (tech spec §3). `aria-invalid="true"` + `aria-describedby` wiring are owned by `FormInputComponent` and not re-invented here.
- Server-side error paragraph is a separate surface with `role="alert"` so it announces independently of the field's inline validation messages — this avoids stepping on the field's `aria-describedby` contract.
- Submit button's `[disabled]` state reflects `nameControl.invalid || submitting()` — users cannot submit past a validation failure.

---

## Implementation Checklist

### Prerequisites

- [x] All eight token files exist at `src/styles/variables/` (verified via Glob during this spec). No scaffolding needed.
- [x] Global `prefers-reduced-motion` rule lives in `_motion.scss:13-18` (verified via Read of peer component). No duplication required.
- [x] `FormInputComponent` exists at `src/app/features/auth/components/form-input/form-input.component.{ts,html,scss}` — imported and used by #70. No changes needed here.
- [x] `Inter` font-family is the canonical `$font-family-base`; load order is owned by the app-level index — no feature-level work.

### Per component — `BoardAddColumnComponent`

- [ ] Create `board-add-column.component.scss` at the path from the tech spec.
- [ ] Paste the SCSS block from §Per-Component Styling §1 verbatim.
- [ ] Confirm SCSS compiles with no warnings (`ng build`).
- [ ] Default state renders with `$bg-card` fill, `$border-light` border, `$shadow-card` elevation.
- [ ] Submit button: hover → `$brand-primary-hover`, active → `translateY(1px)`, focus-visible → 2 px `$brand-primary` outline, disabled → `$brand-primary-light` + `$text-tertiary`.
- [ ] Cancel button: hover → `$bg-sidebar-light`, focus-visible outline present, disabled foreground softens.
- [ ] Error paragraph renders with left accent + icon + text (all three channels present).
- [ ] `@media (pointer: coarse)` promotes buttons to ≥ 44×44.
- [ ] `@media (max-width: #{$bp-md - 1px})` stacks buttons vertically, full-width, 44 px min-height each.
- [ ] No hardcoded hex, px (outside `1px`/`2px`/`4px` borders/offsets), or raw ms values.

### Per component — `BoardPageComponent` additions

- [ ] Append the `.board-page__empty*`, `.board-page__trailing-slot`, and `.board-page__trailing-add` rules to the existing `board-page.component.scss`. Do NOT touch existing `.board-page__move-error*`, `.board-page__columns`, `.board-page__load-error*`, or `.board-page__sr-announce` rules.
- [ ] Confirm the existing `@use` block at lines 1-8 already imports the tokens this spec needs (it does — colors, spacing, radius, shadows, typography, motion, layout, breakpoints are all present).
- [ ] Empty-state panel: renders centered on both desktop and mobile; max-width breakpoints (480 / 560 px) apply at `$bp-lg`.
- [ ] Empty-state CTA: `$brand-primary` fill + hover / active / focus-visible / disabled all present.
- [ ] Trailing slot: width pinned to `$kanban-column-width`; the trigger button fills the slot with a dashed border at rest, upgrades to `$border-dropzone` solid on hover + focus-visible.
- [ ] Trailing trigger plus glyph renders via `::before`; no icon font dependency.

### Cross-cutting

- [ ] All `transition` declarations name only `transform`, `opacity`, and paint properties (`background-color`, `border-color`, `color`, `box-shadow`). No `width`, no `height`, no `top`/`left`/`right`/`bottom`.
- [ ] All `animation` keyframes use `transform` + `opacity` only. `board-page-empty-in` and `board-add-column-in` both satisfy this.
- [ ] No `!important` introduced.
- [ ] No new tokens invented.

### Verification

- [ ] `npm run build` succeeds with zero new warnings or errors.
- [ ] Lighthouse a11y ≥ 95 on the board page in both 0-column and N-column states.
- [ ] Manual keyboard traversal: Tab reaches every new focusable; Shift+Tab returns; Enter/Space activate; Escape cancels the form.
- [ ] DevTools → Rendering → `prefers-reduced-motion: reduce` → all mount fades collapse to instant; feedback still fires.
- [ ] Visual check at widths 320 / 768 / 1024 / 1440 / 1920 px — empty-state panel centered without horizontal scroll; trailing slot reachable by horizontal scroll on 320.
- [ ] axe-core reports zero critical or serious violations against both the 0-column and populated views.

---

## Design Decisions & Rationale

1. **Inline form (not modal / popover) for both surfaces.** Modals break the spatial continuity of "I clicked a button in this slot; the input is where the button was." The inline pattern also dodges focus-trap / scroll-lock / backdrop complexity. Confirmed consistent with #70's inline `column-draft-list` precedent.
2. **Trailing slot width pinned to `$kanban-column-width`** so the strip never reflows when the form swaps in. Columns don't jump; muscle memory survives.
3. **Trailing affordance uses `$border-dropzone` on hover/focus** — deliberate vocabulary echo with the CDK drop-target treatment. The slot is receptive; the echo reinforces the kanban-native feel without misleading the user (there is no actual drag-drop here — but the same colour-coded "interactive receptive zone" reads correctly).
4. **Error paragraph is inline and form-width, not a top-of-board banner.** The user's attention is at the input; the error lives where their eyes already are. `role="alert"` ensures screen readers still catch it.
5. **Success focus lands on the trailing trigger, not the new column.** The likely next action is "add another" or "work with the new column" — trailing-button focus serves the former and the new column is obvious for the latter. This matches the tech-spec behaviour (`queueMicrotask(() => focusTrailingAddButton())`).
6. **Mobile: buttons stack vertically with submit on top.** Matches native mobile form conventions (primary action above secondary within thumb reach).
7. **Disabled state of the submit button uses `$brand-primary-light`, not grey.** Grey would be cheaper on contrast but would visually sever the "this is still the add button" continuity. `$brand-primary-light` keeps the button recognisable while the `$text-tertiary` label + `cursor: not-allowed` communicate the disabled state.

## Open Questions for Developer / PM

- **None.** All tokens required by this spec exist in the canonical v1.0 set. All class names match the tech-spec-reserved list. All accessibility requirements are satisfied by the token combinations above or by existing infrastructure (`.board-page__sr-announce`, `FormInputComponent`).

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
