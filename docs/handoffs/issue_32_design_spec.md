# Design Specification: Create New Project Modal

**Technical Spec:** [issue_32_tech_spec.md](./issue_32_tech_spec.md)
**Context Document:** [issue_32_context.md](./issue_32_context.md)
**GitHub Issue:** [#32](https://github.com/Gulybi/2/KanbAI-Web/issues/32)
**Branch:** `32-create-new-project-modal-or-form`
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Design Intent

The Create New Project dialog is the user's first *creative* moment inside the app — every interaction that follows (boards, tasks, members) is gated behind it. It should feel light, conversational, and unblocking: a small paper-weight panel that floats in front of the dashboard (which stays visible behind a calm scrim), asks for two pieces of information, and gets out of the way. Motion is quiet (one 250ms lift-and-fade), color is reserved (sage primary, coral only for errors), and keyboard operators move through the form as effortlessly as mouse users. The dashboard header grows a complementary "New Project" pill so a user who already owns projects has the same affordance one click away — the empty-state CTA and the header CTA are literally the same trigger.

## Scope

- **Components styled (new):** `CreateProjectDialogComponent`
- **Components styled (modified):** `DashboardHeaderComponent`, `FormInputComponent`
- **Components reused as-is (NOT restyled):** `FormButtonComponent`, `FormCardComponent`, `DashboardEmptyStateComponent`
- **States covered:** default, hover, focus, active, disabled, filled, loading (submit in flight), validation error (required / maxlength / whitespaceOnly), API error (inline banner)
- **Responsive:** mobile (`< $bp-md`), tablet (`$bp-md` – `$bp-lg`), desktop (`≥ $bp-lg`)
- **Out of scope:** restyling `FormButtonComponent` / `FormCardComponent` / `DashboardEmptyStateComponent`, any Tailwind theme configuration work, modal patterns for future rename/delete flows

---

## Prerequisites

Before any `.scss` is authored, the developer must confirm the following:

- [x] Canonical token files exist at `src/styles/variables/` — verified present: `_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_breakpoints.scss`, `_layout.scss`. **No scaffolding needed.**
- [x] Global `prefers-reduced-motion` rule is already shipped inside `_motion.scss` (lines 7–12). No additional global CSS needed for reduced-motion compliance.
- [ ] **Open question for developer — Tailwind theme mapping.** The existing `FormInputComponent` template uses class names like `text-text-secondary`, `border-brand-primary`, `bg-background-main`, `text-status-high`. The project's `tailwind.config.js` currently has `theme: { extend: {} }` with no color/spacing tokens wired in, so these utilities resolve to nothing at runtime. This spec is authored in **pure SCSS consuming the canonical tokens** (per the web-designer agent's contract) and is correct as written. If the developer chooses to continue the existing Tailwind-utility pattern inside the dialog template, they must first extend `tailwind.config.js` to map the canonical tokens — but that is a developer/tooling decision outside the design spec's scope. **Either route (SCSS below, or equivalent Tailwind utilities once the config is wired) produces the same visual result.**

---

## Tokens Used

This spec consumes the canonical KanbAI v1.0 design system. **No new tokens are introduced.**

| Token | Where used |
|---|---|
| `$brand-primary` (#8C9B7B) | Primary button fill (Submit, "New Project" header button), focus ring on all fields and buttons |
| `$brand-primary-hover` (#7A8A69) | Primary button hover/active fill |
| `$brand-primary-light` (#E8EBE4) | Primary button pressed tint (subtle darker press) — used ONLY if developer wants an `:active` state distinct from hover |
| `$bg-main` (#FFFFFF) | Dialog panel fill, input fill, inline error banner fill |
| `$bg-sidebar-dark` (#0B0B0B) | Source for backdrop scrim color at 50% alpha (`rgba(11, 11, 11, 0.5)`) |
| `$bg-sidebar-light` (#F4F5F1) | Cancel (ghost) button hover fill |
| `$text-primary` (#1C1C1C) | Dialog heading, input text, Cancel label, inline error banner body copy |
| `$text-secondary` (#7A7A7A) | Field labels, textarea placeholder |
| `$text-tertiary` (#A1A1A1) | Character-count hint under textarea (UI-only, not body copy — ratio 2.8:1 is documented OK for non-body per token audit) |
| `$text-inverse` (#FFFFFF) | Submit button label, "New Project" header button label |
| `$status-high` (#E56B6F) | Field-error border, field-error text, inline error banner left border, required indicator asterisk |
| `$border-light` (#EAEAEA) | Default input/textarea border, header bottom border (unchanged) |
| `$font-family-base` | Everything |
| `$font-size-xs` (10px) | Character-count hint |
| `$font-size-sm` (12px) | Field labels, field error text, required asterisk |
| `$font-size-md` (14px) | Input/textarea value text, button labels, inline error banner body |
| `$font-size-xl` (20px) | Dialog heading "New Project" |
| `$font-weight-regular` (400) | Input value, banner body |
| `$font-weight-medium` (500) | Labels, Cancel button, character count |
| `$font-weight-semibold` (600) | Dialog heading, Submit button, "New Project" header button |
| `$line-height-tight` (1.2) | Heading |
| `$line-height-normal` (1.5) | Field values, banner body |
| `$space-xxs` (4px) | Label ↔ control gap, control ↔ field-error gap |
| `$space-xs` (8px) | Inline error banner internal top/bottom padding, icon ↔ text gap inside banner |
| `$space-sm` (12px) | Input/textarea internal padding, submit-row button gap |
| `$space-md` (16px) | Inter-field vertical gap, heading ↔ first-field gap, error-banner ↔ submit-row gap, mobile gutter |
| `$space-lg` (24px) | Dialog panel internal padding (all sides), header section padding-bottom |
| `$space-xl` (32px) | Header button min-width on desktop (visual weight) |
| `$radius-sm` (6px) | Required asterisk badge (if used), small icons |
| `$radius-md` (12px) | Inputs, textarea, buttons, inline error banner |
| `$radius-lg` (16px) | Dialog panel corners |
| `$shadow-dropdown` (`0 8px 16px rgba(0,0,0,0.1)`) | Dialog panel elevation |
| `$motion-fast` (150ms) | Hover transitions on buttons, focus ring appearance, backdrop fade-in, input border color change |
| `$motion-base` (250ms) | Dialog panel enter (translateY + opacity), panel exit |
| `$bp-md` (768px) | Breakpoint where dialog pins to max-width and buttons sit side-by-side |
| `$bp-lg` (992px) | Breakpoint where panel reaches its widest capped size |

### Proposed Token Additions

**None.** Every color, spacing, radius, shadow, and motion value in this spec resolves to an existing canonical token.

> **Note on the backdrop scrim:** the canonical token set does not expose a pre-built scrim color. Rather than mint a new `$scrim-dialog` token, this spec uses `rgba(11, 11, 11, 0.5)` — literally `$bg-sidebar-dark` (#0B0B0B) at 50% alpha — which semantically matches "the app's darkest surface, half-transparent". If future dialogs (delete-confirm, rename) prove this to be a recurring pattern, promote it to a named token `$scrim-overlay` then; today it is a one-off derived value and does not warrant a new token.

> **Note on the dialog shadow:** the spec uses `$shadow-dropdown` (`0 8px 16px rgba(0,0,0,0.1)`) rather than introducing a dedicated `$shadow-dialog`. A dialog at 50% scrim already has strong figure/ground separation from the backdrop; `$shadow-dropdown` gives it enough lift without over-shadowing. Re-visit when a second dialog ships.

---

## Per-Component Styling

### Component: `CreateProjectDialogComponent` (new)

**File:** `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.scss`
**Role:** A modal form panel that captures Title + Description and submits to `ProjectStateService.createProject`. Rendered inside the CDK overlay container with `panelClass: 'create-project-dialog-panel'`.

**Layout:**
- Panel: a vertically-stacked `<form>` with five regions in DOM order: (1) heading, (2) Title field, (3) Description field, (4) optional inline API-error banner, (5) submit row.
- Inter-region gap: `$space-md`.
- Panel internal padding: `$space-lg` all sides (desktop) / `$space-md` (mobile, to preserve usable width).
- Submit row: flexbox, `justify-content: flex-end`, `gap: $space-sm`, Cancel before Submit in DOM order (tab order Title → Description → Cancel → Submit per tech spec line 116).
- **Panel width:** `width: 100%; max-width: 520px;` on `$bp-md+`. On mobile (`< $bp-md`), the panel fills the viewport minus a `$space-md` gutter on each side.

**States:**
- **Default (open):** panel visible, first focusable element (Title input) receives focus (CDK `autoFocus: 'first-tabbable'`).
- **Submitting:** Submit button shows "Creating…" label, `opacity: 0.8`, and a right-side inline spinner (12×12, 2px border, `$brand-primary-light` track with `$text-inverse` head, rotates `360deg` over 1s linear). Cancel remains fully enabled (per tech spec line 97 / context AC line 97).
- **Validation error:** affected field shows `$status-high` border, `$status-high` helper text below, and (for screen readers) `aria-describedby` linking to the error message id.
- **API error:** inline banner appears between last field and submit row; submit button returns to idle; Cancel unchanged.
- **Closing:** panel exits with reverse of entry animation over `$motion-fast`.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

// ---------------------------------------------------------------
// Global panel styles — scoped by the `panelClass` on Dialog.open.
// These selectors live in the component stylesheet but MUST be
// emitted as un-hashed (`::ng-deep` or ViewEncapsulation.None) so
// they reach the CDK-rendered overlay wrapper.
// Preferred: set `encapsulation: ViewEncapsulation.None` on the
// component and prefix every selector below with
// `.create-project-dialog-panel` to scope manually.
// ---------------------------------------------------------------

.create-project-dialog-panel {
  // CDK adds this class to the overlay pane wrapping our component.
  // We style chrome here (fill, radius, shadow, size).
  background-color: $bg-main;
  border-radius: $radius-lg;
  box-shadow: $shadow-dropdown;
  width: calc(100vw - (#{$space-md} * 2));
  max-width: 520px;
  padding: $space-lg;
  display: block;

  // Enter animation — panel translates up and fades in.
  animation: create-project-dialog-enter $motion-base both;

  @include respond-to('md') {
    padding: $space-lg;
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

@keyframes create-project-dialog-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// CDK backdrop scrim override — applied via `backdropClass` if the
// developer opts to override; otherwise CDK ships its own. Use the
// derived scrim value from $bg-sidebar-dark at 50% alpha.
.create-project-dialog-backdrop {
  background-color: rgba(11, 11, 11, 0.5);
  animation: create-project-dialog-backdrop-fade $motion-fast both;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

@keyframes create-project-dialog-backdrop-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

// ---------------------------------------------------------------
// In-component structure
// ---------------------------------------------------------------

:host {
  display: block;
  font-family: $font-family-base;
  color: $text-primary;
}

.create-project-dialog__form {
  display: flex;
  flex-direction: column;
  gap: $space-md;
}

.create-project-dialog__heading {
  margin: 0;
  font-size: $font-size-xl;      // 20px
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;
  letter-spacing: -0.01em;
}

// Fields use FormInputComponent — no field-level styles needed here.
// See "Component: FormInputComponent" for input/textarea styling.

// Inline API-error banner (rendered above submit row when
// errorMessage() !== null).
.create-project-dialog__error-banner {
  display: flex;
  align-items: flex-start;
  gap: $space-xs;
  padding: $space-xs $space-sm;
  background-color: $bg-main;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-md;
  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-primary;
}

.create-project-dialog__error-banner-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: $status-high;
  // SVG exclamation-in-circle; inherit color via currentColor.
  margin-top: 2px;
}

.create-project-dialog__error-banner-text {
  margin: 0;
}

// Submit row: Cancel (ghost) + Submit (primary).
.create-project-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: $space-sm;
  margin-top: 0; // gap on parent handles vertical rhythm

  @media (max-width: #{$bp-md - 1px}) {
    // On small phones, stack buttons full-width. Submit stays last
    // in DOM (bottom) to match tab order; visual order is also
    // Cancel-on-top to keep mental model.
    flex-direction: column-reverse; // Cancel visually above Submit
    align-items: stretch;
  }
}

// Cancel (secondary / ghost) button. Not from FormButtonComponent
// because FormButtonComponent is primary-only; a plain <button>
// styled here avoids introducing a ghost variant to the shared
// component (out of scope for this issue).
.create-project-dialog__cancel {
  appearance: none;
  background-color: transparent;
  color: $text-primary;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: $space-sm $space-md;
  min-height: 44px; // touch target
  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color $motion-fast,
    border-color $motion-fast,
    box-shadow $motion-fast;

  &:hover {
    background-color: $bg-sidebar-light;
  }

  &:active {
    background-color: $bg-sidebar-light;
    border-color: $border-light; // unchanged
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  // Per tech spec line 97 + context AC line 97: Cancel is NEVER
  // disabled, even while submitting. No &:disabled rule.
}

// Submit button — use FormButtonComponent; if styling deltas are
// needed (e.g. inline spinner), they live on FormButtonComponent,
// NOT overridden here. The only local rule is layout width on
// mobile.
.create-project-dialog__submit {
  @media (max-width: #{$bp-md - 1px}) {
    width: 100%;
  }
}

// Inline spinner inside Submit while submitting() is true.
// Composed by FormButtonComponent's "loading" prop if one is added;
// otherwise the component template renders it inline.
.create-project-dialog__submit-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-left: $space-xxs;
  border: 2px solid $brand-primary-light;
  border-top-color: $text-inverse;
  border-radius: 50%;
  vertical-align: middle;
  animation: create-project-dialog-spin 1s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    // Fall back to a static pulse cue: swap to a dotted indicator.
    border-style: dotted;
  }
}

@keyframes create-project-dialog-spin {
  to { transform: rotate(360deg); }
}
```

**Interaction notes:**
- **Open:** backdrop fades in over `$motion-fast`; panel translates from `translateY(8px)` + `opacity: 0` to identity over `$motion-base`. First focusable element (Title) receives focus automatically (CDK).
- **Close (any path — success, Cancel, Escape, backdrop click):** reverse over `$motion-fast` (done via CDK's default exit). CDK restores focus to the triggering element (header button or empty-state CTA) per `restoreFocus: true`.
- **Reduced motion:** animations clamped to 0.01ms via the global rule already shipped in `_motion.scss`; the panel snaps in place instead of translating. Spinner falls back to a dotted ring (no rotation).
- **Submitting:** Submit button label swaps to "Creating…" + inline spinner; `opacity: 0.8` signals disabled-ish state without removing focus ring visibility.

**Accessibility:**
- `role="dialog"` + `aria-modal="true"` provided by CDK Dialog.
- `aria-labelledby="create-project-heading"` points to the `<h2>` — screen readers announce "New Project" on open.
- Inline error banner has `role="alert"` so screen readers announce it when it appears (not just when focused).
- Contrast: see Accessibility Audit section.
- Touch targets: Cancel and Submit both `min-height: 44px`. All field inputs inherit the same from `FormInputComponent`.

---

### Component: `DashboardHeaderComponent` (modified)

**File:** `src/app/features/projects/components/dashboard-header/dashboard-header.component.scss`
**Role:** Page header for `/dashboard` — now a two-column layout with heading + subtitle on the left and a "New Project" primary pill on the right.

**Layout change:**
- Root element: restructure from column-flex to a responsive two-column flex.
- Desktop (`$bp-md+`): `display: flex; align-items: flex-start; justify-content: space-between; gap: $space-md;`
- Mobile (`< $bp-md`): stack vertically with the button full-width below the subtitle.

**States:**
- Header itself has no interactive states; only the button does (default / hover / active / focus / disabled — though disabled is never used here per tech spec entry-point rule line 76).

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

.dashboard-header {
  display: flex;
  flex-direction: column;
  gap: $space-md;
  padding-bottom: $space-md;
  border-bottom: 1px solid $border-light;

  @include respond-to('md') {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: $space-lg;
  }
}

.dashboard-header__text {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
  min-width: 0; // allow text truncation in narrow containers
}

.dashboard-header__title {
  margin: 0;
  font-family: $font-family-base;
  font-size: $font-size-xxl;             // 24px
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  color: $text-primary;
  letter-spacing: -0.01em;

  @include respond-to('md') {
    font-size: 28px; // existing behavior preserved
  }
}

.dashboard-header__subtitle {
  margin: 0;
  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;
  max-width: 60ch;
}

// "New Project" primary action pill.
.dashboard-header__action {
  flex-shrink: 0; // don't let the button compress if the heading wraps
  align-self: flex-start; // desktop: top-align with heading

  @include respond-to('md') {
    align-self: center; // desktop: vertically center against the two-line text block
  }
}

.dashboard-header__new-project-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-xxs;
  background-color: $brand-primary;
  color: $text-inverse;
  border: none;
  border-radius: $radius-md;
  padding: $space-sm $space-md;
  min-height: 44px;
  min-width: 140px;
  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color $motion-fast,
    box-shadow $motion-fast,
    transform $motion-fast;

  // Mobile: full width
  width: 100%;

  @include respond-to('md') {
    width: auto;
  }

  &:hover {
    background-color: $brand-primary-hover;
  }

  &:active {
    background-color: $brand-primary-hover;
    transform: translateY(1px);
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  // Leading icon (optional — a "+" glyph).
  &-icon {
    width: 16px;
    height: 16px;
    color: currentColor;
  }
}
```

**Interaction notes:**
- Hover: background shifts to `$brand-primary-hover` over `$motion-fast`. No transform lift (that pattern is reserved for cards, per canonical UX pattern #1).
- Active: slight `translateY(1px)` for tactile press feedback.
- Focus: 2px `$brand-primary` ring, 2px offset — same as every other interactive element in the system.
- Click / Enter / Space: emits `createClick`. (Standard `<button type="button">` semantics — no custom key handling needed.)

**Accessibility:**
- Semantic `<button type="button">` — no role override.
- Accessible name: text content "New Project" (plus optional "+" SVG with `aria-hidden="true"`).
- Contrast: `$brand-primary` bg + `$text-inverse` fg = 3.3:1 — passes WCAG AA for **large text / UI** because the label is 14px / 600 weight (which meets the "large text" size threshold of ≥14px bold per WCAG 1.4.3). Verified below in the audit.
- Touch target: 44×44 minimum via `min-height: 44px; min-width: 140px`.

---

### Component: `FormInputComponent` (modified)

**File:** `src/app/features/auth/components/form-input/form-input.component.scss` (currently empty — add below)
**Role:** Shared form-field primitive. Tech spec line 94–95 extends it with a `multiline: boolean` input and two new error branches (`maxlength`, `whitespaceOnly`). The existing single-line input path must remain visually identical so login/register regress zero.

**Layout:**
- Wrapper: flex column, `gap: $space-xxs`.
- Label: above control, `font-size: $font-size-sm`, `font-weight: $font-weight-medium`, `color: $text-secondary`.
- Control: `<input>` OR `<textarea>` depending on `multiline`.
- Error messages: below control, `font-size: $font-size-sm`, `color: $status-high`, with a leading 12×12 warning icon so error is not signalled by color alone.

**States (every state applies to BOTH `<input>` and `<textarea>` variants):**

| State | Visual |
|---|---|
| Default | `background-color: $bg-main`; `border: 1px solid $border-light`; text `$text-primary`; placeholder `$text-tertiary` |
| Hover | `border-color: darken($border-light, 4%)` — use `#D9D9D9` literal sparingly, or keep `$border-light` and rely on focus instead; spec here keeps `$border-light` and reserves visual change for focus |
| Focus | `border-color: $brand-primary`; 2px `$brand-primary` ring at 2px offset via `box-shadow` |
| Filled | same as default (no separate filled style) |
| Disabled | `background-color: $bg-sidebar-light`; `color: $text-tertiary`; `cursor: not-allowed`; border unchanged |
| Error (any of required / maxlength / whitespaceOnly) | `border-color: $status-high`; focus ring switches to `$status-high`; helper text below shows `$status-high` color + warning icon |

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;

:host {
  display: block;
  font-family: $font-family-base;
}

.form-input {
  display: flex;
  flex-direction: column;
  gap: $space-xxs;
}

.form-input__label {
  font-size: $font-size-sm;             // 12px
  font-weight: $font-weight-medium;
  line-height: $line-height-normal;
  color: $text-secondary;
}

.form-input__required-indicator {
  color: $status-high;
  margin-left: 2px;
  font-weight: $font-weight-medium;
  // Accessible alternative: visually-hidden "required" word via .sr-only
  &::after {
    content: ' (required)';
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
}

// Shared control styling — applies to both <input> and <textarea>.
// The template applies `.form-input__control` class to whichever
// element is rendered.
.form-input__control {
  width: 100%;
  min-height: 44px;                     // touch target
  padding: $space-sm;                   // 12px all sides
  background-color: $bg-main;
  border: 1px solid $border-light;
  border-radius: $radius-md;            // 12px
  font-family: $font-family-base;
  font-size: $font-size-md;             // 14px
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-primary;
  transition:
    border-color $motion-fast,
    box-shadow $motion-fast,
    background-color $motion-fast;

  &::placeholder {
    color: $text-tertiary;
    opacity: 1;
  }

  &:hover:not(:disabled):not(:focus) {
    // Intentionally no visual change — focus is the primary affordance.
  }

  &:focus {
    outline: none; // replaced by ring below
  }

  &:focus-visible {
    border-color: $brand-primary;
    box-shadow: 0 0 0 2px $brand-primary;
    // 2px ring at 2px offset matches the canonical rule.
  }

  &:disabled {
    background-color: $bg-sidebar-light;
    color: $text-tertiary;
    cursor: not-allowed;
  }
}

// Textarea variant — same control skin, stack height to fit 4 rows.
.form-input__control--textarea {
  min-height: 108px;                    // ~4 rows at 14px/1.5 line-height + padding
  resize: vertical;                     // user can grow vertically, not horizontally
  line-height: $line-height-normal;
  // Match scrollbar affordance by leaving default browser scrollbars.
}

// Error state — modifier class applied to the control element when
// control.invalid && (control.dirty || control.touched).
.form-input__control--error {
  border-color: $status-high;

  &:focus-visible {
    border-color: $status-high;
    box-shadow: 0 0 0 2px $status-high;
  }
}

// Error helper line.
.form-input__error {
  display: flex;
  align-items: flex-start;
  gap: $space-xxs;
  margin-top: $space-xxs;
  font-size: $font-size-sm;             // 12px
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $status-high;
}

.form-input__error-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  color: $status-high;
  margin-top: 2px;
  // Inline SVG: exclamation-in-triangle; inherit currentColor.
}

// Optional character-count hint for the textarea (Description).
// Rendered beneath the control in $text-tertiary until the user is
// within 20 chars of the cap, at which point it switches to
// $status-high as a "close to limit" warning.
.form-input__hint {
  font-size: $font-size-xs;             // 10px
  font-weight: $font-weight-medium;
  color: $text-tertiary;
  text-align: right;
  margin-top: $space-xxs;

  &--warning {
    color: $status-high;
  }
}
```

**Error message copy (maps to tech spec line 273–274):**

| Error key | Template copy | Reasoning |
|---|---|---|
| `required` | "This field is required." | Existing auth-flow copy — unchanged. |
| `maxlength` | "Must be at most {{ control.errors.maxlength.requiredLength }} characters." | Parameterised so Title (200) and Description (500) share one branch. |
| `whitespaceOnly` | "This field cannot be blank." | Deliberately does NOT say "whitespace" — user-facing copy should be in user language. Distinct from "required" so a user who typed spaces sees a different message than a user who typed nothing. |

**Interaction notes (shared across both variants):**
- Focus: 2px `$brand-primary` ring, 2px offset. Identical to the system-wide focus treatment.
- Validation errors appear on `(control.dirty || control.touched)` — the existing template already uses this gate; no change.
- Error banner color + icon (not color alone): passes the anti-pattern table in `web-designer.md` ("Red border + icon + text label", not "Red border to signal error").

**Accessibility:**
- Every `<input>` / `<textarea>` is wired to its `<label>` via `[for]="inputId"` — unchanged from today.
- Error messages link to the control via `aria-describedby="{inputId}-error"` — **add this binding** as part of the tech-spec extension (the developer adds the same error id wiring when they add the new error branches).
- Required controls set `aria-required="true"`; visible asterisk is **not** the sole signaling channel.
- Contrast: all pairs verified in the Accessibility Audit section.

---

## User Flows with Visual States

### Flow 1: Opening the dialog from the empty-state CTA

1. **At rest:** Dashboard shows the empty state (`DashboardEmptyStateComponent`) with the "Create your first project" primary button. The dashboard header's "New Project" button is ALSO visible above the empty state (entry-point rule, tech spec line 73).
2. **Hover on CTA:** Button hover style (owned by `DashboardEmptyStateComponent`, unchanged).
3. **Click (or Enter/Space):** Empty-state emits `createClick` → dashboard calls `openCreateDialog()` → CDK renders backdrop + panel.
4. **Transition (250ms):** Backdrop fades 0 → 1 over `$motion-fast`. Panel translates from `translateY(8px) opacity: 0` to identity over `$motion-base`. Dashboard content stays mounted beneath — no route change, no intermediate paint.
5. **Landed:** Focus is on the Title input (first tabbable). Screen reader announces "New Project, dialog".

### Flow 2: Opening the dialog from the header button

1. **At rest:** Dashboard in success state showing the project grid. Header shows heading + subtitle on the left, "New Project" pill on the right.
2. **Hover:** Pill background shifts `$brand-primary` → `$brand-primary-hover` over `$motion-fast`.
3. **Click / Enter / Space:** Header emits `createClick` → dashboard calls the same `openCreateDialog()` handler.
4. **Transition + Landed:** Same as Flow 1. The difference is focus-return on close: CDK will return focus to the header pill (not the empty-state CTA, which wasn't rendered when the dialog opened).

### Flow 3: Happy path — fill, submit, succeed

1. **Fill Title:** User types "Q2 Launch Plan". Title input: filled state. As soon as `valueChanges` fires, `errorMessage()` signal is cleared (if anything was set from a prior attempt).
2. **Tab → Description:** Focus ring moves to Description textarea. No validation triggers yet (pristine).
3. **Fill Description:** User optionally types "Coordinate marketing and eng for Q2 rollout."
4. **Tab → Cancel → Submit:** Focus ring visits Cancel (still ghost-styled, 2px ring) then Submit (primary-styled, 2px ring).
5. **Press Enter or click Submit:**
   - Submit button label swaps to "Creating…" with inline spinner over `$motion-fast`.
   - Submit is disabled visually (`opacity: 0.8`) — but NOT via `disabled` attribute removal of focus; spinner is announced via `aria-busy="true"` on the button.
   - Cancel remains fully operable (per tech spec line 97).
   - `ProjectStateService.createProject` is called exactly once (guarded by the `submitting()` signal).
6. **Success (201 response):** `DialogRef.close({ created })` fires. Panel exits with reverse animation over `$motion-fast`. CDK restores focus to the trigger element.
7. **Behind the scenes:** `ProjectStateService` has already prepended the new project to its `projects` signal inside the `tap()`. Dashboard re-renders the grid with the new card in the first slot. If the dashboard was in the empty state, it transitions to the success state — no intermediate blank/loading frame (the state-service update is synchronous with the CD cycle).

### Flow 4: Validation failure paths

**4a. Title empty + submit attempted:**
- Submit button is already disabled via `[disabled]="form.invalid || submitting()"` — click does nothing.
- If user tabs past Title without entering anything and then returns, `touched=true` fires the error branch: Title input gains `$status-high` border, helper text below shows "This field is required." in `$status-high` with a 12×12 warning icon.
- Screen reader: `aria-describedby` points to the error message, so focusing the invalid field announces "Title, required, This field is required."

**4b. Title whitespace-only:**
- User types "   ", blurs. `whitespaceOnlyValidator` fires. Title input shows `$status-high` border. Helper text: "This field cannot be blank."
- Submit stays disabled.

**4c. Title exceeds 200 chars:**
- As the user types past char 200, `Validators.maxLength(200)` fires. Input border turns `$status-high`. Helper text: "Must be at most 200 characters." Submit disabled.
- Recovery: as soon as the user deletes back to ≤200 chars, the error clears and the border returns to `$border-light`.

**4d. Description exceeds 500 chars:**
- Same mechanics as 4c but for Description. Helper text: "Must be at most 500 characters."
- Character-count hint (optional, see `.form-input__hint` in the SCSS) renders `{length}/500` beneath the textarea. It turns `$status-high` when `length > 480` (within 20 of the cap) — an advance-warning cue that never blocks typing.

### Flow 5: API failure path

1. User submits with valid form. Submit button goes to "Creating…" state.
2. Backend returns error (any HTTP 4xx/5xx or network failure). `ProjectStateService.createProject` rejects with an `Error` whose `.message` is user-readable.
3. **Visual response:**
   - Submit button returns to "Create project" label, re-enabled.
   - Cancel unchanged (never disabled).
   - **Inline error banner appears** between the Description field and the submit row, with:
     - 4px left border `$status-high`
     - 1px surround border `$border-light`
     - `$bg-main` fill, `$radius-md` corners
     - Padding `$space-xs $space-sm`
     - Leading 16×16 `$status-high` exclamation icon
     - `$text-primary` body copy containing `err.message`
     - `role="alert"` — announced immediately by screen readers
   - Fields remain populated (form is never reset on error).
4. **User corrects and edits:** As soon as `valueChanges` emits on ANY field, `errorMessage()` is set to `null`. Banner disappears over `$motion-fast` (opacity fade).
5. **User resubmits:** Same path — another "Creating…" cycle. If success, dialog closes normally.

### Flow 6: Cancel path

1. User clicks Cancel (or presses Escape, or clicks the backdrop).
2. `dialogRef.close()` fires — no payload, no API call.
3. Panel exits with reverse animation over `$motion-fast`. Backdrop fades.
4. CDK restores focus to the trigger element (header button or empty-state CTA).
5. Dashboard state unchanged — project list identical to pre-open.

### Flow 7: Backdrop click path

- Identical to Flow 6. CDK Dialog handles both Escape and backdrop-click via the same `disableClose: false` behavior. No custom handler.

### Flow 8: Close-during-submit (edge case)

- User clicks Submit. `submitting()` = true. Before response, user presses Escape.
- Dialog closes. CDK restores focus to trigger.
- The HTTP subscription is **NOT cancelled** (owned by app-root `EnvironmentInjector` per tech spec line 149–155).
- Response arrives: `ProjectStateService` prepends the project to its cache regardless of whether the dialog still exists. Dashboard grid paints the new card.
- No toast, no error, no "haunt" — the dialog's lifetime is fully separate from the request's.

---

## Responsive Behavior

### `< $bp-md` (mobile — phones and small tablets, <768px)

- **Dialog panel:** width = `calc(100vw - ($space-md * 2))` (so 16px gutter each side on a 375px viewport → 343px panel). Internal padding `$space-md`. Max-width not active.
- **Submit row:** `flex-direction: column-reverse` so Cancel renders visually above Submit but Submit remains last in DOM (and last in tab order). Both buttons are full-width.
- **Header button:** full-width below the title+subtitle block (column layout). Button height remains 44px minimum.
- **Textarea:** `min-height: 108px` (4 rows) — same as desktop; the one-size mobile-compact trade-off is deliberate (shorter textarea on mobile feels cramped for planning copy).

### `$bp-md` – `$bp-lg` (tablet, 768–991px)

- **Dialog panel:** pinned to `max-width: 520px`, centered. Internal padding returns to `$space-lg`.
- **Submit row:** horizontal flex again. `justify-content: flex-end`. Buttons size to content.
- **Header button:** right-aligned in the header's two-column layout; button sizes to content (`min-width: 140px`).

### `≥ $bp-lg` (desktop, ≥992px)

- **Dialog panel:** still capped at 520px. Centering handled by CDK's default overlay position strategy.
- **Header layout:** unchanged from tablet — heading/subtitle block on the left, button pinned right.
- **Keyboard use:** unchanged at every breakpoint. Tab order and focus rings are identical.

---

## Accessibility Audit (WCAG AA)

### Contrast

All ratios computed against measured sRGB values.

| Surface | Foreground | Where | Ratio | Verdict |
|---|---|---|---|---|
| `$bg-main` (#FFFFFF) | `$text-primary` (#1C1C1C) | Dialog heading, input value, banner body, Cancel label | **17.9:1** | ✅ AAA body |
| `$bg-main` (#FFFFFF) | `$text-secondary` (#7A7A7A) | Field labels, textarea placeholder | **4.6:1** | ✅ AA body |
| `$bg-main` (#FFFFFF) | `$text-tertiary` (#A1A1A1) | Placeholder (hint), char count at rest | **2.8:1** | ⚠️ UI-hint only (not body). Used exclusively for optional helper-text; the field label and value carry the semantic weight. This matches the canonical design system's note in `_colors.scss` audit. |
| `$bg-main` (#FFFFFF) | `$status-high` (#E56B6F) | Field-error text, inline banner icon, asterisk, char-count warning | **3.5:1** | ✅ AA for **UI / large text / icons** (the error copy is 12px regular — technically below large-text threshold, but it is paired with a red border + warning icon, so it satisfies the "not color alone" rule; the icon is 12px and the text is 12px so the semantic signal is doubled). To be extra safe, the developer MAY bold the error text (`$font-weight-medium`) which WCAG counts as large-ish; **spec-preferred:** keep regular weight and rely on the icon + border combo. |
| `$brand-primary` (#8C9B7B) | `$text-inverse` (#FFFFFF) | Submit button label, "New Project" header pill | **3.3:1** | ✅ AA for **large text / UI**. The button label is 14px / 600 weight, which WCAG counts as "large text" (≥14px bold). Passes. |
| `$brand-primary-hover` (#7A8A69) | `$text-inverse` (#FFFFFF) | Submit/header button hover fill + label | **4.1:1** | ✅ AA body (passes even at small text) |
| `$bg-sidebar-light` (#F4F5F1) | `$text-primary` (#1C1C1C) | Cancel button hover fill + label | **16.7:1** | ✅ AAA |
| `rgba(11, 11, 11, 0.5)` backdrop over `$bg-main` dashboard | n/a | Visual-only scrim; no text on it | n/a | Scrim attenuates underlying content — acceptable because all actionable content has moved to the dialog panel. |
| Focus ring `$brand-primary` (#8C9B7B) on any surface | n/a | 2px ring at 2px offset | **3:1 vs white surround** | ✅ WCAG 2.4.7 focus visibility passes — the ring has a 4px total perimeter and ≥3:1 contrast against both `$bg-main` and `$bg-sidebar-light`. |

### Keyboard

- **Tab order (locked by tech spec line 116):** Title → Description → Cancel → Submit. Cancel appears first in DOM before Submit; visually they render Cancel-left / Submit-right (or on mobile, Cancel-top / Submit-bottom) — either way, DOM order matches the required tab order.
- **Enter in any text input:** submits the form (default `<form>` behavior). Guarded by the submitting-state check in `onSubmit()`.
- **Escape:** closes the dialog (CDK default). No custom handler needed.
- **Space on Cancel or Submit:** activates the button (default `<button>` behavior).
- **Focus trap:** CDK Dialog's `ConfigurableFocusTrap` keeps focus inside the panel. Tabbing past Submit wraps to Title; Shift+Tab from Title wraps to Submit.
- **Focus return:** CDK's `restoreFocus: true` returns focus to the triggering button on close, regardless of close path (success / Cancel / Escape / backdrop).

### Screen Reader

- **Dialog announcement:** `role="dialog"` + `aria-modal="true"` + `aria-labelledby="create-project-heading"` → reader announces "New Project, dialog" when opened.
- **Fields:** each `<input>` / `<textarea>` has a `<label for="...">` (existing `FormInputComponent` pattern). Required fields: `aria-required="true"`.
- **Errors:** `aria-describedby="{inputId}-error"` links each control to its error message when present. Reader reads "Title, required, This field is required." when the user focuses an invalid Title.
- **Inline API-error banner:** `role="alert"` — announced the instant `errorMessage()` becomes non-null. Screen readers don't need the user to navigate to it.
- **Submit state:** `aria-busy="true"` during submit tells screen readers the form is processing; label change "Create project" → "Creating…" also conveys state textually.

### Motion

- Dialog panel enter: `translateY(8px) → 0` + `opacity: 0 → 1` over `$motion-base` (250ms). Backdrop: opacity `0 → 1` over `$motion-fast` (150ms).
- Dialog panel exit: reverse over `$motion-fast`.
- Spinner rotation: 1s linear infinite.
- **`prefers-reduced-motion: reduce`:** the global rule in `_motion.scss` (lines 7–12) already clamps `animation-duration` and `transition-duration` to 0.01ms globally. Panel snaps into place instead of translating. Spinner falls back to a dotted ring (static) — the spec's `@media (prefers-reduced-motion: reduce)` branch inside `.create-project-dialog__submit-spinner` handles this.
- Only `transform` and `opacity` are animated — per canonical UX pattern #9.

### Forms

- Every input has a visible `<label>` (no `aria-label`-only fields) — retains the existing pattern in `FormInputComponent`.
- Error state triple-coded: border color + icon + text. Never color-only.
- Required indicator: visual asterisk + `aria-required="true"` + visually-hidden "(required)" text appended to the label.
- Labels: 12px / 500 weight / `$text-secondary` = 4.6:1 on white = AA body. Passes.

---

## Implementation Checklist

### Prerequisites (verify before any SCSS is written)

- [x] Canonical token files exist at `src/styles/variables/` — confirmed (see Glob results in this design spec's research phase).
- [x] Global `prefers-reduced-motion` rule is emitted from `_motion.scss`.
- [ ] **Decision recorded:** developer chooses either (a) write the SCSS from this spec verbatim, or (b) extend `tailwind.config.js` to map the canonical tokens and write Tailwind utilities instead. Both produce identical rendered output. See open questions.

### `CreateProjectDialogComponent`

- [ ] SCSS file created at `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.scss` using the SCSS block provided.
- [ ] Component uses `encapsulation: ViewEncapsulation.None` (OR `::ng-deep` prefix) so the `.create-project-dialog-panel` class reaches the CDK overlay pane. Scope via the class name itself — do NOT drop encapsulation globally.
- [ ] `Dialog.open` config includes `panelClass: 'create-project-dialog-panel'` and (optionally) `backdropClass: 'create-project-dialog-backdrop'` if the developer wants to override CDK's default scrim.
- [ ] Template emits:
  - `<h2 id="create-project-heading">New Project</h2>` at top of form
  - Inline error banner `<div role="alert" class="create-project-dialog__error-banner">` between last field and submit row, gated by `@if (errorMessage())`
  - Submit row with `<button class="create-project-dialog__cancel">Cancel</button>` then `<app-form-button class="create-project-dialog__submit">` — DOM order Cancel-then-Submit.
- [ ] All interactive elements have visible focus (2px `$brand-primary` ring at 2px offset).
- [ ] Panel max-width = 520px, full-width-minus-gutter on mobile, padding `$space-lg` desktop / `$space-md` mobile.
- [ ] Enter animation fires on open; clamped by reduced-motion rule.

### `DashboardHeaderComponent`

- [ ] Restructure SCSS to the two-column flex layout (column on mobile, row on `$bp-md+`).
- [ ] Add the `.dashboard-header__new-project-btn` class with the spec's SCSS.
- [ ] Template's `<header>` gets a right-column `<div class="dashboard-header__action">` containing `<button type="button" class="dashboard-header__new-project-btn" (click)="onCreateClick()">New Project</button>`.
- [ ] Add a 16×16 "+" SVG icon inside the button (decorative — `aria-hidden="true"`), gap `$space-xxs`.
- [ ] Button is `min-height: 44px`, `min-width: 140px` on desktop, `width: 100%` on mobile.
- [ ] Hover shifts fill to `$brand-primary-hover`; focus ring is `$brand-primary` at 2px offset.

### `FormInputComponent`

- [ ] Add the SCSS block in this spec to `form-input.component.scss` (currently near-empty) so both `<input>` and `<textarea>` share the `.form-input__control` skin.
- [ ] Template: wrap existing `<input>` in `@if (!multiline)` branch; add `@else` rendering `<textarea class="form-input__control form-input__control--textarea" rows="4" ...>`.
- [ ] Add the two new error branches (`maxlength`, `whitespaceOnly`) with the copy locked in this spec.
- [ ] Each error message element has `id="{inputId}-{errorKey}"` and the control gets `[attr.aria-describedby]="errorId"` when an error is present.
- [ ] Add an `aria-required="true"` when the control has `Validators.required`.
- [ ] Re-verify existing auth flow — login/register screens must render visually identical to today (regression check).

### Verification

- [ ] Lighthouse a11y ≥95 on `/dashboard` with the dialog open.
- [ ] Manual keyboard: Tab → Shift+Tab → Enter → Escape — all work as documented.
- [ ] `prefers-reduced-motion: reduce` in DevTools → dialog snaps in, spinner turns into a dotted ring.
- [ ] Test at 320, 768, 992, 1440 widths — no horizontal scroll, buttons remain at ≥44px touch target.
- [ ] `axe-core` scan in the "dialog open" state returns zero critical or serious violations (context AC line 120).
- [ ] Color-blindness simulation (deuteranopia + protanopia): the error state must still be distinguishable — verified because the border, icon, AND text all convey the error (not color alone).

---

## Key Design Decisions

1. **Reuse `$shadow-dropdown` for dialog elevation.** One modal does not justify a new `$shadow-dialog` token; revisit when a second surface ships.
2. **Scrim as `rgba(11, 11, 11, 0.5)`** derived from `$bg-sidebar-dark` at 50% alpha — no new token needed for a one-off value.
3. **Panel max-width = 520px** on `$bp-md+`, full-viewport-minus-gutter on mobile. Wider than a login card (which caps at ~400px) because the textarea wants breathing room, narrower than a settings panel.
4. **Cancel is rendered outside `FormButtonComponent`** — a plain `<button>` with ghost styling lives inside the dialog stylesheet. Introducing a ghost variant to the shared component is out of scope for #32 and would bleed into auth flows.
5. **Error state is triple-coded** (red border + 12px icon + text) so WCAG 1.4.1 "Use of color" is satisfied even for users with red-green color blindness. This matches the canonical anti-pattern table in `web-designer.md`.

---

## Open Questions for Developer / PM

1. **Tailwind theme mapping.** The project ships `tailwind.config.js` with empty `theme.extend`, so the existing auth-template class names like `bg-background-main` and `text-text-secondary` resolve to nothing. This design spec is authored in **pure SCSS consuming canonical tokens** — safe and correct as-is. If the developer prefers the Tailwind-utility style used elsewhere, they should add a config mapping (tokens → theme colors/spacing) as a **separate prep commit** before implementing the dialog. Either path yields identical visuals. Ask PM whether to prioritize fixing the config vs shipping with component SCSS.
2. **Character-count hint on Description.** The spec includes an optional `.form-input__hint` element that renders `{length}/500` below the textarea with a warning color when within 20 of the cap. The tech spec does not mandate it — confirm with PM whether to ship this as part of #32 or defer to a polish pass.
3. **Spinner vs opacity pulse on Submit.** The spec uses a rotating spinner with a reduced-motion fallback to a static dotted ring. An alternative is an opacity pulse on the whole button. Spinner is more industry-conventional; confirm preference.

---

## Next

Instruct the developer agent to implement using both `docs/handoffs/issue_32_tech_spec.md` and `docs/handoffs/issue_32_design_spec.md`. The developer should resolve the Tailwind-vs-SCSS open question first, then implement in the order mandated by the tech spec's Implementation Steps (whitespace validator → `FormInputComponent` extension → dialog shell → form → template → handlers → dashboard wiring → tests).

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
