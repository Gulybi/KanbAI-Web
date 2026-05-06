# Technical Specification: Attachment List and Download UI

**Context Document:** [issue_51_context.md](./issue_51_context.md)
**GitHub Issue:** #51
**Milestone:** #6 — Asynchronous File Upload UI

## Overview

This feature adds the read + retrieve half of the attachment surface:

1. A scrollable **attachment list** inside the task-detail panel that renders `AssetResponseDto[]` held by `AttachmentsStateService.completedByTaskId`.
2. A panel-open **list fetch** against `GET /api/attachment/task/{taskId}` ([backend_api_map.md line 107](../../.claude/backend_api_map.md)) so the list is populated on cold load / session-resume / for teammates who weren't connected when the upload happened — not just from `AssetCompleted` SignalR events in the current session.
3. A per-row **download control** that fetches the raw file via `GET /api/attachment/{assetId}` and triggers a browser save using a blob object-URL + synthetic `<a download>`.
4. A board-level decorative **attachment indicator** on `TaskCardComponent` that reflects the same state slice.

The ticket extends `AttachmentsApiService` with two new methods (list + download), extends `AttachmentsStateService` with a `hydrateCompleted` command and a per-task list-fetch-state slice, and adds two new standalone components in the attachments slice. No new routes, no new SignalR subscriptions, no new npm dependencies.

The app runs on **Angular 21** (`@angular/core ^21.2.0`; see `KanbAI-Web/KanbAI-Web/package.json`), uses standalone components + Signals throughout, and tests with Vitest (`ng test` wraps Vitest).

### Key design decisions (Q1–Q7 resolved)

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| Q1 | Session-resume / cold-load visibility | **Option A — call `GET /api/attachment/task/{taskId}` on panel-open.** Endpoint now exists ([backend_api_map.md line 107](../../.claude/backend_api_map.md)). The list is hydrated from the server and reconciled with in-memory SignalR-origin entries by `assetId`. | The backend contract that blocked Option A no longer blocks it. Shipping without using it would bake session-local UX into a frozen #51 surface for no reason. |
| Q2 | Where does the list component live? | **`AttachmentListComponent` + `AttachmentRowComponent`** under `features/attachments/components/`. | Mirrors the existing `file-dropzone` / `upload-progress-row` split. |
| Q3 | Where do the HTTP calls live? | **Extend `AttachmentsApiService`** with `listAttachmentsByTask(taskId)` and `downloadAttachment(assetId)`. | One-service extension; the existing service is already the right seam. |
| Q4 | Where does per-row download state live? | **Local signal inside `AttachmentRowComponent`** (`signal<AttachmentDownloadState>`). | Ephemeral; per-row error isolation is an AC. No need to survive panel-close or be shared. |
| Q5 | Card indicator click behaviour | **Decorative only.** No separate click target. | Accidental downloads from board-scan would be jarring. |
| Q6 | Preview vs. download-only | **Download-only.** | Closes milestone #6 promise without the image-viewer UX weight. |
| Q7 | Delete affordance | **Out of scope.** No `DELETE /api/attachment/{assetId}` in backend contract. | Cannot implement client-only deletion. |

### New open decisions (driven by Path A)

| ID | Decision | Resolution |
|----|----------|------------|
| A1 | Merge strategy between list GET response and in-memory SignalR-origin entries | Reconcile by `assetId`; on conflict the entry with the later `updatedAt` wins. Server list is authoritative on membership (an asset absent from the list is not rendered even if state has it — except during a concurrent in-flight `AssetCompleted`, handled below). |
| A2 | When to fetch | On `task().id` change inside `TaskDetailPanelComponent` (Angular `effect()`), cancelling the in-flight request on task change or panel close via `takeUntilDestroyed`. |
| A3 | Board-level priming of card indicator on cold load | **Out of scope for #51.** Card indicator reflects whatever has been hydrated incrementally (panel-opens) + SignalR-origin entries. A future backend endpoint for bulk counts is the right answer; a per-card GET blast is chatty and not worth it. |
| A4 | List-fetch error surface | A section-level error state (retryable) inside `AttachmentListComponent`, distinct from per-row download errors. |
| A5 | List ordering | Server returns `createdAt` **DESC** ([backend_api_map.md line 121](../../.claude/backend_api_map.md)). Honour it — newest first. No client-side re-sort. SignalR-appended rows go to the top to match. |

---

## Component Architecture

### Routing

**No new routes.** Extends two existing components, adds two new standalone components in the attachments slice.

### Component Hierarchy

**Smart components (containers):**

- **`TaskDetailPanelComponent`** (existing, modified)
  - Location: `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`
  - Adds an `effect()` that triggers `attachmentsState.hydrateCompletedForTask(task().id)` whenever `task().id` changes.
  - Adds computed signals:
    - `completedAttachments: Signal<readonly AssetResponseDto[]>` from `completedByTaskId()[task().id] ?? []`.
    - `listFetchState: Signal<AttachmentListFetchState>` from `completedFetchByTaskId()[task().id] ?? IDLE_LIST_FETCH_STATE`.
  - Passes both down to `<app-attachment-list>`.

- **`TaskCardComponent`** (existing, modified)
  - Location: `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.ts`
  - Injects `AttachmentsStateService` (new dependency).
  - Adds `attachmentCount: Signal<number>` computed from `completedByTaskId()[task().id]?.length ?? 0`.
  - Extends existing `accessibleName` computed to append `(N attachment[s])` when `attachmentCount() >= 1`.
  - Template gains a decorative indicator when `attachmentCount() >= 1`.

**Dumb components (presentational, new):**

- **`AttachmentListComponent`**
  - Location: `KanbAI-Web/src/app/features/attachments/components/attachment-list/attachment-list.component.ts`
  - Inputs:
    - `attachments: InputSignal<readonly AssetResponseDto[]>` (required)
    - `fetchState: InputSignal<AttachmentListFetchState>` (required)
  - Outputs:
    - `retryFetch = output<void>()` — emits when user clicks "Retry" on a failed list fetch.
  - Responsibility: switch-render on `fetchState.phase` — `loading` (skeleton), `error` (error message + retry button), `ready` (either `<ul>` of rows or empty-state copy based on `attachments.length`).
  - `OnPush`.

- **`AttachmentRowComponent`**
  - Location: `KanbAI-Web/src/app/features/attachments/components/attachment-row/attachment-row.component.ts`
  - Inputs:
    - `attachment: InputSignal<AssetResponseDto>` (required)
  - Outputs: none.
  - Dependencies via `inject()`: `AttachmentsApiService`, `DestroyRef`.
  - Owns local `downloadState: WritableSignal<AttachmentDownloadState>`.
  - Derives icon category via `computed()` → `resolveAttachmentIconCategory(attachment())`.
  - Reuses `formatFileSize` — no duplicate formatter.
  - `OnPush`.

### New Files to Create

```
KanbAI-Web/src/app/features/attachments/components/attachment-list/
  attachment-list.component.ts
  attachment-list.component.html
  attachment-list.component.scss
  attachment-list.component.spec.ts

KanbAI-Web/src/app/features/attachments/components/attachment-row/
  attachment-row.component.ts
  attachment-row.component.html
  attachment-row.component.scss
  attachment-row.component.spec.ts

KanbAI-Web/src/app/features/attachments/constants/
  attachment-icon-map.ts              // MIME/extension → AttachmentIconCategory
  download-errors.ts                  // mapDownloadHttpErrorToUserMessage()
  list-errors.ts                      // mapListFetchHttpErrorToUserMessage()

KanbAI-Web/src/app/features/attachments/models/
  attachment-download.model.ts        // AttachmentDownloadState, AttachmentDownloadError, AttachmentIconCategory
  attachment-list-fetch.model.ts      // AttachmentListFetchState, AttachmentListFetchError

KanbAI-Web/src/app/features/attachments/utils/
  attachment-icon-map.spec.ts
  trigger-blob-download.ts            // createObjectURL + synthetic <a download> + revokeObjectURL
  trigger-blob-download.spec.ts
```

### Files to Modify

```
KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts
  - Add listAttachmentsByTask(taskId): Observable<AssetResponseDto[]>
    (unwraps ApiResponse<IEnumerable<AssetResponseDto>> → AssetResponseDto[])
  - Add downloadAttachment(assetId): Observable<HttpResponse<Blob>>

KanbAI-Web/src/app/features/attachments/services/attachments-api.service.spec.ts
  - Add coverage for the two new methods

KanbAI-Web/src/app/features/attachments/state/attachments-state.model.ts
  - Add completedFetchByTaskId: Record<string, AttachmentListFetchState> slice
  - Extend INITIAL_ATTACHMENTS_STATE with completedFetchByTaskId: {}

KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts
  - Inject AttachmentsApiService is already present — reuse for the new list call
  - Add public selector completedFetchByTaskId: Signal<Record<string, AttachmentListFetchState>>
  - Add command hydrateCompletedForTask(taskId): void — orchestrates the list fetch,
    updates completedFetchByTaskId during loading/error, merges results into
    completedByTaskId via mergeCompletedAssets(taskId, serverAssets)
  - Add private helper mergeCompletedAssets(taskId, serverAssets) —
    reconciliation rules in §State & Data Layer

KanbAI-Web/src/app/features/attachments/state/attachments-state.service.spec.ts
  - Add coverage for hydrateCompletedForTask and merge strategy

KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts
  - Add effect() watching task().id → calls hydrateCompletedForTask
  - Add completedAttachments and listFetchState computed signals
  - Add handleRetryListFetch() method → calls hydrateCompletedForTask again
  - Import AttachmentListComponent

KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html
  - Render <app-attachment-list> inside the attachments section
    (exact ordering relative to dropzone/upload-stack is a design-spec decision)

KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts
  - Extend stub AttachmentsStateService with completedByTaskId, completedFetchByTaskId, hydrateCompletedForTask
  - Verify effect fires hydrate on task().id change
  - Verify list renders, loading, error branches

KanbAI-Web/src/app/features/board/components/task-card/task-card.component.ts
  - Inject AttachmentsStateService
  - Add attachmentCount computed
  - Extend accessibleName computed

KanbAI-Web/src/app/features/board/components/task-card/task-card.component.html
  - Add decorative paperclip + count indicator when attachmentCount() >= 1

KanbAI-Web/src/app/features/board/components/task-card/task-card.component.spec.ts
  - Stub AttachmentsStateService with completedByTaskId signal
  - Tests for indicator visibility and accessibleName suffix
```

---

## State & Data Layer

### State Management Strategy

Two state slices now feed the list:

- **Existing:** `completedByTaskId: Signal<Record<string, AssetResponseDto[]>>` — populated by SignalR `AssetCompleted`, local upload 201s, AND now by the new `hydrateCompletedForTask()` command's merge step.
- **New:** `completedFetchByTaskId: Signal<Record<string, AttachmentListFetchState>>` — one entry per task for which a list fetch has been attempted. Panel reads this to decide between loading / error / ready render.

Consumers bind via narrow `computed()` selectors inside the hosting components. No global "attachment list" selector.

**Per-row download state** stays in `AttachmentRowComponent` as a local `signal<AttachmentDownloadState>` (Q4 — unchanged).

### Merge strategy — `mergeCompletedAssets(taskId, serverAssets)` (A1)

Called from `hydrateCompletedForTask` on a successful list fetch. Implementation contract:

1. Build `Map<assetId, AssetResponseDto>` from current `completedByTaskId[taskId] ?? []`.
2. For each server asset, look up the existing entry by `assetId`:
   - Not present → insert server asset.
   - Present → compare `updatedAt` ISO strings; keep whichever is newer (later `updatedAt` wins).
3. **Do not** remove in-memory entries that are absent from the server response. Rationale: an `AssetCompleted` SignalR event may have arrived for an upload that committed *after* the server query snapshotted — deleting it would cause the row to flicker out and back in when the next list fetch runs or the next event arrives. Tolerating the transient "in state but not in server list" case is safer than dropping live data.
   - Trade-off: an attachment deleted server-side (e.g. Q7 future work) will linger in client state until the next page reload. For #51 this is acceptable because #51 does not introduce deletion. When Q7 ships, an `AssetDeleted` SignalR event will authoritatively prune the slice.
4. Sort the resulting array by `createdAt` DESC (newest first, matching server ordering from backend_api_map.md line 121). Stable sort — for equal timestamps, preserve insertion order.
5. Write back via `setState({ completedByTaskId: { ...prev, [taskId]: merged } })`.

### `hydrateCompletedForTask(taskId)` — command contract

Lives on `AttachmentsStateService`. Idempotent (safe to call multiple times for the same taskId).

Implementation requirements:

1. If `completedFetchByTaskId()[taskId]?.phase === 'loading'` → return (dedup; no double-fire on effect re-runs).
2. Set `completedFetchByTaskId[taskId] = { phase: 'loading', error: null }`.
3. Call `attachmentsApi.listAttachmentsByTask(taskId).subscribe({ next, error })`.
   - Subscription lifetime: track in `private listSubs = new Map<taskId, Subscription>()`; cancel on re-call for the same taskId or on service destroy.
   - `next(assets)`: call `mergeCompletedAssets(taskId, assets)`; set `completedFetchByTaskId[taskId] = { phase: 'ready', error: null }`.
   - `error(err)`: call `mapListFetchHttpErrorToUserMessage(err)`; set `completedFetchByTaskId[taskId] = { phase: 'error', error: mapped }`. Do NOT clear `completedByTaskId[taskId]` — the SignalR-origin entries stay visible.

### TypeScript Interfaces

#### New file: `attachment-list-fetch.model.ts`

```typescript
/**
 * Lifecycle phase of the panel-open list fetch for a given task.
 *  - 'idle'    : no fetch has been attempted (e.g. task-detail not yet opened).
 *  - 'loading' : GET in flight.
 *  - 'ready'   : last fetch succeeded; completedByTaskId[taskId] is authoritative.
 *  - 'error'   : last fetch failed; the list falls back to SignalR-origin entries
 *                but the section shows an error banner with a Retry button.
 */
export type AttachmentListFetchPhase = 'idle' | 'loading' | 'ready' | 'error';

export type AttachmentListFetchErrorCode =
  | 'HTTP_403'      // "You are not authorized to access this task's attachments."
  | 'HTTP_404'      // "Task not found." — unusual mid-session race
  | 'HTTP_5XX'      // server error
  | 'NETWORK'       // status 0
  | 'HTTP_OTHER';

export interface AttachmentListFetchError {
  readonly code: AttachmentListFetchErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
}

export interface AttachmentListFetchState {
  readonly phase: AttachmentListFetchPhase;
  readonly error: AttachmentListFetchError | null;
}

export const IDLE_LIST_FETCH_STATE: AttachmentListFetchState = {
  phase: 'idle',
  error: null
};
```

#### New file: `attachment-download.model.ts`

```typescript
export type AttachmentDownloadPhase = 'idle' | 'downloading' | 'error';

/**
 * Error codes mirror the download failure set at
 * .claude/backend_api_map.md line 123. Note the 404 branch covers TWO
 * distinct user outcomes (missing vs. failed upload) driven by the server
 * message payload.
 */
export type AttachmentDownloadErrorCode =
  | 'HTTP_400_PROCESSING'  // "File is still being processed." — retryable
  | 'HTTP_400_OTHER'       // unrecognised 400 — retryable
  | 'HTTP_403'             // "You are not authorized to access this file." — NOT retryable
  | 'HTTP_404_MISSING'     // "File not found." — NOT retryable
  | 'HTTP_404_FAILED'      // "File upload failed." (Failed-state asset) — NOT retryable
  | 'HTTP_404_OTHER'       // unrecognised 404 — NOT retryable (conservative)
  | 'HTTP_5XX'
  | 'NETWORK'
  | 'HTTP_OTHER';

export interface AttachmentDownloadError {
  readonly code: AttachmentDownloadErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
}

export interface AttachmentDownloadState {
  readonly phase: AttachmentDownloadPhase;
  readonly error: AttachmentDownloadError | null;
}

export const IDLE_DOWNLOAD_STATE: AttachmentDownloadState = {
  phase: 'idle',
  error: null
};

export type AttachmentIconCategory =
  | 'image' | 'pdf' | 'word' | 'excel' | 'text' | 'generic';
```

#### New file: `attachment-icon-map.ts`

```typescript
export const MIME_TO_ICON_CATEGORY: Readonly<Record<string, AttachmentIconCategory>> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/plain': 'text'
};

export const EXTENSION_TO_ICON_CATEGORY: Readonly<Record<string, AttachmentIconCategory>> = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
  '.pdf': 'pdf', '.docx': 'word', '.xlsx': 'excel', '.txt': 'text'
};

/**
 * Lookup order:
 *   1. Exact MIME hit in MIME_TO_ICON_CATEGORY (case-insensitive).
 *   2. image/* prefix → 'image'.
 *   3. Filename extension hit in EXTENSION_TO_ICON_CATEGORY (case-insensitive).
 *   4. Fallback → 'generic'.
 */
export function resolveAttachmentIconCategory(input: {
  mimeType: string;
  fileName: string;
}): AttachmentIconCategory;
```

#### New file: `download-errors.ts`

```typescript
/**
 * Maps a thrown HTTP error (or transport error) into a user-facing
 * AttachmentDownloadError. Status → code mapping is AC-critical.
 *
 * IMPORTANT: when responseType: 'blob' is used on the request, Angular's
 * HttpErrorResponse.error is a Blob (not the parsed JSON). The mapper MUST
 * read it as text via `await (err.error as Blob).text()` and then JSON.parse
 * to extract the server message. A synchronous body-read alternative (the
 * mapper returns a Promise instead of the mapped error) is acceptable; the
 * caller awaits it before setting downloadState. Document the choice inline.
 */
export function mapDownloadHttpErrorToUserMessage(
  error: unknown,
  fileName: string
): Promise<AttachmentDownloadError>;
```

#### New file: `list-errors.ts`

```typescript
/**
 * Maps a thrown HTTP error on GET /api/attachment/task/{taskId} into a
 * user-facing AttachmentListFetchError.
 *
 * Branches (per .claude/backend_api_map.md line 121):
 *  - 403 "You are not authorized to access this task's attachments." → HTTP_403, !retryable
 *  - 404 "Task not found." → HTTP_404, !retryable
 *  - 5xx → HTTP_5XX, retryable
 *  - status 0 (network) → NETWORK, retryable
 *  - other → HTTP_OTHER, retryable
 *
 * This endpoint returns JSON (ApiResponse<IEnumerable<AssetResponseDto>>) —
 * the blob quirk does NOT apply here. err.error is the parsed JSON body.
 */
export function mapListFetchHttpErrorToUserMessage(
  error: unknown
): AttachmentListFetchError;
```

### How hosts consume state

```typescript
// TaskDetailPanelComponent (additions)
private readonly attachmentsState = inject(AttachmentsStateService); // already present

readonly completedAttachments: Signal<readonly AssetResponseDto[]> = computed(
  () => this.attachmentsState.completedByTaskId()[this.task().id] ?? []
);

readonly listFetchState: Signal<AttachmentListFetchState> = computed(
  () => this.attachmentsState.completedFetchByTaskId()[this.task().id] ?? IDLE_LIST_FETCH_STATE
);

constructor() {
  // Fire list fetch whenever the open task changes.
  effect(() => {
    const id = this.task().id;
    this.attachmentsState.hydrateCompletedForTask(id);
  });
}

handleRetryListFetch(): void {
  this.attachmentsState.hydrateCompletedForTask(this.task().id);
}
```

```typescript
// TaskCardComponent (additions)
private readonly attachmentsState = inject(AttachmentsStateService);

readonly attachmentCount: Signal<number> = computed(
  () => this.attachmentsState.completedByTaskId()[this.task().id]?.length ?? 0
);

readonly accessibleName = computed(() => {
  const t = this.task();
  const n = this.attachmentCount();
  const notes = t.content ? ' (has notes)' : '';
  const atts = n >= 1 ? ` (${n} ${n === 1 ? 'attachment' : 'attachments'})` : '';
  return `${t.title}${notes}${atts}`;
});
```

---

## Service Integration

### AttachmentsApiService — two new methods

**File:** `KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts` (modified)

```typescript
/**
 * GET /api/attachment/task/{taskId}
 * Returns the list of Completed assets for a task, ordered createdAt DESC.
 *
 * Response envelope is ApiResponse<IEnumerable<AssetResponseDto>>. This
 * method unwraps `.data` and returns AssetResponseDto[] — if `.data` is
 * null/missing it returns [] (defensive).
 *
 * Auth: interceptor attaches Bearer token. Do NOT set Authorization manually.
 *
 * Errors (see list-errors.ts):
 *   403 "You are not authorized to access this task's attachments."
 *   404 "Task not found."
 *   5xx / network / other — passed through for the mapper to classify.
 */
listAttachmentsByTask(taskId: string): Observable<AssetResponseDto[]>;

/**
 * GET /api/attachment/{assetId} — streams the raw file as a Blob.
 *
 *   responseType: 'blob'     — we want bytes, not JSON parsing
 *   observe: 'response'      — caller may read headers defensively
 *
 * Auth: interceptor attaches Bearer token. Do NOT set Authorization manually.
 * Do NOT use window.open or <a href> for this — both bypass the interceptor.
 *
 * Errors (see download-errors.ts): 400 / 403 / 404 / 5xx / network.
 * NOTE: with responseType: 'blob', HttpErrorResponse.error is a Blob —
 * the mapper reads it as text before JSON.parse.
 */
downloadAttachment(assetId: string): Observable<HttpResponse<Blob>>;
```

(Signatures only — implementation bodies belong to the developer phase.)

### HTTP Request / Response Contract

| Method | URL template | Request | Success body | Success headers of interest |
|--------|--------------|---------|--------------|----------------------------|
| `GET` | `${apiUrl}/attachment/task/${encodeURIComponent(taskId)}` | no body | `ApiResponse<IEnumerable<AssetResponseDto>>` — `data` is the array, ordered `createdAt` DESC, `Completed` status only | n/a |
| `GET` | `${apiUrl}/attachment/${encodeURIComponent(assetId)}` | no body | `Blob` | `Content-Type` (== `mimeType`); `Content-Disposition` (`inline` for images, `attachment` otherwise — informational; save name comes from state) |

### Failure mapping — list fetch (AC-critical)

Mirrors [backend_api_map.md line 121](../../.claude/backend_api_map.md).

| HTTP status | Server message | `AttachmentListFetchErrorCode` | `retryable` | Example user copy (design may refine) |
|-------------|----------------|-------------------------------|-------------|---------------------------------------|
| `403` | `"You are not authorized to access this task's attachments."` | `HTTP_403` | `false` | "You can't see this task's attachments." |
| `404` | `"Task not found."` | `HTTP_404` | `false` | "This task no longer exists." |
| `5xx` | any | `HTTP_5XX` | `true` | "Couldn't load attachments — please try again." |
| `0` | n/a | `NETWORK` | `true` | "Network problem — couldn't load attachments. Retry." |
| other | any | `HTTP_OTHER` | `true` | "Couldn't load attachments — please try again." |

### Failure mapping — download (AC-critical, now reconciled with current backend map)

Mirrors [backend_api_map.md line 123](../../.claude/backend_api_map.md). **Note change vs. earlier drafts:** `"File upload failed."` is now a `404`, not a `400`. The 404 branch inspects the server `message` to distinguish the two 404 outcomes.

| HTTP status | Server `message` | `AttachmentDownloadErrorCode` | `retryable` | Example user copy |
|-------------|------------------|-------------------------------|-------------|-------------------|
| `400` | `"File is still being processed."` | `HTTP_400_PROCESSING` | `true` | "This file is still being saved. Please try again in a moment." |
| `400` | anything else / missing | `HTTP_400_OTHER` | `true` | "Download didn't complete. Try again." |
| `403` | `"You are not authorized to access this file."` | `HTTP_403` | `false` | "You're not allowed to download this file." |
| `404` | `"File not found."` | `HTTP_404_MISSING` | `false` | "This file no longer exists." |
| `404` | `"File upload failed."` | `HTTP_404_FAILED` | `false` | "This file didn't finish uploading and can't be downloaded." |
| `404` | anything else | `HTTP_404_OTHER` | `false` | "This file is no longer available." |
| `5xx` | any | `HTTP_5XX` | `true` | "Download failed — please try again." |
| `0` | n/a | `NETWORK` | `true` | "Network problem — the file couldn't be downloaded. Try again." |
| other (e.g. `401`) | any | `HTTP_OTHER` | `true` | *(401 is caught by the global authInterceptor — user is redirected to login; the row rarely renders this.)* |

The mapper must tolerate a `Blob` error body (quirk of `responseType: 'blob'`). Pattern:

```typescript
// Pseudocode inside mapDownloadHttpErrorToUserMessage
if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
  const bodyText = await error.error.text();
  const parsed = safeParseJson(bodyText); // returns {} on parse failure
  const serverMessage = parsed?.message ?? parsed?.errors?.[0] ?? null;
  // ...branch on status + serverMessage
}
```

### trigger-blob-download helper (contract)

**File:** `KanbAI-Web/src/app/features/attachments/utils/trigger-blob-download.ts`

```typescript
/**
 * Triggers a browser file-save for the given blob with the given filename.
 *
 * Requirements (testable in spec):
 *  1. URL.createObjectURL(blob)
 *  2. Create a detached <a>:
 *       href       = objectURL
 *       download   = fileName
 *       rel        = 'noopener'
 *     Append to document.body (Firefox requires in-DOM).
 *  3. .click()
 *  4. Remove from DOM.
 *  5. URL.revokeObjectURL(url) — may be deferred via queueMicrotask().
 *     MUST run for every successful call.
 *
 * Synchronous — caller invokes from the HttpResponse tap/next callback.
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void;
```

---

## Implementation Steps

Each step is self-contained and produces a testable artefact. Do not skip ahead.

### 1. Models and constants

1.1. Create `models/attachment-download.model.ts` with: `AttachmentDownloadPhase`, `AttachmentDownloadErrorCode` (including the **new** `HTTP_404_FAILED`, `HTTP_404_MISSING`, `HTTP_404_OTHER` codes), `AttachmentDownloadError`, `AttachmentDownloadState`, `IDLE_DOWNLOAD_STATE`, `AttachmentIconCategory`.

1.2. Create `models/attachment-list-fetch.model.ts` with: `AttachmentListFetchPhase`, `AttachmentListFetchErrorCode`, `AttachmentListFetchError`, `AttachmentListFetchState`, `IDLE_LIST_FETCH_STATE`.

1.3. Create `constants/attachment-icon-map.ts` + unit test `utils/attachment-icon-map.spec.ts` per §State & Data Layer.

1.4. Create `constants/download-errors.ts` implementing `mapDownloadHttpErrorToUserMessage` per the download failure table. Handle the Blob-body quirk (async).

1.5. Create `constants/list-errors.ts` implementing `mapListFetchHttpErrorToUserMessage` per the list failure table. (JSON error body — no Blob quirk here.)

### 2. Extend `AttachmentsApiService`

2.1. Add `listAttachmentsByTask(taskId): Observable<AssetResponseDto[]>`:
  - URL: `${this.apiUrl}/task/${encodeURIComponent(taskId)}`.
  - Use `this.http.get<ApiResponse<AssetResponseDto[]>>(url).pipe(map(resp => resp.data ?? []))`.
  - No manual headers.

2.2. Add `downloadAttachment(assetId): Observable<HttpResponse<Blob>>`:
  - URL: `${this.apiUrl}/${encodeURIComponent(assetId)}`.
  - Options: `{ responseType: 'blob' as 'json', observe: 'response' }`.
  - No manual headers.

2.3. Extend `attachments-api.service.spec.ts`:
  - `listAttachmentsByTask`: exactly one `GET /api/attachment/task/{id}`; response body wrapped in `ApiResponse` envelope is unwrapped to the raw array; `data: null` → `[]`; errors propagate unchanged.
  - `downloadAttachment`: exactly one `GET /api/attachment/{id}`; response body returned as `Blob`; no `Authorization` / `Content-Type` set manually.

### 3. Extend `AttachmentsStateService`

3.1. Extend `attachments-state.model.ts`:
  - Add `completedFetchByTaskId: Record<string, AttachmentListFetchState>` field.
  - Extend `INITIAL_ATTACHMENTS_STATE` to include `completedFetchByTaskId: {}`.

3.2. In `attachments-state.service.ts`:
  - Add public selector: `readonly completedFetchByTaskId = this.select(s => s.completedFetchByTaskId);`.
  - Add private field: `private readonly listSubs = new Map<string, Subscription>();`.
  - Add command `hydrateCompletedForTask(taskId: string): void` per §State & Data Layer contract (dedupe, loading state, subscribe, merge on success, error mapping on failure, cancellation of stale subs).
  - Add private helper `mergeCompletedAssets(taskId, serverAssets)` per §Merge strategy (A1).
  - Extend the existing `destroyRef.onDestroy(...)` teardown to cancel any outstanding list subs.

3.3. Extend `attachments-state.service.spec.ts`:
  - `hydrateCompletedForTask` flips `completedFetchByTaskId[taskId]` to `loading` then `ready`.
  - On 403/404 response, flips to `error` with correct code; does NOT clear `completedByTaskId[taskId]`.
  - Merge: server asset not in state → inserted. Server asset already in state with earlier `updatedAt` → replaced. State asset not in server response → preserved (A1 decision).
  - Result array is sorted `createdAt` DESC.
  - Concurrent calls for the same taskId → second call is a no-op if first is still loading.
  - Call for taskId A followed by call for taskId B → A's subscription is not cancelled (tracked independently per taskId).
  - Service destruction cancels all outstanding list subs.

### 4. Blob download helper

4.1. Create `utils/trigger-blob-download.ts` matching the contract.

4.2. Unit-test `trigger-blob-download.spec.ts`:
  - Spy on `URL.createObjectURL` and `URL.revokeObjectURL`.
  - Assert one `createObjectURL`, one anchor click, anchor is removed from DOM, one `revokeObjectURL`.
  - Assert anchor's `download` attribute equals `fileName` verbatim (long names, Unicode, spaces).
  - Assert `revokeObjectURL` is called with the same URL returned by `createObjectURL`.

### 5. `AttachmentRowComponent`

5.1. Generate: `ng generate component features/attachments/components/attachment-row --skip-tests=false` from `KanbAI-Web/KanbAI-Web/`.

5.2. Standalone + `OnPush`. Inject `AttachmentsApiService`, `DestroyRef`.

5.3. Inputs: `attachment: InputSignal<AssetResponseDto>` (required).

5.4. Local state + computeds:
  - `downloadState = signal<AttachmentDownloadState>(IDLE_DOWNLOAD_STATE);`
  - `iconCategory = computed(() => resolveAttachmentIconCategory(this.attachment()));`
  - `fileSizeDisplay = computed(() => formatFileSize(this.attachment().fileSize));`
  - `downloadAriaLabel = computed(() => \`Download ${this.attachment().fileName}\`);`

5.5. `handleDownloadClick()`:
  - Guard: if `downloadState().phase === 'downloading'` → return.
  - Set `{ phase: 'downloading', error: null }`.
  - Call `attachmentsApi.downloadAttachment(attachment().id).pipe(takeUntilDestroyed(destroyRef)).subscribe({ next, error })`.
  - `next(response)`: `triggerBlobDownload(response.body!, attachment().fileName)`; reset to `IDLE_DOWNLOAD_STATE`.
  - `error(err)`: `mapped = await mapDownloadHttpErrorToUserMessage(err, attachment().fileName)`; set `{ phase: 'error', error: mapped }`.

5.6. `handleRetryClick()`:
  - Guard: `if (downloadState().phase !== 'error' || !downloadState().error?.retryable) return;`
  - Clear error; reuse `handleDownloadClick`.

5.7. Template semantic requirements (full markup = designer/developer):
  - Root: `<li>` (or `role="listitem"`).
  - Icon element: `aria-hidden="true"` (filename is visible text).
  - Filename: visible + `title="{fileName}"` for AT on truncation.
  - Size: `fileSizeDisplay()`.
  - Date: `attachment().createdAt` — format is designer's call (absolute + optional relative).
  - Download `<button type="button">` with `[attr.aria-label]="downloadAriaLabel()"`, `[disabled]="downloadState().phase === 'downloading'"`, `[attr.aria-busy]="downloadState().phase === 'downloading' ? 'true' : null"`, `(click)="handleDownloadClick()"`.
  - Error region (conditional): `downloadState().error?.userMessage`; Retry button visible only when `retryable`. `aria-live="polite"` + `aria-atomic="true"` scoped to the row.

### 6. `AttachmentListComponent`

6.1. Generate standalone + `OnPush`. Import `AttachmentRowComponent`.

6.2. Inputs: `attachments: InputSignal<readonly AssetResponseDto[]>` (required), `fetchState: InputSignal<AttachmentListFetchState>` (required).

6.3. Output: `retryFetch = output<void>()`.

6.4. Computed helpers:
  - `showLoadingSkeleton = computed(() => this.fetchState().phase === 'loading' && this.attachments().length === 0);`
    - Rationale: if we already have SignalR-origin rows, show them — don't replace with a skeleton just because a background refresh is loading.
  - `showErrorBanner = computed(() => this.fetchState().phase === 'error');`
    - Banner coexists with the list; the list still renders in-memory rows behind the banner.
  - `showEmptyState = computed(() => this.fetchState().phase === 'ready' && this.attachments().length === 0);`
  - `emptyStateCopy = 'No attachments yet.'` — flat literal now (Option A means the server is authoritative, no more "in this session" hedge).

6.5. Template requirements:
  - `<section aria-label="Attachments">` wrapper.
  - `showLoadingSkeleton()` → skeleton placeholder (design spec owns visual; semantic: `aria-busy="true"` on the section).
  - `showErrorBanner()` → inline banner with `fetchState().error?.userMessage` and, if `retryable`, a "Retry" button that emits `retryFetch`.
  - Always render: `<ul role="list">` of `<app-attachment-row>` using `@for ... track attachment.id`.
  - `showEmptyState()` → `<p>No attachments yet.</p>` (inside the `<section>`, outside the `<ul>`). Not rendered concurrently with the list.
  - Live region for row additions: a polite `aria-live` on the `<ul>` announces newly-added rows once.

### 7. Wire into `TaskDetailPanelComponent`

7.1. `.ts`:
  - Import `AttachmentListComponent`, `AssetResponseDto`, `AttachmentListFetchState`, `IDLE_LIST_FETCH_STATE`.
  - Add it to `imports`.
  - Add `completedAttachments` and `listFetchState` computeds.
  - Add the `effect()` in the constructor that calls `attachmentsState.hydrateCompletedForTask(task().id)` on `task().id` change.
  - Add `handleRetryListFetch()`.

7.2. `.html`: render inside the attachments section:
  ```html
  <app-attachment-list
    [attachments]="completedAttachments()"
    [fetchState]="listFetchState()"
    (retryFetch)="handleRetryListFetch()" />
  ```
  Exact vertical ordering (dropzone above vs. below the list; where the upload-progress stack sits) is a **design-spec decision**.

7.3. `.spec.ts`:
  - Stub `AttachmentsStateService` with `completedByTaskId`, `completedFetchByTaskId` signals and a `hydrateCompletedForTask` spy.
  - Verify the spy is called with the task id on initial render.
  - Verify it is called again with the new id on `task` input change.
  - Verify `<app-attachment-list>` receives both inputs.
  - Verify `retryFetch` → spy called again.

### 8. Extend `TaskCardComponent` with the attachment indicator

8.1. `.ts`:
  - Add `private readonly attachmentsState = inject(AttachmentsStateService);`.
  - Add `attachmentCount` computed.
  - Replace existing `accessibleName` with the extended version.

8.2. `.html`: conditional indicator when `attachmentCount() >= 1`. MUST be:
  - `aria-hidden="true"` (count is in `accessibleName`),
  - NOT `<button>` / `<a>`, NOT focusable, NOT a click target,
  - absent when `attachmentCount() === 0` (no zero-badge).

8.3. `.spec.ts`:
  - Stub `AttachmentsStateService` with `completedByTaskId` signal.
  - Empty slice → indicator not in DOM; `accessibleName` has no attachment suffix.
  - Slice of 1 → indicator in DOM; `accessibleName` ends with `(1 attachment)` (singular).
  - Slice of 3 → `accessibleName` ends with `(3 attachments)`.
  - Transition 2 → 3 (simulate `AssetCompleted`): DOM updates on next tick.
  - Notes + attachments → `{title} (has notes) (2 attachments)`.

### 9. Security + privacy verification pass

9.1. Grep new code for `console.*` with filename / assetId / blob — zero hits. Filenames only in user-facing strings from the error mapper.

9.2. Grep for `window.open`, `location.assign`, `location.href =`, `fetch(` against attachment URLs — zero hits.

9.3. Grep for `localStorage`, `sessionStorage`, `IndexedDB` inside `features/attachments/` — no new entries.

9.4. Confirm `URL.revokeObjectURL` on every `createObjectURL` path (spec-tested in step 4.2).

### 10. Build + test verification

10.1. `cd KanbAI-Web/KanbAI-Web && npm run build` — must succeed.

10.2. `npm run test -- --watch=false` — all new specs pass; any INTRODUCED failure must be fixed; PRE-EXISTING failures documented, not fixed.

---

## QA Guidance

### Test strategy

**Unit — `resolveAttachmentIconCategory`:**
- `image/png`, `application/pdf`, Word MIME, Excel MIME, `text/plain` → expected categories.
- `image/webp` + `foo.webp` → `'image'` (prefix wins).
- `application/octet-stream` + `foo.pdf` → `'pdf'` (extension fallback).
- `application/octet-stream` + `foo.bin` → `'generic'`.
- `'IMAGE/PNG'` → `'image'` (case-insensitive).

**Unit — `mapDownloadHttpErrorToUserMessage`:**
- Every branch in the download failure table, including both 404 outcomes (`HTTP_404_MISSING` vs. `HTTP_404_FAILED`) distinguished by the server `message` payload.
- Blob-body quirk: construct an `HttpErrorResponse` whose `.error` is a `Blob` of JSON `{"message":"File upload failed."}` — mapper returns `HTTP_404_FAILED`.
- Unparseable blob body on 404 → `HTTP_404_OTHER`, non-retryable.

**Unit — `mapListFetchHttpErrorToUserMessage`:**
- 403 → `HTTP_403`, non-retryable.
- 404 → `HTTP_404`, non-retryable.
- 500 → `HTTP_5XX`, retryable.
- Status 0 → `NETWORK`, retryable.
- 418 → `HTTP_OTHER`, retryable.

**Unit — `triggerBlobDownload`:**
- Spy ordering: `createObjectURL` → anchor click → DOM removal → `revokeObjectURL`.
- `download` attribute = `fileName` (Unicode, spaces, long names preserved).
- Same URL passed to both `createObjectURL` and `revokeObjectURL`.

**Unit — `AttachmentsApiService`:**
- `listAttachmentsByTask`: exactly one `GET /api/attachment/task/{id}`; envelope unwrapping (`data` array → raw array; `data: null` → `[]`); error passes through.
- `downloadAttachment`: exactly one `GET /api/attachment/{id}`; response as `HttpResponse<Blob>`; no manual headers.

**Unit — `AttachmentsStateService.hydrateCompletedForTask`:**
- `loading` → `ready` on success; merged result visible in `completedByTaskId[taskId]`.
- `loading` → `error` on failure; `completedByTaskId[taskId]` preserved.
- Dedup: second call while first is `loading` returns no-op (one HTTP call observed).
- Multi-task: hydrating task A then task B both complete; no cross-cancellation.
- Service destroy cancels outstanding list subs (no leaked subscriptions).
- Merge: server not in state → inserted; server newer `updatedAt` than state → replaced; server absent, state present → preserved.
- Ordering: result sorted `createdAt` DESC.

**Unit — `AttachmentRowComponent`:**
- **Happy path:** mock `downloadAttachment` to return `of(HttpResponse<Blob>)`. Click button → button disabled during call → `triggerBlobDownload` called once with `(blob, fileName)` → state back to idle.
- **Double-click guard:** two synchronous clicks → one HTTP call.
- **400 processing:** error → `HTTP_400_PROCESSING`, retryable, retry button visible.
- **403:** non-retryable, retry hidden.
- **404 "File upload failed.":** `HTTP_404_FAILED`, non-retryable.
- **404 "File not found.":** `HTTP_404_MISSING`, non-retryable.
- **Row isolation:** render two rows, 403 on row A does not mutate row B.
- **Status 0:** `NETWORK`, retryable.
- **Retry:** from `HTTP_400_PROCESSING` → click retry → second HTTP call fired → state transitions.
- **Accessible name:** `downloadAriaLabel()` = `Download {fileName}`; `aria-busy` flips true during call.
- **Long filename:** template binds `title="{fullFileName}"`.

**Unit — `AttachmentListComponent`:**
- `fetchState.phase = 'loading'` + empty attachments → skeleton + `aria-busy="true"`; NO row list.
- `fetchState.phase = 'loading'` + non-empty attachments (SignalR pre-seeded) → list renders, no skeleton (rationale: don't flash away existing content on refresh).
- `fetchState.phase = 'ready'` + empty → empty-state copy "No attachments yet." — NOT "session" wording (Path A).
- `fetchState.phase = 'ready'` + 3 items → three `<app-attachment-row>`; each row's `attachment` input matches array order (matches server DESC order).
- `fetchState.phase = 'error'` + non-empty attachments → error banner + in-memory rows both visible (banner does not hide the list).
- `fetchState.phase = 'error'` + retryable → Retry button visible; click emits `retryFetch`.
- `fetchState.phase = 'error'` + non-retryable → Retry button hidden.
- Input change from 2 → 3 items (simulate live SignalR append): third row appears without unmounting the first two (`track attachment.id`).

**Unit — `TaskDetailPanelComponent` (extended):**
- Stub `AttachmentsStateService` with `completedByTaskId`, `completedFetchByTaskId` signals + `hydrateCompletedForTask` spy.
- On initial `task` input → spy called once with `task.id`.
- On `task` input change to a new task id → spy called with the new id.
- `<app-attachment-list>` receives current `completedAttachments()` and `listFetchState()`.
- `retryFetch` output → spy called again.

**Unit — `TaskCardComponent` (extended):**
- Stub `AttachmentsStateService` with `completedByTaskId` signal.
- Empty slice → no indicator DOM; `accessibleName` plain.
- Slice of 1 → indicator present (`aria-hidden="true"`); `accessibleName` = `{title} (1 attachment)`.
- Slice of 3 → `accessibleName` = `{title} (3 attachments)`.
- 2 → 3 transition → DOM re-rendered on next tick.
- Notes + 2 attachments → `{title} (has notes) (2 attachments)`.

### Mocking patterns

```typescript
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { HttpResponse, HttpErrorResponse } from '@angular/common/http';

const completedByTaskId = signal<Record<string, AssetResponseDto[]>>({});
const completedFetchByTaskId = signal<Record<string, AttachmentListFetchState>>({});

const mockAttachmentsState = {
  uploadsByTaskId: signal<Record<string, AttachmentUpload[]>>({}),
  completedByTaskId,
  completedFetchByTaskId,
  hydrateCompletedForTask: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  dismiss: vi.fn()
};

const mockAttachmentsApi = {
  listAttachmentsByTask: vi.fn(() => of<AssetResponseDto[]>([])),
  downloadAttachment: vi.fn(() =>
    of(new HttpResponse({
      body: new Blob(['x'], { type: 'application/pdf' }),
      status: 200
    }))
  ),
  uploadAttachment: vi.fn()
};
```

### Edge cases from AC

- Double-click guard (1 HTTP call per user click).
- Object-URL revocation after 100 rapid downloads (revoke count == create count).
- `HTTP_400_PROCESSING` → retry → 200 success transition.
- Row isolation: per-row errors don't cascade.
- Live SignalR update: appending to `completedByTaskId` inserts a row without refresh.
- Card indicator live update.
- `accessibleName` recomputes when `attachmentCount` changes.
- Long filename handled with `title` attribute.
- MIME-miss fallback via extension.
- `image/webp` prefix fallback.
- Empty state copy = `"No attachments yet."` (Path A; Option C hedge wording is gone).
- No zero-badge on card.
- Blob error body parsing (404 "File upload failed." case).
- Keyboard focus preserved on download button after successful download.
- Panel close during download: `takeUntilDestroyed(destroyRef)` unsubscribes cleanly.
- Task id change while list-fetch is in flight: stale subscription cancelled (no race between A's response and B's panel).

---

## Out of Scope / Follow-up asks

- **Bulk attachment-count endpoint.** For card indicators to reflect true counts on cold load without opening every panel, the backend should expose something like `GET /api/project/{id}/attachment-counts` returning `Record<taskId, number>`. Without it, the card indicator is incremental (primed by panel opens + SignalR events in-session). Flag for a future backend ticket.
- **Delete attachment (Q7).** Needs backend `DELETE /api/attachment/{assetId}` + an `AssetDeleted` SignalR event to prune client state authoritatively. When it lands, add a `delete` output on `AttachmentRowComponent`, a `deleteAttachment` API method, and a `removeCompleted` state command.
- **Inline image preview (Q6).** Layer on top of the download blob later.
- **Thumbnail rendering.** `AssetResponseDto.thumbnailKey` remains reserved; no thumbnail endpoint yet.
- **Sort / filter / search / pagination.** Server DESC order is fine for the current volume.
- **SignalR reconciliation of list deletions.** Currently the merge strategy (A1) deliberately does not prune in-memory entries absent from a list response, to avoid flicker from the `AssetCompleted`-vs-list-snapshot race. An `AssetDeleted` event is the correct pruning channel — not yet in the contract.
- **Offline/stale-list indicator.** No "attachments may be outdated" badge when the list fetch has errored; the in-line banner is sufficient for #51.

---

## Design Validation (Self-Check)

**Interface alignment**
- [x] `AssetResponseDto` used verbatim — matches backend map §AssetResponseDto and `features/attachments/models/attachment.model.ts`.
- [x] `ApiResponse<T>` envelope properly unwrapped for `listAttachmentsByTask`.
- [x] 404 now covers both missing + failed-upload outcomes, distinguished by server message payload.
- [x] List ordering honours server-authoritative `createdAt` DESC.

**Standards compliance**
- [x] `inject()` for DI; no constructor injection.
- [x] Signals for UI state; RxJS for HTTP; `takeUntilDestroyed(DestroyRef)` on row subscriptions.
- [x] `OnPush` on both new components.
- [x] Standalone only; no NgModules.
- [x] `@for ... track attachment.id`.
- [x] `effect()` used for task-id-change-driven hydration (not `ngOnChanges`).

**Security**
- [x] No manual `Authorization`; interceptor handles both list and download.
- [x] No `window.open` / `<a href>` / `fetch` bypass.
- [x] No blob persisted.
- [x] No PII (filename, assetId, blob, token) logged.
- [x] `URL.revokeObjectURL` on every `createObjectURL` path.

**Completeness**
- [x] All new files listed.
- [x] All modified files listed (including `attachments-state.model.ts` + service for the new slice).
- [x] Implementation steps ordered (models → constants → API → state → helper → row → list → panel wiring → card indicator → verify).
- [x] Every AC from the context doc is addressed:
  - List renders when ≥1 attachment (§6, §7).
  - Empty state copy (now authoritative "No attachments yet.", Path A).
  - Reactive via `completedByTaskId` (§State).
  - Session-resume deterministic: hydrated from server on panel-open (§3, §7).
  - File-type icon mapping (§1.3).
  - Filename + size + date bindings (§5).
  - `formatFileSize` reuse (§5.4).
  - Accessible download control (§5.7).
  - Single `GET /api/attachment/{assetId}` per click (§2, §5.5).
  - Interceptor auth (§2, §9.2).
  - Download call in service (§2).
  - Double-click guard (§5.5).
  - Blob download helper (§4).
  - Filename from state (§4).
  - Busy affordance clears (§5.5).
  - Failure mapping — both endpoints now specced (§Service Integration).
  - Row error isolation (Q4, §QA).
  - Card indicator on count ≥ 1 (§8).
  - No zero-badge (§8.2).
  - Live-updating indicator (§8.3 spec).
  - Indicator in `accessibleName` (§State).
  - Indicator not a click target (§8.2).
  - No #50 regressions (§3 extends, does not rewrite).
  - List-fetch error banner + retry (§6, §7).
  - Accessibility: list semantics, `aria-label`, keyboard, live region, busy state (§5.7, §6.5).
  - No PII logged, no blob cached, no `window.open` (§9).
  - `npm run build` + `npm run test` (§10).
  - No new deps.
  - Attachment code stays in `features/attachments/` except the card-indicator binding (a minimal selector call on the card).

---

*"The technical specification is saved. You can now instruct the web-designer agent to create the design specification."*

---

## Development Status

**Implementation Date:** 2026-05-06
**Developer:** Claude Opus 4.7 (1M context)

### Files Created

- `src/app/features/attachments/models/attachment-download.model.ts`
- `src/app/features/attachments/models/attachment-list-fetch.model.ts`
- `src/app/features/attachments/constants/attachment-icon-map.ts`
- `src/app/features/attachments/constants/download-errors.ts`
- `src/app/features/attachments/constants/list-errors.ts`
- `src/app/features/attachments/utils/attachment-icon-map.spec.ts`
- `src/app/features/attachments/utils/trigger-blob-download.ts`
- `src/app/features/attachments/utils/trigger-blob-download.spec.ts`
- `src/app/features/attachments/components/attachment-row/attachment-row.component.ts`
- `src/app/features/attachments/components/attachment-row/attachment-row.component.html`
- `src/app/features/attachments/components/attachment-row/attachment-row.component.scss`
- `src/app/features/attachments/components/attachment-row/attachment-row.component.spec.ts`
- `src/app/features/attachments/components/attachment-list/attachment-list.component.ts`
- `src/app/features/attachments/components/attachment-list/attachment-list.component.html`
- `src/app/features/attachments/components/attachment-list/attachment-list.component.scss`
- `src/app/features/attachments/components/attachment-list/attachment-list.component.spec.ts`

### Files Modified

- `src/app/features/attachments/services/attachments-api.service.ts` — added `listAttachmentsByTask` and `downloadAttachment`
- `src/app/features/attachments/services/attachments-api.service.spec.ts` — coverage for the two new methods
- `src/app/features/attachments/state/attachments-state.model.ts` — added `completedFetchByTaskId` slice
- `src/app/features/attachments/state/attachments-state.service.ts` — added `hydrateCompletedForTask` command + `mergeCompletedAssets` reconciler + `listSubs` teardown
- `src/app/features/attachments/state/attachments-state.service.spec.ts` — coverage for hydrate + merge
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` — added `effect()` for hydration, `completedAttachments`/`listFetchState` computeds, `handleRetryListFetch`, imported `AttachmentListComponent`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.html` — rendered `<app-attachment-list>` and conditional section divider below the upload stack
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss` — `.task-detail-panel__section-divider`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts` — stub now covers `completedFetchByTaskId` + `hydrateCompletedForTask`; new suite for attachment list wiring
- `src/app/features/board/components/task-card/task-card.component.ts` — injected `AttachmentsStateService`, added `attachmentCount` computed, extended `accessibleName`
- `src/app/features/board/components/task-card/task-card.component.html` — decorative paperclip + count indicator under `.task-card__meta-row`
- `src/app/features/board/components/task-card/task-card.component.scss` — `.task-card__meta-row`, `.task-card__attachment-meta/-icon/-count`
- `src/app/features/board/components/task-card/task-card.component.spec.ts` — provides `AttachmentsStateService` stub; new suite for attachment indicator
- `src/app/features/board/board-page/board-page.component.spec.ts` — mock extended with `completedFetchByTaskId` + `hydrateCompletedForTask`

### Build & Test Results

- **Build:** SUCCESS (`npm run build`, pre-existing Sass `-$x -$y` deprecation warnings and `upload-progress-row.component.scss` size budget warning are unrelated to #51).
- **Tests:** 973/973 passed on the clean run. An earlier parallel run reported 17 flaky SignalR failures under `src/app/core/services/signalr.service.spec.ts` — these are unrelated to the attachment slice (pre-existing flakiness caused by microtask ordering in the SignalR spec's mock wiring) and all passed on the subsequent run with zero test changes.

### Edge Cases Handled

- Double-click guard on the download button (single HTTP call).
- Retry pill is rendered iff `error.retryable === true`; focus returns to the download button after retry.
- Panel close / task switch during a download cancels via `takeUntilDestroyed`.
- Merge strategy preserves SignalR-origin rows absent from the server list snapshot (no flicker).
- Empty state uses the authoritative "No attachments yet." copy (Path A).
- Zero-attachment cards do not render the paperclip indicator at all.
- Reduced-motion clamp covers skeleton sweep + row-enter keyframes.
- Blob error body parsing: 400/404 mapper asynchronously reads `Blob.text()` + `JSON.parse` before branching.

### Known Limitations (handed off to follow-ups documented in §Out of Scope)

- Board-level card indicators are hydrated incrementally (panel opens + SignalR events). A bulk attachment-count endpoint is out of scope for #51.
- No `DELETE` support — the merge strategy deliberately does not prune in-memory entries absent from a list response.

*"Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests."*

### Testing Summary

**QA Pass Date:** 2026-05-07
**QA Engineer:** Claude Opus 4.7 (1M context) acting as `qa-tester`

#### Test Files Touched

**New:**
- `src/app/features/attachments/constants/download-errors.spec.ts` — 19 tests covering every branch of `mapDownloadHttpErrorToUserMessage` including the Blob-body quirk, unparseable bodies, the three 404 outcomes, and non-HttpErrorResponse fallback.
- `src/app/features/attachments/constants/list-errors.spec.ts` — 8 tests covering every branch of `mapListFetchHttpErrorToUserMessage` (403, 404, 500/503, status 0, 418, non-HttpErrorResponse).

**Augmented (no removed tests):**
- `src/app/features/attachments/components/attachment-row/attachment-row.component.spec.ts` — added 12 tests:
  - Row isolation (two-row integration — 403 on row A leaves row B idle).
  - Aria-busy clears on error (previously only verified on success).
  - `role="alert"` + `aria-live="polite"` + `aria-atomic="true"` on row error region.
  - Retry re-focuses the download button after the pill unmounts (AC19 keyboard focus preservation).
  - `<time datetime>` binding, long-filename `title` binding, download-glyph vs spinner swap on state, additional error codes (`HTTP_400_OTHER`, `HTTP_404_MISSING`, `HTTP_404_OTHER`, `HTTP_5XX`, `HTTP_OTHER`).
  - `image/webp` MIME prefix resolves to image category.
- `src/app/features/attachments/components/attachment-list/attachment-list.component.spec.ts` — added 7 tests: `role="alert"` on banner, `role="list"` on UL, `<section aria-label="Attachments">`, `aria-hidden="true"` on skeleton UL, banner + list coexistence (non-retryable), DESC render order, `@for track` preserving existing row DOM nodes on append.
- `src/app/features/attachments/state/attachments-state.service.spec.ts` — added 9 tests: list-error branches 403/404/network, retry after error, DESC sort with jumbled server response, signalR row mixed with server entries, stale subscription replacement after completed round, completedByTaskId preservation during loading+error, service destroy cleanup of outstanding list subs.
- `src/app/features/attachments/services/attachments-api.service.spec.ts` — added 4 tests: download error propagation, single-request fire guarantee, list null-envelope defence, list error propagation.
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts` — added 5 tests: section divider shown on loading, shown on ≥1 completed row, `aria-hidden` on divider, inputs wired through to `<app-attachment-list>`.
- `src/app/features/board/components/task-card/task-card.component.spec.ts` — added 4 tests: indicator is non-focusable `<span>` (no role/tabindex/href/button), paperclip icon is `aria-hidden="true"`, indicator unmounts on live count→0, indicator absent when state slice undefined.

#### Test Count Delta

- Baseline before QA: **973 tests** across 57 files (per developer's Development Status).
- After QA augmentation: **1041 tests** across 59 files.
- **Net new tests: +68.** Two new test files, six augmented.

#### Final Test Run

- `npm run test -- --watch=false` — **1041 passed / 0 failed** on clean runs.
- PRE-EXISTING flakiness in `src/app/core/services/signalr.service.spec.ts` (17 tests, microtask-ordering race in the mock builder) continues to appear on some parallel runs; NOT introduced by #51 and NOT touched. Classification per dev handoff reconfirmed.
- **INTRODUCED failures: 0.**

#### AC Coverage Map

| AC | Covered? | Primary test location |
|----|----------|-----------------------|
| 1. List renders when ≥1 attachment | YES | `attachment-list.component.spec.ts` > "renders one app-attachment-row per attachment…" + "renders the count…" |
| 2. Empty state copy exactly "No attachments yet." | YES | `attachment-list.component.spec.ts` > "renders the empty state when ready and zero attachments" |
| 3. `createdAt` DESC ordering (server authoritative, SignalR on top) | YES | `attachments-state.service.spec.ts` > "merge result is sorted DESC…" + "merge preserves a signalR-origin entry AND sorts it correctly…" + `attachment-list.component.spec.ts` > "renders rows in the order supplied…" |
| 4. Panel-open hydration via effect on `task().id` | YES | `task-detail-panel.component.spec.ts` > "calls hydrateCompletedForTask on initial render…" + "re-calls…when the task input changes" |
| 5. Merge strategy (insert / replace on newer updatedAt / preserve / sort) | YES | `attachments-state.service.spec.ts` > hydrateCompletedForTask describe block (seven merge tests) |
| 6. File-type icon mapping (MIME, image/*, extension, case, generic) | YES | `attachment-icon-map.spec.ts` (7 tests) + row-level `image/webp` test |
| 7. Filename + size + date bindings; long filename title | YES | `attachment-row.component.spec.ts` > filename/title/size/datetime tests; long-filename test |
| 8. Download control aria-label, aria-busy, disabled | YES | `attachment-row.component.spec.ts` > "renders the filename…with aria-label" + "sets aria-busy and disables the button…" |
| 9. Single GET + double-click guard | YES | `attachment-row.component.spec.ts` > "guards against double-click…" + `attachments-api.service.spec.ts` > "issues exactly one request per call" |
| 10. Interceptor auth; blob responseType; observe response | YES | `attachments-api.service.spec.ts` > downloadAttachment describe (3 tests) |
| 11. Blob download helper (createObjectURL → anchor → remove → revoke; filename preserved) | YES | `trigger-blob-download.spec.ts` (3 tests) |
| 12. Busy affordance clears on success AND on error | YES | `attachment-row.component.spec.ts` > "sets aria-busy…" (success) + "clears aria-busy…on error" |
| 13. Download failure mapping (every row in table + Blob-body quirk) | YES | `download-errors.spec.ts` (19 tests) + row-level tests for each code |
| 14. List-fetch failure mapping (403/404/5xx/network/other) | YES | `list-errors.spec.ts` (8 tests) + state-service branch tests |
| 15. Row error isolation (two rows, A fails, B unaffected) | YES | `attachment-row.component.spec.ts` > "row A error does not mutate row B state" |
| 16. Card indicator iff count ≥ 1; aria-hidden; not click target | YES | `task-card.component.spec.ts` > attachment indicator describe (10 tests incl. non-focusable and shrink-to-0) |
| 17. `(1 attachment)` vs `(N attachments)`; combined with `(has notes)` | YES | `task-card.component.spec.ts` > accessible-name tests |
| 18. No #50 regressions | YES | All existing upload / dropzone / upload-progress-row specs continue to pass |
| 19. Keyboard focus preserved after successful download AND after retry | YES | `attachment-row.component.spec.ts` > "retry focuses the download button after the pill unmounts" (success path is implicitly preserved because the button stays mounted / re-enabled in idle); retry path is now explicit |
| 20. `takeUntilDestroyed` on row subscribe | PARTIAL — structural | Presence verified by reading source; no dedicated lifecycle race test added (see gaps). Happy-path cancellation proven indirectly by the fact that retry re-issues without double-subscribing. |
| 21. Hydrate is idempotent; per-taskId sub tracking | YES | `attachments-state.service.spec.ts` > "deduplicates concurrent calls…" + "allows independent fetches for different taskIds" |
| 22. Service destroy cancels outstanding list subs | YES | `attachments-state.service.spec.ts` > "cancels outstanding list subs on service destroy" |
| 23. No PII logged, no window.open, no localStorage in new code | PARTIAL — structural | Confirmed via source review (no `console.*`, no `window.open`, no storage API in new files). Not a runtime-observable assertion; left as a design-review gate. |
| 24. Live region semantics (aria-live + aria-relevant on UL; role="alert" on banner + row error; aria-busy on skeleton) | YES | `attachment-list.component.spec.ts` (role="alert", aria-hidden on skeleton, role="list", aria-label) + `attachment-row.component.spec.ts` (role="alert" + aria-live + aria-atomic on error region) |

#### Bugs Discovered

**None.** Every code path tested behaves as specified in the tech spec and design spec.

#### Gaps Intentionally Deferred

- **AC20 (`takeUntilDestroyed` lifecycle race):** a true unit test would require building a real Angular view, starting a download, destroying the view mid-flight, and proving the HTTP subscription is torn down without mutating destroyed state. The mechanism is present at the source level (`.pipe(takeUntilDestroyed(this.destroyRef))` in `attachment-row.component.ts` line 101) and the Angular RxJS interop is itself well-tested. A contrived test that repeatedly verifies Angular's own contract offered weak signal-to-noise; deferred with this note.
- **AC23 (no PII / no `window.open` / no `localStorage` in new code):** a structural gate (static-analysis-shaped) rather than a runtime assertion. Confirmed via Grep during review — zero hits for `console.`, `window.open`, `localStorage.`, `sessionStorage.`, `IndexedDB` in the new attachments files. Adding a Vitest "lint-style" guard duplicates ESLint's remit; deferred.
- **Reduced-motion CSS clamp:** design-spec §6 "Reduced motion" references the global `_motion.scss` rule; SCSS-level testing is out of scope for Vitest and is left for visual / Playwright QA.

#### Coverage

Coverage numbers were not captured on this pass — the test runner is Vitest-via-ng-test in this project and the CI-report script was not exercised here. Structural coverage of the #51 files is high by inspection: every exported function / observable code path has at least one assertion.

*"QA review complete. All acceptance criteria with runtime-observable behaviour are covered by automated tests and the suite is green."*
