import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

/**
 * Guard to protect routes intended for unauthenticated users only.
 * Redirects to /board if user is already authenticated.
 */
export const unauthGuard: CanActivateFn = (route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  const isAuthenticated = authState.isAuthenticated();

  if (isAuthenticated) {
    return router.parseUrl('/board');
  }

  return true;
};
