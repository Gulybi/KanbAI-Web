# Technical Specification: Add "New Task" button to each board column

**Context Document:** [issue_78_context.md](./issue_78_context.md)
**GitHub Issue:** [#78](https://github.com/Gulybi/KanbAI-Web/issues/78)
**Companion Ticket:** [#77](https://github.com/Gulybi/KanbAI-Web/issues/77) (Add column on board view — pattern precedent)
**Backend Contract:** `POST /api/task/column/{columnId}` with `CreateTaskDto` — confirmed in [.claude/backend_api_map.md:91](../../.claude/backend_api_map.md#L91), [:270-276](../../.claude/backend_api_map.md#L270-L276)

---

## Overview

This feature lets users create tasks inline inside any column on the board without leaving the page. It introduces one new presentational component (`BoardAddTaskComponent`), one new HTTP method (`TasksApiService.createTask`), one new state-service entry point (`BoardStateService.applyCreatedTask`), one new task-scope error mapper (`mapTaskCreateErrorToUserMessage`), and two new DTOs (`CreateTaskDto`, `TaskCreateResponse`). The smart parent `BoardPageComponent` owns the HTTP call, the per-column open/submitting/error signals, and the submit/cancel orchestration — `BoardColumnComponent` is extended with a passive "Add task" trigger slot plus the open/submitting/error inputs it forwards to the inline form. The feature mirrors the [#77](https://github.com/Gulybi/KanbAI-Web/issues/77) `BoardAddColumnComponent` pattern one scope-level down (per-column instead of per-board). Task-create is **wait-for-response** (not optimistic) — identical to #77's column-create — and relies on the existing `BoardStateService.onTaskCreated` dedupe-by-id at [board-state.service.ts:215-242](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L215-L242) so the client's own HTTP success and the SignalR echo of that same create never double-insert.

---

## Key Design Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| **D1** | Optimistic insert vs. wait-for-response | **Wait for HTTP 201** | Mirrors #77 (`applyCreatedColumn` after response). The context doc (§"Optimistic insert vs. wait-for-response is a tech-spec decision") permits either; wait-for-response avoids renumbering `taskOrder` locally (backend is authoritative per context §"taskOrder is not in CreateTaskDto"), avoids a phantom card on error, and keeps the pattern symmetrical with column-create. The user already has an "Adding…" pending state, so the perceived latency is bounded. |
| **D2** | State-service entry point | **Introduce `BoardStateService.applyCreatedTask(projectId, dto)`** | Context doc §"Smart-parent state-service entry point" explicitly allows either pattern. We introduce an analogue of `applyCreatedColumn` that delegates to a shared `appendBoardTaskIfNew` helper so both the HTTP-success path and the existing SignalR `onTaskCreated` dedupe against the same id-set + column-guard. Prevents divergent append paths. |
| **D3** | Error-helper shape | **New sibling function `mapTaskCreateErrorToUserMessage(err)` in `tasks-api.service.ts`** | Create and move have different copy ("We couldn't add that task" vs. "The move was undone"), different status mappings (no 400 "invalid order" for create; 400 can surface on missing title / invalid assignee), and different mental models. Extending `mapTaskMoveErrorToUserMessage` with an operation parameter would complicate 7 existing unit tests that pin copy strings. A sibling keeps each helper narrow and fully covered. |
| **D4** | Component placement: where does the "Add task" trigger render? | **Footer slot below the task list in `BoardColumnComponent`, visible whether the column is empty or populated** | Context AC §"Populated columns expose the affordance alongside the task list" requires it reachable without scroll-past; §"Empty columns replace or supplement the dead-end hint" requires a CTA in the empty state. A single footer slot satisfies both. Empty-zone keeps the `"Drop a task here."` hint (for drag users) and the footer "Add task" button sits below it. No duplicate affordance. Exact visual treatment (icon-only vs. text, border style) is delivered by the web-designer phase. |
| **D5** | Open/submitting/error state — where does it live? | **In `BoardPageComponent` as a `WritableSignal<TaskDraftMap>` keyed by `columnId`** | `BoardColumnComponent` stays presentational (parity with how it handles `tasks()`, `rolledBackTaskId()`, `activeTaskId()`). The parent passes per-column slices down via inputs. One map per column means concurrent open-on-multiple-columns is free (context AC §"Opening the add-task surface on one column does NOT automatically close or clear the add-task surface on another column"). |
| **D6** | Concurrent open: mutually exclusive or per-column independent? | **Per-column independent** | Context AC §"either mutually-exclusive-one-at-a-time OR concurrent-per-column is acceptable". Per-column independence is architecturally cheaper given D5 (map vs. single signal), matches how users mentally model columns (independent swim lanes), and avoids having to "save and discard" user input when they click a second column's Add button. |
| **D7** | aria-live region | **Reuse the existing `dragAnnouncement` signal + `.board-page__sr-announce` region** at [board-page.component.html:32-38](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L32-L38) | Already exists, already `aria-live="polite"`, already used by #77 for "Column 'X' added." Keeps the screen-reader soundscape consistent. Message format: `Task '<trimmed title>' added to <column name>.` |
| **D8** | Focus destination after successful create | **Return focus to the column's "Add task" trigger button** (the one the user originally clicked to open the form) | Matches #77's post-success behavior (focus → `trailingAddButton`). Supports the rapid-add path in context §"Expected user flows → 10. Rapid-add path" — the user can immediately press Enter/Space again to author another task. Does NOT focus the new card (that would interrupt rapid add). |
| **D9** | Form behaviour on success: close or clear? | **Close** (re-opening shows an empty field) | Mirrors #77. Combined with D8 (focus on the trigger), the rapid-add path takes two keystrokes per task: trigger-activate → type → Enter → trigger is refocused → Space → type → … The clear-and-stay-open alternative is also valid but less symmetric with #77 and adds a stateful "still open" affordance to track. |
| **D10** | Input component reuse | **Reuse `FormInputComponent`** (from `features/auth/components/form-input/form-input.component.ts`) | Context §"Styling & Consistency → The input surface uses FormInputComponent (mirroring #77's BoardAddColumnComponent precedent) unless the tech spec proposes an alternative". `FormInputComponent` already provides label + required-star + error rendering + `aria-describedby` wiring. No alternative proposed. |
| **D11** | Validator composition | **`Validators.required`, `Validators.maxLength(200)`, `whitespaceOnlyValidator`** — **NO duplicate-title validator** | Context §"Duplicate task titles within a column are ALLOWED" (explicit) and §"CreateTaskDto.title max is 200 chars" (explicit — NOT 100). `whitespaceOnlyValidator` already exists and is reused. |
| **D12** | POST body shape | **`{ title: <trimmed> }` only** | Context §"Minimal field set: title only" — `content` and `assignedId` are out of scope (both optional on the backend). `taskOrder` is NOT sent (backend assigns it — context §"taskOrder is not in CreateTaskDto"). |

---

## Component Architecture

### Routing
**No routing changes.** This feature operates entirely within the existing `/board/:projectId` route owned by `BoardPageComponent`.

### Component Hierarchy

**Smart Components (unchanged ownership; new responsibilities):**
- `BoardPageComponent` ([`KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts))
  - Already owns: board lifecycle, column fetch, optimistic-drop orchestration, add-column flow (#77), task-detail drawer state, move-error strip.
  - NEW: owns the per-column add-task drafts (`taskDrafts` signal — see D5), HTTP `createTask` orchestration (`handleAddTaskSubmit`), open/cancel handlers, focus restoration.

**Presentational Components:**
- `BoardColumnComponent` ([`.../components/board-column/board-column.component.ts`](../../KanbAI-Web/src/app/features/board/components/board-column/board-column.component.ts))
  - Already presentational (no HTTP, no state-service injection); stays presentational.
  - NEW inputs:
    - `addTaskOpen: boolean` — is this column's add-task form currently open?
    - `addTaskSubmitting: boolean` — is this column's create-task HTTP call in flight?
    - `addTaskError: string | null` — inline server-error copy for this column.
  - NEW outputs:
    - `addTaskRequested: EventEmitter<void>` — user clicked "Add task" trigger (parent should flip `addTaskOpen` to true for this column).
    - `addTaskSubmitted: EventEmitter<string>` — form emitted a valid trimmed title.
    - `addTaskCancelled: EventEmitter<void>` — user cancelled the form.
  - NEW template: footer slot rendered below the task list. When `addTaskOpen()` is false, renders an "Add task" `<button>` trigger; when true, renders `<app-board-add-task>` inline. Parent-owned template.
- **NEW:** `BoardAddTaskComponent` ([`.../components/board-add-task/board-add-task.component.ts`](../../KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.ts))
  - Mirror-twin of `BoardAddColumnComponent`: standalone, `ChangeDetectionStrategy.OnPush`, owns a single `FormControl<string>` with `required + maxLength(200) + whitespaceOnly`, auto-focuses on `afterNextRender`, emits `submitted(trimmed)` / `cancelled()`, accepts `submitting` and `submitError` inputs.
  - Does NOT know about columns; does NOT know about existing task titles (no duplicate validator per D11).

### New Files to Create
- `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.html`
- `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.scss`
- `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.spec.ts`

### Files to Modify
- `KanbAI-Web/src/app/features/board/models/task.model.ts` — add `CreateTaskDto`, `TaskCreateResponse`.
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts` — add `createTask`, export `mapTaskCreateErrorToUserMessage`, broaden `TaskOperation` (or leave existing type as move-only and add a new operation type if needed — see Service Integration § below).
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts` — extend with `createTask` + mapper cases.
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` — add `applyCreatedTask(projectId, dto)` + private `appendBoardTaskIfNew(projectId, dto)` helper; refactor `onTaskCreated` to delegate to the same helper (minimal edit — behavior-preserving).
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts` — add tests for `applyCreatedTask`.
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.ts` — add inputs + outputs described above.
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.html` — render the footer slot (trigger or inline form).
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss` — footer slot styles (design-spec will provide the visual tokens).
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.spec.ts` — extend with footer-slot + event-emission tests.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` — add `taskDrafts` signal + `openAddTaskFlow`, `handleAddTaskSubmit`, `handleAddTaskCancel`, focus helpers, announce-on-success.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html` — bind the new `BoardColumnComponent` inputs/outputs in the `@for` loop.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` — extend with add-task orchestration coverage.

---

## State & Data Layer

### State Management Strategy

**Component-local (inside `BoardAddTaskComponent`):** a single `FormControl<string>` with `nonNullable: true`. Mirrors `BoardAddColumnComponent`.

**Page-level (inside `BoardPageComponent`):** a single `WritableSignal<TaskDraftMap>` keyed by `columnId`, with per-column open/submitting/error state. Introducing a single map (vs. three separate maps) keeps all per-column transient state adjacent and the derived slices trivial to compute.

```typescript
// New in BoardPageComponent
interface TaskDraftState {
  open: boolean;
  submitting: boolean;
  error: string | null;
}
type TaskDraftMap = Record<string, TaskDraftState>;

// Default slice for columns the user has never opened.
const EMPTY_DRAFT: TaskDraftState = { open: false, submitting: false, error: null };

readonly taskDrafts = signal<TaskDraftMap>({});

// Derived per-column accessors — called inline in the template.
draftFor(columnId: string): TaskDraftState {
  return this.taskDrafts()[columnId] ?? EMPTY_DRAFT;
}
```

**Rationale for `Record<columnId, state>` vs. Map/Signal-of-signals:** A plain record keyed by id is the simplest shape Angular's template can consume via a method call (`draftFor(column.id)`), and it composes with OnPush because the map reference is replaced on every mutation. A `Map<string, TaskDraftState>` works equally well but adds boilerplate in specs (constructing fixtures, asserting). Signal-of-signals is rejected as over-engineered for ≤ ~10 columns.

**Global state (`BoardStateService`):** unchanged shape. The new `applyCreatedTask` only delegates to a private `appendBoardTaskIfNew(projectId, TaskResponseDto)` helper. `onTaskCreated` is refactored to delegate to the same helper — a behavior-preserving refactor that guarantees both paths follow identical dedupe semantics (see "Files to Modify" above).

### TypeScript Interfaces

**File:** `KanbAI-Web/src/app/features/board/models/task.model.ts` (modify)

```typescript
import { ApiResponse } from '../../projects/models/project.model';

/** Task shape returned by move/create endpoints. Unchanged. */
export interface TaskResponseDto { /* existing */ }

/** Move request body. Unchanged. */
export interface MoveTaskDto { /* existing */ }

/** Envelope alias for the move endpoint. Unchanged. */
export type TaskMoveResponse = ApiResponse<TaskResponseDto>;

/**
 * NEW — Request body for `POST /api/task/column/{columnId}`. Mirrors the
 * backend `CreateTaskDto` shape at .claude/backend_api_map.md:270-276.
 *
 * Issue #78 only populates `title`; `content` and `assignedId` are
 * optional on the backend and explicitly out of scope — the client omits
 * them on create. `taskOrder` is NOT part of the DTO: the backend
 * assigns it server-side.
 */
export interface CreateTaskDto {
  title: string;
  content?: string | null;
  assignedId?: string | null;
}

/** NEW — Envelope alias for the single-DTO create response. */
export type TaskCreateResponse = ApiResponse<TaskResponseDto>;
```

**File (new):** NONE needed for component-local viewmodels — `TaskDraftState` lives in-line in `BoardPageComponent` (it is transient UI state, not a domain type).

---

## Service Integration

### `TasksApiService.createTask` (new method)

**File:** `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts`

**Method signature:**

```typescript
/**
 * `POST /api/task/column/{columnId}` — creates a task inside the target
 * column. Returns the created `TaskResponseDto`.
 *
 * Envelope unwrap mirrors `ColumnsApiService.createColumn` (issue #77):
 *  - `success: false` or `data == null` → observable error.
 *  - `success: true` with non-null data → unwrapped DTO.
 *
 * Service does NOT retry, does NOT translate errors — callers
 * (BoardPageComponent) own user-copy via `mapTaskCreateErrorToUserMessage`.
 */
createTask(columnId: string, dto: CreateTaskDto): Observable<TaskResponseDto>;
```

**Implementation contract:**
- URL: `${this.apiUrl}/column/${encodeURIComponent(columnId)}` where `this.apiUrl` is the existing `${environment.apiUrl}/task` — so the final URL is `${environment.apiUrl}/task/column/{columnId}`.
- HTTP verb: `POST`.
- Body: `CreateTaskDto` (title only per D12).
- Response unwrap: identical to `createColumn` — throw when `!response.success || response.data == null` using `response.errors?.[0] ?? response.message ?? 'Request failed'` as the error message.

### `mapTaskCreateErrorToUserMessage` (new export in the same file)

**Signature:** `export function mapTaskCreateErrorToUserMessage(error: unknown): string;`

**Status branch contract (verbatim strings — freeze in spec):**

| `error` | Returns |
|---|---|
| `HttpErrorResponse { status: 0 }` | `"We couldn't reach the server. Please check your connection and try again."` |
| `HttpErrorResponse { status: 401 \| 403 }` (403 here is "not a project member") | 401 → `"Your session has expired. Please sign in again."`; 403 → `"You are no longer a member of this project and cannot add tasks."` |
| `HttpErrorResponse { status: 404 }` (column gone) | `"We couldn't add this task — the column no longer exists."` |
| `HttpErrorResponse { status: 400 }` | `"We couldn't add this task. Please check the title and try again."` |
| `HttpErrorResponse { status: >= 500 }` | `"Something went wrong on our end. Please try again in a moment."` |
| Other `HttpErrorResponse` (e.g. 418) | `"We couldn't add this task. Please try again."` |
| Plain `Error` (envelope failure) | `"We couldn't add this task. Please try again."` |
| Anything else | `"We couldn't add this task. Please try again."` |

**Note:** 401/403 are normally absorbed by `authInterceptor` (redirect to login). The mapping is defensive — if the interceptor is ever bypassed, the UI has a user-readable fallback. Never exposes status codes, URLs, stack traces, envelope `errors[]` arrays.

### `BoardStateService.applyCreatedTask` (new public method)

**File:** `KanbAI-Web/src/app/features/board/state/board-state.service.ts`

**Signature:**

```typescript
/**
 * Public entry point for HTTP-driven task creates (issue #78). The caller
 * passes the full `TaskResponseDto` returned by `TasksApiService.createTask`;
 * the method projects it to a `BoardTask` (dropping `createdAt`/`updatedAt`)
 * and delegates to the shared `appendBoardTaskIfNew` helper so this path
 * and the SignalR `onTaskCreated` echo path agree on dedupe semantics.
 *
 * Behaviour:
 *  - No-op when `projectId !== currentProjectId`.
 *  - No-op when the target column is not in state (e.g. ColumnDeleted
 *    arrived between HTTP submit and HTTP 201).
 *  - No-op when a task with the same id already exists in that column's
 *    bucket (idempotent; makes the HTTP-success + SignalR-echo sequence
 *    safe on the client's own create).
 *  - Otherwise appends and re-sorts by `taskOrder` ascending.
 */
applyCreatedTask(projectId: string, dto: TaskResponseDto): void;
```

**Private helper (extracted from `onTaskCreated`):**

```typescript
private appendBoardTaskIfNew(projectId: string, task: BoardTask): void {
  if (projectId !== this.getState().currentProjectId) return;
  const column = this.getState().columns.find(c => c.id === task.columnId);
  if (!column) return;
  const bucket = this.getState().tasksByColumnId[task.columnId] ?? [];
  if (bucket.some(t => t.id === task.id)) return;
  const next = [...bucket, task].sort((a, b) => a.taskOrder - b.taskOrder);
  this.setState({
    tasksByColumnId: {
      ...this.getState().tasksByColumnId,
      [task.columnId]: next
    }
  });
}
```

**`onTaskCreated` refactor** — now a thin projection + delegation, preserving existing behaviour:

```typescript
private onTaskCreated(evt: TaskCreatedEvent): void {
  if (!evt || this.getState().currentProjectId === null) return;
  this.appendBoardTaskIfNew(this.getState().currentProjectId!, {
    id: evt.id,
    title: evt.title,
    content: evt.content,
    taskOrder: evt.taskOrder,
    columnId: evt.columnId,
    assignedId: evt.assignedId
  });
}
```

### HTTP Contracts Summary

| Method | Endpoint | Request Body | Response (unwrap target) | Error codes handled |
|--------|----------|--------------|--------------------------|---------------------|
| POST | `/api/task/column/{columnId}` | `CreateTaskDto` (`{ title }`) | `TaskResponseDto` | 0, 400, 401, 403, 404, 5xx, generic 4xx, envelope failure |

---

## Board-Page Orchestration

### New state (additions to `BoardPageComponent`)

```typescript
// --- Issue #78 — add-task flow ---

readonly taskDrafts = signal<TaskDraftMap>({});

/**
 * Map of columnId → HTMLButtonElement for the "Add task" trigger
 * in each column. Populated via a @ViewChildren QueryList on a template
 * variable #addTaskTrigger placed on each trigger button, OR (simpler)
 * via a callback output from BoardColumnComponent that hands the
 * ElementRef up to the page. See Implementation Steps for the chosen
 * shape.
 */
private addTaskTriggers = new Map<string, HTMLButtonElement>();
```

### New handlers

```typescript
openAddTaskFlow(columnId: string): void;
handleAddTaskSubmit(columnId: string, trimmedTitle: string): void;
handleAddTaskCancel(columnId: string): void;
```

**`openAddTaskFlow(columnId)` contract:**
1. Write `{ open: true, submitting: false, error: null }` into `taskDrafts()[columnId]` (replacing any prior state for that column — importantly clearing a stale `error`).
2. `BoardAddTaskComponent` auto-focuses its input via its own `afterNextRender`. No explicit focus call here.

**`handleAddTaskSubmit(columnId, trimmedTitle)` contract:**
1. Guard: if `this.boardState.currentProjectId() === null` → return silently.
2. Guard: if the current column's `submitting` flag is already true → return silently (prevents double-POST per context AC §"Rapid double-submit (double-click, double-Enter) MUST NOT produce two POSTs").
3. Guard: if the column is no longer in `this.columns()` → write a stale-column error to `taskDrafts[columnId].error` (via `mapTaskCreateErrorToUserMessage(new HttpErrorResponse({ status: 404 }))` to reuse the copy) and return. (Concurrency window between SignalR ColumnDeleted and user submit.)
4. Write `{ open: true, submitting: true, error: null }` to the draft slot (clearing prior error copy).
5. Call `this.tasksApi.createTask(columnId, { title: trimmedTitle })` with `takeUntilDestroyed(this.destroyRef)`.
6. On `next(dto)`:
   - `this.boardState.applyCreatedTask(projectId, dto)` — appends locally (SignalR echo will be deduped by id).
   - Write `{ open: false, submitting: false, error: null }` to the draft slot.
   - `this.announce(\`Task '${dto.title}' added to ${columnName}.\`)` — `columnName` looked up from `this.columns().find(c => c.id === columnId)?.name ?? 'column'`.
   - `queueMicrotask(() => this.focusAddTaskTrigger(columnId))` (D8).
7. On `error(err)`:
   - Write `{ open: true, submitting: false, error: mapTaskCreateErrorToUserMessage(err) }` to the draft slot (form stays open with typed value preserved — child-component state).

**`handleAddTaskCancel(columnId)` contract:**
1. Write `{ open: false, submitting: false, error: null }` to the draft slot.
2. `queueMicrotask(() => this.focusAddTaskTrigger(columnId))` (mirror #77 cancel behavior).

**Focus helper:**

```typescript
private focusAddTaskTrigger(columnId: string): void {
  this.addTaskTriggers.get(columnId)?.focus();
}
```

**Trigger registration:** a `registerAddTaskTrigger` method on `BoardPageComponent` stored in `this.addTaskTriggers` as columns mount. Implementation approach: add an output `triggerRegistered = new EventEmitter<{ columnId: string; element: HTMLButtonElement }>()` on `BoardColumnComponent` that fires from `afterNextRender` (or via `@ViewChild` setter). **Alternative (simpler):** omit the registration plumbing entirely and instead have `BoardColumnComponent` manage its own post-submit focus internally — parent emits a `taskCreated`-style ping signal and the column's own DOM handles focus restoration. Chosen approach for this spec: **parent keeps the map** so the implementation mirrors #77's explicit `@ViewChild('trailingAddButton')` pattern. Developer may switch to an in-column DOM approach if it simplifies the implementation without regressing the AC — document choice in the developer handoff.

---

## Component Contracts (Inputs/Outputs)

### `BoardColumnComponent` — additions

```typescript
// NEW inputs (ADD to existing inputs)
readonly addTaskOpen = input<boolean>(false);
readonly addTaskSubmitting = input<boolean>(false);
readonly addTaskError = input<string | null>(null);

// NEW outputs (ADD to existing outputs)
readonly addTaskRequested = output<void>();
readonly addTaskSubmitted = output<string>();
readonly addTaskCancelled = output<void>();

// NEW: element ref for the trigger button, registered with the parent.
// Implementation detail — see "Trigger registration" in the orchestration
// section above.
```

### `BoardColumnComponent` — template additions (footer slot)

Pseudo-shape (actual markup / classes are web-designer-phase concerns):

```html
<!-- existing header + accent + list -->

<!-- NEW footer slot, rendered AFTER the task list. -->
<footer class="board-column__footer">
  @if (addTaskOpen()) {
    <app-board-add-task
      [submitting]="addTaskSubmitting()"
      [submitError]="addTaskError()"
      (submitted)="addTaskSubmitted.emit($event)"
      (cancelled)="addTaskCancelled.emit()"
    />
  } @else {
    <button
      #addTaskTrigger
      type="button"
      class="board-column__add-task"
      [attr.aria-label]="'Add task to ' + column().name"
      (click)="addTaskRequested.emit()"
    >
      Add task
    </button>
  }
</footer>
```

Accessible name uses `aria-label` so the button is unambiguous for screen-reader users when columns have similar names (AC §"accessible name that is not icon-only (e.g. visible 'Add task' text or aria-label='Add task to <column name>')").

### `BoardAddTaskComponent` — full contract

**Selector:** `app-board-add-task`

**Inputs:**
- `submitting: boolean` — disables controls; swaps submit label to `"Adding…"`.
- `submitError: string | null` — inline server-error copy (rendered with `role="alert"`), `null` hides.

**Outputs:**
- `submitted: EventEmitter<string>` — emits the trimmed, validated title on valid Enter / submit click.
- `cancelled: EventEmitter<void>` — emits on Escape / Cancel button.

**Internal state:**
- `nameControl: FormControl<string>` with validators `[Validators.required, Validators.maxLength(200), whitespaceOnlyValidator]`. `nonNullable: true`.
- NO `effect()` watching any outside signal (no duplicate-existing-names input — context forbids duplicate-title validator per D11).

**Keyboard contract:**
- Enter (inside the form's `<input>`) → native `(submit)` fires → `onSubmit`.
- Escape (anywhere in the form) → `onCancel` via `(keydown)` handler.

**Focus:**
- `afterNextRender` focuses the native `<input>` inside the wrapped `FormInputComponent`. Same pattern as `BoardAddColumnComponent`.

**Template shape:** Identical to `board-add-column.component.html` MINUS the duplicate-name error block; `FormInputComponent` with `label="Task title"`, `placeholder="e.g. Wire up onboarding flow"`, `[required]="true"`, `[control]="nameControl"`.

**Submit button label:** `Add` / `Adding…` during pending. Cancel button label: `Cancel`. Identical to #77's visual affordances for pattern consistency (the web-designer phase may retune the visual weight — e.g. make "Add task" a less prominent secondary button than "Add column" — but the copy stays).

---

## SignalR Echo Dedupe (no regressions to #46)

- The client's own `TasksApiService.createTask` call returns HTTP 201 with a `TaskResponseDto`. `handleAddTaskSubmit.next` immediately calls `applyCreatedTask` → `appendBoardTaskIfNew` → **append happens**.
- Moments later, the server broadcasts `TaskCreated` via SignalR. `onTaskCreated` fires → now delegates to the **same** `appendBoardTaskIfNew` helper → **no-op** because the id is already in the bucket.
- A `TaskCreated` from **another user** in the same column hits `onTaskCreated` → not in bucket → **appends**. User's own `applyCreatedTask` was never called for this id. Still single-insert.
- A `TaskCreated` from **another project** would only arrive if the client were in that project's group — not our concern; `appendBoardTaskIfNew`'s `projectId !== currentProjectId` guard also catches it.

All three paths converge on the same dedupe helper — the refactor is behavior-preserving and the new HTTP path cannot introduce a divergent append.

---

## Accessibility Contract

| Requirement | Implementation |
|---|---|
| Trigger is keyboard-focusable, activatable on Enter/Space | Native `<button type="button">` — both keys activate by default. |
| Trigger has an accessible name | `aria-label="Add task to <column name>"`. Visible "Add task" text also present. |
| Input has an associated label | `FormInputComponent` renders a `<label for="…">`. `label="Task title"`. |
| Input auto-focuses on open within one render cycle | `afterNextRender` in `BoardAddTaskComponent` (same pattern as #77). |
| Inline validation error on `maxLength`, `required`, `whitespaceOnly` | `FormInputComponent` already renders the inline error using its `describedBy`/`aria-describedby` wiring. |
| `aria-invalid` when invalid + dirty/touched | `FormInputComponent` manages this. |
| Submit disabled while invalid or submitting | `[disabled]="nameControl.invalid || submitting()"`. |
| Escape cancels without API call | `onKeydown` → `preventDefault` + emit `cancelled`. |
| Focus returns to trigger on cancel/success | `queueMicrotask(() => this.focusAddTaskTrigger(columnId))` (D8). |
| Successful create announced to screen readers | Reuse `this.dragAnnouncement` → `Task '<title>' added to <column name>.` (D7). |
| Zero-column board renders no affordance | Guarded by the existing `@if (columns().length === 0)` branch in [`board-page.component.html:50-80`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L50-L80) — `BoardColumnComponent` never mounts when there are zero columns. No extra guard needed inside the column. |
| Color contrast ≥ 4.5:1 body / 3:1 non-text | Delivered by the web-designer phase using existing tokens (`$brand-primary`, `$text-inverse`, etc. — same tokens as `.board-add-column__submit`). |

---

## Implementation Steps

Follow these in order.

### 1. Type Definitions
- [ ] Open [`KanbAI-Web/src/app/features/board/models/task.model.ts`](../../KanbAI-Web/src/app/features/board/models/task.model.ts).
- [ ] Add `CreateTaskDto` interface with `title: string`, `content?: string | null`, `assignedId?: string | null`.
- [ ] Add `TaskCreateResponse = ApiResponse<TaskResponseDto>`.
- [ ] No changes to existing `TaskResponseDto`, `MoveTaskDto`, `TaskMoveResponse`.

### 2. Service Layer — `TasksApiService.createTask` + `mapTaskCreateErrorToUserMessage`
- [ ] Open [`KanbAI-Web/src/app/features/board/services/tasks-api.service.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts).
- [ ] Import `CreateTaskDto`, `TaskCreateResponse` from `../models/task.model`.
- [ ] Add `createTask(columnId: string, dto: CreateTaskDto): Observable<TaskResponseDto>`:
  - URL: `${this.apiUrl}/column/${encodeURIComponent(columnId)}`.
  - `this.http.post<TaskCreateResponse>(url, dto)`.
  - `.pipe(map(response => { if (!response.success || response.data == null) throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed'); return response.data; }))`.
- [ ] Add exported function `mapTaskCreateErrorToUserMessage(error: unknown): string` returning the verbatim strings in the HTTP Contracts table above.

### 3. Service Tests — `tasks-api.service.spec.ts`
- [ ] Open [`KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts).
- [ ] Add a `describe('createTask()')` block mirroring the existing `describe('moveTask()')` block:
  - Issues POST to `/task/column/{columnId}` (assert `req.request.method === 'POST'`, body shape, URL encoding of `columnId`).
  - Unwraps `{ success: true, data }` on success.
  - `{ success: false }` → observable `Error`.
  - `{ success: true, data: null }` → observable `Error`.
  - 500 surfaces as `HttpErrorResponse`.
- [ ] Add a `describe('mapTaskCreateErrorToUserMessage()')` block with one case per status branch in the HTTP Contracts table.

### 4. State Service — `BoardStateService.applyCreatedTask`
- [ ] Open [`KanbAI-Web/src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts).
- [ ] Extract `appendBoardTaskIfNew(projectId, BoardTask)` private helper with the three guards (project match, column known, id not already in bucket) + sort. See "Service Integration" for the exact shape.
- [ ] Refactor `onTaskCreated` to project the event into a `BoardTask` and delegate to `appendBoardTaskIfNew`. Assert manually that the behavior is unchanged by re-running `board-state.service.spec.ts`.
- [ ] Add public `applyCreatedTask(projectId: string, dto: TaskResponseDto): void` that projects the DTO to a `BoardTask` (drop `createdAt`/`updatedAt`) and delegates to `appendBoardTaskIfNew`.

### 5. State Service Tests
- [ ] Open `board-state.service.spec.ts`.
- [ ] Add a `describe('applyCreatedTask()')` block covering:
  - No-op when `projectId !== currentProjectId`.
  - No-op when the target column is not in state.
  - No-op when a task with the same id already exists in that bucket.
  - Appends + sorts by `taskOrder` ascending when new.
- [ ] Re-verify the existing `onTaskCreated` specs still pass after the refactor (they should — behavior-preserving delegation).

### 6. `BoardAddTaskComponent`
- [ ] Create the directory `KanbAI-Web/src/app/features/board/components/board-add-task/`.
- [ ] Create `board-add-task.component.ts` — standalone, `ChangeDetectionStrategy.OnPush`, following the shape in "Component Contracts" above.
  - Imports: `CommonModule`, `ReactiveFormsModule`, `FormInputComponent` (from `../../../auth/components/form-input/form-input.component`).
  - Single `FormControl<string>` with `required + maxLength(200) + whitespaceOnly`. Use the existing `whitespaceOnlyValidator` from `../../../projects/validators/whitespace.validator`.
  - `afterNextRender` focuses the native `<input>` nested inside the `FormInputComponent`'s host wrapper (same DOM query pattern as `BoardAddColumnComponent` lines 110-117).
  - `onSubmit(event?: Event)` — `preventDefault`, `markAsTouched/Dirty`, guard on invalid/submitting, emit trimmed value.
  - `onKeydown(event: KeyboardEvent)` — Escape → `preventDefault` + cancel.
- [ ] Create `board-add-task.component.html` — identical structure to `board-add-column.component.html` MINUS the duplicate-name error block. Label: `Task title`, placeholder: `e.g. Wire up onboarding flow`.
- [ ] Create `board-add-task.component.scss` — deliverable by the web-designer phase. For the implementation pass, reuse the BEM-shaped class names and base layout from `board-add-column.component.scss` (see that file 1-232). The design phase may retune spacing/typography.
- [ ] Create `board-add-task.component.spec.ts` — cover: valid submit emits trimmed value, invalid submit does not emit, Escape emits cancelled, Enter inside input submits, `submitting` input disables controls and swaps label to `Adding…`, `submitError` input renders the alert paragraph.

### 7. `BoardColumnComponent` — extend
- [ ] Open [`board-column.component.ts`](../../KanbAI-Web/src/app/features/board/components/board-column/board-column.component.ts).
- [ ] Add three new inputs (`addTaskOpen`, `addTaskSubmitting`, `addTaskError`) and three new outputs (`addTaskRequested`, `addTaskSubmitted`, `addTaskCancelled`).
- [ ] Add `BoardAddTaskComponent` to the component's `imports` array.
- [ ] (If chosen by developer) wire up a `ViewChild('addTaskTrigger', { read: ElementRef })` setter that, on set, emits a `triggerRegistered` output to the parent. Alternative shape acceptable — see "Trigger registration" note in orchestration section.
- [ ] Edit `board-column.component.html` to render the new footer slot (trigger button or `<app-board-add-task>` inline) AFTER the `.board-column__list` block. Do NOT modify the existing CDK drop-list wiring or the empty-zone hint paragraph.
- [ ] Edit `board-column.component.scss` to style the `.board-column__footer` + `.board-column__add-task` — web-designer will deliver final visuals; base layout may reuse `.board-add-column` paddings.
- [ ] Extend `board-column.component.spec.ts` with:
  - Trigger is rendered when `addTaskOpen()` is false.
  - `<app-board-add-task>` is rendered when `addTaskOpen()` is true.
  - Clicking the trigger emits `addTaskRequested`.
  - `addTaskSubmitted` output forwards the title string from the child's `submitted` emission.
  - `addTaskCancelled` output forwards the child's `cancelled` emission.
  - Trigger's `aria-label` is `Add task to <column name>`.
- [ ] Preserve all existing CDK behaviour — the drop-list wiring at template lines 13-22 stays untouched.

### 8. `BoardPageComponent` — orchestration
- [ ] Open [`board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts).
- [ ] Import `TasksApiService`, `mapTaskCreateErrorToUserMessage`, `CreateTaskDto`, `TaskResponseDto` (TasksApiService already injected — only the new mapper + DTOs need importing).
- [ ] Declare the `TaskDraftState` interface and `EMPTY_DRAFT` constant inside the component file (private / file-scoped — not exported).
- [ ] Add `taskDrafts = signal<TaskDraftMap>({})` and `draftFor(columnId)` accessor.
- [ ] Add `addTaskTriggers = new Map<string, HTMLButtonElement>()` and `focusAddTaskTrigger(columnId)` helper.
- [ ] Implement `openAddTaskFlow(columnId)`, `handleAddTaskSubmit(columnId, title)`, `handleAddTaskCancel(columnId)` per the contracts in "Board-Page Orchestration" above.
- [ ] Wire `takeUntilDestroyed(this.destroyRef)` on the `createTask` subscription (mirrors `handleTaskDropped` and `handleAddColumnSubmit`).
- [ ] Edit `board-page.component.html` to pass the new inputs and bind the new outputs inside the `@for (column of columns(); track column.id)` loop:
  - `[addTaskOpen]="draftFor(column.id).open"`
  - `[addTaskSubmitting]="draftFor(column.id).submitting"`
  - `[addTaskError]="draftFor(column.id).error"`
  - `(addTaskRequested)="openAddTaskFlow(column.id)"`
  - `(addTaskSubmitted)="handleAddTaskSubmit(column.id, $event)"`
  - `(addTaskCancelled)="handleAddTaskCancel(column.id)"`
  - (If chosen) `(triggerRegistered)="addTaskTriggers.set($event.columnId, $event.element)"` — or whatever wiring matches the `BoardColumnComponent` implementation choice in step 7.

### 9. `BoardPageComponent` tests
- [ ] Extend `board-page.component.spec.ts` with:
  - `openAddTaskFlow(columnId)` sets the slot to `{ open: true, submitting: false, error: null }` and clears any prior error.
  - `handleAddTaskSubmit` issues a single POST with the expected body (`{ title }` only, trimmed).
  - Double-submit is idempotent (second call is a silent no-op while `submitting === true`).
  - HTTP 201 → `applyCreatedTask` invoked, slot resets, `dragAnnouncement` equals `Task '<title>' added to <column name>.`, trigger is refocused.
  - HTTP 500 → slot becomes `{ open: true, submitting: false, error: '<mapped copy>' }`, no append, focus NOT moved.
  - HTTP 404 → slot becomes `{ open: true, submitting: false, error: '<404 copy>' }`.
  - `handleAddTaskCancel(columnId)` closes the slot with no POST, restores focus to the trigger.
  - SignalR `TaskCreated` echo for a just-HTTP-created task does not double-insert.
  - `takeUntilDestroyed` is exercised — component destroyed mid-request does not throw or leak.
  - A `handleAddTaskSubmit` for a `columnId` that is no longer in `this.columns()` writes the 404-equivalent copy to the draft slot and does NOT issue a POST.

### 10. Build & Test Verification
- [ ] `npm run build` must succeed with no new errors or warnings.
- [ ] `npm run test -- --watch=false` must pass with no INTRODUCED failures. Fix any regressions before completion.
- [ ] Manually smoke-test the flow in `ng serve`:
  1. Open an existing board with ≥1 column.
  2. Click "Add task" on a column → input appears focused.
  3. Type a title, press Enter → card appears at end of column, count increments, form closes, focus returns to "Add task" trigger.
  4. Click "Add task" again, type, Escape → form closes, no network call (verify in DevTools → Network).
  5. Type a 201-char title → submit disabled, inline `maxLength` error shown.
  6. Type whitespace only → submit disabled, required/whitespace error shown.
  7. Offline simulation (DevTools → Network → Offline) → submit a valid title → inline error shown, typed value preserved, submit re-enabled on network restore.
- [ ] Update this file with a `## Development Status` appendix once implementation is complete (follow CLAUDE.md convention).

---

## QA Guidance

### Test strategy

**Unit tests** (Vitest + `HttpClientTestingModule`):
- `TasksApiService.createTask` — URL, method, body, envelope unwrap, error surfacing (5 tests, mirroring `moveTask`).
- `mapTaskCreateErrorToUserMessage` — one case per HTTP status branch (8 tests).
- `BoardStateService.applyCreatedTask` — 4 tests (project-mismatch no-op, unknown-column no-op, known-id no-op, new-id append-and-sort).
- `BoardAddTaskComponent` — 8 tests (valid emit, invalid block, required/whitespace/maxLength validators, Escape emits cancelled, submitting disables + label swap, submitError renders alert).
- `BoardColumnComponent` — 6 added tests (trigger renders when closed, form renders when open, click emits requested, submitted forwarding, cancelled forwarding, aria-label content).
- `BoardPageComponent` — 12 added tests listed in Implementation Step 9 above.

**Integration/E2E** (out of scope for this ticket — no Cypress suite exists yet; Implementation Step 10 covers manual smoke coverage).

### Mocking patterns

```typescript
// In board-page.component.spec.ts — mock TasksApiService.createTask
const createSpy = vi.fn().mockReturnValue(of(taskResponseDtoFixture));
TestBed.configureTestingModule({
  providers: [
    { provide: TasksApiService, useValue: { createTask: createSpy, moveTask: vi.fn() } },
    // …existing providers
  ]
});
```

### Edge cases to exercise in tests

- Title with leading/trailing whitespace — trimmed before sent.
- Title at exactly 200 characters — accepted.
- Title at 201 characters — rejected with inline `maxLength` error, no POST.
- Rapid double-click/double-Enter — one POST only.
- Column deleted (SignalR) while add-task form is open — no crash when `handleAddTaskSubmit` encounters a stale `columnId`.
- Successful create on column A does not clear the open form on column B (concurrent open per D6).

---

## Design Validation (Self-Check)

**Interface Alignment:**
- [x] `CreateTaskDto` matches the backend contract at `.claude/backend_api_map.md:270-276` (title required max 200, content/assignedId optional).
- [x] `TaskCreateResponse = ApiResponse<TaskResponseDto>` mirrors `ColumnCreateResponse = ApiResponse<ColumnResponseDto>`.
- [x] All new interface properties typed correctly (no `any`).
- [x] Optional fields on `CreateTaskDto` marked with `?` + `| null` to match the C# `string?` / `Guid?` nullables.

**Standards Compliance:**
- [x] Uses `inject()` throughout (no constructor injection).
- [x] `FormControl<string>` with `nonNullable: true` — matches #77.
- [x] `ChangeDetectionStrategy.OnPush` on every new component.
- [x] Signals for UI state, RxJS for HTTP, bridge via `takeUntilDestroyed`.
- [x] `afterNextRender` for auto-focus — modern Angular idiom (same as #77).

**Security:**
- [x] Board page already sits behind `authGuard` (existing #13 infrastructure); no new route introduced.
- [x] All input goes through Reactive Forms validators — no raw DOM input, no `innerHTML`.
- [x] Error mapper never exposes status codes, URLs, stack traces, or raw envelope `errors[]`.
- [x] `encodeURIComponent(columnId)` on the URL path (mirrors `moveTask`).
- [x] No new local-storage/session-storage usage; no PII logged.

**Completeness:**
- [x] Every AC group in the context doc has a corresponding section or implementation step here.
- [x] Every "tech-spec decision" call-out in the context doc is resolved in the Key Design Decisions table.
- [x] Every new file listed under "New Files to Create"; every modification listed under "Files to Modify".
- [x] Implementation steps in dependency order (types → service → state → presentational → smart-parent).
- [x] SignalR echo dedupe path documented with a walkthrough of all three concurrency scenarios.

---

*The technical specification is saved. You can now instruct the web-designer agent to read the tech spec and create the design specification.*

---

## Development Status

**Implementation Date:** 2026-05-07
**Developer:** Claude Opus 4.7

### Files Created
- `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.html`
- `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.scss`
- `KanbAI-Web/src/app/features/board/components/board-add-task/board-add-task.component.spec.ts`

### Files Modified
- `KanbAI-Web/src/app/features/board/models/task.model.ts` — added `CreateTaskDto` and `TaskCreateResponse`.
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts` — added `createTask()` method and `mapTaskCreateErrorToUserMessage()` export.
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts` — added tests for `createTask` (5) and `mapTaskCreateErrorToUserMessage` (9).
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` — refactored `onTaskCreated` to delegate to a shared private `appendBoardTaskIfNew` helper; added public `applyCreatedTask` entry point.
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts` — added tests for `applyCreatedTask` (7 cases).
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.ts` — added `addTaskOpen` / `addTaskSubmitting` / `addTaskError` inputs, `addTaskRequested` / `addTaskSubmitted` / `addTaskCancelled` outputs, and `addTaskTriggerId` / `addTaskTriggerLabel` computeds.
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.html` — added footer slot hosting the trigger button or `<app-board-add-task>` inline.
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.scss` — added `.board-column__footer`, `.board-column__list:has(+ .board-column__footer)`, and `.board-column__add-task` rules from the design spec.
- `KanbAI-Web/src/app/features/board/components/board-column/board-column.component.spec.ts` — added footer-slot tests covering trigger rendering, form rendering, event forwarding, stable DOM id, and aria-label content (7 new tests).
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` — added `TaskDraftState` / `TaskDraftMap` types, `taskDrafts` signal + `draftFor` accessor, `openAddTaskFlow` / `handleAddTaskSubmit` / `handleAddTaskCancel` handlers, and `focusAddTaskTrigger` DOM-id helper. Imported `HttpErrorResponse` and `mapTaskCreateErrorToUserMessage`.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html` — bound the new `BoardColumnComponent` inputs/outputs inside the `@for` loop.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` — added 14 new tests for the add-task flow (open, submit-success, error branches, guards, cancel, SignalR echo dedupe, unmount-mid-request, concurrent-open). Extended the mocks with `applyCreatedTask` and `createTask`.

### Build & Test Results
- **Build:** ✅ SUCCESS (no new errors or warnings). Pre-existing SCSS strict-unary deprecation warnings on `board-page.component.scss` carry over from prior tickets and are tracked separately.
- **Tests:** 1247 total, 1247 passed, 0 failed. Baseline was 1204 — 43 new tests added, all green.
- **Pre-existing Failures:** None in the final green run.

### Key Implementation Notes

- **Trigger registration uses a stable DOM id (`add-task-trigger-<columnId>`) rather than a ViewChild-emitted output.** An earlier attempt used `@ViewChild('addTaskTrigger', { read: ElementRef })` with a setter emitting a `triggerRegistered` output; Angular's dev-mode `ExpressionChangedAfterItHasBeenChecked` verify pass repeatedly flagged this because the output's template-bound handler triggered a CD retry during the post-commit verify phase. The stable-id approach is simpler: each `BoardColumnComponent` renders its trigger with `[id]="addTaskTriggerId()"` and the parent's `focusAddTaskTrigger` uses `document.getElementById` to locate it. No template event binding, no deferred emission, no cleanup timer — identical UX, lower complexity. The tech spec explicitly allowed this alternative in §"Trigger registration".
- Per-column state is a `WritableSignal<TaskDraftMap>` keyed by `columnId` (D5). The map reference is replaced on every mutation so OnPush CD picks up the change. `draftFor(columnId)` returns the default `EMPTY_DRAFT` slot for columns the user has never opened.
- Double-submit defence is the `if (this.draftFor(columnId).submitting) return;` guard in `handleAddTaskSubmit` — exercised by the "short-circuits when submitting is already true" test.
- Concurrent-open across columns works for free: opening column A only updates `taskDrafts[A]`, leaving `taskDrafts[B]` untouched. Tested directly ("submitting on column A does not close an open form on column B").
- SignalR echo dedupe is preserved: both `onTaskCreated` and the new `applyCreatedTask` delegate to the shared private `appendBoardTaskIfNew` helper, which guards on project match, column-in-state, and id-dedupe. The existing `onTaskCreated` tests continue to pass, confirming the refactor is behaviour-preserving.
- `taskDrafts` is declared `readonly` but marked `public` (not `private`) so tests can seed it via `component.taskDrafts.set(...)` for the "opens the slot and clears any prior error" assertion — matches the convention used for `createColumnError` in the #77 tests.

### Edge Cases Handled
- **Stale column** (SignalR `ColumnDeleted` arrived between open and submit) → writes the 404-equivalent copy to the draft slot and does NOT issue a POST.
- **Double-submit** (double-click / double-Enter) → single POST; second call is a silent no-op while `submitting === true`.
- **Unmount mid-request** → `takeUntilDestroyed(destroyRef)` cancels the subscription; late emissions do not throw.
- **Server 500 / 404 / 400 / 403 / 401 / network 0** → verbatim copy per the mapping table; form stays open with typed value preserved; submit re-enabled.
- **No duplicate-title validator** (tech spec D11) → verified by the absent `.board-add-task__field-error` surface test.

### Known Limitations
- The SCSS budget warning on `board-page.component.scss` (pre-existing, 1.75 kB over) was not touched — out of scope for this ticket.
- The `SignalR service.spec.ts` test suite has flaky behaviour under certain vitest execution orders when unrelated suites run first; this is a pre-existing test-ordering issue unrelated to #78 and passes cleanly on the final consolidated run.

### Manual Smoke Test Checklist (to be run under `ng serve`)
- [ ] Open a board with ≥1 column → "Add task" trigger visible at the bottom of each column.
- [ ] Click the trigger → inline form mounts, native input auto-focused.
- [ ] Type a title + Enter → card appears at end of column, count increments, form closes, focus returns to the trigger.
- [ ] Rapid-add: Space → type → Enter → Space → type → Enter → two cards appended, trigger refocused between.
- [ ] Escape / Cancel → form closes, no network call, focus returns to trigger.
- [ ] Submit a 201-char title → submit disabled, inline maxLength error shown.
- [ ] Submit whitespace-only → submit disabled.
- [ ] Offline (DevTools → Network → Offline) → inline error paragraph shown, typed value preserved.
- [ ] Open form on column A, then column B → both forms visible; submitting A does not close B.

