# Feature: Implement Visual Drag-and-Drop (Angular CDK)

**GitHub Issue:** #47
**Milestone:** Real-time UI Updates & Kanban Interaction (Milestone #5)
**Assignee:** Gulybi

## Business Value

**Who is this for?**
End users of the KanbAI Kanban board — project owners and project members — who manage a project's workflow by moving tasks between columns (e.g. "To Do" → "In Progress" → "Done") as work progresses.

**Why is it valuable?**
A Kanban board whose cards cannot be moved is not a Kanban board; it is a read-only list. Today the `/board/:projectId` route renders an empty shell (see `board-page.component.ts`) — a user who opens the board sees nothing, cannot add tasks to columns, and cannot signal progress by moving a card to the next column. The whole premise of the product — "drag a card to change its state" — is missing at the UI layer.

This issue delivers the core interaction that defines the product: grabbing a task card with the mouse (or keyboard), dragging it within its column to reorder it, or across columns to change its status, and having the change (a) show up instantly on screen and (b) persist on the server, and (c) broadcast to other collaborators on the same project via the SignalR pipeline landed in #46.

**What problem does it solve?**
- Removes the central gap between "we have a data model for a Kanban board" and "we have a usable Kanban UI". After this issue the board is no longer a placeholder.
- Delivers the optimistic-UI feel the milestone title promises ("Real-time UI Updates & Kanban Interaction"): the card snaps to its new position at the end of the drag with zero perceptible network latency, and only rolls back on a server error.
- Completes the round-trip between the local optimistic mutation and the server-confirmation path introduced in #46 (`TaskMoved` broadcast → `BoardStateService.onTaskMoved` reconciler), so the user's own drag and a teammate's drag converge on the same final state without flicker or duplicate entries.

**Business impact:**
- First interactive feature on the board — unblocks the product demo: a user can now actually *use* KanbAI to track work, not just authenticate and view a project list.
- Proves the end-to-end path HTTP mutation → SignalR broadcast → state reconciliation under real user input, validating the architecture landed across #45 and #46.
- Establishes the optimistic-update pattern (`optimistic mutation → HTTP call → server-truth reconciliation or rollback`) that subsequent mutations in the board (create task, create column, delete column, edit task) will inherit.

## Current State

- The board route exists at `board/:projectId` (`KanbAI-Web/src/app/app.routes.ts` line 30–35), guarded by `authGuard`. Reaching it renders `BoardPageComponent`.
- `BoardPageComponent` (`KanbAI-Web/src/app/features/board/board-page/board-page.component.ts`) is a lifecycle-only shell delivered in #46. On `ngOnInit` it calls `boardState.enterBoard(projectId)`; on `ngOnDestroy` it calls `boardState.leaveBoard()`. Its template renders nothing visible (the file exists but has no columns, no cards, no drag surfaces).
- `BoardStateService` (`KanbAI-Web/src/app/features/board/state/board-state.service.ts`) owns the local board state (`currentProjectId`, `columns`, `tasksByColumnId`) via `BaseStateService`, exposes read-only selectors, and already reconciles four SignalR events idempotently: `ColumnCreated`, `ColumnDeleted`, `TaskCreated`, `TaskMoved`. There is no method on the service today for "apply my own optimistic move" or "roll back a failed move".
- No frontend HTTP service exists for tasks or columns. The project has `projects-api.service.ts` and `members-api.service.ts` but no `tasks-api.service.ts` / `columns-api.service.ts`. A search across `KanbAI-Web/src/app` for `/api/task` or `/api/column` matches only comments in `board-state.service.ts` and `realtime-events.ts` — no live callers.
- `@angular/cdk` is already installed (`KanbAI-Web/package.json` line 14, `^21.2.7`). `DragDropModule` is not imported anywhere in `src/app` today (the `cdk` hits in grep are `MatDialog`-adjacent uses in the members and create-project dialogs).
- The local task/column data model `BoardTask` and `BoardColumn` (see `board-state.model.ts`) already carries `taskOrder`, `columnOrder`, `columnId`, and `projectId`, so the shape needed to drive a DnD UI is available once a source populates it.
- **Authoritative seeding gap:** the backend API map (`.claude/backend_api_map.md`) exposes `GET /api/column/project/{projectId}` for an initial column list but has **no GET endpoint for existing tasks**. Today, tasks only enter local state through the `TaskCreated` / `TaskMoved` real-time reconciler. Without a backend fetch path, opening a board fresh (after any page reload) yields an empty task set until new create/move events fire. This is a hard product constraint — see "Out of scope" below for how this issue handles it.
- Net user-visible behavior today: navigating to `/board/{id}` shows a blank page. There is no way for a user to see a task, let alone move one. The milestone's product promise — a working Kanban board — does not yet surface in the UI.

## Desired State

After this issue is delivered, the board at `/board/:projectId` presents the user's columns and tasks as a visually recognisable Kanban board, and a user can rearrange tasks within a column or across columns by dragging a card — with the change appearing instantly on screen and persisting on the server.

**Expected behaviors (UI-observable):**

*Initial board render*
- Navigating to `/board/:projectId` displays a row of columns for that project, in ascending `columnOrder`, each labelled with the column name and using the column's `colorCode` as its accent per the design system (`.claude/kanban_board_design.json` tokens `kanbanColumnWidth: 300px`, `kanbanColumnGap: 24px`).
- Columns are seeded from `GET /api/column/project/{projectId}` on board entry. If that call fails (network error, 404 project not found, 403 not a member), the board shows an error state that the user can dismiss by navigating back to the dashboard, and does not crash the app.
- Inside each column, task cards render in ascending `taskOrder`, showing at least the task title. Cards whose `content` is non-empty visually convey that there is content (precise treatment deferred to the design spec).
- If a column has zero tasks, the column renders an empty drop zone — not a broken / collapsed layout — so a card can still be dropped into it.

*Dragging a card*
- A user can grab any task card with the mouse (press-and-drag) and move it. Angular CDK is the drag engine — this is the chosen platform per the issue title; no custom drag code. The card visually lifts during drag per the design system (`shadow.cardDragging`, `background.cardDragging`).
- During a drag, every column shows a drop-zone affordance (per design system `background.dropzone`, `border.dropzone`) so the user can see where a drop will land.
- The user can drop the card back into its original column (reorder within the same column at a different index), or into a different column in the same project. Dropping on the column's header, empty area, or between two cards is all valid; the resulting index is inferred from the drop position by CDK.
- Dropping the card outside any column (on empty page area or by releasing the mouse while cancelling) returns the card to its original position with no server call and no state change.

*Optimistic UI update (the core of this ticket)*
- At the moment of drop on a valid column, the card appears at its new position in the target column **immediately**, before any network call completes. The user never sees a card "snap back then jump forward" during a successful move. Any surrounding cards whose `taskOrder` must shift to accommodate the inserted card shift immediately and locally.
- The client then issues `PUT /api/task/{taskId}/move` with `MoveTaskDto { columnId, taskOrder }` carrying the new column and the new order index.
- On HTTP success (`200` + `TaskResponseDto`), the server's authoritative DTO reconciles the local state — the task's final field values (including `taskOrder`, which the server may normalize, and `updatedAt`) reflect the server payload. No visible re-layout flash occurs if the server's `taskOrder` matches the optimistic one; if the server normalized the order to a different value, the card re-settles to its authoritative position.
- On HTTP failure (any non-2xx, or network error), the optimistic move is rolled back: the card returns to its original column and `taskOrder`, and the user sees a user-facing error message (toast / inline — precise UX deferred to design spec) explaining the move failed. The user's board is never left in an inconsistent state after a failed move.
- Specific error mappings the user must not be surprised by:
  - `403` ("not a member") — message along the lines of "You are no longer a member of this project and cannot move tasks." The user should understand the move did not happen.
  - `404` ("task or target column not found") — message along the lines of "That task or column no longer exists." The board should reconcile on the next event or refresh.
  - `400` ("cross-project move" / "invalid taskOrder") — should not normally be reachable from the UI (the UI only offers drops within the current board), but if it occurs, the rollback-with-message behavior applies the same way.

*Concurrency with real-time broadcasts (the #46 loop)*
- When the user successfully moves a card themselves, the backend emits `TaskMoved` to the project group. The initiating user's own client may also receive this event (SignalR group broadcasts include the sender unless the backend explicitly excludes). The state reconciler in `BoardStateService.onTaskMoved` must not produce a visible duplicate, a visible flicker, or an uncaught error when the same task is already at its new position from the optimistic update — the combined effect must look like a single smooth move.
- When another user moves a card on the same board while this user is viewing it, the card moves on this user's board within ~2 seconds per #46's behavior — no regression.
- If a drag is in progress on this client at the exact instant a remote `TaskMoved` event arrives that also targets the dragged task, the client's in-flight optimistic move takes precedence for the local user during the drag; the final reconciled state after drop matches the server's latest truth. A remote move of a *different* task during a local drag must not visually disturb the dragged card.

*Keyboard and accessibility (CDK capability, exposed to users)*
- A user using keyboard-only navigation can focus a task card with `Tab`, initiate drag with `Space` (Angular CDK's built-in keyboard drag), move with arrow keys, and drop with `Space` again. The resulting move triggers the same optimistic + HTTP + reconcile path as a mouse drag.
- Every interactive element (card, column header, drop zone) has an accessible name readable by a screen reader. Exact text is deferred to the design spec.

**Expected user flow:**
1. User A opens `/board/{projectX}`. The board paints: three columns — "To Do", "In Progress", "Done" — with task cards loaded in their columns.
2. User A press-holds the card "Design login page" in "To Do", drags it onto "In Progress", and releases. The card visibly leaves "To Do" and appears at the top of "In Progress" during the drag; on release, it snaps to its final position in "In Progress".
3. The client calls `PUT /api/task/{taskId}/move` with `columnId = InProgressId`, `taskOrder = 0`. The server responds `200` with the updated `TaskResponseDto`. The card stays where it is.
4. The server broadcasts `TaskMoved` to `project_{projectX}`. User A's own client receives it; the local reconciler sees the task is already in the target column at the target order and no visual change happens. User B, viewing the same board, sees the card move within ~2 seconds.
5. User A drags the same card to "Done", but their JWT has just expired and the `PUT` fails with a 401/403. The optimistic move is reverted — the card snaps back to "In Progress" — and a visible error message is shown. User B's board does not reflect the attempted move, because the backend never broadcast.
6. User A drags a card within the same column (reordering) from index 2 to index 0. The card moves optimistically; the server call persists the new `taskOrder`; the broadcast lands on User B's board which reflects the reorder.
7. User A starts a drag, then presses `Esc` (or releases outside any column). The card returns to its original position. No HTTP call is made. No broadcast occurs.

**Out of scope for this issue (belongs elsewhere):**
- **Creating or deleting tasks and columns via UI buttons** — the board UI in this ticket only needs to render the existing columns/tasks and move tasks; "add task" / "add column" / "delete column" buttons and their HTTP calls are not required by #47's wording ("visual drag-and-drop"). The state service already reconciles the events if those mutations happen via another client or a future UI.
- **Editing a task's title, content, or assignee** — not part of drag-and-drop.
- **Fetching existing tasks on initial board load** — the backend does not currently expose a list-tasks endpoint (see `.claude/backend_api_map.md`). For this issue, the board may legitimately render with an empty task set on a cold load if no `TaskCreated` events have fired since page entry. If this proves user-hostile during implementation, the technical path is to request a backend task-list endpoint in a follow-up issue rather than inventing one client-side. The implementer must not fake or cache tasks across navigations to paper over this; the acceptance criteria below are written around "whatever tasks local state currently holds" so that this gap does not block the ticket. Columns, in contrast, have a GET endpoint and must be loaded.
- **Resynchronising lost events after a SignalR reconnect** — still deferred, matching #46's out-of-scope list.
- **Cross-project drag (moving a task to another project's column)** — not possible in the UI, and the backend rejects it (`400`) anyway.
- **Undo after a successful move** — not required. Once the server confirms, the only way back is another drag.
- **Animation tuning / bespoke drag physics** — use Angular CDK's defaults plus the design system tokens (`shadow.cardDragging`, `background.dropzone`). Any deviations are the design spec's call, not an implementation invention.
- **Mobile touch drag polish** — CDK supports touch out of the box; acceptance criteria below require "drag works on a touch input" but do not require iOS/Android-specific tuning in this ticket.
- **Changes to `SignalRService`, `BoardStateService`'s existing reconciler contract, `AuthStateService`, or `BaseStateService`.** New methods may be *added* to `BoardStateService` to support optimistic mutation + rollback, but existing method signatures and event reconciliation behavior are frozen.

## Milestone Context

**Milestone:** #5 — Real-time UI Updates & Kanban Interaction

**Prerequisite Issues:**
- #45 — Setup SignalR Client Service — **CLOSED**. Provides the transport layer this ticket's broadcasts travel over.
- #46 — Integrate Real-time Events with State Management — **CLOSED (merged in 7195973)**. Provides `BoardStateService.enterBoard` / `leaveBoard`, the `TaskMoved` / `TaskCreated` / `ColumnCreated` / `ColumnDeleted` reconcilers, and the `JoinProjectGroup` / `LeaveProjectGroup` lifecycle. Without #46 the card move would reach the server but the sender's local state would diverge from other viewers' local state. This ticket rides directly on top of #46's reconciliation layer.
- Authentication (#60 era) — **CLOSED**. `/board/:projectId` is already behind `authGuard`.

**Downstream Issues (likely built on top of this one, but not in this milestone):**
- No open issues reference #47 at time of writing. Future board-interaction tickets (create task UI, edit task dialog, board-level filters) will build on the column/task render surface introduced here.

**Related Work:**
- `docs/handoffs/issue_46_context.md` — details the event-to-state reconciliation path this ticket's optimistic move must converge with.
- `docs/handoffs/issue_46_tech_spec.md` — describes the two-layer join strategy (`ProjectStateService` Layer 1 dashboard-scope join, `BoardStateService` Layer 2 board-scope join) and the idempotent reconciler contracts this ticket must not regress.
- `.claude/backend_api_map.md` — authoritative on `PUT /api/task/{taskId}/move` (request `MoveTaskDto { columnId, taskOrder }`, response `TaskResponseDto`), on `GET /api/column/project/{projectId}` for initial columns, and on the `TaskMoved` broadcast shape. Note the documented absence of a GET-tasks endpoint — this is a known constraint for this ticket.
- `.claude/kanban_board_design.json` — design tokens referenced by the desired state (`kanbanColumnWidth: 300px`, `kanbanColumnGap: 24px`, `cardDragging` shadow/background, `dropzone` background/border). The design spec authored in Phase 3 will flesh these into exact SCSS.

## Acceptance Criteria

*Initial board render*
- [ ] Navigating to `/board/:projectId` for a project the user is a member of renders the project's columns in ascending `columnOrder`, each column visually distinct and labelled with its name. Columns are loaded from `GET /api/column/project/{projectId}`.
- [ ] Each column renders its task cards in ascending `taskOrder`. Cards display at least the task title. (Tasks present in local state — per the documented task-seed gap — are what renders; if local state has no tasks for a column, the column renders as an empty droppable area, not a broken layout.)
- [ ] If the column fetch fails (HTTP error), the board displays a user-readable error state instead of a silent blank page, and does not throw an uncaught error to the browser console.
- [ ] Navigating away from the board (route change, logout) clears the board view and invokes the existing `BoardStateService.leaveBoard()` lifecycle (verifiable by the `LeaveProjectGroup` hub call already contracted in #46).

*Dragging — within-column reorder*
- [ ] The user can grab any task card with the mouse, drag it above or below another card in the same column, and drop it; the card visually lifts during drag per the design tokens, and all cards in the column settle to their new order on drop, before any network response.
- [ ] Immediately after the drop, a `PUT /api/task/{taskId}/move` is issued with `columnId` equal to the current column and `taskOrder` equal to the new index.
- [ ] On HTTP `200`, the card remains at its new position and the task's fields reflect the returned `TaskResponseDto` (including any server-normalized `taskOrder`).
- [ ] On HTTP failure, the card reverts to its pre-drag position and `taskOrder`, and a visible error message is shown to the user.

*Dragging — cross-column move*
- [ ] The user can drag a task card from one column to a different column in the same board, drop it on any valid position (top, middle, end, or onto an empty column), and the card appears in the target column at the chosen index immediately on drop.
- [ ] Immediately after the drop, a `PUT /api/task/{taskId}/move` is issued with `columnId` equal to the target column id and `taskOrder` equal to the drop index.
- [ ] On HTTP `200`, the card remains in the new column at the server-confirmed `taskOrder`.
- [ ] On HTTP failure, the card reverts — both column and order — to its pre-drag location, and a visible error message is shown.
- [ ] Dropping a card back into the exact same column and order it started in results in no state change and no HTTP call (no-op drag).
- [ ] Dropping a card outside any column (e.g. on empty page area) or cancelling the drag with `Esc` returns the card to its origin with no state change and no HTTP call.

*Optimistic concurrency with the #46 broadcast loop*
- [ ] After a successful self-initiated move, if the backend broadcasts `TaskMoved` back to this same client (same task id, same `newColumnId`, same `newTaskOrder`), the local reconciler does not visibly move the card a second time, does not duplicate the card in either column, and does not produce an uncaught console error. The effect on screen is a single smooth move.
- [ ] While a drag is in progress on this client, an unrelated `TaskMoved` event for a *different* task on the same board does not visually disturb the card being dragged. (The background move may or may not be reflected on the board during the drag; what must hold is that the dragged card keeps moving with the cursor and lands correctly.)
- [ ] A remote move performed by a different user on the same board (no local drag in flight) causes the local board to update within 2 seconds, matching #46's real-time behavior (no regression).

*Keyboard accessibility*
- [ ] A user can `Tab` to a task card, press `Space` (or `Enter`, per Angular CDK defaults) to pick it up, use arrow keys to move it between positions and columns, and press `Space` to drop. A keyboard-initiated move triggers the same optimistic + HTTP + reconcile path as a mouse move. `Esc` during a keyboard drag cancels without a server call.
- [ ] Every task card has an accessible name readable by a screen reader (at minimum the task title). Every column has an accessible name (the column name).

*Touch input*
- [ ] A press-and-drag gesture on a touch input device (phone or touchscreen laptop) performs the same move as a mouse drag. Short taps do not initiate a drag.

*Cross-cutting guarantees*
- [ ] No uncaught errors appear in the browser DevTools console during a successful drag, during a rolled-back failed drag, or during a remote `TaskMoved` event landing while the board is open.
- [ ] No JWT, no user id, no raw event payload is written to `console.log` by any drag/move code introduced in this issue, consistent with the project's logging/privacy standard.
- [ ] `npm run build` succeeds with the new board UI in place.
- [ ] `npm run test -- --watch=false` runs to completion; any test failures tied to the newly introduced drag-and-drop code or the board page's column/task rendering are fixed before completion. Pre-existing failures unrelated to #47 are documented, not fixed, per project policy.

### Quality Gate Check

Each criterion above has been reviewed for:
- **Observable:** Every item can be verified in the browser (visible UI change, DevTools Network panel for the `PUT /api/task/{taskId}/move` request, DevTools WebSocket frames for the broadcast, DevTools Console for error absence) or via build/test command exit. No criterion depends on internal framework state invisible to QA.
- **Specific:** Concrete HTTP endpoints (`PUT /api/task/{taskId}/move` with `MoveTaskDto`), concrete interaction targets (a card, a column, a drop zone), concrete latency and visual bounds ("immediately on drop", "within 2 seconds") are named. No vague "feels smooth" language.
- **Testable:** QA can drive each scenario deterministically — mouse drag and keyboard drag are both described as test paths; rollback is testable by forcing an HTTP failure (e.g. offline mode or revoked token); concurrency is testable with two browser sessions, matching the two-user pattern already used for #46.
- **Edge cases covered:** within-column vs cross-column moves, drop-on-empty-column, no-op drag back to origin, cancelled drag, failed HTTP rollback, echo broadcast after self-move, remote broadcast during local drag, keyboard and touch paths, column fetch failure.

---

*"The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification."*
