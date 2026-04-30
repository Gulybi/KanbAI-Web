import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

import {
  RemoveMemberConfirmData,
  RemoveMemberConfirmResult
} from './remove-member-confirm-dialog.types';

/**
 * Destructive-action confirmation dialog. Narrower than the Members
 * dialog (`max-width: 420px`), with a coral primary action and a
 * neutral-tone Cancel. Uses `ViewEncapsulation.None` so the
 * `remove-member-confirm-dialog-panel` overlay class can be styled here;
 * every selector is scoped to that class to prevent leaks.
 */
@Component({
  selector: 'app-remove-member-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './remove-member-confirm-dialog.component.html',
  styleUrl: './remove-member-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class RemoveMemberConfirmDialogComponent {
  private readonly dialogRef = inject<DialogRef<RemoveMemberConfirmResult>>(DialogRef);
  protected readonly data: RemoveMemberConfirmData = inject(DIALOG_DATA);

  protected onCancel(): void {
    this.dialogRef.close(undefined);
  }

  protected onConfirm(): void {
    this.dialogRef.close(true);
  }
}
