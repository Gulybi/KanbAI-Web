import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  FormControl,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { FormCardComponent } from '../components/form-card/form-card.component';
import { FormInputComponent } from '../components/form-input/form-input.component';
import { FormButtonComponent } from '../components/form-button/form-button.component';
import { AuthService } from '../../../core/services/AuthService';
import { passwordMatchValidator } from '../validator/password-match.validator';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterModule,
    FormCardComponent,
    FormInputComponent,
    FormButtonComponent,
  ],
  templateUrl: './register-page.component.html',
  styleUrl: './register-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPageComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  public registerForm: FormGroup = this.fb.group(
    {
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator },
  );

  public isLoading: boolean = false;

  get nameControl() {
    return this.registerForm.get('name') as FormControl;
  }
  get emailControl() {
    return this.registerForm.get('email') as FormControl;
  }
  get passwordControl() {
    return this.registerForm.get('password') as FormControl;
  }
  get confirmPasswordControl() {
    return this.registerForm.get('confirmPassword') as FormControl;
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.isLoading = true;
      const { name, email, password } = this.registerForm.value;

      this.authService.register({ name, email, password }).subscribe({
        next: () => {
          this.router.navigate(['/login']);
        },
        error: (err) => {
          console.error('Registration failed', err);
          this.isLoading = false;
        },
        complete: () => {
          this.isLoading = false;
        },
      });
    } else {
      this.registerForm.markAllAsTouched();
    }
  }
}
