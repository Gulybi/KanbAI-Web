import { ApiResponse } from '../../projects/models/project.model';

/**
 * Backend ProcessingStatus enum — mirrors .claude/backend_api_map.md
 * §AssetResponseDto. Values are numeric on the wire.
 */
export const ProcessingStatus = {
  Pending: 0,
  Processing: 1,
  Completed: 2,
  Failed: 3
} as const;
export type ProcessingStatusValue =
  (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

/**
 * Response payload for POST /api/attachment/task/{taskId} (201)
 * and payload of the AssetCompleted SignalR event.
 */
export interface AssetResponseDto {
  id: string;
  fileName: string;
  storageKey: string;
  thumbnailKey: string | null;
  mimeType: string;
  fileSize: number;
  processingStatus: ProcessingStatusValue;
  kanbanTaskId: string;
  createdAt: string;
  updatedAt: string;
}

/** Envelope for POST /api/attachment/task/{taskId}. */
export type AssetUploadResponse = ApiResponse<AssetResponseDto>;

/**
 * Payload of AssetUploadStarted (processingStatus = 0) and
 * AssetProcessing (processingStatus = 1) SignalR events.
 */
export interface AssetStatusEventDto {
  assetId: string;
  taskId: string;
  fileName: string;
  processingStatus: ProcessingStatusValue;
}

/** Payload of the AssetFailed SignalR event. */
export interface AssetFailedEventDto {
  assetId: string;
  taskId: string;
  errorMessage: string;
}
