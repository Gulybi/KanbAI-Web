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

    it('should define root redirect route', () => {
      const rootRoute = routes.find(r => r.path === '');
      expect(rootRoute).toBeTruthy();
      expect(rootRoute?.redirectTo).toBe('/login');
      expect(rootRoute?.pathMatch).toBe('full');
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
    it('should redirect root path to /login', async () => {
      await router.navigate(['']);
      expect(location.path()).toBe('/login');
    });

    it('should navigate to /login route', async () => {
      await router.navigate(['/login']);
      expect(location.path()).toBe('/login');
    });

    it('should navigate to /board route', async () => {
      await router.navigate(['/board']);
      expect(location.path()).toBe('/board');
    });

    it('should navigate from login to board', async () => {
      await router.navigate(['/login']);
      expect(location.path()).toBe('/login');

      await router.navigate(['/board']);
      expect(location.path()).toBe('/board');
    });

    it('should navigate from board to login', async () => {
      await router.navigate(['/board']);
      expect(location.path()).toBe('/board');

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
