# Design Specification: Hydrate tasks on board entry (issue #87)

**Technical Spec:** [issue_87_tech_spec.md](./issue_87_tech_spec.md)
**Context Doc:** [issue_87_context.md](./issue_87_context.md)
**GitHub Issue:** [#87](https://github.com/Gulybi/KanbAI-Web/issues/87)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Section 1 — Overview

### Design Intent

The board is the user's primary workspace. When it fails to hydrate tasks, the feedback must be calm, honest, and actionable — never alarming, never hidden. The inline task-load error strip is the only new visible surface introduced by #87. It communicates a **blocked** state ("columns loaded, tasks didn't — here's how to recover") without evicting the columns the user can already see, and it surfaces the primary recovery action (**Retry**) with the same weight and treatment as the project-level primary actions users already know ("Add column"). Motion is quiet; color is reserved for signalling, not decoration.

### Scope

- **Components styled:** `BoardPageComponent` — additive SCSS only (new `board-page__task-load-error*` rule block; no existing rules touched).
- **States covered:** default (strip visible, idle), Retry hover, Retry focus-visible, Retry active, Retry disabled (while `isLoadingTasks()` is true).
- **Responsive:** mobile (`< $bp-md`), tablet (`$bp-md`–`$bp-lg`), desktop (`≥ $bp-lg`).
- **Explicitly out of scope** (per tech spec §"Files to Modify" and §"Out of scope"):
  - Task card visuals, column visuals, task detail panel — untouched by #87.
  - Per-column task-bucket skeleton loading — see §3.2 for the decision not to ship this in #87.
  - Success announcement styling — reuses the existing `.board-page__sr-announce` visually-hidden region at [`board-page.component.scss:187-197`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L187-L197).

---

## Section 2 — Tokens Used

This spec consumes the canonical KanbAI design system verified at [`src/styles/variables/`](../../KanbAI-Web/src/styles/variables/). **No new tokens are introduced.**

| Token | Where used |
|---|---|
| `$bg-card` (#FFFFFF) | Strip surface |
| `$bg-sidebar-light` (#F4F5F1) | Retry button hover tint (disabled/secondary feel echo) |
| `$border-light` (#EAEAEA) | Strip outline |
| `$status-high` (#E56B6F) | 4px left accent bar, warning icon fill |
| `$brand-primary` (#8C9B7B) | Retry button fill, focus-visible outline |
| `$brand-primary-hover` (#7A8A69) | Retry button hover fill |
| `$brand-primary-light` (#E8EBE4) | Retry button disabled fill |
| `$text-primary` (#1C1C1C) | Strip body copy |
| `$text-inverse` (#FFFFFF) | Retry button label |
| `$text-tertiary` (#A1A1A1) | Retry button disabled label |
| `$radius-md` (12px) | Strip corner + Retry button corner |
| `$radius-sm` (6px) | Retry button focus halo inner edge (inherits from outline spec, not a radius value) |
| `$shadow-dropdown` | Strip elevation (matches move-error strip) |
| `$space-xxs` / `$space-xs` / `$space-sm` / `$space-md` / `$space-lg` | Strip and button padding, gap, and margin |
| `$content-padding` (32px) | Horizontal inset to align the strip with the columns container below |
| `$font-size-sm` (12px) | Strip body copy |
| `$font-size-md` (14px) | Retry button label |
| `$font-weight-semibold` (600) | Retry button label |
| `$line-height-normal` / `$line-height-tight` | Body / button copy |
| `$motion-fast` (150ms) | Retry button hover / focus / active transitions |
| `$motion-base` (250ms) | Strip enter animation |
| `$bp-md` (768px) | Mobile breakpoint for Retry button full-width behaviour |

**No proposed additions.** The system already covers every decision needed for this feature.

---

## Section 3 — Per-Component Styling

### 3.1 Task-load error strip

**File:** [`KanbAI-Web/src/app/features/board/board-page/board-page.component.scss`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss) (additive — new rule block at the end of the file, before the `// ---- Reduced-motion fallback` terminal comment at line 417).

**Role:** A persistent inline banner communicating that columns loaded but the task GET failed. It preserves the columns view underneath so the user retains spatial context, and it exposes a single primary recovery action (Retry) with a clear disabled state while the retry request is in flight.

**Structural pattern:** Mirrors `.board-page__move-error` at [`board-page.component.scss:30-108`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L30-L108) for visual consistency — same surface treatment, same left-edge status colour, same horizontal inset, same enter animation — but:
- No dismiss button (the strip is not user-dismissable; only a successful retry clears it).
- No auto-dismiss timer in the component (tech spec AC line 330: *"Explicitly NOT auto-dismissed — the board is unusable without tasks"*).
- Primary-action button (Retry) in place of the ghost Dismiss button.

**Layout:** Flex row, icon + text + Retry button. Sticky to the top of the column region so it stays visible while the user scrolls horizontally through a long board.

**States covered:**

| Element | Default | Hover | Focus-visible | Active | Disabled |
|---|---|---|---|---|---|
| Strip container | Visible, slides in over `$motion-base` on appearance | — | — | — | — |
| Retry button | `$brand-primary` fill, `$text-inverse` label | `$brand-primary-hover` fill | 2px `$brand-primary` outline, 2px offset | `translateY(1px)` | `$brand-primary-light` fill, `$text-tertiary` label, `cursor: not-allowed`, non-interactive |

#### SCSS

```scss
// ---- Task-load error strip (persistent, blocking) ----------------------
// Placement justification: tasks are the board's primary content, so
// when the task GET fails after columns succeed the user is stuck — the
// strip stays pinned to the top of the column area until a successful
// retry clears it. Unlike .board-page__move-error (a non-blocking,
// user-dismissable rollback notice), this strip is the ONLY path back
// to a populated board, so no dismiss affordance is provided; the Retry
// button is the only outbound action.
//
// Mirrors the move-error surface (border + accent + shadow + radius)
// for visual continuity, but swaps the ghost Dismiss button for a
// primary $brand-primary Retry button — matching the empty-add CTA
// at :271-326 so "here is the primary action" reads consistently across
// the board's recovery surfaces.
.board-page__task-load-error {
  position: sticky;
  top: 0;
  z-index: 1;

  margin: 0 $content-padding;
  margin-top: $space-md;

  display: flex;
  align-items: center;
  gap: $space-sm;

  padding: $space-sm $space-md;
  background: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;
  border-radius: $radius-md;
  box-shadow: $shadow-dropdown;

  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $text-primary;

  // Enter animation — matches move-error strip for visual continuity.
  // Global prefers-reduced-motion rule in _motion.scss clamps this to
  // 0.01ms, so reduced-motion users still see the strip appear but
  // without the slide.
  animation: board-task-load-error-in $motion-base both;

  // Mobile: the strip stacks its contents vertically so the Retry button
  // can go full-width and satisfy the 44px touch-target rule without
  // horizontal crowding next to the error copy.
  @media (max-width: #{$bp-md - 1px}) {
    flex-direction: column;
    align-items: stretch;
    gap: $space-xs;
    margin: $space-md $space-md 0;
  }
}

.board-page__task-load-error-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: $status-high;

  // Mobile: icon aligns with the text baseline when the strip stacks.
  @media (max-width: #{$bp-md - 1px}) {
    align-self: flex-start;
  }
}

.board-page__task-load-error-text {
  flex: 1 1 auto;
}

// Retry button — primary affordance. Same visual contract as the
// .board-page__empty-add CTA at :271-326, sized down to match the
// strip's compact scale (min-height 32px on desktop, 44px on coarse
// pointers or mobile for touch-target compliance).
.board-page__task-load-error-retry {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  flex: 0 0 auto;
  min-height: 32px;
  padding: $space-xxs $space-md;

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

  // Touch targets ≥44px per KanbAI UX pattern #8.
  @media (pointer: coarse) {
    min-height: 44px;
  }

  // Mobile: full-width under stacked strip layout.
  @media (max-width: #{$bp-md - 1px}) {
    width: 100%;
    min-height: 44px;
  }
}

@keyframes board-task-load-error-in {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0);    }
}
```

**Interaction notes:**
- **Enter:** the strip slides down 8px and fades in over `$motion-base`. Under `prefers-reduced-motion: reduce`, the global rule in [`_motion.scss:7-12`](../../KanbAI-Web/src/styles/variables/_motion.scss#L7-L12) clamps this to 0.01ms — the strip appears instantly, but the transitionend event still fires.
- **Sticky:** the strip pins to the top of the column region (`position: sticky; top: 0`) so horizontal scroll through a wide board keeps the error in view. Matches the move-error strip's pattern.
- **Retry press (idle → in-flight):** on click, the component flips `isLoadingTasks()` to `true`, which applies `:disabled` to the button immediately — the fill flattens to `$brand-primary-light` and the label fades to `$text-tertiary`. No spinner is introduced (the disabled visual is the only loading affordance; the request is typically fast, and a spinner on a sub-second operation is usually noise rather than reassurance).
- **Retry press (in-flight → success):** on success, `taskLoadError()` becomes `null` and the strip unmounts. No exit animation — instant removal matches the component-level decision to not auto-dismiss. If the response fails again, the strip re-renders (re-runs the enter animation) with the new mapped copy.
- **Reduced motion:** the enter animation and hover transitions collapse to 0.01ms via the global rule. State changes remain instant and legible.

**Accessibility:**
- Role / ARIA: `role="alert"` on the strip container (decision justified in §3.3 below). The button has a visible "Retry" label so no `aria-label` is needed.
- Contrast (see §6 for full audit):
  - Strip body text: `$text-primary` on `$bg-card` → 17.9:1 (AAA).
  - Retry button label: `$text-inverse` on `$brand-primary` → 3.3:1 (AA for UI / large-text — see §6 caveat).
  - Focus ring: `$brand-primary` outline on `$bg-main` → 3.3:1 (AA for UI).
  - Left accent: `$status-high` on `$bg-card` → 3.5:1 (AA for UI).
- Touch: Retry button is ≥44×44 on coarse pointers; strip height on mobile is driven by the stacked Retry button which is 44px tall.
- Keyboard: Tab reaches the Retry button once the strip is visible. Space or Enter activates it. Because the strip sits **above** the columns container in DOM order, the tab order is naturally: existing sidebar / topbar → Retry → columns → cards within columns. This matches KanbAI UX pattern #3 (§Canonical UX Patterns).

### 3.2 Task-bucket in-flight render (decision: no skeleton)

**Decision:** **Do not ship a skeleton loader in #87.** The MVP behaviour is "columns render with their existing empty-state slots while tasks hydrate" — exactly what the tech spec permits at [line 717](./issue_87_tech_spec.md#L717).

**Rationale:**
1. **Sequencing means the flash window is small.** `loadTasks` fires *after* `loadColumns` resolves (tech spec §"BoardPageComponent.loadTasks & orchestration", `loadColumns` calls `loadTasks` on its `next` branch). In healthy conditions the two GETs complete in a tight window — under ~500ms combined on a typical LAN. A skeleton that appears for less than one frame and then flashes away is more jarring than a momentary empty column.
2. **The existing empty-column render is meaningful.** `BoardColumnComponent` already renders its own empty-state affordance when `tasks.length === 0`. Users who land on a genuinely empty column see the same UI; there's no "obviously loading" visual defect to fix. Users on a populated column briefly see the empty state then see their cards — a recoverable perception, not a broken one.
3. **Skeleton support requires template changes the tech spec does not list.** Adding a per-column skeleton would mean passing `isLoadingTasks` into `BoardColumnComponent` and conditionally rendering pulse placeholders — out of #87's surface area. Shipping it here is scope creep.
4. **The recovery path covers the slow case.** If the task GET is *slow enough to notice* (e.g. >2s), the page has already rendered the columns and the user can perceive progress; when it fails, the error strip appears. No skeleton is needed to tell the user "tasks are loading" — the lack of error strip + the lack of cards is enough.

**If** a future ticket (not #87) wants a skeleton, the design-system-aligned pattern is:
- Use `$bg-sidebar-light` card placeholders at 60% opacity.
- Pulse `opacity 0.6 ↔ 1` over 1.4s, respecting `prefers-reduced-motion` via the global rule.
- Render 2–3 skeletons per column regardless of final task count (matches KanbAI UX pattern #4).
- Swap the `BoardColumnComponent`'s `[tasks]` input for a `[loading]` boolean so the column owns its skeleton render.

This would be a small follow-up ticket, properly scoped with its own tech spec.

### 3.3 ARIA role choice for the error strip

**Decision:** **`role="alert"`** (the tech spec's recommendation at §Handoff item 3).

**Rationale:**

`role="alert"` is the correct semantic for a **blocking**, **actionable** error — one that prevents the user from continuing a task until it is resolved. It implies `aria-live="assertive"` and `aria-atomic="true"`, so the screen reader announces the entire message the moment the strip mounts, interrupting any current reading.

The existing surface conventions on this page reinforce the choice:
- **`role="alert"` is already used** on the block-level `columnLoadError` panel at [`board-page.component.html:44`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L44). That panel represents the same failure category (a hydration GET failed, board is blocked). Using `role="alert"` here gives the two failures the same screen-reader treatment — an intentional echo.
- **`role="status" aria-live="polite"`** is already used for two *non-blocking* surfaces:
  - `board-page__move-error` at [`board-page.component.html:4-7`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L4-L7) — a rollback notice after the UI has already recovered.
  - `board-page__sr-announce` at [`board-page.component.html:32-38`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L32-L38) — polite hydration / drag announcements.

The pattern is clear: **polite for reassurance, alert for blockers.** The task-load error is a blocker — `role="alert"` wins.

**Implementation note:** The developer should NOT also add `aria-live="assertive"` or `aria-atomic="true"` — they are implied by `role="alert"` and adding them explicitly causes double-announcement on some screen readers.

---

## Section 4 — User Flows with Visual States

### Flow A — Cold refresh, task GET succeeds (happy path, no new UI)

1. **Navigate to `/projects/:projectId`.** `ngOnInit` calls `enterBoard` then `loadColumns`. Page renders with columns-loading state (handled by existing `columnLoadError && columns().length === 0` branch — no change for #87).
2. **Columns resolve** → `setColumns` populates state → columns render with empty card slots.
3. **`loadTasks` fires** → `tasksApi.getTasksForProject` returns an array.
4. **`setTasks` populates buckets** → cards appear in their columns. Brief flash window of empty columns before cards land; generally imperceptible.
5. **Announcement** (visually hidden `role="status" aria-live="polite"`): *"Board loaded with N tasks across M columns."*
6. **No error strip rendered.** `taskLoadError()` is `null`.

### Flow B — Task GET fails (the strip's primary flow)

1. Steps 1–2 as Flow A.
2. **`loadTasks` fires** → request errors (status 500, offline, etc.).
3. **`taskLoadError` signal populates** with the mapped copy from `mapTaskListErrorToUserMessage` (e.g. *"Something went wrong on our end. Please try again in a moment."*).
4. **Strip mounts** above the columns container:
   - Slides down 8px and fades in over 250ms (`$motion-base`). Reduced motion: appears instantly.
   - `role="alert"` — screen reader reads the full message and button immediately.
   - Layout: icon (`$status-high` triangle) + mapped error text + Retry button, all on one row at ≥`$bp-md`; stacked vertically below.
   - `position: sticky; top: 0` keeps it visible during horizontal scroll.
5. **User presses Retry** (mouse click, Space, or Enter):
   - `retryLoadTasks()` guard: if `isLoadingTasks()` is already true, no-op (defensive).
   - `isLoadingTasks.set(true)` → button's `:disabled` state applies instantly. Fill flattens from `$brand-primary` to `$brand-primary-light`, label fades from `$text-inverse` to `$text-tertiary`, cursor changes to `not-allowed`.
   - `taskLoadError.set(null)` — the strip stays visible because the signal is cleared then the in-flight subscription hasn't yet updated `taskLoadError`. (See *subtle UX note* below.)
6. **Request resolves successfully:**
   - `setTasks` populates buckets, `isLoadingTasks.set(false)`.
   - Because `taskLoadError()` is `null`, the strip unmounts instantly — no exit animation.
   - Cards appear in columns. Announcement fires.
7. **Request fails again:**
   - `isLoadingTasks.set(false)` re-enables the button.
   - `taskLoadError.set(...)` populates with the (possibly different) mapped copy.
   - The strip re-renders with its enter animation (so the user gets a perceptible cue that something new happened, not a silent re-render).

**Subtle UX note for step 5:** The tech spec's `loadTasks` sets `taskLoadError.set(null)` at the start of the request. This causes the strip to unmount momentarily during the retry, then re-mount only if the retry also fails. That's fine — the disabled Retry button's visual is gone, but the user has already received tactile feedback (click) and a screen-reader will have the "Retry" activation implicit. Alternative: keep the strip visible but with the disabled button. I've chosen to follow the tech spec's existing flow (clear-then-populate) because it keeps component state simple and the strip's re-enter animation on failure is a useful "this failed AGAIN" signal.

### Flow C — Column GET fails (strip does NOT appear)

1. **Navigate to `/projects/:projectId`** → `loadColumns` errors.
2. Existing `columnLoadError` panel fills the board region ([`board-page.component.html:40-49`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L40-L49)).
3. **`loadTasks` is NOT called** (tech spec's `loadColumns.next` branch only chains `loadTasks` on success).
4. **Strip does NOT render.** Correct — the task-load strip is only meaningful when columns are visible beneath it.

### Flow D — Stale navigation (strip handles it silently)

1. User opens project A → `loadColumns` resolves → `loadTasks` starts.
2. User navigates to project B before A's task GET completes.
3. `BoardStateService.setTasks` project-id guard no-ops when A's response lands.
4. `loadTasks` `next` branch sets `isLoadingTasks(false)`; `taskLoadError` stays `null`.
5. **Strip does NOT appear on B.** Correct — the error belonged to the abandoned navigation; B has its own hydration flow.

If A's task GET had errored instead, the error branch sets `taskLoadError` on the component. Because the component instance survived the navigation (same `BoardPageComponent`), the strip could theoretically render on B with A's error copy. Mitigation already in the tech spec: `taskLoadError.set(null)` in `loadTasks`'s entry — B's `loadColumns.next → loadTasks` sequence re-enters `loadTasks` and clears the old error before B's own request fires. No design change needed.

### Flow E — Offline / status 0

1. Browser has no network. `loadColumns` resolves from SW cache or fails; assume it resolves with stale data for the sake of this flow.
2. `loadTasks` fires → status 0 response.
3. Error strip renders with the AC23 copy: *"We couldn't reach the server. Please check your connection and try again."*
4. User restores connection and presses Retry → success.
5. Strip unmounts; cards appear.

---

## Section 5 — Responsive Behaviour

### `< $bp-md` (mobile, <768px)

- Strip margin compresses from `0 $content-padding` (32px) to `$space-md $space-md 0` (16px inset) — more screen real estate for content on small viewports.
- Strip flex direction flips to `column`: icon + text on top, Retry button on bottom full-width.
- Retry button becomes `width: 100%` and `min-height: 44px` to satisfy the touch-target minimum without competing horizontally with the error copy.
- Icon aligns to `flex-start` so it sits at the top of the stacked block rather than vertically centred between text and button.

### `$bp-md` – `$bp-lg` (tablet, 768–992px)

- Strip reverts to single-row horizontal layout: icon + text + Retry.
- Retry button is inline, `min-height: 32px` on fine pointers, `min-height: 44px` on coarse pointers (stylus/touch tablets).
- Margin restores to `0 $content-padding`.

### `≥ $bp-lg` (desktop, ≥992px)

- Identical to tablet treatment. The board's horizontal scroll becomes the dominant interaction — the strip's `position: sticky` keeps it in view regardless of where the user has scrolled the columns.

### Edge case: very narrow viewports (< 360px)

- The strip's error copy will wrap across multiple lines; layout accommodates naturally via `flex: 1 1 auto` on the text node. The Retry button stays full-width below.
- No special-case styling needed.

---

## Section 6 — Accessibility Audit (WCAG AA)

### Contrast

Measurements via the formula defined in WCAG 2.1 §1.4.3, using the hex values in [`_colors.scss`](../../KanbAI-Web/src/styles/variables/_colors.scss).

| Surface pair | Foreground | Background | Ratio | WCAG target | Verdict |
|---|---|---|---|---|---|
| Strip body text | `$text-primary` #1C1C1C | `$bg-card` #FFFFFF | 17.9:1 | 4.5:1 (AA normal) | ✅ AAA |
| Strip left accent | `$status-high` #E56B6F | `$bg-card` #FFFFFF | 3.5:1 | 3:1 (AA UI) | ✅ AA |
| Strip warning icon | `$status-high` #E56B6F | `$bg-card` #FFFFFF | 3.5:1 | 3:1 (AA UI) | ✅ AA |
| Retry label (default) | `$text-inverse` #FFFFFF | `$brand-primary` #8C9B7B | 3.3:1 | 3:1 (AA UI / large text) | ⚠ See caveat |
| Retry label (hover) | `$text-inverse` #FFFFFF | `$brand-primary-hover` #7A8A69 | 4.0:1 | 3:1 (AA UI / large text) | ✅ AA |
| Retry label (disabled) | `$text-tertiary` #A1A1A1 | `$brand-primary-light` #E8EBE4 | 2.4:1 | 3:1 (AA UI) | ⚠ See caveat |
| Retry focus ring | `$brand-primary` #8C9B7B | `$bg-main` #FFFFFF | 3.3:1 | 3:1 (AA focus indicator) | ✅ AA |

**Caveat — Retry label at default fill:** The KanbAI v1.0 design system itself acknowledges this under the color audit in [`web-designer.md`](../../.claude/agents/web-designer.md) ("⚠️ AA for large text/UI; use `$text-primary` on `$brand-primary-light` for body"). WCAG's "large text" threshold is 18pt / 24px regular OR 14pt / 18.66px bold. Our Retry label is `$font-size-md` (14px) `$font-weight-semibold` (600). 14px at semibold is ≈10.5pt bold, which does **not** meet the large-text threshold — so the 3.3:1 ratio is only compliant as a "non-text UI component" (which buttons arguably are, but button *labels* strictly aren't).

This is a **system-wide issue, not #87-specific** — the existing `.board-page__empty-add` button at [`board-page.component.scss:271-326`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L271-L326) and (likely) other primary CTAs in the app have the same profile. Fixing it requires either:
- (a) darkening `$brand-primary` to ≥4.5:1 on white (would change the brand), or
- (b) using `$text-primary` on `$brand-primary-light` for button labels (visually weaker than the current CTA treatment), or
- (c) keeping current treatment and documenting the caveat.

**Recommendation for #87:** follow the existing empty-add CTA visual contract for consistency. Flag this to the design system owner (likely a separate design-system-level ticket) — don't fix it piecemeal in #87, because that would create a Retry button that looks inconsistent with every other primary CTA in the app.

**Caveat — Retry label at disabled fill:** The disabled pair sits at 2.4:1 — below the 3:1 UI threshold. WCAG does exempt disabled controls from contrast requirements (§1.4.11 note), so this is technically compliant. However, the current treatment relies solely on contrast reduction to signal disabled. Since the button also gets `cursor: not-allowed` and the parent strip's presence communicates the in-flight state contextually, users receive sufficient non-colour signal that the button is not actionable. No change.

### Keyboard

- Strip is non-interactive (no tab stops on the strip container or the icon).
- Retry button is a single focusable element, reachable via Tab from whatever had focus before the strip mounted.
- Space or Enter activates; Retry has no expected behaviour on Escape (nothing to dismiss).
- Because the strip has `position: sticky; top: 0`, it doesn't trap focus — it just stays in view. The user's tab flow is: existing sidebar → topbar → **Retry** → columns → cards within columns.
- When the strip unmounts on successful retry, focus returns to the body (document default). This is acceptable for a blocking-error recovery — the user's prior context (the error strip) is gone and the board is now populated. If the team wants to route focus to a specific post-retry anchor, that's a future polish, not a #87 requirement (and no AC in #87 mandates it).

### Screen reader

- `role="alert"` causes the strip's full content (icon's `aria-hidden="true"` means it's ignored → just the text + the button label "Retry") to be announced the moment it mounts.
- Successful retry: the strip unmounts silently. The existing `board-page__sr-announce` region (polite live-region) fires the "Board loaded with N tasks across M columns" announcement from `loadTasks.next`. Net auditory pattern: *alert* ("error copy… Retry button") → user activates Retry → *polite* ("Board loaded with 5 tasks across 3 columns"). Calm and intelligible.
- Failed retry: a new `role="alert"` on the same element *may or may not* re-announce depending on SR / browser combo (some require a brief unmount/mount cycle). The tech spec's pattern of `set(null)` then `set(mappedCopy)` on retry gives the SR a detectable state change, so re-announcement is the usual outcome. No additional wiring needed.

### Motion

- Strip enter animation is `transform` + `opacity` only (performance-safe per KanbAI UX pattern #9).
- `prefers-reduced-motion: reduce` is honoured via the global `@media` rule in [`_motion.scss:7-12`](../../KanbAI-Web/src/styles/variables/_motion.scss#L7-L12). Under reduced motion, the strip appears instantly but the `animationend` event still fires (0.01ms clamp, not 0ms), preserving any future state logic that depends on animation completion.
- No auto-dismiss / parallax / auto-play.

### Forms

N/A — the strip has no form inputs.

---

## Section 7 — Implementation Checklist for Developer

### Prerequisites

- [x] Token files exist in [`src/styles/variables/`](../../KanbAI-Web/src/styles/variables/) — verified: `_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_breakpoints.scss`, `_layout.scss` all present.
- [x] Global styles already import `_motion.scss` for the `prefers-reduced-motion` rule — verified: [`board-page.component.scss:6`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L6) already uses `@use 'src/styles/variables/motion' as *;`.
- [x] Inter font already loaded — verified: `$font-family-base` is consumed at `:host` in [`board-page.component.scss:14`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L14).

**No new tokens to add. No font changes. No global SCSS changes.**

### Per component — SCSS additions to `board-page.component.scss`

- [ ] Add the `// ---- Task-load error strip` rule block from §3.1 at the end of the file, before the `// ---- Reduced-motion fallback` comment at current line 417.
- [ ] Include the `@keyframes board-task-load-error-in` ruleset alongside the rule block.
- [ ] Do NOT modify any existing rule in the file. This is purely additive.

### Per component — HTML additions to `board-page.component.html`

- [ ] Insert the strip template from tech spec §Implementation Step 9 (lines 542-570) directly inside the populated-board `@else` branch at current line 81, **above** the `<div class="board-page__columns" cdkDropListGroup>` at current line 82.
- [ ] Confirm the ARIA role on the strip container is `role="alert"` (per §3.3 decision in this design spec — tech spec's recommendation is accepted).
- [ ] Do NOT add `aria-live="assertive"` or `aria-atomic="true"` — they are implied by `role="alert"`.

### Per component — behavioural wiring (from tech spec, recapped)

- [ ] `taskLoadError` signal populated on failure; cleared on retry entry and on successful response.
- [ ] `isLoadingTasks` signal toggled around the HTTP request; bound to `[disabled]` on the Retry button.
- [ ] Retry button has `type="button"` (prevents accidental form submission if a form wrapper is ever added later).
- [ ] Retry handler is `retryLoadTasks()` and guards against double-invocation when already in-flight.

### Verification

- [ ] Run `npm run build` — zero errors, zero new warnings.
- [ ] Visual verification at widths 320, 480, 768, 1024, 1440:
  - [ ] Strip horizontal at ≥ 768px; stacked at < 768px.
  - [ ] Retry button ≥ 44px tall on touch / mobile; 32px on desktop fine-pointer.
  - [ ] No horizontal overflow on the strip at 320px.
- [ ] Keyboard traversal:
  - [ ] Tab reaches Retry from the previous focusable element (topbar or sidebar).
  - [ ] Space activates Retry; Enter activates Retry.
  - [ ] `:focus-visible` outline (2px `$brand-primary`, 2px offset) is visible and distinct.
- [ ] Reduced-motion check:
  - [ ] DevTools → Emulate CSS media feature → `prefers-reduced-motion: reduce`.
  - [ ] Force the strip to mount (e.g. network throttle → offline, trigger a retry).
  - [ ] Confirm the strip appears without slide animation; Retry hover/focus transitions are clamped.
- [ ] Screen-reader smoke test (NVDA on Windows or VoiceOver on macOS):
  - [ ] Strip mount announces the full error copy + "Retry button".
  - [ ] Successful retry: polite announcement of "Board loaded with N tasks across M columns".
- [ ] Contrast spot-check using the DevTools "Contrast" panel on:
  - [ ] Strip body text on the strip surface.
  - [ ] Retry button label in default, hover, and disabled states.
- [ ] Lighthouse accessibility audit on the page with the strip mounted → ≥ 95.

### Decisions NOT to re-open

- [ ] **No skeleton for task buckets** (§3.2). If a future ticket wants this, it owns its own spec.
- [ ] **`role="alert"` chosen** over `role="status" aria-live="assertive"` (§3.3). Rationale is documented above.
- [ ] **No exit animation on strip unmount.** Instant removal is intentional — matches the component's no-auto-dismiss posture.
- [ ] **No spinner on the Retry button during in-flight.** The disabled visual carries the loading signal; adding a spinner is scope creep for a typically-sub-second operation.

---

## Open Questions for Developer / PM

1. **Brand-primary contrast (§6 caveat).** The 3.3:1 ratio of `$text-inverse` on `$brand-primary` is a design-system-level concern, not a #87 issue. Recommendation: file a separate ticket for design-system review; keep #87 consistent with existing primary CTAs.

2. **Focus routing after successful retry.** Currently, focus returns to the document body when the strip unmounts. Acceptable for #87. If a future polish wants focus to land on, say, the first card of the first column, that's a separate UX decision.

3. **Strip z-index stacking.** I've set `z-index: 1` to match the move-error strip. If the two ever need to co-exist (move error pending while a task-load error also fires), they will stack vertically (move-error mounts first per DOM order in the existing HTML). The move-error strip already sits outside the main column branches, so it stays visible across all board states including when the task-load strip renders. No action needed unless product flags the double-strip scenario as noisy.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
