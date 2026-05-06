import { HttpErrorResponse } from '@angular/common/http';

import { AttachmentListFetchError } from '../models/attachment-list-fetch.model';

/**
 * Maps a thrown HTTP error on GET /api/attachment/task/{taskId} into a
 * user-facing AttachmentListFetchError.
 *
 * Branches (per .claude/backend_api_map.md line 121):
 *   - 403 → HTTP_403, !retryable
 *   - 404 → HTTP_404, !retryable
 *   - 5xx → HTTP_5XX, retryable
 *   - status 0 (network) → NETWORK, retryable
 *   - other → HTTP_OTHER, retryable
 *
 * This endpoint returns JSON (not a Blob), so no async parsing is needed.
 */
export function mapListFetchHttpErrorToUserMessage(
  error: unknown
): AttachmentListFetchError {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      code: 'NETWORK',
      userMessage:
        "Network problem — couldn't load attachments. Try again.",
      retryable: true
    };
  }

  if (error.status === 0) {
    return {
      code: 'NETWORK',
      userMessage:
        "Network problem — couldn't load attachments. Try again.",
      retryable: true
    };
  }

  if (error.status === 403) {
    return {
      code: 'HTTP_403',
      userMessage: "You can't see this task's attachments.",
      retryable: false
    };
  }

  if (error.status === 404) {
    return {
      code: 'HTTP_404',
      userMessage: 'This task no longer exists.',
      retryable: false
    };
  }

  if (error.status >= 500 && error.status < 600) {
    return {
      code: 'HTTP_5XX',
      userMessage: "Couldn't load attachments — please try again.",
      retryable: true
    };
  }

  return {
    code: 'HTTP_OTHER',
    userMessage: "Couldn't load attachments — please try again.",
    retryable: true
  };
}
