# Technical Specification: Editable task descriptions in the task detail panel

**Context Document:** [issue_91_context.md](./issue_91_context.md)
**GitHub Issue:** #91
**Backend contract:** [.claude/backend_api_map.md](../../.claude/backend_api_map.md) §Tasks / §`UpdateTaskDescriptionDto` / §`TaskUpdated`

---

## Overview

This ticket extends the existing `TaskDetailPanelComponent` to add a full read/edit/clear lifecycle for the task Description, backed by two new write methods on `TasksApiService` (`updateTaskDescription`, `clearTaskDescription`) and a remote-update-during-edit guard that snapshots `task().content` on edit entry. All state is component-local (Angular Signals); the existing `BoardStateService.onTaskUpdated` handler continues to own the *read-mode* reconciliation — the panel simply re-renders off the existing signal chain, and in *edit mode* the snapshot-comparison effect raises a conflict banner instead of overwriting the draft. No backend, no routing, and no state-layer changes. One new presentational sub-component (`TaskDescriptionSectionComponent`) is extracted so the panel stays a thin host and the Description edit surface is independently testable — see Design Call #8 below.

---

## Component Architecture

### Routing

**No new routes, no new guards.** The feature is entirely hosted inside the existing `BoardPageComponent` → `TaskDetailPanelComponent` tree.

### Component Hierarchy

**Smart container (unchanged ownership):**
- `BoardPageComponent` — continues to own `selectedTask` (the task shown in the panel). A new handler `handleTaskNotFound()` is added to close the panel and surface the 404 toast (see Design Call #6).

**Modified smart/dumb host:**
- `TaskDetailPanelComponent` (`src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`) — stays thin. Delegates the entire Description section to the new child. Adds a new `taskNotFound` output so the host can close the panel on 404.

**New presentational sub-component (Design Call #8):**
- `TaskDescriptionSectionComponent` (`src/app/features/board/components/task-description-section/task-description-section.component.ts`)
  - Responsible for: read projection, edit mode, clear confirmation, live-region announcements, and all related signals (`mode`, `draft`, `isSaving`, `inlineError`, `remoteUpdateDetected`, `showClearConfirm`, `contentSnapshot`).
  - **Inputs:**
    - `task = input.required<BoardTask>()` — full task, to read `id` + `content` + re-render on remote update.
  - **Outputs:**
    - `taskNotFound = output<void>()` — raised on 404 from either write. Host closes the panel + shows a toast.
  - **Encapsulation rationale:** The panel now hosts three orthogonal surfaces (description, attachments, in-future more). Each adds ≥100 LoC of mode-state, validators, error copy, and keybindings. Bundling them on the panel will cross ~400 LoC of mixed concerns — a maintenance trap. Splitting also lets the unit test suite exercise the full edit/clear/conflict matrix without mounting the unrelated attachments dropzone.

### New Files to Create

- `src/app/features/board/components/task-description-section/task-description-section.component.ts`
- `src/app/features/board/components/task-description-section/task-description-section.component.html`
- `src/app/features/board/components/task-description-section/task-description-section.component.scss`
- `src/app/features/board/components/task-description-section/task-description-section.component.spec.ts`
- `src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.ts`
- `src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.html`
- `src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.scss`
- `src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.types.ts`
- `src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.spec.ts`
- `src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.ts` *(if no toast shell exists — see Design Call #6; otherwise omit and reuse PartialFailureToastComponent patterns)*
- `src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.html`
- `src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.scss`

### Files to Modify

- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` — swap the inline Description section for the new child; add `taskNotFound` output; remove `descriptionDisplay` + `descriptionLabelId` (now live on the child).
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.html` — replace lines 40–54 with a single `<app-task-description-section>` tag; forward `taskNotFound`.
- `src/app/features/board/services/tasks-api.service.ts` — add `updateTaskDescription`, `clearTaskDescription`, and `mapTaskDescriptionErrorToUserMessage` (mirrors `mapTaskMoveErrorToUserMessage` shape).
- `src/app/features/board/models/task.model.ts` — add `UpdateTaskDescriptionDto` and `TaskDescriptionUpdateResponse` aliases.
- `src/app/features/board/board-page/board-page.component.ts` — wire `(taskNotFound)="handleTaskNotFound()"` on `<app-task-detail-panel>`; add a `taskNotFoundToast` signal + handler to close the panel and show the toast.
- `src/app/features/board/board-page/board-page.component.html` — append the toast render under the existing `@if (selectedTask(); as task)` block.
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts` — prune description-mode assertions that now live on the child; add a shallow harness proving the child is rendered.

---

## State & Data Layer

### Copy constants

Add a frozen constants module next to the new component. All user copy referenced anywhere in this spec or the context doc's acceptance criteria is sourced from here — any drift is a bug:

**File:** `src/app/features/board/components/task-description-section/task-description-copy.ts`

```typescript
export const TASK_DESCRIPTION_COPY = {
  EMPTY_PLACEHOLDER: 'No description yet — click to add one',
  INLINE_ERROR_EMPTY: 'Description cannot be empty',
  INLINE_ERROR_GENERIC_SAVE: "Couldn't save description — please try again",
  INLINE_ERROR_PERMISSION: "You don't have permission to edit this task",
  INLINE_ERROR_NETWORK: "Couldn't reach the server — try again",
  TOAST_TASK_NOT_FOUND: 'This task no longer exists',
  ANNOUNCE_SAVED: 'Description saved',
  ANNOUNCE_CLEARED: 'Description cleared',
  BANNER_REMOTE_UPDATED: 'This task was updated by someone else',
  BANNER_DISCARD_ACTION: 'Discard my changes and reload',
  CLEAR_CONFIRM_TITLE: 'Clear this description?',
  CLEAR_CONFIRM_CONFIRM_LABEL: 'Confirm',
  CLEAR_CONFIRM_CANCEL_LABEL: 'Cancel',
  TEXTAREA_LABEL: 'Task description',
  EDIT_BUTTON_LABEL: 'Edit description',
  CLEAR_BUTTON_LABEL: 'Clear description',
  SAVE_BUTTON_LABEL: 'Save',
  CANCEL_BUTTON_LABEL: 'Cancel'
} as const;

export const TASK_DESCRIPTION_MAX_LENGTH = 10_000;
export const TASK_DESCRIPTION_COUNTER_THRESHOLD = 9_000;
```

### State model — `TaskDescriptionSectionComponent`

Signals, each with exact type (all `private` unless used by the template — template-facing ones are `readonly`):

| Signal | Type | Purpose |
|--------|------|---------|
| `mode` | `WritableSignal<'read' \| 'edit'>` | Drives the `@if` switch in the template. Transitions: `read → edit` on affordance activation; `edit → read` on successful save, successful discard, or Escape/Cancel. |
| `draft` | `WritableSignal<string>` | Raw textarea value. Bound two-way via `(input)` + `[value]`. Never trimmed in place — trim only for validation/save. |
| `isSaving` | `WritableSignal<boolean>` | True while `updateTaskDescription` is in flight. Disables Save, Cancel, textarea, Clear, and the Discard banner action. |
| `isClearing` | `WritableSignal<boolean>` | True while `clearTaskDescription` is in flight (from the confirm dialog's close-callback). Disables the Clear affordance so the user cannot double-fire. |
| `inlineError` | `WritableSignal<string \| null>` | Inline error copy shown inside the editor. Cleared on every fresh save attempt, on textarea input, and on mode transition. |
| `remoteUpdateDetected` | `WritableSignal<boolean>` | True once a `TaskUpdated` arrives while `mode === 'edit'`. Renders the "updated by someone else" banner. Cleared by `discardAndReload()` or on exit of edit mode. |
| `contentSnapshot` | `WritableSignal<string \| null>` | The value of `task().content` captured at the instant edit mode was entered. See Design Call #2. Null outside edit mode. |
| `liveMessage` | `WritableSignal<string>` | Text rendered into the polite live region. Set to `ANNOUNCE_SAVED` / `ANNOUNCE_CLEARED` + cleared a tick later via `setTimeout(..., 0)` (or `queueMicrotask`) so consecutive identical announcements still fire. |

Derived (`computed`) signals:

| Signal | Type | Derivation |
|--------|------|------------|
| `readDisplay` | `Signal<{ mode: 'empty' \| 'text'; text: string }>` | Current read-mode projection of `task().content`. Identical rule to the existing `descriptionDisplay`: null / empty / whitespace-only → `empty`, else `text`. |
| `trimmedLength` | `Signal<number>` | `this.draft().trim().length`. |
| `rawLength` | `Signal<number>` | `this.draft().length`. Used for the counter (backend enforces length on the trimmed value per `backend_api_map.md:102`, but the client counter intentionally displays raw length so the user sees exactly what they typed; trim happens on send). |
| `isOverLimit` | `Signal<boolean>` | `this.rawLength() >= TASK_DESCRIPTION_MAX_LENGTH`. |
| `showCounter` | `Signal<boolean>` | `this.rawLength() > TASK_DESCRIPTION_COUNTER_THRESHOLD`. |
| `isEmptyAfterTrim` | `Signal<boolean>` | `this.trimmedLength() === 0`. |
| `canSave` | `Signal<boolean>` | `mode === 'edit' && !isSaving() && !isEmptyAfterTrim() && !isOverLimit()`. |
| `showClearAffordance` | `Signal<boolean>` | `task().content !== null && mode() === 'read'`. (Per the context doc, Clear is visible only when content is non-null; hidden in edit mode because Save/Cancel own that surface.) |

Effects:

- `effect(() => { ... })` compares `task().content` against `contentSnapshot()` while `mode() === 'edit'`. If they differ (by strict `!==`) AND `remoteUpdateDetected()` is still `false`, set `remoteUpdateDetected(true)`. Do NOT overwrite `draft`. Do NOT advance the snapshot (we want the banner to stick until the user discards — repeated remote edits keep the same banner).

### Remote-update-during-edit detection — Design Call #2

**Chosen approach:** Snapshot `task().content` into `contentSnapshot` at the moment the component enters edit mode. Register an `effect()` that reads `task()` and `contentSnapshot()`; when `mode === 'edit'` and `task().content !== contentSnapshot()`, flip `remoteUpdateDetected` to `true`.

**Justification (two sentences):** Because `BoardStateService.onTaskUpdated` already mutates the shared `tasksByColumnId` signal in-place, any remote `TaskUpdated` for the open task re-flows into the `task()` input without our touching SignalR directly — the effect reads the same source of truth the read-mode render uses. Using a snapshot (vs subscribing to the raw SignalR stream) keeps the conflict detection on the *observable outcome* rather than the *event*, so a pre-save local refresh or optimistic correction can never spuriously trigger the banner.

### TypeScript interfaces

**File:** `src/app/features/board/models/task.model.ts` (append)

```typescript
/**
 * Body of `PUT /api/task/{taskId}/description`. Backend trims leading/
 * trailing whitespace server-side; clients must still trim before send
 * so the length validator and the on-wire value agree. Max length 10,000
 * chars applied to the trimmed value.
 */
export interface UpdateTaskDescriptionDto {
  content: string;
}

/** Envelope alias for the description-update endpoint. */
export type TaskDescriptionUpdateResponse = ApiResponse<TaskResponseDto>;
```

`DELETE /api/task/{taskId}/description` returns `204 No Content`, so no DTO is needed — the API method returns `Observable<void>`.

---

## Service Integration

### `TasksApiService` — new methods

**File:** `src/app/features/board/services/tasks-api.service.ts` (extend)

```typescript
/**
 * `PUT /api/task/{taskId}/description` with body `{ content }`.
 * Returns the full post-update TaskResponseDto so the caller could
 * reconcile if it wanted to — in this ticket the caller does NOT
 * reconcile locally (BoardStateService.onTaskUpdated already will
 * via the SignalR echo), it just uses `200` as the signal to flip
 * back to read mode. Envelope unwrap mirrors `moveTask` / `createTask`:
 * success:false or data:null → observable error.
 */
updateTaskDescription(
  taskId: string,
  dto: UpdateTaskDescriptionDto
): Observable<TaskResponseDto>;

/**
 * `DELETE /api/task/{taskId}/description` — 204 No Content on success.
 * Returns `Observable<void>` (no envelope on the wire). Callers treat
 * any error via `mapTaskDescriptionErrorToUserMessage` with
 * operation='clear' to get the correct inline copy.
 */
clearTaskDescription(taskId: string): Observable<void>;
```

### Error mapping

Add a single operation-aware mapper that mirrors the shape of `mapTaskMoveErrorToUserMessage`. Parameterised on `operation: 'save' | 'clear'` so 404 can stay shared but the generic fallback for save can differ from clear (per the context doc, save's fallback is `INLINE_ERROR_GENERIC_SAVE`; clear has no explicit generic inline per the context — 404 closes the panel, 403 + network have dedicated copy, and any other error falls back to `INLINE_ERROR_GENERIC_SAVE` as the safe conservative choice).

```typescript
export type TaskDescriptionOperation = 'save' | 'clear';

/**
 * Translates an HTTP error from the description PUT/DELETE into a
 * discriminated result the component can act on. Returns:
 *  - `{ kind: 'inline', text }` — render inline in the editor / confirm
 *  - `{ kind: 'not-found' }` — close the panel, show the toast
 *  - `{ kind: 'server-errors', texts }` — 400 with ApiResponse.errors
 *    present; component renders the FIRST entry verbatim as inline copy.
 *
 * Never exposes status codes, URLs, stack traces, or raw envelope errors
 * beyond the single first string on 400 (same contract as the existing
 * mappers). See backend_api_map.md §"Update task description failures"
 * and §"Clear task description failures".
 */
export type TaskDescriptionErrorResult =
  | { kind: 'inline'; text: string }
  | { kind: 'not-found' }
  | { kind: 'server-errors'; texts: readonly string[] };

export function mapTaskDescriptionErrorToUserMessage(
  error: unknown,
  operation: TaskDescriptionOperation
): TaskDescriptionErrorResult;
```

**Mapping table (verbatim strings from the context doc):**

| HTTP status | Operation | Result |
|-------------|-----------|--------|
| `0` (network) | save or clear | `{ kind: 'inline', text: INLINE_ERROR_NETWORK }` → `"Couldn't reach the server — try again"` |
| `400` | save | `{ kind: 'server-errors', texts: <ApiResponse.errors> }`. Component renders `texts[0]` verbatim if present, else falls back to `INLINE_ERROR_GENERIC_SAVE`. (Clear cannot produce 400 — backend contract — so the mapper treats an unexpected 400 on clear as `INLINE_ERROR_GENERIC_SAVE`.) |
| `401` | either | Never surfaces here — global `authInterceptor` owns redirect-to-login (#86/#88). Defensive fallback: `INLINE_ERROR_GENERIC_SAVE`. |
| `403` | either | `{ kind: 'inline', text: INLINE_ERROR_PERMISSION }` → `"You don't have permission to edit this task"` |
| `404` | either | `{ kind: 'not-found' }` — host panel closes + toast. |
| `>=500` or any other | either | `{ kind: 'inline', text: INLINE_ERROR_GENERIC_SAVE }` → `"Couldn't save description — please try again"` |
| non-HttpErrorResponse | either | `{ kind: 'inline', text: INLINE_ERROR_GENERIC_SAVE }` |

**Never expose:** status codes, URLs, stack traces, envelope arrays beyond `texts[0]` on 400. Same policy as the existing mappers — any drift is a bug.

### HTTP Request/Response Contracts

| Method | Endpoint | Request body | Response body | Error codes handled |
|--------|----------|--------------|---------------|-------------|
| PUT | `/api/task/:taskId/description` | `UpdateTaskDescriptionDto` (`{ content: string }`) | `ApiResponse<TaskResponseDto>` | 0, 400, 401, 403, 404, 5xx |
| DELETE | `/api/task/:taskId/description` | — | `204 No Content` | 0, 401, 403, 404, 5xx |

---

## UI / Interaction Design

### Read-mode affordances

- **Filled state:** `<p class="task-description__text">{{ readDisplay().text }}</p>` with `white-space: pre-wrap` (style owned by web-designer). An *Edit description* button (visible, icon-or-text — owner is web-designer) sits next to the rendered text. The text itself is ALSO click-activatable — wrap it in a `<button type="button">` styled as a paragraph, so the existing "click the description to edit" AC is met while still rendering as a real activatable role. *(Do not use `<p>` with `(click)` — that fails the WCAG a11y AC requiring a button-or-link role on the affordance.)*
- **Empty state:** `<button type="button" class="task-description__empty-affordance">{{ COPY.EMPTY_PLACEHOLDER }}</button>` → text: *"No description yet — click to add one"*. Full-width row, role=button, keyboard-activatable via Enter/Space (native button handles this for free).
- **Clear button:** rendered only when `showClearAffordance() === true`. Sits beside the Edit affordance.

### Edit-mode UI

- `<label for="task-description-editor-{{ task().id }}">Task description</label>` — visually accessible or sr-only (web-designer call). The `<textarea>` gets `[id]="'task-description-editor-' + task().id"` and `[attr.aria-invalid]="inlineError() !== null || null"`.
- Auto-focus on mode entry via `effect(() => mode() === 'edit' && queueMicrotask(() => textareaRef.nativeElement.focus()))`, then `setSelectionRange(draft().length, draft().length)` so the caret lands at the end of the pre-filled value (per context doc flow 2.a).
- Counter renders only when `showCounter()` is true, with text `{{ rawLength() }} / {{ TASK_DESCRIPTION_MAX_LENGTH }}`. CSS-only colour change (web-designer owns the over-limit colour) when `isOverLimit() === true`.
- Inline error renders below the textarea whenever `inlineError() !== null`. It is NOT `aria-live` (errors are rendered visibly and associated via `aria-describedby`); the polite live region is reserved for save/clear success announcements per the context doc.
- Save button is `[disabled]="!canSave()"`. Cancel button is only disabled while `isSaving()`.

### Keyboard bindings — Design Call #5

Implemented via template `(keydown)` handlers on the textarea (stopPropagation where necessary to avoid clashing with the panel's `@HostListener('document:keydown.escape')`):

- **Read mode, focus on empty-state button or text-button:** Enter / Space → enter edit mode (native button behaviour).
- **Edit mode, focus inside textarea:**
  - `Ctrl+Enter` (or `Meta+Enter` on macOS — treat both) → Save if `canSave()`; no-op otherwise.
  - `Escape` → Cancel. Must `event.stopPropagation()` so the panel-level Escape handler doesn't also close the drawer. Cancel clears `draft`, `inlineError`, `remoteUpdateDetected`, `contentSnapshot`, flips `mode` back to `'read'`, and refocuses the Edit affordance.
  - `Enter` alone → default newline insertion (do not capture).

### Clear confirmation — Design Call #7 (focus trap)

Use `@angular/cdk/dialog` (already used by the Members flow, e.g. `RemoveMemberConfirmDialogComponent`). Open via `inject(Dialog).open(...)` from the section component with:

```typescript
this.dialog.open<boolean, TaskDescriptionClearConfirmData, TaskDescriptionClearConfirmDialogComponent>(
  TaskDescriptionClearConfirmDialogComponent,
  {
    data: { /* nothing needed — copy is baked in */ },
    ariaLabelledBy: 'task-description-clear-heading',
    autoFocus: 'first-tabbable',
    restoreFocus: true,
    panelClass: 'task-description-clear-confirm-panel',
    backdropClass: 'task-description-clear-confirm-backdrop'
  }
);
```

CDK Dialog provides the focus trap and Escape-to-dismiss automatically — confirmed against the existing `RemoveMemberConfirmDialogComponent` pattern. The dialog component has two buttons (*Cancel*, *Confirm*); `Confirm` closes with `true`, `Cancel` closes with `undefined`. The parent subscribes to `closed` and fires `clearTaskDescription` on `true`.

### 404 handling — Design Call #6

**Existing toast pattern:** `PartialFailureToastComponent` at `src/app/features/projects/components/partial-failure-toast/partial-failure-toast.component.ts` is the only toast in the codebase (auto-dismiss 8s, pause on hover, `role="status"`, polite live region). There is NO shared toast service. This ticket follows that precedent: a **new, feature-local** `TaskNotFoundToastComponent` with a thinner API — no project name, no "Open board" action, just a single message + dismiss button.

**Flow:**
1. The section component receives a `{ kind: 'not-found' }` result from either the save or clear error branch.
2. It emits `taskNotFound` (output) — does NOT mutate `mode` itself, because the panel is about to close.
3. `TaskDetailPanelComponent` re-emits `taskNotFound` to its own host (`BoardPageComponent`).
4. `BoardPageComponent.handleTaskNotFound()`:
   - Sets `selectedTask.set(null)` → the existing `@if (selectedTask(); as task)` in the template collapses the panel.
   - Sets a new `taskNotFoundToast = signal<{ message: string } | null>(null)` to render the toast.
   - The toast auto-dismisses after 8 s or on click; `(dismiss)` sets `taskNotFoundToast.set(null)`.

**Copy:** `"This task no longer exists"` (verbatim from context doc).

### Real-time sync

Already-shipped: `BoardStateService.onTaskUpdated` in `board-state.service.ts:317-353` reconciles `task.content` by `id`. The section component reads `task()` as an input. Two cases:

- **`mode === 'read'`:** the `readDisplay` computed signal re-derives off `task().content`; render updates immediately. No announcement, no banner — deliberately silent per the context doc's out-of-scope list.
- **`mode === 'edit'`:** the effect described in Design Call #2 sees `task().content !== contentSnapshot()` and flips `remoteUpdateDetected` to `true`. The draft is never overwritten.

**Banner UI:** rendered above the textarea. Renders `BANNER_REMOTE_UPDATED` ("This task was updated by someone else") and a button with label `BANNER_DISCARD_ACTION` ("Discard my changes and reload"). The banner element carries `role="status"` + `aria-live="polite"` so AT announces it once on appearance. Activating Discard calls `discardAndReload()` which: clears `draft`, `inlineError`, `remoteUpdateDetected`, `contentSnapshot`; sets `mode` to `'read'`; focus returns to the Edit affordance.

**Saving while banner visible:** per the context doc, Save still fires. The server is last-write-wins. No special-case in the client.

### Accessibility — Design Call #7

- **Section landmark:** reuse the existing `<section aria-labelledby="task-detail-description-{id}">` + `<h3 id="task-detail-description-{id}">Description</h3>` structure. Move both into the child component.
- **Textarea label:** `<label for="task-description-editor-{id}">Task description</label>`. Visually sr-only is acceptable (design-spec's call), but the `<label>` + `for` must exist in DOM for AT discoverability. `aria-label` is the fallback if the web-designer elects to drop the visual label entirely.
- **Focus order:** title → Description affordance (Edit button or empty-state button) → Clear button (when visible) → attachment section. Confirmed by Tab order since all elements are native `<button>` / `<a>` and render in DOM order.
- **Focus management on mode transitions:**
  - Read → Edit: focus moves into the textarea; caret at end of pre-filled value.
  - Edit → Read (any path — save success, cancel, discard, clear success): focus returns to the Edit affordance (or to the empty-state button if `content` is now null). Store a ref via `@ViewChild` for both targets and select at transition time.
  - Clear confirm open / close: CDK Dialog's `restoreFocus: true` returns focus to the Clear button.
- **Live region:** a single panel-local `<span class="sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage() }}</span>` inside the section. Used ONLY for `ANNOUNCE_SAVED` and `ANNOUNCE_CLEARED`. Inline errors are NOT announced through this region — they're rendered visibly and associated via `aria-describedby` on the textarea. The attachments section's `uploadLiveMessage` span is independent and stays where it is.
- **Banner announcement:** `role="status" aria-live="polite"` on the banner container. Appearing in DOM triggers a polite announcement; no second "updated again" announcement is needed because `remoteUpdateDetected` stays `true` until discard.
- **Keyboard visibility:** every button uses the host's existing focus-ring style (web-designer will specify exact colour; the spec requires the ring is visible on `:focus-visible`).

---

## Design Decisions — summary

1. **State model:** see State & Data Layer above. All signals on `TaskDescriptionSectionComponent`; nothing added to `BoardStateService` (no global state needed because only the open-panel view cares).
2. **Remote-update-during-edit detection:** snapshot `task().content` on edit-mode entry; an effect compares the live `task()` input against the snapshot and flips `remoteUpdateDetected` on divergence. Chosen over subscribing to the raw SignalR stream so the detection runs on observable state rather than events (see §Design Call #2 justification).
3. **Save/Clear API methods:** `updateTaskDescription(taskId, dto): Observable<TaskResponseDto>` and `clearTaskDescription(taskId): Observable<void>`. Error mapping via `mapTaskDescriptionErrorToUserMessage(error, operation)` returning a discriminated result so the component can branch cleanly between inline render vs 404-close-panel vs 400-server-errors. Verbatim strings enumerated in §Error mapping, sourced from context doc AC.
4. **Character counter thresholds:** counter visible when `rawLength > 9000`; Save disabled when `rawLength >= 10000`; Save also disabled when `trimmedLength === 0` (with the `INLINE_ERROR_EMPTY` copy rendered). Backend enforces on trimmed value per `backend_api_map.md:102`; client counter displays raw length (what the user typed) so the user sees exactly the count — the trim happens silently on send.
5. **Keyboard bindings:** Enter/Space to enter edit (native button); Ctrl+Enter (and Meta+Enter on mac) to save; Escape to cancel with `stopPropagation()` so it does not also close the drawer; CDK Dialog's focus trap + Escape handles the Clear confirmation automatically.
6. **404 handling:** section component emits `taskNotFound` → panel re-emits → `BoardPageComponent` closes the panel (`selectedTask.set(null)`) and shows a new, feature-local `TaskNotFoundToastComponent` modelled on `PartialFailureToastComponent` (pauseable, 8 s auto-dismiss, polite live region). No shared toast service exists and this ticket does not create one — scope boundary.
7. **Accessibility:** single sr-only polite `aria-live` region for save/clear success (per context doc). Real-button empty-state affordance. `<label>` + `for` on the textarea. Explicit focus management on every mode transition. CDK Dialog provides focus trap + Escape-dismiss for the Clear confirmation — matches the existing `RemoveMemberConfirmDialogComponent` pattern exactly.
8. **Component decomposition:** extract `TaskDescriptionSectionComponent` as a new presentational-smart hybrid sub-component rather than bolting everything onto `TaskDetailPanelComponent`. Justified by the ≥100 LoC of new mode/state/keybinding logic on a panel that already hosts attachments; extraction also enables shallow unit tests without mounting the attachments tree.

---

## Implementation Steps

Follow in order. Each step leaves the app in a compilable + testable state.

### 1. Type & copy scaffolding
- [ ] Append `UpdateTaskDescriptionDto` and `TaskDescriptionUpdateResponse` to `src/app/features/board/models/task.model.ts`.
- [ ] Create `src/app/features/board/components/task-description-section/task-description-copy.ts` with `TASK_DESCRIPTION_COPY`, `TASK_DESCRIPTION_MAX_LENGTH`, `TASK_DESCRIPTION_COUNTER_THRESHOLD`.

### 2. Service layer
- [ ] In `tasks-api.service.ts`, add `updateTaskDescription(taskId, dto): Observable<TaskResponseDto>` — same envelope-unwrap pattern as `moveTask`.
- [ ] Add `clearTaskDescription(taskId): Observable<void>` — simple `this.http.delete<void>(url)`, no envelope.
- [ ] Add `mapTaskDescriptionErrorToUserMessage(error, operation)` returning `TaskDescriptionErrorResult`. Follow the verbatim-string table in §Error mapping.
- [ ] Add unit tests for the service (HttpClientTestingModule) asserting URL, body, unwrap, and each error-mapping branch.

### 3. Clear confirmation dialog
- [ ] Generate `task-description-clear-confirm-dialog.component.ts`. Model on `RemoveMemberConfirmDialogComponent`: `ChangeDetectionStrategy.OnPush`, `ViewEncapsulation.None`, injects `DialogRef<boolean>`, scoped SCSS via `panelClass`.
- [ ] Template: `<h2 id="task-description-clear-heading">Clear this description?</h2>` + Cancel + Confirm buttons. No body copy beyond the heading (matches context doc).
- [ ] Spec: shallow tests for Cancel → `close(undefined)` and Confirm → `close(true)`.

### 4. TaskDescriptionSectionComponent
- [ ] Generate via `ng generate component features/board/components/task-description-section --skip-tests=false`.
- [ ] Declare all signals from the State Model table; wire the computed derivations.
- [ ] Implement template (web-designer will supply exact SCSS + visual treatment — tech spec scopes the DOM structure):
  - Section heading `<h3 id="task-detail-description-{id}">Description</h3>` (moved from the panel).
  - Read mode: empty-state button OR text-button + Edit button + Clear button (conditionally).
  - Edit mode: banner (conditional) + label + textarea + counter (conditional) + inline-error (conditional) + Save + Cancel.
  - sr-only live region.
- [ ] Implement handlers: `enterEdit()`, `onTextareaInput()`, `onSave()`, `onCancel()`, `onClear()`, `discardAndReload()`.
- [ ] Install the `effect()` that snapshots `task().content` on edit entry and compares on subsequent task changes.
- [ ] On save success: set `liveMessage` to `ANNOUNCE_SAVED`, flip `mode` back to `read`, clear all edit-state. Do NOT optimistically update state — the backend's `TaskUpdated` SignalR echo reconciles via `BoardStateService.onTaskUpdated`. (Per context doc: "No optimistic local apply; wait for 200 before flipping to read mode.")
- [ ] On save error: switch on `kind`:
  - `inline` → set `inlineError` to `text`.
  - `server-errors` → set `inlineError` to `texts[0] ?? INLINE_ERROR_GENERIC_SAVE`.
  - `not-found` → `taskNotFound.emit()`.
- [ ] On clear success (204): set `liveMessage` to `ANNOUNCE_CLEARED`. Per the same no-optimistic-apply policy, do not mutate local state; the SignalR `TaskUpdated` echo sets `content` to null and the `readDisplay` flips to empty.
- [ ] On clear error: same switch as save; `inline` and `not-found` identical; `server-errors` should not occur (backend contract) — fall back to `INLINE_ERROR_GENERIC_SAVE` if it does.
- [ ] Focus management via `@ViewChild` refs for textarea, edit-button, empty-state-button.
- [ ] `(keydown.control.enter)` / `(keydown.meta.enter)` handlers on the textarea invoking `onSave()`; `(keydown.escape)` invoking `onCancel()` with `stopPropagation()`.

### 5. Wire into TaskDetailPanelComponent
- [ ] Remove the inline description `@if` block (lines 40-54) and the `descriptionDisplay`/`descriptionLabelId` signals.
- [ ] Import `TaskDescriptionSectionComponent`; render `<app-task-description-section [task]="task()" (taskNotFound)="onTaskNotFound()" />`.
- [ ] Add `taskNotFound = output<void>()` on the panel; `onTaskNotFound()` simply emits it.
- [ ] Update panel spec — drop description-mode tests (now live on child), assert child is rendered + `taskNotFound` is forwarded.

### 6. Wire into BoardPageComponent
- [ ] Add `taskNotFoundToast = signal<{ message: string } | null>(null)`.
- [ ] Add `handleTaskNotFound()`: `this.selectedTask.set(null); this.taskNotFoundToast.set({ message: TASK_DESCRIPTION_COPY.TOAST_TASK_NOT_FOUND });`.
- [ ] Template: bind `(taskNotFound)="handleTaskNotFound()"` on `<app-task-detail-panel>`. Below it, render `<app-task-not-found-toast *ngIf=...>` (or the `@if (taskNotFoundToast(); as toast) { ... }` block).
- [ ] Spec: add assertions that closing-via-404 both clears `selectedTask` and sets the toast signal; dismissing the toast clears it.

### 7. TaskNotFoundToastComponent (if not reusing PartialFailureToast)
- [ ] Generate under `features/board/components/task-not-found-toast/`.
- [ ] Inputs: `message: string`. Outputs: `dismiss`.
- [ ] Auto-dismiss timer (8 s), pause on hover/focus — copy the timer logic from `PartialFailureToastComponent`.
- [ ] Host bindings: `role="status"`, `aria-live="polite"`, `aria-atomic="true"`.
- [ ] Spec: auto-dismiss after 8 s; manual dismiss fires the output.

### 8. Polish & a11y pass
- [ ] Tab through panel with keyboard only: title → Description affordance → Clear (if visible) → attachments. No traps outside the Clear confirmation dialog.
- [ ] Verify Escape inside textarea cancels edit but does NOT close the panel (the `stopPropagation()` must work).
- [ ] Verify Escape closes the Clear confirmation dialog (CDK default).
- [ ] Verify live region fires for `"Description saved"` and `"Description cleared"` (use the polite region only).
- [ ] Manual QA: all five context-doc flows (1–6) against a running backend.

### 9. Build + test verification
- [ ] `npm run build` — must succeed before proceeding.
- [ ] `npm run test -- --watch=false` — classify failures as PRE-EXISTING vs INTRODUCED per the project CLAUDE.md protocol; fix INTRODUCED.

---

## QA Guidance

### Test strategy

**Unit tests — `TaskDescriptionSectionComponent`:**
- Read mode renders the empty-state button with `COPY.EMPTY_PLACEHOLDER` when `content` is null/empty/whitespace.
- Read mode renders the filled text with preserved line breaks when `content` is non-empty (assert DOM includes the raw multi-line string; `white-space` CSS is the design spec's concern).
- Clicking the empty-state button switches to edit mode with an empty pre-filled textarea.
- Clicking the Edit button switches to edit mode pre-filled with current content; caret at end.
- Character counter appears only when `rawLength > 9000`.
- Save button is disabled when `rawLength >= 10000` and enabled at 9999.
- Save button is disabled when `trimmedLength === 0` and `INLINE_ERROR_EMPTY` is rendered.
- `Ctrl+Enter` in the textarea invokes Save when `canSave()`.
- `Escape` in the textarea invokes Cancel AND `event.stopPropagation()` is called (spy on the event).
- Cancel discards the draft — re-entering edit mode shows the original `content`, not the discarded draft.
- Save success (200) flips mode back to read, announces `ANNOUNCE_SAVED`, clears edit state.
- Save 400 with `errors: ['X']` renders `'X'` inline.
- Save 400 with `errors: []` renders `INLINE_ERROR_GENERIC_SAVE` inline.
- Save 403 renders `INLINE_ERROR_PERMISSION`.
- Save 404 emits `taskNotFound`; mode is NOT changed by the child (host owns the close).
- Save status=0 renders `INLINE_ERROR_NETWORK`.
- Clear confirm Cancel does NOT fire DELETE.
- Clear confirm Confirm fires DELETE; 204 announces `ANNOUNCE_CLEARED`.
- Remote update while in edit mode sets `remoteUpdateDetected` and renders the banner; draft is NOT overwritten.
- Discard-and-reload clears banner, clears draft, switches to read mode showing the remote `content`.

**Unit tests — `TasksApiService`:**
- `updateTaskDescription` issues `PUT` to `/api/task/:id/description` with body `{ content }`; unwraps envelope on success; rejects on `success: false` / `data == null`.
- `clearTaskDescription` issues `DELETE` to `/api/task/:id/description`; returns `Observable<void>`.
- `mapTaskDescriptionErrorToUserMessage` — one test per row of the mapping table, both `operation='save'` and `operation='clear'`.

**Unit tests — `TaskNotFoundToastComponent`:** auto-dismiss at 8 s; pause on hover; manual dismiss via close button.

**Integration tests — `BoardPageComponent`:**
- On `taskNotFound` emitted from the panel, `selectedTask` becomes null AND `taskNotFoundToast` becomes non-null.
- Dismissing the toast clears the signal and unmounts the toast.

**Integration / E2E (manual, optional):**
- Full add flow: open empty task → click empty-state → type → Ctrl+Enter → read mode shows the saved text on next tick.
- Full edit flow: edit existing → Save → read mode.
- Remote-update-while-editing: use two browser sessions on the same task; edit in session A; save in session B; verify A sees the banner but keeps the draft.

### Mocking

```typescript
// Mock TasksApiService in section-component tests
const mockTasksApi = {
  updateTaskDescription: jest.fn(() => of(baseTaskDto)),
  clearTaskDescription: jest.fn(() => of(void 0))
};

TestBed.configureTestingModule({
  providers: [{ provide: TasksApiService, useValue: mockTasksApi }]
});
```

For error branches, return `throwError(() => new HttpErrorResponse({ status: 400, error: { errors: ['X'] } }))`.

### Edge cases to test

- Opening the panel for a task whose `content` becomes `null` mid-view (remote clear while user is in read mode): empty-state placeholder appears, no announcement (silent — per context doc out-of-scope list).
- Rapid consecutive Ctrl+Enter presses while `isSaving()` is true: second press is a no-op (guard via `canSave()`).
- Ctrl+Enter with whitespace-only draft: no-op, `INLINE_ERROR_EMPTY` remains visible.
- Paste >10,000 chars: counter goes red, Save disabled, user must trim.
- Remote `TaskUpdated` arrives between Ctrl+Enter and the HTTP 200: banner appears briefly; on 200 the editor closes and the read mode renders the server-authoritative value (which, via SignalR echo of our own PUT, equals what we just sent). Per context doc: last-write-wins server-side.
- Network drops during save: `status === 0` path; `INLINE_ERROR_NETWORK`; editor stays open with draft intact.
- Task deletion while Clear confirm is open: Confirm fires, 404 returns, section emits `taskNotFound`, panel closes, toast shown.

### Out-of-scope (restated for QA's no-test list)

- No test asserting markdown rendering.
- No test asserting a description input on the task-create form.
- No test asserting inline description edit from a column card.
- No test asserting announcement on remote description change in read mode (silent by design).
- No test asserting merge / three-way conflict resolution.
- No test asserting draft persistence across panel close.

---

## Validation checklist

**Interface alignment:**
- [x] `UpdateTaskDescriptionDto.content: string` matches `backend_api_map.md` §`UpdateTaskDescriptionDto`.
- [x] PUT returns `ApiResponse<TaskResponseDto>`; DELETE returns 204 (no body).

**Standards compliance:**
- [x] `inject()` used throughout (mirrors existing panel + services).
- [x] Signals for all UI state; no NgRx / service-owned state beyond the existing `BoardStateService`.
- [x] `ChangeDetectionStrategy.OnPush` on every new component.
- [x] `takeUntilDestroyed(destroyRef)` on the two HTTP subscriptions inside the section component.

**Security:**
- [x] No secrets.
- [x] Inputs validated client-side (trimmed-non-empty + ≤10,000 chars) before send; server re-validates (context-documented).
- [x] No user content routed through `[innerHTML]`; text rendered via interpolation with `white-space: pre-wrap`.
- [x] Error mapper strips status codes, URLs, envelope bodies beyond the single first string on 400.

**Completeness:**
- [x] All new files listed (§New Files to Create).
- [x] All modifications listed (§Files to Modify).
- [x] Implementation steps are ordered + leave the app compilable at each checkpoint.
- [x] Every AC in the context doc is addressed: display (§UI), edit (§UI + §State Model + §Implementation Steps 4), save result (§Error mapping), clear (§Clear confirmation + §Implementation Steps 3), real-time sync (§Design Call #2 + §UI / Real-time sync), a11y (§Design Call #7).

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification.*

---

## Development Status

**Implementation Date:** 2026-05-08
**Developer:** Claude Opus 4.7

### Files Created
- `KanbAI-Web/src/app/features/board/components/task-description-section/task-description-copy.ts`
- `KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts`
- `KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.html`
- `KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.scss`
- `KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.spec.ts`
- `KanbAI-Web/src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.types.ts`
- `KanbAI-Web/src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.ts`
- `KanbAI-Web/src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.html`
- `KanbAI-Web/src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.scss`
- `KanbAI-Web/src/app/features/board/components/task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component.spec.ts`
- `KanbAI-Web/src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.ts`
- `KanbAI-Web/src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.html`
- `KanbAI-Web/src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.scss`
- `KanbAI-Web/src/app/features/board/components/task-not-found-toast/task-not-found-toast.component.spec.ts`

### Files Modified
- `KanbAI-Web/src/app/features/board/models/task.model.ts` — added `UpdateTaskDescriptionDto` + `TaskDescriptionUpdateResponse`.
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.ts` — added `updateTaskDescription`, `clearTaskDescription`, and `mapTaskDescriptionErrorToUserMessage`.
- `KanbAI-Web/src/app/features/board/services/tasks-api.service.spec.ts` — added coverage for the two new methods + the error mapper table.
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.{ts,html,scss,spec.ts}` — replaced the inline read-only description with `<app-task-description-section>`; added `taskNotFound` output; pruned now-unused description CSS + stale spec assertions.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.{ts,html}` — wired `(taskNotFound)` to close the panel + surface the 404 toast.

### Build & Test Results
- **Build:** Passed (`ng build` — no errors; only pre-existing SCSS deprecation + budget warnings).
- **Tests:** 1344/1344 passing across 69 files.
- **Pre-existing failures:** None in the final run. A flakey batch of `signalr.service.spec.ts` tests fired on one run and passed on the next — unrelated to this ticket (no references to `tasks-api`/`task-description` anywhere in that file).

### Notes
- No optimistic local apply: on `200`/`204` the client flips state only; `BoardStateService.onTaskUpdated` (already wired in #85/#87) reconciles `content` via the SignalR echo.
- Escape inside the textarea calls `event.stopPropagation()` so the panel-level Escape does not also close the drawer.
- Clear confirm uses the existing CDK Dialog pattern (`RemoveMemberConfirmDialogComponent`) with a fresh namespaced `panelClass` to prevent style leaks.

---

*Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests.*
