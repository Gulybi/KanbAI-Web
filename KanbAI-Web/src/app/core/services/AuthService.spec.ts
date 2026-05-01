import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './AuthService';
import { AuthStateService } from './auth-state.service';
import { AuthResponseDto, LoginRequestDto, RegisterRequestDto } from '../models/auth.models';
import { environment } from '../../../environments/environment';

/**
 * AuthService covers the root-cause fix introduced in issue #55:
 *
 * 1. `handleAuthSuccess` must populate BOTH the `currentUser` signal AND
 *    `AuthStateService` (the state-split bug that caused authenticated
 *    users to be blocked by `authGuard`).
 * 2. `logout()` must clear BOTH `currentUser` AND `AuthStateService`
 *    (required for the logout-redirect fix).
 * 3. The login/register URL must be derived from `environment.apiUrl`
 *    (the API-URL reconciliation fix).
 */
describe('AuthService', () => {
  let service: AuthService;
  let authStateService: AuthStateService;
  let httpTesting: HttpTestingController;
  let originalLocalStorage: Storage | undefined;

  // Vitest's default `node` environment has no `localStorage`. AuthService
  // reads/writes `localStorage.jwt_token` directly, so we stub an in-memory
  // shim the same way `auth.interceptor.spec.ts` does and restore the
  // original afterward.
  beforeAll(() => {
    originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size; }
    } as Storage;
  });

  afterAll(() => {
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    } else {
      (globalThis as { localStorage: Storage }).localStorage = originalLocalStorage;
    }
  });

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
        AuthStateService
      ]
    });

    service = TestBed.inject(AuthService);
    authStateService = TestBed.inject(AuthStateService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  const successResponse: AuthResponseDto = {
    token: 'jwt-abc-123',
    user: { id: 'user-7', name: 'Alex Doe', email: 'alex@company.com' }
  };

  describe('Service Creation', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('starts with currentUser === null', () => {
      expect(service.currentUser()).toBeNull();
    });

    it('does not mark AuthStateService authenticated on construction', () => {
      expect(authStateService.isAuthenticated()).toBe(false);
    });
  });

  describe('login()', () => {
    it('POSTs to `${environment.apiUrl}/auth/login` with the credentials', () => {
      const credentials: LoginRequestDto = { email: 'alex@company.com', password: 'secret' };

      service.login(credentials).subscribe();

      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(credentials);
      req.flush(successResponse);
    });

    it('on success, writes the token to localStorage', () => {
      service.login({ email: 'a@b.c', password: 'pw' }).subscribe();

      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush(successResponse);

      expect(localStorage.getItem('jwt_token')).toBe(successResponse.token);
    });

    it('on success, sets the currentUser signal', () => {
      service.login({ email: 'a@b.c', password: 'pw' }).subscribe();

      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush(successResponse);

      expect(service.currentUser()).toEqual(successResponse.user);
    });

    it('on success, populates AuthStateService so isAuthenticated() is true (root-cause fix)', () => {
      expect(authStateService.isAuthenticated()).toBe(false);

      service.login({ email: 'a@b.c', password: 'pw' }).subscribe();

      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush(successResponse);

      expect(authStateService.isAuthenticated()).toBe(true);
      expect(authStateService.getToken()).toBe(successResponse.token);
    });

    it('on success, both currentUser and AuthStateService flip together (atomic write)', () => {
      service.login({ email: 'a@b.c', password: 'pw' }).subscribe();
      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush(successResponse);

      // Both surfaces must be in sync — this is what the state-split bug broke.
      expect(service.currentUser()).not.toBeNull();
      expect(authStateService.isAuthenticated()).toBe(true);
    });

    it('on 401 failure, does NOT write to localStorage, currentUser, or AuthStateService', () => {
      let capturedError: unknown;
      service.login({ email: 'a@b.c', password: 'wrong' }).subscribe({
        next: () => {
          throw new Error('should have errored');
        },
        error: (err) => { capturedError = err; }
      });

      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush({ message: 'Invalid email or password.' }, { status: 401, statusText: 'Unauthorized' });

      expect(capturedError).toBeTruthy();
      expect(localStorage.getItem('jwt_token')).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(authStateService.isAuthenticated()).toBe(false);
    });
  });

  describe('register()', () => {
    it('POSTs to `${environment.apiUrl}/auth/register` with the payload', () => {
      const payload: RegisterRequestDto = { name: 'Alex', email: 'a@b.c', password: 'pw' };

      service.register(payload).subscribe();

      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/register`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(successResponse);
    });

    it('on success, populates currentUser AND AuthStateService (same atomic write as login)', () => {
      service.register({ name: 'Alex', email: 'a@b.c', password: 'pw' }).subscribe();

      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/register`);
      req.flush(successResponse);

      expect(service.currentUser()).toEqual(successResponse.user);
      expect(authStateService.isAuthenticated()).toBe(true);
      expect(localStorage.getItem('jwt_token')).toBe(successResponse.token);
    });
  });

  describe('logout()', () => {
    beforeEach(() => {
      // Arrange: simulate a logged-in state so logout has something to tear down.
      service.login({ email: 'a@b.c', password: 'pw' }).subscribe();
      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush(successResponse);
    });

    it('removes the jwt_token from localStorage', () => {
      expect(localStorage.getItem('jwt_token')).toBe(successResponse.token);

      service.logout();

      expect(localStorage.getItem('jwt_token')).toBeNull();
    });

    it('resets currentUser to null', () => {
      expect(service.currentUser()).not.toBeNull();

      service.logout();

      expect(service.currentUser()).toBeNull();
    });

    it('clears AuthStateService so isAuthenticated() returns false (AC: logout)', () => {
      expect(authStateService.isAuthenticated()).toBe(true);

      service.logout();

      expect(authStateService.isAuthenticated()).toBe(false);
      expect(authStateService.getToken()).toBeNull();
    });

    it('is idempotent — calling logout() twice leaves state cleared', () => {
      service.logout();
      service.logout();

      expect(localStorage.getItem('jwt_token')).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(authStateService.isAuthenticated()).toBe(false);
    });

    it('can be called from a logged-out state without error (AC: post-logout navigation safety)', () => {
      service.logout(); // first logout clears everything
      expect(() => service.logout()).not.toThrow();
    });
  });

  describe('URL configuration', () => {
    it('derives the login endpoint from environment.apiUrl (not a hard-coded host)', () => {
      service.login({ email: 'a@b.c', password: 'pw' }).subscribe();

      // If the AuthService regresses back to a hard-coded localhost URL that
      // diverges from environment.apiUrl, this expectOne will fail.
      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
      expect(req.request.url.startsWith(environment.apiUrl)).toBe(true);
      req.flush(successResponse);
    });

    it('derives the register endpoint from environment.apiUrl', () => {
      service.register({ name: 'A', email: 'a@b.c', password: 'pw' }).subscribe();

      const req = httpTesting.expectOne(`${environment.apiUrl}/auth/register`);
      expect(req.request.url.startsWith(environment.apiUrl)).toBe(true);
      req.flush(successResponse);
    });
  });
});
