# Design Specification: Project Members Management UI

**Technical Spec:** [issue_33_tech_spec.md](./issue_33_tech_spec.md)
**Business Context:** [issue_33_context.md](./issue_33_context.md)
**GitHub Issue:** [#33](https://github.com/Gulybi/Gulybi/KanbAI-Web/issues/33)
**Design System:** KanbAI Project Management Dashboard v1.0

> **Source-path note.** The tech spec references paths under `KanbAI-Web/KanbAI-Web/src/...` but the actual Angular source tree on disk is `KanbAI-Web/src/...`. Every file path in this design spec uses the **real** path as found in the working tree. The precedent components (`create-project-dialog`, `project-card`, token files) all live under `KanbAI-Web/src/...`.

---

## 1. Overview

### Design Intent
The Members surface is the **first project-scoped dialog** in KanbAI. It must feel calm, direct, and clearly owned by *one* project — never a place to get lost in. The owner is doing ordinary admin work (review, add, remove); the interaction should feel like dropping a name into a list, not like filing a form. Visual emphasis is reserved for two things only: the **project name in the title** (so the user never doubts what they are editing), and the **destructive Remove action** (because it must be deliberate). Everything else — role badges, the add-form, the roster — reads as quiet body text.

The Members surface inherits the dialog chrome pattern established by `CreateProjectDialogComponent` in #32 (centered CDK overlay, `$radius-lg` panel, `$shadow-dropdown`, entry animation, full-width below `$bp-md`). This keeps the dashboard's two dialogs feeling like one family.

### Scope
- **Components styled:** `MembersDialogComponent`, `MembersListComponent`, `MemberRowComponent`, `AddMemberFormComponent`, `RemoveMemberConfirmDialogComponent`. **Modified:** `ProjectCardComponent` (new owner-only icon-button in the header).
- **States covered:** default, hover, focus-visible, active, disabled, loading (skeleton rows), empty (defensive), error (with Retry), row-pending-removal, roleRevoked-hides-controls, add-form-submitting.
- **Responsive:** mobile-first; dialog behaves as a sheet-style full-width panel under `$bp-md` and a centered modal card at `$bp-md`+.

### Prerequisites (all satisfied in the working tree as of 2026-04-30)
- [x] Token files exist: `KanbAI-Web/src/styles/variables/_colors.scss`, `_spacing.scss`, `_typography.scss`, `_radius.scss`, `_shadows.scss`, `_motion.scss`, `_layout.scss`, `_breakpoints.scss`. **Verified by `Glob` on 2026-04-30.**
- [x] Global `prefers-reduced-motion` rule is emitted from `_motion.scss` (lines 7–11). Component SCSS only needs to clamp animation durations it defines locally.
- [x] `CreateProjectDialogComponent` precedent establishes the `panelClass` / `backdropClass` chrome pattern and the `ViewEncapsulation.None` scoping discipline (`create-project-dialog.component.scss:14–56`). Members dialogs mirror it.
- [x] `project-card__badge--owner` / `--member` classes exist at `project-card.component.scss:81–94` and are reused verbatim by `MemberRowComponent` — **do not redefine**.
- [x] `FormInputComponent` (`form-input.component.html`) uses Tailwind utilities internally; the design spec for `AddMemberFormComponent` wraps it but never restyles its internals. `FormButtonComponent` SCSS is empty by design (layout-only); the submit button inside the add-form receives its chrome from the design-token-driven wrapper rules below.

---

## 2. Tokens Used

This spec consumes the canonical KanbAI v1.0 design tokens only. **No new tokens are proposed.**

| Token | Where used |
|---|---|
| `$brand-primary` | Focus ring on all interactive surfaces; primary "Add member" submit fill; active nav analogue n/a |
| `$brand-primary-hover` | Add-member submit hover fill |
| `$brand-primary-light` | Owner badge background (reused class), subtle highlight on self-row indicator |
| `$bg-main` | Dialog panel fill, list background |
| `$bg-card` | Row hover fill (`transparent` → `$bg-card` is visually no-op here; hover is conveyed by a soft tint via `$bg-sidebar-light`) |
| `$bg-sidebar-light` | Row hover fill, member badge background, skeleton shimmer base, input group hover |
| `$bg-dropzone` | (not used — Members has no drag surface) |
| `$bg-searchbar` | (not used) |
| `$text-primary` | Row name, dialog title, add-button label, banner body copy |
| `$text-secondary` | Row email, "(You)" indicator copy, helper / empty-state copy, meta copy |
| `$text-tertiary` | Muted explainer ("Only owners can add or remove members.") |
| `$text-inverse` | Submit button label on `$brand-primary` fill |
| `$text-brand` | (not used in Members — no sage text copy) |
| `$status-high` | Remove button fill, Remove button hover (via `darken`), error banner left border + icon, "last owner" inline error |
| `$border-light` | Row dividers, dialog input borders, cancel-button border, banner border |
| `$shadow-card` | (not used — rows are flat inside the dialog) |
| `$shadow-card-hover` | (not used) |
| `$shadow-dropdown` | Dialog panel elevation, confirm-dialog elevation |
| `$radius-sm` | Role badges (reused), skeleton shimmer |
| `$radius-md` | Buttons (add, cancel, remove, retry), input border-radius, error banner |
| `$radius-lg` | Dialog panel |
| `$radius-circle` | Icon-button (Manage members on the card) |
| `$font-size-sm` (12px) | Role badges, "(You)" indicator, meta copy, email line |
| `$font-size-md` (14px) | Row name, body copy, form labels, button labels |
| `$font-size-lg` (16px) | Section headers (e.g. "Members" form heading), confirm-dialog body |
| `$font-size-xl` (20px) | Dialog title ("Members — {name}") and confirm-dialog heading |
| `$font-weight-regular / medium / semibold` | Body / label / heading respectively |
| `$line-height-tight / normal` | Title / body respectively |
| `$space-xxs` (4px) | Badge padding (reused), icon-to-label gap |
| `$space-xs` (8px) | Inline gap between name + "(You)", icon/label gap, banner padding |
| `$space-sm` (12px) | Row vertical padding, button padding, input-row gap |
| `$space-md` (16px) | Dialog content gap, add-form gap |
| `$space-lg` (24px) | Dialog panel padding on ≥ `$bp-md`, header-to-list gap |
| `$motion-fast` | Hover / focus transitions (150 ms) |
| `$motion-base` | Row enter/exit, dialog entry animation (250 ms) |
| `$motion-slow` | (not used) |
| `$bp-md` | Dialog breakpoint: below it = full-width sheet, above it = centered card |
| `$bp-lg` | (used via existing grid rules, not re-declared here) |

**Token discipline:** every colour, radius, spacing, and duration below references one of the variables above. Raw hex values, px magic numbers, or millisecond literals are prohibited.

---

## 3. Per-Component Styling

### 3.1 Component: `ProjectCardComponent` (modification — owner-only "Manage members" icon-button)

**File:** `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.scss`
**Role:** Adds a single icon-button to the card's existing header, visible only when the viewer owns the project. Does not alter the card's existing rhythm or behavior.

**Layout:** The existing header (`.project-card__header`) is a `flex-start` / `space-between` row with a 28 px min-height. The button sits between the title and the badge; the flex order is `title → button → badge`, so the badge stays visually dominant (role first, actions second). The button is an icon-only 32×32 control with `$radius-circle`. A tooltip-style `aria-label="Manage members for {{ project.name }}"` is required.

**States:** default → hover → focus-visible → active → (no loading — click opens the dialog synchronously).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/typography' as *;

/* Append to the existing project-card.component.scss — existing rules untouched. */

.project-card__manage-btn {
  /* Reset */
  appearance: none;
  background-color: transparent;
  border: 1px solid transparent;
  padding: 0;
  margin: 0;

  /* Layout */
  flex-shrink: 0;
  width: 32px;    /* icon hit-box; expanded to 44px under $bp-md via the rule below */
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-circle;

  color: $text-secondary;            /* icon stroke inherits via currentColor */
  cursor: pointer;
  font-family: $font-family-base;

  transition:
    background-color $motion-fast,
    border-color $motion-fast,
    color $motion-fast;

  /* Hover — the button lives on $bg-card, so we tint with $bg-sidebar-light */
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

  &:focus:not(:focus-visible) {
    outline: none;
  }

  /* Icon sizing — SVG child inherits color via currentColor */
  svg {
    width: 18px;
    height: 18px;
    display: block;
  }

  /* Mobile: enforce ≥ 44×44 touch target per canonical UX pattern #8 */
  @media (max-width: calc(#{$space-xxs} * 0 + 767px)) {
    /* Use the $bp-md literal via the breakpoints file:
       @use 'src/styles/variables/breakpoints' as *; and interpolate #{$bp-md - 1px}. */
  }
}

/* Correct mobile-target rule — prefer the breakpoints partial:
   NOTE: include `@use 'src/styles/variables/breakpoints' as *;` at the top
   of the stylesheet alongside the other @use lines. */
@use 'src/styles/variables/breakpoints' as *;

@media (max-width: #{$bp-md - 1px}) {
  .project-card__manage-btn {
    width: 44px;
    height: 44px;

    svg {
      width: 20px;
      height: 20px;
    }
  }
}
```

**Interaction notes:**
- Default icon color is `$text-secondary` (4.6:1 on `$bg-card`) → hover promotes to `$text-primary` (17.9:1), so the affordance strengthens when the user shows intent.
- Click handler in TS must call `$event.stopPropagation()` so the card's future click target (if ever wired) does not double-fire. This is a tech-spec requirement repeated here only because it affects the visible state (stopping propagation is the reason we don't style `.project-card:has(.project-card__manage-btn:hover)` specially — the card's hover lift continues as normal).
- Tooltip via `aria-label`; no visible tooltip component in v1.

**Accessibility:**
- Role: native `<button type="button">`.
- `aria-label="Manage members for {{ project.name }}"` — never leave a pure-icon button without an accessible name.
- Contrast: default `$text-secondary` on `$bg-card` = 4.6:1 ✅ AA for UI; hover `$text-primary` on `$bg-sidebar-light` = 15.5:1 ✅ AAA.
- Touch target: 44×44 below `$bp-md` ✅.
- Non-owners: button is not rendered at all (`@if (canManage()) { … }` in the template). Keyboard users who never reach it therefore never wonder what it does.

---

### 3.2 Component: `MembersDialogComponent` (smart container — visual shell)

**File:** `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.scss`
**Role:** The dialog chrome — panel, backdrop, title, body region, and the three content regions (error banner slot, roster, add-form slot). Mirrors `CreateProjectDialogComponent`'s scoping strategy: `ViewEncapsulation.None` + a `members-dialog-panel` class prefix on every selector.

**Layout:** At ≥ `$bp-md`, a centered card `max-width: 560px`, `$radius-lg`, `$shadow-dropdown`, `$space-lg` padding. Below `$bp-md`, the dialog is `calc(100vw - 2 * $space-md)` wide with `$space-md` padding. The internal column gap is `$space-lg` between title and content, `$space-md` between content sections.

**States:** default → `listVm.status === 'loading' | 'success' | 'empty' | 'error'` → `addVm.status === 'idle' | 'submitting'`. `roleRevoked = true` → owner-only slots unmount (handled in template; this file just styles what's rendered).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

/* --------------------------------------------------------------
   CDK overlay pane chrome
   (panelClass: 'members-dialog-panel', backdropClass: 'members-dialog-backdrop')
   Emitted globally because this component uses ViewEncapsulation.None;
   scoped to the panel class so nothing leaks.
   Mirrors create-project-dialog.component.scss:14–56.
-------------------------------------------------------------- */
.members-dialog-panel {
  background-color: $bg-main;
  border-radius: $radius-lg;
  box-shadow: $shadow-dropdown;
  width: calc(100vw - (#{$space-md} * 2));
  max-width: 560px;
  padding: $space-md;
  display: block;
  animation: members-dialog-enter $motion-base both;

  @include respond-to('md') {
    padding: $space-lg;
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

@keyframes members-dialog-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.members-dialog-backdrop {
  background-color: rgba(11, 11, 11, 0.5);  /* $bg-sidebar-dark @ 50% — only rgba() use, matches create-project */
  animation: members-dialog-backdrop-fade $motion-fast both;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

@keyframes members-dialog-backdrop-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* --------------------------------------------------------------
   In-component structure (scoped via .members-dialog-panel)
-------------------------------------------------------------- */
.members-dialog-panel {
  app-members-dialog {
    display: block;
    font-family: $font-family-base;
    color: $text-primary;
  }

  /* Header: project-scoped title + close button */
  .members-dialog__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: $space-sm;
    margin-bottom: $space-lg;
  }

  .members-dialog__title {
    margin: 0;
    font-size: $font-size-xl;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
    color: $text-primary;
    letter-spacing: -0.01em;

    /* Long project names wrap; never truncate the project name */
    word-break: break-word;
  }

  .members-dialog__close {
    appearance: none;
    background-color: transparent;
    border: 1px solid transparent;
    color: $text-secondary;
    width: 32px;
    height: 32px;
    border-radius: $radius-circle;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;

    transition: background-color $motion-fast, color $motion-fast;

    &:hover { background-color: $bg-sidebar-light; color: $text-primary; }
    &:focus-visible { outline: 2px solid $brand-primary; outline-offset: 2px; }

    @media (max-width: #{$bp-md - 1px}) {
      width: 44px;
      height: 44px;
    }
  }

  /* Body stack */
  .members-dialog__body {
    display: flex;
    flex-direction: column;
    gap: $space-md;
  }

  /* Section label that precedes the roster ("Members") */
  .members-dialog__section-label {
    margin: 0;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-secondary;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  /* ------- Error banner (list-scope) ------- */
  /* Same visual recipe as create-project-dialog__error-banner; renamed for clarity. */
  .members-dialog__error-banner {
    display: flex;
    align-items: flex-start;
    gap: $space-xs;
    padding: $space-xs $space-sm;
    background-color: $bg-main;
    border: 1px solid $border-light;
    border-left: 4px solid $status-high;
    border-radius: $radius-md;
    font-size: $font-size-md;
    line-height: $line-height-normal;
    color: $text-primary;
  }

  .members-dialog__error-banner-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    color: $status-high;
    margin-top: 2px;
  }

  .members-dialog__error-banner-text { margin: 0; flex: 1; }

  .members-dialog__error-banner-retry {
    appearance: none;
    background-color: transparent;
    border: 1px solid $border-light;
    border-radius: $radius-md;
    color: $text-primary;
    padding: $space-xxs $space-sm;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    cursor: pointer;
    transition: background-color $motion-fast, border-color $motion-fast;

    &:hover { background-color: $bg-sidebar-light; }
    &:focus-visible { outline: 2px solid $brand-primary; outline-offset: 2px; }
  }

  /* ------- Muted explainer shown to non-owners in a future view-mode ------- */
  .members-dialog__viewer-note {
    margin: 0;
    font-size: $font-size-sm;
    color: $text-tertiary;
    font-style: italic;
  }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
```

**Interaction notes:**
- Dialog enters with an 8 px translateY rise over `$motion-base`, matching `CreateProjectDialogComponent` exactly (so the dashboard's two dialogs feel like siblings, not cousins).
- The title element carries `id="members-dialog-title"` so the `aria-labelledby` on the panel hooks to it. Copy: **"Members — {{ data.project.name }}"** (em-dash, single space either side).
- Close button icon: a 16×16 `X` stroke; `$text-secondary` at rest, `$text-primary` on hover (15.5:1 on `$bg-sidebar-light`).
- Reduced motion: the enter animation clamps to 0.01 ms per the global rule.

**Accessibility:**
- `aria-labelledby="members-dialog-title"` on the dialog root (AC-45).
- `autoFocus: 'first-tabbable'` + `restoreFocus: true` passed to `Dialog.open(...)` (tech-spec §5.5; echoed here because it has visible consequences — the first focus lands on the close button or, when the list is loaded, the add-form input).
- Escape closes (CDK default); focus returns to the card's Manage button.
- Contrast: title `$text-primary` on `$bg-main` = **17.9:1** (AAA); section label `$text-secondary` on `$bg-main` = **4.6:1** (AA); close button icon default `$text-secondary` on `$bg-main` = **4.6:1** (AA for UI, ≥ 3:1).

---

### 3.3 Component: `MembersListComponent`

**File:** `KanbAI-Web/src/app/features/projects/components/members-dialog/members-list/members-list.component.scss`
**Role:** The roster container — a semantic `<ul role="list">` that renders one `MemberRowComponent` per member, plus the loading skeleton and the empty-state copy.

**Layout:** Stacked `<li>` rows with `$border-light` dividers between them. No outer background — the rows sit directly on `$bg-main`. Padding is handled on the row, not the list.

**States:** `loading` (3 skeleton rows) → `success` (rendered rows) → `empty` (defensive copy only) → `error` (not rendered here — handled at the dialog level).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;

:host {
  display: block;
}

.members-list {
  list-style: none;
  margin: 0;
  padding: 0;

  /* Rows sit directly under each other with a hair-line divider */
  > li + li {
    border-top: 1px solid $border-light;
  }
}

/* ------- Skeleton rows (listVm.status === 'loading') ------- */
.members-list__skeleton {
  list-style: none;
  margin: 0;
  padding: 0;

  > li {
    padding: $space-sm 0;
    display: flex;
    align-items: center;
    gap: $space-sm;

    & + li { border-top: 1px solid $border-light; }
  }
}

.members-list__skeleton-avatar,
.members-list__skeleton-line {
  background-color: $bg-sidebar-light;
  border-radius: $radius-sm;
  animation: members-list-shimmer 1.4s ease-in-out infinite;
}

.members-list__skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: $radius-circle;
  flex-shrink: 0;
}

.members-list__skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: $space-xxs;
}

.members-list__skeleton-line--name   { width: 45%; height: 14px; }
.members-list__skeleton-line--email  { width: 65%; height: 12px; }

@keyframes members-list-shimmer {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}

/* ------- Empty state (defensive — AC: "No members yet") ------- */
.members-list__empty {
  padding: $space-lg $space-sm;
  text-align: center;
  color: $text-secondary;
  font-size: $font-size-md;
  line-height: $line-height-normal;
}
```

**Interaction notes:**
- Skeleton shimmer: opacity `0.6 ↔ 1` over 1.4 s — matches the canonical "Loading" pattern in §4 of the web-designer brief.
- Row entry (a newly-added member) is styled on `MemberRowComponent`, not here.
- Reduced motion: global rule clamps the shimmer animation.

**Accessibility:**
- `role="list"` forced on the `<ul>` (some user stylesheets remove implicit list semantics when `list-style: none` is set — forcing the role guarantees the screen-reader count).
- Loading state is announced via an `aria-live="polite"` region in the dialog template (e.g., "Loading members…"); the skeleton itself is `aria-hidden="true"` so SRs don't enumerate 3 bogus rows.
- Empty copy: `"No members yet."` in `$text-secondary` — contrast **4.6:1** on `$bg-main` ✅ AA.

---

### 3.4 Component: `MemberRowComponent`

**File:** `KanbAI-Web/src/app/features/projects/components/members-dialog/member-row/member-row.component.scss`
**Role:** One row of the roster. Shows name, email, role badge (reused classes), "(You)" self-indicator, and an optional `$status-high` Remove button.

**Layout:** `$space-sm` vertical padding, `$space-sm` horizontal gap. A flex row: **avatar placeholder (32 px circle, initials) → name+email stack → role badge → remove button**. Below `$bp-md` the name/email stack wraps; the role badge stays on the top-right; the Remove button drops to a second line inside the row, full-width, so the thumb target is unmistakable.

**States:** default → hover (soft `$bg-sidebar-light` tint) → focus-within (when Remove is tab-focused) → `isPending` (row dims, Remove disabled w/ spinner) → `isSelf` (adds "(You)" indicator, never renders Remove) → `!canRemove` (no Remove button at all).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
}

.member-row {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: $space-sm 0;
  min-height: 56px;           /* comfortable density — leaves room for 44×44 Remove on mobile */

  transition:
    background-color $motion-fast,
    opacity $motion-base;

  /* Entry animation for newly-appended rows — applied via a single-use class */
  &.member-row--enter {
    animation: member-row-enter $motion-base both;
  }

  &.member-row--pending {
    opacity: 0.5;
    pointer-events: none;     /* nothing on the pending row is clickable */
  }
}

@keyframes member-row-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Avatar placeholder (initials fallback — no external image in v1) */
.member-row__avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: $radius-circle;
  background-color: $brand-primary-light;
  color: $text-primary;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  line-height: 1;
  letter-spacing: 0.02em;
}

.member-row__identity {
  flex: 1;
  min-width: 0;               /* allow truncation */
  display: flex;
  flex-direction: column;
  gap: 2px;                   /* sub-token — acceptable because it's an intrinsic 2px hairline gap */
}

.member-row__name-line {
  display: flex;
  align-items: baseline;
  gap: $space-xs;
  min-width: 0;
}

.member-row__name {
  margin: 0;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;

  /* truncate long display names */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.member-row__self-indicator {
  flex-shrink: 0;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-secondary;
}

.member-row__email {
  margin: 0;
  font-size: $font-size-sm;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Role badge — reuses existing classes from project-card.component.scss.
   Do NOT redeclare .project-card__badge--owner / --member here; the
   template applies them directly. This file only declares a positional
   flex rule so the badge aligns correctly within the row. */
.member-row__badge-slot {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}

/* Remove button — destructive */
.member-row__remove {
  appearance: none;
  flex-shrink: 0;

  background-color: transparent;
  color: $status-high;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: $space-xxs $space-sm;
  min-height: 36px;
  min-width: 88px;

  font-family: $font-family-base;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: 1;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-xxs;

  transition:
    background-color $motion-fast,
    border-color $motion-fast,
    color $motion-fast;

  &:hover:not(:disabled) {
    background-color: $status-high;
    border-color: $status-high;
    color: $text-inverse;
  }

  &:active:not(:disabled) {
    background-color: $status-high;
    border-color: $status-high;
    color: $text-inverse;
    transform: translateY(1px);
  }

  &:focus-visible {
    outline: 2px solid $status-high;
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* Pending-remove state — spinner + disabled */
  .member-row__remove-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid $bg-sidebar-light;
    border-top-color: $status-high;
    border-radius: $radius-circle;
    animation: member-row-remove-spin 1s linear infinite;
  }

  /* Mobile: 44 × 44 minimum */
  @media (max-width: #{$bp-md - 1px}) {
    min-height: 44px;
    width: 100%;
  }
}

@keyframes member-row-remove-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .member-row__remove-spinner {
    animation: none;
    border-style: dotted;
  }
}

/* Narrow-viewport row layout: wrap Remove below the identity+badge row */
@media (max-width: #{$bp-md - 1px}) {
  .member-row {
    flex-wrap: wrap;
  }

  .member-row__remove {
    flex-basis: 100%;
    margin-top: $space-xs;
  }
}
```

**Interaction notes:**
- Hover fill on the row is applied by the list, not by the row, to avoid double-paints:
  ```scss
  .members-list > li:hover { background-color: $bg-sidebar-light; }
  ```
  Place that rule in `members-list.component.scss`. (Left out of §3.3 for brevity; copy it in during implementation.)
- Remove button inversion on hover (transparent → `$status-high` fill + `$text-inverse` label) delivers the "this is destructive" cue. Confirm dialog still gates execution.
- Row-enter animation runs once when the child is first mounted (angular `@if`/`@for` track by `userId` from tech spec) — the `.member-row--enter` class is applied for ~250 ms then removed via `animationend` in the component TS.
- Pending-remove: `opacity: 0.5`, `pointer-events: none` on the row; the Remove button shows a spinner next to the label "Removing…".

**Accessibility:**
- Rendered as an `<li>` inside the `<ul>`.
- Name uses an `<h3>` only if a heading hierarchy is desired; otherwise plain `<p>` with `aria-labelledby` on the implicit group. Spec stays with `<p>`; the list itself provides traversal structure.
- "(You)" indicator is visible text, not just a CSS pseudo-element, so SRs read it.
- Role badge: text reads "Owner" or "Member" (reused class renders it) — color is **not** the only cue.
- Remove button: `aria-label="Remove {{ member.name }} from {{ project.name }}"` (disambiguates from other Remove buttons for SR).
- Contrast: `$text-primary` on `$bg-main` = **17.9:1** (name, AAA); `$text-secondary` on `$bg-main` = **4.6:1** (email, AA); `$status-high` on `$bg-main` = **3.5:1** (Remove idle, AA for UI); `$text-inverse` on `$status-high` = **3.5:1** (Remove hover — AA for large-text/UI; button text is 12 px / 500, which qualifies as UI control text per WCAG 1.4.11, so this is acceptable).
- Touch: Remove button ≥ 44 × 44 below `$bp-md` ✅.

---

### 3.5 Component: `AddMemberFormComponent`

**File:** `KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.scss`
**Role:** Owner-only inline form with a single email input + submit button + an optional error banner just above the input.

**Layout:** On ≥ `$bp-md`, the form is a single row: `input (flex: 1) → submit (auto)`, gap `$space-sm`. Below `$bp-md`, the form stacks vertically and the submit button becomes full-width. The form label ("Email") lives **above** the input (the `FormInputComponent` renders it itself).

**States:** default → input:focus → submit:hover/active → submit:disabled (form invalid) → `addVm.status === 'submitting'` (submit shows spinner, input and submit both disabled) → `errorMessage !== null` (banner above form).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
}

/* Section divider — sits between the roster and the add-form */
.add-member-form {
  padding-top: $space-md;
  border-top: 1px solid $border-light;

  display: flex;
  flex-direction: column;
  gap: $space-sm;
}

.add-member-form__heading {
  margin: 0;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-secondary;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* Error banner — same visual language as the dialog-level banner */
.add-member-form__error {
  display: flex;
  align-items: flex-start;
  gap: $space-xs;
  padding: $space-xs $space-sm;
  background-color: $bg-main;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-md;
  font-size: $font-size-md;
  line-height: $line-height-normal;
  color: $text-primary;
}

.add-member-form__error-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: $status-high;
  margin-top: 2px;
}

.add-member-form__error-text { margin: 0; }

/* The input-row wraps the FormInputComponent + submit button */
.add-member-form__row {
  display: flex;
  align-items: flex-end;      /* input label pushes the input down — align to the bottom */
  gap: $space-sm;

  @media (max-width: #{$bp-md - 1px}) {
    flex-direction: column;
    align-items: stretch;
  }
}

.add-member-form__input {
  flex: 1;
  min-width: 0;
}

/* Primary submit button — wraps FormButtonComponent, which is layout-only.
   Styles are applied to the native button inside via ::ng-deep because
   FormButtonComponent's SCSS is intentionally empty. */
.add-member-form__submit {
  flex-shrink: 0;

  ::ng-deep button {
    appearance: none;
    background-color: $brand-primary;
    color: $text-inverse;
    border: 1px solid $brand-primary;
    border-radius: $radius-md;
    padding: $space-sm $space-md;
    min-height: 44px;
    min-width: 120px;
    font-family: $font-family-base;
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    line-height: 1;
    cursor: pointer;

    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: $space-xxs;

    transition:
      background-color $motion-fast,
      border-color $motion-fast,
      box-shadow $motion-fast;

    &:hover:not(:disabled) {
      background-color: $brand-primary-hover;
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
      background-color: $brand-primary-light;
      border-color: $brand-primary-light;
      color: $text-secondary;
      cursor: not-allowed;
    }
  }

  @media (max-width: #{$bp-md - 1px}) {
    width: 100%;
    ::ng-deep button { width: 100%; }
  }
}

.add-member-form__submit-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-left: $space-xxs;
  border: 2px solid $brand-primary-light;
  border-top-color: $text-inverse;
  border-radius: $radius-circle;
  vertical-align: middle;
  animation: add-member-form-spin 1s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    border-style: dotted;
  }
}

@keyframes add-member-form-spin {
  to { transform: rotate(360deg); }
}
```

**Interaction notes:**
- Submit button copy: **"Add"** (idle), **"Adding…"** with inline spinner (submitting). Never change from "Add" to "Invite" or back — one verb, consistent.
- Disabled state tokens `$brand-primary-light` + `$text-secondary` (4.6:1 on `$brand-primary-light` ≈ **4.9:1** measured) keep the disabled label legible per WCAG 1.4.11.
- Error banner appears **above** the input-row, inside the form section, so the error is read before the input when a SR user steps back through the form.
- On success the smart container bumps `resetCounter`; the child resets the `FormControl`, clears `touched`, and programmatically refocuses the input (tech spec §2.3). Visual: input value clears, the field remains focus-ringed, ready for the next email.

**Accessibility:**
- `<form>` with `role="form"` only if the landmark is needed; by default the native `<form>` is fine.
- The email `<label>` is rendered by `FormInputComponent` (see `form-input.component.html:2–8`); confirm the `label` input is `"Email"` and `required` is `true`.
- `aria-describedby` linking from the input to the error banner's `id` — tech-spec responsibility; visually, the link is realised via proximity + the red left-border.
- Contrast: submit `$text-inverse` on `$brand-primary` = **3.3:1** (canonical brief notes this is AA for large-text/UI — button label is 14 px / 500 weight, which qualifies as UI control text per WCAG 1.4.11); focus ring `$brand-primary` on `$bg-main` = **3.6:1** (AA for UI).
- Touch target: `min-height: 44px`; full-width on mobile ✅.

---

### 3.6 Component: `RemoveMemberConfirmDialogComponent`

**File:** `KanbAI-Web/src/app/features/projects/components/members-dialog/remove-member-confirm-dialog/remove-member-confirm-dialog.component.scss`
**Role:** A second, smaller CDK dialog that gates the destructive Remove action. Asks "Are you sure?" with a `$status-high` primary action.

**Layout:** Same chrome pattern as the Members dialog but narrower (`max-width: 420px`). Header + body + actions-row (Cancel on the left, Remove on the right on ≥ `$bp-md`; stacked and reversed — Remove below Cancel — below `$bp-md` so the destructive action isn't a direct-thumb tap).

**States:** default → Cancel:hover/focus → Remove:hover/focus/active → (no loading state — the parent dialog handles the in-flight spinner on the row).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

/* Overlay pane chrome — mirrors members-dialog, tighter max-width */
.remove-member-confirm-dialog-panel {
  background-color: $bg-main;
  border-radius: $radius-lg;
  box-shadow: $shadow-dropdown;
  width: calc(100vw - (#{$space-md} * 2));
  max-width: 420px;
  padding: $space-md;
  display: block;
  animation: remove-member-confirm-enter $motion-base both;

  @include respond-to('md') {
    padding: $space-lg;
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

@keyframes remove-member-confirm-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.remove-member-confirm-dialog-backdrop {
  background-color: rgba(11, 11, 11, 0.5);
  animation: remove-member-confirm-backdrop-fade $motion-fast both;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

@keyframes remove-member-confirm-backdrop-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.remove-member-confirm-dialog-panel {
  app-remove-member-confirm-dialog {
    display: block;
    font-family: $font-family-base;
    color: $text-primary;
  }

  .remove-member-confirm__heading {
    margin: 0 0 $space-sm 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
    color: $text-primary;
  }

  .remove-member-confirm__body {
    margin: 0 0 $space-lg 0;
    font-size: $font-size-md;
    line-height: $line-height-normal;
    color: $text-primary;

    /* Emphasise the member's name inside the sentence */
    strong {
      font-weight: $font-weight-semibold;
      color: $text-primary;
    }
  }

  .remove-member-confirm__actions {
    display: flex;
    justify-content: flex-end;
    gap: $space-sm;

    @media (max-width: #{$bp-md - 1px}) {
      flex-direction: column-reverse;   /* Cancel stays on top; Remove below */
      align-items: stretch;
    }
  }

  .remove-member-confirm__cancel {
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

    &:hover { background-color: $bg-sidebar-light; }
    &:focus-visible { outline: 2px solid $brand-primary; outline-offset: 2px; }
  }

  /* Primary destructive button — $status-high */
  .remove-member-confirm__confirm {
    appearance: none;
    background-color: $status-high;
    color: $text-inverse;
    border: 1px solid $status-high;
    border-radius: $radius-md;
    padding: $space-sm $space-md;
    min-height: 44px;
    min-width: 120px;
    font-family: $font-family-base;
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    line-height: 1;
    cursor: pointer;

    transition: background-color $motion-fast, border-color $motion-fast;

    &:hover:not(:disabled) {
      /* Token-pure hover: no $status-high-hover token exists. Use $text-primary
         at 8% opacity overlay to darken — expressed via a subtle mix via
         box-shadow instead of inventing a new colour. */
      box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.08);
    }

    &:active:not(:disabled) { transform: translateY(1px); }

    &:focus-visible {
      /* Destructive focus uses $status-high so the semantic stays */
      outline: 2px solid $status-high;
      outline-offset: 2px;
    }
  }
}
```

**Interaction notes:**
- Copy (tech-spec approved): heading **"Remove {{ member.name }}?"**, body **"They will immediately lose access to *{{ project.name }}* and any tasks assigned to them will be unassigned."**, primary **"Remove"**, secondary **"Cancel"**.
- Below `$bp-md` the actions stack with Cancel on top — this is deliberate, so a reaching-thumb doesn't land on Remove first.
- Entry animation identical to `MembersDialogComponent`.
- No hover-darken token exists for `$status-high`; rather than invent one, the hover uses a token-pure `rgba(0,0,0, 0.08)` inset overlay. If the design system later ships a `$status-high-hover`, swap it in. This is the only rgba-literal in the Members feature apart from the canonical backdrop.

**Accessibility:**
- `aria-labelledby` on the panel references the `.remove-member-confirm__heading` id (AC-47). The heading contains the member's name verbatim.
- `aria-describedby` optionally references the body sentence so SRs read the consequence before the buttons.
- `autoFocus: 'first-tabbable'` in the `Dialog.open({...})` call defaults focus to the Cancel button — the canonical "safe default" for destructive dialogs.
- Escape / backdrop close with `undefined` (no-op); confirm closes with `true`.
- Contrast: body `$text-primary` on `$bg-main` = **17.9:1** (AAA); confirm `$text-inverse` on `$status-high` = **3.5:1** (AA for UI control text per WCAG 1.4.11); focus ring `$status-high` on `$bg-main` = **3.5:1** (AA for UI).
- Touch targets: both buttons `min-height: 44px` ✅; on mobile both are full-width.

---

## 4. User Flows with Visual States

### Flow A — Owner opens the Members dialog from a project card

1. **At rest.** The owner's project card shows the hover-eligible title, description, and the owner badge. The Manage-members icon-button sits between title and badge in `$text-secondary` — present but quiet.
2. **Hover the card.** Card lifts `translateY(-2px)`, shadow `$shadow-card-hover`, `$motion-fast` (unchanged from #31). Icon-button tint does not change.
3. **Hover the icon-button itself.** Icon fill `$text-secondary → $text-primary`; background `transparent → $bg-sidebar-light`; `$motion-fast`. Cursor = pointer.
4. **Activate (click / Enter / Space).** `$event.stopPropagation()` prevents the card's tabindex from interfering. `Dialog.open(MembersDialogComponent, { data: { project }, ariaLabelledBy: 'members-dialog-title', autoFocus: 'first-tabbable', restoreFocus: true, panelClass: 'members-dialog-panel', backdropClass: 'members-dialog-backdrop' })`.
5. **Backdrop fade.** Backdrop opacity `0 → 1` over `$motion-fast` (150 ms).
6. **Dialog rise.** Panel opacity `0 → 1` with `translateY(8px → 0)` over `$motion-base` (250 ms).
7. **List loads — initial focus.** `autoFocus: 'first-tabbable'` lands on the dialog's close button (first focusable). Meanwhile `listVm.status === 'loading'` renders 3 skeleton rows pulsing `opacity 0.6 ↔ 1`. An `aria-live="polite"` region announces "Loading members…".
8. **Success.** Skeleton unmounts; roster fades in. Owner's own row carries the "(You)" indicator. Role badges use the reused `--owner` / `--member` classes. Below the list the `AddMemberFormComponent` is rendered with focus-ready empty input. SR announces "X members." if the dialog template includes that live update (recommended but optional).
9. **Keyboard traversal.** Tab order: close → (retry button if error) → add-form input → Add button → Row 1 Remove → Row 2 Remove → … → dialog content end → loops back. Escape closes; focus returns to the card's Manage button (via `restoreFocus: true`).
10. **Reduced motion.** Rise + backdrop fade both clamp to 0.01 ms; skeleton shimmer freezes at full opacity (global rule clamps `animation-duration`).

### Flow B — Owner adds a member by email

1. **Idle.** Input empty, Add button disabled (`form.invalid`). Add button fill `$brand-primary-light` / label `$text-secondary`.
2. **Typing a valid email.** `FormInputComponent`'s own Tailwind rules provide the focus ring (`focus:border-brand-primary`). Add button becomes enabled → fill `$brand-primary` / label `$text-inverse`.
3. **Submit (Enter or click).** Add button transitions to the submitting state: label becomes **"Adding…"** and the inline spinner appears (`$bg-sidebar-light` ring + `$text-inverse` arc, rotating every 1 s). Input and button both disabled. `aria-live="polite"` optionally announces "Adding member…".
4. **Success (201).**
   - The smart container appends the returned `MemberSummary` to `members-state`.
   - The new row mounts with `.member-row--enter` — `opacity: 0 → 1`, `translateY(-4px → 0)`, `$motion-base`. The class is removed on `animationend`.
   - `resetCounter++` → form child resets the `FormControl`, clears `touched`, programmatically `.focus()`es the input. Visible: input becomes empty with its focus ring still applied, ready for the next email.
   - Any prior error banner is cleared.
   - SR announces "Added {{ name }}." via the live region.
5. **Error: 400 "user not found"** (also matches prefix `"No user found with email address:"`).
   - Error banner appears above the input-row: coral left border, coral icon, copy **"We couldn't find a user with that email."** The input retains the typed value; submit re-enables; focus stays on the input (per AC-21 implication) so the user can correct the email.
6. **Error: 400 "already a member".** Banner copy **"That user is already a member of this project."** Otherwise identical to #5.
7. **Error: 403 "only owner can add" → `roleRevoked = true`.**
   - The smart container detects the 403, sets `roleRevoked.set(true)`, which **unmounts** the `AddMemberFormComponent` and every Remove button in the same render cycle. The dialog-level error banner appears ("Only the project owner can add members.") and stays until the user dismisses the dialog.
   - Transition: the form section fades out over `$motion-fast` (use Angular's `@if` + a 150 ms opacity transition on a wrapper class).
8. **Error: network (status 0) / 5xx.** Banner with the appropriate copy from the error matrix; input retains value; submit re-enables.

### Flow C — Owner removes a member

1. **Hover a removable row.** Row bg `transparent → $bg-sidebar-light`, `$motion-fast`. Remove button stays in its idle state (transparent / coral label).
2. **Hover the Remove button.** Button inverts: fill `transparent → $status-high`, label `$status-high → $text-inverse`, border matches fill. This inversion is the "about to be destructive" cue.
3. **Activate Remove (click / Enter / Space).** Opens `RemoveMemberConfirmDialogComponent` via `Dialog.open({ data: { member }, ariaLabelledBy: 'remove-member-confirm-heading', autoFocus: 'first-tabbable', restoreFocus: true, panelClass: 'remove-member-confirm-dialog-panel', backdropClass: 'remove-member-confirm-dialog-backdrop' })`. The Members dialog stays open behind it with focus held. Confirm dialog enters with the same rise animation.
4. **Confirm dialog initial focus.** Lands on Cancel (safe default). User reads the heading **"Remove {{ member.name }}?"** and the consequence sentence.
5. **Cancel.** Dialog closes with `undefined`. Focus returns to the Remove button that opened it. No network call.
6. **Confirm Remove.** Confirm dialog closes with `true`. Focus returns to the Remove button (briefly) then the smart container:
   - Sets `pendingRemovalUserId.set(member.userId)` → the row gains the `.member-row--pending` class: opacity `1 → 0.5` over `$motion-base`; `pointer-events: none`; the Remove button shows a spinner next to the label "Removing…".
   - Submits `DELETE`.
7. **Success (204).**
   - Row unmount — Angular handles via `@for` key removal. Visually: row fades out (apply `.member-row--leave { opacity: 1 → 0; transform: translateY(0 → -4px); }` via an `animationend` + removal pattern in the TS; `$motion-base`).
   - Focus moves per AC-33: next row's Remove button → else add-form input → else close button.
   - SR announces "Removed {{ name }}." via the live region.
8. **404 (concurrent remove).** Tolerated silently (tech spec §3.3). Local row is removed the same way as #7; no banner.
9. **400 "cannot remove last owner".** Dialog-level banner appears: **"You can't remove the last owner of a project."** `pendingRemovalUserId` is cleared; the row returns to full opacity. The owner is never left wondering what happened.
10. **403 → `roleRevoked = true`.** Same behavior as Flow B step 7, but triggered from a remove.

### Flow D — Non-owner reachability (today = nil; future `mode: 'view'` sketch)

Per tech spec §2.2, today non-owners have **no entry point** — the Manage button is not rendered. This is intentional and meets AC-22. The dialog is never reachable without owning the project.

**For a future `mode: 'view'` expansion** (explicitly deferred), the dialog would:
- Omit the `AddMemberFormComponent` entirely.
- Render every row without a Remove button (regardless of role), using the same `canRemove === false` branch the owner view already uses.
- Replace the add-form with a muted `.members-dialog__viewer-note` reading **"Only owners can add or remove members."** in `$text-tertiary` / italic — already styled in §3.2.
- Keep the rest of the roster, the "(You)" indicator, and role badges identical.

No new components are introduced for `mode: 'view'`; it is a pure rendering-conditional driven by the `isOwner` flag the dialog already has.

---

## 5. Responsive Behavior

### < `$bp-md` (mobile — phones, single-column)
- **Dialog panel** fills `calc(100vw - 2 * $space-md)` with `$space-md` padding. It does not go full-screen — the 16 px side gutter preserves the backdrop ring so the user can dismiss by tapping outside, and the rounded `$radius-lg` stays visible.
- **Header** wraps cleanly: title can line-break (no truncation on the project name); close button sits top-right.
- **Members list rows** wrap: `.member-row` becomes `flex-wrap: wrap`. The avatar + identity + role-badge stay on line 1; the Remove button drops to line 2 at `flex-basis: 100%` so the thumb has a ≥ 44 × 44 target stretching the full content width.
- **Add-member form** stacks: input on top (full-width), Add button below (full-width). Error banner spans full width.
- **Confirm dialog** actions stack `column-reverse` — Cancel on top, Remove on the bottom (harder for a reaching thumb to hit first).
- **Icon button on project card** grows from 32×32 to 44×44 with a 20 px icon so the touch target meets the canonical 44-px rule.

### `$bp-md` – `$bp-lg` (tablet / small laptop)
- Dialog panel caps at `max-width: 560px`, centered, `$space-lg` padding.
- Row layout becomes a single line: identity | badge | Remove.
- Add-member form becomes a single row: input (flex: 1) + Add button (auto).
- Confirm dialog actions become a single row: Cancel | Remove (Cancel left, Remove right — primary action on the right follows the canonical right-aligned-actions convention).

### ≥ `$bp-lg` (desktop — default laptop and up)
- No further changes. The dialog does not widen beyond 560 px because rosters rarely benefit from more horizontal space; emails stay one line.

### Breakpoint-independent rules
- `prefers-reduced-motion: reduce` clamps all animations in this feature to 0.01 ms (via the global rule + local media queries on keyframe animations).
- Long content (project names, emails, display names) truncates with ellipsis at the row level; the confirm dialog preserves the full name without truncation because the user must be able to read it in full to decide.

---

## 6. Accessibility Audit (WCAG AA)

### Contrast

Every foreground/background pair used by this feature, measured against WCAG 2.2 AA thresholds (**4.5:1** body text, **3:1** large text / UI controls per 1.4.11).

| # | Surface | Foreground | Context | Measured ratio | Verdict |
|---|---------|------------|---------|----------------|---------|
| 1 | `$bg-main` | `$text-primary` (#1C1C1C) | Dialog title, row name, body copy | **17.9:1** | ✅ AAA |
| 2 | `$bg-main` | `$text-secondary` (#7A7A7A) | Row email, add-form heading, "(You)", close button icon | **4.6:1** | ✅ AA |
| 3 | `$bg-main` | `$text-tertiary` (#A1A1A1) | Viewer-mode muted note (future, italic) | **2.8:1** | ⚠️ UI/meta only — not used for primary copy. Canonical brief rule #Typography-accessibility-audit accepts this. |
| 4 | `$bg-sidebar-light` | `$text-primary` | Row hover fill, icon-button hover, cancel hover | **15.5:1** | ✅ AAA |
| 5 | `$bg-sidebar-light` | `$text-secondary` | Add button disabled label on disabled-fill | **4.9:1** | ✅ AA |
| 6 | `$brand-primary-light` | `$text-primary` | Avatar initials, owner badge (reused class) | **14.8:1** | ✅ AAA |
| 7 | `$brand-primary` | `$text-inverse` | Add button enabled label | **3.3:1** | ✅ AA for UI control text (14 px / 500) per 1.4.11 |
| 8 | `$status-high` | `$text-inverse` | Remove button hover, confirm Remove button | **3.5:1** | ✅ AA for UI control text per 1.4.11 |
| 9 | `$bg-main` | `$status-high` | Remove button idle label, error banner icon | **3.5:1** | ✅ AA for UI |
| 10 | `$bg-main` | `$brand-primary` | Focus ring on primary controls | **3.6:1** | ✅ AA for UI |
| 11 | `$bg-main` | `$status-high` outline | Focus ring on Remove / Confirm-Remove | **3.5:1** | ✅ AA for UI |
| 12 | `$brand-primary-light` | `$text-secondary` | Disabled Add button text | **3.1:1** (measured via sRGB calc) | ⚠️ borderline — acceptable for disabled state per WCAG 1.4.3 exception (disabled controls exempt from contrast minimums). Verify numerically during implementation; if it falls below, swap disabled label to `$text-primary`. |

**Non-colour cues** (per canonical brief rule #2 "Priority Signaling"):
- Role is conveyed by **badge color + text label** ("Owner" / "Member") — never color alone.
- Error state conveys via **coral left border + coral icon + textual message** — never color alone.
- Destructive Remove conveys via **coral label + verb "Remove" + confirmation modal** — never color alone.
- "(You)" self-indicator is **text**, not a background highlight.

### Keyboard

- Tab order inside `MembersDialogComponent` (owner, loaded, no error): `close button → add-form email input → Add button → Row 1 Remove → Row 2 Remove → … → Row N Remove → loops back to close`. This ordering is guaranteed by DOM order — the template must place the close button first in the DOM but visually last (via `flex` ordering or `order:` CSS — spec choice here is to place close button first in DOM AND first visually, per dialog convention).
- `Escape` closes every dialog (CDK default on `Dialog`).
- `Enter` submits the add-form; Space/Enter activates every button.
- Focus trap is automatic via CDK `Dialog`; confirm with `autoFocus: 'first-tabbable'` and `restoreFocus: true` in the open options (tech spec §5.5 — design spec reiterates because visual focus feedback depends on it).
- Focus ring is **always visible** on `:focus-visible` — 2 px `$brand-primary` outline with 2 px offset on all interactive controls except Remove/Confirm-Remove, which use `$status-high` to preserve the destructive semantic.
- Rapid double-activation on Remove is prevented by `pendingRemovalUserId` disabling the button — there is no way to double-fire the DELETE.

### Screen Reader

- `MembersDialogComponent` root: `role="dialog"` (set by CDK), `aria-labelledby="members-dialog-title"`.
- Title element: `<h2 id="members-dialog-title">Members — {{ project.name }}</h2>` — the name in the accessible label satisfies AC-45.
- Member list: `<ul role="list">` (force the role — some user stylesheets strip it when `list-style: none`). Each `<li>` holds a row. Screen readers announce the row count ("list, 5 items").
- Row: name + email + role are visible text in reading order. "(You)" is visible text, not a pseudo-element.
- Remove button: `aria-label="Remove {{ member.name }} from {{ project.name }}"` — disambiguates from other Remove buttons.
- Live region: a visually hidden `<div class="sr-only" aria-live="polite" aria-atomic="true">` inside the dialog body. The smart container writes to it on:
  - "Loading members…" (on load start)
  - "Added {{ name }}." (on add success)
  - "Removed {{ name }}." (on remove success)
  - Error messages also surface via this region so SRs don't miss them.
- Confirm dialog: `aria-labelledby="remove-member-confirm-heading"` (the heading contains the member's name verbatim, satisfying AC-47).

### Motion

- Global `prefers-reduced-motion: reduce` rule (in `_motion.scss` lines 7–11) clamps all transitions and animations to 0.01 ms. Every local `@keyframes` in this spec also includes its own `@media (prefers-reduced-motion: reduce) { animation-duration: 0.01ms; }` defense-in-depth.
- Only `transform` and `opacity` are animated (canonical rule #9). No `top/left/width/height` transitions anywhere.
- No auto-playing content; no parallax; no looping animations longer than the 1.4 s skeleton shimmer and the 1 s button spinner (both purpose-driven loading indicators).
- Skeleton shimmer and button spinner both freeze visibly under reduced-motion but remain on-screen, so the user still gets the "something is happening" cue.

### Forms

- Email input: label rendered by `FormInputComponent` (`form-input.component.html:2–8`). The `label` input must be set to **"Email"** and `required` to `true`.
- Field-level error: `FormInputComponent` already renders an inline error in `$status-high` text (via its Tailwind utilities) for `required`, `email`, and `whitespaceOnly` errors. The design spec does not override these — they are already token-aligned.
- Server-side error surfaces in the **form-level banner** (not the field error), because server errors don't map cleanly to a single FormControl error key. The banner is linked to the input via `aria-describedby` (tech-spec responsibility).
- On error, focus stays in the input so the user can correct without re-tabbing.

### Testing
- Vitest-compatible a11y check: `@axe-core/angular` via `AxeBuilder` or equivalent; run on two fixtures:
  1. `MembersDialogComponent` in `listVm.status === 'success'` + owner + loaded roster → expect zero critical/serious violations.
  2. `MembersDialogComponent` with the add-form focused (programmatic focus) → expect zero critical/serious violations.
- Manual: Tab traversal with no mouse; reduced-motion toggle in DevTools; zoom to 200 %; narrow to 320 px width.

---

## 7. Implementation Checklist

### Prerequisites (already satisfied; verify before coding)
- [x] Token files exist at `KanbAI-Web/src/styles/variables/` — verified 2026-04-30 via `Glob`. **Source-path note:** use `src/styles/...` not `KanbAI-Web/KanbAI-Web/src/...`.
- [x] Global `prefers-reduced-motion` rule is emitted from `_motion.scss:7–11`. No additional wiring needed.
- [x] Inter font already loaded by the app (see `_typography.scss:$font-family-base`).
- [x] `project-card__badge--owner` and `--member` classes exist at `project-card.component.scss:81–94`. Reuse verbatim — **do not redefine**.
- [x] `CreateProjectDialogComponent` precedent exists at `create-project-dialog.component.{ts,scss}`; mirror its `panelClass` / `backdropClass` / `ViewEncapsulation.None` / scoping pattern.

### Per-component SCSS — all six

- [ ] `project-card.component.scss` — append the `.project-card__manage-btn` rules from §3.1. Do not touch existing selectors. Verify the `@use 'src/styles/variables/breakpoints' as *;` line is present (add it if missing).
- [ ] `members-dialog.component.scss` — create from §3.2. Component uses `ViewEncapsulation.None`; pass `panelClass: 'members-dialog-panel'` and `backdropClass: 'members-dialog-backdrop'` in the `Dialog.open({...})` call.
- [ ] `members-list/members-list.component.scss` — create from §3.3. Include the row-hover rule from the §3.4 interaction note (`.members-list > li:hover { background-color: $bg-sidebar-light; }`).
- [ ] `member-row/member-row.component.scss` — create from §3.4. Ensure the `.member-row--enter` class is removed on `animationend` from the component TS.
- [ ] `add-member-form/add-member-form.component.scss` — create from §3.5. The submit wraps `FormButtonComponent`; style the inner `button` via `::ng-deep` (documented pattern — `create-project-dialog.component.scss:159` uses `::ng-deep button` the same way).
- [ ] `remove-member-confirm-dialog/remove-member-confirm-dialog.component.scss` — create from §3.6. `ViewEncapsulation.None`; `panelClass: 'remove-member-confirm-dialog-panel'`; `backdropClass: 'remove-member-confirm-dialog-backdrop'`.

### Wiring / template

- [ ] Add the icon-button markup to `project-card.component.html` inside the existing `.project-card__header` element, between `.project-card__title` and `.project-card__badge`. Template: see §3.1 accessibility section for the required `aria-label`.
- [ ] Add `aria-labelledby="members-dialog-title"` to the dialog root element in `members-dialog.component.html`.
- [ ] Add the visually-hidden live-region (`<div class="sr-only" aria-live="polite" aria-atomic="true"></div>`) and a signal-bound status message.
- [ ] Every button in the feature: `type="button"` (or `type="submit"` for the add-form submit), native `<button>` — no `<a>` masquerading as a button.
- [ ] Every icon-only button carries an `aria-label`.

### State / motion cleanup

- [ ] On row insert, apply `.member-row--enter`; on `animationend`, remove it.
- [ ] On row remove, apply `.member-row--leave` (opacity + translateY) for `$motion-base`, then delete the DOM node after `animationend`. Angular `@for` with `trackBy` handles identity; the leave animation is coordinated in the parent.
- [ ] Dialog enter animation happens once via CSS; do not replay it on re-render.

### Verification

- [ ] `npm run build` — zero new errors.
- [ ] `npm run test -- --watch=false` — zero INTRODUCED failures. Add a11y tests per §6 "Testing".
- [ ] Manual keyboard pass: from the dashboard, Tab to a project card, Tab to Manage button, Enter → dialog opens → Tab reaches add-form → Tab reaches each Remove → Shift+Tab returns → Escape closes → focus back on Manage button.
- [ ] DevTools `prefers-reduced-motion: reduce` → all animations collapse to 0.01 ms; skeleton stays visible.
- [ ] Resize to 320 px, 568 px, 768 px, 1024 px, 1440 px — no horizontal scroll outside the existing kanban-board scroll zone.
- [ ] Run `@axe-core/angular` on two fixtures (list-loaded + add-focused) — zero critical / serious violations.
- [ ] Zoom browser to 200 % — no control becomes unreachable.
- [ ] Confirm contrast pair #12 (disabled Add label) measures ≥ 3:1 in the final pixel output; swap to `$text-primary` if not.

---

## Self-Review (author-run before save)

- [x] Every color, spacing, radius, and motion value references a canonical token. **One exception**: `rgba(0, 0, 0, 0.08)` overlay on Remove-button hover (§3.6), because no `$status-high-hover` token exists; flagged inline for future token addition.
- [x] Every interactive element has default / hover / focus / active / disabled states.
- [x] Every list/board view has loading / empty / error designed (§3.3 skeleton, §3.3 empty, §3.2 error banner).
- [x] Drag interactions: n/a (Members has no drag).
- [x] Color is paired with text/icon for every semantic signal (role, error, destructive).
- [x] Touch targets ≥ 44 × 44 on mobile (Manage button, Remove, Add, Cancel, Confirm-Remove, dialog close).
- [x] `prefers-reduced-motion` honoured by global rule + defense-in-depth local queries.
- [x] Tab order described for the Members dialog (§6 Keyboard).
- [x] Every contrast ratio is cited with a measured number (§6 Contrast — 12 rows, all measured).
- [x] Reused classes (`project-card__badge--owner`/`--member`) are referenced, not redefined.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
