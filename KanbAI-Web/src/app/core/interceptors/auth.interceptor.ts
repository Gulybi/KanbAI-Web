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
      if (error.status === 401) {
        authService.logout();
        router.navigate(['/login']);
      }

      return throwError(() => error);
    })
  );
};
