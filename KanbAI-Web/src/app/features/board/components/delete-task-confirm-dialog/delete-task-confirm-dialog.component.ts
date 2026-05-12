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
  DeleteTaskConfirmData,
  DeleteTaskConfirmResult
} from './delete-task-confirm-dialog.types';

/**
 * Destructive-confirm dialog for task deletion (issue #96 sub-feature C).
 * Mirrors `DeleteProjectConfirmDialogComponent` / `DeleteColumnConfirmDialogComponent`
 * exactly — only the copy differs. Primary does NOT auto-close; parent owns
 * the HTTP lifecycle through `submitting` / `inlineError` inputs.
 */
@Component({
  selector: 'app-delete-task-confirm-dialog',
  standalone: true,
  templateUrl: './delete-task-confirm-dialog.component.html',
  styleUrl: './delete-task-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class DeleteTaskConfirmDialogComponent {
  private readonly dialogRef =
    inject<DialogRef<DeleteTaskConfirmResult>>(DialogRef);
  protected readonly data: DeleteTaskConfirmData = inject(DIALOG_DATA);

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
