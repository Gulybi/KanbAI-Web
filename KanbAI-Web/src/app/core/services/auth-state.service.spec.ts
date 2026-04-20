import { TestBed } from '@angular/core/testing';
import { AuthStateService } from './auth-state.service';

describe('AuthStateService', () => {
  let service: AuthStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthStateService]
    });
    service = TestBed.inject(AuthStateService);
  });

  describe('Service Creation', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });

  describe('Initial State', () => {
    it('should return false for isAuthenticated() initially', () => {
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should return null for getToken() initially', () => {
      expect(service.getToken()).toBeNull();
    });
  });

  describe('setAuthState()', () => {
    it('should update authentication state', () => {
      service.setAuthState('test-token', 'user-123');

      expect(service.isAuthenticated()).toBe(true);
      expect(service.getToken()).toBe('test-token');
    });

    it('should handle empty string token as authenticated', () => {
      service.setAuthState('', 'user-123');

      // Empty string is falsy, so should return false
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should update state when called multiple times', () => {
      service.setAuthState('token-1', 'user-1');
      expect(service.getToken()).toBe('token-1');

      service.setAuthState('token-2', 'user-2');
      expect(service.getToken()).toBe('token-2');
    });
  });

  describe('clearAuthState()', () => {
    it('should clear authentication state', () => {
      service.setAuthState('test-token', 'user-123');
      expect(service.isAuthenticated()).toBe(true);

      service.clearAuthState();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.getToken()).toBeNull();
    });

    it('should be idempotent (can be called multiple times)', () => {
      service.setAuthState('test-token', 'user-123');

      service.clearAuthState();
      service.clearAuthState();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.getToken()).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null token in setAuthState', () => {
      // TypeScript should prevent this, but testing runtime behavior
      (service as any).setAuthState(null, 'user-123');

      expect(service.isAuthenticated()).toBe(false);
    });

    it('should handle undefined token in setAuthState', () => {
      // TypeScript should prevent this, but testing runtime behavior
      (service as any).setAuthState(undefined, 'user-123');

      expect(service.isAuthenticated()).toBe(false);
    });
  });
});
