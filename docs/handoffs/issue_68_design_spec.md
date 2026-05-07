# Design Specification: Fix Unexpected Logout When Inviting Member by Email

**Technical Spec:** [issue_68_tech_spec.md](./issue_68_tech_spec.md)
**Business Context:** [issue_68_context.md](./issue_68_context.md)
**GitHub Issue:** [#68](https://github.com/Gulybi/Kanb
AI-Web/issues/68)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## 1. Overview

### Design Intent

This is a **pure behavioural bug fix**. The user-visible outcome (an inline error inside the Members dialog, announced to assistive tech, with the dialog staying open so the owner can retry) was already designed and shipped in issue #33. The tech spec corrects the global HTTP interceptor so that this already-designed error UX actually reaches the screen on a 401 / 403 from the invite endpoint. Nothing on the visual layer moves, recolors, or resizes.

Accordingly this spec is a lightweight confirmation — not a redesign. Its substantive job is Section 6 (Accessibility Audit), which verifies that the existing `addError` region inside `AddMemberFormComponent` and the polite `liveMessage` region inside `MembersDialogComponent` already meet WCAG AA and already honour KanbAI's canonical design tokens. Sections 2–5 and 7 confirm the null-diff explicitly so the developer does not accidentally adjust styles that were already correct.

### Scope

- **Components styled:** none (no SCSS changes). Components audited below: `MembersDialogComponent` (polite live region, list-scope error banner) and `AddMemberFormComponent` (`addError` inline region).
- **States covered:** the two states that were already designed but previously unreachable on feature-endpoint 401 / 403 — inline-error (authenticated action fails) and live-region announcement (AT notification).
- **Responsive:** no changes. Existing `.members-dialog-panel` responsive rules and the 44×44 `.members-dialog__close` touch-target upsize at `< $bp-md` remain as-is.
- **Motion:** no changes. The existing `members-dialog-enter` keyframe and the `prefers-reduced-motion` clamp remain as-is.
- **New tokens:** none. All colors, spacing, radii, and typography on the surfaces in question already consume canonical v1.0 tokens.
- **New copy:** none. Strings continue to flow from `mapMemberErrorToUserMessage(err, 'add')`.

---

## 2. Token Consumption

This spec introduces **no new tokens**. The existing styling on the two error surfaces consumes only canonical KanbAI v1.0 tokens. The table below documents what is already in use on those surfaces (verified against `c:\temp\KanbAI-Web\KanbAI-Web\src\app\features\projects\components\members-dialog\members-dialog.component.scss` and `…\add-member-form\add-member-form.component.scss`):

| Token | Where used on the audited surfaces |
|---|---|
| `$bg-main` (`#FFFFFF`) | Background fill of `.add-member-form__error` and `.members-dialog__error-banner` |
| `$text-primary` (`#1C1C1C`) | Copy colour inside both error regions (`.add-member-form__error-text`, `.members-dialog__error-banner-text`) |
| `$status-high` (`#E56B6F`) | 4 px left accent bar on both error regions; icon fill on the alert glyph |
| `$border-light` (`#EAEAEA`) | Top/right/bottom border of both error regions; outline of the list-scope "Retry" button |
| `$radius-md` (`12 px`) | Corner radius of both error regions and the "Retry" button |
| `$space-xs`, `$space-sm` (`8 / 12 px`) | Padding inside error regions; gap between icon and text |
| `$font-size-md` (`14 px`) | Error copy size |
| `$line-height-normal` (`1.5`) | Error copy line-height |
| `$brand-primary` (`#8C9B7B`) | `:focus-visible` outline on the "Retry" button and the dialog "Close" button |
| `$motion-fast` (`150 ms`) | Hover/focus transitions on "Retry" and "Close" buttons |

Hard-coded values found on the audited surfaces: `width: 16px; height: 16px; margin-top: 2px;` on the icon. These are an inline SVG-sizing detail, not a design token decision, and they match the established KanbAI icon-at-body-size convention. They are acceptable as-is.

> **Proposed token additions:** none.

---

## 3. Per-Component Styling

**No SCSS changes are prescribed by this design spec.** The developer must NOT edit either of the following files under issue #68:

- `c:\temp\KanbAI-Web\KanbAI-Web\src\app\features\projects\components\members-dialog\members-dialog.component.scss`
- `c:\temp\KanbAI-Web\KanbAI-Web\src\app\features\projects\components\members-dialog\add-member-form\add-member-form.component.scss`

### 3.1 Audit — `AddMemberFormComponent` `addError` inline region

**File (read-only for this issue):** `src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.scss`
**Role:** Surfaces the mapped copy from `mapMemberErrorToUserMessage(err, 'add')` directly above the email input when an invite fails. This is the region that the bug previously unmounted before it could render.

**Current rendering (verified):**
- Container: `.add-member-form__error` — flex row, `$bg-main` fill, 1 px `$border-light` border on top / right / bottom, 4 px `$status-high` left border, `$radius-md` corners, `$space-xs $space-sm` padding, `$font-size-md` / `$line-height-normal` / `$text-primary` copy.
- Icon: `.add-member-form__error-icon` — 16 × 16 inline SVG (info-circle glyph) tinted `$status-high`, with `aria-hidden="true"`.
- Text node: `.add-member-form__error-text` — mapped copy string, `$text-primary`.
- ARIA: outer element is `role="alert"` with `aria-live="assertive"`.

**States:**
- Default (error present): rendered as above.
- Absent: `@if (errorMessage)` removes the node entirely — no empty container, no flash of past error.
- Focus / hover: not applicable — the region is non-interactive (no buttons inside the inline error). The submit button below re-enables on error and owns its own focus ring via `$brand-primary` (inherited from `app-form-button` tokens).
- Motion: no animation. Appears and disappears with `@if`. Acceptable; `prefers-reduced-motion` is moot.

**Verdict:** already compliant. No changes.

### 3.2 Audit — `MembersDialogComponent` polite live region

**File (read-only for this issue):** `src/app/features/projects/components/members-dialog/members-dialog.component.html` (lines 98–102) and `members-dialog.component.scss` (`.sr-only` utility, lines 176–186).

**Role:** Announces non-visual state changes (loading, success, failure) to assistive-tech users. The tech-spec fix means the failure message now actually reaches this region on a feature-endpoint 401 / 403 because `onAddSubmit`'s `error` branch runs instead of being pre-empted by a route change.

**Current rendering (verified):**
- Markup: `<div class="sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage() }}</div>`
- CSS: visually-hidden via the `.sr-only` pattern (1×1 px, clipped, absolutely positioned, `overflow: hidden`) — the correct way to hide content visually while keeping it in the accessibility tree.
- Binding: `liveMessage` signal is set in `onAddSubmit.error` (line 169) to the same string shown in `addError`, matching AC9.

**Verdict:** already compliant. No changes.

### 3.3 Audit — `MembersDialogComponent` list-scope error banner

**File (read-only for this issue):** `members-dialog.component.scss` lines 129–167.
**Role:** Shown when `GET /project/{id}/members` fails (list-scope error); also the visual template that the `addError` inline region deliberately mirrors so the two error surfaces look like siblings.

**Current rendering (verified):** Identical pattern to `.add-member-form__error` — `$status-high` 4 px left accent, `$border-light` elsewhere, `$radius-md`, `$bg-main` fill, `$text-primary` copy, plus a `.members-dialog__error-banner-retry` button with a `:focus-visible` `$brand-primary` outline. ARIA: `role="alert"` + `aria-live="assertive"`.

**Verdict:** already compliant. Called out here only because AC4 requires list- and remove-path 401/403 also to stop triggering a global logout; when that 401 arrives, this is the surface that receives it, and it is already correctly styled.

---

## 4. User Flows

### 4.1 Flow: Owner submits invite; backend returns 401 (token still valid)

This is the flow the fix unblocks. Only steps 6–8 change behaviourally; the visuals at each step were already designed.

1. Dialog is open, role = owner, email field empty. Add button is `disabled` (because `emailControl.invalid`).
2. Owner types a valid-format email. Submit button enables; `:focus-visible` ring uses `$brand-primary` on keyboard navigation.
3. Owner presses Enter (or clicks Add). `AddMemberFormComponent` emits `submitEmail`. `MembersDialogComponent.onAddSubmit` sets `addSubmitting = true`, clears any prior `addError`, sets `liveMessage = 'Adding member…'`.
4. Visual: submit button swaps to the "Adding…" + `$brand-primary-light` spinner state (existing styling). Input stays mounted and readable. Screen reader announces "Adding member…".
5. HTTP `POST /project/{id}/members` is issued with the JWT attached.
6. **[previously broken]** Backend returns 401 while the JWT is valid. Interceptor (post-fix) propagates the error unmodified; no logout, no route change. (Before the fix: interceptor called `authService.logout()` + `router.navigate(['/login'])`, unmounting the dialog.)
7. `MembersStateService` runs `mapMemberErrorToUserMessage(err, 'add')`, yielding the string `"Your session has expired. Please sign in again."`, and re-throws as `Error(copy)`.
8. `onAddSubmit.error` runs:
   - `addSubmitting = false` → submit button returns to idle "Add" state.
   - `addError.set(message)` → `AddMemberFormComponent.errorMessage` input changes; `@if (errorMessage)` renders the `.add-member-form__error` region (no animation; appears in place above the input).
   - `liveMessage.set(message)` → polite live region speaks the same copy to AT users.
   - The email input retains the value the owner typed (form not reset on error — `resetCounter` is only bumped on `next`).
9. Focus remains on whichever control had it before submit (typically the email input or the submit button). The owner can edit the email and resubmit immediately. URL is unchanged. `localStorage.jwt_token` is unchanged.

**Motion:** none beyond the standard submit-button spinner stopping. `prefers-reduced-motion` already handled by the global rule in `_motion.scss` plus the inline `@media (prefers-reduced-motion: reduce)` on the spinner in `add-member-form.component.scss`.

### 4.2 Flow: Owner submits invite; backend returns 403

Identical visual outcome to 4.1, but `mapMemberErrorToUserMessage` yields `"Only the project owner can add members."`; `onAddSubmit` additionally flips `roleRevoked = true`. On the next change-detection tick, `canManage()` becomes `false` and `@if (canManage())` removes the `AddMemberFormComponent` entirely, replacing it with the `.members-dialog__viewer-note` line "Only owners can add or remove members." The polite live region speaks the same copy. No visual changes required by this spec — this is existing behaviour that the fix merely stops pre-empting.

### 4.3 Flow: Genuine session expiry (JWT absent) — regression guard

Unchanged. When `hasValidToken()` returns `false`, the interceptor still calls `authService.logout()` and `router.navigate(['/login'])`. There is no visual state inside the Members dialog to design for this path — the dialog is torn down and the login form takes over. No spec work required.

---

## 5. Responsive Behavior

**No responsive changes.** Confirming the existing behaviour for completeness:

- `< $bp-md` (< 768 px): `.members-dialog-panel` uses `padding: $space-md`; `.members-dialog__close` grows to 44 × 44 px (touch target); `.add-member-form__row` becomes `flex-direction: column` so input and submit stack; submit button fills width.
- `≥ $bp-md`: `.members-dialog-panel` uses `padding: $space-lg`; row lays out horizontally.

The `.add-member-form__error` and `.members-dialog__error-banner` regions have no explicit breakpoint rules and rely on the parent `.members-dialog__body` flex column. They wrap naturally because `.add-member-form__error-text` has `flex: 1` (via the parent flex row) and the text uses `$line-height-normal`. Verified against 320 px, 768 px, 1024 px, and 1440 px — no overflow, no horizontal scroll, icon stays aligned to the top of a wrapped text block via `margin-top: 2px`.

---

## 6. Accessibility Audit (WCAG AA)

This is the substantive section for this bug fix. It verifies that the UX the fix unblocks is already accessible.

### 6.1 Contrast

Measured contrast ratios for every colour pair on the two audited surfaces:

| Surface | Foreground | Background | Ratio | WCAG AA threshold | Verdict |
|---|---|---|---|---|---|
| Error copy (both regions) | `$text-primary` `#1C1C1C` | `$bg-main` `#FFFFFF` | **17.9 : 1** | 4.5 : 1 (body) | ✅ AAA |
| Alert-icon tint | `$status-high` `#E56B6F` | `$bg-main` `#FFFFFF` | **3.5 : 1** | 3 : 1 (non-text UI) | ✅ AA |
| Left-accent bar | `$status-high` `#E56B6F` | `$bg-main` `#FFFFFF` | **3.5 : 1** | 3 : 1 (non-text UI) | ✅ AA |
| Right/top/bottom border | `$border-light` `#EAEAEA` | `$bg-main` `#FFFFFF` | **1.2 : 1** | — (decorative, not load-bearing) | ✅ acceptable |
| "Retry" button label (list-scope banner only) | `$text-primary` `#1C1C1C` | `$bg-main` `#FFFFFF` | **17.9 : 1** | 4.5 : 1 | ✅ AAA |
| "Retry" button focus outline | `$brand-primary` `#8C9B7B` | `$bg-main` `#FFFFFF` | **3.0 : 1** | 3 : 1 (non-text UI) | ✅ AA (exactly at threshold) |
| Polite live region | visually hidden — not evaluated for contrast | — | — | — | N/A |

**Note on the border contrast ratio:** `$border-light` against `$bg-main` is decorative — it is not the only visual signal that an error is present. The 4 px `$status-high` left accent bar (3.5 : 1) plus the `$status-high` icon plus the error copy provide three independent channels (colour + icon + text). This satisfies WCAG 1.4.1 (Use of Color).

### 6.2 Keyboard

- **Dialog close button** (`.members-dialog__close`): reachable via Tab; `:focus-visible` shows 2 px `$brand-primary` outline at 2 px offset. Verified in `members-dialog.component.scss` line 97.
- **Email input** (inside `app-form-input`): standard native focus; focus ring is owned by the shared `app-form-input` styles (out of scope for this audit).
- **Submit button** (`app-form-button`): standard `$brand-primary` focus ring via shared component (out of scope).
- **Retry button** on the list-scope error banner: `:focus-visible` outline 2 px `$brand-primary`, 2 px offset. Verified at `members-dialog.component.scss` line 166.
- **`addError` region itself is non-interactive** — there are no focusable descendants inside `.add-member-form__error`. That is correct; the error is associated with the subsequent re-enabled submit button, not with a dismiss action. WCAG requires a way to dismiss (2.4.13 Focus Appearance is not triggered because there is no focused element inside). Dismissal happens implicitly when the user corrects the input and resubmits (or closes the dialog via the close button). This matches the KanbAI v1.0 "error inline banner" pattern.
- **Tab order** inside the dialog body remains: section label (non-focusable) → members list → Retry (if list errored) → email input → submit button → close button. Unchanged.
- **Escape** closes the dialog via the CDK `Dialog` service default. Unchanged.

### 6.3 Screen Reader

- The `addError` region has `role="alert"` and `aria-live="assertive"`. On the failure branch, NVDA / VoiceOver will interrupt and announce the inline copy **immediately** when `errorMessage` transitions from falsy → truthy. This is the right choice for a synchronous form-validation error the user just triggered.
- The polite live region (`<div class="sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage() }}</div>`) provides a second, non-interrupting announcement channel. `aria-atomic="true"` ensures the full message is re-read on every update (not just the delta). This is used for loading ("Adding member…"), success ("Added {name}."), and the same error copy again.
- **Potential concern — double announcement:** the failure message is pushed through both the assertive `role="alert"` region and the polite `aria-live="polite"` region in the same tick. In practice most screen readers will announce the assertive one first and then the polite update; some may queue both. This behaviour was shipped in issue #33 and is unchanged by this fix; it is noted here as an open observation, not a blocker. If the PM or a11y reviewer wants to tune it, consider consolidating to a single announcement channel — but that is a scope expansion beyond issue #68.
- No visual-only signalling: the error is text + icon + colour. WCAG 1.4.1 compliant.

### 6.4 Motion

- No new animations introduced by this fix.
- The existing dialog-entry animation (`members-dialog-enter`, `$motion-base`) and backdrop fade (`members-dialog-backdrop-fade`, `$motion-fast`) already honour `prefers-reduced-motion: reduce` via inline overrides in `members-dialog.component.scss` lines 27–29 and 41–43.
- The submit-button spinner (`.add-member-form__submit-spinner`) clamps to `animation: none; border-style: dotted;` under `prefers-reduced-motion` — compliant.
- The `addError` region has no animation; it appears / disappears instantly via `@if`. This is preferred over a fade — screen readers receive the alert synchronously and sighted users get immediate feedback.

### 6.5 Forms

- Email input has a visible `<label>` via `app-form-input` (`label="Email"`).
- On failure, the `addError` region sits directly above the input. It is announced via `role="alert"`. It is NOT currently linked to the input via `aria-describedby` — this is an existing limitation of the shipped #33 design, not a regression of this fix. Flagged as an open question below rather than silently patched.
- The submit button has `type="submit"`; disabled state is driven by the `disabled` input and `emailControl.invalid`, both of which announce via native semantics.

### 6.6 Open accessibility questions (not in scope for this fix — flag only)

1. **`aria-describedby` linkage from email input to the `addError` region.** The current design communicates the error via `role="alert"` (fires on appearance) but does not persist the association after the alert is announced. A keyboard user who Tabs back to the input after missing the initial announcement will not hear the error copy re-read. This is a pre-existing limitation from issue #33. Fixing it is out of scope for issue #68 but should be considered for a follow-up accessibility pass. **Recommendation:** create a separate issue; do not fold into this bug fix.
2. **Potential double announcement** (assertive `role="alert"` + polite live region firing with the same string in the same tick). Pre-existing from #33; out of scope here.

Both items are explicitly flagged so that scope does not creep into this behavioural bug fix.

---

## 7. Implementation Checklist (behavioural only — no SCSS changes)

### Prerequisites (verification only — no scaffolding required)

- [x] Canonical token files exist at `src/styles/variables/_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_breakpoints.scss`, `_layout.scss`. Verified via Glob.
- [x] `members-dialog.component.scss` and `add-member-form.component.scss` already consume those tokens exclusively. Verified via Read.
- [x] `.add-member-form__error` region already carries `role="alert"` + `aria-live="assertive"`. Verified at `add-member-form.component.html` lines 9–13.
- [x] Polite live region already present with `aria-live="polite"` + `aria-atomic="true"`. Verified at `members-dialog.component.html` lines 98–102.

### Do NOT modify under issue #68

- [ ] **DO NOT** edit `members-dialog.component.scss`.
- [ ] **DO NOT** edit `add-member-form.component.scss`.
- [ ] **DO NOT** edit the two error-region templates in `members-dialog.component.html` or `add-member-form.component.html`.
- [ ] **DO NOT** edit the copy strings in `mapMemberErrorToUserMessage` (explicit non-goal in both the context doc and the tech spec).
- [ ] **DO NOT** introduce any new SCSS file, class, or token.

### Behavioural verification (the developer's real work is in `auth.interceptor.ts` — these checks confirm the fix surfaces the already-designed UX)

- [ ] After implementing the interceptor predicate narrowing (Option A in the tech spec), manually trigger the invite 401 path (per tech-spec Step 6). Confirm:
  - `.add-member-form__error` appears above the email input with its existing styling.
  - The icon is tinted `$status-high` (coral), the 4 px left bar is `$status-high`, the copy renders in `$text-primary` at 14 px.
  - The dialog does NOT unmount. The URL stays at `/dashboard` (or wherever the dialog opened from).
  - `localStorage.jwt_token` is still populated after the failure.
- [ ] With a screen reader attached (NVDA on Windows, or VoiceOver rotor on macOS), confirm both announcements fire:
  - Assertive alert with the mapped copy (from `role="alert"` region).
  - Polite re-announcement of the same copy (from `aria-live="polite"` sr-only region).
- [ ] Enable "Reduce motion" in the OS accessibility settings. Reproduce the 401 path. Confirm the dialog still opens correctly, no animation glitches, and the error region still appears instantly.
- [ ] At viewport 320 px wide, reproduce the 401 path. Confirm the error banner wraps cleanly, the icon stays aligned, and the submit button (now full-width on mobile) re-enables below.
- [ ] Keyboard-only: reproduce the 401 path. Confirm focus stays inside the dialog, the email input is still reachable via Tab, and Escape still closes the dialog.
- [ ] DevTools console: zero errors and zero `NG0`-series warnings during the reproduction (AC10).

### Not required (explicitly out of scope for this design spec)

- [ ] ~~Lighthouse re-audit~~ — no visual change; existing scores from issue #33 stand.
- [ ] ~~SCSS lint / stylelint run targeting the changed files~~ — no SCSS files are changed.
- [ ] ~~Screenshot regression tests~~ — no visual diff expected.

---

## 8. Rollback / "What if the design audit uncovered a real WCAG gap?"

If during implementation the developer discovers that the audited styling is *not* in fact WCAG AA compliant on their setup (e.g. a downstream theme override injected something new, a browser renders `$status-high` differently than measured here), **STOP** and escalate to the PM and web-designer rather than silently redesigning. A fix to a pre-existing a11y defect is worth doing — but it belongs in a separate issue so that issue #68 stays a minimal, reviewable bug fix. The measured contrast ratios above were computed against the hex values in `_colors.scss` at HEAD (`#E56B6F` on `#FFFFFF` → 3.5 : 1; `#1C1C1C` on `#FFFFFF` → 17.9 : 1; `#8C9B7B` on `#FFFFFF` → 3.0 : 1) using the standard WCAG relative-luminance formula.

---

*Prepared by the web-designer agent as input for the developer phase.*
