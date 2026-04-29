import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';
import { AUTH_HOME_ROUTE } from '../constants/auth-routes';

/**
 * Guard that protects routes intended only for anonymous visitors
 * (landing, login, register). Authenticated users are redirected to
 * `AUTH_HOME_ROUTE` so they never see the login / register form or
 * the public landing page while already signed in.
 */
export const unauthGuard: CanActivateFn = () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  return authState.isAuthenticated()
    ? router.createUrlTree([AUTH_HOME_ROUTE])
    : true;
};
