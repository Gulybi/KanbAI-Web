/**
 * Download state primitives for AttachmentRowComponent.
 *
 * Phase:
 *  - 'idle'        : button enabled; no call in flight
 *  - 'downloading' : GET in flight; button disabled + aria-busy
 *  - 'error'       : last attempt failed; error region visible; retry iff retryable
 */
export type AttachmentDownloadPhase = 'idle' | 'downloading' | 'error';

/**
 * Error codes mirror the download failure set at
 * .claude/backend_api_map.md line 123. The 404 branch covers three
 * distinct user outcomes driven by the server `message` payload.
 */
export type AttachmentDownloadErrorCode =
  | 'HTTP_400_PROCESSING'
  | 'HTTP_400_OTHER'
  | 'HTTP_403'
  | 'HTTP_404_MISSING'
  | 'HTTP_404_FAILED'
  | 'HTTP_404_OTHER'
  | 'HTTP_5XX'
  | 'NETWORK'
  | 'HTTP_OTHER';

export interface AttachmentDownloadError {
  readonly code: AttachmentDownloadErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
}

export interface AttachmentDownloadState {
  readonly phase: AttachmentDownloadPhase;
  readonly error: AttachmentDownloadError | null;
}

export const IDLE_DOWNLOAD_STATE: AttachmentDownloadState = {
  phase: 'idle',
  error: null
};

/**
 * Visual + AT category for the file-type icon. Resolved from the
 * attachment's MIME type and filename extension — see
 * constants/attachment-icon-map.ts.
 */
export type AttachmentIconCategory =
  | 'image'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'text'
  | 'generic';
