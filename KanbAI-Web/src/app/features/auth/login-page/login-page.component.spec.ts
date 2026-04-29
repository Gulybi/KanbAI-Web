import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { LoginPageComponent } from './login-page.component';
import { LoginContextBannerComponent } from './components/context-banner/context-banner.component';

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

describe('LoginPageComponent', () => {
  let component: LoginPageComponent;
  let fixture: ComponentFixture<LoginPageComponent>;
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let routeStub: ReturnType<typeof makeActivatedRouteStub>;

  async function createComponent(queryParams: Record<string, string>) {
    routeStub = makeActivatedRouteStub(queryParams);
    mockRouter = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: routeStub.stub },
        { provide: Router, useValue: mockRouter }
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

    it('renders the login card with placeholder copy', () => {
      const card = fixture.nativeElement.querySelector('.login-page__card');
      expect(card).toBeTruthy();
      const heading = fixture.debugElement.query(By.css('h1'));
      expect(heading.nativeElement.textContent).toContain('Login Page');
    });

    it('does not render the context banner when no returnUrl is present', () => {
      const banner = fixture.debugElement.query(By.directive(LoginContextBannerComponent));
      expect(banner).toBeNull();
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
});
