import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LoginContextBannerComponent } from './components/context-banner/context-banner.component';
import { isSafeReturnUrl } from '../../../core/guards/return-url.util';
import { AUTH_HOME_ROUTE, LOGIN_ROUTE } from '../../../core/constants/auth-routes';
import { AuthService } from '../../../core/services/AuthService';
import { FormCardComponent } from '../components/form-card/form-card.component';
import { FormInputComponent } from '../components/form-input/form-input.component';
import { FormButtonComponent } from '../components/form-button/form-button.component';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    LoginContextBannerComponent,
    FormCardComponent,
    FormInputComponent,
    FormButtonComponent,
  ],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

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

  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  get emailControl(): FormControl {
    return this.loginForm.get('email') as FormControl;
  }

  get passwordControl(): FormControl {
    return this.loginForm.get('password') as FormControl;
  }

  onSubmit(): void {
    if (!this.loginForm.valid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.value;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.login({ email, password }).subscribe({
      next: () => {
        const target = this.returnUrlSafe() ?? AUTH_HOME_ROUTE;
        this.router.navigateByUrl(target);
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(
          err.status === 401
            ? 'Invalid email or password.'
            : 'Sign-in failed. Please try again.'
        );
        this.isLoading.set(false);
      },
      complete: () => this.isLoading.set(false),
    });
  }

  onCancelReturn(): void {
    // Navigate to /login without the returnUrl query param — this tears the
    // banner down and signals the user has abandoned their original destination.
    this.router.navigate([LOGIN_ROUTE]);
  }
}
