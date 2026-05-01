# Feature: Fix Header Navigation, Auth Buttons, and Logo Routing

**GitHub Issue:** [#56](https://github.com/Gulybi/KanbAI-Web/issues/56)
**Milestone:** None (regression / bug-fix ticket, adjacent to Milestone 3 "JWT Authentication UI" cleanup)
**Repository:** Gulybi/KanbAI-Web
**Labels:** `bug`

---

## Business Value

### Who is this for?
- **Anonymous visitors** who land on the public site and need a visible, consistent way to start signing in or creating an account. Today the global header shows only the "KanbAI" brand text when logged out — there is no Login button, no Register button, and no clickable logo, so the visitor has no in-header path into authentication.
- **Authenticated users** who expect the Logout button to remain available on every screen they can reach. Today the Logout affordance is reported to disappear on certain screens, stranding users inside the app with no in-header way to sign out.
- **All users** who intuitively click a site logo to "go home". Today the logo is a plain `<h1>` element with no click handler or routing — it does nothing.
- **The product/business**, which needs a consistent, trustworthy global header. A navbar that silently changes between screens, or hides its primary auth affordances, looks broken to first-time visitors and erodes trust in the application shell shipped by Milestone 3 (#28).

### Why is it valuable?
- **Restores the primary entry path for anonymous visitors.** Without header Login/Register buttons, the only way into the auth flow is deep-link URLs (`/login`, `/register`) — this is invisible to a first-time visitor arriving on the landing page.
- **Restores the primary exit path for authenticated users.** A missing Logout button on any authenticated screen breaks a non-negotiable control in every production web app.
- **Makes the header behave consistently across every route.** The global navbar is mounted once in `app.html` (see Codebase Discovery below), so any per-screen disappearance of its controls indicates a state-synchronization bug that will keep surfacing until resolved.
- **Delivers a context-aware logo click target.** A site logo that routes an anonymous visitor to `/` (landing) and an authenticated user to `/dashboard` is a standard web convention and a one-click escape hatch to a known-good destination from anywhere in the app.
- **Completes the navbar work started in issue #28** ("Update Shell/Navbar with User State"), which introduced the authenticated branch but did not ship an anonymous branch and did not wire the brand as a routed link.

### What problem does it solve?
**Problem:** The global header component (`core/layout/navbar`) has three defects that are visible on every screen of the app:

1. **No Login / Register buttons for anonymous visitors.** The navbar template renders its auth cluster inside `@if (currentUser(); as user)` — there is no `@else` branch. When `currentUser()` is `null`, the right-hand side of the header is empty.
2. **Logout button disappears on certain screens for authenticated users.** Because the navbar's authenticated branch is gated on `AuthService.currentUser` while routing/protection is gated on `AuthStateService.isAuthenticated()`, any screen that causes those two surfaces to diverge (for example after a navigation that touches the JWT interceptor's 401 path, or a route that triggers logout-like state clearing) will present the user with the authenticated UI *without* the Logout button — or vice-versa.
3. **Logo is not context-aware (or even clickable).** The brand text is a plain `<h1>KanbAI</h1>` with no routerLink, no click handler, and no role. Clicking it does nothing.

**Solution:** Make the navbar render a visible, role-appropriate set of controls in both authenticated and unauthenticated states; make the brand a single context-aware navigation target whose destination is decided by the same auth-state surface that drives the rest of the header; and stabilize that auth-state surface so the header stops drifting between screens.

---

## Current State vs Desired State

### Current State

- **Navbar is globally mounted.** `KanbAI-Web/src/app/app.html` unconditionally renders `<app-navbar />` above the router outlet, so the header is visible on every route — landing (`/`), login (`/login`), register (`/register`), dashboard (`/dashboard`), and board (`/board`).
- **Navbar template has an authenticated branch only.** `KanbAI-Web/src/app/core/layout/navbar/navbar.component.html` currently contains:
  ```html
  <nav class="navbar">
    <h1 class="navbar__brand">KanbAI</h1>

    @if (currentUser(); as user) {
      <div class="navbar__auth-cluster" role="group" aria-label="Account">
        <span class="navbar__user-name" data-testid="navbar-user-name">
          {{ user.name }}
        </span>
        <button
          type="button"
          class="navbar__logout-btn"
          (click)="onLogout()">
          Logout
        </button>
      </div>
    }
  </nav>
  ```
  There is no `@else` block. When `currentUser()` is `null`, the header renders only the brand text. No Login button. No Register button.
- **Brand is not a link.** `navbar.component.html` wraps the brand in a non-interactive `<h1>`. The component class (`navbar.component.ts`) has no brand click handler and no template binding to a router target. The brand is styled with `user-select: none` in `navbar.component.scss` but that is purely cosmetic.
- **Auth state is read from `AuthService.currentUser` in the navbar, but `AuthStateService` drives guards.** `navbar.component.ts` binds to `authService.currentUser`. Route guards (`authGuard`, `unauthGuard`) read `AuthStateService.isAuthenticated()`. These two sources are not synchronized in the login success path today (same divergence documented in the issue #55 Open Questions section, `docs/handoffs/issue_55_context.md`). Any screen reached via a transition that updates one surface but not the other will present a header whose visible controls do not match the user's actual session — most commonly manifesting as "the Logout button vanished" or "I'm logged in but the navbar still shows nothing".
- **Logout redirect target is hard-coded.** `navbar.component.ts` calls `router.navigateByUrl(LOGIN_ROUTE)` after `authService.logout()`. This is correct for the logout flow but is not reused as the brand-click destination.
- **Routing constants already exist.** `KanbAI-Web/src/app/core/constants/auth-routes.ts` exports `AUTH_HOME_ROUTE = '/dashboard'`, `LOGIN_ROUTE = '/login'`, and `REGISTER_ROUTE = '/register'` — the anonymous home (`/`) is defined by the landing route in `app.routes.ts` but does not have a named constant yet.
- **Routes exist for every header target.** `KanbAI-Web/src/app/app.routes.ts` defines `/` (landing, guarded by `unauthGuard`), `/login` (guarded by `unauthGuard`), `/register` (guarded by `unauthGuard`), `/dashboard` (guarded by `authGuard`), and `/board` (guarded by `authGuard`). No routing gaps block this feature.
- **Observable symptoms (from the GitHub issue):**
  1. Unauthenticated users see no Login or Register buttons in the header.
  2. The Logout button disappears on certain authenticated screens.
  3. Clicking the logo does nothing.

### Desired State

- **The header renders appropriate controls in both session states, on every route:**
  - **Anonymous:** The header renders a Login button/link and a Register button/link on the right-hand side of the navbar.
  - **Authenticated:** The header renders the user's name and a Logout button on the right-hand side of the navbar.
  - The transition between the two branches happens reactively as session state changes, with no page reload required.
- **The Logout button is present on every authenticated route.** Whichever single source of truth the staff engineer chooses for session state, the navbar must consult that same source, and the source must remain consistent across navigations (no mid-session flicker to the anonymous branch on a route change that does not actually log the user out).
- **The brand is a context-aware navigation target.**
  - Clicking the brand while **anonymous** navigates to `/` (public landing page).
  - Clicking the brand while **authenticated** navigates to `/dashboard` (`AUTH_HOME_ROUTE`).
  - The brand is a semantically correct interactive element (a `<button>` or `<a>`, not an `<h1>` click handler) with a visible focus ring and a keyboard-activatable target.
- **The anonymous auth buttons route correctly and do not trap a signed-in user:**
  - Clicking Login navigates to `/login`.
  - Clicking Register navigates to `/register`.
  - Because both routes are guarded by `unauthGuard`, a signed-in user who somehow reached the anonymous branch would be redirected back to `AUTH_HOME_ROUTE` — but the anonymous branch should only be reachable when `currentUser()` is `null`, so this is a safety net rather than primary behavior.
- **The header layout and styling remain visually consistent with the design system established by issue #28** (dark sidebar background `$bg-sidebar-dark`, touch targets of at least 44px, visible focus rings using `$brand-primary`). Adding anonymous controls must not regress the authenticated layout delivered by #28.

### Expected User Flows

**Flow A — Anonymous visitor enters authentication from any public route:**
1. Unauthenticated user loads `/` (landing page).
2. The global header renders the KanbAI brand on the left and a Login button and Register button on the right.
3. User clicks Login. The browser URL becomes `/login`.
4. (Or) User clicks Register. The browser URL becomes `/register`.
5. No flicker of the authenticated branch is visible during the route transition.

**Flow B — Anonymous visitor uses the logo to return home:**
1. Unauthenticated user is on `/login` (or `/register`, or any public route that falls through the wildcard).
2. User clicks the KanbAI brand in the header.
3. The browser URL becomes `/` (the public landing page).
4. The header continues to display the Login and Register buttons.

**Flow C — Authenticated user uses the logo to return home:**
1. Authenticated user is on `/board` (or any authenticated sub-route).
2. User clicks the KanbAI brand in the header.
3. The browser URL becomes `/dashboard` (`AUTH_HOME_ROUTE`).
4. The header continues to display the user's name and the Logout button.

**Flow D — Authenticated user logs out from any authenticated screen:**
1. Authenticated user is on any authenticated route (`/dashboard`, `/board`, or any sub-route).
2. The header is visible and shows the user's name and the Logout button. The Logout button is present.
3. User clicks Logout.
4. The session clears, the browser URL becomes `/login`, and the header now renders the Login and Register buttons.
5. The Logout button does not reappear until the user signs back in.

**Flow E — Session-state transitions mid-navigation:**
1. Unauthenticated user is on `/login`. The header shows Login and Register buttons.
2. User signs in successfully. The authenticated landing (`/dashboard`) renders.
3. The header updates reactively: the Login and Register buttons are replaced by the user's name and a Logout button, without a manual page reload.
4. The user then navigates to `/board` via a link click. The Logout button remains visible.
5. The user navigates back to `/dashboard`. The Logout button remains visible.
6. At no point during steps 3–5 does the header briefly render the anonymous branch.

---

## Milestone Context

**Milestone:** None (issue #56 has no assigned milestone — it is a bug-fix ticket in the same regression cleanup wave as #55, #57, #58, #59).

### Prerequisite Work (already shipped)
- [#10](https://github.com/Gulybi/KanbAI-Web/issues/10) — Create the Application Shell (Base Layout) and Routing — established the app shell (`app.html`) into which the global navbar is mounted.
- [#27](https://github.com/Gulybi/KanbAI-Web/issues/27) — Configure Route Guards for Protected Areas — delivered `authGuard`, `unauthGuard`, `AUTH_HOME_ROUTE`, `LOGIN_ROUTE`, `REGISTER_ROUTE`.
- [#28](https://github.com/Gulybi/KanbAI-Web/issues/28) — Update Shell/Navbar with User State — delivered the navbar component in its current (authenticated-only-branch) form. This ticket extends that work with the anonymous branch, the clickable logo, and the stability fix for the Logout-disappears symptom.
- [#29](https://github.com/Gulybi/KanbAI-Web/issues/29) — Create Public Landing Page — delivers `/` as a real destination for the anonymous logo click.
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) — Implement Project Dashboard Component — delivers `/dashboard` as a real destination for the authenticated logo click.

### Related Open Issues (same cleanup wave, distinct scope — coordinate but do not block)
- [#55](https://github.com/Gulybi/KanbAI-Web/issues/55) — Restore Login UI and Fix Authentication Flow — **strongly related.** The "Logout button disappears" symptom and the "auth state divergence between `AuthService.currentUser` and `AuthStateService`" open question raised in `docs/handoffs/issue_55_context.md` are the same root-cause family as this ticket's stability concern. If #55 picks a single source of truth and wires it consistently, this ticket inherits that decision for the Logout-visibility criteria.
- [#57](https://github.com/Gulybi/KanbAI-Web/issues/57) — Handle Dashboard Empty State and Remove Unused Sidebar — touches the app shell adjacent to the header. If the sidebar is removed, the header becomes the sole persistent navigation surface, which raises the stakes on this ticket but does not change its scope.
- [#58](https://github.com/Gulybi/KanbAI-Web/issues/58) — Clean up Landing Page Content — independent; does not affect header behavior.
- [#59](https://github.com/Gulybi/KanbAI-Web/issues/59) — Fix Environment API URL Configuration — independent of header UI, but is part of the same stability wave and may affect whether a login/logout round-trip completes cleanly during manual verification of this ticket's flows.

### Downstream Impact
- Every anonymous visitor's path into authentication runs through this header. Until this ticket ships, first-time visitors cannot reach `/login` or `/register` through the UI — they must type the URL.
- Every authenticated user's path out of their session runs through the Logout button in this header (no other logout surface exists today). The "disappears on certain screens" symptom is a functional blocker, not a cosmetic one.
- Real-time features shipping later (Milestone 5, SignalR) will continue to rely on this header as the always-visible session affordance. Fixing the divergence now prevents recurrence.

---

## Codebase Discovery Summary

- **Global header mounting:** `KanbAI-Web/src/app/app.html` mounts `<app-navbar />` unconditionally at the top of the page, above `<app-sidebar />` and `<router-outlet />`. The header is present on every route.
- **Navbar template gap:** `KanbAI-Web/src/app/core/layout/navbar/navbar.component.html` renders the auth cluster only inside `@if (currentUser(); as user)` — there is no `@else` branch for the anonymous state and the brand is a non-interactive `<h1>` element with no routing.
- **Navbar component logic:** `KanbAI-Web/src/app/core/layout/navbar/navbar.component.ts` exposes `currentUser = this.authService.currentUser` and an `onLogout()` method that calls `authService.logout()` then `router.navigateByUrl(LOGIN_ROUTE)`. There is no brand-click handler and no anonymous-side behavior.
- **Auth state surfaces:** `KanbAI-Web/src/app/core/services/AuthService.ts` (`currentUser` signal) and `KanbAI-Web/src/app/core/services/auth-state.service.ts` (`isAuthenticated` signal) are independent surfaces. The navbar reads the former; guards read the latter. Any screen that updates one without the other will drift the header — this is the probable mechanism behind the "Logout disappears" symptom.
- **Routing constants & route table:** `KanbAI-Web/src/app/core/constants/auth-routes.ts` defines `LOGIN_ROUTE`, `REGISTER_ROUTE`, `AUTH_HOME_ROUTE`. `KanbAI-Web/src/app/app.routes.ts` provides all four destinations required by this ticket (`/`, `/login`, `/register`, `/dashboard`) with correct guards in place. No routing changes are needed to unblock this feature.

---

## Acceptance Criteria

### Anonymous Header (Login + Register buttons)
- [ ] When `currentUser()` is `null`, the rendered `<app-navbar>` contains an interactive element whose accessible name is "Login" and whose activation navigates the browser URL to `/login`.
- [ ] When `currentUser()` is `null`, the rendered `<app-navbar>` contains an interactive element whose accessible name is "Register" and whose activation navigates the browser URL to `/register`.
- [ ] The Login and Register controls are rendered in the right-hand region of the header (mirroring the `.navbar__auth-cluster` position used by the authenticated branch).
- [ ] The Login and Register controls are keyboard-focusable via Tab and activate on Enter or Space with no mouse interaction required.
- [ ] Each of the Login and Register controls has a visible focus indicator consistent with the existing `focus-visible` treatment in `navbar.component.scss` (2px `$brand-primary` outline with 2px offset).
- [ ] Each of the Login and Register controls has a minimum touch target of 44px in height at every supported breakpoint.

### Authenticated Header (Logout button stability)
- [ ] When `currentUser()` is non-null, the rendered `<app-navbar>` contains the user-name span and the Logout button (existing behavior from issue #28 is preserved).
- [ ] The Logout button is present in the rendered `<app-navbar>` on every authenticated route reachable in the current app (`/dashboard`, `/board`, and any other route guarded by `authGuard`).
- [ ] Navigating between two authenticated routes (for example `/dashboard` → `/board` → `/dashboard`) does not cause the Logout button to disappear at any point during the transition.
- [ ] The rendered `<app-navbar>` does not simultaneously show the anonymous controls and the authenticated controls — the two branches are mutually exclusive.
- [ ] Whichever single source of truth the staff engineer selects for the authenticated branch gate, that source returns `true` on every authenticated route and `false` on every anonymous route — verifiable by inspecting the signal value at route-activation time.

### Context-Aware Logo
- [ ] The KanbAI brand in the header is rendered as an interactive element (an `<a>` with an `href` or a `<button>`), not a plain `<h1>`.
- [ ] The brand element has an accessible name that identifies it as a home link (for example "KanbAI — home" or equivalent).
- [ ] Clicking the brand while `currentUser()` is `null` results in the browser URL becoming `/`.
- [ ] Clicking the brand while `currentUser()` is non-null results in the browser URL becoming `/dashboard` (the value of `AUTH_HOME_ROUTE`).
- [ ] The brand element is keyboard-focusable via Tab and activates on Enter with no mouse interaction required.
- [ ] The brand element has a visible focus indicator consistent with the `focus-visible` treatment in `navbar.component.scss`.
- [ ] The brand element retains the existing visual styling (`$font-size-xxl`, `$font-weight-bold`, `$text-inverse`, `user-select: none`) and does not visually appear as a default-styled link (no default blue underline).

### Reactive Transitions
- [ ] Immediately after a successful login, the header transitions from rendering the Login/Register controls to rendering the user-name and Logout button without a manual page reload.
- [ ] Immediately after a successful logout, the header transitions from rendering the user-name and Logout button to rendering the Login/Register controls without a manual page reload.
- [ ] During the login transition, there is no observable frame in which both the anonymous controls and the authenticated controls are rendered simultaneously.
- [ ] During the logout transition, there is no observable frame in which both the anonymous controls and the authenticated controls are rendered simultaneously.

### Regression / Build Gates
- [ ] `npm run build` succeeds with no TypeScript or template errors introduced by the change.
- [ ] `npm run test -- --watch=false` reports zero INTRODUCED failures; existing tests in `navbar.component.spec.ts` that assert the anonymous-branch DOM (if any) are updated to cover the new Login/Register controls, and existing tests that assert the authenticated-branch DOM continue to pass unchanged.
- [ ] Existing tests for `auth.guard.spec.ts`, `unauth.guard.spec.ts`, and any route-configuration test in `app.routes` continue to pass unchanged.
- [ ] The browser console emits no uncaught errors during a complete Flow A (anonymous → click Login → `/login`), Flow C (authenticated → click logo → `/dashboard`), or Flow D (authenticated → click Logout → `/login`).

---

## Open Questions for Staff Engineer

1. **Single source of truth for the navbar's authenticated-branch gate.** The "Logout disappears" symptom is almost certainly caused by divergence between `AuthService.currentUser` (which the navbar reads today) and `AuthStateService.isAuthenticated()` (which the guards read). Issue #55's Open Questions raises the same divergence. Decide whether this ticket consumes the fix from #55, blocks on it, or independently aligns the navbar's gate with the guards' source of truth. Pick one authoritative signal and wire the navbar to it.
2. **Logo target constant.** `AUTH_HOME_ROUTE` (`/dashboard`) already exists; the anonymous home (`/`) does not have a named constant. Decide whether to introduce `PUBLIC_HOME_ROUTE = '/'` in `src/app/core/constants/auth-routes.ts` (or an analogous module) to keep the brand-target mapping symmetric and test-friendly.
3. **Anonymous-control styling parity with Logout.** The existing `.navbar__logout-btn` styling (outlined-on-dark with 44px touch target and `focus-visible` ring) is a good template for Login/Register. Decide whether to generalize it into a shared `.navbar__action-btn` utility class or duplicate/rename it per-control. This is a styling-ergonomics decision, not a business-rule decision, so the web-designer agent may own the final call in the design spec.
4. **Visual variant of Register vs Login.** Common pattern is "Login as a quiet/ghost button, Register as a solid/primary button" to bias new visitors toward registration, but this ticket does not prescribe a visual hierarchy. Flag for the web-designer agent to decide.
