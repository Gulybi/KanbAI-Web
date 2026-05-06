import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output
} from '@angular/core';

import { AssetResponseDto } from '../../models/attachment.model';
import {
  AttachmentListFetchState,
  IDLE_LIST_FETCH_STATE
} from '../../models/attachment-list-fetch.model';
import { AttachmentRowComponent } from '../attachment-row/attachment-row.component';

/**
 * Container that switch-renders the four attachment-list phases:
 *  - loading (skeleton)  — only when no rows exist yet; a background refresh
 *    behind an already-populated list does not flash a skeleton
 *  - empty  — when the server confirms zero attachments
 *  - ready  — row list
 *  - error  — banner + (if non-empty) underlying list
 *
 * Row-level styling lives on AttachmentRowComponent; this component owns
 * only the list shell, header, banner, skeleton, and empty state.
 */
@Component({
  selector: 'app-attachment-list',
  standalone: true,
  imports: [AttachmentRowComponent],
  templateUrl: './attachment-list.component.html',
  styleUrl: './attachment-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachmentListComponent {
  readonly attachments = input.required<readonly AssetResponseDto[]>();
  readonly fetchState = input<AttachmentListFetchState>(IDLE_LIST_FETCH_STATE);

  readonly retryFetch = output<void>();

  readonly showLoadingSkeleton = computed(
    () =>
      this.fetchState().phase === 'loading' &&
      this.attachments().length === 0
  );

  readonly showErrorBanner = computed(
    () => this.fetchState().phase === 'error'
  );

  readonly showEmptyState = computed(
    () =>
      this.fetchState().phase === 'ready' && this.attachments().length === 0
  );

  readonly countLabel = computed(() => {
    const len = this.attachments().length;
    return len > 0 ? `(${len})` : '';
  });

  readonly isRetryableError = computed(
    () => this.fetchState().error?.retryable === true
  );

  handleRetryClick(): void {
    this.retryFetch.emit();
  }
}
