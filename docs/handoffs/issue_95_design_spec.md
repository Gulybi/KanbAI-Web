# Design Specification: Gate Attachment List Hydration on Real Task-Id Transitions

**Technical Spec:** [issue_95_tech_spec.md](./issue_95_tech_spec.md)
**Business Context:** [issue_95_context.md](./issue_95_context.md)
**GitHub Issue:** [#95](https://github.com/Gulybi/KanbAI-Web/issues/95)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Section 1 — Overview / Design Intent

Issue #95 is a **non-visual, client-side fetch-gating bug fix**. The tech spec is explicit: no new components, no new services, no new models, no backend or SignalR or contract change, and every presentational component in the attachments feature (`AttachmentListComponent`, `AttachmentRowComponent`, `FileDropzoneComponent`, `UploadProgressRowComponent`, `TaskDescriptionSectionComponent`) is **untouched**. The only behaviour change lives inside `TaskDetailPanelComponent`'s constructor effect and `AttachmentsStateService.hydrateCompletedForTask`.

This document is therefore a **regression-guard spec**, not a paint spec. Its job is to pin down, in one place, every visual state and a11y invariant that the attachment list renders today so QA has a precise diff surface to verify the fix preserves. No new SCSS is authored; no tokens are added; no component is restyled.

The design intent is negative and concrete: after the fix lands, the six user flows in §4 must render identically to today, the four visible list states (`loading` / `ready` (populated) / `ready` (empty) / `error`) must look and announce the same, and the current `prefers-reduced-motion` and `aria-*` behaviours must continue to work. Anything that moves is a regression.

---

## Section 2 — Tokens Used

**No new tokens introduced. No existing tokens modified. No token file changes.**

The table below is a contract — these are the tokens the unchanged SCSS already consumes in the components this fix is adjacent to. The developer must leave each of these usages in place.

| Token | Where already consumed (must stay consumed after fix) |
|---|---|
| `$bg-main` | Attachment list skeleton row background; panel background |
| `$bg-sidebar-light` | Skeleton shimmer sweep (loading state) |
| `$bg-dropzone` | Attachment list empty-state container |
| `$brand-primary` | Error-banner Retry button `:focus-visible` outline; Retry hover fill; panel close-button focus outline |
| `$brand-primary-light` | Retry button default surface; retryable error banner tint |
| `$brand-primary-hover` | Retry button `:active` fill |
| `$status-high` | Non-retryable error banner left border + icon colour |
| `$status-average` | Retryable error banner left border + icon colour |
| `$text-primary` | Error banner message copy; Retry button label |
| `$text-secondary` | Empty-state copy; section labels |
| `$text-inverse` | Retry button label on hover/active |
| `$border-light` | Skeleton row border; empty-state dashed outline |
| `$radius-md` | Skeleton rows, empty-state container, error banner, Retry button |
| `$shadow-card` | Skeleton row resting shadow |
| `$space-xxs` / `$space-xs` / `$space-sm` / `$space-md` | List vertical rhythm, header spacing, error banner padding |
| `$font-size-sm` / `$font-size-md` | Error copy; empty-state copy |
| `$font-weight-medium` / `$font-weight-semibold` | Error copy; Retry label |
| `$line-height-normal` | Empty-state and error copy |
| `$motion-fast` | Row enter animation; Retry button colour transition |

**Proposed Token Additions:** None.

---

## Section 3 — Per-Component Styling (No SCSS Change)

Each subsection below names a component the fix touches or is adjacent to, declares **"No SCSS change"**, and lists the visible states the developer must verify render identically before and after the fix.

### 3.1 `TaskDetailPanelComponent`

**File:** `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`
**SCSS change:** **None.** The fix is entirely inside the component's constructor `effect(...)` — TypeScript only. See tech spec §Implementation Steps, Step 3.

**States that must render identically after the fix:**
- Panel open (at rest) — header, body scroll, dropzone, list section all present and unchanged.
- Panel closed — unchanged.
- Panel header title re-rendering on a remote `TaskUpdated` for the open task — still updates in place (unchanged).
- Responsive widths at `md` (420px) and `lg` (480px) — unchanged.
- Close button hover / focus-visible / active — unchanged.

### 3.2 `AttachmentListComponent`

**File:** `src/app/features/attachments/components/attachment-list/attachment-list.component.scss`
**SCSS change:** **None.** This component receives `completedAttachments()` and `listFetchState()` as inputs. The fix changes *when* hydration fetches fire, not *how* these inputs render. See tech spec §Component Architecture: "Unchanged (Presentational) Components".

**States that must render identically after the fix (the four visible list states):**

1. **Loading (initial / retry)** — `.attachment-list__skeleton` renders 3 rows of `.attachment-list__skeleton-row` with a 40%-wide `$bg-sidebar-light` shimmer sweeping left→right over 1.6s on `$bg-main` with `$border-light` border, `$radius-md`, `$shadow-card`. Host carries `aria-busy="true"` semantics.
2. **Ready (populated)** — `.attachment-list__header` with `"Attachments"` label (`$text-secondary`, uppercase, `$font-size-sm`, `$font-weight-semibold`) plus count. `.attachment-list__rows` renders `app-attachment-row` children, each animating in via `attachment-list-row-enter` keyframes over `$motion-fast` (8px translateY, 0→1 opacity).
3. **Ready (empty)** — `.attachment-list__empty` container: `$bg-dropzone`, dashed `$border-light`, `$radius-md`, centered `$text-secondary` copy.
4. **Error (retryable, e.g. 5xx or network)** — `.attachment-list__error.attachment-list__error--retryable`: `$brand-primary-light` tint, `$status-average` 3px left border, `$status-average` icon, `$text-primary` copy, Retry button on the right.
5. **Error (non-retryable, 403/404)** — `.attachment-list__error`: `rgba($status-high, 0.08)` tint, `$status-high` 3px left border, `$status-high` icon, `$text-primary` copy, no Retry button (or disabled per #51).

**Transitions between states (must not regress):**
- `loading → ready` is a natural swap of DOM; no explicit CSS transition, but the newly-inserted rows animate in via the row-enter keyframe.
- `error → loading` (on Retry) is a natural swap; banner unmounts, skeleton mounts.
- `ready → loading` **must not fire on unrelated board-state churn today's bug**. After the fix, this transition is only reachable via an explicit Retry from an `error` state, or a task-id transition (which re-mounts a fresh list scope).

### 3.3 `AttachmentRowComponent`

**File:** `src/app/features/attachments/components/attachment-row/attachment-row.component.scss`
**SCSS change:** **None.** Not in the fix's modification list.

**States to verify unchanged:**
- Resting row (icon, filename, size, createdAt meta, download affordance).
- Hover / focus-visible / active on the row and on the download control.
- Row enter animation when a new `AssetCompleted` SignalR event appends a row (pre-existing behaviour — the fix preserves this).

### 3.4 `FileDropzoneComponent`

**File:** `src/app/features/attachments/components/file-dropzone/file-dropzone.component.scss`
**SCSS change:** **None.** Not in the fix's modification list.

**States to verify unchanged:** idle, hover, dragging-over (drop target), disabled. The dropzone is not data-driven by the list fetch state, so the fix cannot affect it.

### 3.5 `UploadProgressRowComponent`

**File:** `src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.scss`
**SCSS change:** **None.** Not in the fix's modification list.

**States to verify unchanged:** queued, uploading (progress bar), completed, failed (with retry affordance).

### 3.6 Error banner inside the list (regression focus)

The error banner is the single most sensitive visual surface for this fix, because today's bug is observed to **spuriously clear the error banner** on a slow connection (each unrelated board event flips `fetchState` from `error` → `loading` → `ready`/`error` again, blinking the banner away and back). The fix removes that churn.

**Regression guard:**
- Once the list enters `error` phase, the banner **must remain on screen, unchanged, for the full duration** until the user clicks Retry or navigates to a different task. Unrelated board events must not cause any visible change to the banner — not a flash, not a re-render.
- The Retry button retains focus if the user had tabbed to it; focus must not be lost by a same-task input re-emission.

---

## Section 4 — User Flows with Visual States

The heart of this spec. Each flow below is a before → during → after snapshot tied to the acceptance criteria. QA uses these as the manual-verification script.

### Flow 1 — Initial panel open for a task with attachments

| Step | Visual | a11y |
|---|---|---|
| 1. User clicks task card | Panel slides in from right over `$motion-slow` | Focus moves into panel header/title |
| 2. Panel body renders | `.attachment-list__skeleton` shows 3 shimmering rows | `aria-busy` semantics on the list region |
| 3. `GET /api/task/X/assets` resolves | Skeleton unmounts, `.attachment-list__rows` mounts with row-enter animation per row over `$motion-fast` | `aria-live="polite"` announces "Attachments loaded, N items" (or today's copy — must not change) |

**Regression guard:** Exactly **one** `loading → ready` transition. No second flash.

### Flow 2 — Unrelated `TaskUpdated` while panel stays open on task X (the bug)

| Step | Visual (today — buggy) | Visual (after fix) | a11y |
|---|---|---|---|
| 1. Panel is open on X, list in `ready` state | Rows rendered | Rows rendered | — |
| 2. Teammate renames a **different** task Y; `TaskUpdated(Y)` arrives via SignalR; `BoardStateService.onTaskUpdated` rebuilds map; `[task]` input into the panel re-emits with a new reference but same id `X` | On slow connection: list briefly flips to `loading` (skeleton flashes over existing rows) then back to `ready`. Error banner (if present) is cleared. | **No visible change.** List stays in `ready`. No skeleton flash. Error banner (if present) stays put. | Live region does **not** re-announce "Attachments loaded" |

**Regression guard:** This is the primary bug. QA must verify **zero** visible change on the attachment list when an unrelated task mutation flows through. On a throttled connection (DevTools → Slow 3G), the bug is most reliably observed — after the fix, no flash.

### Flow 3 — Close + reopen the **same** task X (list was `ready`)

| Step | Visual | a11y |
|---|---|---|
| 1. Panel open on X, list `ready` with rows | Rows rendered | — |
| 2. User clicks close; panel slides out | Panel translates off-screen over `$motion-slow` | Focus returns to the originating task card |
| 3. User clicks the same card again; panel slides back in | Panel translates in; `.attachment-list__rows` **renders immediately** with the cached rows (Option A per tech spec) — **no loading skeleton** | Focus moves into panel; no "loading…" announcement |

**Regression guard:** Per tech spec Option A, reopening the same task whose list is `ready` shows rows instantly. The list must **not** transition through `loading`. Zero `GET` is fired.

### Flow 4 — Close + reopen a **different** task Y

| Step | Visual | a11y |
|---|---|---|
| 1. Panel open on X, list `ready` | X's rows rendered | — |
| 2. User closes, then opens Y | Panel slides out, then slides in with Y's content | Focus into panel |
| 3. Y's list begins hydration | `.attachment-list__skeleton` shows 3 shimmering rows | `aria-busy` on the list region |
| 4. `GET /api/task/Y/assets` resolves | Skeleton unmounts, Y's rows mount with row-enter animation | Live region announces Y's list ready |

**Regression guard:** Exactly one `GET` fires for Y. Skeleton shown once, then rows.

### Flow 5 — Retry from the error banner

| Step | Visual | a11y |
|---|---|---|
| 1. Initial fetch fails (e.g. 503) | `.attachment-list__error--retryable` banner with `$status-average` border, icon, copy, Retry button | Banner is in tab order; `role="alert"` or equivalent announces error copy |
| 2. User tabs to Retry and presses Enter (or clicks) | Retry button shows `:active` fill (`$brand-primary-hover`, `$text-inverse`) | — |
| 3. Banner unmounts, `.attachment-list__skeleton` mounts | Skeleton shimmers | `aria-busy` restored; live region announces "Retrying" or today's copy |
| 4a. Retry succeeds | Skeleton unmounts, rows mount with enter animation | "Attachments loaded, N items" announced |
| 4b. Retry fails again | Skeleton unmounts, error banner returns | Error copy re-announced |

**Regression guard:** Retry still works identically. One `GET` per click; overlapping clicks deduped by the `loading` guard in the state service (unchanged code path).

### Flow 6 — SignalR `AssetCompleted` for the open task X (live update)

| Step | Visual | a11y |
|---|---|---|
| 1. Panel open on X, list `ready` with rows | Rows rendered | — |
| 2. Teammate uploads an attachment on X; backend emits `AssetCompleted(X, asset)` | — | — |
| 3. New row appears at top of `.attachment-list__rows` with the row-enter animation (translateY 8px → 0, opacity 0 → 1) over `$motion-fast` | Rows shift down | `aria-live` announces "New attachment: {filename}" (or today's copy) |

**Regression guard:** This is an **unchanged** path — SignalR drives the update, not an HTTP fetch. After the fix, the new row still appears in-place with no skeleton flash, no full-list reload, no `GET`.

---

## Section 5 — Responsive Behaviour

The panel's existing responsive behaviour is unchanged by this fix:
- `< md`: panel is full-width.
- `≥ md` (768px): panel is 420px wide, anchored right.
- `≥ lg` (992px): panel is 480px wide.
- Body scrolls internally; header is fixed at top of the panel.

**The six regression guards in §4 apply identically at all breakpoints.** A same-id re-emission on mobile must not cause a skeleton flash any more than it must on desktop. QA should spot-check the Flow 2 guard at both `< md` (full-width panel) and `≥ lg` (480px panel) to confirm the fix works regardless of layout.

---

## Section 6 — Accessibility Audit (Regression Guards)

No new a11y surface is introduced. The guards below are things the fix must **not** break:

### 6.1 `aria-live` on list state transitions
- The attachment list today announces ready / error state changes via an `aria-live="polite"` region (or equivalent — verify current markup; the fix must not alter it).
- **Regression guard:** On an unrelated `TaskUpdated` (Flow 2), the live region must **not** re-announce "Attachments loaded" — today it does on slow connections because the list briefly reloads. After the fix, silence.

### 6.2 Focus management on Retry
- When the user has tabbed to the Retry button and the list is in `error`, focus must remain on Retry.
- **Regression guard:** A same-id re-emission today can momentarily unmount the error banner on a slow connection, which drops focus and resets tab order. After the fix, this cannot happen. QA: tab to Retry, fire 3 unrelated `TaskUpdated` events, verify focus ring still on Retry.

### 6.3 `aria-busy` during loading
- The list region carries `aria-busy="true"` while `listFetchState().phase === 'loading'`.
- **Regression guard:** After the fix, `aria-busy` is true **only** during the initial load (or an explicit Retry or a task-id transition). It must **not** flicker true/false/true on unrelated board churn.

### 6.4 Reduced motion
- The file ships a `@media (prefers-reduced-motion: reduce)` rule that disables both the row-enter animation and the skeleton shimmer sweep (`attachment-list.component.scss` lines 198–203).
- **Regression guard:** No change to this media query. Users with reduced motion preference continue to see instant state changes with no animation. Since the fix *removes* transient `loading` states, users with reduced motion will actually see a quieter UI after the fix — this is a positive side-effect, not a regression.

### 6.5 Colour semantics
- Error banners use left-border colour (`$status-high` or `$status-average`) **plus** icon **plus** copy — colour is never the only signal. Unchanged.

No contrast table is re-derived — no colour pair changes in this ticket.

---

## Section 7 — Implementation Checklist for Developer

Short, precise, regression-focused.

### 7.1 Do not touch these files
- [ ] No edit to any file under `src/app/features/attachments/components/**/*.scss`.
- [ ] No edit to `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`.
- [ ] No edit to `src/styles/variables/**/*.scss` (no new tokens).
- [ ] No edit to any attachment component `.html` template.

### 7.2 Visual regression verification
- [ ] Before starting the fix, snapshot (screenshot or visual inspection) the four visible list states: `loading` skeleton, `ready` populated, `ready` empty, `error` banner (retryable and non-retryable).
- [ ] After the fix, re-verify the same four states render pixel-identically — same layout, same colours, same spacing, same animation.

### 7.3 The six user flows (§4) must behave as documented
- [ ] Flow 1 — initial open: exactly one `loading → ready` transition.
- [ ] Flow 2 — unrelated `TaskUpdated`: **no visible change** to the list. This is the primary acceptance.
- [ ] Flow 3 — same-task close+reopen: rows render immediately, no skeleton.
- [ ] Flow 4 — different-task close+reopen: one skeleton, one `GET`, rows render.
- [ ] Flow 5 — Retry: one `GET` per click, banner → skeleton → ready (or back to banner).
- [ ] Flow 6 — SignalR `AssetCompleted` for open task: row appends in-place, no full-list reload.

### 7.4 a11y regression checks
- [ ] No change to `aria-live` region markup or politeness level in the attachment list template.
- [ ] No change to `aria-busy` wiring (still bound to `listFetchState().phase === 'loading'`).
- [ ] Focus on the Retry button survives unrelated `TaskUpdated` events (Flow 2 + keyboard verification).
- [ ] `prefers-reduced-motion` media query at the bottom of `attachment-list.component.scss` is untouched.

### 7.5 Token audit (verify at PR time)
- [ ] `git diff` shows zero changes to any `.scss` file in the repo.
- [ ] No new hardcoded colours, spacings, or radii introduced anywhere (TS files only — this fix should not introduce any style strings or inline styles).

### 7.6 Manual QA smoke (copy of tech spec §8 with visual verification)
- [ ] With DevTools → Network filtered by `assets`, open task X: exactly one `GET`, skeleton renders once, rows render once.
- [ ] From a second browser, `TaskUpdated` a **different** task: zero new `GET`, **zero visible change** on the list (no flash, no skeleton, no live-region announcement).
- [ ] From the second browser, `TaskUpdated` on the **same** task X (rename it): zero new `GET`, the rendered title updates, the list **does not change at all**.
- [ ] Close and reopen X: zero new `GET`, rows appear immediately, no skeleton.
- [ ] Close and open Y: exactly one `GET` for Y, skeleton → rows.
- [ ] Simulate 503 on initial fetch (DevTools throttle + backend interceptor): retryable error banner renders with `$status-average` accents; click Retry: one new `GET` per click.
- [ ] Repeat Flow 2 under `prefers-reduced-motion: reduce` in DevTools: still no visible change on the list.

---

## Self-Review Summary

- ✅ No new tokens introduced.
- ✅ No invented scope — no styling changes to unchanged components.
- ✅ All four visible list states documented as regression guards.
- ✅ All six user flows covered with visual + a11y cues (§4).
- ✅ Accessibility (`aria-live`, `aria-busy`, focus on Retry) and `prefers-reduced-motion` guards called out explicitly (§6).
- ✅ Responsive behaviour is noted as unchanged with the guards applying at all breakpoints.
- ✅ Implementation checklist is tight and focused on "don't regress" rather than "build this".

---

## Open Questions for Developer / PM

1. **Hardcoded `rgba(229, 107, 111, 0.08)` in `attachment-list.component.scss` line 123.** This is `$status-high` at 8% alpha, used as the non-retryable error banner tint. It bypasses the canonical token system (there is no `$status-high-subtle` or similar token in v1.0). This is a **pre-existing** token drift from #51, not introduced by this ticket. **Flagged, not fixed.** Recommend a separate styling-cleanup ticket to either add `$status-high-subtle: rgba($status-high, 0.08)` to `_colors.scss` or convert this line to use `color.adjust($status-high, $alpha: -0.92)` from `sass:color`. The developer must **not** touch this as part of issue #95 — it would violate the "no SCSS change" constraint of this ticket.

2. **Confirm `aria-live` region is wired on the list (not on individual rows).** The panel's `.task-detail-panel__upload-live` is a single visually-hidden live region for upload announcements. Verify the attachment list uses the same pattern (one live region per list, not per row) and that the fix does not touch its wiring. If it turns out the list has no dedicated live region today, that's a pre-existing gap — not this ticket's scope.

---

*Design specification complete.*
