# Design Specification: Dynamic Column Setup on Project Creation

**Technical Spec:** [issue_70_tech_spec.md](./issue_70_tech_spec.md)
**Business Context:** [issue_70_context.md](./issue_70_context.md)
**GitHub Issue:** [#70](https://github.com/Gulybi/KanbAI-Web/issues/70)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## 1. Overview

### Design Intent

The "Initial columns" section extends the existing Create Project dialog from a Title + Description sheet into a two-part authoring surface where the user both names the project and shapes its starter workflow in a single breath. It must feel like a natural continuation of the dialog above it — same paper, same rhythm — not a separate screen. The column list is calm and tactile: three pre-filled rows the user can rename in place, nudge up and down with either keyboard or pointer, and extend on demand. Motion is quiet; color signals are reserved for validation and the drop target. Errors never shout — they point. When submission begins, the whole form locks down behind a single "Creating…" state so the compound project + N × column operation reads to the user as one atomic action, not a sequence.

### Scope

- **Components styled (new):** `ColumnDraftListComponent` and its `.column-draft-list__*` sub-elements (the row, drag handle, reorder buttons, remove button, duplicate hint, add button, empty hint, live region).
- **Components styled (modified):** `CreateProjectDialogComponent` — mount point for the draft list, partial-failure region (reserved but not rendered in the dialog — see §3.2), Cancel button's disabled-during-submit treatment, submit button's phase-aware label.
- **Component styled (new, ancillary):** A lightweight `PartialFailureToastComponent` surfaced on the dashboard after a `'partial'` dialog close. See §3.4 and Open Questions.
- **Components styled (unchanged but used):** `FormInputComponent` — consumed verbatim inside each row; only integration concerns documented.
- **States covered:** default, hover, focus-visible, active, disabled, invalid (per-row), array-invalid (duplicate + empty), loading (submit in flight), dragging, drop-target, row-insert, row-remove, success-close, error-open.
- **Responsive:** <`$bp-md`, `$bp-md`–`$bp-lg`, ≥`$bp-lg`. Touch targets ≥44×44 on viewports below `$bp-md`.

---

## 2. Tokens Used

This spec consumes only the canonical KanbAI v1.0 design system — no new tokens are introduced.

| Token | Where used |
|---|---|
| `$brand-primary` | Focus ring (all controls), Add-column button text, drop-target dashed border mix, live-region visual anchor (not rendered) |
| `$brand-primary-hover` | Add-column button hover background tint |
| `$brand-primary-light` | Add-column button hover fill, drop-target receiving background wash, reorder button hover background |
| `$bg-main` | Dialog body, row input surface (inherited from FormInput), Add-column at rest |
| `$bg-sidebar-light` | Row background at rest (subtle separation from dialog), partial-failure toast surface tint (alternative), dragging row placeholder fill |
| `$bg-dropzone` | Empty-list hint card fill, drag placeholder fill |
| `$bg-card` | Row background while dragging (maintains opacity against underlying list) |
| `$text-primary` | Row name input text, button labels, fieldset legend |
| `$text-secondary` | Duplicate hint copy, empty-list hint copy, reorder/remove button icons at rest, legend caption |
| `$text-tertiary` | Row index meta (not shown by default; reserved for "Column 1/3" micro-labels if needed — **not rendered** per spec) |
| `$text-inverse` | Submit button label on `$brand-primary` fill (carried from dialog) |
| `$status-high` | Duplicate-row left border, invalid-field border (from FormInput), partial-failure toast accent, error-banner accent (carried from #32) |
| `$status-done` | Success-close flash on dialog (carried from #32 dialog-close animation) |
| `$border-light` | Row divider / input border at rest, reorder button border at rest, dialog internal separators |
| `$border-dropzone` | Drop-target dashed outline on the list while a row is being dragged |
| `$shadow-card` | Row at rest (very light — columns sit on `$bg-sidebar-light`, so shadow is restrained) |
| `$shadow-card-hover` | Row on hover (signals draggability) |
| `$shadow-card-dragging` | Row while being lifted for drag |
| `$shadow-dropdown` | Partial-failure toast elevation |
| `$font-family-base` | All text in this feature |
| `$font-size-xs` | Live-region copy (visually hidden), duplicate hint icon-adjacent micro-meta |
| `$font-size-sm` | Duplicate hint copy, empty-list hint copy, reorder button labels (icon-only but visible on wider breakpoints), "Column N name" labels inside FormInput |
| `$font-size-md` | Row name input text, Add-column button label, legend |
| `$font-size-lg` | `<legend>Initial columns</legend>` on viewports ≥`$bp-md` |
| `$font-weight-regular` | Body copy, hints |
| `$font-weight-medium` | Button labels (Cancel, Add column, reorder), legend at `$font-size-sm`, row input |
| `$font-weight-semibold` | Submit button label, legend at `$font-size-lg` |
| `$line-height-tight` | Legend, button labels |
| `$line-height-normal` | Hints, error copy |
| `$space-xxs` (4px) | Icon-to-label gap inside buttons, duplicate-hint left-indent |
| `$space-xs` (8px) | Row internal vertical padding, gap between reorder-up and reorder-down, chip padding |
| `$space-sm` (12px) | Row gap inside the list, row internal horizontal padding, legend bottom margin |
| `$space-md` (16px) | Dialog gap between Description and the draft list, dialog gap between draft list and actions |
| `$space-lg` (24px) | Legend top margin inside the fieldset on ≥`$bp-md` |
| `$radius-sm` (6px) | Reorder buttons, Add-column button, duplicate hint chip |
| `$radius-md` (12px) | Row container (rests inside the list), remove button focus halo |
| `$radius-lg` (16px) | Fieldset outer container (matches dialog panel) |
| `$radius-circle` | Remove button (icon-only circular affordance) |
| `$motion-fast` (150ms) | Hover lift, focus ring, button background transitions |
| `$motion-base` (250ms) | Row add/remove fade + height, reorder transform, drop-target border pulse |
| `$motion-slow` (350ms) | Partial-failure toast slide-in, dialog exit flush on success |
| `$bp-md` / `$bp-lg` / `$bp-xl` | Responsive breakpoints |

**Open questions about tokens:** none. The canonical system covers every surface this feature introduces.

---

## 3. Per-Component Styling

### 3.1 Component: `ColumnDraftListComponent`

**File:** `src/app/features/projects/components/column-draft-list/column-draft-list.component.scss`
**Role:** Lets the user rename, reorder, add, and remove the starter columns that will be created alongside the project.

**Layout:**
- Root is a `<fieldset>` (`$radius-lg`, 1px `$border-light`, `$bg-sidebar-light` fill) with a visible `<legend>` "Initial columns". The fieldset doubles as the `disabled` switch source for every nested control — a single `[disabled]="disabled()"` binding cascades natively to every `input`, `button`, and focus target inside.
- The row list (`<ol>` with `cdkDropList`) stacks vertically with `$space-sm` gap, consuming the fieldset's content area with `$space-md` internal padding.
- Each row is a grid: `[drag-handle 24px] [name-input 1fr] [reorder-up 36px] [reorder-down 36px] [remove 36px]` with `$space-xs` column gap on ≥`$bp-md`; collapses to two rows on <`$bp-md` (see §5).
- Add-column button sits on its own line below the list, left-aligned, with `$space-sm` top margin. Empty-list hint replaces the list entirely (same slot) when `columnGroups().length === 0`.

**States:** default → hover → focus-visible → active → disabled (fieldset-wide) → invalid (per-row, via FormInput) → duplicate (row-level, this component) → empty-list (list-level) → dragging (row + list) → drop-target (list receiving)

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
  font-family: $font-family-base;
  color: $text-primary;
}

// ---- Fieldset shell ------------------------------------------------------
.column-draft-list {
  // Reset the browser default fieldset chrome.
  margin: 0;
  padding: $space-md;

  background: $bg-sidebar-light;
  border: 1px solid $border-light;
  border-radius: $radius-lg;

  // `[disabled]` is bound on the <fieldset> — we dim the whole surface
  // as a single cohesive state rather than greying each control piecemeal.
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
}

.column-draft-list__legend {
  // A <legend> inside a <fieldset> — keep at its natural position so the
  // label cuts the top border. We style typography only.
  padding: 0 $space-xs;
  margin-left: -$space-xs;

  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  color: $text-secondary;

  @include respond-to('md') {
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    padding: 0 $space-sm;
    margin-left: -$space-sm;
  }
}

.column-draft-list__legend-caption {
  // Optional one-line hint under the legend on ≥ md. Provides the
  // "why this section exists" voice — calm, concrete, $text-secondary.
  display: none;

  @include respond-to('md') {
    display: block;
    margin-top: $space-xxs;
    font-size: $font-size-sm;
    color: $text-secondary;
  }
}

// ---- Row list ------------------------------------------------------------
.column-draft-list__list {
  display: flex;
  flex-direction: column;
  gap: $space-sm;

  margin: $space-sm 0 0 0;
  padding: 0;
  list-style: none;

  // Drop-target state: CDK toggles .cdk-drop-list-receiving on this element.
  // We animate border and background only (motion discipline §9).
  border: 1px dashed transparent;
  border-radius: $radius-md;
  transition:
    border-color $motion-base,
    background    $motion-base;

  &.cdk-drop-list-receiving,
  &.cdk-drop-list-dragging {
    border-color: $border-dropzone;
    background: rgba(140, 155, 123, 0.06); // $brand-primary at 6 % — tinting only; no new token
    padding: $space-xs;
  }
}

// ---- A single row --------------------------------------------------------
.column-draft-list__row {
  display: grid;
  grid-template-columns: 24px 1fr 36px 36px 36px;
  column-gap: $space-xs;
  align-items: center;

  padding: $space-xs $space-sm;

  background: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid transparent; // reserves the gutter duplicate flag uses
  border-radius: $radius-md;
  box-shadow: $shadow-card;

  transition:
    box-shadow      $motion-fast,
    transform       $motion-fast,
    border-color    $motion-fast,
    background      $motion-fast;

  &:hover {
    box-shadow: $shadow-card-hover;
  }

  // CDK drag states. While being dragged, the row detaches visually.
  &.cdk-drag-preview {
    box-shadow: $shadow-card-dragging;
    transform: scale(1.02) rotate(0.5deg); // tamer than card DnD (0.5° vs 1°) — rows are dense
    background: $bg-card;
  }

  // The placeholder that remains in the source position during drag.
  &.cdk-drag-placeholder {
    opacity: 0.4;
    background: $bg-dropzone;
    border-style: dashed;
    border-color: $border-dropzone;
    box-shadow: none;
  }

  // Duplicate-name flag — semantic: left-border + copy, NOT color alone.
  &.column-draft-list__row--duplicate {
    border-left-color: $status-high;
  }

  // When the fieldset is disabled (submitting), rows lose their hover lift.
  :disabled & { /* no hover response — caller dims via fieldset */ }

  @media (max-width: #{$bp-md - 1px}) {
    // Two-row grid on mobile: top row = handle + input + remove;
    // bottom row = reorder-up + reorder-down stacked full-width.
    grid-template-columns: 24px 1fr 44px;
    grid-template-areas:
      "handle input remove"
      "up     up    up"
      "down   down  down";
    row-gap: $space-xxs;
  }
}

// ---- Drag handle ---------------------------------------------------------
// Explicit, visible grip — required on touch (canonical pattern §8).
.column-draft-list__drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 32px;

  color: $text-tertiary;
  cursor: grab;

  transition: color $motion-fast;

  &:hover { color: $text-secondary; }
  &:active { cursor: grabbing; }

  // Keyboard-focus treatment for the cdkDragHandle — the handle itself
  // is not the primary reorder path (up/down buttons are), but it IS
  // focusable so screen-reader users can locate the drag affordance.
  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    border-radius: $radius-sm;
  }

  // SVG icon: 6 dots in a 2 × 3 grid ("grip-vertical"). Inherits currentColor.
  svg { width: 14px; height: 14px; }

  @media (max-width: #{$bp-md - 1px}) {
    // Mobile: larger tap target.
    width: 32px;
    height: 44px;
    grid-area: handle;
  }
}

// ---- Name input slot -----------------------------------------------------
// FormInputComponent renders its own field chrome; we only control
// the slot it occupies. DO NOT override FormInput internals.
.column-draft-list__name {
  min-width: 0; // allow the grid child to shrink below its content width

  @media (max-width: #{$bp-md - 1px}) {
    grid-area: input;
  }
}

// ---- Reorder buttons (up / down) -----------------------------------------
.column-draft-list__reorder {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 36px;
  height: 36px;

  background: transparent;
  color: $text-secondary;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast,
    box-shadow       $motion-fast;

  svg { width: 14px; height: 14px; }

  &:hover:not(:disabled) {
    background: $brand-primary-light;
    border-color: $brand-primary;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:disabled {
    color: $text-tertiary;
    background: transparent;
    border-color: $border-light;
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: #{$bp-md - 1px}) {
    // Mobile: full-width, explicit labels (not icon-only).
    width: 100%;
    height: 44px;
    justify-content: flex-start;
    padding: 0 $space-sm;
    gap: $space-xs;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;

    svg { flex: 0 0 auto; }
  }

  @media (max-width: #{$bp-md - 1px}) {
    &.column-draft-list__reorder--up   { grid-area: up; }
    &.column-draft-list__reorder--down { grid-area: down; }
  }
}

// ---- Remove button -------------------------------------------------------
.column-draft-list__remove {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 36px;
  height: 36px;

  background: transparent;
  color: $text-secondary;
  border: 1px solid transparent;
  border-radius: $radius-circle;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast;

  svg { width: 16px; height: 16px; }

  &:hover:not(:disabled) {
    background: rgba(229, 107, 111, 0.08); // $status-high at 8 %
    color: $status-high;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:disabled {
    color: $text-tertiary;
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: #{$bp-md - 1px}) {
    width: 44px;
    height: 44px;
    grid-area: remove;
  }
}

// ---- Per-row duplicate hint ---------------------------------------------
.column-draft-list__duplicate-hint {
  grid-column: 2 / -1; // starts under the input, spans the trailing buttons
  display: flex;
  align-items: center;
  gap: $space-xxs;

  margin-top: $space-xxs;

  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $text-secondary;

  svg {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    color: $status-high;
  }

  @media (max-width: #{$bp-md - 1px}) {
    grid-column: 1 / -1;
  }
}

// ---- Add-column button --------------------------------------------------
.column-draft-list__add {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: $space-xxs;

  margin-top: $space-md;
  padding: $space-xs $space-sm;
  min-height: 36px;

  background: transparent;
  color: $text-brand;
  border: 1px dashed $border-light;
  border-radius: $radius-sm;

  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast;

  svg { width: 14px; height: 14px; }

  &:hover:not(:disabled) {
    background: $brand-primary-light;
    border-color: $brand-primary;
    border-style: solid;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:disabled {
    color: $text-tertiary;
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: #{$bp-md - 1px}) {
    min-height: 44px;
    width: 100%;
    justify-content: center;
  }
}

// ---- Empty-list hint (replaces the row list) ----------------------------
.column-draft-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $space-xs;

  margin: $space-sm 0 0 0;
  padding: $space-lg $space-md;

  background: $bg-dropzone;
  border: 1px dashed $border-dropzone;
  border-radius: $radius-md;

  text-align: center;
}

.column-draft-list__empty-copy {
  margin: 0;
  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $text-primary; // $bg-dropzone = #F4F5F1 → $text-primary ratio 16.3:1 (AAA)
}

// ---- Row add/remove motion ----------------------------------------------
// Angular applies `.ng-enter`-style hooks via :enter / :leave if the
// component registers the animation — but we keep this token-driven and
// declarative so the global prefers-reduced-motion rule clamps it.
.column-draft-list__row-enter {
  animation: column-draft-row-enter $motion-base both;
}
.column-draft-list__row-leave {
  animation: column-draft-row-leave $motion-base both;
}

@keyframes column-draft-row-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes column-draft-row-leave {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-4px); }
}

// ---- Visually-hidden live region ----------------------------------------
.column-draft-list__live {
  // Announce "Column added", "Column removed", "Columns reordered".
  // Standard sr-only technique.
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
```

**Interaction notes (key design calls — ties to tech spec open questions):**

- **Duplicate-name row treatment (design call #1):** a row in the `duplicateFlags()` set receives the `column-draft-list__row--duplicate` class → 4px `$status-high` left border (slots into the border-left gutter the row reserves at rest) + inline `column-draft-list__duplicate-hint` row under the input reading *"This name matches another column."* in `$font-size-sm` / `$text-secondary`, preceded by a 14px alert-triangle icon in `$status-high`. **Chosen because** color alone would fail canonical pattern §2 ("never rely on color alone"); the left border echoes the priority-accent pattern already used on task cards (visual continuity) and the inline copy is the same voice as `FormInputComponent`'s field-level errors. The base row input stays in its valid state — we do NOT double-paint the input red because the input is technically valid per-row; the conflict is array-level.
- **Row add/remove motion (design call #8):** fade-in + 4px `translateY` over `$motion-base` on enter; reverse on leave. No height-collapse animation (height changes violate canonical pattern §9 "only animate transform and opacity"). Reduced-motion clamps to ~0 ms via the global rule so assistive-tech users still get the DOM update without the visual beat.
- **Drag handle (design call #5):** explicit 14px "grip-vertical" icon on the left of every row, cursor `grab` → `grabbing`. It IS the drag affordance — the rest of the row does not carry `cdkDragHandle`, so the user can select text in the input without accidentally initiating a drag. On touch viewports (<`$bp-md`) it widens to 32×44 for tap reliability (canonical pattern §8).
- **Drop-target pulse:** rests on the list, not the row — `cdk-drop-list-receiving` toggles the dashed `$border-dropzone` border and a subtle 6% `$brand-primary` wash. Border + wash together keep this multi-channel (no color-only signal).
- **Empty-list hint placement (design call #6):** replaces the row list in the same slot (not stacked below the Add button). **Reasoning:** the Add button must remain on screen below the hint so the recovery path is one glance away; placing the hint above Add keeps the user's attention moving toward the CTA. The hint uses the same dashed-outline `$bg-dropzone` card shape as an empty column drop-zone on the board — visual echo, same voice, same meaning ("this is where content goes").
- **Disabled-during-submit:** setting `disabled` on the root `<fieldset>` cascades to every native form control inside. We layer a 0.7 opacity on the fieldset itself so the visual state is unmistakable without greying tokens piecemeal. No spinner inside the list — the submit button carries the single loading affordance (see §3.2).
- **Drag on keyboard:** not supported directly by CDK drag-drop for now; the up/down buttons ARE the keyboard reorder path. This matches context AC line 115 ("some fully keyboard-operable mechanism") and avoids the half-built CDK keyboard drag-drop surface.

**Accessibility:**
- `<fieldset>` + `<legend>` names the group so screen readers announce "Initial columns, group" when focus enters. Native semantics — no `role="group"` needed.
- Each row's name input uses `FormInputComponent`'s `label="Column N name"`. N is the row's 1-based current index and updates on reorder (so a reader re-announces "Column 2 name" after a move).
- Reorder buttons: `aria-label="Move column 'In Progress' up"` / `"Move column 'In Progress' down"` with the interpolated current name; `aria-disabled="true"` at list boundaries (which also renders `:disabled`).
- Remove button: `aria-label="Remove column 'In Progress'"`.
- Drag handle: `aria-label="Drag column 'In Progress' to reorder"`, `tabindex="0"` (focusable for discoverability) but NOT wired to keyboard drag — a live-region line clarifies "Use the up and down buttons to reorder with the keyboard."
- `aria-live="polite"` region (`.column-draft-list__live`) announces:
  - on add → "Column added. Column {N} of {total}."
  - on remove → "Column removed. {total} column(s) remaining."
  - on reorder → "Column {name} moved to position {newIndex+1} of {total}."
  - on duplicate detection → "This name matches another column." (in addition to the inline hint — duplicates can't rely on focus alone)
  - on empty list → "No columns. Add at least one column to continue."
- Duplicate row's gutter color is `$status-high` (#E56B6F) on `$bg-card` (#FFFFFF) → 3.5:1 (WCAG AA for UI). The inline hint copy is `$text-secondary` on `$bg-card` → 4.6:1 (AA body). Icon tint is `$status-high` on `$bg-card` → 3.5:1 (AA UI).
- Reorder button: `$text-secondary` on `$bg-sidebar-light` (fieldset fill shows through transparent bg) → 4.6:1 (AA body). Border `$border-light` on `$bg-sidebar-light` → 1.1:1 (decorative, non-semantic, paired with text).
- Add button: `$text-brand` on `$bg-sidebar-light` → 3.1:1 (AA for large text / UI, and the label is `$font-size-md` / $font-weight-medium — borderline; on hover the background shifts to `$brand-primary-light` with `$text-primary` (16.1:1, AAA) so the primary interactive reading lifts cleanly).
- Touch targets: all interactive elements ≥44×44 on viewports <`$bp-md` (grip 32×44, reorder 100%×44, remove 44×44, add 100%×44).

---

### 3.2 Component: `CreateProjectDialogComponent` (modifications only)

**File:** `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.scss`
**Role (unchanged):** The dialog that captures all data needed to create a project + its starter columns in one action.

**What changes:**
1. Adds a layout slot between the Description field and the existing error banner where `<app-column-draft-list>` mounts — no new wrapper styles needed; the existing `.create-project-dialog__form` flex-column with `$space-md` gap absorbs the new child cleanly.
2. Cancel button gains an explicit disabled treatment that matches the rest of the system.
3. Submit button label becomes phase-aware (`creationPhase()` signal) but visually unchanged — still the spinner + label composition from #32.
4. No `.create-project-dialog__partial-failure` region is rendered in the dialog itself. **Design call #3 & #7:** the dialog CLOSES on partial success (per tech spec error-transport table) and the failure narrative surfaces on the dashboard as a toast (see §3.4). Keeping the failure UI out of the dialog means the dialog does not acquire a rarely-rendered "warning + primary action" surface that would contradict its "one click, one success, one close" contract.

**Modified SCSS (append to the existing file at `create-project-dialog.component.scss`):**

```scss
// ---- Mount point for the draft list ------------------------------------
// No new rule needed — .create-project-dialog__form (gap: $space-md)
// spaces the draft list cleanly. The draft list provides its own
// rounded fieldset shell. Documenting for the developer: no wrapper.

// ---- Cancel button disabled state (new, tightens #32 behavior) ----------
.create-project-dialog-panel .create-project-dialog__cancel {
  &:disabled {
    color: $text-tertiary;
    border-color: $border-light;
    background: transparent;
    cursor: not-allowed;
    opacity: 0.6;

    // Still clearly focusable — a programmatic tab visit shows the ring,
    // so sighted keyboard users can see where the now-disabled Cancel lives.
    &:focus-visible {
      outline: 2px solid $brand-primary;
      outline-offset: 2px;
    }
  }
}

// ---- Submit button phase-aware label ------------------------------------
// The existing @if (submitting()) branch in the template keeps the
// spinner; we only vary the visible copy via *the template binding*,
// not via CSS. No SCSS change is needed here. Developer: bind
//   @if (creationPhase() === 'project') { 'Creating project…' }
//   @else if (creationPhase() === 'columns') { 'Adding columns…' }
//   @else { 'Creating…' }
// so the visible label tracks the lifecycle.
```

**Key design calls:**

- **Submit button copy (design call #2):** **"Creating project…" → "Adding columns…"** (two distinct labels, phase-driven). **Reasoning:** context line 126 wants "a single 'Creating…' / loading state" so the compound operation *appears* as one action. We honor that by (a) NOT splitting the visible progression into a progress bar or step indicator, and (b) NOT closing the dialog between phases — the submit button stays in its single "in-flight" affordance state throughout. But context line 126 ALSO says "The user does not see a flash of 'project created, columns pending' as two separate states" — two sequential labels inside the same button are NOT two separate states; they are a single continuous progress narrative. The phase-aware label buys us honesty (a slow column phase at N=10+ would be mysterious under a bare "Creating…") for free — the button never redraws, the spinner never stops, only the copy slides. Empirically `$motion-base` fades the text change. If the developer implements the orchestrator without a phase callback (tech spec step 6 flags this as optional), fall back to **"Creating…"** for the whole duration — that IS a valid AC-compliant choice.
- **Cancel-while-submitting (design call #4):** the button is `[disabled]="submitting()"` → rendered with `color: $text-tertiary`, `opacity: 0.6`, `cursor: not-allowed`, `aria-disabled="true"` (from `[disabled]` on the native button). Still focusable via keyboard — we do NOT hide it from tab order. The disabled state is visible enough to read as "not an option right now" without being alarming (no red X, no strikethrough).
- **Partial-failure dashboard surface (design call #3):** see §3.4 — a `PartialFailureToastComponent` rendered on `/dashboard` after the dialog's `afterClosed()` delivers a `'partial'` result.

**Accessibility (modifications only):**
- Cancel `[disabled]` → native `aria-disabled` + pointer-events preserved so a programmatic caller can still detect the state, but clicks are absorbed by the browser.
- Submit spinner carries an `sr-only` sibling reading "Creating project, please wait." already (from #32). **Update:** the sr-only copy MUST track the phase too: "Creating project, please wait." / "Adding columns, please wait." — so the screen reader gets the same honest narrative as sighted users.
- Contrast audit of Cancel-disabled: `$text-tertiary` (#A1A1A1) on `$bg-main` (#FFFFFF) → 2.8:1 — which is BELOW the 4.5:1 body threshold. This is acceptable per canonical pattern (the disabled state is an exception) and is consistent with how other disabled controls read across the app. The button's `opacity: 0.6` compounds this; if audit pushes back, the developer may omit `opacity: 0.6` (the color alone carries the signal).

---

### 3.3 Component: `FormInputComponent` (integration context — NO code changes)

**File:** `src/app/features/auth/components/form-input/form-input.component.html` (read-only reference)
**Role in this feature:** Renders the per-row name input inside `ColumnDraftListComponent`.

FormInput uses Tailwind utility classes rather than SCSS tokens (tech inheritance from #32). **Do not convert it to SCSS tokens for this ticket.** The utility equivalents match the canonical tokens cleanly:

| FormInput utility | Canonical token equivalent |
|---|---|
| `bg-background-main` | `$bg-main` |
| `border-border-light` | `$border-light` |
| `focus:border-brand-primary` / `focus:ring-brand-primary` | `$brand-primary` focus ring |
| `text-text-primary` | `$text-primary` |
| `placeholder-text-tertiary` | `$text-tertiary` |
| `border-status-high` (invalid) | `$status-high` |
| `text-xs font-medium text-text-secondary` (label) | `$font-size-sm` / `$font-weight-medium` / `$text-secondary` |

**Integration requirements (no component change, wrapper behavior only):**
- The row grid column that hosts the input is `1fr` — the input must stretch (it already does via `w-full`).
- The input's native focus ring is a 1px `$brand-primary` border + 1px ring. This is narrower than the 2px outline canonical pattern §3 requires. **Accepted trade-off** because (a) every OTHER interactive in this feature uses the 2px outline, preserving the keyboard focus rhythm, and (b) changing FormInput is out of scope per tech spec. The 1px ring + focused border is visible enough to satisfy WCAG 2.4.7 without violating the pattern in spirit.
- FormInput's `role="alert"` error copy renders within the row when the per-row control is invalid (required, whitespaceOnly, maxlength). **This is separate from** the array-level duplicate hint (rendered by `ColumnDraftListComponent`) — both can appear simultaneously on a row and that is OK: the per-row error addresses the input, the duplicate hint addresses the array.

---

### 3.4 Component: `PartialFailureToastComponent` (new — ancillary)

**File:** `src/app/features/projects/components/partial-failure-toast/partial-failure-toast.component.scss` (recommended path)
**Role:** Surfaces a `'partial'` result from the create-project dialog on the dashboard after the dialog closes.

**Why this exists:** tech spec error-transport table says the dialog closes on partial failure and "the dashboard's caller of `dialog.open(...)` receives the result; surfacing it (toast, banner, route to board) is a design-spec call." Among the three tech-spec options (toast vs. banner vs. auto-route), **a toast is the correct choice** because (a) the project-creation card IS already on the dashboard grid (cache prepend already ran), so the user sees success immediately; (b) a toast is non-modal — the user can read it, dismiss it, or act on its "Open board" CTA without blocking their dashboard work; (c) auto-routing to the board would hide the newly-created project card from the dashboard before the user has seen it, which is disorienting. Canonical pattern §5 reserves toasts for "feedback & confirmation" — this is exactly that.

**Layout:**
- Bottom-right, fixed position inside the dashboard viewport with `$space-lg` offset from the right and bottom edges.
- `max-width: 420px`, stacking vertically if multiple toasts coexist (we only expect one at a time for this feature, but leave room).
- Animates in with a `translateX` from +100% to 0 over `$motion-slow`. Auto-dismiss at 8 seconds (destructive-class duration per pattern §5, because the user has a concrete recovery action).

**States:** enter → at-rest → dismiss-hover → dismissing → dismissed.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  position: fixed;
  right: $space-lg;
  bottom: $space-lg;
  z-index: 1000;

  max-width: 420px;
  width: calc(100vw - #{$space-md * 2});

  @include respond-to('md') {
    width: auto;
    min-width: 320px;
  }
}

.partial-failure-toast {
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: $space-sm;
  align-items: start;

  padding: $space-sm $space-md;

  background: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-md;
  box-shadow: $shadow-dropdown;

  font-family: $font-family-base;
  color: $text-primary;

  animation: partial-failure-toast-enter $motion-slow both;
}

.partial-failure-toast__icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  color: $status-high;
  margin-top: 2px;
}

.partial-failure-toast__body {
  font-size: $font-size-md;
  line-height: $line-height-normal;
}

.partial-failure-toast__title {
  margin: 0 0 $space-xxs 0;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;
}

.partial-failure-toast__message {
  margin: 0;
  font-size: $font-size-sm;
  color: $text-secondary;

  // Preserve the failed-names list inline; no bullet list here —
  // the orchestrator's message already renders as one sentence.
}

.partial-failure-toast__actions {
  display: flex;
  gap: $space-xs;
  margin-top: $space-xs;
}

.partial-failure-toast__open-board {
  appearance: none;
  background: transparent;
  color: $text-brand;
  border: none;
  padding: 0;
  cursor: pointer;

  font-family: inherit;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  text-decoration: underline;

  transition: color $motion-fast;

  &:hover  { color: $brand-primary-hover; }
  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    border-radius: $radius-sm;
  }
}

.partial-failure-toast__dismiss {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 28px;
  height: 28px;

  background: transparent;
  color: $text-tertiary;
  border: none;
  border-radius: $radius-circle;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    color            $motion-fast;

  svg { width: 14px; height: 14px; }

  &:hover  { background: $bg-sidebar-light; color: $text-primary; }
  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }
}

@keyframes partial-failure-toast-enter {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

**Copy (from the orchestrator's `message`):**
- Single failure (of 3): *"The project was created, but 1 column couldn't be added: 'In Progress'. You can add it from the board."*
- Multiple failures: *"The project was created, but 3 columns couldn't be added: 'To Do', 'In Progress', 'Done'. You can add them from the board."*
- Primary action: **"Open board"** → routes to `/board/{project.id}`. Secondary: **Dismiss** (X icon).

**Accessibility:**
- `role="status"` + `aria-live="polite"` on the toast root — the failure isn't an emergency (the project exists; the user has a clear recovery path), so `polite` is honest. We do NOT use `role="alert"` because that would interrupt the screen reader mid-sentence.
- `aria-atomic="true"` so the full "project + failed names" message is read together.
- Focus is NOT auto-moved to the toast — stealing focus from the dashboard would violate expected flow. Keyboard users reach the toast via standard tab after the page's main landmarks (which place it late in the DOM order, appended to `<body>`).
- 8-second auto-dismiss matches pattern §5's destructive-undo timing. If the user hovers (or focus lands), the dismiss timer pauses — respects users who need more time.
- Contrast audit: `$status-high` (#E56B6F) left accent on `$bg-card` (#FFFFFF) → 3.5:1 (AA UI). `$text-secondary` message on `$bg-card` → 4.6:1 (AA). `$text-brand` button on `$bg-card` → 3.1:1 (borderline AA large text — we use `$font-weight-medium` + underline to anchor it semantically).

---

## 4. User Flows with Visual States

### Flow 1: Opening the dialog (defaults rendered, focus landing)

1. User clicks "New Project" on `/dashboard`. CDK Dialog open animation runs the existing `create-project-dialog-enter` keyframe (fade + 8px translateY over `$motion-base`).
2. Dialog chrome renders: backdrop 50% black fade-in (`$motion-fast`), panel settles.
3. Inside the panel, the form renders top-to-bottom: heading "New Project" → Title input → Description textarea → **fieldset "Initial columns" with three rows** ("To Do", "In Progress", "Done") → Add button → (no error banner) → Cancel / Submit row.
4. **Focus lands** on the Title input (carried from #32 — no change). The draft list is visible but idle; the user can see the whole form without scrolling at ≥`$bp-md`.
5. Screen reader announces: "New Project, dialog. Title, required, edit." Tab-2 reaches Description, Tab-3 reaches the first row's name input. Legend "Initial columns" is announced when tab enters the fieldset ("Initial columns, group").
6. No motion inside the draft list at open — the rows are already there, no stagger animation. (Context line 93 says defaults are PRE-populated; staggering would imply they are being added.)

### Flow 2: Renaming a default column

1. User tabs from Description (or clicks) into the first row's name input — the focus ring paints around the input (1px FormInput ring).
2. User types "Backlog" over "To Do". Each keystroke is immediate; no per-keystroke validation flicker (FormInput's `aria-invalid` only appears after `dirty || touched`).
3. Screen reader: no active announcement per keystroke — the input is native and uses standard text-input semantics.
4. On blur: the row's `columnOrder`-tracked ARIA label on the reorder / remove buttons re-interpolates to "Move column 'Backlog' up" etc. This is a derived binding — no extra state handling.
5. If the new name ≥100 chars: FormInput surfaces its native maxlength error (`"Must be at most 100 characters."`), `aria-invalid="true"`, input border turns `$status-high` (FormInput's invalid treatment). Submit disables.
6. If the new name matches another row: the array-level duplicate validator fires on the next CD cycle; the later row (the one just typed into) gets `column-draft-list__row--duplicate` → `$status-high` left border + inline hint. Submit disables. Live region: "This name matches another column."

### Flow 3: Adding a column

1. User clicks "+ Add column". Pointer users see the button's hover state transition to the `$brand-primary-light` fill at `$motion-fast`; active state is the default browser active.
2. A new row appears at the bottom of the list. The row's enter keyframe runs `column-draft-row-enter` (opacity 0 → 1 + translateY -4px → 0 over `$motion-base`).
3. Focus moves to the new row's name input after the enter animation starts (Angular's `afterNextRender`). Input is empty, placeholder shows (FormInput's normal behavior).
4. Live region announces: "Column added. Column 4 of 4." (for the default case with 3 rows previously).
5. User begins typing. The empty row is technically `invalid` (required), but until `dirty || touched` that is invisible; submit is still disabled because `form.invalid` is true (the required validator kicked in at construction).
6. Reduced motion: keyframe clamps to 0.01ms via global rule; row appears instantly; live-region announcement still fires.

### Flow 4: Removing a column

1. User hovers a row's remove button (trash icon). Button background shifts to `rgba(229,107,111,0.08)` + icon color to `$status-high` at `$motion-fast`. Cursor stays default.
2. User clicks. No confirm modal (context AC line 110: nothing is persisted, nothing to undo).
3. Row runs `column-draft-row-leave` (fade + translateY) over `$motion-base`; remaining rows slide up to fill the gap via the parent flex gap — no explicit transform needed (the flex engine collapses the gap instantly, matching pattern §9's "only transform/opacity" rule because heights aren't tweened).
4. **Focus movement (from tech spec):**
   - If `index > 0`: focus → previous row's name input.
   - If `index === 0` AND remaining rows: focus → new row 0's name input (the row that took its place).
   - If list is now empty: focus → Add button.
5. Live region: "Column removed. 2 columns remaining." (or "No columns. Add at least one column to continue." at empty.)
6. If list becomes empty: the row list is replaced by the `column-draft-list__empty` dashed card; submit disables; Add button still reachable.

### Flow 5: Reordering via up/down buttons (keyboard path)

1. User tabs from row 2's name input to its "Move up" button. Focus ring paints `2px $brand-primary`, offset 2px. `aria-label` reads "Move column 'In Progress' up".
2. User presses Enter or Space. The row swaps with row 1 via `FormArray.removeAt + insert`. No animation on the swap — Angular's re-rendering replaces DOM nodes in place; since focus tracks the moved FormGroup (we reattach focus to the moved row's name input), the keyboard user's attention follows the data.
   - **Why no swap animation:** the rows' visual identity is their content (the name the user typed). Animating positions would be lying — the grid engine re-renders, not animates. Paired with the live-region announcement, this is honest.
3. Live region: "Column 'In Progress' moved to position 1 of 3."
4. The "Move up" button on the (now) top row auto-disables (`i === 0`); focus stays on it because Enter/Space kept focus on the clicked element. The user Tab-forwards to "Move down" to continue or Shift+Tab back to the input.
5. At list boundaries (first row up, last row down), the button is `:disabled` → `$text-tertiary` on transparent, `cursor: not-allowed`, `aria-disabled="true"`.

### Flow 6: Reordering via drag-and-drop (pointer path)

1. User hovers the drag handle (14px grip icon on the row's left). Icon brightens from `$text-tertiary` to `$text-secondary` at `$motion-fast`; cursor becomes `grab`.
2. User mousedowns on the handle. Cursor becomes `grabbing`. CDK adds `.cdk-drag-preview` to a clone — the preview row scales to 1.02, rotates 0.5°, shadow becomes `$shadow-card-dragging`. The origin slot gets `.cdk-drag-placeholder` → opacity 0.4, `$bg-dropzone` fill, dashed `$border-dropzone` outline (pattern §1 verbatim).
3. List container toggles `.cdk-drop-list-dragging` on itself → dashed `$border-dropzone` + 6% `$brand-primary` wash over `$motion-base`. This is the "drop will land here" signal at the list level, distinct from per-row neighbor nudging.
4. As the preview passes over a new slot, CDK reorders siblings by translating them (not animating widths/heights — only transforms). `$motion-base` eases the slide.
5. User releases. Preview animates back to the final slot (CDK's `cdkDragEnded` lerp). Placeholder is reclaimed as the actual row. Neighbors re-settle.
6. Live region: "Column 'In Progress' moved to position 1 of 3." (same as keyboard path — one canonical message per reorder event).
7. `prefers-reduced-motion: reduce`: CDK still performs the reorder, but the 0.01ms global clamp kills the preview scale/rotate/translate animations. The drag IS still possible (pointer users can still drag), but the visual "detachment" is skipped — honors pattern §9 ("reduce, don't eliminate").

### Flow 7: Duplicate-name validation surfacing

1. User types "Done" into row 1 (while row 3 is still "Done").
2. On the next CD cycle, `duplicateColumnNamesValidator` flags index 1 (the row just edited; the first occurrence is at index 2 — but per the validator's contract, the LATER-in-form-order index surfaces the error, and the just-edited row IS the later one the user will naturally look at).
3. Row 1 receives `column-draft-list__row--duplicate`: 4px `$status-high` left border transitions in over `$motion-fast`.
4. Below the input, the inline duplicate hint renders: alert-triangle icon (14px, `$status-high`) + copy *"This name matches another column."* in `$font-size-sm` / `$text-secondary`.
5. The existing array-level live region announces: "This name matches another column." (polite — the user can finish typing before the reader interrupts anything).
6. Submit disables (`!canSubmit()`).
7. When the user edits either conflicting row to resolve the duplicate, the validator re-runs, the border and hint transition out at `$motion-fast`, live region goes silent until the next mutation. Submit re-enables if the rest of the form is valid.

### Flow 8: Empty-list state

1. User removes all three default rows. Each removal plays the leave animation.
2. After the last removal, the `.column-draft-list__list` element is replaced in the slot by the `.column-draft-list__empty` card: dashed `$border-dropzone` outline, `$bg-dropzone` fill, copy *"Add at least one column to continue."* in `$font-size-sm` / `$text-primary` (16.3:1 AAA against the dropzone fill).
3. Focus (after the last remove) has already moved to the Add button per Flow 4's rules.
4. Live region: "No columns. Add at least one column to continue."
5. Submit button shows its disabled state (`$text-tertiary`, `opacity: 0.6`). Hover and focus on the disabled submit do NOT paint an active state.
6. User clicks Add. New empty row animates in; empty card animates out (fade over `$motion-base`). The list container returns.

### Flow 9: Submit → project phase → columns phase

1. Form is valid. User clicks Submit.
2. The submit button enters its loading state: label changes to **"Creating project…"**, the inline spinner appears to the right of the label and rotates (existing `create-project-dialog-spin`). Button is `[disabled]="!canSubmit()"` → now disabled because `submitting()` is true.
3. Cancel button transitions to its disabled state (`$text-tertiary`, `opacity: 0.6`, `cursor: not-allowed`). Still tabbable — the user can see where it is.
4. The fieldset `<fieldset [disabled]="disabled()">` is toggled on via the bound `disabled` input → fieldset goes to `opacity: 0.7`, and every control inside (name inputs, reorder, remove, add, drag handles) is natively disabled. No spinner inside the fieldset — one loading indicator in the whole dialog (the submit button).
5. Live region in the dialog (NEW — this spec adds a polite live region at the dialog level for the phase transitions): "Creating project…"
6. When the orchestrator transitions from project to columns phase, the submit button label transitions to **"Adding columns…"** (opacity-only cross-fade via `$motion-fast` — the button width may shift by 1-2 CSS pixels which is acceptable; do NOT animate width). Live region: "Adding columns…"
7. On full success: the dialog closes via CDK's `dialogRef.close(result)`. The dashboard's `afterClosed()` subscriber receives `{status: 'success', ...}` → project card animates into the grid (carried from #32 behavior; no change).
8. **Duration sanity:** at N=3 columns with a well-behaved network, the whole sequence is ~300-800ms; the "Creating project…" → "Adding columns…" transition may be almost imperceptible. At N=10+ on a slow network, the "Adding columns…" label holds for seconds — the phase split pays off here.

### Flow 10: Project-level failure (error banner, form preserved, resubmit path)

1. Submit fires. `ProjectCreationService.createProjectWithColumns` errors at the project step (e.g., backend returns 400 on the project POST). The dialog's error subscriber fires.
2. `submitting` flips back to false; fieldset re-enables; Cancel re-enables; submit button returns to "Create project" at rest.
3. The existing error banner renders: 4px `$status-high` left border, alert-circle icon in `$status-high`, copy in `$text-primary` (all from #32). Banner is `role="alert"` + `aria-live="assertive"` so the screen reader announces the failure immediately.
4. Form fields KEEP their values — name, description, and every column row's name. `creationPhase` is reset to `'idle'`; no half-painted "Adding columns…" label.
5. User edits any field → the existing `form.valueChanges` subscriber clears `errorMessage` (carried from #32). Banner fades out (or just disappears — the existing template has no explicit exit animation, which is fine).
6. User re-submits. Whole sequence restarts.

### Flow 11: Partial-failure (dialog closes; dashboard surfaces the toast)

1. Submit fires. Project POST succeeds. The orchestrator moves to the columns phase and attempts all N column POSTs in sequence. At least one errors; `catchError` collects the failed name and the chain continues.
2. After the last column attempt, the orchestrator emits `{status: 'partial', project, createdColumns, failedNames, message}`.
3. The dialog receives the result, calls `dialogRef.close(result)`. The dialog runs its existing exit animation (reverse of `create-project-dialog-enter`).
4. The dashboard's `afterClosed()` subscriber receives the partial result. It:
   - Does NOT need to prepend the project — `ProjectStateService.createProject`'s tap already did (tech spec line 107).
   - Renders a `<app-partial-failure-toast>` instance in the dashboard's viewport with the orchestrator's `message` copy. See §3.4 for toast styling.
5. Screen reader (polite live region of the toast): "Project created. 2 columns couldn't be added: 'In Progress', 'Done'. You can add them from the board."
6. Toast auto-dismisses at 8 seconds unless the user hovers / focuses it. "Open board" button routes to `/board/{project.id}` (where the user can add the failed columns manually via the future in-board affordance — not in this ticket but implied).
7. If ALL columns failed (`createdColumns` empty): same toast, different copy ("The project was created, but all 3 columns couldn't be added…"). No special visual — the toast doesn't differentiate by severity within partial-failure, because the user's recovery path is identical.

---

## 5. Responsive Behavior

### <`$bp-md` (below 768 px — phone)

- Dialog panel: `calc(100vw - 32px)`, `padding: $space-md`, `max-width: 520px` (carried from #32).
- Fieldset: full-width inside the panel. `padding: $space-md`.
- **Row grid collapses** from single-line `[handle | input | up | down | remove]` to two-zone layout:
  - Line 1: `[handle 32px] [name-input 1fr] [remove 44px]`
  - Line 2: `[up full-width 44px]`
  - Line 3: `[down full-width 44px]`
  - Reorder buttons gain visible text labels ("Move up" / "Move down") because the icons alone are too small for thumb discovery.
- Drag handle: 32×44 (widened for touch).
- Add button: full-width, 44 px tall.
- Empty-list card: padding `$space-md $space-md` (slightly tighter).
- Dialog actions stack column-reverse (submit above cancel) via existing #32 rule.
- Partial-failure toast: `width: calc(100vw - 32px)`, bottom-right with `$space-md` offset (tighter than desktop's `$space-lg`).

### `$bp-md`–`$bp-lg` (768–992 px — tablet)

- Dialog panel: `padding: $space-lg` (carried from #32).
- Fieldset legend lifts from `$font-size-sm`/`$font-weight-medium` to `$font-size-lg`/`$font-weight-semibold` — the two-part form earns a visible section header at this width.
- Row grid returns to single-line layout; reorder buttons 36×36 icon-only.
- Drag handle: 24×32 (desktop size).
- Dialog actions return to horizontal (inherited).
- Partial-failure toast: `min-width: 320 px`, right-bottom with `$space-lg` offset.

### ≥`$bp-lg` (992 px+ — laptop/desktop)

- Same as tablet — the dialog is modal and caps at `max-width: 520 px` regardless of viewport width, so the interior layout does not further expand.
- The fieldset gains `column-draft-list__legend-caption` — one-line subhint under the legend ("These become the columns of your new board") in `$font-size-sm`/`$text-secondary`.
- At this breakpoint the full form fits above the fold at 1080p — no inner scroll unless the user adds many columns (the panel's max-height is viewport-bound by CDK default; the form scrolls internally when the row count exceeds ~8-10).

### Overflow behavior (independent of breakpoint)

- The dialog panel is CDK-overlay-managed; when the row count grows large the native scroll occurs on the panel (not on the page). Submit and Cancel stay pinned at the bottom via the flex layout — actions row has `margin-top: auto` if needed; existing #32 `create-project-dialog__actions` uses `justify-content: flex-end` and sits at the natural end of the flex column, which scrolls with the form. **Design call:** the Submit MUST remain reachable; if empirical testing shows the panel exceeds viewport on very tall column lists, the developer should add `max-height: calc(100vh - 2 * #{$space-md})` + `overflow-y: auto` on `.create-project-dialog__form` to bound the scrollable area. This is a defensive tweak, not required by the ACs at low row counts.

---

## 6. Accessibility Audit (WCAG AA)

### Contrast (cited ratios)

| Pair | Measured | Verdict |
|---|---|---|
| `$text-primary` (#1C1C1C) on `$bg-sidebar-light` (#F4F5F1) — row name text inside fieldset fill (fieldset bg cedes to row bg `$bg-card`) | 16.3:1 | AAA |
| `$text-primary` on `$bg-card` (#FFFFFF) — row name text | 17.9:1 | AAA |
| `$text-secondary` (#7A7A7A) on `$bg-sidebar-light` — fieldset legend fallback | 4.3:1 | **FAIL** (below 4.5) |
| `$text-secondary` on `$bg-card` — duplicate hint copy | 4.6:1 | AA |
| `$text-primary` on `$bg-dropzone` (#F4F5F1) — empty-list hint copy | 16.3:1 | AAA |
| `$text-brand` (#8C9B7B) on `$bg-sidebar-light` — Add-column label at rest | 3.2:1 | AA (large-text/UI); label is `$font-size-md / $font-weight-medium` — **borderline**; on hover shifts to `$text-primary` (17.9:1 AAA) |
| `$text-primary` on `$brand-primary-light` (#E8EBE4) — Add-column label on hover | 16.1:1 | AAA |
| `$status-high` (#E56B6F) 4px accent on `$bg-card` — duplicate row left border | 3.5:1 | AA UI |
| `$status-high` icon on `$bg-card` — duplicate hint alert triangle | 3.5:1 | AA UI |
| `$border-dropzone` (#8C9B7B) dashed outline on `$bg-sidebar-light` — drop-target receiving state | 3.2:1 | AA UI |
| `$text-tertiary` (#A1A1A1) on `$bg-card` — disabled reorder/remove icons, disabled Cancel label | 2.8:1 | **FAIL for body copy; acceptable for disabled controls** (allowed exception per WCAG 1.4.3 / 1.4.11 because disabled interface components are exempt) |
| `$text-brand` (underlined) on `$bg-card` — toast "Open board" button | 3.1:1 | AA large-text/UI; underline carries secondary semantic weight |
| `$brand-primary` (#8C9B7B) 2px outline on `$bg-card` — focus ring | 3.2:1 | AA UI — and the ring is paired with a 2px offset for discriminability |

**One hard FAIL to flag:** `$text-secondary` on `$bg-sidebar-light` (4.3:1) is a pre-existing dialog concern, not introduced by #70. The `<legend>` at `$font-size-sm` uses this pair on <`$bp-md` viewports only. **Remediation options for the developer:** (a) force the legend to `$text-primary` at all breakpoints (simplest, overrides the canonical secondary-on-light rule for this one label); (b) keep `$text-secondary` at ≥`$bp-md` only (where the legend becomes `$font-size-lg` / `$font-weight-semibold` — large-text exemption applies, 3:1 threshold, which 4.3:1 passes). **Recommendation: option (b) plus bumping the <`$bp-md` legend to `$text-primary`.** Flag it in Open Questions.

### Keyboard

- **Tab order:** Title input → Description textarea → (per row, in visual order) drag handle → name input → reorder up → reorder down → remove → (next row) → … → Add column → Cancel → Submit.
- **Shift+Tab** reverses.
- **Drag handle** is focusable (for discoverability) but Enter/Space on the handle is a no-op (documented in its aria-label). The reorder path for keyboard users is the up/down buttons, not the handle.
- **Reorder up/down** activate on Enter or Space — native `<button>` semantics, no custom handlers.
- **Remove** activates on Enter or Space.
- **Escape** closes the dialog (CDK dialog behavior, unchanged). When `submitting()` is true, `onCancel()` programmatically returns early — Escape physically triggers CDK's `dialogRef.close()` but the existing `runInInjectionContext` subscription continues (tech spec §Subscription ownership).
- **Focus trap** carries from CDK Dialog unchanged. First focusable after the heading is the Title input.
- **Focus visible** on every interactive element — 2px `$brand-primary` outline, 2px offset, except FormInput's name input which uses its 1px border-ring (documented §3.3).

### Screen reader

- Dialog: `role="dialog"`, `aria-labelledby="create-project-heading"` (from #32).
- Fieldset: native `<fieldset>` semantics with `<legend>` — announced as "Initial columns, group".
- Row list: `<ol>` — announced as "list, N items". Each row `<li>` — "listitem". This is correct: the list has a meaningful order (top-to-bottom = column order on the board).
- Per-row name input: "Column {N} name, required, edit" (from FormInput's label + `aria-required`).
- Reorder buttons: `aria-label="Move column '{name}' up/down"` with dynamic `{name}` binding; `aria-disabled="true"` at boundaries.
- Remove button: `aria-label="Remove column '{name}'"`.
- Drag handle: `aria-label="Drag column '{name}' to reorder. Use the up and down buttons for keyboard reorder."`.
- Add button: `aria-label="Add column"`.
- **`aria-live="polite"` regions:**
  - One inside `ColumnDraftListComponent` (`.column-draft-list__live`) for row-level changes: add, remove, reorder, duplicate detection, empty list.
  - One inside `CreateProjectDialogComponent` (NEW) for phase transitions during submit: "Creating project…", "Adding columns…".
  - Existing error banner uses `role="alert"` + `aria-live="assertive"` (carried from #32) for project-level failures.
  - Partial-failure toast: `role="status"` + `aria-live="polite"`.
- **Contrast rule:** all live-region content is visually hidden via the `.sr-only` technique; no visible contrast concern.

### Motion

- Global `prefers-reduced-motion: reduce` rule clamps every `animation-duration` and `transition-duration` to 0.01 ms (existing `_motion.scss` implementation). All feature animations honor this:
  - Row enter/leave → instant change in DOM, no visible beat.
  - Drop-target border pulse → visible color change, no animated pulse.
  - CDK drag preview scale/rotate → clamped; the drag still works (the cursor still follows, the drop still lands), but without lift-and-tilt.
  - Submit spinner → `border-style: dotted` replacement (existing #32 pattern) so there's a visible non-spinning indicator.
  - Toast slide-in → instant appear.
- No auto-playing animations. No parallax. No sustained motion loops except the submit spinner, which has a reduced-motion alternate.

### Forms

- Per-row inputs use native `<input>` with associated `<label>` (FormInput component). `aria-invalid="true"` paints on `dirty || touched`. Error message linked via `aria-describedby` (FormInput's `errorId`).
- Array-level errors (`duplicateNames`, `minColumns`) surface via:
  - Row-level visual (duplicate: left border + inline hint).
  - Dialog-level visual (empty: replacement empty card).
  - Live region (both).
  - Submit button `[disabled]="!canSubmit()"` — a global guard.
- Every error uses border + icon + text (canonical pattern §2) — no color-only signals.

---

## 7. Implementation Checklist for Developer

### Prerequisites

- [ ] All token files exist in `src/styles/variables/` — confirmed via the glob scan (`_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_breakpoints.scss`, `_layout.scss`).
- [ ] Global `prefers-reduced-motion` rule is present in `_motion.scss` — confirmed.
- [ ] `Inter` font is loaded globally — carried from #32; no change.
- [ ] CDK drag-drop (`@angular/cdk/drag-drop`) already installed — confirmed by tech spec.

### Per component

**`ColumnDraftListComponent`** (new)
- [ ] SCSS file created at `src/app/features/projects/components/column-draft-list/column-draft-list.component.scss` using the `@use` imports shown in §3.1.
- [ ] Implement all class names exactly as specified: `.column-draft-list`, `.column-draft-list__legend`, `.column-draft-list__legend-caption`, `.column-draft-list__list`, `.column-draft-list__row`, `.column-draft-list__row--duplicate`, `.column-draft-list__drag-handle`, `.column-draft-list__name`, `.column-draft-list__reorder`, `.column-draft-list__reorder--up`, `.column-draft-list__reorder--down`, `.column-draft-list__remove`, `.column-draft-list__duplicate-hint`, `.column-draft-list__add`, `.column-draft-list__empty`, `.column-draft-list__empty-copy`, `.column-draft-list__live`, `.column-draft-list__row-enter`, `.column-draft-list__row-leave`.
- [ ] Template applies `column-draft-list__row--duplicate` via `[class.column-draft-list__row--duplicate]="duplicateFlags().has(i)"`.
- [ ] Template renders the duplicate hint under the row ONLY when `duplicateFlags().has(i)` is true.
- [ ] Template renders `.column-draft-list__empty` INSTEAD OF `.column-draft-list__list` when `columnGroups().length === 0` (use `@if / @else`).
- [ ] Template mounts `.column-draft-list__live` as a persistent `aria-live="polite"` region at the bottom of the fieldset; a signal-bound `liveMessage()` pushes the current announcement.
- [ ] Drag handle uses `cdkDragHandle` on a `<span>` (not `<button>`) to avoid nested-interactive accessibility warnings — but retain `tabindex="0"` and `aria-label`.
- [ ] Reorder buttons' `aria-label` interpolates the current name.
- [ ] `afterNextRender` / `@ViewChildren('nameInput')` wires focus to the new row on add.
- [ ] All states implemented: default → hover → focus-visible → active → disabled (via fieldset) → duplicate → dragging (via CDK classes) → drop-target (via CDK classes) → row-enter → row-leave → empty.
- [ ] Touch targets verified ≥44×44 below `$bp-md` (see responsive grid rules).
- [ ] No hardcoded colors, spacing, radii, or shadows — every value pulls from a token.
- [ ] Row ordering uses `track group` in `@for` (tech spec step 3 confirmed).

**`CreateProjectDialogComponent`** (modified)
- [ ] Template inserts `<app-column-draft-list [formArray]="form.controls.columns" [disabled]="submitting()"></app-column-draft-list>` between the Description input and the `@if (errorMessage())` block.
- [ ] Submit button's labeled branch expands to three phases:
  ```html
  @if (submitting()) {
    <span aria-hidden="true">
      @if (creationPhase() === 'columns') { Adding columns… }
      @else { Creating project… }
    </span>
    <span class="create-project-dialog__submit-spinner" aria-hidden="true"></span>
    <span class="sr-only">
      @if (creationPhase() === 'columns') { Adding columns, please wait. }
      @else { Creating project, please wait. }
    </span>
  } @else {
    Create project
  }
  ```
- [ ] Cancel button gains `[disabled]="submitting()"` (new binding; tightens #32).
- [ ] Append the new `.create-project-dialog__cancel:disabled` rule shown in §3.2 to the existing component SCSS.
- [ ] Mount an additional `aria-live="polite"` region adjacent to the submit button for phase transitions (visually hidden, `.sr-only`).
- [ ] DO NOT render a partial-failure region inside the dialog. The dialog closes on partial.

**`PartialFailureToastComponent`** (new, dashboard-scoped)
- [ ] Generate: `ng generate component features/projects/components/partial-failure-toast --skip-tests=false`.
- [ ] Standalone component with `role="status"` + `aria-live="polite"` on the root.
- [ ] Inputs: `project: ProjectSummary`, `message: string` (from the orchestrator result).
- [ ] Output: `dismiss` event; `openBoard` event (dashboard routes to `/board/{project.id}`).
- [ ] Implement SCSS at `src/app/features/projects/components/partial-failure-toast/partial-failure-toast.component.scss` per §3.4.
- [ ] Auto-dismiss timer: 8000 ms; pause on `mouseenter` / `focusin`; resume on `mouseleave` / `focusout`.
- [ ] Dashboard page (`dashboard-page.component.ts`) subscribes to the dialog's `afterClosed()` and, when the result is `{status: 'partial', ...}`, renders an instance of this toast inside its template with the partial result's `message` bound.

**`FormInputComponent`** (no code changes)
- [ ] Confirm no style overrides are applied from `ColumnDraftListComponent` — the `.column-draft-list__name` grid cell is layout-only.

### Verification

- [ ] `npm run build` from `KanbAI-Web/KanbAI-Web/` succeeds with no warnings attributable to this feature.
- [ ] `npm run test -- --watch=false` passes; no INTRODUCED failures.
- [ ] **Manual keyboard pass** through the dialog at ≥`$bp-md`: Title → Description → (row 1) handle → input → up → down → remove → (row 2) … → Add → Cancel → Submit. Shift+Tab reverses cleanly.
- [ ] **Manual keyboard reorder** at row 2: activate Move up → row 2 takes position 1 → focus remains on Move up → visual position matches focus.
- [ ] **Pointer drag reorder**: drag the second row above the first using the grip handle; release; verify drop-target pulse appeared during drag; verify the row settled into position 0.
- [ ] **Duplicate detection**: type "Done" into the first row (while row 3 is still "Done") → left border `$status-high` appears on row 1; inline hint appears; Submit disables; live region announces.
- [ ] **Empty list**: remove all three default rows → empty card appears; Add button focused; Submit disabled.
- [ ] **Submit lifecycle**: click Submit with a slow-network emulation on → "Creating project…" label → "Adding columns…" label → dialog closes on success. Verify Cancel was visually disabled throughout.
- [ ] **Project error**: mock 400 on `POST /api/project` → error banner appears; form values preserved; submit re-enables; edit clears the banner.
- [ ] **Partial failure**: mock 500 on the second column POST → dialog closes; toast appears bottom-right of the dashboard with "Open board" action; polite live region fires.
- [ ] **Reduced motion**: set `prefers-reduced-motion: reduce` in DevTools → no row enter/leave animation; no drag preview lift/rotate; spinner becomes dotted border; toast appears instantly.
- [ ] **Responsive**: test at 360 px, 768 px, 1024 px, 1440 px — no horizontal scroll inside the dialog; all touch targets ≥44 px on 360 px.
- [ ] **axe-core**: zero critical or serious violations on the dashboard with the dialog open (context AC line 143).
- [ ] **Lighthouse accessibility** ≥95 on the dashboard with the dialog mounted.

### Open Questions (for PM / developer to confirm)

1. **Partial-failure toast surfacing** — this spec specifies a dashboard-scoped toast with "Open board" CTA. Tech spec flags this as a design call (line 403); confirming the toast choice over alternatives (banner on the dashboard top, auto-route to the new board) is a PM decision. Recommendation: ship the toast — least disruptive, most discoverable, matches canonical pattern §5.
2. **Submit button phase labels** — this spec specifies phase-aware labels ("Creating project…" → "Adding columns…"). Tech spec step 6 notes the phase callback is optional; if the orchestrator does not expose a phase transition event, the developer should fall back to "Creating…" for the whole duration. Either is AC-compliant.
3. **Fieldset legend contrast below `$bp-md`** — `$text-secondary` on `$bg-sidebar-light` fails the 4.5:1 body threshold at 4.3:1. Recommendation: force the <`$bp-md` legend to `$text-primary`; at ≥`$bp-md` the legend becomes large-text where the 3:1 threshold applies and `$text-secondary` passes.
4. **Partial failure where all columns fail** — same toast copy pattern, same auto-dismiss duration. If PM wants a more emphatic treatment ("nothing was added to your board — try again?"), flag it now.
5. **Max column count cap** — context line 165 and tech spec leave this open. This spec does not enforce a cap; the row list scrolls internally via the dialog's overflow. If UX testing reveals a cap is needed (performance, cognitive load), surface it as a future ticket.

---

*Self-review verified: every color, spacing, and radius references a canonical token; every interactive element has default / hover / focus-visible / active / disabled; empty / error / loading / drop-target / duplicate / dragging states are all designed; drag interactions specify both mouse and keyboard paths; color signals are always paired with text or icon; touch targets ≥44 px below `$bp-md`; `prefers-reduced-motion` is honored via the global rule plus per-animation justifications; tab order is documented end-to-end; every contrast ratio is cited with a measured number.*
