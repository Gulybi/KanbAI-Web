import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/AuthService';
import { AuthStateService } from '../services/auth-state.service';
import { LOGIN_ROUTE } from '../constants/auth-routes';

/**
 * Authentication Interceptor
 *
 * Attaches the stored JWT to API requests and enforces a two-way 401 policy
 * (see docs/handoffs/issue_86_tech_spec.md / #86):
 *   1. Auth endpoints (/auth/login, /auth/register): propagate untouched so
 *      the login/register forms surface "bad credentials" inline.
 *   2. Any other API 401 from an authenticated session: force logout +
 *      redirect to /login. The response body is irrelevant — status 401 is
 *      sufficient. Idempotency is enforced by reading
 *      `authStateService.isAuthenticated()` (concurrent 401s collapse to
 *      one logout) and by not re-navigating when already on /login.
 * 403 is never a session-expiry signal and is always propagated unchanged.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const authStateService = inject(AuthStateService);

  // Only intercept requests to our API (not external APIs)
  if (req.url.startsWith(environment.apiUrl)) {
    const token = localStorage.getItem('jwt_token');

    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const isApiRequest = req.url.startsWith(environment.apiUrl);
      const isAuthEndpoint =
        req.url.startsWith(`${environment.apiUrl}/auth/login`) ||
        req.url.startsWith(`${environment.apiUrl}/auth/register`);

      if (
        error.status === 401 &&
        isApiRequest &&
        !isAuthEndpoint &&
        authStateService.isAuthenticated()
      ) {
        authService.logout();
        if (!router.url.startsWith(LOGIN_ROUTE)) {
          router.navigate([LOGIN_ROUTE]);
        }
      }

      return throwError(() => error);
    })
  );
};
