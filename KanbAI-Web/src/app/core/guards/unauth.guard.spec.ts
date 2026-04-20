import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { unauthGuard } from './unauth.guard';
import { AuthStateService } from '../services/auth-state.service';
import { signal } from '@angular/core';
import { vi } from 'vitest';

describe('unauthGuard', () => {
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
    it('should return true when user is not authenticated', () => {
      (mockAuthStateService.isAuthenticated as any).set(false);

      const result = TestBed.runInInjectionContext(() =>
        unauthGuard({} as any, {} as any)
      );

      expect(result).toBe(true);
      expect(mockRouter.parseUrl).not.toHaveBeenCalled();
    });
  });

  describe('Authenticated User', () => {
    it('should redirect to /board when user is authenticated', () => {
      const mockUrlTree = {} as UrlTree;
      mockRouter.parseUrl.mockReturnValue(mockUrlTree);
      (mockAuthStateService.isAuthenticated as any).set(true);

      const result = TestBed.runInInjectionContext(() =>
        unauthGuard({} as any, {} as any)
      );

      expect(mockRouter.parseUrl).toHaveBeenCalledWith('/board');
      expect(result).toBe(mockUrlTree);
    });
  });

  describe('Edge Cases', () => {
    it('should handle state changes correctly', () => {
      (mockAuthStateService.isAuthenticated as any).set(true);

      let result = TestBed.runInInjectionContext(() =>
        unauthGuard({} as any, {} as any)
      );
      expect(result).not.toBe(true);

      (mockAuthStateService.isAuthenticated as any).set(false);

      result = TestBed.runInInjectionContext(() =>
        unauthGuard({} as any, {} as any)
      );
      expect(result).toBe(true);
    });
  });
});
