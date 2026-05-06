import { HttpErrorResponse } from '@angular/common/http';
import { AttachmentUploadError } from '../models/attachment-upload.model';

/**
 * Copy shown in the dropzone's disabled state while an upload is in flight.
 */
export const UPLOAD_BLOCKED_REASON = 'Upload in progress — one moment.';

/**
 * Translates an HttpErrorResponse (or a thrown transport error) into the
 * user-facing copy specified in issue_50_context.md §Desired State.
 *
 * The STATUS → CODE mapping is the AC-critical contract; the literal copy
 * may be tightened later, but the mapping must not drift.
 */
export function mapUploadHttpErrorToUserMessage(
  error: unknown,
  fileName: string
): AttachmentUploadError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return {
        code: 'NETWORK',
        userMessage:
          "Network problem — the upload didn't reach the server. Try again."
      };
    }
    if (error.status === 403) {
      return {
        code: 'HTTP_403',
        userMessage: "You're no longer a member of this project."
      };
    }
    if (error.status === 404) {
      return {
        code: 'HTTP_404',
        userMessage: 'This task no longer exists.'
      };
    }
    if (error.status === 413) {
      return {
        code: 'HTTP_413',
        userMessage: `${fileName} is larger than 10 MB.`
      };
    }
    if (error.status === 400) {
      const serverMessage = extractServerMessage(error);
      if (serverMessage === 'File type is not allowed.') {
        return {
          code: 'HTTP_400',
          userMessage: `${fileName} isn't an allowed file type.`
        };
      }
      if (serverMessage === 'File cannot be empty.') {
        return {
          code: 'HTTP_400',
          userMessage: `${fileName} is empty.`
        };
      }
      if (serverMessage === 'File name is invalid.') {
        return {
          code: 'HTTP_400',
          userMessage: `${fileName} has characters we can't accept — rename the file and try again.`
        };
      }
      return {
        code: 'HTTP_400',
        userMessage: "We didn't receive the file. Try again."
      };
    }
    if (error.status >= 500) {
      return {
        code: 'HTTP_500',
        userMessage: 'Upload failed — please try again.'
      };
    }
    return {
      code: 'HTTP_OTHER',
      userMessage: 'Upload failed — please try again.'
    };
  }
  return {
    code: 'NETWORK',
    userMessage:
      "Network problem — the upload didn't reach the server. Try again."
  };
}

/**
 * Copy for AssetFailed events. The raw server `errorMessage` is not rendered
 * verbatim; it is collapsed to a single user-readable sentence naming the
 * file.
 */
export function mapAssetFailedToUserMessage(
  fileName: string
): AttachmentUploadError {
  return {
    code: 'ASSET_FAILED',
    userMessage: `We couldn't save ${fileName}. Try again.`
  };
}

/**
 * Safely extracts a known backend error string out of an ApiResponse-wrapped
 * 4xx body.
 */
function extractServerMessage(error: HttpErrorResponse): string | null {
  const body = error.error as
    | { message?: unknown; errors?: unknown }
    | null
    | undefined;
  if (body && typeof body === 'object') {
    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.message;
    }
    if (Array.isArray(body.errors) && typeof body.errors[0] === 'string') {
      return body.errors[0];
    }
  }
  return null;
}
