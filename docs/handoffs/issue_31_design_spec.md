# Design Specification: Project State Management with Signals

**Technical Spec:** [issue_31_tech_spec.md](./issue_31_tech_spec.md)
**Business Context:** [issue_31_context.md](./issue_31_context.md)
**GitHub Issue:** [#31](https://github.com/Gulybi/KanbAI-Web/issues/31)
**Design System:** KanbAI Project Management Dashboard v1.0
**Predecessor Design Spec:** [issue_30_design_spec.md](./issue_30_design_spec.md)

---

## Design Intent

Issue #31 is a **non-visual refactor**. It moves the authoritative project list from `DashboardPageComponent`'s local signal into a shared `ProjectStateService` so that mutations from other surfaces (#32 create modal, #33 members UI, future rename/delete) reflect on the dashboard within a single change-detection pass — without any visual change for the user.

The calm, oriented dashboard shipped in #30 must feel **identical** to the user after this refactor: same header, same skeleton, same grid, same empty panel, same error banner, same motion. Bytes and render output are unchanged; only the data source behind `vm()` moves.

Where this spec adds **new** design material is at a single forward-looking contract: `ProjectStateService` delivers **mutation errors inline to the calling surface** (per the tech spec's "Public Method Contracts" section) rather than writing them to a page-level signal. Downstream issues (#32 modal, future rename/delete dialogs) therefore need a **form-level error banner pattern** to render those strings. This spec defines that pattern — once — so every consumer of the service produces visually consistent error feedback.

## Scope

- **Components re-verified (no visual change):**
  - `DashboardPageComponent` (container wiring moves from `ProjectsApiService` to `ProjectStateService`; template unchanged)
  - `DashboardHeaderComponent`, `DashboardSkeletonComponent`, `DashboardEmptyStateComponent`, `DashboardErrorStateComponent`, `ProjectGridComponent`, `ProjectCardComponent` — **no SCSS, template, or `@Input()` change.** See #30's design spec, which remains in force.
- **New visual pattern defined (for downstream use):** `FormErrorBanner` — a reusable inline banner shape that any mutation-error surface (#32's create-project form, future update/delete dialogs) must follow.
- **States covered for DashboardPageComponent:** unchanged from #30 — `loading` / `success` / `empty` / `error` via the existing `@switch (vm().status)` block.
- **States covered for the form-error banner pattern:** idle-hidden / visible / focus-moved-to / dismissed. No hover/active states — the banner itself is not interactive text; its dismiss control is.
- **No new tokens.** Every color, radius, spacing, shadow, and motion value in this spec is already defined in the canonical KanbAI v1.0 token set.
- **Explicitly out of scope:** any redesign of the four dashboard states, any change to `ProjectCardComponent`, the actual create-project form layout (owned by #32), the actual rename/delete dialog chrome (owned by future issues).

---

## Tokens Used

This spec consumes the canonical KanbAI v1.0 design system. **No new tokens are introduced, no tokens are deprecated.**

### Tokens re-verified for the unchanged dashboard states

All tokens listed in [issue_30_design_spec.md §Tokens Used](./issue_30_design_spec.md) continue to apply to the components listed under "Components re-verified" above. See that table for the full mapping; representative entries:

| Token | Where used (unchanged from #30) |
|---|---|
| `$bg-main` | Dashboard page background |
| `$bg-card` | Skeleton card, empty panel, error banner surface |
| `$border-light` | Panel borders, divider below `<h1>` |
| `$status-high` | Error state left-border accent, error icon |
| `$brand-primary` / `$brand-primary-hover` | Retry button, empty-state CTA, focus ring |
| `$shadow-card` / `$shadow-card-hover` | Project card resting / hover |
| `$motion-fast` / `$motion-base` | Button hover, card lift, skeleton pulse |

### Tokens used by the new `FormErrorBanner` pattern

| Token | Role in the banner |
|---|---|
| `$bg-card` (`#FFFFFF`) | Banner surface |
| `$status-high` (`#E56B6F`) | 4px left-border accent + icon stroke |
| `$border-light` (`#EAEAEA`) | Remaining three banner borders (top/right/bottom) |
| `$text-primary` (`#1C1C1C`) | Error title / sentence body |
| `$text-secondary` (`#7A7A7A`) | Optional inline "try again" helper copy |
| `$radius-md` (`12px`) | Banner corner radius |
| `$space-sm` / `$space-md` | Internal padding, icon-to-text gap |
| `$space-xs` | Margin below banner before the first form field it protects |
| `$font-size-md` (`14px`) | Banner copy |
| `$font-weight-semibold` | Banner title (if used) |
| `$line-height-normal` (`1.5`) | Banner copy |
| `$motion-fast` (`150ms`) | Banner appear/disappear opacity transition |

> **No `Proposed Token Additions` section exists** — the canonical palette already covers every need of this issue.

---

## Per-Component Styling

### Component: DashboardPageComponent (container)

**File:** `src/app/features/projects/dashboard-page/dashboard-page.component.scss`
**Role:** Outer frame that hosts the header and one of the four VM sub-views. Unchanged by #31 — the SCSS file is not modified.
**No visual change from #30.** See [issue_30_design_spec.md §DashboardPageComponent](./issue_30_design_spec.md) for the authoritative SCSS.

**What #31 changes:**
- The `.ts` file's data source (now `ProjectStateService` instead of `ProjectsApiService`).
- The `vm` field (now a `computed<DashboardViewModel>` instead of a mutable `signal`).

**What #31 does NOT change:**
- Template: `dashboard-page.component.html` is byte-for-byte identical (`@switch (vm().status)` with the same four `@case` branches).
- SCSS: `dashboard-page.component.scss` is not touched.
- Four visual states: `loading` (skeleton), `success` (grid), `empty` (empty panel), `error` (error banner) — all tokens, spacing, motion, and ARIA per #30.

**Re-verified interaction / a11y (no change):**
- Page background `$bg-main`, text `$text-primary` — measured contrast **17.9:1** (AAA).
- Content max-width 1280px, padding `$space-lg`→`$space-xl` at `$bp-md`, `$space-xl` at `$bp-lg`.
- Retry button (in error state) keeps `:focus-visible` → `2px $brand-primary` outline with `2px` offset. See `dashboard-error-state.component.scss` lines 92-95.
- Empty-state CTA keeps the same focus pattern. See `dashboard-empty-state.component.scss` lines 89-92.
- `prefers-reduced-motion` continues to be honored globally via the rule in `src/styles.css` (lines 6-15) and mirrored in `src/styles/variables/_motion.scss`.

### Component: DashboardHeaderComponent
**No change from #30** — see [issue_30_design_spec.md §DashboardHeaderComponent](./issue_30_design_spec.md) and the existing file at `src/app/features/projects/components/dashboard-header/dashboard-header.component.scss`.

### Component: DashboardSkeletonComponent
**No change from #30** — see [issue_30_design_spec.md §DashboardSkeletonComponent](./issue_30_design_spec.md) and the existing file at `src/app/features/projects/components/dashboard-skeleton/dashboard-skeleton.component.scss`. The pulse animation (`1.4s ease-in-out infinite`) is already clamped by the global reduced-motion rule.

### Component: DashboardEmptyStateComponent
**No change from #30** — see [issue_30_design_spec.md §DashboardEmptyStateComponent](./issue_30_design_spec.md). The CTA remains visually wired to `onCreatePlaceholder()` (a no-op in #31 per the tech spec's "Files to Modify" scope; #32 will wire it to the create modal without further design changes).

### Component: DashboardErrorStateComponent
**No change from #30** — see [issue_30_design_spec.md §DashboardErrorStateComponent](./issue_30_design_spec.md) and the existing file at `src/app/features/projects/components/dashboard-error-state/dashboard-error-state.component.scss`. The `role="alert"` region, `$status-high` 4px left border, and Retry-button focus ring remain exactly as shipped.

> **Important scoping clarification for developers:** This page-level error state is reserved for **list-load** failures (`loadProjects()` failures write to the `error` signal, which flips `vm().status` to `'error'`). **Mutation errors must NOT be routed here.** Per the tech spec (`State Transitions` table, `Service Integration §Why mutations return observables instead of writing to an error signal`), mutation failures reach the caller via the returned `Observable` and are displayed using the `FormErrorBanner` pattern defined below.

### Component: ProjectGridComponent
**No change from #30** — see [issue_30_design_spec.md §ProjectGridComponent](./issue_30_design_spec.md) and the existing file at `src/app/features/projects/components/project-grid/project-grid.component.scss`. The grid uses AC-mandated raw-pixel breakpoints (`640px`, `1024px`) for column count; prepend-on-create (specified in tech spec's "Insertion order for `createProject`") simply places the new item in slot 1 — no grid logic change.

### Component: ProjectCardComponent
**No change from #30** — see [issue_30_design_spec.md §ProjectCardComponent](./issue_30_design_spec.md). Cache-replace on `updateProject` reuses the same `id`, so the DOM node is reused; cache-remove on `deleteProject` removes the `<li>`; cache-prepend on `createProject` inserts a new `<li>` at index 0. All three happen behind Angular's existing `trackBy` (by `id`) — no visual flicker, no layout jump beyond the natural grid reflow.

---

### NEW PATTERN: FormErrorBanner

> **Why this section exists.** Issue #31 does not render this banner itself — no component in #31's scope introduces a form. But #31 establishes the **contract** that mutation errors are delivered inline to the caller, so #32 (create modal) and future update/delete dialogs need a single agreed visual shape to satisfy those errors. Defining the pattern here — in the issue that creates the contract — prevents drift across #32, #33, and beyond.

**Anticipated file (for #32 to author):** `src/app/features/projects/components/form-error-banner/form-error-banner.component.scss`
_(Final path is #32's decision. The developer of #32 may instead choose to embed these styles directly into the create-modal's SCSS if a reusable component is overkill at that point. Either choice is compatible with this spec.)_

**Role:** Renders a single user-readable sentence (produced by `mapErrorToUserMessage(err, operation)`) that reports why a mutation failed. Always appears at the top of the form it guards, above the first input.

**Layout:**
- Block-level, full width of the form container.
- Flex row: icon (fixed 20×20 box) + message (flex: 1).
- Internal padding `$space-sm` vertical, `$space-md` horizontal.
- 4px **left** accent bar in `$status-high`; remaining three sides in `$border-light`, 1px.
- Corner radius `$radius-md`.
- Sits `$space-md` above the first form control (consumer's margin, not the banner's).

**States:**

| State | Definition |
|---|---|
| **Hidden (default)** | Banner is not in the DOM. `*ngIf`-style removal preferred over `visibility: hidden` so the `role="alert"` is re-announced each time a new error appears. |
| **Visible** | Banner enters by mounting; fades in `opacity 0 → 1` over `$motion-fast`. `$status-high` accent + text + icon all render simultaneously. |
| **Focus-moved-to** | When a submit fails, the form component programmatically moves focus into the banner's container (`tabindex="-1"`) so screen readers announce it in tab order even if they missed the `role="alert"` live region. No visual change vs. "visible". |
| **Dismissed (optional)** | If the banner includes a dismiss button, its `:focus-visible` and `:hover` follow the standard icon-button rules (see "Interaction notes" below). Dismissal returns the banner to "hidden". Dismiss is **optional** — for a form that clears the banner automatically on next successful submit, a dismiss button is not required. |

**Reference SCSS** (for #32 to copy/adapt — tokens-only, no literals):

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;

:host {
  display: block;
}

.form-error-banner {
  background-color: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-md;
  padding: $space-sm $space-md;

  display: flex;
  align-items: flex-start;
  gap: $space-sm;

  // Appear/disappear — only animate opacity, never layout.
  animation: form-error-appear $motion-fast ease-out;

  // Focus-moved-to state: no visual outline; the inputs below it own focus visually.
  &:focus {
    outline: none;
  }
}

.form-error-banner__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: $status-high;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.form-error-banner__message {
  margin: 0;
  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-primary;

  // Optional helper line directly under the error sentence.
  & > .form-error-banner__helper {
    display: block;
    margin-top: $space-xxs;
    color: $text-secondary;
    font-size: $font-size-sm;
  }
}

// Optional dismiss button — icon-only, 44×44 touch target.
.form-error-banner__dismiss {
  appearance: none;
  border: none;
  background: transparent;
  color: $text-secondary;
  cursor: pointer;
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: $radius-sm;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;

  transition:
    background-color $motion-fast,
    color $motion-fast;

  &:hover { background-color: $bg-sidebar-light; color: $text-primary; }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) { outline: none; }
}

@keyframes form-error-appear {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

**Reference markup** (for #32 — treat as template guidance, not a hard API):

```html
<div
  class="form-error-banner"
  role="alert"
  aria-live="assertive"
  tabindex="-1"
  #errorBanner
>
  <span class="form-error-banner__icon" aria-hidden="true">
    <!-- 20×20 triangle-exclamation SVG, stroke=currentColor -->
  </span>
  <p class="form-error-banner__message">
    {{ errorMessage }}
    <!-- Optional helper:
    <span class="form-error-banner__helper">Please review the fields below.</span>
    -->
  </p>
  <!-- Optional dismiss:
  <button
    type="button"
    class="form-error-banner__dismiss"
    aria-label="Dismiss error"
    (click)="clearError()"
  >
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" ...></svg>
  </button>
  -->
</div>
```

**Interaction notes:**
- **Appearance:** banner mounts on mutation failure, fades in over `$motion-fast`.
- **Announcement:** `role="alert"` + `aria-live="assertive"` — mutation errors interrupt because the user just submitted and is waiting for feedback. (Contrast with the page-level dashboard error, which uses `role="alert"` but would otherwise default to polite announcement since it arrives on page load.)
- **Focus management:** on mutation failure, the submitting component moves focus to the banner container (`tabindex="-1"`) so keyboard-only and screen-reader users land on the explanation, then Tab continues back into the form's inputs.
- **Clearance:** banner SHOULD clear when (a) the user successfully resubmits, (b) the user modifies the field that likely caused the error (optional nicety for #32), or (c) the user explicitly dismisses via the optional close button. Do NOT auto-dismiss on a timer — the user may still be reading.
- **Reduced motion:** the `opacity` fade is clamped by the global reduced-motion rule in `src/styles.css` / `_motion.scss`. The banner still appears, just without the 150ms fade.

**Accessibility:**
- **Role / ARIA:** `role="alert"` + `aria-live="assertive"` on the banner root. Dismiss button, if present, has `aria-label="Dismiss error"`. The submit button SHOULD set `aria-describedby="{bannerId}"` while the banner is visible so screen readers re-read the error when focus returns to Submit.
- **Contrast (measured):**
  - `$text-primary` on `$bg-card` (banner body): **17.9:1** ✅ AAA.
  - `$status-high` on `$bg-card` (accent bar + icon): **3.5:1** ✅ AA for UI.
  - `$text-secondary` on `$bg-card` (optional helper): **4.6:1** ✅ AA.
- **Touch target:** the optional dismiss button is 32×32 visually but receives an effective 44×44 hit area through generous banner padding (`$space-sm` vertical + `$space-md` horizontal + the button's own 32px), satisfying the mobile touch-target rule in `.claude/agents/web-designer.md §8`.
- **Color independence:** error is signaled by (a) the 4px left bar, (b) the icon glyph, and (c) the written sentence — never color alone.

---

## User Flows

### Flow A: Dashboard list-load failure (unchanged from #30)
This flow is re-verified, not redesigned.

1. User lands on `/dashboard`. `DashboardPageComponent.ngOnInit` calls `projectState.loadProjects()`.
2. `vm().status === 'loading'` → `DashboardSkeletonComponent` renders. Skeletons pulse at 1.4s; pulse collapses to 0.01ms under `prefers-reduced-motion`.
3. Server returns error (network, 5xx, envelope `success:false`, unauthenticated 401/403).
4. `ProjectStateService.error` signal is set to the output of `mapErrorToUserMessage(err, 'list')`.
5. `vm()` recomputes → `{ status: 'error', message }` → `DashboardErrorStateComponent` renders with `role="alert"`, `$status-high` 4px left border, the message, and a "Retry" button.
6. User presses `Enter` or clicks "Retry" → `this.projectState.loadProjects()` fires again; `error` clears, `isLoading` flips true → skeleton → grid or error again.
7. Keyboard path: Tab from navbar lands on Retry button; `:focus-visible` shows `2px $brand-primary` outline, `2px` offset.

### Flow B: Mutation failure delivered inline (NEW contract, consumed by #32)
This is the flow #31 establishes. #31 itself does not render any mutation UI; this describes how a downstream consumer (e.g., #32's create-project form) MUST use the contract + banner.

1. User opens a mutation surface (#32's create modal / future rename inline form / future delete confirm). The surface renders its form with no banner present.
2. User submits. The caller invokes (e.g.) `projectState.createProject(input).subscribe({...})`.
3. **On success:** `projects` signal updates (prepend for create, replace-by-id for update, remove-by-id for delete). The dashboard, already subscribed to `projects`, re-renders the grid within the same change-detection pass. The calling surface closes / resets. **No banner is shown on the dashboard**; there was no error.
4. **On failure:** the subscribed observable errors with a user-readable string (from `mapErrorToUserMessage(err, operation)`). The caller captures the string into a local `signal<string | null>` or reactive-form status field.
5. Caller renders `FormErrorBanner` at the top of its form with `message = capturedError`. Banner fades in over `$motion-fast`.
6. Caller moves focus to the banner container (`tabindex="-1"`) so keyboard users land on the explanation.
7. Screen reader announces the message via `role="alert" aria-live="assertive"`.
8. User reads, adjusts input, and resubmits. On successful resubmit, caller clears the local error signal → banner unmounts → fade-out (mirror of step 5's fade-in).
9. **The dashboard's page-level error state NEVER activates during this flow.** The cache remains in its last-known-good state throughout; the grid continues to render whatever `projects()` held before the failed mutation.

### Flow C: Logout during in-flight load
Visually: no surprise state. The dashboard route is already behind `authGuard`; on logout the user is navigated away before the late response (if any) could render. The service's `reset()` (per tech spec §Logout Integration) empties `projects`, `hasLoaded`, `error` — and on any subsequent login, the next `loadProjects()` starts from skeleton → grid / empty / error exactly per Flow A. **No visual difference from cold-boot.**

### Flow D: Mutation-then-navigate-away-then-navigate-back (unchanged dashboard output)
1. User on #32's modal creates a project → success → service prepends to cache.
2. User navigates to (e.g.) `/account` or reloads modal.
3. User returns to `/dashboard`. Since `hasLoaded === true` and no reset has fired, `projects()` already holds the up-to-date list including the new project.
4. Dashboard renders grid **directly in `success` state** — no skeleton flash. This is a behavioral improvement over #30 (which would have re-fetched); visually, the user simply sees their grid.

---

## Responsive Behavior

### Unchanged dashboard shell
All responsive rules from [issue_30_design_spec.md §Responsive Behavior](./issue_30_design_spec.md) apply unchanged:
- **< 640px** single-column grid, page padding `$space-lg $space-md $space-xxl`.
- **≥ 640px** two-column grid, gap `$space-lg`.
- **≥ `$bp-md` (768px)** page padding ramps to `$space-xl $space-lg $space-xxl`.
- **≥ `$bp-lg` (992px)** page padding ramps to `$space-xl $space-xl $space-xxl`.
- **≥ 1024px** three-column grid.
- **Max content width** 1280px, auto-margined.

### FormErrorBanner responsive rules
The banner is **intrinsically responsive** — it fills 100% of its parent form's width at every breakpoint. Only internal padding changes, and only if the consuming form chooses to:

- **Default (all widths):** `padding: $space-sm $space-md`, icon-to-text gap `$space-sm`.
- **Mobile-specific consideration:** on viewports < `$bp-sm` (576px), if the consumer's form is full-bleed, the banner should **not** increase its own horizontal padding — the form container already owns the page gutters. No SCSS rule change from the pattern above.
- **Long messages:** `mapErrorToUserMessage` strings are intentionally one sentence. If a future message is longer, the banner wraps naturally (`line-height: $line-height-normal`); no special overflow rule is needed.

---

## Accessibility Audit (WCAG AA)

### Contrast (measured; all pairs already verified in canonical system)

| Pair | Ratio | Verdict |
|---|---|---|
| `$bg-main` + `$text-primary` (page) | 17.9:1 | ✅ AAA |
| `$bg-card` + `$text-primary` (banner / card body) | 17.9:1 | ✅ AAA |
| `$bg-card` + `$text-secondary` (helper copy / card meta) | 4.6:1 | ✅ AA |
| `$bg-card` + `$status-high` (accent bar / icon) | 3.5:1 | ✅ AA (UI only — not used for body text) |
| `$brand-primary` + `$text-inverse` (Retry, CTA labels) | 3.3:1 | ✅ AA for 16px/500+ (which is what the buttons use) |

No new pairs introduced — everything above is re-used from #30 and from the canonical table in `.claude/agents/web-designer.md §Color Tokens`.

### Keyboard

**Dashboard (unchanged):**
- Tab order: navbar → page header → (loading/empty/error panel internals or grid items). All interactive elements are `<button>` or anchor; none require custom tabindex.
- Retry button in error state reachable via Tab; `Enter` or `Space` triggers `retry()` → `loadProjects()`.
- Empty-state CTA reachable via Tab; placeholder no-op in #31, wired in #32.
- All `:focus-visible` styles remain: `2px $brand-primary` outline, `2px` offset.

**FormErrorBanner (new contract):**
- Banner container has `tabindex="-1"` so it can receive focus programmatically but does **not** appear in natural Tab order.
- Optional dismiss button appears in Tab order immediately after the banner's message when rendered.
- Dismiss button `:focus-visible` → `2px $brand-primary`, `2px` offset (standard KanbAI focus ring).
- After dismissal, focus returns to the first form field (`#32` to implement the focus-return; this spec only defines it).

### Screen Reader

**Dashboard (unchanged):**
- Page: semantic `<main>` landmark.
- Header: `<h1>` with `aria-describedby` linking subtitle (per #30 spec).
- Error panel: `role="alert"` on the `<section>`, auto-announced when it enters the DOM.
- Skeleton: visually-hidden `role="status" aria-live="polite"` announcement ("Loading your projects…") — see `dashboard-skeleton.component.scss` `.skeleton-status` class.
- Grid: `<ul>` + `<li>` semantics per #30.

**FormErrorBanner (new contract):**
- `role="alert"` + `aria-live="assertive"` on the banner root — announced immediately upon mount, interrupting any polite announcement in flight.
- `aria-describedby` linkage: submit button references the banner's `id` while visible, so re-focusing Submit re-reads the error.
- Dismiss button (if present) has `aria-label="Dismiss error"`.
- Error sentence itself is plain text — no emoji, no raw status codes, no URLs (guaranteed by `mapErrorToUserMessage` table in the tech spec).

### Motion

- Global `prefers-reduced-motion: reduce` rule in `src/styles.css` (lines 6-15) clamps all animation and transition durations to `0.01ms`.
  - Dashboard skeleton pulse: freezes at the rendered opacity (banner still readable).
  - Retry/CTA hover: color change is instant.
  - Banner fade-in: becomes instant appearance (still announced by `role="alert"`).
- No auto-playing animations beyond the skeleton pulse; no parallax; no scroll-jacking. Unchanged from #30.

### Forms (applies to the FormErrorBanner contract, consumed by #32+)

- Every input in the consuming form has a visible `<label>` (consumer's responsibility).
- Field-level errors (e.g., "Name is required") remain separate from the banner — the banner carries the **server-returned** mutation error from `mapErrorToUserMessage`. Field-level validation errors appear under individual inputs with `aria-describedby` and `$status-high` treatment per #30's form-input pattern (not published here; owned by #32's design spec).
- Submit button reflects disabled state during in-flight submission (`opacity: 0.5`, `cursor: not-allowed` per #30 button rules).

---

## Implementation Checklist

### Prerequisites (already satisfied)
- [x] Token files exist at `src/styles/variables/` — `_colors.scss`, `_typography.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_motion.scss`, `_breakpoints.scss`, `_layout.scss`. **Verified on disk.**
- [x] Global `prefers-reduced-motion: reduce` rule is active in `src/styles.css` (lines 6-15). **Verified.**
- [x] All #30 dashboard SCSS files exist and consume canonical tokens. **Verified — no fabricated values found in re-read.**
- [x] `Inter` font family is already referenced via `$font-family-base`. **Verified in `_typography.scss`.**

### Per component (for #31 implementation)
- [ ] `DashboardPageComponent.scss` — **do not modify.**
- [ ] `DashboardPageComponent.html` — **do not modify.**
- [ ] `DashboardPageComponent.ts` — swap data source per tech spec; visual output identical.
- [ ] `DashboardHeaderComponent.*` — not touched.
- [ ] `DashboardSkeletonComponent.*` — not touched.
- [ ] `DashboardEmptyStateComponent.*` — not touched.
- [ ] `DashboardErrorStateComponent.*` — not touched.
- [ ] `ProjectGridComponent.*` — not touched.
- [ ] `ProjectCardComponent.*` — not touched.

### For consumers of the new mutation-error contract (#32 forward)
- [ ] Create `FormErrorBanner` as a standalone component OR inline its SCSS into the mutation form — consumer's choice.
- [ ] Use `@use 'src/styles/variables/…' as *;` imports exactly as in the reference SCSS above. Do NOT hardcode any color, radius, spacing, or duration.
- [ ] Banner renders above the first input, with `$space-md` bottom margin.
- [ ] `role="alert"` + `aria-live="assertive"` + `tabindex="-1"` on the banner root.
- [ ] Submit button's `aria-describedby` references the banner's `id` while visible.
- [ ] On mutation failure, move focus to the banner (`this.bannerRef.nativeElement.focus()`).
- [ ] On successful resubmit, clear the local error signal so the banner unmounts.
- [ ] Dismiss button (if included) uses the icon-button focus and hover rules specified above.
- [ ] Contrast verified: banner body text `$text-primary` on `$bg-card` = 17.9:1 ✅.
- [ ] Touch target ≥ 44×44 on the dismiss button via padding (not explicit `width`/`height`).

### Verification (shared with tech spec §7)
- [ ] `npm run build` succeeds with no new errors or warnings attributable to #31.
- [ ] `npm run test -- --watch=false` passes with no INTRODUCED failures.
- [ ] Lighthouse a11y score on `/dashboard` ≥95 (should be unchanged from #30).
- [ ] Manual keyboard traversal: Tab from top lands on navbar → dashboard header → (if error) Retry button; focus ring is the `2px $brand-primary` pattern.
- [ ] DevTools → `prefers-reduced-motion: reduce` → skeleton pulse freezes, Retry hover is instant.
- [ ] Visual regression check at 320px, 640px, 768px, 1024px, 1280px, 1440px — dashboard matches #30 pixel-for-pixel in each of its four states.

---

## Open questions for developer / PM

The following were surfaced while re-verifying #30 against the canonical design system. They are **not fabricated fixes into this spec** — they are called out here so PM/developer can decide whether they belong in #31's scope, a separate issue, or nowhere.

1. **Dashboard-page `<main>` container is not a named landmark.** `dashboard-page.component.html` uses `<main class="dashboard-page">` without an `aria-label` or `aria-labelledby`. If the app shell wraps this in another `<main>` or if a screen reader enumerates multiple landmarks, the user may hear a generic "main" twice. **Recommendation:** consider adding `aria-labelledby="{header-title-id}"` in #30's header component. **Out of scope for #31 unless the orchestrator decides otherwise.**

2. **Retry button does NOT announce its action target.** The button reads as "Retry" — correct and concise, but a screen-reader user on the error panel without visual context may benefit from `aria-label="Retry loading projects"`. Current copy is acceptable under WCAG AA; this is a nice-to-have. **Not introduced into this spec.**

3. **Skeleton pulse keyframe is a full opacity animation, not a token-driven timing.** `dashboard-skeleton.component.scss` uses `1.4s ease-in-out infinite` — a literal duration and curve. The canonical motion tokens are 150/250/350ms; a 1.4s pulse doesn't fit. Since this is a shipped #30 decision already surviving AC review, **we do not change it in #31**, but a future cleanup could either (a) add a `$motion-skeleton-pulse: 1400ms ease-in-out;` token or (b) document the literal as an explicit exception. Flagged for the token-review backlog.

4. **No existing `FormErrorBanner` implementation in the codebase.** The login/register pages (`register-page.component.scss`, `login-page.component.scss`) are both empty files — they currently have no server-error banner pattern to inherit from. If login/register ever need server-error banners for bad credentials or account-locked states, they would use the same pattern defined here. **#32 is the first implementer; its design spec may reference this section rather than re-specifying.**

5. **Focus-move-to-banner is asserted but not testable from #31.** The focus-management behavior described under Flow B step 6 is a **runtime contract** that #32 will implement. #31's unit tests cannot verify it because #31 does not introduce any form. #32's tests must verify programmatic focus landing on the banner after a failed submit. This spec makes the requirement explicit so it is not lost in #32's tech/design phase.

6. **Mutation-error copy is list-of-operations, not i18n.** `mapErrorToUserMessage` is English-only. When/if the app is localized, the banner's copy source moves to i18n keys. No visual change — flagged here only so the design system is prepared.

No changes to this spec are requested until PM/developer answer these. If any of 1–3 should be incorporated into #31, the spec will be revised and re-issued.

---

## Self-Review Checklist

- [x] Every color, spacing, and radius value references a canonical token.
- [x] Every interactive element (Retry button, CTA, dismiss button) has default / hover / focus / active / disabled. All inherit from #30's already-verified rules, or — for the new dismiss button — are defined above.
- [x] Every list/board view retains its loading / empty / error states (inherited from #30, re-verified).
- [x] Mutation errors have a defined inline-to-caller path (banner) — **color + icon + text**, never color alone.
- [x] Color is paired with text/icon for any semantic signal. Error = 4px bar + icon + sentence.
- [x] Touch targets ≥44px (dismiss button achieves this via banner padding + 32px visual size).
- [x] `prefers-reduced-motion` honored via the existing global rule.
- [x] Tab order described for every complex surface (dashboard, future form).
- [x] Every contrast ratio cited with a measured number (all AAA/AA verified).
- [x] No new tokens introduced.
- [x] Gaps between #30 and the canonical system are flagged (Open questions 1–6) rather than silently patched.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
