# Technical Specification: Async File Upload with Progress Tracking

**Context Document:** [issue_50_context.md](./issue_50_context.md)
**GitHub Issue:** #50
**Milestone:** #6 — Asynchronous File Upload UI

## Overview

This feature introduces the upload half of the attachment pipeline. It turns the `DropzoneFileSelectedEvent` emitted by #49 into a real `POST /api/attachment/task/{taskId}` call, renders per-upload progress driven by `HttpClient` with `reportProgress: true` / `observe: 'events'`, reconciles the four asset-lifecycle SignalR events by `assetId`, maps both HTTP failures and `AssetFailed` events to user-specific copy, and supports cancel + retry. In-flight upload state lives in a new root-provided `AttachmentsStateService` keyed by `taskId` so that uploads survive panel-close and board-navigation (the preferred "continue in background" behaviour from the context doc). A new dumb `UploadProgressRowComponent` renders each upload row. The dropzone component (#49) is not modified — the panel host adds a sibling progress row and feeds a computed `disabled` / `disabledReason` into the existing dropzone inputs to implement the "block second file while one is uploading" MVP.

## Resolved Open Questions

**Q1 — Where does the upload call originate?**
→ **Option (c): new root-provided `AttachmentsStateService`.** Neither the board page nor the task-detail panel is a safe owner: the panel is destroyed on close, the board page is destroyed on navigation, and the context doc's "navigating between boards / tasks does not leave orphan uploads" AC prefers "upload continues in the background". A root-provided service is the only surface that outlives both. `BoardPageComponent.handleAttachmentSelected` becomes a thin dispatch into the service.

**Q2 — Second file dropped while an upload is in flight?**
→ **Block (MVP recommendation stands).** `AttachmentsStateService` exposes `isUploadingForTask(taskId: string): Signal<boolean>`. `TaskDetailPanelComponent` wires that into the dropzone's existing `[disabled]` + `[disabledReason]` inputs ("Upload in progress — one moment"). No queue, no confirm prompt, no parallel. Reuses the #49 disabled path — no dropzone changes.

**Q3 — In-UI retry on HTTP failure?**
→ **Retry with kept `File` reference.** On HTTP failure or `AssetFailed`, the in-flight row enters an `error` phase but the `AttachmentUpload.file: File` reference is preserved. The progress row renders a "Try again" button that re-invokes `AttachmentsStateService.retry(uploadId)`. Dismiss (×) discards the `File` and removes the row.

**Q4 — Where does upload-in-flight state live?**
→ **New `AttachmentsStateService`, keyed by `taskId`, extends `BaseStateService`.** Not on `BoardTask` (decouples attachments from the board-scope concern), not local to the panel (dies on close). The same service holds a `completedByTaskId: Record<string, AssetResponseDto[]>` slice that #51 will read for the attachment list. Structure matches the precedent set by `MembersStateService`.

## Component Architecture

### Routing

**No new routes.** The feature lives inside the existing `/board/:projectId` route hosted by `BoardPageComponent`. All new UI is rendered inside the existing task-detail panel or alongside the existing dropzone.

### Component Hierarchy

**Smart Components (containers / orchestrators):**
- `AttachmentsStateService` ([src/app/features/attachments/state/attachments-state.service.ts](src/app/features/attachments/state/attachments-state.service.ts)) — *service, not a component*, root-provided. Owns the upload pipeline (HTTP + SignalR reconciliation) and all upload state. Dispatches upload, tracks progress, handles cancel / retry.
- `BoardPageComponent` ([src/app/features/board/board-page/board-page.component.ts](src/app/features/board/board-page/board-page.component.ts)) — existing. Only change: the no-op `handleAttachmentSelected` at line 210 is replaced with a single `attachmentsState.startUpload(event)` call.
- `TaskDetailPanelComponent` ([src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts](src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts)) — existing. Gains: reads `attachmentsState.uploadsForTask(task().id)` and renders an `UploadProgressRowComponent` per upload, computes `disabled` / `disabledReason` from `attachmentsState.isUploadingForTask(task().id)`.

**Dumb Components (presentational):**
- `UploadProgressRowComponent` ([src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.ts](src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.ts))
  - **Inputs:** `upload: AttachmentUpload` (required)
  - **Outputs:**
    - `cancel = output<string>()` — emits `uploadId`
    - `retry = output<string>()` — emits `uploadId`
    - `dismiss = output<string>()` — emits `uploadId`
  - Renders phase-specific UI (`uploading` → progress bar + cancel, `processing` → indeterminate + cancel-disabled, `error` → error message + retry + dismiss). Pure display; no HttpClient, no service injection.
  - `ChangeDetectionStrategy.OnPush`.

### New Files to Create

**Models (pure TS interfaces — no runtime code):**
- [KanbAI-Web/src/app/features/attachments/models/attachment.model.ts](KanbAI-Web/src/app/features/attachments/models/attachment.model.ts) — `AssetResponseDto`, `ProcessingStatus` const enum, `AssetStatusEventDto`, `AssetFailedEventDto`. Mirrors [.claude/backend_api_map.md](.claude/backend_api_map.md) §`AssetResponseDto` and §SignalR event DTOs lines 295–369.
- [KanbAI-Web/src/app/features/attachments/models/attachment-upload.model.ts](KanbAI-Web/src/app/features/attachments/models/attachment-upload.model.ts) — local-only `AttachmentUpload`, `AttachmentUploadPhase`, `AttachmentUploadError` types. Never crosses the wire.

**State:**
- [KanbAI-Web/src/app/features/attachments/state/attachments-state.model.ts](KanbAI-Web/src/app/features/attachments/state/attachments-state.model.ts) — `AttachmentsState` interface + `INITIAL_ATTACHMENTS_STATE` constant.
- [KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts](KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts) — root-provided service extending `BaseStateService<AttachmentsState>`.
- [KanbAI-Web/src/app/features/attachments/state/attachments-state.service.spec.ts](KanbAI-Web/src/app/features/attachments/state/attachments-state.service.spec.ts) — Vitest unit tests.

**API:**
- [KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts](KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts) — thin HTTP wrapper returning `Observable<HttpEvent<ApiResponse<AssetResponseDto>>>`.
- [KanbAI-Web/src/app/features/attachments/services/attachments-api.service.spec.ts](KanbAI-Web/src/app/features/attachments/services/attachments-api.service.spec.ts) — Vitest spec.

**Constants:**
- [KanbAI-Web/src/app/features/attachments/constants/upload-errors.ts](KanbAI-Web/src/app/features/attachments/constants/upload-errors.ts) — mapping from HTTP status + server error string to user-facing copy, per the context doc's error table. Also exports a small copy constant bag (e.g. `UPLOAD_BLOCKED_REASON`).
- [KanbAI-Web/src/app/features/attachments/constants/asset-events.ts](KanbAI-Web/src/app/features/attachments/constants/asset-events.ts) — string-literal constants `ASSET_EVENT.AssetUploadStarted | AssetProcessing | AssetCompleted | AssetFailed`. Symmetrical to the existing `REALTIME_EVENT` in [src/app/core/models/realtime-events.ts](src/app/core/models/realtime-events.ts), but scoped to the attachments slice so the core model file doesn't grow features/ concerns.

**Component (dumb):**
- [KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.ts](KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.ts)
- [KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.html](KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.html)
- [KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.scss](KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.scss)
- [KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.spec.ts](KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.spec.ts)

### Files to Modify

- [KanbAI-Web/src/app/features/board/board-page/board-page.component.ts](KanbAI-Web/src/app/features/board/board-page/board-page.component.ts) — replace `handleAttachmentSelected` no-op body with `this.attachmentsState.startUpload(event);` and inject `AttachmentsStateService`.
- [KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts](KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts) — inject `AttachmentsStateService`, add `uploads = computed(...)`, `isUploading = computed(...)`, `disabledReason = computed(...)` merging pre-existing disabled state with block-during-upload, add `handleCancel/handleRetry/handleDismiss(uploadId)` delegators.
- [KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html](KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html) — render `@for (upload of uploads(); track upload.id)` of `<app-upload-progress-row>` below the `<app-file-dropzone>`; pass the merged disabled + reason into the dropzone.
- [KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts](KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts) — extend with upload-list rendering + disabled-during-upload cases; pre-existing specs must remain green.

**Files explicitly NOT modified:**
- `FileDropzoneComponent` and its spec — the dropzone contract is frozen (AC mandate). No new phase, no new input, no new output. All new UI is layered *outside* the dropzone.
- `BoardStateService`, `board-state.model.ts` — attachments do not touch board state in this ticket.
- `realtime-events.ts` — asset events live in a dedicated `asset-events.ts` so that file does not accumulate features/ concerns. (Alternative: extend `REALTIME_EVENT` — but the file's docstring already calls out it mirrors backend events for the *board* surface; adding `Asset*` would dilute that scope.)

## State & Data Layer

### State Management Strategy

**Root-provided signal state (`BaseStateService<AttachmentsState>`):**

```typescript
// In AttachmentsStateService — read-only selectors
readonly uploadsByTaskId: Signal<Record<string, AttachmentUpload[]>> = this.select(s => s.uploadsByTaskId);
readonly completedByTaskId: Signal<Record<string, AssetResponseDto[]>> = this.select(s => s.completedByTaskId);

// Per-task selectors — caller passes the taskId
uploadsForTask(taskId: string): Signal<AttachmentUpload[]> {
  return computed(() => this.uploadsByTaskId()[taskId] ?? []);
}
isUploadingForTask(taskId: string): Signal<boolean> {
  return computed(() => (this.uploadsByTaskId()[taskId] ?? [])
    .some(u => u.phase === 'uploading' || u.phase === 'processing'));
}
```

**RxJS for upload + SignalR:**
- The upload call is an RxJS `Observable<HttpEvent<...>>` chain. Per-upload subscription is held in a private `Map<uploadId, Subscription>` inside the service so that `cancel(uploadId)` can unsubscribe and abort the HTTP request.
- The four asset SignalR events are subscribed via `SignalRService.on<T>(eventName)` inside an `effect()` that (re)subscribes on every `connectionState → 'connected'` transition — same pattern `BoardStateService` already uses (board-state.service.ts lines 55–97). Teardown on destroy.

**Bridge to Signals:**
- Not needed for the upload itself — progress is written into the state signal inside the `.subscribe(next)` handler via `setState`.

### TypeScript Interfaces

**File:** [KanbAI-Web/src/app/features/attachments/models/attachment.model.ts](KanbAI-Web/src/app/features/attachments/models/attachment.model.ts)

```typescript
import { ApiResponse } from '../../projects/models/project.model';

/**
 * Backend ProcessingStatus enum — mirrors .claude/backend_api_map.md §AssetResponseDto
 * line 307. Values are numeric on the wire.
 */
export const ProcessingStatus = {
  Pending: 0,
  Processing: 1,
  Completed: 2,
  Failed: 3
} as const;
export type ProcessingStatusValue = (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

/**
 * Response payload for POST /api/attachment/task/{taskId} (201)
 * and payload of AssetCompleted SignalR event.
 * Mirrors .claude/backend_api_map.md §AssetResponseDto lines 295–310.
 */
export interface AssetResponseDto {
  id: string;               // GUID — asset id
  fileName: string;         // sanitized original filename
  storageKey: string;       // server-internal, clients prefer GET /api/attachment/{assetId}
  thumbnailKey: string | null;
  mimeType: string;         // server-resolved (not client Content-Type)
  fileSize: number;         // bytes
  processingStatus: ProcessingStatusValue;
  kanbanTaskId: string;     // GUID — owning task
  createdAt: string;        // ISO-8601
  updatedAt: string;        // ISO-8601
}

/** Envelope for POST /api/attachment/task/{taskId}. */
export type AssetUploadResponse = ApiResponse<AssetResponseDto>;

/**
 * Payload of AssetUploadStarted (processingStatus = 0 = Pending) and
 * AssetProcessing (processingStatus = 1 = Processing) SignalR events.
 * Mirrors .claude/backend_api_map.md §AssetStatusEventDto lines 354–361.
 */
export interface AssetStatusEventDto {
  assetId: string;                         // GUID
  taskId: string;                          // GUID
  fileName: string;
  processingStatus: ProcessingStatusValue; // 0 or 1 for these events
}

/**
 * Payload of AssetFailed SignalR event.
 * Mirrors .claude/backend_api_map.md §AssetFailedEventDto lines 363–369.
 */
export interface AssetFailedEventDto {
  assetId: string;      // GUID
  taskId: string;       // GUID
  errorMessage: string; // raw server reason — MUST be mapped to user copy before rendering
}
```

**File:** [KanbAI-Web/src/app/features/attachments/models/attachment-upload.model.ts](KanbAI-Web/src/app/features/attachments/models/attachment-upload.model.ts)

```typescript
/**
 * Visual/state phase of a single in-flight upload row.
 *  - 'uploading'  : bytes in flight; determinate progress 0..100
 *  - 'processing' : HTTP 201 received; waiting on AssetCompleted / AssetFailed;
 *                   progress is no longer meaningful, show indeterminate treatment
 *  - 'error'      : HTTP failure or AssetFailed; retry + dismiss affordances shown
 */
export type AttachmentUploadPhase = 'uploading' | 'processing' | 'error';

/**
 * Structured error attached to an upload row in the 'error' phase.
 * `userMessage` is the pre-mapped copy rendered to the user. `cause` is
 * retained only in memory for potential future telemetry; it must never
 * be logged to console or sent to an external sink (AC: privacy/logging).
 */
export interface AttachmentUploadError {
  readonly code:
    | 'HTTP_400'
    | 'HTTP_403'
    | 'HTTP_404'
    | 'HTTP_413'
    | 'HTTP_500'
    | 'HTTP_OTHER'
    | 'NETWORK'
    | 'ASSET_FAILED';
  readonly userMessage: string;
}

/**
 * Single in-flight upload row held in AttachmentsStateService.
 * `file` is retained in memory through the 'error' phase to support retry
 * without re-asking the user to pick the file again.
 */
export interface AttachmentUpload {
  /** Local-only id (crypto.randomUUID()). Distinct from `assetId`. */
  readonly id: string;
  /** Task the file is being attached to. */
  readonly taskId: string;
  /** The user's File — kept for retry, released on clear/cancel/completion. */
  readonly file: File;
  /** Human-readable size used in the row header (from formatFileSize). */
  readonly fileSizeDisplay: string;
  /** Current phase of the upload. */
  readonly phase: AttachmentUploadPhase;
  /** 0..100, monotonic during 'uploading'; frozen at 100 once bytes complete. */
  readonly progress: number;
  /**
   * `assetId` returned by the 201. Null while 'uploading'; populated once the
   * HTTP response arrives. Used to reconcile incoming SignalR Asset* events.
   */
  readonly assetId: string | null;
  /** Populated only in the 'error' phase. */
  readonly error: AttachmentUploadError | null;
  /** Wall-clock creation time (ms epoch). Used for stable sort in the UI. */
  readonly startedAt: number;
}
```

**File:** [KanbAI-Web/src/app/features/attachments/state/attachments-state.model.ts](KanbAI-Web/src/app/features/attachments/state/attachments-state.model.ts)

```typescript
import { AssetResponseDto } from '../models/attachment.model';
import { AttachmentUpload } from '../models/attachment-upload.model';

export interface AttachmentsState {
  /**
   * Local-origin in-flight uploads (only the uploads THIS client initiated).
   * Teammate uploads received over SignalR never appear here.
   */
  uploadsByTaskId: Record<string, AttachmentUpload[]>;

  /**
   * Completed attachments per task. Written when AssetCompleted fires for
   * an assetId we have, OR when AssetCompleted fires for a previously-unseen
   * assetId (teammate-origin upload). Consumed by issue #51's attachment list.
   */
  completedByTaskId: Record<string, AssetResponseDto[]>;
}

export const INITIAL_ATTACHMENTS_STATE: AttachmentsState = {
  uploadsByTaskId: {},
  completedByTaskId: {}
};
```

**File:** [KanbAI-Web/src/app/features/attachments/constants/asset-events.ts](KanbAI-Web/src/app/features/attachments/constants/asset-events.ts)

```typescript
export const ASSET_EVENT = {
  AssetUploadStarted: 'AssetUploadStarted',
  AssetProcessing: 'AssetProcessing',
  AssetCompleted: 'AssetCompleted',
  AssetFailed: 'AssetFailed'
} as const;
export type AssetEventName = (typeof ASSET_EVENT)[keyof typeof ASSET_EVENT];
```

**File:** [KanbAI-Web/src/app/features/attachments/constants/upload-errors.ts](KanbAI-Web/src/app/features/attachments/constants/upload-errors.ts)

```typescript
import { HttpErrorResponse } from '@angular/common/http';
import { AttachmentUploadError } from '../models/attachment-upload.model';

/**
 * Copy shown in the dropzone's disabled state while an upload is in flight.
 * Exact visual wording is refined in the design spec; this is the default
 * programmatic string.
 */
export const UPLOAD_BLOCKED_REASON = 'Upload in progress — one moment.';

/**
 * Translates an HttpErrorResponse (or a thrown transport error) to the
 * exact user-facing copy specified in issue_50_context.md §Desired State
 * "HTTP failure before the upload completes". The filename is formatted
 * into the message by the caller; this function returns copy with a {name}
 * placeholder already substituted.
 *
 * The STATUS→CODE mapping is the AC-critical contract; the literal copy
 * strings may be tightened by the design spec, but the mapping must not drift.
 */
export function mapUploadHttpErrorToUserMessage(
  error: unknown,
  fileName: string
): AttachmentUploadError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return {
        code: 'NETWORK',
        userMessage: "Network problem — the upload didn't reach the server. Try again."
      };
    }
    // 403 — also feeds into project-membership-loss handling (see note below).
    if (error.status === 403) {
      return { code: 'HTTP_403', userMessage: "You're no longer a member of this project." };
    }
    if (error.status === 404) {
      return { code: 'HTTP_404', userMessage: 'This task no longer exists.' };
    }
    if (error.status === 413) {
      return { code: 'HTTP_413', userMessage: `${fileName} is larger than 10 MB.` };
    }
    if (error.status === 400) {
      const serverMessage = extractServerMessage(error);
      if (serverMessage === 'File type is not allowed.') {
        return { code: 'HTTP_400', userMessage: `${fileName} isn't an allowed file type.` };
      }
      if (serverMessage === 'File cannot be empty.') {
        return { code: 'HTTP_400', userMessage: `${fileName} is empty.` };
      }
      if (serverMessage === 'File name is invalid.') {
        return {
          code: 'HTTP_400',
          userMessage: `${fileName} has characters we can't accept — rename the file and try again.`
        };
      }
      return { code: 'HTTP_400', userMessage: "We didn't receive the file. Try again." };
    }
    if (error.status >= 500) {
      return { code: 'HTTP_500', userMessage: 'Upload failed — please try again.' };
    }
    return { code: 'HTTP_OTHER', userMessage: 'Upload failed — please try again.' };
  }
  return { code: 'NETWORK', userMessage: "Network problem — the upload didn't reach the server. Try again." };
}

/**
 * Copy for AssetFailed events. The raw server errorMessage is not rendered
 * verbatim (it may reference server-internal details); it is collapsed to a
 * single user-readable sentence naming the file.
 */
export function mapAssetFailedToUserMessage(fileName: string): AttachmentUploadError {
  return { code: 'ASSET_FAILED', userMessage: `We couldn't save ${fileName}. Try again.` };
}

/** Safely extracts a known backend error string out of an ApiResponse-wrapped 4xx body. */
function extractServerMessage(error: HttpErrorResponse): string | null {
  const body = error.error;
  if (body && typeof body === 'object') {
    if (typeof body.message === 'string' && body.message.length > 0) return body.message;
    if (Array.isArray(body.errors) && typeof body.errors[0] === 'string') return body.errors[0];
  }
  return null;
}
```

## Service Integration

### AttachmentsApiService

**File:** [KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts](KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts)

**Purpose:** Thin, test-friendly wrapper over `HttpClient`. Emits raw `HttpEvent` so the caller (`AttachmentsStateService`) can inspect `UploadProgress` vs `Response` events.

```typescript
@Injectable({ providedIn: 'root' })
export class AttachmentsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/attachment`;

  /**
   * POST /api/attachment/task/{taskId} — multipart/form-data with single 'file' field.
   * Returns the raw HttpEvent stream so the caller can observe UploadProgress
   * and the final Response (which unwraps the ApiResponse envelope at the
   * state-service layer).
   *
   * NOTE: no explicit Authorization header — the global authInterceptor
   * (core/interceptors/auth.interceptor.ts) attaches `Bearer <token>` because
   * the request URL starts with environment.apiUrl.
   */
  uploadAttachment(
    taskId: string,
    file: File
  ): Observable<HttpEvent<AssetUploadResponse>> {
    const url = `${this.apiUrl}/task/${encodeURIComponent(taskId)}`;
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post<AssetUploadResponse>(url, formData, {
      reportProgress: true,
      observe: 'events'
    });
  }
}
```

**Why no Content-Type header:** when the body is a `FormData`, the browser sets `Content-Type: multipart/form-data; boundary=...` automatically. Setting it manually strips the boundary and breaks the request — a common pitfall.

### AttachmentsStateService

**File:** [KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts](KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts)

**Public contract:**

```typescript
@Injectable({ providedIn: 'root' })
export class AttachmentsStateService extends BaseStateService<AttachmentsState> {
  // Selectors
  readonly uploadsByTaskId: Signal<Record<string, AttachmentUpload[]>>;
  readonly completedByTaskId: Signal<Record<string, AssetResponseDto[]>>;
  uploadsForTask(taskId: string): Signal<AttachmentUpload[]>;
  isUploadingForTask(taskId: string): Signal<boolean>;

  // Commands
  startUpload(event: DropzoneFileSelectedEvent): void;
  cancel(uploadId: string): void;
  retry(uploadId: string): void;
  dismiss(uploadId: string): void;
}
```

**Lifecycle wiring (constructor):**
- `effect()` watches `signalRService.connectionState()`. On every transition to `'connected'` the service tears down its asset-event subscriptions and re-subscribes to `ASSET_EVENT.AssetUploadStarted | AssetProcessing | AssetCompleted | AssetFailed`. This mirrors the reconnect pattern already in `BoardStateService`. Subscriptions are stored in `subscriptionBag: Subscription[]`; a `destroyRef.onDestroy()` tears them down on service destruction (root-provided services are destroyed with the injector, i.e., effectively never in-app — but the teardown is correct for tests).

**`startUpload(event)` algorithm:**
1. Build `AttachmentUpload { id: crypto.randomUUID(), taskId, file, fileSizeDisplay: formatFileSize(file.size), phase: 'uploading', progress: 0, assetId: null, error: null, startedAt: Date.now() }`.
2. `setState` — append to `uploadsByTaskId[taskId]`.
3. Call `attachmentsApi.uploadAttachment(taskId, file).subscribe(handler)`. Save the `Subscription` in `private readonly uploadSubs = new Map<string, Subscription>()`.
4. Handler switches on `event.type`:
   - `HttpEventType.UploadProgress`: compute `percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0`; clamp to `[previousProgress, 99]` (ensures monotonic and leaves `100` for the Response event so progress never flips to `100%` before the server has accepted the bytes).
   - `HttpEventType.Response`: read `event.body` (ApiResponse<AssetResponseDto>); if `success === false || data == null`, treat as HTTP error (throw inside a catchError branch — see below). Otherwise: update the row to `{ progress: 100, phase: 'processing', assetId: data.id }`. Drop the stored `Subscription` from `uploadSubs` (request is done).
   - Other event types: ignore.
5. `error` handler: map via `mapUploadHttpErrorToUserMessage(err, file.name)`, transition row to `{ phase: 'error', error, assetId: null }`. Drop the subscription. Keep `file` in the row for retry. **Special case:** `error.code === 'HTTP_403'` additionally triggers project-membership-loss handling — see "403 handling" below.

**`cancel(uploadId)` algorithm:**
1. Look up the `Subscription` in `uploadSubs`; `unsubscribe()` if present (aborts the in-flight HTTP request and the underlying `XMLHttpRequest`).
2. Remove the row from `uploadsByTaskId[upload.taskId]` entirely (the AC specifies cancel returns the dropzone to idle with no error shown).
3. Record the cancelled `assetId` (if any) in a short-lived `cancelledAssetIds: Set<string>` so that late-arriving `AssetFailed` / `AssetCompleted` events for this assetId are suppressed per AC. Entries auto-expire after 5 minutes to bound the Set's growth.
4. If the cancel happened before an `assetId` was assigned (cancel during bytes-in-flight), no SignalR events can reference this upload — no suppression entry needed.

**`retry(uploadId)` algorithm:**
1. Look up the row. Must be in `phase === 'error'`.
2. Reset `{ phase: 'uploading', progress: 0, assetId: null, error: null }` (keep same `id` + `startedAt`).
3. Re-invoke the same upload pipeline as `startUpload`, storing the new subscription under the same `uploadId`.

**`dismiss(uploadId)` algorithm:**
1. Must be in `phase === 'error'`. Remove from `uploadsByTaskId`. Release the `File` reference (let it fall out of state).

**SignalR event handlers:**

- **`AssetUploadStarted` (AssetStatusEventDto, processingStatus = 0):** If any local row has `assetId === evt.assetId`, no-op (we already transitioned to `processing` via the 201). If none, this is a teammate's upload start — no action for #50 (teammates' assets only materialize on `AssetCompleted`).
- **`AssetProcessing` (AssetStatusEventDto, processingStatus = 1):** Same handling — local rows are already in `processing` phase; teammate rows are ignored until Completed.
- **`AssetCompleted` (AssetResponseDto):**
  1. If `cancelledAssetIds.has(evt.id)` → drop it (user-cancelled). Still append to `completedByTaskId` so #51 reflects server truth? **No** — the AC says "the UI treats it as the normal background-completion case for #51". That means: add to `completedByTaskId` but do NOT add to a local upload row. So: remove from `cancelledAssetIds`, append to `completedByTaskId[evt.kanbanTaskId]` (dedupe by `id`), do not touch `uploadsByTaskId`.
  2. Otherwise find the local row by `assetId`. If found: append the `AssetResponseDto` to `completedByTaskId[evt.kanbanTaskId]` (dedupe), then remove the row from `uploadsByTaskId[evt.kanbanTaskId]`. The dropzone becomes ready for another file automatically (because `isUploadingForTask` flips to `false`).
  3. If not found (teammate-origin completion): append to `completedByTaskId[evt.kanbanTaskId]` (dedupe), do not touch `uploadsByTaskId`.
- **`AssetFailed` (AssetFailedEventDto):**
  1. If `cancelledAssetIds.has(evt.assetId)` → silently drop (AC: "If `AssetFailed` arrives, it is silently ignored — the user chose to cancel"). Remove from `cancelledAssetIds`.
  2. Otherwise find the row by `assetId`. If found, transition to `phase: 'error'`, `error: mapAssetFailedToUserMessage(row.file.name)` (we use the row's original filename, never the server errorMessage, per AC: "human-readable reason derived from the AssetFailedEventDto" but mapped — not rendered raw). Keep `file` for retry.
  3. If not found (teammate upload failed — we never rendered it): no-op. `completedByTaskId` is not mutated; the AC matches the backend's DB rollback behaviour.

**Reconciliation by `assetId`** — the non-negotiable invariant:
- A local row's `assetId` is set *once*, by the 201 response.
- All SignalR asset events look up by `assetId`. There is no fall-back match by `fileName` (two users could upload files with identical names in the same second) or `taskId` (multiple uploads per task could happen in sequence).

**403 handling (project-membership loss):**
- On `HTTP_403` from the upload call, `AttachmentsStateService` does NOT directly manipulate `BoardStateService` or navigate. Per AC, "same mechanism #49 uses for locally-known membership loss." Current behaviour: `FileDropzoneComponent`'s `disabled` input is driven by the parent. The panel (`TaskDetailPanelComponent`) already accepts `disabled` + `disabledReason` inputs from the board page. Board page feeds those from its own state. For #50, a pragmatic path: keep the error row (as mapped) which communicates "You're no longer a member…" inline, AND let the existing `authInterceptor` 401 behaviour cover token issues; a full project-membership refresh-and-navigate is #60-era / out of scope. Explicit note: design spec is free to couple the 403 error row to a prominent affordance ("Return to dashboard") — but **no programmatic route change from this service.**
- Flagged as a residual gap: a long-term fix would be a shared `ProjectMembershipService.markProjectNotAccessible(projectId)` that every feature slice could dispatch into; out of scope here.

### HTTP Request/Response Contracts

| Method | Endpoint | Request Body | Response Body | Error Codes |
|--------|----------|--------------|---------------|-------------|
| POST | `/api/attachment/task/{taskId}` | `multipart/form-data` — single `file: File` field | `201 ApiResponse<AssetResponseDto>` | `400`, `403`, `404`, `413`, `500`, `0` (network) |

### SignalR Event Subscriptions

| Event name | Payload DTO | Handler outcome |
|------------|-------------|-----------------|
| `AssetUploadStarted` | `AssetStatusEventDto` | no-op (our local row already post-201) |
| `AssetProcessing` | `AssetStatusEventDto` | no-op |
| `AssetCompleted` | `AssetResponseDto` | finalize local row → `completedByTaskId`, drop from `uploadsByTaskId`; if teammate, just append to `completedByTaskId` |
| `AssetFailed` | `AssetFailedEventDto` | transition local row to `error`; if cancelled, ignore; if teammate, no-op |

## Implementation Steps

Follow in order. Each step produces an artifact reviewable in isolation. **The dropzone (#49) is frozen — step 0 is a build-green baseline; no file touched by these steps is in `src/app/features/attachments/components/file-dropzone/`.**

### 1. Type Definitions
- [ ] Create `src/app/features/attachments/models/attachment.model.ts` — `ProcessingStatus`, `AssetResponseDto`, `AssetUploadResponse`, `AssetStatusEventDto`, `AssetFailedEventDto`.
- [ ] Create `src/app/features/attachments/models/attachment-upload.model.ts` — `AttachmentUploadPhase`, `AttachmentUploadError`, `AttachmentUpload`.
- [ ] Create `src/app/features/attachments/state/attachments-state.model.ts` — `AttachmentsState`, `INITIAL_ATTACHMENTS_STATE`.
- [ ] Create `src/app/features/attachments/constants/asset-events.ts` — `ASSET_EVENT` map + `AssetEventName`.
- [ ] Create `src/app/features/attachments/constants/upload-errors.ts` — `UPLOAD_BLOCKED_REASON`, `mapUploadHttpErrorToUserMessage`, `mapAssetFailedToUserMessage`.

### 2. API Service
- [ ] Create `src/app/features/attachments/services/attachments-api.service.ts` — `uploadAttachment(taskId, file)` returning `Observable<HttpEvent<AssetUploadResponse>>` with `reportProgress: true`, `observe: 'events'`, `FormData` with single `file` field.
- [ ] Do NOT set `Content-Type` manually.
- [ ] Build relies on the global `authInterceptor` attaching `Authorization: Bearer <token>` — no manual header.
- [ ] Spec: `attachments-api.service.spec.ts`:
  - Uses `provideHttpClient()` + `provideHttpClientTesting()` + `HttpTestingController`.
  - Asserts the request is `POST`, URL is `<apiUrl>/attachment/task/<taskId>` (URL-encoded), the body is a `FormData` containing exactly one `file` entry whose name matches, that `reportProgress` and `observe: 'events'` are honoured (HttpTestingController captures these flags in the req object).
  - Flushes a progress event, then a response event; asserts both are forwarded.

### 3. State Service
- [ ] Create `src/app/features/attachments/state/attachments-state.service.ts` extending `BaseStateService<AttachmentsState>`.
- [ ] Inject `AttachmentsApiService`, `SignalRService`, `DestroyRef`.
- [ ] Implement selectors: `uploadsByTaskId`, `completedByTaskId`, `uploadsForTask(taskId)`, `isUploadingForTask(taskId)`.
- [ ] Implement `startUpload`, `cancel`, `retry`, `dismiss` per the algorithms above.
- [ ] Implement the four `ASSET_EVENT` subscriptions inside a connection-state `effect()`, mirroring `BoardStateService` lines 55–97.
- [ ] Maintain `private readonly uploadSubs = new Map<string, Subscription>()` and `private readonly cancelledAssetIds = new Set<string>()` with a 5-min expiry (setTimeout-based eviction; clear timers on destroy).
- [ ] Clamp progress monotonically and cap at 99 during `UploadProgress`; set to 100 only on `HttpEventType.Response`.
- [ ] No `console.log` of filename / file content / payload / token. `console.error` with a static string only (follow `SignalRService` pattern).
- [ ] Spec: `attachments-state.service.spec.ts`:
  - Happy path: `startUpload` → mock progress events → 201 → AssetCompleted → row removed, completed appended.
  - HTTP 413: error row appears with correct `userMessage`.
  - Network (status 0): error row with `NETWORK` code.
  - Cancel during bytes-in-flight: unsubscribe called, row removed.
  - Cancel after 201 (during processing): later AssetFailed is silently dropped; later AssetCompleted is recorded into `completedByTaskId` only.
  - AssetCompleted for unknown assetId (teammate): appends to `completedByTaskId`, does NOT create a local upload row.
  - AssetFailed for known row: transitions to error; `file` preserved; retry resets and re-fires the request.
  - Monotonic progress: fake events `{loaded: 10}, {loaded: 30}, {loaded: 20}` → state progresses `10, 30, 30` (no regression).
  - `isUploadingForTask` flips `true` on start, back to `false` on AssetCompleted.
  - Pass / fail strictly deterministic — no wall-clock waits; use fake timers for the 5-min Set eviction.

### 4. Presentational Component — UploadProgressRow
- [ ] Generate: `ng generate component features/attachments/components/upload-progress-row --skip-tests=false`.
- [ ] Input: `upload = input.required<AttachmentUpload>()`.
- [ ] Outputs: `cancel = output<string>()`, `retry = output<string>()`, `dismiss = output<string>()`.
- [ ] Computed phase strings for the template (`phaseLabel`, `showProgressBar`, `showCancel`, `showRetry`, `showDismiss`, `showError`).
- [ ] Use `ChangeDetectionStrategy.OnPush`.
- [ ] Template renders:
  - File name + `fileSizeDisplay`.
  - If `phase === 'uploading'`: progress bar with `role="progressbar"`, `aria-valuenow={{upload().progress}}`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Uploading {filename}"`. Numeric "X%" label. Cancel button.
  - If `phase === 'processing'`: indeterminate treatment + status label "Processing…" + cancel button that is `aria-disabled="true"` (per AC: cancel-during-processing is not supported server-side).
  - If `phase === 'error'`: error message + "Try again" button + dismiss (×) button. The error region uses `role="alert"` so AT announces the failure once on transition.
  - No filename / size / percent logging.
- [ ] Styling via SCSS file — design spec (#50 design-spec ticket) owns the visual tokens; placeholder minimal styles only.
- [ ] Spec: `upload-progress-row.component.spec.ts`:
  - Renders progress bar with correct ARIA attributes for each progress value (0, 50, 100).
  - Does NOT render progress bar when `phase !== 'uploading'`.
  - Emits `cancel.emit(uploadId)` when cancel clicked while `phase === 'uploading'`.
  - Emits `retry.emit(uploadId)` from the retry button while `phase === 'error'`.
  - Shows `upload.error.userMessage` verbatim when `phase === 'error'`.

### 5. Wire Dropzone Host — TaskDetailPanelComponent
- [ ] Inject `AttachmentsStateService`.
- [ ] Add `readonly uploads = computed(() => this.attachmentsState.uploadsForTask(this.task().id)())` — note the double invocation; prefer `readonly uploads = this.attachmentsState.uploadsForTask(this.task().id)` evaluated inside a `computed` wrapper if `task` changes. **Correct pattern:** `readonly uploads = computed<AttachmentUpload[]>(() => this.attachmentsState.uploadsByTaskId()[this.task().id] ?? [])`. (Don't call the per-task factory inline — it'd create a fresh computed every change-detection pass.)
- [ ] Add `readonly isUploading = computed<boolean>(() => this.uploads().some(u => u.phase === 'uploading' || u.phase === 'processing'));`
- [ ] Add `readonly resolvedDisabled = computed<boolean>(() => this.disabled() || this.isUploading());`
- [ ] Add `readonly resolvedDisabledReason = computed<string | null>(() => { if (this.disabled()) return this.disabledReason(); if (this.isUploading()) return UPLOAD_BLOCKED_REASON; return null; });`
- [ ] Template: pass `[disabled]="resolvedDisabled()"` and `[disabledReason]="resolvedDisabledReason()"` to `<app-file-dropzone>`.
- [ ] Template: below the dropzone, render `@for (u of uploads(); track u.id) { <app-upload-progress-row [upload]="u" (cancel)="handleCancel($event)" (retry)="handleRetry($event)" (dismiss)="handleDismiss($event)" /> }`.
- [ ] Add handler methods that delegate: `handleCancel(id) { this.attachmentsState.cancel(id); }` etc.
- [ ] Add `UploadProgressRowComponent` to `imports`.
- [ ] Spec updates: existing `handleDropzoneFileSelected` test remains. New cases: when `AttachmentsStateService.uploadsForTask` returns a row in `uploading` phase, `<app-upload-progress-row>` is rendered and the dropzone's `disabled` is true.

### 6. Wire Board Page
- [ ] Inject `AttachmentsStateService` in `BoardPageComponent`.
- [ ] Replace the no-op body at line 210 with `this.attachmentsState.startUpload(event);`.
- [ ] Remove the underscore prefix on the parameter (`event: DropzoneFileSelectedEvent`) now that it's used.
- [ ] Update the doc comment (no longer "no-op in #49").
- [ ] Existing board-page spec: ensure it still passes. Extend with a single test that a file-selected emission triggers `attachmentsState.startUpload` (mock the service).

### 7. Teardown / lifecycle correctness
- [ ] Verify `AttachmentsStateService` re-subscribes to Asset* events after `SignalRService` reconnect (via the connection-state `effect()`), matching `BoardStateService`'s existing pattern.
- [ ] On service-destroy (test-harness only, since the service is root-provided for app lifetime): unsubscribe all bag subscriptions, unsubscribe all active uploads, clear the cancel-expiry timers.
- [ ] Navigating away from the board while an upload is in flight: the root-provided service holds the subscription, the board page destroy does not touch it — upload continues (preferred AC behaviour). On `AssetCompleted`, `completedByTaskId` updates but no `TaskDetailPanel` is mounted to render; state is simply available to #51 on next board visit.

### 8. Build + tests
- [ ] `npm run build` succeeds from `c:\temp\KanbAI-Web\KanbAI-Web\`.
- [ ] `npm run test -- --watch=false` runs to completion. All new specs pass; FileDropzoneComponent spec, TaskDetailPanelComponent spec, BoardPageComponent spec pass (modifications extend, do not rewrite).
- [ ] No new `package.json` dependencies.

### 9. Development Status append
- [ ] Developer appends the standard "Development Status" section to this tech spec on completion (files created, files modified, build/test results, pre-existing vs introduced failure classification), per `handoff_workflow.md` memory.

**Performance Considerations:**
- `OnPush` on `UploadProgressRowComponent`. Progress updates are signal writes that will correctly invalidate the row's template.
- `trackBy upload.id` on the `@for` loop.
- Progress event frequency: `HttpClient` emits up to ~once per chunk; throttling is not required for a single in-flight upload. If future profiling shows excess CD churn, debounce at the state layer (RxJS `auditTime(16)` on the progress branch) — NOT required for this ticket.

## QA Guidance

### Test Strategy

**Unit Tests — `AttachmentsApiService`** (`attachments-api.service.spec.ts`):
- Request shape: URL, method, `FormData` content (single `file` field with the File object), `reportProgress: true`, `observe: 'events'`.
- Progress event flow through unchanged.
- Response event with a well-formed `ApiResponse` passes through; no unwrapping at this layer.

**Unit Tests — `AttachmentsStateService`** (`attachments-state.service.spec.ts`):
- State mutations verified via the exposed selectors (no peeking at private `state`).
- Mock `AttachmentsApiService` with a `Subject<HttpEvent<AssetUploadResponse>>` so tests can emit progress / response / error at will.
- Mock `SignalRService` with `.on<T>()` returning controllable `Subject<T>`s per event name, and a mutable `connectionState` signal.
- Scenarios (one test each):
  1. Happy path (progress → 201 → AssetCompleted).
  2. HTTP 400 `File type is not allowed.` → error row with `HTTP_400`.
  3. HTTP 403 → error row with `HTTP_403`.
  4. HTTP 404 → error row with `HTTP_404`.
  5. HTTP 413 → error row with `HTTP_413` + filename in copy.
  6. HTTP 500 → error row with `HTTP_500`.
  7. Network error (status 0) → `NETWORK`.
  8. Cancel during `uploading` → row removed, subscription unsubscribed.
  9. Cancel during `processing` (post-201) → row removed, subsequent `AssetCompleted` only updates `completedByTaskId`, subsequent `AssetFailed` is silently dropped.
  10. AssetFailed on known row → error row + `file` preserved.
  11. Retry from error → phase cycles back to `uploading`, API called again.
  12. AssetCompleted for teammate (assetId we never saw) → `completedByTaskId` appends; `uploadsByTaskId` untouched.
  13. Monotonic progress guard → out-of-order `loaded` values never regress.
  14. Reconnect simulation → subscribes re-hook; in-flight upload state unaffected.
  15. Two sequential uploads to the same task (after first completes) work.
  16. `isUploadingForTask` signal flips correctly at each phase transition.

**Unit Tests — `UploadProgressRowComponent`:**
- Renders correct DOM per phase.
- ARIA `progressbar` attributes present with live `aria-valuenow`.
- Emits the right output with the right `uploadId` on each button click.
- Error region has `role="alert"` in `error` phase.

**Integration Tests — `TaskDetailPanelComponent`:**
- With `AttachmentsStateService` providing a stub that seeds one `uploading` row, the panel:
  - Renders `<app-upload-progress-row>` under the dropzone.
  - Passes `disabled=true` and `disabledReason=UPLOAD_BLOCKED_REASON` into `<app-file-dropzone>`.
- With the stub providing no uploads, the panel renders the dropzone enabled (pre-existing behaviour).
- `fileSelected` still bubbles through `handleDropzoneFileSelected` (existing behaviour preserved).

**Integration Tests — `BoardPageComponent`:**
- Existing specs untouched.
- New: a spy on `AttachmentsStateService.startUpload` is called with the emitted `DropzoneFileSelectedEvent` when `handleAttachmentSelected` runs.

**E2E-ish (manual or Playwright) flows:**
1. Happy upload: drop `small.png` (20 KB), see instant "Uploading… N%" briefly → "Processing…" → dropzone returns to idle. Network tab shows one `POST /api/attachment/task/<taskId>` with `multipart/form-data` and `Bearer` token; WebSocket frame tab shows the four `Asset*` events arriving in order.
2. Slow upload: Chrome DevTools → throttle to "Slow 3G", drop a 3 MB file, observe the progress bar climb smoothly, percentage advances monotonically, reaches 100 only on response, then "Processing…", then idle.
3. Cancel during upload: start a 10 MB upload on Slow 3G, click cancel at ~30% — Network tab shows the request in `(canceled)` state, dropzone returns to idle, no error shown.
4. Server 413 simulated: stub the backend to return 413, observe "…is larger than 10 MB." copy with `Try again` + dismiss.
5. Server 403 simulated: "You're no longer a member of this project." row; dropzone remains blocked during the error row's visibility (optional follow-up).
6. Cross-tab: two browser tabs authed as the same user, same task. Tab A uploads → tab B's `completedByTaskId` updates (verifiable in a dev-mode state inspector; for #50 there is no list UI yet, so verify via the state signal in tab B's Angular DevTools).
7. Panel close during upload: start an upload, close the task-detail panel — upload continues; re-open the panel after `AssetCompleted` — no row, dropzone idle.

### Mocking Instructions

```typescript
// AttachmentsApiService mock for state-service tests
class MockAttachmentsApiService {
  readonly events$ = new Subject<HttpEvent<AssetUploadResponse>>();
  uploadAttachment = vi.fn(() => this.events$.asObservable());
}

// SignalRService mock for state-service tests
class MockSignalRService {
  private readonly subjects = new Map<string, Subject<unknown>>();
  readonly connectionState = signal<SignalRConnectionState>('connected');
  on<T>(name: string): Observable<T> {
    if (!this.subjects.has(name)) this.subjects.set(name, new Subject());
    return this.subjects.get(name)!.asObservable() as Observable<T>;
  }
  emit<T>(name: string, payload: T): void {
    this.subjects.get(name)?.next(payload);
  }
  start = vi.fn(); stop = vi.fn();
  joinProjectGroup = vi.fn(); leaveProjectGroup = vi.fn();
}
```

### Edge Cases to Test

- Sub-100 ms upload: the progress row is mounted even briefly (state passes through `uploading` then `processing`) — verify by injecting deterministic progress/response events in the same tick.
- Monotonic progress: intentionally out-of-order `loaded` values do not regress the displayed `%`.
- `cancel` fired after the 201 but before `AssetCompleted` — row disappears; any later `Asset*` event for that `assetId` is suppressed except `AssetCompleted` which still flows into `completedByTaskId`.
- Double-drop while disabled: the dropzone's `disabled` input returns `false` from its handlers, so no second `fileSelected` event fires — guaranteed by #49's contract.
- Rapid drop → cancel → drop sequences on the same task.
- Reconnect mid-upload: the HTTP upload is not affected by SignalR reconnects (separate transport). After reconnect, `AssetCompleted` for the in-flight assetId still arrives and is consumed.
- Concurrent uploads on *different* tasks: `isUploadingForTask(A)` and `isUploadingForTask(B)` are independent; both can run in parallel. (The ticket blocks only *same-task* concurrent uploads.)
- `AssetCompleted` arrives *before* the 201 response (theoretically possible if the server broadcasts before the HTTP response has finished flushing to the client): the local row still has `assetId === null` at that moment; the event is treated as teammate-origin and routed to `completedByTaskId`. When the 201 later lands, the state service finds a matching completed asset by `id` already present in `completedByTaskId` and **skips** the local row creation to avoid a double-entry. Alternative (simpler): ignore this race — if 201 arrives after AssetCompleted, the local row transitions `uploading → processing` and waits forever. **Decision: document the race here and defensively skip — on `Response` event, check `completedByTaskId[taskId]` for `id === data.id`; if present, remove any in-flight row and do nothing further.**

---

## Key Design Decisions (one-liners)

1. **Root-provided state service** outlives the panel and the board page, which is the only way the "continue upload in background on navigation" AC holds.
2. **`uploadsByTaskId` holds ONLY local-origin uploads** — the progress UI can't render a fake bar for someone else's bytes.
3. **Reconciliation key is `assetId`**, assigned once on the 201. No fallback matching by filename / taskId.
4. **`cancelledAssetIds` Set** suppresses late AssetFailed for user-cancelled uploads; AssetCompleted still lands in `completedByTaskId` per AC.
5. **`UPLOAD_BLOCKED_REASON` + existing `FileDropzoneComponent.disabled` input** is the block-during-upload mechanism; zero dropzone changes.
6. **Error copy lives in one constants file** (`upload-errors.ts`) keyed by HTTP status + optional server message; AC mapping, not exact wording, is the contract.
7. **Progress cap at 99 until `HttpEventType.Response`** — hard invariant from the AC: "must reach 100% before the HTTP response is parsed; must never flip to 100% and then report a failure without the user seeing that the bytes-transferred phase completed".
8. **New `asset-events.ts` constants** rather than bloating `core/models/realtime-events.ts` keeps the features/ boundary clean.

---

*"The technical specification is saved. You can now instruct the web-designer agent to create the design specification."*

---

## Development Status

**Implementation Date:** 2026-05-06
**Developer:** Claude Opus 4.7 (developer agent)

### Files Created
- `KanbAI-Web/src/app/features/attachments/models/attachment.model.ts`
- `KanbAI-Web/src/app/features/attachments/models/attachment-upload.model.ts`
- `KanbAI-Web/src/app/features/attachments/state/attachments-state.model.ts`
- `KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts`
- `KanbAI-Web/src/app/features/attachments/state/attachments-state.service.spec.ts`
- `KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts`
- `KanbAI-Web/src/app/features/attachments/services/attachments-api.service.spec.ts`
- `KanbAI-Web/src/app/features/attachments/constants/asset-events.ts`
- `KanbAI-Web/src/app/features/attachments/constants/upload-errors.ts`
- `KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.ts`
- `KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.html`
- `KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.scss`
- `KanbAI-Web/src/app/features/attachments/components/upload-progress-row/upload-progress-row.component.spec.ts`

### Files Modified
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` — injected `AttachmentsStateService`, added `uploads`, `isUploading`, `resolvedDisabled`, `resolvedDisabledReason`, `uploadLiveMessage` computed signals and `handleCancel/handleRetry/handleDismiss` handlers.
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html` — wrapped dropzone + upload list in `.task-detail-panel__attachment-section`, added `@for` over uploads, added shared visually-hidden polite live region.
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss` — appended `.task-detail-panel__attachment-section`, `.task-detail-panel__upload-list`, `.task-detail-panel__upload-live` rules.
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts` — extended with upload-list, disabled-during-upload, and live-region cases; existing cases preserved.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` — injected `AttachmentsStateService`, replaced `handleAttachmentSelected` no-op body with `this.attachmentsState.startUpload(event)`.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` — provided a mock `AttachmentsStateService` and replaced the #49 no-op dispatch assertion with a #50 `startUpload` dispatch assertion.

### Files explicitly NOT modified (per AC)
- `FileDropzoneComponent` (`*.ts/.html/.scss/.spec.ts`) — dropzone contract frozen.
- `BoardStateService` / `board-state.model.ts` — attachments live in their own state slice.
- `core/models/realtime-events.ts` — asset events live in `attachments/constants/asset-events.ts`.

### Build & Test Results
- **Build:** SUCCESS (`npm run build`). One non-blocking SCSS-budget warning for `upload-progress-row.component.scss` at 4.27 kB against the 4 kB `maximumWarning` (error threshold is 8 kB — not tripped). Several existing SCSS files in the repo already exceed the same threshold.
- **Tests:** 53 files total — 53 passed. **915 tests total — 915 passed, 0 failed.**
- **Pre-existing Failures:** A single flaky test in `src/app/core/services/signalr.service.spec.ts` intermittently fails on the first run of a fresh process due to microtask ordering inside a mock connection (classified PRE-EXISTING — reproduced on untouched `HEAD` via `git stash`; fully green on subsequent reruns).
- **Introduced Failures:** None.

### Open Questions resolved during implementation
- **OQ1 (success flash).** Implemented option **(a) — immediate unmount.** The row is removed synchronously from `uploadsByTaskId` on `AssetCompleted`, matching the tech-spec `AttachmentUploadPhase` union (`'uploading' | 'processing' | 'error'`) without introducing a `completed` phase. Success cue lands with #51's attachment list.
- **OQ2 (403 Try again).** Implemented option **(b) — disable Try again when `code === 'HTTP_403'`.** One-line conditional: `retryDisabled = upload().error?.code === 'HTTP_403'` drives `aria-disabled` and a no-op on click; dismiss remains live.
- **OQ3 (error-message font size).** Kept option **(a) — `$font-size-sm` / `$font-weight-medium`** with the `$status-high` / `$bg-main` 3.9:1 pair clearing WCAG 1.4.11. Pairs with the `alert-circle` icon and `role="alert"` to satisfy 1.4.1 (colour is not the sole channel).
- **OQ4 (bar height).** Kept option **(a) — 6 px height, `$radius-pill`, `$brand-primary` fill.** Provides visual continuity with the dropzone's sage idle border; passes 3:1 UI against both track and card.

### Edge Cases for QA
- Happy path: drop small file → uploading → processing → row unmounts on `AssetCompleted`, dropzone re-enables.
- Throttled upload (Slow 3G): progress bar climbs monotonically 0 → 99, transitions to indeterminate sweep on 201.
- Monotonic progress: out-of-order `loaded` values never regress the displayed percent; capped at 99 until `Response` event.
- Cancel during bytes-in-flight: HTTP subscription unsubscribed, row removed, dropzone unlocks.
- Cancel after 201 (processing): late `AssetFailed` silently dropped; late `AssetCompleted` flows only into `completedByTaskId`.
- `AssetFailed` on a known row: transitions to error phase with mapped copy; `File` preserved for retry.
- 403 error row: Try again button is `aria-disabled` and a no-op; dismiss still works.
- 413 error row: filename appears in the copy.
- Reduced motion: indeterminate sweep freezes at a static 40 % bar; determinate bar updates without tween (global clamp).
- Teammate-origin `AssetCompleted` (unknown `assetId`): appends to `completedByTaskId` without creating a local row.
- Reconnect: asset event subscriptions re-hook via the connection-state `effect()`.
- Panel close / board navigation mid-upload: root-provided service keeps the upload alive; state is available to #51 on next board visit.

### Known Limitations / Out of Scope
- No explicit success flash in #50 (OQ1 resolved to `(a)`); the attachment-appearance cue lives in #51.
- No programmatic membership-loss refresh on 403 beyond the disabled Try-again; full flow is #60-era per the tech spec.
- SCSS budget warning for the new row at 4.27 kB (error threshold unchanged at 8 kB, so non-blocking; matches existing pattern in the codebase).
