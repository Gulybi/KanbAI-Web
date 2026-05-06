import { AssetResponseDto } from '../models/attachment.model';
import { AttachmentUpload } from '../models/attachment-upload.model';
import { AttachmentListFetchState } from '../models/attachment-list-fetch.model';

export interface AttachmentsState {
  /**
   * Local-origin in-flight uploads (only uploads THIS client initiated).
   * Teammate uploads received over SignalR never appear here.
   */
  uploadsByTaskId: Record<string, AttachmentUpload[]>;

  /**
   * Completed attachments per task. Written when AssetCompleted fires for
   * an assetId we have, OR for a previously-unseen assetId
   * (teammate-origin upload), AND merged from the panel-open list fetch
   * on GET /api/attachment/task/{taskId} (issue #51).
   */
  completedByTaskId: Record<string, AssetResponseDto[]>;

  /**
   * Lifecycle phase of the panel-open list fetch per task. Populated by
   * `hydrateCompletedForTask`. Consumers render a skeleton on 'loading',
   * an error banner on 'error', or the row list on 'ready'/non-empty.
   */
  completedFetchByTaskId: Record<string, AttachmentListFetchState>;
}

export const INITIAL_ATTACHMENTS_STATE: AttachmentsState = {
  uploadsByTaskId: {},
  completedByTaskId: {},
  completedFetchByTaskId: {}
};
