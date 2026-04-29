import { LOGIN_ROUTE, REGISTER_ROUTE } from '../constants/auth-routes';

/**
 * Decide whether a candidate `returnUrl` (typically read from a query
 * param) is safe to navigate to after a successful login.
 *
 * Safe ⇔
 *   - is a non-empty string
 *   - starts with a single `/` (in-app relative path)
 *   - is NOT `/login` or `/register` (would cause a redirect loop)
 *   - does NOT start with `//` (protocol-relative URL → external)
 *   - does NOT contain a scheme (`http:`, `https:`, `javascript:`, etc.)
 *
 * Callers (e.g., `LoginPageComponent.onSubmit`) should fall back to
 * `AUTH_HOME_ROUTE` when this returns `false`.
 */
export function isSafeReturnUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('/')) return false;      // must be in-app relative
  if (url.startsWith('//')) return false;       // protocol-relative → external

  // Compare path portion only so `/login?x=1` and `/login#frag` are
  // both rejected (they would otherwise bypass the exact-match check).
  const pathOnly = url.split(/[?#]/)[0];

  if (pathOnly === LOGIN_ROUTE || pathOnly.startsWith(LOGIN_ROUTE + '/')) return false;
  if (pathOnly === REGISTER_ROUTE || pathOnly.startsWith(REGISTER_ROUTE + '/')) return false;

  return true;
}
