/**
 * Visual/state phase of a single in-flight upload row.
 *  - 'uploading'  : bytes in flight; determinate progress 0..100
 *  - 'processing' : HTTP 201 received; waiting on AssetCompleted / AssetFailed
 *  - 'error'      : HTTP failure or AssetFailed; retry + dismiss affordances shown
 */
export type AttachmentUploadPhase = 'uploading' | 'processing' | 'error';

/**
 * Structured error attached to an upload row in the 'error' phase.
 * `userMessage` is pre-mapped copy rendered to the user. The code is for
 * in-memory branching (e.g. special-case 403); never logged.
 */
export interface AttachmentUploadError {
  readonly code:
    | 'HTTP_400'
    | 'HTTP_403'
    | 'HTTP_404'
    | 'HTTP_413'
    | 'HTTP_500'
    | 'HTTP_OTHER'
    | 'NETWORK'
    | 'ASSET_FAILED';
  readonly userMessage: string;
}

/** Single in-flight upload row held in AttachmentsStateService. */
export interface AttachmentUpload {
  readonly id: string;
  readonly taskId: string;
  readonly file: File;
  readonly fileSizeDisplay: string;
  readonly phase: AttachmentUploadPhase;
  readonly progress: number;
  readonly assetId: string | null;
  readonly error: AttachmentUploadError | null;
  readonly startedAt: number;
}
