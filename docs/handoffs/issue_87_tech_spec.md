# Technical Specification: Hydrate tasks on board entry (issue #87)

**Context Document:** [issue_87_context.md](./issue_87_context.md)
**GitHub Issue:** [#87](https://github.com/Gulybi/KanbAI-Web/issues/87)
**Backend prerequisite (BLOCKING):** a task-read endpoint. This spec writes to the recommended shape `GET /api/task/project/{projectId}` → `ApiResponse<List<TaskResponseDto>>`, sorted ascending by `taskOrder` within each `columnId`. **If the backend ticket ships a different URL, verb, or envelope, the implementation conforms to what ships — this spec's URL is the contract assumption, not an invention.**

---

## Overview

The board already hydrates columns on mount via `ColumnsApiService.getColumnsForProject` + `BoardStateService.setColumns`. Tasks are the missing half of the same chassis: `BoardPageComponent.ngOnInit` calls `enterBoard` (which wipes `tasksByColumnId: {}`) and `loadColumns`, but never a `loadTasks`, so every cold refresh renders an empty board. This ticket adds the symmetrical pieces — a `getTasksForProject` HTTP read on `TasksApiService`, a `setTasks` atomic reconciler on `BoardStateService`, an inline error strip + Retry affordance on `BoardPageComponent`, and a `TaskUpdated` SignalR handler so [#85](https://github.com/Gulybi/KanbAI-Web/pull/85)'s description edits survive refresh. No new components, no routing changes, no design-system changes; this is an incremental addition to the existing board feature area.

---

## Component Architecture

### Routing

No new routes, no new guards. The existing `/projects/:projectId` route continues to resolve to `BoardPageComponent`. Route parameter extraction in `ngOnInit` is unchanged.

### Component Hierarchy

**Smart Containers (modified):**
- [`BoardPageComponent`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts) — owns the hydration orchestration. Adds `loadTasks(projectId)` (private), `taskLoadError` signal, `isLoadingTasks` signal, `retryLoadTasks()` handler, and sequences `loadColumns` → `loadTasks` so `setTasks`'s allowed-ids filter has columns to filter against.

**Presentational (unchanged):**
- `BoardColumnComponent`, `TaskCardComponent`, `TaskDetailPanelComponent`, `BoardAddColumnComponent`, `BoardAddTaskComponent` — zero behavioural changes. They already render whatever `tasksByColumnId()[column.id] ?? []` hands them.

### New Files to Create

None. Everything lives in the existing board feature area.

### Files to Modify

| File | Change |
|------|--------|
| [`KanbAI-Web/src/app/features/board/services/tasks-api.service.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts) | Add `getTasksForProject(projectId)` method + `mapTaskListErrorToUserMessage` export. |
| [`KanbAI-Web/src/app/features/board/models/task.model.ts`](../../KanbAI-Web/src/app/features/board/models/task.model.ts) | Add `TaskListResponse = ApiResponse<TaskResponseDto[]>` envelope alias. |
| [`KanbAI-Web/src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) | Add `setTasks(projectId, tasks)` method + `onTaskUpdated` SignalR handler + subscription wiring in the connect-effect. |
| [`KanbAI-Web/src/app/core/models/realtime-events.ts`](../../KanbAI-Web/src/app/core/models/realtime-events.ts) | Add `TaskUpdated: 'TaskUpdated'` to `REALTIME_EVENT`; add `TaskUpdatedEvent` interface. |
| [`KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts) | Add `taskLoadError`, `isLoadingTasks` signals; add `loadTasks(projectId)` private method; chain `loadTasks` off `loadColumns` success; add `retryLoadTasks()` public handler; add hydration-complete announcement. |
| [`KanbAI-Web/src/app/features/board/board-page/board-page.component.html`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html) | Add inline task-load error strip with Retry button above the columns container. |
| [`KanbAI-Web/src/app/features/board/board-page/board-page.component.scss`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss) | Styles for the task-load error strip. Exact SCSS is a web-designer decision (see §"Handoff" below). |
| `KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts` | New `describe('getTasksForProject()')` + `describe('mapTaskListErrorToUserMessage()')` blocks. |
| `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts` | New `describe('setTasks()')` + `describe('onTaskUpdated')` blocks. |
| `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` | New tests asserting `loadColumns` → `loadTasks` sequencing, error-strip render on task-read failure, and Retry behaviour. |

---

## State & Data Layer

### State Management Strategy

- **Signals for UI state** — `taskLoadError: WritableSignal<string | null>`, `isLoadingTasks: WritableSignal<boolean>` on `BoardPageComponent`. These mirror the shape of the existing `columnLoadError` / `moveError` signals at [`board-page.component.ts:101`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L101) and [`:108`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L108).
- **RxJS for HTTP** — `tasksApi.getTasksForProject(projectId)` returns an `Observable<TaskResponseDto[]>`, consumed with `takeUntilDestroyed(this.destroyRef).subscribe({ next, error })` — identical pattern to the existing `loadColumns` at [`:476-489`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L476-L489).
- **No new state service, no new store.** `BoardStateService` is the authority.

### TypeScript Interfaces

#### Envelope alias (new)

**File:** [`KanbAI-Web/src/app/features/board/models/task.model.ts`](../../KanbAI-Web/src/app/features/board/models/task.model.ts)

```typescript
/** Envelope alias for the task-list response (issue #87). */
export type TaskListResponse = ApiResponse<TaskResponseDto[]>;
```

No other changes to `task.model.ts`. `TaskResponseDto`, `CreateTaskDto`, and `MoveTaskDto` are unchanged.

#### Realtime event (new)

**File:** [`KanbAI-Web/src/app/core/models/realtime-events.ts`](../../KanbAI-Web/src/app/core/models/realtime-events.ts)

```typescript
// Add to REALTIME_EVENT object:
TaskUpdated: 'TaskUpdated'

// New interface:
/**
 * Payload of `TaskUpdated`, emitted by
 * `PUT /api/task/{taskId}/description` and
 * `DELETE /api/task/{taskId}/description` (per backend_api_map.md:165).
 *
 * Structurally identical to `TaskCreatedEvent` — the backend broadcasts
 * the same `TaskResponseDto` shape. Kept as a distinct interface so the
 * typed `on<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated)` subscription
 * reads cleanly and can diverge later (e.g. if the backend adds a
 * `previousContent` field).
 *
 * ⚠ BACKEND CAVEAT (same as TaskCreatedEvent): no `projectId` on the wire;
 * attribution via `BoardStateService.currentProjectId` + group membership.
 */
export interface TaskUpdatedEvent {
  id: string;
  title: string;
  content: string | null;
  taskOrder: number;
  columnId: string;
  assignedId: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}
```

#### State shape

No change to `BoardState`. `tasksByColumnId: Record<string, BoardTask[]>` already exists at [`board-state.model.ts:52`](../../KanbAI-Web/src/app/features/board/state/board-state.model.ts#L52). `setTasks` replaces this slice atomically.

---

## Service Integration

### `TasksApiService.getTasksForProject`

**File:** [`KanbAI-Web/src/app/features/board/services/tasks-api.service.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts)

```typescript
/**
 * `GET /api/task/project/{projectId}` — returns every task in the project,
 * sorted ascending by `taskOrder` within each `columnId` (backend
 * pre-sorted per the recommended shape). JWT attached automatically by
 * `authInterceptor`.
 *
 * Envelope unwrap mirrors `ColumnsApiService.getColumnsForProject`:
 *  - `success: false` → observable error.
 *  - `success: true` with `data == null` → observable error (defensive;
 *    the recommended backend shape returns `[]` for an empty project,
 *    not `null`, but we harden for contract drift).
 *  - `success: true` with array `data` → unwrapped `TaskResponseDto[]`.
 *
 * The service does NOT retry, does NOT swallow errors, does NOT translate
 * to user copy. Callers own user-copy via {@link mapTaskListErrorToUserMessage}.
 */
getTasksForProject(projectId: string): Observable<TaskResponseDto[]> {
  const url = `${this.apiUrl}/project/${encodeURIComponent(projectId)}`;
  return this.http.get<TaskListResponse>(url).pipe(
    map(response => {
      if (!response.success || response.data == null) {
        throw new Error(
          response.errors?.[0] ?? response.message ?? 'Request failed'
        );
      }
      return response.data;
    })
  );
}
```

### `mapTaskListErrorToUserMessage`

**File:** same as above, exported sibling function mirroring `mapTaskCreateErrorToUserMessage` at [`tasks-api.service.ts:108-132`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L108-L132). **Verbatim strings are frozen by AC23–AC28.**

```typescript
/**
 * Operation-appropriate user copy for a failed task-list read (issue #87).
 * Verbatim strings frozen in issue_87_context.md §"Error copy".
 * Never exposes status codes, URLs, stack traces, or envelope error arrays.
 */
export function mapTaskListErrorToUserMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }
    if (error.status === 401) {
      // The global authInterceptor (#86/#88) owns redirect-to-login; this
      // string is defensive for the rare case the interceptor is bypassed.
      return 'Your session has expired. Please sign in again.';
    }
    if (error.status === 403) {
      return 'You are no longer a member of this project.';
    }
    if (error.status === 404) {
      return 'This project no longer exists.';
    }
    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }
    return "We couldn't load this board. Please try again.";
  }
  return "We couldn't load this board. Please try again.";
}
```

**Note on 400 mapping:** #87 does not define a dedicated 400 string. A `4xx` that is neither 401/403/404 falls through to the default copy. This matches the fallback shape of `mapTaskCreateErrorToUserMessage`.

### `BoardStateService.setTasks`

**File:** [`KanbAI-Web/src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts)

Public method. Mirrors [`setColumns`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L373-L387) semantics.

```typescript
/**
 * Replace the task buckets for the current board. Called by
 * `BoardPageComponent` after the initial `GET /api/task/project/{projectId}`.
 *
 * Idempotent w.r.t. concurrency: if the active project has already changed
 * (stale hydration — user navigated A → B while A's request was in flight),
 * the call is a silent no-op. Mirrors the project-id guard on `setColumns`.
 *
 * Orphan filter: any task whose `columnId` is not in the current
 * `columns()` set is dropped. Mirrors the allowed-ids filter on
 * `setColumns`; defends against `ColumnDeleted` arriving between the
 * column fetch and the task fetch.
 *
 * Atomic replace: `tasksByColumnId` is replaced, NOT merged. This is
 * intentional — `setTasks` is authoritative for initial state, and any
 * pre-existing bucket content (e.g. a `TaskCreated` SignalR event that
 * raced the hydration) is overwritten. The SignalR path will either
 * re-deliver the missed event or the hydration payload already contained
 * it (the backend ticket guarantees both `TaskCreated` echo and the GET
 * response agree on persisted state).
 *
 * Projection to `BoardTask`: drops `createdAt`/`updatedAt` per the same
 * reasoning as `applyCreatedTask` at :346-358 — the board UI does not
 * need timestamps and keeping them leaks irrelevant backend fields into
 * local state.
 */
setTasks(projectId: string, tasks: TaskResponseDto[]): void {
  if (this.getState().currentProjectId !== projectId) {
    return;
  }
  const allowedColumnIds = new Set(this.getState().columns.map(c => c.id));
  const nextBuckets: Record<string, BoardTask[]> = {};
  for (const dto of tasks) {
    if (!allowedColumnIds.has(dto.columnId)) {
      continue;
    }
    const projected: BoardTask = {
      id: dto.id,
      title: dto.title,
      content: dto.content,
      taskOrder: dto.taskOrder,
      columnId: dto.columnId,
      assignedId: dto.assignedId
    };
    const bucket = nextBuckets[dto.columnId];
    if (bucket) {
      bucket.push(projected);
    } else {
      nextBuckets[dto.columnId] = [projected];
    }
  }
  for (const key of Object.keys(nextBuckets)) {
    nextBuckets[key].sort((a, b) => a.taskOrder - b.taskOrder);
  }
  this.setState({ tasksByColumnId: nextBuckets });
}
```

### `BoardStateService.onTaskUpdated`

**File:** same. Wires `TaskUpdated` SignalR event. Mutates the existing bucket entry's `content` (and `title`, `assignedId`, `taskOrder` defensively) in place; `null` content is preserved as-is. **Does NOT plant a task that isn't already in state** — hydration, `TaskCreated`, and `applyCreatedTask` are the only insertion paths. Subscription wiring goes into the existing `connectionState → 'connected'` effect alongside the other four subscriptions.

```typescript
/**
 * SignalR handler for `TaskUpdated` — fires on description edit/clear
 * (issue #85). Reconciles by `id` with `content` as the source of truth
 * (nullable after a clear, per backend_api_map.md:176). Silently no-ops
 * if the task is not in local state — hydration is the authoritative
 * insertion path and a pre-hydration `TaskUpdated` for an unknown id is
 * a race that resolves itself when the GET lands.
 *
 * If `evt.columnId` differs from the task's current bucket (the backend
 * emits `TaskUpdated` only on description mutations, so this is not
 * expected), the handler trusts `evt.columnId` and moves the task — same
 * cross-bucket reconcile pattern as `reconcileServerTaskMove`.
 */
private onTaskUpdated(evt: TaskUpdatedEvent): void {
  if (!evt || this.getState().currentProjectId === null) {
    return;
  }
  const buckets = this.getState().tasksByColumnId;
  const ownerEntry = Object.entries(buckets).find(([, bucket]) =>
    bucket.some(t => t.id === evt.id)
  );
  if (!ownerEntry) {
    return;
  }
  const [ownerColumnId, ownerBucket] = ownerEntry;
  const reconciled: BoardTask = {
    id: evt.id,
    title: evt.title,
    content: evt.content,
    taskOrder: evt.taskOrder,
    columnId: evt.columnId,
    assignedId: evt.assignedId
  };
  const nextBuckets: Record<string, BoardTask[]> = { ...buckets };
  if (ownerColumnId === evt.columnId) {
    nextBuckets[ownerColumnId] = ownerBucket
      .map(t => (t.id === evt.id ? reconciled : t))
      .sort((a, b) => a.taskOrder - b.taskOrder);
  } else {
    // Cross-bucket reconcile (defensive — not expected on description-only updates).
    nextBuckets[ownerColumnId] = ownerBucket.filter(t => t.id !== evt.id);
    const destBucket = (nextBuckets[evt.columnId] ?? []).filter(t => t.id !== evt.id);
    nextBuckets[evt.columnId] = [...destBucket, reconciled].sort(
      (a, b) => a.taskOrder - b.taskOrder
    );
  }
  this.setState({ tasksByColumnId: nextBuckets });
}
```

**Subscription wiring** goes inside the existing `effect(() => { ... connectionState === 'connected' ... })` block at [`board-state.service.ts:62-98`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L62-L98), immediately after the `TaskMoved` subscription:

```typescript
this.subscriptionBag.push(
  this.signalRService
    .on<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated)
    .subscribe(evt => this.onTaskUpdated(evt))
);
```

### `BoardPageComponent.loadTasks` & orchestration

**File:** [`KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts)

New signals (alongside existing `columnLoadError`, `moveError`, etc.):

```typescript
/**
 * Inline error strip copy for a failed task-read (issue #87). Set by
 * `loadTasks` on error; cleared on a successful Retry or on destroy.
 * Explicitly NOT auto-dismissed — the board is unusable without tasks,
 * so the user must retry or navigate away. Do not copy the auto-dismiss
 * pattern from `moveError` at :504-521.
 */
readonly taskLoadError = signal<string | null>(null);

/** True while `loadTasks` is in flight. Disables the Retry button. */
readonly isLoadingTasks = signal<boolean>(false);
```

New private method:

```typescript
/**
 * HTTP read for the project's tasks. Invoked on `ngOnInit` after
 * `loadColumns` resolves (so `setTasks`'s allowed-ids filter has columns
 * to filter against) and on `retryLoadTasks`. The stale-project guard
 * inside `setTasks` makes it safe to interleave with user navigation.
 *
 * Success path sets a polite announcement via `dragAnnouncement`
 * (reusing the existing live-region at board-page.component.html:32-38);
 * error path populates `taskLoadError` with mapped copy.
 */
private loadTasks(projectId: string): void {
  this.isLoadingTasks.set(true);
  this.taskLoadError.set(null);

  this.tasksApi
    .getTasksForProject(projectId)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: dtos => {
        this.boardState.setTasks(projectId, dtos);
        this.isLoadingTasks.set(false);

        // Announce only if this hydration actually landed — the stale-project
        // guard inside `setTasks` may have no-op'd if the user navigated away.
        if (this.boardState.currentProjectId() === projectId) {
          const columnCount = this.columns().length;
          const taskCount = Object.values(this.tasksByColumnId()).reduce(
            (sum, bucket) => sum + bucket.length,
            0
          );
          if (taskCount > 0) {
            this.announce(
              `Board loaded with ${taskCount} tasks across ${columnCount} columns.`
            );
          }
        }
      },
      error: err => {
        this.isLoadingTasks.set(false);
        this.taskLoadError.set(mapTaskListErrorToUserMessage(err));
      }
    });
}
```

New public handler for the Retry button:

```typescript
/** Retry handler for the inline task-load error strip. */
retryLoadTasks(): void {
  const projectId = this.boardState.currentProjectId();
  if (projectId === null || this.isLoadingTasks()) {
    return;
  }
  this.loadTasks(projectId);
}
```

Modified `ngOnInit` sequencing — tasks load **after** columns resolve, so the allowed-ids filter has columns to filter against:

```typescript
ngOnInit(): void {
  const projectId = this.route.snapshot.paramMap.get('projectId');
  if (projectId === null || projectId.length === 0) {
    return;
  }
  this.boardState.enterBoard(projectId);
  this.loadColumns(projectId);
}
```

And `loadColumns` is modified to chain `loadTasks` on the success branch:

```typescript
private loadColumns(projectId: string): void {
  this.columnsApi
    .getColumnsForProject(projectId)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: dtos => {
        const mapped = this.projectColumnDtos(dtos);
        this.boardState.setColumns(projectId, mapped);
        // Only issue the task-read if the column load succeeded AND we're
        // still on the same project. The stale-id guard inside setTasks is
        // a second line of defence, but avoiding the HTTP call at all on
        // stale navigation is cheaper.
        if (this.boardState.currentProjectId() === projectId) {
          this.loadTasks(projectId);
        }
      },
      error: err => {
        this.columnLoadError.set(mapColumnErrorToUserMessage(err, 'list'));
        // Do NOT issue loadTasks — the full-board columnLoadError panel is
        // already rendering in place of the columns UI, so tasks are moot.
      }
    });
}
```

**On column-load failure `loadTasks` does NOT fire.** The existing `columnLoadError` branch at [`board-page.component.html:40-49`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L40-L49) replaces the entire column region, so a task-read would never render anywhere visible. This matches the context doc's framing — the task-load error strip is specifically for "columns loaded, tasks failed".

### HTTP Request/Response Contracts

| Method | Endpoint | Request | Response (success) | Response (failure) | Mapped copy |
|--------|----------|---------|--------------------|--------------------|-------------|
| `GET` | `/api/task/project/{projectId}` | — | `200` — `ApiResponse<TaskResponseDto[]>` with `success: true, data: [...]` sorted by `taskOrder` asc within each `columnId` | `0` / `401` / `403` / `404` / `4xx` / `5xx` or `success: false` | Per `mapTaskListErrorToUserMessage` above — strings frozen by AC23–AC28. |

**`projectId` MUST be URL-encoded** via `encodeURIComponent` — same pattern as `columns-api.service.ts:42` and `tasks-api.service.ts:35,58`. Tested explicitly in AC29.

---

## Implementation Steps

Follow these steps in order. Each step is a self-contained unit with observable verification.

### 1. Wire the new `TaskUpdated` realtime event type

- [ ] Open [`KanbAI-Web/src/app/core/models/realtime-events.ts`](../../KanbAI-Web/src/app/core/models/realtime-events.ts).
- [ ] Add `TaskUpdated: 'TaskUpdated'` to the `REALTIME_EVENT` const object.
- [ ] Add the `TaskUpdatedEvent` interface per §"TypeScript Interfaces → Realtime event".
- [ ] Run `npm run build` — zero errors, zero new warnings.

### 2. Add the task-list envelope alias

- [ ] Open [`KanbAI-Web/src/app/features/board/models/task.model.ts`](../../KanbAI-Web/src/app/features/board/models/task.model.ts).
- [ ] Add `export type TaskListResponse = ApiResponse<TaskResponseDto[]>;`.
- [ ] Run `npm run build`.

### 3. Add `getTasksForProject` + `mapTaskListErrorToUserMessage` on `TasksApiService`

- [ ] Open [`KanbAI-Web/src/app/features/board/services/tasks-api.service.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts).
- [ ] Add the `getTasksForProject(projectId)` method per §"Service Integration → TasksApiService.getTasksForProject".
- [ ] Add the `mapTaskListErrorToUserMessage(error)` exported function per §"Service Integration → mapTaskListErrorToUserMessage". Verbatim strings MUST match AC23–AC28 exactly.
- [ ] Run `npm run build`.

### 4. Add the `TasksApiService` unit tests (AC29 + AC30)

- [ ] Open `KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts`.
- [ ] Add a new `describe('getTasksForProject()', ...)` block mirroring the existing `describe('moveTask()')` / `describe('createTask()')` structure. Tests:
  - Issues a `GET` to `/task/project/{projectId}` with `projectId` URL-encoded.
  - Unwraps `{ success: true, data: [...] }` to the unwrapped array.
  - Throws on `{ success: false, ... }`.
  - Throws on `{ success: true, data: null }` (defensive).
  - Returns `[]` for an empty project (`{ success: true, data: [] }`).
- [ ] Add a new `describe('mapTaskListErrorToUserMessage()', ...)` block. Tests:
  - Status `0` → verbatim copy from AC23.
  - Status `401` → verbatim copy from AC24.
  - Status `403` → verbatim copy from AC25.
  - Status `404` → verbatim copy from AC26.
  - Status `500` / `503` → verbatim copy from AC27.
  - Status `400` / `418` → default copy from AC28.
  - Non-`HttpErrorResponse` (`new Error('X')`) → default copy.
- [ ] Run `npm run test -- --watch=false`. All new tests pass; no INTRODUCED failures elsewhere.

### 5. Add `setTasks` on `BoardStateService`

- [ ] Open [`KanbAI-Web/src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts).
- [ ] Add the `setTasks(projectId, tasks)` public method per §"Service Integration → BoardStateService.setTasks". Place it alongside `setColumns` (~line 387).
- [ ] Run `npm run build`.

### 6. Add `onTaskUpdated` handler + subscription wiring

- [ ] In the same file, add the `onTaskUpdated(evt)` private method per §"Service Integration → BoardStateService.onTaskUpdated". Place it in the `// event handlers` region alongside `onTaskMoved`.
- [ ] In the existing `connectionState === 'connected'` effect (~line 62-98), add a new `subscriptionBag.push(...)` call for `REALTIME_EVENT.TaskUpdated`, immediately after the `TaskMoved` subscription.
- [ ] Run `npm run build`.

### 7. Add `BoardStateService` unit tests (AC31 + AC7–9)

- [ ] Open `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts`.
- [ ] Add a new `describe('setTasks()', ...)` block. Tests:
  - (a) stale project-id guard — `enterBoard('B')`, then `setTasks('A', [...])` leaves state untouched.
  - (b) allowed-ids filter — a task with a `columnId` not in the current columns is dropped.
  - (c) bucketing by `columnId` — multiple tasks across multiple columns land in the correct buckets.
  - (d) sort by `taskOrder` ascending within each bucket.
  - (e) `BoardTask` projection drops `createdAt` / `updatedAt`.
  - (f) atomic replace — existing bucket content is overwritten, not merged.
- [ ] Add a new `describe('onTaskUpdated handler', ...)` block. Tests:
  - Updates `content` on a task that exists in state (AC9).
  - Silent no-op on an unknown task id.
  - Silent no-op when `currentProjectId === null`.
  - `null` content preserved as `null`.
  - Cross-bucket reconcile if `evt.columnId` differs from the task's current bucket.
- [ ] Extend the `TaskCreated` dedupe test (or add one) — hydrate task id X via `setTasks`, dispatch `TaskCreated` for X, assert exactly one entry (AC7).
- [ ] Extend the `TaskMoved` pre-hydration test — `TaskMoved` for unknown id is a no-op, then `setTasks` plants the task at its post-move position (AC8).
- [ ] Run `npm run test -- --watch=false`.

### 8. Modify `BoardPageComponent.ts` — signals + loadTasks + retry

- [ ] Open [`KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts).
- [ ] Add the `taskLoadError` and `isLoadingTasks` signals alongside the existing `columnLoadError` / `moveError` signals (~line 101-108).
- [ ] Add the `loadTasks(projectId)` private method per §"Service Integration → BoardPageComponent.loadTasks".
- [ ] Add the `retryLoadTasks()` public method.
- [ ] Modify `loadColumns` to chain `loadTasks` on the `next` branch (see §"BoardPageComponent.loadTasks & orchestration").
- [ ] Import `mapTaskListErrorToUserMessage` from the tasks-api service.
- [ ] Run `npm run build`.

### 9. Modify `BoardPageComponent.html` — inline error strip

- [ ] Open [`KanbAI-Web/src/app/features/board/board-page/board-page.component.html`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html).
- [ ] **Placement:** directly inside the populated-board branch (`@else { ... }` at line 81), **above** the `<div class="board-page__columns" cdkDropListGroup>` at line 82. This renders the strip only when columns have already loaded — on column-load failure the existing `columnLoadError` panel is shown instead and the strip is moot.
- [ ] Template shape (mirrors the `board-page__move-error` strip at lines 2-30, but with a Retry button instead of Dismiss, and NO auto-dismiss behaviour):

```html
@if (taskLoadError()) {
  <div
    class="board-page__task-load-error"
    role="alert"
  >
    <svg
      class="board-page__task-load-error-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 1.333 14.667 12.8H1.333L8 1.333Zm0 4.8v3.2h.667v-3.2H8Zm-.333 4.534v.666h1v-.666h-1Z" />
    </svg>
    <span class="board-page__task-load-error-text">{{ taskLoadError() }}</span>
    <button
      type="button"
      class="board-page__task-load-error-retry"
      [disabled]="isLoadingTasks()"
      (click)="retryLoadTasks()"
    >
      Retry
    </button>
  </div>
}
```

- [ ] **Do NOT** reuse the `board-page__move-error` class — its SCSS includes auto-dismiss affordances and `aria-live="polite"`. The task-load strip uses `role="alert"` (AC16 — matches the existing `columnLoadError` panel's pattern). The polite `role="status"` region at `board-page.component.html:32-38` already handles the hydration-success announcement via `dragAnnouncement`.
- [ ] Run `npm run build`.

### 10. `BoardPageComponent` component tests (AC32)

- [ ] Open `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts`.
- [ ] Add tests:
  - `loadColumns` resolves before `loadTasks` fires (spy order assertion).
  - `setTasks` receives the DTOs returned by `getTasksForProject` (spy call-args assertion).
  - On task-read failure, `taskLoadError` is populated with the mapped copy and the error strip renders.
  - Retry button re-issues `getTasksForProject` and clears the error on success.
  - Retry button is disabled while `isLoadingTasks()` is true.
  - On column-load failure, `loadTasks` is NOT called (no HTTP request fires for the task URL).
  - Stale hydration: `enterBoard('B')` fired mid-flight; when the 'A' response lands, `setTasks('A', ...)` no-ops (project-id guard).
- [ ] Run `npm run test -- --watch=false`.

### 11. Full build + test verification (AC33 + AC34)

- [ ] `npm run build` — zero errors, zero new warnings.
- [ ] `npm run test -- --watch=false` — zero INTRODUCED failures. Classify any remaining failures as PRE-EXISTING per [`CLAUDE.md`](../../CLAUDE.md).

### 12. Manual QA (AC35)

Run the eight flows from the context doc §"In-scope user flows":

- [ ] **Flow 1 — Cold refresh.** Create 3 tasks across 2 columns; refresh; all 3 render in the correct columns and in `taskOrder` ascending.
- [ ] **Flow 2 — Navigate away and back.** Dashboard → back to the same project → tasks appear.
- [ ] **Flow 3 — Empty project.** Create a project with two columns and no tasks; refresh; no error strip, each column shows its empty-state.
- [ ] **Flow 4 — Network failure on task load.** Throttle network / stub the GET to `500`; columns load; error strip renders with Retry; columns remain visible.
- [ ] **Flow 5 — Stale hydration.** Open project A, immediately switch to B; A's tasks do not plant onto B.
- [ ] **Flow 6 — Concurrent SignalR.** Teammate creates / moves / edits a task while the initial GET is in flight; no duplicates, no lost tasks.
- [ ] **Flow 7 — Description round-trip across refresh.** User A saves a description on task X (via the [#85](https://github.com/Gulybi/KanbAI-Web/pull/85) drawer); user B refreshes, opens X; description renders.
- [ ] **Flow 8 — Retry after transient failure.** Stub the GET to `500`; error strip appears; click Retry; stub back to `200`; strip clears, tasks render.

**Performance Considerations:**

- The hydration payload is one request per board entry — no pagination, no incremental loading. Acceptable for MVP per the context doc's "Out of scope" list.
- `setTasks` does one atomic `setState` call regardless of the task count; no per-task emissions.
- The `onTaskUpdated` handler does one `setState` per event — same cost as the existing `TaskMoved` handler.
- No new change-detection cycles beyond the two the existing `loadColumns` already triggers (one on setColumns, one on the next tick).

---

## QA Guidance

### Test Strategy

**Unit tests (service):** (AC29, AC30)
- `TasksApiService.getTasksForProject` — HTTP verb, URL, URL-encoded `projectId`, envelope unwrap for each success/failure branch, empty-array edge case. Use `HttpClientTestingModule` and mirror the existing `moveTask` / `createTask` spec structure at [`tasks-api.service.spec.ts:41-79`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts#L41-L79).
- `mapTaskListErrorToUserMessage` — one assertion per status code, verbatim string comparison. Pattern mirrors the existing `mapTaskCreateErrorToUserMessage` spec block.

**Unit tests (state):** (AC31, AC7–9)
- `setTasks` — stale-project no-op, allowed-ids filter, bucketing, sort, DTO→BoardTask projection, atomic replace.
- `onTaskUpdated` — reconcile by id, silent no-op for unknowns, null content preserved, cross-bucket reconcile (defensive).
- `onTaskCreated` post-hydration dedupe — ensure the existing id-dedupe at `appendBoardTaskIfNew:247-249` still wins.
- `onTaskMoved` pre-hydration no-op — already covered; extend to confirm subsequent `setTasks` plants the task at its post-move position.

**Component tests:** (AC32)
- `BoardPageComponent.ngOnInit` — sequencing, error strip, Retry, stale-project guard.
- Use the existing `HttpClientTestingModule` + `provideRouter` harness pattern.

**E2E tests:** not required for #87 — the eight manual QA flows cover the acceptance surface. If the team later adds Playwright coverage for the board, Flow 1 and Flow 7 are the highest-value E2E candidates.

### Mocking Instructions

```typescript
// Mock TasksApiService in BoardPageComponent tests
const tasksApiStub = {
  getTasksForProject: vi.fn().mockReturnValue(of([
    { id: 't-1', title: 'A', content: null, taskOrder: 0, columnId: 'c-1', assignedId: null, createdAt: '', updatedAt: '' },
    { id: 't-2', title: 'B', content: 'desc', taskOrder: 1, columnId: 'c-1', assignedId: null, createdAt: '', updatedAt: '' }
  ])),
  moveTask: vi.fn(),
  createTask: vi.fn()
};

TestBed.configureTestingModule({
  providers: [
    { provide: TasksApiService, useValue: tasksApiStub }
  ]
});
```

For the failure branch, flip the stub to `throwError(() => new HttpErrorResponse({ status: 500 }))` and assert `taskLoadError()` equals the verbatim AC27 string.

### Edge Cases to Test

- **Empty project** — `getTasksForProject` returns `[]`; no error strip; column empty-states render. (AC3)
- **Orphaned task** — DTO with `columnId` not in current `columns()` is dropped. (AC5, covered in `setTasks` unit tests)
- **Stale navigation** — A → B during A's GET in-flight; the 'A' response's `setTasks` no-ops. (AC6)
- **Retry loop** — two consecutive failures, then success — each failure re-populates the strip; success clears it.
- **SignalR during hydration** — dispatch `TaskCreated` for an id present in the hydration response; assert no duplicate.
- **TaskUpdated clear** — `content: null` in the event body is preserved as `null` in state (AC9).
- **401 during task-read** — the global authInterceptor will navigate to `/login`; the feature-layer string is defensive. Test asserts the string is produced but does not assert it renders to the user. (AC14)

---

## Design Validation (Self-Check)

### Interface alignment

- [x] `TaskListResponse` reuses the existing `ApiResponse<T>` envelope — no divergence from backend contract.
- [x] `TaskUpdatedEvent` mirrors `TaskCreatedEvent` structurally, consistent with `backend_api_map.md:165` which emits a `TaskResponseDto`.
- [x] `BoardTask` projection is identical to the one used by `applyCreatedTask` at `:350-357` and the one used by `reconcileServerTaskMove` at `:535-542`.

### Standards compliance

- [x] All injection via `inject()` — consistent with existing code.
- [x] Signals for component-local UI state (`taskLoadError`, `isLoadingTasks`).
- [x] RxJS for the HTTP observable, consumed with `takeUntilDestroyed`.
- [x] `ChangeDetectionStrategy.OnPush` unchanged on `BoardPageComponent`.
- [x] `ngOnInit` sequencing is explicit (columns → tasks). No race with SignalR `TaskCreated`.

### Security

- [x] No new routes to guard. `/projects/:projectId` is already protected by the existing route guard (AuthGuard).
- [x] No user input beyond the `projectId` route param — URL-encoded per existing pattern.
- [x] Error copy never exposes status codes, URLs, or stack traces (AC10, defended in `mapTaskListErrorToUserMessage`).
- [x] No `[innerHTML]` introduced. No `DomSanitizer` bypass. No new secrets.

### Completeness

- [x] Every acceptance criterion maps to a code change or a test — AC1–AC6 (hydration) → §Implementation Step 8; AC7–AC9 (SignalR) → steps 6, 7; AC10–AC14 (error/loading UX) → steps 8, 9; AC15–AC17 (a11y) → step 8 (announcement), step 9 (role="alert"), unchanged keyboard flow; AC18–AC22 (no regressions) → existing handlers untouched; AC23–AC28 (error copy) → step 3; AC29–AC32 (tests) → steps 4, 7, 10; AC33–AC35 (verification) → steps 11, 12.
- [x] Every new/modified file is listed in §"Files to Modify".
- [x] Implementation steps are in dependency order — types → services → state → component → template → tests → verification.

---

## Risks & Open Questions

1. **Backend contract divergence.** This spec assumes `GET /api/task/project/{projectId}` returning `ApiResponse<TaskResponseDto[]>`. If the backend ships a per-column endpoint (`GET /api/task/column/{columnId}` × N) or a different envelope, the developer MUST STOP and ask for clarification. Do NOT invent a URL.
2. **`TaskUpdated` handler not yet wired.** This spec adds it. If [#85](https://github.com/Gulybi/KanbAI-Web/pull/85)'s merge branch already wired it (verify before implementing), skip step 6's handler addition and subscription wiring — only the `setTasks` / `loadTasks` / error strip pieces remain. The `onTaskUpdated` unit tests in step 7 should also be skipped if they already exist.
3. **Orphaned tasks on the backend.** If the backend returns a task whose `columnId` references a column that was deleted (but the deletion didn't cascade), `setTasks`'s allowed-ids filter silently drops it. This is intentional (AC5) and matches `setColumns`'s existing behaviour for orphaned task buckets. A loud error would regress Flow 5 (stale-navigation).
4. **SignalR + hydration ordering.** The spec assumes hydration is authoritative for initial state. A `TaskCreated` SignalR event that raced the GET and landed in `tasksByColumnId` BEFORE hydration will be atomically overwritten by `setTasks`. This is fine — the hydration payload already contains that task (the backend broadcasts after the DB commit, and the GET reads the same DB). If the backend broadcasts before committing, the `setTasks` atomic replace will briefly regress a just-created card; this is acceptable because the next broadcast or the next hydration resolves it.

---

## Handoff

### Handoff to web-designer

The following visual/interaction decisions are owed to the web-designer phase before the developer implements step 9:

1. **SCSS for `.board-page__task-load-error` / `.board-page__task-load-error-icon` / `.board-page__task-load-error-text` / `.board-page__task-load-error-retry`.** Pattern should mirror the existing `.board-page__move-error` at [`board-page.component.scss`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss) but with a Retry button (primary action affordance) and without the auto-dismiss-friendly soft styling (this strip is persistent and should convey the board is in a blocked state until action is taken).
2. **In-flight render for task buckets while `isLoadingTasks()` is true.** The context doc explicitly allows "degrading to the existing empty-state render" for MVP. If the designer wants an unobtrusive skeleton instead, that's a design-spec decision — the component state `isLoadingTasks()` is exposed for template binding.
3. **ARIA role choice** — this spec recommends `role="alert"` (matching `columnLoadError` at [`board-page.component.html:45`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L45)); the designer may choose `role="status" aria-live="assertive"` instead. Either satisfies AC16.

### Handoff output

- **Tech spec file:** `docs/handoffs/issue_87_tech_spec.md` (this document).
- **Next agent:** `web-designer` — reads this spec plus [`issue_87_context.md`](./issue_87_context.md), produces `docs/handoffs/issue_87_design_spec.md` covering the error strip SCSS and any optional skeleton styling.
- **Then:** `developer` — implements per this spec + the design spec in order.

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification.*

---

## Development Status

**Implementation Date:** 2026-05-08
**Developer:** Claude Opus 4.7 (1M context)

### Files Modified

- [`KanbAI-Web/src/app/core/models/realtime-events.ts`](../../KanbAI-Web/src/app/core/models/realtime-events.ts) — added `TaskUpdated` to `REALTIME_EVENT` and `TaskUpdatedEvent` interface.
- [`KanbAI-Web/src/app/features/board/models/task.model.ts`](../../KanbAI-Web/src/app/features/board/models/task.model.ts) — added `TaskListResponse` envelope alias.
- [`KanbAI-Web/src/app/features/board/services/tasks-api.service.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts) — added `getTasksForProject(projectId)` method and `mapTaskListErrorToUserMessage` exported function (verbatim AC23–AC28 strings).
- [`KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts) — added `describe('getTasksForProject()')` and `describe('mapTaskListErrorToUserMessage()')` blocks (AC29, AC30).
- [`KanbAI-Web/src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) — added `setTasks(projectId, tasks)`, `onTaskUpdated` handler, and `TaskUpdated` subscription wiring inside the `connectionState → 'connected'` effect.
- [`KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts) — added `describe('setTasks() (issue #87)')` and `describe('onTaskUpdated handler (issue #87)')` blocks (AC31, AC7–AC9). Extended the malformed-payload suite to cover `TaskUpdated`.
- [`KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts) — added `taskLoadError` and `isLoadingTasks` signals, private `loadTasks(projectId)` method, public `retryLoadTasks()` handler; modified `loadColumns` to chain `loadTasks` on success.
- [`KanbAI-Web/src/app/features/board/board-page/board-page.component.html`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html) — added the inline task-load error strip inside the populated-board branch, above the columns container, with `role="alert"` and a Retry button.
- [`KanbAI-Web/src/app/features/board/board-page/board-page.component.scss`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss) — added SCSS for `.board-page__task-load-error`, `.board-page__task-load-error-icon`, `.board-page__task-load-error-text`, `.board-page__task-load-error-retry`, and the `board-task-load-error-in` keyframes, per design spec §3.1.
- [`KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts) — extended `BoardStateMock` / `TasksApiMock` with `setTasks` / `getTasksForProject` and added `describe('Hydrate tasks on board entry (issue #87)')` block covering sequencing, setTasks invocation, error copy, Retry, stale-navigation guard (AC32).

### Files Created

None. Everything lives in the existing board feature area per the tech spec.

### Build & Test Results

- **Build:** ✅ SUCCESS — `npm run build` completes with no errors. Warnings present are pre-existing (SCSS strict-unary deprecations on `board-page.component.scss:73,88` from the existing move-error block; budget warnings for three files — `board-page.component.scss` grew from 5.75 kB to 7.66 kB with the new strip styles, still under 8 kB).
- **Tests:** ✅ 1300 / 1300 passing. `npm run test -- --watch=false` reports zero failures on the final run.
- **Pre-existing Failures:** None at the final run. Intermittent flakiness observed in `src/app/core/services/signalr.service.spec.ts` (17 failures in one run around `mocks.state.latestBuilder` being null) — reproduced on an earlier run under concurrent Vitest load and resolved on re-run. Confirmed pre-existing via isolated `npx ng test --include='**/signalr.service.spec.ts'` → 21/21 pass. The spec file is not touched by #87 and the failures concern the SignalR mock builder state, independent of this feature.
- **Introduced Failures:** None.

### Design Spec Decisions Honoured

- `role="alert"` on the strip container (design §3.3).
- No `aria-live="assertive"` or `aria-atomic="true"` (implied by `role="alert"`).
- Strip placed inside the populated-board `@else` branch, above `.board-page__columns` (design §3.1 placement, tech §Implementation Step 9).
- No skeleton loader for task buckets in #87 (design §3.2).
- Primary-action Retry button with the same visual contract as `.board-page__empty-add`.
- No auto-dismiss; strip cleared only on successful retry or destroy.
- No spinner on Retry; disabled state is the in-flight affordance.

### Error-Copy Verbatim Strings (AC23–AC28)

Frozen and exercised by unit tests:
- Status 0 → *"We couldn't reach the server. Please check your connection and try again."*
- Status 401 → *"Your session has expired. Please sign in again."*
- Status 403 → *"You are no longer a member of this project."*
- Status 404 → *"This project no longer exists."*
- Status ≥ 500 → *"Something went wrong on our end. Please try again in a moment."*
- Default / 400 / non-Error → *"We couldn't load this board. Please try again."*

### Edge Cases for QA

- Cold refresh on a populated board — tasks render in correct columns, sorted by `taskOrder`.
- Empty project — columns render, no error strip.
- Task GET fails with 500 — strip renders above columns with Retry; columns stay visible.
- Retry on transient failure — strip clears, tasks appear on success.
- Stale navigation A → B during A's GET — A's tasks do not plant on B.
- Orphaned task (columnId not in current columns) — dropped silently.
- `TaskCreated` echo for an id already hydrated — dedupe prevents double-render (AC7).
- `TaskMoved` for an unknown id pre-hydration — silent no-op; subsequent hydration plants at the post-move position (AC8).
- `TaskUpdated` reconciles content by id; `null` preserved as cleared (AC9).
- Reduced motion: strip appears instantly, no slide.
- Mobile (< 768px): strip stacks vertically, Retry goes full-width at 44px min-height.

### Known Limitations / Notes

- **Backend dependency remains.** The implementation writes to the recommended `GET /api/task/project/{projectId}` → `ApiResponse<TaskResponseDto[]>` contract from the context doc. If the backend ships a different URL, verb, or envelope shape, `TasksApiService.getTasksForProject` needs to be adjusted to match.
- `BoardPageComponent.loadTasks` clears `taskLoadError` at the start of a retry, so the strip unmounts momentarily during an in-flight retry and re-mounts only if the retry also fails (explicit design decision, design §4 Flow B step 5).
- All focus routing post-retry falls back to document body; no specific post-retry focus anchor was requested by AC or design spec.
- The `onTaskUpdated` handler was wired in #87 (tech spec §Handoff item 2 — status was unclear at spec time). If a later ticket finds a prior wiring, this handler is idempotent and safe to leave in place.

### Notes on the Retry Button Test

Due to the design-spec-sanctioned "clear-then-populate" sequencing in `loadTasks`, the error strip unmounts the instant Retry is clicked and only re-mounts on a subsequent failure. The existing DOM-level test was adjusted to validate the template binding indirectly via the `isLoadingTasks()` signal and the `taskLoadError()` signal state; the enabled→disabled DOM flip can't be captured in a single tick since the strip is ephemeral during the retry.

*Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests.*
