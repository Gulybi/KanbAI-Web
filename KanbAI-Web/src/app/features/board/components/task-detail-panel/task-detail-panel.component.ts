import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  Signal,
  computed,
  effect,
  inject,
  input,
  output
} from '@angular/core';

import { BoardTask } from '../../state/board-state.model';

/**
 * Presentational projection of BoardTask.content for the Description
 * section. `empty` = render the empty-state copy; `text` = render
 * `text` with preserved line breaks.
 */
type TaskDescriptionDisplay =
  | { readonly mode: 'empty'; readonly text: '' }
  | { readonly mode: 'text'; readonly text: string };
import { FileDropzoneComponent } from '../../../attachments/components/file-dropzone/file-dropzone.component';
import { UploadProgressRowComponent } from '../../../attachments/components/upload-progress-row/upload-progress-row.component';
import { AttachmentListComponent } from '../../../attachments/components/attachment-list/attachment-list.component';
import { AttachmentsStateService } from '../../../attachments/state/attachments-state.service';
import { UPLOAD_BLOCKED_REASON } from '../../../attachments/constants/upload-errors';
import type { DropzoneFileSelectedEvent } from '../../../attachments/models/dropzone.model';
import { AttachmentUpload } from '../../../attachments/models/attachment-upload.model';
import { AssetResponseDto } from '../../../attachments/models/attachment.model';
import {
  AttachmentListFetchState,
  IDLE_LIST_FETCH_STATE
} from '../../../attachments/models/attachment-list-fetch.model';

/**
 * Right-side drawer. Hosts the file dropzone and the stack of in-flight
 * upload rows. The panel does not own the upload pipeline — the
 * root-provided {@link AttachmentsStateService} does, so that uploads
 * survive panel-close and board-navigation.
 */
@Component({
  selector: 'app-task-detail-panel',
  standalone: true,
  imports: [
    FileDropzoneComponent,
    UploadProgressRowComponent,
    AttachmentListComponent
  ],
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

  /** Stable per-task id for the Description section heading (mirrors `titleId`). */
  readonly descriptionLabelId = computed(
    () => `task-detail-description-${this.task().id}`
  );

  /**
   * Presentational projection of `task().content`. Null, empty-string, and
   * whitespace-only values all collapse to the `empty` mode so the template
   * can render the empty-state copy without re-implementing the rule.
   */
  readonly descriptionDisplay: Signal<TaskDescriptionDisplay> = computed(() => {
    const raw = this.task().content;
    if (raw === null || raw === '' || raw.trim() === '') {
      return { mode: 'empty', text: '' };
    }
    return { mode: 'text', text: raw };
  });

  /** All in-flight upload rows for the currently-open task. */
  readonly uploads: Signal<AttachmentUpload[]> = computed<AttachmentUpload[]>(
    () => this.attachmentsState.uploadsByTaskId()[this.task().id] ?? []
  );

  /** Completed attachments for the currently-open task (issue #51). */
  readonly completedAttachments: Signal<readonly AssetResponseDto[]> = computed(
    () => this.attachmentsState.completedByTaskId()[this.task().id] ?? []
  );

  /** Panel-open list-fetch phase for the currently-open task (issue #51). */
  readonly listFetchState: Signal<AttachmentListFetchState> = computed(
    () =>
      this.attachmentsState.completedFetchByTaskId()[this.task().id] ??
      IDLE_LIST_FETCH_STATE
  );

  /**
   * Renders the divider between the upload stack and the attachment list
   * only when the attachment list is actually about to render something.
   */
  readonly showAttachmentDivider: Signal<boolean> = computed(() => {
    return (
      this.completedAttachments().length > 0 ||
      this.listFetchState().phase !== 'idle'
    );
  });

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

  constructor() {
    // Hydrate the completed-attachments list whenever the open task changes.
    // `hydrateCompletedForTask` is idempotent and dedupes on phase==='loading'.
    effect(() => {
      const id = this.task().id;
      if (id) {
        this.attachmentsState.hydrateCompletedForTask(id);
      }
    });
  }

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

  handleRetryListFetch(): void {
    this.attachmentsState.hydrateCompletedForTask(this.task().id);
  }

  trackUploadById(_index: number, upload: AttachmentUpload): string {
    return upload.id;
  }
}
