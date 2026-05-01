import { ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi, MockInstance } from 'vitest';

import { NavbarComponent } from './navbar.component';
import { AuthService } from '../../services/AuthService';
import { AuthStateService } from '../../services/auth-state.service';
import {
  AUTH_HOME_ROUTE,
  LOGIN_ROUTE,
  PUBLIC_HOME_ROUTE,
  REGISTER_ROUTE
} from '../../constants/auth-routes';
import { UserProfileDto } from '../../models/auth.models';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let authService: AuthService;
  let authStateService: AuthStateService;
  let router: Router;
  let navigateByUrlSpy: MockInstance<Router['navigateByUrl']>;

  const mockUser: UserProfileDto = {
    id: 'u1',
    name: 'Jane Doe',
    email: 'jane@example.com'
  };

  function signInAs(user: UserProfileDto): void {
    authService.currentUser.set(user);
    authStateService.setAuthState('test-token', user.id);
  }

  function signOut(): void {
    authService.currentUser.set(null);
    authStateService.clearAuthState();
  }

  beforeEach(async () => {
    // The Angular-on-Vitest test environment exposes `localStorage` as
    // an object but its prototype methods (`removeItem`, `getItem`,
    // `setItem`) raise "is not a function" when invoked from sandboxed
    // user code. Install a plain in-memory stub so the real
    // `AuthService.logout()` can run end-to-end inside these specs.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      }
    });

    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // `RouterLink` injects the real `Router`; `provideRouter([])`
        // registers a minimal route table so the directive can build
        // UrlTrees and so `ActivatedRoute` is resolvable in the
        // component's injector.
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    authStateService = TestBed.inject(AuthStateService);
    router = TestBed.inject(Router);

    // Spy on the real Router's navigateByUrl without swapping the
    // instance — this lets RouterLink keep using the same Router while
    // we observe the logout navigation call. Returning a resolved
    // Promise mirrors the real signature so downstream code never awaits
    // a pending navigation.
    navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    // Start each spec in the anonymous state across BOTH signals.
    signOut();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Rendering', () => {
    it('should render navbar with correct semantic HTML tag', () => {
      fixture.detectChanges();

      const navElement = fixture.debugElement.query(By.css('nav'));
      expect(navElement).toBeTruthy();
    });

    it('should display KanbAI application name', () => {
      fixture.detectChanges();

      const brand = fixture.debugElement.query(By.css('.navbar__brand'));
      expect(brand).toBeTruthy();
      expect(brand.nativeElement.textContent).toContain('KanbAI');
    });

    it('should apply the canonical navbar layout class to <nav>', () => {
      fixture.detectChanges();

      const navElement = fixture.nativeElement.querySelector('nav');
      expect(navElement.classList.contains('navbar')).toBe(true);
    });

    it('should apply the canonical brand class to the brand anchor', () => {
      fixture.detectChanges();

      const brand = fixture.nativeElement.querySelector('.navbar__brand');
      expect(brand).toBeTruthy();
      expect(brand.classList.contains('navbar__brand')).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should use semantic nav element', () => {
      fixture.detectChanges();

      const navElement = fixture.nativeElement.querySelector('nav');
      expect(navElement).toBeTruthy();
      expect(navElement.tagName.toLowerCase()).toBe('nav');
    });

    it('should render the brand as an <a>, not an <h1>', () => {
      fixture.detectChanges();

      const brandAnchor = fixture.nativeElement.querySelector('a.navbar__brand');
      expect(brandAnchor).toBeTruthy();

      const h1 = fixture.nativeElement.querySelector('nav h1');
      expect(h1).toBeNull();
    });

    it('should expose an accessible name on the brand anchor identifying it as home', () => {
      fixture.detectChanges();

      const brand = fixture.nativeElement.querySelector('.navbar__brand') as HTMLElement;
      const ariaLabel = brand.getAttribute('aria-label') ?? '';
      expect(ariaLabel.length).toBeGreaterThan(0);
      expect(ariaLabel.toLowerCase()).toContain('home');
    });
  });

  describe('Edge Cases', () => {
    it('should render correctly without errors', () => {
      expect(() => {
        fixture.detectChanges();
      }).not.toThrow();
    });

    it('should not break with multiple detectChanges calls', () => {
      fixture.detectChanges();
      fixture.detectChanges();
      fixture.detectChanges();

      const brand = fixture.nativeElement.querySelector('.navbar__brand');
      expect(brand.textContent).toContain('KanbAI');
    });
  });

  describe('Change Detection Strategy', () => {
    it('should use OnPush change detection', () => {
      const def = (NavbarComponent as unknown as {
        ɵcmp: { onPush: boolean };
      }).ɵcmp;

      expect(def).toBeTruthy();
      expect(def.onPush).toBe(true);
      expect(ChangeDetectionStrategy.OnPush).toBe(0); // sanity: enum shape unchanged
    });
  });

  describe('Authenticated branch', () => {
    it('should render the user name when signed in', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const userName = fixture.debugElement.query(
        By.css('[data-testid="navbar-user-name"]')
      );
      expect(userName).toBeTruthy();
      expect(userName.nativeElement.textContent.trim()).toBe('Jane Doe');
    });

    it('should render the Logout button when signed in', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('nav button'));
      const logoutBtn = buttons.find(
        btn => (btn.nativeElement.textContent ?? '').trim() === 'Logout'
      );
      expect(logoutBtn).toBeTruthy();
    });

    it('should invoke AuthService.logout() exactly once when Logout is clicked', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const logoutSpy = vi.spyOn(authService, 'logout');
      const button = fixture.debugElement.query(By.css('.navbar__logout-btn'));
      button.nativeElement.click();

      expect(logoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should navigate to LOGIN_ROUTE when Logout is clicked', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.navbar__logout-btn'));
      button.nativeElement.click();

      expect(navigateByUrlSpy).toHaveBeenCalledWith(LOGIN_ROUTE);
    });

    it('should clear AuthService.currentUser when Logout is clicked', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.navbar__logout-btn'));
      button.nativeElement.click();

      expect(authService.currentUser()).toBeNull();
    });

    it('should collapse back to anonymous state after Logout is clicked', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.navbar__logout-btn'));
      button.nativeElement.click();
      fixture.detectChanges();

      const userName = fixture.debugElement.query(
        By.css('[data-testid="navbar-user-name"]')
      );
      expect(userName).toBeNull();

      const buttonsAfter = fixture.debugElement.queryAll(By.css('nav button'));
      expect(
        buttonsAfter.some(
          btn => (btn.nativeElement.textContent ?? '').trim() === 'Logout'
        )
      ).toBe(false);
    });

    it('should render Logout as a native <button type="button"> for keyboard activation', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.navbar__logout-btn')).nativeElement as HTMLButtonElement;
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
    });

    it('should expose the auth cluster with role="group" and aria-label="Account"', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const cluster = fixture.debugElement.query(
        By.css('.navbar__auth-cluster')
      );
      expect(cluster).toBeTruthy();
      expect(cluster.nativeElement.getAttribute('role')).toBe('group');
      expect(cluster.nativeElement.getAttribute('aria-label')).toBe('Account');
    });

    it('should remove the jwt_token from localStorage when Logout is clicked', () => {
      localStorage.setItem('jwt_token', 'seeded-token');
      signInAs(mockUser);
      fixture.detectChanges();

      const removeSpy = vi.spyOn(localStorage, 'removeItem');

      const button = fixture.debugElement.query(By.css('.navbar__logout-btn'));
      button.nativeElement.click();

      expect(removeSpy).toHaveBeenCalledWith('jwt_token');
      expect(localStorage.getItem('jwt_token')).toBeNull();
    });
  });

  describe('Anonymous branch', () => {
    it('should render a Login control with routerLink to /login', () => {
      signOut();
      fixture.detectChanges();

      const loginLink = fixture.debugElement.query(By.css('.navbar__login-btn'));
      expect(loginLink).toBeTruthy();
      expect(loginLink.nativeElement.textContent.trim()).toBe('Login');

      // `RouterLink` on an <a> renders the resolved target to the `href`
      // attribute — a black-box assertion that survives internal
      // refactors of the directive's private fields.
      expect((loginLink.nativeElement as HTMLAnchorElement).getAttribute('href'))
        .toBe(LOGIN_ROUTE);
    });

    it('should render a Register control with routerLink to /register', () => {
      signOut();
      fixture.detectChanges();

      const registerLink = fixture.debugElement.query(By.css('.navbar__register-btn'));
      expect(registerLink).toBeTruthy();
      expect(registerLink.nativeElement.textContent.trim()).toBe('Register');

      expect((registerLink.nativeElement as HTMLAnchorElement).getAttribute('href'))
        .toBe(REGISTER_ROUTE);
    });

    it('should not render user-name span or Logout button when anonymous', () => {
      signOut();
      fixture.detectChanges();

      const userName = fixture.debugElement.query(
        By.css('[data-testid="navbar-user-name"]')
      );
      expect(userName).toBeNull();

      const buttons = fixture.debugElement.queryAll(By.css('nav button'));
      const logoutMatches = buttons.filter(
        btn => (btn.nativeElement.textContent ?? '').trim() === 'Logout'
      );
      expect(logoutMatches.length).toBe(0);
    });

    it('should never simultaneously render Login and Logout controls', () => {
      signOut();
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.navbar__login-btn'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.navbar__logout-btn'))).toBeNull();

      signInAs(mockUser);
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.navbar__login-btn'))).toBeNull();
      expect(fixture.debugElement.query(By.css('.navbar__logout-btn'))).toBeTruthy();
    });

    it('should expose the auth cluster with role="group" and aria-label="Authentication" when anonymous', () => {
      signOut();
      fixture.detectChanges();

      const cluster = fixture.debugElement.query(
        By.css('.navbar__auth-cluster')
      );
      expect(cluster).toBeTruthy();
      expect(cluster.nativeElement.getAttribute('role')).toBe('group');
      expect(cluster.nativeElement.getAttribute('aria-label')).toBe('Authentication');
    });
  });

  describe('Reactive auth-state transitions', () => {
    it('should swap anonymous -> authenticated cluster on login', () => {
      signOut();
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.navbar__login-btn'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.navbar__register-btn'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.navbar__logout-btn'))).toBeNull();

      signInAs(mockUser);
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.navbar__login-btn'))).toBeNull();
      expect(fixture.debugElement.query(By.css('.navbar__register-btn'))).toBeNull();
      expect(fixture.debugElement.query(By.css('.navbar__logout-btn'))).toBeTruthy();
    });

    it('should swap authenticated -> anonymous cluster on logout', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.navbar__logout-btn'))).toBeTruthy();

      signOut();
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.navbar__logout-btn'))).toBeNull();
      expect(fixture.debugElement.query(By.css('.navbar__login-btn'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.navbar__register-btn'))).toBeTruthy();
    });
  });

  describe('Context-aware brand', () => {
    function readBrandTarget(): string | null {
      const brand = fixture.debugElement.query(By.css('.navbar__brand'));
      return (brand.nativeElement as HTMLAnchorElement).getAttribute('href');
    }

    it('should target PUBLIC_HOME_ROUTE when anonymous', () => {
      signOut();
      fixture.detectChanges();

      expect(readBrandTarget()).toBe(PUBLIC_HOME_ROUTE);
    });

    it('should target AUTH_HOME_ROUTE when authenticated', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      expect(readBrandTarget()).toBe(AUTH_HOME_ROUTE);
    });

    it('should flip the brand target reactively when auth state flips', () => {
      signOut();
      fixture.detectChanges();
      expect(readBrandTarget()).toBe(PUBLIC_HOME_ROUTE);

      signInAs(mockUser);
      fixture.detectChanges();
      expect(readBrandTarget()).toBe(AUTH_HOME_ROUTE);

      signOut();
      fixture.detectChanges();
      expect(readBrandTarget()).toBe(PUBLIC_HOME_ROUTE);
    });
  });

  describe('Branch gate — single source of truth (regression locks)', () => {
    it('should render the authenticated branch when only AuthStateService says so', () => {
      // Token set, currentUser intentionally left null — the gate must still flip.
      authService.currentUser.set(null);
      authStateService.setAuthState('test-token', 'orphan-user-id');
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.navbar__logout-btn'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.navbar__login-btn'))).toBeNull();
    });

    it('should render the anonymous branch when only AuthService.currentUser is set', () => {
      // currentUser set but no token in AuthStateService — anonymous branch wins.
      authStateService.clearAuthState();
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.navbar__login-btn'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.navbar__register-btn'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.navbar__logout-btn'))).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Extended QA coverage — gap-fill pass.
  // These specs pin AC behaviors that were not directly covered by
  // the developer's first pass: containment of anonymous controls
  // inside the cluster region, Router activation on brand click,
  // and the `brandTargetRoute` computed contract at the signal
  // layer (defense-in-depth alongside the DOM href assertion).
  // ────────────────────────────────────────────────────────────────

  describe('Anonymous cluster containment (AC: right-hand region)', () => {
    it('should render Login and Register as children of .navbar__auth-cluster', () => {
      signOut();
      fixture.detectChanges();

      const cluster = fixture.nativeElement.querySelector('.navbar__auth-cluster') as HTMLElement;
      expect(cluster).toBeTruthy();

      const loginInsideCluster = cluster.querySelector('.navbar__login-btn');
      const registerInsideCluster = cluster.querySelector('.navbar__register-btn');
      expect(loginInsideCluster).toBeTruthy();
      expect(registerInsideCluster).toBeTruthy();
    });

    it('should render user-name and Logout as children of .navbar__auth-cluster', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const cluster = fixture.nativeElement.querySelector('.navbar__auth-cluster') as HTMLElement;
      expect(cluster).toBeTruthy();

      const userNameInsideCluster = cluster.querySelector('[data-testid="navbar-user-name"]');
      const logoutInsideCluster = cluster.querySelector('.navbar__logout-btn');
      expect(userNameInsideCluster).toBeTruthy();
      expect(logoutInsideCluster).toBeTruthy();
    });
  });

  describe('Brand click activation (AC: Context-Aware Logo navigation)', () => {
    it('should route to PUBLIC_HOME_ROUTE when the brand is clicked while anonymous', () => {
      signOut();
      fixture.detectChanges();

      const brand = fixture.debugElement.query(By.css('.navbar__brand'));
      brand.nativeElement.click();

      // RouterLink delegates to Router.navigateByUrl with a UrlTree whose
      // serialized form equals the brand's target. Assert the serialized
      // URL rather than object identity so the test is resilient to
      // internal UrlTree construction changes.
      expect(navigateByUrlSpy).toHaveBeenCalled();
      const arg = navigateByUrlSpy.mock.calls.at(-1)?.[0];
      const serialized = typeof arg === 'string' ? arg : router.serializeUrl(arg!);
      expect(serialized).toBe(PUBLIC_HOME_ROUTE);
    });

    it('should route to AUTH_HOME_ROUTE when the brand is clicked while authenticated', () => {
      signInAs(mockUser);
      fixture.detectChanges();

      const brand = fixture.debugElement.query(By.css('.navbar__brand'));
      brand.nativeElement.click();

      expect(navigateByUrlSpy).toHaveBeenCalled();
      const arg = navigateByUrlSpy.mock.calls.at(-1)?.[0];
      const serialized = typeof arg === 'string' ? arg : router.serializeUrl(arg!);
      expect(serialized).toBe(AUTH_HOME_ROUTE);
    });
  });

  describe('brandTargetRoute computed contract', () => {
    it('should compute PUBLIC_HOME_ROUTE when isAuthenticated() is false', () => {
      signOut();
      expect(component.brandTargetRoute()).toBe(PUBLIC_HOME_ROUTE);
    });

    it('should compute AUTH_HOME_ROUTE when isAuthenticated() is true', () => {
      signInAs(mockUser);
      expect(component.brandTargetRoute()).toBe(AUTH_HOME_ROUTE);
    });

    it('should recompute reactively across rapid state flips', () => {
      signOut();
      expect(component.brandTargetRoute()).toBe(PUBLIC_HOME_ROUTE);

      signInAs(mockUser);
      expect(component.brandTargetRoute()).toBe(AUTH_HOME_ROUTE);

      signOut();
      expect(component.brandTargetRoute()).toBe(PUBLIC_HOME_ROUTE);

      signInAs(mockUser);
      expect(component.brandTargetRoute()).toBe(AUTH_HOME_ROUTE);
    });
  });
});
