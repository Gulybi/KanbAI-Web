import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';
import { LOGIN_ROUTE } from '../constants/auth-routes';

/**
 * Guard that protects routes requiring an authenticated session.
 *
 * Behavior:
 *   - Authenticated → returns `true`, navigation proceeds.
 *   - Unauthenticated → returns a `UrlTree` redirecting to `/login`.
 *     If the originally-requested URL (`state.url`) is a non-trivial
 *     in-app path, it is attached to the redirect as `?returnUrl=<...>`
 *     so `LoginPageComponent` can restore the user's destination after
 *     a successful login.
 *
 * Re-runs on every navigation, so a mid-session `clearAuthState()`
 * (e.g., from a 401 interceptor or a logout) immediately blocks further
 * access to protected routes.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  if (authState.isAuthenticated()) {
    return true;
  }

  // Only attach returnUrl when the attempted URL is non-trivial.
  // `/` alone is the landing page — preserving it adds no value
  // (and is never reached here anyway, because `/` is not guarded
  // by authGuard), so this branch is defensive.
  const attemptedUrl = state?.url;
  const shouldPreserve = !!attemptedUrl && attemptedUrl !== '/' && attemptedUrl !== '';

  return shouldPreserve
    ? router.createUrlTree([LOGIN_ROUTE], { queryParams: { returnUrl: attemptedUrl } })
    : router.createUrlTree([LOGIN_ROUTE]);
};
