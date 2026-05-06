import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  Signal,
  computed,
  inject,
  input,
  output
} from '@angular/core';

import { BoardTask } from '../../state/board-state.model';
import { FileDropzoneComponent } from '../../../attachments/components/file-dropzone/file-dropzone.component';
import { UploadProgressRowComponent } from '../../../attachments/components/upload-progress-row/upload-progress-row.component';
import { AttachmentsStateService } from '../../../attachments/state/attachments-state.service';
import { UPLOAD_BLOCKED_REASON } from '../../../attachments/constants/upload-errors';
import type { DropzoneFileSelectedEvent } from '../../../attachments/models/dropzone.model';
import { AttachmentUpload } from '../../../attachments/models/attachment-upload.model';

/**
 * Right-side drawer. Hosts the file dropzone and the stack of in-flight
 * upload rows. The panel does not own the upload pipeline — the
 * root-provided {@link AttachmentsStateService} does, so that uploads
 * survive panel-close and board-navigation.
 */
@Component({
  selector: 'app-task-detail-panel',
  standalone: true,
  imports: [FileDropzoneComponent, UploadProgressRowComponent],
  templateUrl: './task-detail-panel.component.html',
  styleUrl: './task-detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetailPanelComponent {
  private readonly attachmentsState = inject(AttachmentsStateService);

  readonly task = input.required<BoardTask>();
  readonly disabled = input<boolean>(false);
  readonly disabledReason = input<string | null>(null);

  readonly panelClosed = output<void>();
  readonly fileSelected = output<DropzoneFileSelectedEvent>();

  readonly titleId = computed(() => `task-detail-title-${this.task().id}`);

  /** All in-flight upload rows for the currently-open task. */
  readonly uploads: Signal<AttachmentUpload[]> = computed<AttachmentUpload[]>(
    () => this.attachmentsState.uploadsByTaskId()[this.task().id] ?? []
  );

  /** True while any row is 'uploading' or 'processing'. */
  readonly isUploading: Signal<boolean> = computed(() =>
    this.uploads().some(
      u => u.phase === 'uploading' || u.phase === 'processing'
    )
  );

  /**
   * Resolved dropzone `disabled` = external disabled OR an upload is in
   * flight for this task. Upload rows in `error` phase do NOT block the
   * dropzone — the user can start another upload while dismissing /
   * retrying the failed one.
   */
  readonly resolvedDisabled: Signal<boolean> = computed(
    () => this.disabled() || this.isUploading()
  );

  /**
   * Resolved reason string fed into the dropzone. External reason wins
   * when `disabled` is externally set; otherwise the upload-in-progress
   * copy is used.
   */
  readonly resolvedDisabledReason: Signal<string | null> = computed(() => {
    if (this.disabled()) {
      return this.disabledReason();
    }
    if (this.isUploading()) {
      return UPLOAD_BLOCKED_REASON;
    }
    return null;
  });

  /**
   * Text rendered in the panel-level polite live region. Updates on
   * every phase transition — kept as a single computed signal so AT
   * receives exactly one announcement per change (vs one per row).
   */
  readonly uploadLiveMessage: Signal<string> = computed(() => {
    const rows = this.uploads();
    if (rows.length === 0) {
      return '';
    }
    // Pick the first non-error row — MVP blocks concurrent same-task
    // uploads so this is effectively "the active row".
    const active = rows.find(r => r.phase === 'uploading' || r.phase === 'processing');
    if (!active) {
      return '';
    }
    if (active.phase === 'uploading') {
      return `Uploading ${active.file.name}`;
    }
    return `Processing ${active.file.name}`;
  });

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

  handleCancel(uploadId: string): void {
    this.attachmentsState.cancel(uploadId);
  }

  handleRetry(uploadId: string): void {
    this.attachmentsState.retry(uploadId);
  }

  handleDismiss(uploadId: string): void {
    this.attachmentsState.dismiss(uploadId);
  }

  trackUploadById(_index: number, upload: AttachmentUpload): string {
    return upload.id;
  }
}
