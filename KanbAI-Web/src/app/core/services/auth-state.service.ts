import { Injectable, signal, computed, inject } from '@angular/core';

export interface AuthState {
  token: string | null;
  userId: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private state = signal<AuthState>({
    token: null,
    userId: null
  });

  /**
   * Computed signal indicating if user is authenticated.
   */
  isAuthenticated = computed(() => !!this.state().token);

  /**
   * Get current authentication token.
   */
  getToken(): string | null {
    return this.state().token;
  }

  /**
   * Set authentication state (e.g., after successful login).
   */
  setAuthState(token: string, userId: string): void {
    this.state.set({ token, userId });
  }

  /**
   * Clear authentication state (e.g., on logout).
   */
  clearAuthState(): void {
    this.state.set({ token: null, userId: null });
  }
}
