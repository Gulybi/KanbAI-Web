import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthStateService } from '../services/auth-state.service';
import { LOGIN_ROUTE } from '../constants/auth-routes';
import { signal } from '@angular/core';
import { vi } from 'vitest';

describe('authGuard', () => {
  let mockRouter: { createUrlTree: ReturnType<typeof vi.fn> };
  let mockAuthStateService: Partial<AuthStateService>;

  beforeEach(() => {
    mockRouter = {
      createUrlTree: vi.fn()
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

  describe('Authenticated User', () => {
    it('should return true when user is authenticated', () => {
      (mockAuthStateService.isAuthenticated as any).set(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/board' } as any)
      );

      expect(result).toBe(true);
      expect(mockRouter.createUrlTree).not.toHaveBeenCalled();
    });
  });

  describe('Unauthenticated User', () => {
    it('should redirect to /login with returnUrl when attempting /board', () => {
      const mockUrlTree = {} as UrlTree;
      mockRouter.createUrlTree.mockReturnValue(mockUrlTree);
      (mockAuthStateService.isAuthenticated as any).set(false);

      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/board' } as any)
      );

      expect(mockRouter.createUrlTree).toHaveBeenCalledTimes(1);
      expect(mockRouter.createUrlTree).toHaveBeenCalledWith(
        [LOGIN_ROUTE],
        { queryParams: { returnUrl: '/board' } }
      );
      expect(result).toBe(mockUrlTree);
    });

    it('should preserve a nested URL as returnUrl', () => {
      const mockUrlTree = {} as UrlTree;
      mockRouter.createUrlTree.mockReturnValue(mockUrlTree);
      (mockAuthStateService.isAuthenticated as any).set(false);

      TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/board/abc-123' } as any)
      );

      expect(mockRouter.createUrlTree).toHaveBeenCalledWith(
        [LOGIN_ROUTE],
        { queryParams: { returnUrl: '/board/abc-123' } }
      );
    });

    it('should not attach returnUrl when attempted URL is root', () => {
      const mockUrlTree = {} as UrlTree;
      mockRouter.createUrlTree.mockReturnValue(mockUrlTree);
      (mockAuthStateService.isAuthenticated as any).set(false);

      TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/' } as any)
      );

      expect(mockRouter.createUrlTree).toHaveBeenCalledWith([LOGIN_ROUTE]);
    });

    it('should not attach returnUrl when attempted URL is empty', () => {
      const mockUrlTree = {} as UrlTree;
      mockRouter.createUrlTree.mockReturnValue(mockUrlTree);
      (mockAuthStateService.isAuthenticated as any).set(false);

      TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '' } as any)
      );

      expect(mockRouter.createUrlTree).toHaveBeenCalledWith([LOGIN_ROUTE]);
    });
  });

  describe('Edge Cases', () => {
    it('should re-evaluate on each call as the signal changes', () => {
      const mockUrlTree = {} as UrlTree;
      mockRouter.createUrlTree.mockReturnValue(mockUrlTree);

      (mockAuthStateService.isAuthenticated as any).set(false);
      let result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/board' } as any)
      );
      expect(result).toBe(mockUrlTree);

      (mockAuthStateService.isAuthenticated as any).set(true);
      result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/board' } as any)
      );
      expect(result).toBe(true);
    });
  });
});
