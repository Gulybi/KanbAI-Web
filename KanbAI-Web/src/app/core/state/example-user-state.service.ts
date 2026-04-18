import { Injectable, inject, Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { BaseStateService } from './base-state.service';
import { environment } from '../../../environments/environment';

/**
 * User model representing an authenticated user
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

/**
 * State shape for user authentication and profile management
 */
export interface UserState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Example state service demonstrating the BaseStateService pattern.
 * Manages authenticated user state, profile data, and authentication status.
 *
 * This service serves as a reference implementation for creating
 * feature-specific state services throughout the application.
 *
 * Usage in components:
 * ```typescript
 * @Component({...})
 * class MyComponent {
 *   private userState = inject(UserStateService);
 *
 *   // Access reactive state
 *   user = this.userState.currentUser;
 *   isAdmin = this.userState.isAdmin;
 *
 *   // Trigger state updates
 *   ngOnInit() {
 *     this.userState.loadUser();
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class UserStateService extends BaseStateService<UserState> {
  private http = inject(HttpClient);

  // Public selectors (read-only signals)
  readonly currentUser: Signal<User | null> = this.select(state => state.currentUser);
  readonly isAuthenticated: Signal<boolean> = this.select(state => state.isAuthenticated);
  readonly isLoading: Signal<boolean> = this.select(state => state.isLoading);
  readonly error: Signal<string | null> = this.select(state => state.error);

  // Computed values derived from state
  readonly isAdmin: Signal<boolean> = this.select(state =>
    state.currentUser?.role === 'admin'
  );

  /**
   * Provide initial state for the service.
   * Called once during service initialization.
   */
  protected getInitialState(): UserState {
    return {
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    };
  }

  /**
   * Load current user from backend API.
   * Typically called on app initialization to restore session.
   *
   * Sets loading state, fetches user data, and updates authentication status.
   * On error, clears loading state and sets error message.
   */
  loadUser(): void {
    this.setState({ isLoading: true, error: null });

    this.http.get<User>(`${environment.apiUrl}/auth/me`)
      .pipe(
        catchError(error => {
          console.error('Failed to load user:', error);
          this.setState({
            isLoading: false,
            error: 'Failed to load user'
          });
          return of(null);
        })
      )
      .subscribe(user => {
        this.setState({
          currentUser: user,
          isAuthenticated: !!user,
          isLoading: false,
          error: null
        });
      });
  }

  /**
   * Set user after successful login.
   * Updates state to reflect authenticated user.
   *
   * @param user - User object returned from login API
   */
  setUser(user: User): void {
    this.setState({
      currentUser: user,
      isAuthenticated: true,
      error: null
    });
  }

  /**
   * Clear user state on logout.
   * Resets all state back to initial values (unauthenticated).
   */
  logout(): void {
    this.replaceState(this.getInitialState());
  }

  /**
   * Update specific user profile properties.
   * Used after profile edits to sync state without full reload.
   *
   * Example:
   * ```typescript
   * userState.updateUserProfile({ name: 'New Name' });
   * ```
   *
   * @param updates - Partial user object with properties to update
   */
  updateUserProfile(updates: Partial<User>): void {
    const currentUser = this.getState().currentUser;
    if (!currentUser) {
      console.warn('Cannot update profile: no user logged in');
      return;
    }

    this.setState({
      currentUser: { ...currentUser, ...updates }
    });
  }
}
