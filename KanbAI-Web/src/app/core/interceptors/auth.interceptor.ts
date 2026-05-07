import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/AuthService';

/**
 * Authentication Interceptor
 *
 * This interceptor will eventually:
 * 1. Attach JWT tokens to outgoing requests
 * 2. Handle 401/403 authentication errors globally
 * 3. Redirect to login on authentication failures
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);

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
      // Three-way 401 decision (see docs/handoffs/issue_68_tech_spec.md / #68):
      //   1. Auth endpoints (/auth/login, /auth/register): propagate untouched
      //      so the login/register forms surface "bad credentials" inline.
      //   2. Non-auth endpoint, JWT still stored: propagate untouched. This
      //      is a per-resource 401 (e.g. invite-endpoint authorisation) and
      //      the feature layer owns the inline copy. Global logout here
      //      would unmount the feature before its error branch could run.
      //   3. Non-auth endpoint, no JWT stored: treat as genuine session
      //      expiry — logout and redirect to /login (AC5).
      // 403 is never a session-expiry signal and is propagated unchanged.
      const isAuthEndpoint =
        req.url.startsWith(`${environment.apiUrl}/auth/login`) ||
        req.url.startsWith(`${environment.apiUrl}/auth/register`);

      if (error.status === 401 && !isAuthEndpoint && !hasValidToken()) {
        authService.logout();
        router.navigate(['/login']);
      }

      return throwError(() => error);
    })
  );
};

function hasValidToken(): boolean {
  const token = localStorage.getItem('jwt_token');
  return typeof token === 'string' && token.length > 0;
}
