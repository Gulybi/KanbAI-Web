import { AssetResponseDto } from '../models/attachment.model';
import { AttachmentUpload } from '../models/attachment-upload.model';

export interface AttachmentsState {
  /**
   * Local-origin in-flight uploads (only uploads THIS client initiated).
   * Teammate uploads received over SignalR never appear here.
   */
  uploadsByTaskId: Record<string, AttachmentUpload[]>;

  /**
   * Completed attachments per task. Written when AssetCompleted fires for
   * an assetId we have, OR for a previously-unseen assetId
   * (teammate-origin upload). Consumed by issue #51's attachment list.
   */
  completedByTaskId: Record<string, AssetResponseDto[]>;
}

export const INITIAL_ATTACHMENTS_STATE: AttachmentsState = {
  uploadsByTaskId: {},
  completedByTaskId: {}
};
