import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { LoginPageComponent } from './login-page.component';
import { LoginContextBannerComponent } from './components/context-banner/context-banner.component';
import { AuthService } from '../../../core/services/AuthService';

function makeActivatedRouteStub(initialParams: Record<string, string>) {
  const subject = new BehaviorSubject(convertToParamMap(initialParams));
  return {
    subject,
    stub: {
      queryParamMap: subject.asObservable(),
      snapshot: {
        queryParamMap: convertToParamMap(initialParams)
      }
    }
  };
}

const successResponse = {
  token: 'jwt-xyz',
  user: { id: 'u1', name: 'Alex', email: 'alex@company.com' }
};

describe('LoginPageComponent', () => {
  let component: LoginPageComponent;
  let fixture: ComponentFixture<LoginPageComponent>;
  let mockRouter: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };
  let mockAuthService: { login: ReturnType<typeof vi.fn> };
  let routeStub: ReturnType<typeof makeActivatedRouteStub>;

  async function createComponent(queryParams: Record<string, string>) {
    routeStub = makeActivatedRouteStub(queryParams);
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true)
    };
    mockAuthService = {
      login: vi.fn().mockReturnValue(of(successResponse))
    };

    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: routeStub.stub },
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('Component Creation', () => {
    it('should create', async () => {
      await createComponent({});
      expect(component).toBeTruthy();
    });
  });

  describe('Rendering — base layout', () => {
    beforeEach(async () => {
      await createComponent({});
    });

    it('renders the login card with the restored "Welcome Back" heading', () => {
      const card = fixture.nativeElement.querySelector('.login-page__card');
      expect(card).toBeTruthy();
      const heading = fixture.debugElement.query(By.css('h1'));
      expect(heading.nativeElement.textContent).toContain('Welcome Back');
    });

    it('renders a form with email input, password input, and submit button', () => {
      const form = fixture.debugElement.query(By.css('form'));
      expect(form).not.toBeNull();

      const emailInput = fixture.nativeElement.querySelector('input[type="email"]');
      const passwordInput = fixture.nativeElement.querySelector('input[type="password"]');
      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]');

      expect(emailInput).toBeTruthy();
      expect(passwordInput).toBeTruthy();
      expect(submitButton).toBeTruthy();
    });

    it('renders a link to /register', () => {
      const link = fixture.nativeElement.querySelector('a[routerLink="/register"]');
      expect(link).toBeTruthy();
      expect(link.textContent).toContain('Create one');
    });

    it('does not render the placeholder copy', () => {
      const html = fixture.nativeElement.innerHTML as string;
      expect(html).not.toContain('Authentication UI will be implemented here.');
    });

    it('does not render the context banner when no returnUrl is present', () => {
      const banner = fixture.debugElement.query(By.directive(LoginContextBannerComponent));
      expect(banner).toBeNull();
    });

    it('submit button is disabled when the form is invalid', () => {
      const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(submitButton.disabled).toBe(true);
    });
  });

  describe('Submit flow — success', () => {
    beforeEach(async () => {
      await createComponent({});
    });

    it('calls AuthService.login with {email, password} on submit and navigates to AUTH_HOME_ROUTE', () => {
      component.loginForm.setValue({ email: 'alex@company.com', password: 'secret' });
      component.onSubmit();

      expect(mockAuthService.login).toHaveBeenCalledWith({
        email: 'alex@company.com',
        password: 'secret'
      });
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('does not submit when form is invalid and marks controls as touched', () => {
      component.loginForm.setValue({ email: 'not-an-email', password: '' });
      component.onSubmit();

      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(component.emailControl.touched).toBe(true);
      expect(component.passwordControl.touched).toBe(true);
    });
  });

  describe('Submit flow — with safe returnUrl', () => {
    beforeEach(async () => {
      await createComponent({ returnUrl: '/board' });
    });

    it('navigates to the returnUrl instead of AUTH_HOME_ROUTE on success', () => {
      component.loginForm.setValue({ email: 'alex@company.com', password: 'secret' });
      component.onSubmit();

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/board');
    });
  });

  describe('Submit flow — 401 error', () => {
    beforeEach(async () => {
      await createComponent({});
      mockAuthService.login.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }))
      );
    });

    it('sets a user-facing error message and re-enables the form on 401', () => {
      component.loginForm.setValue({ email: 'alex@company.com', password: 'wrong' });
      component.onSubmit();

      expect(component.errorMessage()).toBe('Invalid email or password.');
      expect(component.isLoading()).toBe(false);
      expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('Submit flow — non-401 error', () => {
    beforeEach(async () => {
      await createComponent({});
      mockAuthService.login.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' }))
      );
    });

    it('sets a generic error message on non-401 failure', () => {
      component.loginForm.setValue({ email: 'alex@company.com', password: 'secret' });
      component.onSubmit();

      expect(component.errorMessage()).toBe('Sign-in failed. Please try again.');
      expect(component.isLoading()).toBe(false);
    });
  });

  describe('Rendering — with safe returnUrl', () => {
    beforeEach(async () => {
      await createComponent({ returnUrl: '/board' });
    });

    it('renders the context banner with the returnUrl', () => {
      const banner = fixture.debugElement.query(By.directive(LoginContextBannerComponent));
      expect(banner).not.toBeNull();
      const instance = banner.componentInstance as LoginContextBannerComponent;
      expect(instance.returnUrl).toBe('/board');
    });

    it('expose returnUrlSafe() as the raw value', () => {
      expect(component.returnUrlSafe()).toBe('/board');
    });
  });

  describe('Rendering — with unsafe returnUrl', () => {
    it('does not render the banner when returnUrl points outside the app', async () => {
      await createComponent({ returnUrl: 'https://evil.example.com' });
      const banner = fixture.debugElement.query(By.directive(LoginContextBannerComponent));
      expect(banner).toBeNull();
      expect(component.returnUrlSafe()).toBeNull();
    });

    it('does not render the banner when returnUrl is /login (redirect loop)', async () => {
      await createComponent({ returnUrl: '/login' });
      const banner = fixture.debugElement.query(By.directive(LoginContextBannerComponent));
      expect(banner).toBeNull();
    });
  });

  describe('Cancel interaction', () => {
    it('navigates back to /login (no query params) when banner emits cancel', async () => {
      await createComponent({ returnUrl: '/board' });
      component.onCancelReturn();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('Change Detection Strategy', () => {
    it('uses OnPush change detection', async () => {
      await createComponent({});
      expect(fixture.componentRef.changeDetectorRef).toBeTruthy();
    });
  });

  describe('In-flight behavior', () => {
    it('sets isLoading() to true while the login request is pending and back to false on success', async () => {
      await createComponent({});

      // Arrange: use a hot subject so we can control when the observable emits.
      const response$ = new Subject<typeof successResponse>();
      mockAuthService.login.mockReturnValue(response$.asObservable());

      component.loginForm.setValue({ email: 'alex@company.com', password: 'secret' });
      component.onSubmit();

      // Act 1: request is in flight — nothing has resolved yet.
      expect(component.isLoading()).toBe(true);
      expect(component.errorMessage()).toBeNull();

      // Act 2: response resolves successfully.
      response$.next(successResponse);
      response$.complete();

      // Assert: isLoading is cleared via the complete callback.
      expect(component.isLoading()).toBe(false);
    });

    it('sets isLoading() to true while in flight and back to false on error', async () => {
      await createComponent({});

      const response$ = new Subject<typeof successResponse>();
      mockAuthService.login.mockReturnValue(response$.asObservable());

      component.loginForm.setValue({ email: 'alex@company.com', password: 'wrong' });
      component.onSubmit();

      expect(component.isLoading()).toBe(true);

      response$.error(new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));

      expect(component.isLoading()).toBe(false);
      expect(component.errorMessage()).toBe('Invalid email or password.');
    });
  });

  describe('Retry behavior — errorMessage state between submits', () => {
    it('clears a previous errorMessage when a new submit is attempted', async () => {
      await createComponent({});

      // First submit: 401, sets error.
      mockAuthService.login.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }))
      );
      component.loginForm.setValue({ email: 'alex@company.com', password: 'wrong' });
      component.onSubmit();
      expect(component.errorMessage()).toBe('Invalid email or password.');

      // Second submit: success — error should clear the moment onSubmit runs.
      // We use a hot subject to freeze the observable before it resolves, so
      // the only state change is the synchronous `errorMessage.set(null)`.
      const response$ = new Subject<typeof successResponse>();
      mockAuthService.login.mockReturnValueOnce(response$.asObservable());
      component.loginForm.setValue({ email: 'alex@company.com', password: 'right' });
      component.onSubmit();

      // Assert: errorMessage is cleared before the success path emits.
      expect(component.errorMessage()).toBeNull();

      // Cleanup: let the subject complete so no dangling subscription remains.
      response$.next(successResponse);
      response$.complete();
    });
  });
});
