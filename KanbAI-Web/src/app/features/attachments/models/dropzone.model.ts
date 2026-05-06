/**
 * Payload emitted by FileDropzoneComponent.fileSelected after a file
 * passes validation. See also: issue #50 (consumer of this event).
 */
export interface DropzoneFileSelectedEvent {
  readonly file: File;
  readonly taskId: string;
}

/**
 * Tagged error union describing why a file was rejected. The code is
 * stable for analytics / tests; the message is the exact copy rendered
 * to the user.
 */
export type DropzoneErrorCode =
  | 'FORMAT_NOT_ALLOWED'
  | 'SIZE_EXCEEDED'
  | 'SIZE_ZERO'
  | 'NAME_INVALID'
  | 'MULTI_FILE_TRUNCATED';

export interface DropzoneValidationError {
  readonly code: DropzoneErrorCode;
  readonly message: string;
  /**
   * When true, the "error" is informational (the first file WAS accepted
   * but the user tried to drop more). Rendered as a non-blocking note
   * alongside the selected-file summary. Only used with MULTI_FILE_TRUNCATED.
   */
  readonly informational: boolean;
}

/** Discriminated result of validateAttachment(). */
export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: DropzoneValidationError };

/** Visual state of the dropzone. */
export type DropzonePhase =
  | 'idle'
  | 'dragover'
  | 'selected'
  | 'error'
  | 'disabled';
