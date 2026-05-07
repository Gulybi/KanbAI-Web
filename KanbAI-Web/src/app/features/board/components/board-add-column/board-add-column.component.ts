import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  ViewChild,
  afterNextRender,
  effect,
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
import { duplicateExistingColumnNameValidator } from '../../validators/duplicate-existing-column-name.validator';

/**
 * Presentational inline form for adding a single new column on the board.
 *
 * Pure child component:
 *  - Owns its own `FormControl<string>` with the standard issue #70
 *    column-name validator set (`required`, `maxLength(100)`,
 *    `whitespaceOnly`, `duplicateExisting`).
 *  - Reads `existingColumnNames()` to drive the duplicate validator and
 *    calls `updateValueAndValidity()` in an `effect` so SignalR-driven
 *    mid-typing collisions flag correctly.
 *  - Emits `submitted(trimmedName: string)` on valid Enter / click,
 *    `cancelled()` on Escape / Cancel button.
 *  - Parent (`BoardPageComponent`) owns the HTTP call, the submit /
 *    error signals, and the close behaviour.
 *  - NO HTTP, NO state-service injection, NO router, NO `@if`-level
 *    lifecycle management beyond its own control.
 */
@Component({
  selector: 'app-board-add-column',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormInputComponent],
  templateUrl: './board-add-column.component.html',
  styleUrl: './board-add-column.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardAddColumnComponent {
  /**
   * Names of columns already on the board — passed by the parent as
   * `columns().map(c => c.name)`. The duplicate validator reads this
   * signal every time it runs, so updates propagate through the
   * validator's re-evaluation (triggered by the `effect` below).
   */
  readonly existingColumnNames = input.required<readonly string[]>();

  /**
   * True while the parent's HTTP create is in flight. Disables the form
   * controls and swaps the submit label to `"Adding…"`.
   */
  readonly submitting = input<boolean>(false);

  /**
   * Inline server-side error copy (from `mapColumnErrorToUserMessage`).
   * Rendered below the input with `role="alert"` — null hides the row.
   */
  readonly submitError = input<string | null>(null);

  /** Emits the trimmed, validated name when the user submits. */
  readonly submitted = output<string>();

  /** Emits when the user cancels (Escape key, Cancel button). */
  readonly cancelled = output<void>();

  private readonly injector = inject(Injector);

  /** Host for the wrapped `FormInputComponent` — used to find the native input for auto-focus. */
  @ViewChild('nameWrap', { static: true, read: ElementRef })
  private readonly nameWrap?: ElementRef<HTMLElement>;

  /**
   * Single-field reactive control. Mirrors issue #70's column-name rules
   * (`required`, `maxLength(100)`, `whitespaceOnly`, `duplicateExisting`).
   * `nonNullable: true` matches the #70 precedent.
   */
  protected readonly nameControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(100),
      whitespaceOnlyValidator,
      duplicateExistingColumnNameValidator(this.existingColumnNames)
    ]
  });

  constructor() {
    // Re-run the column-name validators whenever the parent's name list
    // changes (e.g. SignalR `ColumnCreated` fires mid-typing and a new
    // name slides into `existingColumnNames()`). Without this effect the
    // `duplicateExisting` validator only re-evaluates on user edits.
    effect(() => {
      this.existingColumnNames();
      this.nameControl.updateValueAndValidity({ emitEvent: false });
    });

    // Auto-focus the native input on first render — same pattern as
    // `ColumnDraftListComponent.addColumn` so the user can type
    // immediately without an extra Tab.
    afterNextRender(
      () => {
        const host = this.nameWrap?.nativeElement;
        const input = host?.querySelector<HTMLInputElement>('input');
        input?.focus();
      },
      { injector: this.injector }
    );
  }

  // ----------------------------------------------------------------------
  // User actions
  // ----------------------------------------------------------------------

  protected onSubmit(event?: Event): void {
    // Always suppress the browser's default form submission (full page
    // reload). We cannot rely on `(ngSubmit)` here because the form has no
    // associated `FormGroup`/`NgForm` directive — just an individual
    // `[formControl]`-bound input — so the native `(submit)` event is the
    // path Angular lets us hook.
    event?.preventDefault();

    // Surface pending validation errors for a user who mashed Enter without
    // editing the field (e.g. first-render Enter on an empty control).
    this.nameControl.markAsTouched();
    this.nameControl.markAsDirty();

    if (this.nameControl.invalid || this.submitting()) {
      return;
    }
    const trimmed = this.nameControl.value.trim();
    this.submitted.emit(trimmed);
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }

  /**
   * Keyboard handler for the whole form.
   *
   *  - `Escape` → cancel (preventDefault so the key does not bubble to any
   *    parent dialog/dropdown).
   *  - `Enter` inside the form is handled by the native `<form ngSubmit>` —
   *    no per-key work here.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
    }
  }
}
