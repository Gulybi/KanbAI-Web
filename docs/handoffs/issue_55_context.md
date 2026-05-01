# Feature: Restore Login UI and Fix Authentication Flow

**GitHub Issue:** [#55](https://github.com/Gulybi/KanbAI-Web/issues/55)
**Milestone:** None (regression / bug-fix ticket outside the numbered milestones)
**Repository:** Gulybi/KanbAI-Web
**Branch:** `55-restore-login-ui-and-fix-authentication-flow`

---

## Business Value

### Who is this for?
- **End users** who want to sign into KanbAI. Today they are blocked at the front door: the `/login` route shows a placeholder instead of a real form, so no one can actually authenticate through the UI.
- **End users who manage to authenticate** (e.g., via the Registration page) but then cannot perform any authenticated action, because every API call comes back as `401 Unauthorized`.
- **Authenticated users who want to end their session** and currently cannot reach the anonymous area after Logout because the redirect does not complete cleanly.
- **The product/business**, which has a non-functional product entry point until this is fixed. All downstream work (dashboard, project creation, member management, file uploads, Kanban board) is unreachable for new users.

### Why is it valuable?
- Restores the primary entry point of the application. Without a working Login UI and a working authentication round-trip, every feature shipped in Milestones 3, 4, 5, and 6 is inaccessible to anyone who does not already have a valid token in their browser.
- Re-establishes user trust in the sign-in flow. A "Will be implemented later" placeholder on the production-facing Login page is a severe regression visible to anyone who opens `/login`.
- Unblocks manual QA, demos, and acceptance testing of every feature behind `authGuard`.
- Closes the loop started by Milestone 3 (JWT Authentication UI): the `AuthService`, JWT interceptor, `authGuard`, `unauthGuard`, and navbar user-state were all shipped, but the Login form that drives them has been accidentally removed and the 401 + logout-redirect bugs leave the loop broken.

### What problem does it solve?
**Problem:** A previous AI-assisted change overwrote the working Login page (delivered in issue #24) with a `<h1>Login Page</h1>` + "Authentication UI will be implemented here" placeholder (`src/app/features/auth/login-page/login-page.component.html`). In parallel, two runtime defects have been introduced or surfaced:
1. **401 Unauthorized on login attempts** — authentication requests are rejected, likely due to a payload mismatch between the frontend `LoginRequestDto`/`RegisterRequestDto` and the backend contract, or due to interceptor misconfiguration that mangles the login request itself.
2. **Logout does not redirect correctly** — after `AuthService.logout()` runs, the user is not reliably landed on the anonymous area (`/login`); the session clears but the UI does not complete the expected redirect.

**Solution:** Restore the reactive Login form UI (matching the existing Register page pattern, which is intact at `src/app/features/auth/register-page/`), reconnect it to `AuthService.login()`, diagnose and fix the 401 root cause, and correct the logout redirect so that the full sign-in / sign-out round-trip works from URL entry to redirected destination.

---

## Current State vs Desired State

### Current State
- **Login page is a placeholder:** `KanbAI-Web/src/app/features/auth/login-page/login-page.component.html` renders only:
  ```html
  <div class="login-page__card">
    <h1>Login Page</h1>
    <p>Authentication UI will be implemented here.</p>
  </div>
  ```
  The component class (`login-page.component.ts`) still reads the `returnUrl` query param and renders the context banner, but has **no form, no submit handler, no call to `AuthService.login()`**. The context banner child component (`components/context-banner/`) is intact and functional.
- **Register page is intact and is the reference pattern:** `KanbAI-Web/src/app/features/auth/register-page/register-page.component.ts` uses Reactive Forms, the shared `FormCardComponent`, `FormInputComponent`, `FormButtonComponent` (under `src/app/features/auth/components/`), calls `AuthService.register()`, and navigates on success. The Login page should mirror this structure (email + password, submit, error display, link to `/register`) but has not been restored.
- **Auth service expects `{ email, password }`:** `KanbAI-Web/src/app/core/services/AuthService.ts` exposes `login(credentials: LoginRequestDto)` where `LoginRequestDto` is `{ email: string; password?: string }` (see `src/app/core/models/auth.models.ts`). On success it writes `localStorage.jwt_token` and sets `currentUser`. It does **not** call `AuthStateService.setAuthState()`, so the `isAuthenticated` signal consumed by `authGuard` / `unauthGuard` (`src/app/core/services/auth-state.service.ts`) never flips to `true`. This is a strong candidate root cause for the observed "can't reach authenticated pages after login" behavior and is related to, or compounds, the reported 401 symptom.
- **JWT interceptor is wired:** `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` attaches `Authorization: Bearer <token>` to requests where `req.url.startsWith(environment.apiUrl)` and, on 401, calls `authService.logout()` and `router.navigate(['/login'])`. The interceptor's URL match depends on `environment.apiUrl`, while `AuthService` hard-codes `http://localhost:5257/api/auth` — if these two base URLs disagree, the login POST either does not receive the header (irrelevant for login itself) or the 401 response from the login endpoint re-triggers logout and routing, masking the real error.
- **Auth guards rely on `AuthStateService`, not `AuthService.currentUser`:** `authGuard` and `unauthGuard` (`src/app/core/guards/auth.guard.ts`, `unauth.guard.ts`) read `AuthStateService.isAuthenticated()`. Nothing in the current login path populates that service, so even if `AuthService.login()` succeeded end-to-end today, `authGuard` would still block the user from `/dashboard`.
- **Logout redirect path:** The navbar's `onLogout()` (`src/app/core/layout/navbar/navbar.component.ts`) calls `authService.logout()` then `router.navigateByUrl(LOGIN_ROUTE)`. Because `AuthService.logout()` only resets `currentUser` and removes the token — and does **not** clear `AuthStateService` — `unauthGuard` on `/login` may still see `isAuthenticated === false` (because it was never set to `true`) or, in a successful-login-then-logout scenario, may see it as `true` and bounce the user back to `AUTH_HOME_ROUTE`, producing the reported "logout does not redirect properly" behavior.
- **Observable symptoms (from the GitHub issue):**
  1. `/login` shows the placeholder text.
  2. Any attempt to sign in produces a `401 Unauthorized` in the network panel.
  3. Clicking Logout does not land the user on the anonymous login page as expected.

### Desired State
- **Working Login UI at `/login`:**
  - The page renders a form with exactly two visible inputs (Email, Password), a submit button, an error-message area, and a link to `/register`.
  - The form submits credentials via `AuthService.login()` and, on success, the browser URL transitions to the authenticated home (`AUTH_HOME_ROUTE` from `src/app/core/constants/auth-routes.ts`, currently `/dashboard`) — or, if a safe `returnUrl` was provided, to that URL.
  - The existing `LoginContextBannerComponent` continues to render when a safe `returnUrl` is present (this behavior is already implemented and must survive the restoration).
- **Working authentication round-trip:**
  - Submitting valid credentials receives a `2xx` response from the backend login endpoint, stores the JWT, sets the authenticated user, and the next navigation to a protected route (`/dashboard`) is allowed by `authGuard`.
  - Submitting invalid credentials receives a `401` and the form displays a visible error message to the user (instead of silently failing or triggering a global logout/redirect loop).
  - No `401 Unauthorized` is returned for a request that carries correct credentials matching a registered account.
- **Correct logout redirect:**
  - Clicking Logout in the navbar clears the session (token removed from `localStorage`, `currentUser` set to `null`, and any other auth-state surface kept consistent) and the browser URL lands on `/login`.
  - The Logout redirect completes without any intermediate flash of a protected route and without a redirect loop.
  - After logout, typing `/dashboard` (or any other protected route) redirects the user back to `/login` per `authGuard`.

### Expected User Flows

**Flow A — Registered user signs in from a cold session:**
1. User opens `/login`.
2. The page displays a form with Email and Password fields, a Submit button labeled for login, and a link to `/register`.
3. User enters valid credentials registered against the backend and submits.
4. The form disables while the request is in flight.
5. On a successful response, the browser URL becomes `/dashboard` (or the safe `returnUrl` if one was present).
6. The navbar renders the authenticated user's name and the Logout button (existing behavior from issue #28).

**Flow B — Deep-link redirect preserved:**
1. Unauthenticated user navigates to `/dashboard`.
2. `authGuard` redirects to `/login?returnUrl=%2Fdashboard`.
3. The context banner at the top of the login page announces the returning destination (existing behavior).
4. User submits valid credentials.
5. The browser URL transitions to `/dashboard`, not the default authenticated home.

**Flow C — Invalid credentials:**
1. User submits the login form with an email or password that the backend rejects.
2. The backend responds `401 Unauthorized`.
3. The form re-enables, a visible error message is shown near the form, and the browser URL does **not** change.
4. The user can retry without a full page reload.

**Flow D — Logout from an authenticated session:**
1. Authenticated user is on `/dashboard` with the navbar showing their name and a Logout button.
2. User clicks Logout.
3. The JWT is removed from `localStorage`, `AuthService.currentUser` becomes `null`, and any parallel auth-state surface (`AuthStateService`) that drives `authGuard` is cleared consistently.
4. The browser URL transitions to `/login` and the anonymous Login form is rendered.
5. Pressing the browser Back button (or typing `/dashboard` again) redirects the user back to `/login` — no protected UI flashes.

---

## Milestone Context

**Milestone:** None (issue #55 has no assigned milestone — it is a regression / follow-up to Milestone 3).

### Prerequisite Work (already shipped)
- [#23](https://github.com/Gulybi/KanbAI-Web/issues/23) — Implement Auth Service with Angular Signals — delivered `AuthService`, `login()`, `register()`, `logout()`, `currentUser` signal.
- [#24](https://github.com/Gulybi/KanbAI-Web/issues/24) — Create Login Component and Form UI — originally delivered the Login form that this ticket is restoring.
- [#25](https://github.com/Gulybi/KanbAI-Web/issues/25) — Create Registration Component and Form UI — the Register form remains intact and serves as the reference pattern.
- [#26](https://github.com/Gulybi/KanbAI-Web/issues/26) — Implement JWT HTTP Interceptor — attaches `Authorization` header and handles global 401s.
- [#27](https://github.com/Gulybi/KanbAI-Web/issues/27) — Configure Route Guards for Protected Areas — defines `authGuard`, `unauthGuard`, `AUTH_HOME_ROUTE`, `LOGIN_ROUTE`, returnUrl-preservation.
- [#28](https://github.com/Gulybi/KanbAI-Web/issues/28) — Update Shell/Navbar with User State — delivered the navbar's Logout button and user-name display bound to `AuthService.currentUser`.

### Related Open Issues (same cleanup wave, distinct scope)
- [#56](https://github.com/Gulybi/KanbAI-Web/issues/56) — Fix Header Navigation, Auth Buttons, and Logo Routing — adjacent shell-navigation cleanup. Not a blocker; coordinate if the fix touches header/link behavior.
- [#57](https://github.com/Gulybi/KanbAI-Web/issues/57) — Handle Dashboard Empty State and Remove Unused Sidebar — follows this ticket; a successful login must reach the dashboard before its empty state can be exercised.
- [#58](https://github.com/Gulybi/KanbAI-Web/issues/58) — Clean up Landing Page Content — independent.
- [#59](https://github.com/Gulybi/KanbAI-Web/issues/59) — Fix Environment API URL Configuration — **likely related to the 401 symptom**. If `environment.apiUrl` and the hard-coded `AuthService.apiUrl` disagree, the login POST and the interceptor's URL-match branch can drift. Coordinate whichever ships first.

### Downstream Impact
- Every feature behind `authGuard` (`/dashboard`, `/board`, project members, future Kanban real-time and file-upload work) depends on this ticket to be reachable. Until #55 is closed, manual verification of those features is gated on pre-authenticated tokens.

---

## Acceptance Criteria

### Login UI Restoration
- [ ] Navigating to `/login` while unauthenticated renders a `<form>` element that contains an input with type `email`, an input with type `password`, and a submit `<button>`.
- [ ] The email input has an associated `<label>` (or `aria-label`) whose accessible name identifies it as an email field; the password input has an associated `<label>` (or `aria-label`) whose accessible name identifies it as a password field.
- [ ] The submit button is disabled while the form is invalid (empty or malformed email, empty password).
- [ ] The submit button is disabled while a login request is in flight and re-enables after the response (success or failure).
- [ ] The login page renders a link element whose `href` resolves to `/register` and whose visible text points users to the registration page.
- [ ] When a safe `returnUrl` query parameter is present on `/login`, the `LoginContextBannerComponent` is rendered (existing behavior is preserved).
- [ ] The placeholder text `"Authentication UI will be implemented here."` is not present anywhere in the rendered `/login` DOM.

### Successful Authentication Flow
- [ ] Submitting the form with valid credentials results in an HTTP POST whose request body contains the `email` and `password` fields matching what the backend login endpoint accepts (no `401` is returned for correct credentials that succeed via direct API call).
- [ ] After a successful login response, `localStorage` contains a non-empty value under the `jwt_token` key.
- [ ] After a successful login response with no `returnUrl` present, the browser URL (`window.location.pathname`) becomes `/dashboard` (the value of `AUTH_HOME_ROUTE`).
- [ ] After a successful login response with a safe `returnUrl` present, the browser URL becomes that `returnUrl` value.
- [ ] After a successful login, navigating to `/dashboard` is allowed by `authGuard` and the dashboard route component renders — the user is not bounced back to `/login`.
- [ ] After a successful login, the navbar displays the authenticated user's name and the Logout button (behavior inherited from issue #28 must continue to work end-to-end).

### Failed Authentication Flow
- [ ] Submitting the form with credentials that the backend rejects with `401` results in a visible error message rendered inside the login page with text that communicates the failure to the user.
- [ ] A `401` from the login endpoint does **not** clear an existing valid session on the same device (i.e., the interceptor's global 401-handler does not destroy state that it did not create).
- [ ] After a `401`, the browser URL remains `/login` (the user is not redirected away from the form) and the form is re-enabled so the user can retry.

### Logout Redirect Correctness
- [ ] Clicking the Logout button in the navbar while authenticated results in `localStorage` no longer containing the `jwt_token` key.
- [ ] Clicking the Logout button results in `AuthService.currentUser()` returning `null`.
- [ ] Clicking the Logout button results in `AuthStateService.isAuthenticated()` returning `false` (so `authGuard` consistently denies access to protected routes).
- [ ] Clicking the Logout button results in the browser URL transitioning to `/login` exactly once, with no intermediate stop at a protected route and no redirect loop.
- [ ] After logout, typing `/dashboard` in the address bar results in a redirect to `/login` (with `returnUrl=%2Fdashboard` preserved per `authGuard` behavior).
- [ ] After logout, pressing the browser Back button does not render any protected-route UI; the next resolved URL is `/login` or the public landing page.

### Regression / Build Gates
- [ ] `npm run build` succeeds with no TypeScript or template errors introduced by the change.
- [ ] `npm run test -- --watch=false` reports zero INTRODUCED failures; any existing test in `login-page.component.spec.ts` that still asserts the placeholder DOM must be updated to cover the restored form behavior.
- [ ] Existing tests for `navbar.component.spec.ts`, `auth.guard.spec.ts`, and `unauth.guard.spec.ts` continue to pass unchanged.
- [ ] The browser console emits no uncaught errors during the complete Flow A (load `/login` → submit → land on `/dashboard`) and Flow D (click Logout → land on `/login`).

---

## Open Questions for Staff Engineer

1. **Single source of truth for auth state:** `AuthService.currentUser` and `AuthStateService` currently evolve independently. The 401 and redirect symptoms strongly suggest this divergence is part of the root cause. Should the login success path also call `AuthStateService.setAuthState(token, userId)` (and logout call `clearAuthState()`), or should the guards move to reading `AuthService.currentUser`? Pick one and wire it consistently.
2. **API base URL reconciliation:** `AuthService` hard-codes `http://localhost:5257/api/auth` while the interceptor reads `environment.apiUrl`. If they diverge, the interceptor's URL-match branch misses the login request. Confirm whether this ticket folds in the fix or defers to issue #59 (Fix Environment API URL Configuration).
3. **Login request payload contract:** The reported 401 may be a payload-shape mismatch (e.g., backend expects `{ username, password }` or `{ email, password, rememberMe }`). Confirm the exact backend contract via the backend-api-bridge agent or the backend source before implementation so the form fields and `LoginRequestDto` match.
