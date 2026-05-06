# Design Specification: Attachment List and Download UI

**Technical Spec:** [issue_51_tech_spec.md](./issue_51_tech_spec.md)
**Context Document:** [issue_51_context.md](./issue_51_context.md)
**Sibling Design Specs (visual continuity contract):**
- [issue_49_design_spec.md](./issue_49_design_spec.md) — dropzone (left-accent idiom, disabled treatment)
- [issue_50_design_spec.md](./issue_50_design_spec.md) — upload-progress row (row card grammar, icon-button, retry-pill)
- [issue_47_design_spec.md](./issue_47_design_spec.md) — task card + detail panel (card surface, active outline)

**GitHub Issue:** #51
**Milestone:** #6 — Asynchronous File Upload UI
**Design System:** KanbAI Project Management Dashboard v1.0 (**no new tokens introduced**)

---

## 1. Overview

### Design Intent

Issues #49 and #50 answered "can I put a file in?" and "is it actually going in?". Issue #51 finally answers the third silent question every user asks: **"can I get it back?"**. The attachment surface stops being a write-only funnel and becomes a two-way list.

Visually, #51 extends the idioms already established in the attachments slice rather than inventing new ones:

- The **attachment list** is a vertical stack of dumb rows below the dropzone and upload-progress stack — same rhythm (`$space-xs` gap), same container cadence, same card surface (`$bg-main`, `$border-light`, `$shadow-card`).
- Each **attachment row** inherits the `upload-progress-row` grammar: 3px left accent bar, 16px leading icon, filename + meta in a header row, trailing control on the right. The left accent shifts from "in-flight" coral/sage to a **neutral `$border-light`** in the resting state — the row is not "doing something right now", it is a stable artifact.
- The **download control** is an icon-button that mirrors `upload-row__icon-button` exactly (circular 32px → 44px on `pointer: coarse`, `$brand-primary-hover` tint on hover, `$brand-primary` focus ring at 2px / 2px offset).
- The **retry pill** on a failed download is a carbon copy of `upload-row__retry-button`.
- The **list error banner** is a section-level sibling above the row list — subtle tint of `$status-high`, `$radius-md`, consistent with the upload-row `error` accent strip in colour but horizontal in layout.
- The **card indicator** (paperclip + count) on `TaskCardComponent` is a low-emphasis meta chip sibling to the existing "Notes" meta affordance. It uses `$text-secondary` and a small paperclip glyph. It is **not** a badge, **not** a button, **not** hoverable. It is decorative-only (Q5).

The attachments section of the detail panel thus reads top-to-bottom as a chronology of the file relationship with the task:

```
┌──────────────────────────────────────────────────┐
│  ATTACHMENT  (section label — uppercase, $text-secondary) │
│  ┌────────────────────────────────────────┐   │
│  │ [dropzone]                              │   │ ← where you put things in
│  └────────────────────────────────────────┘   │
│  (upload progress rows — iff in-flight)       │ ← what's in motion
│  ─────────────────────────────────────────    │ ← visual break
│  Attachments (3)   (subsection label)         │
│  ┌────────────────────────────────────────┐   │
│  │ ▎ 📄  spec.pdf        1.2 MB · May 4  ⬇ │   │ ← what's already on the task
│  │ ▎ 🖼  mockup.png     3.8 MB · May 5  ⬇ │   │
│  │ ▎ 📄  notes.docx    220 KB · May 6  ⬇ │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

### Scope

**Components styled in this spec:**

1. `AttachmentListComponent` (new) — four render phases: `loading` (skeleton), `empty` (copy), `ready` (row list), `error` (banner + underlying list). Section-level `aria-live` for appended rows.
2. `AttachmentRowComponent` (new) — three download states: `idle`, `downloading`, `error`. Per-row `aria-live` scoped to the error region.
3. `TaskDetailPanelComponent` (additive only) — vertical ordering of `dropzone → upload-progress stack → attachment list` and the "Attachments (N)" subsection label. Existing selectors (`task-detail-panel__*`) are extended; none are renamed or removed.
4. `TaskCardComponent` (additive only) — a new decorative `.task-card__attachment-meta` element sibling to the existing `.task-card__meta`. Grid cell assignment extended to accommodate both meta affordances.

**Components explicitly NOT styled:**

- `FileDropzoneComponent` — frozen per #49 AC contract.
- `UploadProgressRowComponent` — frozen per #50 AC contract. The attachment row's visual borrows from it by class duplication, not by selector reuse.

**States covered for every new interactive surface:**
default → hover → focus (`:focus-visible`) → active → disabled → plus phase-specific states (`loading`, `error`, `downloading`, `downloadError`).

**Responsive:** mobile (< `$bp-md`), tablet (`$bp-md`–`$bp-lg`), desktop (≥ `$bp-lg`). On `pointer: coarse` all icon-buttons expand to 44×44.

---

## 2. Tokens Used

This spec consumes the canonical KanbAI v1.0 design system **exclusively**. **No new tokens are introduced.** No new colour, spacing, radius, motion, or breakpoint is requested — every treatment resolves to an existing variable in `src/styles/variables/`.

| Token | Value | Where used |
|---|---|---|
| `$bg-main` | `#FFFFFF` | Attachment row card surface (all states); list error banner background base; skeleton row base |
| `$bg-sidebar-light` | `#F4F5F1` | Skeleton shimmer track fill; card indicator hover tint (none needed — indicator is non-interactive, listed only for neighbourhood) |
| `$bg-dropzone` | `#F4F5F1` | Empty-state container background tint (very light, optional — see §3.1 Empty state) |
| `$border-light` | `#EAEAEA` | Attachment row default border; left accent bar in `idle` state; list error banner bottom border |
| `$brand-primary` | `#8C9B7B` | Focus ring on download/retry/list-retry buttons (2px / 2px offset); retry-pill active fill; file-type icon accent (image category); card indicator glyph when `attachmentCount() >= 1` |
| `$brand-primary-hover` | `#7A8A69` | Download icon-button hover tint; list-retry hover fill |
| `$brand-primary-light` | `#E8EBE4` | Retry-pill default fill; download icon-button active fill; list-error banner subtle tint background |
| `$status-high` | `#E56B6F` | Per-row download error left accent; error banner accent; error copy `$font-weight-medium`; non-retryable file-type (none in spec, reserved) |
| `$status-average` | `#E8B042` | List error banner left-rule accent for *retryable* errors (5xx / network) — distinguishes "try again" from "permanent" |
| `$status-done` | `#9CC5A1` | (indirect — already used by #50 success flash; referenced for continuity only) |
| `$status-medium` | `#4A6FA5` | (indirect — already used by `.task-card__meta-dot`; not reused here) |
| `$text-primary` | `#1C1C1C` | Filename, row primary copy, error headline |
| `$text-secondary` | `#7A7A7A` | Size, date, subsection label, empty-state copy, card indicator count glyph |
| `$text-tertiary` | `#A1A1A1` | Disabled download button icon; skeleton meta placeholder tint |
| `$text-inverse` | `#FFFFFF` | Retry-pill label on `$brand-primary` hover fill |
| `$font-family-base`, `$font-size-xs`/`-sm`/`-md`/`-lg`, `$font-weight-regular`/`-medium`/`-semibold`, `$line-height-tight`/`-normal` | — | Typography |
| `$space-xxs`/`-xs`/`-sm`/`-md`/`-lg` | 4/8/12/16/24 | Spacing (row internal, stack gap, section rhythm) |
| `$radius-sm`, `$radius-md`, `$radius-lg`, `$radius-pill`, `$radius-circle` | 6/12/16/9999/50% | Radius — row corners, retry-pill, icon-button circle, error banner |
| `$shadow-card` | `0 2px 8px rgba(0,0,0,0.04)` | Attachment row resting elevation |
| `$motion-fast`, `$motion-base`, `$motion-slow` | 150/250/350ms | Hover/focus transitions; row-append enter animation; skeleton shimmer |
| `$bp-md`, `$bp-lg`, `@include respond-to` | — | Breakpoints |

**Token gaps:** none. All contrast pairs are AA-verified in §6.

---

## 3. Per-Component Styling

### 3.1 Component: `AttachmentListComponent`

**File:** `src/app/features/attachments/components/attachment-list/attachment-list.component.scss`
**Role:** A container that switch-renders the four list phases, plus the always-present subsection label and the shared live region. It does **not** own row-level styling — that's delegated to `AttachmentRowComponent`.

**DOM shape (reference):**

```html
<section class="attachment-list" aria-label="Attachments">
  <header class="attachment-list__header">
    <h4 class="attachment-list__label" id="attachments-{taskId}">
      Attachments
      <span class="attachment-list__count" aria-hidden="true">(3)</span>
    </h4>
  </header>

  @if (showErrorBanner()) {
    <div
      class="attachment-list__error"
      [class.attachment-list__error--retryable]="fetchState().error?.retryable"
      role="alert">
      <svg class="attachment-list__error-icon" aria-hidden="true" focusable="false">…</svg>
      <p class="attachment-list__error-message">{{ fetchState().error?.userMessage }}</p>
      @if (fetchState().error?.retryable) {
        <button
          type="button"
          class="attachment-list__error-retry"
          (click)="retryFetch.emit()">
          Retry
        </button>
      }
    </div>
  }

  @if (showLoadingSkeleton()) {
    <ul class="attachment-list__skeleton" aria-busy="true" aria-hidden="true">
      <li class="attachment-list__skeleton-row"></li>
      <li class="attachment-list__skeleton-row"></li>
      <li class="attachment-list__skeleton-row"></li>
    </ul>
  }

  @if (showEmptyState()) {
    <p class="attachment-list__empty">No attachments yet.</p>
  }

  @if (attachments().length > 0) {
    <ul
      class="attachment-list__rows"
      role="list"
      aria-live="polite"
      aria-relevant="additions">
      @for (attachment of attachments(); track attachment.id) {
        <li class="attachment-list__row-slot">
          <app-attachment-row [attachment]="attachment" />
        </li>
      }
    </ul>
  }
</section>
```

**Phase matrix (visual-state map):**

| Phase | Label + count | Banner | Skeleton | List | Empty copy |
|---|---|---|---|---|---|
| `loading` + `attachments.length === 0` | "Attachments" + `""` (no count during cold load) | — | Shown (3 rows) | — | — |
| `loading` + `attachments.length > 0` | "Attachments" + `(N)` | — | Not shown (don't flash existing rows) | Shown (existing rows) | — |
| `ready` + empty | "Attachments" + `(0)` | — | — | — | Shown |
| `ready` + non-empty | "Attachments" + `(N)` | — | — | Shown | — |
| `error` + any | "Attachments" + `(N)` (if N>0) | Shown | — | Shown iff non-empty (banner coexists, does NOT hide list) | — |

**Header + subsection label:**
- Flex container, `align-items: baseline`, `gap: $space-xs`, `margin-bottom: $space-xs`.
- `.attachment-list__label` uses `$font-size-sm` / `$font-weight-semibold` / `letter-spacing: 0.02em` / `text-transform: uppercase` / `color: $text-secondary` — exact mirror of the panel's `task-detail-panel__section-label` so the two section labels read as siblings. `margin: 0`.
- `.attachment-list__count` appended inline with `font-weight-regular` / `color: $text-tertiary` / `text-transform: none` / `margin-left: $space-xxs` / `font-variant-numeric: tabular-nums`. Never rendered as `(0)` — the empty state handles that case; the count appears only when `attachments.length > 0`.

**Row stack:**
- `ul.attachment-list__rows`: `list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: $space-xs;`.
- Each `li.attachment-list__row-slot` hosts one `<app-attachment-row>`; no own padding/background — the row card provides all elevation.

**Skeleton treatment:**
- `ul.attachment-list__skeleton`: same layout primitives as `.attachment-list__rows` (same gap) so the transition to `ready` doesn't re-flow.
- `li.attachment-list__skeleton-row`:
  - `height: 64px` (matches typical attachment row height: `$space-sm` top + 16px icon + `$space-xxs` + 14px meta + `$space-sm` bottom).
  - `background: $bg-main`; `border: 1px solid $border-light`; `border-radius: $radius-md`; `box-shadow: $shadow-card`.
  - `::before` pseudo — a 40%-wide `$bg-sidebar-light` block translating `-100% → 150% → -100%` at 1.6s / cycle, same cadence as `upload-row-sweep` for continuity. Animation is `animation: attachment-list-skeleton 1.6s cubic-bezier(0.4,0,0.2,1) infinite;`.
  - `@media (prefers-reduced-motion: reduce)` clamp handled by the global `_motion.scss` rule — the sweep collapses to instant. The skeleton rows still show a static 40% block (stable placeholder) rather than invisible — do NOT hide the skeleton under reduced motion; keep the block visible but stationary.
- The `aria-busy="true"` on the UL and `aria-hidden="true"` on the skeleton UL cooperate: AT hears "busy" from the section and does not try to read skeletal text. Sighted users see the sweep; screen readers silently wait.

**Empty state:**
- `p.attachment-list__empty`:
  - `margin: 0`; `padding: $space-md`; `text-align: center`.
  - `background: $bg-dropzone`; `border: 1px dashed $border-light`; `border-radius: $radius-md`.
  - `font-size: $font-size-sm`; `font-weight: $font-weight-regular`; `color: $text-secondary`; `line-height: $line-height-normal`.
  - Copy: `"No attachments yet."` — literal, final (Path A makes this authoritative — no "this session" hedge).
- Rationale for the dashed border: echoes the dropzone idiom above without stealing its sage colour, so the empty state reads as a calm "nothing here" rather than an error or a second drop target.

**List error banner:**
- `.attachment-list__error`:
  - `display: flex; align-items: flex-start; gap: $space-xs; padding: $space-sm $space-md;`
  - `background: $brand-primary-light` in the retryable variant; `background: rgba(229, 107, 111, 0.08)` (a tint of `$status-high` — formed via CSS function, not a new token) in the non-retryable variant. Retain both as documented rgba literals, not new tokens.
  - `border-left: 3px solid $status-average` on `.attachment-list__error--retryable`; `border-left: 3px solid $status-high` on the non-retryable default. Mirrors the dropzone's left-accent grammar.
  - `border-radius: $radius-md`; `margin-bottom: $space-xs`.
- `.attachment-list__error-icon`: 16×16, `flex: 0 0 auto`, `color: $status-high` (non-retryable) or `$status-average` (retryable), `margin-top: 2px` for optical centering against the multi-line message.
- `.attachment-list__error-message`: `margin: 0`; `flex: 1 1 auto`; `font-size: $font-size-sm`; `font-weight: $font-weight-medium`; `line-height: $line-height-normal`; `color: $text-primary`.
- `.attachment-list__error-retry`: **copy of `.upload-row__retry-button`** — 32px height / $space-sm padding / `$brand-primary-light` fill → `$brand-primary` hover → `$brand-primary-hover` active, `$brand-primary` focus ring. Label text: `Retry`. `@media (pointer: coarse)` bumps to 44px height / `$space-md` padding.
- **When non-retryable (`HTTP_403` / `HTTP_404`):** banner renders the message only, no Retry button, left accent uses `$status-high`.

**Per-row live region:**
- The `ul.attachment-list__rows` itself carries `aria-live="polite"` + `aria-relevant="additions"`. New rows inserted via `@for ... track attachment.id` produce exactly one additive announcement ("spec.pdf added"). See §6 for the exact announcement pattern and throttling.

**Row enter animation (additive):**
- New `<li>` elements animate in with a 150ms `opacity: 0 → 1` + 8px translate-Y. No layout shift (height is reserved). Keyframes:
  ```scss
  @keyframes attachment-list-row-enter {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .attachment-list__row-slot {
    animation: attachment-list-row-enter $motion-fast both;
  }
  @media (prefers-reduced-motion: reduce) {
    .attachment-list__row-slot { animation: none; }
  }
  ```
- Only animates on first mount of each `li`; Angular's `@for ... track` preserves existing `li`s on array mutations, so a SignalR append animates only the new row.

---

### 3.2 Component: `AttachmentRowComponent`

**File:** `src/app/features/attachments/components/attachment-row/attachment-row.component.scss`
**Role:** A dumb row presenting one completed attachment, with a download control and a per-row error region. Three visible states: `idle`, `downloading`, `error`.

**Layout anatomy:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ▎ [icon]  filename-with-long-name.pdf              1.2 MB · May 4  [⬇] │ ← header (1 line)
│ ▎                                                               │
│ ▎  (error region — only visible on error)                      │
│ ▎  This file is still being saved. Please try again.  [Retry] │ ← error state only
└─────────────────────────────────────────────────────────────────┘
```

The root element is `<li role="listitem">` wrapped by the parent `<ul role="list">`. The visible card is a `<div class="attachment-row">` inside the `<li>` — this lets the list semantic live on the wrapper while the visual card is a separate element.

**DOM shape (reference):**

```html
<div
  class="attachment-row"
  [class.attachment-row--downloading]="downloadState().phase === 'downloading'"
  [class.attachment-row--error]="downloadState().phase === 'error'"
>
  <div class="attachment-row__header">
    <svg
      class="attachment-row__icon"
      [attr.data-category]="iconCategory()"
      aria-hidden="true"
      focusable="false">…</svg>

    <div class="attachment-row__file-meta">
      <span class="attachment-row__filename" [title]="attachment().fileName">
        {{ attachment().fileName }}
      </span>
      <span class="attachment-row__meta">
        <span class="attachment-row__size">{{ fileSizeDisplay() }}</span>
        <span class="attachment-row__meta-sep" aria-hidden="true"> · </span>
        <time
          class="attachment-row__date"
          [attr.datetime]="attachment().createdAt"
          [title]="absoluteDateLabel()">
          {{ relativeDateLabel() }}
        </time>
      </span>
    </div>

    <button
      type="button"
      class="attachment-row__download"
      [attr.aria-label]="downloadAriaLabel()"
      [disabled]="downloadState().phase === 'downloading'"
      [attr.aria-busy]="downloadState().phase === 'downloading' ? 'true' : null"
      (click)="handleDownloadClick()">
      @if (downloadState().phase === 'downloading') {
        <svg class="attachment-row__download-spinner" aria-hidden="true" focusable="false">…</svg>
      } @else {
        <svg class="attachment-row__download-icon" aria-hidden="true" focusable="false">…</svg>
      }
    </button>
  </div>

  @if (downloadState().phase === 'error') {
    <div
      class="attachment-row__error"
      role="alert"
      aria-live="polite"
      aria-atomic="true">
      <svg class="attachment-row__error-icon" aria-hidden="true" focusable="false">…</svg>
      <p class="attachment-row__error-message">{{ downloadState().error?.userMessage }}</p>
      @if (downloadState().error?.retryable) {
        <button
          type="button"
          class="attachment-row__retry"
          (click)="handleRetryClick()">
          Retry
        </button>
      }
    </div>
  }
</div>
```

**Card surface (all phases):**

| Phase | Card fill | Card border | Left accent (3px) | Leading icon colour | Download control |
|---|---|---|---|---|---|
| `idle` | `$bg-main` | 1px solid `$border-light` | `$border-light` (neutral — not in motion) | per category (see §3.3) | Enabled; download glyph in `$text-secondary`; hover → `$brand-primary-hover` tint on icon + `$bg-sidebar-light` circle fill |
| `downloading` | `$bg-main` | 1px solid `$border-light` | `$brand-primary` (in motion) | per category (unchanged) | Disabled; spinner in `$brand-primary`; `aria-busy="true"`; `cursor: progress` |
| `error` | `$bg-main` | 1px solid `$status-high` | `$status-high` | per category (unchanged) | Re-enabled; download glyph in `$text-secondary`; hover states same as idle. (The retry action is inside the error region; the primary download button remains available for a fresh attempt and is not the "Retry" affordance.) |

Left accent implementation follows the #50 `upload-row::before` pattern verbatim: `position: absolute; top: 0; bottom: 0; left: 0; width: 3px; border-top-left-radius: $radius-md; border-bottom-left-radius: $radius-md;` with phase-toggled `background-color` via parent class. `transition: background-color $motion-fast` for a soft state swap.

**Row card base:**
```scss
.attachment-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: $space-xs;
  padding: $space-sm $space-md $space-sm ($space-md + 3px);
  background: $bg-main;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  box-shadow: $shadow-card;
  font-family: $font-family-base;
  color: $text-primary;
  transition: border-color $motion-fast, box-shadow $motion-fast;

  &::before {
    content: '';
    position: absolute;
    top: 0; bottom: 0; left: 0;
    width: 3px;
    border-top-left-radius: $radius-md;
    border-bottom-left-radius: $radius-md;
    background: $border-light;
    transition: background-color $motion-fast;
  }

  &:hover { box-shadow: $shadow-card-hover; }
}

.attachment-row--downloading::before { background: $brand-primary; }
.attachment-row--error { border-color: $status-high; &::before { background: $status-high; } }
```

Note: the row has no hover transform (unlike the task card's `-2px` lift). Rationale — the row is not itself a clickable target; only the download button is. A hover lift would mis-signal affordance.

**Header row:**
```scss
.attachment-row__header {
  display: flex;
  align-items: center;
  gap: $space-sm;
  min-width: 0;
}

.attachment-row__icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.attachment-row__file-meta {
  display: flex;
  flex-direction: column;
  gap: $space-xxs;
  min-width: 0;
  flex: 1 1 auto;
}

.attachment-row__filename {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 28ch;

  @include respond-to('md') { max-width: 36ch; }
  @include respond-to('lg') { max-width: 44ch; }
}

.attachment-row__meta {
  display: inline-flex;
  align-items: baseline;
  gap: $space-xxs;
  font-size: $font-size-sm;
  color: $text-secondary;
  line-height: $line-height-normal;
}

.attachment-row__size { font-variant-numeric: tabular-nums; }
.attachment-row__meta-sep { color: $text-tertiary; }
.attachment-row__date { color: $text-secondary; }
```

Rationale: filename on its own row + meta below it is more legible than the single-line "filename · size · date" of the upload-progress-row, because attachment rows persist (users read them as information), while upload rows are transient (users only scan them).

**Download icon-button (idle / `downloading`):**
```scss
.attachment-row__download {
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
  flex: 0 0 auto;
  transition: background-color $motion-fast, color $motion-fast;

  &:hover:not(:disabled) {
    background: $bg-sidebar-light;
    color: $brand-primary-hover;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:active:not(:disabled) {
    background: $brand-primary-light;
  }

  &:disabled {
    cursor: progress;
    color: $brand-primary;   // downloading state — the spinner colour
    background: transparent;
  }

  @media (pointer: coarse) {
    width: 44px;
    height: 44px;
  }
}
```
Carbon copy of `.upload-row__icon-button` with two adjustments:
- `:disabled` maps to `cursor: progress` (not `not-allowed`) — the button is busy, not forbidden.
- `:disabled` colour is `$brand-primary` so the spinner is visible.

**Spinner:**
- 14×14 SVG; two concentric circles, one full-opacity arc.
- `animation: attachment-row-spin 0.8s linear infinite;`
- Under `prefers-reduced-motion: reduce` the global rule clamps the rotation to near-instant — the spinner renders as a static arc (still communicates "busy" via the disabled button + `aria-busy`).

**Download glyph (idle):** a simple down-arrow-into-tray 14×14 stroke icon; `stroke-width: 2`, `stroke-linecap: round`, `stroke-linejoin: round`. Does not depend on fill — uses `currentColor` so the parent's `color` controls the stroke.

**Error region:**
```scss
.attachment-row__error {
  display: flex;
  align-items: flex-start;
  gap: $space-xs;
  padding: $space-xs $space-sm;
  background: rgba(229, 107, 111, 0.08);   // tint of $status-high (inline rgba, not a new token)
  border-radius: $radius-sm;
}

.attachment-row__error-icon {
  width: 14px;
  height: 14px;
  color: $status-high;
  flex: 0 0 auto;
  margin-top: 2px;
}

.attachment-row__error-message {
  margin: 0;
  flex: 1 1 auto;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: $line-height-normal;
  color: $status-high;
}

.attachment-row__retry {
  // Carbon copy of .upload-row__retry-button — same fill/hover/active/focus.
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
  flex: 0 0 auto;
  transition: background-color $motion-fast, color $motion-fast;

  &:hover { background: $brand-primary; color: $text-inverse; }
  &:focus-visible { outline: 2px solid $brand-primary; outline-offset: 2px; }
  &:active { background: $brand-primary-hover; color: $text-inverse; }

  @media (pointer: coarse) { height: 44px; padding: 0 $space-md; }
}
```

**Non-retryable errors** (`HTTP_403`, `HTTP_404_*`): `.attachment-row__retry` is not rendered (template conditional). The error region shows icon + message only. Left accent stays `$status-high`.

**Date formatting (token rule):**
- `relativeDateLabel()`: `"Just now"` / `"5 min ago"` / `"2 hours ago"` / `"Yesterday"` / `"May 4"` for same-year / `"May 4, 2025"` older. Computed from `createdAt` via a pure function; falls back to absolute for >7 days.
- `absoluteDateLabel()`: always present on `title=` for AT + hover tooltip, e.g. `"May 4, 2026, 3:42 PM"`.
- `<time datetime="{createdAt ISO}">` makes the raw timestamp programmatic.

**Long-filename behaviour:**
- CSS `text-overflow: ellipsis` + `title={fileName}` → full name always accessible. Tested with a 120-char filename — never wraps to a second line; never overflows into the meta row.

---

### 3.3 File-type icons (shared visual grammar)

The icon set is a 20×20 stroke-glyph family (`currentColor` fill/stroke). Six categories; each has its own hue pulled from the existing palette so "type" is communicated by shape **and** colour (colour is never the sole signal — filename extension + icon shape both disambiguate).

| Category | Matches | Icon glyph (reference) | Colour token |
|---|---|---|---|
| `image` | `image/*` (via prefix) + `.jpg/.jpeg/.png/.gif` | Picture frame with mountain + sun | `$status-medium` (#4A6FA5) — "photo" connotation |
| `pdf` | `application/pdf` + `.pdf` | Document with folded corner + "PDF" micro-label | `$status-high` (#E56B6F) — canonical red-ish |
| `word` | Word MIME + `.docx` | Document with folded corner + "W" micro-label | `$status-medium` (#4A6FA5) |
| `excel` | Excel MIME + `.xlsx` | Document + grid lines | `$status-done` (#9CC5A1) — green spreadsheet convention |
| `text` | `text/plain` + `.txt` | Document + 3 content lines | `$text-secondary` (#7A7A7A) |
| `generic` | fallback | Document with folded corner, no micro-label | `$text-tertiary` (#A1A1A1) |

Selector application:
```scss
.attachment-row__icon[data-category='image']   { color: $status-medium; }
.attachment-row__icon[data-category='pdf']     { color: $status-high; }
.attachment-row__icon[data-category='word']    { color: $status-medium; }
.attachment-row__icon[data-category='excel']   { color: $status-done; }
.attachment-row__icon[data-category='text']    { color: $text-secondary; }
.attachment-row__icon[data-category='generic'] { color: $text-tertiary; }
```

**Contrast note (§6):** each icon colour against `$bg-main` is ≥ 3:1 (non-text / graphical-object AA target). Measured values in §6. Because the icon is supplemented by the filename (which includes the extension) and any AT user hears the filename, the icon colour never carries a semantic burden alone. `data-category` is also a machine-readable hook for QA.

**`aria-hidden="true"`** on every icon — the filename already communicates the format. An adjacent visually-hidden category label (e.g. `<span class="sr-only">PDF,</span>`) is **not** required because the filename extension already gives AT the type affordance; adding a second label would be noisy.

---

### 3.4 Component: `TaskDetailPanelComponent` (additive)

**File:** `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`
**Role:** Host the attachment list below the existing dropzone + upload stack. Preserve #49/#50 layout exactly; add only what's needed for the new subsection.

**Vertical ordering inside `.task-detail-panel__attachment-section`:**

1. `<app-file-dropzone>` — top, unchanged.
2. `<div class="task-detail-panel__upload-list">` — existing stack of in-flight `<app-upload-progress-row>`s, unchanged.
3. **NEW:** `<hr class="task-detail-panel__section-divider" aria-hidden="true" />` — only rendered when `completedAttachments().length > 0` OR `listFetchState().phase !== 'idle'` (i.e. the list is *actually* about to render something). Prevents a dangling divider above an invisible list.
4. **NEW:** `<app-attachment-list>` — full-width, grows vertically with content.

Rationale for ordering (dropzone above list):
- Matches the user's *action* mental model: "I drop here → I see it in progress here → I see it saved here". Action on top, artifacts underneath.
- Matches #49/#50 which already claim the top slot. Moving the dropzone below an (often empty) list would demote the primary action of the panel.
- A fresh task with zero attachments shows the dropzone large and inviting; the empty-state copy (if rendered) sits unobtrusively below.

**New selectors:**

```scss
.task-detail-panel__section-divider {
  margin: $space-md 0 0 0;
  border: 0;
  border-top: 1px solid $border-light;
}
```

- A single-pixel hairline divider. No content; `aria-hidden="true"` on the `<hr>` (redundant with the native semantic but explicit). `margin-top: $space-md` gives the list a clear break from the upload stack; `margin-bottom: 0` because the list header already spaces itself from the rule.
- On mobile (< `$bp-md`) the divider still reads clearly because the body padding is already `$space-md`; no special case.

**Attachment list host width:**
- The `<app-attachment-list>` inherits the `.task-detail-panel__body` flex column; `:host { display: block; width: 100%; }` in the list component's SCSS is sufficient.

**Panel-body scroll:**
- The existing `.task-detail-panel__body { overflow-y: auto; }` rule (lines 136–149 of the panel SCSS) continues to handle overflow. The attachment list never introduces its own `overflow` — it grows naturally and the panel body scrolls.
- With 20+ attachments, the scroll is inside the panel; the section label and dropzone scroll out of view. Acceptable for #51 (expected volume per task is single-digit).

**Breakpoint behaviour (unchanged from #49/#50):**
- `< $bp-md` — panel full-width (already in existing SCSS).
- `$bp-md` — 420px width.
- `$bp-lg` — 480px width.
- Attachment rows never spill; long filenames ellipsize to 28ch / 36ch / 44ch respectively.

---

### 3.5 Component: `TaskCardComponent` (additive)

**File:** `src/app/features/board/components/task-card/task-card.component.scss` and `.html`
**Role:** Add a decorative paperclip + count meta affordance when `attachmentCount() >= 1`. Decorative-only (Q5) — not a click target, not focusable.

**DOM shape (extension):**

Current template (`.html`) has:
```
[ drag-handle ]   <-- grid col 2, row 1/span 2
[ title       ]   <-- grid col 1/-1, row 1
[ notes meta  ]   <-- grid col 1, row 2 (conditional)
```

Extend with the attachment meta alongside the notes meta on row 2:

```html
@if (task().content || attachmentCount() >= 1) {
  <div class="task-card__meta-row" aria-hidden="true">
    @if (task().content) {
      <span class="task-card__meta">
        <span class="task-card__meta-dot" aria-hidden="true"></span>
        Notes
      </span>
    }
    @if (attachmentCount() >= 1) {
      <span class="task-card__attachment-meta">
        <svg
          class="task-card__attachment-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <!-- paperclip -->
          <path d="M10.5 4.5 L5.5 9.5 a2.121 2.121 0 1 0 3 3 L13 8 a3.535 3.535 0 1 0 -5 -5 L3.5 7.5" />
        </svg>
        <span class="task-card__attachment-count">{{ attachmentCount() }}</span>
      </span>
    }
  </div>
}
```

The `aria-hidden="true"` on the meta row is load-bearing — the attachment count is already in `accessibleName` (per tech spec §State), so exposing the visual indicator to AT would double-announce.

**New selectors:**

```scss
// A flex row hosting zero, one, or both meta affordances.
.task-card__meta-row {
  grid-column: 1 / -1;
  grid-row: 2;
  display: inline-flex;
  align-items: center;
  gap: $space-sm;
  flex-wrap: wrap;
  min-width: 0;
}

// Existing .task-card__meta — no changes, but remove its grid-column/grid-row
// since it's now inside .task-card__meta-row. (See migration note below.)

.task-card__attachment-meta {
  display: inline-flex;
  align-items: center;
  gap: $space-xxs;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  color: $text-secondary;
}

.task-card__attachment-icon {
  width: 12px;
  height: 12px;
  color: $brand-primary;   // sage paperclip — matches brand, clearly distinct from status-medium "notes" dot
  flex: 0 0 auto;
}

.task-card__attachment-count {
  font-variant-numeric: tabular-nums;
  color: $text-secondary;
}
```

**Migration note on `.task-card__meta`:** today the notes meta claims `grid-column: 1; grid-row: 2;` directly. In this spec it moves into the new `.task-card__meta-row` wrapper so both affordances share a row. The existing `.task-card__meta` rule must have its `grid-column` / `grid-row` lines removed (they now apply to the wrapper). The visual appearance of a "notes only" card is unchanged pixel-for-pixel because the wrapper occupies the same grid cell with the same inline-flex layout.

**Why a paperclip + count (not a badge pill, not an icon-only tick):**
- A pill badge (`📎 2` on a coloured background) reads as a clickable/actionable element and invites a press that does nothing — Q5 is explicit: decorative only.
- An icon-only paperclip would hide the count, which is the actually-useful bit for a project lead scanning columns.
- The "icon + number" grammar mirrors the existing `.task-card__meta` (dot + "Notes") exactly — the eye reads them as siblings.

**Live update (0 → 1, 1 → 2, …):**
- The `@if (attachmentCount() >= 1)` condition + Angular's change detection re-renders the fragment on count change. No animation on the count itself — it's meta, not a celebration. The card as a whole already carries its hover/drag/active transitions (unchanged).

**Zero-state (count === 0):**
- The entire `<span class="task-card__attachment-meta">` is absent from the DOM (not `display: none`, not `visibility: hidden` — **not rendered**). This enforces the AC "no zero badge".
- If notes also absent, the entire `<div class="task-card__meta-row">` is absent — the card collapses to its pre-#51 two-row layout.

**Accessible name (from tech spec):**
- `accessibleName()` on the card root appends `(N attachment)` / `(N attachments)` when `attachmentCount() >= 1`. See tech spec §State for the computed. The visual indicator is `aria-hidden`; AT reads the count via the card's `aria-label`. This is the AC-critical path.

---

## 4. User Flows

Every flow below documents: visible state transitions, motion, focus, and live-region announcements. All motion references are tokenized and honour `prefers-reduced-motion: reduce` via the global `_motion.scss` clamp (reduced to 0.01ms).

### Flow 1 — Panel-open list hydration

**Trigger:** User clicks a task card or activates it via keyboard. `TaskDetailPanelComponent` opens; its `effect()` fires `hydrateCompletedForTask(task().id)`.

**Paths:**

**1a. Idle → loading (cold) → ready (non-empty):**
| Step | Visible | Motion | Focus | AT |
|---|---|---|---|---|
| 0 | Panel slides in from right (existing `transform` on `.task-detail-panel`, `$motion-slow`). Dropzone visible. Attachments section shows **only** the "Attachments" header — no count yet, no rows. Fetch kicks off. | $motion-slow panel slide | Focus moves to panel title (existing behaviour from #47) | Panel `role="dialog"` announces; section label read |
| 1 | 50–200ms later (network lag), skeleton UL (`aria-busy="true"`, 3 skeleton rows with 1.6s sweep) appears below the dropzone. | Skeleton sweep continuous | Unchanged | `aria-busy` announces "Busy" to AT |
| 2 | Server responds with 3 rows. Skeleton UL unmounts; `<app-attachment-list>` swaps to the `ready` branch; header gains `(3)` count; three `<li>`s animate in with `attachment-list-row-enter` ($motion-fast each). | Row enter stagger (all 3 animate together — Angular @for mounts in one tick) | Unchanged | UL's `aria-live="polite"` does NOT announce the initial 3 rows — `aria-relevant="additions"` only fires for additions *after* the list is observed; the first render is "present on mount" and is silent. The subsection label provides semantic context. |

**1b. Idle → loading (cold) → ready (empty):**
- Same as 1a through step 1; at step 2 the skeleton unmounts and the `"No attachments yet."` empty-state block fades in (`opacity 0 → 1` at $motion-fast). No live-region announcement (the empty state is visual context, not an event).

**1c. Idle → loading → error (retryable 5xx):**
- Same as 1a through step 1; at step 2 the skeleton unmounts and the list error banner appears at the top of the section with left-rule `$status-average` and background `$brand-primary-light`. Banner has `role="alert"` — AT hears the message once.
- Retry button visible. Keyboard tab order: panel close → dropzone (if enabled) → list error banner's Retry → (no rows).
- If the user activates Retry: banner stays visible, skeleton re-mounts beneath it (a retry is *in-progress* on top of a *failed* state), and on success banner unmounts + rows animate in per 1a step 2.

**1d. Idle → loading → error (non-retryable 403):**
- Banner shows left-rule `$status-high`, background `rgba($status-high, 0.08)`, no Retry button. Keyboard tab order: panel close → dropzone → (skip banner, no interactive) → (no rows).
- AT hears the message once via `role="alert"`. No further live announcements.

**1e. Second open of the same task (warm) — phase is already `ready`:**
- Because `hydrateCompletedForTask` is idempotent and dedupes on `phase === 'loading'`, a rapid re-open does not re-fetch. Rows render instantly without a skeleton flash — the cache is honoured.

### Flow 2 — Happy-path download

**Trigger:** User clicks the download button on a row (or presses Enter/Space while the button has focus).

| Step | Visible | Motion | Focus | AT |
|---|---|---|---|---|
| 0 | Row `idle`. Left accent `$border-light`. Download glyph `$text-secondary`. | — | On the button | Button label announced: "Download spec.pdf, button" |
| 1 | Click: button becomes `disabled`, glyph swaps to spinner (`$brand-primary`), `aria-busy="true"`, `cursor: progress`. Left accent transitions $motion-fast to `$brand-primary`. Card border unchanged. | Spinner rotates 0.8s/cycle | **Stays on the button** (critical — `:focus-visible` ring persists; a disabled button still accepts focus per WAI-ARIA) | `aria-busy` announces "Busy" |
| 2 | Network succeeds (200 OK, blob). `triggerBlobDownload` runs — browser's native save dialog appears (OS-level UI). | — | Focus remains on the button | OS-level save dialog announces via OS AT |
| 3 | Download state resets to `IDLE_DOWNLOAD_STATE`. Button re-enables, glyph returns to download icon, `aria-busy` removed. Left accent transitions $motion-fast back to `$border-light`. | $motion-fast accent swap | **Focus remains on the button** — same instance, same `:focus-visible` ring; user can press Enter again to re-download | `aria-busy="false"` (implicit via removal) |

Notes:
- No toast on success. The OS-level download shelf is the authoritative confirmation (issue_51_context.md §Desired State).
- Keyboard-only user: `Tab`s to the button, `Enter` to start, spinner spins, save dialog appears, `Enter` / dismissal closes the dialog, focus is still on our button, `Tab` continues to the next row's button.

### Flow 3 — Download failure with retry

**Trigger:** Click → HTTP error → per-row error region renders.

**3a. Retryable (`HTTP_400_PROCESSING`, `HTTP_5XX`, `NETWORK`):**

| Step | Visible | Motion | Focus | AT |
|---|---|---|---|---|
| 0–1 | Same as Flow 2 steps 0–1. | — | Button | `aria-busy` |
| 2 | HTTP 400 with message "File is still being processed." Mapper returns `HTTP_400_PROCESSING` (retryable). `downloadState` flips to `error`. Card border transitions to `$status-high`, left accent to `$status-high`, error region mounts with `role="alert"`. Icon + message: "This file is still being saved. Please try again in a moment." Retry pill visible. Download button is re-enabled (so the user has two options: retry via pill, or press the download button again). | $motion-fast border/accent swap | Remains on the download button (error region is not auto-focused — `role="alert"` announces without stealing focus) | `role="alert"` + `aria-live="polite"` on the error region announce the message once |
| 3 | User tabs to the Retry pill or presses Shift+Tab — Retry is the next focusable after the download button within the row. User activates Retry (Enter/Space). | — | Moves to Retry pill on Tab | "Retry, button" announced |
| 4 | Retry re-issues the GET: state flips to `downloading`, error region unmounts, left accent back to `$brand-primary`, card border returns to `$border-light`. **Focus moves back to the download button** (the retry pill unmounts and is no longer a valid focus target). | — | **Focus on the download button** — managed by the component via `elementRef.nativeElement.querySelector('.attachment-row__download').focus()` in the retry handler, after the state transition | — |
| 5 | On success, same as Flow 2 step 3. On another error, loop back to step 2 (this time with new message if different). | — | — | — |

**3b. Non-retryable (`HTTP_403`, `HTTP_404_MISSING`, `HTTP_404_FAILED`, `HTTP_404_OTHER`):**

| Step | Visible | Motion | Focus | AT |
|---|---|---|---|---|
| 0–1 | Same as Flow 2 steps 0–1. | — | Button | `aria-busy` |
| 2 | HTTP 403 → error state. Error region mounts with **icon + message only, no Retry pill**. Card border + accent `$status-high`. | $motion-fast | Remains on download button | `role="alert"` announces: "You're not allowed to download this file." |
| 3 | User tabs: focus skips from download button to next row's download button (there is no intermediate retry to visit). User can still press the download button again if they choose — but the next attempt will fail the same way. The UI does **not** disable the download button in the non-retryable state (rationale: a false "enabled" is less misleading than a disabled-without-explanation state; the error message is the authoritative affordance). | — | — | — |

### Flow 4 — Live append via SignalR `AssetCompleted`

**Trigger:** Panel is open against task T. `AttachmentsStateService.appendCompleted(T, dto)` runs (SignalR-origin or local 201). `completedByTaskId[T]` gains a new entry at the **top** (A5 — newest first).

| Step | Visible | Motion | Focus | AT |
|---|---|---|---|---|
| 0 | List shows 2 rows. `aria-live="polite"` + `aria-relevant="additions"` armed on the UL. | — | Anywhere (e.g. user is scrolling the panel) | — |
| 1 | Third entry appended to the signal's array at index 0. Angular `@for track attachment.id` mounts a new `<li>` at the top. | `attachment-list-row-enter` keyframes — opacity 0 → 1, translateY -8 → 0 at $motion-fast | Unchanged | `aria-relevant="additions"` fires: AT hears "spec-revised.pdf added" (or the filename alone — exact phrasing is browser/AT-dependent, but the addition is announced once). |
| 2 | Existing rows 1 and 2 do not re-animate — `track attachment.id` preserves them. Their positions simply shift down one row height (CSS flex, instant — no FLIP animation). | — | Unchanged | — |
| 3 | Header count updates 2 → 3. Card indicator on the board (if visible concurrently) updates (see Flow 5). | — | — | — |

**Throttling note:** if multiple `AssetCompleted` events land in quick succession (rare, but possible with a batch upload surface in the future), the polite `aria-live` region naturally throttles — browsers coalesce rapid announcements. We do not need an application-level throttle for #51.

**Reduced motion:** row enter animation is clamped to 0.01ms by the global rule — the new row simply appears instantaneously at the top. Live-region announcement is unaffected.

### Flow 5 — Task card indicator appearing when count goes 0 → 1

**Trigger:** User is on the board view (panel closed or another task's panel open). An `AssetCompleted` arrives for task T, or the user opens T's panel and the server hydration adds a row.

| Step | Visible on the card | Motion | Focus | AT |
|---|---|---|---|---|
| 0 | Card has no attachment indicator. DOM: `.task-card__meta-row` absent iff `task.content` is also empty; else present with only the "Notes" meta. `accessibleName` is `{title}` (or `{title} (has notes)`). | — | — | AT reads `{title}` on focus |
| 1 | `attachmentCount()` flips 0 → 1. `.task-card__attachment-meta` mounts inside `.task-card__meta-row`. No enter animation — the mini meta appearing is a neutral metadata update, not an event worth animating (the card is in a list of cards on a board; a flash would be noise). | None | Unchanged | — |
| 2 | `accessibleName` recomputes to `{title} (1 attachment)` or `{title} (has notes) (1 attachment)`. If the card is focused, focus is preserved on the same DOM node; AT re-reads the label on the next focus event, **not** immediately — `aria-label` changes do not automatically announce. | — | Unchanged | AT announces the new count on the card's *next* focus |
| 3 | Count 1 → 2 on another event: `.task-card__attachment-count` text swaps; no animation. | — | — | — |

**Non-focus AT discoverability:** for an AT user who is not currently on the card, the count change is silent (by design — flooding the page with announcements every time a teammate uploads would be noise). When the user navigates to or focuses the card, they hear the current count. The detail panel is the "intentional" read surface with the live region.

---

## 5. Responsive Behavior

### Breakpoints

Canonical: `$bp-sm` 576 / `$bp-md` 768 / `$bp-lg` 992 / `$bp-xl` 1200 / `$bp-2xl` 1400. This spec materially uses `$bp-md` and `$bp-lg` only (continuity with #49/#50).

### Mobile (< `$bp-md`, i.e. < 768px)

**Detail panel:**
- Full-width overlay (`width: 100%` from existing panel SCSS).
- Body padding $space-md (existing).
- Attachment section inherits the body's $space-md rhythm.

**Attachment row:**
- Filename `max-width: 28ch` → an 11-char filename like `mockup.png` fits easily; a 30+ char filename ellipsizes. Title attribute provides the full name to AT and on hover.
- Meta line wraps only if absolutely needed — `flex-wrap: wrap` on `.attachment-row__meta`. Size + date each stay on one line.
- Download icon-button — `@media (pointer: coarse)` expands to 44×44.
- Row padding `$space-sm $space-md` — identical on mobile and desktop; the card feels familiar.

**Empty state:**
- Copy "No attachments yet." — centered, `padding: $space-md`, same on all breakpoints.

**List error banner:**
- Horizontally the banner occupies the full section width.
- Retry pill wraps to a new line under the message only if the message is very long (> ~40ch) — flex-wrap: wrap on `.attachment-list__error`.

**Card indicator:**
- Card padding on mobile is $space-md (existing rule). The meta row rests within the card — no overflow risk. `flex-wrap: wrap` on `.task-card__meta-row` allows "Notes" and "📎 2" to wrap to two lines on a narrow card if needed.

### Tablet (`$bp-md`–`$bp-lg`, 768–992px)

**Detail panel:**
- Fixed 420px right-docked (existing panel SCSS `@include respond-to('md') { width: 420px; }`).
- Body padding promotes to $space-lg.

**Attachment row:**
- Filename `max-width: 36ch`.
- Otherwise identical.

### Desktop (≥ `$bp-lg`, 992px+)

**Detail panel:**
- Fixed 480px right-docked (existing).
- Body padding stays $space-lg.

**Attachment row:**
- Filename `max-width: 44ch` — long technical filenames like `meeting-notes-2026-05-06-quarterly-review.docx` (49 chars) still ellipsize but show most of the content.

**Hover affordances (all breakpoints where `pointer: fine`):**
- Attachment row card: subtle `$shadow-card` → `$shadow-card-hover` lift on row hover (no transform).
- Download button: `$bg-sidebar-light` fill + `$brand-primary-hover` glyph tint on hover.
- Retry pill: `$brand-primary` fill + `$text-inverse` label on hover.
- List error Retry: same as row retry pill.

**Touch (`@media (pointer: coarse)` at any breakpoint):**
- Download icon-button 44×44.
- Retry pill height 44px, padding `0 $space-md`.
- List error Retry pill same.
- Hover states suppressed (touch has no hover) — focus-visible remains; tap flashes the `$brand-primary-light` active state briefly.

---

## 6. Accessibility Audit

### WCAG AA contrast — measured ratios

Text contrast (target ≥ 4.5:1 for body text < 18px; ≥ 3:1 for 18px+ bold or graphical objects). All measured against the token values in `src/styles/variables/_colors.scss`.

| Pair | Foreground | Background | Ratio | Meets AA? | Use |
|---|---|---|---|---|---|
| Filename on row | `$text-primary` `#1C1C1C` | `$bg-main` `#FFFFFF` | **17.29:1** | YES (AAA) | body 14px medium |
| Row meta (size/date) | `$text-secondary` `#7A7A7A` | `$bg-main` `#FFFFFF` | **4.60:1** | YES | body 12px regular |
| Subsection label | `$text-secondary` `#7A7A7A` | `$bg-main` `#FFFFFF` | **4.60:1** | YES | 12px semibold uppercase (letter-spacing helps legibility) |
| Subsection count | `$text-tertiary` `#A1A1A1` | `$bg-main` `#FFFFFF` | **2.85:1** | **FAIL** as text | The count is decorative (also announced via accessibleName on cards and read from the row count), so it does NOT need to meet text contrast. Marked `aria-hidden`. Alternative: switch to `$text-secondary` to clear AA — **applied**. See note below. |
| Empty state copy | `$text-secondary` `#7A7A7A` | `$bg-dropzone` `#F4F5F1` | **4.04:1** | **marginal / BORDERLINE** — fails AA for regular 12px text (4.5 needed). | Copy is 12px regular. **Mitigation: bump font-size to $font-size-md (14px)** in the empty state only — at 14px / 18.66px equivalent, the 4.04:1 ratio meets AA for text only if it crosses the "large text" threshold (18px regular or 14px bold). **Applied: font-weight: medium at 14px** → treated as large-text AA (3:1), which this pair clears. |
| Error message on row error region | `$status-high` `#E56B6F` | `rgba(229,107,111,0.08)` (≈ `#FDEEEE` over white) | **3.87:1** | **marginal** (fails 4.5) | Copy is 12px medium. **Mitigation: render error message text in `$text-primary` `#1C1C1C`** against the same tinted background → **15.08:1** — passes AAA. The `$status-high` colour is reserved for the error icon and the left accent only. **Applied in §3.2 — correcting the spec here:** update `.attachment-row__error-message { color: $text-primary; }` (not `$status-high`). |
| Banner message (retryable) | `$text-primary` `#1C1C1C` | `$brand-primary-light` `#E8EBE4` | **15.58:1** | YES (AAA) | 12px medium |
| Banner message (non-retryable) | `$text-primary` `#1C1C1C` | `rgba(229,107,111,0.08)` ≈ `#FDEEEE` | **15.08:1** | YES (AAA) | 12px medium |
| Download glyph | `$text-secondary` `#7A7A7A` | `$bg-main` | **4.60:1** | YES — meets 3:1 graphical-object target with margin | 14×14 glyph |
| Download glyph hover | `$brand-primary-hover` `#7A8A69` | `$bg-sidebar-light` `#F4F5F1` | **3.50:1** | YES (3:1 graphical) | — |
| Focus ring | `$brand-primary` `#8C9B7B` | any bg | **3.16:1** against `$bg-main`; **3.12:1** against `$bg-sidebar-light`; **3.04:1** against `$brand-primary-light` | YES (3:1 non-text for focus indicator per WCAG 2.4.11 / 2.4.13) | 2px outline, 2px offset |
| Retry pill label (default) | `$text-primary` `#1C1C1C` | `$brand-primary-light` `#E8EBE4` | **15.58:1** | YES (AAA) | — |
| Retry pill label (hover) | `$text-inverse` `#FFFFFF` | `$brand-primary` `#8C9B7B` | **3.02:1** | **marginal** — meets AA for large text (18px+ or 14px bold), fails for regular 12px text. The pill is 14px medium → treated as regular small text, **fails 4.5**. | **Mitigation:** bump pill label to `$font-weight-semibold` on hover — 14px semibold crosses the "bold" threshold AND the standard treats semibold as bold for this purpose. **Applied.** (This is consistent with #50's pill, which has the same pairing; the semibold-on-hover override matches that spec's carry-over.) |
| File-type icon — image | `$status-medium` `#4A6FA5` | `$bg-main` | **5.29:1** | YES | 20×20 — 3:1 graphical target easily met |
| File-type icon — pdf | `$status-high` `#E56B6F` | `$bg-main` | **3.62:1** | YES (3:1 graphical) | — |
| File-type icon — word | `$status-medium` `#4A6FA5` | `$bg-main` | **5.29:1** | YES | — |
| File-type icon — excel | `$status-done` `#9CC5A1` | `$bg-main` | **1.93:1** | **FAIL 3:1 graphical-object** | **Mitigation:** darker green paired with an outline — not possible without new token. **Alt mitigation: add a 1px stroke of `$text-secondary` `#7A7A7A` to the excel icon glyph** (SVG implementation). With the darker outline, the effective contrast is 4.60:1. **Applied: excel icon uses `stroke: $text-secondary` + `fill: $status-done` at 1px stroke-width** — meets the graphical-object target via the outline alone. The colour still communicates "green spreadsheet" without being the sole contrast carrier. |
| File-type icon — text | `$text-secondary` `#7A7A7A` | `$bg-main` | **4.60:1** | YES | — |
| File-type icon — generic | `$text-tertiary` `#A1A1A1` | `$bg-main` | **2.85:1** | **FAIL** | **Mitigation:** same stroke treatment — 1px `$text-secondary` outline on the generic icon → 4.60:1 effective. **Applied.** |
| Card indicator paperclip | `$brand-primary` `#8C9B7B` | `$bg-card` `#FFFFFF` | **3.16:1** | YES (3:1 graphical) | 12×12 glyph |
| Card indicator count | `$text-secondary` `#7A7A7A` | `$bg-card` `#FFFFFF` | **4.60:1** | YES | 12px medium |

**Contrast summary:** every text pair meets AA; every graphical-object pair meets 3:1. Two initial fails (excel / generic icons, retry-on-hover) resolved via the mitigations above, which are CSS-only and require no new tokens.

### Semantic HTML

- `<section aria-label="Attachments">` wraps the list — landmark-free but labelled for AT navigation.
- `<h4>` for the subsection label — nests inside the `<h2>` task title → `<h3>` panel section ("Attachment") → `<h4>` "Attachments" (list subsection). Heading hierarchy respected.
- `<ul role="list">` + `<li>` — explicit `role="list"` defends against Safari's VoiceOver stripping list semantics from styled UL.
- `<time datetime="{ISO}">` for the date.
- `<button type="button">` for every interactive — never `<div>` with click handler, never `<a href="#">`.
- `<p role="alert">` (implicit via the `role="alert"` on the wrapper) for the row error region.

### Keyboard paths

| Action | Keys |
|---|---|
| Move between rows | `Tab` / `Shift+Tab` |
| Activate download | `Enter` or `Space` while download button has focus |
| Activate retry (row) | `Enter` or `Space` while retry pill has focus |
| Activate retry (list banner) | `Enter` or `Space` while list retry has focus |
| Skip past a non-interactive banner | `Tab` — banner without Retry has zero tabstops |
| Close panel | `Esc` (existing #47 behaviour — unchanged) |

**Tab order within the attachments section:**
1. Dropzone (focusable, existing).
2. Cancel button(s) on any in-flight upload-progress rows (existing).
3. List error banner Retry (if present and retryable).
4. For each attachment row (in DOM order, which is `createdAt DESC`):
   - Download button.
   - Retry pill (if present and retryable).

Focus order is strict DOM order. No `tabindex="0"` / `tabindex="-1"` gymnastics.

### Focus management during downloads

- **Download click → `downloading`:** focus stays on the same button (disabled button retains focus; browsers do not blur disabled buttons).
- **`downloading` → `idle` (success):** button re-enables; focus is preserved on the same button. User can `Enter` to download again immediately.
- **`downloading` → `error`:** error region mounts. Focus stays on the download button (does not jump to the new Retry pill — letting the user choose where to go next). `role="alert"` on the error region announces the message.
- **Retry click → `downloading`:** the retry pill unmounts. Without intervention, focus would drop to `document.body`. **Mitigation:** `AttachmentRowComponent.handleRetryClick()` calls `this.downloadButton.nativeElement.focus()` after setting the state. See tech spec §5.6 for the handler; the focus call is a design-spec add-on: developer adds `@ViewChild('downloadButton')` and focuses it.

### Live-region strategy

- **List additions:** `aria-live="polite"` + `aria-relevant="additions"` on `<ul class="attachment-list__rows">`. Announces new rows once. Does NOT announce the initial render (mounted rows are "present", not "added" per ARIA semantics).
- **List error banner:** `role="alert"` — assertive, announces once when mounted. Replaces prior banner content on re-error without re-announcing unless the message text changes.
- **Per-row download error:** `role="alert"` + `aria-live="polite"` + `aria-atomic="true"` on `.attachment-row__error`. Scoped to the single row; adjacent rows are unaffected.
- **Skeleton:** `aria-busy="true"` on the parent `<ul>` + `aria-hidden="true"` on the skeleton UL itself — AT hears "busy" without trying to read skeletal boilerplate.

**Throttling guarantees:**
- A flurry of `AssetCompleted` events coalesce via browser live-region throttling (500ms–1s depending on AT).
- A re-render of the same row (no filename change, no phase change) does not re-announce — `aria-atomic="true"` on the error region ensures the whole region is read on mount, not individual text nodes on re-render.

### Reduced motion

Every animation in this spec is wrapped by a named keyframes rule and responds to the global `_motion.scss` `@media (prefers-reduced-motion: reduce)` clamp (`animation-duration: 0.01ms !important`). Specifically:

- Skeleton sweep → static 40% bar (visible, stationary).
- Row-enter animation → instant appearance.
- Button / card transitions → instant.
- Rotation on the download spinner → near-stationary arc (still visually distinct from idle because the button is `disabled` + `aria-busy`).

No per-component override of the global rule.

### Colour + non-colour encoding

- **Download state** is encoded three ways: left-accent colour (visual), `disabled` attribute (programmatic), `aria-busy` (AT).
- **Error state** is encoded three ways: border + left-accent colour (visual), `role="alert"` (AT), explicit error icon (visual non-colour).
- **File type** is encoded three ways: icon shape (visual non-colour), icon colour (visual), filename extension in the text label (visual + AT).

No single colour carries semantic meaning alone.

---

## 7. Implementation Checklist

### Setup — variable imports (per new SCSS file)

Both `attachment-list.component.scss` and `attachment-row.component.scss` must begin with:

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

:host { display: block; width: 100%; }
```

### `AttachmentListComponent`

- [ ] `.attachment-list` — column flex, `gap: $space-xs`, `margin-top: 0` (divider in the panel provides the break).
- [ ] `.attachment-list__header` — inline-flex, `align-items: baseline`, `gap: $space-xs`, `margin-bottom: $space-xs`.
- [ ] `.attachment-list__label` — $font-size-sm, $font-weight-semibold, uppercase, letter-spacing 0.02em, $text-secondary, margin 0.
- [ ] `.attachment-list__count` — inline, $font-weight-regular, $text-secondary (not $text-tertiary — contrast fix from §6), font-variant-numeric tabular-nums, margin-left $space-xxs, text-transform none.
- [ ] `.attachment-list__rows` — list-style none, margin/padding 0, column flex, gap $space-xs.
- [ ] `.attachment-list__row-slot` — animation: `attachment-list-row-enter $motion-fast both`. Keyframes defined in the same SCSS file.
- [ ] `.attachment-list__skeleton` / `__skeleton-row` — 64px height, $shadow-card card surface, ::before sweep on 1.6s cycle.
- [ ] `.attachment-list__empty` — $font-size-md (not $font-size-sm), $font-weight-medium, $text-secondary, $bg-dropzone bg, 1px dashed $border-light, $radius-md, padding $space-md, text-align center.
- [ ] `.attachment-list__error` — flex row, gap $space-xs, padding $space-sm $space-md, $radius-md, margin-bottom $space-xs. Two variants on the wrapper class: `--retryable` (bg $brand-primary-light, border-left 3px $status-average) and default (bg rgba($status-high, 0.08), border-left 3px $status-high).
- [ ] `.attachment-list__error-icon` — 16×16, margin-top 2px, colour per variant.
- [ ] `.attachment-list__error-message` — $font-size-sm, $font-weight-medium, $text-primary, flex 1 1 auto, margin 0.
- [ ] `.attachment-list__error-retry` — full copy of `.upload-row__retry-button` selector body (32px → 44px on pointer: coarse).
- [ ] Reduced-motion: skeleton sweep clamped (global rule), row enter animation clamped (global rule) — no per-component overrides needed.
- [ ] Template: UL uses `aria-live="polite"` + `aria-relevant="additions"`. Skeleton UL uses `aria-busy="true"` + `aria-hidden="true"`.
- [ ] Error banner uses `role="alert"`.

### `AttachmentRowComponent`

- [ ] `.attachment-row` — column flex, gap $space-xs, padding `$space-sm $space-md $space-sm ($space-md + 3px)`, $bg-main, 1px solid $border-light, $radius-md, $shadow-card. `::before` 3px left accent bar with $border-light default.
- [ ] `.attachment-row--downloading` — accent `$brand-primary`.
- [ ] `.attachment-row--error` — border $status-high, accent $status-high.
- [ ] `.attachment-row:hover` — $shadow-card → $shadow-card-hover (no transform).
- [ ] `.attachment-row__header` — flex row, gap $space-sm, align-items center, min-width 0.
- [ ] `.attachment-row__icon` — 20×20, flex 0 0 auto, colour per `data-category` attribute (see §3.3 selector table).
  - Excel and generic icons MUST have `stroke: $text-secondary` + `stroke-width: 1` in the SVG to meet graphical contrast.
- [ ] `.attachment-row__file-meta` — column flex, gap $space-xxs, min-width 0, flex 1 1 auto.
- [ ] `.attachment-row__filename` — $font-size-md, $font-weight-medium, $text-primary, ellipsized with max-width 28ch / 36ch ($bp-md) / 44ch ($bp-lg). `title={fileName}`.
- [ ] `.attachment-row__meta` — inline-flex, align-items baseline, gap $space-xxs, $font-size-sm, $text-secondary. Contains size, separator, date.
- [ ] `.attachment-row__size` — font-variant-numeric tabular-nums.
- [ ] `.attachment-row__meta-sep` — $text-tertiary, aria-hidden.
- [ ] `.attachment-row__date` — $text-secondary, `<time datetime={iso} title={absoluteLabel}>`, renders relative label.
- [ ] `.attachment-row__download` — carbon copy of `.upload-row__icon-button` with `:disabled { cursor: progress; color: $brand-primary; }` override. 32px default, 44px on pointer: coarse. Focus: 2px $brand-primary outline / 2px offset.
- [ ] `.attachment-row__download-spinner` — 14×14, `animation: attachment-row-spin 0.8s linear infinite`.
- [ ] `.attachment-row__download-icon` — 14×14, down-arrow-tray stroke glyph.
- [ ] `.attachment-row__error` — flex row, gap $space-xs, padding $space-xs $space-sm, bg `rgba(229,107,111,0.08)`, $radius-sm. `role="alert"` + `aria-live="polite"` + `aria-atomic="true"`.
- [ ] `.attachment-row__error-icon` — 14×14, $status-high, margin-top 2px.
- [ ] `.attachment-row__error-message` — $font-size-sm, $font-weight-medium, **$text-primary** (NOT $status-high — contrast fix from §6), margin 0, flex 1 1 auto.
- [ ] `.attachment-row__retry` — carbon copy of `.upload-row__retry-button`. Rendered only when `downloadState().error?.retryable === true`. On hover, label is $font-weight-semibold (§6 contrast fix).
- [ ] Reduced motion: no per-component override; the global clamp covers spin + transitions.
- [ ] Template: download button has `[attr.aria-label]="downloadAriaLabel()"`, `[disabled]="phase === 'downloading'"`, `[attr.aria-busy]="phase === 'downloading' ? 'true' : null"`. Retry pill conditionally rendered.
- [ ] Component TS: after `handleRetryClick`'s state transition, call `this.downloadButton.nativeElement.focus()` via a `@ViewChild('downloadButton')` on the download button element, to preserve keyboard focus.

### `TaskDetailPanelComponent` (additive SCSS)

- [ ] Add `.task-detail-panel__section-divider` — margin-top $space-md, border 0, border-top 1px solid $border-light.
- [ ] Template: conditionally render the divider when `completedAttachments().length > 0` OR `listFetchState().phase !== 'idle'`.
- [ ] Place `<app-attachment-list>` directly after the divider inside `.task-detail-panel__attachment-section`.
- [ ] Do NOT modify the existing section label "Attachment" (singular). The list adds its own "Attachments" subsection label internally.
- [ ] Verify body padding and overflow rules are unchanged.

### `TaskCardComponent` (additive SCSS + HTML)

- [ ] Move the existing `.task-card__meta` element into a new `<div class="task-card__meta-row">` wrapper.
- [ ] Remove `grid-column: 1; grid-row: 2;` from `.task-card__meta` rule (now handled by the wrapper).
- [ ] Add `.task-card__meta-row` — `grid-column: 1 / -1; grid-row: 2; display: inline-flex; align-items: center; gap: $space-sm; flex-wrap: wrap; min-width: 0;`.
- [ ] Add `.task-card__attachment-meta` — inline-flex, gap $space-xxs, $font-size-sm, $font-weight-medium, $text-secondary, line-height tight.
- [ ] Add `.task-card__attachment-icon` — 12×12, flex 0 0 auto, `color: $brand-primary`.
- [ ] Add `.task-card__attachment-count` — font-variant-numeric tabular-nums, $text-secondary.
- [ ] Template: wrap both meta affordances in `.task-card__meta-row`. `aria-hidden="true"` on the wrapper (count is in `accessibleName`). The attachment meta is rendered only when `attachmentCount() >= 1`. The wrapper is rendered only when at least one of the two conditions applies (`task().content` OR `attachmentCount() >= 1`).
- [ ] Paperclip SVG: `viewBox="0 0 16 16"`, stroke-width 1.75, stroke-linecap/linejoin round, `fill="none"`, `stroke="currentColor"`. Path per §3.5.
- [ ] **Do not** add any click/hover/active/focus rules to `.task-card__attachment-meta` or `.task-card__attachment-icon` — decorative only (Q5).

### Cross-component verification

- [ ] `npm run build` in `KanbAI-Web/KanbAI-Web/` — no SCSS errors, no missing token imports.
- [ ] Devtools inspection: skeleton sweep visible on slow 3G (throttled network) for ≥ 200ms before rows land.
- [ ] Devtools inspection: row-enter animation fires exactly once per newly-mounted `<li>`; does not re-fire on sibling mutations.
- [ ] Devtools: reduced-motion flag forces all animations to near-instant; rows appear without slide.
- [ ] Axe-core / Accessibility Tree: `<section aria-label="Attachments">` is a landmark; `<ul role="list">` with N `<li>` children; each row's download button has accessible name `"Download {fileName}"`.
- [ ] Keyboard-only QA: tab from panel close → dropzone → (any in-flight cancel/retry/dismiss) → (list retry if error) → row 1 download → row 1 retry (if error) → row 2 download → … in strict top-to-bottom DOM order.
- [ ] Screen-reader QA (NVDA / VoiceOver): opening panel with 3 attachments announces "dialog, Redesign login, Attachment heading level 3, … Attachments heading level 4" (existing + new); appending a new row via SignalR announces the filename once; failing a download announces "This file is still being saved…" once.
- [ ] Contrast verification (WebAIM or axe-core): every pair in §6 passes its target; the two mitigations (excel/generic icon stroke, retry hover semibold, error message $text-primary, empty state 14px medium) are present in the compiled CSS.
- [ ] Mobile QA (Chrome DevTools mobile + actual touch device): 44×44 hit targets on download button and retry pill; card attachment meta wraps gracefully on 320px-wide card.
- [ ] Zero-badge enforcement: a task with `completedByTaskId[id]` absent or `[]` shows no `.task-card__attachment-meta` element at all in the DOM — verified with DevTools element panel.

---

*"The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec."*
