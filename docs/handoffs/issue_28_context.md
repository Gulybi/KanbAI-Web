# Feature: Update Shell/Navbar with User State

**GitHub Issue:** #28
**Milestone:** JWT Authentication UI (Milestone #3)
**Repository:** Gulybi/KanbAI-Web
**Branch:** `28-update-shellnavbar-with-user-state`

## Business Value

**Who is this for?**
Authenticated end-users of the KanbAI web application — anyone who has completed the login or registration flow delivered in the prior milestone tickets (#23, #24, #25, #26, #27).

**Why is it valuable?**
The shell navbar is the only globally-visible UI chrome in the app (`src/app/app.html` renders it above every route). Today it shows nothing but the product name, so an authenticated user has no persistent visual confirmation that their session is active and no obvious control to end that session. Users cannot trust the app without a clear "I am signed in as Jane" indicator, and they cannot comply with the basic security expectation of being able to log out on demand.

**What problem does it solve?**
1. Closes the final UX gap in Milestone 3: the JWT plumbing (#23 AuthService, #26 interceptor, #27 guards) already exists, but the user has no window into that state.
2. Gives users a trusted, always-available exit path from their session (Logout), which protects the JWT on shared/public devices.
3. Establishes the reactive pattern — binding the navbar to `AuthService.currentUser` via Angular Signals — that every future shell surface (notifications, profile menu, workspace switcher) will extend.

## Current State

The application shell is static and unaware of authentication status.

- **Shell host:** `src/app/app.ts` + `src/app/app.html` always render `<app-navbar />`, `<app-sidebar />`, and the routed view, regardless of auth state.
- **Current navbar:** `src/app/core/layout/navbar/navbar.component.ts` is an empty `ChangeDetectionStrategy.OnPush` component whose template (`navbar.component.html`) shows only a single `<h1>KanbAI</h1>` inside a blue Tailwind bar. It has no inputs, no injected services, and no knowledge that a user exists.
- **Available auth signal (unused by navbar):** `src/app/core/services/AuthService.ts` exposes `currentUser = signal<UserProfileDto | null>(null)` and a `logout()` method that clears `localStorage.jwt_token` and resets the signal to `null`. `UserProfileDto` is defined in `src/app/core/models/auth.models.ts` as `{ id, name, email }`.
- **Parallel auth state (already wired to guards/interceptor):** `src/app/core/services/auth-state.service.ts` holds `{ token, userId }` and exposes `isAuthenticated` (computed). This service is consumed by `authGuard`, `unauthGuard`, and the JWT interceptor.
- **Behavior today:** When a user logs in, the navbar does not change. When a user's token expires or they want to sign out, there is no UI affordance to do so — they must manually clear storage or navigate to `/login` (which `unauthGuard` then bounces because the token flag is still live).

## Desired State

The navbar becomes a reactive, auth-aware component that mirrors `AuthService.currentUser` and offers a one-click Logout.

**Expected behavior:**
- When `AuthService.currentUser()` is `null` (anonymous visitor on the landing page, login page, or register page), the navbar shows the KanbAI brand and nothing authentication-related on the right-hand side.
- When `AuthService.currentUser()` holds a `UserProfileDto`, the navbar shows the user's `name` and a "Logout" control on the right-hand side of the bar.
- Clicking Logout clears the JWT from storage, resets the user signal, and redirects the browser to `/login`.
- The transition in either direction (login → logged-out, logged-out → login) happens reactively via the Signal — no manual refresh required.

**Expected user flows:**

*Flow A — Anonymous visitor lands on `/`:*
1. User navigates to `/` (landing).
2. Navbar displays the brand; no user name, no Logout button are rendered.

*Flow B — User logs in successfully:*
1. User submits valid credentials on `/login`.
2. `AuthService.login()` completes, sets `currentUser` to the returned `UserProfileDto`, and the router navigates to `/board` (or the safe `returnUrl`).
3. Without any user action, the navbar re-renders to show the authenticated user's `name` and the Logout button.

*Flow C — Authenticated user clicks Logout on the board:*
1. User is on `/board` with the navbar showing their name and a Logout button.
2. User clicks Logout.
3. `AuthService.logout()` executes: `localStorage.jwt_token` is removed and `currentUser` is set to `null`.
4. The navbar immediately hides the user name and Logout button.
5. The router navigates the user to `/login`.
6. `authGuard` on `/board` would now also block any re-entry until a new login occurs.

*Flow D — Hard-refresh after login (out of scope confirmation):*
Session-persistence across full page reloads is **not** part of this ticket; `AuthService.currentUser` is in-memory only. If the user hard-refreshes, the navbar correctly reverts to the anonymous state per Flow A. Persisting identity across refreshes is a separate concern to be raised as a follow-up if needed.

## Milestone Context

**Milestone:** JWT Authentication UI (Milestone #3)

**Prerequisite Issues (all CLOSED):**
- #23 — Implement Auth Service with Angular Signals — provides `AuthService.currentUser` signal and `logout()` method that this ticket consumes.
- #24 — Create Login Component and Form UI — delivers the `/login` route that Logout redirects to.
- #25 — Create Registration Component and Form UI — delivers `/register`, another public route where the navbar must render the anonymous state.
- #26 — Implement JWT HTTP Interceptor — parallel plumbing; not a direct dependency but confirms the auth stack is live.
- #27 — Configure Route Guards for Protected Areas — defines `LOGIN_ROUTE` / `AUTH_HOME_ROUTE` constants in `src/app/core/constants/auth-routes.ts` that the Logout redirect should reuse.

**Downstream Issues:**
- No issues in this milestone are blocked by #28. Closing #28 completes Milestone 3 — "JWT Authentication UI" — end to end.
- Future work (profile menu, notifications bell, workspace switcher) will extend the navbar pattern introduced here.

**Related Work:**
- `src/app/app.html` already composes the navbar globally above the routed outlet, so no host-template changes are expected.
- Two auth signals exist today (`AuthService.currentUser` and `AuthStateService.isAuthenticated`). The GitHub issue body is explicit: this feature reads from **`AuthService.currentUser`**. Reconciling the two sources is out of scope for this ticket.

## Acceptance Criteria

- [ ] When `AuthService.currentUser()` is `null`, the rendered navbar contains no element whose text is the user's name and no element with an accessible name of "Logout".
- [ ] When `AuthService.currentUser()` returns a `UserProfileDto`, the navbar visibly displays the value of `currentUser().name` as text within the `<nav>` element.
- [ ] When `AuthService.currentUser()` returns a `UserProfileDto`, the navbar renders a `<button>` (or semantically equivalent control) with the accessible name "Logout" within the `<nav>` element.
- [ ] The Logout control is reachable via keyboard Tab navigation and can be activated with both `Enter` and `Space` keys (native `<button>` behavior satisfies this).
- [ ] When the user name changes (e.g., the signal is updated from `null` to a populated `UserProfileDto`), the navbar re-renders the name and Logout control within the same change-detection cycle, with no manual refresh required.
- [ ] Clicking (or keyboard-activating) the Logout control invokes `AuthService.logout()` exactly once, which removes the `jwt_token` entry from `localStorage` and sets `AuthService.currentUser` to `null`.
- [ ] After Logout is activated, the browser URL changes to `/login` (the `LOGIN_ROUTE` constant in `src/app/core/constants/auth-routes.ts`).
- [ ] After Logout is activated, the navbar re-renders into its anonymous state (no user name, no Logout button) before or at the same time as the route transition.
- [ ] On the landing page (`/`), login page (`/login`), and register page (`/register`), when no user is authenticated, the navbar displays only the "KanbAI" brand and no user-name or Logout affordance.
- [ ] On the board page (`/board`), when a user is authenticated, the navbar displays the "KanbAI" brand, the authenticated user's name, and the Logout button simultaneously.
- [ ] The `<nav>` element remains the outermost element of the navbar template (preserves the semantic-HTML assertion already covered in `navbar.component.spec.ts`).
- [ ] The navbar component continues to use `ChangeDetectionStrategy.OnPush` (signals drive re-renders automatically).
- [ ] `npm run build` succeeds with no TypeScript or template errors introduced by the change.
- [ ] `npm run test -- --watch=false` reports zero INTRODUCED failures. Any failing test in `navbar.component.spec.ts` that breaks because the navbar template grew new elements must be updated or replaced with tests covering the new behavior.
