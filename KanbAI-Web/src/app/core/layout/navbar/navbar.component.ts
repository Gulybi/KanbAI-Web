import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/AuthService';
import { AuthStateService } from '../../services/auth-state.service';
import { AUTH_HOME_ROUTE, LOGIN_ROUTE, PUBLIC_HOME_ROUTE } from '../../constants/auth-routes';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  // Branch gate reads AuthStateService.isAuthenticated() — the same source
  // the guards read. Tech spec Design Decision #1.
  readonly isAuthenticated = this.authState.isAuthenticated;

  // Display-only read for the authenticated branch's user-name span.
  readonly currentUser = this.authService.currentUser;

  // Context-aware brand target: public landing when anonymous, dashboard
  // when authenticated. Memoized via computed() so it only recomputes
  // when isAuthenticated flips.
  readonly brandTargetRoute = computed(() =>
    this.isAuthenticated() ? AUTH_HOME_ROUTE : PUBLIC_HOME_ROUTE
  );

  /**
   * Clears the session and returns the user to the login page.
   *
   * Order matters: `logout()` is synchronous — it resets both auth
   * signals so the navbar's @if gate flips in the *current* change-
   * detection tick, before router navigation kicks in.
   */
  onLogout(): void {
    this.authService.logout();
    this.router.navigateByUrl(LOGIN_ROUTE);
  }
}
