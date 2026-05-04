/**
 * Central registry of auth-related route paths.
 * Change `AUTH_HOME_ROUTE` in one place when the authenticated landing
 * target shifts (e.g., from `/board` to `/dashboard` once #30 ships).
 */

/**
 * The default destination for a successfully-authenticated user who has
 * no explicit `returnUrl`. Also used by `unauthGuard` when redirecting
 * an already-authenticated user away from `/login`, `/register`, or `/`.
 */
export const AUTH_HOME_ROUTE = '/dashboard';

/**
 * The public landing page shown to anonymous visitors.
 * Navbar brand click target when `isAuthenticated()` is false.
 */
export const PUBLIC_HOME_ROUTE = '/';

/**
 * Canonical path to the login page. Used by `authGuard` when redirecting
 * unauthenticated users and by `isSafeReturnUrl` to block redirect loops.
 */
export const LOGIN_ROUTE = '/login';

/**
 * Canonical path to the register page. Route itself is not yet wired
 * (see tech spec Design Decision Q3), but listed here so that
 * `isSafeReturnUrl` can reject it and `UNAUTH_ONLY_PATHS` can enforce
 * its guard once the component lands.
 */
export const REGISTER_ROUTE = '/register';

/**
 * Paths that MUST be protected by `authGuard`. The route-configuration
 * test iterates this list and asserts each corresponding route in
 * `app.routes.ts` has `authGuard` in its `canActivate` array.
 *
 * Add new authenticated routes here as they land (e.g., `/dashboard`).
 */
export const PROTECTED_PATHS: readonly string[] = ['board/:projectId', 'dashboard'];

/**
 * Paths that MUST be protected by `unauthGuard` (visible to anonymous
 * visitors only). The route-configuration test iterates this list.
 *
 * `register` is listed for future-proofing; the test tolerates its
 * absence from the route table until the component is wired.
 */
export const UNAUTH_ONLY_PATHS: readonly string[] = ['', 'login', 'register'];
