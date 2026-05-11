# Technical Specification: Description save/clear renders the freshest value on the originating client

**Context Document:** [issue_94_context.md](./issue_94_context.md)
**GitHub Issue:** [#94](https://github.com/Gulybi/KanbAI-Web/issues/94)
**Target branch:** `91-editable-task-descriptions-in-the-task-detail-panel` (follow-up to the merged [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) at commit `b7375e6`)
**Backend contract:** unchanged — [.claude/backend_api_map.md](../../.claude/backend_api_map.md) §Tasks / §`UpdateTaskDescriptionDto` / §`TaskUpdated`

---

## Overview

Client-side-only fix. The originating client today discards the authoritative `TaskResponseDto` returned on `PUT /api/task/{taskId}/description` (200) and the known-null post-state implied by `DELETE /api/task/{taskId}/description` (204), and waits on the `TaskUpdated` SignalR echo to mutate local state. This spec closes that gap by:

1. Applying the authoritative post-save / post-clear task row into `BoardStateService` on the originating client, in the same code path / shape that the `TaskUpdated` SignalR echo writes. A new shared private reconciler (`reconcileTaskById`) is factored out of today's `onTaskUpdated` and re-used by two new public entry points: `applyLocalTaskUpdateFromDto(dto)` (save) and `applyLocalTaskDescriptionCleared(taskId)` (clear).
2. Converting `BoardPageComponent.selectedTask` from a plain snapshot signal into a live `computed()` projection off `boardState.tasksByColumnId()`, keyed by a new `selectedTaskId: WritableSignal<string | null>`. The open task's `content` then re-renders automatically when board state changes — regardless of whether the mutation came from the originating client's apply or a remote echo.
3. Wiring `TaskDescriptionSectionComponent`'s save / clear `next` handlers to call the new `BoardStateService` entry points. Order of operations is specified (state-apply happens after edit-mode exit) so the existing "updated by someone else" banner effect does not misfire on the user's own save.
4. Making the reconciler idempotent via a deep-equality guard: if the proposed `BoardTask` row is field-for-field equal to the currently stored row, the `setState` call is skipped. This absorbs the subsequent `TaskUpdated` echo of the user's own change as a genuine no-op — no extra render, no extra announcement.

Remote-edit semantics (other user edits a task you are viewing / editing) are preserved bit-for-bit because the factored-out `reconcileTaskById` is what `onTaskUpdated` calls — the equality guard only optimises the degenerate case where the proposed row is already what's stored. The conflict banner during mid-edit remote updates is unaffected because it fires off the component-local `effect()` comparing `task().content` vs `contentSnapshot()` while `mode === 'edit'`, and `mode` is `'read'` by the time we apply our own save (`exitEditMode` runs first).

---

## Component Architecture

### Routing

No routing changes. This ticket lives entirely inside the existing `/board/:projectId` route that `BoardPageComponent` owns.

### Component Hierarchy

No new components. No components are deleted. Three existing components are modified:

| Component | File | Change |
|-----------|------|--------|
| `BoardStateService` (service, but listed here for completeness) | [`src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) | Factor out `reconcileTaskById(task: BoardTask)` from `onTaskUpdated`; add public `applyLocalTaskUpdateFromDto(dto: TaskResponseDto)` and `applyLocalTaskDescriptionCleared(taskId: string)` entry points that delegate to the same helper; add a deep-equality guard so idempotent applies are no-ops. |
| `BoardPageComponent` (smart container) | [`src/app/features/board/board-page/board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts) + `.html` | Replace `selectedTask: WritableSignal<BoardTask \| null>` with `selectedTaskId: WritableSignal<string \| null>` + `selectedTask: Signal<BoardTask \| null>` (computed projection off `boardState.tasksByColumnId()`). Template `@if (selectedTask(); as task)` binding is unchanged; the change is invisible to child components. |
| `TaskDescriptionSectionComponent` (smart-presentational hybrid) | [`src/app/features/board/components/task-description-section/task-description-section.component.ts`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts) | Inject `BoardStateService`. In the save `next` handler, capture the emitted `TaskResponseDto`, call `exitEditMode()` first, then `boardState.applyLocalTaskUpdateFromDto(dto)`, then `announce(ANNOUNCE_SAVED)`. In the clear `next` handler, call `boardState.applyLocalTaskDescriptionCleared(taskId)` before `announce(ANNOUNCE_CLEARED)`. No DOM / template changes. No error-path changes. |

### New Files to Create

None.

### Files to Modify

- [`KanbAI-Web/src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts)
- [`KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts)
- [`KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts)

### Spec (test) files that must be updated

The following spec files contain assertions against today's `selectedTask` snapshot behaviour or against the description component's `next` handlers. They MUST be updated by the developer in the same commit so the test suite stays green — see §QA Guidance for the exact assertions.

- [`KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts) — add specs for `applyLocalTaskUpdateFromDto`, `applyLocalTaskDescriptionCleared`, the equality-guard idempotency, and unchanged `onTaskUpdated` behaviour.
- [`KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts) — change `expect(component.selectedTask()).toBe(task)` at line 671 to `.toEqual(task)` / `.toMatchObject({ id: task.id })` since the computed projection returns a different reference than the input; add a new spec asserting that `selectedTask()` re-projects when `tasksByColumnId` changes (e.g. after a `TaskUpdated` echo or an `applyLocalTaskUpdateFromDto` call).
- [`KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.spec.ts`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.spec.ts) — add specs for the save `next` handler calling `boardState.applyLocalTaskUpdateFromDto` with the PUT's DTO, the clear `next` handler calling `boardState.applyLocalTaskDescriptionCleared` with the task id, ordering (exit-edit-mode-before-state-apply so the remote-update banner does not misfire on own save), and error-path regression (no state mutation on 400/403/404/network).

---

## State & Data Layer

### State Management Strategy

**BoardStateService** (global, `@Injectable({ providedIn: 'root' })`):

New surface area — three additions, all narrowly scoped to issue #94:

```typescript
// Private — shared reconciler. Called by BOTH onTaskUpdated (existing,
// remote-echo path) and the two new public apply-local-* entry points
// below. Matches the exact bucket-replace + cross-bucket-move semantics of
// today's onTaskUpdated, with one difference: a deep-equality guard that
// skips setState when the proposed row equals the currently stored row.
// The guard makes the originating client's "apply own change + later
// absorb the echo" sequence a single state write, not two.
private reconcileTaskById(task: BoardTask): void;

// Public — entry point for the save success path (issue #94). Projects
// TaskResponseDto to BoardTask (dropping createdAt / updatedAt, same as
// applyCreatedTask / setTasks) and delegates to reconcileTaskById.
// Silent no-op when currentProjectId is null or the task id is not
// present in any bucket (defensive — same guard as onTaskUpdated).
applyLocalTaskUpdateFromDto(dto: TaskResponseDto): void;

// Public — entry point for the clear success path (issue #94). Looks up
// the task by id across all buckets, clones it with content: null, and
// delegates to reconcileTaskById. Silent no-op when the task id is not
// in state — the echo will sort it out when it lands (and if the task
// was deleted server-side, the 404 toast path is what runs instead).
applyLocalTaskDescriptionCleared(taskId: string): void;
```

`onTaskUpdated` is refactored to delegate to `reconcileTaskById` after the existing `currentProjectId` guard and the projection from `TaskUpdatedEvent` to `BoardTask`. Its observable behaviour from outside the service is unchanged, except for the equality-guard no-op on a truly-idempotent echo (which is the desired behaviour for issue #94 AC "the read-mode render does not flicker / re-render to a different value" and is invisible for every non-idempotent echo, i.e. every real remote edit).

**BoardPageComponent** (component-local):

Replace:
```typescript
// before — plain snapshot, does not re-sync with board state
readonly selectedTask = signal<BoardTask | null>(null);
```
with:
```typescript
// private — stores only the id; cheap to set on open, cheap to clear on close
private readonly selectedTaskId = signal<string | null>(null);

// public — live projection off board state. When the task row is updated
// (by a remote TaskUpdated echo OR the originating client's own save /
// clear via the new applyLocalTask* entry points), the computed re-emits
// and the template's `@if (selectedTask(); as task)` binding re-fires,
// which re-fires the `[task]` input into TaskDetailPanelComponent and
// TaskDescriptionSectionComponent, which re-derives `readDisplay`. This is
// the mechanism that makes the freshest `content` reach the rendered read
// mode within the same microtask as the save's `next` handler.
readonly selectedTask: Signal<BoardTask | null> = computed(() => {
  const id = this.selectedTaskId();
  if (id === null) return null;
  const buckets = this.boardState.tasksByColumnId();
  for (const bucket of Object.values(buckets)) {
    const found = bucket.find(t => t.id === id);
    if (found) return found;
  }
  // Task was removed from state (ColumnDeleted, TaskMoved to a bucket we
  // don't track, etc.) — panel collapses. The 404 toast path is separate
  // and still runs on explicit 404 handling (unchanged by this ticket).
  return null;
});
```

The three existing setters (`handleTaskOpened`, `handleTaskDetailClosed`, `handleTaskNotFound`) become id-setters:
```typescript
handleTaskOpened(task: BoardTask): void { this.selectedTaskId.set(task.id); }
handleTaskDetailClosed(): void { this.selectedTaskId.set(null); }
handleTaskNotFound(): void {
  this.selectedTaskId.set(null);
  this.taskNotFoundToast.set({ message: TASK_DESCRIPTION_COPY.TOAST_TASK_NOT_FOUND });
}
```

**TaskDescriptionSectionComponent** (component-local):

No new signals. No changes to existing signals (`mode`, `draft`, `isSaving`, `isClearing`, `inlineError`, `remoteUpdateDetected`, `contentSnapshot`, `liveMessage`). No changes to `readDisplay` or any derived computed. No changes to `describedBy`, `headingId`, `editorId`, `errorId`, `counterId`. Only the `next` callbacks of `onSave` and `performClear` change — see §Service Integration below.

### TypeScript Interfaces

**No new interfaces.** The existing types continue to hold:

- [`BoardTask`](../../KanbAI-Web/src/app/features/board/state/board-state.model.ts) — local projection (`id`, `title`, `content: string | null`, `taskOrder`, `columnId`, `assignedId`). Already used as the authoritative local shape.
- [`TaskResponseDto`](../../KanbAI-Web/src/app/features/board/models/task.model.ts) — backend task DTO (superset of `BoardTask`; has `createdAt` / `updatedAt` as ISO-8601 strings). Emitted by `TasksApiService.updateTaskDescription`. Projected to `BoardTask` inside `applyLocalTaskUpdateFromDto` using the same field-drop pattern as `applyCreatedTask` / `setTasks`.
- [`TaskUpdatedEvent`](../../KanbAI-Web/src/app/core/models/realtime-events.ts) — SignalR event shape (structurally identical to `TaskResponseDto` modulo `createdAt` / `updatedAt` being present on both). Projected to `BoardTask` inside `onTaskUpdated` (existing code, unchanged).

---

## Service Integration

### BoardStateService — new public methods

**File:** [`src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts)

Implementation shape (the developer agent fills in the body using the existing `onTaskUpdated` body as the template):

```typescript
/**
 * Issue #94 — public entry point for the originating client's save
 * success path. Applies the authoritative post-save DTO to local state
 * using the same bucket-replace semantics as `onTaskUpdated`, so the
 * subsequent SignalR `TaskUpdated` echo lands on identical state and
 * is absorbed as a no-op by the equality guard in `reconcileTaskById`.
 *
 * Silent no-op when `currentProjectId` is null (user navigated away
 * between PUT and 200) or when the task id is not present in any
 * bucket (defensive — same precondition as `onTaskUpdated`).
 */
applyLocalTaskUpdateFromDto(dto: TaskResponseDto): void {
  if (!dto || this.getState().currentProjectId === null) {
    return;
  }
  this.reconcileTaskById({
    id: dto.id,
    title: dto.title,
    content: dto.content,
    taskOrder: dto.taskOrder,
    columnId: dto.columnId,
    assignedId: dto.assignedId
  });
}

/**
 * Issue #94 — public entry point for the originating client's clear
 * success path. `DELETE /api/task/{taskId}/description` returns 204
 * No Content; this method looks up the task currently in state, clones
 * it with `content: null`, and delegates to the shared reconciler.
 *
 * Silent no-op when `currentProjectId` is null or the task is not in
 * state.
 */
applyLocalTaskDescriptionCleared(taskId: string): void {
  if (this.getState().currentProjectId === null) {
    return;
  }
  const buckets = this.getState().tasksByColumnId;
  for (const bucket of Object.values(buckets)) {
    const existing = bucket.find(t => t.id === taskId);
    if (existing) {
      this.reconcileTaskById({ ...existing, content: null });
      return;
    }
  }
  // Task not present — no-op. The echo (or 404 handling) will resolve.
}
```

### BoardStateService — shared reconciler (factored from `onTaskUpdated`)

```typescript
/**
 * Shared bucket-replace + cross-bucket-move helper. Issue #94 factors
 * this out of `onTaskUpdated` so the SignalR echo path and the two new
 * HTTP-success entry points agree on reconcile semantics.
 *
 * Equality guard: if the owner bucket already contains a task row that
 * is field-for-field equal to `task`, skip the state write entirely.
 * This absorbs the "same-client apply, then echo of same-client change"
 * sequence as a single net mutation — the echo is a genuine no-op.
 * The guard does NOT change remote-edit semantics: a real remote edit
 * always produces a new value for at least one field (content at
 * minimum), so the guard never fires on a genuine remote change.
 */
private reconcileTaskById(task: BoardTask): void {
  const buckets = this.getState().tasksByColumnId;
  const ownerEntry = Object.entries(buckets).find(([, bucket]) =>
    bucket.some(t => t.id === task.id)
  );
  if (!ownerEntry) {
    return;
  }
  const [ownerColumnId, ownerBucket] = ownerEntry;

  // Equality guard — if the existing row equals the proposed row
  // field-for-field, there is no state change to apply. `BoardTask` is
  // a flat interface of scalars so strict-equal on every field suffices;
  // a deep equality helper is not needed.
  const existing = ownerBucket.find(t => t.id === task.id)!;
  if (
    ownerColumnId === task.columnId &&
    existing.title === task.title &&
    existing.content === task.content &&
    existing.taskOrder === task.taskOrder &&
    existing.columnId === task.columnId &&
    existing.assignedId === task.assignedId
  ) {
    return;
  }

  const nextBuckets: Record<string, BoardTask[]> = { ...buckets };
  if (ownerColumnId === task.columnId) {
    nextBuckets[ownerColumnId] = ownerBucket
      .map(t => (t.id === task.id ? task : t))
      .sort((a, b) => a.taskOrder - b.taskOrder);
  } else {
    // Cross-bucket reconcile — same defensive path `onTaskUpdated` had.
    nextBuckets[ownerColumnId] = ownerBucket.filter(t => t.id !== task.id);
    const destBucket = (nextBuckets[task.columnId] ?? []).filter(
      t => t.id !== task.id
    );
    nextBuckets[task.columnId] = [...destBucket, task].sort(
      (a, b) => a.taskOrder - b.taskOrder
    );
  }
  this.setState({ tasksByColumnId: nextBuckets });
}
```

### BoardStateService — `onTaskUpdated` refactor

The existing method is simplified to:

```typescript
private onTaskUpdated(evt: TaskUpdatedEvent): void {
  if (!evt || this.getState().currentProjectId === null) {
    return;
  }
  this.reconcileTaskById({
    id: evt.id,
    title: evt.title,
    content: evt.content,
    taskOrder: evt.taskOrder,
    columnId: evt.columnId,
    assignedId: evt.assignedId
  });
}
```

The observable external behaviour is identical for remote echoes on tasks whose fields genuinely changed; the only delta is the equality-guard short-circuit on an already-applied same-client change.

### TaskDescriptionSectionComponent — save `next` handler

**File:** [`src/app/features/board/components/task-description-section/task-description-section.component.ts`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts) §`onSave`

Inject the state service at the top of the class:

```typescript
private readonly boardState = inject(BoardStateService);
```

Replace the current `next` arm (lines 189–193) with:

```typescript
next: dto => {
  this.isSaving.set(false);
  // Order matters: exitEditMode flips mode to 'read' BEFORE the state
  // apply fires. The component-local remote-update effect (line 143–152)
  // early-exits when mode !== 'edit', so our own save's content change
  // never trips the "updated by someone else" banner.
  this.exitEditMode();
  this.boardState.applyLocalTaskUpdateFromDto(dto);
  this.announce(TASK_DESCRIPTION_COPY.ANNOUNCE_SAVED);
},
```

### TaskDescriptionSectionComponent — clear `next` handler

**File:** same. §`performClear`

Replace the current `next` arm (lines 253–258) with:

```typescript
next: () => {
  this.isClearing.set(false);
  this.boardState.applyLocalTaskDescriptionCleared(taskId);
  this.announce(TASK_DESCRIPTION_COPY.ANNOUNCE_CLEARED);
  // The BoardStateService apply above is what flips `content` to null
  // on the originating client within the same microtask; the inline
  // comment on the old code about waiting for the SignalR echo is
  // deleted because we no longer do.
},
```

No change to the error arm. No change to anywhere else in the component.

### HTTP Request/Response Contracts

Unchanged from [#91](https://github.com/Gulybi/KanbAI-Web/issues/91). No new endpoints, no schema changes, no headers. Re-stated here for QA convenience:

| Method | Endpoint | Request Body | Success Response | Notes |
|--------|----------|--------------|------------------|-------|
| PUT | `/api/task/{taskId}/description` | `UpdateTaskDescriptionDto { content: string }` | `200 ApiResponse<TaskResponseDto>` | DTO already unwrapped by `TasksApiService.updateTaskDescription`; this ticket now consumes it. |
| DELETE | `/api/task/{taskId}/description` | — | `204 No Content` | No envelope. Success implies target state is `content: null`. |

Error-code behaviour is completely unchanged — `400` / `403` / `404` / `0` (network) paths go through `mapTaskDescriptionErrorToUserMessage` exactly as shipped in [#91](https://github.com/Gulybi/KanbAI-Web/issues/91).

---

## Implementation Steps

Follow in order. Each step leaves the app in a compilable state. The preferred commit boundary is after step 4 (one atomic commit for the whole fix), but an intermediate commit after step 1 is acceptable if the developer wants a clean extract-then-use pair.

### 1. BoardStateService — factor + extend

- [ ] In [`board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts), extract the existing `onTaskUpdated` body (after the `currentProjectId` guard, and after projecting `evt` → `BoardTask`) into a new private method `reconcileTaskById(task: BoardTask): void`. Keep the existing cross-bucket-move defensive branch as-is.
- [ ] Add the equality guard to `reconcileTaskById`: if the owner bucket contains an existing row whose `title` + `content` + `taskOrder` + `columnId` + `assignedId` all strictly equal the proposed row AND the owner column equals `task.columnId`, `return` before `setState`. See §BoardStateService — shared reconciler for the exact comparison.
- [ ] Simplify `onTaskUpdated` to delegate to `reconcileTaskById` after projecting from `TaskUpdatedEvent`. The observable external behaviour for remote echoes of real changes must not change; verify by running the existing `onTaskUpdated`-focused specs in `board-state.service.spec.ts`.
- [ ] Add `applyLocalTaskUpdateFromDto(dto: TaskResponseDto): void` per §Service Integration. `public`, JSDoc referencing issue #94.
- [ ] Add `applyLocalTaskDescriptionCleared(taskId: string): void` per §Service Integration. `public`, JSDoc referencing issue #94.

### 2. BoardPageComponent — `selectedTask` becomes a live computed projection

- [ ] In [`board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts), rename the existing `selectedTask: WritableSignal<BoardTask | null>` (line 141) to `private readonly selectedTaskId = signal<string | null>(null)`.
- [ ] Add `readonly selectedTask: Signal<BoardTask | null> = computed(() => { ... })` that looks up `selectedTaskId()` across every bucket of `boardState.tasksByColumnId()` and returns the first match (or `null`). See §State Management Strategy for the exact body.
- [ ] Update `handleTaskOpened(task: BoardTask)` → `this.selectedTaskId.set(task.id)`.
- [ ] Update `handleTaskDetailClosed()` → `this.selectedTaskId.set(null)`.
- [ ] Update `handleTaskNotFound()` → `this.selectedTaskId.set(null)` (and keep the existing toast-set line).
- [ ] [`board-page.component.html`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html) is unchanged — the `@if (selectedTask(); as task)` block works identically against a computed.

### 3. TaskDescriptionSectionComponent — apply on success

- [ ] In [`task-description-section.component.ts`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts), add `private readonly boardState = inject(BoardStateService);` at the top of the class alongside the existing `tasksApi` / `dialog` / `destroyRef` injections. Import `BoardStateService`.
- [ ] Rewrite the `onSave` `next` arm per §Service Integration. Order is strict: `isSaving.set(false)` → `exitEditMode()` → `boardState.applyLocalTaskUpdateFromDto(dto)` → `announce(ANNOUNCE_SAVED)`. The DTO is captured as the callback parameter (replacing the current empty `()`).
- [ ] Rewrite the `performClear` `next` arm per §Service Integration: `isClearing.set(false)` → `boardState.applyLocalTaskDescriptionCleared(taskId)` → `announce(ANNOUNCE_CLEARED)`. Delete the now-inaccurate `// BoardStateService.onTaskUpdated receives the TaskUpdated echo ...` comment (lines 256–257).
- [ ] Do NOT touch `handleWriteError`, `exitEditMode`, the `remoteUpdateDetected` effect, or any template / SCSS. This ticket is additive on the success paths only.

### 4. Spec updates (same commit)

- [ ] [`board-state.service.spec.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts):
  - Add a describe block for `applyLocalTaskUpdateFromDto` asserting bucket replacement, cross-bucket move (defensive), project-guard no-op, missing-id no-op.
  - Add a describe block for `applyLocalTaskDescriptionCleared` asserting `content` flips to `null`, other fields unchanged, project-guard no-op, missing-id no-op.
  - Add an equality-guard spec: seed a bucket with a task `T`, call `applyLocalTaskUpdateFromDto` with a DTO whose projected fields are field-for-field equal to `T`, assert `tasksByColumnId()` reference identity is unchanged (i.e. no `setState` fired).
  - Verify existing `onTaskUpdated` specs still pass unchanged (for real remote changes the behaviour is bitwise identical).
- [ ] [`board-page.component.spec.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts):
  - At line 671, change `expect(component.selectedTask()).toBe(task)` to `expect(component.selectedTask()).toEqual(task)` or `expect(component.selectedTask()?.id).toBe(task.id)` — the computed returns the live projection from state, which shares value but not reference with the original `task` object the test created.
  - Add a spec: open a task via `handleTaskOpened`, then call `boardState.applyLocalTaskUpdateFromDto` with a DTO that changes the task's `content`, assert `component.selectedTask()?.content` reflects the new value.
- [ ] [`task-description-section.component.spec.ts`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.spec.ts):
  - Save-success spec: mock `tasksApi.updateTaskDescription` to return the updated DTO; spy on `boardState.applyLocalTaskUpdateFromDto`; assert it was called once with the DTO on success; assert `announce(ANNOUNCE_SAVED)` is called and `mode()` is `'read'`.
  - Save-success ordering spec: assert `applyLocalTaskUpdateFromDto` was called AFTER `mode` became `'read'` (i.e. after `exitEditMode`). A minimal way to verify: spy on the boardState method and, inside the spy body, read `component.mode()` — it must be `'read'` at spy-call time. Alternatively assert that `remoteUpdateDetected()` remains `false` after the save of a task whose content value differs from the current `task().content` — if `applyLocalTaskUpdateFromDto` fired before `exitEditMode`, the effect would trip the banner and this expectation would fail.
  - Clear-success spec: mock `tasksApi.clearTaskDescription` to complete; spy on `boardState.applyLocalTaskDescriptionCleared`; assert it was called once with the task id on 204.
  - Error-path regression specs: mock each of `400` (with `errors: [...]`), `403`, `404`, `status: 0`; assert `applyLocalTaskUpdateFromDto` / `applyLocalTaskDescriptionCleared` was NOT called in any of them; assert `inlineError` / `taskNotFound` emission / `mode` stays in `'edit'` (or does not flip to empty-state for clear) exactly as before.

### 5. Build + run tests

- [ ] From the repo root: `cd KanbAI-Web && npm run build`. Must succeed. Report the exact file path + line + message of any failure.
- [ ] From the repo root: `cd KanbAI-Web && npm run test -- --watch=false` (Vitest via `ng test` per `CLAUDE.md`). Total / passed / failed breakdown required. Any new failure must be classified PRE-EXISTING vs INTRODUCED per `CLAUDE.md`; INTRODUCED failures must be fixed before the work is marked complete.

### 6. Manual smoke verification (before marking complete)

- [ ] Run the app locally, open a board, open a task whose `content` is set to *"old text"*.
- [ ] Save-path: Edit → type *"new text"* → Save. Observe: editor closes, read mode renders *"new text"* with no visible flash of *"old text"* or empty state; *"Description saved"* is announced once.
- [ ] Clear-path: Click Clear → confirm. Observe: panel shows the empty-state placeholder *"No description yet — click to add one"* with no visible flash of the old description; *"Description cleared"* is announced once.
- [ ] Ctrl+Enter variant: from inside the editor, type *"newer text"* and press Ctrl+Enter. Same acceptance as the Save-button path.
- [ ] Immediate re-edit: after a save, click Edit again — the editor must pre-fill with the just-saved text, not the previous value.

**Performance Considerations:**

- `selectedTask` as a computed is O(columns × tasks-in-bucket) per re-emission. For boards in the hundreds of tasks this is single-digit-microseconds; no memoisation beyond Angular's computed-signal equality check is needed.
- The equality guard in `reconcileTaskById` is a constant-size comparison of five scalar fields — cheaper than `setState` + signal emission, so it is always a performance win, not a cost.
- No new subscriptions, no new effects, no new polling. The existing SignalR subscription machinery is untouched.

---

## Design Validation (self-check)

**Interface alignment:**
- [x] `TaskResponseDto` → `BoardTask` projection in `applyLocalTaskUpdateFromDto` uses the exact same field list as `applyCreatedTask` / `setTasks` / the existing `onTaskUpdated` (id, title, content, taskOrder, columnId, assignedId). Timestamps (`createdAt`, `updatedAt`) are dropped consistently.
- [x] `content: string | null` nullability preserved end-to-end: save sets to non-null trimmed string, clear sets to `null`, both flow through the same `BoardTask.content: string | null`.
- [x] `BoardStateService.tasksByColumnId` signal keeps its existing shape — no consumers need updates.

**Standards compliance:**
- [x] `inject()` used for `BoardStateService` injection in the description component (matches existing `tasksApi` / `dialog` / `destroyRef` pattern).
- [x] `signal` + `computed` for UI state (`selectedTaskId` + `selectedTask`); `setState`-based service state for board state (matches `BaseStateService` pattern).
- [x] `takeUntilDestroyed(this.destroyRef)` already on both save and clear pipelines — unchanged.
- [x] `ChangeDetectionStrategy.OnPush` on every affected component — unchanged.

**Security:**
- [x] No new routes, no new guards needed.
- [x] The description content is never rendered via `[innerHTML]` — the existing `readDisplay` template uses interpolation (text binding), so the same-tick apply does not introduce any XSS surface.
- [x] No new logging added; no PII flows through the new code paths.

**Completeness vs context doc acceptance criteria:**

Every AC in [issue_94_context.md §Acceptance Criteria](./issue_94_context.md) maps to a specific behaviour in this spec. See §QA Guidance for the AC-to-test matrix.

---

## QA Guidance

### AC-to-test matrix

For each acceptance criterion in the context doc, the table below identifies the spec file that must carry an assertion for it. "Integration" entries live in `board-page.component.spec.ts` or `task-description-section.component.spec.ts`; "service" entries live in `board-state.service.spec.ts`.

**Save — originating client**

| AC (from context) | Test location | Assertion |
|-------------------|---------------|-----------|
| Save via button renders new text in read mode within the same interaction | `task-description-section.component.spec.ts` | After `onSave` completes with DTO `{ content: 'new text' }`, spy on boardState; drive fixture detection; assert `component.readDisplay().text === 'new text'` AND `component.mode() === 'read'`. |
| Save via Ctrl+Enter behaves identically | `task-description-section.component.spec.ts` | Same assertion as above, but triggered via `keydown.control.enter` dispatch on the textarea. |
| *"Description saved"* announcement fires exactly once | `task-description-section.component.spec.ts` | Spy on `announce` / observe `liveMessage`; assert one call with `ANNOUNCE_SAVED`. |
| No visible flash of old text / empty / spinner between Save click and new-text render | Integration | `board-page.component.spec.ts`: render panel with task whose `content` is *"old text"*; drive save to *"new text"*; between the stub subscription emission and the assertion, assert `component.selectedTask()?.content !== null && component.selectedTask()?.content !== 'old text'` holds at every emission — verify by collecting every emission via `effect(() => …)` and checking the set of observed values contains only `{ 'new text' }` (not `''`, not `'old text'`). |
| Subsequent `TaskUpdated` echo does not flicker / re-render / re-announce | `board-state.service.spec.ts` | Seed a bucket with task `T`; call `applyLocalTaskUpdateFromDto` with DTO whose projected fields equal `T` except `content` is updated; assert `tasksByColumnId` reference changes exactly once; then simulate the SignalR echo (dispatch `TaskUpdatedEvent` with identical post-state); assert `tasksByColumnId` reference is unchanged after the echo (equality guard). |
| Immediate re-edit pre-fills with just-saved text | `task-description-section.component.spec.ts` | After save completes, call `enterEdit()`; assert `draft()` equals the new text. |

**Clear — originating client**

| AC | Test location | Assertion |
|-----|---------------|-----------|
| Clear renders empty-state placeholder within the same interaction | `task-description-section.component.spec.ts` | After `performClear` 204, assert `readDisplay().mode === 'empty'`. |
| *"Description cleared"* announcement fires exactly once | `task-description-section.component.spec.ts` | Spy on `announce`; one call with `ANNOUNCE_CLEARED`. |
| No visible flash of previous text between confirm and empty-state | Integration | Same emission-collecting pattern as the save path; assert the set of observed `readDisplay().text` values goes directly from *"old text"* to `''`. |
| Echo of own clear is absorbed (no flicker, no re-announce) | `board-state.service.spec.ts` | Seed task with `content: 'x'`; call `applyLocalTaskDescriptionCleared(id)`; then simulate echo with `content: null` on otherwise-identical fields; assert equality guard short-circuits the echo. |
| Empty-state placeholder activation opens editor with empty value | `task-description-section.component.spec.ts` | Existing #91 spec behaviour — re-run to guard against regression. |

**Error paths — unchanged regression guard**

| AC | Test location | Assertion |
|-----|---------------|-----------|
| 400 (save) keeps editor open, renders server `errors[0]`, no board state mutation | `task-description-section.component.spec.ts` | Mock `HttpErrorResponse { status: 400, error: { errors: ['bad input'] } }`; spy on `boardState.applyLocalTaskUpdateFromDto`; assert spy not called; assert `inlineError()` === `'bad input'`; assert `mode()` === `'edit'`. |
| 403 (save / clear) keeps editor open, generic permission copy, no state mutation | `task-description-section.component.spec.ts` | Mock `403`; spy on both apply methods; assert neither called; assert `inlineError()` matches `INLINE_ERROR_PERMISSION`. |
| 404 (save / clear) emits `taskNotFound`, no state mutation | `task-description-section.component.spec.ts` | Mock `404`; spy on both apply methods; assert neither called; assert `taskNotFound.emit` was called. |
| Network failure keeps editor open, network copy, no state mutation | `task-description-section.component.spec.ts` | Mock `HttpErrorResponse { status: 0 }`; same no-apply assertions. |

**Real-time sync — regression guard**

| AC | Test location | Assertion |
|-----|---------------|-----------|
| Remote `TaskUpdated` on currently-open task (not in edit mode) updates read mode | Integration | `board-page.component.spec.ts`: open task, dispatch a remote `TaskUpdated` SignalR event with new `content`; assert `selectedTask()?.content` reflects it. (Exercises the new computed projection path; this is the AC that today the context claims "works" and must continue to work after the change.) |
| Remote `TaskUpdated` while in edit mode still triggers the conflict banner and preserves the draft | `task-description-section.component.spec.ts` | Existing #91 spec at `describe('remote update while editing', ...)` — verify it still passes unchanged. |
| Remote `TaskUpdated` for a different task has no visible effect on the panel | Integration | Dispatch a `TaskUpdatedEvent` for a different `id`; assert `selectedTask()` reference is unchanged (no re-emission) OR that the rendered content has not changed. |

**Accessibility — regression guard**

| AC | Test location | Assertion |
|-----|---------------|-----------|
| `ANNOUNCE_SAVED` fires at the same user-facing moment the new text renders | `task-description-section.component.spec.ts` | Assert `liveMessage()` becomes `ANNOUNCE_SAVED` during the same change-detection cycle as `readDisplay().text` becoming the new value. |
| `ANNOUNCE_CLEARED` fires at the same moment empty-state appears | `task-description-section.component.spec.ts` | Assert `liveMessage()` becomes `ANNOUNCE_CLEARED` during the same CD cycle as `readDisplay().mode` becoming `'empty'`. |
| Focus / keyboard / colour / label behaviours unchanged | — | No test change needed; existing #91 specs cover these and must continue to pass. |

### Explicit no-tests (from context doc's §Out of scope)

- No test asserting the backend `TaskUpdated` broadcast is filtered to exclude the originating connection.
- No test asserting optimistic rendering before the PUT / DELETE resolves.
- No test asserting error-path behaviour changes beyond what [#91](https://github.com/Gulybi/issues/91) already specifies.
- No test asserting due-date / label / assignee / priority in-panel editing.
- No test asserting conflict-banner copy or behaviour changes.
- No test asserting changes to `onTaskUpdated`'s reconcile semantics for remote edits (the equality-guard behaviour on idempotent echoes is a new, stated, desirable behaviour — not a semantic change for genuine remote edits).

### Manual test script (for user validation Phase 7)

1. Open a task with an existing description — expect *"old text"* in read mode.
2. Edit → type *"new text"* → click Save.
3. **Pass:** editor closes, read mode shows *"new text"*. No flash of *"old text"* or empty state. *"Description saved"* in the polite region.
4. Without closing the panel, click Edit again.
5. **Pass:** textarea pre-fills with *"new text"*, not *"old text"*.
6. Cancel → Clear → confirm.
7. **Pass:** empty-state placeholder *"No description yet — click to add one"* renders. No flash of the previous description. *"Description cleared"* announced.
8. Click the empty-state button.
9. **Pass:** editor opens with empty textarea (no pre-fill).
10. Repeat (1)–(3) with Ctrl+Enter instead of the Save button. Same acceptance.
11. Open the same task from a second session (or have a teammate do it). Edit the description there and save.
12. **Pass:** your session's read mode re-renders to the teammate's text with no banner, no announcement.
13. Put your session into edit mode with a draft; have the teammate save a different description.
14. **Pass:** the *"This task was updated by someone else — Discard my changes and reload"* banner appears; your draft is preserved.

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification. Given that this ticket has zero DOM / SCSS / visual changes, the web-designer review is expected to be a no-op confirmation — the design spec for [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) remains the authoritative source for every rendered element. Proceed directly to the developer agent if the team prefers.*
