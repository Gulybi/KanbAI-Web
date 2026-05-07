# Feature: Fix Unexpected Logout When Inviting Member by Email

**GitHub Issue:** [#68](https://github.com/Gulybi/KanbAI-Web/issues/68)
**Milestone:** None (tracked as a `bug` label)
**Branch:** _(to be created; default naming `68-fix-unexpected-logout-when-inviting-member-by-email`)_

## Business Value

### Who is this for?
- **Project owners** (the only role authorised to invite members today — see [#33](https://github.com/Gulybi/KanbAI-Web/issues/33)) who open the Members dialog from the project dashboard and attempt to invite a teammate by email. These users currently lose their session and their place in the app every time the invite backend returns a non-2xx that the global interceptor misreads as "session expired".
- **Teammates waiting to be added** — every time the owner is bounced back to `/login`, the invite does not complete; the workflow silently drops.
- **The support-facing side of the team** (product owner, evaluators) — this is a stop-the-line bug on the first collaboration feature we advertise. A "being logged out for clicking Invite" experience undermines confidence in the product independent of the actual backend behaviour.
- **The engineering team**, which has invested in a granular error-mapping layer in `members-api.service.ts` (`mapMemberErrorToUserMessage`) that renders appropriate copy for owner-only / user-not-found / already-member 4xx responses. That copy never reaches the user today because the interceptor fires first and unmounts the dialog.

### Why is it valuable?
Inviting a member is the very first multi-user interaction in KanbAI. If that interaction ejects the inviter from the app, every downstream collaboration feature (realtime updates #45/#46, shared boards, attachments #48–#52) is delivered on top of a user experience the user has already lost trust in.

Fixing this is valuable because:
- **Restores the owner's ability to complete a member-invite round-trip** without being punted to `/login`. Today the flow is broken regardless of whether the invite itself succeeds.
- **Honours the existing error-copy contract.** The members feature already produces user-readable strings for every documented 4xx (see `mapMemberErrorToUserMessage` at `KanbAI-Web/src/app/features/projects/services/members-api.service.ts`). The interceptor's premature logout pre-empts that copy entirely. After this fix, the owner should see the right inline sentence ("We couldn't find a user with that email.", "Only the project owner can add members.", etc.) and stay in the dialog.
- **Prevents the same symptom from recurring across the roadmap.** Every authenticated mutation — creating a task, uploading an attachment, posting a comment — can legitimately return a 401 or 403 for a reason other than "your session is gone" (permission revoked mid-session, resource you can't touch, server-side authorisation check). The interceptor's current "any 401 on a non-auth endpoint → logout" rule will keep producing spurious logouts as we add features. Tightening this rule now pays compounding dividends.
- **Aligns with the existing auth-endpoint carve-out.** The interceptor already acknowledges that 401 does not uniformly mean "session expired" — it exempts `/auth/login` and `/auth/register`. This issue extends the same principle: a 401 or 403 from a feature endpoint should not, on its own, constitute a session-expiry signal.

### What problem does it solve?
**Problem:** When the project owner submits the "Add member" form in the Members dialog with an email that the backend cannot resolve (or the backend returns permission-related failure), the backend responds with 401 Unauthorized or 403 Forbidden. The global HTTP auth interceptor at `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` intercepts the 401, calls `AuthService.logout()`, clears the JWT, and routes the browser to `/login`. The dialog is unmounted, the user's session appears to end mid-action, and no inline error copy is ever shown. The owner is left staring at the login screen with no explanation.

**Root cause (verified in the codebase):**
- `auth.interceptor.ts` lines 33–51: the interceptor logs out on **any** response whose `error.status === 401`, with the only carve-out being requests to `/auth/login` or `/auth/register`. Requests to `POST /project/{id}/members` — the invite endpoint — are therefore treated as session-expiry 401s.
- The members-API layer (`members-api.service.ts` lines 110–120) has correct human-readable copy for 401 ("Your session has expired. Please sign in again.") and 403 ("Only the project owner can add members."), but the interceptor's redirect fires before that copy can be surfaced to the dialog.
- The dialog component (`members-dialog.component.ts` lines 144–172) has dedicated error handling for the invite flow that sets `addError` / `roleRevoked` / `liveMessage`. None of that code runs when the interceptor has already redirected to `/login`.
- The interceptor does not distinguish between "the JWT is missing/expired/tampered" (a real session-expiry case) and "the JWT is valid but the server returned 401 for a resource-specific authorisation reason". Both are treated as logout-and-redirect.

**Solution (framed as WHAT, not HOW — the staff-engineer decides the mechanism):** When the user is actively authenticated and performs an action whose backend returns 401 or 403 for a reason that is not session expiry, the user must remain logged in and remain in the current screen. The failing action must surface a user-readable inline error (the copy already defined in `mapMemberErrorToUserMessage`). A genuine session-expiry 401 — i.e., one where the stored JWT is actually invalid / expired / absent — must still redirect to `/login` as it does today. The developer's definition of "fixed" is: as the project owner, submitting the Members-dialog "Add member" form with an unknown email, a non-owner role, or any other 4xx-producing input shows the correct inline sentence and leaves the dialog open. The owner is not redirected, their JWT is not cleared, and they can immediately retry with a different email.

---

## Current State vs Desired State

### Current State

**Components and services involved (no behavioural claim, just the call graph):**
- Members dialog: `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.ts`
- Add-member form: `KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts`
- Members state service: `KanbAI-Web/src/app/features/projects/state/members-state.service.ts`
- Members API service: `KanbAI-Web/src/app/features/projects/services/members-api.service.ts`
- Global interceptor: `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts`
- Auth state: `KanbAI-Web/src/app/core/services/AuthService.ts`

**Observed behaviour (reproduction steps):**
1. Owner logs in to KanbAI, navigates to `/dashboard`, opens a project they own, and opens the Members dialog.
2. Owner types an email into the "Add member" input and submits (Enter or the submit button).
3. `AddMemberFormComponent.onSubmit` emits the email; `MembersDialogComponent.onAddSubmit` calls `MembersStateService.addMemberByEmail`; that service calls `MembersApiService.addMemberByEmail`, which issues `POST {environment.apiUrl}/project/{projectId}/members` with body `{ email }`.
4. The backend returns 401 Unauthorized (or 403 Forbidden — both produce the logout in the 401 case; 403 currently does not trigger logout but still surfaces as generic copy per AC-11 below).
5. The auth interceptor's `catchError` branch matches `error.status === 401` and the URL is not `/auth/login` or `/auth/register`, so it calls `AuthService.logout()` and `router.navigate(['/login'])`.
6. The Members dialog is destroyed mid-subscription; `addError` is never shown; the owner finds themselves on the login page with a cleared `jwt_token` in localStorage.
7. The owner has no on-screen indication that the invite failed, let alone why. They must log back in and try again — where the same outcome will occur for the same input.

**Why this is the root-cause surface:**
- `auth.interceptor.ts` at lines 39–46 performs a URL-prefix carve-out for `/auth/login` and `/auth/register` only; no other endpoint is exempt.
- The interceptor does not inspect whether the stored `jwt_token` is in fact expired/invalid before deciding the 401 means "session expired". It treats the server's 401 as definitive.
- The members-API layer would otherwise translate a 401 into the string `"Your session has expired. Please sign in again."` (line 111) and the dialog would render that inline — but by the time the error branch runs, the interceptor has already triggered navigation.

### Desired State

**Expected behaviour after the fix:**

1. **Valid session, server rejects the member-invite action for any reason (401 or 403):** the user stays on the Members dialog, the dialog remains open, the `addError` signal is populated with the appropriate copy from `mapMemberErrorToUserMessage`, the form re-enables, and the user can edit the email and resubmit. The `jwt_token` in localStorage is **not** cleared, and no route change happens.
2. **Valid session, server rejects a list/remove action with 403:** the dialog applies its existing role-revocation handling (`roleRevoked` signal) and hides owner-only controls; the user is not redirected and is not logged out.
3. **Genuinely expired/invalid session** (the "real" session-expiry case — e.g., the JWT in localStorage is absent, expired, or the server has explicitly signalled session invalidation): the existing behaviour is preserved — the user is logged out and redirected to `/login`. The app must not silently tolerate a truly dead session just because we also want to tolerate per-resource 401/403s.
4. **Any future feature endpoint that returns 401 or 403 for a permission reason** exhibits the same behaviour as (1) — the user stays on the page, a feature-local error is surfaced, and no global logout is triggered.

**Expected user flow (manual verification happy path and error paths):**

- *Happy path:* owner types a valid teammate email → 2xx from backend → new member row appears in the list → focus returns to the email input (existing behaviour, unchanged by this fix).
- *Unknown email:* owner types an email for a non-existent account → 400 from backend → inline error "We couldn't find a user with that email." is shown; dialog stays open; owner stays logged in. (Already works today — included as a regression guard.)
- *Already-a-member:* 400 "User is already a member of this project." → existing inline copy is shown; dialog stays open; owner stays logged in. (Already works today — regression guard.)
- *Non-owner attempting to add* (e.g. role was revoked while the dialog was open): backend returns 403 → dialog surfaces "Only the project owner can add members.", `roleRevoked` flips, owner-only controls collapse; user stays logged in. (Already works today but must remain correct after the interceptor change.)
- *Backend returns 401 while the user is still validly authenticated* (the bug this issue fixes): dialog surfaces "Your session has expired. Please sign in again." as an inline error (or an equivalent "Something went wrong — please try again." copy; see AC5 below for the exact contract); dialog stays open; user is **not** redirected and the JWT is **not** cleared.
- *Genuinely expired JWT:* a subsequent authenticated action (e.g. page refresh, dashboard refresh) still redirects to `/login`. The application never gets stuck in a "logged in but all requests 401" zombie state — see AC6.

**Non-goals (explicitly out of scope for #68):**
- Changing the copy strings in `mapMemberErrorToUserMessage`. The existing strings are treated as the source of truth for inline messages; the fix is about making sure they actually reach the user. If the staff-engineer chooses to adjust the 401-copy string as part of the fix, they must justify it; the default is no change.
- Redesigning the auth interceptor's retry/refresh-token strategy. KanbAI currently does not implement silent token refresh. If that were added later, it would be a separate issue.
- Changing backend response codes. The frontend must handle whatever the backend currently returns (401 or 403 on invite failures). Backend changes are out of scope.
- Fixing issue [#59](https://github.com/Gulybi/KanbAI-Web/issues/59) (environment API URL). That is a separate bug; local reproduction of #68 currently requires #59 to be fixed or a working staging backend. This issue does not re-fix #59.

---

## Milestone Context

**Milestone:** None assigned. This is a `bug` label issue.

### Prerequisite Issues
- [#33](https://github.com/Gulybi/KanbAI-Web/issues/33) — Project Members Management UI — **CLOSED**. Shipped the Members dialog, `MembersStateService`, and `mapMemberErrorToUserMessage`. The mis-firing logout only became visible once this feature landed.
- [#9](https://github.com/Gulybi/KanbAI-Web/issues/9) — Environment & API Constants — **CLOSED**. Provides the `environment.apiUrl` constant the interceptor uses for URL matching. Relevant because the fix's URL/endpoint logic must continue to gate on `environment.apiUrl`.
- [#6 / #7 (auth flow)](https://github.com/Gulybi/KanbAI-Web/issues/7) — **CLOSED**. Shipped `AuthService.logout()` and the JWT storage layer the interceptor currently invokes on 401.

### Downstream Issues
- **Every currently open issue that adds an authenticated mutation** benefits from this fix landing first, because each of those features will otherwise inherit the same "401 → punt to /login" misbehaviour:
  - [#47](https://github.com/Gulybi/KanbAI-Web/issues/47) — Visual drag-and-drop — **OPEN** (persists board changes via API).
  - [#48](https://github.com/Gulybi/KanbAI-Web/issues/48) – [#52](https://github.com/Gulybi/KanbAI-Web/issues/52) — File upload / attachment work — **OPEN** (every attachment POST goes through the interceptor).
  - [#45](https://github.com/Gulybi/KanbAI-Web/issues/45) / [#46](https://github.com/Gulybi/KanbAI-Web/issues/46) — SignalR real-time — **OPEN**. SignalR negotiation itself can return 401; a premature logout there would also be incorrect.
- No downstream issue is formally "blocked by" #68 in the tracker, but any future 401/403-producing feature will re-exhibit the same symptom until this is fixed.

### Related Work
- [#59](https://github.com/Gulybi/KanbAI-Web/issues/59) — Environment API URL Configuration — **OPEN**. Related because local reproduction requires a working backend URL. Not a prerequisite; the fix for #68 is orthogonal and can be verified against any working backend (local or staging).
- [#33](https://github.com/Gulybi/KanbAI-Web/issues/33) — the feature whose UI surfaces this bug most visibly today. Whatever the staff-engineer does to the interceptor must not regress the members-dialog error-copy contract established in #33.

---

## Acceptance Criteria

Each criterion below is observable in the running application, in the repository code, or through an automated test, and is testable by a human reviewer or a unit/integration test. None of them prescribes implementation details.

### Core bug fix — session is preserved on feature-endpoint 401/403

- [ ] **AC1 — Session preserved on invite 401.** When the user is logged in as a project owner, opens the Members dialog for a project they own, submits the "Add member" form with any email, and the backend responds with HTTP 401, the user remains on the dashboard route, the Members dialog remains open, the `jwt_token` entry in `localStorage` is unchanged, and the application does not navigate to `/login`.
- [ ] **AC2 — Session preserved on invite 403.** Same as AC1 but for an HTTP 403 response: the dialog's existing owner-only-error handling runs (`roleRevoked` flips, copy is surfaced), and the user is not redirected or logged out.
- [ ] **AC3 — Inline error is surfaced for invite failures.** For each of HTTP 400 (user-not-found / already-a-member / last-owner / generic), HTTP 401, HTTP 403, and HTTP 500 responses to `POST /project/{id}/members`, the exact user-readable copy produced by `mapMemberErrorToUserMessage(error, 'add')` is rendered inside the Members dialog (via the add-form error region) within one animation frame of the response arriving. The dialog does not unmount and focus remains within it.
- [ ] **AC4 — List- and remove-path behaviour unchanged on 401/403.** When a `GET /project/{id}/members` or `DELETE /project/{id}/members/{userId}` returns 401 or 403, the user is not logged out and not redirected; the list-scope error banner or the remove-scope error is surfaced per the existing contract in `members-dialog.component.ts`.

### Genuine session-expiry must still redirect

- [ ] **AC5 — Missing/invalid JWT still redirects.** If the user's `jwt_token` is absent, expired, or tampered (i.e. any state in which the app should no longer be considered authenticated), the first authenticated request on entering the app (e.g. the dashboard's `GET /project` or `AuthService`'s session bootstrap) redirects the user to `/login` and clears any stale session artefacts. The app never enters a persistent "every request is 401 but the user is still looking at a dashboard" state.
- [ ] **AC6 — Explicit logout still works.** Clicking "Logout" (wherever the UI currently exposes it) continues to clear the JWT and navigate to `/login`. (Regression guard — this is already the existing behaviour of `AuthService.logout`.)
- [ ] **AC7 — Auth-endpoint carve-out preserved.** The existing carve-outs for `POST /auth/login` and `POST /auth/register` still apply: a 401 from those endpoints does not call `AuthService.logout()` and does not navigate to `/login`, so invalid-credentials copy continues to render inline on the login/register forms. (Regression guard — covered by the existing `auth.interceptor.spec.ts` "Auth-endpoint 401 exemption" suite.)

### Observable user experience

- [ ] **AC8 — Owner can retry after a failed invite.** Immediately after any failed invite (any 4xx or 5xx response), the add-member form is re-enabled, the email input retains focus (or focus is moved to it), the previously submitted value is preserved so the owner can edit it, and a subsequent submission re-attempts the invite. The owner does not need to reopen the dialog, re-navigate, or log back in.
- [ ] **AC9 — Live region announces failures.** For each of the failure branches in AC3, the polite live region (`liveMessage` signal) is updated with the same copy surfaced in the inline error, so assistive-technology users are notified.
- [ ] **AC10 — No console errors or warnings from this flow.** Reproducing the invite-error paths from AC1–AC3 produces zero unhandled promise rejections, zero uncaught errors, and no `NG0`-series Angular warnings in the browser console.

### Regression guards

- [ ] **AC11 — Existing members-dialog tests still pass.** `members-dialog.component.spec.ts`, `members-list.component.spec.ts`, `member-row.component.spec.ts`, `add-member-form.component.spec.ts`, and `members-state.service.spec.ts` continue to pass. Any test that was asserting "on 401 the user is redirected" is updated in place — not deleted — to assert the new contract (user stays, inline copy is surfaced).
- [ ] **AC12 — Existing interceptor tests still pass.** `auth.interceptor.spec.ts` continues to pass. The auth-endpoint carve-out suite, the HTTP-verb/preservation tests, and the non-API URL passthroughs all remain green. Tests that previously asserted the "401 on any non-auth endpoint causes logout + redirect" contract are updated to assert the new, narrower contract.
- [ ] **AC13 — Fix is covered by new automated verification.** At least one new automated test proves the fix. Acceptable forms: (a) a unit test against the interceptor showing that a 401 from `POST /project/{id}/members` does not call `AuthService.logout` and does not navigate; (b) an integration test of `MembersDialogComponent` that flushes a 401 on the invite call and asserts the dialog remains open with the correct inline copy; (c) an equivalent mechanism proposed by the staff-engineer.
- [ ] **AC14 — Full test suite stays green.** `npm run test -- --watch=false` reports zero INTRODUCED failures relative to `main`. Pre-existing failures unrelated to this issue are enumerated in the handoff but do not block merge.
- [ ] **AC15 — Build succeeds.** `npm run build` in `KanbAI-Web/KanbAI-Web/` completes with exit code 0.

### Edge cases

- [ ] **AC16 — Concurrent in-flight requests behave correctly.** If the user triggers the invite AND another authenticated request is in flight, a 401 on either request does not cause the other request's UI to be unmounted. (E.g. the members-list load racing the add-member submit: an error on one does not silently collapse the other's pending state.)
- [ ] **AC17 — Dialog-close mid-request is unchanged.** If the user closes the Members dialog while an invite is in-flight and the response (4xx or 5xx) arrives after close, no route change happens and no unhandled error propagates to the console. (The dialog currently runs the subscription in the root injector for exactly this reason — this behaviour must be preserved.)
- [ ] **AC18 — 401-after-true-expiry path is reachable.** It must still be possible to reach the "redirect to /login" outcome for a genuinely expired JWT. A reviewer can manually force this state (e.g. by deleting `jwt_token` in DevTools, then triggering an authenticated action) and observe the existing logout + redirect behaviour.

---

*Prepared by the product-manager agent as input for the staff-engineer phase.*
