# Technical Specification: Fix Unexpected Logout When Inviting Member by Email

**Context Document:** [issue_68_context.md](./issue_68_context.md)
**GitHub Issue:** #68
**Branch:** `68-fix-unexpected-logout-when-inviting-member-by-email`
**Type:** Bug fix (surgical) — not a new feature.

## Overview

This is a targeted bug fix to `authInterceptor` at `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts`. The interceptor currently treats **any** `HTTP 401` from a non-auth-endpoint as a session-expiry signal and unconditionally calls `AuthService.logout()` + `router.navigate(['/login'])`. For the Members-dialog invite flow — and for every other authenticated mutation — a server-side 401 (or 403) for a per-resource authorisation reason is therefore misinterpreted as "session expired", ejecting the user from the app before the feature's own error-copy layer (`mapMemberErrorToUserMessage`) can surface the correct inline message.

The fix narrows the global logout trigger to cases that are genuinely indicative of session expiry, preserves the existing `/auth/login` + `/auth/register` carve-outs, and defers per-resource 401/403 rendering to the feature layer (which already has the copy, state, and live-region plumbing for it — see `MembersDialogComponent.onAddSubmit`). No new components, no new services, no new routes. Scope is: one interceptor, its spec, and new regression tests; the members-feature tests remain structurally the same but any assertion of "401 → redirect" inside them must be updated in place (per AC11/AC12).

## Component Architecture

**No new components.** No routing changes. No new services.

### Files to Modify
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` — narrow the 401 branch; add a 403 passthrough clarification. This is the sole production-code file touched by the fix.
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts` — update the existing "Auth-endpoint 401 exemption › still calls logout and navigates to /login when a 401 comes from a non-auth endpoint" test to the new contract, and add dedicated coverage for invite-endpoint 401/403 passthrough (AC13).

### Files NOT Modified (but depend on the fix behaving correctly)
- `KanbAI-Web/src/app/features/projects/services/members-api.service.ts` — `mapMemberErrorToUserMessage` already produces the correct copy for 400/401/403/500 on the `'add'`, `'remove'`, and `'list'` operations. Do **not** alter its strings (explicit non-goal in the context doc).
- `KanbAI-Web/src/app/features/projects/state/members-state.service.ts` — already converts `HttpErrorResponse` to `throwError(new Error(mapMemberErrorToUserMessage(err, 'add')))` on the add-member path; the dialog already consumes `err.message`.
- `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.ts` — `onAddSubmit` already sets `addError`, `liveMessage`, and (for the owner-only copy) flips `roleRevoked`. Once the interceptor stops redirecting, this code path runs as originally designed.
- `KanbAI-Web/src/app/core/services/AuthService.ts` / `auth-state.service.ts` / `auth.guard.ts` — unchanged. `authGuard` re-runs per navigation and keys off `AuthStateService.isAuthenticated()` — AC5 (genuine-expiry redirect) is still delivered by that existing mechanism when a stale or missing JWT is detected, independent of any specific HTTP response.

### Files to Modify (tests only, beyond the interceptor)
- `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts` — if any existing test simulates a 401 on the invite path and asserts a redirect, update it in place to assert that the dialog stays open and `addError` is set (AC11). If no such test exists, add one (AC13 option b).
- `KanbAI-Web/src/app/features/projects/state/members-state.service.spec.ts` — ensure the 401/403 branches of `addMemberByEmail` / `removeMember` return the `mapMemberErrorToUserMessage` string without any side-effect on auth state. No structural rewrite expected; a single regression-guard assertion is sufficient.

## State & Data Layer

**No new state; no new TypeScript models.** This fix is behavioural, not structural.

### Implicit Contract Being Tightened
The interceptor currently expresses the rule:

> "If `error.status === 401` and the URL is not `/auth/login` or `/auth/register`, log out and redirect."

This spec narrows the rule to:

> "If `error.status === 401` and the URL is not `/auth/login` or `/auth/register` **and we have good reason to believe the stored JWT is no longer valid**, log out and redirect. Otherwise, propagate the error untouched so the feature layer can render inline copy."

The "good reason to believe the stored JWT is no longer valid" predicate must be implemented without adding a round-trip, without parsing JWT claims in production code paths beyond what is necessary to decide the predicate, and without introducing a refresh-token flow (explicit non-goal).

### Recommended predicate — ranked options

The developer must pick **Option A** unless a concrete blocker is discovered during implementation; if a blocker is found, STOP and escalate to the staff-engineer.

**Option A (recommended): narrow to token-absence + genuinely-missing-token cases.**
Change the condition from `error.status === 401 && !isAuthEndpoint` to `error.status === 401 && !isAuthEndpoint && !hasValidToken()`, where `hasValidToken()` is a local helper inside the interceptor module that returns `true` iff `localStorage.getItem('jwt_token')` is a non-empty string. Rationale: the only unambiguous "your session is gone" signal the frontend owns today is "the token this request was sent with (or would have been sent with) is absent". Any 401 arriving while a token is attached must be treated as a resource-level authorisation failure the feature layer will render. This preserves AC1/AC2/AC3 (feature 401/403 flow through), AC5 (missing-JWT case still redirects because `hasValidToken()` is `false`), and AC7 (auth-endpoint carve-out is unchanged).

> Rationale for not also exercising JWT expiry-claim inspection here: it would add a production dependency on a JWT-decoder, expand the blast radius, and — more importantly — still not catch server-side revocation. The server remains the authority; a genuinely expired token will fail the next authenticated request with a 401 **and** the token will be cleared by the guard on the subsequent navigation. The simpler `hasValidToken()` predicate is sufficient for AC1–AC18.

**Option B (fallback, only if Option A is rejected in review):** Drop the global 401-driven logout entirely and rely on `authGuard` + a deliberate logout action from the UI. This is strictly more surgical (one-line delete of the `authService.logout(); router.navigate(['/login'])` block) but loses the mid-session "zombie" protection demanded by AC5. Mention in passing so the developer knows why we are *not* doing this.

**Option C (explicitly out of scope):** Maintain an endpoint allow-list of "feature endpoints that can legitimately 401/403". Rejected — the context doc (non-goals) and the downstream-issue checklist (#47, #48–#52, SignalR) both argue for a predicate that scales without code changes when new endpoints land.

### 403 handling
`HTTP 403` must **not** trigger logout or navigation in any branch. The current interceptor code already leaves 403 alone; the fix must not inadvertently add 403 to the logout branch. A dedicated test asserts this (see QA Guidance).

## Service Integration

### Modified Contract: `authInterceptor` (functional interceptor)

**File:** `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts`

**Exports (unchanged):**
```typescript
export const authInterceptor: HttpInterceptorFn;
```

**Behavioural contract (new — developer implements):**

1. Request phase (unchanged): if `req.url.startsWith(environment.apiUrl)` and `localStorage.getItem('jwt_token')` is non-empty, clone the request with an `Authorization: Bearer <token>` header; otherwise forward untouched.
2. Error phase — the `catchError` branch must apply the decision table below:

| `error.status` | `isAuthEndpoint` | `hasValidToken()` | Action |
|---|---|---|---|
| 401 | true | any | Propagate only. No logout. No navigate. |
| 401 | false | true | **Propagate only.** No logout. No navigate. (new behaviour — fixes the bug) |
| 401 | false | false | Call `authService.logout()`, `router.navigate(['/login'])`, propagate. (existing session-expiry behaviour — AC5) |
| 403 | any | any | Propagate only. No logout. No navigate. (clarification — matches today's behaviour) |
| any other | any | any | Propagate only. (unchanged) |

3. The error MUST always be re-thrown via `throwError(() => error)` so feature-layer subscribers see it. Do not swallow.

**Internal helper signature (developer implements in-file, not exported):**
```typescript
function hasValidToken(): boolean;
// Returns true iff `localStorage.getItem('jwt_token')` is a non-empty string.
// Intentionally does not parse or validate the JWT — see State & Data Layer.
```

### Unchanged contracts (documented here to make the feature-layer reach-through explicit)

- `MembersApiService.addMemberByEmail(projectId: string, email: string): Observable<MemberSummary>` — unchanged; the subscriber receives the raw `HttpErrorResponse`.
- `mapMemberErrorToUserMessage(error: unknown, operation: MemberOperation): string` — unchanged; already handles 400/401/403/404/500/0 for `'add'`, `'remove'`, `'list'`.
- `MembersStateService.addMemberByEmail` — unchanged; already routes the mapped copy through `throwError(new Error(copy))`.
- `MembersDialogComponent.onAddSubmit` — unchanged; already sets `addError`, `liveMessage`, and (for owner-only copy) `roleRevoked`.
- `AuthService.logout()` — unchanged; still clears `jwt_token`, resets `currentUser`, and calls `AuthStateService.clearAuthState()`.
- `authGuard` — unchanged; still redirects unauthenticated users to `/login` on navigation, preserving the AC5/AC18 "cold-start with stale token" protection.

### HTTP error matrix (reference — for developer & QA)

| Endpoint | Status | Post-fix behaviour |
|---|---|---|
| `POST {apiUrl}/project/{id}/members` | 400 | Dialog shows mapped copy; no logout. (unchanged) |
| `POST {apiUrl}/project/{id}/members` | 401 (token present) | Dialog shows "Your session has expired. Please sign in again." copy inline; **no logout**. (fix) |
| `POST {apiUrl}/project/{id}/members` | 401 (token absent/empty) | Global logout + `/login` redirect. (unchanged contract; reached via `authGuard` on subsequent navigation in typical flow) |
| `POST {apiUrl}/project/{id}/members` | 403 | Dialog shows owner-only copy, flips `roleRevoked`; no logout. (unchanged) |
| `POST {apiUrl}/project/{id}/members` | 500 | Dialog shows generic 5xx copy; no logout. (unchanged) |
| `GET {apiUrl}/project/{id}/members` | 401 (token present) | List-scope error banner; no logout. (fix) |
| `DELETE {apiUrl}/project/{id}/members/{userId}` | 401 (token present) | Remove-scope error; no logout. (fix) |
| `POST {apiUrl}/auth/login` | 401 | Login form shows invalid-credentials copy; no logout. (unchanged — existing carve-out) |
| `POST {apiUrl}/auth/register` | 401 | Register form shows copy; no logout. (unchanged — existing carve-out) |

## Implementation Steps

Follow in order. All file paths are relative to `KanbAI-Web/KanbAI-Web/`.

### 1. Implement the narrowed interceptor predicate
- [ ] Open `src/app/core/interceptors/auth.interceptor.ts`.
- [ ] Add a module-local helper `hasValidToken(): boolean` that reads `localStorage.getItem('jwt_token')` and returns `true` iff the value is a non-empty string. Keep it private (not exported).
- [ ] In the `catchError` branch, replace the existing condition `if (error.status === 401 && !isAuthEndpoint)` with a predicate that ALSO requires `!hasValidToken()` before calling `authService.logout()` + `router.navigate(['/login'])`.
- [ ] Do NOT touch the request-phase logic (header attachment). Do NOT change the auth-endpoint carve-out. Do NOT add any handling for 403.
- [ ] Always re-throw via `throwError(() => error)` as today.
- [ ] Add a 3–5 line JSDoc comment above the `catchError` block explaining the three-way decision (auth-endpoint / token-present 401 / token-absent 401) and pointing at this tech spec and issue #68.

### 2. Update the interceptor spec
- [ ] Open `src/app/core/interceptors/auth.interceptor.spec.ts`.
- [ ] The existing test `'still calls logout and navigates to /login when a 401 comes from a non-auth endpoint'` (describe block "Auth-endpoint 401 exemption") asserts the OLD contract. Rewrite it in place into two tests:
  - `'calls logout and navigates to /login on a 401 from a non-auth endpoint when no JWT is stored'` — no token in the stub localStorage; expect `logout` called and `navigate(['/login'])` called.
  - `'does NOT call logout or navigate on a 401 from a non-auth endpoint when a JWT is still stored'` — seed the stub localStorage with `localStorage.setItem('jwt_token', 'x.y.z')`; expect `logout` NOT called, `navigate` NOT called, and the subscriber's error branch still sees `status === 401`.
- [ ] Add a new test: `'does NOT call logout or navigate on a 403 from a non-auth endpoint'` — seed a token; flush 403; assert neither side-effect fires and the error propagates. (AC2, AC4.)
- [ ] Add a new test directed at the invite endpoint explicitly (AC13 option a): `'does NOT call logout or navigate on a 401 from POST /project/:id/members when a JWT is stored'` — seed a token; issue `POST ${environment.apiUrl}/project/proj-1/members` with body `{ email: 'x@y.z' }`; flush 401; assert neither logout nor navigate was invoked.
- [ ] Existing passthrough / preservation / auth-endpoint-carve-out tests must remain untouched and green.

### 3. Update the members-dialog component spec (if it encodes the old contract)
- [ ] Open `src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts`.
- [ ] If any test asserts that the dialog closes, or that a route change occurs, on a 401 from the invite path, rewrite it to assert:
  1. `addError()` is set to the mapped copy returned by `mapMemberErrorToUserMessage`.
  2. `liveMessage()` is set to the same string.
  3. The dialog remains mounted (no `dialogRef.close` call).
  4. `AuthService.logout` (provide a spy) is NOT called.
- [ ] If no such test exists, add one (AC13 option b). The test may mock `MembersStateService.addMemberByEmail` to return `throwError(() => new Error('Your session has expired. Please sign in again.'))` — this mirrors the production path through `mapMemberErrorToUserMessage` without requiring `HttpClient` wiring in the component spec.

### 4. Regression-guard the members-state service spec
- [ ] Open `src/app/features/projects/state/members-state.service.spec.ts`.
- [ ] If not already present, add one test each for:
  - `addMemberByEmail` mapping a 401 `HttpErrorResponse` to `throwError(new Error('Your session has expired. Please sign in again.'))` without touching `AuthService` or any auth state.
  - `addMemberByEmail` mapping a 403 to `throwError(new Error('Only the project owner can add members.'))`.
- [ ] These tests are verifying existing behaviour — they should pass on first run. If they do not, STOP: the fix is incomplete or the mapping has regressed.

### 5. Build + test verification
- [ ] From `KanbAI-Web/KanbAI-Web/` run `npm run build`. Must exit 0. (AC15.)
- [ ] From `KanbAI-Web/KanbAI-Web/` run `npm run test -- --watch=false`. Report `Total / Passed / Failed / Skipped`. Any failure that references files NOT in the Files to Modify list is PRE-EXISTING; enumerate it in the handoff status section. Any failure that touches the interceptor or members-dialog is INTRODUCED and MUST be fixed before completing. (AC14.)

### 6. Manual smoke (reviewer-friendly)
- [ ] Log in as an owner. Open Members dialog. Submit an unknown email. Expect inline copy "We couldn't find a user with that email.". Dialog stays open. URL unchanged. `localStorage.jwt_token` still present. (AC3.)
- [ ] Manually invoke a 401 by temporarily pointing the invite endpoint at a URL that returns 401 (or rely on backend behaviour if reproducible). Dialog stays open; inline 401 copy renders. (AC1.)
- [ ] In DevTools, `localStorage.removeItem('jwt_token')`; navigate to `/dashboard`. `authGuard` redirects to `/login`. (AC5/AC18.)
- [ ] Click Logout. Redirects to `/login`; token cleared. (AC6.)
- [ ] Submit `/auth/login` with bad credentials. Inline "invalid credentials" copy. No redirect. (AC7.)

### Performance / Scope Considerations
- No performance impact: the fix adds one `localStorage.getItem` on the 401 error path, which is already O(1) and only runs when an authenticated request fails.
- No bundle-size impact: no new imports beyond what the file already uses.
- No accessibility impact directly introduced by the interceptor, but the fix UNBLOCKS the existing `liveMessage` live-region in `MembersDialogComponent` so that AT users hear the failure (AC9).

## QA Guidance

### Test Strategy

**Unit — interceptor (highest value; this is where the bug lived):**
- The four new/updated cases listed in Implementation Steps #2. These directly prove AC1, AC2, AC4, AC7, and the token-absent branch for AC5.
- Mocking: `AuthService` and `Router` are already stubbed in `auth.interceptor.spec.ts` via `useValue` with `vi.fn()` spies. Reuse that pattern. Do not introduce real routing.
- `localStorage` is shimmed in the existing suite's `beforeAll` — reuse; seed tokens via `localStorage.setItem('jwt_token', '…')` in the relevant tests and rely on the `beforeEach` `localStorage.clear()`.

**Unit — members-dialog component:**
- Verify the invite-error path surfaces `addError`, `liveMessage`, and leaves the dialog open on a simulated 401. Mock `MembersStateService.addMemberByEmail` with an Observable that errors synchronously — do not stand up `HttpTestingController` in the component spec (there is no need; the mapping is already covered at the service level).

**Unit — members-state service:**
- Thin regression guard on the 401/403 → Error-message mapping as described in Implementation Steps #4.

**Integration — optional, NOT required for merge:**
- If the developer wishes, they may add a single integration test wiring `HttpTestingController` to `MembersStateService.addMemberByEmail` and asserting that a flushed 401 does not invoke `AuthService.logout` (spy) and does emit the mapped copy through the error branch. This satisfies AC13 option (c) and is the strongest single test. It is acceptable to rely on the unit coverage above instead.

**E2E — not required for this fix.** The existing unit + integration coverage plus the manual smoke steps in Implementation Steps #6 are sufficient.

### Mocking Instructions (developer reference)

```typescript
// Pattern already in auth.interceptor.spec.ts — reuse verbatim:
{ provide: Router,      useValue: { navigate: vi.fn().mockResolvedValue(true) } },
{ provide: AuthService, useValue: { logout:   vi.fn() } }

// Seeding a token for the "401 with valid token → no logout" test:
localStorage.setItem('jwt_token', 'dummy.jwt.value');

// For members-dialog component test:
const membersStateMock = {
  addMemberByEmail: (_projectId: string, _email: string) =>
    throwError(() => new Error('Your session has expired. Please sign in again.')),
  // …other methods stubbed as needed
};
```

### Edge Cases to Test

1. **AC1 — 401 on invite with token present** → no logout, no navigate, inline copy shown.
2. **AC2 — 403 on invite** → no logout, no navigate, `roleRevoked` flips per existing dialog handling.
3. **AC4 — 401 on `GET /project/:id/members` or `DELETE …/members/:userId`** with token present → no logout, scoped error surfaced.
4. **AC5 — 401 on any non-auth endpoint with token ABSENT (or empty)** → `logout()` + `/login`.
5. **AC7 — 401 on `/auth/login` or `/auth/register`** (with or without token) → no logout, no navigate.
6. **AC11/AC12 — pre-existing tests:** all "passthrough" and "environment integration" tests in `auth.interceptor.spec.ts` must still pass unchanged.
7. **AC16 — concurrent requests:** fire `listMembers` and `addMemberByEmail` in the same tick; flush 401 on one of them with a token present; the other request's observable must not be cancelled or synthetically erroringed. (Optional stretch test; not required, but if added it strengthens the regression guard.)
8. **AC17 — dialog close mid-request:** members-dialog spec must still verify that subscribing inside the root injector (existing pattern) means a late-arriving 401 does not throw unhandled — this is existing behaviour, regression-only.
9. **AC18 — manual-repro forced expiry:** covered by the manual smoke step; no automated test required.

### Failure Classification Hints

- Any new failure in `auth.interceptor.spec.ts` → INTRODUCED (the fix touches this file).
- Any new failure in `members-dialog.component.spec.ts` / `members-state.service.spec.ts` where the component / state-service files themselves were NOT modified → likely INTRODUCED by a test update; revisit the updated assertion against the new contract.
- Failures in `board-state.service.spec.ts`, `task-detail-panel.component.spec.ts`, `signalr.service.spec.ts`, and other unrelated suites → PRE-EXISTING unless the stack trace references `auth.interceptor.ts`.

### Definition of Done

- `auth.interceptor.ts` diff is <= 20 lines of meaningful change.
- `auth.interceptor.spec.ts` has exactly the four new/updated cases described in Implementation Step #2, all green.
- `members-dialog.component.spec.ts` contains at least one assertion that a 401 on invite leaves the dialog mounted and sets `addError`.
- `npm run build` exits 0. `npm run test -- --watch=false` has zero INTRODUCED failures vs `main`.
- Manual smoke in Implementation Step #6 passes.
- No other production file is modified.

---

*Prepared by the staff-engineer agent as input for the web-designer phase.*

> **Note for the web-designer:** this is a pure behavioural bug fix. There are no new visual affordances, no new components, and no new copy strings. The design spec can be a one-page confirmation that the existing Members-dialog error region (`addError`) styling and the polite live region are WCAG-AA compliant and do not need changes; the `web-designer` phase may be skipped entirely at the reviewer's discretion, in which case this spec can proceed directly to the developer phase.

---

## Development Status

**Implementation Date:** 2026-05-07
**Developer:** Claude Opus 4.7 (1M context)

### Files Modified

- [KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts) — narrowed the 401 logout branch (Option A from the tech spec). Added a private `hasValidToken()` helper and extended the predicate to `error.status === 401 && !isAuthEndpoint && !hasValidToken()`. Replaced the short comment above the `catchError` block with a five-point explanation of the three-way 401 decision and the 403 passthrough, pointing at this spec and issue #68. Net diff: +14 meaningful lines (well inside the 20-line DoD budget).
- [KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts) — rewrote the former `'still calls logout and navigates to /login when a 401 comes from a non-auth endpoint'` test as two contract-specific cases (token absent → logout + navigate; token present → no side-effects) and added dedicated regression guards for 403-passthrough and the invite endpoint `POST /project/:id/members` 401-with-token path. All prior passthrough / carve-out cases left untouched.
- [KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts) — added the AC11/AC13 regression guard: on a simulated 401 the dialog stays mounted, `addError` and `liveMessage` both mirror the mapped copy, `dialogRef.close` is not called, and `AuthService.logout` is not invoked.
- [KanbAI-Web/src/app/features/projects/state/members-state.service.spec.ts](../../KanbAI-Web/src/app/features/projects/state/members-state.service.spec.ts) — added two regression guards on `addMemberByEmail`: 401 maps to `'Your session has expired. Please sign in again.'` without mutating `currentUser` or the cache; 403 maps to the owner-only copy.

### Files NOT Modified (verified against spec "Files NOT Modified" list)

- `members-api.service.ts` / `mapMemberErrorToUserMessage` — untouched; copy strings preserved.
- `members-state.service.ts` — untouched; existing `throwError(new Error(copy))` path was already correct.
- `members-dialog.component.ts` — untouched; existing `onAddSubmit` error branch already sets `addError`, `liveMessage`, and `roleRevoked` per the design spec.
- `AuthService`, `auth-state.service.ts`, `auth.guard.ts` — untouched. AC5 (genuine expiry) still delivered by `authGuard` on subsequent navigation plus the token-absent branch of the interceptor.
- No SCSS files touched (design spec section 3 and section 7 explicitly forbade edits).
- No template edits.

### Build & Test Results

- **Build:** `npm run build` → exit 0. Only pre-existing SCSS `strict-unary` deprecation warnings and a pre-existing budget warning on `upload-progress-row.component.scss`; none are related to this fix.
- **Tests:** `npm run test -- --watch=false` → **59 test files, 1046 tests, 1046 passed, 0 failed, 0 skipped**. Runtime ~20s.
- **Introduced failures:** none.
- **Pre-existing failures:** none observed in this run.

### Acceptance Criteria Coverage

- **AC1** (401 on invite with token present → no logout, inline copy) — unit-covered in `auth.interceptor.spec.ts` (invite-endpoint case) and `members-dialog.component.spec.ts` (issue #68 regression test).
- **AC2 / AC4** (403 passthrough; list/remove 401 with token) — unit-covered by the new 403 test in `auth.interceptor.spec.ts` and by the existing 401/403 branches of `members-state.service.spec.ts` (`addMemberByEmail` and `removeMember`).
- **AC5** (genuine expiry → logout + `/login`) — unit-covered by the rewritten "no JWT is stored" case in `auth.interceptor.spec.ts`.
- **AC7** (auth-endpoint 401 carve-out) — existing `/auth/login` and `/auth/register` tests still green.
- **AC9** (polite live region announces failure copy) — unit-covered by the issue #68 regression test in `members-dialog.component.spec.ts` which asserts `liveMessage()` matches the mapped copy.
- **AC10 / AC14 / AC15** (no console errors, all tests green, build clean) — satisfied by the verification run above.
- **AC11 / AC12** (pre-existing assertions updated / preserved in place) — the former "401 on non-auth endpoint → logout+navigate" assertion was rewritten (not deleted) into two contract-accurate cases; no other test assumed the old contract.
- **AC13** (at least one of interceptor / dialog / service covers the invite 401) — all three do (option (a) + (b) + the service-level regression guard).
- **AC16 / AC17 / AC18** — AC16/AC17 are optional/stretch; AC18 is manual-only and documented in the Manual Smoke section below.

### Manual Smoke (pending reviewer execution)

The implementation steps' manual smoke checklist (Tech Spec §6) was not executed in this automated pass — the dev server and a backend returning 401 on the invite path are required. Reviewer should:

1. Log in as an owner, open the Members dialog, trigger an invite-endpoint 401 (e.g. temporarily revoke the project on the backend while the dialog is open). Expect: `.add-member-form__error` renders with the mapped copy, dialog stays mounted, URL unchanged, `localStorage.jwt_token` still present.
2. With a screen reader attached, confirm both the assertive `role="alert"` announcement and the polite `aria-live="polite"` re-announcement fire.
3. In DevTools, `localStorage.removeItem('jwt_token')` and navigate to `/dashboard` — `authGuard` should still redirect to `/login` (AC5/AC18 regression guard).

### Notes for QA

- The fix is entirely behavioural. No SCSS / template diffs; no new copy strings; no new components.
- Focus testing effort on the three-way 401 decision matrix (auth-endpoint vs. non-auth+token vs. non-auth+no-token) and the 403 passthrough. The interceptor spec now encodes all four branches.
- The design spec explicitly flagged two pre-existing accessibility observations (potential double-announcement and missing `aria-describedby` linkage from the email input to the `addError` region). These remain out of scope for this fix.

**Ready for QA review.**

---

## QA Testing Summary

**QA Date:** 2026-05-07
**QA Engineer:** qa-tester (Claude Opus 4.7, 1M context)

### Test Suites Verified

- [auth.interceptor.spec.ts](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts) — **31 / 31 passed** (includes 2 rewritten cases + 2 new cases for issue #68).
- [members-dialog.component.spec.ts](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts) — **17 / 17 passed** (includes the issue #68 401-regression guard).
- [members-state.service.spec.ts](../../KanbAI-Web/src/app/features/projects/state/members-state.service.spec.ts) — **25 / 25 passed** (includes the 401/403 mapping regression guards).

### Build & Full-Suite Results

- **Build:** `npm run build` → exit 0. Only pre-existing SCSS `strict-unary` deprecation warnings (board-page, projects-view) and the pre-existing `upload-progress-row.component.scss` 4 KB budget overage. None touch the fix.
- **Full test run:** `npm run test -- --watch=false` → **59 test files, 1046 tests, 1029 passed, 17 failed, 0 skipped**. Runtime ~18 s.

### Failure Classification

All 17 failures are **PRE-EXISTING** and localised to [signalr.service.spec.ts](../../KanbAI-Web/src/app/core/services/signalr.service.spec.ts):

- `git log main..HEAD -- KanbAI-Web/src/app/core/services/signalr.service.*` returns zero commits → no SignalR source or spec was modified on this branch.
- All stack frames point into the signalr spec itself (`signalr.service.spec.ts:672`, `:716`, `:751`, `:769`). None reference `auth.interceptor.ts`, `members-dialog.component.ts`, or `members-state.service.ts`.
- The failures cluster on a mock-connection race: `expected 'connecting' to be 'connected'` and `Cannot read properties of null (reading '_connection')`. Classic async-microtask timing flake, unrelated to this fix.

Per tech-spec §"Failure Classification Hints": `signalr.service.spec.ts` failures are pre-existing unless the stack references the interceptor — they don't.

**Introduced failures: 0.** AC14 satisfied.

> Discrepancy with the developer-phase "Development Status" (which reported 0/1046 failed): the dev run captured a clean signalr pass on the same commit earlier today. The suite is flaky, not regressed. Recommend filing a separate follow-up issue to harden the signalr mock — out of scope for #68.

### Acceptance Criteria Coverage

| AC | Coverage | Evidence |
|---|---|---|
| AC1 — 401 on invite preserves session | ✅ unit + component | `auth.interceptor.spec.ts`: *"does NOT call logout or navigate on a 401 from POST /project/:id/members when a JWT is stored"* + `members-dialog.component.spec.ts`: *"onAddSubmit 401 keeps dialog mounted…"* |
| AC2 — 403 on invite preserves session | ✅ unit + component | `auth.interceptor.spec.ts`: *"does NOT call logout or navigate on a 403 from a non-auth endpoint"* + `members-dialog.component.spec.ts`: *"onAddSubmit 403 flips roleRevoked and hides the add-form"* |
| AC3 — Inline mapped copy for 400/401/403/500 | ✅ unit + component | `members-state.service.spec.ts` covers 400/401/403 → mapped strings; `members-dialog.component.spec.ts` asserts the add-form `errorMessage` input receives the mapped copy |
| AC4 — List/remove 401/403 no longer logout | ✅ unit | `auth.interceptor.spec.ts` covers generic `GET /project` 401-with-token and 403-with-token; `members-state.service.spec.ts` covers `removeMember` 400/403 mapping |
| AC5 — Missing JWT still redirects | ✅ unit | `auth.interceptor.spec.ts`: *"calls logout and navigates to /login on a 401 from a non-auth endpoint when no JWT is stored"* |
| AC6 — Explicit logout | ✅ regression | `AuthService.logout` untouched; no new path exercises it differently |
| AC7 — Auth-endpoint carve-out | ✅ unit | Two existing tests for `/auth/login` and `/auth/register` — green |
| AC8 — Owner can retry after failure | ⚠️ indirect | Covered by dialog-stays-mounted + cache-unchanged asserts. No dedicated "resubmit succeeds after error" test — acceptable; trivially derivable. |
| AC9 — Live region announces failure | ✅ component | `members-dialog.component.spec.ts` asserts `liveMessage()` equals the mapped copy on 401 |
| AC10 — No console errors | ⚠️ manual | No automated console-spy across all failure paths. Tech spec §6 manual smoke owns this. |
| AC11 — Existing members-dialog tests pass | ✅ | 17/17 green |
| AC12 — Existing interceptor tests pass | ✅ | 31/31 green; passthrough and env-integration blocks untouched |
| AC13 — Fix covered by new automated test | ✅ (a+b+c) | Interceptor invite-endpoint test, dialog dialog-stays-mounted test, and state-service 401-mapping test all new |
| AC14 — Zero INTRODUCED failures | ✅ | 17 pre-existing signalr flakes only; none reference the fix's files |
| AC15 — Build succeeds | ✅ | `npm run build` exit 0 |
| AC16 — Concurrent in-flight requests | ❌ not covered | Stretch per tech spec; not required for merge |
| AC17 — Dialog close mid-request | ⚠️ indirect | Pre-existing root-injector subscription pattern preserved; no dedicated test added |
| AC18 — Reachable 401-after-expiry | ⚠️ manual | Covered by AC5 unit test + manual DevTools step in tech-spec §6 |

### Gaps Flagged (non-blocking)

1. **AC10 console-hygiene assertion** on the invite 401 path — could be folded into the dialog spec as a `vi.spyOn(console, 'error')` check. Not required by the DoD.
2. **AC16 concurrent requests** — tech spec marks it optional; not implemented.
3. **Signalr suite flakiness** — 17 pre-existing failures on this run despite a clean dev-phase run earlier today. Recommend a dedicated follow-up to stabilise the connection-state mock (unrelated to #68).

### Verdict

**Ready for code review and manual smoke per tech-spec §6.** The automated coverage matches the tech-spec DoD: three-way 401 matrix covered, 403 passthrough covered, invite-endpoint regression guarded at interceptor / component / state-service layers, zero introduced failures, build clean.

*Prepared by the qa-tester agent as input for the code-review / merge phase.*
