# Feature: Configure Route Guards for Protected Areas

**GitHub Issue:** [#27](https://github.com/Gulybi/KanbAI-Web/issues/27)
**Milestone:** JWT Authentication UI (#3)

## Business Value

### Who is this for?
- **End users** of KanbAI who expect that personal workspace data (their Dashboard, Kanban Boards, projects) is accessible only when they are logged in.
- **The product/business** that needs to enforce a trust boundary between the public marketing site and the authenticated application.
- **Downstream developers** who will add new protected features (project dashboard, kanban board views, member management) and need a declarative, reusable way to mark a route as "requires login".

### Why is it valuable?
- Prevents unauthenticated users from reaching authenticated-only UI (even if they type the URL directly, bookmark it, or follow a stale link).
- Produces a predictable, user-friendly redirect flow instead of broken pages or empty data states when the session is missing or expired.
- Establishes the enforcement point where future auth concerns (expired JWT, 401 responses from the interceptor in #26, role-based access) plug in cleanly.
- Closes the final functional gap in Milestone 3 (JWT Authentication UI) by connecting the AuthService (#23), Login/Register UIs (#24/#25), and HTTP Interceptor (#26) into a complete, enforced auth loop.

### What problem does it solve?
**Problem:** A scaffolding `authGuard` and `unauthGuard` were introduced in issue #29 to support the public landing page, but they are currently applied to a minimal surface area (`/` and `/board` only). As authenticated features land (project dashboard #30, kanban board work in subsequent milestones), each new protected route risks being added without protection, silently leaking authenticated UI to anonymous visitors. There is also no defined behavior for session expiry, deep-link preservation, or redirecting an already-logged-in user away from `/login` and `/register`.

**Solution:** Formalize the Route Guard strategy so that (a) every protected route in the application is declaratively guarded, (b) every unauth-only route (login, register, landing) is guarded against logged-in users, and (c) the redirect behavior is deterministic and observable for QA.

---

## Current State vs Desired State

### Current State
- **Guard scaffolding exists from issue #29:**
  - `KanbAI-Web/src/app/core/guards/auth.guard.ts` - `authGuard` redirects to `/login` when `AuthStateService.isAuthenticated()` is false.
  - `KanbAI-Web/src/app/core/guards/unauth.guard.ts` - `unauthGuard` redirects to `/board` when the user is authenticated.
  - Both have spec files (`auth.guard.spec.ts`, `unauth.guard.spec.ts`) covering basic authenticated/unauthenticated cases.
- **Current route table:** `KanbAI-Web/src/app/app.routes.ts`
  - `''` (landing) - guarded by `unauthGuard`.
  - `'login'` - **not guarded** (authenticated users can still reach the login page).
  - `'board'` - guarded by `authGuard`.
  - No `register` route yet; no dashboard route yet; no wildcard/404 route.
- **Auth state source:** `KanbAI-Web/src/app/core/services/auth-state.service.ts`
  - Uses Angular Signals (`isAuthenticated` computed from `state().token`).
  - State is in-memory only - not yet persisted across reloads (the JWT interceptor #26 is closed but the refresh-on-reload wiring is not yet visible in routes).
- **HTTP interceptor:** `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` exists (attaches Bearer token, handles 401 per issue #26).
- **Current behavior gaps:**
  - A logged-in user can still navigate to `/login` and see the login form.
  - When `authGuard` denies access, the originally requested URL (e.g. `/board/abc-123`) is lost - after login the user lands on a default page rather than their intended destination.
  - There is no 404/wildcard redirect, so mistyped protected URLs fall through silently.
  - No test verifies that EVERY intended-protected route is actually wired to `authGuard`.

### Desired State
- **Expected behavior:**
  - Every route that renders authenticated content has `canActivate: [authGuard]` applied.
  - Every route intended only for anonymous visitors (landing, login, register) has `canActivate: [unauthGuard]` applied.
  - When an unauthenticated user requests a protected URL, they are redirected to `/login` AND the originally requested URL is preserved so that after successful login they return to it.
  - When an already-authenticated user requests `/login`, `/register`, or `/` (landing), they are redirected to the authenticated home (`/board` for now; ready to swap to `/dashboard` once #30 ships).
  - When the auth state transitions to unauthenticated mid-session (e.g. 401 from the interceptor clears the token), navigation to any protected route immediately redirects to `/login`.
  - An unknown URL resolves to a 404 behavior consistent with the user's auth state (authenticated users -> redirect to home; unauthenticated users -> redirect to landing).
- **Expected user flow:**
  1. Anonymous user types `/board` into the URL bar.
  2. `authGuard` blocks and redirects to `/login?returnUrl=%2Fboard`.
  3. User logs in successfully via the Login UI (#24).
  4. The app navigates the user to `/board` (the preserved `returnUrl`), not the default authenticated landing.
  5. If, instead, the user was already logged in and typed `/login`, `unauthGuard` sends them to `/board` without showing the login form.

---

## Milestone Context

**Milestone #3:** JWT Authentication UI

This is the **final open functional issue** in Milestone 3. It ties together the service, UIs, and interceptor that the earlier milestone tickets delivered.

### Prerequisite Issues (all in Milestone #3)
- [#23](https://github.com/Gulybi/KanbAI-Web/issues/23) - Implement Auth Service with Angular Signals - CLOSED
- [#24](https://github.com/Gulybi/KanbAI-Web/issues/24) - Create Login Component and Form UI - CLOSED
- [#25](https://github.com/Gulybi/KanbAI-Web/issues/25) - Create Registration Component and Form UI - CLOSED
- [#26](https://github.com/Gulybi/KanbAI-Web/issues/26) - Implement JWT HTTP Interceptor - CLOSED

### Parallel Issue in the Same Milestone
- [#28](https://github.com/Gulybi/KanbAI-Web/issues/28) - Update Shell/Navbar with User State - OPEN. This issue depends on the same `AuthStateService.isAuthenticated` signal that the guards consume; both must agree on what "authenticated" means.

### Related Recently-Merged Work
- [#29](https://github.com/Gulybi/KanbAI-Web/pull/29) - Public landing page and authentication guards. Introduced the initial `authGuard` / `unauthGuard` scaffolding that this issue will formalize and extend.
- [#22/#11](https://github.com/Gulybi/KanbAI-Web/issues/11) - State Management Pattern (Angular Signals). The guards read from a Signals-based state service, so they stay synchronous and testable.

### Downstream Impact
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) - Project Dashboard Component. Will be a new protected route; must be registered with `authGuard` when introduced.
- Future Kanban Board detail routes (`/board/:id` etc.) will inherit the same guard pattern.

---

## Acceptance Criteria

### Route Protection Coverage
- [ ] Every route in `app.routes.ts` that renders content requiring a logged-in session has `canActivate: [authGuard]` applied. At minimum this covers `/board` and any already-planned authenticated route added as part of this work.
- [ ] Every route intended only for anonymous visitors has `canActivate: [unauthGuard]` applied. At minimum this covers `/` (landing), `/login`, and `/register` (if/when it is registered in the route table).
- [ ] A wildcard route (`path: '**'`) is present and resolves to a sensible default: authenticated users are redirected to the authenticated home, unauthenticated users are redirected to `/` (landing).

### Unauthenticated User Behavior
- [ ] Navigating directly to a protected URL (e.g. typing `/board` in the address bar while logged out) results in a redirect to `/login`, not a blank page or a protected UI flash.
- [ ] The redirect preserves the originally requested URL so that after successful login the user is navigated to that URL. This is observable in the URL (e.g. `/login?returnUrl=%2Fboard`) and in post-login navigation.
- [ ] The original `returnUrl` is only honored if it is an in-app relative path (external URLs or absolute URLs are ignored; the user falls back to the default authenticated home).

### Authenticated User Behavior
- [ ] Navigating to `/login` while already authenticated redirects to the authenticated home (`/board` currently) without rendering the login form.
- [ ] Navigating to `/register` while already authenticated redirects to the authenticated home without rendering the registration form.
- [ ] Navigating to `/` (landing) while already authenticated redirects to the authenticated home.

### Session Expiry Behavior
- [ ] When `AuthStateService` clears the token (e.g. logout, or a 401 handled by the interceptor from #26), any subsequent navigation attempt to a protected route redirects to `/login`.
- [ ] When logout is triggered from the navbar (#28), the user is redirected to the landing page (`/`) and cannot navigate back into protected areas without re-authenticating. "Navigate back" for this criterion means pressing the browser Back button AND typing the URL directly.

### Correctness & Observability
- [ ] Navigating to an unknown path (e.g. `/foo-bar-baz`) while unauthenticated lands on the landing page (`/`); while authenticated lands on the authenticated home.
- [ ] The guard decision is reactive to the `isAuthenticated` signal - no stale decisions are cached across a login or logout within the same browser session.
- [ ] The browser console shows no errors or warnings related to guard execution during any of the flows above.

### Testability
- [ ] Unit tests exist for `authGuard` covering: unauthenticated -> redirect to `/login`, authenticated -> allow, and `returnUrl` is attached to the redirect `UrlTree`.
- [ ] Unit tests exist for `unauthGuard` covering: authenticated -> redirect to authenticated home, unauthenticated -> allow.
- [ ] A route-configuration test (or equivalent) asserts that each intended-protected route is configured with `authGuard` and each intended-public route is configured with `unauthGuard`. This prevents future routes from being added unguarded by accident.

---

## Edge Cases & Error Handling

- [ ] **returnUrl tampering:** If a malicious `returnUrl` contains an external URL (e.g. `returnUrl=https://evil.example.com`), the guard ignores it and falls back to the default authenticated home.
- [ ] **Deep link during cold start:** User clicks a deep link to `/board` in a fresh tab. If auth state is still being rehydrated (e.g. reading a persisted token), the guard must make a deterministic decision - either wait for rehydration or treat "not yet authenticated" as unauthenticated and preserve the URL for post-login redirect.
- [ ] **Simultaneous tabs:** User logs out in Tab A while Tab B is on `/board`. Tab B's next navigation attempt (or route reload) must redirect to `/login`.
- [ ] **Navigating to `/login` from an already-expired session:** The user should see the login form (not a redirect loop), because the token is gone and `unauthGuard` correctly treats them as unauthenticated.
- [ ] **Back-button after logout:** Pressing the browser Back button after logout must not reveal cached protected UI; the guard re-evaluates on navigation and redirects to `/login`.

---

## Open Questions for Staff Engineer

1. **Authenticated home target:** Milestone 3 assumes `/board` is the authenticated home, but Milestone 4 introduces `/dashboard` (#30). Should the redirect target be a single constant (e.g. `AUTH_HOME_ROUTE`) that is updated when #30 lands, or should it be driven by user preference / last-visited route? Recommendation needed before implementation.
2. **Auth state persistence:** Does the JWT survive a full page reload (e.g. stored in `localStorage` by #26)? If yes, the guards may need to await rehydration before deciding. If no, a reload while on `/board` will always redirect to `/login` - confirm this is acceptable for Milestone 3.
3. **Register route registration:** `/register` is implemented (#25) but the route is not visible in `app.routes.ts`. Confirm whether wiring `/register` into the router is in scope for this issue or a separate follow-up.