import { AUTH_HOME_ROUTE, LOGIN_ROUTE, PROTECTED_PATHS, REGISTER_ROUTE, UNAUTH_ONLY_PATHS } from './auth-routes';

/**
 * QA gap-filler (issue #30): lock the auth-routes constants so that any
 * future edit to `AUTH_HOME_ROUTE` or `PROTECTED_PATHS` fails loudly
 * rather than silently breaking the dashboard redirect chain.
 *
 * Per the tech spec Unit Test Matrix row "auth-routes.ts constant change":
 *   (a) AUTH_HOME_ROUTE === '/dashboard'
 *   (b) PROTECTED_PATHS includes 'dashboard'
 */
describe('auth-routes constants', () => {
  describe('AUTH_HOME_ROUTE', () => {
    it('points to /dashboard (post-#30 authenticated home)', () => {
      // Arrange / Act / Assert
      expect(AUTH_HOME_ROUTE).toBe('/dashboard');
    });

    it('begins with a leading slash so Router.createUrlTree accepts it', () => {
      expect(AUTH_HOME_ROUTE.startsWith('/')).toBe(true);
    });
  });

  describe('LOGIN_ROUTE / REGISTER_ROUTE', () => {
    it('exposes the canonical /login path', () => {
      expect(LOGIN_ROUTE).toBe('/login');
    });

    it('exposes the canonical /register path', () => {
      expect(REGISTER_ROUTE).toBe('/register');
    });
  });

  describe('PROTECTED_PATHS', () => {
    it('includes "dashboard" so the dashboard route is contract-tested for authGuard', () => {
      expect(PROTECTED_PATHS).toContain('dashboard');
    });

    it('includes the parameterized board route "board/:projectId" for guard coverage', () => {
      // Issue #46 replaces the legacy `/board` shell route with
      // `/board/:projectId` so BoardPageComponent can read the project id
      // for JoinProjectGroup / LeaveProjectGroup. Guard coverage moves with it.
      expect(PROTECTED_PATHS).toContain('board/:projectId');
    });

    it('stores bare path segments (no leading slash) so routes.find(r => r.path === p) works', () => {
      for (const path of PROTECTED_PATHS) {
        expect(path.startsWith('/')).toBe(false);
      }
    });
  });

  describe('UNAUTH_ONLY_PATHS', () => {
    it('covers the landing page, login, and register', () => {
      expect(UNAUTH_ONLY_PATHS).toContain('');
      expect(UNAUTH_ONLY_PATHS).toContain('login');
      expect(UNAUTH_ONLY_PATHS).toContain('register');
    });

    it('does not accidentally include the authenticated dashboard path', () => {
      expect(UNAUTH_ONLY_PATHS).not.toContain('dashboard');
    });
  });
});
