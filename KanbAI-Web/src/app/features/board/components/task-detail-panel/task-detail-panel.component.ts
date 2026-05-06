// TODO(future-issue): Replace this stub with a real task-detail view.
// In #49 it exists only to host FileDropzoneComponent against a real task id.

import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  input,
  output
} from '@angular/core';

import { BoardTask } from '../../state/board-state.model';
import { FileDropzoneComponent } from '../../../attachments/components/file-dropzone/file-dropzone.component';
import type { DropzoneFileSelectedEvent } from '../../../attachments/models/dropzone.model';

/**
 * Stub right-side drawer. Renders the task title, a close button, and
 * the file dropzone slot. No comments, activity, assignees, or editing.
 */
@Component({
  selector: 'app-task-detail-panel',
  standalone: true,
  imports: [FileDropzoneComponent],
  templateUrl: './task-detail-panel.component.html',
  styleUrl: './task-detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetailPanelComponent {
  readonly task = input.required<BoardTask>();
  readonly disabled = input<boolean>(false);
  readonly disabledReason = input<string | null>(null);

  readonly panelClosed = output<void>();
  readonly fileSelected = output<DropzoneFileSelectedEvent>();

  readonly titleId = computed(() => `task-detail-title-${this.task().id}`);

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.panelClosed.emit();
  }

  handleClose(): void {
    this.panelClosed.emit();
  }

  handleDropzoneFileSelected(event: DropzoneFileSelectedEvent): void {
    this.fileSelected.emit(event);
  }
}
