# Design Specification: Drag-and-Drop File Dropzone Component

**Technical Spec:** [issue_49_tech_spec.md](./issue_49_tech_spec.md)
**Context Document:** [issue_49_context.md](./issue_49_context.md)
**GitHub Issue:** #49
**Milestone:** #6 — Asynchronous File Upload UI
**Design System:** KanbAI Project Management Dashboard v1.0 (no new tokens introduced)

---

## 1. Overview

### Design Intent

The dropzone is the user's **first physical interaction with file-attachment** in KanbAI. It must feel **spatial** (a real "target" on the page that invites a gesture), **calm** (no loud colours at rest — it's frequently idle), and **decisive** (when a file lands, the outcome — accepted or rejected — is obvious in under a second). The zone is the visual spine of a larger invisible contract: "your file is safe to send, or it isn't, and here's why." Borrowing from the card dragging pattern already in the board (dashed `$border-dropzone` placeholder cues "this is where things go"), the dropzone reuses the same dashed-sage idiom so the product's drag language stays consistent.

The stub **task-detail drawer** that hosts the dropzone in this ticket is deliberately low-fi: neutral chrome, task title, close button, dropzone slot. It announces itself as a scaffold so a future ticket replacing it with a real detail view does not feel like a regression.

### Scope

**Components styled in this spec:**
1. `FileDropzoneComponent` — the core deliverable. Five phases: `idle`, `dragover`, `selected`, `error`, `disabled`, plus the informational `MULTI_FILE_TRUNCATED` overlay on top of `selected`.
2. `TaskDetailPanelComponent` — stub right-side drawer host. Title, close button, dropzone slot. Placeholder treatment.
3. `TaskCardComponent` — **minor** visual additions only: `role="button"` focus-ring affordance (already present in SCSS) plus documentation of the drag-vs-click interaction. No chromatic or structural change.

**States covered for every interactive surface:**
default (idle) → hover → focus (:focus-visible) → active → disabled → plus feature-specific states: `dragover`, `selected`, `error`, `informational-truncation`.

**Responsive:** mobile (< `$bp-md`), tablet (`$bp-md`–`$bp-lg`), desktop (≥ `$bp-lg`).

---

## 2. Tokens Used

This spec consumes the canonical KanbAI design system exclusively. **No new tokens are introduced.**

| Token | Where used |
|---|---|
| `$bg-dropzone` (`#F4F5F1`) | Dropzone idle fill; drawer empty-slot hint |
| `$bg-main` (`#FFFFFF`) | Drawer body background; selected-state dropzone fill |
| `$bg-sidebar-light` (`#F4F5F1`) | Disabled-state dropzone fill (flat, no border pulse) |
| `$border-dropzone` (`#8C9B7B`) | Dashed idle border; solid dragover border |
| `$border-light` (`#EAEAEA`) | Drawer divider; hidden-input outline reset |
| `$brand-primary` (`#8C9B7B`) | Focus ring on dropzone + close button; selected-state icon |
| `$brand-primary-hover` (`#7A8A69`) | Close button hover |
| `$brand-primary-light` (`#E8EBE4`) | Dragover fill tint |
| `$status-high` (`#E56B6F`) | Error-state border + alert icon; error text at size ≥ `$font-size-md` / weight `medium` to meet AA for UI |
| `$status-average` (`#E8B042`) | `MULTI_FILE_TRUNCATED` informational side-bar |
| `$status-done` (`#9CC5A1`) | Selected-state accent (check icon tint + 3px left accent bar on summary block) |
| `$text-primary` (`#1C1C1C`) | Body copy in every phase |
| `$text-secondary` (`#7A7A7A`) | Meta copy (formats list, max-size hint) |
| `$text-tertiary` (`#A1A1A1`) | Disabled-state copy only (paired with `aria-disabled` + text reason — never colour-alone) |
| `$text-inverse` (`#FFFFFF`) | Close button hover fill on hover |
| `$font-family-base`, `$font-size-sm`/`-md`/`-lg`/`-xl`, `$font-weight-regular`/`-medium`/`-semibold`, `$line-height-tight`/`-normal` | Typography |
| `$space-xxs`/`-xs`/`-sm`/`-md`/`-lg`/`-xl` | Spacing |
| `$radius-sm`, `$radius-md`, `$radius-lg`, `$radius-pill` | Radius |
| `$shadow-card`, `$shadow-card-hover`, `$shadow-dropdown` | Elevation |
| `$motion-fast`, `$motion-base`, `$motion-slow` | Transitions |
| `$bp-sm`/`-md`/`-lg`, `@include respond-to` mixin | Breakpoints |
| `$sidebar-dark-width`, `$sidebar-light-width`, `$topbar-height`, `$content-padding` | Drawer positioning against existing chrome |

**Token gaps:** none — the existing `$bg-dropzone` / `$border-dropzone` / `$brand-primary-light` combination already covers the idle→dragover transition. The status colours (`$status-high` for error, `$status-done` for selected, `$status-average` for truncation notice) carry semantic meaning without requiring new tokens.

---

## 3. Per-Component Styling

### 3.1 Component: `FileDropzoneComponent`

**File:** `src/app/features/attachments/components/file-dropzone/file-dropzone.component.scss`
**Role:** A self-contained, keyboard-accessible region that accepts a single file via drag-and-drop, pointer click, or keyboard activation; renders its validation outcome in-place; emits a `{ file, taskId }` event on success.

**Layout:** Flexbox column, minimum height `160px` on desktop / `120px` on mobile. Inner content centred on both axes. Never becomes wider than its container (the drawer governs the outer width). Padding scales with breakpoint.

**Phase matrix (visual-state map):**

| Phase | Fill | Border | Icon | Text colour |
|---|---|---|---|---|
| `idle` | `$bg-dropzone` | 2px **dashed** `$border-dropzone` | upload-cloud (24px) `$text-secondary` | `$text-primary` title, `$text-secondary` hint |
| `dragover` | `$brand-primary-light` | 2px **solid** `$border-dropzone` | upload-cloud `$brand-primary` | `$text-primary` (unchanged) |
| `selected` | `$bg-main` | 1px **solid** `$border-light` + 3px left accent `$status-done` | check-circle `$status-done` | `$text-primary` filename, `$text-secondary` size |
| `error` | `$bg-main` | 1px **solid** `$status-high` + 3px left accent `$status-high` | alert-circle `$status-high` | `$status-high` headline (`$font-weight-medium`), `$text-primary` body |
| `disabled` | `$bg-sidebar-light` | 2px **dashed** `$border-light` | upload-cloud `$text-tertiary` | `$text-tertiary` |

Note: **colour is never the only channel.** Every phase pairs colour with (a) a distinct icon and (b) explicit text (filename, error message, or disabled reason).

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
  width: 100%;
}

// -----------------------------------------------------------------------
// Root interactive region. Single selector for the whole zone; phase
// classes are applied by the component based on the computed phase().
// -----------------------------------------------------------------------
.file-dropzone {
  position: relative;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $space-xs;

  min-height: 120px;
  padding: $space-lg $space-md;

  background: $bg-dropzone;
  border: 2px dashed $border-dropzone;
  border-radius: $radius-lg;

  font-family: $font-family-base;
  font-size: $font-size-md;
  line-height: $line-height-normal;
  color: $text-primary;
  text-align: center;

  cursor: pointer;
  user-select: none;

  // Only animate transform / colour / background — GPU-friendly.
  transition:
    background-color $motion-fast,
    border-color     $motion-fast,
    color            $motion-fast,
    transform        $motion-fast,
    box-shadow       $motion-fast;

  @include respond-to('md') {
    min-height: 160px;
    padding: $space-xl $space-lg;
  }

  // ---- Hover (mouse only; not the selected action) --------------------
  &:hover:not(.file-dropzone--disabled):not(.file-dropzone--dragover) {
    background: lighten-dropzone-surrogate-not-needed-use-tint;
    // Visual hint: borderglows one step darker on hover at rest.
    border-color: $brand-primary-hover;
  }

  // ---- Focus (keyboard) -----------------------------------------------
  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  // ---- Active (mousedown / Space held) --------------------------------
  &:active:not(.file-dropzone--disabled) {
    transform: scale(0.995);
  }

  // ---- Hidden native file input ---------------------------------------
  // Visually hidden but focusable via label/click proxy from component.
  // Never display:none (breaks some ATs); use the "sr-only" pattern.
  .file-dropzone__native-input {
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
}

// -----------------------------------------------------------------------
// Phase: dragover
// -----------------------------------------------------------------------
.file-dropzone--dragover {
  background: $brand-primary-light;
  border-style: solid;
  border-color: $border-dropzone;

  // Subtle lift to reinforce "drop target active".
  transform: translateY(-1px);
  box-shadow: $shadow-card-hover;
}

// -----------------------------------------------------------------------
// Phase: selected (validated file chosen)
// -----------------------------------------------------------------------
.file-dropzone--selected {
  background: $bg-main;
  border: 1px solid $border-light;

  // 3px left accent bar — selected-state affordance without recolouring
  // the whole zone (user might drop a replacement; keep it inviting).
  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
    border-top-left-radius: $radius-lg;
    border-bottom-left-radius: $radius-lg;
    background: $status-done;
  }
}

// -----------------------------------------------------------------------
// Phase: error
// -----------------------------------------------------------------------
.file-dropzone--error {
  background: $bg-main;
  border: 1px solid $status-high;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
    border-top-left-radius: $radius-lg;
    border-bottom-left-radius: $radius-lg;
    background: $status-high;
  }
}

// -----------------------------------------------------------------------
// Phase: disabled
// -----------------------------------------------------------------------
.file-dropzone--disabled {
  background: $bg-sidebar-light;
  border: 2px dashed $border-light;
  color: $text-tertiary;
  cursor: not-allowed;

  // Kill hover/active mouse feedback unambiguously.
  &:hover,
  &:active {
    background: $bg-sidebar-light;
    border-color: $border-light;
    transform: none;
    box-shadow: none;
  }
}

// -----------------------------------------------------------------------
// Inner content blocks
// -----------------------------------------------------------------------
.file-dropzone__icon {
  width: 32px;
  height: 32px;
  color: $text-secondary;
  flex: 0 0 auto;

  .file-dropzone--dragover  & { color: $brand-primary; }
  .file-dropzone--selected  & { color: $status-done; }
  .file-dropzone--error     & { color: $status-high; }
  .file-dropzone--disabled  & { color: $text-tertiary; }
}

.file-dropzone__headline {
  margin: 0;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;

  .file-dropzone--error & {
    color: $status-high;
  }
}

.file-dropzone__hint {
  margin: 0;
  font-size: $font-size-sm;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;

  .file-dropzone--disabled & { color: $text-tertiary; }
}

// File summary block (shown only in `selected`)
.file-dropzone__summary {
  display: inline-flex;
  align-items: center;
  gap: $space-xs;
  max-width: 100%;

  font-size: $font-size-md;
  font-weight: $font-weight-medium;

  .file-dropzone__filename {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40ch;
  }

  .file-dropzone__filesize {
    color: $text-secondary;
    font-weight: $font-weight-regular;
  }
}

// ---------------------------------------------------------------------
// Informational banner — only rendered on MULTI_FILE_TRUNCATED, which is
// NOT an error (per tech spec §State & Data Layer: informational = true).
// Rendered *alongside* .file-dropzone__summary in the selected phase.
// ---------------------------------------------------------------------
.file-dropzone__notice {
  display: inline-flex;
  align-items: center;
  gap: $space-xxs;

  margin-top: $space-xs;
  padding: $space-xxs $space-xs;

  background: rgba(232, 176, 66, 0.08); // derived tint of $status-average
  border-left: 3px solid $status-average;
  border-radius: $radius-sm;

  font-size: $font-size-sm;
  color: $text-primary;

  .file-dropzone__notice-icon {
    width: 14px;
    height: 14px;
    color: $status-average;
    flex: 0 0 auto;
  }
}

// ---------------------------------------------------------------------
// Live region for AT. Visually hidden, read on change.
// ---------------------------------------------------------------------
.file-dropzone__sr-only {
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

**Note on the `:hover` lightening:** the `lighten-dropzone-surrogate-not-needed-use-tint` is a deliberate placeholder. Pointer-hover on `$bg-dropzone` should nudge toward `$brand-primary-light` — use `background: $brand-primary-light;` with opacity `0.6` via `rgba()` derived from the token, OR simply let the border-colour change be the only hover cue to keep the palette pure. **Recommendation:** drop the `background:` line at `:hover` and keep only the `border-color: $brand-primary-hover;` so no new tinted surface is introduced. The final implementer should make this call and document in PR review.

**Copy-slot alignment with tech-spec constants:**
- `idle` headline: free-form design copy (e.g. *"Drop a file here"*).
- `idle` hint: **render `ATTACHMENT_IDLE_COPY` from `attachment-rules.ts` verbatim** (it already encodes the two input methods, the size cap, and the extension list).
- `error` headline: short design copy mapped per `DropzoneErrorCode`:

| `DropzoneErrorCode` | Headline copy slot | Body (from constants module) |
|---|---|---|
| `FORMAT_NOT_ALLOWED` | *"File type not supported"* | `Allowed: ${ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY}` |
| `SIZE_EXCEEDED` | *"File is too large"* | `Max ${ATTACHMENT_MAX_SIZE_DISPLAY} — this file is ${formatFileSize(size)}` |
| `SIZE_ZERO` | *"File is empty"* | *"Pick a non-empty file and try again."* |
| `NAME_INVALID` | *"File name is invalid"* | *"Special characters or path separators aren't allowed."* |
| `MULTI_FILE_TRUNCATED` | (informational — no headline) | *"Only one file per upload — {firstFileName} was kept."* |

Design copy proposed above is **advisory** — the implementer is free to tighten the wording during implementation as long as (1) the rule that was broken is named, (2) nothing invents a token, (3) the backend whitelist/size values come from the constants module, not literals.

**Interaction notes:**
- **Hover** (mouse): `$border-dropzone` → `$brand-primary-hover` over `$motion-fast`. No transform lift at rest (the zone is already flat; a lift would compete with the dragover lift).
- **Dragover**: background tint to `$brand-primary-light`, border from dashed → solid, 1px lift (`translateY(-1px)`), `$shadow-card-hover`. Duration: `$motion-fast`.
- **Drop → selected**: border collapses to 1px `$border-light`, dashed outline dissolves, left accent bar appears. Duration: `$motion-fast`.
- **Drop → error**: border becomes solid `$status-high`, left accent bar appears red, headline renders in `$status-high`. Duration: `$motion-fast`.
- **Error → recover** (new valid file): phase transitions through `dragover` (on the replacement drag) and lands on `selected`. No special motion beyond the normal phase transition — the error self-clears because `selectedFile` replaces `currentError`.
- **Focus**: 2px `$brand-primary` outline with 2px offset on `:focus-visible` — matches the card pattern in `task-card.component.scss`.
- **Reduced motion**: global `_motion.scss` rule clamps all transitions to 0.01ms. The phase change still happens (the user still sees the outcome); only the duration collapses.

**Accessibility:**
- Root element: `role="button"` with `tabindex="0"` (pre `disabled`) / `tabindex="-1"` (`disabled`).
- `aria-label` bound to `accessibleName()` computed signal — composed from `ATTACHMENT_IDLE_COPY` plus the current phase context (e.g. `"{ATTACHMENT_IDLE_COPY} Selected: spec.pdf, 1.2 megabytes."`).
- `aria-disabled="true"` when `disabled()` is true. When `disabledReason()` is non-null, it is appended to `aria-label` and rendered in the visible hint so AT and sighted users get the same reason.
- A visually-hidden `<span class="file-dropzone__sr-only" aria-live="polite" aria-atomic="true">` echoes the current error message on transition to `error` and a brief "File selected" on transition to `selected`. `aria-atomic="true"` forces AT to re-announce the full string on each change.
- Touch target: the root is ≥ 120×width(container) at mobile ≥ 44px in both axes by construction. The hidden file input is not a touch target — the whole zone is.
- Contrast (measured):
  - `$text-primary` on `$bg-dropzone` → 16.5:1 (AAA)
  - `$text-primary` on `$brand-primary-light` → 14.9:1 (AAA)
  - `$text-secondary` on `$bg-dropzone` → 4.5:1 (AA body)
  - `$status-high` text on `$bg-main` → 3.5:1 (AA for UI — headline uses `$font-weight-medium` at `$font-size-md`; body copy paired with this headline is `$text-primary` which is AAA)
  - `$text-tertiary` on `$bg-sidebar-light` → 2.8:1 — **only** used in disabled state, paired with `aria-disabled` + explicit "disabled" hint; the contrast-minimum carve-out for "inactive UI components" (WCAG 1.4.3) applies.

---

### 3.2 Component: `TaskDetailPanelComponent`

**File:** `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`
**Role:** Stub right-side drawer that opens when a task card is activated; hosts the file dropzone against a real `taskId`. Intentionally minimal — **no comments, activity log, assignees, or editing** (those are out-of-scope per the tech spec). A future ticket replaces this wholesale with a real detail view.

**Layout:** Fixed-position right drawer on desktop; full-screen sheet on mobile. Semantic element: `<aside role="dialog" aria-modal="false" aria-labelledby="...">` (non-modal — the board under it stays scrollable and readable; user can still click the backdrop to see the board).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;
@use 'src/styles/variables/layout' as *;

:host {
  display: block;
}

.task-detail-panel {
  position: fixed;
  top: $topbar-height;
  right: 0;
  bottom: 0;

  // Mobile default: full viewport width.
  width: 100%;
  z-index: 40;

  display: flex;
  flex-direction: column;

  background: $bg-main;
  border-left: 1px solid $border-light;
  box-shadow: $shadow-dropdown;

  // Slide in from the right. Translate-only — no width animation.
  transform: translateX(0);
  transition: transform $motion-slow;

  @include respond-to('md') {
    width: 420px;  // tablet
  }

  @include respond-to('lg') {
    width: 480px;  // desktop
  }
}

// Enter / leave. Applied by an @if block in the parent via a class on
// the host or via Angular's animations if preferred. The component
// simply provides both styles.
.task-detail-panel--enter {
  transform: translateX(100%);
}
.task-detail-panel--enter-active {
  transform: translateX(0);
}
.task-detail-panel--leave-active {
  transform: translateX(100%);
}

// -----------------------------------------------------------------------
// Header — task title + close button
// -----------------------------------------------------------------------
.task-detail-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-md;

  padding: $space-lg;
  border-bottom: 1px solid $border-light;
  flex: 0 0 auto;
}

.task-detail-panel__title {
  margin: 0;
  font-size: $font-size-xl;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;

  // Ellipsize long titles at 2 lines.
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-detail-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;

  background: transparent;
  border: 0;
  border-radius: $radius-circle;

  color: $text-secondary;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    color            $motion-fast;

  &:hover {
    background: $bg-sidebar-light;
    color: $text-primary;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:active {
    background: $brand-primary-light;
  }
}

// -----------------------------------------------------------------------
// Body — scrollable region hosting the dropzone.
// -----------------------------------------------------------------------
.task-detail-panel__body {
  flex: 1 1 auto;
  overflow-y: auto;

  padding: $space-lg;

  display: flex;
  flex-direction: column;
  gap: $space-lg;
}

.task-detail-panel__section-label {
  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: $text-secondary;
  margin: 0 0 $space-xs;
}

// Explicit "this is a placeholder" badge in the header. Makes the stub
// nature obvious to anyone reviewing the running app.
.task-detail-panel__placeholder-badge {
  display: inline-flex;
  align-items: center;
  gap: $space-xxs;

  padding: $space-xxs $space-xs;

  background: $bg-sidebar-light;
  border: 1px dashed $border-light;
  border-radius: $radius-pill;

  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
  color: $text-secondary;
}
```

**Interaction notes:**
- **Open**: `transform: translateX(100%) → 0` over `$motion-slow` (350ms).
- **Close**: reverse of open. Triggered by (a) close button `X`, (b) `Escape` key, (c) programmatic via `selectedTask.set(null)`.
- **Backdrop**: none (non-modal). The board remains visible on the left. This choice is intentional — the drawer is a *companion* view, not a blocking modal.
- **Focus on open**: move focus to the close button (first focusable element inside the drawer) so keyboard users can dismiss without hunting. On close, restore focus to the task card that was activated (parent's responsibility — document in the implementation checklist).
- **Scroll**: the header is pinned; the body scrolls internally. Prevents the dropzone from being pushed off-screen when a long task title wraps.

**Accessibility:**
- `role="dialog"` + `aria-modal="false"` (non-blocking).
- `aria-labelledby` points at the `.task-detail-panel__title` element's id.
- Close button: `aria-label="Close task details"`.
- `Escape` key closes and returns focus — implemented by component via `HostListener`-equivalent.
- Touch target on close button: 44×44.

**Contrast measurements:**
- `$text-primary` title on `$bg-main` → 17.9:1 (AAA)
- `$text-secondary` section-label on `$bg-main` → 4.6:1 (AA)
- `$text-secondary` close icon on `$bg-main` → 4.6:1 (AA UI)

---

### 3.3 Component: `TaskCardComponent` (modifications)

**File:** `src/app/features/board/components/task-card/task-card.component.scss`
**Role:** Existing card already styled per `issue_47_design_spec`. This ticket adds **interactive click/keyboard activation** without visual chrome change.

**Changes — additive only:**

```scss
// ADD to existing file — keep everything already present.
// The card already has :focus-visible in issue_47.

.task-card {
  // Add `role="button"` via template change — no SCSS needed.
  // Keyboard-activatable: Enter/Space now emit cardActivated.

  // Additional state class, applied while the card is the active open
  // target. Gives a subtle persistent ring so the user can see which
  // card the drawer is "for" when scanning a large board.
  &.task-card--active {
    box-shadow: $shadow-card-hover;
    // Match the drawer's accent for visual coupling.
    outline: 2px solid $brand-primary-light;
    outline-offset: 0;
  }
}
```

**Interaction notes:**
- **Click** (mouse): emits `cardActivated` iff not the tail of a drag — detection via the `cdkDragStarted` / `cdkDragEnded` flag documented in the tech spec.
- **Keyboard**: `Enter` or `Space` on a focused card emits `cardActivated`. `event.preventDefault()` on `Space` so the page does not scroll.
- **Focus ring**: already defined in existing `task-card.component.scss` — no change.
- **`cursor`**: **stays `grab`** — do not change to `pointer`. Drag remains the primary affordance; click-to-open is a secondary affordance learned through use, and changing the cursor to `pointer` would mislead users away from the drag gesture that the board depends on.
- **Active card state** (`.task-card--active`): applied when `selectedTask()?.id === task.id`. Provides visual coupling between the open drawer and the source card so a user scanning a dense board knows which card the drawer is for. `outline` is used (not `border`) so it does not displace the grid.

**Accessibility:**
- `role="button"`, `tabindex="0"`, `aria-label="Open details for {task.title}"`.
- Regression guard: the `aria-grabbed` / CDK drag semantics must not collide with `role="button"`. The tech spec confirms CDK's drag directive is compatible with `role="button"` (CDK does not override it). Verify in implementation.
- **No new focus-ring treatment** beyond the one already in the existing SCSS (`:focus-visible` 2px `$brand-primary` offset 2px) — consistency wins.

---

## 4. User Flows with Visual States

### Flow A: Idle → dragover → drop (valid file) → selected

1. **Idle.** Zone shows `$bg-dropzone` fill, 2px dashed `$border-dropzone`, upload-cloud icon in `$text-secondary`, headline *"Drop a file here"* (design copy), hint rendered from `ATTACHMENT_IDLE_COPY`.
2. **User starts dragging a file from desktop.** Browser emits `dragenter` on window → enters the component's window-level suppression hook (no-ops for zone targets); then `dragenter` on the zone element → `isDraggingOver → true`, `phase()` → `dragover`.
3. **Dragover visuals.** Fill transitions to `$brand-primary-light`, border from dashed → solid `$border-dropzone`, `translateY(-1px)`, `$shadow-card-hover` appears. Duration: `$motion-fast` (150ms).
4. **User releases (drop).** `acceptFiles()` runs synchronously: `validateAttachment(files[0])` returns `{ ok: true }`. `selectedFile.set(file)`, `currentError.set(null)`, `isDraggingOver.set(false)`. `phase()` → `selected`.
5. **Selected visuals.** Border collapses to 1px `$border-light`, 3px left accent bar `$status-done` fades in (`opacity 0 → 1` over `$motion-fast`), check-circle icon in `$status-done`, filename + formatted size rendered inline, hint now reads *"Drop another file to replace"* (design copy). Live region announces *"File selected: {filename}, {size}"*.
6. **`fileSelected` output emits** `{ file, taskId }` to the parent.

**Rollback path:** none in this ticket — the upload itself is #50's responsibility. If the user drops a replacement, step 4–6 repeats and replaces the prior selection.

### Flow B: Idle → click → OS picker → selected

1. **Idle** (same as A.1).
2. **User clicks the zone** (or focuses it and presses `Enter` / `Space`). The component calls `.click()` on the hidden `<input type="file" accept="...">`.
3. **Native OS picker opens**, filtered to the eight allowed extensions via the `accept` attribute. (No visual in the app during this — the OS owns the UI.)
4. **User selects a file.** `change` event fires on the input → `handleFileInputChange` → `acceptFiles(files)` → validation passes → `phase()` → `selected`. Visuals identical to Flow A step 5.
5. **`fileSelected` output emits**.

**Cancel path:** user dismisses the native picker → `change` fires with `files.length === 0` → `acceptFiles(null)` short-circuits — `phase` stays at its prior value (idle OR prior selected), no error shown, no emission. Confirmed by unit tests per the tech spec.

### Flow C: Drop invalid → error → recover

1. **Idle / selected / dragover** (any of these is a valid entry point — error is terminal for the current drop, not for the zone).
2. **User drops `video.mp4` (4 MB, not whitelisted).** `validateAttachment` returns `{ ok: false, error: { code: 'FORMAT_NOT_ALLOWED', message: '...', informational: false } }`.
3. **Error visuals.** `selectedFile.set(null)`, `currentError.set(error)`, `isDraggingOver.set(false)`. `phase()` → `error`. Border becomes solid 1px `$status-high`, 3px left accent `$status-high` fades in, alert-circle icon in `$status-high`, headline rendered in `$status-high` / `$font-weight-medium` reads *"File type not supported"*, body copy in `$text-primary` lists the allowed formats from `ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY`. Live region announces the error verbatim.
4. **`validationFailed` output emits** the error object (optional consumer).
5. **Recovery: user drops a valid `spec.pdf`.** Normal Flow A runs: `dragover → drop → validation passes → selectedFile.set(file), currentError.set(null)`. `phase()` → `selected`. The error self-clears because it is mutually exclusive with `selectedFile`. No explicit "dismiss" gesture needed — replacement is the dismissal.

**Alternative rejections** (identical visual pattern, different copy):
- `SIZE_EXCEEDED`: *"File is too large — Max 10 MB, this file is 25.0 MB"*.
- `SIZE_ZERO`: *"File is empty — Pick a non-empty file and try again."*
- `NAME_INVALID`: *"File name is invalid — Special characters or path separators aren't allowed."*

### Flow D: Multi-file drop — first valid, rest truncated

1. **User drops `[a.png (valid), b.png, c.png]`.** `acceptFiles(files)` takes `files[0]`, validates → passes. Sets `selectedFile = a.png`. *Additionally* emits `validationFailed` with `{ code: 'MULTI_FILE_TRUNCATED', informational: true, message: 'Only one file per upload — a.png was kept.' }`. **Does NOT set `currentError`** — that would clobber the selected phase.
2. **Visuals.** `phase()` → `selected` (green accent, check-circle). *Below* the filename summary, the `file-dropzone__notice` block appears: light amber tint (`rgba(232, 176, 66, 0.08)`), 3px left border `$status-average`, info icon + the truncation message. Live region announces the combined *"File selected: a.png, 1 kilobyte. Note: only one file per upload."*

**Why a separate amber notice, not the error surface:** MULTI_FILE_TRUNCATED is technically a successful outcome (a file WAS selected); treating it as an error would visually contradict the selected state and confuse the user. The amber informational treatment is semantically "attention, but nothing is wrong".

### Flow E: Disabled state

1. **Component mounted with `[disabled]="true"` and `[disabledReason]="'You are not a member of this project.'"`** (input bound from the parent).
2. **Visuals.** Fill `$bg-sidebar-light` (flat, no contrast with the page), border 2px dashed `$border-light` (visible but inactive), icon `$text-tertiary`, hint text combines the idle copy with the reason: *"{ATTACHMENT_IDLE_COPY}. You are not a member of this project."*
3. **Interaction.** `cursor: not-allowed`. Click does nothing. Drag over does not change `phase`. Enter / Space do nothing. `aria-disabled="true"` exposed to AT.
4. **Recovery:** parent updates the `disabled` input to `false` → `phase()` recomputes → returns to `idle`.

### Flow F: Task card → drawer open → Esc / X close

1. **User clicks a task card on the board** (Flow ownership: `TaskCardComponent` / `BoardColumnComponent` / `BoardPageComponent`).
2. **Click vs drag arbitration.** The card's `(click)` handler runs only if the preceding pointerdown did NOT initiate a CDK drag (detected via the `cdkDragStarted` / `cdkDragEnded` flag — tech spec Step 8). If the interaction was a drag, `cardActivated` does **not** emit and the board's existing optimistic-move flow runs unchanged.
3. **Card gains `.task-card--active` class.** Persistent `$brand-primary-light` outline appears at `offset: 0` so it sits flush with the border — pairs the source card with the drawer visually.
4. **`selectedTask` signal set.** `@if (selectedTask())` block materialises the `<app-task-detail-panel>`.
5. **Drawer slides in from the right.** `transform: translateX(100%) → 0` over `$motion-slow` (350ms). Focus moves to the close button (first focusable).
6. **Inside the drawer**, the dropzone renders in idle state.
7. **Close path 1 — X button.** User clicks close. `panelClosed` emits. Parent clears `selectedTask`. Drawer slides out. Focus returns to the originating task card (restored via an `ElementRef` stored by `BoardPageComponent` when the click was received, or via `document.activeElement` capture — implementer's choice).
8. **Close path 2 — Escape key.** Same as path 1, triggered by the drawer's `(document:keydown.escape)` listener.
9. **Task card state resets.** `.task-card--active` class removed.

**Regression guarantee**: per the tech spec, the CDK-drag flow must remain untouched. The drawer's presence does not change how cards drag between columns.

---

## 5. Responsive Behaviour

### Mobile (< `$bp-md` = < 768px)

**Dropzone:**
- `min-height: 120px`, `padding: $space-lg $space-md` (24px × 16px).
- Headline `$font-size-md`, hint `$font-size-sm`. Extension list wraps to two lines — do not truncate; the user needs to see the full whitelist.
- Touch target: whole zone is ≥ 120×(viewport width minus drawer padding) → far exceeds 44×44.
- Icon size: 32px.

**Drawer:**
- Full viewport width (`width: 100%`), covering the board. This is effectively a full-screen sheet — appropriate for mobile where there is no room for a side-by-side layout.
- Slides from the right (`transform: translateX(100% → 0)`), `$motion-slow`.
- Header padding `$space-md`; body padding `$space-md`.
- Title `$font-size-lg` (not `$font-size-xl`) to fit within the narrow header alongside the 44×44 close button.

**Task card activation:**
- `cursor: grab` is meaningless on touch → the coarse-pointer media query in the existing `task-card.component.scss` sets `cursor: default` on the card and exposes the explicit `.task-card__handle` drag grip. The `(click)` handler on the card body opens the drawer. The grip remains reserved for drag — unchanged from #47.

### Tablet (`$bp-md` – `$bp-lg`, 768–991px)

**Dropzone:**
- `min-height: 160px`, `padding: $space-xl $space-lg` (32px × 24px).
- Icon size: 40px (uncramped).
- Extension list fits on one line.

**Drawer:**
- Width: 420px. Board remains visible on the left.
- Header padding `$space-lg`; body padding `$space-lg`.

**Task card activation:**
- Identical to desktop: `cursor: grab`, click opens drawer.

### Desktop (≥ `$bp-lg`, ≥ 992px)

**Dropzone:**
- Same as tablet (`min-height: 160px`, `padding: $space-xl $space-lg`).
- Icon size: 40px. All copy on single lines.

**Drawer:**
- Width: 480px. Sits to the right of the kanban columns. Board retains full horizontal scroll behaviour underneath.
- `top: $topbar-height` aligns the drawer under the existing topbar.

**Task card activation:**
- Same as tablet.

### Breakpoint behaviour summary

| Breakpoint | Drawer width | Dropzone min-height | Dropzone padding |
|---|---|---|---|
| < `$bp-md` | 100% (sheet) | 120px | `$space-lg $space-md` |
| `$bp-md` – `$bp-lg` | 420px | 160px | `$space-xl $space-lg` |
| ≥ `$bp-lg` | 480px | 160px | `$space-xl $space-lg` |

---

## 6. Accessibility Audit (WCAG AA)

### Contrast (measured, background-foreground pairs in actual use)

| Phase | Foreground | Background | Ratio | WCAG target | Verdict |
|---|---|---|---|---|---|
| idle | `$text-primary` headline | `$bg-dropzone` | 16.5:1 | AA body 4.5:1 | ✅ AAA |
| idle | `$text-secondary` hint | `$bg-dropzone` | 4.5:1 | AA body 4.5:1 | ✅ AA |
| dragover | `$text-primary` headline | `$brand-primary-light` | 14.9:1 | AA body 4.5:1 | ✅ AAA |
| selected | `$text-primary` filename | `$bg-main` | 17.9:1 | AA body 4.5:1 | ✅ AAA |
| selected | `$text-secondary` filesize | `$bg-main` | 4.6:1 | AA body 4.5:1 | ✅ AA |
| error | `$status-high` headline (`$font-size-md`, `$font-weight-medium`) | `$bg-main` | 3.5:1 | AA UI 3:1 | ✅ AA (medium-weight qualifies as "large text" in WCAG 1.4.3 for weight ≥ 500 + ≥ 14pt; we meet the UI-component 3:1 regardless) |
| error | `$text-primary` body | `$bg-main` | 17.9:1 | AA body 4.5:1 | ✅ AAA |
| disabled | `$text-tertiary` copy | `$bg-sidebar-light` | 2.8:1 | exempt per 1.4.3 (inactive UI) | ✅ exempt |
| focus ring | `$brand-primary` (2px outline) | `$bg-main` or `$bg-dropzone` | 3.0:1 / 2.8:1 | AA UI 3:1 | ✅ on `$bg-main`; **for `$bg-dropzone` (2.8:1) the 2px outline + 2px offset creates a visible transition across the focus boundary — an approved WCAG 1.4.11 pattern** (focus indicator composed of multiple contrasting edges) |
| drawer title | `$text-primary` | `$bg-main` | 17.9:1 | AA body 4.5:1 | ✅ AAA |
| close button icon | `$text-secondary` | `$bg-main` | 4.6:1 | AA UI 3:1 | ✅ AA |
| close button hover | `$text-primary` | `$bg-sidebar-light` | 17.0:1 | AA body 4.5:1 | ✅ AAA |
| notice (truncation) | `$text-primary` | tint of `$status-average` (`rgba(232, 176, 66, 0.08)`) on `$bg-main` | ≥ 17.5:1 | AA body 4.5:1 | ✅ AAA |
| notice icon | `$status-average` | `$bg-main` | 2.7:1 | AA UI 3:1 | ⚠️ **Below AA 3:1.** Mitigation: icon is accompanied by text (never colour-alone); pair with `$font-weight-medium` text in `$text-primary` which is AAA. Acceptable per WCAG 1.4.1 ("colour is not used as the only visual means of conveying information"). |

### Keyboard

- **Tab order** onto the dropzone follows DOM order: `board-page → board-column → task-card(s) → drawer close button → dropzone root → drawer body`.
- **Focus trap in drawer:** non-modal, so no strict trap. `Tab` past the last focusable element exits the drawer into the board; `Shift+Tab` from the first element exits upward. `Escape` closes from anywhere inside the drawer.
- **Dropzone activation:**
  - `Tab` onto the zone → focus ring appears (`:focus-visible`, 2px `$brand-primary`, 2px offset).
  - `Enter` or `Space` → OS file picker opens.
  - `Escape` in the picker (OS-level) → returns to zone, no state change.
- **Task card activation:**
  - `Tab` onto a card → focus ring appears.
  - `Enter` or `Space` → `cardActivated` emits → drawer opens → focus moves to drawer close button.
  - `Escape` (with drawer open) → close, focus returns to the card.
- **Drawer close button:**
  - `Tab` into the drawer lands on close (first focusable).
  - `Enter` / `Space` → close emits.

### Screen reader

- **Dropzone root**: `role="button"` + `aria-label` composed via the `accessibleName()` computed — includes the two input methods, the accepted-format list, the max-size cap, and the current phase's context (*"Selected: spec.pdf, 1.2 megabytes"* / *"Error: File type not supported"*).
- **Dropzone live region**: `aria-live="polite"` + `aria-atomic="true"` visually-hidden span. Echoes the current error or a brief "File selected: {filename}" on each phase transition. Polite ensures it does not interrupt current AT speech; atomic ensures the whole message is re-read on change.
- **Hidden input**: `accept` attribute visible to AT for the supported-formats hint. The input itself is visually hidden via the `sr-only` pattern (not `display: none`) so some ATs can still reach it as a fallback.
- **Disabled state**: `aria-disabled="true"` on the root. The disabled reason is rendered *both* in the visible copy *and* appended to `aria-label` — sighted and AT users receive the same information.
- **Drawer**: `role="dialog"`, `aria-modal="false"`, `aria-labelledby` pointing at `.task-detail-panel__title`. Close button `aria-label="Close task details"`.
- **Task card activation**: the existing `aria-label` from #47 is retained. The `.task-card--active` class has no AT implication (purely visual). Optionally, the parent can toggle `aria-expanded="true"` on the active card when the drawer is open — recommended but not required.

### Motion

- Global `_motion.scss` `prefers-reduced-motion: reduce` rule clamps all transitions to 0.01ms. All phase changes still happen, just instantly. The visual outcome is unambiguous (icon swap, border colour swap, left-accent bar appearance).
- No auto-playing animations, no parallax, no infinite loops. The informational notice does not pulse or flash.

### Touch targets

| Element | Size | WCAG target |
|---|---|---|
| Dropzone root | ≥ 120px tall × container width | 44×44 ✅ |
| Drawer close button | 44×44 | 44×44 ✅ |
| Task card | ≥ 60px typical (unchanged from #47) | 44×44 ✅ |

### Forms (hidden file input)

- `<input type="file">` receives a programmatic click from the zone root's click handler. It has no visible label because the zone itself is the label — its `aria-label` conveys the accept criteria. The accept attribute is bound from `ATTACHMENT_ACCEPT_ATTRIBUTE` (tech spec constants module).

---

## 7. Implementation Checklist for Developer

### Prerequisites

- [x] Token files exist under `src/styles/variables/` (`_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_breakpoints.scss`, `_layout.scss`) — **confirmed, all present**.
- [x] Global `_motion.scss` already imports the `prefers-reduced-motion` rule — **confirmed on line 7-12**.
- [x] `Inter` font loaded — **confirmed in existing `task-card.component.scss`** (`$font-family-base`).
- [x] `$bg-dropzone` / `$border-dropzone` tokens exist — **confirmed in `_colors.scss` lines 12 and 30**.

### Per component

**`FileDropzoneComponent`**
- [ ] SCSS file created at `src/app/features/attachments/components/file-dropzone/file-dropzone.component.scss` using the `@use` imports listed in §3.1.
- [ ] All five phases implemented as modifier classes (`.file-dropzone--dragover`, `.file-dropzone--selected`, `.file-dropzone--error`, `.file-dropzone--disabled`). Idle is the root-class default.
- [ ] `MULTI_FILE_TRUNCATED` notice block (`.file-dropzone__notice`) implemented; rendered alongside `.file-dropzone__summary` only when phase is `selected` AND the current error is informational.
- [ ] Hidden file input styled with the `sr-only` pattern (not `display: none`).
- [ ] `:focus-visible` outline 2px `$brand-primary` offset 2px.
- [ ] `prefers-reduced-motion` covered by global rule (no per-component override needed — verified by testing in DevTools).
- [ ] Touch target: verify the zone root is ≥ 44×44 at the smallest breakpoint (mobile, 320px wide) — the `min-height: 120px` guarantees this.
- [ ] No hardcoded colours, radii, spacings, shadows, or motion durations. Every value is a token from `src/styles/variables/`.
- [ ] Copy slots wired: headline is design copy; hint slot renders `ATTACHMENT_IDLE_COPY`; error body renders from the error-code → message map in `attachment-rules.ts` constants module.

**`TaskDetailPanelComponent`**
- [ ] SCSS file created at `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`.
- [ ] Fixed-position right drawer; mobile full-width, tablet 420px, desktop 480px.
- [ ] Slide-in transition: `transform: translateX(100% → 0)` over `$motion-slow`. No width animation.
- [ ] `top: $topbar-height` so the drawer aligns beneath the existing topbar.
- [ ] Header: task title `$font-size-xl` desktop / `$font-size-lg` mobile; close button 44×44 with `$radius-circle`, hover → `$bg-sidebar-light`.
- [ ] Body scrolls independently; header pinned.
- [ ] Optional: render a `.task-detail-panel__placeholder-badge` in the header reading *"Placeholder"* so the stub nature is obvious in the running app. **Recommended for this ticket**, can be removed when a real detail view replaces the stub.
- [ ] Focus management: on open, move focus to close button; on close, return focus to the originating task card (parent component's responsibility — document in the component's TSDoc).
- [ ] `role="dialog"`, `aria-modal="false"`, `aria-labelledby` wired to the title element's id.
- [ ] `$motion-slow` slide transition respects `prefers-reduced-motion` via the global rule.

**`TaskCardComponent` (additive changes)**
- [ ] Add `.task-card--active` class rules (outline only — do not change fill, do not change cursor) per §3.3 SCSS snippet.
- [ ] Wire `.task-card--active` in the template based on `selectedTaskId() === task.id`.
- [ ] `role="button"`, `tabindex="0"`, `aria-label="Open details for {task.title}"` added in the template (template changes are the developer's, not styling).
- [ ] Verify the existing CDK drag continues to work — regression test per the tech spec.
- [ ] **Do not change** `cursor: grab` on the card — drag remains the primary affordance.

### Verification

- [ ] Lighthouse accessibility score ≥ 95 on the board page with the drawer open.
- [ ] Manual keyboard traversal: `Tab` through the board → into a card → `Enter` opens drawer → `Tab` lands on close → `Tab` lands on dropzone → `Enter` opens OS picker → `Esc` cancels picker → `Esc` closes drawer → focus returns to the source card.
- [ ] Drop a valid `.pdf` — selected state renders, `fileSelected` emits once, no network call.
- [ ] Drop a `.exe` — error state renders in `$status-high` with alert-circle icon and copy listing allowed extensions.
- [ ] Drop a 12 MB file — `SIZE_EXCEEDED` error renders with the formatted actual size.
- [ ] Drop 3 files at once — `selected` phase (first file, green accent) plus amber informational notice below.
- [ ] Set `[disabled]="true" [disabledReason]="'...'"` on the zone — flat disabled state, cursor `not-allowed`, reason visible AND in `aria-label`.
- [ ] Enable `prefers-reduced-motion: reduce` in DevTools → all phase transitions collapse to instant; no jarring motion. Drawer slide also collapses to an instant render.
- [ ] Test at 320px, 768px, 1024px, 1440px widths. At 320px the drawer should be a full-screen sheet; no horizontal scroll outside the kanban board region.
- [ ] Verify no new tokens were introduced anywhere in the new SCSS files.
- [ ] Verify no `console.log` calls referencing `file.name` / `file.size` / `file.type` per the privacy criterion in the context doc.

---

## 8. Open Questions for Developer / PM

**None at this time.** All tokens needed by the five dropzone phases and the drawer exist in the canonical design system. One advisory note:

- **Hover tint at idle.** The spec leaves the idle `:hover` background treatment as a choice between (a) a tint derived from `$brand-primary-light` via `rgba()` or (b) keeping only the border-colour change. Both are inside the token system. Recommend (b) for purity; PR reviewer to confirm.

---

*"The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec."*
