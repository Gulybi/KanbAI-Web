import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Informs the user that they were redirected to /login because they tried
 * to reach a protected URL, and where they'll return after signing in.
 *
 * Rendered only when a safe `returnUrl` is present on the login page.
 * The parent page is responsible for validating the URL via
 * `isSafeReturnUrl` before passing it in — this component assumes the
 * input has already been vetted.
 */
@Component({
  selector: 'app-login-context-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './context-banner.component.html',
  styleUrls: ['./context-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginContextBannerComponent {
  @Input({ required: true }) returnUrl!: string;
  @Output() cancel = new EventEmitter<void>();

  onCancel(): void {
    this.cancel.emit();
  }
}
