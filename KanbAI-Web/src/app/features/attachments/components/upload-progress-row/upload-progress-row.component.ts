import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output
} from '@angular/core';

import { AttachmentUpload } from '../../models/attachment-upload.model';

/**
 * Dumb row that renders ONE in-flight, processing, or failed upload.
 * No service injection, no HttpClient — state service owns the pipeline.
 */
@Component({
  selector: 'app-upload-progress-row',
  standalone: true,
  imports: [],
  templateUrl: './upload-progress-row.component.html',
  styleUrl: './upload-progress-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UploadProgressRowComponent {
  readonly upload = input.required<AttachmentUpload>();

  readonly cancel = output<string>();
  readonly retry = output<string>();
  readonly dismiss = output<string>();

  readonly phase = computed(() => this.upload().phase);
  readonly isUploading = computed(() => this.phase() === 'uploading');
  readonly isProcessing = computed(() => this.phase() === 'processing');
  readonly isError = computed(() => this.phase() === 'error');

  readonly statusLabel = computed<string>(() => {
    switch (this.phase()) {
      case 'uploading':
        return 'Uploading…';
      case 'processing':
        return 'Processing…';
      default:
        return '';
    }
  });

  readonly cancelAriaLabel = computed<string>(() => {
    const name = this.upload().file.name;
    if (this.isProcessing()) {
      return 'Cancel not available during processing';
    }
    return `Cancel upload of ${name}`;
  });

  readonly dismissAriaLabel = computed<string>(
    () => `Dismiss upload error for ${this.upload().file.name}`
  );

  readonly progressAriaLabel = computed<string>(
    () => `Uploading ${this.upload().file.name}`
  );

  /**
   * When the server rejects with 403, retry would simply re-fail —
   * disable the button so the user lands on Dismiss instead
   * (design spec §4 Open Question 2 option b).
   */
  readonly retryDisabled = computed<boolean>(
    () => this.upload().error?.code === 'HTTP_403'
  );

  handleCancelClick(): void {
    if (this.phase() !== 'uploading') {
      return;
    }
    this.cancel.emit(this.upload().id);
  }

  handleRetryClick(): void {
    if (!this.isError() || this.retryDisabled()) {
      return;
    }
    this.retry.emit(this.upload().id);
  }

  handleDismissClick(): void {
    if (!this.isError()) {
      return;
    }
    this.dismiss.emit(this.upload().id);
  }
}
