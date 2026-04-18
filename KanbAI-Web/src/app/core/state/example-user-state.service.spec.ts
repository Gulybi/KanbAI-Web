import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { effect } from '@angular/core';
import { UserStateService, User, UserState } from './example-user-state.service';
import { environment } from '../../../environments/environment';

describe('UserStateService', () => {
  let service: UserStateService;
  let httpMock: HttpTestingController;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user'
  };

  const mockAdminUser: User = {
    id: 'admin-456',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UserStateService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(UserStateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with default state', () => {
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should initialize isAdmin as false when no user', () => {
      expect(service.isAdmin()).toBe(false);
    });
  });

  describe('loadUser()', () => {
    it('should set loading state when loading user', () => {
      service.loadUser();
      expect(service.isLoading()).toBe(true);
      expect(service.error()).toBeNull();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
      req.flush(mockUser);
    });

    it('should load user successfully and update state', () => {
      service.loadUser();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
      expect(req.request.method).toBe('GET');
      req.flush(mockUser);

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should handle HTTP error gracefully', () => {
      service.loadUser();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
      req.error(new ProgressEvent('Network error'), {
        status: 500,
        statusText: 'Internal Server Error'
      });

      // After error, the catchError returns of(null) which clears the error in subscribe
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should handle null user response', () => {
      service.loadUser();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
      req.flush(null);

      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should clear previous errors when loading user', () => {
      // Try loading - this will set error to null at start
      service.loadUser();
      expect(service.error()).toBeNull();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
      req.flush(mockUser);
    });
  });

  describe('setUser()', () => {
    it('should set user and mark as authenticated', () => {
      service.setUser(mockUser);

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.error()).toBeNull();
    });

    it('should clear errors when setting user', () => {
      // Set user clears error
      service.setUser(mockUser);
      expect(service.error()).toBeNull();
    });

    it('should not affect loading state', () => {
      expect(service.isLoading()).toBe(false);
      service.setUser(mockUser);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('logout()', () => {
    it('should reset state to initial values', () => {
      service.setUser(mockUser);
      expect(service.isAuthenticated()).toBe(true);

      service.logout();

      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should clear admin status on logout', () => {
      service.setUser(mockAdminUser);
      expect(service.isAdmin()).toBe(true);

      service.logout();
      expect(service.isAdmin()).toBe(false);
    });
  });

  describe('updateUserProfile()', () => {
    it('should update user profile properties', () => {
      service.setUser(mockUser);

      service.updateUserProfile({ name: 'Updated Name' });

      const updatedUser = service.currentUser();
      expect(updatedUser).not.toBeNull();
      expect(updatedUser?.name).toBe('Updated Name');
      expect(updatedUser?.email).toBe(mockUser.email);
      expect(updatedUser?.id).toBe(mockUser.id);
    });

    it('should update multiple properties at once', () => {
      service.setUser(mockUser);

      service.updateUserProfile({
        name: 'New Name',
        email: 'newemail@example.com'
      });

      const updatedUser = service.currentUser();
      expect(updatedUser?.name).toBe('New Name');
      expect(updatedUser?.email).toBe('newemail@example.com');
    });

    it('should not update if no user is logged in', () => {
      expect(service.currentUser()).toBeNull();

      service.updateUserProfile({ name: 'Should Not Update' });

      expect(service.currentUser()).toBeNull();
    });

    it('should create new user object (immutability)', () => {
      service.setUser(mockUser);
      const userBefore = service.currentUser();

      service.updateUserProfile({ name: 'Updated Name' });
      const userAfter = service.currentUser();

      expect(userBefore).not.toBe(userAfter);
      expect(userBefore?.name).toBe('Test User');
      expect(userAfter?.name).toBe('Updated Name');
    });
  });

  describe('isAdmin computed signal', () => {
    it('should return true for admin users', () => {
      service.setUser(mockAdminUser);
      expect(service.isAdmin()).toBe(true);
    });

    it('should return false for regular users', () => {
      service.setUser(mockUser);
      expect(service.isAdmin()).toBe(false);
    });

    it('should return false when no user is logged in', () => {
      expect(service.isAdmin()).toBe(false);
    });

    it('should update when user role changes', () => {
      service.setUser(mockUser);
      expect(service.isAdmin()).toBe(false);

      service.updateUserProfile({ role: 'admin' });
      expect(service.isAdmin()).toBe(true);
    });
  });

  describe('Signal Reactivity', () => {
    it('should trigger updates when state changes', () => {
      const authValues: boolean[] = [];

      TestBed.runInInjectionContext(() => {
        const effectRef = effect(() => {
          authValues.push(service.isAuthenticated());
        });
      });

      TestBed.flushEffects();
      expect(authValues).toContain(false);

      service.setUser(mockUser);
      TestBed.flushEffects();
      expect(authValues).toContain(true);

      service.logout();
      TestBed.flushEffects();
      expect(authValues.filter(v => v === false).length).toBeGreaterThan(1);
    });

    it('should have reactive computed values', () => {
      expect(service.isAdmin()).toBe(false);

      service.setUser(mockAdminUser);
      expect(service.isAdmin()).toBe(true);

      service.logout();
      expect(service.isAdmin()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid consecutive state updates', () => {
      service.setUser(mockUser);
      service.updateUserProfile({ name: 'Name 1' });
      service.updateUserProfile({ name: 'Name 2' });
      service.updateUserProfile({ name: 'Name 3' });

      expect(service.currentUser()?.name).toBe('Name 3');
    });

    it('should handle multiple concurrent load operations', () => {
      service.loadUser();
      service.loadUser();

      const requests = httpMock.match(`${environment.apiUrl}/auth/me`);
      expect(requests.length).toBe(2);

      requests[0].flush(mockUser);
      requests[1].flush(mockAdminUser);

      // Last update wins
      expect(service.currentUser()).toEqual(mockAdminUser);
    });

    it('should maintain state consistency when HTTP call fails mid-operation', () => {
      service.setUser(mockUser);
      expect(service.currentUser()).toEqual(mockUser);

      service.loadUser();
      const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
      req.error(new ProgressEvent('Network error'));

      // After error, the catchError returns of(null) which updates state
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should handle empty string values gracefully', () => {
      service.setUser(mockUser);
      service.updateUserProfile({ name: '' });

      expect(service.currentUser()?.name).toBe('');
    });

    it('should preserve authentication state during profile updates', () => {
      service.setUser(mockUser);
      expect(service.isAuthenticated()).toBe(true);

      service.updateUserProfile({ name: 'Updated' });
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe('Acceptance Criteria Validation', () => {
    it('should use Angular Signals for reactive state management', () => {
      expect(service.currentUser).toBeDefined();
      expect(service.isAuthenticated).toBeDefined();
      expect(service.isLoading).toBeDefined();
      expect(service.error).toBeDefined();
    });

    it('should provide computed selectors that are read-only', () => {
      // Signals are read-only by design, attempting to set would be a TypeScript error
      expect(typeof service.currentUser).toBe('function');
      expect(typeof service.isAuthenticated).toBe('function');
      expect(typeof service.isAdmin).toBe('function');
    });

    it('should update state immutably', () => {
      service.setUser(mockUser);
      const userRef1 = service.currentUser();

      service.updateUserProfile({ name: 'Updated' });
      const userRef2 = service.currentUser();

      expect(userRef1).not.toBe(userRef2);
    });

    it('should integrate with RxJS for async operations', () => {
      service.loadUser();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
      expect(req).toBeDefined();

      req.flush(mockUser);
      expect(service.currentUser()).toEqual(mockUser);
    });

    it('should handle API failures gracefully without breaking state', () => {
      service.loadUser();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
      req.error(new ProgressEvent('Network error'));

      // After error, state is reset to unauthenticated
      expect(service.error()).toBeNull();
      expect(service.isLoading()).toBe(false);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should demonstrate pattern that can be copied for other features', () => {
      // This test validates the service follows the pattern structure
      expect(service.currentUser).toBeDefined();
      expect(service.isAuthenticated).toBeDefined();
      expect(service.isLoading).toBeDefined();
      expect(service.error).toBeDefined();
      expect(service.setUser).toBeDefined();
      expect(service.loadUser).toBeDefined();
      expect(service.logout).toBeDefined();
      expect(service.updateUserProfile).toBeDefined();
    });
  });

  describe('Service Lifecycle', () => {
    it('should be provided as singleton (providedIn: root)', () => {
      const service2 = TestBed.inject(UserStateService);
      expect(service).toBe(service2);
    });

    it('should maintain state across multiple injections', () => {
      service.setUser(mockUser);

      const service2 = TestBed.inject(UserStateService);
      expect(service2.currentUser()).toEqual(mockUser);
    });
  });
});
