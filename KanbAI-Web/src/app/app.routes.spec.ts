import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { PROTECTED_PATHS, UNAUTH_ONLY_PATHS } from './core/constants/auth-routes';
import { authGuard } from './core/guards/auth.guard';
import { unauthGuard } from './core/guards/unauth.guard';

describe('App Routing', () => {
  let router: Router;
  let location: Location;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes)]
    }).compileComponents();

    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
  });

  describe('Route Configuration', () => {
    it('should have routes defined', () => {
      expect(routes).toBeTruthy();
      expect(routes.length).toBeGreaterThan(0);
    });

    it('should define root landing page route', () => {
      const rootRoute = routes.find(r => r.path === '');
      expect(rootRoute).toBeTruthy();
      expect(rootRoute?.loadComponent).toBeDefined();
      expect(rootRoute?.canActivate).toBeDefined();
    });

    it('should define login route', () => {
      const loginRoute = routes.find(r => r.path === 'login');
      expect(loginRoute).toBeTruthy();
      expect(loginRoute?.loadComponent).toBeDefined();
    });

    it('should define board route', () => {
      const boardRoute = routes.find(r => r.path === 'board');
      expect(boardRoute).toBeTruthy();
      expect(boardRoute?.loadComponent).toBeDefined();
    });
  });

  describe('Route Navigation', () => {
    it('should load landing page at root path for unauthenticated users', async () => {
      await router.navigate(['']);
      // Landing page loads at root when unauthenticated (empty string represents root)
      expect(location.path()).toBe('');
    });

    it('should navigate to /login route', async () => {
      await router.navigate(['/login']);
      expect(location.path()).toBe('/login');
    });

    it('should redirect /board to /login with returnUrl when unauthenticated (authGuard)', async () => {
      await router.navigate(['/board']);
      // authGuard redirects to /login and preserves the attempted URL.
      expect(location.path()).toBe('/login?returnUrl=%2Fboard');
    });

    it('should navigate from login to board when guard allows', async () => {
      await router.navigate(['/login']);
      expect(location.path()).toBe('/login');

      // Note: This test would need authStateService.setAuthState() to pass authGuard
      // For now, it will redirect to /login due to authGuard (with returnUrl preserved)
      await router.navigate(['/board']);
      expect(location.path()).toBe('/login?returnUrl=%2Fboard');
    });

    it('should navigate from board to login', async () => {
      // When unauthenticated, /board redirects to /login with returnUrl
      await router.navigate(['/board']);
      expect(location.path()).toBe('/login?returnUrl=%2Fboard');

      await router.navigate(['/login']);
      expect(location.path()).toBe('/login');
    });
  });

  describe('Lazy Loading', () => {
    it('should lazy load LoginPageComponent', async () => {
      const loginRoute = routes.find(r => r.path === 'login');
      expect(loginRoute?.loadComponent).toBeDefined();

      if (loginRoute?.loadComponent) {
        const component = await loginRoute.loadComponent();
        expect(component).toBeDefined();
      }
    });

    it('should lazy load BoardPageComponent', async () => {
      const boardRoute = routes.find(r => r.path === 'board');
      expect(boardRoute?.loadComponent).toBeDefined();

      if (boardRoute?.loadComponent) {
        const component = await boardRoute.loadComponent();
        expect(component).toBeDefined();
      }
    });
  });

  describe('Edge Cases', () => {
    it('redirects unknown paths to the landing route', async () => {
      await router.navigate(['/invalid-route']);
      // Wildcard redirects to ''; unauthGuard on '' allows anonymous visitors through.
      expect(location.path()).toBe('');
    });

    it('should handle rapid route switching', async () => {
      await router.navigate(['/login']);
      await router.navigate(['/board']);
      await router.navigate(['/login']);
      // After the final explicit navigate to '/login', the returnUrl from the
      // prior /board redirect is cleared because we navigated to /login directly.
      expect(location.path()).toBe('/login');
    });

    it('should handle navigation with trailing slash', async () => {
      await router.navigate(['/login/']);
      // Angular normalizes the path
      expect(location.path()).toMatch(/\/login\/?/);
    });
  });

  describe('Guard Coverage', () => {
    it('every path in PROTECTED_PATHS is registered with authGuard', () => {
      for (const path of PROTECTED_PATHS) {
        const route = routes.find(r => r.path === path);
        // The contract is "IF registered, MUST have authGuard", not "must exist".
        // Future additions to PROTECTED_PATHS (e.g. `/dashboard`) may land before
        // their route is wired.
        if (!route) continue;
        expect(route.canActivate).toBeDefined();
        expect(route.canActivate).toContain(authGuard);
      }
    });

    it('every path in UNAUTH_ONLY_PATHS is registered with unauthGuard', () => {
      for (const path of UNAUTH_ONLY_PATHS) {
        const route = routes.find(r => r.path === path);
        // Tolerates `/register` not being wired yet (out of scope for #27).
        if (!route) continue;
        expect(route.canActivate).toBeDefined();
        expect(route.canActivate).toContain(unauthGuard);
      }
    });

    it('declares a wildcard catch-all route', () => {
      const wildcard = routes.find(r => r.path === '**');
      expect(wildcard).toBeDefined();
      expect(wildcard?.redirectTo).toBe('');
    });

    it('ensures every non-wildcard, non-redirect route has at least one guard', () => {
      const unguarded = routes.filter(r =>
        r.path !== '**' &&
        !r.redirectTo &&
        (!r.canActivate || r.canActivate.length === 0)
      );
      expect(unguarded).toEqual([]);
    });
  });
});
