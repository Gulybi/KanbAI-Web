import {
  DestroyRef,
  Injectable,
  Signal,
  computed,
  effect,
  inject
} from '@angular/core';
import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';

import { BaseStateService } from '../../../core/state/base-state.service';
import { SignalRService } from '../../../core/services/signalr.service';
import { ASSET_EVENT } from '../constants/asset-events';
import { mapAssetFailedToUserMessage, mapUploadHttpErrorToUserMessage } from '../constants/upload-errors';
import {
  AssetFailedEventDto,
  AssetResponseDto,
  AssetStatusEventDto,
  AssetUploadResponse
} from '../models/attachment.model';
import {
  AttachmentUpload,
  AttachmentUploadError
} from '../models/attachment-upload.model';
import { formatFileSize } from '../utils/format-file-size';
import type { DropzoneFileSelectedEvent } from '../models/dropzone.model';
import { AttachmentsApiService } from '../services/attachments-api.service';
import {
  AttachmentsState,
  INITIAL_ATTACHMENTS_STATE
} from './attachments-state.model';

/** Entries in `cancelledAssetIds` auto-expire after this long. */
const CANCELLED_ASSET_TTL_MS = 5 * 60 * 1000;

/**
 * Root-provided upload pipeline + reconciler for attachment asset events.
 *
 * Outlives the task-detail panel and the board page, so uploads started in
 * one view survive navigation / panel close — the preferred "continue in
 * background" behaviour from the context doc.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentsStateService extends BaseStateService<AttachmentsState> {
  private readonly attachmentsApi = inject(AttachmentsApiService);
  private readonly signalRService = inject(SignalRService);
  private readonly destroyRef = inject(DestroyRef);

  /** Public selectors. */
  readonly uploadsByTaskId: Signal<Record<string, AttachmentUpload[]>> =
    this.select(s => s.uploadsByTaskId);
  readonly completedByTaskId: Signal<Record<string, AssetResponseDto[]>> =
    this.select(s => s.completedByTaskId);

  private subscriptionBag: Subscription[] = [];

  /** One entry per in-flight upload keyed by uploadId (local UUID). */
  private readonly uploadSubs = new Map<string, Subscription>();

  /**
   * Ids of assets the user cancelled after the 201. Late-arriving
   * AssetFailed events for these ids are silently dropped; AssetCompleted
   * still flows into `completedByTaskId`. Entries auto-expire to bound
   * Set growth.
   */
  private readonly cancelledAssetIds = new Set<string>();
  private readonly cancelTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    super();

    effect(() => {
      const state = this.signalRService.connectionState();
      if (state !== 'connected') {
        return;
      }

      this.teardownSubscriptions();

      this.subscriptionBag.push(
        this.signalRService
          .on<AssetStatusEventDto>(ASSET_EVENT.AssetUploadStarted)
          .subscribe(evt => this.onAssetUploadStarted(evt))
      );
      this.subscriptionBag.push(
        this.signalRService
          .on<AssetStatusEventDto>(ASSET_EVENT.AssetProcessing)
          .subscribe(evt => this.onAssetProcessing(evt))
      );
      this.subscriptionBag.push(
        this.signalRService
          .on<AssetResponseDto>(ASSET_EVENT.AssetCompleted)
          .subscribe(evt => this.onAssetCompleted(evt))
      );
      this.subscriptionBag.push(
        this.signalRService
          .on<AssetFailedEventDto>(ASSET_EVENT.AssetFailed)
          .subscribe(evt => this.onAssetFailed(evt))
      );
    });

    this.destroyRef.onDestroy(() => {
      this.teardownSubscriptions();
      for (const sub of this.uploadSubs.values()) {
        sub.unsubscribe();
      }
      this.uploadSubs.clear();
      for (const timer of this.cancelTimers.values()) {
        clearTimeout(timer);
      }
      this.cancelTimers.clear();
      this.cancelledAssetIds.clear();
    });
  }

  protected getInitialState(): AttachmentsState {
    return INITIAL_ATTACHMENTS_STATE;
  }

  // ------------------- selectors --------------------

  uploadsForTask(taskId: string): Signal<AttachmentUpload[]> {
    return computed(() => this.uploadsByTaskId()[taskId] ?? []);
  }

  isUploadingForTask(taskId: string): Signal<boolean> {
    return computed(() =>
      (this.uploadsByTaskId()[taskId] ?? []).some(
        u => u.phase === 'uploading' || u.phase === 'processing'
      )
    );
  }

  // ------------------- commands ---------------------

  startUpload(event: DropzoneFileSelectedEvent): void {
    const upload: AttachmentUpload = {
      id: cryptoRandomUUID(),
      taskId: event.taskId,
      file: event.file,
      fileSizeDisplay: formatFileSize(event.file.size),
      phase: 'uploading',
      progress: 0,
      assetId: null,
      error: null,
      startedAt: Date.now()
    };
    this.appendUpload(upload);
    this.beginHttp(upload.id, event.taskId, event.file);
  }

  cancel(uploadId: string): void {
    const row = this.findRow(uploadId);
    if (!row) {
      return;
    }
    const sub = this.uploadSubs.get(uploadId);
    if (sub) {
      sub.unsubscribe();
      this.uploadSubs.delete(uploadId);
    }
    if (row.assetId !== null) {
      this.markAssetCancelled(row.assetId);
    }
    this.removeRow(uploadId);
  }

  retry(uploadId: string): void {
    const row = this.findRow(uploadId);
    if (!row || row.phase !== 'error') {
      return;
    }
    this.mutateRow(uploadId, {
      phase: 'uploading',
      progress: 0,
      assetId: null,
      error: null
    });
    this.beginHttp(uploadId, row.taskId, row.file);
  }

  dismiss(uploadId: string): void {
    const row = this.findRow(uploadId);
    if (!row || row.phase !== 'error') {
      return;
    }
    this.removeRow(uploadId);
  }

  // ------------------- HTTP pipeline ----------------

  private beginHttp(uploadId: string, taskId: string, file: File): void {
    const sub = this.attachmentsApi
      .uploadAttachment(taskId, file)
      .subscribe({
        next: evt => this.handleHttpEvent(uploadId, taskId, file.name, evt),
        error: err => this.handleHttpError(uploadId, file.name, err)
      });
    this.uploadSubs.set(uploadId, sub);
  }

  private handleHttpEvent(
    uploadId: string,
    taskId: string,
    fileName: string,
    event: HttpEvent<AssetUploadResponse>
  ): void {
    if (event.type === HttpEventType.UploadProgress) {
      if (!event.total || event.total <= 0) {
        return;
      }
      const rawPercent = Math.round((event.loaded / event.total) * 100);
      const row = this.findRow(uploadId);
      if (!row || row.phase !== 'uploading') {
        return;
      }
      // Monotonic, capped at 99 — 100 is reserved for the Response event.
      const clamped = Math.min(99, Math.max(row.progress, rawPercent));
      if (clamped !== row.progress) {
        this.mutateRow(uploadId, { progress: clamped });
      }
      return;
    }

    if (event.type === HttpEventType.Response) {
      this.uploadSubs.delete(uploadId);
      const response = event as HttpResponse<AssetUploadResponse>;
      const body = response.body;
      if (!body || body.success !== true || body.data == null) {
        this.handleHttpError(uploadId, fileName, new Error('bad_response'));
        return;
      }
      const asset = body.data;
      // If we already saw an AssetCompleted for this asset (race: event
      // beat the HTTP response), don't leave a dangling row.
      const alreadyCompleted = (
        this.getState().completedByTaskId[taskId] ?? []
      ).some(a => a.id === asset.id);
      if (alreadyCompleted) {
        this.removeRow(uploadId);
        return;
      }
      this.mutateRow(uploadId, {
        phase: 'processing',
        progress: 100,
        assetId: asset.id
      });
    }
  }

  private handleHttpError(
    uploadId: string,
    fileName: string,
    error: unknown
  ): void {
    this.uploadSubs.delete(uploadId);
    const row = this.findRow(uploadId);
    if (!row) {
      return;
    }
    const mapped: AttachmentUploadError = mapUploadHttpErrorToUserMessage(
      error,
      fileName
    );
    this.mutateRow(uploadId, {
      phase: 'error',
      assetId: null,
      error: mapped
    });
  }

  // ------------------- asset event handlers ---------

  private onAssetUploadStarted(_evt: AssetStatusEventDto): void {
    // No-op: local row is already past 'uploading' when the server sees
    // enough bytes to broadcast. Teammate rows are not rendered here.
  }

  private onAssetProcessing(_evt: AssetStatusEventDto): void {
    // No-op: local row is already in 'processing' via the 201 response.
  }

  private onAssetCompleted(evt: AssetResponseDto): void {
    if (!evt || typeof evt.id !== 'string') {
      return;
    }
    const taskId = evt.kanbanTaskId;
    this.appendCompleted(taskId, evt);

    if (this.cancelledAssetIds.has(evt.id)) {
      this.clearAssetCancelled(evt.id);
      return;
    }

    const row = this.findRowByAssetId(evt.id);
    if (row) {
      this.removeRow(row.id);
    }
  }

  private onAssetFailed(evt: AssetFailedEventDto): void {
    if (!evt || typeof evt.assetId !== 'string') {
      return;
    }
    if (this.cancelledAssetIds.has(evt.assetId)) {
      this.clearAssetCancelled(evt.assetId);
      return;
    }
    const row = this.findRowByAssetId(evt.assetId);
    if (!row) {
      return;
    }
    this.mutateRow(row.id, {
      phase: 'error',
      error: mapAssetFailedToUserMessage(row.file.name)
    });
  }

  // ------------------- internal state helpers -------

  private appendUpload(upload: AttachmentUpload): void {
    const byTask = this.getState().uploadsByTaskId;
    const bucket = byTask[upload.taskId] ?? [];
    this.setState({
      uploadsByTaskId: {
        ...byTask,
        [upload.taskId]: [...bucket, upload]
      }
    });
  }

  private removeRow(uploadId: string): void {
    const byTask = this.getState().uploadsByTaskId;
    for (const [taskId, bucket] of Object.entries(byTask)) {
      if (!bucket.some(u => u.id === uploadId)) {
        continue;
      }
      const next = bucket.filter(u => u.id !== uploadId);
      const updated: Record<string, AttachmentUpload[]> = { ...byTask };
      if (next.length === 0) {
        delete updated[taskId];
      } else {
        updated[taskId] = next;
      }
      this.setState({ uploadsByTaskId: updated });
      return;
    }
  }

  private mutateRow(
    uploadId: string,
    patch: Partial<AttachmentUpload>
  ): void {
    const byTask = this.getState().uploadsByTaskId;
    for (const [taskId, bucket] of Object.entries(byTask)) {
      const idx = bucket.findIndex(u => u.id === uploadId);
      if (idx === -1) {
        continue;
      }
      const current = bucket[idx];
      const updatedRow: AttachmentUpload = { ...current, ...patch };
      const nextBucket = [...bucket];
      nextBucket[idx] = updatedRow;
      this.setState({
        uploadsByTaskId: { ...byTask, [taskId]: nextBucket }
      });
      return;
    }
  }

  private findRow(uploadId: string): AttachmentUpload | null {
    const byTask = this.getState().uploadsByTaskId;
    for (const bucket of Object.values(byTask)) {
      const match = bucket.find(u => u.id === uploadId);
      if (match) {
        return match;
      }
    }
    return null;
  }

  private findRowByAssetId(assetId: string): AttachmentUpload | null {
    const byTask = this.getState().uploadsByTaskId;
    for (const bucket of Object.values(byTask)) {
      const match = bucket.find(u => u.assetId === assetId);
      if (match) {
        return match;
      }
    }
    return null;
  }

  private appendCompleted(taskId: string, asset: AssetResponseDto): void {
    const byTask = this.getState().completedByTaskId;
    const existing = byTask[taskId] ?? [];
    if (existing.some(a => a.id === asset.id)) {
      return;
    }
    this.setState({
      completedByTaskId: {
        ...byTask,
        [taskId]: [...existing, asset]
      }
    });
  }

  private markAssetCancelled(assetId: string): void {
    this.cancelledAssetIds.add(assetId);
    const existingTimer = this.cancelTimers.get(assetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      this.cancelledAssetIds.delete(assetId);
      this.cancelTimers.delete(assetId);
    }, CANCELLED_ASSET_TTL_MS);
    this.cancelTimers.set(assetId, timer);
  }

  private clearAssetCancelled(assetId: string): void {
    this.cancelledAssetIds.delete(assetId);
    const timer = this.cancelTimers.get(assetId);
    if (timer) {
      clearTimeout(timer);
      this.cancelTimers.delete(assetId);
    }
  }

  private teardownSubscriptions(): void {
    for (const sub of this.subscriptionBag) {
      sub.unsubscribe();
    }
    this.subscriptionBag = [];
  }
}

/**
 * Thin wrapper around `crypto.randomUUID()` with a fallback for
 * test/jsdom environments that may not expose it on older polyfills.
 */
function cryptoRandomUUID(): string {
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  const rand = () => Math.random().toString(16).slice(2, 10);
  return `${rand()}-${rand()}-${rand()}-${rand()}`;
}
