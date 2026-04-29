import { ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { NavbarComponent } from './navbar.component';
import { AuthService } from '../../services/AuthService';
import { LOGIN_ROUTE } from '../../constants/auth-routes';
import { UserProfileDto } from '../../models/auth.models';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let authService: AuthService;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    router = { navigateByUrl: vi.fn() };

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
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);

    // Start each spec in the anonymous state — explicit reset shields
    // us from any lingering signal writes between tests.
    authService.currentUser.set(null);
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

      const heading = fixture.debugElement.query(By.css('h1'));
      expect(heading).toBeTruthy();
      expect(heading.nativeElement.textContent).toContain('KanbAI');
    });

    it('should apply the canonical navbar layout class to <nav>', () => {
      fixture.detectChanges();

      const navElement = fixture.nativeElement.querySelector('nav');
      expect(navElement.classList.contains('navbar')).toBe(true);
    });

    it('should apply the canonical brand class to <h1>', () => {
      fixture.detectChanges();

      const heading = fixture.nativeElement.querySelector('h1');
      expect(heading.classList.contains('navbar__brand')).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should use semantic nav element', () => {
      fixture.detectChanges();

      const navElement = fixture.nativeElement.querySelector('nav');
      expect(navElement).toBeTruthy();
      expect(navElement.tagName.toLowerCase()).toBe('nav');
    });

    it('should have proper heading hierarchy', () => {
      fixture.detectChanges();

      const h1 = fixture.nativeElement.querySelector('h1');
      expect(h1).toBeTruthy();
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

      const heading = fixture.nativeElement.querySelector('h1');
      expect(heading.textContent).toContain('KanbAI');
    });
  });

  describe('Change Detection Strategy', () => {
    it('should use OnPush change detection', () => {
      // Read the real compiled component definition to prove AC #12 —
      // the decorator is authoritative, not the presence of the instance.
      // Angular stores the compiled strategy on `ɵcmp.onPush` (boolean).
      const def = (NavbarComponent as unknown as {
        ɵcmp: { onPush: boolean };
      }).ɵcmp;

      expect(def).toBeTruthy();
      expect(def.onPush).toBe(true);
      expect(ChangeDetectionStrategy.OnPush).toBe(0); // sanity: enum shape unchanged
    });
  });

  describe('Auth-aware rendering', () => {
    const mockUser: UserProfileDto = {
      id: 'u1',
      name: 'Jane Doe',
      email: 'jane@example.com'
    };

    it('should not render the user-name span when currentUser is null', () => {
      authService.currentUser.set(null);
      fixture.detectChanges();

      const userName = fixture.debugElement.query(
        By.css('[data-testid="navbar-user-name"]')
      );
      expect(userName).toBeNull();
    });

    it('should not render a Logout button when currentUser is null', () => {
      authService.currentUser.set(null);
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('nav button'));
      const logoutMatches = buttons.filter(
        btn => (btn.nativeElement.textContent ?? '').trim() === 'Logout'
      );
      expect(logoutMatches.length).toBe(0);
    });

    it('should render the user name when currentUser is populated', () => {
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const userName = fixture.debugElement.query(
        By.css('[data-testid="navbar-user-name"]')
      );
      expect(userName).toBeTruthy();
      expect(userName.nativeElement.textContent.trim()).toBe('Jane Doe');
    });

    it('should render the Logout button when currentUser is populated', () => {
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('nav button'));
      const logoutBtn = buttons.find(
        btn => (btn.nativeElement.textContent ?? '').trim() === 'Logout'
      );
      expect(logoutBtn).toBeTruthy();
    });

    it('should re-render reactively when currentUser transitions null -> populated', () => {
      authService.currentUser.set(null);
      fixture.detectChanges();

      let buttons = fixture.debugElement.queryAll(By.css('nav button'));
      expect(
        buttons.some(btn => (btn.nativeElement.textContent ?? '').trim() === 'Logout')
      ).toBe(false);

      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      buttons = fixture.debugElement.queryAll(By.css('nav button'));
      expect(
        buttons.some(btn => (btn.nativeElement.textContent ?? '').trim() === 'Logout')
      ).toBe(true);
    });

    it('should invoke AuthService.logout() exactly once when Logout is clicked', () => {
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const logoutSpy = vi.spyOn(authService, 'logout');
      const button = fixture.debugElement.query(By.css('nav button'));
      button.nativeElement.click();

      expect(logoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should navigate to LOGIN_ROUTE when Logout is clicked', () => {
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('nav button'));
      button.nativeElement.click();

      expect(router.navigateByUrl).toHaveBeenCalledWith(LOGIN_ROUTE);
    });

    it('should clear AuthService.currentUser when Logout is clicked', () => {
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('nav button'));
      button.nativeElement.click();

      expect(authService.currentUser()).toBeNull();
    });

    it('should collapse back to anonymous state after Logout is clicked', () => {
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('nav button'));
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
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('nav button')).nativeElement as HTMLButtonElement;
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
    });

    it('should expose the auth cluster with role="group" and aria-label="Account"', () => {
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const cluster = fixture.debugElement.query(
        By.css('.navbar__auth-cluster')
      );
      expect(cluster).toBeTruthy();
      expect(cluster.nativeElement.getAttribute('role')).toBe('group');
      expect(cluster.nativeElement.getAttribute('aria-label')).toBe('Account');
    });

    it('should remove the jwt_token from localStorage when Logout is clicked', () => {
      // Seed the storage stub the way a real login would have.
      localStorage.setItem('jwt_token', 'seeded-token');
      authService.currentUser.set(mockUser);
      fixture.detectChanges();

      const removeSpy = vi.spyOn(localStorage, 'removeItem');

      const button = fixture.debugElement.query(By.css('nav button'));
      button.nativeElement.click();

      expect(removeSpy).toHaveBeenCalledWith('jwt_token');
      expect(localStorage.getItem('jwt_token')).toBeNull();
    });
  });
});
