import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  ViewChild,
  afterNextRender,
  inject,
  input,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { FormInputComponent } from '../../../auth/components/form-input/form-input.component';
import { whitespaceOnlyValidator } from '../../../projects/validators/whitespace.validator';

/**
 * Presentational inline form for adding a single new task inside one
 * board column (issue #78).
 *
 * Mirror-twin of `BoardAddColumnComponent` (issue #77) one scope level
 * down: the form itself knows nothing about columns, tasks, or HTTP.
 *  - Owns a single `FormControl<string>` with the standard task-title
 *    validators (`required`, `maxLength(200)`, `whitespaceOnly`).
 *    Tasks intentionally allow duplicate titles per the #78 context
 *    doc, so no `duplicateExisting` validator — and no `effect()`
 *    watching an outside signal.
 *  - Auto-focuses on `afterNextRender` so the user can type immediately.
 *  - Emits `submitted(trimmedTitle: string)` on valid submit,
 *    `cancelled()` on Escape / Cancel button.
 *  - Parent (`BoardPageComponent`) owns the HTTP call, the submit /
 *    error signals, and the close behaviour.
 *  - NO HTTP, NO state-service injection, NO router.
 */
@Component({
  selector: 'app-board-add-task',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormInputComponent],
  templateUrl: './board-add-task.component.html',
  styleUrl: './board-add-task.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardAddTaskComponent {
  /**
   * True while the parent's HTTP create is in flight. Disables the form
   * controls and swaps the submit label to `"Adding…"`.
   */
  readonly submitting = input<boolean>(false);

  /**
   * Inline server-side error copy (from `mapTaskCreateErrorToUserMessage`).
   * Rendered below the input with `role="alert"` — null hides the row.
   */
  readonly submitError = input<string | null>(null);

  /** Emits the trimmed, validated title when the user submits. */
  readonly submitted = output<string>();

  /** Emits when the user cancels (Escape key, Cancel button). */
  readonly cancelled = output<void>();

  private readonly injector = inject(Injector);

  /** Host for the wrapped `FormInputComponent` — used to find the native input for auto-focus. */
  @ViewChild('titleWrap', { static: true, read: ElementRef })
  private readonly titleWrap?: ElementRef<HTMLElement>;

  /**
   * Single-field reactive control. Matches the task-title rules pinned by
   * the tech spec D11: `required`, `maxLength(200)`, `whitespaceOnly`.
   * `nonNullable: true` matches the #77 precedent.
   */
  protected readonly titleControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(200),
      whitespaceOnlyValidator
    ]
  });

  constructor() {
    // Auto-focus the native input on first render so the user can type
    // immediately without an extra Tab — same pattern as
    // `BoardAddColumnComponent`.
    afterNextRender(
      () => {
        const host = this.titleWrap?.nativeElement;
        const input = host?.querySelector<HTMLInputElement>('input');
        input?.focus();
      },
      { injector: this.injector }
    );
  }

  protected onSubmit(event?: Event): void {
    // Suppress the browser's default full-page reload.
    event?.preventDefault();

    // Surface pending validation errors for a user who mashed Enter without
    // editing the field.
    this.titleControl.markAsTouched();
    this.titleControl.markAsDirty();

    if (this.titleControl.invalid || this.submitting()) {
      return;
    }
    const trimmed = this.titleControl.value.trim();
    this.submitted.emit(trimmed);
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }

  /**
   * Keyboard handler for the whole form.
   *
   *  - `Escape` → cancel (preventDefault so the key does not bubble to any
   *    parent dialog/drawer).
   *  - `Enter` inside the form is handled by the native `(submit)` —
   *    no per-key work here.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
    }
  }
}
