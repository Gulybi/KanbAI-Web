import { HttpErrorResponse } from '@angular/common/http';

import { AttachmentDownloadError } from '../models/attachment-download.model';

/**
 * Maps a thrown HTTP error (or transport error) into a user-facing
 * AttachmentDownloadError. Status → code mapping is AC-critical
 * (see .claude/backend_api_map.md line 123).
 *
 * Returns a Promise because with `responseType: 'blob'` Angular's
 * HttpErrorResponse.error is a Blob, not the parsed JSON — reading the
 * server `message` requires an async Blob.text() call.
 */
export async function mapDownloadHttpErrorToUserMessage(
  error: unknown,
  fileName: string
): Promise<AttachmentDownloadError> {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      code: 'NETWORK',
      userMessage:
        "Network problem — the file couldn't be downloaded. Try again.",
      retryable: true
    };
  }

  if (error.status === 0) {
    return {
      code: 'NETWORK',
      userMessage:
        "Network problem — the file couldn't be downloaded. Try again.",
      retryable: true
    };
  }

  const serverMessage = await readErrorMessage(error);

  if (error.status === 400) {
    if (serverMessage === 'File is still being processed.') {
      return {
        code: 'HTTP_400_PROCESSING',
        userMessage:
          'This file is still being saved. Please try again in a moment.',
        retryable: true
      };
    }
    return {
      code: 'HTTP_400_OTHER',
      userMessage: "Download didn't complete. Try again.",
      retryable: true
    };
  }

  if (error.status === 403) {
    return {
      code: 'HTTP_403',
      userMessage: "You're not allowed to download this file.",
      retryable: false
    };
  }

  if (error.status === 404) {
    if (serverMessage === 'File not found.') {
      return {
        code: 'HTTP_404_MISSING',
        userMessage: 'This file no longer exists.',
        retryable: false
      };
    }
    if (serverMessage === 'File upload failed.') {
      return {
        code: 'HTTP_404_FAILED',
        userMessage:
          "This file didn't finish uploading and can't be downloaded.",
        retryable: false
      };
    }
    return {
      code: 'HTTP_404_OTHER',
      userMessage: 'This file is no longer available.',
      retryable: false
    };
  }

  if (error.status >= 500 && error.status < 600) {
    return {
      code: 'HTTP_5XX',
      userMessage: 'Download failed — please try again.',
      retryable: true
    };
  }

  // Note: fileName intentionally unused in the default copy — reserved for
  // future localised messages that include the filename.
  void fileName;

  return {
    code: 'HTTP_OTHER',
    userMessage: 'Download failed — please try again.',
    retryable: true
  };
}

/**
 * Reads the server-side error `message` field out of an HttpErrorResponse
 * that may carry a Blob body (blob response type) or a parsed JSON body.
 * Returns null if the body cannot be parsed or no message is present.
 */
async function readErrorMessage(
  error: HttpErrorResponse
): Promise<string | null> {
  const body = error.error;
  if (body instanceof Blob) {
    const text = await body.text().catch(() => '');
    return parseMessage(text);
  }
  if (typeof body === 'string') {
    return parseMessage(body);
  }
  if (body && typeof body === 'object') {
    return extractMessage(body as Record<string, unknown>);
  }
  return null;
}

function parseMessage(text: string): string | null {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return extractMessage(parsed);
  } catch {
    return null;
  }
}

function extractMessage(body: Record<string, unknown>): string | null {
  const message = body['message'];
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }
  const errors = body['errors'];
  if (Array.isArray(errors) && typeof errors[0] === 'string') {
    return errors[0];
  }
  return null;
}
