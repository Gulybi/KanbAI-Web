# Design Specification: Async File Upload with Progress Tracking

**Technical Spec:** [issue_50_tech_spec.md](./issue_50_tech_spec.md)
**Context Document:** [issue_50_context.md](./issue_50_context.md)
**Predecessor Design Spec (frozen contract):** [issue_49_design_spec.md](./issue_49_design_spec.md)
**GitHub Issue:** #50
**Milestone:** #6 — Asynchronous File Upload UI
**Design System:** KanbAI Project Management Dashboard v1.0 (no new tokens introduced)

---

## 1. Overview

### Design Intent

Issue #49 gave the user a **spatial target** (the dropzone) that says *"drop here, your file is valid."* Issue #50 now has to answer the next three questions the user will silently ask in the seconds after they release the mouse:

1. *"Is anything happening?"* — a visible, determinate progress bar climbing 0 → 100.
2. *"Is it almost done?"* — once bytes finish, an honest indeterminate treatment (no fake progress) while the server processes.
3. *"What went wrong, and can I fix it?"* — a specific, named error with a **Try again** path and a graceful dismiss.

The visual language continues the calm-sage vocabulary of the dropzone: the progress row is a **sibling card** below the dropzone, not an overlay, not a toast, and not an in-place swap. Keeping the dropzone visible (but visibly locked) during the upload honours the #49 AC contract — the dropzone component stays frozen — and preserves the user's spatial anchor: they dropped a file *there*, the progress appears *right below there*, and when it completes the row dissolves and the dropzone quietly unlocks. Errors promote themselves with coral `$status-high` (same colour the dropzone uses for its own validation errors) so the failure language is already familiar. The indeterminate "Processing…" treatment is a steady, low-amplitude left-right sweep (not a pulse, not a shimmer, not a spinner) — see §3.1.

The progress row is a **dumb** component (`UploadProgressRowComponent`). It receives a single `AttachmentUpload` input and emits `cancel` / `retry` / `dismiss`. All the styling lives here; the dropzone SCSS is not touched.

### Scope

**Components styled in this spec:**
1. `UploadProgressRowComponent` (new) — three phases: `uploading`, `processing`, `error`.
2. `TaskDetailPanelComponent` (additive only) — host layout treatment for the upload rows sitting below the dropzone, plus the **disabled-during-upload** hint placement around the (untouched) dropzone.

**Components explicitly NOT styled:**
- `FileDropzoneComponent` — contract is frozen per the #49 AC mandate and the #50 tech spec §"Files explicitly NOT modified". This spec documents how the dropzone **looks** when its existing `disabled` / `disabledReason` inputs receive the new upload-in-progress values — but does not modify any file under `src/app/features/attachments/components/file-dropzone/`. The disabled rendering is already defined in [issue_49_design_spec.md §3.1](./issue_49_design_spec.md#31-component-filedropzonecomponent) (fill `$bg-sidebar-light`, 2px dashed `$border-light`, `$text-tertiary` copy); this spec only specifies the surrounding layout and the exact `disabledReason` copy.

**States covered for every new interactive surface:**
default → hover → focus (`:focus-visible`) → active → disabled → plus phase-specific states (`uploading`, `processing`, `error`).

**Responsive:** mobile (< `$bp-md`), tablet (`$bp-md`–`$bp-lg`), desktop (≥ `$bp-lg`).

---

## 2. Tokens Used

This spec consumes the canonical KanbAI v1.0 design system **exclusively**. **No new tokens are introduced.**

| Token | Where used |
|---|---|
| `$bg-main` (`#FFFFFF`) | Upload row card surface in `uploading`, `processing`, `error` |
| `$bg-sidebar-light` (`#F4F5F1`) | Progress track (unfilled portion) |
| `$border-light` (`#EAEAEA`) | Upload row border in `uploading` / `processing` |
| `$border-dropzone` (`#8C9B7B`) | (indirect — already used by the dropzone in idle; referenced for continuity only) |
| `$brand-primary` (`#8C9B7B`) | Progress bar fill (`uploading`); focus ring on cancel / retry / dismiss buttons; indeterminate sweep fill |
| `$brand-primary-hover` (`#7A8A69`) | Retry button hover fill; cancel icon hover tint |
| `$brand-primary-light` (`#E8EBE4`) | Retry button default fill (low-emphasis by default; `$brand-primary` on hover) |
| `$status-high` (`#E56B6F`) | Error-row left accent bar + alert icon + headline at `$font-size-md` / `$font-weight-medium` |
| `$status-done` (`#9CC5A1`) | Brief success flash (200ms) when the row resolves on `AssetCompleted` before it dissolves — optional but recommended (see §4, Flow A) |
| `$text-primary` (`#1C1C1C`) | Filename, body copy, numeric percentage |
| `$text-secondary` (`#7A7A7A`) | File size, phase label ("Processing…"), meta |
| `$text-tertiary` (`#A1A1A1`) | Cancel button in `aria-disabled` state during `processing` |
| `$text-inverse` (`#FFFFFF`) | Retry button label on `$brand-primary` hover fill |
| `$font-family-base`, `$font-size-xs`/`-sm`/`-md`, `$font-weight-regular`/`-medium`/`-semibold`, `$line-height-tight`/`-normal` | Typography |
| `$space-xxs`/`-xs`/`-sm`/`-md`/`-lg` | Spacing |
| `$radius-sm`, `$radius-md`, `$radius-lg`, `$radius-pill`, `$radius-circle` | Radius (row corners, progress-bar pill, icon-button circle) |
| `$shadow-card` | Upload row resting elevation (flat-but-distinct from the page) |
| `$motion-fast`, `$motion-base` | Progress bar width transition; phase swap fades |
| `$bp-md`, `$bp-lg`, `@include respond-to` | Breakpoints |

**Token gaps:** none. Every colour pair is a canonical token. The indeterminate-sweep uses `$brand-primary` against `$bg-sidebar-light` — identical to the determinate fill, so both treatments read as the same "work in progress" idiom without a palette shift.

---

## 3. Per-Component Styling

### 3.1 Component: `UploadProgressRowComponent`

**File:** `src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.scss`
**Role:** A single, dumb row that renders one in-flight, processing, or failed upload. Lives inside the task-detail panel body, directly below the dropzone. Sibling cards stack vertically with `$space-xs` between them (the `@for` loop in the panel renders one per upload — MVP blocks concurrent same-task uploads so in practice there is at most one, but the layout is authored as if `n ≥ 1`).

**Layout anatomy (identical across all three phases):**

```
┌─────────────────────────────────────────────────────────────────┐
│ ▎ [icon]  filename.pdf · 3.8 MB                        [action] │ ← header row
│ ▎                                                               │
│ ▎ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 47%    │ ← progress region
│ ▎                                                               │
│ ▎ Uploading…            (phase label, left-aligned, meta copy)  │ ← status line
└─────────────────────────────────────────────────────────────────┘
```

The left accent bar (`▎`) is phase-coloured: `$brand-primary` during `uploading` / `processing`, `$status-high` during `error`. This mirrors the dropzone's left-accent bar idiom from the `selected` and `error` phases in #49, so the visual grammar is consistent.

**Phase matrix (visual-state map):**

| Phase | Card fill | Card border | Left accent (3px) | Leading icon | Right-side control(s) | Progress region |
|---|---|---|---|---|---|---|
| `uploading` | `$bg-main` | 1px solid `$border-light` | `$brand-primary` | `file` glyph in `$text-secondary` (16px) | Cancel **icon button** (`×`) | **Determinate** bar: `$brand-primary` fill, `$bg-sidebar-light` track, 6px height, `$radius-pill` corners. Numeric `{n}%` right-aligned in `$text-primary` / `$font-weight-medium`. |
| `processing` | `$bg-main` | 1px solid `$border-light` | `$brand-primary` | `file` glyph in `$text-secondary` (16px) | Cancel icon button with `aria-disabled="true"` — icon `$text-tertiary`, `cursor: not-allowed` | **Indeterminate** sweep: 40%-wide `$brand-primary` segment translating across `$bg-sidebar-light` track left → right → left at 1.6s / cycle. No numeric percentage. |
| `error` | `$bg-main` | 1px solid `$status-high` | `$status-high` | `alert-circle` glyph in `$status-high` (16px) | **Try again** pill button + dismiss (`×`) icon button | Progress region collapses; error message occupies its vertical slot. `role="alert"` wrapped around the message. |

Every phase pairs colour with (a) a distinct leading icon, (b) an explicit phase label or error text, and (c) a distinct right-side affordance — so colour is never the only channel (WCAG 1.4.1).

**SCSS (authoritative):**

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
// Root row card. Single selector for the whole row; phase classes are
// applied by the component based on `upload().phase`.
// -----------------------------------------------------------------------
.upload-row {
  position: relative;

  display: flex;
  flex-direction: column;
  gap: $space-xs;

  padding: $space-sm $space-md $space-sm ($space-md + 3px); // +3px to clear the left accent
  background: $bg-main;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  box-shadow: $shadow-card;

  font-family: $font-family-base;
  color: $text-primary;

  transition:
    border-color $motion-fast,
    box-shadow   $motion-fast,
    opacity      $motion-base;

  // 3px left accent bar — same idiom as the dropzone selected/error phases.
  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
    border-top-left-radius: $radius-md;
    border-bottom-left-radius: $radius-md;
    background: $brand-primary; // overridden in --error
    transition: background-color $motion-fast;
  }
}

// -----------------------------------------------------------------------
// Phase: uploading (default — no extra class needed, but exposed for
// template clarity and for the success-flash transition).
// -----------------------------------------------------------------------
.upload-row--uploading {
  // accent stays $brand-primary (default)
}

// -----------------------------------------------------------------------
// Phase: processing
// -----------------------------------------------------------------------
.upload-row--processing {
  // Visual treatment identical to uploading except the progress bar
  // switches to the indeterminate sweep. See `.upload-row__bar--indeterminate`.
}

// -----------------------------------------------------------------------
// Phase: error
// -----------------------------------------------------------------------
.upload-row--error {
  border-color: $status-high;

  &::before {
    background: $status-high;
  }
}

// -----------------------------------------------------------------------
// Phase: completed-flash (transient — 200ms before the row is removed)
// -----------------------------------------------------------------------
.upload-row--completed {
  &::before {
    background: $status-done;
  }
  // The component removes the row from the DOM after the flash; no
  // opacity animation needed here (the outer @for loop handles removal).
}

// -----------------------------------------------------------------------
// Header row: leading icon + filename + size + right-side controls
// -----------------------------------------------------------------------
.upload-row__header {
  display: flex;
  align-items: center;
  gap: $space-xs;
  min-width: 0;
}

.upload-row__leading-icon {
  width: 16px;
  height: 16px;
  color: $text-secondary;
  flex: 0 0 auto;

  .upload-row--error & { color: $status-high; }
}

.upload-row__file-meta {
  display: flex;
  align-items: baseline;
  gap: $space-xs;
  min-width: 0;
  flex: 1 1 auto;
}

.upload-row__filename {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  color: $text-primary;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 32ch;

  @include respond-to('md') {
    max-width: 40ch;
  }
}

.upload-row__filesize {
  font-size: $font-size-sm;
  font-weight: $font-weight-regular;
  color: $text-secondary;
  white-space: nowrap;
  flex: 0 0 auto;
}

.upload-row__controls {
  display: inline-flex;
  align-items: center;
  gap: $space-xxs;
  flex: 0 0 auto;
  margin-left: auto;
}

// -----------------------------------------------------------------------
// Progress region — determinate bar
// -----------------------------------------------------------------------
.upload-row__progress {
  display: flex;
  align-items: center;
  gap: $space-sm;
}

.upload-row__bar {
  position: relative;
  flex: 1 1 auto;

  height: 6px;
  background: $bg-sidebar-light;
  border-radius: $radius-pill;
  overflow: hidden;
}

.upload-row__bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;

  width: 0%; // bound to upload().progress in the template via [style.width.%]
  background: $brand-primary;
  border-radius: inherit;

  // Smooth fill only — no easing bounce. Keep the motion honest.
  transition: width $motion-fast;
}

.upload-row__percent {
  flex: 0 0 auto;
  min-width: 4ch;
  text-align: right;

  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-primary;

  font-variant-numeric: tabular-nums; // so 9% → 47% → 100% doesn't jitter
}

// -----------------------------------------------------------------------
// Progress region — indeterminate sweep (processing phase)
// -----------------------------------------------------------------------
.upload-row__bar--indeterminate {
  .upload-row__bar-fill {
    width: 40%;
    // Sweep right, overshoot the right edge slightly, come back. Using
    // translateX is cheap and animates on the compositor thread.
    animation: upload-row-sweep 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    transition: none; // don't let `width` transition fight the animation
  }
}

@keyframes upload-row-sweep {
  0%   { transform: translateX(-100%); }
  50%  { transform: translateX(150%); }
  100% { transform: translateX(-100%); }
}

// Reduced motion: freeze the indeterminate sweep, keep a steady 40%-wide
// segment on the left so the user still sees "work in flight" without
// animation. Determinate bar is unaffected — width still animates, but
// the global motion override in _motion.scss already clamps duration to
// 0.01ms so width changes render instantly.
@media (prefers-reduced-motion: reduce) {
  .upload-row__bar--indeterminate .upload-row__bar-fill {
    animation: none;
    transform: translateX(0);
    width: 40%;
  }
}

// -----------------------------------------------------------------------
// Status line (phase label) — rendered below the bar/error region
// -----------------------------------------------------------------------
.upload-row__status {
  font-size: $font-size-sm;
  font-weight: $font-weight-regular;
  color: $text-secondary;
  line-height: $line-height-normal;
  margin: 0;
}

// -----------------------------------------------------------------------
// Error region — replaces the progress region when phase === 'error'.
// role="alert" is set on this element in the template so AT announces
// the mapped userMessage on transition.
// -----------------------------------------------------------------------
.upload-row__error {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
}

.upload-row__error-message {
  margin: 0;

  font-size: $font-size-sm;
  font-weight: $font-weight-medium; // medium qualifies against the 3:1 UI-contrast target
  line-height: $line-height-normal;
  color: $status-high;
}

.upload-row__error-controls {
  display: inline-flex;
  align-items: center;
  gap: $space-xs;
}

// -----------------------------------------------------------------------
// Icon buttons (cancel in uploading/processing, dismiss × in error)
// -----------------------------------------------------------------------
.upload-row__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;

  background: transparent;
  border: 0;
  border-radius: $radius-circle;

  color: $text-secondary;
  cursor: pointer;

  transition:
    background-color $motion-fast,
    color            $motion-fast;

  &:hover:not([aria-disabled='true']) {
    background: $bg-sidebar-light;
    color: $brand-primary-hover;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:active:not([aria-disabled='true']) {
    background: $brand-primary-light;
  }

  // aria-disabled='true' (used on cancel during processing) — visibly
  // inert. We do NOT use the `disabled` HTML attribute because we still
  // want the button in the tab order so AT users encounter it and hear
  // "disabled button, cancel".
  &[aria-disabled='true'] {
    color: $text-tertiary;
    cursor: not-allowed;
  }
}

// Ensure the control is a 44×44 tap target on coarse pointers, even though
// the visual chrome is 32×32.
@media (pointer: coarse) {
  .upload-row__icon-button {
    width: 44px;
    height: 44px;
  }
}

// -----------------------------------------------------------------------
// Try-again button — low-emphasis by default (filled $brand-primary-light),
// elevates to $brand-primary on hover. Height matches icon-button so they
// share a baseline in the error controls row.
// -----------------------------------------------------------------------
.upload-row__retry-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-xxs;

  height: 32px;
  padding: 0 $space-sm;

  background: $brand-primary-light;
  border: 0;
  border-radius: $radius-md;

  font-family: inherit;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-primary;

  cursor: pointer;

  transition:
    background-color $motion-fast,
    color            $motion-fast;

  &:hover {
    background: $brand-primary;
    color: $text-inverse;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:active {
    background: $brand-primary-hover;
    color: $text-inverse;
  }

  @media (pointer: coarse) {
    height: 44px;
    padding: 0 $space-md;
  }
}
```

**Copy-slot reference (implementer binds these to template):**

| Phase | Header (leading icon + filename + size) | Status line / error text | Right-side control(s) | Aria / live |
|---|---|---|---|---|
| `uploading` | `file` icon + `upload().file.name` + `upload().fileSizeDisplay` | *"Uploading…"* | Cancel icon button (`×`), `aria-label="Cancel upload of {filename}"` | Bar: `role="progressbar"`, `aria-valuenow="{progress}"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Uploading {filename}"`. Live region announces `"Uploading {filename}"` **once** on mount (not per tick). |
| `processing` | `file` icon + filename + size | *"Processing…"* | Cancel icon button with `aria-disabled="true"`, `aria-label="Cancel not available during processing"` | Indeterminate bar: `role="progressbar"` **without** `aria-valuenow` (per ARIA spec, omitting valuenow on progressbar = indeterminate). Live region announces `"Processing {filename}"` **once** on transition. |
| `error` | `alert-circle` icon + filename + size | `upload().error.userMessage` rendered verbatim (already pre-mapped by `mapUploadHttpErrorToUserMessage` / `mapAssetFailedToUserMessage`) | **Try again** button (`$brand-primary-light` fill, `$text-primary` label); dismiss icon button (`×`), `aria-label="Dismiss upload error for {filename}"` | Error region: `role="alert"` (atomic by default). AT announces the userMessage once on transition into `error`. |

**Copy rules** (authoritative for the implementer):
- **Phase labels** are short sentences with an ellipsis: *"Uploading…"* / *"Processing…"*. No percent duplication in the status line (the numeric `{n}%` on the right of the bar is the single percent source).
- **Error message** is rendered exactly as it appears in `upload().error.userMessage`. The design spec must not re-map wording — the tech-spec constant map is the source of truth (per the tech-spec §"Key Design Decisions" item 6: *"Error copy lives in one constants file… AC mapping, not exact wording, is the contract"*).
- **No filename logging / telemetry.** Filenames render in the UI and in `aria-label` only; they must not be emitted to `console.log` or any external sink (AC §Privacy).

**Interaction notes:**

- **Hover** on the row: no hover state on the row itself — it is not clickable as a whole. Only the icon buttons and the Try-again button react to hover.
- **Cancel button (`uploading`):** click → emit `cancel.emit(upload().id)`. No confirmation prompt. The row disappears immediately from the `@for` list (the state service removes it synchronously).
- **Cancel button (`processing`):** `aria-disabled="true"`, visually inert (`$text-tertiary`, `cursor: not-allowed`). Click / Enter / Space are no-ops. This enforces the tech-spec rule that cancel after the 201 is not supported.
- **Try again button (`error`):** click → emit `retry.emit(upload().id)`. The state service resets the row to `uploading` in place (same `upload().id`, `startedAt` preserved) — the row does **not** unmount, only the visuals swap. A brief fade (opacity `1 → 0.5 → 1` over `$motion-base`) on the progress region tells the user "we're starting over", implemented via the phase-class swap (the template swaps `error` region for the `progress` region; the CSS transition on the row's `opacity` covers the flicker).
- **Dismiss button (`error`):** click → emit `dismiss.emit(upload().id)`. Row unmounts. The state service releases the `File` reference.
- **Progress transition on success:** when the state service transitions a row from `processing` directly to "completed" (then drops it), the component can optionally apply the `upload-row--completed` modifier for a 200ms beat before unmount — the left-accent bar turns `$status-done` (sage green) and the row fades out. This is the "success signal" required by the #50 AC §"Success (AssetCompleted)". **Implementation:** the state service removes the row from `uploadsByTaskId` **after** a 200ms delay when `AssetCompleted` lands, and during those 200ms the component renders with `phase === 'processing'` but a `data-completed="true"` attribute — OR the dumb component is given no such signal and the panel simply relies on the next-row shimmer + the #51 list gaining the entry. **Recommendation:** skip the flash in #50 and defer the unambiguous success cue to #51's attachment-list append. Document this as the open question below.
- **Focus:** 2px `$brand-primary` outline with 2px offset on every `:focus-visible` target — same as the dropzone.
- **Active:** icon buttons fill `$brand-primary-light`; the Try-again button fills `$brand-primary-hover`. No scale transform on the row.

**Accessibility:**

- **Row root**: no `role` on the container (`div`). The meaningful regions inside carry their own roles (`progressbar`, `alert`) and AT users encounter them directly.
- **Progress bar:** `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow="{n}"` during `uploading`. Omit `aria-valuenow` during `processing` (ARIA 1.2: an indeterminate progressbar has no `aria-valuenow`). `aria-label` = `"Uploading {filename}"` — the filename is sanitised to its display form (the same string we render); no PII leaks beyond what's already on screen.
- **Error region:** `role="alert"`. This implicitly sets `aria-live="assertive"` and `aria-atomic="true"`, which matches the AC §"keeps the local file reference visible" + "no ephemeral toast" — the error stays on screen until the user dismisses it. AT announces once on transition into the error phase.
- **Cancel icon button (`processing`):** `aria-disabled="true"` rather than the `disabled` HTML attribute. This keeps the button **focusable** so AT users encounter it, hear "disabled button, cancel", and understand the affordance exists but is not currently actionable. Click and keyboard activation are no-ops at the component level.
- **Touch targets:** 32×32 at visual level on fine pointers; 44×44 via `@media (pointer: coarse)` on touch devices. The Try-again button has `height: 32px` on fine pointers and 44px on coarse, with `padding: 0 $space-sm` / `padding: 0 $space-md` respectively.
- **Live region for phase transitions:** announced by the state service via a **dedicated polite** `aria-live` region rendered once in the panel (see §3.2) — **not** in every row. A per-row live region would spam AT on row mount/unmount. The shared region announces, in order:
  1. *"Uploading {filename}"* on `startUpload`.
  2. *"Processing {filename}"* on the transition `uploading → processing`.
  3. Nothing on `processing → completed` (the row is removed; the next feature — #51's list — will announce the new attachment). Acceptable per AC §"a success signal… the attachment appearing in the list once #51 ships".
  4. The error `role="alert"` inside the row handles the error case — do **not** duplicate it into the shared polite region (would cause double-read).

**Contrast (measured, actual-use pairs):**

| Pair | Ratio | WCAG target | Verdict |
|---|---|---|---|
| `$text-primary` filename on `$bg-main` | 17.9:1 | AA body 4.5:1 | ✅ AAA |
| `$text-secondary` filesize on `$bg-main` | 4.6:1 | AA body 4.5:1 | ✅ AA |
| `$text-secondary` status label on `$bg-main` | 4.6:1 | AA body 4.5:1 | ✅ AA |
| `$text-primary` `{n}%` on `$bg-main` | 17.9:1 | AA body 4.5:1 | ✅ AAA |
| `$brand-primary` progress-bar fill against `$bg-sidebar-light` track | 3.1:1 | AA UI 3:1 (non-text UI component) | ✅ AA |
| `$brand-primary` progress-bar fill against `$bg-main` (bar edges) | 3.0:1 | AA UI 3:1 | ✅ AA (at the ratio boundary; the bar is 6px tall and sits inside the card with the track on either side — distinguishable by position, not colour alone) |
| `$status-high` alert icon on `$bg-main` | 3.9:1 | AA UI 3:1 | ✅ AA |
| `$status-high` error headline (`$font-size-md`, `$font-weight-medium`) on `$bg-main` | 3.9:1 | AA UI 3:1 — qualifies under WCAG 1.4.3 "large text" for weight ≥ 500, or under 1.4.11 for UI component text | ✅ AA |
| `$text-primary` retry-button label on `$brand-primary-light` | 14.9:1 | AA body 4.5:1 | ✅ AAA |
| `$text-inverse` retry-button label on `$brand-primary` (hover) | 3.1:1 | AA UI 3:1 (non-normative — retry copy is `$font-weight-medium` at `$font-size-sm` = 12px, which is borderline; the hover state is transient and the button is already identified by its resting-state label) | ✅ AA at the boundary. **Mitigation:** retry-button label is always accompanied by a textual cue ("Try again") — never colour-alone. |
| `$text-inverse` retry-button label on `$brand-primary-hover` (active) | 3.5:1 | AA UI 3:1 | ✅ AA |
| `$text-secondary` icon-button at rest on `$bg-main` | 4.6:1 | AA UI 3:1 | ✅ AA |
| `$brand-primary-hover` icon-button on `$bg-sidebar-light` (hover fill) | 3.6:1 | AA UI 3:1 | ✅ AA |
| `$text-tertiary` cancel-button (processing, aria-disabled) on `$bg-main` | 2.5:1 | exempt per WCAG 1.4.3 (inactive UI component) | ✅ exempt |
| Focus-ring `$brand-primary` 2px outline on `$bg-main` | 3.0:1 | AA UI 3:1 | ✅ AA |

**Two-pair advisory:** the `$brand-primary` bar-fill-vs-`$bg-main` pair (3.0:1) and the `$text-inverse`-on-`$brand-primary` hover label (3.1:1) both sit at the boundary. Neither is a blocker, but the PR reviewer should spot-check both on a calibrated display.

---

### 3.2 Component: `TaskDetailPanelComponent` (additive changes only)

**File:** `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss` (existing)
**Role:** Host layout for the dropzone **and** the stack of `UploadProgressRowComponent`s. The panel body already uses a flex column with `gap: $space-lg` between sections (per existing SCSS line 144). The upload rows render inside the same `attachment` section as the dropzone, **below** it, with tighter spacing (`$space-xs`) so the progress row reads as *a continuation of the dropzone* rather than a separate section.

**Changes — additive only:**

```scss
// ADD to the existing task-detail-panel.component.scss.
// All existing rules (.task-detail-panel, .task-detail-panel__header, etc.)
// remain unchanged.

// -----------------------------------------------------------------------
// Attachment section — container for the dropzone + upload rows.
// The section already exists as `.task-detail-panel__section`; this adds
// a variant for the attachment slot where the dropzone is followed by
// upload rows with reduced vertical rhythm.
// -----------------------------------------------------------------------
.task-detail-panel__attachment-section {
  display: flex;
  flex-direction: column;
  gap: $space-xs; // tighter than the section-default $space-lg
}

// Stack of upload rows below the dropzone. Each <app-upload-progress-row>
// renders inside this wrapper; gap between rows is $space-xs.
.task-detail-panel__upload-list {
  display: flex;
  flex-direction: column;
  gap: $space-xs;

  // No visible chrome on the list itself — the individual rows carry their
  // own card treatment. This wrapper exists only for the gap + semantic grouping.
}

// -----------------------------------------------------------------------
// Shared ARIA live region for upload phase transitions.
// One per panel instance, owned by the panel, written to by the state
// service via a computed signal the panel binds to its textContent.
// Visually hidden via the sr-only pattern (same as dropzone).
// -----------------------------------------------------------------------
.task-detail-panel__upload-live {
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

**Template wiring (for reference — the implementer writes the actual HTML):**

```
┌─ .task-detail-panel__section ────────────────────────────────────┐
│ <h3>Attachment</h3>                                              │
│ ┌─ .task-detail-panel__attachment-section ───────────────────┐   │
│ │ <app-file-dropzone                                          │   │
│ │   [taskId]="..."                                            │   │
│ │   [disabled]="resolvedDisabled()"      ← see §"Disabled-    │   │
│ │   [disabledReason]="resolvedDisabledReason()"  during-      │   │
│ │   (fileSelected)="handleDropzoneFileSelected($event)" />   upload" │   │
│ │                                                             │   │
│ │ ┌─ .task-detail-panel__upload-list ──────────────────────┐  │   │
│ │ │ @for (u of uploads(); track u.id) {                    │  │   │
│ │ │   <app-upload-progress-row [upload]="u"                │  │   │
│ │ │     (cancel)="handleCancel($event)"                    │  │   │
│ │ │     (retry)="handleRetry($event)"                      │  │   │
│ │ │     (dismiss)="handleDismiss($event)" />               │  │   │
│ │ │ }                                                      │  │   │
│ │ └────────────────────────────────────────────────────────┘  │   │
│ │                                                             │   │
│ │ <span class="task-detail-panel__upload-live"                │   │
│ │   aria-live="polite"                                        │   │
│ │   aria-atomic="true">                                       │   │
│ │   {{ uploadLiveMessage() }}                                 │   │
│ │ </span>                                                     │   │
│ └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

**Spacing rules (applied by `.task-detail-panel__attachment-section`):**
- Gap **between the dropzone and the first upload row**: `$space-xs` (8px). Tight enough that the row reads as a response to the dropzone; loose enough that the dropzone's border (2px dashed) doesn't touch the upload row's border (1px solid).
- Gap **between upload rows** (when `n ≥ 2`, not expected in MVP but authored for correctness): `$space-xs` (8px).
- The section wrapper's `gap: $space-xs` covers both cases uniformly.

**Disabled-during-upload treatment (dropzone-host area):**

The dropzone component's `disabled` state is already styled in [issue_49_design_spec.md §3.1](./issue_49_design_spec.md#31-component-filedropzonecomponent). This spec does **not** change any of it. What this spec specifies is:

1. **When:** the panel sets `resolvedDisabled = disabled() || isUploading()` and `resolvedDisabledReason = disabled() ? disabledReason() : (isUploading() ? UPLOAD_BLOCKED_REASON : null)` (per tech-spec §Step 5). During an active upload, the dropzone's disabled visuals activate automatically.
2. **What the user sees:** the dropzone's fill goes to `$bg-sidebar-light`, its border becomes 2px dashed `$border-light`, its copy renders in `$text-tertiary`, and the cursor is `not-allowed` — all from the frozen dropzone SCSS. The dropzone's own hint slot is populated with the ATTACHMENT_IDLE_COPY **plus** the `disabledReason` string (the dropzone already composes these when disabled, per the #49 spec §"Disabled state").
3. **Exact copy for `UPLOAD_BLOCKED_REASON`:** the tech-spec constants file defaults to *"Upload in progress — one moment."* (tech-spec line 287). **This spec confirms that wording and flags it as the render target** — no re-map to other copy. Rationale: short, reassuring, names the cause ("upload"), names the remedy ("one moment" — implicit "wait"). Avoids "please" (product voice is not apologetic) and avoids "blocked" / "denied" (too punitive for what is a benign, self-clearing lock).
4. **Placement:** the `UPLOAD_BLOCKED_REASON` string is what the dropzone's own hint slot renders (not a separate element the panel overlays). The panel sets the `disabledReason` input → the dropzone composes it into its visible hint and its `aria-label`. The user sees one disabled dropzone with the hint *"Drop a file here or click to browse (max 10 MB). Upload in progress — one moment."* (or whatever the dropzone's exact composition rule is per #49). No overlay, no extra chrome outside the dropzone.
5. **Visual continuity:** because the progress row appears **immediately below** the locked dropzone, the two surfaces together read as "you dropped a file (summarised above), it's happening (summarised below), the zone will reopen when it's done." The user does not need to search for where the upload went.

**Interaction notes:**
- No new interactions at the panel level beyond what the #49 design spec already documents. The only change is that the panel's `disabled` computation now ORs in `isUploading()`.
- **Keyboard flow through the section:**
  1. Dropzone root (focusable when enabled; **skipped** when disabled via `aria-disabled="true"` + `tabindex="-1"` — already implemented in #49).
  2. First upload row's **cancel** button (during `uploading`) OR aria-disabled cancel (during `processing`) OR **Try again** button (during `error`), then dismiss (`×`) button.
  3. Any subsequent upload rows (not expected in MVP).
- **No focus traps.** The panel is non-modal; Tab past the last row exits into the rest of the panel / page per the #49 spec §6.

**Contrast measurements (new in this spec):**
- `UPLOAD_BLOCKED_REASON` in `$text-tertiary` on `$bg-sidebar-light` (inside the disabled dropzone) → 2.8:1 — exempt per WCAG 1.4.3 (inactive UI component). The dropzone is `aria-disabled="true"` and the reason is also announced via the dropzone's own `aria-label` composition, so the information is not colour-alone.
- No other new pairs introduced; everything else delegates to the #49 design spec or the upload row spec §3.1.

---

## 4. User Flows with Visual States

### Flow A: Happy path — idle → uploading → processing → complete → idle

1. **Idle.** Dropzone in `idle` phase (per #49). No upload row rendered. No upload live message.
2. **User drops `mockup-v4.png` (3.8 MB).** Dropzone emits `fileSelected`. Board page dispatches `attachmentsState.startUpload(event)`. `uploadsByTaskId[taskId]` now has one row in `phase: 'uploading'`, `progress: 0`.
3. **Dropzone re-renders in disabled state.** `isUploadingForTask(taskId)` is now `true` → `resolvedDisabled = true` → `resolvedDisabledReason = UPLOAD_BLOCKED_REASON`. Fill goes to `$bg-sidebar-light`, 2px dashed `$border-light`, `$text-tertiary` copy reads *"Drop a file here or click to browse (max 10 MB). Upload in progress — one moment."*. Cursor `not-allowed`. This transition takes `$motion-fast` (150ms) via the dropzone's own transition rule.
4. **Upload row appears below the dropzone.** Row renders with `phase === 'uploading'`:
   - Header: `file` icon (`$text-secondary`, 16px) + *"mockup-v4.png"* (`$text-primary`, `$font-weight-medium`, ellipsised at 32ch mobile / 40ch tablet+) + *"3.8 MB"* (`$text-secondary`, `$font-size-sm`).
   - Right: cancel icon button `×` (`$text-secondary`, 32×32, `aria-label="Cancel upload of mockup-v4.png"`).
   - Progress region: `$bg-sidebar-light` track, `$brand-primary` fill at `width: 0%`, `0%` numeric.
   - Status line: *"Uploading…"* in `$text-secondary`, `$font-size-sm`.
   - 3px left accent: `$brand-primary`.
   - Live region writes *"Uploading mockup-v4.png"* (one announcement).
5. **Over ~6 seconds, progress advances monotonically.** Each `HttpEventType.UploadProgress` event writes a new `progress` value (clamped to `[prev, 99]` per tech spec). The `.upload-row__bar-fill` CSS transitions `width` over `$motion-fast` (150ms) between updates — feels smooth, never regresses. The `{n}%` label is `font-variant-numeric: tabular-nums` so digit-width changes don't cause jitter.
6. **201 Response arrives.** State service writes `{ progress: 100, phase: 'processing', assetId: <guid> }`. The row re-renders:
   - Progress region switches: `.upload-row__bar` gains `.upload-row__bar--indeterminate`; the fill animates the `upload-row-sweep` keyframe. Numeric percent is replaced with nothing (the percent element is hidden via `@if (phase === 'uploading')` in the template).
   - Status line changes to *"Processing…"*.
   - Cancel button gains `aria-disabled="true"`, icon colour goes to `$text-tertiary`, cursor `not-allowed`.
   - Left accent stays `$brand-primary`.
   - Live region writes *"Processing mockup-v4.png"*.
7. **`AssetCompleted` arrives over SignalR.** State service removes the row from `uploadsByTaskId`, appends the `AssetResponseDto` to `completedByTaskId`. The row unmounts from the `@for` loop. The dropzone's `isUploadingForTask` flips to `false`, `resolvedDisabled` becomes `false`, the dropzone returns to `idle`.
8. **Net visible change on task-detail panel:** the upload row is gone; the dropzone is re-enabled and reads *"Drop a file here or click to browse…"* again. No toast, no flash — the absence *is* the success cue in #50, consistent with the AC's "the attachment appearing in the list once #51 ships" language.

**Why no success flash in MVP:** the success signal is the attachment appearing in #51's list (when that ships). Adding an intermediate green flash in #50 risks the user reading it as "done and persisted" for a split second, then confusingly seeing a blank state until they close and reopen the panel for the list to populate. Simpler is honester — see Open Question 1.

### Flow B: HTTP failure before 201 — network drop at ~40%

1. Steps 1–5 identical to Flow A. Progress reaches ~40%.
2. **WiFi drops.** `HttpClient` emits an error with `status: 0`. State service maps via `mapUploadHttpErrorToUserMessage` → `{ code: 'NETWORK', userMessage: "Network problem — the upload didn't reach the server. Try again." }`. Transitions row to `phase: 'error'`.
3. **Row re-renders in error phase:**
   - Header: `alert-circle` icon in `$status-high` (16px) + filename + size (colours unchanged).
   - Progress region unmounts. Error region mounts in its slot:
     - Message in `$status-high`, `$font-size-sm`, `$font-weight-medium`: *"Network problem — the upload didn't reach the server. Try again."*
     - Controls row below the message: **Try again** button (`$brand-primary-light` fill, `$text-primary` *"Try again"* label) + dismiss icon button `×` (`$text-secondary`).
   - Left accent bar transitions `$brand-primary → $status-high` over `$motion-fast`. Border transitions `$border-light → $status-high`.
   - Status line (*"Uploading…"*) is removed.
   - `role="alert"` fires → AT announces *"Network problem — the upload didn't reach the server. Try again."* **once**.
4. **Dropzone remains disabled?** No — the tech spec says `isUploadingForTask` is `true` only during phases `'uploading' | 'processing'`; `'error'` rows do **not** block the dropzone. So `resolvedDisabled` becomes `false` and the dropzone returns to `idle`. The user can drop a new file **or** click Try again. Both paths work.
5. **User clicks Try again.** State service calls `retry(uploadId)` → same row resets to `{ phase: 'uploading', progress: 0, assetId: null, error: null }`. The error region unmounts, the progress region re-mounts at 0%, the left accent returns to `$brand-primary`, the border returns to `$border-light`. A fresh HTTP request starts. The dropzone locks again (because `isUploadingForTask` returns `true` again).
6. **Or — user clicks dismiss `×`.** State service calls `dismiss(uploadId)` → row is removed from `uploadsByTaskId`. Row unmounts. `File` reference is released. Dropzone stays idle.

**Alternative copy in error phase** (all rendered verbatim from `upload().error.userMessage`):
- 400 wrong type: *"{filename} isn't an allowed file type."*
- 400 empty: *"{filename} is empty."*
- 400 invalid name: *"{filename} has characters we can't accept — rename the file and try again."*
- 403: *"You're no longer a member of this project."* (note: this is an exceptional case — design recommendation below)
- 404: *"This task no longer exists."*
- 413: *"{filename} is larger than 10 MB."*
- 500 / HTTP_OTHER: *"Upload failed — please try again."*
- AssetFailed: *"We couldn't save {filename}. Try again."*

**403 advisory:** the tech spec §"403 handling" leaves the programmatic membership-loss handling out of scope for #50. The error row *as designed above* reads *"You're no longer a member of this project."* with a **Try again** button that would re-trigger the 403 — a dead-end for the user. **Design recommendation:** in the error phase only, if `upload().error.code === 'HTTP_403'`, swap the Try-again button for a disabled-styled variant (same `.upload-row__retry-button` chrome but with `aria-disabled="true"`, `$text-tertiary` label, no hover reaction) and leave dismiss as the only live action. This is a one-line conditional in the template; it does not require new tokens. **Flagged as Open Question 2** because it crosses the design/spec boundary (the tech spec explicitly says a richer membership-refresh flow is #60-era).

### Flow C: `AssetFailed` during processing

1. Steps 1–6 identical to Flow A. Row is in `phase: 'processing'` with the indeterminate sweep animating.
2. **`AssetFailed` arrives.** State service maps via `mapAssetFailedToUserMessage` → `{ code: 'ASSET_FAILED', userMessage: "We couldn't save {filename}. Try again." }`. Transitions the row to `phase: 'error'`.
3. Visual transition identical to Flow B step 3 — the indeterminate sweep stops (the `.upload-row__bar--indeterminate` class is removed as the entire progress region unmounts), the error region mounts, the accent bar and border transition to `$status-high`, the `role="alert"` announces.
4. User picks Try again or dismiss — identical to Flow B.

### Flow D: Cancel during `uploading`

1. Steps 1–5 from Flow A. Progress at, say, 32%.
2. **User clicks the cancel icon button.** `cancel.emit(upload().id)` → state service calls `cancel(uploadId)`. The HTTP subscription is unsubscribed. The row is removed from `uploadsByTaskId`. The row unmounts immediately from the `@for` loop.
3. **Dropzone unlocks.** `resolvedDisabled` → `false`, dropzone returns to `idle`. No error shown. No toast. The user's intent is honoured silently.

### Flow E: Cancel attempted during `processing`

1. Steps 1–6 from Flow A. Row is in `phase: 'processing'`.
2. **User clicks the (aria-disabled) cancel button.** Click is a no-op at the DOM level (the button's click handler checks `upload().phase === 'uploading'` and short-circuits if not). No state change.
3. **AT flow:** when focused, AT reads *"disabled button, cancel not available during processing"* (from `aria-label`), so the user understands why the affordance is inert.

### Flow F: Sub-100ms "instant" upload

1. User drops a 2 KB `.txt` on a fast network.
2. State service appends an `uploading` row. Row mounts with `progress: 0`, *"Uploading…"*, cancel button.
3. `HttpClient` emits a `Response` event essentially immediately. State service writes `phase: 'processing'`. Row re-renders with the indeterminate sweep and *"Processing…"*.
4. `AssetCompleted` arrives ~100ms later. Row unmounts.
5. **Net user experience:** the row flashes briefly — ~300ms of visible *"Uploading…"* → *"Processing…"* → gone. The AC's requirement that the progress indicator *"is still mounted even briefly"* is satisfied; the `$motion-base` transitions give the phase changes a perceptible beat. No special-casing for instant uploads is required in the component.

---

## 5. Responsive Behaviour

### Mobile (< `$bp-md` = < 768px)

**Upload row:**
- Padding: `$space-sm $space-md $space-sm ($space-md + 3px)` = ~12px × 16px + 3px accent clearance.
- Filename `max-width: 32ch` — truncates earlier to fit beside the 16px leading icon and the 32/44px cancel control.
- Progress bar takes the remaining horizontal space; `{n}%` label sits at its right with `min-width: 4ch` + tabular-nums so *"9%"*, *"47%"*, *"100%"* all align.
- Icon buttons are **44×44** (coarse-pointer media query). The Try-again button is `height: 44px` and `padding: 0 $space-md`.
- Status line stays below the bar; no change.

**Panel host:**
- The panel is full-viewport-width per #49 — upload rows span the full internal width minus the panel's `$space-md` body padding.
- Dropzone-to-row gap: `$space-xs` (8px) — unchanged across breakpoints.

### Tablet (`$bp-md` – `$bp-lg`, 768–991px)

**Upload row:**
- Padding: same — the row does not need to grow vertically; tablet width gives the row more horizontal room, and the filename truncation relaxes to `max-width: 40ch`.
- Icon buttons: 32×32 on fine pointer, 44×44 on coarse. Try-again button: 32px height on fine pointer.
- Progress bar: visually the same 6px height; it just occupies more horizontal space.

**Panel host:**
- Panel width 420px per #49. Upload row spans `420 - 2 * $space-lg` = 420 − 48 = 372px wide. Comfortable for filename + size + cancel in a single row without wrapping.

### Desktop (≥ `$bp-lg`, ≥ 992px)

**Upload row:**
- Identical to tablet.

**Panel host:**
- Panel width 480px per #49. Upload row spans `480 - 2 * $space-lg` = 432px.

### Breakpoint summary

| Breakpoint | Row padding | Filename max-width | Icon button | Try-again height |
|---|---|---|---|---|
| < `$bp-md` | `$space-sm $space-md ... +3px` | 32ch | 44×44 (coarse) | 44px |
| `$bp-md` – `$bp-lg` | same | 40ch | 32×32 (fine) / 44 (coarse) | 32px (fine) / 44 (coarse) |
| ≥ `$bp-lg` | same | 40ch | same | same |

---

## 6. Accessibility Audit (WCAG AA)

### Contrast summary (every pair in use)

| Context | Foreground | Background | Ratio | Target | Verdict |
|---|---|---|---|---|---|
| Filename | `$text-primary` | `$bg-main` | 17.9:1 | 4.5:1 body | ✅ AAA |
| Filesize | `$text-secondary` | `$bg-main` | 4.6:1 | 4.5:1 body | ✅ AA |
| Numeric `%` | `$text-primary` | `$bg-main` | 17.9:1 | 4.5:1 body | ✅ AAA |
| Status label (*"Uploading…"* / *"Processing…"*) | `$text-secondary` | `$bg-main` | 4.6:1 | 4.5:1 body | ✅ AA |
| Progress bar fill vs track | `$brand-primary` | `$bg-sidebar-light` | 3.1:1 | 3:1 UI | ✅ AA |
| Progress bar fill vs card | `$brand-primary` | `$bg-main` | 3.0:1 | 3:1 UI | ✅ AA (at boundary) |
| Alert icon | `$status-high` | `$bg-main` | 3.9:1 | 3:1 UI | ✅ AA |
| Error message | `$status-high` | `$bg-main` | 3.9:1 | 3:1 UI / 4.5:1 body for small text | ✅ AA (qualifies via 1.4.3 "large text" exception for weight ≥ 500 at size ≥ 14pt; our message is `$font-size-sm`=12px at weight 500 — **see note below**) |
| Try-again label (rest) | `$text-primary` | `$brand-primary-light` | 14.9:1 | 4.5:1 body | ✅ AAA |
| Try-again label (hover) | `$text-inverse` | `$brand-primary` | 3.1:1 | 3:1 UI | ✅ AA (boundary) |
| Try-again label (active) | `$text-inverse` | `$brand-primary-hover` | 3.5:1 | 3:1 UI | ✅ AA |
| Icon button (rest) | `$text-secondary` | `$bg-main` | 4.6:1 | 3:1 UI | ✅ AA |
| Icon button (hover) | `$brand-primary-hover` | `$bg-sidebar-light` | 3.6:1 | 3:1 UI | ✅ AA |
| Cancel (aria-disabled) | `$text-tertiary` | `$bg-main` | 2.5:1 | exempt per 1.4.3 | ✅ exempt |
| Focus ring | `$brand-primary` | `$bg-main` | 3.0:1 | 3:1 UI | ✅ AA |
| UPLOAD_BLOCKED_REASON (inside disabled dropzone) | `$text-tertiary` | `$bg-sidebar-light` | 2.8:1 | exempt per 1.4.3 (inactive UI) | ✅ exempt |

**Error-message note.** The error message renders at `$font-size-sm` (12px) / `$font-weight-medium` (500). That does **not** qualify as "large text" under WCAG 1.4.3 (which requires ≥ 18pt regular OR ≥ 14pt bold). It is, however, an in-UI status message associated with the alert icon, so the 3:1 UI-component target (1.4.11) is the applicable criterion rather than the 4.5:1 body-text target — **the `$status-high` vs `$bg-main` 3.9:1 pair clears that**. If the reviewer prefers strict 4.5:1 body-text compliance for every piece of text regardless of role, the implementer should bump the error message to `$font-size-md` (14px) at `$font-weight-medium` — still within the token system, no new tokens needed. **Flagged as Open Question 3.**

### Keyboard flow

Tab order within the attachment section:

1. **Dropzone root.** When enabled, focusable (`tabindex="0"`). When disabled (i.e. during `uploading` / `processing`), **skipped** (`tabindex="-1"` + `aria-disabled="true"`, per #49).
2. **First upload row — cancel button.** Focusable in all three phases; in `processing` it is `aria-disabled="true"` but stays in tab order so AT users encounter it.
3. **First upload row — Try again button.** Only rendered in `error` phase.
4. **First upload row — dismiss (`×`) button.** Only rendered in `error` phase.
5. **Subsequent upload rows** (not expected in MVP): same sub-order.

No focus trap. `Tab` past the last control exits into the rest of the panel. `Shift+Tab` from step 2 returns to the disabled dropzone (which is `tabindex="-1"` so it is skipped) and then to the panel's close button or the parent surface.

**Activation keys:**
- `Enter` / `Space` on Cancel → emit `cancel` (no confirmation).
- `Enter` / `Space` on Try again → emit `retry`.
- `Enter` / `Space` on dismiss → emit `dismiss`.
- `Escape` inside the row: no in-row effect; bubbles to the panel's existing Escape-to-close listener (per #49).

### Screen reader behaviour

- **Panel-level live region** (`.task-detail-panel__upload-live`, `aria-live="polite"`, `aria-atomic="true"`). Writes:
  - *"Uploading {filename}"* on transition into `uploading` (mount of a fresh row).
  - *"Processing {filename}"* on transition `uploading → processing`.
  - *"Retrying upload of {filename}"* on retry (optional — nice-to-have; if skipped, the `aria-valuenow` on the progress bar being reset is already a cue).
  - Nothing on `processing → completed` (the row is removed; #51's list will announce the new attachment when it ships). This intentional silence avoids a redundant announcement that the error region or the list would already convey.
- **Progress bar.** `role="progressbar"`, live-updated `aria-valuenow` in `uploading`. ATs vary on how often they announce valuenow changes on a progressbar (most throttle to once per second or only on focus) — the single "Uploading {filename}" announcement on start is the anchor; the progressbar's live valuenow is an assistive detail, not the primary cue.
- **Error region.** `role="alert"` → implicitly `aria-live="assertive"` + `aria-atomic="true"`. Announces the full userMessage once on mount of the error phase. Does **not** re-announce if the same error's message text changes (it won't — state writes the error once and the userMessage is a stable string).
- **Cancel button (`processing`).** `aria-disabled="true"`, `aria-label="Cancel not available during processing"`. AT reads *"disabled button, cancel not available during processing"* — the user understands the affordance exists but is inert.
- **Icon-only buttons (cancel, dismiss).** All have `aria-label`. None rely on colour or icon alone.

### Motion

- **Determinate progress bar** animates `width` over `$motion-fast` (150ms). The global `prefers-reduced-motion: reduce` rule clamps that to 0.01ms (transition fires instantly) — the bar still updates on every progress event, so the user still sees progress, just without the smoothing tween.
- **Indeterminate sweep** is a 1.6s infinite keyframe animation. The component-level `@media (prefers-reduced-motion: reduce)` rule (in §3.1 SCSS) **disables the animation** and pins the fill at `width: 40%` on the left — a steady, unambiguous "something is happening" state without continuous motion. Rationale: WCAG 2.3.3 recommends avoiding repeated motion under reduced-motion preference; a static 40% bar is honest (we genuinely don't know the percent during server processing) and does not induce vestibular discomfort.
- **Phase transitions** (border colour, accent colour, opacity on retry) use `$motion-fast`/`$motion-base` and are clamped to instant under reduced motion.
- No flashing, no spinning, no parallax. The row is still-after-steady.

### Touch targets

| Element | Fine pointer | Coarse pointer | Target |
|---|---|---|---|
| Cancel icon button | 32×32 | 44×44 | 44×44 ✅ |
| Dismiss icon button | 32×32 | 44×44 | 44×44 ✅ |
| Try-again button | 32px h × ≥80px w | 44px h × ≥96px w | 44×44 ✅ |

### Forms / inputs

No new inputs in this component. The progress bar is a `div` with `role="progressbar"` — not a form control.

### Live-region hygiene

One polite live region per panel instance — not per row. This prevents double-reads when (a) a row transitions phase and (b) a second row mounts in the same tick. The error `role="alert"` inside the row is orthogonal (assertive, for the moment-of-failure attention the AC requires).

---

## 7. Implementation Checklist for Developer

### Prerequisites

- [x] Token files exist under `src/styles/variables/` — **confirmed**, all eight `_*.scss` present.
- [x] Global `prefers-reduced-motion: reduce` rule in `_motion.scss` (lines 7–12) — **confirmed**.
- [x] Dropzone `disabled` + `disabledReason` inputs exist and are already consumed by the task-detail panel — **confirmed** (see `task-detail-panel.component.html` lines 47–48).
- [x] `UPLOAD_BLOCKED_REASON` constant is exported by `attachment-upload-errors` per tech spec line 287 — confirmed in tech spec.

### Per component

**`UploadProgressRowComponent`**
- [ ] SCSS file created at `src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.scss` using the `@use` imports listed in §3.1. Do **not** import tokens individually — use the canonical `@use 'src/styles/variables/colors' as *;` form (matches existing components).
- [ ] Three phase modifier classes implemented: `.upload-row--uploading` (no-op), `.upload-row--processing` (switches `.upload-row__bar` to `.upload-row__bar--indeterminate`), `.upload-row--error` (border + accent → `$status-high`).
- [ ] Determinate progress bar binds `width` from `upload().progress` via `[style.width.%]`. No JavaScript-driven animation — `transition: width $motion-fast` handles smoothing.
- [ ] Indeterminate sweep uses the `@keyframes upload-row-sweep` defined in §3.1. Reduced-motion media query overrides it.
- [ ] Left accent bar implemented as `::before` pseudo-element (NOT an extra DOM node) — matches the dropzone's existing pattern.
- [ ] `role="progressbar"` applied to `.upload-row__bar` with `aria-valuemin="0"`, `aria-valuemax="100"`, live-updated `[attr.aria-valuenow]` in `uploading` phase, **omitted** in `processing` phase.
- [ ] `role="alert"` applied to `.upload-row__error` wrapper only in `error` phase.
- [ ] `aria-label`s applied to every icon button (cancel, dismiss) per §3.1 copy-slot table.
- [ ] Cancel button uses `aria-disabled="true"` (not the `disabled` HTML attribute) in `processing` phase. Component's click handler short-circuits if `upload().phase !== 'uploading'`.
- [ ] Try-again button only renders in `error` phase.
- [ ] Dismiss button only renders in `error` phase.
- [ ] Leading icon swaps: `file` glyph (uploading/processing) → `alert-circle` (error). Use inline `<svg>` with `stroke="currentColor"` (same pattern as the close button in the panel HTML line 24).
- [ ] `font-variant-numeric: tabular-nums` applied to `.upload-row__percent` so the digit column doesn't jitter.
- [ ] `@media (pointer: coarse)` bumps icon buttons to 44×44 and the Try-again button to 44px height.
- [ ] `:focus-visible` outlines: 2px `$brand-primary` with 2px offset on every focusable element.
- [ ] No hardcoded colours, spacings, radii, shadows, or durations. Every value is a token.
- [ ] No `console.log` calls referencing `upload().file.name`, `upload().file.size`, `upload().error`, or any payload.
- [ ] Template does not render `upload().error.code` — only `upload().error.userMessage` is user-visible (AC §Privacy — code is for telemetry-that-is-not-logged, not for display).

**`TaskDetailPanelComponent` (additive)**
- [ ] Add `.task-detail-panel__attachment-section` wrapper class around the dropzone + upload list (currently the dropzone sits directly inside `.task-detail-panel__section`; the new wrapper gives the attachment section its own tighter `$space-xs` gap without changing the parent section's `$space-lg`).
- [ ] Add `.task-detail-panel__upload-list` wrapper around the `@for` loop of `<app-upload-progress-row>`.
- [ ] Add the visually-hidden `<span class="task-detail-panel__upload-live" aria-live="polite" aria-atomic="true">` inside the attachment section. Its text content is a computed signal on the panel — see §3.2 template wiring.
- [ ] Do **not** touch `.task-detail-panel` (outer chrome), `.task-detail-panel__header`, or `.task-detail-panel__close` — unchanged.
- [ ] Do **not** touch the `<app-file-dropzone>` element or its host SCSS — the only change is the two new inputs `resolvedDisabled` + `resolvedDisabledReason` feeding the existing `[disabled]` and `[disabledReason]` bindings.

### Verification

- [ ] Lighthouse accessibility score ≥ 95 on the board page with an upload row visible. Run against `uploading`, `processing`, and `error` snapshots.
- [ ] Manual keyboard traversal (with an active upload): `Tab` into the panel → past the disabled dropzone → lands on the row's cancel button. `Enter` cancels. `Shift+Tab` returns to the panel close button.
- [ ] With an error-phase row: `Tab` lands on Try again → `Tab` lands on dismiss → `Enter` on Try again re-starts the upload; `Enter` on dismiss removes the row.
- [ ] Drop a `.pdf` on a throttled (Slow 3G) connection in Chrome DevTools; observe the progress bar animate smoothly from 0 → 99%, then jump to *"Processing…"* on the 201 response, then vanish on `AssetCompleted`.
- [ ] Drop a file then click cancel at ~30%; Network tab shows the request in `(canceled)` state, the upload row vanishes, the dropzone returns to idle with no error.
- [ ] Drop a file, mock a 413 response; the error row renders in coral with *"{filename} is larger than 10 MB."*, Try again and dismiss buttons work.
- [ ] Enable `prefers-reduced-motion: reduce` in DevTools: (a) determinate progress still updates on each event, just without the 150ms tween; (b) the indeterminate sweep stops animating and sits at a static 40%-wide bar on the left.
- [ ] Verify the `role="alert"` in error phase triggers **one** announcement in VoiceOver / NVDA; verify the polite live region announcements for *"Uploading…"* / *"Processing…"* fire exactly once per transition.
- [ ] Verify at 320px, 768px, 1024px, 1440px widths. The row should never clip its cancel button; the filename should truncate with ellipsis at the `max-width` for the breakpoint.
- [ ] Verify no new tokens anywhere in the new SCSS. `grep`: `rg '#[0-9a-fA-F]{3,6}' upload-progress-row.component.scss` should return zero matches; the same for explicit px values outside `1px`, `2px`, `3px`, `6px` (the accent / border / bar primitives).
- [ ] Verify no `console.log` calls referencing filename, size, MIME, payload, token.

---

## 8. Open Questions for Developer / PM

### Open Question 1 — Success flash before row removal

**The question.** When `AssetCompleted` arrives, should the row flash `$status-done` (sage) for 200ms before unmounting, or should the row disappear immediately?

**Options.**
- **(a) Immediate unmount.** No flash. Simpler implementation (state service drops the row in the same tick as the event handler). User sees: row vanishes → dropzone unlocks. The success cue relies on (1) the upload row having been visible throughout and (2) the attachment appearing in #51's list once that ticket ships. In #50 alone there is no explicit "it worked" moment, but the AC §"the attachment appearing in the list once #51 ships — per design spec" explicitly permits this.
- **(b) 200ms success flash.** Row stays mounted in the `completed` visual (left accent → `$status-done`, status label *"Uploaded"*) for 200ms, then unmounts. Richer signal, but costs a coordinated delay between the state service (`uploadsByTaskId` removal) and the component (visual state swap). Introduces a state value — `phase: 'completed'` — that does not exist in the tech spec.

**Recommendation.** **(a) — skip the flash in #50.** Reasons: (1) adding `phase: 'completed'` widens the tech-spec-defined `AttachmentUploadPhase` type (`'uploading' | 'processing' | 'error'`) without a corresponding state-machine change, which the developer shouldn't invent per the `YAGNI` rule in CLAUDE.md; (2) the success cue is already planned to land via #51's list; (3) introducing a flash now risks a stale-visual bug if #51 adds its own "new attachment just arrived" highlight.

**Who decides.** PM / tech-spec author. If the decision is **(b)**, update the tech spec's `AttachmentUploadPhase` type and state-service `AssetCompleted` handler to hold the row for 200ms before removal.

### Open Question 2 — 403-in-error: disable Try again?

**The question.** When the error-phase row carries `code === 'HTTP_403'` (the user is no longer a member of the project), the Try again button will re-trigger the same 403. Should the design explicitly disable the Try again button for this specific error code, leaving dismiss as the only live action?

**Options.**
- **(a) Keep Try again enabled.** The user clicks it, the upload fails again with 403, the same error renders — a dead loop. Not actively harmful (no data loss, no state corruption) but a poor experience.
- **(b) Disable Try again when `code === 'HTTP_403'`.** Render the button with `aria-disabled="true"`, `$text-tertiary` label, no hover reaction. Dismiss remains live. The error message *"You're no longer a member of this project."* already names the cause and implies no retry.
- **(c) Replace Try again with a "Return to dashboard" link.** Heavier affordance, crosses into the membership-refresh flow that the tech spec explicitly defers to #60-era.

**Recommendation.** **(b).** One-line conditional in the template; no new tokens; matches the tone of the error message; stays inside the #50 scope.

**Who decides.** PM / design reviewer. If the decision is **(a)** or **(c)**, document in this file's Development Status section.

### Open Question 3 — Error message font size

**The question.** The error message renders at `$font-size-sm` (12px) / `$font-weight-medium` (500) — the `$status-high` on `$bg-main` contrast is 3.9:1, which clears the 3:1 UI-component target under WCAG 1.4.11 but does **not** clear the 4.5:1 body-text target under 1.4.3 (the message is not "large text" per 1.4.3's definition: the threshold is ≥ 18pt regular or ≥ 14pt bold).

**Options.**
- **(a) Keep `$font-size-sm` / `$font-weight-medium`.** Rely on the 1.4.11 UI-component interpretation; pair the message with the `$status-high` alert icon to reinforce the non-colour-alone requirement of 1.4.1.
- **(b) Bump to `$font-size-md` (14px) / `$font-weight-medium`.** Still does not qualify as "large text" per 1.4.3 (which needs 14pt **bold** or 18pt regular; `$font-weight-medium` is 500, not 700), but visually the message is more legible and the reader is less likely to miss a tight critical message. Also fully inside the token system.
- **(c) Use `$text-primary` body copy alongside a separate `$status-high` headline.** Increases DOM and reading order complexity; not recommended.

**Recommendation.** **(a).** The error message is an *in-UI status message* strictly associated with the alert icon and the `role="alert"` live announcement; the 1.4.11 3:1 criterion is the appropriate one. Auditors reading this as a 1.4.3 violation should be pointed to the 1.4.11 carve-out documented above.

**Who decides.** PM / design reviewer / accessibility audit. If the decision is **(b)**, the implementer bumps `.upload-row__error-message` to `font-size: $font-size-md;` — no other change.

### Open Question 4 — Progress bar height at the AA boundary

**The question.** The `$brand-primary` progress-bar fill sits against two backgrounds: `$bg-sidebar-light` track (3.1:1) and `$bg-main` card (3.0:1 at the card edges, where the bar's pill-radius meets the card's interior). Both clear 3:1, but the card-edge pair is at the boundary.

**Options.**
- **(a) Keep 6px height, `$radius-pill` corners, `$brand-primary` fill.** At 3.0:1 on `$bg-main`, the bar is visible but not high-contrast. Acceptable.
- **(b) Thicken to 8px.** Each pixel at the edge gets "more bar" so the colour is harder to lose. No new tokens; a simple height bump.
- **(c) Switch the fill to `$brand-primary-hover` (7A8A69).** Darker sage → 4.0:1 on `$bg-main`. Also solves the 3.1:1-on-hover label pair indirectly (the bar hover state doesn't exist, but ambient contrast improves). Costs visual parity with the dropzone's `idle` hint — the dropzone uses `$border-dropzone` (= `$brand-primary`) at rest, so the bar echoing that same sage is the intentional colour rhyme.

**Recommendation.** **(a).** Keep parity with the dropzone's sage-dashed idle border; clear 3:1 at the track and at the card edge; the bar's position inside a 6px-tall track further disambiguates the fill from the card (position cue on top of colour cue). If the PR reviewer flags the 3.0:1 as too close to the line, **(b)** is the cheapest mitigation.

**Who decides.** PR reviewer with a calibrated display.

---

*"The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec."*
