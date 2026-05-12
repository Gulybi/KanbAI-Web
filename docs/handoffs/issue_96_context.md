# Feature: Delete projects, columns, and tasks from the UI

**GitHub Issue:** #96
**Milestone:** _(none set on the issue)_
**Assignee:** @Gulybi

---

## Business Value

Today KanbAI-Web is a one-way street: users can create projects, columns, and tasks, but they have no in-app way to remove any of them. Mistaken creations, finished sprints, duplicate cards, and decommissioned boards accumulate forever. The board stops being a trustworthy source of truth, and users resort to clearing browser state or abandoning the project.

This feature closes that gap end-to-end for all three primitives:

- **Parity gap with every comparable Kanban tool** (Trello, Linear, Jira, GitHub Projects) — shipping only create without delete makes the board feel like a trap.
- **Eliminates "zombie" boards / columns / cards** so the board can function as a trusted status view.
- **Consumes already-shipped backend work.** `DELETE /api/project/{id}`, `DELETE /api/column/{id}`, and `DELETE /api/task/{taskId}` are all live and return `ProjectDeleted` / `ColumnDeleted` / `TaskDeleted` SignalR broadcasts. All three sub-features are now frontend-only closures.
- **Unblocks future deletion-adjacent work** (archive, undo, bulk clean-up) by establishing the confirm-and-delete UX pattern once.

**Users served:**
- **Project owners** — need to decommission projects they no longer work on.
- **Every project member** — needs to remove columns and tasks that are wrong, duplicated, obsolete, or left over from an ended sprint.
- **Teams relying on the board as a trusted status view** — stale items that cannot be removed actively mislead.

---

## Current State

References are to files in `KanbAI-Web/KanbAI-Web/src/app/`.

- **Projects landing page** (`features/projects/dashboard-page/dashboard-page.component.ts`, `features/projects/components/project-card/project-card.component.ts`):
  - Project cards expose a "Manage members" icon button (owner-only) and emit `openBoard`. There is **no per-card menu, no "Delete project" affordance, no context menu** on right-click.
  - The REST and state-layer plumbing for delete already exists and is unused by any UI: `ProjectsApiService.deleteProject(id)` calls `DELETE /api/project/{id}`, and `ProjectStateService.deleteProject(id)` wraps it with state reconciliation. No component references either.
- **Open project header** (`features/board/board-page/board-page.component.ts`):
  - There is no project-level "Delete project" affordance inside an open board.
- **Board view — column headers** (`features/board/components/board-column/board-column.component.ts`):
  - Column headers show name, color, and task count. There is **no per-column menu, no kebab, no "Delete column" button.**
  - No client service method calls `DELETE /api/column/{id}` today. `ColumnsApiService` only exposes list/create.
- **Task detail panel** (`features/board/components/task-detail-panel/task-detail-panel.component.ts`):
  - The panel shows title (read-only), the editable description section (shipped in #91 / #93 / #97), and the attachment section. **No "Delete task" button exists.**
  - No client method calls task-delete today even though the backend route is live (`DELETE /api/task/{taskId}` — `204` / `403` / `404` / `500`).
- **SignalR reconciliation** (`features/projects/state/project-state.service.ts`, `features/board/state/board-state.service.ts`):
  - `ProjectDeleted` and `ColumnDeleted` handlers are already wired at the state layer and mutate local state when remote events arrive. The backend already emits `TaskDeleted` with payload `{ taskId, columnId }`, but **no frontend handler is wired for it yet** — this ticket must add it.
- **Error copy mapping** (`features/projects/services/projects-api.service.ts` → `mapErrorToUserMessage`, `features/board/services/columns-api.service.ts`, `features/board/services/tasks-api.service.ts`):
  - The per-status-code error-mapping pattern is already established — 403 on project delete already maps to `"Only the project owner can delete this project."` even though no UI invokes it today.
- **Confirmation dialog pattern** (`features/board/components/task-description-clear-confirm-dialog/`, `features/projects/components/members-dialog/remove-member-confirm-dialog/`):
  - A destructive-confirm pattern (CDK Dialog + heading + two-button row, red primary / neutral secondary, focus-trapped, Escape-dismissible) already exists and is re-used across the app. This feature will reuse that pattern.

**Behavioural consequence on `main` today:** there is no client code path that issues any `DELETE /api/project/{id}`, `DELETE /api/column/{id}`, or `DELETE /api/task/{taskId}` request — despite all three routes being live server-side. A user who opens DevTools → Network while trying every control on the UI will never see such a call. The only way projects/columns/tasks disappear from the UI is when a second session deletes them via the API directly and the corresponding SignalR event arrives (and even then, `TaskDeleted` has no client handler yet).

---

## Desired State

Every project, every column, and every task has a clearly-labelled, permission-aware delete path with a confirmation step, explicit user copy, and real-time reconciliation for collaborators.

Three sub-features, one ticket. For each, the UX shape is the same: **affordance → confirmation dialog → HTTP → success/error UX → local reconciliation + SignalR reconciliation for other sessions.**

### A) Delete a project

- **Affordance placement.** A project-level overflow menu (kebab) on each **project card on the landing page** _and_ inside the **open project's header**. The menu contains at minimum a *"Delete project"* entry. The entry is keyboard-reachable and shows a visible focus ring.
- **Visibility / enablement.**
  - *"Delete project"* is enabled only for users whose role is `Owner`. Non-owners see the entry disabled with a hint *"Only the project owner can delete this project"*.
  - Alternative acceptable implementation: hide the entry entirely for non-owners.
  - **Whichever option is chosen must be applied consistently across both surfaces (card menu and open-project header menu).** Do not mix.
- **Confirmation dialog.** Activating *"Delete project"* opens a modal confirmation:
  - **Title:** *"Delete this project?"*
  - **Body:** *"'{project name}' and everything inside it (columns, tasks, attachments) will be permanently deleted. This cannot be undone."*
  - **Primary action:** *"Delete project"* (destructive, red).
  - **Secondary action:** *"Cancel"*.
  - Traps keyboard focus; dismissible with Escape; restores focus to the invoking menu item on close.
- **Execute.** Confirming fires `DELETE /api/project/{id}`:
  - On `204`:
    - If the user is on the project board, navigate back to the projects landing page.
    - Remove the project from the landing-page grid.
    - Announce *"Project deleted"* via an `aria-live="polite"` region.
    - Show a non-blocking toast *"Project '{name}' was deleted"*.
  - On `403`: close the confirmation; show inline / toast error *"Only the project owner can delete this project"*. No state change.
  - On `404`: treat as success (it is already gone server-side); remove locally; announce as usual.
  - On network failure (`status === 0`): keep the confirmation open with inline error *"Couldn't reach the server — try again"*. No state change. Retry-in-place works.
  - Any other status: inline error *"Couldn't delete project — please try again"*. No state change.
- **Real-time.** When a `ProjectDeleted` SignalR event arrives:
  - If the user is viewing that project's board, navigate them to the projects landing page with a toast *"This project was deleted by another member"*.
  - If the user is on the landing page (project not open), silently remove the project from the grid (no toast, no announcement).

### B) Delete a column

- **Affordance placement.** A per-column kebab menu in the column header. Menu contains at minimum a *"Delete column"* entry. Keyboard-reachable, visible focus ring.
- **Visibility / enablement.** Any project member may delete any column (mirrors current backend contract). If backend rules tighten later, the client must respect the server's response — this ticket mirrors current server behaviour.
- **Confirmation dialog.** Activating *"Delete column"* opens a modal confirmation:
  - **Title:** *"Delete this column?"*
  - **Body (column has tasks):** *"'{column name}' contains {N} task(s). Deleting the column will permanently delete every task it contains. This cannot be undone."*
  - **Body (empty column):** *"'{column name}' will be permanently deleted. This cannot be undone."*
  - **Primary action:** *"Delete column"* (destructive, red).
  - **Secondary action:** *"Cancel"*.
  - Focus trap, Escape-to-cancel, focus restore on close.
- **Execute.** Confirming fires `DELETE /api/column/{id}`:
  - On `204`:
    - Remove the column (and its tasks) from the board.
    - If the task detail panel is open for a task that lived in the deleted column, close the panel.
    - Announce *"Column deleted"* via `aria-live="polite"`.
    - Show a non-blocking toast *"Column '{name}' was deleted"*.
  - On `404`: treat as success; remove locally; announce.
  - On `403`: close the confirmation; show inline / toast error *"You don't have permission to delete this column"*. No state change.
  - On network failure: keep the confirmation open with inline error *"Couldn't reach the server — try again"*. No state change.
  - Any other status: inline error *"Couldn't delete column — please try again"*. No state change.
- **Real-time.** When a `ColumnDeleted` SignalR event arrives:
  - Remove the column from the board locally.
  - If the user had the task-detail panel open for a task in that column, close the panel and show a toast *"This column was deleted by another member"*.

### C) Delete a task

- **Affordance placement.** A *"Delete task"* button inside the task detail panel, in a destructive section near the **bottom** of the panel, visibly separated from the description section's Save / Cancel controls, so it cannot be mis-clicked during a description edit. Keyboard-reachable, visible focus ring.
  - A card-level context-menu entry is **out of scope** for this ticket (primary surface is the panel; card menu can follow as a polish ticket).
- **Confirmation dialog.** Activating *"Delete task"* opens a modal confirmation:
  - **Title:** *"Delete this task?"*
  - **Body:** *"'{task title}' and all its attachments will be permanently deleted. This cannot be undone."*
  - **Primary action:** *"Delete task"* (destructive, red).
  - **Secondary action:** *"Cancel"*.
  - Focus trap, Escape-to-cancel, focus restore on close.
- **Execute.** Confirming fires `DELETE /api/task/{taskId}` (backend route is live):
  - On `204`:
    - Remove the task from its column.
    - Close the task detail panel.
    - Announce *"Task deleted"* via `aria-live="polite"`.
    - Show a non-blocking toast *"Task '{title}' was deleted"*.
  - On `404`: treat as success (task is already gone; backend also returns `404` on the second call of an idempotent repeat delete); close the panel, remove locally, announce.
  - On `403`: close the confirmation; show inline error *"You don't have permission to delete this task"* (backend error string: *"You are not a member of this project."*). No state change.
  - On `500`: inline error *"Couldn't delete task — please try again"* (backend returns `500` when physical attachment file deletion fails; the task is preserved server-side, so retry-in-place is valid). No state change.
  - On network failure (`status === 0`): keep the confirmation open with inline error *"Couldn't reach the server — try again"*. No state change.
  - Any other status: inline error *"Couldn't delete task — please try again"*. No state change.
- **Real-time.** When a `TaskDeleted` SignalR event arrives (payload: `{ taskId, columnId }`):
  - Remove the task from its column (scoped by the event's `columnId` — no board-wide lookup required).
  - If the user has that task open in the detail panel, close the panel and show a toast *"This task was deleted by another member"*.
  - **Note on cascade deletes:** the backend does **not** emit per-task `TaskDeleted` events when a task is removed as a side-effect of `DELETE /api/project/{id}` or `DELETE /api/column/{id}` (documented in issue #90). Clients must continue to remove child tasks locally in response to `ProjectDeleted` / `ColumnDeleted`; `TaskDeleted` fires only on direct task deletes.

### Desired user flows (happy paths)

1. **Delete a project (owner).** Owner clicks card kebab → *"Delete project"*. Confirmation asks *"Delete this project?"* with red primary button. Owner confirms → `DELETE /api/project/{id}` → `204`. Card disappears from the landing grid; toast *"Project '{name}' was deleted"*; AT announces *"Project deleted"*.
2. **Delete a column with tasks.** Member clicks column kebab → *"Delete column"*. Confirmation lists the task count and the destructive consequence. Member confirms → `DELETE /api/column/{id}` → `204`. Column (and its cards) disappears from the board; toast + AT announcement.
3. **Delete a task.** Member opens the task → clicks *"Delete task"* at the bottom of the detail panel. Confirmation asks *"Delete this task?"* with red primary button. Member confirms → `DELETE /api/task/{taskId}` → `204`. Task detail panel closes; card removed from column; toast + AT announcement.
4. **Non-owner attempts project delete.** Non-owner opens the project menu. *"Delete project"* is disabled (hint *"Only the project owner can delete this project"*) or hidden — per the consistency choice above. If the action is somehow invoked on a disabled entry, backend returns `403` and the user sees the same permission copy.
5. **Remote delete while user has the target open.** User has a task open in the detail panel. Another member deletes that task's column → `ColumnDeleted` arrives. Panel closes; toast *"This column was deleted by another member"*; column disappears from the board.
6. **Network failure on delete.** User confirms a delete → request fails with `status === 0`. Confirmation stays open with inline error *"Couldn't reach the server — try again"*. No state mutation. Retry-in-place works.

---

## Milestone Context

**Prerequisite issues:**
- **#85 / #87** — SignalR reconciliation chassis. Already shipped and merged. Provides the subscribe-dispose pattern this feature's `ProjectDeleted` / `ColumnDeleted` / `TaskDeleted` reconciliation plugs into.
- **#90** — Task-delete backend. **Already shipped and merged.** Route `DELETE /api/task/{taskId}` is live (JWT-auth, `204` success, `403` *"You are not a member of this project."*, `404` *"Task not found."*, `500` *"An unexpected error occurred."* when physical file deletion fails — task is preserved for retry). The `TaskDeleted` SignalR event is broadcast to `project_{projectId}` with payload `{ taskId, columnId }`. Attachment cascade behaviour is defined: `Asset` rows and `TaskComment` rows removed via EF Core cascade, physical files deleted from disk before the DB commit (fail-safe). Per-child `TaskDeleted` events are **not** emitted for tasks removed via `ProjectDeleted` / `ColumnDeleted` cascades — clients must remove children locally from the parent event.
- **#91** — Clear-description confirmation dialog pattern. Already shipped. Provides the destructive-confirm UX pattern (CDK Dialog, red primary, neutral Cancel, focus trap, Escape dismiss, focus restore) that this feature reuses for all three delete confirmations.

This ticket has **no remaining backend prerequisites**. All three sub-features (A project, B column, C task) are now frontend-only closures.

**Downstream issues (unblocked by this ticket):**
- Undo / trash / soft-delete (adds an undo toast window on top of this feature's confirm + hard-delete base).
- Bulk delete (multi-select of tasks / columns).
- Archive (non-destructive alternative to delete).
- Board-card context menu for task delete (polish follow-up; primary surface established here is the panel-level button).
- "Transfer ownership then delete" flow for sole-owner project delete (handled generically here as a `403` with the standard permission copy).

**Related work:**
- Reuses the per-status-code error-mapping pattern in `ProjectsApiService.mapErrorToUserMessage` and the equivalents in `ColumnsApiService` / `TasksApiService`.
- Reuses the landing-page grid reconciliation wired on `ProjectDeleted` in `ProjectStateService.onProjectDeleted`.
- Reuses the board reconciliation wired on `ColumnDeleted` in `BoardStateService.onColumnDeleted`.

---

## Acceptance Criteria

Each criterion is observable in the running UI and testable by QA without reading code.

**Affordances**
- [ ] Each project card on the landing page exposes a menu that contains a *"Delete project"* entry.
- [ ] The open project's header exposes a menu that contains a *"Delete project"* entry.
- [ ] Each column header on the board exposes a menu that contains a *"Delete column"* entry.
- [ ] The task detail panel exposes a *"Delete task"* button, visually distinct (destructive styling) and positioned below — and visibly separated from — the description section's Save / Cancel controls, so it cannot be mis-activated during a description edit.

**Permissions surface**
- [ ] For a non-owner viewing a project they did not create, *"Delete project"* is either disabled (with the hint *"Only the project owner can delete this project"*) or hidden entirely, and the chosen behaviour is applied identically on **both** the project card menu and the open-project header menu.
- [ ] `403` responses from any delete surface the exact user-visible copy listed in *Desired State* for that sub-feature, and never an HTTP status code, a URL, or a raw `ApiResponse.errors[]` entry.

**Confirmation dialogs**
- [ ] The project-delete confirmation shows title *"Delete this project?"*, body *"'{project name}' and everything inside it (columns, tasks, attachments) will be permanently deleted. This cannot be undone."*, primary *"Delete project"* (red), secondary *"Cancel"*.
- [ ] The column-delete confirmation shows title *"Delete this column?"*; body *"'{column name}' contains {N} task(s). Deleting the column will permanently delete every task it contains. This cannot be undone."* when the column has at least one task, and *"'{column name}' will be permanently deleted. This cannot be undone."* when the column has zero tasks; primary *"Delete column"* (red); secondary *"Cancel"*.
- [ ] The task-delete confirmation shows title *"Delete this task?"*, body *"'{task title}' and all its attachments will be permanently deleted. This cannot be undone."*, primary *"Delete task"* (red), secondary *"Cancel"*.
- [ ] Every confirmation dialog traps keyboard focus while open, dismisses on Escape, and restores focus to the invoking element when it closes.
- [ ] Clicking *"Cancel"* (or dismissing with Escape) on any confirmation performs no network request and no state mutation.

**Request wiring**
- [ ] Confirming project delete fires exactly one `DELETE /api/project/{id}` against the project that was selected from the menu.
- [ ] Confirming column delete fires exactly one `DELETE /api/column/{id}` against the column whose header menu was used.
- [ ] Confirming task delete fires exactly one `DELETE /api/task/{taskId}` against the task currently open in the detail panel.

**Success handling**
- [ ] On `204` for project delete, the project disappears from the landing grid; if the user was on that project's board, they are navigated back to the projects landing page; a toast *"Project '{name}' was deleted"* appears; an `aria-live="polite"` region announces *"Project deleted"*.
- [ ] On `204` for column delete, the column disappears from the board; any open task detail panel for a task that was in that column closes; a toast *"Column '{name}' was deleted"* appears; an `aria-live="polite"` region announces *"Column deleted"*.
- [ ] On `204` for task delete, the task disappears from its column; the task detail panel closes; a toast *"Task '{title}' was deleted"* appears; an `aria-live="polite"` region announces *"Task deleted"*.
- [ ] On `404` for any of the three deletes, the client treats the operation as success — local state is cleaned up and the same success toast and announcement fire as for `204`.

**Error handling**
- [ ] On network failure (`status === 0`) for any delete, the confirmation dialog remains open, an inline error *"Couldn't reach the server — try again"* appears inside the dialog, and no state is mutated. Clicking the primary button again retries the request.
- [ ] On `403` for project delete, the confirmation closes and the user sees *"Only the project owner can delete this project"* (toast or inline); no state is mutated.
- [ ] On `403` for column delete, the confirmation closes and the user sees *"You don't have permission to delete this column"* (toast or inline); no state is mutated.
- [ ] On `403` for task delete, the confirmation closes and the user sees *"You don't have permission to delete this task"* (toast or inline); no state is mutated.
- [ ] On `500` for task delete (backend-documented: physical attachment file deletion failed; task is preserved server-side), the confirmation stays open with inline error *"Couldn't delete task — please try again"*; no state is mutated; retry-in-place works.
- [ ] On any other unexpected status (other `5xx`, parse failure, etc.) for each delete, the user sees an inline error *"Couldn't delete {project|column|task} — please try again"*; no state is mutated.
- [ ] No error path in any delete surface displays an HTTP status code, a request URL, a stack trace, or a raw `ApiResponse.errors[]` string.

**Real-time sync**
- [ ] A `ProjectDeleted` event received while the user is on that project's board navigates them to the projects landing page and shows a toast *"This project was deleted by another member"*.
- [ ] A `ProjectDeleted` event received for a project visible on the landing page (but not open) removes the project from the grid without showing a toast and without emitting an AT announcement.
- [ ] A `ColumnDeleted` event removes the column from the board; if the user had a task-detail panel open for a task in that column, the panel closes and a toast *"This column was deleted by another member"* is shown.
- [ ] A `TaskDeleted` event removes the task from its column (scoping on the event's `columnId`); if the user had that task's detail panel open, the panel closes and a toast *"This task was deleted by another member"* is shown.
- [ ] A `ProjectDeleted` or `ColumnDeleted` event removes every task that lived under it from local state, even though the backend does **not** emit per-child `TaskDeleted` events for cascaded deletions.

**Accessibility**
- [ ] Every delete affordance (card menu, open-project header menu, column-header menu, panel-level Delete-task button) is reachable by keyboard and shows a visible focus ring when focused.
- [ ] Every confirmation dialog has an accessible name that matches its visible title heading, traps focus while open, and is dismissible with Escape.
- [ ] The destructive primary button in every confirmation meets WCAG AA contrast for its background + label combination in both the resting state and the hover / focus states.
- [ ] Success and failure user-facing copy is announced through an `aria-live="polite"` region; toasts announce once on appearance and never steal keyboard focus.
- [ ] Every confirmation dialog body references the specific entity name (*"'{project name}'"*, *"'{column name}'"*, *"'{task title}'"*) so screen-reader users can tell **which** project / column / task they are about to delete.

**Scope**
- [ ] The only delete entry points added by this ticket are the three described above (project card menu, open-project header menu, column-header menu, task detail panel button). No board-card context menu, no bulk-delete control, no archive toggle, no undo toast are added.

---

## Out of Scope

- **Undo / trash / soft-delete.** All three deletes are hard deletes. A separate ticket can introduce an undo toast.
- **Bulk delete** (multi-select of tasks / columns).
- **Archive** (a non-destructive alternative to delete).
- **Board-card context menu for task delete.** Primary surface is the task detail panel; the card-level menu is a follow-up polish ticket.
- **"Transfer ownership then delete" flow** for sole-owner project delete — handled here as the standard `403` permission error.
- **Per-attachment delete behaviour rework** — attachment delete is already its own endpoint and is not changed here.
