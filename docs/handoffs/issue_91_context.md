# Feature: Editable task descriptions in the task detail panel

**GitHub Issue:** [#91](https://github.com/Gulybi/KanbAI-Web/issues/91)
**Milestone:** _none_ (unassigned)
**Labels:** _none_
**Repository:** Gulybi/KanbAI-Web
**Assignee:** @Gulybi
**Severity:** Major — today the product is title-only. Users can open a task but have no place to capture goals, acceptance criteria, or context. Every backend primitive for this feature (PUT, DELETE, SignalR broadcast) already exists and is unused by the client. This is a pure frontend gap that moves the product from "title-only todo list" to "usable Kanban tool".

---

## Business Value

### Who is this for?
- **Every user who opens a task card from the board.** Today the drawer shows the task title, an attachment section, and a read-only "Description" section that either renders existing text or the copy *"No description yet."* There is no way to add, edit, or clear that text from the UI. Anyone who wants to describe a task must use the title field as a sentence or leave the product entirely.
- **Teams relying on the board for coordination.** Acceptance criteria, links to design docs, a short "why", a reproduction, a list of sub-steps — none of this fits in a title. Teams today work around the gap on Slack / email / tribal memory.
- **Users who already rely on the [#87](https://github.com/Gulybi/KanbAI-Web/issues/87) hydration pattern.** Tasks now survive refresh. But the `content` field that every hydrated `TaskResponseDto` carries is still display-only — the hydration pattern is half-used.
- **Users collaborating in real time.** The backend already broadcasts `TaskUpdated` on every description change and the client is already subscribed. Two teammates editing the same board deserve to see each other's edits without refreshing, and the plumbing for that is already wired at the state layer.

### Why is it valuable?
- **Moves the product from "title-only" to "usable Kanban tool".** Without a description the board does not cover the minimum mental-model of a task. Competing tools (Trello, Linear, Jira, GitHub Projects) all ship this on day one; our absence of it is a visible parity gap.
- **Closes the unused-backend loop.** `PUT /api/task/{taskId}/description`, `DELETE /api/task/{taskId}/description`, and the `TaskUpdated` SignalR broadcast are implemented and contract-documented in [`backend_api_map.md`](../../.claude/backend_api_map.md). The state-layer SignalR handler is already wired in [`board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts). No backend work and no state-plumbing work — only the UI layer is missing.
- **Re-uses the hydration pattern from [#87](https://github.com/Gulybi/KanbAI-Web/issues/87).** Because tasks now survive refresh, any description a teammate saves survives refresh for everyone else. This ticket makes that visible-and-editable instead of visible-only.
- **Establishes the in-panel edit pattern** that future fields (due date, assignee, labels, priority) will re-use. Solving keyboard flow, conflict banner, empty-state affordance, error copy, and a11y once is cheaper than per-field retrofits.
- **Eliminates an entire class of "where do I write what this ticket is about" support questions.**

### What problem does it solve?

**Reproduction on `main` today:**

1. Sign in, open a project, open any task from the board → task detail panel slides in.
2. The panel shows the title and an attachment section. A "Description" section renders either the persisted `content` as plain text or the static copy *"No description yet."*
3. Click / tap / focus anywhere in the Description section → nothing happens. There is no edit affordance, no button, no keyboard entry point.
4. Open DevTools → Network. There is no client code path that issues `PUT /api/task/{taskId}/description` or `DELETE /api/task/{taskId}/description`. These routes are contract-documented and implemented server-side but unreachable from the UI.
5. A teammate edits the same task's description via a direct API call → the `TaskUpdated` SignalR event arrives and `BoardStateService.onTaskUpdated` reconciles the task's `content` in local state. The detail panel re-renders the new text in the same read-only projection — good — but the local user still has no way to contribute an edit of their own.

**Root-cause observations (four file-level facts verified against `main`):**

- [`task-detail-panel.component.html`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html) — lines 40-54 render the Description section as a `<p>` with two modes (`text`, `empty`). The empty-state copy is the static string *"No description yet."* with no click target, no edit button, and no linked textarea. There is no form, no Save / Cancel button, no Clear button.
- [`task-detail-panel.component.ts`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts) — the `descriptionDisplay` computed signal projects `task().content` into a read-only `'text' | 'empty'` shape. The component does not import any form primitives, does not hold any draft / mode signal, and does not call any API service for description mutation.
- [`tasks-api.service.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts) — the service exposes `moveTask`, `createTask`, and `getTasksForProject` only. There is no `updateTaskDescription(taskId, content)` and no `clearTaskDescription(taskId)` method. Existing error-mapping helpers (`mapTaskMoveErrorToUserMessage`, `mapTaskCreateErrorToUserMessage`, `mapTaskListErrorToUserMessage`) establish the "verbatim user copy per status code, never expose codes / URLs / envelope errors" pattern this ticket will extend.
- [`board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) — `onTaskUpdated` is already wired (line 93-94) and already reconciles `content` by `id`, including the `null`-after-clear case. **The real-time read path is complete.** What is missing is a write path on the client and a UI that drives it.

The issue's summary claims "`TaskUpdated` SignalR events are not consumed" — this is out of date as of [#87](https://github.com/Gulybi/KanbAI-Web/issues/87). The handler is wired; the detail panel needs to (a) expose an editor that can call the description PUT / DELETE and (b) handle the case where a remote `TaskUpdated` arrives while the user has a local draft.

---

## Current State vs Desired State

### Current State (behaviour today on `main`)

- **Detail panel renders a read-only Description section.** [`task-detail-panel.component.html:40-54`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html) projects `task().content` via the `descriptionDisplay` signal from [`task-detail-panel.component.ts:76-82`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts). Non-empty content renders inside a `<p>`; null / empty / whitespace collapses to the static copy *"No description yet."*
- **There is no edit affordance.** No button, no click-to-edit, no keyboard entry point into an editor. The empty-state paragraph is a read-only `<p>`, not a button.
- **Line breaks are not preserved.** The `<p class="task-detail-panel__description">{{ descriptionDisplay().text }}</p>` render path does not apply `white-space: pre-wrap`. Multi-line descriptions collapse to a single line on screen.
- **No client write path exists.** [`tasks-api.service.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts) has no method that hits `PUT /api/task/{taskId}/description` or `DELETE /api/task/{taskId}/description`. The backend routes are documented in [`backend_api_map.md`](../../.claude/backend_api_map.md) but unused by the client.
- **Real-time read is already wired.** [`board-state.service.ts:93-94`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) subscribes to `TaskUpdated` and `onTaskUpdated` at [`:317-353`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) reconciles `content` (nullable). A remote description edit therefore already flows into the panel via the existing signal chain — the panel re-renders the new read-only text with no further wiring needed for that direction. This ticket only needs to handle the *mid-edit collision* case.
- **Backend contract is known and documented.** [`backend_api_map.md`](../../.claude/backend_api_map.md) specifies `PUT /api/task/{taskId}/description` with body `{ content: string }` returning `ApiResponse<TaskResponseDto>` on `200`, and `DELETE /api/task/{taskId}/description` returning `204 No Content`. Server trims leading / trailing whitespace; max length 10,000 chars; empty-after-trim rejected with `400`; not-a-member rejected with `403`; not-found with `404`. `TaskUpdated` is broadcast after either mutation.
- **Related in-flight ticket:** [#80](https://github.com/Gulybi/KanbAI-Web/issues/80) (create-task UI) is currently closed as a bug-fix ticket for the create-project submit button — it is not the in-scope create-task feature. The create-task multi-line description input remains out of scope for this ticket; #91 is edit-after-create only.

### Desired State

After this ticket, the Description section of the task detail panel supports **read, edit, clear, and conflict-resolve**, reusing the existing state chassis for real-time reconciliation and the existing user-copy patterns for error messages.

#### Read
- **Non-empty `content` renders with line breaks preserved** via `white-space: pre-wrap` (or equivalent observable output — multiple consecutive newlines in the saved value render as multiple visual line breaks in the panel). This is an output contract, not an implementation choice.
- **Empty / `null` / whitespace-only `content` renders the placeholder *"No description yet — click to add one"***, and that placeholder is *itself* the affordance to start editing (keyboard-activatable, not a plain paragraph).
- **A remote `TaskUpdated` event** for the currently-open task while the user is **not** in edit mode updates the rendered description immediately (already wired at the state layer; the panel just needs to re-render off the existing signal).

#### Edit
- **Entering edit mode** is possible by activating either the rendered description text or an explicit *"Edit"* affordance, and by keyboard (Enter / Space on focus). On entry, a multi-line editor opens pre-filled with the current `content` (empty when none) and focus lands inside it.
- **Save** is triggered by a visible *"Save"* button or by **Ctrl+Enter**. On save, the client issues `PUT /api/task/{taskId}/description` with body `{ content: <editor value> }`.
- **Cancel** is triggered by a visible *"Cancel"* button or by **Escape**. On cancel, the editor closes, the draft is discarded, no API call is made, and the rendered description is unchanged.
- **Client-side validation before Save:**
  - Trimmed editor value is empty → Save is disabled and an inline message *"Description cannot be empty"* is shown. (Mirrors the server-side `400` on empty-after-trim.)
  - Editor value exceeds **9,000** characters → a live character counter appears showing `<count> / 10000`.
  - Editor value reaches **10,000** characters → the counter turns red and Save is disabled until the user trims back under the limit.
- **Save result copy (verbatim strings required):**
  - `200` success → editor closes, the new description renders in read mode, a polite live-region announcement says *"Description saved"*.
  - `400` (empty-after-trim or over-limit) → editor stays open; inline error renders the first string from `ApiResponse.errors` when present, else the fallback *"Couldn't save description — please try again"*.
  - `403` (not a member) → editor stays open; inline error *"You don't have permission to edit this task"*.
  - `404` (task deleted) → panel closes; a toast / banner says *"This task no longer exists"*.
  - network failure (`status === 0`) → editor stays open; inline error *"Couldn't reach the server — try again"*.
  - any other status → editor stays open; inline error *"Couldn't save description — please try again"*.

#### Clear
- **A *"Clear description"* affordance is visible only when `content` is non-null.** It is keyboard-reachable and labelled.
- **Activating it opens a lightweight confirmation** (either a dialog or an inline confirm strip) with copy *"Clear this description?"* and two options: *Confirm* and *Cancel*.
- **Confirm** → client issues `DELETE /api/task/{taskId}/description`.
  - On `204`, the panel flips to the empty-state placeholder and a polite live-region announcement says *"Description cleared"*.
  - On `403`, confirmation closes and an inline error *"You don't have permission to edit this task"* is shown.
  - On `404`, the panel closes and a toast says *"This task no longer exists"*.
  - On network failure, confirmation closes and an inline error *"Couldn't reach the server — try again"* is shown; the description is unchanged.
- **Cancel** → confirmation closes; no API call; no state change.

#### Real-time sync
- **While the user is NOT in edit mode**, a `TaskUpdated` event for the currently-open task updates the rendered description to match `evt.content` immediately. (This is already functionally wired — the panel re-renders off the state signal.)
- **While the user IS in edit mode**, a `TaskUpdated` event for the currently-open task **does not overwrite the user's draft**. Instead a non-blocking banner appears inside the panel with copy *"This task was updated by someone else"* and an action *"Discard my changes and reload"*.
- **Activating *"Discard my changes and reload"*** exits edit mode, loads the most recent remote `content` into the read-only render, and dismisses the banner. The banner offers no "merge" option — this is a one-writer-wins conflict UX, not a merge UX.
- **If the user Saves while the banner is showing**, the save still fires against the backend. The server is the ultimate tiebreaker (last-write-wins server-side). Expected behaviour: save succeeds (overwrites the remote version) or fails with a normal status-code error path.

#### User flows (desired)

1. **Add a description (from empty).**
   a. User opens a task → panel shows the *"No description yet — click to add one"* placeholder.
   b. User clicks / Enters it → multi-line editor opens, focused, empty.
   c. User types, then clicks Save (or Ctrl+Enter) → editor closes, the new description renders in read mode, *"Description saved"* is announced.

2. **Edit an existing description.**
   a. User clicks the rendered description or the *"Edit"* button → editor opens pre-filled with the current value, focus at the end.
   b. User edits, clicks Save (or Ctrl+Enter) → editor closes, updated text renders, *"Description saved"* is announced.

3. **Cancel an in-progress edit.**
   a. User is in the editor with unsaved changes → presses Escape (or clicks Cancel) → editor closes, draft is discarded, previously rendered description is unchanged, no API call.

4. **Clear a description.**
   a. User clicks *"Clear description"* → confirmation asks *"Clear this description?"*.
   b. User confirms → `DELETE` fires → on `204`, the panel returns to the empty-state placeholder and *"Description cleared"* is announced.

5. **Remote edit while viewing (not editing).**
   a. User has the panel open in read mode.
   b. Teammate edits the description from another session → `TaskUpdated` arrives → the rendered description updates silently. No banner, no toast, no announcement (this flow is high-volume and should not be noisy; announcement-on-remote-change is explicitly out of scope).

6. **Remote edit while editing.**
   a. User is in the editor with an unsaved draft.
   b. Teammate saves a different edit → `TaskUpdated` arrives → a banner *"This task was updated by someone else — Discard my changes and reload"* renders inside the panel. The user's draft is preserved.
   c. User chooses *"Discard my changes and reload"* → editor closes, remote value is shown in read mode, banner dismisses.
   c'. Alternatively the user continues typing and clicks Save → the save fires; server resolves last-write-wins.

7. **Server rejects save (400 empty).**
   a. User enters the editor, deletes everything, clicks Save → client-side validation should already prevent this, but if somehow bypassed, the `400` from the server surfaces inline as described above.

8. **Server rejects save (403 removed from project mid-edit).**
   a. User is editing → another admin removes them from the project → user clicks Save → `403` → editor stays open, inline error *"You don't have permission to edit this task"*, unchanged draft preserved so the user can copy their text out.

9. **Task deleted mid-edit (404).**
   a. User is editing → task is deleted server-side (no backend `DELETE /api/task/{taskId}` exists today, but backend may emit `404` for other reasons) → user clicks Save → `404` → panel closes; toast *"This task no longer exists"*.

### Out of scope for this ticket

- **Task comments / threaded discussion.** No backend entity exists. Strictly a separate ticket.
- **Markdown or rich-text rendering.** Plain text with preserved line breaks only. Markdown is a follow-up pending a PM decision on format.
- **Inline description editing on the board column card.** Panel-only for this ticket.
- **Description input in the create-task flow** (tracked separately via [#80](https://github.com/Gulybi/KanbAI-Web/issues/80) and the forthcoming in-scope create-task feature). #91 covers edit-after-create only.
- **Announcement-on-remote-change in read mode.** Deliberately silent in flow 5 above — live-region spam on every teammate keystroke is unacceptable.
- **Per-paragraph / per-line merge on conflict.** One-writer-wins only.
- **Draft auto-save or local storage of unsaved drafts across panel close.** Out of scope; closing the panel with an unsaved draft discards it.
- **Edit history / version list.** No backend support.
- **Optimistic local apply before the PUT resolves.** Out of scope for this ticket — the save round-trip is expected to be fast enough to render the new value on `200`. Revisit if UX feels laggy.
- **Backend changes.** Zero. All endpoints, DTOs, and events already exist.

---

## Milestone Context

**Milestone:** unassigned on the GitHub issue. This ticket consumes two backend endpoints and one SignalR event that are already shipped, and the state-layer SignalR handler that is already wired in [#85](https://github.com/Gulybi/KanbAI-Web/pull/85) / [#87](https://github.com/Gulybi/KanbAI-Web/issues/87). No backend prerequisite.

### Prerequisites — already shipped
- **[#85](https://github.com/Gulybi/KanbAI-Web/pull/85)** — Introduced the read-only Description section in the task detail panel and the `descriptionDisplay` projection this ticket extends into an editable surface.
- **[#87](https://github.com/Gulybi/KanbAI-Web/issues/87)** — Hydrates tasks on board entry so `content` is present in local state on refresh. Without #87, this ticket's UI would have nothing to render in the common "came back after lunch" flow.
- **`TaskUpdated` SignalR plumbing** — `BoardStateService.onTaskUpdated` at [`board-state.service.ts:317-353`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) already reconciles `content` by `id`, including the `null`-after-clear case. The detail panel's `descriptionDisplay` signal already re-renders off that state.
- **Backend endpoints** — `PUT /api/task/{taskId}/description` and `DELETE /api/task/{taskId}/description` are live and documented in [`backend_api_map.md`](../../.claude/backend_api_map.md). `TaskResponseDto.content: string | null` is present on every task DTO.

### Related / adjacent
- **[#80](https://github.com/Gulybi/KanbAI-Web/issues/80)** — "No way to create a task from the board" — closed on GitHub as the create-project-button fix, not the feature. The forthcoming create-task UI ticket should include a multi-line description input wired to `CreateTaskDto.content`; this ticket does **not** reach into that flow.
- **Future assignment / due-date / label editing in the panel** — will reuse the in-panel edit pattern (empty-state placeholder + click-to-edit + Save / Cancel / conflict banner) established here.

### Downstream
- **Usable Kanban experience.** Once this ships, the product crosses the "title-only todo list → real Kanban tool" threshold. Every subsequent feature (due dates, labels, assignees, priority) is incremental polish on a usable baseline rather than a prerequisite for basic utility.
- **Markdown / rich-text rendering** as a follow-up ticket once PM decides on a supported format.
- **Inline card-level description preview** (show the first N characters of `content` on the board card) as a separate follow-up.

### Backend Prerequisite
**None.** Verified against [`backend_api_map.md`](../../.claude/backend_api_map.md): the two write endpoints and the `TaskUpdated` broadcast already exist. This is a frontend-only ticket.

---

## Acceptance Criteria

Every criterion below is observable in the running UI, specific enough to describe the exact copy / button / field, and testable by QA without knowing implementation details.

### Display
- [ ] Opening a task in the detail panel shows a *"Description"* section beneath the title.
- [ ] When `content` is a non-empty string, it renders in the panel with line breaks preserved (e.g. via `white-space: pre-wrap`). A saved value of `"line one\nline two\n\nparagraph two"` renders visually as two lines, a blank line, and a third line — not as a single collapsed line.
- [ ] When `content` is `null`, an empty string, or whitespace-only, the panel shows the placeholder text *"No description yet — click to add one"* rendered as the edit affordance (activating it enters edit mode).

### Edit
- [ ] Clicking the rendered description (filled state) opens a multi-line text editor within the panel.
- [ ] Activating the empty-state placeholder (click, or Enter / Space with keyboard focus) opens the same multi-line editor.
- [ ] On entry, the editor is pre-filled with the current `content` (empty when none) and keyboard focus is inside the editor.
- [ ] A character counter appears once the user has typed more than **9,000** characters. The counter displays `<current> / 10000`.
- [ ] At exactly **10,000** characters the counter turns red and the Save button is disabled.
- [ ] The editor rejects submission when the trimmed value is empty: Save is disabled and an inline message *"Description cannot be empty"* is visible.
- [ ] Pressing **Ctrl+Enter** while focus is inside the editor sends `PUT /api/task/{taskId}/description` with body `{ content: <editor value> }`.
- [ ] Clicking the Save button sends the same request.
- [ ] Pressing **Escape** while focus is inside the editor closes the editor without calling the API and without mutating the displayed description.
- [ ] Clicking the Cancel button has the same effect as Escape.

### Save result
- [ ] On `200` success, the editor closes, the newly-saved description renders in read mode, and a visually hidden `aria-live="polite"` region announces *"Description saved"*.
- [ ] On `400` (server rejects empty-after-trim or over-limit), the editor stays open with the user's draft intact, and an inline error renders the first message from `ApiResponse.errors` when present, or the fallback *"Couldn't save description — please try again"* when `errors` is missing / empty.
- [ ] On `403`, the editor stays open with the user's draft intact, and an inline error renders *"You don't have permission to edit this task"*.
- [ ] On `404`, the panel closes and a toast / banner says *"This task no longer exists"*.
- [ ] On network failure (`status === 0`), the editor stays open with the user's draft intact, and an inline error renders *"Couldn't reach the server — try again"*.
- [ ] No error path leaks HTTP status codes, route URLs, stack traces, or raw `ApiResponse.errors[]` entries into user-visible copy (other than the single first string on `400`).

### Clear
- [ ] When `content` is non-null, a *"Clear description"* affordance is visible in the Description section.
- [ ] When `content` is `null` / empty, the *"Clear description"* affordance is not visible.
- [ ] Activating *"Clear description"* opens a confirmation with copy *"Clear this description?"* and two actions: *Confirm* and *Cancel*.
- [ ] Confirming sends `DELETE /api/task/{taskId}/description`.
- [ ] On `204`, the panel returns to the empty-state placeholder *"No description yet — click to add one"* and a visually hidden `aria-live="polite"` region announces *"Description cleared"*.
- [ ] On `403`, the confirmation closes and an inline error *"You don't have permission to edit this task"* is shown; the description is unchanged.
- [ ] On `404`, the panel closes and a toast says *"This task no longer exists"*.
- [ ] On network failure, the confirmation closes and an inline error *"Couldn't reach the server — try again"* is shown; the description is unchanged.
- [ ] Cancelling the confirmation closes it without calling the API and without mutating the displayed description.

### Real-time sync
- [ ] When a `TaskUpdated` SignalR event arrives for the task currently shown in the detail panel **and the user is not in edit mode**, the rendered description updates to match `evt.content`. If `evt.content` is `null`, the panel flips to the empty-state placeholder.
- [ ] When a `TaskUpdated` event arrives for the task currently shown **and the user is in edit mode**, the user's draft in the editor is NOT overwritten, and a non-blocking banner appears inside the panel with copy *"This task was updated by someone else"* and an action *"Discard my changes and reload"*.
- [ ] Activating *"Discard my changes and reload"* exits edit mode, renders the most recent remote `content` in read mode, and dismisses the banner.
- [ ] A `TaskUpdated` event for a task other than the one currently shown in the panel has no visible effect on the panel (it may still affect the board card, which is pre-existing behaviour).

### Accessibility
- [ ] The Description section is reachable via Tab in a logical order relative to the task title (title → description affordance → attachment section).
- [ ] The editor's textarea has an associated `<label>` (preferred) or `aria-label` with the text *"Task description"*.
- [ ] The Save, Cancel, and *"Clear description"* buttons are each keyboard-reachable and show a visible focus ring when focused.
- [ ] The confirmation for *"Clear description"* traps keyboard focus while open and can be cancelled with Escape.
- [ ] Save-success, save-failure, clear-success, and clear-failure announcements are rendered in an `aria-live="polite"` region.
- [ ] The *"This task was updated by someone else"* banner is announced once on appearance (polite, not assertive) and its *"Discard my changes and reload"* action is keyboard-activatable.
- [ ] Colour contrast for description text, placeholder text, character-counter (normal and over-limit red), inline error messages, and banner copy meets WCAG AA (4.5:1 for normal text, 3:1 for large text).
- [ ] The empty-state affordance is a real button-or-link-role element (not a plain `<p>`), so screen readers announce it as activatable.

### Out of scope (restated here for QA's no-test list)
- [ ] No test should assert the presence of threaded task comments (separate feature).
- [ ] No test should assert markdown / rich-text rendering of the description.
- [ ] No test should assert inline description editing from the board column card.
- [ ] No test should assert a description input in the create-task flow (tracked separately).
- [ ] No test should assert an announcement on remote description change while in read mode (deliberately silent).
- [ ] No test should assert a three-way merge / per-paragraph conflict resolution (one-writer-wins only).

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
