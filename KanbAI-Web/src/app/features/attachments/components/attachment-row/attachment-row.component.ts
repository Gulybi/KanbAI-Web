import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  input,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AssetResponseDto } from '../../models/attachment.model';
import {
  AttachmentDownloadState,
  IDLE_DOWNLOAD_STATE
} from '../../models/attachment-download.model';
import { resolveAttachmentIconCategory } from '../../constants/attachment-icon-map';
import { mapDownloadHttpErrorToUserMessage } from '../../constants/download-errors';
import { AttachmentsApiService } from '../../services/attachments-api.service';
import { formatFileSize } from '../../utils/format-file-size';
import { triggerBlobDownload } from '../../utils/trigger-blob-download';

/**
 * Dumb row presenting ONE completed attachment with a download control and
 * a per-row error region. Three visible phases:
 *  - idle        : button enabled, neutral accent
 *  - downloading : button disabled, spinner, brand accent
 *  - error       : card border + accent in $status-high, error region
 *                  visible with message and (conditional) retry pill
 *
 * All download state is local to this component (Q4 resolution) — siblings
 * are unaffected when one row errors.
 */
@Component({
  selector: 'app-attachment-row',
  standalone: true,
  imports: [],
  templateUrl: './attachment-row.component.html',
  styleUrl: './attachment-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachmentRowComponent implements AfterViewInit {
  private readonly attachmentsApi = inject(AttachmentsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly attachment = input.required<AssetResponseDto>();

  readonly downloadState = signal<AttachmentDownloadState>(IDLE_DOWNLOAD_STATE);

  readonly iconCategory = computed(() =>
    resolveAttachmentIconCategory({
      mimeType: this.attachment().mimeType,
      fileName: this.attachment().fileName
    })
  );

  readonly fileSizeDisplay = computed(() =>
    formatFileSize(this.attachment().fileSize)
  );

  readonly downloadAriaLabel = computed(
    () => `Download ${this.attachment().fileName}`
  );

  readonly absoluteDateLabel = computed(() =>
    formatAbsoluteDate(this.attachment().createdAt)
  );

  readonly relativeDateLabel = computed(() =>
    formatRelativeDate(this.attachment().createdAt)
  );

  readonly phase = computed(() => this.downloadState().phase);
  readonly isDownloading = computed(() => this.phase() === 'downloading');
  readonly isError = computed(() => this.phase() === 'error');

  @ViewChild('downloadButton') private readonly downloadButton?:
    | ElementRef<HTMLButtonElement>;

  /**
   * Angular initialises `@ViewChild` after view init, so the handler looks up
   * the element via the ref below — we do not need to seed anything here.
   */
  ngAfterViewInit(): void {
    // Intentionally empty; retained so tests or future lifecycle work has a
    // hook.
  }

  handleDownloadClick(): void {
    if (this.isDownloading()) {
      return;
    }
    const asset = this.attachment();
    this.downloadState.set({ phase: 'downloading', error: null });

    this.attachmentsApi
      .downloadAttachment(asset.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          if (response.body) {
            triggerBlobDownload(response.body, asset.fileName);
          }
          this.downloadState.set(IDLE_DOWNLOAD_STATE);
        },
        error: async err => {
          const mapped = await mapDownloadHttpErrorToUserMessage(
            err,
            asset.fileName
          );
          this.downloadState.set({ phase: 'error', error: mapped });
        }
      });
  }

  handleRetryClick(): void {
    const state = this.downloadState();
    if (state.phase !== 'error' || !state.error?.retryable) {
      return;
    }
    this.downloadState.set(IDLE_DOWNLOAD_STATE);
    // After the retry pill unmounts we want the keyboard focus to land back
    // on the primary download affordance (see design spec Flow 3 step 4).
    queueMicrotask(() => this.downloadButton?.nativeElement.focus());
    this.handleDownloadClick();
  }
}

/**
 * Format an ISO timestamp into a short, human-scanned absolute label.
 * Falls back to the raw string on parse failure so the UI never renders
 * "Invalid Date".
 */
function formatAbsoluteDate(iso: string): string {
  const ms = Date.parse(iso ?? '');
  if (Number.isNaN(ms)) {
    return iso ?? '';
  }
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Compact relative label for display:
 *  - < 1 min        → "Just now"
 *  - < 1 hour       → "N min ago"
 *  - < 24 hours     → "N hours ago"
 *  - yesterday      → "Yesterday"
 *  - same year      → "MMM d"
 *  - older          → "MMM d, yyyy"
 */
function formatRelativeDate(iso: string): string {
  const ms = Date.parse(iso ?? '');
  if (Number.isNaN(ms)) {
    return iso ?? '';
  }
  const now = Date.now();
  const deltaSec = Math.floor((now - ms) / 1000);
  if (deltaSec < 60) {
    return 'Just now';
  }
  if (deltaSec < 3600) {
    const min = Math.floor(deltaSec / 60);
    return `${min} min ago`;
  }
  if (deltaSec < 86_400) {
    const hours = Math.floor(deltaSec / 3600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (deltaSec < 172_800) {
    return 'Yesterday';
  }
  const date = new Date(ms);
  const nowDate = new Date(now);
  if (date.getFullYear() === nowDate.getFullYear()) {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
