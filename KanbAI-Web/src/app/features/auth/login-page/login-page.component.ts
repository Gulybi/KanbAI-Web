import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LoginContextBannerComponent } from './components/context-banner/context-banner.component';
import { isSafeReturnUrl } from '../../../core/guards/return-url.util';
import { LOGIN_ROUTE } from '../../../core/constants/auth-routes';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, LoginContextBannerComponent],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap
  });

  /**
   * The `returnUrl` query param, but only exposed when it passes the
   * safety check. When the raw value is missing, unsafe, or external,
   * this returns `null` and the context banner is not rendered.
   */
  readonly returnUrlSafe = computed<string | null>(() => {
    const raw = this.queryParams().get('returnUrl');
    return isSafeReturnUrl(raw) ? raw : null;
  });

  onCancelReturn(): void {
    // Navigate to /login without the returnUrl query param — this tears the
    // banner down and signals the user has abandoned their original destination.
    this.router.navigate([LOGIN_ROUTE]);
  }
}
