export const ASSET_EVENT = {
  AssetUploadStarted: 'AssetUploadStarted',
  AssetProcessing: 'AssetProcessing',
  AssetCompleted: 'AssetCompleted',
  AssetFailed: 'AssetFailed'
} as const;
export type AssetEventName = (typeof ASSET_EVENT)[keyof typeof ASSET_EVENT];
