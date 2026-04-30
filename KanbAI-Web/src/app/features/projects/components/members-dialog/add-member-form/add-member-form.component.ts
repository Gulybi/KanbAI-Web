import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { FormInputComponent } from '../../../../auth/components/form-input/form-input.component';
import { FormButtonComponent } from '../../../../auth/components/form-button/form-button.component';
import { whitespaceOnlyValidator } from '../../../validators/whitespace.validator';

/**
 * Owner-only inline form with a single email input + submit button. Wraps
 * `FormInputComponent` and `FormButtonComponent` from the auth feature —
 * the same components `CreateProjectDialogComponent` uses.
 *
 * On submit the component trims the email and emits through `submitEmail`.
 * The smart parent is responsible for calling the state service and, on
 * success, bumping `resetCounter` — the form observes that via ngOnChanges
 * and resets + refocuses the input.
 */
@Component({
  selector: 'app-add-member-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormInputComponent, FormButtonComponent],
  templateUrl: './add-member-form.component.html',
  styleUrl: './add-member-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddMemberFormComponent implements OnChanges {
  @Input({ required: true }) disabled: boolean = false;
  @Input() errorMessage: string | null = null;
  @Input() resetCounter: number = 0;

  @Output() submitEmail = new EventEmitter<string>();

  @ViewChild('emailInputWrapper', { read: ElementRef })
  private emailInputWrapper?: ElementRef<HTMLElement>;

  protected readonly emailControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email, whitespaceOnlyValidator]
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resetCounter'] && !changes['resetCounter'].firstChange) {
      this.resetForm();
    }
  }

  protected onSubmit(): void {
    if (this.disabled) {
      return;
    }
    if (this.emailControl.invalid) {
      this.emailControl.markAsTouched();
      return;
    }
    const value = this.emailControl.value.trim();
    this.submitEmail.emit(value);
  }

  /** Public so the smart parent can programmatically refocus after 403 etc. */
  focusInput(): void {
    const input = this.emailInputWrapper?.nativeElement.querySelector('input');
    if (input) {
      (input as HTMLInputElement).focus();
    }
  }

  private resetForm(): void {
    this.emailControl.setValue('');
    this.emailControl.markAsUntouched();
    this.emailControl.markAsPristine();
    // Refocus on next microtask so Angular finishes applying the reset
    // (and the child FormInputComponent re-renders) before we call focus().
    queueMicrotask(() => this.focusInput());
  }
}
