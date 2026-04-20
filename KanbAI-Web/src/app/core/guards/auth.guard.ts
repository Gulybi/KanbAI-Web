import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

/**
 * Guard to protect routes that require authentication.
 * Redirects to /login if user is not authenticated.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  const isAuthenticated = authState.isAuthenticated();

  if (!isAuthenticated) {
    return router.parseUrl('/login');
  }

  return true;
};
