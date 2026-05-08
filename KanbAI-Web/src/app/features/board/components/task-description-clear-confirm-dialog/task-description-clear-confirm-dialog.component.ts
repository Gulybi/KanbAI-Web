import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject
} from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';

import { TASK_DESCRIPTION_COPY } from '../task-description-section/task-description-copy';
import { TaskDescriptionClearConfirmResult } from './task-description-clear-confirm-dialog.types';

/**
 * Destructive confirmation dialog for clearing a task description
 * (issue #91). Mirrors `RemoveMemberConfirmDialogComponent` — heading +
 * two-button row, coral Confirm and neutral Cancel. Uses
 * `ViewEncapsulation.None` so the `.task-description-clear-confirm-panel`
 * overlay class can be styled here; every selector is scoped to that
 * class to prevent leaks.
 */
@Component({
  selector: 'app-task-description-clear-confirm-dialog',
  standalone: true,
  templateUrl: './task-description-clear-confirm-dialog.component.html',
  styleUrl: './task-description-clear-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class TaskDescriptionClearConfirmDialogComponent {
  private readonly dialogRef =
    inject<DialogRef<TaskDescriptionClearConfirmResult>>(DialogRef);

  protected readonly copy = TASK_DESCRIPTION_COPY;

  protected onCancel(): void {
    this.dialogRef.close(undefined);
  }

  protected onConfirm(): void {
    this.dialogRef.close(true);
  }
}
