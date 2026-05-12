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
  DeleteColumnConfirmData,
  DeleteColumnConfirmResult
} from './delete-column-confirm-dialog.types';

/**
 * Destructive-confirm dialog for column deletion (issue #96 sub-feature B).
 * Mirrors `DeleteProjectConfirmDialogComponent` exactly — only the copy and
 * the body branching on `data.taskCount` differ. The parent owns the HTTP
 * lifecycle via `submitting` / `inlineError` inputs and the `confirmClicked`
 * output (primary does NOT auto-close on click).
 */
@Component({
  selector: 'app-delete-column-confirm-dialog',
  standalone: true,
  templateUrl: './delete-column-confirm-dialog.component.html',
  styleUrl: './delete-column-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class DeleteColumnConfirmDialogComponent {
  private readonly dialogRef =
    inject<DialogRef<DeleteColumnConfirmResult>>(DialogRef);
  protected readonly data: DeleteColumnConfirmData = inject(DIALOG_DATA);

  readonly submitting = input<boolean>(false);
  readonly inlineError = input<string | null>(null);

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
