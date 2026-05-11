# Feature: Description edit/clear does not render the freshest value until the task is closed and re-opened

**GitHub Issue:** [#94](https://github.com/Gulybi/KanbAI-Web/issues/94)
**Milestone:** _none_ (unassigned)
**Labels:** `bug`
**Repository:** Gulybi/KanbAI-Web
**Assignee:** @Gulybi
**Severity:** Major — breaks an [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) acceptance criterion on the originating client for every save and every clear. The user cannot visually confirm their own edit without closing and re-opening the task panel (or refreshing). Users lose trust in the save ("did it actually save? It shows the old version") and adopt a close-and-reopen workaround. Zero backend change required.

---

## Business Value

### Who is this for?
- **Every user who edits or clears a task description from the detail panel** — introduced in [#91](https://github.com/Gulybi/KanbAI-Web/issues/91). Today, the moment their save succeeds on the server, the panel flips back to read mode showing the previous text. The user must close the panel and re-open the same task (or refresh) before their own change is visible.
- **Every user doing the same on the clear flow** ([#91](https://github.com/Gulybi/KanbAI-Web/issues/91) *"Clear description"*). On `204` the confirmation closes, but the description text keeps rendering until the SignalR echo lands or the user closes and re-opens the panel.
- **Future in-panel field editors** (due date, labels, assignee, priority). [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) established the in-panel edit pattern; if this bug is not fixed, every future field editor will reproduce the same "did it save?" confusion.
- **Users collaborating in real time** — the remote-peer flow (a teammate edits the same task while you are viewing it) is **not** affected by this bug and must keep working exactly as it does today.

### Why is it valuable?
- **Restores the [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) acceptance criterion** *"On `200` success, the editor closes, the newly-saved description renders in read mode"* — which the current build violates on the originating client.
- **Removes a user-visible trust breach.** The *"Description saved"* announcement fires while the UI still shows the old text. This is worse than no announcement at all — it actively misleads the user.
- **Eliminates the close-and-reopen workaround** as the only reliable way to see your own edit.
- **Sets the pattern for every future in-panel edit.** Once this is fixed for description, the same same-tick-apply behaviour applies by default to due-date, label, assignee, and priority edits built on top of [#91](https://github.com/Gulybi/KanbAI-Web/issues/91)'s chassis.
- **Closes the unused-backend-response loop** on `PUT /api/task/{taskId}/description`. The endpoint already returns the updated `TaskResponseDto` in the envelope; the client receives it, maps it to `data`, and then throws it on the floor. This ticket uses it.

### What problem does it solve?

**Reproduction on `main` today:**

1. Sign in, open a board, open any task whose `content` is set — e.g. *"old text"*.
2. The detail panel renders *"old text"* in read mode and an *"Edit"* affordance, per [#91](https://github.com/Gulybi/KanbAI-Web/issues/91).
3. Click the description (or the *"Edit"* button) → the multi-line editor opens pre-filled with *"old text"*.
4. Replace the text with *"new text"* → click **Save** (or **Ctrl+Enter**).
5. Network panel: `PUT /api/task/{taskId}/description` returns `200` with an `ApiResponse<TaskResponseDto>` body containing `data.content = "new text"`.
6. **Observed:** the editor closes, the polite live region announces *"Description saved"*, and the read-mode render shows **"old text"** — not *"new text"*.
7. Close the task detail panel. Re-open the same task.
8. **Now** the read-mode render correctly shows *"new text"*.
9. Same repro with *"Clear description"* → confirm → `DELETE` returns `204` → read-mode continues to render the old text until close + re-open.

**Root-cause observations (verified against `main` at commit `b7375e6` — [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) merged):**

- [`task-description-section.component.ts:176-199`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts) — `onSave`'s `next` handler only flips local UI state: `this.isSaving.set(false); this.exitEditMode(); this.announce(TASK_DESCRIPTION_COPY.ANNOUNCE_SAVED);`. The returned `TaskResponseDto` (emitted by the `Observable<TaskResponseDto>`) is ignored. The `_` position of the `next` callback is empty — the DTO is not captured.
- [`task-description-section.component.ts:79-85`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts) — `readDisplay` is `computed(() => this.task().content)`. The input signal `task` is a projection off `BoardStateService` (see [`task-detail-panel.component.ts`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts) wiring). Until board state is updated for `evt.id`, `task().content` keeps returning the pre-save value.
- [`tasks-api.service.ts:111-126`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts) — `updateTaskDescription` unwraps `ApiResponse<TaskResponseDto>` and emits `response.data`. The DTO is available to the caller; the caller does not use it.
- [`task-description-section.component.ts:244-264`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts) — `performClear`'s `next` handler has the same structure: `this.isClearing.set(false); this.announce(...)`. The comment on line 257 explicitly says *"BoardStateService.onTaskUpdated receives the TaskUpdated echo and flips `content` to null; readDisplay() re-derives to empty"*. That is the root-cause — the code is explicitly relying on the echo and therefore inherits the echo's latency.
- [`board-state.service.ts:305-353`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) — `onTaskUpdated` (the SignalR handler) is the canonical reconciler. It rebuilds a `BoardTask` by `id` from the event payload, replaces the task in the owning bucket, and sorts. It is the single write path into `tasksByColumnId` for a content update. Calling it (or an equivalent authoritative-update method with the same effect) on the originating client on `200` / `204` is what is missing.
- **SignalR echo timing.** The echo does eventually arrive and the read-mode text does eventually update, which is why close-and-reopen *"works"* — the reopen reselects `task` from a newer copy of state. Between save-resolves and echo-lands there is a window during which the read-mode render is stale. On a well-connected client, that window is sub-second but nonzero; on a lossy or backgrounded tab, the echo can be delayed indefinitely or missed.
- **Remote-edit read path is fine.** Teammate edits continue to arrive via `TaskUpdated` and `onTaskUpdated` still reconciles them. This bug is **origin-client only**.

**In short:** the client receives the authoritative updated DTO on `200`, but discards it and waits on a round-trip SignalR echo to mutate local state. The fix is to apply the `200` / `204` result to local state on the originating client, in the same code path / format that the echo would have applied — such that when the echo later arrives, it is a no-op.

---

## Current State vs Desired State

### Current State (behaviour today on `main`)

- **Save path.** `PUT /api/task/{taskId}/description` returns `200` with the updated DTO. [`task-description-section.component.ts:189-193`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts) exits edit mode and announces *"Description saved"* without applying the DTO. Until the `TaskUpdated` SignalR event reaches this client and [`board-state.service.ts:317`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) `onTaskUpdated` reconciles `content`, the panel's `readDisplay` computed keeps projecting the old `content` value.
- **Clear path.** `DELETE /api/task/{taskId}/description` returns `204`. [`task-description-section.component.ts:253-258`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts) sets `isClearing` to `false` and announces *"Description cleared"*, and the inline comment explicitly says the panel is waiting on the SignalR echo to flip `content` to null. Read-mode render continues to show the previous description until the echo lands, or until the user closes and re-opens the panel.
- **Same-client-symptom window.** On a typical local-dev SignalR connection the stale window is tens of milliseconds; it is still observable as a visible "old → old → new" re-render sequence, and on a lossy connection it is effectively permanent until close + re-open.
- **Remote-client behaviour is unaffected.** Another user viewing the same task still sees the new description land via `TaskUpdated` + `onTaskUpdated`. This is the correct read path and must not change.
- **Announcements fire regardless.** `ANNOUNCE_SAVED` / `ANNOUNCE_CLEARED` are announced on `200` / `204`, so a screen-reader user hears *"Description saved"* while the rendered read-mode text is still the old value. This is a visible contradiction between audible state and visual state.
- **Conflict banner is intact.** [`task-description-section.component.ts:143-152`](../../KanbAI-Web/src/app/features/board/components/task-description-section/task-description-section.component.ts) — the remote-update-during-edit effect is independent of this bug and continues to work. Fixing the bug must not break it.
- **Backend is fine.** Verified against [`backend_api_map.md`](../../.claude/backend_api_map.md): `PUT` returns `ApiResponse<TaskResponseDto>` on `200` (envelope includes `data.content`, `data.title`, `data.columnId`, `data.taskOrder`, `data.assignedId`), `DELETE` returns `204 No Content`. No backend change is needed.

### Desired State

After this ticket, the originating client renders the freshest value *within the same user interaction* that produced it, without any dependency on the SignalR echo.

#### Save
- **On `200` from `PUT /api/task/{taskId}/description`**, the editor closes and the read-mode render shows the **just-saved** description text **in the same microtask / tick** as the announcement. QA should observe: user clicks Save → editor closes → read-mode shows new text (never flashes old text, never flashes empty, never requires panel close + re-open).
- The save-success announcement (*"Description saved"*) continues to fire exactly once per successful save, on the same code path.
- When the `TaskUpdated` SignalR echo subsequently arrives for the same task, the rendered description does **not** flicker / re-render to a different value / re-announce / visually change. The echo is absorbed as a no-op from the user's perspective.

#### Clear
- **On `204` from `DELETE /api/task/{taskId}/description`**, the panel flips to the empty-state placeholder *"No description yet — click to add one"* **in the same microtask / tick** as the *"Description cleared"* announcement. The previous description text does not keep rendering while the echo lands.
- When the `TaskUpdated` echo for the clear subsequently arrives, the empty-state placeholder does not flicker / re-render / re-announce.

#### Error paths (unchanged)
- **`400` / `403` / `404` / network failures** continue to behave exactly as specified in [#91](https://github.com/Gulybi/KanbAI-Web/issues/91). Error copy is unchanged. Editor-stays-open-on-error is unchanged. `404` panel-close + toast is unchanged. Nothing in this ticket weakens the existing failure-path behaviour.

#### Real-time sync (unchanged)
- **Remote edit while viewing (not editing).** A teammate's edit landing via `TaskUpdated` still updates the read-mode render immediately. No regression.
- **Remote edit while editing.** The *"This task was updated by someone else — Discard my changes and reload"* banner still appears exactly as in [#91](https://github.com/Gulybi/KanbAI-Web/issues/91). No regression.
- **Echo of the user's own save / clear.** When the originating client applies the `200` / `204` result, the subsequent echo is observed to be a no-op — no double-render, no duplicate announcement, no visible flicker.

#### User flows (desired)

1. **Save an edit.**
   a. User is in the editor with new text. Clicks Save (or Ctrl+Enter).
   b. Request completes with `200`.
   c. Editor closes; read-mode renders the new text; *"Description saved"* is announced — all within the same user-facing frame.
   d. `TaskUpdated` echo arrives moments later; no visible change.

2. **Clear a description.**
   a. User activates *"Clear description"* → confirms.
   b. Request completes with `204`.
   c. Confirmation closes; read-mode renders the empty-state placeholder *"No description yet — click to add one"*; *"Description cleared"* is announced.
   d. `TaskUpdated` echo arrives moments later; no visible change.

3. **Save fails (unchanged).**
   a. User is in the editor. Clicks Save. Server responds `400` / `403` / network failure.
   b. Editor stays open, draft intact, inline error message per [#91](https://github.com/Gulybi/KanbAI-Web/issues/91). Board state is unchanged.

4. **Save returns `404` (unchanged).**
   a. User is in the editor. Clicks Save. Server responds `404`.
   b. Panel closes and toast *"This task no longer exists"* fires, exactly as in [#91](https://github.com/Gulybi/KanbAI-Web/issues/91). Board state is unchanged for that task (or the task removal is handled by its own path, which is out of scope here).

5. **Remote peer edits while you view (unchanged).**
   a. Teammate saves a new description from another session.
   b. Your panel, open in read mode on that task, re-renders with the new text via `TaskUpdated` + `onTaskUpdated`. No banner, no announcement (explicitly silent per [#91](https://github.com/Gulybi/KanbAI-Web/issues/91)).

6. **Remote peer edits while you are mid-edit (unchanged).**
   a. Teammate saves a new description from another session while your editor is open with a draft.
   b. The *"This task was updated by someone else — Discard my changes and reload"* banner appears in your panel. Your draft is preserved.
   c. You choose *"Discard my changes and reload"* → editor closes, remote value renders in read mode, banner dismisses. Exactly as [#91](https://github.com/Gulybi/KanbAI-Web/issues/91).

### Out of scope for this ticket

- **Backend changes.** Zero. `PUT` envelope and `DELETE` status code are correct today. `TaskUpdated` payload is correct today.
- **SignalR echo routing / filtering.** Option (b) in the issue body — *"ensure the backend SignalR broadcast includes the originating connection and investigate why the echo does not round-trip in time"* — is explicitly not in scope. The fix is client-side.
- **Optimistic apply before the PUT resolves.** This ticket applies state on `200` / `204` — i.e. on confirmed success — not speculatively on click. The [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) out-of-scope note on optimistic apply still holds.
- **Other task fields.** Only the description `content` field is in scope. Any future in-panel editor (due date, labels, assignee, priority) should adopt the same pattern but is out of scope for this bug.
- **Board card inline rendering.** Out of scope.
- **Description history / undo / draft autosave.** Out of scope (same as [#91](https://github.com/Gulybi/KanbAI-Web/issues/91)).
- **Changes to [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) error copy, error states, a11y announcements, validation thresholds, conflict banner copy, or conflict banner behaviour.** None of these change.
- **Changes to `BoardStateService.onTaskUpdated`'s reconciliation semantics.** This ticket may route an authoritative same-client update through an equivalent code path, but it does not change how remote `TaskUpdated` events are handled.

---

## Milestone Context

**Milestone:** unassigned on the GitHub issue. This is a follow-up bug on the [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) feature — the feature is merged and the user-visible bug falls out of a single, local gap in its client-side flow.

### Prerequisites — already shipped
- **[#91](https://github.com/Gulybi/KanbAI-Web/issues/91)** — *"Editable task descriptions in the task detail panel"*. Merged at commit `b7375e6`. Introduced `TaskDescriptionSectionComponent`, `updateTaskDescription` / `clearTaskDescription` on `TasksApiService`, `mapTaskDescriptionErrorToUserMessage`, and the in-panel read → edit → save / cancel / clear flow. This ticket **adjusts the success path** of that flow; it does not re-specify any other behaviour.
- **[#87](https://github.com/Gulybi/KanbAI-Web/issues/87)** — task hydration on board entry. Ensures that `task().content` is populated in the first place so the stale-render bug is visible.
- **`TaskUpdated` SignalR plumbing** — [`board-state.service.ts:317-353`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts). Continues to be the canonical reconciler for remote edits. This ticket either (a) re-uses the same reconcile path for the originating client's own `200` / `204`, or (b) uses an equivalent same-shape update path — an implementation choice for the staff-engineer, not a PM concern.
- **Backend endpoints** — `PUT` returns `ApiResponse<TaskResponseDto>` on `200`; `DELETE` returns `204 No Content`. Both are stable per [`backend_api_map.md`](../../.claude/backend_api_map.md).

### Related / adjacent
- **In-flight on the same branch.** This ticket targets the `91-editable-task-descriptions-in-the-task-detail-panel` branch's recent commit `b7375e6`. No separate feature branch is required unless the team chooses to open one.
- **Future in-panel field editors** (due date, labels, assignee, priority). Whatever apply-on-success pattern this ticket settles on becomes the template for those follow-ups.
- **[#92](https://github.com/Gulybi/KanbAI-Web/issues/92)** — "Add member submit button stays permanently disabled" — unrelated, but a similar class of "success path leaves local state in the wrong shape" bug; shares no code.

### Downstream
- **Trust in the editor.** Once fixed, users see their own save reflected immediately and no longer develop the close-and-reopen workaround.
- **Foundation for future field editors.** Any due-date / label / assignee editor built on [#91](https://github.com/Gulybi/KanbAI-Web/issues/91)'s chassis inherits the corrected success behaviour.

### Backend Prerequisite
**None.** Verified against [`backend_api_map.md`](../../.claude/backend_api_map.md): `PUT` already returns the updated DTO, `DELETE` already returns `204`, and `TaskUpdated` already broadcasts. No schema, no route, no payload change.

---

## Acceptance Criteria

Every criterion below is observable in the running UI from a single user's perspective (the user who initiated the save / clear), is specific enough for QA to script without knowing how the fix is implemented, and does not specify implementation. Network-level criteria are written in terms of observable DevTools behaviour, not code paths.

### Save — originating client
- [ ] Saving a new description via the Save button with a value of *"new text"* (starting from an existing value of *"old text"*) results in the read-mode panel rendering *"new text"* within the same user interaction — the user never sees *"old text"* in read mode after clicking Save, and the user is not required to close + re-open the task or refresh the page.
- [ ] Saving via **Ctrl+Enter** from inside the editor has the same behaviour as the Save button for the criterion above.
- [ ] The *"Description saved"* live-region announcement continues to fire exactly once per successful save.
- [ ] Between clicking Save and the read-mode render of *"new text"*, the panel does not visibly flash / flicker to an empty state, to a previous value, to a loading spinner state, or to any other intermediate text.
- [ ] When the `TaskUpdated` SignalR echo for the user's own save arrives (typically moments after `200`), the read-mode render does not flip to a different value, does not re-announce *"Description saved"*, and does not visibly flicker / re-render.
- [ ] If the user immediately clicks Edit again after the save, the editor opens pre-filled with *"new text"* (the value they just saved), not *"old text"*.

### Clear — originating client
- [ ] Confirming *"Clear description"* on a task that currently has a non-null `content` results in the panel rendering the empty-state placeholder *"No description yet — click to add one"* within the same user interaction — the user never sees the previous description text in read mode after confirming clear, and the user is not required to close + re-open the task or refresh.
- [ ] The *"Description cleared"* live-region announcement continues to fire exactly once per successful clear.
- [ ] Between confirming clear and the empty-state render, the panel does not visibly flash / flicker to the previous description, to a loading spinner over the old text, or to any other intermediate content.
- [ ] When the `TaskUpdated` SignalR echo for the user's own clear arrives, the empty-state placeholder does not flip to a different rendering, does not re-announce *"Description cleared"*, and does not visibly flicker / re-render.
- [ ] After a successful clear, activating the empty-state placeholder opens the editor with an empty value (not pre-filled with the previously-cleared content).

### Error paths — unchanged regression guard
- [ ] On `400` (server rejects empty-after-trim or over-limit), the editor stays open with the user's draft intact and the inline error copy renders exactly as in [#91](https://github.com/Gulybi/KanbAI-Web/issues/91). Board state's `content` for that task is unchanged.
- [ ] On `403` (not a member), the editor stays open with the user's draft intact, the inline error *"You don't have permission to edit this task"* renders, and board state's `content` for that task is unchanged.
- [ ] On `404` (task gone), the detail panel closes and the toast *"This task no longer exists"* fires, exactly as in [#91](https://github.com/Gulybi/KanbAI-Web/issues/91). The originating client does **not** show a phantom *"new text"* render anywhere in the UI after the 404.
- [ ] On network failure (`status === 0`), the editor stays open with the user's draft intact, the inline error *"Couldn't reach the server — try again"* renders, and board state's `content` for that task is unchanged.
- [ ] On any failure status for `DELETE /api/task/{taskId}/description` (`403`, `404`, network), the previous description text continues to render in read mode — no empty-state placeholder appears on a failed clear.
- [ ] No failure path leaves board state in a partially-applied shape where the description appears updated on the originating client but the server did not accept the change.

### Real-time sync — regression guard on unchanged flows
- [ ] A `TaskUpdated` SignalR event for the currently-open task **while the user is not in edit mode**, originating from a different session / user, still updates the rendered description immediately to `evt.content` — including flipping to the empty-state placeholder when `evt.content` is `null`.
- [ ] A `TaskUpdated` SignalR event for the currently-open task **while the user is in edit mode**, originating from a different session / user, still triggers the *"This task was updated by someone else — Discard my changes and reload"* banner, does not overwrite the user's draft, and *"Discard my changes and reload"* continues to work as in [#91](https://github.com/Gulybi/KanbAI-Web/issues/91).
- [ ] A `TaskUpdated` SignalR event for a task **other than** the one currently shown in the panel has no visible effect on the panel.

### Accessibility — regression guard on unchanged announcements
- [ ] The *"Description saved"* announcement fires on an `aria-live="polite"` region at the same user-facing moment that the read-mode render shows the new text — a screen-reader user hears *"Description saved"* and the next time they navigate to the description they read the new text, not the old text.
- [ ] The *"Description cleared"* announcement fires on an `aria-live="polite"` region at the same user-facing moment that the empty-state placeholder appears.
- [ ] Colour, focus-ring, keyboard-flow, and label behaviours from [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) continue to hold unchanged.

### Out of scope (restated here for QA's no-test list)
- [ ] No test should assert that the backend `TaskUpdated` broadcast is filtered to exclude the originating connection.
- [ ] No test should assert optimistic rendering of the new description before the `PUT` resolves.
- [ ] No test should assert behaviour changes on error paths beyond what [#91](https://github.com/Gulybi/KanbAI-Web/issues/91) already specifies.
- [ ] No test should assert due-date / label / assignee / priority in-panel editing (out of scope; future tickets).
- [ ] No test should assert changes to conflict-banner copy or behaviour.
- [ ] No test should assert changes to `BoardStateService.onTaskUpdated`'s semantics for remote edits.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
