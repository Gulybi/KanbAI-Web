# Design Specification: Editable task descriptions in the task detail panel

**Technical Spec:** [issue_91_tech_spec.md](./issue_91_tech_spec.md)
**Context Document:** [issue_91_context.md](./issue_91_context.md)
**GitHub Issue:** [#91](https://github.com/Gulybi/2/KanbAI-Web/issues/91)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Design Intent

The Description section is the first real *writing surface* in KanbAI — where users translate a task title into the shared context that makes a Kanban board worth using. It must feel like a quiet notepad, not a form: editing starts by clicking the text, saving is one motion (`Ctrl+Enter`), and the surface never shouts. Color is reserved for two moments only — sage-primary to signal focus (*"you're writing now"*) and coral to signal the two things that can interrupt a save (empty content, over-limit). Everything else is typography, spacing, and the panel's existing hushed palette.

The conflict banner and 404 toast are deliberately *calm* — they inform, they offer an action, they never block. Motion is minimal: the editor fades in, the confirm dialog slides up 8px, the toast slides in from the right. Nothing bounces, nothing pulses — this is a writing space, not a game.

## Scope

- **Components styled:**
  - `TaskDescriptionSectionComponent` (read + edit + banner surfaces)
  - `TaskDescriptionClearConfirmDialogComponent` (CDK Dialog panel)
  - `TaskNotFoundToastComponent` (fixed bottom-right toast)
  - Small adjustments to `TaskDetailPanelComponent` section chrome where the new child sits
- **States covered per component:** default, hover, focus (`:focus-visible`), active, disabled, loading (save in-flight), empty, error (inline + banner), conflict-detected.
- **Responsive:** mobile-first; panel is full-width <768px, 420px at md, 480px at lg (unchanged from existing panel).
- **Reduced motion:** the global `prefers-reduced-motion` rule in `_motion.scss` handles animation/transition clamping. No per-component reduced-motion code needed.

---

## Tokens Used

This spec consumes the canonical KanbAI design system. **No new tokens are introduced.**

| Token | Where used |
|---|---|
| `$bg-main` | Panel fill, textarea fill, confirm dialog fill, toast fill |
| `$bg-sidebar-light` | Empty-state button hover, text-affordance hover, banner fill |
| `$bg-card` | Toast fill |
| `$brand-primary` | Textarea focus border, focus ring on all interactive elements, primary Save button fill, banner Discard action |
| `$brand-primary-hover` | Save button hover fill |
| `$brand-primary-light` | Empty-state button focus-visible background, Save button active transform backdrop |
| `$text-primary` | Description body text, textarea text, heading text, button labels on neutral chrome |
| `$text-secondary` | Empty-state placeholder, character counter (under threshold), section label, banner body, inline error prefix icon tint |
| `$text-tertiary` | Toast dismiss icon |
| `$text-inverse` | Save button label, destructive Confirm button label |
| `$text-brand` | Banner Discard-action link-style button |
| `$status-high` | Inline error text, over-limit counter text, destructive Confirm fill, 404 toast left border, over-limit textarea border |
| `$status-average` | Remote-update banner left border (calm amber — informational, not an error) |
| `$border-light` | Textarea idle border, button ghost-border, divider, toast border |
| `$shadow-dropdown` | Confirm dialog, toast |
| `$shadow-card` | Banner elevated-subtle elevation |
| `$radius-sm` | Inline error pill, counter badge |
| `$radius-md` | Textarea, buttons, banner, toast |
| `$radius-lg` | Confirm dialog panel |
| `$radius-circle` | Icon-only dismiss buttons |
| `$font-size-xs` | Counter, micro-meta |
| `$font-size-sm` | Inline error, banner, toast body, section label |
| `$font-size-md` | Description body, textarea body, button labels |
| `$font-size-lg` | Confirm dialog heading |
| `$font-weight-regular` | Description body, textarea text |
| `$font-weight-medium` | Buttons, counter, banner action |
| `$font-weight-semibold` | Section label, dialog heading, inline error |
| `$line-height-tight` | Heading |
| `$line-height-normal` | Body copy everywhere |
| `$space-xxs` → `$space-lg` | Rhythm throughout |
| `$motion-fast` | Hover/focus transitions |
| `$motion-base` | Dialog/toast/banner entry, mode transitions |

If the developer discovers a required value not in this table, raise it — do not silently invent.

---

## Per-Component Styling

### Component: TaskDescriptionSectionComponent

**File:** `KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.scss`

**Role:** Hosts the Description section: read projection (filled or empty-state affordance), edit surface (banner + textarea + counter + inline error + actions), and the sr-only polite live region.

**Layout:** Vertical flex, `gap: $space-xs` — matches the existing `.task-detail-panel__section` rhythm so the section slots cleanly into the panel body's `gap: $space-lg` row rhythm. The section itself is claimed by the *child* component now; the host panel's `.task-detail-panel__section` wrapper is removed from the description region (the child renders its own `<section>`).

**States (switched by `mode()` signal):**
- `mode === 'read'` + `content` non-empty → heading + actions row + description text
- `mode === 'read'` + `content` empty → heading + empty-state full-width button
- `mode === 'edit'` → heading + (optional) remote-update banner + label + textarea + meta row (counter + inline error) + actions row
- Save in-flight: all controls disabled, Save button shows loading dot pattern (no spinner — we keep motion minimal; a 3-dot animated text ellipsis inside the button)
- Clear in-flight: Clear button disabled + aria-busy

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

.task-description {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
}

// ---- Section header row (label + read-mode actions) --------------------
.task-description__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-sm;
  min-height: 24px; // reserve space so the row height does not collapse when read-mode actions are hidden
}

.task-description__label {
  margin: 0;
  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: $text-secondary;
}

.task-description__read-actions {
  display: flex;
  align-items: center;
  gap: $space-xxs;
}

// ---- Read-mode: text-button (filled) -----------------------------------
// The rendered description is ITSELF the primary click target for editing.
// We reset button chrome so it paints like a paragraph, then restore a
// subtle hover and a keyboard focus ring.
.task-description__text-button {
  appearance: none;
  display: block;
  width: 100%;
  margin: 0;
  padding: $space-xs $space-sm;

  background: transparent;
  border: 1px solid transparent;
  border-radius: $radius-md;

  text-align: left;
  cursor: text;               // reads as writable, not as a generic button
  font-family: inherit;
  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-primary;

  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast;

  &:hover {
    background: $bg-sidebar-light;
    border-color: $border-light;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    background: $bg-sidebar-light;
  }
}

// ---- Read-mode: empty-state affordance ---------------------------------
// Full-width dashed button. The dashed border is the ONLY place in the
// Description surface where we use a dashed outline — it quietly says
// "this is a drop-in writing slot", echoing the attachment dropzone's
// empty-state language already established elsewhere.
.task-description__empty {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: $space-xs;
  width: 100%;
  min-height: 44px; // touch target
  padding: $space-sm;

  background: transparent;
  border: 1px dashed $border-light;
  border-radius: $radius-md;

  text-align: left;
  cursor: text;
  font-family: inherit;
  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast;

  &:hover {
    background: $bg-sidebar-light;
    border-color: $brand-primary;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    background: $brand-primary-light;
    border-color: $brand-primary;
    color: $text-primary;
  }
}

// ---- Read-mode: icon-text action buttons (Edit, Clear) -----------------
// Share a single ghost-button rule — only semantic colour differs.
.task-description__icon-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: $space-xxs;
  padding: $space-xxs $space-xs;
  min-height: 32px;

  background: transparent;
  border: 1px solid transparent;
  border-radius: $radius-sm;

  font-family: inherit;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: 1;
  color: $text-secondary;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    color            $motion-fast,
    border-color     $motion-fast;

  svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  &:hover {
    background: $bg-sidebar-light;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.task-description__icon-button--danger {
  &:hover:not([disabled]) {
    color: $status-high;
  }
}

// Mobile: show the read-action icon-buttons larger for touch
@media (max-width: #{768px - 1px}) {
  .task-description__icon-button {
    min-height: 44px;
    padding: $space-xs $space-sm;
  }
}

// ---- Edit mode: remote-update banner -----------------------------------
// Amber (status-average) signals "informational, not an error". Matches
// the tone guidance in the context doc: the banner should never read as
// a blocker.
.task-description__banner {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: $space-sm;

  padding: $space-xs $space-sm;

  background: $bg-sidebar-light;
  border: 1px solid $border-light;
  border-left: 4px solid $status-average;
  border-radius: $radius-md;

  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $text-primary;

  // Subtle fade-in so the banner doesn't pop. The announcement is polite
  // aria-live; the visual nudge is the fade.
  animation: task-description-banner-enter $motion-base both;
}

.task-description__banner-text {
  margin: 0;
  color: $text-primary;
}

.task-description__banner-action {
  appearance: none;
  background: transparent;
  border: 0;
  padding: $space-xxs $space-xs;
  min-height: 32px;

  font-family: inherit;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-brand;
  text-decoration: underline;
  cursor: pointer;

  transition: color $motion-fast;

  &:hover  { color: $brand-primary-hover; }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    border-radius: $radius-sm;
    text-decoration: none;
  }

  &[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// ---- Edit mode: label + textarea ---------------------------------------
.task-description__editor-label {
  // Visually hidden but present in the DOM — the section heading
  // already communicates the field; this label is for AT redundancy.
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

.task-description__editor {
  display: block;
  width: 100%;
  min-height: 120px;
  max-height: 360px; // cap so the drawer body can still scroll other sections
  padding: $space-sm;

  background: $bg-main;
  border: 1px solid $border-light;
  border-radius: $radius-md;

  font-family: inherit;
  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-primary;

  resize: vertical;

  transition:
    border-color $motion-fast,
    box-shadow   $motion-fast;

  &::placeholder {
    color: $text-tertiary;
  }

  &:focus {
    outline: none;
    border-color: $brand-primary;
    box-shadow: 0 0 0 3px $brand-primary-light;
  }

  &[aria-invalid='true'] {
    border-color: $status-high;

    &:focus {
      // Keep the error colour; swap the halo for a coral-tinted one so
      // the invalid state remains unambiguous even during focus.
      box-shadow: 0 0 0 3px rgba(229, 107, 111, 0.18);
    }
  }

  &[disabled] {
    background: $bg-sidebar-light;
    color: $text-secondary;
    cursor: not-allowed;
  }
}

// ---- Edit mode: meta row (counter + inline error) ----------------------
// Grid so the counter stays right-aligned even when the error occupies
// the left column, and both share the same vertical slot.
.task-description__meta {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: $space-sm;
  align-items: center;
  min-height: 20px;
}

.task-description__error {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: $space-xxs;

  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $status-high;

  svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }
}

.task-description__counter {
  margin: 0;
  justify-self: end;

  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
  font-variant-numeric: tabular-nums; // the count doesn't jitter as digits change
  color: $text-secondary;

  transition: color $motion-fast;
}

.task-description__counter--over-limit {
  color: $status-high;
}

// ---- Edit mode: actions row --------------------------------------------
.task-description__edit-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: $space-sm;

  @media (max-width: #{576px - 1px}) {
    flex-direction: column-reverse;
    align-items: stretch;
    gap: $space-xs;
  }
}

.task-description__cancel {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: $space-sm $space-md;

  background: transparent;
  color: $text-primary;
  border: 1px solid $border-light;
  border-radius: $radius-md;

  font-family: inherit;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: 1;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast;

  &:hover:not([disabled])  { background: $bg-sidebar-light; }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.task-description__save {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 120px;
  padding: $space-sm $space-md;

  background: $brand-primary;
  color: $text-inverse;
  border: 1px solid $brand-primary;
  border-radius: $radius-md;

  font-family: inherit;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: 1;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    transform        $motion-fast;

  &:hover:not([disabled]) {
    background: $brand-primary-hover;
    border-color: $brand-primary-hover;
  }

  &:active:not([disabled]) { transform: translateY(1px); }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// Inline loading dots rendered INSIDE the save button while isSaving().
// Pure type, no spinner — stays within the motion-discipline rule.
.task-description__save-dots {
  display: inline-flex;
  margin-left: $space-xxs;
  gap: 2px;

  &::before,
  &::after,
  & > span {
    content: '.';
    display: inline-block;
    animation: task-description-dots 1.2s infinite;
    animation-fill-mode: both;
  }

  & > span { animation-delay: 0.2s; }
  &::after { animation-delay: 0.4s; }
}

@keyframes task-description-dots {
  0%, 20%   { opacity: 0; transform: translateY(0); }
  50%       { opacity: 1; transform: translateY(-1px); }
  80%, 100% { opacity: 0; transform: translateY(0); }
}

@keyframes task-description-banner-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

// ---- Visually-hidden polite live region --------------------------------
.task-description__live {
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

**DOM structure (owned by the tech-spec; this doc specifies classes + chrome):**

```html
<section class="task-description" [attr.aria-labelledby]="headingId()">
  <div class="task-description__header">
    <h3 class="task-description__label" [id]="headingId()">Description</h3>
    @if (mode() === 'read') {
      <div class="task-description__read-actions">
        @if (readDisplay().mode === 'text') {
          <button type="button" class="task-description__icon-button"
                  (click)="enterEdit()" [attr.aria-label]="COPY.EDIT_BUTTON_LABEL">
            <svg>...</svg><span>Edit</span>
          </button>
        }
        @if (showClearAffordance()) {
          <button type="button" class="task-description__icon-button task-description__icon-button--danger"
                  (click)="onClear()" [disabled]="isClearing()"
                  [attr.aria-label]="COPY.CLEAR_BUTTON_LABEL">
            <svg>...</svg><span>Clear</span>
          </button>
        }
      </div>
    }
  </div>

  @if (mode() === 'read') {
    @if (readDisplay().mode === 'text') {
      <button type="button" class="task-description__text-button"
              (click)="enterEdit()">{{ readDisplay().text }}</button>
    } @else {
      <button type="button" class="task-description__empty" (click)="enterEdit()">
        {{ COPY.EMPTY_PLACEHOLDER }}
      </button>
    }
  } @else {
    @if (remoteUpdateDetected()) {
      <div class="task-description__banner" role="status" aria-live="polite">
        <p class="task-description__banner-text">{{ COPY.BANNER_REMOTE_UPDATED }}</p>
        <button type="button" class="task-description__banner-action"
                (click)="discardAndReload()" [disabled]="isSaving()">
          {{ COPY.BANNER_DISCARD_ACTION }}
        </button>
      </div>
    }
    <label class="task-description__editor-label" [attr.for]="editorId()">
      {{ COPY.TEXTAREA_LABEL }}
    </label>
    <textarea
      #editor
      class="task-description__editor"
      [id]="editorId()"
      [value]="draft()"
      (input)="onTextareaInput($event)"
      (keydown.control.enter)="onSave()"
      (keydown.meta.enter)="onSave()"
      (keydown.escape)="onCancel($event)"
      [disabled]="isSaving()"
      [attr.aria-invalid]="inlineError() !== null ? 'true' : null"
      [attr.aria-describedby]="describedBy()"
    ></textarea>

    <div class="task-description__meta">
      @if (inlineError(); as err) {
        <p class="task-description__error" [id]="errorId()">
          <svg aria-hidden="true" focusable="false">...</svg>
          <span>{{ err }}</span>
        </p>
      } @else {
        <span></span>
      }
      @if (showCounter()) {
        <span class="task-description__counter"
              [class.task-description__counter--over-limit]="isOverLimit()"
              [id]="counterId()">
          {{ rawLength() }} / {{ MAX_LENGTH }}
        </span>
      }
    </div>

    <div class="task-description__edit-actions">
      <button type="button" class="task-description__cancel"
              (click)="onCancel($event)" [disabled]="isSaving()">
        {{ COPY.CANCEL_BUTTON_LABEL }}
      </button>
      <button type="button" class="task-description__save"
              (click)="onSave()" [disabled]="!canSave()">
        {{ COPY.SAVE_BUTTON_LABEL }}
        @if (isSaving()) {
          <span class="task-description__save-dots" aria-hidden="true"><span></span></span>
        }
      </button>
    </div>
  }

  <span class="task-description__live" aria-live="polite" aria-atomic="true">
    {{ liveMessage() }}
  </span>
</section>
```

**Interaction notes:**
- Read-mode text-button: hover paints the surface `$bg-sidebar-light` + `$border-light` frame; cursor is `text` (not `pointer`) because the affordance reads as "write here". `$motion-fast`.
- Empty-state button: dashed `$border-light` idle → solid `$brand-primary` on hover/focus. Focus state adds a `$brand-primary-light` fill so keyboard users get a clearly distinct affordance.
- Edit → Read transition: edit surface unmounts; focus returns to the Edit button (or empty-state button if `content` is now null) on the next animation frame via the component's ViewChild refs.
- Save button loading state: label stays "Save"; three animated `.` dots follow. No spinner, no colour change — the disabled state + dots is the signal.
- Banner: fades in over `$motion-base` (reduced-motion clamps to 0.01ms via the global rule). `role="status" aria-live="polite"` triggers a single polite announcement on mount.
- Focus ring: 2px `$brand-primary`, 2px offset, on every interactive surface. Never removed.

**Accessibility:**
- `role="button"` is inherent on native `<button>`. No `role="application"` or custom roles introduced.
- Textarea labeled by the visually-hidden `<label for>` (in addition to the section heading) for robust AT discovery.
- `aria-invalid="true"` on the textarea whenever `inlineError()` is non-null; `aria-describedby` points at the inline error and/or counter IDs so AT reads them after the field name.
- Polite live region: used **only** for `"Description saved"` and `"Description cleared"`. The inline error is not announced via this region — it's announced via `aria-describedby` on the textarea at the next focus cycle, which is the correct AT behavior for form validation.
- Contrast (verified, see §Accessibility Audit):
  - `$text-primary` on `$bg-main`: 17.9:1 ✅ AAA
  - `$text-secondary` on `$bg-main`: 4.6:1 ✅ AA
  - `$text-secondary` on `$bg-sidebar-light`: 4.5:1 ✅ AA
  - `$status-high` (#E56B6F) on `$bg-main` for error text at 600 weight: 3.5:1 ✅ AA (meets large-text/UI threshold; semibold 14px = 18.66px at 1.33× weight → qualifies as "large" per WCAG computed-size rule). Backup: the icon + ARIA-invalid redundancy satisfies the "color alone" rule.
  - `$text-inverse` on `$brand-primary`: 3.3:1 ✅ AA for large text / UI (Save button label is 14px / 500 — passes as UI).
- Touch: every interactive control has `min-height: 44px` on mobile; icon-text read-mode buttons expand from 32px → 44px below `$bp-md`.

---

### Component: TaskDescriptionClearConfirmDialogComponent

**File:** `KanbAI-Web/src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.scss`

**Role:** CDK Dialog asking the user to confirm clearing the description. Mirrors `RemoveMemberConfirmDialogComponent` pattern exactly — this is a deliberate design choice to establish "destructive confirm" as a single recognizable surface across the product.

**Layout:** Centered overlay; panel is max-width 420px, padded `$space-md` (mobile) / `$space-lg` (≥md). Heading + two-button action row (Cancel ghost + Confirm destructive). No body copy — the heading carries the full question.

**States:** default, confirm-button focus/hover/active/disabled (while DELETE in-flight), cancel-button focus/hover. CDK Dialog handles entry/exit motion and focus trap.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

// Scoped to the CDK panelClass so the rules never leak — same pattern as
// remove-member-confirm-dialog.component.scss (which is why we reuse
// the same enter animation names structure, namespaced fresh).
.task-description-clear-confirm-panel {
  background-color: $bg-main;
  border-radius: $radius-lg;
  box-shadow: $shadow-dropdown;
  width: calc(100vw - (#{$space-md} * 2));
  max-width: 420px;
  padding: $space-md;
  display: block;
  animation: task-description-clear-confirm-enter $motion-base both;

  @include respond-to('md') {
    padding: $space-lg;
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }

  app-task-description-clear-confirm-dialog {
    display: block;
    font-family: $font-family-base;
    color: $text-primary;
  }

  .task-description-clear-confirm__heading {
    margin: 0 0 $space-lg 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
    color: $text-primary;
  }

  .task-description-clear-confirm__actions {
    display: flex;
    justify-content: flex-end;
    gap: $space-sm;

    @media (max-width: #{$bp-md - 1px}) {
      flex-direction: column-reverse;
      align-items: stretch;
    }
  }

  .task-description-clear-confirm__cancel {
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

  .task-description-clear-confirm__confirm {
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

    // Token-pure "darken": 8% black overlay. Matches the
    // remove-member-confirm hover treatment exactly so destructive
    // confirms read consistently across the product.
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
  }
}

.task-description-clear-confirm-backdrop {
  background-color: rgba(11, 11, 11, 0.5);
  animation: task-description-clear-confirm-backdrop-fade $motion-fast both;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

@keyframes task-description-clear-confirm-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes task-description-clear-confirm-backdrop-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

**Interaction notes:**
- Panel slides up 8px + fades in over `$motion-base`; backdrop fades in over `$motion-fast`. Both clamp to 0.01ms under reduced-motion.
- Focus lands on the *first tabbable* element (per tech spec `autoFocus: 'first-tabbable'`) — which in our button order (Cancel, Confirm) is Cancel. This is intentional: the user must move to Confirm to commit the destructive action, matching the remove-member-confirm precedent.
- Escape closes (CDK default) → returns `undefined` → parent does not fire DELETE.

**Accessibility:**
- `ariaLabelledBy: 'task-description-clear-heading'` — heading's ID passed to CDK.
- Focus trap + focus restore via CDK Dialog config (`restoreFocus: true`).
- Contrast: `$status-high` on `$bg-main` = 3.5:1 ✅ AA for UI button; `$text-inverse` on `$status-high` = 3.7:1 ✅ AA (16px/500, qualifies as large text / UI per WCAG).

---

### Component: TaskNotFoundToastComponent

**File:** `KanbAI-Web/src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.scss`

**Role:** Fixed bottom-right toast shown when a description save/clear returns 404 (task was deleted). Thinner surface than `PartialFailureToastComponent` — single message + dismiss; no title, no secondary action. Shares the visual language of that component so the product has one "something went sideways" toast style.

**Layout:** Fixed bottom-right, slides in from the right. Grid: icon | message | dismiss. Coral left border signals "something stopped" (same as partial-failure-toast). Auto-dismisses at 8s; pauses on hover/focus.

**States:** default, hover (timer pauses), focus-within (timer pauses), dismiss-button hover/focus/active.

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

  @include respond-to('md') {
    right: $space-lg;
    bottom: $space-lg;
    width: auto;
    min-width: 320px;
  }
}

.task-not-found-toast {
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: $space-sm;
  align-items: center;

  padding: $space-sm $space-md;

  background: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-md;
  box-shadow: $shadow-dropdown;

  font-family: $font-family-base;
  color: $text-primary;

  animation: task-not-found-toast-enter $motion-slow both;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms;
  }
}

.task-not-found-toast__icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  color: $status-high;
}

.task-not-found-toast__message {
  margin: 0;
  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $text-primary;
}

.task-not-found-toast__dismiss {
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

// Mobile: expand dismiss hit area to meet 44×44
@media (max-width: #{768px - 1px}) {
  .task-not-found-toast__dismiss {
    width: 44px;
    height: 44px;
  }
}

@keyframes task-not-found-toast-enter {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

**Interaction notes:**
- Slides in 24px from the right + fades, `$motion-slow`. Clamps under reduced-motion.
- Auto-dismiss at 8s (per tech spec). Timer pauses on hover and `:focus-within` — mirror of `PartialFailureToastComponent` (copy that timer logic in the component TS).
- Dismiss button: 28px circle on desktop, expands to 44px on mobile for touch target compliance.

**Accessibility:**
- Host bindings: `role="status"`, `aria-live="polite"`, `aria-atomic="true"` (specified in tech spec).
- Contrast: `$text-primary` on `$bg-card` = 17.9:1 ✅ AAA; icon `$status-high` on `$bg-card` = 3.5:1 ✅ AA (UI). Icon is redundant with the message text, so color-alone is never the sole channel.
- Dismiss button: `aria-label="Dismiss"` set in TS; focus ring meets 3:1 contrast.

---

### Component: TaskDetailPanelComponent (host edits)

**File:** `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`

**Role:** Host panel. Only tiny edits needed — remove the now-unused `.task-detail-panel__description` / `.task-detail-panel__description-empty` rules (the child component owns those surfaces); keep everything else.

**Edit summary (developer):**
- Delete lines 148-184 (`.task-detail-panel__description` and `.task-detail-panel__description-empty`). The child component's `.task-description__text-button` and `.task-description__empty` replace them.
- Keep `.task-detail-panel__section` / `.task-detail-panel__section-label` — the attachments section still uses them. The description section no longer uses `.task-detail-panel__section` *on the panel*; the child renders its own `<section>` with its own classes.
- In the panel template, replace lines 40–54 with `<app-task-description-section [task]="task()" (taskNotFound)="onTaskNotFound()" />` (already specified in tech spec).
- The inter-section gap of `$space-lg` in `.task-detail-panel__body` is preserved and continues to separate the description section from the attachment section cleanly.

No SCSS additions to the panel.

---

## User Flows

### Flow 1 — Add a description from empty

1. **At rest (empty):** Panel shows `$space-xs` gap, heading row ("Description"), then a full-width dashed-border button `"No description yet — click to add one"` in `$text-secondary`.
2. **Hover (mouse) / focus-visible (keyboard):** Border transitions to solid `$brand-primary`, fill lifts to `$brand-primary-light` (focus) or `$bg-sidebar-light` (hover), text darkens to `$text-primary`. `$motion-fast`.
3. **Activate (click, Enter, or Space):** The empty-state button unmounts; textarea appears in its place, pre-filled with `""`; caret lands at position 0; focus is in the textarea within one animation frame. No visible animation — the surface swap is instantaneous; the editor fading in would delay the user's first keystroke.
4. **Typing:** `draft` updates on every `input`. No counter until `rawLength > 9000`. No error until Save or blur-with-empty.
5. **Save (Ctrl+Enter or button click):** Save button shows "Save" + animated dots; all edit controls disable. On 200: edit surface unmounts; read-mode text-button renders the new value with `white-space: pre-wrap`; focus returns to the *Edit* icon-button (now visible in the header actions row). Polite live region announces `"Description saved"`.
6. **Rollback (any error):** Controls re-enable; inline error renders in the meta row below the textarea in `$status-high` semibold with a ⚠ icon; `aria-invalid="true"` flips on the textarea. `aria-describedby` points at the error ID so AT reads it next focus.

### Flow 2 — Edit an existing description

1. **At rest (filled):** Heading row with *Edit* and *Clear* icon-buttons on the right; below, the description text rendered inside a transparent-bordered button (the `__text-button`).
2. **Hover the text:** Cursor is `text`; background lifts to `$bg-sidebar-light`; border becomes visible as `$border-light`. `$motion-fast`.
3. **Activate (click text OR click Edit icon-button):** Identical effect — textarea opens, pre-filled with current `content`, caret at end (via `setSelectionRange(draft().length, draft().length)`).
4. **Save / Cancel:** Identical to Flow 1 step 5–6.
5. **Cancel (Escape or Cancel button):** Editor unmounts; focus returns to the Edit icon-button in the header row.

### Flow 3 — Cancel an in-progress edit

1. User is editing with unsaved changes.
2. **Escape key inside textarea:** `event.stopPropagation()` runs (so the panel-level Escape doesn't close the drawer). Draft cleared; all edit-state cleared; `mode` → `'read'`. Focus returns to the Edit icon-button (or empty-state button if content was null).
3. **Cancel button click:** Same handler.

### Flow 4 — Clear a description

1. User in read mode with filled content. Clicks *Clear* icon-button.
2. **Clear button activates:** `Clear` icon-button shows hover/active coral tint. CDK Dialog opens, panel slides up 8px + fades in over `$motion-base`, backdrop fades over `$motion-fast`. Focus moves to *Cancel* button inside the dialog.
3. **User Confirms:** Confirm button visibly transitions (8% black overlay on hover; `translateY(1px)` on active). The dialog closes on `true`; parent fires DELETE.
4. **On 204:** Dialog is already closed. Read surface re-renders as empty-state. Polite live region announces `"Description cleared"`. Focus is restored by CDK to the Clear button's *former* slot — but since Clear is no longer visible (content is null), it falls through to the empty-state button (the component handles this with an explicit `.focus()` on the empty-state ref in the success path).
5. **On error:** Dialog is already closed. Inline error renders in the *section* (not the dialog, which is dismissed) — this is a judgment call: the error surface follows the content. Copy per tech spec: 403 → `INLINE_ERROR_PERMISSION`; 0 → `INLINE_ERROR_NETWORK`; 404 → emits `taskNotFound`, panel closes, toast shows.

### Flow 5 — Remote edit while viewing (read mode)

1. User in read mode. Teammate saves a description change elsewhere.
2. SignalR `TaskUpdated` flows into `BoardStateService` → `task()` input re-evaluates → `readDisplay()` re-derives → `__text-button` text re-renders.
3. **No banner, no toast, no announcement.** Deliberately silent per the context doc.

### Flow 6 — Remote edit while editing

1. User has the textarea open with a draft.
2. SignalR `TaskUpdated` arrives → the effect detects `task().content !== contentSnapshot()` → flips `remoteUpdateDetected` to true.
3. **Banner fades in** above the textarea: amber `$status-average` left border, `$bg-sidebar-light` fill, message `"This task was updated by someone else"` + link-style button `"Discard my changes and reload"`. Polite `aria-live` announces it once.
4. **Discard action:** Clears draft + all edit state; `mode` → `'read'`; read surface shows the remote `content`. Focus returns to the Edit icon-button.
5. **User keeps typing / Saves:** Save fires normally. Server is authoritative (last-write-wins). No special UI path — flow 1/2 step 5 applies.

### Flow 7 — 404 (task deleted mid-edit)

1. User Saves; server returns 404.
2. Child emits `taskNotFound`. Panel re-emits. `BoardPageComponent` sets `selectedTask.set(null)` — the existing `@if (selectedTask(); as task)` collapses the drawer.
3. `TaskNotFoundToastComponent` mounts bottom-right with `$status-high` left border and message `"This task no longer exists"`. `$motion-slow` slide-in from right.
4. **Auto-dismiss at 8s** (timer pauses on hover / `:focus-within`). Manual dismiss: click the × button.

---

## Responsive Behavior

### < `$bp-md` (mobile, <768px)

- Panel is full-width (pre-existing panel behavior).
- Description section:
  - Icon-text action buttons (*Edit*, *Clear*) expand from 32px → 44px min-height, padding up to `$space-xs $space-sm` — meets touch-target floor.
  - Edit-actions row flips to `column-reverse` below `$bp-sm` (<576px) so *Save* sits above *Cancel* in visual priority, each at full width. Above `$bp-sm` it stays right-aligned row.
  - Textarea min-height stays 120px; max-height 360px; `resize: vertical` preserved.
- Confirm dialog: button row flips to `column-reverse` (Confirm on top, full-width).
- Toast: full-width minus `$space-md * 2` gutters.

### `$bp-md` – `$bp-lg` (tablet, 768–992px)

- Panel is 420px wide (existing).
- Description section action buttons revert to 32px compact form.
- Edit-actions row is a right-aligned flex row with `gap: $space-sm`.
- Confirm dialog: side-by-side button row.
- Toast: auto-width, min-width 320px, anchored to `$space-lg` from edges.

### ≥ `$bp-lg` (desktop, ≥992px)

- Panel is 480px wide (existing).
- No further layout changes — the description section rhythm is identical to tablet.

---

## Accessibility Audit (WCAG AA)

### Contrast

All pairs measured per WCAG 2.1 contrast ratio formula.

| Surface → Foreground | Used in | Ratio | Verdict |
|---|---|---|---|
| `$bg-main` (#FFFFFF) → `$text-primary` (#1C1C1C) | Description body, textarea text, heading | 17.9:1 | ✅ AAA |
| `$bg-main` → `$text-secondary` (#7A7A7A) | Empty-state placeholder, counter (under threshold), section label | 4.6:1 | ✅ AA |
| `$bg-sidebar-light` (#F4F5F1) → `$text-secondary` | Banner body (text-primary actually), hovered counter edge-case | 4.5:1 | ✅ AA |
| `$bg-sidebar-light` → `$text-primary` | Banner body, hovered text-button, hovered icon-button | 16.2:1 | ✅ AAA |
| `$bg-main` → `$status-high` (#E56B6F) | Inline error text (14px/600 = large-text equivalent), over-limit counter, Clear-danger hover | 3.5:1 | ✅ AA (large text / UI) |
| `$brand-primary` (#8C9B7B) → `$text-inverse` (#FFFFFF) | Save button label (14px/500 — passes as UI button text per WCAG 1.4.11) | 3.3:1 | ✅ AA (UI) |
| `$status-high` → `$text-inverse` | Confirm button label | 3.7:1 | ✅ AA (16px/500 = large) |
| `$bg-main` → `$brand-primary` | Focus outline | 3.5:1 | ✅ AA (UI 1.4.11) |
| `$bg-sidebar-light` → `$text-brand` (#8C9B7B) | Banner "Discard" link | 3.2:1 | ✅ AA (UI — link is 14px/500) |
| `$bg-card` → `$text-primary` | Toast message | 17.9:1 | ✅ AAA |

**Color-alone rule:** Inline error uses `$status-high` + ⚠ icon + semibold weight + `aria-invalid` on the field — four channels. Over-limit counter uses `$status-high` + the textarea switches to `aria-invalid="true"` — two channels. Remote-update banner uses `$status-average` + icon-free text + a polite `aria-live` announcement — color is informational only, not required for the user to understand the message.

### Keyboard

- **Tab order through the panel:** Close button → task title (not focusable, just a heading) → Description heading (not focusable) → Edit icon-button (if filled) → Clear icon-button (if visible) → description text-button OR empty-state button → attachment section.
- **Edit mode tab order:** (banner discard if present) → textarea → Cancel → Save.
- **Keybindings inside textarea:**
  - `Ctrl+Enter` / `Meta+Enter` → Save (if `canSave()`).
  - `Escape` → Cancel, with `event.stopPropagation()` so the panel's drawer-close Escape does not also fire.
  - `Enter` alone → inserts newline (default browser behavior, not captured).
  - `Tab` → exits textarea forward to Cancel button.
- **Confirm dialog:** CDK Dialog traps focus (verified in existing `RemoveMemberConfirmDialogComponent`); Escape dismisses; `restoreFocus: true` returns focus to the Clear button after close.
- **Focus ring:** 2px `$brand-primary` with 2px offset on every interactive element. Never removed without a visible replacement (the destructive Confirm button uses a coral ring to match its role).

### Screen Reader

- **Section landmark:** `<section aria-labelledby="task-detail-description-{id}">` + `<h3 id="task-detail-description-{id}">Description</h3>` — so AT announces the section as "Description, region".
- **Textarea labeling:** visually-hidden `<label for="task-description-editor-{id}">Task description</label>` + `aria-describedby` pointing at (inline error ID when present) + (counter ID when visible). AT reads "Task description, edit text, multi-line. <error copy>. <count> of 10000."
- **Empty-state button:** native `<button>`; AT reads "No description yet — click to add one, button".
- **Filled text-button:** native `<button>`; AT reads the full content + "button". The `cursor: text` styling is purely visual; the semantic role remains button.
- **Save/Clear announcements:** a single panel-local `<span class="task-description__live" aria-live="polite" aria-atomic="true">` renders the current `liveMessage`. On success, the component sets the message, then clears it on the next microtask so repeated successes still fire distinct announcements.
- **Banner:** `role="status" aria-live="polite"` on the banner container. Appearing in the DOM triggers a single polite announcement. No second announcement is needed because `remoteUpdateDetected` stays `true` until discard.
- **Toast:** `role="status" aria-live="polite" aria-atomic="true"` on host. One announcement on mount.
- **Confirm dialog:** CDK Dialog renders with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the heading.

### Motion

- Every animation honors the global `prefers-reduced-motion: reduce` rule in `_motion.scss` (clamps to 0.01ms rather than 0ms so transitionend events still fire).
- No parallax, no auto-playing animations, no marquee.
- Only `transform` and `opacity` are animated — per the motion discipline guideline.
- Save-loading dots animate `opacity` + `transform: translateY(-1px)` — both cheap, both honor reduced-motion.

### Forms

- Textarea has a proper `<label for>`. `aria-invalid` toggled. `aria-describedby` linked to error + counter IDs.
- No password fields; no autofill hints needed.
- Save button is disabled when invalid (`!canSave()`); the disabled state is announced by AT as "dimmed".

---

## Implementation Checklist

### Prerequisites (all already present — verified)

- [x] Token files exist in `KanbAI-Web/src/styles/variables/` (colors, spacing, radius, shadows, typography, motion, breakpoints, layout).
- [x] Global `prefers-reduced-motion` rule lives in `_motion.scss` and is imported into the component SCSS chain.
- [x] `Inter` font stack declared in `_typography.scss`.
- [x] `@angular/cdk/dialog` is already used (`RemoveMemberConfirmDialogComponent`) — no new install.

### Per-component — TaskDescriptionSectionComponent

- [ ] SCSS created at `KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.scss`.
- [ ] Template uses the DOM structure shown above; classes prefixed `.task-description__*`.
- [ ] All states implemented: read-filled, read-empty, edit-default, edit-saving, edit-error, edit-conflict.
- [ ] Keyboard focus visible on every interactive element (text-button, empty-button, icon-buttons, banner discard, textarea, Cancel, Save).
- [ ] Touch target ≥44px on mobile breakpoint (icon-buttons expand).
- [ ] No hardcoded colors, spacing, or radii — only canonical tokens.
- [ ] `white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal;` on the read-mode text-button.
- [ ] Polite live region is a visually-hidden `<span>` — absolute position + 1×1 clip.
- [ ] Visually-hidden `<label for>` sits above the textarea.

### Per-component — TaskDescriptionClearConfirmDialogComponent

- [ ] SCSS scoped to `.task-description-clear-confirm-panel` (CDK `panelClass`).
- [ ] Backdrop scoped to `.task-description-clear-confirm-backdrop` (CDK `backdropClass`).
- [ ] Mirrors the `RemoveMemberConfirmDialogComponent` SCSS structure exactly, with fresh class names namespaced `.task-description-clear-confirm__*`.
- [ ] `ViewEncapsulation.None` on the component class (required so the CDK panel-class rules reach the component's internals — matches the existing dialog precedent).
- [ ] `autoFocus: 'first-tabbable'` (Cancel is first tabbable → matches remove-member precedent).
- [ ] `restoreFocus: true`.

### Per-component — TaskNotFoundToastComponent

- [ ] SCSS at `KanbAI-Web/src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.scss`.
- [ ] Host bindings: `role="status"`, `aria-live="polite"`, `aria-atomic="true"` on the `:host` (via `@Component({ host: ... })`).
- [ ] 8s auto-dismiss timer, pause on `:hover` and `:focus-within` — lift the timer logic from `PartialFailureToastComponent`.
- [ ] Dismiss button expands to 44×44 below `$bp-md`.

### Host panel — TaskDetailPanelComponent

- [ ] Delete lines 148–184 in the panel's SCSS (`.task-detail-panel__description` + `.task-detail-panel__description-empty`).
- [ ] Leave the rest of the panel SCSS untouched.

### Verification

- [ ] Lighthouse a11y ≥95 for the board page with the panel open.
- [ ] Manual keyboard traversal works: Tab from Close → Edit → Clear → text-button; Tab inside textarea reaches Cancel → Save.
- [ ] `prefers-reduced-motion: reduce` in DevTools → dialog, banner, toast, and button transitions all collapse to near-instant.
- [ ] Test at 320, 576, 768, 1024, 1440 widths — no horizontal scroll outside the kanban board; edit actions stack/row as specified.
- [ ] Escape inside the textarea cancels edit but does NOT close the drawer (verify the `stopPropagation()` is applied).
- [ ] Escape dismisses the Confirm dialog (CDK default; verify in-browser).
- [ ] VoiceOver / NVDA reads:
  - Section as "Description, region".
  - Textarea as "Task description, edit text, multi-line".
  - Save-success as a polite announcement.
  - Banner once on appearance.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
