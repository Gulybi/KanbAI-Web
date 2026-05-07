# Feature: Add "New Column" button to board view so users can create columns from an empty board

**GitHub Issue:** [#77](https://github.com/Gulybi/KanbAI-Web/issues/77)
**Milestone:** _none_ (unassigned)
**Labels:** `bug`
**Repository:** Gulybi/KanbAI-Web
**Severity:** Major — any project with zero columns is unusable; users cannot evolve a project's column structure after creation.

---

## Business Value

### Who is this for?
- **Authenticated KanbAI users** who land on a project board that has zero columns — either because all columns were deleted server-side (a path reachable only via direct backend API today, but a valid data shape the UI must tolerate) or because a project was created through any future path that does not pre-populate columns. Today these users see a blank white content area with no affordance to recover.
- **All users on populated boards** who, post-creation, realise they need another column (e.g. add a "Blocked" lane to a flow that began as "To Do / In Progress / Done", or split "In Progress" into "In Progress / In Review"). Today they have no in-app way to do this: column creation lives exclusively in the create-project dialog from [#70](https://github.com/Gulybi/KanbAI-Web/issues/70), which has no influence over existing projects.
- **Team leads whose process evolves over time.** Kanban columns are not static — teams discover they need new states as their workflow matures. A board that can only have its columns set at birth is unusable for real-world teams.
- **Downstream of [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) (task creation on board):** a user cannot create tasks without at least one column to put them in. Any empty-board state therefore permanently blocks #78's workflow until #77 is resolved.

### Why is it valuable?
Issue #70 shipped column creation *at project-creation time only*. The board view itself has no column-management surface. This produces three concrete failure modes:

1. **Blank board on entry, no recovery.** A project with zero columns renders as an empty column strip inside [`board-page.component.html:51-64`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L51-L64). There is no empty-state panel, no call-to-action, no help text — just visual whitespace. A user seeing this for the first time has no way to understand what is wrong or what to do, and no control to do anything about it. From the user's perspective the app has silently broken.
2. **No "add column" affordance on populated boards.** The board page renders a `@for` loop of existing columns and nothing else — no trailing "+ Add column" button, no empty slot, no header action. Even a fully functional board has no in-app path to evolve its column structure. Users who want to add a column to an existing project have no choice but to create a new project from scratch with the column set they want.
3. **Downstream features blocked.** Issue #78 adds "New Task" buttons to each column — but tasks live *inside* columns, so an empty-column board has no place to host the #78 control. Without #77, users on an empty board cannot create tasks regardless of what #78 ships.

Fixing #77:
- **Restores the primary promise of the board UI** — that it is a live, editable representation of the team's workflow. A Kanban board that can't evolve its columns after creation is just a read-only report with drag-and-drop.
- **Completes the column CRUD story for the in-app surface.** #70 shipped create-at-project-creation; a future ticket will ship delete/rename; #77 is the foundational "add column on an existing board" that both extends #70 and is a prerequisite for those edit flows.
- **Unblocks #78 and any future task-creation flow.** A board with at least one column is a hard prerequisite for in-board task creation.
- **Resolves an accidental product regression from #70's shape.** When #70 introduced the idea that a project always ships with columns, it implicitly made "zero columns" a never-in-practice state. But nothing in the data model prevents it (backend `POST /api/project` still creates a project shell with zero columns, [#70](./issue_70_context.md) layers column creation on top via N sequential POSTs, and the partial-failure path can leave a project with fewer columns than intended). Any state the data model permits, the UI must handle gracefully.

### What problem does it solve?
Concretely:
1. **Zero-column empty state.** Today the `@else` branch in [`board-page.component.html:50-65`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L50-L65) renders `<div class="board-page__columns" cdkDropListGroup>` with zero children — a literal empty flex container. There is no empty-state panel, no header, no button. #77 introduces a visible, descriptive empty-state with a primary "Add column" action.
2. **Missing "+ Add column" on populated boards.** The template has no trailing slot after the column loop. #77 adds a persistent affordance at the end of the column strip (matching the Trello/Jira pattern the issue body cites) so that users on any board — empty or populated — have a one-click path to add a column.
3. **No client-side column-create flow.** `ColumnsApiService.createColumn` already exists ([`columns-api.service.ts:65-80`](../../KanbAI-Web/src/app/features/board/services/columns-api.service.ts#L65-L80), added by #70) and posts to `POST /api/column/project/{projectId}`. But it is currently invoked only by `ProjectCreationService.createProjectWithColumns` during new-project creation. The board page ([`board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts)) has no handler or UI that calls this service. #77 wires the existing service into a new board-scope create-column flow.
4. **SignalR already broadcasts column creation but the UI has no authored path to trigger it.** [`BoardStateService.onColumnCreated`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L151-L170) already handles the `ColumnCreated` realtime event and appends columns to local state in sorted order — meaning the reconciliation plumbing for "a column just got created somewhere" already works. #77 needs only to (a) give the user a way to initiate the creation locally and (b) ensure the resulting column appears on the board (either via optimistic insert + HTTP reconcile, or via waiting for the SignalR echo — a tech-spec decision). The state machine is ready; the authoring UI is missing.

---

## Current State vs Desired State

### Current State
- **Board page template has no "Add column" affordance.** [`board-page.component.html`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html) renders only existing columns in a `cdkDropListGroup` and never renders an add-column control. When `columns().length === 0`, the container is visually empty (no text, no button, no illustration) — the page shows only the header and move-error strip, if any. The `columnLoadError` branch at lines 40-49 renders only when a load failure occurs AND columns are still empty; a successful load that returns zero columns falls through to the empty `@else` branch.
- **Board page TypeScript has no `addColumn()` handler.** [`board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts) imports `ColumnsApiService` for the *list* operation only; `createColumn` is untouched. There is no signal tracking in-flight column creation, no form model for a pending column name, no error signal dedicated to column-create failure.
- **`ColumnsApiService.createColumn` exists and is tested.** The service method at [`columns-api.service.ts:65-80`](../../KanbAI-Web/src/app/features/board/services/columns-api.service.ts#L65-L80) posts `CreateColumnDto { name, colorCode?, columnOrder? }` and returns the `ColumnResponseDto`. The error-mapping helper `mapColumnErrorToUserMessage(error, 'create')` at lines 91-121 already handles the `'create'` operation (shipped with #70) — including 401/403, 404, 5xx, network, and generic 4xx copy.
- **`BoardStateService.onColumnCreated` handles the realtime echo.** When the server broadcasts `ColumnCreated` via SignalR, [`board-state.service.ts:151-170`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L151-L170) appends the column to local state if (a) it belongs to the current project and (b) is not already present (id-based dedupe). The insert is sorted by `columnOrder` ascending. This means a client can safely trigger a create, let the SignalR echo populate state, and trust the result — but it can also optimistically add the column locally; either pattern is compatible with the existing reconciliation.
- **The create-project dialog's column-draft list is the closest UX reference.** [`column-draft-list.component.ts`](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.ts) (shipped in #70) defines validation patterns for column names (non-empty, ≤100 chars, case-insensitive-trimmed duplicate detection) that the board-scope create should reuse for consistency. `ColumnDraftFormShape` and `buildColumnDraftGroup` in [`column-draft.model.ts`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/column-draft.model.ts) are the form primitives #70 established; whether #77 reuses them or introduces a leaner single-column form is a tech-spec decision.
- **Behavior today (reproduction from issue body):**
  1. User signs in, opens a project card → `BoardPageComponent` loads at `/board/:projectId`.
  2. Board has zero columns (either because #70 partial-failure left it empty, or because a direct backend column deletion emptied it, or any other path). The `GET /api/column/project/{projectId}` returns `[]`.
  3. Board page renders: header (if any at parent-route level), an empty column strip, and nothing else. The center of the screen is blank white.
  4. User has no affordance to add a column. No button, no placeholder, no CTA, no error. There is no recovery path short of leaving the page.
  5. Same behaviour exists on populated boards: no trailing "+ Add column" button means users cannot extend the column structure they chose at project-creation time.

### Desired State
- **Empty-board state shows a descriptive empty-state panel.** When `columns().length === 0` AND `columnLoadError()` is null (i.e. the load succeeded but returned zero columns), the board page renders an empty-state panel in the main content area with (a) a clear heading or short copy explaining the board has no columns yet, and (b) a primary "Add column" button that is the visual and keyboard focus target.
- **Populated board shows a persistent trailing "+ Add column" affordance.** When `columns().length > 0`, the column strip renders an additional trailing slot — a button, a persistent pill, or equivalent — at the end of the row of columns. Activating it begins the add-column flow (inline input or dialog — design-spec decision) and, on success, appends the new column at the end.
- **Add-column flow opens a minimal input surface.** Activating "Add column" opens an input where the user types the column name. Whether this is an inline input slotted into the trailing affordance, a popover, or a modal dialog is a **design-spec decision**. What this context requires is that the input is keyboard-first, has a visible label or `aria-label`, accepts Enter to submit, Escape to cancel, and shows validation errors inline.
- **Submitting creates the column on the backend and appends it to the board.** On successful submission, the new column appears on the board — with its `columnOrder` larger than any existing column (i.e. inserted at the end). On failure (network, 401, 404, 5xx, generic 4xx), a user-readable error is surfaced near the input/form without closing it, so the user can edit and retry.
- **Newly created column appears immediately with focus moved to its header.** The newly-added column is keyboard-focusable (rendered with a focusable header or name element) and receives focus or announces itself via an `aria-live` region so screen-reader users know the action succeeded.
- **Column order persists across refresh.** Refreshing the board shows the newly-added column at the end of the column strip, with the same `columnOrder` value the backend returned. This is an existing guarantee of `BoardStateService.setColumns` (which sorts by `columnOrder`) — #77 must only ensure it passes a well-formed `columnOrder` on create and respects the server's returned value.
- **Validation matches the create-project dialog's column rules.** The name input applies the same validators used in [`column-draft-list.component.ts`](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.ts): non-empty (after trimming), ≤100 characters, non-duplicate (case-insensitive-trimmed) against the existing columns on the board. Error copy SHOULD mirror #70's copy where possible so users see the same wording in both surfaces.
- **Expected user flows:**
  1. **Empty-board first-add path.** User opens a project with zero columns → the board page renders an empty-state panel with the copy "This board has no columns yet" (or equivalent) and a primary "Add column" button. User clicks it → the input surface appears, user types "To Do", presses Enter → the board transitions from empty-state to a one-column state, the new "To Do" column is visible, and the trailing "+ Add column" affordance is now visible next to it. Focus lands on the new column or the trailing affordance.
  2. **Populated-board add path.** User has a board with "To Do / Doing / Done". User clicks "+ Add column" at the end of the strip → the input appears, user types "Blocked", presses Enter → "Blocked" appears at the end of the strip as the fourth column. The input closes (or clears for rapid re-add — design-spec decision).
  3. **Validation path (empty name).** User activates the add-column flow, leaves the input empty, and presses Enter → the input surfaces an inline error ("Column name is required" or equivalent), the input stays open, no API call is made.
  4. **Validation path (too long).** User types a name longer than 100 characters → inline error ("Column name must be at most 100 characters" or equivalent), submit is blocked, no API call.
  5. **Validation path (duplicate).** User types a name that (after trimming, case-insensitive) matches an existing column on the board → inline error ("A column with this name already exists"), submit is blocked, no API call. This is a **client-side guardrail** — the backend does not enforce uniqueness, but a board with two columns named "Done" is confusing and matches the same guardrail #70 applied to the draft list.
  6. **Cancel path.** User activates the add-column flow, types something, presses Escape or clicks a Cancel affordance → the input closes with no API call, no state change, focus returns to the "Add column" trigger that opened it.
  7. **Network error path.** User types a valid name, presses Enter, the request fails (network / 5xx / etc.) → the input stays open with the typed value populated, an inline error appears explaining the failure in user-readable copy (via the existing `mapColumnErrorToUserMessage(err, 'create')` helper), submit is re-enabled so the user can retry.
  8. **401 during create.** The existing global `authInterceptor` handles redirect to login. The board page does not need to treat this as a board-scope error — standard app-wide auth behavior applies.
  9. **Persistence path.** After any successful create, refreshing the board (`F5`) re-runs the initial columns GET and the new column is still present, in the same position the user saw it.
  10. **Rapid-add path.** User adds three columns back-to-back, each with a unique name → all three appear in the order they were submitted, none are lost, no duplicate API calls are issued, submit is never stuck.
  11. **Concurrent SignalR echo.** Another user (or the current user from a second tab) creates a column on the same board → the SignalR `ColumnCreated` event fires, `BoardStateService.onColumnCreated` appends the column to local state, and the UI reflects it without any action by the current user. The existing AC11 idempotence (dedupe-by-id) means the client's own create + SignalR echo of its own create does not double-insert.

---

## Milestone Context

**Milestone:** _none assigned_ on the GitHub issue. Contextually this extends milestone #5 (Real-time UI Updates & Kanban Interaction) by adding the authoring surface for column creation inside the board, and also slots alongside milestone #4 work on board usability.

### Prerequisite Issues
- [#47](https://github.com/Gulybi/KanbAI-Web/issues/47) — Visual Drag-and-Drop (Angular CDK) — **CLOSED** ✓ (Board page structure, column rendering, CDK drop-list group — the surface #77 extends.)
- [#46](https://github.com/Gulybi/KanbAI-Web/issues/46) — Realtime board events (`ColumnCreated`, etc.) — **CLOSED** ✓ (`BoardStateService.onColumnCreated` already reconciles remote column creation; this ticket relies on that plumbing being correct.)
- [#66](https://github.com/Gulybi/KanbAI-Web/issues/66) — Cannot Open Kanban Board View from Project Dashboard — **CLOSED** ✓ (Users must be able to reach the board to see the new affordance.)
- [#70](https://github.com/Gulybi/KanbAI-Web/issues/70) — Dynamic Column Setup on Project Creation — **CLOSED** ✓ (Introduces `ColumnsApiService.createColumn`, the error-mapping `'create'` branch, the validator patterns in `ColumnDraftListComponent`, and the form primitives in `column-draft.model.ts`. #77 reuses all of this.)
- [#76](https://github.com/Gulybi/KanbAI-Web/issues/76) — Create Project button disabled / NG0950 — **CLOSED** ✓ (Unblocked #70; no direct code dependency for #77 but ensures the column-create pipeline is trustworthy end-to-end.)
- Milestone #3 JWT authentication — **CLOSED** ✓ (bearer token, 401 logout/redirect behavior applies unchanged to the new column-create trigger path.)

### Downstream Issues (unblocked or improved by this one)
- [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) — "No way to create a task from the board — add 'New Task' button on each column" — **OPEN**. #78 needs at least one column to exist on the board to host its "New Task" control; #77 removes the empty-board dead state that would otherwise block #78's flow entirely.
- Future "rename column" / "delete column" inline board UI — not yet filed. #77 establishes the pattern for board-scope column mutations (validator reuse, error copy, focus management, SignalR echo tolerance); those future edit flows will mirror it.
- Future "column menu" (color, archive, etc.) — not filed; #77 does not block these but provides the structural slot (a column header with an action area) that they can attach to.

### Related Work / Open Assumptions
- **Backend is already complete.** `POST /api/column/project/{projectId}` is live and documented ([`.claude/backend_api_map.md:82, 250-256`](../../.claude/backend_api_map.md#L82)); `ColumnsApiService.createColumn` already invokes it. No backend-api-bridge re-scout is required.
- **Transactionality / ordering.** Each column create is its own HTTP call; the backend assigns `columnOrder` either from the client-supplied `columnOrder` (0..N-1 pattern #70 established) or — if the client omits it — auto-increments from the current max. For the single-column add-at-end flow #77 introduces, passing `columnOrder: <current max + 1>` OR omitting it and trusting the backend is a tech-spec decision; the observable requirement is only that the new column appears at the end of the strip. Handling concurrent creates (two users adding simultaneously) is covered by the existing SignalR dedupe-by-id.
- **Validation parity with #70.** The #70 draft list uses case-insensitive-trimmed duplicate detection, 100-char max, required-nonblank. #77 MUST apply the same rules for consistency. The duplicate scope in #77 is the existing columns on the board (not the user's typed history).
- **Error copy re-use.** `mapColumnErrorToUserMessage(err, 'create')` already returns appropriate copy for 401/403/404/5xx/network/generic-4xx. #77 MUST use this helper — not author new copy — so that column-create errors sound identical whether they originate in the create-project dialog or the board.
- **Empty-state vs trailing-button duality.** The issue body explicitly calls for BOTH: an empty-state panel on zero-column boards AND a trailing "+ Add column" affordance on populated boards. This is a superset of the minimal "just a trailing button" pattern; the empty state is the user's only discoverable entry when no columns exist, and the trailing button is the durable affordance once any column is present. Both must be implemented; they are mutually exclusive in render (based on `columns().length`).
- **Focus behaviour on successful add.** The issue body suggests "focus moved to its name input (or to the column itself if created inline)". This is a tech/design-spec decision — inline-edit mode would land focus on the editable name; a no-edit confirmation flow would land focus on the column header or the trailing affordance. This doc requires only that focus does not fall to `<body>` and that screen-reader users are informed of the change via `aria-live`.
- **Inline vs dialog input surface** is a design-spec decision. This doc does not mandate modal vs inline; both are acceptable patterns. Whatever is chosen must be keyboard-operable end-to-end, accessible, and consistent with the app's existing dialog/inline patterns.
- **Drag-and-drop column reorder is out of scope.** The existing board only drag-reorders tasks, not columns. Column reorder after creation is not part of #77 (see explicit out-of-scope below).
- **Mobile/responsive behavior.** The empty-state panel must remain visible on small viewports. The trailing "+ Add column" affordance must remain reachable on small viewports where the column strip may be horizontally scrolled — it should scroll into view with the columns, not be visually orphaned. Specific responsive spec is delivered by the web-designer phase.
- **No new dependencies.** Angular CDK drag-drop (already present), Angular Reactive Forms (already present), the existing `FormInputComponent` (already imported by #70 code), and the existing `ColumnsApiService` (already present) are all that is required. No new npm packages.
- **Test coverage is a hard requirement.** Unit tests for the new handler(s), the empty-state rendering, the trailing-button rendering, the validation paths, and the SignalR echo-on-own-create dedupe must accompany the implementation.

---

## Acceptance Criteria

### Empty-board empty state
- [ ] When the columns GET for a project succeeds but returns zero columns (`columns().length === 0` and `columnLoadError() === null`), the board page renders an empty-state panel in the main content area — visible to sighted users, announced to screen-reader users, and containing a primary "Add column" button. The blank-white-area failure described in the issue body is eliminated.
- [ ] The empty-state panel contains user-readable copy that communicates the board has no columns yet (e.g. "This board has no columns yet — Add your first column" or equivalent wording; exact copy is a design-spec decision but must be present, non-technical, and singular about the next action).
- [ ] The primary "Add column" button in the empty-state panel has a visible label, is keyboard-focusable via Tab, activates on Enter and Space, and has an accessible name that is not just an icon (e.g. `aria-label="Add column"` or visible text).
- [ ] The empty-state panel is NOT rendered when `columnLoadError()` is set — the existing load-error branch at [`board-page.component.html:40-49`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L40-L49) continues to win in that case. The empty-state is specifically the "loaded successfully, zero columns" branch.

### Populated-board trailing "+ Add column" affordance
- [ ] When `columns().length > 0`, a persistent "Add column" affordance is rendered at the trailing end of the column strip (visually after the last `BoardColumnComponent`), inside or adjacent to the `cdkDropListGroup` container — users do not need to scroll elsewhere on the page to find it.
- [ ] The trailing affordance is keyboard-reachable via Tab after the last column's focusable elements (tab order: columns L→R, then trailing add).
- [ ] The trailing affordance is clickable and also activates on Enter/Space when focused.
- [ ] The trailing affordance has a meaningful accessible name (e.g. `aria-label="Add column"` or visible text "+ Add column").
- [ ] When a new column is added (via this affordance or any other path), the trailing affordance remains visible and positioned at the end of the (now longer) column strip.

### Add-column input flow
- [ ] Activating either entry point (empty-state button OR trailing "+ Add column" affordance) opens an input surface where the user can type a column name. Whether this is inline, popover, or dialog is a design-spec decision; both entry points MUST lead to the same input surface semantically.
- [ ] The input surface has an associated `<label>` or `aria-label` so assistive tech announces its purpose (e.g. "Column name").
- [ ] The input accepts Enter to submit and Escape to cancel.
- [ ] The input has an explicit submit affordance (button labelled e.g. "Add" or "Create") and an explicit cancel affordance (button or ✕) — Enter/Escape shortcuts are additive, not a replacement.
- [ ] On open, keyboard focus lands inside the name input automatically within a single render cycle (user can start typing without extra interaction).
- [ ] The input surface displays validation errors inline as the user types (or on blur / on submit-attempt — exact timing is a design-spec decision but errors MUST be visible, non-technical, and adjacent to the field).

### Validation rules (parity with #70)
- [ ] An empty name (zero characters or whitespace-only after trimming) blocks submit and shows a required-field error inline.
- [ ] A name longer than 100 characters blocks submit and shows a "Column name must be at most 100 characters" (or equivalent) error inline.
- [ ] A name that matches (case-insensitive, trimmed) the name of an existing column on the board blocks submit and shows a "A column with this name already exists" (or equivalent) error inline. The comparison is against the current `columns()` signal, not any historical list.
- [ ] While any validation error is active, the submit affordance is disabled (not merely ignored on click) and the input's `aria-invalid="true"` is set so screen readers announce the invalid state.
- [ ] Validation errors clear within a single render cycle once the user's edit resolves them.

### Submission success
- [ ] A valid submit calls `ColumnsApiService.createColumn(projectId, dto)` exactly once per submission. Rapid double-submit (double-click, double-Enter) MUST NOT produce two POSTs.
- [ ] While the submission is in flight, the submit affordance is disabled and the input shows a pending / "Adding…" state so the user understands the system is working.
- [ ] On HTTP 201 success, the new column is visible on the board with the name the user typed, appended at the end of the column strip (`columnOrder` greater than all existing columns).
- [ ] On success, the input surface closes (or clears to accept another column — this is a design-spec decision; both are acceptable as long as the behaviour is consistent and the user is not stranded in a half-open state).
- [ ] On success, keyboard focus moves to a predictable destination — the new column's header, the new column's name, the trailing "+ Add column" affordance, or equivalent — NOT to `<body>`.
- [ ] On success, an `aria-live="polite"` announcement informs screen-reader users of the addition (e.g. "Column 'Blocked' added" or equivalent). The existing `dragAnnouncement` region at [`board-page.component.html:32-38`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L32-L38) MAY be reused or a dedicated region introduced — tech-spec decision.
- [ ] After a successful add, refreshing the page (`F5`) shows the new column in the same position it was displayed post-add.

### Submission error handling
- [ ] On HTTP error of any kind (network/0, 4xx, 5xx, envelope `success: false`), the input surface stays open with the user's typed value preserved and a user-readable error sentence shown inline. The copy MUST come from `mapColumnErrorToUserMessage(err, 'create')` — no new copy is authored.
- [ ] On error, the submit affordance is re-enabled after the failure is surfaced so the user can correct and retry.
- [ ] Error sentences MUST NOT expose HTTP status codes, URLs, stack traces, or backend envelope `errors[]` contents to the UI.
- [ ] On HTTP 401/403, the existing global `authInterceptor` handles redirect; the board page does not need board-scope handling. The component MUST NOT crash or leak subscriptions if the dialog/input is unmounted mid-request during a redirect.
- [ ] On HTTP 404 (project gone), the error copy from `mapColumnErrorToUserMessage` indicates the project no longer exists. The board page does not need to navigate — the user sees the error and can choose to leave.

### SignalR echo idempotence (no regressions to #46)
- [ ] When the client's own create succeeds and the SignalR `ColumnCreated` event for the same column arrives shortly after, the column MUST NOT be double-inserted into local state. The existing dedupe-by-id in [`board-state.service.ts:151-170`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L151-L170) guarantees this at the state-service level — the #77 implementation MUST NOT bypass or duplicate that reconciliation.
- [ ] When another user creates a column on the same board, the `ColumnCreated` event fires and the new column appears in the current user's strip within a single render cycle, without any action by the current user. The trailing "+ Add column" affordance re-positions after the new column. (This is existing behaviour; #77 MUST NOT regress it.)

### Cancel & dismissal
- [ ] Activating Cancel (explicit button, Escape key, or dismissal via click-outside if the surface is a modal/popover) closes the input surface WITHOUT issuing any API call and WITHOUT changing board state.
- [ ] On cancel, keyboard focus returns to the affordance that opened the input (the empty-state "Add column" button or the trailing "+ Add column" button).
- [ ] Re-opening the input after a cancel shows an empty field (no leftover typed text from the cancelled attempt).

### Accessibility
- [ ] All new interactive controls (empty-state button, trailing "+ Add column" affordance, input, submit button, cancel button) have accessible names, are keyboard-focusable, and operable with Enter and Space (buttons) / Enter and Escape (input).
- [ ] Tab order through the board is logical: existing columns L→R → trailing "+ Add column" → (input controls when open) → other page elements.
- [ ] Validation errors are announced to assistive tech via `aria-invalid` on the field + an `aria-describedby` (or equivalent `aria-live` region) that references the error message.
- [ ] Successful column addition is announced to assistive tech via `aria-live="polite"` within a single render cycle of the column appearing.
- [ ] The empty-state panel, when rendered, is announced clearly to screen readers (the heading is an appropriate heading level; the primary action is in the focus order).
- [ ] The board page, in both empty-state and populated-with-add-affordance modes, passes `axe-core` with zero critical or serious violations.
- [ ] Color contrast on all new text, button backgrounds, placeholders, and error text meets WCAG AA (4.5:1 body text, 3:1 large text and non-text controls).

### Styling & Consistency
- [ ] The empty-state panel and the trailing "+ Add column" affordance visually integrate with the existing board page styling (typography scale, spacing, button styles, color tokens). Exact visual spec is delivered by the web-designer phase.
- [ ] The input surface (inline, popover, or dialog — design-spec choice) matches the app's existing input patterns — reusing [`FormInputComponent`](../../KanbAI-Web/src/app/features/auth/components/form-input/form-input.component.ts) is preferred per the #70 precedent, but the tech spec may propose an alternative if justified.
- [ ] Responsive: on viewports <640px the empty-state panel remains readable without horizontal scroll; the trailing "+ Add column" affordance remains reachable (visible in the column strip's scroll window) even when the column strip is horizontally scrollable.

### Verification
- [ ] `npm run build` succeeds with no new errors or warnings attributable to this feature.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** test failures. Pre-existing failures are documented but not blocking per CLAUDE.md.
- [ ] New unit tests cover, at minimum: empty-state renders when `columns().length === 0` and `columnLoadError()` is null; empty-state does NOT render when `columnLoadError()` is set; trailing affordance renders when `columns().length > 0`; trailing affordance is absent when columns are empty (the empty-state button is the only CTA); activating either entry opens the input; submit invokes `ColumnsApiService.createColumn`; successful response appends the column to local state; error response keeps the input open with typed value preserved and user-readable copy displayed; double-submit is prevented; validation (empty, >100 chars, duplicate) blocks submit with inline errors; SignalR echo of the just-created column does not double-insert; focus management on open/close/success.

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)
- [ ] **Zero-column board that was just emptied by a `ColumnDeleted` SignalR event.** The empty-state panel appears within a single render cycle after the last column is removed from local state.
- [ ] **Board transitions from 1 column back to 0** (e.g. admin deletes the last column in another tab → SignalR echo fires → local columns array becomes empty). The trailing "+ Add column" affordance disappears and the empty-state panel appears.
- [ ] **Board transitions from 0 to 1 column** (via the empty-state button's own successful submit OR via a SignalR echo of another user's create). The empty-state panel disappears and the trailing "+ Add column" affordance appears.
- [ ] **User navigates away from the board while the create-column request is in flight.** The subscription is cleaned up via `takeUntilDestroyed(this.destroyRef)` (mirroring the existing pattern in `BoardPageComponent`); no stale setState on unmounted component, no duplicate column when returning to the board.
- [ ] **Column name with only whitespace:** treated as empty/invalid (same as the empty case).
- [ ] **Leading/trailing whitespace in the submitted name:** trimmed before duplicate comparison and before POST (matches the #70 `column-draft-list` behavior).
- [ ] **Case-insensitive duplicate:** "Done" and "done" count as duplicates of an existing column named "DONE" — rejected client-side before the POST is made.
- [ ] **Column name at exactly 100 characters:** accepted (boundary is inclusive, matching backend `max 100`).
- [ ] **Rapid opens and cancels** of the input surface do not leak subscriptions, event handlers, or scroll-lock state.
- [ ] **Two users adding a column concurrently.** Each user's own create may echo back via SignalR while the other user's create is also echoing. The dedupe-by-id at the state-service level guarantees no duplicate rows; the final sort-by-`columnOrder` guarantees a consistent order. The UI does not need to do anything special other than rely on existing `onColumnCreated`.

### Explicitly out of scope for #77
- **Column rename on an existing board.** Once a column exists, editing its name is a future ticket. #77 only covers creation.
- **Column delete on an existing board.** Deleting a column is a future ticket (backend `DELETE /api/column/{id}` exists but no board-scope UI is in scope here).
- **Column reorder on an existing board.** Drag-and-drop reorder of columns is not part of #77 (note: task drag-and-drop within/between columns is already shipped by #47 and MUST NOT regress).
- **Column color picker on an existing board.** `CreateColumnDto.colorCode` is optional and #77 MAY omit it entirely (matching #70's choice). A color picker UI is out of scope.
- **Inline "+" slots between columns for mid-strip insert.** #77 only mandates an append-at-end affordance. Inserting at an arbitrary position is a future enhancement.
- **Task creation.** Issue #78 is the separate ticket for adding tasks inside columns; #77 enables #78 by guaranteeing at least one column exists, but does not implement any task-creation UI itself.
- **Bulk column creation.** Users adding multiple columns at once is out of scope — the add-column flow creates one column per submit (the create-project dialog remains the only bulk-create surface).
- **Project templates / column presets.** Saving a column set as a reusable template is out of scope (same as #70).
- **Undo of just-added column.** Out of scope — the user can delete columns in a future ticket once that UI exists.
- **Localisation.** The app is English-only today; translated empty-state copy and error messages are deferred to a future i18n pass.
- **Backend changes.** No modifications to the C# backend, DTOs, endpoints, or SignalR events are required or permitted. The entire feature is implementable against the existing, documented API contract.
- **Changes to the realtime reconciliation in `BoardStateService`.** The existing `onColumnCreated` is the state-level source of truth and MUST NOT be altered by #77; the implementation MAY call `onColumnCreated`-equivalent paths (or rely on the SignalR echo and an optimistic local insert) but MUST NOT introduce a divergent reconciliation path.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
