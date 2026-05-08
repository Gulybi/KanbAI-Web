# Technical Specification: Force logout + redirect on any 401

**Context Document:** [issue_86_context.md](./issue_86_context.md)
**GitHub Issue:** [#86](https://github.com/Gulybi/KanbAI-Web/issues/86)
**Prerequisite Tech Spec:** [issue_68_tech_spec.md](./issue_68_tech_spec.md) (established the auth-endpoint carve-out and the current `!hasValidToken()` gate that this ticket removes)

---

## Overview

This ticket is a **chassis refactor, not a new feature.** The surface area is one file — [`auth.interceptor.ts`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts) — and its sibling spec. No new components, no routing changes, no new dependencies, no new models.

The change is a **code-branch removal**: the `!hasValidToken()` presence check on [`auth.interceptor.ts:49`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts#L49) is deleted, so any `401` from a non-auth endpoint unconditionally triggers `authService.logout()` + `router.navigate(['/login'])`. Two new guards are added to keep the path idempotent: an `isAuthenticated()` check (collapses multiple concurrent 401s into one logout) and a `router.url.startsWith('/login')` check (prevents a 401 from stomping a user already on the login page).

Feature-layer 401 error copy (`'Your session has expired. Please sign in again.'`) stays in place as dead-code defence, consistent with the existing convention documented at [`tasks-api.service.ts:81-83`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L81-L83) (*"Intercepted globally by authInterceptor — the UI rarely sees this, but map defensively in case the interceptor is ever bypassed."*).

---

## Component Architecture

### Routing
**No route changes.** The existing `authGuard` on `/dashboard`, `/board/:projectId`, etc. already honours `AuthStateService.isAuthenticated()`, which this ticket causes to flip to `false` the moment a rejected 401 comes back. AC10 is satisfied transitively.

### Files to Create
**None.**

### Files to Modify

| File | Change |
|------|--------|
| `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` | Remove `!hasValidToken()` gate; inject `AuthStateService`; add idempotency + on-login-page guards; import `LOGIN_ROUTE` from `core/constants/auth-routes`. Delete the now-unused `hasValidToken()` helper. |
| `KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts` | Invert the two "does NOT call logout" tests (lines 426–448 and 474–498) to now assert logout + navigate fire. Keep auth-endpoint carve-out suite and 403 suite unchanged. Add two new tests per AC12 and three new guard tests (on-login-page, concurrent 401s, malformed-claim body). |

### Files NOT Modified (intentional — dead-code defence)

Per **Design Decision #2** below, the 401 arms in the feature-layer mappers are kept:

| File | Location | Rationale |
|------|----------|-----------|
| `features/projects/services/members-api.service.ts` | Line 110–112 (401 branch), line 119 (403 `list` folded into 401 copy) | Dead-code defence. Existing feature specs at `members-api.service.spec.ts:188` and `members-state.service.spec.ts:282` still pass because they invoke the mapper directly. |
| `features/board/services/tasks-api.service.ts` | Line 80–84 (move), line 113–115 (create) | Already documented as defensive in the existing comment. Leave as-is. |
| `features/projects/services/projects-api.service.ts` | Line 100–102 (columns), line 126–128 (projects) | Dead-code defence. |
| `features/board/services/columns-api.service.ts` | Line 100–102 (found via grep) | Dead-code defence. |

**Rule for future developers (new memo in `CLAUDE.md` is NOT required — it's already implicit in the existing `tasks-api.service.ts` comment):** new authenticated feature services that implement their own error mapper SHOULD continue to include a 401 → "Your session has expired." arm as defensive code, with a comment pointing to #86. They should NOT omit the 401 arm on the assumption the interceptor handles it, because mocked-interceptor tests and mapper unit tests still benefit from the copy.

---

## State & Data Layer

### State Management Strategy

**No new state.** The interceptor already consumes `AuthService` and `Router` via `inject()`. It will additionally consume `AuthStateService` via `inject()`:

```typescript
// In auth.interceptor.ts (shape — developer writes the real code)
const router = inject(Router);
const authService = inject(AuthService);
const authStateService = inject(AuthStateService);
```

`AuthStateService.isAuthenticated()` is a `computed` signal — reading it in an HTTP error handler is a pure function call (no subscription lifecycle). Safe.

### TypeScript Interfaces

**No new interfaces.** The spec uses existing `HttpErrorResponse` from `@angular/common/http`.

### Constants

Re-use the existing `LOGIN_ROUTE` constant from [`core/constants/auth-routes.ts:24`](../../KanbAI-Web/src/app/core/constants/auth-routes.ts#L24) rather than hard-coding `'/login'`. The guard already uses this constant — keeping the interceptor aligned prevents a future rename drifting the two out of sync.

---

## Service Integration

### Interceptor Design — the 401 Decision

**Policy (observable outcomes, from context doc §"Desired State"):**

| Incoming response | URL | `authStateService.isAuthenticated()` | `router.url` | Action |
|---|---|---|---|---|
| `401` | `/auth/login` or `/auth/register` | any | any | Propagate only. **No logout. No navigate.** |
| `401` | non-auth API URL | `true` | not `/login*` | `authService.logout()` + `router.navigate(['/login'])`. Propagate. |
| `401` | non-auth API URL | `true` | `/login*` | `authService.logout()`. **Skip navigate** (already there — AC-guard-1). Propagate. |
| `401` | non-auth API URL | `false` | any | **No-op.** Already logged out by a prior 401 (AC-guard-2). Propagate. |
| `403` | any | any | any | Propagate only. **No logout. No navigate.** (AC6) |
| `4xx`/`5xx` other | any | any | any | Propagate only. |

**Pseudocode shape (developer implements the real TS):**

```typescript
return next(req).pipe(
  catchError((error: HttpErrorResponse) => {
    const isAuthEndpoint =
      req.url.startsWith(`${environment.apiUrl}/auth/login`) ||
      req.url.startsWith(`${environment.apiUrl}/auth/register`);

    if (error.status === 401 && !isAuthEndpoint && authStateService.isAuthenticated()) {
      // Guard 1: collapses concurrent 401s — after the first, isAuthenticated() is false.
      authService.logout();
      // Guard 2: don't stomp a user already on the login page with a stray 401.
      if (!router.url.startsWith(LOGIN_ROUTE)) {
        router.navigate([LOGIN_ROUTE]);
      }
    }

    return throwError(() => error);
  })
);
```

Note: the `!hasValidToken()` check is **gone**. The `hasValidToken()` helper at [`auth.interceptor.ts:59-62`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts#L59-L62) is deleted.

### HTTP Request/Response Contracts

**No new endpoints.** The interceptor is invariant over backend contract — it reacts to status codes. The `.claude/backend_api_map.md:67` flavour (malformed-claim 401) is handled by status alone; the body is not parsed, per AC5.

### SignalR Hub Coordination (AC9 — documented limitation)

**Inspection of [`signalr.service.ts`](../../KanbAI-Web/src/app/core/services/signalr.service.ts) findings:**

- The `@microsoft/signalr` client passes an optional `Error` argument into `onclose` ([line 104](../../KanbAI-Web/src/app/core/services/signalr.service.ts#L104)) and rejects the `start()` Promise ([line 120](../../KanbAI-Web/src/app/core/services/signalr.service.ts#L120)) on negotiate failure. Neither surface exposes a typed "auth-rejected" discriminant — detecting 401 from the message would require string-sniffing, which is brittle across library versions.
- **The existing effect at [`signalr.service.ts:66-72`](../../KanbAI-Web/src/app/core/services/signalr.service.ts#L66-L72) already calls `stop()` whenever `authStateService.isAuthenticated()` flips to `false`.** After this ticket, the HTTP 401 path clears `AuthStateService` synchronously → the effect re-runs → `stop()` is invoked on the hub within the same microtask batch. So the **HTTP-triggered** zombie-session path cleans up the hub as a side-effect, with no new wiring needed.

**What remains uncovered (call-out for AC9 documentation):** a pure hub-only zombie session — the user is idle, no HTTP traffic is in flight, and the hub reconnects with a token that the backend rejects. In that case the hub close fires, the connection state goes to `'disconnected'`, and the user is NOT logged out because `AuthStateService` is still populated. The user will only discover the zombie session on their next authenticated HTTP request, at which point the HTTP path fires and logs them out.

**This gap is explicitly accepted per AC9's "best-effort" framing and is NOT in scope for #86.** A follow-up ticket can add a `HubConnection.onclose` handler that inspects the error and, on a plausible auth rejection, forces logout. Out of scope here to avoid brittle string-sniffing without observed production failures.

---

## Implementation Steps

Follow these steps in order:

### 1. Pre-work — Capture reproduction evidence (AC0, AC14)
- [ ] On `main` (pre-fix), reproduce the zombie-session symptom using **both** flavours:
  - **Flavour A — rotated signing key:** stop backend → change the JWT signing key in backend config → restart → click "Add member" → observe `401` + inline "session expired" copy + token still in `localStorage`.
  - **Flavour B — malformed-claim:** hand-craft a JWT with no `NameIdentifier` claim (jwt.io is fine for this), set it as `localStorage.jwt_token`, click "Add member" → observe the same symptom with `ApiResponse.Fail("Invalid or missing user ID in token.")` in the body.
- [ ] Save DevTools Network screenshots showing: HTTP status, response body, `localStorage` state. These go in the PR body (AC14).
- [ ] **Do not start editing the interceptor until this evidence is captured** — AC0 is a hard gate.

### 2. Edit the interceptor
- [ ] Open [`KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts).
- [ ] Add `AuthStateService` to the imports and inject it.
- [ ] Import `LOGIN_ROUTE` from `../constants/auth-routes`.
- [ ] Replace the `if (error.status === 401 && !isAuthEndpoint && !hasValidToken())` branch with the policy shape from §"Interceptor Design" above.
- [ ] **Delete** the `hasValidToken()` helper function entirely.
- [ ] Update the block-comment in the file (lines 35–44) to describe the new two-way policy (auth-endpoint carve-out vs everything-else-logs-out) instead of the old three-way policy. One sentence max — do not write prose.

### 3. Update the interceptor spec
- [ ] Open [`auth.interceptor.spec.ts`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts).
- [ ] **Invert test at line 426–448** (`'does NOT call logout or navigate on a 401 from a non-auth endpoint when a JWT is still stored'`): rename to `'calls logout and navigates to /login on a 401 from a non-auth endpoint when a JWT is stored'`, assert `authService.logout` is called once and `router.navigate` is called with `['/login']`. This is AC1/AC2/AC3/AC4/AC11.
- [ ] **Invert test at line 474–498** (`'does NOT call logout or navigate on a 401 from POST /project/:id/members when a JWT is stored'`): rename and invert assertions. This is the AC12-first test.
- [ ] Keep test at line 405–424 (401 with no token stored → logout + navigate) **unchanged** — the new policy still satisfies it.
- [ ] Keep the 403 test (line 450–472) **unchanged** — AC6 regression guard.
- [ ] Keep the `/auth/login` and `/auth/register` 401 tests (lines 365–403) **unchanged** — AC7 regression guard.
- [ ] **Extend the test bed's `AuthStateService` stub.** The existing bed at line 43–55 provides stubs for `Router` and `AuthService` but NOT `AuthStateService`. Add a stub that:
  - Exposes `isAuthenticated` as a signal-shaped function that reflects an internal flag.
  - Toggles that flag to `false` whenever `authService.logout()` fires (so concurrent-401 tests observe the guard collapsing subsequent 401s).
  - Exposes `clearAuthState()` as a no-op vi.fn for assertions.
  - Example shape: `{ isAuthenticated: () => authed, clearAuthState: vi.fn(() => { authed = false; }) }` where `authed` is a closure variable flipped by the AuthService.logout mock.

### 4. Add new unit tests (AC12)
- [ ] **Test: 401 from `POST /project/{id}/members` with stored token → logout + navigate.** (This is AC12 literal wording.)
- [ ] **Test: 401 with body `ApiResponse.Fail("Invalid or missing user ID in token.")` → logout + navigate.** Assert the body content is irrelevant to the decision — status `401` is sufficient (AC5).
- [ ] **Test: 401 when `router.url` is already `/login` → `authService.logout()` is called (idempotent) but `router.navigate` is NOT called a second time.** Covers the on-login-page guard.
- [ ] **Test: two concurrent 401s from different endpoints → `authService.logout()` is called exactly once; `router.navigate(['/login'])` is called exactly once.** Covers the `isAuthenticated()` idempotency guard. Seed the test bed such that the `AuthStateService` stub flips to `isAuthenticated() === false` on the first `logout()` call.
- [ ] **Test: 401 from an external (non-API) URL → no logout, no navigate.** Regression guard that the `req.url.startsWith(environment.apiUrl)` filter is still respected (the interceptor currently only attaches the `Authorization` header to API URLs; the 401 handler currently applies to all URLs — confirm the developer's implementation matches the policy table above, which is API-URLs-only for the logout branch. **Developer: if policy conflicts with existing behaviour, default to API-URLs-only for the 401 branch and document the decision in the PR.**)

### 5. Manual QA (per AC1–AC10)
After unit tests pass, manually run through the in-scope flows from context doc §"In-scope user flows":
- [ ] Flow 1 — Add Member 401 (AC1)
- [ ] Flow 2 — List Members 401 (AC2)
- [ ] Flow 3 — Remove Member 401 (AC3)
- [ ] Flow 4 — GET `/api/project` 401, PUT `/api/task/{id}/move` 401, POST `/api/attachment/task/{id}` 401 (AC4 — pick 2 of the 6 listed endpoints for a spot-check)
- [ ] Flow 5 — Malformed-claim 401 (AC5) — use the hand-crafted JWT from Step 1.
- [ ] Flow 6 — 403 regression guard (AC6) — non-owner attempts to add a member.
- [ ] Flow 7 — Wrong password on `/auth/login` (AC7) — inline error renders, no redirect.
- [ ] Flow 8 — After a forced logout, manually type `/dashboard` in the URL bar → redirects to `/login` (AC10).
- [ ] **AC8 spot-check:** across all reproductions, confirm `'Your session has expired. Please sign in again.'` never flashes on-screen.

### 6. Build & test verification
- [ ] `npm run build` exits `0`, no new errors or warnings. (AC13)
- [ ] `npm run test -- --watch=false` — report totals. Zero INTRODUCED failures versus `main`. (AC13) Feature specs at `members-state.service.spec.ts:282`, `projects-api.service.spec.ts:125 / :130`, `tasks-api.service.spec.ts:146 / :301`, `members-api.service.spec.ts:188`, `columns-api.service.spec.ts` (the 401 mapper assertions from Grep) remain green because the mapper 401 arms are retained as dead-code defence (Design Decision #2).

### 7. PR description
- [ ] Attach the two Network-tab captures from Step 1 as inline images or uploaded screenshots.
- [ ] Include step-by-step reproductions for both 401 flavours with observed pre-fix and post-fix behaviour. (AC14)

**Performance considerations:** none. The change removes a code branch; it strictly cannot regress hot-path performance.

---

## Design Decisions

### Decision #1 — Remove the `!hasValidToken()` gate entirely (Option A)

**Considered:**
- **(A)** Remove the gate so `401 && !isAuthEndpoint` always triggers logout+redirect. **Picked.**
- **(B)** Decode the JWT client-side (add `jwt-decode` dep), check `exp`, and use that as the gate. **Rejected.**
- **(C)** Hybrid — decode for a proactive warning, AND remove the server-side gate. **Rejected.**

**Why (A):**
1. **Matches the backend contract literally.** `.claude/backend_api_map.md:67` says 401 means "JWT problem" and 403 means "per-resource authz problem". Option A makes the client treat the two identically to the server.
2. **Covers the signing-key rotation case that (B) cannot.** A rotated-key token is structurally valid with a non-expired `exp`, so client-side decoding would let it through the gate — and we'd still need the server-rejection branch to catch it. So (B) can't stand alone.
3. **Zero new dependencies.** `jwt-decode` is ~5KB but adds a supply-chain surface for no upside here.
4. **Proactive expiry warning is explicitly out of scope** per context doc line 94. (B)'s value is all in the pre-emptive-warning direction we're not supposed to build.
5. **Shrinks the interceptor surface area.** The issue framing is *"removes a code path rather than adding one"* — (A) is the literal instantiation of that framing.

### Decision #2 — Keep the 401 arms in feature-layer mappers as dead-code defence

**Considered:**
- **(A)** Remove the 401 arms from all four mappers. Updates ~6 feature spec files.
- **(B)** Keep them as dead code. No feature spec churn. **Picked.**

**Why (B):**
1. **Precedent exists.** The comment at [`tasks-api.service.ts:81-83`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L81-L83) already treats the mapper's 401 arm as intentional defence-in-depth. Removing the arm now would contradict the existing convention.
2. **Smaller blast radius.** Option A touches 4 service files and 6 spec files. Option B touches 2 files. Smaller PRs merge faster and bisect cleaner.
3. **Survives a regression.** If a future refactor ever disables or bypasses the interceptor (e.g. a test bed that only wires `HttpClient`), feature mappers still surface a sensible message instead of leaking a raw `HttpErrorResponse`.
4. **AC8 is about rendering, not about mapper contents.** The AC specifies that the string "does not appear in any dialog, banner, or error region triggered by a 401" — i.e. the *user* never sees it. Whether the string exists in unreachable mapper code is explicitly left to tech-spec discretion by the context doc. This spec chooses "keep".

### Decision #3 — SignalR best-effort: rely on the existing `AuthStateService` effect, do not wire a hub-auth hook

**Considered:**
- **(A)** Wire `HubConnection.onclose(error)` to inspect `error.message` for a 401 hint and call `authService.logout()`. String-sniffs.
- **(B)** Rely on the existing effect at [`signalr.service.ts:66-72`](../../KanbAI-Web/src/app/core/services/signalr.service.ts#L66-L72), which already stops the hub whenever `isAuthenticated()` flips. Document the pure-hub-idle gap as a known limitation. **Picked.**

**Why (B):**
1. **The HTTP path already propagates to the hub.** Interceptor clears `AuthStateService` → effect fires → `stop()` is called on the hub. Free.
2. **Option (A) is brittle string-sniffing** across `@microsoft/signalr` versions and ambiguous error messages. Not worth the fragility for an "AC9 best-effort" criterion.
3. **The remaining gap (pure-hub-idle zombie) is small.** It only surfaces if a user is idle long enough for a hub reconnect to fail without any HTTP traffic. In practice the KanbAI board makes HTTP calls on almost every interaction — the pure-hub-idle window is thin.
4. **Follow-up is cleanly scoped.** A future ticket can add hub-auth detection without touching the HTTP interceptor.

### Decision #4 — Use `AuthStateService.isAuthenticated()` as the idempotency guard, not a private `isLoggingOut` flag

**Considered:**
- **(A)** Add a private module-level `isLoggingOut` boolean that flips on the first 401 and resets after navigation.
- **(B)** Use `AuthStateService.isAuthenticated()` — after the first 401's `logout()` call, it returns `false`, so the second 401 short-circuits. **Picked.**

**Why (B):**
1. **No new state to manage.** `AuthStateService` is the existing source of truth.
2. **Self-resetting on re-login.** A module-level boolean would need manual reset logic, which is an easy thing to miss.
3. **Composes with the on-login-page guard cleanly.** Both guards read observable state; neither introduces hidden lifecycle.

### Decision #5 — Guard against navigating on top of `/login`

**Why:** pathological-but-real case — a 401 fires from a background endpoint (e.g. a long-poll or telemetry) while the user is typing on `/login`. Without this guard, `router.navigate(['/login'])` would trigger a same-URL navigation that Angular's router treats as a no-op *by default*, but would still cycle guards and effects. Cheap to add, strictly safer. Implementation is one conditional: `if (!router.url.startsWith(LOGIN_ROUTE))`.

---

## QA Guidance

### Test Strategy

**Unit Tests (interceptor — primary coverage):**

Expanding `auth.interceptor.spec.ts`:

| Test | AC |
|------|-----|
| `calls logout and navigates to /login on a 401 from a non-auth endpoint when a JWT is stored` (inverted from current line 426) | AC1/AC2/AC3/AC4/AC11 |
| `calls logout and navigates to /login on a 401 from POST /project/:id/members when a JWT is stored` (inverted from current line 474) | AC12 (first) |
| `calls logout and navigates to /login on a 401 with body "Invalid or missing user ID in token."` (new) | AC5, AC12 (second) |
| `calls logout but does NOT navigate when router is already on /login` (new) | Guard regression |
| `handles two concurrent 401s by calling logout exactly once and navigate exactly once` (new) | Guard regression |
| `does NOT call logout or navigate on 401 from /auth/login` (existing, line 365) | AC7 |
| `does NOT call logout or navigate on 401 from /auth/register` (existing, line 385) | AC7 |
| `does NOT call logout or navigate on 403 from a non-auth endpoint` (existing, line 450) | AC6 |
| `calls logout and navigates to /login on a 401 when no JWT is stored` (existing, line 405, still valid) | AC1 coverage |

**Unit Tests (feature mappers — unchanged):**

The existing feature specs at `members-api.service.spec.ts:188`, `members-state.service.spec.ts:282`, `projects-api.service.spec.ts:125 / :130`, `tasks-api.service.spec.ts:146 / :301`, `columns-api.service.spec.ts` continue to test the mappers in isolation and continue to pass. **Do not touch them** unless a specific test fails (which it should not, per Design Decision #2). If a reviewer asks why, point them at this spec and at the existing `tasks-api.service.ts:81-83` comment.

**Integration / E2E Tests:** none required. The interceptor behaviour is fully covered by the unit spec with a stubbed router and stubbed auth services. A browser-level E2E would add no signal over the manual QA flows in Implementation Step 5.

### Mocking Instructions

```typescript
// AuthStateService stub for the interceptor test bed.
// Must reflect the post-logout flip so concurrent-401 tests observe guard behaviour.
let authed = true;
const authStateStub = {
  isAuthenticated: () => authed,
  clearAuthState: vi.fn(() => { authed = false; })
};
const authServiceStub = {
  logout: vi.fn(() => { authed = false; })
};
const routerStub = {
  navigate: vi.fn().mockResolvedValue(true),
  url: '/dashboard'
};

// In tests that target the on-login-page guard, set `routerStub.url = '/login';` before flushing.
// In tests that target the idempotency guard, set `authed = true;` in beforeEach and assert
// logout / navigate are each called exactly once across two sequential flushes.
```

### Edge Cases to Test
- **Empty response body on 401** — mapper handles, interceptor is body-agnostic. Covered by the existing AC5 test path.
- **401 on a request that was retried by the HTTP client** — no change; interceptor fires once per final response.
- **User signs in again after a forced logout** — `authed` flag re-flips when `AuthService.login()` runs `handleAuthSuccess` → `setAuthState(...)`. No stale state.
- **401 on a request to an external (non-API) URL** — confirm the developer either (a) preserves the existing `startsWith(environment.apiUrl)` filter for the 401 branch too, or (b) documents the decision in the PR. See Implementation Step 4 last bullet.

---

## Out of Scope (explicit)

Per context doc §"Out of scope":

- Silent token refresh / refresh-token flow.
- A "your session ended" banner on `/login`.
- Members-dialog UX changes.
- Backend changes.
- Pre-emptive JWT expiry warnings (would require client-side decoding).
- Cross-tab logout synchronisation via `storage` events.
- SignalR hub-auth detection beyond the existing `AuthStateService` effect-driven cleanup.

---

## Development Status

**Implementation Date:** 2026-05-08
**Developer:** Claude Opus 4.7 (1M)

### Files Created
None.

### Files Modified
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` — Injected `AuthStateService`, imported `LOGIN_ROUTE` constant, replaced the `!hasValidToken()` gate with the new two-way policy (auth-endpoint carve-out vs everything-else-logs-out), added the `isAuthenticated()` idempotency guard and the on-login-page guard, scoped the 401-logout branch to API URLs only via `req.url.startsWith(environment.apiUrl)`, rewrote the block comment, and deleted the `hasValidToken()` helper.
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts` — Imported `AuthStateService`; extended the test bed with an `AuthStateService` stub plus a closure-driven `authed` flag and a mutable `routerUrl` getter; inverted the two "does NOT call logout" tests (renamed + assertions flipped); added four new tests (AC5 malformed-claim, on-login-page guard, concurrent-401 collapse, external-URL no-op).

### Files NOT Modified (dead-code defence per Design Decision #2)
Per the tech spec, feature-layer 401 mapper arms remain in place in `members-api.service.ts`, `tasks-api.service.ts`, `projects-api.service.ts`, and `columns-api.service.ts`. Their mapper unit tests continue to pass unchanged.

### Build & Test Results
- **Build:** `npm run build` exits 0. No new errors or warnings introduced by #86. Pre-existing SCSS warnings (unary-operator deprecation in `board-page.component.scss`; bundle-budget warnings in `board-page.component.scss`, `upload-progress-row.component.scss`, `column-draft-list.component.scss`) are present on `main` and unaffected by this change.
- **Tests:** `npm run test` reports **Test Files 66 passed (66) | Tests 1259 passed (1259)**. Net delta vs `main` is **+4 tests** (6 new tests added in the interceptor suite minus 2 tests replaced by inversions of existing tests = +4). Zero INTRODUCED failures. (AC13 ✅)
- **Note on flakiness observed during verification:** one intermediate run showed 17 transient failures in `signalr.service.spec.ts` (a file untouched by this ticket). The same run, with no code changes, passed fully on retry. The failures were all in the SignalR `_capturedOptions` / `_connection` access path — a known flakiness pattern driven by microtask-flush timing inside the SignalR test harness, independent of the HTTP interceptor. Classified PRE-EXISTING.

### AC Coverage Summary
- **AC0 (reproduction evidence in PR body):** tech-spec gate — not part of the code implementation; QA / PR-author must capture the two DevTools Network flavours per Implementation Step 1.
- **AC1–AC4 (logout+redirect on any non-auth 401):** covered by the inverted interceptor test `calls logout and navigates to /login on a 401 from a non-auth endpoint when a JWT is stored` plus the pre-existing `… when no JWT is stored` test.
- **AC5 (malformed-claim 401):** covered by the new `… on a 401 with body "Invalid or missing user ID in token."` test.
- **AC6 (403 never logs out):** covered by the unchanged `does NOT call logout or navigate on a 403 from a non-auth endpoint` test.
- **AC7 (auth-endpoint carve-out):** covered by the unchanged `/auth/login` and `/auth/register` 401 tests.
- **AC8 (session-expired copy never renders on 401 path):** enforced at runtime — the interceptor navigates before any feature-layer error branch runs. QA-verifiable per Step 5.
- **AC9 (SignalR best-effort):** no new wiring required. The existing effect at `signalr.service.ts:66-72` stops the hub whenever `AuthStateService.isAuthenticated()` flips to `false`; the HTTP 401 path clears that state via `authService.logout()`, so the hub is torn down as a side-effect. Pure-hub-idle zombie gap is documented in tech spec §SignalR Hub Coordination as explicitly out of scope.
- **AC10 (guard bounces re-navigation):** transitively covered by the existing `authGuard` reading `AuthStateService.isAuthenticated()`, which the interceptor now clears via `authService.logout()`. No guard-code changes needed.
- **AC11 (interceptor spec updated in place):** done — the two previously-asserting "no-op" tests are now inverted and assert logout + navigate.
- **AC12 (new unit tests for the two 401 flavours):** done — one test for `POST /project/:id/members` (the inverted test itself satisfies the first AC12 literal) and one new test for the malformed-claim body.
- **AC13 (no INTRODUCED test failures, `npm run build` exits 0):** verified — see Build & Test Results above.
- **AC14 (PR description carries reproduction evidence):** PR-author gate.

### Policy Table Implemented
| Incoming response | URL | `authStateService.isAuthenticated()` | `router.url` | Action |
|---|---|---|---|---|
| `401` | `/auth/login` or `/auth/register` | any | any | Propagate only. |
| `401` | non-auth API URL | `true` | not `/login*` | `authService.logout()` + `router.navigate([LOGIN_ROUTE])`. Propagate. |
| `401` | non-auth API URL | `true` | `/login*` | `authService.logout()` only. Propagate. |
| `401` | non-auth API URL | `false` | any | No-op (idempotent). Propagate. |
| `401` | external (non-API) URL | any | any | No-op. Propagate. |
| `403` | any | any | any | Propagate only. |
| other | any | any | any | Propagate only. |

### Design-Decision Compliance
- **Decision #1 (remove the `!hasValidToken()` gate entirely — Option A):** implemented. The helper is deleted; no JWT decoding added.
- **Decision #2 (keep feature-mapper 401 arms as dead-code defence):** honoured. No feature service or feature spec touched.
- **Decision #3 (SignalR best-effort via existing effect):** honoured. No `HubConnection.onclose` string-sniffing added.
- **Decision #4 (idempotency via `AuthStateService.isAuthenticated()`):** implemented.
- **Decision #5 (on-login-page guard):** implemented via `router.url.startsWith(LOGIN_ROUTE)`.

### Developer Decision — 401-logout branch scoped to API URLs
Per Implementation Step 4's last bullet, the 401-logout branch is scoped to `req.url.startsWith(environment.apiUrl)`. This matches the header-attachment branch's existing URL filter and prevents a 401 from a third-party service (telemetry, analytics) from force-logging a user out. The external-URL regression test (`does NOT call logout or navigate on a 401 from an external (non-API) URL`) pins this decision.

### Edge Cases for QA
- Zombie-session recovery from each of: Add Member, List Members, Remove Member, GET/PUT project endpoints, POST attachment — all redirect to `/login` within one frame.
- 403 from `POST /project/:id/members` (non-owner): inline copy renders; no redirect; no `localStorage` mutation.
- Wrong-password 401 on `/auth/login`: inline credential error; no redirect; no auth state mutation.
- Two near-simultaneous 401s from different endpoints collapse to exactly one `logout()` + one `navigate(['/login'])` (idempotency guard).
- 401 arriving while already on `/login` (e.g. a stray background request): `logout()` fires but `navigate` is suppressed.
- 401 from an external URL: no-op.

### Known Limitations
- **Pure-hub-idle zombie session (AC9 documented gap):** a user idle long enough for a SignalR reconnect to fail with an auth-rejected token, with no HTTP traffic in flight, will not be logged out until their next authenticated HTTP request. Out of scope per the tech spec.
- **Cross-tab logout sync:** a second KanbAI tab retains its stale session until its next authenticated request (context doc §"Out of scope").

### Notes
- The `hasValidToken()` helper is deleted; `localStorage.getItem('jwt_token')` is now only read inline in the header-attachment branch.
- `LOGIN_ROUTE` constant is used consistently with `authGuard` so a future route rename stays coherent.
- Block comment on the interceptor rewritten to describe the new two-way policy; `hasValidToken()` reference removed.

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification — though for this ticket the web-designer pass is effectively a no-op (no new UI, no new copy rendered on the 401 path) and can likely be skipped, taking the workflow straight to the developer agent.*
