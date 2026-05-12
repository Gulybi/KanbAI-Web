import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
  input,
  output
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

import {
  DeleteProjectConfirmData,
  DeleteProjectConfirmResult
} from './delete-project-confirm-dialog.types';

/**
 * Destructive-confirm dialog for project deletion (issue #96 sub-feature A).
 * Mirrors `RemoveMemberConfirmDialogComponent` — standalone, OnPush,
 * ViewEncapsulation.None with every selector scoped under
 * `.delete-project-confirm-panel` so the CDK overlay chrome does not leak.
 *
 * Lifecycle contract (critical — see tech spec §"Confirmation dialog"):
 *  - Cancel / Escape / backdrop → `dialogRef.close(undefined)`.
 *  - Primary click → emit `confirmClicked`; does NOT close. The smart parent
 *    keeps ownership of the HTTP lifecycle so it can keep the dialog open
 *    on a retryable error (0 / 5xx / network).
 *  - Parent drives `submitting` + `inlineError` via signal inputs; this
 *    component never holds mutable state.
 */
@Component({
  selector: 'app-delete-project-confirm-dialog',
  standalone: true,
  templateUrl: './delete-project-confirm-dialog.component.html',
  styleUrl: './delete-project-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class DeleteProjectConfirmDialogComponent {
  private readonly dialogRef =
    inject<DialogRef<DeleteProjectConfirmResult>>(DialogRef);
  protected readonly data: DeleteProjectConfirmData = inject(DIALOG_DATA);

  /** True while the parent's HTTP call is in flight. Disables both buttons. */
  readonly submitting = input<boolean>(false);

  /** Inline error row copy. Null hides the row entirely. */
  readonly inlineError = input<string | null>(null);

  /** Parent owns the HTTP lifecycle — emit, do not close. */
  readonly confirmClicked = output<void>();

  protected onCancel(): void {
    if (this.submitting()) {
      return;
    }
    this.dialogRef.close(undefined);
  }

  protected onConfirm(): void {
    if (this.submitting()) {
      return;
    }
    this.confirmClicked.emit();
  }
}
