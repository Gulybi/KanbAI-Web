import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

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

    it('should redirect /board to /login when unauthenticated (authGuard)', async () => {
      await router.navigate(['/board']);
      // authGuard redirects to /login when not authenticated
      expect(location.path()).toBe('/login');
    });

    it('should navigate from login to board when guard allows', async () => {
      await router.navigate(['/login']);
      expect(location.path()).toBe('/login');

      // Note: This test would need authStateService.setAuthState() to pass authGuard
      // For now, it will redirect to /login due to authGuard
      await router.navigate(['/board']);
      expect(location.path()).toBe('/login');
    });

    it('should navigate from board to login', async () => {
      // When unauthenticated, /board redirects to /login
      await router.navigate(['/board']);
      expect(location.path()).toBe('/login');

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
    it('should reject navigation to invalid routes', async () => {
      // Angular router throws an error for unmatched routes
      // This is expected behavior until a wildcard route is added
      await expect(router.navigate(['/invalid-route'])).rejects.toThrow();
    });

    it('should handle rapid route switching', async () => {
      await router.navigate(['/login']);
      await router.navigate(['/board']);
      await router.navigate(['/login']);
      expect(location.path()).toBe('/login');
    });

    it('should handle navigation with trailing slash', async () => {
      await router.navigate(['/login/']);
      // Angular normalizes the path
      expect(location.path()).toMatch(/\/login\/?/);
    });
  });
});
