# Technical Specification: Gate Attachment List Hydration on Real Task-Id Transitions

**Context Document:** [issue_95_context.md](./issue_95_context.md)
**GitHub Issue:** [#95](https://github.com/Gulybi/KanbAI-Web/issues/95)
**Branch:** `95-task-detail-panel-re-fetches-attachment-list-on-every-task-signal-emission-flooding-backend-with-sql`

---

## Overview

This is a **client-side, narrow-scope bug fix** in the task detail panel's attachment hydration trigger. No new components, no new services, no new models, no backend change, no SignalR change, no routing change, no contract change.

Today, the attachment list hydration is driven by an Angular `effect(...)` in `TaskDetailPanelComponent` that reads `this.task().id` on **every** emission of the `task` input signal. The `BoardStateService.onTaskUpdated` handler rebuilds `BoardTask` object references on every `TaskUpdated` SignalR event (including for unrelated tasks), which makes the `[task]` binding into the panel re-emit a new reference even when `task().id` is unchanged. The effect therefore re-runs and calls `hydrateCompletedForTask(taskId)`, which in turn re-fetches the list because the state service's dedupe guard only trips during the narrow `phase === 'loading'` window.

The fix introduces a **transition-gated trigger**: the effect must fire a hydrate call only when the `taskId` it observes has genuinely transitioned from one non-null value to a different value (or from `null`/`undefined` to a real value on initial open). Same-id re-emissions are ignored. The explicit Retry path remains untouched (it bypasses the transition gate by calling the state service directly). The `hydrateCompletedForTask` dedupe is extended as a **defensive backstop** so that *even if* a future caller forgets the transition gate, a same-task hydrate call against a `ready` list is a no-op — but **only for the effect-driven path**, not for Retry.

Together this reduces fetches to **exactly one `GET /api/task/{taskId}/assets` per genuine panel-open-for-new-task-id event** and removes the per-SignalR-event storm entirely, while leaving Retry, close+reopen-different-task, live-update (SignalR), and error-path flows unchanged.

---

## Component Architecture

### Routing

No routing changes. The panel is not a route — it is a child of `BoardPageComponent` rendered conditionally from `selectedTask()`.

### Component Hierarchy

**Modified (Smart) Component:**

- `TaskDetailPanelComponent` — `src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`
  - **No shape change** — still `input.required<BoardTask>()`, still `output<void>()` for `panelClosed`, still `output<DropzoneFileSelectedEvent>()` for `fileSelected`, still `output<void>()` for `taskNotFound`.
  - **Internal behaviour change only** — the constructor `effect(...)` that calls `hydrateCompletedForTask` is reworked to gate on *taskId transitions*, not raw signal re-emissions.
  - Change detection stays `OnPush`. `inject()` stays. Standalone stays.

**Modified (Service):**

- `AttachmentsStateService` — `src/app/features/attachments/state/attachments-state.service.ts`
  - **Public API shape unchanged** — `hydrateCompletedForTask(taskId: string): void` stays. No new public methods.
  - **Internal behaviour change** — an optional `trigger` parameter is added in a way that is backwards-compatible with external callers. When the caller is the effect, the service checks whether the list is already `ready` and short-circuits. When the caller is an explicit user action (Retry), the service follows today's behaviour exactly (always issue a `GET` unless one is already in flight).

**Unchanged (Presentational) Components:**

- `AttachmentListComponent`, `AttachmentRowComponent`, `FileDropzoneComponent`, `UploadProgressRowComponent`, `TaskDescriptionSectionComponent` — no change. The inputs they receive via `completedAttachments()` / `listFetchState()` signals are unchanged.

### New Files to Create

None. This ticket is a surgical fix.

### Files to Modify

| File | Reason |
|------|--------|
| `src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` | Replace the raw `effect(() => hydrate(id))` with a transition-gated hydrate trigger. |
| `src/app/features/attachments/state/attachments-state.service.ts` | Extend `hydrateCompletedForTask` with a backwards-compatible trigger parameter; short-circuit effect-driven calls when the list is already `ready`. |
| `src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts` | Add regression tests for same-id re-emission and non-id field changes on the task input. Keep the existing "calls hydrate on initial render" and "re-calls hydrate when taskId changes" tests green. |
| `src/app/features/attachments/state/attachments-state.service.spec.ts` | Add regression tests for the effect-trigger short-circuit on `ready`, and a parity test proving Retry still fetches on `ready`. |

No other files are touched.

### Design Decision Log

- **Option A (cache-served on same-task close+reopen) is adopted.** Per the context doc §"Close and re-open the same task", Option A (zero additional fetches when re-opening the same task whose list is already `ready`) is the cleanest behaviour and matches the #51 contract that SignalR is the live-update path. Option B (single-fetch on each re-open) would require a "panel-open session" marker that the panel currently does not own — Option A does not.
- **Do not introduce a time-based "freshness" refresh.** Out of scope per context doc.
- **Do not add `distinctUntilChanged` on the board-state map.** That would mutate a load-bearing upstream signal used by many other consumers; the fix belongs locally in the panel, where the bug manifests.
- **Do not move the `effect` into the state service.** The panel owns the lifecycle of "what task is open"; the state service should stay declarative. The gate belongs at the *call site* (the panel's effect), with the state service providing a defensive backstop.
- **Do not add a new `Signal` field to the state.** The `completedFetchByTaskId[taskId].phase` is already the source of truth for "has this task's list been hydrated?" — we re-use it rather than introducing a parallel field.

---

## State & Data Layer

### State Shape — Unchanged

`AttachmentsState` stays exactly as in `attachments-state.model.ts`:

```typescript
export interface AttachmentsState {
  uploadsByTaskId: Record<string, AttachmentUpload[]>;
  completedByTaskId: Record<string, AssetResponseDto[]>;
  completedFetchByTaskId: Record<string, AttachmentListFetchState>;
}
```

No fields added, removed, or renamed.

### Signal Plumbing — Panel Local

**New panel-local tracker (private field on `TaskDetailPanelComponent`):**

The panel owns a mutable cursor that remembers the last task id the effect fired a hydrate call for. The effect gates on `currentId !== lastHydratedId`. The exact shape is an implementation detail (it can be a `WritableSignal<string | null>`, a bare class field, or a closure variable inside the `effect`), but the **contract** the developer must honour is:

- On component construction, the tracker is initialised to `null`.
- The effect runs, reads `this.task().id`. If the current id is non-empty AND does not equal the tracker, the tracker is updated to the current id **and** `hydrateCompletedForTask(currentId)` is called.
- If the current id equals the tracker, the effect is a no-op.
- The tracker is **not** modified by Retry — Retry is a separate code path and must not influence the transition gate.
- The tracker has component scope; there is no cross-panel-lifecycle persistence. On panel destroy (close), the tracker is discarded along with the component. On panel re-open (a fresh `TaskDetailPanelComponent` instance mounted by the `@if (selectedTask(); as task)` block), the tracker starts at `null` again, so the effect fires once for the new mount.

**Recommended implementation shape (the developer may pick either):**

```typescript
// Option 1 — bare mutable field captured by the effect
private lastHydratedTaskId: string | null = null;

constructor() {
  effect(() => {
    const id = this.task().id;
    if (id && id !== this.lastHydratedTaskId) {
      this.lastHydratedTaskId = id;
      this.attachmentsState.hydrateCompletedForTask(id, 'effect');
    }
  });
}
```

```typescript
// Option 2 — WritableSignal (preferred if test visibility is desired)
private readonly lastHydratedTaskId = signal<string | null>(null);

constructor() {
  effect(() => {
    const id = this.task().id;
    const last = untracked(() => this.lastHydratedTaskId());
    if (id && id !== last) {
      this.lastHydratedTaskId.set(id);
      this.attachmentsState.hydrateCompletedForTask(id, 'effect');
    }
  });
}
```

**Note on `untracked(...)`:** whichever option the developer picks, **the tracker read inside the effect must not subscribe the effect to the tracker's own writes**. With Option 1 (bare field) this is trivially the case — plain fields are not tracked by the effect system. With Option 2 (signal) the read must be wrapped in `untracked(...)` to avoid a feedback loop. The developer must use Option 1 *or* add `untracked` in Option 2.

### State Service Dedupe — Extended as Defensive Backstop

`hydrateCompletedForTask` gains an optional `trigger` parameter with two possible values. The default preserves today's semantics for any existing caller that does not pass it:

```typescript
type HydrateTrigger = 'effect' | 'retry';

hydrateCompletedForTask(taskId: string, trigger: HydrateTrigger = 'retry'): void;
```

Rationale for the default: defaulting to `'retry'` means any existing call site that does not pass a trigger keeps today's fetch-on-call behaviour (no silent regressions). The only call site that *needs* the `'effect'` variant is the panel's constructor effect, and that site will pass it explicitly.

**Behaviour branching inside `hydrateCompletedForTask`:**

| Current `completedFetchByTaskId[taskId].phase` | `trigger === 'effect'` | `trigger === 'retry'` |
|---|---|---|
| `undefined` / `idle` | fetch | fetch |
| `loading` | no-op (today's dedupe) | no-op (today's dedupe) |
| `ready` | **no-op (new)** | fetch |
| `error` | fetch | fetch |

The `'effect'` branch's short-circuit on `ready` is the defensive backstop: *even if* the panel-local transition gate is bypassed for any reason, a same-task hydrate call from an effect against an already-hydrated list is a no-op. The `'retry'` branch is unchanged from today — explicit user retry always fetches (modulo the `loading` dedupe).

The `'effect'` branch must also fetch on `error`: if the initial fetch failed and the user then closes and re-opens the same task, the effect will fire (panel-local tracker is fresh on mount), and a refetch on `error` is the correct behaviour (it gets the user out of a stuck error banner without requiring a click).

### Interfaces — Only One Additive Change

**File:** `src/app/features/attachments/state/attachments-state.service.ts`

```typescript
/**
 * Discriminator for hydrate call origin. Governs how the dedupe guard
 * behaves when a prior fetch is already `ready`:
 *  - 'effect' (panel-open transition path): no-op when `ready`.
 *  - 'retry'  (explicit user action):       fetch unconditionally
 *                                           (modulo the `loading` dedupe).
 */
export type AttachmentsHydrateTrigger = 'effect' | 'retry';
```

No other type changes. `AttachmentListFetchState`, `AttachmentListFetchPhase`, `AttachmentListFetchError`, `AssetResponseDto`, `BoardTask`, `AttachmentUpload`, and `AttachmentsState` are all untouched.

### State-Machine Diagram (Textual)

```
Panel mount (selectedTask becomes non-null on BoardPage)
  │
  ▼
TaskDetailPanelComponent constructor runs → effect registered → effect body runs once
  │
  ▼
id := task().id
  │
  ├─ id is empty / null ────────────────────────────────► no-op
  │
  └─ id is non-empty
     │
     ├─ id === lastHydratedTaskId ──────────────────────► no-op
     │
     └─ id !== lastHydratedTaskId
        │
        lastHydratedTaskId := id
        │
        hydrateCompletedForTask(id, 'effect')
        │
        ├─ state.completedFetchByTaskId[id].phase === 'loading' ──► no-op (today's dedupe)
        ├─ state.completedFetchByTaskId[id].phase === 'ready'   ──► no-op (NEW backstop)
        └─ otherwise ─────────────────────────────────────────────► GET /api/task/{id}/assets
                                                                    → merge into completedByTaskId[id]
                                                                    → completedFetchByTaskId[id] := { phase: 'ready', error: null }

Unrelated TaskUpdated arrives for task Y (Y ≠ open task X)
  │
  ▼
BoardStateService.onTaskUpdated rebuilds tasksByColumnId() map
  │
  ▼
BoardPage.selectedTask computed re-reads the bucket, returns a new BoardTask reference for X
  │
  ▼
[task] input into TaskDetailPanelComponent re-emits (new reference, same id)
  │
  ▼
effect runs → id === 'X' === lastHydratedTaskId → NO-OP (the fix) ✓
```

---

## Service Integration

### AttachmentsStateService — Modified Method

**File:** `src/app/features/attachments/state/attachments-state.service.ts`

**Signature change (backwards-compatible):**

```typescript
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
 *    always deduped (unchanged).
 *  - Calls for the same taskId while the list is `ready` are a no-op iff
 *    `trigger === 'effect'` (NEW); `trigger === 'retry'` fetches.
 *  - Calls on `error` or `idle` always fetch.
 */
hydrateCompletedForTask(
  taskId: string,
  trigger?: AttachmentsHydrateTrigger
): void;
```

**No changes to `listAttachmentsByTask` in `AttachmentsApiService`.** No changes to the HTTP contract. No changes to `mergeCompletedAssets`, `setFetchState`, `onAssetCompleted`, `onAssetFailed`, or any SignalR handler. No changes to the `listSubs` map.

### Call Sites to Update

| Call site | Today | After |
|---|---|---|
| `TaskDetailPanelComponent` constructor effect (`task-detail-panel.component.ts:146-151`) | `hydrateCompletedForTask(id)` (defaults to `'retry'`) | `hydrateCompletedForTask(id, 'effect')` — and gated by `id !== lastHydratedTaskId` |
| `TaskDetailPanelComponent.handleRetryListFetch` (`task-detail-panel.component.ts:179-181`) | `hydrateCompletedForTask(this.task().id)` | `hydrateCompletedForTask(this.task().id, 'retry')` *(explicit; or leave implicit — both work identically since `'retry'` is the default)* |

No other callers exist today. A project-wide grep for `hydrateCompletedForTask` should return only these two sites plus the spec files.

### HTTP Request/Response Contracts — Unchanged

| Method | Endpoint | Request Body | Response Body | Error Codes |
|---|---|---|---|---|
| GET | `/api/task/{taskId}/assets` | — | `AssetResponseDto[]` | 403, 404, 5xx, 0 (network) |

Unchanged in method, path, query parameters, headers, response shape, and status code set. Verified against [`backend_api_map.md`](./backend_api_map.md).

### SignalR — Unchanged

`AssetCompleted`, `AssetFailed`, `AssetUploadStarted`, `AssetProcessing`, and `TaskUpdated` event subscriptions and handlers are unchanged. The live-update path continues to flow through `onAssetCompleted` → `appendCompleted` → `completedByTaskId[taskId]`.

---

## Implementation Steps

Follow these steps in order. Each step has a concrete verification gate (either a build step or a test-level assertion).

### 1. Add the `AttachmentsHydrateTrigger` type

- [ ] Open `src/app/features/attachments/state/attachments-state.service.ts`.
- [ ] Export a new type at the top of the file (above the `@Injectable` decorator):

  ```typescript
  export type AttachmentsHydrateTrigger = 'effect' | 'retry';
  ```

- [ ] Verify the file still compiles (`npm run build`).

### 2. Extend `hydrateCompletedForTask` with the trigger parameter

- [ ] Still in `attachments-state.service.ts`.
- [ ] Change the signature from `hydrateCompletedForTask(taskId: string): void` to `hydrateCompletedForTask(taskId: string, trigger: AttachmentsHydrateTrigger = 'retry'): void`.
- [ ] Immediately after the existing early-return on `!taskId` and the existing `current?.phase === 'loading'` dedupe check, add a second dedupe check:
  - If `trigger === 'effect'` **and** `current?.phase === 'ready'`, return early (no HTTP call, no state mutation, no subscription created).
- [ ] Do **not** touch the error / idle / undefined phase paths — they continue to fetch.
- [ ] Verify the build still passes.

### 3. Rework the panel's constructor effect to gate on taskId transitions

- [ ] Open `src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`.
- [ ] Add a private class field `lastHydratedTaskId: string | null = null;` above the constructor (preferred — does not tangle with the effect's own signal-tracking).
- [ ] Replace the existing effect body:

  **Before (today):**
  ```typescript
  effect(() => {
    const id = this.task().id;
    if (id) {
      this.attachmentsState.hydrateCompletedForTask(id);
    }
  });
  ```

  **After (target behaviour — developer writes actual code):**
  ```typescript
  effect(() => {
    const id = this.task().id;
    if (id && id !== this.lastHydratedTaskId) {
      this.lastHydratedTaskId = id;
      this.attachmentsState.hydrateCompletedForTask(id, 'effect');
    }
  });
  ```

  The exact code belongs to the developer per this repo's conventions; the behaviour must match the description above.

- [ ] Keep the inline comment near the effect but update it to reflect the new invariant (something like: *"Hydrate once per taskId transition. Same-id re-emissions — e.g. from unrelated TaskUpdated echoes that rebuild the BoardTask reference — are ignored."*).

### 4. Update the retry call site (optional but explicit)

- [ ] In the same file, in `handleRetryListFetch`, optionally pass the explicit trigger for readability: `this.attachmentsState.hydrateCompletedForTask(this.task().id, 'retry');`.
- [ ] This step is **cosmetic** — the default parameter value is `'retry'`, so a bare call behaves identically. Either form is acceptable.

### 5. Extend the panel component spec

- [ ] Open `src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts`.
- [ ] **Keep** the existing test *"calls hydrateCompletedForTask on initial render for the open task"*. Update its assertion to accept the new `'effect'` trigger arg: `expect(mockState.hydrateCompletedForTask).toHaveBeenCalledWith('t-1', 'effect');`.
- [ ] **Keep** the existing test *"re-calls hydrateCompletedForTask when the task input changes to a new id"*. Update its assertion similarly: `expect(mockState.hydrateCompletedForTask).toHaveBeenCalledWith('t-2', 'effect');`.
- [ ] **Keep** the existing test *"retry of the list fetch calls hydrateCompletedForTask again"*. Update its assertion to accept the explicit trigger if step 4 was taken: `expect(mockState.hydrateCompletedForTask).toHaveBeenCalledWith('t-1', 'retry');` — or leave as-is if step 4 was skipped (bare call, default trigger).
- [ ] **Add** a new test: *"does not re-call hydrateCompletedForTask when the task input re-emits with the same id but a new reference"*:
  - `mockState.hydrateCompletedForTask.mockClear()` after initial render.
  - `fixture.componentRef.setInput('task', makeTask({ id: 't-1', title: 'Renamed — same id' }));` — deliberately new reference, same id.
  - `fixture.detectChanges();`
  - Assert `mockState.hydrateCompletedForTask` was **not** called.
- [ ] **Add** a new test: *"does not re-call hydrateCompletedForTask when only a non-id field of the open task changes"*:
  - After initial render, clear the mock.
  - Set `task` input to a new `BoardTask` with the same `id: 't-1'` but a new `content` (simulating a remote description edit echo for the open task).
  - Assert no re-call.
- [ ] **Add** a new test: *"re-calls hydrateCompletedForTask after a full close+reopen onto the same id (new component instance)"*. Simulated by destroying the fixture and creating a new one; the `lastHydratedTaskId` starts at `null` on the new instance, so the effect fires once. The assertion is *"the state service was called once for 't-1' with 'effect'"*.

### 6. Extend the state service spec

- [ ] Open `src/app/features/attachments/state/attachments-state.service.spec.ts`.
- [ ] **Add** a test under the existing `describe('hydrateCompletedForTask', ...)` block:
  - *"is a no-op when trigger='effect' and the current phase is 'ready'"*: seed `completedFetchByTaskId['t-1']` to `{ phase: 'ready', error: null }` (e.g. by calling `hydrateCompletedForTask('t-1')` and flushing the HTTP mock, or by directly driving the API stub). Then call `hydrateCompletedForTask('t-1', 'effect')`. Assert no new call to `attachmentsApi.listAttachmentsByTask`.
- [ ] **Add** a test: *"still fetches when trigger='retry' and the current phase is 'ready'"*: same seed, then `hydrateCompletedForTask('t-1', 'retry')`. Assert a new API call was made.
- [ ] **Add** a test: *"fetches when trigger='effect' and the current phase is 'error'"*: seed the state with a `phase: 'error'` entry, call with `'effect'`. Assert a new API call.
- [ ] **Add** a test: *"fetches when trigger='effect' and no entry exists (idle)"*: empty state, call with `'effect'`. Assert a new API call.
- [ ] **Keep** all existing tests green; the new parameter defaulting to `'retry'` means existing test call sites (`hydrateCompletedForTask('t-1')`) continue to behave as today.

### 7. Build and regression-test

- [ ] `npm run build` — must succeed with zero errors and zero new warnings introduced by this change.
- [ ] `npm run test -- --watch=false` — all tests must pass. Report Total / Passed / Failed / Skipped.
- [ ] Classify any failure as PRE-EXISTING or INTRODUCED per the CLAUDE.md rule. INTRODUCED failures block completion.

### 8. Manual QA smoke (optional but recommended)

- [ ] Open a task detail panel on a task with ≥ 1 attachment. Filter DevTools Network by `assets`. Confirm exactly **one** `GET`.
- [ ] From a second browser (or by manually dispatching a `TaskUpdated` into the SignalR mock), cause a `TaskUpdated` for a **different** task while the panel stays open. Confirm **zero** new `GET`s.
- [ ] Cause a `TaskUpdated` for the **same** task (e.g. rename it remotely). Confirm **zero** new `GET`s, but the rendered title updates.
- [ ] Close the panel and open the same task again. Confirm **zero** new `GET`s (Option A).
- [ ] Close the panel and open a **different** task. Confirm **exactly one** new `GET` for the new task id.
- [ ] Simulate a 500 on the initial fetch. Click Retry. Confirm one new `GET` per click.

### Performance Considerations

- **Zero runtime regression** — this fix removes work. The panel-local transition gate is a cheap string compare per effect run; the service-level short-circuit is a single property read.
- **No memory growth** — the tracker is a single `string | null` on the component instance, GC'd on panel destroy.
- **No additional Angular signal registration** — Option 1 (bare field) adds no signal graph edges. Option 2 (signal + `untracked`) adds one node but does not propagate through the effect dependency tree.

---

## QA Guidance

### Test Strategy

**Unit Tests (Component — `task-detail-panel.component.spec.ts`):**

Cover the transition gate's three critical cases:

1. *Initial mount fires exactly one hydrate with `'effect'` for the current task id.* (existing, modified)
2. *Task input changes to a new id → hydrate fires for the new id.* (existing, modified)
3. *Task input re-emits with the same id but a new reference → hydrate does **not** fire.* (new)
4. *Task input re-emits with the same id but a new `title` / `content` / `taskOrder` / `columnId` / `assignedId` → hydrate does **not** fire.* (new, can be consolidated with #3 via parameterised test)
5. *Explicit retry → hydrate fires regardless of current state.* (existing, trigger assertion updated)
6. *Panel destroy + remount with the same task id → hydrate fires once on the fresh mount.* (new)

**Unit Tests (Service — `attachments-state.service.spec.ts`):**

Cover the dedupe matrix at the service level:

1. *`trigger === 'effect'` on `ready` → no HTTP call.* (new)
2. *`trigger === 'retry'` on `ready` → one HTTP call.* (new)
3. *`trigger === 'effect'` on `error` → one HTTP call.* (new)
4. *`trigger === 'effect'` on `idle` / undefined → one HTTP call.* (new)
5. *`trigger === 'effect'` on `loading` → no HTTP call (today's dedupe still applies).* (new — may already be implied by existing "dedupes concurrent calls" test, extend to cover the `'effect'` path explicitly)
6. *Default parameter keeps today's behaviour for any caller that does not pass a trigger.* (existing tests that call `hydrateCompletedForTask('t-1')` must all remain green.)

**Integration Tests (BoardPage + TaskDetailPanel):**

Optional but high-value — the full system test that proves the bug is fixed:

1. Mount `BoardPageComponent` with a mock `BoardStateService` exposing a `tasksByColumnId` signal.
2. Set `selectedTaskId` to `'t-X'`.
3. Inject the panel. Assert one hydrate call.
4. Emit a new `tasksByColumnId` value — same `'t-X'` row object mutated elsewhere (i.e. any board-state emission, like what `onTaskUpdated` produces for a different task). The `selectedTask` computed re-fires, the panel's `[task]` input sees a new reference with the same id.
5. Assert the hydrate mock was **not** called a second time.
6. Change `selectedTaskId` to `'t-Y'`. Assert one new hydrate call for `'t-Y'`.

**E2E Tests (optional):**

Not strictly required — this is a fetch-count bug with no user-visible happy-path change. If the repo has Cypress/Playwright coverage for the board page, add one E2E assertion:

1. Open task X.
2. Intercept `GET /api/task/X/assets` — assert exactly one call.
3. Trigger a simulated remote `TaskUpdated` for a different task via the SignalR mock.
4. Assert the `GET /api/task/X/assets` count is still exactly one.

### Mocking Instructions

**Mock `AttachmentsStateService` in panel tests** — existing `createMockAttachmentsState()` helper is already in the spec. The only change: its `hydrateCompletedForTask` field must be a `vi.fn()` that accepts `(taskId: string, trigger?: 'effect' | 'retry')`. No code change required since `vi.fn()` is variadic, but assertions must include the trigger argument.

**Mock `AttachmentsApiService` in state-service tests** — existing pattern. Spy on `listAttachmentsByTask`, return a `Subject` or a stubbed `of(...)`, assert call counts per phase × trigger.

### Edge Cases to Test

- **Empty `task().id`** — shouldn't happen for `input.required<BoardTask>()`, but the effect must still no-op if `id` is falsy. (Guard is already in today's code; keep it.)
- **Very rapid open → close → open on the same task** — multiple mount / destroy cycles. Each mount's fresh tracker means each mount fires one hydrate call, but the service-level `'effect'` short-circuit on `ready` means only the first one actually hits the network. Total: one `GET`. (AC §"Rapidly opening ... three times in quick succession" → "at most a small bounded number of `GET`s" — the bound here is effectively 1.)
- **Hydrate errors → reopen same task** — panel close destroys the component, fresh mount has fresh tracker, effect calls `hydrateCompletedForTask(id, 'effect')`, state has `phase: 'error'` → service fetches → new `GET`. ✓ (desired behaviour: re-open after error gets the user out of the error banner.)
- **SignalR disconnect/reconnect while panel is open on X** — no change to `lastHydratedTaskId` (it is panel-local, not signalR-driven). Re-connection does not re-trigger the effect on the same id. The panel does not refetch on reconnect by this ticket; the attachments state service's reconnection handler re-subscribes to events, which is unchanged.
- **Two panels in the DOM simultaneously** — not possible today (one detail panel at a time), but if it ever were, each component instance has its own `lastHydratedTaskId` and the service's dedupe by `phase` still holds. No concurrent storm.
- **`untracked` correctness** — if the developer uses Option 2 (signal-backed tracker), the read inside the effect must be `untracked(() => this.lastHydratedTaskId())`, otherwise writing to the signal inside the effect will schedule the effect to re-run, causing an infinite loop. This is explicitly called out in the implementation step.

### Acceptance-Criteria Coverage Map

| Context Doc AC | Spec Section / Test |
|---|---|
| "Panel open — initial fetch: exactly one `GET`" | Panel spec test #1; service spec test #4 (idle → fetch) |
| "Unrelated board activity — zero additional `GET`s" | Panel spec test #3 (new) |
| "`X`'s metadata updated remotely — no re-fetch" | Panel spec test #4 (new) |
| "Live attachment updates — SignalR only" | Unchanged path; existing SignalR tests cover this |
| "Task navigation — fresh single fetch per new task id" | Panel spec test #2 (modified) |
| "Close and re-open the same task — at most one fetch" | Panel spec test #6 + service spec test #1 (ready → no-op) |
| "Explicit Retry — still works" | Panel spec test #5; service spec test #2 (retry on ready → fetch) |
| "Error paths — regression guard" | Service spec test #3 (error → fetch); existing error-mapping tests |
| "Backend observability — one `SELECT` per panel-open" | Validated end-to-end by the combination of #1 + #3 + #4 |
| "Real-time sync — regression guard" | Unchanged code paths; existing SignalR tests cover this |
| "Accessibility — regression guard on unchanged announcements" | Unchanged UI; existing a11y tests cover this |

---

## Design Validation Checklist

**Interface Alignment:**
- [x] `AttachmentsHydrateTrigger` is a discriminated string literal union — no runtime cost, no DTO mismatch possible.
- [x] `hydrateCompletedForTask` signature is backwards-compatible via the default parameter.
- [x] `BoardTask` is untouched. `AssetResponseDto` is untouched. `AttachmentListFetchState` is untouched.

**Standards Compliance:**
- [x] `inject()` usage preserved. No constructor injection added.
- [x] Signals used for UI state; the transition-gate tracker is a bare field (or a signal with `untracked`) to avoid feedback loops.
- [x] RxJS still owns the HTTP subscription lifetime.
- [x] `ChangeDetectionStrategy.OnPush` preserved.
- [x] `takeUntilDestroyed()` not required — the existing `destroyRef.onDestroy(...)` subscription teardown in the state service covers HTTP cancellation.

**Security:**
- [x] No new routes, so no guard changes.
- [x] No new user inputs. No XSS surface.
- [x] No new logging. No PII exposure.

**Completeness:**
- [x] All file modifications enumerated.
- [x] Implementation steps are in logical, verifiable order.
- [x] Every acceptance criterion in the context doc maps to a test.
- [x] Edge cases (rapid reopen, error-then-reopen, empty id) are covered.
- [x] No out-of-scope items sneaked in.

---

## Summary of Files Touched

**Modified (4):**
1. `src/app/features/attachments/state/attachments-state.service.ts` — add `AttachmentsHydrateTrigger`, extend `hydrateCompletedForTask` with the trigger parameter and the `'effect'`-on-`ready` short-circuit.
2. `src/app/features/attachments/state/attachments-state.service.spec.ts` — add four new tests covering the dedupe matrix.
3. `src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` — add `lastHydratedTaskId` field, rework the constructor effect to gate on transitions.
4. `src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts` — update trigger-arg assertions on existing tests, add three new tests covering same-id re-emission, non-id field changes, and destroy+remount.

**Created (0):** None.

**Out of scope (explicitly not touched):**
- `BoardStateService.onTaskUpdated`
- `AttachmentsApiService.listAttachmentsByTask`
- `AttachmentListComponent`, `AttachmentRowComponent`, `FileDropzoneComponent`, `UploadProgressRowComponent`, `TaskDescriptionSectionComponent`
- `BoardPageComponent.selectedTask` computed
- SignalR wiring, event names, or payload shapes
- Backend API (endpoint, query params, response shape, status codes)
- Routing, guards, auth
- `localStorage` / `sessionStorage` / `IndexedDB` caching

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification.*

---

## Development Status

**Implementation complete** — 2026-05-11.

### Files modified

1. `KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts`
   - Exported new `AttachmentsHydrateTrigger` type (`'effect' | 'retry'`).
   - Extended `hydrateCompletedForTask` signature with a backwards-compatible `trigger: AttachmentsHydrateTrigger = 'retry'` parameter.
   - Added the defensive backstop: `trigger === 'effect' && phase === 'ready'` short-circuits with no HTTP call, no state mutation, no subscription.
2. `KanbAI-Web/src/app/features/attachments/state/attachments-state.service.spec.ts`
   - Added five new tests under `describe('hydrateCompletedForTask', ...)` covering the dedupe matrix: `'effect'`+`ready`→no-op, `'retry'`+`ready`→fetch, `'effect'`+`error`→fetch, `'effect'`+`idle`→fetch, and default-parameter parity.
3. `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`
   - Added private field `lastHydratedTaskId: string | null = null;` above the constructor.
   - Reworked the constructor `effect(...)` to gate on `id !== this.lastHydratedTaskId` and pass the explicit `'effect'` trigger.
   - Updated the inline comment to reflect the transition-gated invariant.
   - Passed explicit `'retry'` trigger in `handleRetryListFetch` for clarity.
4. `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts`
   - Updated existing `'calls hydrateCompletedForTask on initial render for the open task'` assertion to include the `'effect'` trigger arg.
   - Updated existing `'re-calls hydrateCompletedForTask when the task input changes to a new id'` assertion similarly.
   - Updated existing `'retry of the list fetch calls hydrateCompletedForTask again'` assertion to include the explicit `'retry'` trigger arg.
   - Added three new tests: same-id re-emission with new reference → no call; non-id field change (new content) → no call; destroy + remount on same task id → exactly one `'effect'` call on fresh mount.

### Build result

`npm run build` — **PASS**. No TypeScript errors, no newly-introduced warnings. Pre-existing SCSS deprecation and bundle-budget warnings are unchanged (not touched by this ticket).

### Test result

`npx ng test --watch=false` via Vitest:

- **Total:** 1371
- **Passed:** 1371
- **Failed:** 0
- **Skipped:** 0
- **Test files:** 69 passed / 69 total

All tests green; no pre-existing failures surfaced; no introduced failures.

### SCSS audit

`git diff --name-only | grep -i scss` returns **empty**. Zero SCSS files modified, per design-spec §7.1.

### Out-of-scope confirmed untouched

- `BoardStateService.onTaskUpdated`, `AttachmentsApiService.listAttachmentsByTask`, `BoardPageComponent`.
- `AttachmentListComponent`, `AttachmentRowComponent`, `FileDropzoneComponent`, `UploadProgressRowComponent`, `TaskDescriptionSectionComponent`.
- Any `.html` template, any `.scss` file, any routing / guard / SignalR wiring, any backend code.
- `hydrateCompletedForTask`'s public name is unchanged; only a defaulted trigger parameter was added.

*Development is complete and files are saved. You can now instruct QA to review the implementation and run the manual-QA smoke script in tech spec §8 and design spec §7.6.*
