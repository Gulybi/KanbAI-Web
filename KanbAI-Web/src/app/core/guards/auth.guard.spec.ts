import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthStateService } from '../services/auth-state.service';
import { signal } from '@angular/core';
import { vi } from 'vitest';

describe('authGuard', () => {
  let mockRouter: { parseUrl: ReturnType<typeof vi.fn> };
  let mockAuthStateService: Partial<AuthStateService>;

  beforeEach(() => {
    mockRouter = {
      parseUrl: vi.fn()
    };
    mockAuthStateService = {
      isAuthenticated: signal(false)
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: AuthStateService, useValue: mockAuthStateService }
      ]
    });
  });

  describe('Unauthenticated User', () => {
    it('should redirect to /login when user is not authenticated', () => {
      const mockUrlTree = {} as UrlTree;
      mockRouter.parseUrl.mockReturnValue(mockUrlTree);
      (mockAuthStateService.isAuthenticated as any).set(false);

      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, {} as any)
      );

      expect(mockRouter.parseUrl).toHaveBeenCalledWith('/login');
      expect(result).toBe(mockUrlTree);
    });
  });

  describe('Authenticated User', () => {
    it('should return true when user is authenticated', () => {
      (mockAuthStateService.isAuthenticated as any).set(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, {} as any)
      );

      expect(result).toBe(true);
      expect(mockRouter.parseUrl).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle state changes correctly', () => {
      (mockAuthStateService.isAuthenticated as any).set(false);

      let result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, {} as any)
      );
      expect(result).not.toBe(true);

      (mockAuthStateService.isAuthenticated as any).set(true);

      result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, {} as any)
      );
      expect(result).toBe(true);
    });
  });
});
