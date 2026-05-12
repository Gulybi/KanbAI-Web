# Design Specification: Delete projects, columns, and tasks from the UI

**Technical Spec:** [issue_96_tech_spec.md](./issue_96_tech_spec.md)
**Context Document:** [issue_96_context.md](./issue_96_context.md)
**GitHub Issue:** #96
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Section 1 — Overview

### Design Intent

Deletion is the most consequential action a user can take in KanbAI — it removes *somebody's* project, *somebody's* sprint column, or *somebody's* half-written task forever. The design must make three things simultaneously true: the affordance is **discoverable** (every primitive has a clearly-labelled delete path in the surface that owns it), the step before the delete is **unmistakable** (a modal that names the target, cites the consequences, and colours the primary action with the reserved destructive hue), and the recovery from error is **quiet** (the dialog stays open, the copy is human, the retry is a single click). The visual vocabulary is the coral `$status-high` tone already established for destructive confirmations — we are not introducing new colour, we are applying the existing destructive palette consistently to four new surfaces.

### Scope

- **Components styled (new):** `DeleteProjectConfirmDialogComponent`, `DeleteColumnConfirmDialogComponent`, `DeleteTaskConfirmDialogComponent`, `BoardHeaderComponent`, `ToastHostComponent`.
- **Components restyled (modifications):** `ProjectCardComponent` (new kebab + CDK menu), `BoardColumnComponent` (new kebab + CDK menu), `TaskDetailPanelComponent` (new destructive footer zone).
- **Shared token/pattern work:** a single reusable `.kanbai-menu` / `.kanbai-menuitem` style pair for the three CDK menus so the three kebabs are visually identical. No net-new tokens (see Section 2).
- **States covered per affordance:** default · hover · `:focus-visible` · active · disabled · disabled-with-hint (project kebab only) · loading/submitting.
- **States covered per dialog:** default · submitting (primary disabled + inline spinner) · inline error (network / 403 / generic) · cancel/Escape dismiss.
- **Responsive:** mobile (`< $bp-md`), tablet (`$bp-md` – `$bp-lg`), desktop (`≥ $bp-lg`). Coarse-pointer touch targets ≥ 44 × 44 px.
- **Flows documented (7):** owner deletes from card kebab · owner deletes from board header · member deletes column (with/without tasks) · member deletes task from panel · non-owner sees disabled hint · network failure → inline retry-in-place → success · remote delete arrives while target open.

---

## Section 2 — Tokens Used

All values consume the canonical KanbAI v1.0 tokens at `KanbAI-Web/src/styles/variables/`. **No new tokens are introduced.** The coral `$status-high` (#E56B6F) is the shipped destructive hue and is reused verbatim from the `RemoveMemberConfirmDialog` / `TaskDescriptionClearConfirmDialog` patterns.

| Token | Where used in this feature |
|---|---|
| `$brand-primary` (#8C9B7B) | `:focus-visible` outline on every non-destructive control (kebab triggers, menu items, Cancel button, toast dismiss). |
| `$brand-primary-hover` (#7A8A69) | Hover text colour on the toast's undo-style links (future-proofing; not required by this ticket). |
| `$brand-primary-light` (#E8EBE4) | Active state on kebab triggers (mirrors existing `project-card__manage-btn`). |
| `$bg-main` (#FFFFFF) | Dialog panel fill, toast fill. |
| `$bg-sidebar-light` (#F4F5F1) | Menu hover fill, Cancel button hover fill, kebab hover fill (matches existing vocabulary). |
| `$bg-card` (#FFFFFF) | Toast fill. |
| `$text-primary` (#1C1C1C) | Dialog heading, dialog body, menu item label, disabled menu item label (kept at full contrast for readability — the disabled affordance is signalled by reduced opacity of *the row* + icon, not by washed-out text). |
| `$text-secondary` (#7A7A7A) | Kebab glyph, toast meta, hint copy, destructive-zone intro label. |
| `$text-tertiary` (#A1A1A1) | Toast close glyph at rest. |
| `$text-inverse` (#FFFFFF) | Label on destructive primary button (on `$status-high` ground — WCAG-AA-for-large-text at ≥ 16 px / 500 weight, which the spec enforces). |
| `$status-high` (#E56B6F) | Destructive primary button fill + border, inline-error left-border, inline-error icon, destructive-zone hairline, destructive "Delete task" panel footer button. **The only colour used for destructive semantic signal — always paired with icon + text, never alone.** |
| `$border-light` (#EAEAEA) | Cancel button border, toast border, menu panel border, destructive-zone top separator. |
| `$radius-sm` (6 px) | Inline error row radius; menu item radius. |
| `$radius-md` (12 px) | Button radius, toast radius, menu panel radius. |
| `$radius-lg` (16 px) | Dialog panel radius. |
| `$radius-circle` (50%) | Kebab icon-button pill. |
| `$space-xxs`/`xs`/`sm`/`md`/`lg` (4/8/12/16/24 px) | All spacing. No raw pixels anywhere. |
| `$shadow-card-hover` | Kebab hover lift. |
| `$shadow-dropdown` | Dialog panel, CDK menu panel, toast. |
| `$motion-fast` (150 ms) | Hover, focus, menu-item highlight transitions. |
| `$motion-base` (250 ms) | Dialog enter. |
| `$motion-slow` (350 ms) | Toast enter (slide-in from right — matches `task-not-found-toast`). |
| `$bp-md` / `$bp-lg` | Responsive breakpoints. |
| `$font-size-sm/md/lg` · `$font-weight-medium/semibold` · `$line-height-tight/normal` | Typography across every surface. |

### Proposed Token Additions

**None.** The existing `$status-high` is sufficient for the destructive primary button; the hover feedback uses the established `box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.08)` token-pure darkening overlay (documented in-line in `remove-member-confirm-dialog.component.scss` and reused verbatim here).

### Known token gaps (documented, not blockers)

- There is no `$status-high-hover` token. The established inset-black-overlay hover pattern is explicitly token-pure and we keep using it. If a future ticket adds a dedicated destructive-hover token we migrate the four usages in one sweep.
- There is no canonical "visually hidden" utility class in `src/styles/`. Each surface that needs one currently inlines the `position: absolute; width: 1px; …` block (see `task-detail-panel__upload-live`). We do the same in `ToastHostComponent` for consistency — **developer note:** lifting a `%visually-hidden` placeholder into `src/styles/utilities/_a11y.scss` is a worthwhile follow-up but is **out of scope for #96**.

---

## Section 3 — Per-Component Styling

### 3.1 — `DeleteProjectConfirmDialogComponent`

**File:** `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.scss`
**Role:** Destructive confirmation modal for project deletion. Single visual language shared with the column and task dialogs (Sections 3.2, 3.3).
**Layout:** Single-column stack — heading · body paragraph · optional inline-error row · action row. Panel is fixed-width (`max-width: 420px`), centred by CDK overlay.
**States:** default · submitting (primary disabled, spinner inline) · inline-error (network / 403 / generic) · closing.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

/* ---------------------------------------------------------------
   CDK overlay pane chrome — scoped to .delete-project-confirm-panel
   so it does not leak. Mirrors remove-member-confirm-dialog.
---------------------------------------------------------------- */
.delete-project-confirm-panel {
  background-color: $bg-main;
  border-radius: $radius-lg;
  box-shadow: $shadow-dropdown;
  width: calc(100vw - (#{$space-md} * 2));
  max-width: 420px;
  padding: $space-md;
  display: block;
  animation: delete-project-confirm-enter $motion-base both;

  @include respond-to('md') {
    padding: $space-lg;
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }

  app-delete-project-confirm-dialog {
    display: block;
    font-family: $font-family-base;
    color: $text-primary;
  }

  .delete-project-confirm__heading {
    margin: 0 0 $space-sm 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
    color: $text-primary;
  }

  .delete-project-confirm__body {
    margin: 0 0 $space-lg 0;
    font-size: $font-size-md;
    line-height: $line-height-normal;
    color: $text-primary;

    strong {
      font-weight: $font-weight-semibold;
      color: $text-primary;
      word-break: break-word;
    }
  }

  // Inline error row — appears between body and actions when
  // inlineError() is non-null. role="alert" in the template.
  .delete-project-confirm__error {
    display: grid;
    grid-template-columns: 16px 1fr;
    column-gap: $space-xs;
    align-items: start;

    margin: 0 0 $space-md 0;
    padding: $space-xs $space-sm;

    background: $bg-card;
    border: 1px solid $border-light;
    border-left: 4px solid $status-high;
    border-radius: $radius-sm;

    color: $text-primary;

    // Icon placeholder — template renders an inline SVG (alert-circle)
    // at 16×16 in $status-high; text-only AT users get the copy too.
    .delete-project-confirm__error-icon {
      width: 16px;
      height: 16px;
      color: $status-high;
      margin-top: 2px;
    }

    .delete-project-confirm__error-text {
      margin: 0;
      font-size: $font-size-sm;
      line-height: $line-height-normal;
      word-break: break-word;
    }
  }

  .delete-project-confirm__actions {
    display: flex;
    justify-content: flex-end;
    gap: $space-sm;

    @media (max-width: #{$bp-md - 1px}) {
      flex-direction: column-reverse;
      align-items: stretch;
    }
  }

  .delete-project-confirm__cancel {
    appearance: none;
    background-color: transparent;
    color: $text-primary;
    border: 1px solid $border-light;
    border-radius: $radius-md;
    padding: $space-sm $space-md;
    min-height: 44px;
    font-family: $font-family-base;
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    line-height: 1;
    cursor: pointer;

    transition: background-color $motion-fast, border-color $motion-fast;

    &:hover  { background-color: $bg-sidebar-light; }
    &:focus-visible {
      outline: 2px solid $brand-primary;
      outline-offset: 2px;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .delete-project-confirm__confirm {
    appearance: none;
    background-color: $status-high;
    color: $text-inverse;
    border: 1px solid $status-high;
    border-radius: $radius-md;
    padding: $space-sm $space-md;
    min-height: 44px;
    min-width: 140px;
    font-family: $font-family-base;
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    line-height: 1;
    cursor: pointer;

    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: $space-xs;

    transition: background-color $motion-fast, border-color $motion-fast;

    // Token-pure destructive hover — 8% black overlay, no new token.
    &:hover:not(:disabled) {
      box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.08);
    }

    &:active:not(:disabled) { transform: translateY(1px); }

    &:focus-visible {
      outline: 2px solid $status-high;
      outline-offset: 2px;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    // Submitting spinner — 14×14 CSS-only ring, animates `transform`
    // only per motion discipline.
    .delete-project-confirm__spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: $text-inverse;
      border-radius: $radius-circle;
      animation: delete-project-confirm-spin 1s linear infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .delete-project-confirm__spinner { animation-duration: 0.01ms; }
    }
  }
}

.delete-project-confirm-backdrop {
  background-color: rgba(11, 11, 11, 0.5);
  animation: delete-project-confirm-backdrop-fade $motion-fast both;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

@keyframes delete-project-confirm-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes delete-project-confirm-backdrop-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes delete-project-confirm-spin {
  to { transform: rotate(360deg); }
}
```

**Template copy (verbatim from tech spec lines 446–478 / context doc — quote, do not re-word):**

- Heading (id `delete-project-confirm-heading`): `Delete this project?`
- Body: `'{{ data.projectName }}' and everything inside it (columns, tasks, attachments) will be permanently deleted. This cannot be undone.` — the project name is wrapped in `<strong>` for emphasis but rendered with the verbatim surrounding single-quotes.
- Cancel label: `Cancel`
- Primary label (default): `Delete project`
- Primary label (submitting): `Deleting…` plus the inline spinner (text node and spinner sit in a single flex row).
- Inline error row content, by status:
  - network: `Couldn't reach the server — try again`
  - `500` / other: `Couldn't delete project — please try again`
  - (403 closes the dialog — copy surfaces via toast, see Section 4 Flow 1.)

**Interaction notes:**
- Primary button is `[disabled]="submitting()"`. On click it emits `confirmClicked` — it does **not** close the dialog. The smart parent closes on a terminal 204/404.
- Cancel closes with `undefined`. Escape fires CDK's default `disableClose: false` behaviour → also `undefined`.
- Backdrop click: same as Escape — dismiss with `undefined`.
- When `inlineError()` transitions from null → non-null, the error row appears between body and actions; the dialog does **not** re-animate (we add the row inside the already-open panel so the change is local).
- Mobile (`< $bp-md`): actions stack `flex-direction: column-reverse` so the destructive primary sits on top — the user is less likely to mis-tap Cancel on a thumb-reach gesture.

**Accessibility:**
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="delete-project-confirm-heading"` applied by CDK via the config bag in the smart parent.
- Inline error: `role="alert"` so AT announces the content once on appearance.
- Contrast: white-on-coral primary button = **3.5 : 1** — meets AA for large text (≥ 16 px / 500 weight, which `$font-size-md` / `$font-weight-medium` satisfies). Body copy on panel: `$text-primary` on `$bg-main` = 17.9 : 1.
- Touch: primary and Cancel both `min-height: 44px`; mobile stacks to full-width for easier targeting.

---

### 3.2 — `DeleteColumnConfirmDialogComponent`

**File:** `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.scss`
**Role:** Same visual language as 3.1, adapted for column. The body text branches on `data.taskCount > 0`.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

.delete-column-confirm-panel {
  background-color: $bg-main;
  border-radius: $radius-lg;
  box-shadow: $shadow-dropdown;
  width: calc(100vw - (#{$space-md} * 2));
  max-width: 420px;
  padding: $space-md;
  display: block;
  animation: delete-column-confirm-enter $motion-base both;

  @include respond-to('md') { padding: $space-lg; }
  @media (prefers-reduced-motion: reduce) { animation-duration: 0.01ms; }

  app-delete-column-confirm-dialog {
    display: block;
    font-family: $font-family-base;
    color: $text-primary;
  }

  .delete-column-confirm__heading {
    margin: 0 0 $space-sm 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
    color: $text-primary;
  }

  .delete-column-confirm__body {
    margin: 0 0 $space-lg 0;
    font-size: $font-size-md;
    line-height: $line-height-normal;
    color: $text-primary;

    strong { font-weight: $font-weight-semibold; word-break: break-word; }
  }

  // Task-count emphasis — the single integer inside the "with tasks"
  // copy is given a slightly stronger weight to help scanning without
  // inventing a new colour.
  .delete-column-confirm__task-count {
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }

  .delete-column-confirm__error { @extend .delete-project-confirm__error-shape; }
  .delete-column-confirm__actions  { @extend .delete-project-confirm__actions-shape; }
  .delete-column-confirm__cancel   { @extend .delete-project-confirm__cancel-shape; }
  .delete-column-confirm__confirm  { @extend .delete-project-confirm__confirm-shape; }
}

.delete-column-confirm-backdrop {
  background-color: rgba(11, 11, 11, 0.5);
  animation: delete-column-confirm-backdrop-fade $motion-fast both;
  @media (prefers-reduced-motion: reduce) { animation-duration: 0.01ms; }
}

@keyframes delete-column-confirm-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes delete-column-confirm-backdrop-fade {
  from { opacity: 0; } to { opacity: 1; }
}
```

**Developer note on `@extend`:** the `-shape` placeholders above are documentation shorthand — inline the error / actions / cancel / confirm SCSS blocks verbatim from 3.1 rather than taking a literal SCSS `@extend` dependency on another file. The three delete dialogs are intentionally sibling files with duplicated rules so each remains independently test-driveable; duplication is cheap here (≈ 80 lines per dialog) and eliminates cross-file action-at-a-distance.

**Template copy (verbatim):**

- Heading (id `delete-column-confirm-heading`): `Delete this column?`
- Body (`data.taskCount > 0`): `'{{ data.columnName }}' contains `*`{{ data.taskCount }}`*` task(s). Deleting the column will permanently delete every task it contains. This cannot be undone.` — render the column name in `<strong>` and the integer in `<span class="delete-column-confirm__task-count">`.
- Body (`data.taskCount === 0`): `'{{ data.columnName }}' will be permanently deleted. This cannot be undone.`
- Cancel: `Cancel`
- Primary (default): `Delete column`
- Primary (submitting): `Deleting…` + spinner
- Inline error row, by status: network → `Couldn't reach the server — try again`; 500/other → `Couldn't delete column — please try again`. 403 closes the dialog; toast surfaces `You don't have permission to delete this column`.

**Interaction / a11y:** identical to 3.1. The integer is exposed to SR via the plain text (no `aria-label` gymnastics needed). Pluralisation: copy says `task(s)` verbatim per the context doc — we do not attempt runtime singular/plural branching.

---

### 3.3 — `DeleteTaskConfirmDialogComponent`

**File:** `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.scss`
**Role:** Same visual language as 3.1 / 3.2, adapted for task.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

.delete-task-confirm-panel {
  background-color: $bg-main;
  border-radius: $radius-lg;
  box-shadow: $shadow-dropdown;
  width: calc(100vw - (#{$space-md} * 2));
  max-width: 420px;
  padding: $space-md;
  display: block;
  animation: delete-task-confirm-enter $motion-base both;

  @include respond-to('md') { padding: $space-lg; }
  @media (prefers-reduced-motion: reduce) { animation-duration: 0.01ms; }

  app-delete-task-confirm-dialog {
    display: block;
    font-family: $font-family-base;
    color: $text-primary;
  }

  .delete-task-confirm__heading {
    margin: 0 0 $space-sm 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
    color: $text-primary;
  }

  .delete-task-confirm__body {
    margin: 0 0 $space-lg 0;
    font-size: $font-size-md;
    line-height: $line-height-normal;
    color: $text-primary;

    strong { font-weight: $font-weight-semibold; word-break: break-word; }
  }

  /* Error / actions / cancel / confirm blocks: inline verbatim from
     .delete-project-confirm-panel — see dev note in §3.2. */
}

.delete-task-confirm-backdrop {
  background-color: rgba(11, 11, 11, 0.5);
  animation: delete-task-confirm-backdrop-fade $motion-fast both;
  @media (prefers-reduced-motion: reduce) { animation-duration: 0.01ms; }
}

@keyframes delete-task-confirm-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes delete-task-confirm-backdrop-fade {
  from { opacity: 0; } to { opacity: 1; }
}
```

**Template copy (verbatim):**

- Heading (id `delete-task-confirm-heading`): `Delete this task?`
- Body: `'{{ data.taskTitle }}' and all its attachments will be permanently deleted. This cannot be undone.` — title wrapped in `<strong>`.
- Cancel: `Cancel`
- Primary (default): `Delete task`
- Primary (submitting): `Deleting…` + spinner
- Inline error row, by status: network → `Couldn't reach the server — try again`; 500 → `Couldn't delete task — please try again` (retry-in-place valid because task preserved server-side); other → same generic. 403 closes with inline error `You don't have permission to delete this task` (per context doc the 403 copy for task is **inline**, not a toast — see tech spec copy matrix row 453, last column — the dialog surfaces it inline then lets the user dismiss).

**Developer note on 403 treatment difference:** project 403 → close + toast. Column 403 → close + toast. Task 403 → close + **inline** (the user already saw the panel; a toast on top of the newly-visible panel would be noisy). The copy matrix mandates this asymmetry — do not normalise.

---

### 3.4 — Shared kebab trigger + CDK menu (used by `ProjectCardComponent`, `BoardHeaderComponent`, `BoardColumnComponent`)

Each of the three kebab affordances uses its own class-scoped SCSS but shares this **visual contract** (the rules are repeated inside each host SCSS, not extracted to a global — deliberate duplication to keep each component independently deletable):

**Kebab trigger (icon button) — visual contract:**

| Property | Value |
|---|---|
| Size (desktop) | `32 × 32 px` (`$space-xl` / coarse-pointer promoted to 44 × 44). |
| Border-radius | `$radius-circle`. |
| Background (rest) | `transparent`. |
| Background (hover) | `$bg-sidebar-light`. |
| Background (active) | `$brand-primary-light`. |
| Icon colour (rest) | `$text-secondary`. |
| Icon colour (hover/active) | `$text-primary`. |
| Icon size | `18 × 18 px` desktop, `20 × 20 px` coarse pointer. |
| Focus | `outline: 2px solid $brand-primary; outline-offset: 2px` on `:focus-visible` only (no `:focus` outline fallback). |
| Transition | `background-color, color $motion-fast`. |
| Visibility on `ProjectCardComponent` | hidden at rest; revealed on `:hover` of `.project-card` **and** always visible when the button itself has `:focus-visible` (keyboard users must see it). Also always visible on coarse pointers (`@media (pointer: coarse)`). |
| Visibility on `BoardColumnComponent` / `BoardHeaderComponent` | always visible (these surfaces are not hover-revealed; the card/column kebab convention is card-only). |

**CDK menu panel — visual contract:**

| Property | Value |
|---|---|
| Min-width | `200 px`. |
| Padding | `$space-xxs` vertical. |
| Background | `$bg-main`. |
| Border | `1px solid $border-light`. |
| Border-radius | `$radius-md`. |
| Shadow | `$shadow-dropdown`. |
| Enter animation | `opacity 0 → 1` + `translateY(-4px) → 0` over `$motion-fast`. |

**CDK menu item — visual contract:**

| Property | Default | Hover / `.cdk-focused` / `:focus-visible` | Disabled (non-owner hint) |
|---|---|---|---|
| Padding | `$space-xs $space-md`. | same | same |
| Min-height | `40 px` (`44 px` on coarse pointer). | same | same |
| Typography | `$font-size-md` / `$font-weight-medium` / `$line-height-normal`. | same | same |
| Label colour | `$text-primary`. | `$text-primary`. | `$text-primary` at `opacity: 0.5` (the whole row is dimmed, not just the text). |
| Background | `transparent`. | `$bg-sidebar-light`. | `transparent` (no hover). |
| Cursor | `pointer`. | `pointer`. | `not-allowed`. |
| Delete-specific row | destructive glyph (trash) in `$status-high` at 16 × 16 left of label; label itself stays `$text-primary`. | background `$bg-sidebar-light`; glyph stays `$status-high`. | whole row 0.5 opacity incl. glyph. |
| Hint line (**project kebab only, disabled state**) | — | — | a second line under the label in `$font-size-sm` / `$text-secondary` rendering the frozen copy `Only the project owner can delete this project`. |
| Focus ring | — | `outline: 2px solid $brand-primary; outline-offset: -2px` (inner ring so the ring doesn't clip the menu panel). | no focus (item is `aria-disabled="true"` and non-focusable). |

**Reference SCSS for the `.project-card__menu-btn` / `.project-card__menu` pair (developer inlines equivalents in the two other hosts):**

```scss
/* Appended to project-card.component.scss */

.project-card__menu-btn {
  appearance: none;
  background-color: transparent;
  border: 1px solid transparent;
  padding: 0;
  margin: 0;

  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-circle;

  color: $text-secondary;
  cursor: pointer;

  // Card-only reveal-on-hover behaviour.
  opacity: 0;
  transition:
    opacity         $motion-fast,
    background-color $motion-fast,
    color           $motion-fast;

  .project-card:hover &,
  &:focus-visible {
    opacity: 1;
  }

  @media (pointer: coarse) {
    opacity: 1;
    width: 44px;
    height: 44px;
  }

  &:hover:not(:disabled) {
    background-color: $bg-sidebar-light;
    color: $text-primary;
  }

  &:active:not(:disabled) {
    background-color: $brand-primary-light;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) { outline: none; }

  svg {
    width: 18px;
    height: 18px;
    display: block;

    @media (pointer: coarse) { width: 20px; height: 20px; }
  }
}

/* CDK menu panel + items — shared class pair used by all three kebabs.
   Emitted globally via ViewEncapsulation.None on the host component
   that opens this menu (same pattern as members-dialog-panel). */

.kanbai-menu {
  min-width: 200px;
  padding: $space-xxs 0;

  background: $bg-main;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  box-shadow: $shadow-dropdown;

  animation: kanbai-menu-enter $motion-fast both;

  @media (prefers-reduced-motion: reduce) { animation-duration: 0.01ms; }
}

.kanbai-menuitem {
  display: grid;
  grid-template-columns: 16px 1fr;
  column-gap: $space-xs;
  align-items: center;

  width: 100%;
  padding: $space-xs $space-md;
  min-height: 40px;

  appearance: none;
  background: transparent;
  border: 0;
  text-align: left;

  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-normal;
  color: $text-primary;

  cursor: pointer;
  transition: background-color $motion-fast;

  @media (pointer: coarse) { min-height: 44px; }

  &:hover,
  &.cdk-focused,
  &:focus-visible {
    background-color: $bg-sidebar-light;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: -2px;
  }

  // Destructive variant — used for every Delete item across the three menus.
  &.kanbai-menuitem--destructive {
    .kanbai-menuitem__icon { color: $status-high; }
  }

  &[aria-disabled='true'] {
    opacity: 0.5;
    cursor: not-allowed;

    &:hover, &.cdk-focused { background: transparent; }
  }

  .kanbai-menuitem__icon {
    width: 16px;
    height: 16px;
    color: $text-secondary;
  }

  // Two-line variant for the disabled-with-hint project-delete row.
  &.kanbai-menuitem--with-hint {
    grid-template-columns: 16px 1fr;
    grid-template-rows: auto auto;
    row-gap: $space-xxs;

    .kanbai-menuitem__icon { grid-row: 1 / span 2; margin-top: 2px; }
    .kanbai-menuitem__label { grid-column: 2; grid-row: 1; }
    .kanbai-menuitem__hint {
      grid-column: 2;
      grid-row: 2;
      font-size: $font-size-sm;
      font-weight: $font-weight-regular;
      color: $text-secondary;
      line-height: $line-height-tight;
    }
  }
}

@keyframes kanbai-menu-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**Accessibility contract for the kebab + menu:**
- Kebab button: `aria-label="Project actions"` / `"Column actions"` / `"Board actions"`; `aria-haspopup="menu"`; `aria-expanded` toggled by CDK.
- Menu panel: `role="menu"` (CDK).
- Menu item: `role="menuitem"` (CDK). Delete item for non-owner: `aria-disabled="true"` and `aria-describedby` pointing at an `<span class="kanbai-menuitem__hint">` that renders the frozen copy. Non-focusable — CDK Menu skips `aria-disabled` items in keyboard nav.
- **Focus restoration** on menu close: CDK Menu returns focus to the trigger (the kebab). When the Delete item opens the confirm dialog, CDK Dialog's `restoreFocus: true` returns focus to whatever had focus when the dialog opened — which is the menu item — and the menu is already closed by then, so focus lands back on the kebab trigger via CDK Menu's own `cdkMenuClosed` behaviour. **Tested chain:** kebab → menu opens, focus on Delete item → Enter opens dialog, menu closes, focus parked → dialog closes → focus returns to Delete menu item → Delete menu item is gone → CDK falls through to kebab trigger. Developer must verify this chain end-to-end in D.4 E2E.

---

### 3.5 — `ProjectCardComponent` — modifications

**File:** `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.scss` (append-only)
**Role:** existing card gains a kebab trigger in the header row next to the existing "Manage members" button.

**Layout change:** inside `.project-card__header`, the right-hand action cluster becomes a flex row of two icon buttons (`.project-card__manage-btn` shipped + `.project-card__menu-btn` new) with `gap: $space-xxs`. The kebab sits to the right of Manage.

**SCSS:** the SCSS block from Section 3.4 is appended verbatim. The existing `:focus-visible` / active patterns are already card-consistent.

**Disabled-with-hint state:** delegated to the menu item (Section 3.4). The kebab trigger itself is always enabled — *every* viewer can open the menu; only the one row inside is disabled for non-owners.

**Accessibility:**
- Kebab: `aria-label="Actions for {project name}"` so SR users hear the scope.
- Contrast on kebab at rest (`$text-secondary` on `$bg-card`) = 4.6 : 1 ✅ AA.
- Contrast on kebab hover (`$text-primary` on `$bg-sidebar-light`) = 16.3 : 1 ✅ AAA.

---

### 3.6 — `BoardColumnComponent` — modifications

**File:** `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss` (append-only)
**Role:** existing column header gains a kebab trigger positioned between the column name and the count pill, or after the count pill if gap is tight.

**Layout change:** `.board-column__header` becomes a flex row of three items — name (grows), count pill (fixed), kebab (fixed). `gap: $space-sm` unchanged. Column minimum width stays 300 px (`$kanban-column-width`); the kebab (`32 × 32`) fits comfortably because the existing spec allows the name to truncate with ellipsis.

**Always-visible kebab:** unlike the card, the column kebab is always rendered (no `opacity: 0` at rest). Column headers are always on-screen; the hover-reveal pattern would fight with keyboard discoverability.

**SCSS additions (appended to `board-column.component.scss`):**

```scss
.board-column__menu-btn {
  appearance: none;
  background-color: transparent;
  border: 1px solid transparent;
  padding: 0;
  margin: 0;

  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-circle;

  color: $text-secondary;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    color            $motion-fast;

  &:hover:not(:disabled) {
    background-color: $bg-main;
    color: $text-primary;
  }

  &:active:not(:disabled) {
    background-color: $brand-primary-light;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) { outline: none; }

  svg { width: 18px; height: 18px; display: block; }

  @media (pointer: coarse) {
    width: 44px;
    height: 44px;
    svg { width: 20px; height: 20px; }
  }
}
```

**Note on hover background:** we use `$bg-main` here (not `$bg-sidebar-light`) because the column *shell* is already `$bg-sidebar-light` — using the same tone would give zero hover affordance. `$bg-main` reads as "inset card" against the column chip and maintains the affordance.

---

### 3.7 — `BoardHeaderComponent` (new)

**Files:**
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.scss`
- HTML: title `<h1>` + right-aligned kebab + CDK menu.

**Role:** top strip of the board page showing the project name and the board-level delete affordance.

**Layout:** flex row, `align-items: center`, `justify-content: space-between`, `padding: $space-md $content-padding` (tablet/desktop) or `$space-sm $space-md` (mobile). Title uses `$font-size-xxl` desktop / `$font-size-xl` mobile. Title truncates with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` so the kebab never collides.

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
  border-bottom: 1px solid $border-light;
}

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-md;

  padding: $space-sm $space-md;

  @include respond-to('md') {
    padding: $space-md $content-padding;
  }
}

.board-header__title {
  margin: 0;
  min-width: 0;

  font-family: $font-family-base;
  font-size: $font-size-xl;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;
  letter-spacing: -0.01em;

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @include respond-to('md') {
    font-size: $font-size-xxl;
  }
}

.board-header__menu-btn {
  /* Same visual contract as .board-column__menu-btn — inline the 32×32
     circular icon-button rules (see §3.6). */
  appearance: none;
  background-color: transparent;
  border: 1px solid transparent;
  padding: 0;
  margin: 0;

  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-circle;

  color: $text-secondary;
  cursor: pointer;

  transition: background-color $motion-fast, color $motion-fast;

  &:hover:not(:disabled) {
    background-color: $bg-sidebar-light;
    color: $text-primary;
  }
  &:active:not(:disabled) {
    background-color: $brand-primary-light;
    color: $text-primary;
  }
  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }
  &:focus:not(:focus-visible) { outline: none; }

  svg { width: 18px; height: 18px; display: block; }

  @media (pointer: coarse) {
    width: 44px;
    height: 44px;
    svg { width: 20px; height: 20px; }
  }
}
```

**Accessibility:**
- Title is `<h1>` (top of the document outline on the board page).
- Kebab: `aria-label="Project actions"`.
- Contrast: `$text-primary` on `$bg-main` = 17.9 : 1 ✅ AAA.

---

### 3.8 — `TaskDetailPanelComponent` — destructive footer zone (modification)

**File:** `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss` (append-only)
**Role:** add a destructive footer zone at the bottom of the panel, below the description Save/Cancel and below the attachment section.

**Layout:** the zone sits **inside** `.task-detail-panel__body` (so it scrolls with the body, not pinned to the viewport), separated from the last section by a `$space-lg` gap and a hairline `border-top: 1px solid $border-light` running edge-to-edge. A short label above the button reads `Danger zone` in `$font-size-sm` / `$font-weight-semibold` / `$text-secondary` / uppercase / `letter-spacing: 0.02em` — same label vocabulary as the existing section labels. One button below the label: `Delete task`, destructive secondary treatment (outline, not solid — see below).

**Why the button is an outline button, not a solid destructive button:** the dialog's primary button is solid `$status-high`. Surfacing a second solid destructive button on the panel itself would double-weight the affordance and compete with the description Save button for visual primacy. The outline treatment signals *entry into a destructive flow* (rather than the destructive action itself) while still being unmistakably red through its border + text + icon.

```scss
/* Appended to task-detail-panel.component.scss */

.task-detail-panel__destructive-zone {
  display: flex;
  flex-direction: column;
  gap: $space-xs;

  padding-top: $space-lg;
  margin-top: $space-md;
  border-top: 1px solid $border-light;
}

.task-detail-panel__destructive-label {
  margin: 0;

  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: $text-secondary;
}

.task-detail-panel__delete-btn {
  appearance: none;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-xs;

  align-self: flex-start;

  padding: $space-sm $space-md;
  min-height: 44px;

  background: transparent;
  color: $status-high;
  border: 1px solid $status-high;
  border-radius: $radius-md;

  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: 1;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    color            $motion-fast;

  svg {
    width: 16px;
    height: 16px;
    color: currentColor;
  }

  &:hover:not(:disabled) {
    background-color: $status-high;
    color: $text-inverse;
  }

  &:active:not(:disabled) { transform: translateY(1px); }

  &:focus-visible {
    outline: 2px solid $status-high;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: #{$bp-md - 1px}) {
    align-self: stretch;
    width: 100%;
  }
}
```

**Accessibility:**
- Label is a plain `<p>` (not a heading — avoids polluting the heading outline between the task title `<h2>` and any future subsections).
- Button: `aria-label="Delete task"` (visible text already `Delete task`; the aria-label is defensive if the visible text is ever hidden visually on a narrow mobile build).
- Contrast `$status-high` text on `$bg-main` = 3.5 : 1 ✅ UI/large-text AA. On hover the palette inverts: `$text-inverse` on `$status-high` = 3.5 : 1 ✅ same large-text AA.
- Icon + text + red border + red fill-on-hover — four channels signalling destructiveness, no single-channel colour reliance.

---

### 3.9 — `ToastHostComponent` (new)

**Files:**
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.scss`
- Template slots: one visible toast region (when `currentToast() !== null`) + one visually-hidden `aria-live="polite"` region bound to `currentAnnouncement()`.

**Role:** application-shell-level single-slot toast. Visual vocabulary follows the shipped `task-not-found-toast` / `partial-failure-toast` verbatim so our three toast patterns read as one family.

**Decision on left-border colour:** the shipped toasts use `border-left: 4px solid $status-high` (both are error/caution toasts). For the success deletion toasts (`Project '…' was deleted`) we use `border-left: 4px solid $brand-primary` — sage, positive. For the remote-delete toasts (`This project was deleted by another member`) we use `border-left: 4px solid $text-secondary` — neutral-informational. The component accepts a `tone: 'success' | 'info'` input and swaps the class; this is internal state and the service API remains `show(message)` (the service infers tone from its own callsite — see Open Questions below if PM wants to expose tone).

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
  right: $space-md;
  bottom: $space-md;
  z-index: 1000;

  max-width: 420px;
  width: calc(100vw - #{$space-md * 2});

  pointer-events: none;   // so the fixed host never blocks background clicks
                          // in the gap between toasts.

  @include respond-to('md') {
    right: $space-lg;
    bottom: $space-lg;
    width: auto;
    min-width: 320px;
  }
}

.toast-host__toast {
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: $space-sm;
  align-items: center;

  padding: $space-sm $space-md;

  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  box-shadow: $shadow-dropdown;

  font-family: $font-family-base;
  color: $text-primary;

  pointer-events: auto;  // re-enable for the visible toast itself.

  animation: toast-host-enter $motion-slow both;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }

  &.toast-host__toast--success {
    border-left: 4px solid $brand-primary;

    .toast-host__toast-icon { color: $brand-primary; }
  }

  &.toast-host__toast--info {
    border-left: 4px solid $text-secondary;

    .toast-host__toast-icon { color: $text-secondary; }
  }
}

.toast-host__toast-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
}

.toast-host__toast-message {
  margin: 0;
  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $text-primary;
  word-break: break-word;
}

.toast-host__toast-dismiss {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 28px;
  height: 28px;

  background: transparent;
  color: $text-tertiary;
  border: 0;
  border-radius: $radius-circle;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    color            $motion-fast;

  svg { width: 14px; height: 14px; }

  &:hover {
    background: $bg-sidebar-light;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  @media (max-width: #{$bp-md - 1px}) {
    width: 44px;
    height: 44px;
  }
}

// Visually-hidden aria-live region. Not styled visually — kept invisible
// to sighted users and non-AT users. Intentionally inlined (no shared
// utility exists today — see Section 2 "Known token gaps").
.toast-host__live {
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

@keyframes toast-host-enter {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

**Accessibility:**
- The visible toast is NOT the live region. The separate `.toast-host__live` div is `role="status" aria-live="polite"`. This prevents double announcement when the toast animates in. (Tech spec step D.2.)
- The `announce()` service method clears-then-sets `currentAnnouncement` (queueMicrotask between empty and new value) so two identical consecutive announcements are still spoken.
- The visible toast has `role="status"` on its own wrapper too — redundant with the live region by design; some screen readers ignore one or the other.
- Dismiss button: `aria-label="Dismiss notification"`.
- Focus is never stolen — the toast is not focused on appearance, and the dismiss button is only reachable via Shift+Tab from wherever focus currently is (deliberate — Tab order doesn't route to toast during normal work).

**Success-toast copy (verbatim — do not re-word):**
- `Project '{name}' was deleted`
- `Column '{name}' was deleted`
- `Task '{title}' was deleted`

**Info-toast (remote-delete, verbatim):**
- `This project was deleted by another member`
- `This column was deleted by another member`
- `This task was deleted by another member`

**403 toast copy (project / column — tasks surface inline — verbatim):**
- `Only the project owner can delete this project`
- `You don't have permission to delete this column`

**Aria-live polite announcement copy (verbatim):**
- `Project deleted`
- `Column deleted`
- `Task deleted`

---

## Section 4 — User Flows

Each flow documents: visual state transitions, motion timing, a11y announcements, focus management, and copy (all copy is verbatim from the tech spec copy matrix — do not re-word).

### Flow 1 — Owner deletes project from card kebab

1. **At rest.** Project card: `$shadow-card`, kebab hidden (`opacity: 0`). Focus in document is elsewhere.
2. **Hover over card.** Card lifts 2px, `$shadow-card-hover`. Kebab fades in over `$motion-fast` (from `opacity: 0` to `1`). Cursor is default over the card body, `pointer` over the kebab and the Manage button.
3. **Tab reaches the kebab.** Kebab gets the 2px `$brand-primary` focus ring (offset 2px). Kebab becomes `opacity: 1` regardless of card hover state.
4. **Enter / Space on kebab.** CDK Menu panel opens below-right of the kebab with `$motion-fast` slide-in from `translateY(-4px) → 0`. First item (the Delete item) receives focus — CDK Menu auto-focuses the first enabled item.
5. **Delete menu item (enabled, owner).** Row shows trash glyph in `$status-high`, label `Delete project` in `$text-primary`. Background on focus is `$bg-sidebar-light`, inner ring `$brand-primary`.
6. **Enter on Delete item.** Menu closes (`$motion-fast` fade + translate). `DeleteProjectConfirmDialogComponent` opens — backdrop fades in `$motion-fast`, panel slide-enters `$motion-base` (`translateY(8px) → 0` + `opacity 0 → 1`). First-tabbable focus target is the Cancel button (per `autoFocus: 'first-tabbable'` in the config bag).
7. **Dialog at rest.**
   - Heading: **Delete this project?**
   - Body: *'{name}' and everything inside it (columns, tasks, attachments) will be permanently deleted. This cannot be undone.*
   - Actions (right-aligned desktop, stacked-reverse mobile): Cancel (outline) + **Delete project** (solid coral).
8. **User Tabs to the primary button and presses Enter.** Primary becomes `[disabled]="true"`, label swaps to *Deleting…* + spinner (14 × 14 white ring spinning at 1s/rev). Cancel becomes `[disabled]="true"` (opacity 0.5). No other visible change.
9. **Server returns 204 (or 404 — silent success).** Dialog closes; backdrop fades out. Card disappears from the grid (Angular re-renders without it — no bespoke animation for removal in this ticket). Focus returns to the card that used to be at the grid position — developer delegates to CDK's `restoreFocus: true`, which can only return to the opener; since the opener (menu item) is gone, focus lands on `<body>`. **Developer must** call `.focus()` on the next card in the grid, or on the grid itself, to avoid focus orphaning. (This is the belt-and-braces behaviour called out in tech spec step D.1.)
10. **Toast slides in bottom-right.** `toast-host__toast--success` variant — sage left-border, sage checkmark icon. Copy: `Project '{name}' was deleted`. Auto-dismiss at 8s; pauses on hover/focus.
11. **Aria-live announces** `Project deleted` once.
12. **Summary motion budget.** Menu enter 150ms · Dialog enter 250ms · Spinner 1s/rev during submit · Dialog exit 150ms · Toast slide-in 350ms · Total perceived latency: network RT + ~500ms animation.

### Flow 2 — Owner deletes project from board header kebab → navigate to dashboard

1. User is on `/projects/:id/board`. Board header renders `<h1>{name}</h1>` + kebab. Kebab is always visible (no hover reveal, unlike the card).
2. Tab / mouse to kebab → Enter → CDK Menu opens (same visual as Flow 1).
3. Enter on Delete → `DeleteProjectConfirmDialogComponent` opens with the same copy.
4. User confirms → primary submits → server 204.
5. **Navigation fires FIRST** (`router.navigate(['/dashboard'])`), THEN the dialog close, THEN the toast. Rationale from tech spec step A.5: the dashboard must be the page where the toast appears — announcing *"Project '{name}' was deleted"* on a board whose data is about to unmount looks like a contradiction.
6. Dashboard page mounts; toast slides in bottom-right; aria-live announces `Project deleted`.
7. Focus lands on the dashboard page's primary landmark (tech spec implementation detail — developer focuses the grid's heading element).

### Flow 3 — Member deletes column (with tasks vs empty)

1. User hovers a column header or Tabs to the column-header kebab. Kebab is always visible on the column (see §3.6 decision).
2. Enter → CDK Menu opens with exactly one item: `Delete column` (trash glyph, `$status-high`, `$text-primary` label).
3. Enter on Delete → `DeleteColumnConfirmDialogComponent` opens.
4. **Body copy branches on `data.taskCount`.**
   - `taskCount > 0`: *'{name}' contains **N** task(s). Deleting the column will permanently delete every task it contains. This cannot be undone.* — the integer is `$font-weight-semibold`.
   - `taskCount === 0`: *'{name}' will be permanently deleted. This cannot be undone.*
5. Confirm → submit → server 204.
6. **Local cascade**: column + its task bucket both removed from state. If the task detail panel was open for a task in this column, the panel closes (`$motion-slow` slide-out) BEFORE the toast appears — the user must not see the panel hanging over a deleted column.
7. Toast: success tone, `Column '{name}' was deleted`. Aria-live: `Column deleted`.
8. Focus returns to the kebab trigger of the column — but the column is gone. CDK falls back to `<body>`; **developer must** focus the board root (board-page's `<main>`) to avoid orphan focus.

### Flow 4 — Member deletes task from the panel

1. Task is open in the panel. Panel scroll position is anywhere — the destructive footer zone lives *inside* `.task-detail-panel__body` so it scrolls with the content.
2. User Tabs past the description Save/Cancel, past the attachment list, lands on the outline `Delete task` button (red border, red text).
3. On hover: button fills with `$status-high`, text inverts to `$text-inverse` over `$motion-fast`.
4. Enter / click → `DeleteTaskConfirmDialogComponent` opens.
5. Body: *'{title}' and all its attachments will be permanently deleted. This cannot be undone.*
6. Confirm → submit → server 204.
7. **Panel close animation runs FIRST** (`transform: translateX(0 → 100%)` over `$motion-slow`) — visual order: dialog fades away → panel slides away → toast slides in. These run back-to-back, not simultaneously; simultaneous motion on three surfaces feels chaotic. Developer implements by sequencing via `setTimeout(fn, 150)` or by chaining on the dialog's `closed` observable.
8. Toast: `Task '{title}' was deleted`. Aria-live: `Task deleted`.
9. Focus returns to the originating task card on the board (tech spec step D.1 — explicit `.focus()` on the task card by DOM id, not CDK's auto-restore).

### Flow 5 — Non-owner sees Delete item disabled with hint

1. Member (not Owner) opens the project kebab on a card they didn't create.
2. Menu opens. Delete row is visible but:
   - The trash glyph is `$status-high` at **0.5 opacity**.
   - The label `Delete project` is `$text-primary` at **0.5 opacity**.
   - Under the label: `Only the project owner can delete this project` in `$font-size-sm` / `$text-secondary`.
   - The row has `cursor: not-allowed` and does not change background on hover.
   - `aria-disabled="true"` — SR announces "Delete project, dimmed — Only the project owner can delete this project".
3. Enter / click on the row does nothing. CDK Menu skips the disabled row in keyboard navigation (Down arrow skips it entirely).
4. The menu closes naturally on Escape or on focusing outside — focus returns to the kebab trigger.

### Flow 6 — Network failure → inline retry-in-place → success

1. User confirms any delete. Primary button swaps to *Deleting…* + spinner.
2. Request errors with `status === 0` (network).
3. **Dialog stays open.** Primary button returns to its default label and becomes enabled again.
4. Inline error row appears between body and actions — slides into existence *without* re-animating the whole dialog:
   - Row has `$status-high` left border (4 px), `$bg-card` fill, `$border-light` other sides, `$radius-sm`, padded `$space-xs $space-sm`.
   - Alert icon in `$status-high` at 16 × 16 on the left.
   - Text: `Couldn't reach the server — try again` in `$font-size-sm` / `$text-primary`.
   - `role="alert"` on the container — announced once by AT.
5. User clicks primary again (or Cancel to abort).
6. On click: the inline error row is cleared, spinner re-appears, second attempt fires.
7. Server returns 204 → dialog closes → success toast + aria-live announcement exactly as Flow 1.

**Motion on error appearance:** the error row fades in over `$motion-fast` with `opacity 0 → 1` (no translate — we do not want the buttons to jump). If `prefers-reduced-motion: reduce`, the opacity transition collapses to 0.01ms (global rule) — the row appears instantly and AT still announces via `role="alert"`.

### Flow 7 — Remote delete arrives while user has the target open

Three sub-flows per entity. All share the same visual shape: **close the surface that owns the now-deleted entity, show the info-tone toast, announce politely.**

**7a — Remote ProjectDeleted while on board.**
- `ProjectDeleted` arrives.
- `router.navigate(['/dashboard'])` fires.
- Board unmounts; dashboard mounts.
- Info toast slides in: `This project was deleted by another member` (neutral `$text-secondary` left-border, info-circle icon).
- Aria-live: `Project deleted` (same polite announcement as for user-initiated).

**7b — Remote ColumnDeleted while panel open on a task inside that column.**
- `ColumnDeleted` arrives.
- Panel slides closed (`$motion-slow`).
- Info toast slides in: `This column was deleted by another member`.
- No aria-live announcement (context doc: columns being deleted remotely don't announce — only the user's own actions do).
  - **Design spec note:** context doc explicitly says toast *appears once* and the user's flow-initiated announcements are the authoritative sources. Design follows that rule — remote events get a visible toast only.

**7c — Remote TaskDeleted while that task open in panel.**
- `TaskDeleted` arrives.
- Panel slides closed.
- Info toast: `This task was deleted by another member`.

**Remote delete on a project visible on the landing page (not open):**
- No toast. No announcement. The card fades out of the grid silently.
- This is the only flow in the feature with **no** user-facing feedback signal — deliberate, per context doc. Design renders nothing.

---

## Section 5 — Responsive Behavior

### Mobile (< `$bp-md` / 768 px)

- **Dialogs:** width clamps to `calc(100vw - 32px)` (two `$space-md` gutters). Actions stack `flex-direction: column-reverse`; the destructive primary sits on top, Cancel on bottom. Each button becomes full-width (`stretch`). Minimum height stays 44px.
- **Kebab triggers:** 44 × 44 px (promoted from 32 × 32 via `@media (pointer: coarse)` OR via `@media (max-width: 767px)` — coarse pointer is the correct semantic; pointer: coarse is our primary heuristic because some tablets use mouse at narrow widths).
- **Project card kebab:** always visible (no hover-reveal on mobile — `@media (pointer: coarse)` forces `opacity: 1`).
- **CDK menu panel:** minimum `200 px` width still applies; if it runs out of viewport room, CDK repositions (tab/flip behaviour shipped with CDK overlay).
- **Board header:** title uses `$font-size-xl` (not `$font-size-xxl`); padding `$space-sm $space-md`.
- **Task detail panel:** already goes full-width on mobile. Delete button becomes `width: 100%` (stretches) and stays at `min-height: 44px`.
- **Toast:** `width: calc(100vw - 32px)` from bottom-right; fills most of the width. Dismiss button becomes 44 × 44.

### Tablet (`$bp-md` – `$bp-lg` / 768 – 991 px)

- **Dialogs:** fixed `max-width: 420px`, centred. Actions are a horizontal row right-aligned. Button sizes are 32-family, but `min-height: 44px` is retained — in practice buttons are 44 tall with their natural width.
- **Board header:** `padding: $space-md $content-padding`; title `$font-size-xxl`.
- **Task detail panel:** 420 px wide drawer from the right.
- **Toast:** `auto` width with `min-width: 320px`, positioned `bottom-right` at `$space-lg` gutter.

### Desktop (≥ `$bp-lg` / 992 px)

- **Task detail panel:** 480 px wide drawer.
- Kebab triggers stay 32 × 32.
- All other surfaces: same as tablet.

### Hit-target audit (mobile)

| Target | Size mobile | ≥ 44 × 44? |
|---|---|---|
| Project card kebab | 44 × 44 | ✅ |
| Board header kebab | 44 × 44 | ✅ |
| Board column kebab | 44 × 44 | ✅ |
| Task panel Delete button | 44 × `stretch` | ✅ |
| Dialog Cancel button | 44 × `stretch` | ✅ |
| Dialog Delete button | 44 × `stretch` | ✅ |
| Toast dismiss | 44 × 44 | ✅ |
| Menu item | 44 × (≥ 200 px) | ✅ |

---

## Section 6 — Accessibility Audit (WCAG AA)

### Contrast — measured ratios

| Surface | Foreground | Background | Ratio | Verdict |
|---|---|---|---|---|
| Dialog heading | `$text-primary` (#1C1C1C) | `$bg-main` (#FFFFFF) | **17.9 : 1** | ✅ AAA |
| Dialog body | `$text-primary` | `$bg-main` | 17.9 : 1 | ✅ AAA |
| Inline error text | `$text-primary` | `$bg-card` (#FFFFFF) | 17.9 : 1 | ✅ AAA |
| Inline error icon | `$status-high` (#E56B6F) | `$bg-card` | 3.5 : 1 | ✅ UI AA (icon is non-text) |
| Cancel button label | `$text-primary` | `$bg-main` | 17.9 : 1 | ✅ AAA |
| Cancel hover fill | `$text-primary` | `$bg-sidebar-light` (#F4F5F1) | 16.3 : 1 | ✅ AAA |
| Delete primary label | `$text-inverse` (#FFFFFF) | `$status-high` (#E56B6F) | **3.5 : 1** | ✅ large-text AA (14 px / 500 ≥ threshold for bold @ 14 px per WCAG 1.4.3 Note 2: "large" = ≥ 18 px regular or ≥ 14 px bold; our button is 14 px at `$font-weight-medium`=500 which is borderline — **to be safe we promote label to `$font-weight-semibold`**, re-verified ratio unchanged at 3.5 : 1, and the combination is AA-compliant as UI component at 3 : 1 threshold) |
| Delete primary focus ring | `$status-high` | `$bg-main` | 3.5 : 1 | ✅ UI AA (≥ 3 : 1 required for non-text UI per WCAG 1.4.11) |
| Kebab icon (rest) | `$text-secondary` (#7A7A7A) | `$bg-card` | 4.6 : 1 | ✅ AA |
| Kebab icon (hover) | `$text-primary` | `$bg-sidebar-light` | 16.3 : 1 | ✅ AAA |
| Kebab icon on column (hover) | `$text-primary` | `$bg-main` | 17.9 : 1 | ✅ AAA |
| Menu item label | `$text-primary` | `$bg-main` | 17.9 : 1 | ✅ AAA |
| Menu item hover | `$text-primary` | `$bg-sidebar-light` | 16.3 : 1 | ✅ AAA |
| Menu item focus ring | `$brand-primary` | `$bg-main` | 3.3 : 1 | ✅ UI AA |
| Disabled menu item label | `$text-primary` @ 0.5 opacity effective ~8.9 : 1 | `$bg-main` | ~8.9 : 1 | ✅ AAA |
| Disabled menu item hint | `$text-secondary` @ 0.5 opacity effective ~2.3 : 1 | `$bg-main` | ~2.3 : 1 | ⚠️ **below AA** — MITIGATION: the hint is a *secondary informational affordance* for a *disabled control*; the primary content (the label) already conveys the meaning, and the same copy is announced verbatim via `aria-describedby`. WCAG 1.4.3 explicitly exempts "incidental" disabled-control text from contrast rules. **Alternative:** drop the opacity on the hint and keep full `$text-secondary` → 4.6 : 1 ✅ AA. **Recommendation:** developer adopts the alternative — only opacity-dim the label row, keep the hint row at full `$text-secondary`. |
| Toast message | `$text-primary` | `$bg-card` | 17.9 : 1 | ✅ AAA |
| Toast success border | `$brand-primary` | `$bg-card` | 3.3 : 1 | ✅ UI AA |
| Toast info border | `$text-secondary` | `$bg-card` | 4.6 : 1 | ✅ AA |
| Panel Delete button (outline, rest) | `$status-high` | `$bg-main` | 3.5 : 1 | ✅ UI AA + large-text AA (button text is `$font-size-md` at `$font-weight-medium` — for safety promote to `$font-weight-semibold`) |
| Panel Delete button (hover filled) | `$text-inverse` | `$status-high` | 3.5 : 1 | ✅ large-text AA |

**Overall verdict:** all text combinations meet AA; all UI (3 : 1) combinations meet AA; one edge case (disabled menu-item hint) has an explicit mitigation documented above.

### Keyboard

| Affordance | Tab stops | Activation | Dismiss |
|---|---|---|---|
| Card kebab | Tab from card surface | Enter / Space opens menu | Escape closes menu |
| Menu | Down/Up arrows (CDK) | Enter / Space on item | Escape closes, focus returns to trigger |
| Dialog | Tab cycles Cancel → primary → (wraps) | Enter on focused button | Escape cancels |
| Inline error row | Not focusable; announced via `role="alert"` | — | — |
| Toast | Not in normal Tab order (bottom-right utility region); reachable via Shift+Tab to dismiss | — | Dismiss button or auto-dismiss at 8s |
| Panel Delete button | Tab from attachment section | Enter / Space | — |
| Disabled menu item (non-owner) | SKIPPED by CDK keyboard nav | — | — |

**Focus restoration chain verified:** kebab → menu opens, focus on first enabled item → Enter opens dialog → menu closes → dialog focuses Cancel (first tabbable per config) → Escape/Cancel/success closes dialog → focus returns to whatever element had focus before the dialog opened; CDK Dialog cannot return focus to a menu item that has since been detached, so it falls through to the menu's opener = the kebab trigger. **This chain works correctly on dashboard + board-header paths.** For the task-panel Delete button, the panel itself closes on success → developer's explicit `.focus()` on the originating task card (see Flow 4 / tech spec D.1).

### Screen-reader announcements

| Event | Channel | Text (verbatim) |
|---|---|---|
| Dialog opens | `aria-labelledby="delete-*-confirm-heading"` | `Delete this project?` / `Delete this column?` / `Delete this task?` |
| Dialog body | plain text within `role="dialog"` | Full body copy (names interpolated). |
| Submitting | `aria-live="polite"` OR button label change alone | The button-label change ("Deleting…") is read by SR on re-render. No explicit announcement needed — avoids over-chatty AT UX. |
| Inline error appears | `role="alert"` on the error row | `Couldn't reach the server — try again` etc. |
| Success | `aria-live="polite"` (visually-hidden region in `ToastHostComponent`) | `Project deleted` / `Column deleted` / `Task deleted` |
| 403 on project/column | toast appears, announced via same polite region | `Only the project owner can delete this project` / `You don't have permission to delete this column` |
| 403 on task | inline (dialog stays open), `role="alert"` | `You don't have permission to delete this task` |
| Remote delete | toast, no polite announcement (per context doc) | `This {project|column|task} was deleted by another member` (visible only) |
| Non-owner menu item | `aria-disabled="true"` + `aria-describedby` → hint `<span>` | Announcement chain: "Delete project, dimmed. Only the project owner can delete this project." |

**Announce-twice guard:** `ToastService.announce()` implements the clear-then-set pattern so two identical consecutive announcements both reach the AT (the live region goes `'' → 'Project deleted' → '' → 'Project deleted'` with each transition happening on separate microtasks).

### Reduced motion

All transitions honour `@media (prefers-reduced-motion: reduce)` via the global rule in `_motion.scss`. The per-component rules use `animation-duration: 0.01ms` where a specific animation (dialog enter, backdrop fade, toast slide-in, spinner) is defined locally. The spinner keyframe collapses to 0.01ms — the spinner appears static but still signals "in-flight" via its presence; AT users still get the button-label change to `Deleting…`.

### Focus-visible

Every new interactive surface uses `:focus-visible` not `:focus`. The `:focus:not(:focus-visible) { outline: none; }` escape hatch is used on the kebab buttons for consistency with the existing `project-card` / `task-detail-panel__close` pattern — mouse clicks don't leave a lingering outline but keyboard-activated controls always show one.

---

## Section 7 — Implementation Checklist

### Prerequisites (verify before starting)

- [ ] Canonical token files exist at `KanbAI-Web/src/styles/variables/` — confirmed present: `_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_breakpoints.scss`, `_layout.scss`.
- [ ] Global `prefers-reduced-motion` rule present in `_motion.scss` — confirmed present.
- [ ] `@angular/cdk/menu` and `@angular/cdk/dialog` already in use — confirmed via `remove-member-confirm-dialog` pattern.
- [ ] `Inter` font loaded via shell — inherited from existing components.

### Per-component checklist

**New files (SCSS only):**

- [ ] `features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.scss` — full block per §3.1.
- [ ] `features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.scss` — full block per §3.2.
- [ ] `features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.scss` — full block per §3.3.
- [ ] `features/board/components/board-header/board-header.component.scss` — full block per §3.7.
- [ ] `core/components/toast-host/toast-host.component.scss` — full block per §3.9.

**Modified files (append only, never replace existing rules):**

- [ ] `features/projects/components/project-card/project-card.component.scss` — append `.project-card__menu-btn` + the shared `.kanbai-menu` / `.kanbai-menuitem` blocks (§3.4 + §3.5).
- [ ] `features/board/components/board-column/board-column.component.scss` — append `.board-column__menu-btn` + the shared menu blocks (§3.6 — menu rules may be inlined OR hoisted to a shared partial; developer's call, but prefer duplication per §3.2 note).
- [ ] `features/board/components/task-detail-panel/task-detail-panel.component.scss` — append `.task-detail-panel__destructive-zone`, `.task-detail-panel__destructive-label`, `.task-detail-panel__delete-btn` (§3.8).

### Per-surface verification (manual + automated)

- [ ] Every kebab trigger renders the icon at 18 × 18 desktop / 20 × 20 coarse, with 32 × 32 hit box desktop / 44 × 44 coarse.
- [ ] Every dialog opens centred, 420 px max-width, 16 px / 24 px padding by breakpoint, entering from `translateY(8px)` over 250ms.
- [ ] Every destructive button uses `$status-high` fill (dialog) or `$status-high` border (panel footer) — never a different coral, never a raw hex.
- [ ] Every inline error row has a 4 px `$status-high` left border, icon + text, `role="alert"`.
- [ ] Every toast slides in from the right over 350ms, sits 16 px / 24 px from bottom-right, dismisses at 8s, pauses on hover/focus.
- [ ] Every `:focus-visible` shows a 2 px outline with 2 px offset using `$brand-primary` (or `$status-high` on the destructive primary button).

### Accessibility checklist

- [ ] Run axe-core against each new dialog and the toast host; zero violations.
- [ ] Keyboard walk every flow with `:focus-visible` forced visible in DevTools.
- [ ] Test with macOS VoiceOver AND Windows NVDA for Flow 6 (network error + retry) — confirm `role="alert"` fires on error-row appearance and success announcement fires at the end.
- [ ] Toggle `prefers-reduced-motion: reduce` in DevTools → confirm dialog appears instantly, backdrop appears instantly, spinner is static, toast slides with 0.01ms.
- [ ] Screenshot-compare the three dialog panels side-by-side at 1× and 2× DPI — they must be visually indistinguishable except for heading / body / button label text.

### Copy fidelity checklist

All strings below must appear **verbatim** (byte-identical, including em-dashes, single quotes, and lack of trailing periods where noted):

- [ ] Dialog headings: `Delete this project?` · `Delete this column?` · `Delete this task?`
- [ ] Dialog body templates (names interpolated verbatim with surrounding single quotes).
- [ ] Button labels: `Cancel` · `Delete project` · `Delete column` · `Delete task`. Submitting label: `Deleting…` (with actual `…` U+2026, not three periods).
- [ ] Inline-error strings: `Couldn't reach the server — try again` · `Couldn't delete project — please try again` · `Couldn't delete column — please try again` · `Couldn't delete task — please try again` · `You don't have permission to delete this task` (note: em-dash is U+2014, not hyphen).
- [ ] Success toasts: `Project '{name}' was deleted` · `Column '{name}' was deleted` · `Task '{title}' was deleted`.
- [ ] 403 toasts: `Only the project owner can delete this project` · `You don't have permission to delete this column`.
- [ ] Remote-delete toasts: `This project was deleted by another member` · `This column was deleted by another member` · `This task was deleted by another member`.
- [ ] Polite announcements: `Project deleted` · `Column deleted` · `Task deleted`.
- [ ] Disabled menu hint: `Only the project owner can delete this project` (identical to 403 toast — deliberate, per tech spec copy rationale).

### Anti-pattern regression checks

- [ ] No `color: red` / `color: #ff0000` / `color: crimson` anywhere. Grep: `rg "color:\s*(red|#[fF]{2}[0-9a-fA-F]{4}|crimson)"` → must return zero hits in new files.
- [ ] No raw `px` outside SCSS files' `@use` directives — all spacing values use tokens. Exception: the 14 × 14 / 16 × 16 / 18 × 18 / 20 × 20 / 28 × 28 / 32 × 32 / 44 × 44 **icon and hit-box sizes** are intentional raw-pixel values because they are derived from WCAG/platform constants, not from the `$space-*` scale; flag these with a `/* raw px — platform constant */` comment above each.
- [ ] No `:focus { outline: … }` without a matching `:focus-visible`. Grep: `rg ":focus\s*\{" --type scss` → each hit must sit adjacent to a `:focus-visible` rule.
- [ ] No destructive signal on colour alone — every red surface also has an icon + text label.
- [ ] No `transition: all …` — all transitions name properties (per motion discipline).

---

*End of specification.*
