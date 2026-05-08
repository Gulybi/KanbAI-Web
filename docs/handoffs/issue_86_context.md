# Feature: Force logout + redirect on any 401 so a rejected JWT can't sustain a zombie session

**GitHub Issue:** [#86](https://github.com/Gulybi/KanbAI-Web/issues/86)
**Milestone:** _none_ (unassigned)
**Labels:** `bug`
**Repository:** Gulybi/KanbAI-Web
**Assignee:** @Gulybi
**Severity:** Major — security- and UX-sensitive. A stored-but-rejected JWT currently keeps the user on an authenticated route where every subsequent request 401s silently, producing an unresponsive product and an inline "session expired" banner with no path forward. The fix closes the gap left by #68 AC5 / AC18 and aligns the interceptor with the documented backend 401 contract.

---

## Business Value

### Who is this for?
- **Every authenticated KanbAI user** whose JWT becomes server-side invalid mid-session. This happens in three realistic, non-malicious scenarios:
  1. **Backend re-deploys with a rotated signing key** (the most common case in a pre-production product). Every existing token becomes structurally valid but cryptographically rejected. Users who had the app open before the rotation now hold a token that the server will reject on the next authenticated action.
  2. **Token expiry.** Standard JWT lifetime elapses; the server rejects the signature check.
  3. **Malformed `NameIdentifier` claim.** `.claude/backend_api_map.md` line 67 documents a specific 401 flavour where the token is structurally valid but the user-id claim is missing or not a `Guid`; the project controllers surface this as `ApiResponse.Fail("Invalid or missing user ID in token.")` with HTTP 401. This is a subtle variant that can occur when the auth contract evolves faster than older tokens, or when a manually-crafted token slips through.
- **Owners and collaborators working in the members dialog.** The zombie-session symptom was first reported against `POST /api/project/{projectId}/members` ("Add member"), which is the endpoint most likely to surface a 401 because it is the first thing a user does after opening the project page — if the token is dead, the member-add button is where they find out.
- **Keyboard- and screen-reader-only users** who cannot easily recover from an unresponsive authenticated route. A silent zombie session is especially punishing for assistive-tech users: the only UI signal today is an inline error string next to the submit button, which requires knowing to look there. A forced redirect to `/login` is the only truly accessible recovery path.
- **Future developers of every new authenticated feature** on the platform. Today each feature layer has to carry its own 401 copy (see `mapMemberErrorToUserMessage` at [`members-api.service.ts:110-112`](../../KanbAI-Web/src/app/features/projects/services/members-api.service.ts#L110-L112), `mapTaskMoveErrorToUserMessage` / `mapTaskCreateErrorToUserMessage` at [`tasks-api.service.ts:83`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L83) and [`:114`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L114), and `mapErrorToUserMessage` at [`projects-api.service.ts:127`](../../KanbAI-Web/src/app/features/projects/services/projects-api.service.ts#L127)). After this fix, 401 is a chassis-level concern owned by the interceptor; feature layers stop duplicating the copy and stop needing to reason about it.

### Why is it valuable?
- **Fixes an end-to-end UX dead end.** Today, when the backend rejects a stored token, the user sees "Your session has expired. Please sign in again." as inline copy next to a still-mounted form, while the stale token sits in `localStorage`. There is no logout, no redirect, no recovery — every further authenticated request 401s and the product is unresponsive. The only way out is for the user to understand that they need to manually clear `localStorage` or open DevTools. This is a broken product experience for a first-class failure mode.
- **Closes a gap that #68 was supposed to close.** #68 AC5 / AC18 called for a genuinely rejected JWT to redirect to `/login` on the next authenticated action. In practice the interceptor only wired the "no token stored" branch ([`auth.interceptor.ts:49`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts#L49)) — if `localStorage.jwt_token` is present, the 401 propagates to the feature layer and the logout+redirect never fires. #86 is the corrective ticket.
- **Aligns the client with the documented backend 401 contract.** `.claude/backend_api_map.md` is explicit that 401 means "authentication broken" (JWT rejected OR malformed `NameIdentifier` claim) and that per-resource authorisation failures are always 403. The interceptor currently treats a 401-with-token as "per-resource permission failure", which directly contradicts the backend contract. #86 makes the client honest.
- **Eliminates a dead code branch and a class of future bugs.** After this fix, the 401 arm in `mapMemberErrorToUserMessage` (and its siblings in `tasks-api.service.ts`, `projects-api.service.ts`) is unreachable — the interceptor has already redirected before the feature layer sees the error. Leaving unreachable error copy in feature code is a bug factory; consolidating 401 handling at the interceptor is the right architectural move.
- **Hardens a security-sensitive boundary without adding complexity.** The fix removes a code path (the presence-check gate) rather than adding one. The surface area of the interceptor shrinks; the app's response to a rejected token becomes deterministic.

### What problem does it solve?
From the user's lived experience today:
1. User signs in successfully → JWT stored in `localStorage`, dashboard renders.
2. Backend re-deploys with a new signing key (or the token's `NameIdentifier` is malformed, or the token expires). The user's token is now server-side invalid, but the browser has no idea.
3. User clicks "Add member" (or any other authenticated action) → frontend sends the stored token → backend responds `401`.
4. The interceptor sees the 401, sees that `localStorage.jwt_token` is still present (`hasValidToken()` returns `true` because it's a mere presence check, not a signature check), and lets the error propagate unchanged.
5. The feature layer (`members-state.service.ts` → `mapMemberErrorToUserMessage`) renders `"Your session has expired. Please sign in again."` as inline copy inside the still-mounted dialog.
6. The token stays in `localStorage`. The user stays on `/dashboard` (or wherever they were). `AuthService.currentUser()` is still populated. `AuthStateService.isAuthenticated()` still returns `true`, so `authGuard` does not bounce them on navigation.
7. Every subsequent authenticated request — members list, project list, attachment upload, task create, board load — 401s. The app is unresponsive. The user has no in-product path to recovery.

The backend is doing its job correctly. The frontend is the only layer where the bug lives.

---

## Current State vs Desired State

### Current State (behaviour today on `main`)

- **The interceptor at [`auth.interceptor.ts:16-57`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts#L16-L57) gates the 401 logout path on `!hasValidToken()` (line 49).** `hasValidToken()` at [`auth.interceptor.ts:59-62`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts#L59-L62) is a presence check — it returns `true` whenever `localStorage.jwt_token` is a non-empty string. It does not decode the JWT, does not validate the signature, does not check `exp`, and does not inspect the claim set.
- **Consequence:** a 401 from a non-auth endpoint with a token present is propagated to the feature layer. The interceptor never calls `authService.logout()`, never clears `localStorage`, never navigates.
- **`AuthService.logout()` at [`AuthService.ts:25-29`](../../KanbAI-Web/src/app/core/services/AuthService.ts#L25-L29) does the right thing when invoked** — it removes `jwt_token` from `localStorage`, clears `currentUser`, and clears `AuthStateService` — but nothing in the 401 path invokes it today.
- **`AuthStateService` at [`auth-state.service.ts`](../../KanbAI-Web/src/app/core/services/auth-state.service.ts) is the source of truth for `authGuard`.** Because the interceptor does not clear the state on a rejected token, `isAuthenticated()` keeps returning `true` and `authGuard` ([`auth.guard.ts:25-27`](../../KanbAI-Web/src/app/core/guards/auth.guard.ts#L25-L27)) keeps granting access to protected routes. The user cannot "navigate their way out" of the zombie session.
- **Feature-layer 401 copy is scattered across at least four error mappers.**
  - `mapMemberErrorToUserMessage` at [`members-api.service.ts:110-112`](../../KanbAI-Web/src/app/features/projects/services/members-api.service.ts#L110-L112) returns `"Your session has expired. Please sign in again."` on 401.
  - `mapTaskMoveErrorToUserMessage` at [`tasks-api.service.ts:83`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L83) returns the same string.
  - `mapTaskCreateErrorToUserMessage` at [`tasks-api.service.ts:114`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L114) returns the same string.
  - `mapErrorToUserMessage` at [`projects-api.service.ts:127`](../../KanbAI-Web/src/app/features/projects/services/projects-api.service.ts#L127) returns the same string.
  - `mapMemberErrorToUserMessage` at [`members-api.service.ts:119`](../../KanbAI-Web/src/app/features/projects/services/members-api.service.ts#L119) also folds a `list`-operation 403 into the same 401 copy (a historical artefact).
  Every one of these branches renders to the user today because the interceptor never short-circuits the 401 path.
- **Specs that assert the current "pass through" behaviour exist and will need to be updated.** The interceptor spec at [`auth.interceptor.spec.ts`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts) today asserts the presence-check gate. Feature specs (`members-state.service.spec.ts:282`, `projects-api.service.spec.ts:125 / :130`, `tasks-api.service.spec.ts:146 / :301`, `members-api.service.spec.ts:188`) assert that feature mappers return the "session expired" copy on 401 — those mappers still run when a feature test feeds a raw 401 into them, but at runtime after this fix the interceptor will have already navigated away, so those mappers are dead code on the 401 path.
- **Auth endpoint carve-out is correct today and must be preserved.** [`auth.interceptor.ts:45-47`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts#L45-L47) exempts `/auth/login` and `/auth/register` from any logout behaviour so that credential-rejection 401s surface inline on the login/register forms. This exemption is correct under the new policy and must remain.
- **SignalR token handling is separate.** [`signalr.service.ts:91`](../../KanbAI-Web/src/app/core/services/signalr.service.ts#L91) uses `accessTokenFactory: () => this.authStateService.getToken() ?? ''` to attach the token on hub negotiation. Hub-auth failures do not flow through the HTTP interceptor; recovery behaviour on a rejected hub token is undocumented and is one of the open decisions #86 has to resolve (see AC9).
- **Reproduction from the issue body:** stop backend → rotate signing key → restart backend → user (still on `/dashboard`) clicks "Add member" → `POST /api/project/{id}/members` returns `401` → inline "session expired" copy renders in the dialog → token stays in `localStorage` → user stays on `/dashboard` → every subsequent request 401s.

### Desired State

- **Any 401 from a non-auth API endpoint triggers a global logout + redirect.** Concretely: within one frame of receiving a 401 response from a non-auth endpoint, the interceptor MUST (a) remove `jwt_token` from `localStorage`, (b) clear `AuthService.currentUser` and `AuthStateService` authentication state, and (c) navigate to `/login`. This happens **regardless** of whether `localStorage.jwt_token` is still present at the moment the 401 arrives, and **regardless** of the 401 response body.
- **The response body is not parsed to make the decision.** The status code `401` alone is sufficient. This explicitly covers the `.claude/backend_api_map.md:67` flavour (`ApiResponse.Fail("Invalid or missing user ID in token.")`) without any bespoke per-endpoint branching.
- **403 is not affected.** A 403 on any endpoint continues to propagate to the feature layer with whatever operation-specific copy the existing mappers produce. 403 never logs out and never redirects. This is the regression guard against #68 AC2 / AC4.
- **Auth endpoints stay carved out.** `401` from `POST /api/auth/login` or `POST /api/auth/register` propagates unchanged to the login/register forms so "bad credentials" renders inline. No logout, no redirect.
- **Feature-layer 401 copy becomes unreachable.** `"Your session has expired. Please sign in again."` is never shown to the user on a 401 path after this fix, because the app has already navigated to `/login` before the feature layer's error branch can render. The 401 arms in `mapMemberErrorToUserMessage`, `mapTaskMoveErrorToUserMessage`, `mapTaskCreateErrorToUserMessage`, and `mapErrorToUserMessage` MAY be removed, OR they MAY be kept as dead-code defence — a tech-spec decision. **Either way the user-facing outcome is identical.**
- **Post-logout navigation is defensive.** After the interceptor fires, manually re-navigating to any guarded route (`/dashboard`, `/projects/:id`, etc.) routes through `authGuard`, which now sees `isAuthenticated() === false` and bounces to `/login`. No guarded view can render with a cleared token.
- **SignalR hub rejection mirrors the HTTP path where feasible.** If the hub client exposes a token-rejection hook (negotiate failure, reconnect failure with auth-equivalent status), the same logout + redirect fires. If the current hub client does not expose such a hook, the limitation is called out explicitly in the tech spec as a known gap (tracked as AC9). This ticket does not require backend SignalR changes.
- **Implementation path (decide-how) is explicitly staff-engineer's call.** The ACs below specify observable outcomes only. Candidate approaches include: (a) remove the `!hasValidToken()` gate entirely so `401 && !isAuthEndpoint` always triggers logout+redirect; (b) change `hasValidToken()` to decode the JWT and check `exp`, so expired tokens are caught pre-flight AND a rejected token from the server still triggers the logout branch; (c) a hybrid. Any of these is acceptable if the ACs pass.
- **No backend changes.** The backend contract in `.claude/backend_api_map.md` is already self-consistent (400/403/404 for business failures, 401 reserved for JWT / claim problems). No backend ticket is required.

#### In-scope user flows

1. **Zombie session recovery — Add Member.** Owner signed in, backend signing-key rotated, owner submits "Add member" in the members dialog → `POST /api/project/{id}/members` → `401`. Within one frame: `localStorage.jwt_token` is removed, `AuthService.currentUser()` is `null`, `AuthStateService.isAuthenticated()` returns `false`, router is at `/login`. No inline "session expired" copy in the dialog.
2. **Zombie session recovery — Members list.** `GET /api/project/{id}/members` returns `401` → same outcome as Flow 1.
3. **Zombie session recovery — Remove member.** `DELETE /api/project/{id}/members/{userId}` returns `401` → same outcome as Flow 1.
4. **Zombie session recovery — any other endpoint.** `GET /api/project`, `POST /api/task/column/{columnId}`, `PUT /api/task/{taskId}/move`, `POST /api/attachment/task/{taskId}`, `GET /api/project/{id}` — any authenticated endpoint returning 401 triggers the same logout + redirect.
5. **Malformed claim 401.** A 401 whose body is `ApiResponse.Fail("Invalid or missing user ID in token.")` triggers the same logout + redirect. The body is not parsed; the status drives the decision.
6. **403 regression guard.** Owner tries to add a member without permission → `403` → inline "Only the project owner can add members." renders in the dialog → token stays in `localStorage` → user stays on `/dashboard`. No redirect.
7. **Auth-endpoint carve-out regression guard.** User submits `/auth/login` with a wrong password → `401` → inline "Invalid credentials" (or equivalent) renders on the login form → no redirect away from `/login` → no side-effects on any other auth state.
8. **Navigation guard after recovery.** After Flow 1–5 fires, the user manually types `/dashboard` in the URL bar → `authGuard` returns a `UrlTree` redirect to `/login`. Guarded routes never render.

#### Out of scope for this ticket

- **Silent token refresh / refresh-token flow.** Real refresh-token support is a separate feature; it is explicitly non-goal (issue body "Non-goals").
- **Changing the user-visible copy on the login page** after a forced logout. The existing `/login` page is what the user lands on; showing a "your session was ended" banner is a follow-up if desired.
- **Changing any members-dialog UX.** The dialog does not need to render copy on 401 post-fix because the app has already navigated away. Any cosmetic updates to the dialog are orthogonal.
- **Backend changes.** The backend 401 contract is already correct; no server-side work is required.
- **SignalR hub reconnect policy beyond mirroring the HTTP logout on hub-token rejection.** Deeper SignalR resilience (exponential back-off, user-facing reconnect toasts, etc.) is orthogonal.
- **Decoding the JWT proactively to warn before expiry.** A pre-emptive "your session will expire in N minutes" banner is out of scope; the decision is reactive (on 401) only.
- **Cross-tab synchronisation.** If the user has KanbAI open in two tabs and one tab forces logout, the second tab will not automatically follow until it makes its next authenticated request. Multi-tab coordination (e.g. via `storage` events) is a follow-up.

---

## Milestone Context

**Milestone:** unassigned on the GitHub issue. This ticket is a corrective follow-up to the auth-hardening work delivered in #68 / #74, fixing a gap between the ACs that #68 specified and the behaviour that actually shipped.

### Prerequisite Issues

- **#68** — Members-dialog error handling / interceptor 401 policy (merged, on `main`). Established the auth-endpoint carve-out at [`auth.interceptor.ts:45-47`](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts#L45-L47) and the per-operation mapper copy at [`members-api.service.ts:98-125`](../../KanbAI-Web/src/app/features/projects/services/members-api.service.ts#L98-L125). #68 ACs 5 / 18 specified the logout-on-rejected-JWT behaviour that this ticket actually wires.
- **#74** — (see issue body) — the zombie-session symptom was first observed post-#74, implying #74 landed behaviour that exposed the latent gap. The fix here does not depend on reverting #74; it augments the interceptor so the gap closes.
- **The documented backend 401 contract** at `.claude/backend_api_map.md` (relevant lines: 64, 67, and the Tasks / Members controllers above). This is the source of truth for which status codes mean what; #86 is the client-side implementation of that contract.

### Backend Prerequisite

**None.** The backend contract in `.claude/backend_api_map.md` is already self-consistent — 400/403/404 cover business failures and 401 is reserved for JWT / claim problems. No backend ticket is required and no backend change is requested. The fix is purely on the frontend interceptor and its tests.

### Downstream Issues

- **Every future authenticated feature.** After this fix, new features do not need to define their own "session expired" copy or reason about 401. The interceptor handles it. This simplifies the cost of adding new authenticated endpoints.
- **Potential follow-up: cross-tab logout sync** (out of scope here, but a natural companion if multi-tab usage becomes a priority).
- **Potential follow-up: "your session ended" banner on the login page** after a forced logout, so the user understands why they landed there.
- **Potential follow-up: refresh-token support** when the backend ships a refresh endpoint. That work supersedes this ticket's reactive-only stance; until then, this ticket is the floor.

### Related Work / Open Assumptions

- **Scope is frontend-only.** Interceptor logic, interceptor spec, and optionally the feature-layer 401 mapper branches. No backend, no design-system, no npm dependency changes.
- **`.claude/backend_api_map.md` is authoritative for 401 vs 403 semantics.** If the backend ever changes that contract (e.g. introduces a 401-that-means-per-resource), this ticket's behaviour becomes wrong. Tracking the contract on the frontend side is a shared concern, not a #86 concern.
- **The existing auth-endpoint carve-out is correct** and must survive the refactor. Regression coverage for `/auth/login` and `/auth/register` 401s is a hard AC, not a nice-to-have.
- **SignalR hub auth-rejection is best-effort.** If the hub client does not expose a rejection hook today, the tech spec documents that and the HTTP path proceeds. This is acknowledged in the ACs so it doesn't block the ticket.
- **The PR description is expected to carry manual reproduction evidence** for both 401 flavours (rotated signing key + malformed `NameIdentifier`) — this is a documentation AC (AC14), not an implementation AC, but it is mandatory for merge.

---

## Acceptance Criteria

> Every criterion below is observable, specific to #86, and testable by a human QA pass or a unit/component test. Where the source issue already specifies precise wording, that wording is preserved; where the source issue is an implementation hint, the criterion is rephrased to specify the observable outcome only.

### Reproduction and evidence

- [ ] **AC0 (pre-work reproduction).** Reproduce the zombie-session symptom against the current `main` branch with a DevTools Network capture. Record (a) HTTP status, (b) response body, (c) whether `localStorage.jwt_token` is present when the response arrives. The capture is attached to the PR description. (QA-testable: reviewer verifies the PR has the attached capture.)

### HTTP interceptor 401 behaviour (primary acceptance)

- [ ] **AC1 — Add Member 401.** Owner signed in, submits the Members-dialog "Add member" action; backend returns `401` (either the rotated-key flavour or the malformed-claim flavour). Within one frame of the response: `localStorage.getItem('jwt_token')` returns `null`, `AuthService.currentUser()` returns `null`, `AuthStateService.isAuthenticated()` returns `false`, and the active route is `/login`. (QA-testable in a browser; unit-testable via the interceptor spec.)
- [ ] **AC2 — List Members 401.** Same outcome as AC1 when `GET /api/project/{projectId}/members` returns `401`.
- [ ] **AC3 — Remove Member 401.** Same outcome as AC1 when `DELETE /api/project/{projectId}/members/{userId}` returns `401`.
- [ ] **AC4 — Any authenticated endpoint 401.** Same outcome as AC1 when ANY other authenticated endpoint returns `401`. Specifically covered endpoints for QA: `GET /api/project`, `GET /api/project/{id}`, `POST /api/task/column/{columnId}`, `PUT /api/task/{taskId}/move`, `POST /api/attachment/task/{taskId}`, `DELETE /api/attachment/{attachmentId}`. (Regression QA: force each endpoint to 401 via a stubbed backend or mitmproxy and confirm the redirect.)
- [ ] **AC5 — Malformed-claim 401 (`.claude/backend_api_map.md:67`).** A 401 whose body is `ApiResponse.Fail("Invalid or missing user ID in token.")` triggers the same logout + redirect as AC1–AC4. The body is not parsed; the status code alone drives the decision. (Unit-testable: the interceptor test flushes a 401 with that body and asserts logout + navigation.)

### Regression guards (behaviours that MUST NOT change)

- [ ] **AC6 — 403 never logs out.** A `403` from any authenticated endpoint does NOT clear `localStorage.jwt_token`, does NOT clear `AuthService.currentUser`, does NOT navigate. The per-feature mapper copy (e.g. "Only the project owner can add members.") renders inline as it does today. (QA-testable: stub 403 on "Add member", confirm dialog shows the 403 copy and user stays on `/dashboard`.)
- [ ] **AC7 — Auth-endpoint carve-out preserved.** `401` from `POST /api/auth/login` and `POST /api/auth/register` does NOT log out and does NOT redirect. The login/register form surfaces its inline credential-error copy as today. (QA-testable: submit the login form with a wrong password, confirm the user stays on `/login` with an inline error, no redirect, no `localStorage` mutation beyond what the form itself does.)
- [ ] **AC8 — "Session expired" inline copy is never shown on a 401 path.** After this fix, a 401 from any non-auth endpoint is consumed by the interceptor before the feature layer renders. The string `"Your session has expired. Please sign in again."` does not appear in any dialog, banner, or error region triggered by a 401. (The string may remain as dead-code defence in the mappers at the tech-spec's discretion — that's fine, but it must not render.) (QA-testable: across all Flow 1–5 reproductions, confirm the inline copy never flashes on-screen.)

### Hub and guard coverage

- [ ] **AC9 — SignalR hub token rejection (best-effort).** If the hub client at [`signalr.service.ts:91`](../../KanbAI-Web/src/app/core/services/signalr.service.ts#L91) exposes an auth-rejection hook (negotiate failure, reconnect failure with auth-equivalent status), a hub-token rejection triggers the same logout + redirect as AC1. If the current hub client does NOT expose such a hook, the tech spec MUST document this limitation explicitly. (QA-testable where the hook exists; documentation-testable where it doesn't.)
- [ ] **AC10 — Guard bounces re-navigation.** After AC1/AC2/AC3/AC4/AC5 fires, manually re-navigating to `/dashboard` (or any other guarded route) results in `authGuard` returning a redirect to `/login`. No guarded view renders with a cleared auth state. (QA-testable: after a forced logout, type `/dashboard` in the URL bar, confirm the redirect.)

### Test coverage

- [ ] **AC11 — Interceptor spec updated in place.** Existing `auth.interceptor.spec.ts` tests that previously asserted "401 with token present → pass through" are updated to assert "401 with token present → logout + redirect". The auth-endpoint carve-out suite is unchanged. (Regression guard: reverting the interceptor change causes the updated tests to fail.)
- [ ] **AC12 — New unit tests for the two 401 flavours.** A new test asserts that a 401 from `POST /api/project/{id}/members` with a stored token results in `localStorage.removeItem('jwt_token')` and navigation to `/login`. A second new test asserts that a 401 whose body is `ApiResponse.Fail("Invalid or missing user ID in token.")` produces the same outcome. (QA-testable as part of the spec suite.)
- [ ] **AC13 — No INTRODUCED test failures.** `npm run test -- --watch=false` reports zero INTRODUCED failures versus `main` (classification per [`CLAUDE.md`](../../CLAUDE.md)). `npm run build` exits `0` with no new errors or warnings.

### Documentation and merge hygiene

- [ ] **AC14 — PR description carries manual reproduction evidence for both 401 flavours.** The PR body includes step-by-step reproduction instructions for (a) stopping the backend, restarting with a new signing key, and submitting an invite (signing-key-rotation flavour); and (b) hand-crafting a JWT with no `NameIdentifier` claim and submitting an invite (malformed-claim flavour). Each flavour includes the observed pre-fix behaviour and the observed post-fix behaviour. (Documentation-testable: reviewer confirms the PR body includes both reproductions.)

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
