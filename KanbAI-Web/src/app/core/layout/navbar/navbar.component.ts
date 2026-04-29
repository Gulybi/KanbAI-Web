import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/AuthService';
import { LOGIN_ROUTE } from '../../constants/auth-routes';

@Component({
  selector: 'app-navbar',
  imports: [],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Exposed directly (not wrapped in a computed) — see tech spec Q1.
  // Signal reads in the template drive OnPush re-renders automatically.
  readonly currentUser = this.authService.currentUser;

  /**
   * Clears the session and returns the user to the login page.
   *
   * Order matters: `logout()` is synchronous — it resets `currentUser`
   * so the navbar's @if gate flips in the *current* change-detection
   * tick, before router navigation kicks in. This satisfies the
   * acceptance criterion that the anonymous state render at or before
   * the route transition.
   */
  onLogout(): void {
    this.authService.logout();
    this.router.navigateByUrl(LOGIN_ROUTE);
  }
}
