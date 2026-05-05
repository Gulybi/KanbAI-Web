# Technical Specification: Visual Drag-and-Drop (Angular CDK)

**Context Document:** [issue_47_context.md](./issue_47_context.md)
**GitHub Issue:** #47
**Milestone:** #5 — Real-time UI Updates & Kanban Interaction
**Prerequisites merged:** #45 (SignalR client) · #46 (realtime → state reconciler)

---

## Overview

This spec turns the currently-empty `BoardPageComponent` at `/board/:projectId` into a functional Kanban surface with Angular CDK drag-and-drop. On entry, the smart `BoardPageComponent` fetches the project's columns via a new `ColumnsApiService` (`GET /api/column/project/{projectId}`) and publishes them to the existing `BoardStateService`. It renders a horizontal row of presentational `BoardColumnComponent`s — each hosting a CDK drop list — which in turn render presentational `TaskCardComponent`s as CDK draggables. On drop, the smart component runs an optimistic-then-HTTP sequence: mutate local state immediately via a new `applyOptimisticTaskMove(...)` method on `BoardStateService`, then call `TasksApiService.moveTask(taskId, { columnId, taskOrder })` (`PUT /api/task/{taskId}/move`); on success reconcile with the returned `TaskResponseDto`, on failure call `rollbackOptimisticTaskMove(...)` and surface a user-readable message. The existing `onTaskMoved` reconciler from #46 is **not modified** — this spec depends on its documented idempotency to absorb the echo broadcast that follows a successful self-move.

---

## Component Architecture

### Routing

**No new routes.** The existing route is reused unchanged:

| Path | Component | Guard | Source |
|------|-----------|-------|--------|
| `/board/:projectId` | `BoardPageComponent` | `authGuard` | `KanbAI-Web/src/app/app.routes.ts` lines 30–35 |

The lazy `loadComponent` entry already imports `BoardPageComponent`; this spec extends the component's template and logic but does **not** touch `app.routes.ts`.

### Component Hierarchy

**Smart container (modified):**
- `BoardPageComponent` — `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`
  - Injects `BoardStateService`, `ColumnsApiService`, `TasksApiService`, `ActivatedRoute`, `DestroyRef`.
  - Resolves `projectId` from the route and calls `boardState.enterBoard(projectId)` (unchanged #46 contract).
  - Calls `columnsApi.getColumnsForProject(projectId)` on init; pipes the result into `boardState.setColumns(...)` on success, or into a local `columnLoadError: WritableSignal<string | null>` on error.
  - Exposes a `dropListIds: Signal<string[]>` (computed from `columns()`) so every column's CDK drop list can declare every sibling in its `cdkDropListConnectedTo` input without each child having to know about its peers.
  - Handles `(taskDropped)` events bubbling up from `BoardColumnComponent` and runs the optimistic-then-HTTP sequence described in §"Drag-and-Drop Flow".
  - Keeps the existing `leaveBoard()` call in `ngOnDestroy`.
  - Wraps its top-level drag area in a `cdkDropListGroup` so CDK can auto-wire horizontal transfers across columns.

**Dumb components (new, presentational):**

- `BoardColumnComponent` — `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.ts`
  - **Inputs:**
    - `column: BoardColumn` (required) — source of name/colorCode/id.
    - `tasks: BoardTask[]` (required, default `[]`) — already-sorted bucket from parent.
    - `connectedDropListIds: string[]` (required) — the parent's full list of drop-list IDs, passed straight to `[cdkDropListConnectedTo]` so cross-column transfers work.
  - **Outputs:**
    - `taskDropped = output<CdkDragDrop<BoardTask[]>>()` — re-emits CDK's drop event verbatim; does **not** interpret it.
  - **Template contract:**
    - Root element carries `cdkDropList`, `[cdkDropListData]="tasks"`, `[cdkDropListConnectedTo]="connectedDropListIds"`, `[id]="'drop-list-' + column.id"` (stable id used by the parent's `dropListIds` selector), and `(cdkDropListDropped)="taskDropped.emit($event)"`.
    - Iterates `tasks` with `@for (task of tasks; track task.id)` and renders a `<app-task-card [task]="task" cdkDrag [cdkDragData]="task">` for each.
    - Shows the empty drop-zone affordance (design tokens `background.dropzone`, `border.dropzone`) when `tasks.length === 0` — the zone itself is a CDK drop target so cards can still be dropped into empty columns.
  - Uses `ChangeDetectionStrategy.OnPush`.
  - Contains **no** business logic, no HTTP calls, no state service injections.

- `TaskCardComponent` — `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.ts`
  - **Inputs:**
    - `task: BoardTask` (required).
  - **Outputs:** none in this ticket (no task-click, no edit — out of scope per context doc).
  - **Template contract:** renders `task.title`; if `task.content` is non-empty, renders a visual "has content" affordance (exact treatment deferred to the design spec).
  - Uses `ChangeDetectionStrategy.OnPush`.
  - Is purely presentational — receives the `BoardTask` projection and nothing else.

### CDK wiring map (conceptual — directives only, no template code)

```
BoardPageComponent.template
└── <div cdkDropListGroup>                        ← enables cross-list transfers
    └── @for (column of columns(); track column.id)
        └── <app-board-column
               [column]="column"
               [tasks]="tasksByColumnId()[column.id] ?? []"
               [connectedDropListIds]="dropListIds()"
               (taskDropped)="handleTaskDropped(column.id, $event)">

BoardColumnComponent.template
└── <section
        cdkDropList
        [cdkDropListData]="tasks"
        [cdkDropListConnectedTo]="connectedDropListIds"
        [id]="'drop-list-' + column.id"
        (cdkDropListDropped)="taskDropped.emit($event)">
    └── @for (task of tasks; track task.id)
        └── <app-task-card
               [task]="task"
               cdkDrag
               [cdkDragData]="task" />
```

`cdkDropListGroup` at the outer level is preferred over manually maintaining a `connectedDropListIds` list — both are shown above so the developer can pick the simpler option and drop the `connectedDropListIds` plumbing if CDK's auto-wiring proves sufficient. The stable `drop-list-{columnId}` DOM id remains useful for debugging and testing regardless.

### New Files to Create

- `KanbAI-Web/src/app/features/board/models/task.model.ts` — `TaskResponseDto`, `MoveTaskDto`, related envelope types.
- `KanbAI-Web/src/app/features/board/models/column.model.ts` — `ColumnResponseDto`.
- `KanbAI-Web/src/app/features/board/services/columns-api.service.ts` — `getColumnsForProject(projectId)`.
- `KanbAI-Web/src/app/features/board/services/columns-api.service.spec.ts`.
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts` — `moveTask(taskId, dto)`.
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts`.
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.html`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.spec.ts`
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.ts`
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.html`
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.scss`
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.spec.ts`

### Files to Modify

- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` — add column-fetch + drop-event orchestration; inject new services; keep existing `enterBoard` / `leaveBoard` lifecycle intact.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html` — replace empty placeholder with the `cdkDropListGroup` + `@for` column rendering.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.scss` — horizontal scroll layout per design tokens.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` — extend with drop-event unit tests (see §QA).
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` — **append** `setColumns`, `applyOptimisticTaskMove`, `rollbackOptimisticTaskMove`, `reconcileServerTaskMove` methods. **Do not change** any existing method, the reconciler contract, or the `BaseStateService` protected API surface.
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts` — add tests covering each new method (see §QA).

**Explicitly not modified:** `app.routes.ts`, `SignalRService`, `BaseStateService`, `AuthStateService`, `board-state.model.ts` (existing `BoardColumn` / `BoardTask` shape is already sufficient — DTO → projection mapping happens in the consumers).

---

## State & Data Layer

### TypeScript Interfaces

**File:** `KanbAI-Web/src/app/features/board/models/column.model.ts`

```typescript
import { ApiResponse } from '../../projects/models/project.model';

/**
 * Column shape returned by `GET /api/column/project/{projectId}` and
 * `POST /api/column/project/{projectId}`. Mirrors the backend
 * ColumnResponseDto (camelCase). Confirmed against .claude/backend_api_map.md.
 *
 * NOTE: `BoardColumn` (board-state.model.ts) is the local projection used
 * by the UI — it drops `createdAt`/`updatedAt`. A mapping helper lives
 * in the service; it is the only place those two fields are discarded.
 */
export interface ColumnResponseDto {
  id: string;
  name: string;
  colorCode: string | null;
  columnOrder: number;
  projectId: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/** Envelope alias for list endpoint. */
export type ColumnsListResponse = ApiResponse<ColumnResponseDto[]>;
```

**File:** `KanbAI-Web/src/app/features/board/models/task.model.ts`

```typescript
import { ApiResponse } from '../../projects/models/project.model';

/**
 * Task shape returned by `PUT /api/task/{taskId}/move` and
 * `POST /api/task/column/{columnId}`. Mirrors the backend
 * TaskResponseDto. Confirmed against .claude/backend_api_map.md.
 */
export interface TaskResponseDto {
  id: string;
  title: string;
  content: string | null;
  taskOrder: number;
  columnId: string;
  assignedId: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/**
 * Request body for `PUT /api/task/{taskId}/move`. Backend enforces
 * taskOrder ≥ 0 and rejects cross-project moves with 400.
 */
export interface MoveTaskDto {
  columnId: string;
  taskOrder: number;
}

/** Envelope alias for the move endpoint. */
export type TaskMoveResponse = ApiResponse<TaskResponseDto>;
```

### State Management Strategy

**Board-scope state lives in `BoardStateService`.** No additional state slice is introduced; all mutations flow through new methods that operate on existing `columns` and `tasksByColumnId` slices.

**Component-local UI state (Signals in `BoardPageComponent`):**

```typescript
// In BoardPageComponent
private readonly boardState = inject(BoardStateService);

// Read-through from the state service — already Signals, no wrapping needed.
readonly columns = this.boardState.columns;
readonly tasksByColumnId = this.boardState.tasksByColumnId;

// Computed for CDK wiring.
readonly dropListIds: Signal<string[]> = computed(() =>
  this.columns().map(c => `drop-list-${c.id}`)
);

// Local UI state — column load error, set on HTTP failure at init time.
readonly columnLoadError = signal<string | null>(null);

// Local UI state — move error, set on failed move, cleared on next drop.
readonly moveError = signal<string | null>(null);
```

**HTTP layer (RxJS):** `ColumnsApiService` and `TasksApiService` return `Observable<T>` following the same envelope-unwrap pattern used in `projects-api.service.ts` (`map` → check `response.success` → throw on failure). Subscriptions in `BoardPageComponent` use `takeUntilDestroyed(this.destroyRef)` for cleanup.

**No `toSignal()` bridging** is needed in this ticket: the columns arrive once, are pushed into the service's signal-backed state via `setColumns(...)`, and the template reads the service's existing `columns` signal. The `moveTask` response is handled imperatively in the drop callback (mutates state + surfaces error), not rendered through a signal.

### Extensions to `BoardStateService`

**All four new methods are `public` and live in `board-state.service.ts`.** They mutate existing state slices via the inherited `protected setState(...)` and `protected getState()` — the base-class contract is unchanged.

```typescript
/**
 * Replace the column list for the current board. Called by
 * BoardPageComponent after the initial GET /api/column/project/{projectId}.
 *
 * Idempotent w.r.t. concurrency: if the active project has already changed
 * (e.g. user navigated away during the in-flight request), the call is a
 * no-op — we key on `projectId` matching `currentProjectId` at mutation
 * time to avoid planting columns from a stale board onto the new one.
 *
 * Does NOT touch tasksByColumnId — any tasks already in buckets for the
 * incoming column IDs remain, any tasks in buckets whose column is no
 * longer in the list are dropped (defensive: avoids orphaned rendering).
 */
setColumns(projectId: string, columns: BoardColumn[]): void;

/**
 * Apply a drag-and-drop move to local state BEFORE the HTTP PUT returns.
 * The card must appear in the new column at the new order on the next
 * template tick; surrounding tasks whose `taskOrder` shifts are
 * renumbered locally so the rendered list is self-consistent.
 *
 * Parameters describe the move as CDK reports it:
 *   taskId        — id of the task being moved
 *   fromColumnId  — column the task was in pre-drop
 *   fromOrder     — index in that column pre-drop
 *   toColumnId    — target column (may equal fromColumnId)
 *   toOrder       — target index within toColumnId
 *
 * Returns a rollback token — the snapshot of the pre-move buckets for
 * both the source and destination columns. The caller keeps this token
 * and passes it to `rollbackOptimisticTaskMove(...)` if the server call
 * fails. This avoids a parallel "pending moves" map inside the service
 * and keeps the rollback path cheap (no order-inference needed).
 *
 * Silently no-ops if:
 *   - currentProjectId is null (user navigated away mid-drag);
 *   - the source bucket has no task with `taskId`;
 *   - fromColumnId === toColumnId AND fromOrder === toOrder (no-op drag).
 */
applyOptimisticTaskMove(
  taskId: string,
  fromColumnId: string,
  fromOrder: number,
  toColumnId: string,
  toOrder: number
): OptimisticMoveToken | null;

/**
 * Undo an optimistic move when the server rejects it. Restores the
 * exact bucket contents captured in the token.
 *
 * Silently no-ops if currentProjectId has changed since the token was
 * issued (the user navigated away — nothing to restore).
 */
rollbackOptimisticTaskMove(token: OptimisticMoveToken): void;

/**
 * Fold the server-authoritative TaskResponseDto back into state after
 * a successful move. The server may normalise `taskOrder` (e.g.
 * clamp-to-tail) — when it does, re-sort the target column's bucket
 * so the card sits at the server-confirmed position.
 *
 * Idempotent: running this after the `TaskMoved` echo broadcast has
 * already landed is a no-op, because the task is already in place.
 *
 * Safe to call with a DTO whose column is no longer known to local
 * state (a ColumnDeleted event could have arrived between drop and
 * response) — the call is then a no-op.
 */
reconcileServerTaskMove(response: TaskResponseDto): void;
```

**Supporting type — also in `board-state.model.ts` (append, do not change existing types):**

```typescript
/**
 * Rollback snapshot returned by `applyOptimisticTaskMove`. Held by the
 * caller (BoardPageComponent) until the HTTP PUT resolves. Opaque to
 * the UI — never rendered, never serialised.
 */
export interface OptimisticMoveToken {
  /** Project this token applies to — checked on rollback. */
  projectId: string;
  fromColumnId: string;
  toColumnId: string;
  /** Pre-move bucket for the source column (already sorted). */
  fromBucket: BoardTask[];
  /** Pre-move bucket for the destination column (already sorted). */
  toBucket: BoardTask[];
}
```

**Interaction with the existing `onTaskMoved` reconciler:**

The #46 reconciler at `board-state.service.ts` line 231 is intentionally left alone. Its idempotency (it filters by `id` before insert, then re-sorts by `taskOrder`) absorbs the echo broadcast that follows a successful self-move: the task is already at the server-normalised order (because `reconcileServerTaskMove` put it there), so the reconciler's "remove from old → insert into new" becomes a no-op remove and an id-deduped insert — no visible flicker. This is a key property this spec relies on; any future change to `onTaskMoved` must preserve it.

---

## Service Integration

### ColumnsApiService

**File:** `KanbAI-Web/src/app/features/board/services/columns-api.service.ts`

Mirrors the style of `ProjectsApiService`: inject `HttpClient`, use `environment.apiUrl`, unwrap the `ApiResponse<T>` envelope, throw on `success: false`. JWT is attached by the existing `authInterceptor`.

```typescript
@Injectable({ providedIn: 'root' })
export class ColumnsApiService {
  private readonly http = inject(HttpClient);
  // Backend path is singular (`/api/column`) — confirmed against
  // .claude/backend_api_map.md. Do NOT pluralise.
  private readonly apiUrl = `${environment.apiUrl}/column`;

  /**
   * GET /api/column/project/{projectId}
   * @returns ColumnResponseDto[] sorted by the backend's columnOrder.
   *          Caller is responsible for projecting to BoardColumn and
   *          re-sorting if it distrusts the server order.
   */
  getColumnsForProject(projectId: string): Observable<ColumnResponseDto[]>;
}
```

And a sibling helper:

```typescript
/**
 * Translates an HttpErrorResponse (or plain Error from envelope
 * unwrap) into a user-readable sentence. Mirrors the pattern in
 * projects-api.service.ts / members-api.service.ts — NEVER exposes
 * status codes or URLs.
 *
 * Operation: 'list' only in this ticket (create/delete column are
 * out of scope per the context doc's out-of-scope list).
 */
export function mapColumnErrorToUserMessage(
  error: unknown,
  operation: 'list'
): string;
```

**Error mapping (columns list):**

| HTTP | User copy |
|------|-----------|
| `0` (network) | "We couldn't reach the server. Please check your connection and try again." |
| `401` | "Your session has expired. Please sign in again." (also intercepted globally by `authInterceptor`) |
| `403` | "Your session has expired. Please sign in again." (the backend does not expose a membership-scoped 403 on list-columns; treat as auth) |
| `404` | "This project no longer exists." (backend collapses missing-project and not-a-member into a single 404 per the backend map) |
| `5xx` | "Something went wrong on our end. Please try again in a moment." |
| other 4xx | "We couldn't load this board. Please try again." |

### TasksApiService

**File:** `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class TasksApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/task`;

  /**
   * PUT /api/task/{taskId}/move
   * @param taskId target task id (UUID, URL-encoded)
   * @param dto    MoveTaskDto { columnId, taskOrder }
   * @returns      TaskResponseDto (full post-move task state)
   */
  moveTask(taskId: string, dto: MoveTaskDto): Observable<TaskResponseDto>;
}
```

Sibling helper:

```typescript
export type TaskMoveOperation = 'move';

/**
 * Operation-appropriate user copy for a failed task move. Specifically
 * tuned to the four acceptance-criteria error paths (403/404/400/5xx)
 * from the context doc, §"Specific error mappings the user must not
 * be surprised by".
 */
export function mapTaskMoveErrorToUserMessage(error: unknown): string;
```

**Error mapping (task move) — matches the context doc verbatim:**

| HTTP | User copy |
|------|-----------|
| `0` (network) | "We couldn't reach the server. The move was undone." |
| `401` | "Your session has expired. Please sign in again." (global interceptor) |
| `403` | "You are no longer a member of this project and cannot move tasks." |
| `404` | "That task or column no longer exists." |
| `400` | "We couldn't move that task. Please try again." (cross-project / invalid taskOrder — not normally reachable from UI) |
| `5xx` | "Something went wrong on our end. The move was undone." |
| other | "We couldn't move that task. Please try again." |

### Error surface in the UI

- **Column load error** — rendered inline in the board page's main region (a block-level message, not a toast) because the board has nothing else to show. Design spec defines the visual treatment.
- **Task move error** — rendered as a transient toast / inline status strip (exact placement is a design spec call). The message text is the verbatim string returned by `mapTaskMoveErrorToUserMessage`. The strip auto-dismisses after ~5 seconds or on the next successful move.
- **Never** log a JWT, user id, task id, or raw error payload to `console.log` (CLAUDE.md logging/privacy rule + acceptance criterion). Service error helpers log nothing themselves.

### HTTP request/response contract summary

| Method | Endpoint | Request body | Response body | Errors handled by UI |
|--------|----------|--------------|----------------|----------------------|
| GET | `/api/column/project/{projectId}` | — | `ApiResponse<ColumnResponseDto[]>` | 401, 403, 404, 5xx |
| PUT | `/api/task/{taskId}/move` | `MoveTaskDto` | `ApiResponse<TaskResponseDto>` | 400, 401, 403, 404, 5xx |

---

## Drag-and-Drop Flow

This is the heart of the ticket. A single mouse-or-keyboard-or-touch drop on a valid column triggers the following sequence. All steps run in `BoardPageComponent.handleTaskDropped(...)`; child components do not branch on drop outcomes.

### Step-by-step

1. **CDK fires `cdkDropListDropped`** on the target column's drop list. The event carries:
   - `event.previousContainer.data` — pre-move `BoardTask[]` of the source column (what the child component's `[cdkDropListData]` passed in).
   - `event.container.data` — pre-move `BoardTask[]` of the target column.
   - `event.previousIndex` — index within the source bucket.
   - `event.currentIndex` — index within the target bucket.
   - `event.item.data` — the `BoardTask` being dragged (from `[cdkDragData]`).

2. **Child emits verbatim.** `BoardColumnComponent` does not inspect the event; it re-emits `$event` on `taskDropped`. The parent's handler signature is `handleTaskDropped(targetColumnId: string, event: CdkDragDrop<BoardTask[]>)`, with `targetColumnId` bound to the column the event fired on.

3. **Parent derives the four coordinates.**
   - `taskId = event.item.data.id`
   - `fromColumnId = event.previousContainer.data[event.previousIndex]?.columnId` (the task's own `columnId` is authoritative — the child's `tasks` input is the same projection used by CDK's `cdkDropListData`).
   - `fromOrder = event.previousIndex`
   - `toColumnId = targetColumnId`
   - `toOrder = event.currentIndex`

4. **Early-exit guard — no-op drag.** If `fromColumnId === toColumnId && fromOrder === toOrder`, return immediately: no state mutation, no HTTP call. This covers "dropped on itself" and "cancelled into origin". Acceptance criterion "dropping a card back into the exact same column and order it started in results in no state change and no HTTP call" is satisfied here.

5. **Drop-outside / drag-cancelled guard.** CDK emits the event with `event.previousContainer === event.container && event.previousIndex === event.currentIndex` when the user drops outside any connected drop list or presses `Esc`. Step 4 already handles this case. No additional branching needed; the context doc's acceptance criterion for cancelled drags is satisfied by the same guard.

6. **Optimistic mutation.**
   Call `const token = boardState.applyOptimisticTaskMove(taskId, fromColumnId, fromOrder, toColumnId, toOrder)`. The state service:
   - Removes the task from the source bucket.
   - Inserts it into the target bucket at `toOrder`.
   - Recomputes `taskOrder` for every task in both affected buckets so they are sequential (0, 1, 2, …) — this matches the backend's usual normalisation and avoids gaps/duplicates while the PUT is in flight.
   - Returns the rollback `token`, or `null` if the move was rejected by a pre-condition (project changed, task not in source bucket, no-op drag). Parent treats `null` as "nothing to do, nothing to HTTP".

7. **HTTP call.**
   ```
   tasksApi.moveTask(taskId, { columnId: toColumnId, taskOrder: toOrder })
     .pipe(takeUntilDestroyed(this.destroyRef))
     .subscribe({ next: ..., error: ... });
   ```

8. **On HTTP 200.**
   - `boardState.reconcileServerTaskMove(response)` folds the authoritative DTO into state. If the server normalised `taskOrder` (say to the tail of the column), the target bucket re-sorts accordingly; otherwise the method is a cheap idempotent no-op.
   - Clear `moveError` signal if set.
   - Do **not** clear the `token` — it's a local variable that goes out of scope when the subscription completes.

9. **On HTTP error.**
   - `boardState.rollbackOptimisticTaskMove(token)` — the task snaps back to its pre-drop position, order-restored from the snapshot.
   - `this.moveError.set(mapTaskMoveErrorToUserMessage(err))` surfaces the user-facing copy.
   - Nothing is retried automatically — the user can drag again.

10. **Echo handling (#46 loop).** The server's successful `PUT` triggers a `TaskMoved` broadcast back to `project_{projectId}` — which includes this client. The existing `onTaskMoved` reconciler (frozen in this spec) runs:
    - Finds the task already in `newColumnId` (placed there by step 6, confirmed by step 8).
    - Its id-dedup filter on the destination bucket means "insert" collapses to "replace with identical content".
    - The source bucket's task is already gone (step 6 removed it).
    - Net visible effect: no change. This is the key idempotency property this spec depends on.

11. **Concurrent remote broadcast during a local drag.** If a remote `TaskMoved` arrives *while this user's drag is still mid-air* (event fires before `cdkDropListDropped`):
    - CDK's preview element is detached from the live task list — CDK maintains its own drag shadow — so reconciler mutations to `tasksByColumnId` do not disturb the shadow.
    - If the remote event targets the *same task being dragged*: the reconciler replaces that task's row in the live list, but the dragged shadow keeps moving with the cursor; on drop, the parent's `handleTaskDropped` computes `fromColumnId/fromOrder` from the *event payload* (captured at drag start) and attempts the move. If the server's truth at drop time disagrees, the PUT may return 404/400 and the normal rollback path runs. The acceptance criterion ("in-flight optimistic move takes precedence for the local user during the drag; the final reconciled state after drop matches the server's latest truth") is satisfied: the user sees their own drag, and on drop either the server accepts it (truth wins), or rejects it (rollback surfaces an error).
    - If the remote event targets a *different task*: reconciler updates its bucket, which only affects re-rendering of non-dragged cards. The dragged card's CDK shadow is unaffected. Acceptance criterion for "unrelated TaskMoved event must not visually disturb the dragged card" is satisfied.

### Sequence diagram (textual)

```
User                        BoardColumn           BoardPage              BoardState          TasksApi              Server           SignalR
 │   drag card & drop        │                      │                     │                   │                     │                │
 ├──cdkDropListDropped──────▶│                      │                     │                   │                     │                │
 │                           ├─taskDropped(evt)────▶│                     │                   │                     │                │
 │                           │                      │ no-op guard         │                   │                     │                │
 │                           │                      ├─applyOptimistic────▶│                   │                     │                │
 │                           │                      │◀──token─────────────┤                   │                     │                │
 │   (screen already updated) │                     │                     │                   │                     │                │
 │                           │                      ├─moveTask(PUT)───────┼──────────────────▶│                     │                │
 │                           │                      │                     │                   ├─PUT /api/task/../move▶│                │
 │                           │                      │                     │                   │◀──200 TaskResponse──┤                │
 │                           │                      │◀────TaskResponse────┤                   │                     │                │
 │                           │                      ├─reconcileServerMove▶│                   │                     │                │
 │                           │                      │                     │                   │                     │                │
 │                           │                      │                     │                   │                     ├─TaskMoved──────▶│
 │                           │                      │◀─event subscription─┤                   │                     │                │
 │                           │                      ├─onTaskMoved (idempot)▶│                 │                     │                │
 │                           │                      │ no visible change   │                   │                     │                │
```

Failure branch replaces `reconcileServerTaskMove(...)` with `rollbackOptimisticTaskMove(token)` + `moveError.set(...)`, and no broadcast is emitted.

---

## Implementation Steps

Follow in order — later steps depend on types/services from earlier ones.

### 1. Type definitions
- [ ] Create `KanbAI-Web/src/app/features/board/models/column.model.ts` with `ColumnResponseDto` and `ColumnsListResponse` alias.
- [ ] Create `KanbAI-Web/src/app/features/board/models/task.model.ts` with `TaskResponseDto`, `MoveTaskDto`, `TaskMoveResponse` alias.
- [ ] Append `OptimisticMoveToken` interface to `KanbAI-Web/src/app/features/board/state/board-state.model.ts`. Do **not** modify existing `BoardColumn`, `BoardTask`, `BoardState`, or `INITIAL_BOARD_STATE`.

### 2. API services
- [ ] Generate: `ng generate service features/board/services/columns-api --project KanbAI-Web` (skip-tests=false). Implement `getColumnsForProject(projectId)` per the signature in §"Service Integration". Export `mapColumnErrorToUserMessage` alongside.
- [ ] Generate: `ng generate service features/board/services/tasks-api --project KanbAI-Web` (skip-tests=false). Implement `moveTask(taskId, dto)` per the signature. Export `mapTaskMoveErrorToUserMessage`.
- [ ] Use `encodeURIComponent(id)` on every path parameter, matching `ProjectsApiService.updateProject`.
- [ ] Unit-test both services against `HttpClientTestingModule` — see §QA.

### 3. Extend `BoardStateService`
- [ ] Import `TaskResponseDto` and `OptimisticMoveToken`.
- [ ] Add `setColumns(projectId, columns)` — guard on `projectId === this.getState().currentProjectId`, then `this.setState({ columns: [...columns].sort((a, b) => a.columnOrder - b.columnOrder) })`. Purge `tasksByColumnId` entries whose key is no longer in the incoming column set.
- [ ] Add `applyOptimisticTaskMove(taskId, fromColumnId, fromOrder, toColumnId, toOrder)` — capture source & destination bucket snapshots, splice, renumber, `setState`, return the token. Return `null` on the three no-op preconditions.
- [ ] Add `rollbackOptimisticTaskMove(token)` — guard on `token.projectId === currentProjectId`, then `setState` the saved buckets back.
- [ ] Add `reconcileServerTaskMove(response)` — find the bucket whose `id === response.columnId`, replace/insert the matching task, re-sort by `taskOrder`. Handle the edge case where the server's `columnId` differs from the column the optimistic move placed it in (rare but allowed: the user clicks "move to Done" and the server sends back an even different column because of a rename race — treat the server as truth).
- [ ] Do **not** touch `onColumnCreated`, `onColumnDeleted`, `onTaskCreated`, `onTaskMoved`, `enterBoard`, `leaveBoard`, or the constructor's effect.

### 4. Presentational components
- [ ] Generate: `ng generate component features/board/components/task-card --project KanbAI-Web --skip-tests=false`. Declare `task` input (required, typed `BoardTask`), no outputs, `OnPush`.
- [ ] Generate: `ng generate component features/board/components/board-column --project KanbAI-Web --skip-tests=false`. Import `DragDropModule` from `@angular/cdk/drag-drop` in the component's `imports: [...]` array. Declare `column`, `tasks`, `connectedDropListIds` inputs and `taskDropped` output per the contract. Template wires `cdkDropList`, `[id]`, `[cdkDropListData]`, `[cdkDropListConnectedTo]`, `(cdkDropListDropped)`. Render child `<app-task-card cdkDrag [cdkDragData]="task">` inside an `@for (... ; track task.id)`. `OnPush`.

### 5. Smart container wiring
- [ ] Modify `BoardPageComponent` to inject `ColumnsApiService`, `TasksApiService`, `DestroyRef`.
- [ ] On `ngOnInit`, after `boardState.enterBoard(projectId)`, call `columnsApi.getColumnsForProject(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(...)`. On success, map `ColumnResponseDto[] → BoardColumn[]` (drop `createdAt`/`updatedAt`) and call `boardState.setColumns(projectId, mapped)`. On error, `this.columnLoadError.set(mapColumnErrorToUserMessage(err, 'list'))`.
- [ ] Add `dropListIds` computed, `columnLoadError` and `moveError` signals.
- [ ] Add `handleTaskDropped(targetColumnId, event)` following the 11-step flow above.
- [ ] Import `DragDropModule` in the component's `imports: [...]` array so `cdkDropListGroup` is available on the wrapper element.
- [ ] Replace the empty template with the structure shown in §"CDK wiring map". Render `@if (columnLoadError()) { ... }` for the error state; render `@if (moveError()) { ... }` for the move error; render the `cdkDropListGroup` branch otherwise.
- [ ] Preserve `ngOnDestroy` → `boardState.leaveBoard()`.

### 6. Design tokens integration (handoff point to design spec)
- [ ] Consume `kanbanColumnWidth: 300px` and `kanbanColumnGap: 24px` in the board-page SCSS for the horizontal layout.
- [ ] Consume `shadow.cardDragging` and `background.cardDragging` in the task-card `.cdk-drag-preview` / `.cdk-drag-dragging` class hooks.
- [ ] Consume `background.dropzone` and `border.dropzone` in the board-column empty-state class.
- [ ] Do **not** invent new tokens or new colors. The design spec will supply the exact SCSS — the developer inlines it verbatim.

### 7. Accessibility verification
- [ ] Every `<app-task-card>` renders an element with the task's title as either its visible text or an `aria-label` so screen readers can announce it.
- [ ] Every `<app-board-column>` renders a column header with the column's name as its accessible name.
- [ ] Verify keyboard drag works: `Tab` to focus a card, `Space` to pick up, arrow keys to move, `Space` to drop, `Esc` to cancel. This is CDK's default behavior — no custom key handlers should be added.
- [ ] Verify a focus ring is visible on the focused card before pick-up (the design spec defines the exact ring).

### 8. Error handling & rollback
- [ ] Wire `mapTaskMoveErrorToUserMessage` into `handleTaskDropped`'s error branch.
- [ ] Verify that `moveError` auto-clears on the next successful move (clear inside the `next:` branch of `moveTask`).
- [ ] Verify that `columnLoadError` is only settable on init — no retry button in this ticket, user navigates back to dashboard per the context doc.

### 9. Build & test gate
- [ ] `cd KanbAI-Web && npm run build` — must succeed. Report file path + line number for any failure.
- [ ] `cd KanbAI-Web && npm run test -- --watch=false` — classify failures PRE-EXISTING vs INTRODUCED per CLAUDE.md. Fix all INTRODUCED before completion.

### 10. Final checklist
- [ ] No `console.log` calls in any code touched by this ticket (logging/privacy rule).
- [ ] Every new injection uses `inject(...)`, not constructor DI.
- [ ] Every new component declares `ChangeDetectionStrategy.OnPush`.
- [ ] `@for (... ; track x.id)` used everywhere — no trackBy function needed for the new template-syntax `@for`.
- [ ] All long-lived subscriptions use `takeUntilDestroyed(this.destroyRef)`.
- [ ] Update this tech spec with a "Development Status" section on merge (per CLAUDE.md §"File Modification Protocol").

---

## QA Guidance

### Unit tests — `BoardStateService` (the new methods only)

Add to `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts`:

- **`setColumns`:**
  - When `projectId` matches `currentProjectId`, columns are stored sorted by `columnOrder`.
  - When `projectId` does NOT match `currentProjectId` (stale response), the call is a no-op.
  - When setting columns replaces a list that had a column with tasks in `tasksByColumnId`, the tasks for columns not in the new list are dropped.

- **`applyOptimisticTaskMove`:**
  - Within-column reorder (move task from index 2 to index 0) mutates the single bucket, returns a token, and renumbers `taskOrder` sequentially.
  - Cross-column move mutates both buckets, returns a token with both pre-move snapshots, renumbers both.
  - No-op (same column, same order) returns `null` and does not mutate state.
  - Unknown `taskId` returns `null`.
  - `currentProjectId === null` returns `null`.

- **`rollbackOptimisticTaskMove`:**
  - After an apply + rollback, `tasksByColumnId` equals the pre-apply value exactly (deep equal).
  - Rollback with a stale `token.projectId` (user navigated boards) is a no-op.

- **`reconcileServerTaskMove`:**
  - When the server's DTO matches the optimistic state exactly, state is unchanged (no re-sort needed, stable reference ideally preserved — acceptable if a new reference is emitted).
  - When the server normalised `taskOrder` to a different value, the task re-settles to the server's position on re-sort.
  - When the server's `columnId` is not in state (ColumnDeleted race), the call is a no-op.

- **Echo idempotency regression test (uses the frozen `onTaskMoved`):**
  - Seed: task `T` in column `A` order 0.
  - Apply optimistic move T → column B order 0. Reconcile server response (B, 0).
  - Dispatch a `TaskMoved` event with `oldColumnId: A, newColumnId: B, task: { ..., columnId: B, taskOrder: 0 }`.
  - Assert: no duplicate of T in either bucket; T is present exactly once in B at order 0; no exception thrown.

### Unit tests — API services

Use `HttpClientTestingModule` + `HttpTestingController` (mirror the style of `projects-api.service.spec.ts`):

- **`ColumnsApiService.getColumnsForProject`:**
  - Calls `GET {apiUrl}/column/project/{projectId}` with the projectId URL-encoded.
  - Emits the `data` array on `success: true`.
  - Throws `Error` with message from `errors[0]` on `success: false` envelope.
  - Propagates `HttpErrorResponse` on non-2xx HTTP.

- **`TasksApiService.moveTask`:**
  - Calls `PUT {apiUrl}/task/{taskId}/move` with `{ columnId, taskOrder }` as the body and the taskId URL-encoded.
  - Emits `TaskResponseDto` on success.
  - Propagates error paths identically.

- **Error helpers (`mapColumnErrorToUserMessage`, `mapTaskMoveErrorToUserMessage`):**
  - Table-driven tests — one row per status code in the error-mapping tables above, asserting the exact expected user copy. This prevents drift from the context doc's acceptance criteria.

### Integration tests — `BoardPageComponent` drop flow

Use `TestBed` with the real `BoardStateService` and mocked `ColumnsApiService` / `TasksApiService`:

- **Initial columns render:** Mock `getColumnsForProject` to return 3 columns. Assert `columns()` signal has length 3 after subscribe fires.
- **Column load failure:** Mock `getColumnsForProject` to error with a 404 `HttpErrorResponse`. Assert `columnLoadError()` is the mapped copy "This project no longer exists.".
- **Successful drop calls HTTP with correct payload:** Dispatch a synthetic `CdkDragDrop` (construct the event object directly — CDK exposes the type). Assert `tasksApi.moveTask` was called with `(taskId, { columnId: targetColumnId, taskOrder: targetIndex })`.
- **Successful drop reconciles server response:** Mock `moveTask` to return a DTO with `taskOrder: 5` (normalised). Assert the task sits at the position matching `taskOrder: 5` in its target bucket after the subscription completes.
- **Failed drop rolls back + surfaces error:** Mock `moveTask` to error with 403. Assert: (a) `tasksByColumnId()` equals the pre-drop snapshot; (b) `moveError()` equals "You are no longer a member of this project and cannot move tasks.".
- **No-op drop short-circuits:** Dispatch a drop with `previousContainer === container` and `previousIndex === currentIndex`. Assert `moveTask` was NOT called and `tasksByColumnId()` is unchanged.

### Manual E2E matrix (from the acceptance criteria)

Tested against a running backend with two browser sessions where noted.

| # | Scenario | Pass condition |
|---|----------|----------------|
| 1 | Within-column reorder | Card moves optimistically; `PUT /api/task/.../move` fires in DevTools with correct columnId/taskOrder; card stays at new position after 200. |
| 2 | Cross-column move | Card crosses columns optimistically; PUT fires; stays in target. |
| 3 | Drop on empty column | Card lands in the empty drop zone; PUT fires with `taskOrder: 0`. |
| 4 | No-op drag to origin | No PUT fires; no visible change. |
| 5 | Cancelled drag (`Esc` or outside) | Card returns; no PUT; no error. |
| 6 | Failed move (token revoked → 401) | Card rolls back; error toast shown; DevTools shows the 401 response. |
| 7 | Echo broadcast | After step 1 or 2, DevTools WebSocket shows the `TaskMoved` frame but no visible re-layout or duplicate. |
| 8 | Remote broadcast, no local drag | User B drags → card moves on User A's board within 2 s (#46 behaviour, no regression). |
| 9 | Remote broadcast during local drag, different task | User A's dragged card keeps following the cursor; unrelated card updates in the background. |
| 10 | Keyboard drag | `Tab` → `Space` → arrows → `Space`. PUT fires identically to the mouse path. |
| 11 | Touch drag | Press-and-hold on a touchscreen moves the card; short tap does not initiate a drag. |
| 12 | Column fetch fails | Board shows the mapped error, no uncaught console error, user can navigate back to dashboard. |
| 13 | Console hygiene | All above scenarios produce zero uncaught console errors and log no JWT / task-id / raw payload. |

### Mocking primer

```typescript
// Mock TasksApiService in component tests
const mockTasksApi = {
  moveTask: vi.fn().mockReturnValue(of({
    id: 't1', title: 'x', content: null,
    taskOrder: 0, columnId: 'colB', assignedId: null,
    createdAt: '2026-05-04T00:00:00Z', updatedAt: '2026-05-04T00:00:00Z'
  } satisfies TaskResponseDto))
};

TestBed.configureTestingModule({
  providers: [
    { provide: TasksApiService, useValue: mockTasksApi }
  ]
});
```

---

## Design Validation Self-Check

- [x] DTO interfaces (`ColumnResponseDto`, `TaskResponseDto`, `MoveTaskDto`) match the backend map exactly (camelCase, nullable fields preserved, ISO-8601 strings).
- [x] `BoardColumn` / `BoardTask` projections unchanged — existing code continues to work.
- [x] `inject()` used everywhere, no constructor DI.
- [x] Signals for UI state, RxJS for HTTP, no unnecessary `toSignal()` bridging.
- [x] `OnPush` on every new component.
- [x] Route still guarded by `authGuard` (inherited — no change).
- [x] No new secret or sensitive log lines introduced.
- [x] New files listed; modified files listed; explicitly-not-modified files listed.
- [x] Acceptance criteria from context doc all addressed (enumerated in §QA manual matrix).
- [x] Existing `onTaskMoved` reconciler is frozen — depended on, not modified.

---

*"The technical specification is saved. You can now instruct the web-designer agent to create the design specification."*

---

## Development Status

**Date:** 2026-05-04
**Branch:** `47-visual-drag-and-drop-on-the-kanban-board`
**Build verdict:** `npm run build` succeeds.
**Test verdict:** `npm run test -- --watch=false` — 735 of 735 collected tests pass. One pre-existing suite (`src/app/core/services/signalr.service.spec.ts`) fails to import because `vi.mock('@microsoft/signalr', ...)` throws `"Cannot read properties of undefined (reading 'trim')"` on this Node/Vitest/Vite tooling combo. Verified as **PRE-EXISTING** by running the identical suite with the branch changes stashed — same single import failure, same count of 4 task-card test failures (both were on untracked files `git stash` could not remove). After fixing the four introduced task-card failures (see below) the pre-existing signalr suite failure is the only remaining red row.

### Files created

- `KanbAI-Web/src/app/features/board/models/column.model.ts`
- `KanbAI-Web/src/app/features/board/models/task.model.ts`
- `KanbAI-Web/src/app/features/board/services/columns-api.service.ts`
- `KanbAI-Web/src/app/features/board/services/columns-api.service.spec.ts`
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts`
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.html`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.spec.ts`
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.ts`
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.html`
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.scss`
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.spec.ts`

### Files modified

- `KanbAI-Web/src/app/features/board/state/board-state.model.ts` — appended `OptimisticMoveToken`. Existing `BoardColumn`, `BoardTask`, `BoardState`, `INITIAL_BOARD_STATE` untouched.
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` — appended four public methods (`setColumns`, `applyOptimisticTaskMove`, `rollbackOptimisticTaskMove`, `reconcileServerTaskMove`) plus a single added import. `onTaskMoved` and all other existing methods are unchanged.
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts` — appended tests for the four new methods and an echo-idempotency regression test using the frozen `onTaskMoved`.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` — smart-container wiring: column fetch, drop handler, rollback-trigger signals, aria-live announcement signal. Preserves existing `enterBoard` / `leaveBoard` lifecycle.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html` — replaced placeholder with the `cdkDropListGroup` + `@for` structure, inline move-error strip, load-error panel, and visually-hidden aria-live region.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.scss` — replaced reserved skeleton block with the SCSS from design spec §3.1 (verbatim).
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` — rewrote tests to cover the new lifecycle + drop orchestration paths; pre-existing placeholder tests removed (their assertions were against the Tailwind placeholder template that this ticket replaces).

**Explicitly unchanged:** `app.routes.ts`, `SignalRService`, `BaseStateService`, `AuthStateService`, and every existing method on `BoardStateService` (notably `onTaskMoved`).

### Deviations from spec

- **Task-card spec test harness** — The design spec's template example shows `rolledBack: WritableSignal<boolean>` "toggled via brief input binding". Implementation uses an `input<number>('rollbackTrigger')` counter plus an internal signal — the parent bumps the counter to request a shake, the component plays and self-clears. This is faithful to the spec's *intent* (parent-driven, auto-clearing shake); the exact choice of a counter over a boolean is an implementation detail that keeps repeated rollbacks of the same card re-playable.
- **Microtask-deferred shake activation** — The task card's shake `set(true)` is scheduled via `queueMicrotask` rather than called synchronously inside the effect. Without this deferral, Angular 21 dev-mode emits `ExpressionChangedAfterItHasBeenCheckedError` when the rollback trigger input changes inside the same change-detection pass. Not a functional change — the shake still plays one frame later and self-clears after `$motion-base` — but worth flagging for the reviewer.
- **`TaskCardComponent` spec uses `fixture.componentRef.setInput(...)`** — rather than a wrapping host component with plain-property inputs. Signal inputs were not picking up host-property reassignments reliably under `vi.useFakeTimers`; using `setInput` is the canonical Angular-21 pattern for driving signal inputs in tests.

### Open questions for the reviewer

1. **NG8102 template warning on `tasksByColumnId()[column.id] ?? []`** — the tech spec dictates this exact template line; TS sees `Record<string, BoardTask[]>` as always-defined so the `??` is flagged redundant. Left verbatim per the tech-spec rule. If the reviewer prefers warning-clean output, remove the `?? []`.
2. **Sass `strict-unary` deprecation warnings** — the design spec §3.1 has `margin: -$space-xxs -$space-xs -$space-xxs 0;` which Sass parses as binary subtraction. Copied verbatim. The design spec is the authoritative source per the brief; if we want the Sass 2.x migration to land clean, a follow-up ticket should wrap these unary negations in parens.

### Verification — acceptance-criteria coverage

All twelve "Specific error mappings the user must not be surprised by" and acceptance criteria from the context doc are covered in unit tests:
- Initial column render + projection — `BoardPageComponent` spec "Initial column render".
- Column fetch failure → block error — `BoardPageComponent` spec "renders the block-level error panel when the column fetch fails".
- Optimistic move + HTTP orchestration — `BoardPageComponent` spec "Drop orchestration" block.
- Rollback with verbatim error copy — `BoardPageComponent` spec "on HTTP failure, rolls back + surfaces verbatim error copy".
- No-op drag short-circuit — `BoardPageComponent` spec "no-op drag back to origin does NOT call moveTask".
- Echo idempotency — `BoardStateService` spec "Echo idempotency with onTaskMoved".
- Error helper mappings — `ColumnsApiService` and `TasksApiService` specs' table-driven `mapXErrorToUserMessage` suites.
- `aria-live` announcement wiring — `BoardPageComponent` spec "updates the dragAnnouncement signal".

*"Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests."*
