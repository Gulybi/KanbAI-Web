# Feature: Integrate Real-time Events with State Management

**GitHub Issue:** #46
**Milestone:** Real-time UI Updates & Kanban Interaction (Milestone #5)
**Assignee:** Gulybi

## Business Value

**Who is this for?**
End users of the KanbAI Kanban board — project owners and project members — who collaborate on the same project in parallel, often from different devices or browser sessions.

**Why is it valuable?**
Issue #45 delivered a live SignalR transport in the browser, but nothing in the app currently consumes the events flowing over that transport. From the user's perspective the product is still indistinguishable from the pre-SignalR version: the wire is open, yet the UI never moves on its own. Until the real-time transport is connected to the Angular Signals-based state services, a user has no way of knowing that a teammate moved a card, added a member, created a column, or deleted a project — short of manually refreshing the page.

**What problem does it solve?**
This issue closes the loop between transport (#45) and the visible UI. It delivers the behavior end users actually perceive as "real-time collaboration": when another user (or the backend itself) causes a change on a board you are viewing, that change appears in your UI within a couple of seconds without any interaction on your part. It is also the prerequisite that #47 (visual drag-and-drop with optimistic updates) depends on — without reactive state reconciliation, an optimistic client move cannot be safely confirmed or reverted by the server's authoritative `TaskMoved` broadcast.

**Business impact:**
- Turns the previously invisible SignalR channel into a visible product capability — multi-user collaboration without manual refresh.
- Unblocks issue #47 (visual drag-and-drop with optimistic UI) by providing the server-confirmation path an optimistic update needs.
- Establishes the event-to-state reconciliation pattern once, so future real-time features (notifications, AI agent activity, comments) inherit the same wiring instead of each reinventing it.
- Protects the shared-state promise of a Kanban tool: users making decisions based on the board can trust the board actually reflects reality.

## Current State

- SignalR transport is fully wired as of PR #45 and lives at `KanbAI-Web/src/app/core/services/signalr.service.ts`. It exposes `start()`, `stop()`, `on<T>(eventName)`, and a read-only `connectionState` signal. It opens a single connection per authenticated session via an `effect()` on `AuthStateService.isAuthenticated`, and closes on logout.
- No file in the Angular app subscribes to `SignalRService.on(...)` today. A search across `KanbAI-Web/src/app` for the server event names documented in the API map (`TaskMoved`, `TaskCreated`, `ColumnCreated`, `ColumnDeleted`, `ProjectUpdated`, `ProjectDeleted`, `MemberAdded`, `MemberRemoved`) returns zero subscribers.
- No component or service currently calls the hub methods `JoinProjectGroup` / `LeaveProjectGroup` that the backend requires before broadcasts are delivered (see `backend_api_map.md`). Today a user opening the board would receive zero server pushes even though the connection is up, because the connection never joins the relevant project group.
- The board route (`/board`) and its component at `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` exist but are an empty shell — no task data, no columns, no state service of their own yet. Any board-specific kanban state (tasks, columns) is not yet modeled in the frontend.
- The project list is owned by `KanbAI-Web/src/app/features/projects/state/project-state.service.ts` (extends `BaseStateService`, exposes `projects`, `isLoading`, `error`, `hasLoaded`). The member list is owned by `KanbAI-Web/src/app/features/projects/state/members-state.service.ts`. Both are populated strictly by HTTP CRUD through their `*-api.service.ts` siblings; neither receives pushed updates. So when a teammate renames a project you can currently see in the dashboard, or another owner removes a member in a dialog you have open, your UI keeps the stale name / stale member until refresh.
- Net user-visible behavior today: the app behaves as a single-user app despite having a live WebSocket. Open the dashboard in two tabs, rename a project in tab A — tab B shows the old name until reloaded.

## Desired State

After this issue is delivered, server-originated changes must flow into the app's Signals-based state within seconds of being broadcast, with no user interaction.

**Expected behaviors (UI-observable):**
- While a user is viewing the dashboard, if another user (or another of the same user's sessions) renames or deletes a project the current user can see, the displayed project card updates or disappears automatically within ~2 seconds of the server broadcast, without a refresh.
- While a user is viewing the members dialog for a project, if another owner adds or removes a member of that project, the member list in the dialog updates automatically within ~2 seconds, without a refresh.
- When a user navigates to the board view for a specific project, the app automatically joins that project's broadcast group so task/column events for that project start reaching this client. When the user navigates away from the board, the app leaves the group so we stop receiving events for a project the user is no longer viewing.
- While a user is viewing a board, if another user moves a task, creates a task, creates a column, or deletes a column for that project, the board view reflects the change automatically within ~2 seconds, without a refresh.
- If the real-time channel is temporarily disconnected (e.g., wifi blip) and then reconnects (this recovery is already handled by #45), any missed events between the drop and the reconnect are allowed to be lost in this issue — a future issue may add a resync-on-reconnect flow. What MUST hold: once reconnected, new events resume landing in state as normal.
- Events for projects the user is not currently interested in (not a member of, or not currently joined to) must not alter the local state. The guard here is that the backend only broadcasts to `project_{projectId}` groups the client has joined, and the client only joins a group when the user is on that project's board.
- Events received for entities the client does not currently have in state (e.g., a `TaskMoved` for a board the user is not viewing, or a `MemberRemoved` for a project whose members dialog is closed) must not crash the app, must not create uncaught errors in the console, and must simply be ignored.

**Expected user flow:**
1. User A and User B are both logged into KanbAI and are both members of Project X.
2. Both users have the dashboard open. User A renames Project X. Within ~2 seconds User B sees the renamed project card update in place — no refresh.
3. User B navigates to Project X's board. The app calls `JoinProjectGroup(X)` on the hub automatically.
4. User A moves a task from column "To Do" to column "In Progress". Within ~2 seconds User B sees that task disappear from "To Do" and appear in "In Progress" on his open board — no refresh. (The visual drag-and-drop itself is #47; this ticket only requires the state-side reconciliation.)
5. User B navigates away from the board back to the dashboard. The app calls `LeaveProjectGroup(X)` so further task-level broadcasts for Project X no longer reach User B.
6. User A deletes Project X. Within ~2 seconds User B's dashboard removes the Project X card — no refresh.

**Out of scope for this issue (belongs elsewhere):**
- Visual drag-and-drop interaction and optimistic updates — #47.
- Introducing a board-level kanban state service populated from the backend (fetching tasks/columns for a project) is out of scope unless it is strictly necessary to deliver the board-event subscriptions above; if the board component is still an empty shell at implementation time, at minimum the `Join` / `Leave` lifecycle and the event-to-state reconciliation hooks must be in place and ready, even if the board UI consuming them is populated in #47.
- Backfilling lost events after a reconnect — future issue.
- Any UI connection-status indicator (the `connectionState` signal exists, but no component needs to render it for this ticket).
- Rewriting `AuthStateService`, `SignalRService`, or `BaseStateService`.

## Milestone Context

**Milestone:** #5 — Real-time UI Updates & Kanban Interaction

**Prerequisite Issues:**
- #45 — Setup SignalR Client Service — **CLOSED**. Delivers `SignalRService` with `on<T>()`, `start()`, `stop()`, and `connectionState`. Without this, there is no event stream to subscribe to.
- Authentication flow (earlier PRs including #60) — **CLOSED**. The hub connection only exists for authenticated users; state reconciliation therefore only runs while authenticated. Already satisfied.
- HTTP CRUD for projects and members (issues #27–#33 era) — **CLOSED**. The state services (`ProjectStateService`, `MembersStateService`) this ticket integrates with already exist and own the canonical local state.

**Downstream Issues (blocked by this one):**
- #47 — Implement Visual Drag-and-Drop (Angular CDK) — **OPEN**. Optimistic drag-and-drop needs a reliable server-confirmation path: when the client-side move completes and the backend broadcasts `TaskMoved`, this ticket's reconciliation logic is what lets the optimistic update be confirmed or corrected without the UI feeling stuck. #47 cannot be delivered cleanly until #46 lands.
- #48 — Document AI Frontend Real-time Logic (`AI_LOGS.md`) — **CLOSED** already per the milestone list, but its contents are expected to describe the flow this ticket introduces.

**Related Work:**
- `docs/handoffs/issue_45_context.md` and `docs/handoffs/issue_45_tech_spec.md` describe the transport layer this issue consumes.
- `.claude/backend_api_map.md` is authoritative for the server event names, payload shapes, and the `JoinProjectGroup` / `LeaveProjectGroup` hub methods. Eight server-to-client events are defined: `ProjectUpdated`, `ProjectDeleted`, `MemberAdded`, `MemberRemoved`, `ColumnCreated`, `ColumnDeleted`, `TaskCreated`, `TaskMoved`. Any event the frontend subscribes to in this issue must match the name and payload in that document.
- The backend explicitly does NOT broadcast `ProjectCreated` (the group for a brand-new project does not yet exist at creation time). A user who just had themselves added to a newly created project will only see it on their next `GET /api/project`. This is a product constraint for this issue: the frontend must not invent a `ProjectCreated` subscriber that silently never fires.
- The board route (`/board`) is a shell today; any board-level state integration this issue needs must be coordinated with whatever #47 introduces, to avoid duplicate state services.

## Acceptance Criteria

- [ ] When a logged-in user is viewing the dashboard and a `ProjectUpdated` event arrives for a project in their local list, the corresponding project card in the UI reflects the updated name/description within 2 seconds of event arrival, without a manual refresh.
- [ ] When a logged-in user is viewing the dashboard and a `ProjectDeleted` event arrives for a project in their local list, that project card disappears from the grid within 2 seconds of event arrival, without a manual refresh.
- [ ] When the members dialog is open for a project and a `MemberAdded` event arrives for that project, the new member appears in the dialog's member list within 2 seconds without closing/reopening the dialog.
- [ ] When the members dialog is open for a project and a `MemberRemoved` event arrives for that project, the removed member is no longer displayed in the dialog's member list within 2 seconds without closing/reopening the dialog.
- [ ] When a user navigates to the board view for a specific project, the SignalR hub method `JoinProjectGroup` is invoked exactly once with that project's id, verifiable in the browser DevTools WebSocket frames panel; when the user navigates away from the board, `LeaveProjectGroup` is invoked exactly once with the same project id.
- [ ] When a user is on a board and a `TaskMoved` event arrives for the currently viewed project, the referenced task's column and order reflect the event payload within 2 seconds without a refresh; if the referenced task is not present in local state, the UI does not throw, does not log an uncaught error, and continues to function.
- [ ] When a user is on a board and a `TaskCreated` event arrives for the currently viewed project, the new task appears in its column within 2 seconds without a refresh.
- [ ] When a user is on a board and a `ColumnCreated` event arrives for the currently viewed project, the new column appears in the board within 2 seconds without a refresh.
- [ ] When a user is on a board and a `ColumnDeleted` event arrives for the currently viewed project, the referenced column is removed from the board within 2 seconds without a refresh.
- [ ] Events received for a project the client has not joined (e.g., stale group membership after a reconnect, or any event for an unrelated project) do not mutate local state and do not produce uncaught errors in the browser console.
- [ ] An event whose payload references an entity not currently present in local state (e.g., `MemberRemoved` for a user not in the local member list, `TaskMoved` for an unknown task id) is silently ignored — the UI does not throw, the console has no uncaught error, and the operation is a no-op against local state.
- [ ] When the user logs out, subscriptions the app holds on `SignalRService.on(...)` are torn down in the same logout cycle, verifiable by the absence of post-logout subscriber activity; this is satisfied once `SignalRService.stop()` has completed (already contracted by #45) and no downstream consumer attempts to continue reading from stale event streams.
- [ ] No payload field, no JWT, and no user id is written to `console.log` by any event handler introduced in this issue, in keeping with the project's logging/privacy standard.
- [ ] `npm run build` completes successfully with the new event integration in place.
- [ ] `npm run test -- --watch=false` runs to completion; any test failures tied to the newly introduced event handlers are fixed before the issue is considered done (pre-existing failures unrelated to real-time state integration are documented, not fixed, per project policy).

### Quality Gate Check

Each criterion above has been reviewed for:
- **Observable:** every item can be verified either in the browser (DevTools Console, DevTools WebSocket-frames panel, visible UI changes on a dashboard / members dialog / board) or via build/test command exit status. No criterion depends on internal framework state invisible to QA.
- **Specific:** concrete events (by the exact name in `backend_api_map.md`), concrete surfaces (dashboard card, members dialog row, board column), and concrete latency bound (within 2 seconds of event arrival) are named; no vague terms like "responsive" or "smooth".
- **Testable:** QA can drive each scenario deterministically by using two browser sessions (or triggering backend mutations via the API), asserting on a visible outcome and on the absence of console errors.

---

*"The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification."*
