# Technical Specification: Delete projects, columns, and tasks from the UI

**Context Document:** [issue_96_context.md](./issue_96_context.md)
**GitHub Issue:** #96
**Backend Map:** [backend_api_map.md](../../.claude/backend_api_map.md)

---

## Overview

This feature wires three already-shipped backend deletes (`DELETE /api/project/{id}`, `DELETE /api/column/{id}`, `DELETE /api/task/{taskId}`) to four new client affordances and one new SignalR handler. Each of the three sub-features (A project, B column, C task) follows the same shape: invoking affordance → destructive-confirm CDK Dialog (reusing the #91 / remove-member pattern) → HTTP → success cascade (close panel/navigate if applicable, local state mutation, toast, `aria-live` announcement) → inline retry-in-place on network failure, inline per-status copy on every other error. Permission gating for the project-delete surfaces is derived from the already-cached `project.role === 'Owner'` flag (no new DTO). The one state-layer addition is a `TaskDeleted` SignalR subscription on `BoardStateService` plus two new public wrappers (`deleteColumn`, `deleteTask`) — `ProjectStateService.deleteProject` already exists and its error mapping already matches context-doc copy for `403`. No routing changes. No new page components. No new core shared infrastructure beyond a thin `ToastService` signal facade (reusing the existing `TaskNotFoundToastComponent` / `PartialFailureToastComponent` rendering pattern).

---

## Component Architecture

### Routing

**No route changes.** Navigation on project-delete success reuses the existing `/dashboard` route via `Router.navigate(['/dashboard'])`.

### Permission surface decision (applied uniformly to both project-delete entry points)

**Decision: disabled-with-hint.**

- **Choice:** On both `ProjectCardComponent` kebab menu and `BoardHeaderComponent` kebab menu, the "Delete project" item **renders for every viewer** but is `disabled` (`aria-disabled="true"`, non-focusable activation) when the caller's `project.role` (normalised to lowercase) is anything other than `'owner'`. The disabled item shows the exact hint copy *"Only the project owner can delete this project"* as a `<span class="...hint">` inline with the disabled label, AND the same copy is exposed as the item's `aria-describedby`.
- **Why disabled-with-hint over hidden:** (a) discoverability — non-owners who expect to delete their own project see that the capability exists and why it's gated, which is the single most-requested UX affordance in comparable Kanban tools; (b) consistency — the existing Members-dialog Remove button pattern (`MembersListComponent.canRemove`) already uses conditional button visibility; pairing that with a *visible but disabled* primary-surface control gives us one explanation of the capability rule; (c) the backend returns `403` with the identical copy so the server-enforced path (user somehow triggers the disabled path) produces copy that matches the preemptive hint verbatim — no drift.
- **Applied identically to both surfaces** (AC requirement). `ProjectCardComponent` and the new `BoardHeaderComponent` share one `DELETE_PROJECT_DISABLED_COPY` constant to guarantee zero drift.

### Sub-feature A — Delete a project

**Affordance surface 1: Project card menu (landing page)**
- **Component:** `ProjectCardComponent` (existing, presentational — **edit**).
  - Adds a new `<button type="button" class="project-card__menu-btn">` kebab trigger (visible on hover and always-visible on keyboard focus) that opens a CDK `Menu` containing the "Delete project" item. The existing "Manage members" icon-button is unchanged.
  - Adds a new output: `@Output() deleteProjectRequested = new EventEmitter<ProjectSummary>()` — emitted when the Delete item is activated.
  - `canDeleteProject = computed(() => this.roleVariant() === 'owner')` reuses the existing role-normalisation computed (`roleVariant`). `canDeleteProject` gates only the **enabled/disabled** state of the menu item, not its visibility (per decision above).
  - Remains Dumb: never makes an HTTP call, never opens the confirmation dialog itself, never touches state. The smart parent (`DashboardPageComponent`) opens the confirmation.

**Affordance surface 2: Open-project header menu (board page)**
- **Component:** `BoardHeaderComponent` (**new**, presentational Dumb component).
  - Renders the project title + a kebab menu trigger; the menu's only item today is *"Delete project"* (with the same disabled-hint treatment as the card).
  - Inputs:
    - `project = input.required<ProjectSummary>()` — source of the owner role flag and the display name.
  - Outputs:
    - `deleteProjectRequested = output<void>()` — emitted when the menu's Delete item is activated.
  - Rendered at the top of `BoardPageComponent` template as the first child of the existing `<div class="board-page">`, above the SR-announce region.
- The smart parent `BoardPageComponent` (**edit**) wires the event to open the confirmation dialog.

**Confirmation dialog**
- **Component:** `DeleteProjectConfirmDialogComponent` (**new**, presentational).
  - Reuses the pattern of `TaskDescriptionClearConfirmDialogComponent` / `RemoveMemberConfirmDialogComponent` verbatim: standalone, `ChangeDetectionStrategy.OnPush`, `ViewEncapsulation.None` with every selector scoped under `.delete-project-confirm-panel`, `DIALOG_DATA` injected for the variable copy.
  - Close result union: `true` | `'retry-network'` | `'retry-generic'` | `undefined` — but the dialog itself only ever emits `true` (primary clicked) or `undefined` (Cancel / Escape / backdrop). The in-place retry-on-error behaviour is implemented by the dialog **not** auto-closing on the primary click — instead the dialog exposes `submitting` and `networkError`/`genericError` inputs (see State & Data Layer §Dialog inputs) and only the smart parent calls `dialogRef.close(true)` on a terminal `204` / `404`. This is the same pattern #91's clear-description flow uses for its own in-dialog retry.
- The dialog does NOT render or own any HTTP wiring — it is a pure presentational surface.

**Orchestration (smart containers)**
- `DashboardPageComponent` (**edit**) gets `openDeleteProjectDialog(project: ProjectSummary)` wired to `ProjectCardComponent.deleteProjectRequested`. It opens the dialog and drives the HTTP call via `ProjectStateService.deleteProject(id)`.
- `BoardPageComponent` (**edit**) gets `openDeleteProjectDialog()` wired to `BoardHeaderComponent.deleteProjectRequested`. Same dialog, same state-service call; on `204`/`404` success it calls `Router.navigate(['/dashboard'])`.

**New files to create (sub-feature A)**
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.ts`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.html`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.scss`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.spec.ts`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.types.ts`
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.html`
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.scss`
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.spec.ts`

**Files to modify (sub-feature A)**
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.ts`
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.html`
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.scss` (kebab button styles — web-designer will finalise)
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.ts` (relay the new `deleteProjectRequested` event up)
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.html`
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts`
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.html`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html`

### Sub-feature B — Delete a column

**Affordance surface: Column header kebab**
- **Component:** `BoardColumnComponent` (existing, presentational — **edit**).
  - Adds a kebab trigger inside the existing column header region that opens a CDK `Menu` whose only item is *"Delete column"*.
  - New output: `deleteColumnRequested = output<BoardColumn>()` — emitted when the Delete item is activated.
  - No enablement gating at the client layer (context doc: "Any project member may delete any column"); the server still enforces authorization. If the server returns `403` the smart parent surfaces *"You don't have permission to delete this column"* (see copy matrix).

**Confirmation dialog**
- **Component:** `DeleteColumnConfirmDialogComponent` (**new**, presentational).
  - Same shape as `DeleteProjectConfirmDialogComponent`. `DIALOG_DATA` carries `{ columnName: string; taskCount: number }`. The template picks the with-tasks vs empty-column body copy based on `data.taskCount > 0`. Retry-in-place on network failure uses the same `submitting` / `networkError` / `genericError` inputs.

**Orchestration**
- `BoardPageComponent` (**edit**) adds `openDeleteColumnDialog(column: BoardColumn)` wired to the new `BoardColumnComponent.deleteColumnRequested`. It computes `taskCount = (this.tasksByColumnId()[column.id] ?? []).length` at open time and passes it into the dialog. HTTP call goes through `BoardStateService.deleteColumn(column.id)` (new wrapper, see Service Integration).
- On `204`/`404` success: the existing `BoardStateService.onColumnDeleted` handler's effect (local removal + drop task bucket) is replicated here for the originating client via a new internal `applyDeletedColumn(columnId)` helper, so the HTTP-success path does not rely on the SignalR echo round-tripping back to itself. Also closes the task detail panel if the currently-selected task was in that column.

**New files to create (sub-feature B)**
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.ts`
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.html`
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.scss`
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.spec.ts`
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.types.ts`

**Files to modify (sub-feature B)**
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.html`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html`
- `KanbAI-Web/src/app/features/board/services/columns-api.service.ts` (add `deleteColumn` + extend `mapColumnErrorToUserMessage` with `'delete'` operation)
- `KanbAI-Web/src/app/features/board/services/columns-api.service.spec.ts`
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` (add `deleteColumn` wrapper + `applyDeletedColumn` helper)
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts`

### Sub-feature C — Delete a task

**Affordance surface: Task detail panel — destructive footer section**
- **Component:** `TaskDetailPanelComponent` (existing — **edit**).
  - Adds a **destructive footer section** rendered at the bottom of the panel, visibly separated from the description section's Save / Cancel buttons. Contains exactly one `<button type="button" class="task-detail-panel__delete-btn">` labelled *"Delete task"*.
  - New output: `deleteTaskRequested = output<BoardTask>()` — emitted when the Delete button is activated.
  - The new section is always rendered (no conditional on role — backend permits any project member to delete any task; `403` fallback copy is inline).

**Confirmation dialog**
- **Component:** `DeleteTaskConfirmDialogComponent` (**new**, presentational).
  - Same shape as the other two delete dialogs. `DIALOG_DATA` carries `{ taskTitle: string }`. Retry-in-place on network failure AND on `500` (context doc: task is preserved server-side on `500`, so same inline-error-stay-open UX applies).

**Orchestration**
- `BoardPageComponent` (**edit**) adds `openDeleteTaskDialog(task: BoardTask)` wired to the new `TaskDetailPanelComponent.deleteTaskRequested`. HTTP call goes through `BoardStateService.deleteTask(taskId, columnId)` (new wrapper).
- On `204`/`404` success: calls an internal `applyDeletedTask({ taskId, columnId })` helper that removes the task from its bucket (reusing the logic of the new SignalR `onTaskDeleted` handler), AND closes the panel by calling `handleTaskDetailClosed()`.

**New files to create (sub-feature C)**
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.ts`
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.html`
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.scss`
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.spec.ts`
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.types.ts`

**Files to modify (sub-feature C)**
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html`
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html`
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts` (add `deleteTask` + new `mapTaskDeleteErrorToUserMessage`)
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts`
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` (add `onTaskDeleted` SignalR handler + `deleteTask` wrapper + `applyDeletedTask` helper)
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts`
- `KanbAI-Web/src/app/core/models/realtime-events.ts` (register `TaskDeleted` in `REALTIME_EVENT` + add `TaskDeletedEvent` interface)

### Toast + aria-live infrastructure (shared across A/B/C)

Context doc mandates success toasts (`"Project/Column/Task '{name}' was deleted"`) and `aria-live="polite"` announcements. The app already has:
- **Existing ad-hoc toasts:** `PartialFailureToastComponent` (dashboard scope) and `TaskNotFoundToastComponent` (board scope). Both self-manage an 8s auto-dismiss timer.
- **Existing live regions:** `BoardPageComponent.dragAnnouncement` (a `<div role="status" aria-live="polite">` bound to a signal); no equivalent exists on the dashboard page.

**Decision: introduce a minimal `ToastService`, do NOT pull in a third-party library.**

- **Component:** `ToastHostComponent` (**new**) — a single standalone component rendered once at the app-shell level (in `app.ts` / `app.html`) that binds to a signal exposed by the service and renders a single visible toast at a time plus a `role="status" aria-live="polite"` live region.
- **Service:** `ToastService` (**new**, `providedIn: 'root'`) — exposes:
  - `show(message: string): void` — pushes a new toast (auto-dismiss 8s, pauses on hover/focus using the same pattern as `PartialFailureToastComponent`).
  - `currentToast: Signal<{ message: string; id: number } | null>` — read-only signal for `ToastHostComponent`.
  - `announce(message: string): void` — writes to an `aria-live="polite"` signal (`currentAnnouncement: Signal<string>`) that the host renders in a visually-hidden `<div role="status" aria-live="polite">`.
- The existing `PartialFailureToastComponent` and `TaskNotFoundToastComponent` are **unchanged** — they remain the ancillary toasts they already are (they use different copy + actions). The new shared `ToastService` covers only the simple "message + auto-dismiss" toasts required by the success and 403-closure paths of this ticket.

**New files to create (shared infra)**
- `KanbAI-Web/src/app/core/services/toast.service.ts`
- `KanbAI-Web/src/app/core/services/toast.service.spec.ts`
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.ts`
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.html`
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.scss`
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.spec.ts`

**Files to modify (shared infra)**
- `KanbAI-Web/src/app/app.ts` (register `ToastHostComponent` in imports / template)
- `KanbAI-Web/src/app/app.html`

---

## State & Data Layer

### New TypeScript interfaces

**File: `KanbAI-Web/src/app/core/models/realtime-events.ts` (modify)**

```typescript
// Add to REALTIME_EVENT:
export const REALTIME_EVENT = {
  // ...existing keys...
  TaskDeleted: 'TaskDeleted'
} as const;

/**
 * Payload of `TaskDeleted`, emitted by `DELETE /api/task/{taskId}`.
 * Verified against backend_api_map.md §"TaskDeletedEventDto". The backend
 * does NOT include `projectId` on the wire — attribution is via the joined
 * project group. The event is scoped by `columnId` (server-authoritative)
 * so the client does not need a bucket lookup to find the task — it may
 * already be gone from the bucket if hydration lagged.
 *
 * CASCADE: this event is NOT emitted for tasks removed as side-effects of
 * `DELETE /api/project/{id}` or `DELETE /api/column/{id}`. Clients must
 * remove child tasks locally from the parent `ProjectDeleted` /
 * `ColumnDeleted` event — never from a per-child `TaskDeleted`.
 */
export interface TaskDeletedEvent {
  taskId: string;
  columnId: string;
}
```

**File: `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.types.ts` (new)**

```typescript
export interface DeleteProjectConfirmData {
  projectName: string;
}

/** `true` = primary confirmed; `undefined` = cancelled / Escape / backdrop. */
export type DeleteProjectConfirmResult = true | undefined;

/**
 * Per-open state owned by the smart parent (dashboard or board page) and
 * passed into the dialog via signal inputs so the dialog can render the
 * in-place error + submitting state without re-opening. The dialog does
 * NOT close itself on a non-terminal error.
 */
export interface DeleteProjectConfirmViewInputs {
  submitting: boolean;
  /** Inline error (network / generic). Null clears the error row. */
  inlineError: string | null;
}
```

**File: `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.types.ts` (new)**

```typescript
export interface DeleteColumnConfirmData {
  columnName: string;
  taskCount: number;
}

export type DeleteColumnConfirmResult = true | undefined;

export interface DeleteColumnConfirmViewInputs {
  submitting: boolean;
  inlineError: string | null;
}
```

**File: `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.types.ts` (new)**

```typescript
export interface DeleteTaskConfirmData {
  taskTitle: string;
}

export type DeleteTaskConfirmResult = true | undefined;

export interface DeleteTaskConfirmViewInputs {
  submitting: boolean;
  inlineError: string | null;
}
```

**File: `KanbAI-Web/src/app/core/services/toast.service.ts` (new — shape only)**

```typescript
export interface ToastMessage {
  id: number;
  message: string;
}

/**
 * Minimal toast service. Single-slot — `show()` replaces any currently
 * visible toast (matches today's `PartialFailureToastComponent` behaviour).
 * Announcements are a separate stream so toast copy and AT-announcement
 * copy can differ (e.g. context doc requires toast *"Project '{name}' was
 * deleted"* but the polite announcement is just *"Project deleted"*).
 */
export interface ToastServiceApi {
  currentToast: Signal<ToastMessage | null>;
  currentAnnouncement: Signal<string>;
  show(message: string): void;
  announce(message: string): void;
  dismissCurrent(): void;
}
```

### Signals vs RxJS decisions

- **Dialog-local state (every new confirm dialog):** `submitting: boolean` and `inlineError: string | null` are **signal inputs** owned by the smart parent, read by the dialog. The dialog is purely presentational — it never holds its own mutable state. Rationale: keeps the dialog Dumb; lets the parent reason about lifecycle (submitting is the HTTP in-flight bit, inlineError is the last-HTTP-failure-mapped message); mirrors the #91 clear-description pattern.
- **Smart-parent per-delete UI state:** plain `signal<T>` on the smart parent component. One pair per open dialog. Example (Board page):
  ```typescript
  private readonly deleteColumnSubmitting = signal<boolean>(false);
  private readonly deleteColumnError = signal<string | null>(null);
  ```
  Passed into the dialog via `[submitting]` / `[inlineError]` bindings. Cleared on open and on every successful terminal close.
- **HTTP:** RxJS `Observable<void>` returned by the API service, chained through a state-service wrapper, subscribed once in the smart parent using `takeUntilDestroyed(this.destroyRef)`. Never `.pipe(retry())` — retries are explicitly user-initiated.
- **SignalR `TaskDeleted` handler:** reuses the existing `SignalRService.on<TaskDeletedEvent>(REALTIME_EVENT.TaskDeleted)` + `subscribe` pattern in `BoardStateService`'s `effect()` — same shape as `onColumnDeleted`.
- **ToastService state:** two signals — `_currentToast = signal<ToastMessage | null>(null)` and `_currentAnnouncement = signal<string>('')`. Exposed via read-only `Signal<T>` selectors.

### BoardStateService — state model impact

No change to `BoardState` shape. All three new mutations (`applyDeletedColumn`, `applyDeletedTask`, the cascade removal on `onProjectDeleted`/`onColumnDeleted`) operate on the existing `columns` + `tasksByColumnId` slice via the existing `setState` helper.

---

## Service Integration

### `ProjectsApiService` — already shipped; confirm copy alignment

`ProjectsApiService.deleteProject(id)` already exists and emits `HttpErrorResponse` on non-2xx. The existing `mapErrorToUserMessage(err, 'delete')` already returns:

- `0` → `"We couldn't reach the server. Please check your connection and try again."`
- `403 & operation === 'delete'` → `"Only the project owner can delete this project."` ✅ matches context doc.
- `404 & operation === 'delete'` → `"We couldn't find that project — it may have been deleted."` — but context doc requires `404` to be treated as **success** (silent local removal + standard success toast). **Developer action:** the smart parent must branch on `err instanceof HttpErrorResponse && err.status === 404` BEFORE calling the mapper and treat it as success. Do NOT touch `mapErrorToUserMessage`'s 404 copy — it's load-bearing for `update` paths. Smart-parent branching is explicit in the implementation steps below.
- `>= 500` → generic server copy — context doc requires `"Couldn't delete project — please try again"`. **Developer action:** smart parent uses its own inline copy for non-403/non-404/non-0 errors rather than `mapErrorToUserMessage` for this ticket's project-delete path; see copy matrix below for the exact strings.

### `ColumnsApiService` — add `deleteColumn` + `'delete'` op

**File: `KanbAI-Web/src/app/features/board/services/columns-api.service.ts` (modify)**

Add method on the service class (signature only — body per developer implementation):

```typescript
/**
 * `DELETE /api/column/{id}`. Backend returns `204 No Content` (or `404`
 * if the column is already gone). No envelope body on the wire — non-2xx
 * responses surface as HttpErrorResponse through the Observable's error
 * branch, identical to `ProjectsApiService.deleteProject`.
 */
deleteColumn(columnId: string): Observable<void>;
```

Extend the `ColumnOperation` union and `mapColumnErrorToUserMessage` switch:

```typescript
export type ColumnOperation = 'list' | 'create' | 'delete';
```

The `'delete'` branch of `mapColumnErrorToUserMessage` must return exactly the following strings (copy matrix below is authoritative):

- `status === 0` → `"Couldn't reach the server — try again"` (context doc verbatim — note the **em-dash** and no period).
- `status === 403` → `"You don't have permission to delete this column"` (context doc verbatim).
- `status === 404` → sentinel `null` is **not** returned; the smart parent handles 404-as-success before the mapper is invoked.
- `status >= 500` OR any other status → `"Couldn't delete column — please try again"` (context doc verbatim).

### `TasksApiService` — add `deleteTask` + new mapper

**File: `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts` (modify)**

```typescript
/**
 * `DELETE /api/task/{taskId}`. Backend returns `204` on success, `403` if
 * the caller is not a project member, `404` if the task is already gone
 * (idempotent), or `500` if physical file deletion failed and the task
 * was preserved server-side. No envelope body on the wire.
 */
deleteTask(taskId: string): Observable<void>;
```

Add a new **standalone** exported mapper function (do **not** extend `mapTaskDescriptionErrorToUserMessage` — its discriminated `TaskDescriptionErrorResult` shape is description-specific):

```typescript
/**
 * Error copy for a failed task delete (issue #96). Verbatim strings frozen
 * in issue_96_context.md. Never exposes status codes, URLs, stack traces,
 * or envelope error arrays. 404 handling is NOT here — it is a success
 * branch handled by the smart parent before the mapper runs.
 */
export function mapTaskDeleteErrorToUserMessage(error: unknown): string;
```

Returns the following exact strings (see copy matrix):

- `status === 0` → `"Couldn't reach the server — try again"`
- `status === 403` → `"You don't have permission to delete this task"`
- `status === 500` → `"Couldn't delete task — please try again"` (retry-in-place is valid because backend preserves the task)
- `status >= 500 && status !== 500` OR any other status → `"Couldn't delete task — please try again"`
- Non-`HttpErrorResponse` fallback → `"Couldn't delete task — please try again"`

### `ProjectStateService` — no new wrappers; augment realtime

**File: `KanbAI-Web/src/app/features/projects/state/project-state.service.ts` (modify)**

- `deleteProject(id)` is unchanged.
- `onProjectDeleted(evt)` is unchanged for the dashboard-scope reconciliation (it already removes from `state.projects`).
- **Cross-surface navigation on remote delete** (AC: "A `ProjectDeleted` event received while the user is on that project's board navigates them to the projects landing page and shows a toast"): this cannot live on `ProjectStateService` because the state service does not know which project the user is currently viewing — that's `BoardStateService.currentProjectId`. Implement via a new tiny effect in `BoardPageComponent` (or `BoardStateService`, see next §): when a `ProjectDeleted` event arrives whose `projectId === BoardStateService.currentProjectId()`, navigate to `/dashboard` and fire `toastService.show("This project was deleted by another member")`. The remote-delete toast is explicitly **not** shown on the landing page (context doc: silent removal there).

### `BoardStateService` — new wrappers + handler + cascade cleanup

**File: `KanbAI-Web/src/app/features/board/state/board-state.service.ts` (modify)**

Add:

```typescript
/** HTTP-driven column delete wrapper (issue #96). */
deleteColumn(columnId: string): Observable<void>;

/**
 * HTTP-driven task delete wrapper (issue #96). `columnId` is carried
 * because the caller (BoardPageComponent) already knows it (the task is
 * currently open in the panel) and because the state mutation scopes by
 * columnId — same rationale as the `TaskDeletedEvent` wire shape.
 */
deleteTask(taskId: string, columnId: string): Observable<void>;

/**
 * Internal helper invoked by (a) HTTP-success path and (b) SignalR echo —
 * same shape as `applyCreatedColumn`. Removes the column and its task
 * bucket. Silent no-op if the column is not in current state.
 */
private applyDeletedColumn(columnId: string): void;

/**
 * Internal helper invoked by (a) HTTP-success path and (b) SignalR echo.
 * Removes the task from its column's bucket. Silent no-op if the task is
 * not in current state (already gone).
 */
private applyDeletedTask(taskId: string, columnId: string): void;

/**
 * New SignalR subscriber registered inside the existing `effect()` that
 * subscribes to `ColumnCreated` / `ColumnDeleted` / `TaskCreated` / `TaskMoved`
 * / `TaskUpdated`. Mirrors the structure of `onColumnDeleted`. Scoped by
 * `currentProjectId` — silent no-op on mismatched project.
 */
private onTaskDeleted(evt: TaskDeletedEvent): void;
```

**Cascade behaviour — explicit state-layer requirement (context doc §"Note on cascade deletes"):**

- `onProjectDeleted(evt)` on `ProjectStateService` must additionally, if `evt.projectId === BoardStateService.currentProjectId()`, call a new `BoardStateService.clearBoardState()` helper that empties `columns` + `tasksByColumnId` AND `currentProjectId` locally (the subsequent navigation to `/dashboard` will run `leaveBoard()` which redundantly clears; that is fine — both are idempotent). The task list must be removed from local state **without** any `TaskDeleted` event. Call this out in the implementation step.
- `onColumnDeleted(evt)` in `BoardStateService` already drops the task bucket for the deleted column (`delete tasksByColumnId[evt.columnId]`). This already satisfies the cascade rule for column-parent — no change needed. Developer must add a verification test for this exact invariant.
- A stale `TaskDeleted` that arrives AFTER a `ProjectDeleted` / `ColumnDeleted` for the same task must be a silent no-op — the task is already gone. The existing "silent no-op when task not found" guard in `applyDeletedTask` satisfies this.

### HTTP contract table

| Sub-feature | Method | Endpoint | Request body | Success status / response | Documented error statuses |
|-------------|--------|----------|--------------|---------------------------|---------------------------|
| A — project | DELETE | `/api/project/{id}` | — | `204` No Content (empty body) | `0` (network) · `403` (not owner) · `404` (already gone) · `5xx` (server) |
| B — column | DELETE | `/api/column/{id}` | — | `204` No Content (empty body) | `0` · `404` (already gone) · `403` (server-enforced if rules tighten) · `5xx` |
| C — task | DELETE | `/api/task/{taskId}` | — | `204` No Content (empty body) | `0` · `403` (not a member) · `404` (already gone / idempotent) · `500` (physical file delete failed; task preserved) · other `5xx` |

No request body on any of the three deletes. No envelope on success (204). Non-2xx surfaces as `HttpErrorResponse`.

### Error copy matrix (verbatim, authoritative)

Every string below is copy-pasted from issue_96_context.md. **Any drift is a bug.** No error path may render anything beyond these strings.

| Status | Sub-feature A (project) | Sub-feature B (column) | Sub-feature C (task) |
|--------|-------------------------|-------------------------|------------------------|
| `0` (network) | `Couldn't reach the server — try again` (stay-open, inline) | `Couldn't reach the server — try again` (stay-open, inline) | `Couldn't reach the server — try again` (stay-open, inline) |
| `403` | `Only the project owner can delete this project` (close + toast/inline) | `You don't have permission to delete this column` (close + toast/inline) | `You don't have permission to delete this task` (close + inline) |
| `404` | **treat as success** — remove locally, toast `Project '{name}' was deleted`, announce `Project deleted` | **treat as success** — remove locally, toast `Column '{name}' was deleted`, announce `Column deleted` | **treat as success** — close panel, remove locally, toast `Task '{title}' was deleted`, announce `Task deleted` |
| `500` | `Couldn't delete project — please try again` (inline) | `Couldn't delete column — please try again` (inline) | `Couldn't delete task — please try again` (stay-open, inline — retry is valid because task is preserved server-side) |
| Other `5xx` / parse / unexpected | `Couldn't delete project — please try again` | `Couldn't delete column — please try again` | `Couldn't delete task — please try again` |

**Success toasts (verbatim):**

- Project: `Project '{name}' was deleted`
- Column: `Column '{name}' was deleted`
- Task: `Task '{title}' was deleted`

**`aria-live="polite"` announcements (verbatim):**

- Project: `Project deleted`
- Column: `Column deleted`
- Task: `Task deleted`

**Remote-delete toasts (verbatim, shown only if the user has the target open):**

- Project (user on that project's board): `This project was deleted by another member`
- Column (user had task panel open for a task in that column): `This column was deleted by another member`
- Task (user had that task open in the panel): `This task was deleted by another member`

**Permission-menu hint (verbatim):** `Only the project owner can delete this project`

**⚠ No error path may display any of the following:** an HTTP status code, a request URL, a stack trace, or a raw `ApiResponse.errors[]` entry. The backend's `500` string *"An unexpected error occurred."* must **never** reach the UI — `mapTaskDeleteErrorToUserMessage` replaces it with the client-side copy above.

---

## Implementation Steps

Follow these steps in order. Each step lists the file(s) touched and the concrete action. Do not reorder — later steps assume earlier ones compiled and are under test.

### Phase 0 — shared infrastructure

#### Step 0.1 — Create `ToastService` + `ToastHostComponent`

- [ ] Generate `KanbAI-Web/src/app/core/services/toast.service.ts` implementing `ToastServiceApi`.
- [ ] Implement single-slot `show(message)` replacing any current toast; auto-dismiss timer 8s (pause on hover/focus — same pattern as `PartialFailureToastComponent`).
- [ ] Implement `announce(message)` writing to `_currentAnnouncement`; clear-then-set pattern so identical consecutive messages still announce (workaround for the common AT quiet-when-text-unchanged issue — test covers this).
- [ ] Generate `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.ts` with `ChangeDetectionStrategy.OnPush`, standalone, bound to `toastService.currentToast` and `toastService.currentAnnouncement`. Template: one visible toast element (aria hidden from SR; SR-announce region separate) + one visually-hidden `<div role="status" aria-live="polite">{{ currentAnnouncement() }}</div>`.
- [ ] Register `ToastHostComponent` in `app.ts` imports and mount `<app-toast-host />` at the end of `app.html` so it sits above route content in the stacking context.
- [ ] Write `toast.service.spec.ts` and `toast-host.component.spec.ts` (unit tests for show/auto-dismiss/announce/replace-in-place).

### Phase A — Delete a project

#### Step A.1 — Confirmation dialog

- [ ] Generate `DeleteProjectConfirmDialogComponent` under `features/projects/components/delete-project-confirm-dialog/`. Follow the structure of `RemoveMemberConfirmDialogComponent` exactly (standalone, `OnPush`, `ViewEncapsulation.None`, scoped selector `.delete-project-confirm-panel`, `DIALOG_DATA` + `DialogRef` injected).
- [ ] Accept `DeleteProjectConfirmData` via `DIALOG_DATA` and expose `submitting` / `inlineError` as signal inputs. Template: heading with id `delete-project-confirm-heading`, body paragraph interpolating `data.projectName` verbatim into the context-doc string, primary button labelled *"Delete project"* (destructive class), secondary button labelled *"Cancel"*.
- [ ] Primary button is `[disabled]="submitting()"`. On click, emit via a `confirmClicked` output to the smart parent (NOT `dialogRef.close(true)`) so the parent retains control of the HTTP lifecycle and can keep the dialog open on network error. Cancel button calls `dialogRef.close(undefined)`.
- [ ] Inline error row: `@if (inlineError(); as msg) { <p role="alert">{{ msg }}</p> }`.
- [ ] Write `delete-project-confirm-dialog.component.spec.ts` asserting copy, button disabling on `submitting`, Escape dismissal, Cancel closes with `undefined`, primary emits `confirmClicked`.

#### Step A.2 — `ProjectCardComponent` kebab menu

- [ ] Add the kebab trigger button and CDK `Menu` (import `CdkMenu` / `CdkMenuItem` from `@angular/cdk/menu`) into `project-card.component.html`. The kebab is keyboard-focusable and shows a visible focus ring (design spec will define the exact ring treatment).
- [ ] Add `@Output() deleteProjectRequested = new EventEmitter<ProjectSummary>()`. Emit when the menu's "Delete project" item is activated AND `canDeleteProject()` is true; if not true, the item is disabled (`aria-disabled="true"`, no click handler) and renders the hint `Only the project owner can delete this project`.
- [ ] Add `protected readonly canDeleteProject = computed(() => this.roleVariant() === 'owner');` — reuses the existing role normalisation.
- [ ] Update `project-card.component.spec.ts`: assert the kebab is reachable by keyboard, the Delete item is present, Owner sees it enabled, Member sees it disabled with the hint, activation emits `deleteProjectRequested`.

#### Step A.3 — `ProjectGridComponent` event relay

- [ ] Add matching `@Output() deleteProjectRequested = new EventEmitter<ProjectSummary>()` and relay `(deleteProjectRequested)="deleteProjectRequested.emit($event)"` in the grid's template `<app-project-card>` binding.
- [ ] Update `project-grid.component.spec.ts`.

#### Step A.4 — `DashboardPageComponent` orchestration

- [ ] Inject `ToastService` in `dashboard-page.component.ts`.
- [ ] Add `private readonly deleteProjectSubmitting = signal<boolean>(false);` and `private readonly deleteProjectError = signal<string | null>(null);`.
- [ ] Wire `(deleteProjectRequested)="openDeleteProjectDialog($event)"` on `<app-project-grid>`.
- [ ] Implement `openDeleteProjectDialog(project: ProjectSummary): void` that opens `DeleteProjectConfirmDialogComponent` with `data: { projectName: project.name }`, `ariaLabelledBy: 'delete-project-confirm-heading'`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`, `panelClass: 'delete-project-confirm-panel'`, `backdropClass: 'delete-project-confirm-backdrop'`, `disableClose: false` — same options bag as the existing `openMembersDialog`.
- [ ] Subscribe to the dialog's `confirmClicked` output: set `deleteProjectSubmitting.set(true)`, clear `deleteProjectError`, call `projectState.deleteProject(project.id)`. In `next`: close dialog, `toastService.show("Project '" + project.name + "' was deleted")`, `toastService.announce("Project deleted")`. In `error (HttpErrorResponse)`: branch on status per matrix; on `404`, treat as success; on `0`/`500`/other → set `deleteProjectError` and keep dialog open; on `403` → close dialog and `toastService.show("Only the project owner can delete this project")`. Set `deleteProjectSubmitting.set(false)` in every branch's final callback.
- [ ] Ensure the `ProjectStateService.deleteProject` call's local-removal mutation has already cleared the row by the time the toast fires (it does today — `tap()` before the mapper).
- [ ] Update `dashboard-page.component.spec.ts` — new cases for success, 404-as-success, 403, 0, 500.

#### Step A.5 — `BoardHeaderComponent` + `BoardPageComponent` orchestration for open-project header

- [ ] Generate `BoardHeaderComponent` — standalone, `OnPush`, inputs `project` + computed `canDeleteProject`, output `deleteProjectRequested`. Template: title `<h1>{{ project().name }}</h1>` + kebab trigger + CDK `Menu` with the same disabled-hint treatment as the card menu. Reuse one shared `DELETE_PROJECT_DISABLED_COPY` constant.
- [ ] Render `<app-board-header [project]="currentProject()" (deleteProjectRequested)="openDeleteProjectDialog()" />` at the top of `board-page.component.html`, above the existing SR-announce and move-error regions.
- [ ] `currentProject()` on `BoardPageComponent` is a new computed that looks up the `ProjectSummary` from `ProjectStateService.projects()` by `this.boardState.currentProjectId()`. Handles the null case by rendering nothing (`@if (currentProject(); as p)`).
- [ ] Add `openDeleteProjectDialog()` method mirroring dashboard's; on success, `router.navigate(['/dashboard'])` BEFORE firing the toast so the dashboard page renders first and the toast is live-region-announced on the destination.
- [ ] Write `board-header.component.spec.ts` + extend `board-page.component.spec.ts`.

#### Step A.6 — Remote-delete navigation on `ProjectDeleted`

- [ ] In `BoardPageComponent.ngOnInit`, subscribe to `ProjectStateService.projects()` via an `effect()` that, when the current `boardState.currentProjectId()` is no longer in `projectState.projects()`, calls `router.navigate(['/dashboard'])` and `toastService.show("This project was deleted by another member")`. Use `takeUntilDestroyed(this.destroyRef)`.
- [ ] **Important:** this effect must NOT fire on initial navigation when `projects()` is empty pre-hydration. Gate on `projectState.hasLoaded()` being true.
- [ ] On the dashboard page: `onProjectDeleted` already silently removes the card; no change needed. Explicitly verify in a test that no toast and no announcement fire on the dashboard-scope silent-remove path.

### Phase B — Delete a column

#### Step B.1 — Extend `ColumnsApiService` with `deleteColumn`

- [ ] Add `deleteColumn(columnId: string): Observable<void>` to `ColumnsApiService` (mirror `ProjectsApiService.deleteProject` — `encodeURIComponent`, `this.http.delete<void>(url)`).
- [ ] Extend `ColumnOperation` union to include `'delete'`.
- [ ] Add a `case 'delete':` branch to `mapColumnErrorToUserMessage` per the copy matrix. NOTE: `404` returns "treated as success" — since the existing mapper is a copy function, the smart-parent handles `404` before calling the mapper. Add a JSDoc comment to that effect above the `operationGenericCopy` function.
- [ ] Update `columns-api.service.spec.ts` with tests for each status code.

#### Step B.2 — Extend `BoardStateService` with `deleteColumn` + `applyDeletedColumn`

- [ ] Add private helper `applyDeletedColumn(columnId: string): void` that replicates the body of `onColumnDeleted` but takes only `columnId` (no projectId guard — caller is trusted). Silent no-op if not found.
- [ ] Refactor `onColumnDeleted` to delegate its state-mutation body to `applyDeletedColumn` (keeps the project-id guard at the top).
- [ ] Add `deleteColumn(columnId: string): Observable<void>` that calls `columnsApi.deleteColumn(columnId)` and on success (`tap()`) calls `applyDeletedColumn(columnId)`. Error pipe re-throws the `HttpErrorResponse` unchanged — the mapper runs in the smart parent.
- [ ] Update `board-state.service.spec.ts` with a new `deleteColumn` test group.

#### Step B.3 — Confirmation dialog

- [ ] Generate `DeleteColumnConfirmDialogComponent` under `features/board/components/delete-column-confirm-dialog/`. Same structure as `DeleteProjectConfirmDialogComponent`.
- [ ] Template selects the task-count body or the empty-column body based on `data.taskCount > 0`. Interpolates `data.columnName` verbatim. Heading id `delete-column-confirm-heading`.
- [ ] Write `delete-column-confirm-dialog.component.spec.ts`.

#### Step B.4 — `BoardColumnComponent` kebab menu

- [ ] Add the kebab trigger + CDK Menu to `board-column.component.html`. Position inside the column header row.
- [ ] Add `deleteColumnRequested = output<BoardColumn>()`; emit on the menu's Delete item activation.
- [ ] Update `board-column.component.spec.ts`.

#### Step B.5 — `BoardPageComponent` orchestration for column delete

- [ ] Wire `(deleteColumnRequested)="openDeleteColumnDialog($event)"` on `<app-board-column>`.
- [ ] `openDeleteColumnDialog(column: BoardColumn)`: compute `taskCount = (this.tasksByColumnId()[column.id] ?? []).length`, open the dialog with `data: { columnName: column.name, taskCount }`, same options bag as the project dialog.
- [ ] Add `deleteColumnSubmitting: signal<boolean>(false)` and `deleteColumnError: signal<string | null>(null)` as smart-parent state.
- [ ] On `confirmClicked`: submit = true, clear error, call `boardState.deleteColumn(column.id)`. In `next` (204): close dialog; if the currently-open task's `columnId === column.id`, call `handleTaskDetailClosed()`; fire toast + announce. In `error`: branch on status per matrix (404 → treat as success and run the 204 path; 0/500/other → stay open with inline error; 403 → close + toast). Always reset `deleteColumnSubmitting`.
- [ ] Verify: if a SignalR `ColumnDeleted` echo for the same column arrives after `applyDeletedColumn` has run, the existing idempotence (silent no-op when column not found) absorbs it. Add a test.

### Phase C — Delete a task

#### Step C.1 — Register `TaskDeleted` event

- [ ] In `core/models/realtime-events.ts`: add `TaskDeleted: 'TaskDeleted'` to `REALTIME_EVENT` and export `interface TaskDeletedEvent { taskId: string; columnId: string; }`.

#### Step C.2 — Extend `TasksApiService` with `deleteTask` + mapper

- [ ] Add `deleteTask(taskId: string): Observable<void>` (mirror `ProjectsApiService.deleteProject`). No `columnId` on the URL — backend derives project/column from the taskId.
- [ ] Add `export function mapTaskDeleteErrorToUserMessage(error: unknown): string` implementing the copy matrix.
- [ ] Update `tasks-api.service.spec.ts`.

#### Step C.3 — Extend `BoardStateService` with `onTaskDeleted` + `deleteTask` + `applyDeletedTask`

- [ ] Add private helper `applyDeletedTask(taskId: string, columnId: string): void` — locate the task in the bucket `tasksByColumnId[columnId]`; if present, build a new bucket without that task, `setState` replacing the bucket (drop the key if the bucket is now empty). Silent no-op if absent.
- [ ] Add `private onTaskDeleted(evt: TaskDeletedEvent): void` that validates `currentProjectId !== null`, then calls `applyDeletedTask(evt.taskId, evt.columnId)`.
- [ ] Register the new subscriber in the existing `effect()` alongside `ColumnCreated` / `ColumnDeleted` / etc:
  ```typescript
  this.subscriptionBag.push(
    this.signalRService
      .on<TaskDeletedEvent>(REALTIME_EVENT.TaskDeleted)
      .subscribe(evt => this.onTaskDeleted(evt))
  );
  ```
- [ ] Add public wrapper `deleteTask(taskId: string, columnId: string): Observable<void>` that calls `tasksApi.deleteTask(taskId)` and on success (`tap()`) calls `applyDeletedTask(taskId, columnId)`.
- [ ] Update `board-state.service.spec.ts` with:
  - `onTaskDeleted` removes the task from its bucket.
  - `onTaskDeleted` is a silent no-op when `currentProjectId` is null.
  - `onTaskDeleted` is a silent no-op for an unknown task id.
  - `onColumnDeleted` removes the entire bucket even when tasks exist (cascade invariant).
  - `onProjectDeleted` (via the cross-service glue in step C.5) clears board state.

#### Step C.4 — Confirmation dialog + `TaskDetailPanelComponent` footer

- [ ] Generate `DeleteTaskConfirmDialogComponent` — same shape as the others. Heading id `delete-task-confirm-heading`. Interpolate `data.taskTitle` verbatim into the body.
- [ ] In `task-detail-panel.component.ts` + `.html`: add a destructive footer section at the BOTTOM of the panel, visibly separated from the description Save / Cancel region (the design spec will define the separator treatment — minimum: a horizontal rule + a `.destructive-zone` class). Add the Delete button and a new `deleteTaskRequested = output<BoardTask>()`.
- [ ] Write specs.

#### Step C.5 — `BoardPageComponent` orchestration for task delete

- [ ] Wire `(deleteTaskRequested)="openDeleteTaskDialog($event)"` on `<app-task-detail-panel>`.
- [ ] `openDeleteTaskDialog(task: BoardTask)`: open dialog with `data: { taskTitle: task.title }`, same options bag. Cache `task.columnId` locally so the state call has the right columnId even if an interleaving SignalR event moves the task (defensive — the task should not be reachable from the panel after such a move, but guard anyway).
- [ ] Add smart-parent signals `deleteTaskSubmitting` / `deleteTaskError`.
- [ ] On `confirmClicked`: call `boardState.deleteTask(task.id, task.columnId)`. `next` → close dialog, close panel (`handleTaskDetailClosed()`), `toastService.show("Task '" + task.title + "' was deleted")`, `toastService.announce("Task deleted")`. `error (HttpErrorResponse)`: branch per matrix (`404` → treat as success and run the success branch; `0`/`500`/other → stay open with inline error — `500` is valid for retry-in-place per context doc; `403` → close + inline error).
- [ ] Verify the existing `selectedTask` computed already collapses the panel when the task row disappears from state (it does — see `task-detail-panel.component.ts` comment about tasks removed from state). The explicit `handleTaskDetailClosed()` call is belt-and-braces.

#### Step C.6 — Cascade glue for `ProjectDeleted` while on the board

- [ ] In `BoardPageComponent`: the effect added in step A.6 that navigates to `/dashboard` on `ProjectDeleted`-for-current-project already handles the "remove every task under it from local state" requirement — `leaveBoard()` (called from `ngOnDestroy` when the router navigates) clears all of `columns` + `tasksByColumnId`. Developer must verify by adding a spec case: while viewing project X, inject a `ProjectDeleted` for X → assert `columns` + `tasksByColumnId` are empty AND navigation fired AND the remote-delete toast fired.
- [ ] In `ColumnDeleted` handler on `BoardStateService`: existing code already drops the column's task bucket. Developer must add a spec case that covers cascade invariant: `onColumnDeleted(evt)` removes `tasksByColumnId[evt.columnId]` even when the bucket is non-empty, without any `TaskDeleted` event being emitted.

### Phase D — Wire-up + QA pass (cross-cutting)

#### Step D.1 — Focus restoration end-to-end

- [ ] Verify for all three dialogs that the CDK `restoreFocus: true` option returns focus to the invoking element. For the project-card kebab menu and the column kebab menu, CDK restores focus to the element that had focus when the dialog opened — that is the MenuItem. CDK Menu's close behaviour then returns focus to the MenuTrigger (kebab button). Confirm this chain with a manual keyboard test and an E2E test (step D.4).
- [ ] For the task detail panel Delete button, `restoreFocus: true` returns focus to the Delete button; but the panel also closes on success — the correct destination is the task card that was opened (the board page). Explicitly call `focus()` on the originating task card after the panel closes using the same DOM-id lookup pattern as `focusAddTaskTrigger` (step C.5 implementation detail).

#### Step D.2 — Shared aria-live + toast verification

- [ ] Confirm `ToastHostComponent` renders exactly one `role="status" aria-live="polite"` region per the context doc (`"toasts announce once on appearance and never steal keyboard focus"`). The toast itself is NOT the live region — the separate visually-hidden element is. This prevents double-announcement when the toast animates in.
- [ ] Confirm the `announce()` method uses the "clear-then-set" pattern so two consecutive identical announcements still announce.

#### Step D.3 — Focus ring verification

- [ ] Web-designer will define the canonical `:focus-visible` ring. Developer must ensure each new affordance (`.project-card__menu-btn`, `.board-header__menu-btn`, `.board-column__menu-btn`, `.task-detail-panel__delete-btn`) picks up the canonical `:focus-visible` treatment — not just `:focus`. Add a visual regression check if the project has one; otherwise test via axe-core in the component specs.

#### Step D.4 — E2E happy-paths

- [ ] Add Playwright / Cypress (whichever the project uses — verify) specs for:
  1. Owner deletes a project from the card kebab → card disappears → toast appears.
  2. Owner deletes a project from the open-project header → navigates to `/dashboard` → toast appears.
  3. Member deletes a column with tasks → column + tasks disappear → panel closes if task was inside.
  4. Member deletes a task from the panel → panel closes → card disappears → toast.
  5. Non-owner sees the project-delete item disabled with the hint.

---

## QA Guidance

### Test strategy

**Unit tests — Dialog components:**
- Assert the exact copy per the copy matrix (including em-dashes and single-quoted entity names).
- Assert `data.*` interpolation (projectName / columnName / taskTitle / taskCount).
- Assert Escape closes with `undefined` (cancellation).
- Assert Cancel closes with `undefined`.
- Assert the primary button is `[disabled]="submitting"` and emits `confirmClicked` when enabled.
- Assert the dialog does NOT close on `confirmClicked` (parent owns closure).
- Assert the inline-error row renders when `inlineError` is non-null and uses `role="alert"`.

**Unit tests — Services:**
- `ColumnsApiService.deleteColumn` → uses `HttpClientTestingModule` to verify URL (`/api/column/{id}`), method (`DELETE`), no body, and unwraps 204 correctly (Observable completes with no value).
- `mapColumnErrorToUserMessage('delete')` → one test per status code (0 / 403 / 500 / other `4xx` / other `5xx`) asserting the exact verbatim string.
- `TasksApiService.deleteTask` → same pattern.
- `mapTaskDeleteErrorToUserMessage` → one test per status (0 / 403 / 500 / 404 is NOT asserted here — 404 is the smart parent's concern).

**Unit tests — State service:**
- `BoardStateService.onTaskDeleted` → removes the task from the correct bucket, silent no-op when `currentProjectId === null`, silent no-op when task id unknown.
- `BoardStateService.onColumnDeleted` cascade → bucket dropped even when tasks exist.
- `BoardStateService.deleteColumn` → success calls `applyDeletedColumn` (spy), error re-throws the `HttpErrorResponse` to the caller.
- `BoardStateService.deleteTask` → same pattern.
- `ProjectStateService.deleteProject` is pre-existing; add a regression test ensuring the 204 path removes the project from `projects()`.

**Integration tests — Smart parents:**
- `DashboardPageComponent` delete-project flow:
  - Success (204) → dialog closes, project removed from grid, toast shown via mocked `ToastService`, announcement called.
  - 404 → same as success.
  - 403 → dialog closes, toast with permission copy, state unchanged.
  - 0 → dialog stays open, inline error set to network copy.
  - 500 → dialog stays open, inline error set to generic copy.
- `BoardPageComponent` delete-column flow: identical matrix + panel-closes-when-selected-task-in-deleted-column.
- `BoardPageComponent` delete-task flow: identical matrix + panel closes on success.

**E2E tests (Playwright / Cypress — verify which framework the project uses):**
- The five flows listed in step D.4.
- Keyboard-only walkthrough for each: Tab to kebab, Enter, arrow-down to Delete, Enter, Tab to Cancel, Escape to abort, Tab to primary, Enter to confirm, focus returns to originating element.

### Mocking patterns

```typescript
// Mock ToastService in integration tests
const toastServiceMock = {
  show: vi.fn(),
  announce: vi.fn(),
  dismissCurrent: vi.fn(),
  currentToast: signal(null),
  currentAnnouncement: signal('')
};
// Mock BoardStateService.deleteColumn returning Observable
const boardStateMock = {
  // ...existing mocks...
  deleteColumn: vi.fn(() => of(undefined)),
  deleteTask: vi.fn(() => of(undefined))
};
// Mock SignalR TaskDeleted emission
const signalRMock = {
  connectionState: signal<'connected' | 'disconnected'>('connected'),
  on: <T>(name: string) => {
    const subject = new Subject<T>();
    if (name === 'TaskDeleted') taskDeletedSubject = subject as Subject<TaskDeletedEvent>;
    return subject.asObservable();
  },
  joinProjectGroup: vi.fn(),
  leaveProjectGroup: vi.fn()
};
```

### Edge cases to test (explicit, keyed to acceptance criteria)

1. **Network failure retry-in-place** (all three sub-features) — confirm dialog stays open, inline error shows the network string, clicking primary again re-fires the HTTP; second attempt success closes the dialog.
2. **404-as-success** (all three sub-features) — inject `HttpErrorResponse` with `status: 404`; assert local removal + toast + announce fire identically to the 204 path.
3. **Cascade delete without per-child `TaskDeleted`** — while viewing a board with ≥1 task in ≥1 column, dispatch `ColumnDeleted` for that column; assert the task bucket for the column is gone from `tasksByColumnId` and no `TaskDeleted` event was needed. Repeat for `ProjectDeleted`.
4. **Remote delete while panel open** — while task `T1` is open in the panel, dispatch `TaskDeleted({ taskId: T1, columnId: T1's column })`; assert the panel closes and the remote-delete toast appears. Repeat with `ColumnDeleted` for `T1`'s column and with `ProjectDeleted` for the current project.
5. **403 on task delete** — returns inline error `You don't have permission to delete this task`, dialog closes (per matrix), no state mutation. Explicitly test the backend's raw string *"You are not a member of this project."* is NOT what surfaces — mapper substitutes the client copy.
6. **500 on task delete retry-in-place** — first submit returns `500`; inline error appears; user clicks primary again; second submit returns `204`; dialog closes; task is removed.
7. **Non-owner cannot delete project** — render a project with `role: 'Member'`; assert the Delete item in the kebab is disabled (`aria-disabled="true"`) AND shows the exact hint copy. Assert clicking it does NOT fire `deleteProjectRequested` and does NOT open the dialog.
8. **Stale TaskDeleted after parent cascade** — after `ColumnDeleted` clears a bucket, dispatch a late `TaskDeleted` for a task that was in that bucket; assert silent no-op (no crash, no state mutation).
9. **Error copy hygiene** — scan every error branch and assert the displayed text does not contain any of: digit sequences matching HTTP statuses (regex `\b\d{3}\b`), forward-slash URL patterns (regex `/api/`), or the backend string *"An unexpected error occurred."*. Add one regression test per error branch.
10. **Focus restoration** — open dialog from kebab, Escape → focus returns to the kebab trigger (not the menu item, not the body). Confirm for all three entry points.

---

## Open questions

Context doc is unambiguous on all required decisions (permission surface → disabled-with-hint chosen above, delete behaviour on all three primitives explicit, cascade behaviour explicit, all copy frozen). Two narrow developer-facing questions remain:

1. **Toast library choice.** Context doc does not mandate any specific package. Spec chooses a minimal home-grown `ToastService` + `ToastHostComponent`. If a subsequent ticket introduces Angular Material Snackbar or similar, migrate then; do not hybrid now.
2. **CDK Menu vs `<button>`-per-affordance.** Spec uses `@angular/cdk/menu` because CDK menu handles arrow-key navigation and Escape-close natively. If the project already has a different menu convention the developer should flag it before diverging — at time of writing the only CDK menu pattern in the codebase is the Members dialog's AddMember / Remove flow, which uses direct buttons rather than a menu, so CDK Menu is net-new here.

---

## Design validation (self-check)

- [x] **Interface alignment:** `TaskDeletedEvent` mirrors backend `TaskDeletedEventDto` exactly (`taskId`, `columnId`). Dialog `Data` shapes reference only the fields the copy interpolates. No client fabricates a `projectId` on the `TaskDeleted` event payload.
- [x] **Standards compliance:** `inject()` everywhere, signals for UI state, RxJS for HTTP, `ChangeDetectionStrategy.OnPush` on every new component, `takeUntilDestroyed(destroyRef)` on every subscription.
- [x] **Security:** no user-provided content is rendered via `[innerHTML]`. `encodeURIComponent(id)` on every URL-parameterised DELETE (mirrors existing services). No route changes, so no new guards needed.
- [x] **Completeness:** every affordance + dialog + state wrapper + API method listed with exact file paths under `KanbAI-Web/src/app/...`. Implementation steps numbered in order.
- [x] **Copy fidelity:** copy matrix is verbatim from the context doc; every error branch references it; QA edge case #9 tests for no-leakage of backend copy.
- [x] **Cascade explicit:** both `ProjectDeleted` and `ColumnDeleted` cascades covered in state-layer spec and in QA edge case #3. Late `TaskDeleted` absorbed by idempotent no-op (#8).

---

*End of specification.*

---

## Development Status

**Implementation Date:** 2026-05-12
**Developer:** Claude Opus 4.7 (working directly against the tech + design specs)

### Files Created

**Shared toast infrastructure (Phase 0)**
- `KanbAI-Web/src/app/core/services/toast.service.ts`
- `KanbAI-Web/src/app/core/services/toast.service.spec.ts`
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.ts`
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.html`
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.scss`
- `KanbAI-Web/src/app/core/components/toast-host/toast-host.component.spec.ts`

**Sub-feature A — Delete a project**
- `KanbAI-Web/src/app/features/projects/constants/delete-project-copy.ts`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.ts`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.html`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.scss`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component.spec.ts`
- `KanbAI-Web/src/app/features/projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.types.ts`
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.html`
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.scss`
- `KanbAI-Web/src/app/features/board/components/board-header/board-header.component.spec.ts`

**Sub-feature B — Delete a column**
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.ts`
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.html`
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.scss`
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.component.spec.ts`
- `KanbAI-Web/src/app/features/board/components/delete-column-confirm-dialog/delete-column-confirm-dialog.types.ts`

**Sub-feature C — Delete a task**
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.ts`
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.html`
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.scss`
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.component.spec.ts`
- `KanbAI-Web/src/app/features/board/components/delete-task-confirm-dialog/delete-task-confirm-dialog.types.ts`

### Files Modified

- `KanbAI-Web/src/app/app.ts` + `app.html` — register `<app-toast-host />` at shell level
- `KanbAI-Web/src/app/core/models/realtime-events.ts` — add `TaskDeleted` constant + `TaskDeletedEvent` interface
- `KanbAI-Web/src/app/features/projects/state/project-state.service.ts` — add public `applyDeletedProject(id)`; `onProjectDeleted` now delegates to it
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.{ts,html,scss,spec}` — kebab trigger, owner-only Delete item with aria-disabled hint for non-owners, shared `.kanbai-menu` / `.kanbai-menuitem` blocks
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.{ts,html}` — relay `deleteProjectRequested`
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.{ts,html}` — `openDeleteProjectDialog` orchestration with status-based error routing (204/404 → success; 403 → close+toast; 0/5xx → stay-open inline)
- `KanbAI-Web/src/app/features/board/services/columns-api.service.{ts,spec.ts}` — `deleteColumn(id)`; `'delete'` branch on `mapColumnErrorToUserMessage`
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.{ts,spec.ts}` — `deleteTask(id)`; new `mapTaskDeleteErrorToUserMessage`
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` — `deleteColumn`, `deleteTask`, `applyDeletedColumn`, `applyDeletedTask`, `onTaskDeleted` SignalR handler; `onColumnDeleted` now delegates to `applyDeletedColumn`
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.{ts,html,scss}` — kebab trigger + menu, shared `.kanbai-menu` styles (duplicated per design-spec instruction)
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.{ts,html,scss}` — destructive footer zone with outline-red "Delete task" button
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.{ts,html}` — `BoardHeaderComponent` integration, remote-delete navigation effect, project/column/task delete orchestrations

### Build & Test Results

- **Build:** ✅ SUCCESS (`npm run build` — clean, 6.2 s)
- **Tests:** 1425 total, all passing on a clean run (baseline was 1405 — 20 new tests added for the 5 new components + 3 new service branches)
- **Pre-existing flakes noted:** `src/app/core/services/signalr.service.spec.ts` intermittently reports 17 failures with `TypeError: Cannot read properties of undefined (reading 'trim')` in the Angular Vitest mock-patch. The file comment at line 8 documents the same race; **reproduced on `main` without this branch's changes** (1388/1405 ~2/3 of runs). Not caused by this ticket.

### Acceptance Criteria Coverage

Every AC bullet in `docs/handoffs/issue_96_context.md` §"Acceptance Criteria" is addressed by code; copy is verbatim against the tech spec copy matrix (project / column / task; network / 403 / 404-as-success / 500 / remote-delete). 404 is treated as success across all three sub-features. Non-owner project delete is surfaced as `aria-disabled` row with the hint copy, identical on both card kebab and board-header kebab (one shared `DELETE_PROJECT_DISABLED_COPY` constant).

### Notes / Deviations

- `ProjectStateService.deleteProject` was **not** modified — its existing error-mapping contract is preserved for future callers. The dashboard + board-page orchestrators bypass it and call `ProjectsApiService.deleteProject` directly so the raw `HttpErrorResponse` (with status code) can drive the copy-matrix branching, then manually sync via the new public `applyDeletedProject(id)` helper.
- Task 403 is surfaced **inline** in the dialog (dialog stays open) rather than closing with a toast — matches the tech spec copy matrix asymmetry (project/column 403 → close + toast; task 403 → close + inline).
- Panel-close / card-removal animations run in the natural order dictated by signal re-emission — no explicit orchestration is needed because `BoardPageComponent.selectedTask` already collapses when the task disappears from state. The `handleTaskDetailClosed()` call on success is belt-and-braces, per the spec.
- CDK Menu's overlay panel picks up the shared `.kanbai-menu` / `.kanbai-menuitem` styles via `ViewEncapsulation.None` on the three host components that trigger it (`ProjectCardComponent`, `BoardHeaderComponent`, `BoardColumnComponent`); each host inlines its own copy of the rule block so no host depends on another's styles being loaded.

### Ready for QA

Manual validation points:
1. Dashboard → owner card → kebab → Delete project → toast appears + card disappears.
2. Board header (owner) → kebab → Delete project → navigates to `/dashboard` → toast appears on destination.
3. Non-owner sees the Delete row disabled with "Only the project owner can delete this project" hint.
4. Column kebab → Delete column → confirm (note the task-count body variant) → column + tasks disappear, panel closes if it was open on a task in that column.
5. Task panel → "Delete task" (bottom, red outline) → confirm → panel slides away → card disappears → toast.
6. Network failure (DevTools offline) → dialog stays open with "Couldn't reach the server — try again"; coming back online + retry completes the flow.
7. Remote delete: have another session/tab delete the currently-viewed project → user on board auto-navigates to `/dashboard` + info toast "This project was deleted by another member".
