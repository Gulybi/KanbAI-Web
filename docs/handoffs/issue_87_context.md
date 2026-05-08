# Feature: Hydrate tasks on board entry so refresh / cold-navigate no longer shows an empty board

**GitHub Issue:** [#87](https://github.com/Gulybi/KanbAI-Web/issues/87)
**Milestone:** _none_ (unassigned)
**Labels:** `bug`
**Repository:** Gulybi/KanbAI-Web
**Assignee:** @Gulybi
**Severity:** Major — the product's single most confidence-eroding behaviour. Today every cold entry to a project board renders zero tasks regardless of how many exist in the database. Data is intact server-side; the UI simply never asks for it. The fix closes the "tasks disappear on F5" class of reports and unlocks every future task-level read (descriptions shipped in [#85](https://github.com/Gulybi/KanbAI-Web/pull/85), plus due dates, assignees, labels, comments).

---

## Business Value

### Who is this for?
- **Every authenticated user who opens, refreshes, or returns to a project board.** Today the board is blank after every hard refresh regardless of how many tasks the DB holds. The user's mental model — "my work persists" — is violated every single time they press F5.
- **Users collaborating on a shared board.** A teammate's pre-existing tasks are invisible until the teammate creates, moves, or edits one while you are watching the board. Real-time collaboration is nominally wired (SignalR `TaskCreated` / `TaskMoved` / `TaskUpdated`), but only for ongoing activity — anything persisted before the current session is hidden.
- **Users of the description render / edit feature shipped in [#85](https://github.com/Gulybi/KanbAI-Web/pull/85).** Descriptions already round-trip end-to-end on the backend (`PUT /api/task/{taskId}/description` and `DELETE /api/task/{taskId}/description`, with `TaskUpdated` broadcast per [`backend_api_map.md` lines 95 and 165](../../.claude/backend_api_map.md)). But a user cannot see a description that was saved before their current session because the task itself is not in local state. #85 appears broken in practice until #87 ships.
- **Every future task-level read** — due dates, assignees UI, labels, comments, priority. All of these depend on a hydration pattern existing for tasks. Shipping that pattern once cleanly saves repeating the same logic per-field.
- **QA and support.** "Tasks disappear after refresh" is the kind of symptom that generates high-signal support noise because users cannot distinguish "the DB lost my work" from "the UI didn't ask for my work". Fixing it removes a large class of tickets.

### Why is it valuable?
- **Closes the persistence illusion.** The single most confidence-eroding behaviour in the product — "tasks disappear on refresh" — is removed by one fetch call on board entry.
- **Unlocks [#85](https://github.com/Gulybi/KanbAI-Web/pull/85) in practice.** Today that feature only observes descriptions for tasks that happened to enter local state during the current session. After #87, descriptions survive refresh because the tasks that host them survive refresh.
- **Establishes the hydration pattern** every future task-level read will reuse. Shipping this once cleanly is cheaper than retrofitting hydration per-field later.
- **Achieves symmetry with `loadColumns`.** The board already hydrates columns on mount via `GET /api/column/project/{projectId}`; tasks are the conspicuously missing half of the same chassis.
- **Reduces user-facing error surface.** Today users see an empty board and cannot tell whether they are waiting on network, hitting a bug, or genuinely have no tasks. Post-fix the board is either populated, clearly empty, or clearly errored with a retry path — no ambiguous states.

### What problem does it solve?

**Reproduction on `main` today:**

1. Sign in, open a project board, create several tasks via the per-column "Add task" flow ([#78](https://github.com/Gulybi/KanbAI-Web/issues/78)).
2. Tasks render (optimistic local apply + `TaskCreated` SignalR echo).
3. Refresh the browser (F5) — or navigate to the dashboard and back to `/projects/{projectId}`.
4. Columns render. **Every column is empty.** DevTools → Network shows `GET /api/column/project/{projectId}` firing; no task-read request is ever issued.
5. If a teammate creates a task while you remain on the board, it appears via SignalR. Historical tasks stay invisible until a `TaskMoved` or `TaskUpdated` event re-delivers them one at a time.

**Root-cause observations (three file-level facts verified against `main`):**

- [`board-page.component.ts:182-189`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L182-L189) — `ngOnInit` calls `boardState.enterBoard(projectId)` (which resets `tasksByColumnId: {}` — see [`board-state.service.ts:112-119`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L112-L119)) and `loadColumns(projectId)`. There is no `loadTasks(projectId)`.
- [`tasks-api.service.ts:19-68`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L19-L68) — `TasksApiService` exposes only `moveTask` and `createTask`. No `getTasksForProject` / `getTasksForColumn`.
- [`board-state.service.ts:373-387`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L373-L387) — `BoardStateService.setColumns(projectId, columns)` exists for columns. No `setTasks(projectId, tasks)` counterpart.

**Backend gap (BLOCKING):** [`backend_api_map.md:89-96`](../../.claude/backend_api_map.md) documents Tasks as only `POST /api/task/column/{columnId}`, `PUT /api/task/{taskId}/move`, `PUT /api/task/{taskId}/description`, `DELETE /api/task/{taskId}/description`. **There is no `GET` verb on any task route.** This frontend ticket cannot merge until a backend task-read endpoint ships. The ticket MUST NOT invent a URL.

---

## Current State vs Desired State

### Current State (behaviour today on `main`)

- **`BoardPageComponent.ngOnInit` at [`board-page.component.ts:182-189`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L182-L189) hydrates columns only.** It calls `boardState.enterBoard(projectId)` and `loadColumns(projectId)`. No task-read is issued.
- **`BoardStateService.enterBoard` at [`board-state.service.ts:112-119`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L112-L119) resets `tasksByColumnId` to `{}` on every entry.** Any tasks left over from a previous board view are explicitly wiped, so there is no stale-data fallback to mask the missing read.
- **`TasksApiService` at [`tasks-api.service.ts:19-68`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L19-L68) has no read method.** Only `moveTask` (`PUT /api/task/{taskId}/move`) and `createTask` (`POST /api/task/column/{columnId}`) are defined.
- **`BoardStateService` has no bulk-task reconciler.** There is no `setTasks(projectId, tasks)` counterpart to the `setColumns` that exists at [`:373-387`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L373-L387).
- **Every path that deposits tasks in local state is event- or response-driven and runs only for ongoing activity:**
  - `onTaskCreated` SignalR handler at [`board-state.service.ts:216-228`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L216-L228) — fires only for creates that happen after the client connects.
  - `onTaskMoved` SignalR handler at [`:265-296`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L265-L296) — a `TaskMoved` for an id not in state is a no-op at [`:272`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L272), so historical tasks arrive one at a time only when moved.
  - `applyCreatedTask` HTTP-success path at [`:346-358`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L346-L358) — fires only on the local user's own create.
  - `TaskUpdated` SignalR handler (wired or to-be-wired for [#85](https://github.com/Gulybi/KanbAI-Web/pull/85)) mutates existing bucket entries in place, but cannot plant a task that never entered state.
  - **None of these fire on cold board entry.**
- **Consequence for [#85](https://github.com/Gulybi/KanbAI-Web/pull/85):** descriptions round-trip end-to-end on the backend, but users cannot see a description saved by another user (or by themselves in a previous session) because the task itself is absent from local state on refresh.
- **Existing tests assume the "columns-only hydrate" shape.** `board-page.component.spec.ts` and `board-state.service.spec.ts` do not test for a task-read on mount (because none fires). Updating these specs is part of the fix.
- **No backend `GET` endpoint exists for tasks.** Shipping the frontend against an invented URL would immediately regress on contract.

### Desired State

Once a backend task-read endpoint ships (recommended shape: `GET /api/task/project/{projectId}` → `ApiResponse<List<TaskResponseDto>>`, sorted ascending by `taskOrder` within each `columnId`, with the same auth / envelope semantics as the existing Tasks controllers), the frontend behaves as follows. **The exact URL, verb, and response shape MUST match whatever the backend ticket ships — this ticket MUST NOT invent a URL.**

- **Every cold board entry (refresh, first visit, or navigate-back) issues exactly one task-read request** after columns load. On success, every task the backend returns is bucketed by `columnId`, sorted ascending by `taskOrder`, and rendered in the correct column.
- **Task-read error surfaces as an inline error strip above the columns with a Retry action.** Columns remain visible. No full-board spinner. Status codes, URLs, and stack traces never leak to copy. The strip is NOT auto-dismissed — the board is unusable without tasks, so persistence is correct (do not mimic the auto-dismiss `moveError` pattern at [`board-page.component.ts:504-521`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L504-L521)).
- **Retry re-issues the task-read and clears the error on success.**
- **An empty project (columns exist, zero tasks) renders without an error strip** — each column shows its existing empty-state copy as it does today.
- **Stale-navigation is safe.** Opening project A and immediately switching to B while A's task-read is in flight does NOT plant A's tasks onto B's board. (The guard mirrors `setColumns`'s current-project check at [`:374`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L374).)
- **Orphaned tasks are dropped.** A task whose `columnId` is not in the current column set (e.g. the column was deleted between fetches) is NOT rendered. Same allowed-ids filter shape as `setColumns` at [`:378-385`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L378-L385).
- **Hydration and SignalR coexist without duplicates or lost tasks.**
  - `TaskCreated` for an id already present is deduped by the existing id check at [`:247-249`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L247-L249).
  - `TaskMoved` for an id not yet in local state is already a no-op; subsequent hydration plants the task at its post-move position.
  - `TaskUpdated` (description edit / clear per [`backend_api_map.md:165`](../../.claude/backend_api_map.md) and [`:176`](../../.claude/backend_api_map.md)) reconciles `content` by `id` with `null` treated as "cleared". If the handler is not yet wired in state on the merge branch, #87 wires it; if already wired, no change needed.
- **[#85](https://github.com/Gulybi/KanbAI-Web/pull/85) works end-to-end across sessions.** User A saves a description → user B refreshes → opens the task in the drawer → sees the description.
- **A polite live-region announces successful hydration** with the count of tasks and columns. Error strip is announced via its ARIA role.
- **Response copy for task-read failures (verbatim strings required):**
  - status `0` → `"We couldn't reach the server. Please check your connection and try again."`
  - status `401` → `"Your session has expired. Please sign in again."`
  - status `403` → `"You are no longer a member of this project."`
  - status `404` → `"This project no longer exists."`
  - status `>= 500` → `"Something went wrong on our end. Please try again in a moment."`
  - default → `"We couldn't load this board. Please try again."`

#### In-scope user flows

1. **Cold refresh.** Refresh on `/projects/{projectId}` → columns load → tasks load → every DB-persisted task renders in the correct column and in `taskOrder` ascending.
2. **Navigate away and back.** Dashboard → back to the same project → tasks appear.
3. **Empty project.** Columns exist, zero tasks → columns render with their existing empty-states, no error strip.
4. **Network failure on task load.** Columns load; task GET returns `0` / `4xx` / `5xx` / envelope `success: false` → error strip with Retry renders above columns; columns remain visible; buckets show their existing empty-state.
5. **Stale hydration during navigation.** Open project A, immediately switch to B → A's tasks do not plant onto B (stale-id guard mirrors `setColumns`).
6. **Concurrent SignalR during hydration.** Teammate creates / moves / edits a task while the initial task GET is in flight → no duplicates (id dedupe), no lost tasks (hydration is authoritative for initial state; SignalR handles deltas).
7. **Description read / edit across refresh.** User A saves a description via `PUT /api/task/{taskId}/description`; user B refreshes → opens the task in the drawer → sees the description, confirming [#85](https://github.com/Gulybi/KanbAI-Web/pull/85) works end-to-end.
8. **Retry after transient failure.** Task GET fails with 500 → error strip appears → user clicks Retry → task GET succeeds → error clears, tasks render.

#### Out of scope for this ticket

- **Task delete.** No `DELETE /api/task/{taskId}` endpoint exists ([`backend_api_map.md:178`](../../.claude/backend_api_map.md) still flags `TaskDeleted` as not implemented). Separate ticket.
- **Pre-embedded assignee / member details.** `TaskResponseDto.assignedId` is a GUID only ([`backend_api_map.md:302`](../../.claude/backend_api_map.md)). Enriching with display name / avatar is a separate ticket tied to assignment UI.
- **Pagination / virtualization.** Out of scope for MVP; revisit if boards grow beyond a few hundred tasks.
- **Prefetching on dashboard hover.** Out of scope.
- **Offline cache / optimistic hydration from last-known state.** Out of scope.
- **Task-card rendering changes.** Card layout unchanged; hydration only.
- **Backend changes.** Zero backend modifications in this ticket. The backend prerequisite is a separate ticket filed by the backend team.
- **Changing the "Add task" / "Add column" flows.** Untouched.
- **A loading skeleton inside each column while the task-read is in flight.** Degrading to the existing empty-state render is acceptable for MVP; skeleton is a design-spec decision, not a product decision.

---

## Milestone Context

**Milestone:** unassigned on the GitHub issue. This ticket is the missing hydration half of the board-entry chassis introduced by [#46](https://github.com/Gulybi/KanbAI-Web/issues/46) / [#47](https://github.com/Gulybi/KanbAI-Web/issues/47) and a hard prerequisite for every future task-level read.

### Prerequisite — BLOCKING, not yet filed

- **Backend ticket: task-read endpoint.** Recommended `GET /api/task/project/{projectId}` → `ApiResponse<List<TaskResponseDto>>`, sorted ascending by `taskOrder` within each `columnId`, with auth errors consistent with the existing Tasks controllers (including the 401 claims-rejection flavour at [`backend_api_map.md:67`](../../.claude/backend_api_map.md)). This must exist before #87 can merge. This ticket MUST NOT ship against an invented URL. If the backend ships a different shape (per-column endpoint, different envelope), the frontend conforms to whatever ships.

### Prerequisite — already shipped

- [#46](https://github.com/Gulybi/KanbAI-Web/issues/46) / [#47](https://github.com/Gulybi/KanbAI-Web/issues/47) — `BoardStateService`, `enterBoard`, `setColumns`, SignalR wiring for `TaskCreated` / `TaskMoved` / column events. #87 adds `setTasks` to this chassis.
- [#77](https://github.com/Gulybi/KanbAI-Web/issues/77) / [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) — add-column / add-task flows that produce the tasks this ticket must later surface on refresh.
- [#85](https://github.com/Gulybi/KanbAI-Web/pull/85) — description render / edit in the task-detail drawer. Works end-to-end across sessions only after #87 ships.
- [#86](https://github.com/Gulybi/KanbAI-Web/issues/86) / [#88](https://github.com/Gulybi/KanbAI-Web/pull/88) — interceptor 401 logout + redirect. #87's 401 handling inherits that chassis — the feature-layer 401 copy is defensive only, because the interceptor will have already navigated to `/login` by the time the inline strip would render.

### Backend Prerequisite

**Required.** A `GET` endpoint returning tasks for a project. Shape / URL / verb per the backend team's ticket. This ticket cannot ship until that endpoint exists. If `#87` enters staff-engineer review before the backend ticket is filed, it is blocked and should be labelled accordingly.

### Downstream Issues

- **Every future task-read feature.** Due dates on the card, labels, assignees display, task-card description preview (follow-up to [#83](https://github.com/Gulybi/KanbAI-Web/issues/83)), comments, priority — all depend on hydration existing.
- **Potential follow-up: pagination / virtualization** if boards grow beyond a few hundred tasks.
- **Potential follow-up: task-card description preview on the board.**
- **Potential follow-up: offline cache / last-known-state fallback** for perceived-latency improvements on repeat visits.

### Related Work / Open Assumptions

- **Scope is frontend-only** inside [`KanbAI-Web/src/app/features/board/`](../../KanbAI-Web/src/app/features/board/). Specifically: `tasks-api.service.ts`, `board-state.service.ts`, `board-page.component.ts`, and their spec files. No backend, no design-system, no npm dependency changes.
- **Backend contract is authoritative.** If the backend ticket ships with a different URL or envelope than the recommended `GET /api/task/project/{projectId}`, the frontend conforms. The tech spec writes the frontend against what the backend actually ships.
- **SignalR handler behaviour does not change** beyond (optionally) wiring `TaskUpdated` if not already wired. Dedupe / project-guard / allowed-ids semantics stay as-is.
- **`setTasks` is authoritative for initial state.** It replaces `tasksByColumnId` atomically — it does NOT merge with pre-existing buckets. This is intentional so a late-arriving hydration never doubles up with optimistic local state from a previous session.
- **The `mapTaskListErrorToUserMessage` function mirrors the style of `mapTaskMoveErrorToUserMessage` / `mapTaskCreateErrorToUserMessage` at [`tasks-api.service.ts:75-132`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L75-L132).** Verbatim strings are frozen below in Desired State.
- **The `401` mapping is defensive** — in practice the global interceptor ([#86](https://github.com/Gulybi/KanbAI-Web/issues/86) / [#88](https://github.com/Gulybi/KanbAI-Web/pull/88)) forces logout + redirect before the feature-layer branch can render. The string is kept for symmetry with the existing mappers.

---

## Acceptance Criteria

> Every criterion below is observable in the UI, specific to #87, and testable by a human QA pass or a unit/component test. Where the source issue specifies verbatim copy, that copy is preserved.

### Functional — hydration (primary acceptance)

- [ ] **AC1 — Cold refresh hydrates tasks.** Opening, refreshing, or navigating back to a project board hydrates every task the backend returns, bucketed by `columnId` and sorted ascending by `taskOrder`. (QA: create 3 tasks across 2 columns, refresh, all 3 render in the correct columns and in the same order as before the refresh.)
- [ ] **AC2 — Exactly one task-read per board entry.** A cold refresh issues exactly one task-read HTTP request. (QA: DevTools → Network filtered to the task-read URL shows exactly one call per navigation; repeated refreshes each show exactly one call.)
- [ ] **AC3 — Empty project renders cleanly.** A project with columns but zero tasks renders with the existing per-column empty-state copy and no error strip. (QA: create a project with two columns and no tasks, refresh, confirm no error strip.)
- [ ] **AC4 — Parity across refresh.** A project with columns and tasks renders identically before and after refresh — same count per column, same order, same titles, same descriptions. This confirms [#85](https://github.com/Gulybi/KanbAI-Web/pull/85) works across sessions. (QA: populate a board, refresh, compare card-by-card.)
- [ ] **AC5 — Orphaned tasks dropped.** A task returned by the backend whose `columnId` is not in the current column set (e.g. the column was deleted between fetches) is NOT rendered. The rest of the board is unaffected. (Unit: feed `setTasks` a task with an unknown `columnId`, assert it is filtered out.)
- [ ] **AC6 — Stale-navigation guard.** Navigating from project A to B while A's task-read is in flight does NOT plant A's tasks onto B. (Unit: drive `setTasks(projectIdA, tasks)` after `enterBoard(projectIdB)`, assert no mutation; QA: toggle between two projects rapidly, confirm each board only shows its own tasks.)

### Functional — SignalR coexistence

- [ ] **AC7 — `TaskCreated` dedupe after hydration.** A `TaskCreated` SignalR event arriving for a task id already present after hydration does not double-render. (Unit: hydrate task id X, dispatch `TaskCreated` for X, assert exactly one entry in the bucket.)
- [ ] **AC8 — `TaskMoved` pre-hydration is a no-op.** A `TaskMoved` for an unknown id during hydration is a no-op; subsequent hydration plants the task at its post-move position. (Unit.)
- [ ] **AC9 — `TaskUpdated` reconciles by id.** A `TaskUpdated` event arriving during or after hydration reconciles `content` by `id`, with `null` treated as "cleared" (per [`backend_api_map.md:176`](../../.claude/backend_api_map.md)). No duplicate render, no lost update.

### Error & Loading UX

- [ ] **AC10 — Task-read failure renders an inline error strip with Retry.** A failed task-read (status `0` / `4xx` / `5xx` / envelope `success: false`) renders an inline error strip above the columns with a **Retry** action. No status codes, URLs, or stack traces leak in the copy. (QA: stub each failure mode, confirm the strip.)
- [ ] **AC11 — Retry re-issues the task-read.** Clicking Retry issues a fresh task-read. On success, the strip clears and tasks render. On failure, the strip stays and the user can retry again. (QA + Unit.)
- [ ] **AC12 — Columns render immediately even while task-read is in flight.** No full-board spinner. The task region updates when the task response lands. Task buckets may show their existing empty-state render while the task-read is pending. (QA: throttle network, confirm columns appear before tasks.)
- [ ] **AC13 — Error strip is persistent, not auto-dismissed.** The error strip does NOT auto-dismiss. It clears only on a successful Retry or on navigation away. (Regression guard against copying the `moveError` auto-dismiss behaviour at [`board-page.component.ts:504-521`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L504-L521).)
- [ ] **AC14 — 401 on task-read produces only the mapped copy.** A 401 during the task-read does not produce UI copy beyond the mapped string `"Your session has expired. Please sign in again."` The global auth interceptor ([#86](https://github.com/Gulybi/KanbAI-Web/issues/86) / [#88](https://github.com/Gulybi/KanbAI-Web/pull/88)) owns the redirect; the feature-layer copy is defensive only. (QA: force 401, confirm redirect-to-login fires; the inline copy may never visibly render in practice.)

### Accessibility

- [ ] **AC15 — Successful hydration is announced politely.** On successful hydration of a non-empty board, a polite ARIA live-region announces `"Board loaded with N tasks across M columns."` (Reuse of the existing `dragAnnouncement` region or a dedicated new region is a tech-spec decision.)
- [ ] **AC16 — Error strip is announced via its ARIA role.** The task-load error strip is announced by assistive technology with the same ARIA pattern as the existing `moveError` region.
- [ ] **AC17 — Keyboard flow unchanged.** Existing keyboard navigation — column headers → task cards → add-task input → trailing "Add column" — is not regressed. (QA: tab through a populated board post-fix, confirm tab order identical to pre-fix.)

### No regressions

- [ ] **AC18 — Optimistic create unchanged.** Optimistic local apply on `createTask` ([`board-state.service.ts:346-358`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L346-L358)) works identically. (QA: create a task on a hydrated board, confirm instant render and no double entry after the SignalR echo.)
- [ ] **AC19 — Drag-and-drop move unchanged.** Optimistic apply + server reconcile + rollback-on-error all behave identically to pre-fix. (QA: drag a hydrated task between columns; drag a hydrated task with the backend stubbed to 500, confirm rollback.)
- [ ] **AC20 — Column SignalR unchanged.** `ColumnCreated` / `ColumnDeleted` continue to dedupe and filter correctly against hydrated task state.
- [ ] **AC21 — Attachments unchanged.** Attachment upload / list / download / delete flows in the task-detail drawer are untouched by this ticket.
- [ ] **AC22 — Description render / edit works across refresh.** Saving a description, refreshing the browser, reopening the task surfaces the saved description (end-to-end regression for [#85](https://github.com/Gulybi/KanbAI-Web/pull/85)).

### Error copy — verbatim strings (mapped in `mapTaskListErrorToUserMessage`)

- [ ] **AC23 — Status `0` copy.** `"We couldn't reach the server. Please check your connection and try again."`
- [ ] **AC24 — Status `401` copy.** `"Your session has expired. Please sign in again."`
- [ ] **AC25 — Status `403` copy.** `"You are no longer a member of this project."`
- [ ] **AC26 — Status `404` copy.** `"This project no longer exists."`
- [ ] **AC27 — Status `>= 500` copy.** `"Something went wrong on our end. Please try again in a moment."`
- [ ] **AC28 — Default fallback copy.** `"We couldn't load this board. Please try again."`

### Test coverage

- [ ] **AC29 — `TasksApiService.getTasksForProject` unit tests.** Happy-path unwrap; `success: false` throws; `data == null` throws; correct URL with URL-encoded `projectId`; correct HTTP verb. (Unit.)
- [ ] **AC30 — `mapTaskListErrorToUserMessage` unit tests.** Verbatim string returned per status code — covers `0`, `401`, `403`, `404`, `500`, and default. (Unit.)
- [ ] **AC31 — `BoardStateService.setTasks` unit tests.** (a) stale project-id guard no-ops, (b) allowed-ids filter drops orphaned tasks, (c) bucketing by `columnId`, (d) sort by `taskOrder` ascending, (e) `BoardTask` projection drops `createdAt` / `updatedAt`, (f) atomic replace (no merge with pre-existing buckets). (Unit.)
- [ ] **AC32 — `BoardPageComponent.ngOnInit` component test.** Asserts `loadColumns` resolves before `loadTasks` fires; asserts `setTasks` receives the projected DTOs; asserts error strip renders on task-read failure; asserts Retry re-issues the request. (Component.)
- [ ] **AC33 — No INTRODUCED test failures.** `npm run test -- --watch=false` reports zero INTRODUCED failures versus `main` (classification per [`CLAUDE.md`](../../CLAUDE.md)). Existing `tasks-api.service.spec.ts`, `board-state.service.spec.ts`, and `board-page.component.spec.ts` continue to pass with no new failures.

### Verification

- [ ] **AC34 — Build passes.** `npm run build` succeeds with no new errors or warnings.
- [ ] **AC35 — Manual QA of all eight in-scope flows.** Flows 1–8 from the "In-scope user flows" section are manually exercised in a real browser, with and without network throttling. The PR description records the results.

---

*Blocked on the backend task-read endpoint. Hand this to the staff-engineer agent once the backend ships — or file the frontend ticket as `blocked-by: <backend-issue>` and let the backend team unblock it.*

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
