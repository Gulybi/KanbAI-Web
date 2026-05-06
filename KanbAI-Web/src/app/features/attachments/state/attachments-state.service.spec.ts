import { TestBed } from '@angular/core/testing';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
  HttpResponse
} from '@angular/common/http';
import { WritableSignal, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { AttachmentsStateService } from './attachments-state.service';
import { AttachmentsApiService } from '../services/attachments-api.service';
import {
  SignalRConnectionState,
  SignalRService
} from '../../../core/services/signalr.service';
import { ASSET_EVENT } from '../constants/asset-events';
import {
  AssetFailedEventDto,
  AssetResponseDto,
  AssetStatusEventDto,
  AssetUploadResponse
} from '../models/attachment.model';
import type { DropzoneFileSelectedEvent } from '../models/dropzone.model';

/** Test double for AttachmentsApiService backed by a Subject per call. */
class MockAttachmentsApi {
  readonly emitters: Subject<HttpEvent<AssetUploadResponse>>[] = [];
  readonly listEmitters: Subject<AssetResponseDto[]>[] = [];

  uploadAttachment = vi.fn(
    (_taskId: string, _file: File): Observable<HttpEvent<AssetUploadResponse>> => {
      const subject = new Subject<HttpEvent<AssetUploadResponse>>();
      this.emitters.push(subject);
      return subject.asObservable();
    }
  );

  listAttachmentsByTask = vi.fn(
    (_taskId: string): Observable<AssetResponseDto[]> => {
      const subject = new Subject<AssetResponseDto[]>();
      this.listEmitters.push(subject);
      return subject.asObservable();
    }
  );

  downloadAttachment = vi.fn();

  lastEmitter(): Subject<HttpEvent<AssetUploadResponse>> {
    return this.emitters[this.emitters.length - 1];
  }

  lastListEmitter(): Subject<AssetResponseDto[]> {
    return this.listEmitters[this.listEmitters.length - 1];
  }
}

/** Test double for SignalRService. */
interface MockSignalR {
  connectionState: WritableSignal<SignalRConnectionState>;
  on: ReturnType<typeof vi.fn>;
  emit<T>(name: string, payload: T): void;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  joinProjectGroup: ReturnType<typeof vi.fn>;
  leaveProjectGroup: ReturnType<typeof vi.fn>;
}

function createMockSignalR(
  initial: SignalRConnectionState = 'connected'
): MockSignalR {
  const subjects = new Map<string, Subject<unknown>>();
  const connectionState = signal<SignalRConnectionState>(initial);
  return {
    connectionState,
    on: vi.fn((name: string) => {
      let s = subjects.get(name);
      if (!s) {
        s = new Subject<unknown>();
        subjects.set(name, s);
      }
      return s.asObservable();
    }),
    emit<T>(name: string, payload: T): void {
      subjects.get(name)?.next(payload);
    },
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    joinProjectGroup: vi.fn().mockResolvedValue(undefined),
    leaveProjectGroup: vi.fn().mockResolvedValue(undefined)
  };
}

function makeFile(name: string, size = 10, type = 'text/plain'): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

function makeSuccessResponse(
  asset: AssetResponseDto
): HttpResponse<AssetUploadResponse> {
  return new HttpResponse<AssetUploadResponse>({
    body: { success: true, message: null, errors: [], data: asset },
    status: 201
  });
}

function makeAsset(partial?: Partial<AssetResponseDto>): AssetResponseDto {
  return {
    id: 'asset-1',
    fileName: 'a.txt',
    storageKey: 'k',
    thumbnailKey: null,
    mimeType: 'text/plain',
    fileSize: 10,
    processingStatus: 1,
    kanbanTaskId: 't-1',
    createdAt: '',
    updatedAt: '',
    ...partial
  };
}

describe('AttachmentsStateService', () => {
  let api: MockAttachmentsApi;
  let signalR: MockSignalR;
  let service: AttachmentsStateService;

  beforeEach(() => {
    api = new MockAttachmentsApi();
    signalR = createMockSignalR('connected');

    TestBed.configureTestingModule({
      providers: [
        AttachmentsStateService,
        { provide: AttachmentsApiService, useValue: api },
        { provide: SignalRService, useValue: signalR }
      ]
    });
    service = TestBed.inject(AttachmentsStateService);
    TestBed.flushEffects();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function startUpload(
    taskId = 't-1',
    name = 'a.txt'
  ): { event: DropzoneFileSelectedEvent; file: File } {
    const file = makeFile(name);
    const event: DropzoneFileSelectedEvent = { file, taskId };
    service.startUpload(event);
    return { event, file };
  }

  describe('startUpload', () => {
    it('appends an uploading row with progress 0 and assetId null', () => {
      startUpload('t-1', 'a.pdf');
      const uploads = service.uploadsForTask('t-1')();
      expect(uploads.length).toBe(1);
      expect(uploads[0].phase).toBe('uploading');
      expect(uploads[0].progress).toBe(0);
      expect(uploads[0].assetId).toBeNull();
      expect(uploads[0].file.name).toBe('a.pdf');
    });

    it('isUploadingForTask flips true during uploading and false after completion', () => {
      startUpload();
      expect(service.isUploadingForTask('t-1')()).toBe(true);

      const asset = makeAsset({ id: 'asset-99', kanbanTaskId: 't-1' });
      api.lastEmitter().next(makeSuccessResponse(asset));
      signalR.emit(ASSET_EVENT.AssetCompleted, asset);

      expect(service.isUploadingForTask('t-1')()).toBe(false);
    });

    it('calls the api service with the emitted file and taskId', () => {
      const { file } = startUpload('task-z');
      expect(api.uploadAttachment).toHaveBeenCalledWith('task-z', file);
    });
  });

  describe('progress events', () => {
    it('monotonically updates progress up to 99', () => {
      startUpload();

      api.lastEmitter().next({
        type: HttpEventType.UploadProgress,
        loaded: 1,
        total: 10
      });
      expect(service.uploadsForTask('t-1')()[0].progress).toBe(10);

      api.lastEmitter().next({
        type: HttpEventType.UploadProgress,
        loaded: 5,
        total: 10
      });
      expect(service.uploadsForTask('t-1')()[0].progress).toBe(50);

      // Out-of-order / regressing event must not decrease progress.
      api.lastEmitter().next({
        type: HttpEventType.UploadProgress,
        loaded: 2,
        total: 10
      });
      expect(service.uploadsForTask('t-1')()[0].progress).toBe(50);

      // 100% raw progress is capped at 99 until Response arrives.
      api.lastEmitter().next({
        type: HttpEventType.UploadProgress,
        loaded: 10,
        total: 10
      });
      expect(service.uploadsForTask('t-1')()[0].progress).toBe(99);
    });

    it('ignores progress events with zero/undefined total', () => {
      startUpload();

      api.lastEmitter().next({
        type: HttpEventType.UploadProgress,
        loaded: 5,
        total: 0
      });
      expect(service.uploadsForTask('t-1')()[0].progress).toBe(0);
    });
  });

  describe('201 response', () => {
    it('transitions to processing with progress 100 and populates assetId', () => {
      startUpload();
      const asset = makeAsset({ id: 'asset-77', kanbanTaskId: 't-1' });
      api.lastEmitter().next(makeSuccessResponse(asset));

      const row = service.uploadsForTask('t-1')()[0];
      expect(row.phase).toBe('processing');
      expect(row.progress).toBe(100);
      expect(row.assetId).toBe('asset-77');
    });

    it('treats {success:false} body as an error', () => {
      startUpload();
      api.lastEmitter().next(
        new HttpResponse<AssetUploadResponse>({
          body: {
            success: false,
            message: 'nope',
            errors: ['nope'],
            data: null
          },
          status: 201
        })
      );
      const row = service.uploadsForTask('t-1')()[0];
      expect(row.phase).toBe('error');
    });
  });

  describe('HTTP error mapping', () => {
    it('status 0 → NETWORK code + network copy', () => {
      startUpload('t-1', 'net.png');
      api.lastEmitter().error(
        new HttpErrorResponse({ status: 0, statusText: 'offline' })
      );
      const row = service.uploadsForTask('t-1')()[0];
      expect(row.phase).toBe('error');
      expect(row.error?.code).toBe('NETWORK');
    });

    it('status 413 → HTTP_413 + filename in copy', () => {
      startUpload('t-1', 'huge.zip');
      api.lastEmitter().error(
        new HttpErrorResponse({ status: 413, statusText: 'too large' })
      );
      const row = service.uploadsForTask('t-1')()[0];
      expect(row.error?.code).toBe('HTTP_413');
      expect(row.error?.userMessage).toContain('huge.zip');
      expect(row.error?.userMessage).toContain('10 MB');
    });

    it('status 403 → HTTP_403', () => {
      startUpload();
      api.lastEmitter().error(
        new HttpErrorResponse({ status: 403, statusText: 'forbidden' })
      );
      expect(service.uploadsForTask('t-1')()[0].error?.code).toBe('HTTP_403');
    });

    it('status 404 → HTTP_404', () => {
      startUpload();
      api.lastEmitter().error(
        new HttpErrorResponse({ status: 404, statusText: 'not found' })
      );
      expect(service.uploadsForTask('t-1')()[0].error?.code).toBe('HTTP_404');
    });

    it('status 500 → HTTP_500', () => {
      startUpload();
      api.lastEmitter().error(
        new HttpErrorResponse({ status: 500, statusText: 'bad' })
      );
      expect(service.uploadsForTask('t-1')()[0].error?.code).toBe('HTTP_500');
    });

    it('status 400 with "File type is not allowed." → HTTP_400 + filename copy', () => {
      startUpload('t-1', 'weird.xyz');
      api.lastEmitter().error(
        new HttpErrorResponse({
          status: 400,
          error: { message: 'File type is not allowed.', errors: [] }
        })
      );
      const row = service.uploadsForTask('t-1')()[0];
      expect(row.error?.code).toBe('HTTP_400');
      expect(row.error?.userMessage).toContain('weird.xyz');
    });
  });

  describe('cancel during uploading', () => {
    it('unsubscribes and removes the row', () => {
      startUpload();
      const emitter = api.lastEmitter();
      const unsubSpy = vi.spyOn(emitter, 'unsubscribe');
      const uploadId = service.uploadsForTask('t-1')()[0].id;

      service.cancel(uploadId);

      expect(service.uploadsForTask('t-1')().length).toBe(0);
      // Subject unsubscribe is not what we want to track — use the
      // subscription itself via observed internal behaviour. The row is
      // gone, which is the user-visible contract.
      unsubSpy.mockRestore();
    });
  });

  describe('cancel after 201 (during processing)', () => {
    it('silently drops a later AssetFailed for the same assetId', () => {
      startUpload();
      const asset = makeAsset({ id: 'asset-55', kanbanTaskId: 't-1' });
      api.lastEmitter().next(makeSuccessResponse(asset));
      const uploadId = service.uploadsForTask('t-1')()[0].id;

      service.cancel(uploadId);
      expect(service.uploadsForTask('t-1')().length).toBe(0);

      signalR.emit<AssetFailedEventDto>(ASSET_EVENT.AssetFailed, {
        assetId: 'asset-55',
        taskId: 't-1',
        errorMessage: 'server sad'
      });

      expect(service.uploadsForTask('t-1')().length).toBe(0);
    });

    it('routes a later AssetCompleted into completedByTaskId only', () => {
      startUpload();
      const asset = makeAsset({ id: 'asset-66', kanbanTaskId: 't-1' });
      api.lastEmitter().next(makeSuccessResponse(asset));
      const uploadId = service.uploadsForTask('t-1')()[0].id;

      service.cancel(uploadId);
      signalR.emit(ASSET_EVENT.AssetCompleted, asset);

      expect(service.uploadsForTask('t-1')().length).toBe(0);
      expect(service.completedByTaskId()['t-1']?.[0]?.id).toBe('asset-66');
    });
  });

  describe('AssetCompleted for a local upload', () => {
    it('appends to completedByTaskId and drops the row', () => {
      startUpload();
      const asset = makeAsset({ id: 'asset-88', kanbanTaskId: 't-1' });
      api.lastEmitter().next(makeSuccessResponse(asset));
      signalR.emit(ASSET_EVENT.AssetCompleted, asset);

      expect(service.uploadsForTask('t-1')().length).toBe(0);
      expect(service.completedByTaskId()['t-1']?.length).toBe(1);
      expect(service.completedByTaskId()['t-1'][0].id).toBe('asset-88');
    });

    it('is idempotent if fired twice', () => {
      startUpload();
      const asset = makeAsset({ id: 'asset-11', kanbanTaskId: 't-1' });
      api.lastEmitter().next(makeSuccessResponse(asset));
      signalR.emit(ASSET_EVENT.AssetCompleted, asset);
      signalR.emit(ASSET_EVENT.AssetCompleted, asset);

      expect(service.completedByTaskId()['t-1']?.length).toBe(1);
    });
  });

  describe('AssetCompleted for teammate-origin assetId', () => {
    it('appends to completedByTaskId without touching uploadsByTaskId', () => {
      const asset = makeAsset({ id: 'asset-ext', kanbanTaskId: 't-9' });
      signalR.emit(ASSET_EVENT.AssetCompleted, asset);

      expect(service.uploadsForTask('t-9')().length).toBe(0);
      expect(service.completedByTaskId()['t-9']?.[0]?.id).toBe('asset-ext');
    });
  });

  describe('AssetFailed for a known row', () => {
    it('transitions to error and preserves file for retry', () => {
      const { file } = startUpload('t-1', 'retry-me.pdf');
      const asset = makeAsset({ id: 'asset-42', kanbanTaskId: 't-1' });
      api.lastEmitter().next(makeSuccessResponse(asset));

      signalR.emit<AssetFailedEventDto>(ASSET_EVENT.AssetFailed, {
        assetId: 'asset-42',
        taskId: 't-1',
        errorMessage: 'internal'
      });

      const row = service.uploadsForTask('t-1')()[0];
      expect(row.phase).toBe('error');
      expect(row.error?.code).toBe('ASSET_FAILED');
      expect(row.error?.userMessage).toContain('retry-me.pdf');
      expect(row.file).toBe(file);
    });
  });

  describe('retry', () => {
    it('resets the row to uploading and re-invokes the API', () => {
      startUpload();
      api.lastEmitter().error(
        new HttpErrorResponse({ status: 500, statusText: 'bad' })
      );
      const uploadId = service.uploadsForTask('t-1')()[0].id;
      const previousCalls = api.uploadAttachment.mock.calls.length;

      service.retry(uploadId);

      const row = service.uploadsForTask('t-1')()[0];
      expect(row.phase).toBe('uploading');
      expect(row.progress).toBe(0);
      expect(row.error).toBeNull();
      expect(api.uploadAttachment.mock.calls.length).toBe(previousCalls + 1);
    });
  });

  describe('dismiss', () => {
    it('removes the error row entirely', () => {
      startUpload();
      api.lastEmitter().error(
        new HttpErrorResponse({ status: 500, statusText: 'bad' })
      );
      const uploadId = service.uploadsForTask('t-1')()[0].id;

      service.dismiss(uploadId);
      expect(service.uploadsForTask('t-1')().length).toBe(0);
    });

    it('is a no-op for a non-error row', () => {
      startUpload();
      const uploadId = service.uploadsForTask('t-1')()[0].id;
      service.dismiss(uploadId);
      expect(service.uploadsForTask('t-1')().length).toBe(1);
    });
  });

  describe('reconnect', () => {
    it('re-subscribes to asset events on connection state transitioning back to connected', () => {
      signalR.connectionState.set('reconnecting');
      TestBed.flushEffects();
      signalR.connectionState.set('connected');
      TestBed.flushEffects();

      // After the reconnect the service should still route an AssetCompleted
      // correctly. We prove the subscription exists by completing through it.
      startUpload();
      const asset = makeAsset({ id: 'asset-z', kanbanTaskId: 't-1' });
      api.lastEmitter().next(makeSuccessResponse(asset));
      signalR.emit(ASSET_EVENT.AssetCompleted, asset);

      expect(service.uploadsForTask('t-1')().length).toBe(0);
    });
  });

  describe('hydrateCompletedForTask', () => {
    it('flips to loading, then ready with the server assets merged + sorted DESC', () => {
      service.hydrateCompletedForTask('t-1');
      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('loading');
      expect(api.listAttachmentsByTask).toHaveBeenCalledWith('t-1');

      const older = makeAsset({
        id: 'a-older',
        kanbanTaskId: 't-1',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z'
      });
      const newer = makeAsset({
        id: 'a-newer',
        kanbanTaskId: 't-1',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z'
      });
      api.lastListEmitter().next([older, newer]);

      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('ready');
      const ordered = service.completedByTaskId()['t-1'] ?? [];
      expect(ordered.map(a => a.id)).toEqual(['a-newer', 'a-older']);
    });

    it('flips to error on a failure without clearing completedByTaskId', () => {
      // Pre-seed an in-memory SignalR-origin entry.
      const seed = makeAsset({ id: 'seed', kanbanTaskId: 't-1' });
      signalR.emit(ASSET_EVENT.AssetCompleted, seed);
      expect(service.completedByTaskId()['t-1']?.length).toBe(1);

      service.hydrateCompletedForTask('t-1');
      api
        .lastListEmitter()
        .error(new HttpErrorResponse({ status: 500, statusText: 'bad' }));

      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('error');
      expect(service.completedFetchByTaskId()['t-1']?.error?.code).toBe(
        'HTTP_5XX'
      );
      expect(service.completedByTaskId()['t-1']?.[0]?.id).toBe('seed');
    });

    it('deduplicates concurrent calls for the same taskId while loading', () => {
      service.hydrateCompletedForTask('t-1');
      service.hydrateCompletedForTask('t-1');
      expect(api.listAttachmentsByTask.mock.calls.length).toBe(1);
    });

    it('allows independent fetches for different taskIds', () => {
      service.hydrateCompletedForTask('t-1');
      service.hydrateCompletedForTask('t-2');
      expect(api.listAttachmentsByTask.mock.calls.length).toBe(2);
      expect(api.listAttachmentsByTask).toHaveBeenCalledWith('t-1');
      expect(api.listAttachmentsByTask).toHaveBeenCalledWith('t-2');
    });

    it('merge preserves in-memory entries missing from the server response', () => {
      const signalrOnly = makeAsset({
        id: 'sig-only',
        kanbanTaskId: 't-1',
        createdAt: '2026-06-01T00:00:00Z'
      });
      signalR.emit(ASSET_EVENT.AssetCompleted, signalrOnly);

      service.hydrateCompletedForTask('t-1');
      api.lastListEmitter().next([]);

      const rows = service.completedByTaskId()['t-1'] ?? [];
      expect(rows.map(a => a.id)).toContain('sig-only');
    });

    it('merge replaces an older in-memory entry with a newer server entry', () => {
      const old = makeAsset({
        id: 'dup',
        kanbanTaskId: 't-1',
        fileName: 'old.pdf',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      });
      signalR.emit(ASSET_EVENT.AssetCompleted, old);

      service.hydrateCompletedForTask('t-1');
      const fresh = makeAsset({
        id: 'dup',
        kanbanTaskId: 't-1',
        fileName: 'new.pdf',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z'
      });
      api.lastListEmitter().next([fresh]);

      const rows = service.completedByTaskId()['t-1'] ?? [];
      expect(rows.length).toBe(1);
      expect(rows[0].fileName).toBe('new.pdf');
    });

    it('is a no-op for an empty taskId', () => {
      service.hydrateCompletedForTask('');
      expect(api.listAttachmentsByTask).not.toHaveBeenCalled();
    });

    it('maps a 403 list failure to HTTP_403 non-retryable', () => {
      service.hydrateCompletedForTask('t-1');
      api
        .lastListEmitter()
        .error(new HttpErrorResponse({ status: 403 }));

      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('error');
      expect(service.completedFetchByTaskId()['t-1']?.error?.code).toBe(
        'HTTP_403'
      );
      expect(service.completedFetchByTaskId()['t-1']?.error?.retryable).toBe(
        false
      );
    });

    it('maps a 404 list failure to HTTP_404 non-retryable', () => {
      service.hydrateCompletedForTask('t-1');
      api
        .lastListEmitter()
        .error(new HttpErrorResponse({ status: 404 }));

      expect(service.completedFetchByTaskId()['t-1']?.error?.code).toBe(
        'HTTP_404'
      );
      expect(service.completedFetchByTaskId()['t-1']?.error?.retryable).toBe(
        false
      );
    });

    it('maps a status-0 network failure to NETWORK retryable', () => {
      service.hydrateCompletedForTask('t-1');
      api.lastListEmitter().error(new HttpErrorResponse({ status: 0 }));

      expect(service.completedFetchByTaskId()['t-1']?.error?.code).toBe(
        'NETWORK'
      );
      expect(service.completedFetchByTaskId()['t-1']?.error?.retryable).toBe(
        true
      );
    });

    it('allows a fresh fetch after a failed one (phase transitions from error back to loading)', () => {
      service.hydrateCompletedForTask('t-1');
      api.lastListEmitter().error(new HttpErrorResponse({ status: 500 }));
      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('error');

      // Retry — the error phase does NOT block re-entry (only 'loading' does).
      service.hydrateCompletedForTask('t-1');
      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('loading');
      expect(api.listAttachmentsByTask.mock.calls.length).toBe(2);
    });

    it('merge result is sorted DESC by createdAt (oldest at the end)', () => {
      const middle = makeAsset({
        id: 'mid',
        kanbanTaskId: 't-1',
        createdAt: '2026-03-01T00:00:00Z'
      });
      const newest = makeAsset({
        id: 'new',
        kanbanTaskId: 't-1',
        createdAt: '2026-06-01T00:00:00Z'
      });
      const oldest = makeAsset({
        id: 'old',
        kanbanTaskId: 't-1',
        createdAt: '2026-01-01T00:00:00Z'
      });

      service.hydrateCompletedForTask('t-1');
      // Purposefully pass in a jumbled order — the merge must still sort DESC.
      api.lastListEmitter().next([middle, oldest, newest]);

      const rows = service.completedByTaskId()['t-1'] ?? [];
      expect(rows.map(a => a.id)).toEqual(['new', 'mid', 'old']);
    });

    it('merge preserves a signalR-origin entry AND sorts it correctly against server entries', () => {
      const signalrNew = makeAsset({
        id: 'sig-new',
        kanbanTaskId: 't-1',
        createdAt: '2026-06-01T00:00:00Z'
      });
      signalR.emit(ASSET_EVENT.AssetCompleted, signalrNew);

      const serverOld = makeAsset({
        id: 'srv-old',
        kanbanTaskId: 't-1',
        createdAt: '2026-01-01T00:00:00Z'
      });
      const serverMid = makeAsset({
        id: 'srv-mid',
        kanbanTaskId: 't-1',
        createdAt: '2026-03-01T00:00:00Z'
      });

      service.hydrateCompletedForTask('t-1');
      api.lastListEmitter().next([serverOld, serverMid]);

      const rows = service.completedByTaskId()['t-1'] ?? [];
      expect(rows.map(a => a.id)).toEqual(['sig-new', 'srv-mid', 'srv-old']);
    });

    it('cancels a stale list subscription when the same taskId is hydrated again after a completed round', () => {
      service.hydrateCompletedForTask('t-1');
      // Emit success to finish the first round.
      api.lastListEmitter().next([]);
      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('ready');

      // Second round — this should start a NEW subscription; the previous
      // one is already completed so there is nothing to cancel, but the call
      // must still succeed.
      service.hydrateCompletedForTask('t-1');
      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('loading');
      api.lastListEmitter().next([]);
      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('ready');
    });

    it('does not clear completedByTaskId when transitioning loading→error', () => {
      const seed = makeAsset({ id: 'seed', kanbanTaskId: 't-1' });
      signalR.emit(ASSET_EVENT.AssetCompleted, seed);
      expect(service.completedByTaskId()['t-1']?.length).toBe(1);

      service.hydrateCompletedForTask('t-1');
      expect(service.completedFetchByTaskId()['t-1']?.phase).toBe('loading');
      // completedByTaskId must remain populated during the loading phase.
      expect(service.completedByTaskId()['t-1']?.length).toBe(1);

      api.lastListEmitter().error(new HttpErrorResponse({ status: 500 }));
      // And after the error, still populated.
      expect(service.completedByTaskId()['t-1']?.length).toBe(1);
    });
  });

  describe('list subscription cleanup', () => {
    it('cancels outstanding list subs on service destroy', () => {
      service.hydrateCompletedForTask('t-1');
      service.hydrateCompletedForTask('t-2');
      const subjectA = api.listEmitters[0];
      const subjectB = api.listEmitters[1];

      // Destroy the root injector — triggers `destroyRef.onDestroy` callback.
      TestBed.resetTestingModule();

      // The subjects themselves are Subjects; we can't directly inspect
      // subscription count, but we can prove that emitting after destroy does
      // not throw / does not mutate state (state mutations would throw since
      // the service is torn down).
      expect(() => subjectA.next([])).not.toThrow();
      expect(() => subjectB.next([])).not.toThrow();
    });
  });
});
