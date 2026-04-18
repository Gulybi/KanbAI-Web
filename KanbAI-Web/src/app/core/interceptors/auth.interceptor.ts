import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Authentication Interceptor
 *
 * This interceptor will eventually:
 * 1. Attach JWT tokens to outgoing requests
 * 2. Handle 401/403 authentication errors globally
 * 3. Redirect to login on authentication failures
 *
 * Current behavior: Pass-through (no modifications)
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only intercept requests to our API (not external APIs)
  if (req.url.startsWith(environment.apiUrl)) {
    // TODO: Attach JWT token from storage
    // const token = localStorage.getItem('auth_token');
    // if (token) {
    //   req = req.clone({
    //     setHeaders: {
    //       Authorization: `Bearer ${token}`
    //     }
    //   });
    // }
  }

  // Pass the request through to the next handler
  return next(req);

  // TODO: Add error handling for 401/403/500 responses
  // Example future implementation:
  // return next(req).pipe(
  //   catchError((error: HttpErrorResponse) => {
  //     if (error.status === 401) {
  //       // Redirect to login or dispatch logout action
  //     }
  //     return throwError(() => error);
  //   })
  // );
};
