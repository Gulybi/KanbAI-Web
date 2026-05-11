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
import { mapListFetchHttpErrorToUserMessage } from '../constants/list-errors';
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
import { AttachmentListFetchState } from '../models/attachment-list-fetch.model';
import { formatFileSize } from '../utils/format-file-size';
import type { DropzoneFileSelectedEvent } from '../models/dropzone.model';
import { AttachmentsApiService } from '../services/attachments-api.service';
import {
  AttachmentsState,
  INITIAL_ATTACHMENTS_STATE
} from './attachments-state.model';

/**
 * Discriminator for hydrate call origin. Governs how the dedupe guard
 * behaves when a prior fetch is already `ready`:
 *  - 'effect' (panel-open transition path): no-op when `ready`.
 *  - 'retry'  (explicit user action):       fetch unconditionally
 *                                           (modulo the `loading` dedupe).
 */
export type AttachmentsHydrateTrigger = 'effect' | 'retry';

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
  readonly completedFetchByTaskId: Signal<
    Record<string, AttachmentListFetchState>
  > = this.select(s => s.completedFetchByTaskId);

  private subscriptionBag: Subscription[] = [];

  /** One entry per in-flight upload keyed by uploadId (local UUID). */
  private readonly uploadSubs = new Map<string, Subscription>();

  /** One entry per in-flight list fetch keyed by taskId. */
  private readonly listSubs = new Map<string, Subscription>();

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
      for (const sub of this.listSubs.values()) {
        sub.unsubscribe();
      }
      this.listSubs.clear();
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

  /**
   * Fires the panel-open list fetch for the given task.
   *
   * @param taskId   The task whose attachment list should be hydrated.
   * @param trigger  'effect' when called from the panel's task-transition
   *                 effect (no-op when the list is already `ready`); 'retry'
   *                 when called from an explicit user action
   *                 (always fetches). Defaults to 'retry' so pre-existing
   *                 callers keep today's behaviour.
   *
   * Idempotency contract:
   *  - Concurrent calls for the same taskId while a fetch is `loading` are
   *    always deduped.
   *  - Calls for the same taskId while the list is `ready` are a no-op iff
   *    `trigger === 'effect'`; `trigger === 'retry'` fetches.
   *  - Calls on `error` or `idle`/undefined always fetch.
   *
   * On success the server response is merged into `completedByTaskId` via
   * {@link mergeCompletedAssets}; on failure the error is surfaced in
   * `completedFetchByTaskId[taskId]` but `completedByTaskId` is preserved
   * (so SignalR-origin rows stay visible behind the error banner).
   */
  hydrateCompletedForTask(
    taskId: string,
    trigger: AttachmentsHydrateTrigger = 'retry'
  ): void {
    if (!taskId) {
      return;
    }
    const current = this.getState().completedFetchByTaskId[taskId];
    if (current?.phase === 'loading') {
      return;
    }
    // Defensive backstop: effect-driven hydrate against an already-hydrated
    // list is a no-op. Retry is unaffected and always fetches on `ready`.
    if (trigger === 'effect' && current?.phase === 'ready') {
      return;
    }
    const existingSub = this.listSubs.get(taskId);
    if (existingSub) {
      existingSub.unsubscribe();
      this.listSubs.delete(taskId);
    }
    this.setFetchState(taskId, { phase: 'loading', error: null });

    const sub = this.attachmentsApi.listAttachmentsByTask(taskId).subscribe({
      next: assets => {
        this.listSubs.delete(taskId);
        this.mergeCompletedAssets(taskId, assets);
        this.setFetchState(taskId, { phase: 'ready', error: null });
      },
      error: err => {
        this.listSubs.delete(taskId);
        const mapped = mapListFetchHttpErrorToUserMessage(err);
        this.setFetchState(taskId, { phase: 'error', error: mapped });
      }
    });
    this.listSubs.set(taskId, sub);
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

  /**
   * Reconciles a server list response with in-memory SignalR-origin entries:
   *  - Server asset not in state → insert.
   *  - Server asset already in state → keep whichever has the later updatedAt.
   *  - State asset absent from server response → preserved (no prune).
   * Result is sorted `createdAt` DESC (newest first).
   */
  private mergeCompletedAssets(
    taskId: string,
    serverAssets: readonly AssetResponseDto[]
  ): void {
    const byTask = this.getState().completedByTaskId;
    const existing = byTask[taskId] ?? [];
    const byId = new Map<string, AssetResponseDto>();
    for (const asset of existing) {
      byId.set(asset.id, asset);
    }
    for (const server of serverAssets) {
      const current = byId.get(server.id);
      if (!current) {
        byId.set(server.id, server);
        continue;
      }
      if (isLater(server.updatedAt, current.updatedAt)) {
        byId.set(server.id, server);
      }
    }
    const merged = Array.from(byId.values()).sort((a, b) =>
      compareCreatedAtDesc(a.createdAt, b.createdAt)
    );
    this.setState({
      completedByTaskId: { ...byTask, [taskId]: merged }
    });
  }

  private setFetchState(
    taskId: string,
    next: AttachmentListFetchState
  ): void {
    const current = this.getState().completedFetchByTaskId;
    this.setState({
      completedFetchByTaskId: { ...current, [taskId]: next }
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
 * True iff `a` is a strictly-later ISO timestamp than `b`. Treats invalid or
 * missing values as "not later", so a present timestamp always wins against
 * an empty one.
 */
function isLater(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (Number.isNaN(ta)) {
    return false;
  }
  if (Number.isNaN(tb)) {
    return true;
  }
  return ta > tb;
}

/**
 * DESC sort comparator (newest first). Stable for equal timestamps — returns
 * 0, leaving Map insertion order intact.
 */
function compareCreatedAtDesc(a: string | null | undefined, b: string | null | undefined): number {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  const na = Number.isNaN(ta) ? 0 : ta;
  const nb = Number.isNaN(tb) ? 0 : tb;
  if (na === nb) {
    return 0;
  }
  return nb - na;
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
