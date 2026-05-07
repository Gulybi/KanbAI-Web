# Feature: Surface the task description (`content`) in the task detail panel

**GitHub Issue:** [#83](https://github.com/Gulybi/KanbAI-Web/issues/83)
**Milestone:** _none_ (unassigned)
**Labels:** `bug`
**Repository:** Gulybi/KanbAI-Web
**Assignee:** @Gulybi
**Severity:** Major — the backend already round-trips `content` on every task read/create, but the field is dropped on the client, so users cannot read, write, or perceive task descriptions anywhere in the UI.

---

## Business Value

### Who is this for?
- **Authenticated KanbAI users who open a task** from the board to read or capture any information about that task beyond the title. Today the drawer shows the task's title, an "Attachment" section, and nothing else. A task like `"Wire up onboarding flow"` is reduced to five words — no acceptance criteria, no implementation notes, no context for a teammate picking it up later.
- **Team members collaborating on a task someone else created.** Today the only way to tell a teammate *what* a task is about is to write it into the title itself, which is capped and meant for scannable labels, not prose. Without a description, the product offers no channel for capturing the "why" and "how" of a task inside the task itself.
- **Users creating a task via the board's per-column "Add task" flow shipped in [#78](https://github.com/Gulybi/KanbAI-Web/issues/78).** The [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) inline input is intentionally title-only — tech spec §"HTTP Contracts Summary" in [`docs/handoffs/issue_78_tech_spec.md`](./issue_78_tech_spec.md) commits the client to `{ title }` only on create, dropping `content` from `CreateTaskDto`. This closes one gap (no way to create a task) but leaves the companion gap wide open: once the task exists, there is still no way to give it a description. The [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) flow itself has no description input either — this ticket is the feature that closes that loop.
- **Keyboard- and screen-reader-only users** who need the task detail drawer to expose the full set of task fields, not just title + attachments. Today the drawer is an accessible shell with no meaningful editable content inside it; this ticket gives the drawer its first text-authoring surface.
- **Users who land on a newly-created task** and want to type notes into it immediately. Today they hit a dead end: the drawer opens, shows the title, shows the attachment dropzone, and offers no text field at all.

### Why is it valuable?
The task description (`content`) is the **canonical place** where a Kanban task captures its own meaning. Without it, the product's most-used object is a label with attachments — not a task. Concretely:

- **The backend already supports this field end-to-end.** `CreateTaskDto.content: string | null` is accepted on create, `TaskResponseDto.content: string | null` is returned on every task read / create / move, and the client's local model `BoardTask` already has a `content: string | null` slot (see [`board-state.model.ts:22-28`](../../KanbAI-Web/src/app/features/board/state/board-state.model.ts#L22-L28) — the field is populated by `TaskCreated` and `TaskMoved` events and by HTTP-driven task creates). The data is flowing into client state today and being silently discarded at the render layer. Every minute this ticket is un-shipped is a minute the product is strictly less capable than the wire protocol allows.
- **Task descriptions are the primary artefact of knowledge capture in Kanban.** Acceptance criteria, design notes, paste-in Slack threads, "why this task exists", "what done looks like" — all of this lives in a task's description in every competing product (Jira, Linear, Trello, Asana, GitHub Issues). A Kanban tool without a description field does not compete; it demos.
- **[#78](https://github.com/Gulybi/KanbAI-Web/issues/78) completes the "create a task" loop — [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) completes the "describe a task" loop.** Together they are the minimum viable task-authoring story. With only [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) shipped, a user can produce tasks but cannot tell anyone what they mean. With only [#83](https://github.com/Gulybi/KanbAI-Web/issues/83)'s read path shipped (render-only, no edit), a user can *finally see* any `content` the backend returns — important for any future backfill, import, or AI-authored task path.
- **Unblocks the task-detail drawer as a real authoring surface.** Today [`task-detail-panel.component.html:13-15`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html#L13-L15) still renders a `"Placeholder"` badge next to the title (`aria-hidden`), acknowledging in the markup itself that the drawer is incomplete. Shipping [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) is the step that removes the placeholder framing and begins treating the drawer as production UI.
- **Exercises the backend prerequisite honestly.** The API map explicitly warns at [`.claude/backend_api_map.md:163`](../../.claude/backend_api_map.md#L163): *"no task-update/task-delete events exist yet because those endpoints are not implemented."* This ticket is the first frontend feature that surfaces the gap to users, forcing a deliberate product decision (ship read-only now, wait for backend to enable edit) instead of letting the gap hide behind a drawer that ignores the field.
- **Every downstream task-edit feature flows through this drawer.** Due dates, assignees, labels, comments, status, priority — every future task-level field will need a home in this drawer. [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) ships the first task-field-beyond-title surface and sets the pattern (section header, empty-state, edit affordance, save/cancel, error handling) that those tickets will reuse.

### What problem does it solve?
From the user's lived experience today:
1. **User opens a project board** and clicks (or keyboard-activates) a task card. The `TaskDetailPanelComponent` slides in from the right (see [`task-detail-panel.component.ts`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts) for the drawer implementation and [`board-page.component.ts:275-277` → `handleTaskOpened`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L275-L277) for the trigger).
2. **The drawer shows the task's title** as an `<h2>`, a `"Placeholder"` pill next to the title ([`task-detail-panel.component.html:13-15`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html#L13-L15)), a Close button, and a single "Attachment" section containing the dropzone + upload list + completed-attachments list shipped in [#50](https://github.com/Gulybi/KanbAI-Web/issues/50) / [#51](https://github.com/Gulybi/KanbAI-Web/issues/51). **There is no Description section. There is no body field. There is no text area anywhere on the page that accepts task-level prose.**
3. **The `content` field round-trips silently.** If a task has `content: "Remember to coordinate with design on the hero banner copy."` returned from the backend, the client stores it on `BoardTask.content` — then never renders it. The user has no way to know that value exists.
4. **The user cannot create a description either.** The [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) add-task flow posts `{ title }` only (see [`board-page.component.ts:432` → `this.tasksApi.createTask(columnId, { title: trimmedTitle })`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L432)). There is no description input anywhere in the in-app create flow, nor any separate "edit description" affordance on an existing task.
5. **The escape hatch is nonexistent.** There is no admin tool, no import, no "paste a task from clipboard with body" flow, no command palette — nothing. The field's existence on the wire is user-invisible 100% of the time.

There is no user-facing clue about what is wrong. The user's mental model is *"tasks have a title and attachments and nothing else,"* which is strictly less than what the backend already supports and strictly less than what every competing product offers.

---

## Current State vs Desired State

### Current State (behaviour today on `main`)

- **The task detail panel has exactly three logical regions:** header (title + placeholder badge + close button), body with a single "Attachment" section, and a live region for upload announcements. See [`task-detail-panel.component.html`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html). **There is no Description section, no body-text section, no notes section.** Every task — whether its `content` is `null`, empty, or a multi-paragraph description — renders identically in this drawer.
- **The `BoardTask` model already carries `content: string | null`** (see [`board-state.model.ts:22-28`](../../KanbAI-Web/src/app/features/board/state/board-state.model.ts#L22-L28)). The field is populated by:
  - The `TaskCreated` SignalR handler ([`board-state.service.ts:216-228`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L216-L228)).
  - The `TaskMoved` SignalR handler ([`board-state.service.ts:275-283`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L275-L283)).
  - HTTP-driven task creates via `applyCreatedTask` ([`board-state.service.ts:350-357`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L350-L357)).
  - Server-move reconciliation via `reconcileServerTaskMove` ([`board-state.service.ts:536-542`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L536-L542)).
  The value arrives correctly; the render layer ignores it.
- **The drawer's `task` input is a `BoardTask` signal** ([`task-detail-panel.component.ts:48`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts#L48)). The component has full access to `task().content` at render time but never reads it.
- **The in-app create-task flow sends `{ title }` only.** [`board-page.component.ts:432`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L432) commits `this.tasksApi.createTask(columnId, { title: trimmedTitle })`; the `content` optional field on `CreateTaskDto` ([`task.model.ts:40-44`](../../KanbAI-Web/src/app/features/board/models/task.model.ts#L40-L44)) is never populated from the UI. The [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) tech spec deliberately kept this field out of scope: [`issue_78_context.md:39`](./issue_78_context.md#L39) documents "Issue #78 only populates `title`; `content` and `assignedId` are optional on the backend and explicitly out of scope — the client omits them on create."
- **No backend task-update endpoint is documented in [`.claude/backend_api_map.md`](../../.claude/backend_api_map.md).** The Tasks section at [`.claude/backend_api_map.md:87-96`](../../.claude/backend_api_map.md#L87-L96) lists only `POST /api/task/column/{columnId}` (create) and `PUT /api/task/{taskId}/move` (move). There is no `PUT /api/task/{taskId}`, no `PATCH /api/task/{taskId}`, no `PUT /api/task/{taskId}/content`. The SignalR events section at [`.claude/backend_api_map.md:144-158`](../../.claude/backend_api_map.md#L144-L158) lists `TaskCreated` and `TaskMoved` only, with an explicit warning at [line 163](../../.claude/backend_api_map.md#L163): *"no task-update/task-delete events exist yet because those endpoints are not implemented."*
- **`TasksApiService` has no `updateTask` / `updateTaskContent` method.** See [`tasks-api.service.ts`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts) — only `moveTask` and `createTask` exist, plus their associated error-mapping helpers.
- **The drawer's existing "Placeholder" badge** ([`task-detail-panel.component.html:13-15`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html#L13-L15)) is itself an in-code acknowledgement that the drawer is incomplete. Shipping this ticket is the opportunity to retire that badge by replacing the placeholder framing with real content.
- **Reproduction from the issue body:**
  1. User signs in, opens a project board that has at least one task (created via the [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) flow or a previous SignalR-driven create).
  2. User clicks a task card → the detail drawer opens on the right.
  3. User sees: title, `"Placeholder"` badge, close button, "Attachment" section with dropzone + list. **Nothing else.** No description heading, no body text, no empty-state prompt, no edit button.
  4. User has no way to read a description that the backend has actually returned (if one exists). No way to add one. No way to edit one.
  5. User closes the drawer. The task is still title-only from their perspective.

### Desired State

The feature scope is split by **whether the backend can support edits today**. Both phases are described so the PM / staff-engineer can make an explicit product decision. **Phase 1 is in scope for this ticket. Phase 2 is in scope IF the backend prerequisite (see "Open Questions" in the issue body and the "Milestone Context → Backend Prerequisite" section below) is met.**

#### Phase 1 — Read-only description rendering (always in scope)

- **The task detail panel renders a "Description" section** beneath the title (above or below the "Attachment" section — a design-spec decision). The section has a `<h3>` heading with the text "Description" (exact copy is a design-spec decision) and an associated content region.
- **When `task().content` is a non-empty string, the content region renders the description text** with preserved line breaks (plain-text rendering with `white-space: pre-wrap` or equivalent is acceptable; rich-text / markdown rendering is a tech-spec/design-spec decision, see "Open Questions" below — **plain text is the default** unless the staff-engineer phase elevates it).
- **When `task().content` is `null` or whitespace-only, the section renders an empty-state.** The empty-state copy communicates that no description has been added and serves as the affordance to add one if editing is in scope (see Phase 2); if editing is NOT in scope in the initial ship, the empty-state is purely informational ("No description yet." or equivalent — design-spec copy).
- **The Description section is a semantic region** (either `<section aria-labelledby>`, a `<div role="region">`, or a plain labelled container — design-spec decision) and is keyboard-focusable and screen-reader-announced. Navigating into the drawer with Tab reaches the Description section before or after the Attachment section (exact Tab order is a design-spec decision).
- **The `"Placeholder"` badge is removed or re-framed** once a real Description section is rendered. Retaining the badge while shipping a real section is a contradiction and not acceptable.
- **No backend call is introduced by Phase 1.** The `content` field is already in `BoardTask`; Phase 1 is a pure render change plus its accessibility scaffolding.
- **Round-trip verification.** A task that the backend returns with `content: "Some description text."` renders that text in the Description section. A task with `content: null` renders the empty-state. A task whose `content` is updated out-of-band (e.g. by a future backend flow or a direct DB write) updates in the drawer the next time the drawer is opened on that task — but **live updates require a `TaskUpdated` SignalR event that does not exist yet** (flagged in "Open Questions").

#### Phase 2 — Inline editing (scoped IF backend supports an update endpoint)

> **Gating clause:** Phase 2 is in scope for this ticket only if the "Open Questions" at the end of this document resolve to: (a) a task-update HTTP endpoint exists today or the backend team commits to shipping one before this ticket is merged, **and** (b) the product decides to block on that backend work for this ticket. Otherwise Phase 2 is split into a follow-up ticket and [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) ships Phase 1 only.

- **The Description section exposes an edit affordance** (clicking the empty-state, clicking an "Edit" icon next to the heading, clicking anywhere in the existing description text, or pressing Enter / a keyboard shortcut when the section is focused — design-spec decision).
- **Editing opens an inline multiline input** (a `<textarea>` or a contenteditable region — tech-spec decision) pre-populated with the current `task().content` value (or empty when starting from the empty-state). The input has an associated label (visible or `aria-label`), receives focus on open, and reflects validation errors inline.
- **Save mechanics.** The user saves via a visible "Save" button **AND** via a keyboard shortcut (Ctrl+Enter / Cmd+Enter) — both MUST work. The user cancels via a visible "Cancel" button **AND** via the Escape key — both MUST work and MUST discard unsaved changes, restoring the read-only render with the original value.
- **Successful save** persists the new `content` via the backend update endpoint (exact contract: **TBD by staff-engineer after confirming with backend**; the Frontend MUST NOT ship this phase against an invented endpoint). Local `BoardTask.content` is updated so the drawer AND any future re-open reflect the new value immediately. The section returns to read-only render.
- **Failed save (network 0, 4xx, 5xx, envelope `success: false`)** rolls back the edit in local state, keeps the editor open with the user's typed value preserved, and surfaces a user-readable error message. The error copy MUST come from a mapper analogous to `mapTaskMoveErrorToUserMessage` / `mapTaskCreateErrorToUserMessage` at [`tasks-api.service.ts:75-132`](../../KanbAI-Web/src/app/features/board/services/tasks-api.service.ts#L75-L132), with no status codes, URLs, or stack traces leaking to the UI. Tone and placement of the error MUST be consistent with the existing `moveError` pattern on the board page (auto-dismiss behaviour may differ — design-spec decision).
- **Double-submit protection.** Clicking Save twice in quick succession issues exactly one backend request (mirror the `submitting` guard used in [#77](https://github.com/Gulybi/KanbAI-Web/issues/77) / [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) — see `createColumnSubmitting` and `taskDrafts[columnId].submitting`).
- **Keyboard-first parity.** Every step — opening the editor, typing, saving, cancelling, dismissing an error, returning to read-only — works with keyboard alone. This is explicitly called out in the issue body and is non-negotiable.
- **Accessibility announcements.** Opening the editor, successfully saving, and save-error states are announced to assistive tech via a polite live region. Whether this re-uses the existing `dragAnnouncement` region at [`board-page.component.html`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html) or introduces a new drawer-scoped region is a tech-spec decision.
- **Real-time echo is best-effort.** The issue body explicitly notes that a `TaskUpdated` SignalR event does not exist. Collaborators on the same board will NOT see a peer's description edits live in this ticket's scope — they'll see the update the next time they re-open the task OR the next time the board reloads. This is a known limitation; surfacing it to the user (e.g. via a "last updated N minutes ago" indicator) is **out of scope** for [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) and tracked as a future enhancement.

#### Desired State — In-scope user flows

The following flows are in-scope. **Flows 1–3 are always in scope (Phase 1). Flows 4–7 are in scope only if Phase 2 gating is met.**

1. **Read a non-empty description.** User opens a task whose `content` is `"The onboarding flow needs to hit the dashboard within 2 s of sign-up."` → drawer opens, Description section renders with that text, line breaks preserved. The task-card layout is unchanged.
2. **Read an empty description.** User opens a task whose `content` is `null` → drawer opens, Description section renders the empty-state copy. No CTA is shown if Phase 2 is out of scope; the empty-state is purely informational.
3. **Accessibility read-only.** A screen-reader user navigates into the drawer; the Description section is announced by its heading, and its content (either the text or the empty-state copy) is read out. Tab order is sensible.
4. **(Phase 2) Add a description from empty-state.** User clicks the empty-state CTA → the inline editor opens, empty, focused. User types a description, presses Ctrl+Enter → the description persists, the editor closes, the read-only render shows the new text.
5. **(Phase 2) Edit an existing description.** User clicks the existing description text (or an "Edit" affordance) → the inline editor opens with the existing content selected/visible, focused. User appends to it, clicks "Save" → the description persists, the read-only render reflects the change.
6. **(Phase 2) Cancel an edit.** User opens the editor, makes changes, presses Escape → the editor closes, the read-only render shows the original unchanged value. No backend call is made.
7. **(Phase 2) Save failure.** User saves; the network is unreachable → the editor stays open with the typed text preserved, an inline error message renders, the Save button re-enables. The local `BoardTask.content` is unchanged. User can retry or cancel.

#### Out of scope for this ticket

- **Rich-text / markdown rendering** (bold, links, code blocks, checklists). **Plain text with preserved line breaks is the default.** If the design-spec phase elevates this to markdown, it is done via an explicit follow-up decision in that spec, not by scope creep inside [#83](https://github.com/Gulybi/KanbAI-Web/issues/83).
- **Task comments / threaded discussion.** The issue body explicitly calls this out: if the reporter's `TaskComment` mention is a separate feature, it is filed as its own ticket. [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) is scoped to the single-value `content` field that exists on the API today.
- **Description in the `#78` create-task flow.** Adding a multiline description input to the inline "Add task" form in each column's footer is valuable but is a separate UX surface with its own design decisions (default collapsed? always expanded? affects input width?) — filed as a follow-up. [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) delivers description read + (conditionally) edit on an existing task; the add-task-with-description path is a follow-up.
- **Live collaborative edits.** Without a `TaskUpdated` SignalR event (see "Backend Prerequisite" below), peer-to-peer live updates are impossible to ship in this ticket.
- **Other task fields.** Due dates, assignees, labels, status, priority, comments, activity feed — all out of scope.
- **Changes to the task card on the board.** The task card continues to show the title only. Description preview on the card is a separate design decision.
- **Backend changes.** No C# / API / SignalR / DTO modifications are made by this ticket. If Phase 2 requires a backend endpoint that does not exist, that endpoint is a backend prerequisite filed as a separate ticket (see "Backend Prerequisite").

---

## Milestone Context

**Milestone:** unassigned on the GitHub issue. This ticket rounds out the task-authoring story started by [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) and the task-detail drawer shell established by [#49](https://github.com/Gulybi/KanbAI-Web/issues/49).

### Prerequisite Issues (in this order)

- [#49](https://github.com/Gulybi/KanbAI-Web/issues/49) — "Task detail drawer / `TaskDetailPanelComponent`" (merged, on `main`). Establishes the drawer shell, the `task` input, the title render, the close button, the Escape-key dismissal, and the accessibility framing. [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) extends the body of this drawer with a new Description section and must preserve every existing drawer behaviour.
- [#50](https://github.com/Gulybi/KanbAI-Web/issues/50) / [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) / [#55](https://github.com/Gulybi/KanbAI-Web/issues/55) — attachment upload, listing, and download (merged). These ship the drawer's current "Attachment" section. [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) adds a new section alongside them and must not regress any attachment behaviour (dropzone disabled states, upload rows, completed list, divider logic, live-region announcements).
- [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) — "Add task" inline form per column (merged). Establishes the in-app task creation path that produces tasks [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) then adds descriptions to. Without [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) there are no in-app-created tasks to describe.
- The overall backend `content` contract:
  - `CreateTaskDto.content: string | null` at [`.claude/backend_api_map.md:275`](../../.claude/backend_api_map.md#L275) (accepted on create but deliberately unused by [#78](https://github.com/Gulybi/KanbAI-Web/issues/78)).
  - `TaskResponseDto.content: string | null` at [`.claude/backend_api_map.md:284`](../../.claude/backend_api_map.md#L284) (returned on every task read / create / move — already populating `BoardTask.content` in local state).

### Backend Prerequisite (blocks Phase 2 only)

**The current backend API map documents no task-update / task-edit endpoint.** [`.claude/backend_api_map.md:87-96`](../../.claude/backend_api_map.md#L87-L96) lists only `POST /api/task/column/{columnId}` and `PUT /api/task/{taskId}/move`; [`.claude/backend_api_map.md:163`](../../.claude/backend_api_map.md#L163) explicitly flags: *"no task-update/task-delete events exist yet because those endpoints are not implemented."*

**Consequences:**
- **Phase 1 (read-only render) can ship without any backend change.** The `content` field is already populated in local state.
- **Phase 2 (inline edit) cannot ship without a backend endpoint.** The frontend MUST NOT invent a URL or ship code against an unimplemented route. If Phase 2 is in scope for [#83](https://github.com/Gulybi/KanbAI-Web/issues/83), the backend team must first ship (or at least commit to before merge) a task-update endpoint (candidate shape: `PUT /api/task/{taskId}` accepting `{ title?, content?, assignedId? }` returning `ApiResponse<TaskResponseDto>`). The exact contract is a **backend ticket**, not a frontend tech-spec decision.
- **Live collaborative edits require a `TaskUpdated` SignalR event** that also does not exist today. Shipping Phase 2 without this event is acceptable for MVP — peers see stale content until they re-open the task or refresh — but it is a known limitation that must be called out in the tech spec.

**Recommended path** (subject to PM + backend + staff-engineer decision): ship Phase 1 now to close the user-visible read-gap, file a separate backend ticket for the update endpoint + SignalR event, and ship Phase 2 in a follow-up frontend ticket once the backend is ready. This is the lowest-risk sequencing and also the recommendation this document defaults to unless the PM explicitly overrides.

### Downstream Issues

- **Every future task-edit ticket** (edit title, assign user, change status, set due date, add labels) uses the same task-update endpoint that [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) (Phase 2) or its backend prerequisite introduces. Once the endpoint exists, those tickets become purely additive.
- **Future "Add task with description" follow-up.** Once the [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) inline create form gains a description input, it will write to the same `CreateTaskDto.content` field that [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) (Phase 1) exposes for reading and (Phase 2) for editing. That ticket is not filed yet but is the natural follow-up to [#78](https://github.com/Gulybi/KanbAI-Web/issues/78) + [#83](https://github.com/Gulybi/KanbAI-Web/issues/83).
- **Task comments** (if / when filed as a separate ticket per the issue body's "Open Questions") — orthogonal to this work; adds a new section to the drawer but does not modify the Description section.
- **Task-card description preview on the board** (rendering a one-line excerpt on the card) — orthogonal; re-uses the `content` field exposed by this ticket.

### Related Work / Open Assumptions

- **Scope is frontend-only for Phase 1.** No backend changes. No design-system additions beyond what's needed for a text section inside the drawer.
- **Scope for Phase 2** depends on the backend prerequisite above. If Phase 2 is in scope, the frontend still does NOT modify any backend code; it integrates with an endpoint another ticket ships.
- **The "Placeholder" badge must go** once a real Description section ships. Leaving it in place while claiming the drawer has real content is incoherent.
- **The `BoardTask.content` field is already populated** from every known event path (see "Current State"). The fix does not need to modify `BoardStateService`; the value is already in state.
- **No new npm dependencies** are introduced by Phase 1. Phase 2 may (but is not required to) introduce a lightweight textarea auto-sizer or similar small utility — a tech-spec decision.
- **Format decision is frozen as plain text by this document.** Markdown / rich text is a deliberate follow-up, not a [#83](https://github.com/Gulybi/KanbAI-Web/issues/83) scope item. This freezes the "Open Question" from the issue body at plain-text for this ticket.
- **No regression to existing drawer behaviour** — attachment dropzone, upload rows, completed attachments, live region, divider logic, Escape-key close, OnPush change detection, focus management — must all continue to work identically.

---

## Acceptance Criteria

> Each criterion below is observable, specific to [#83](https://github.com/Gulybi/KanbAI-Web/issues/83), and testable by a human QA pass or a unit/component test.

### Phase 1 — Description render (always in scope)

- [ ] Opening the task detail drawer on any task renders a **"Description"** section inside the drawer body, with a visible section heading and a distinct content region. (QA-testable: open the drawer, visually confirm the section header exists; DOM test: a unique selector returns exactly one matching element.)
- [ ] When the opened task's `content` is a non-empty string, the Description section renders that string **with line breaks preserved** (newlines in the source content produce visual line breaks in the rendered output). (QA-testable: produce a task with a two-paragraph `content` via the SignalR or backend-seeded path, open the drawer, visually confirm two paragraphs. Unit-testable: render the component with a task fixture whose `content` contains `"line 1\nline 2"` and assert the rendered DOM shows them on separate visual lines.)
- [ ] When the opened task's `content` is `null` OR an empty string OR whitespace-only, the Description section renders an empty-state copy instead of the raw value. (QA-testable: open a task whose `content` is `null`, visually confirm the empty-state copy is shown instead of a blank region.)
- [ ] The Description section is reachable by keyboard Tab and is announced by a screen reader with its section heading and its content (or empty-state copy). (QA-testable: Tab into the drawer from the close button, confirm the Description heading receives focus or is reachable; VoiceOver / NVDA confirms the heading is announced.)
- [ ] The `"Placeholder"` badge currently rendered at [`task-detail-panel.component.html:13-15`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html#L13-L15) is **removed** or re-framed so it no longer implies the drawer is incomplete. (QA-testable: open the drawer, confirm the "Placeholder" pill is not visible.)
- [ ] Opening the drawer, navigating between tasks, and closing + re-opening the drawer all render the correct `content` for the currently-open task (no stale-value bug where the previous task's description lingers). (QA-testable: with two tasks A and B whose descriptions differ, open A → read description, close, open B → description updates.)
- [ ] No attachment-related behaviour regresses: the dropzone still honours `disabled` / `disabledReason`, upload rows still render, completed attachments still list, the divider still renders only when appropriate, the `uploadLiveMessage` polite region still announces uploads, and Escape still closes the drawer. (Regression QA: run through every AC in [#49](https://github.com/Gulybi/KanbAI-Web/issues/49), [#50](https://github.com/Gulybi/KanbAI-Web/issues/50), [#51](https://github.com/Gulybi/KanbAI-Web/issues/51), [#55](https://github.com/Gulybi/KanbAI-Web/issues/55) on a task before and after the change.)

### Phase 2 — Description edit (in scope only if backend prerequisite is met — see "Milestone Context")

*If Phase 2 is split into a follow-up ticket, every checkbox in this sub-section is re-filed on that ticket verbatim.*

- [ ] The Description section exposes an edit affordance that is reachable by both mouse (click / tap) and keyboard (Enter or Space when focused on an appropriate element). (QA-testable: Tab to the Description section, press Enter, confirm the editor opens.)
- [ ] Activating the edit affordance opens an inline multiline editor pre-populated with the task's current `content` (or empty when starting from the empty-state), focused, with a visible or `aria-label`-backed label. (QA-testable: open the editor, confirm focus is in the editor and the previous value is shown.)
- [ ] The editor supports **Save via a visible Save button** AND **Save via Ctrl+Enter / Cmd+Enter**. Both paths invoke exactly one backend call per save. (QA-testable: save twice via both paths on separate attempts, observe Network tab for one `PUT`/`PATCH` per save.)
- [ ] The editor supports **Cancel via a visible Cancel button** AND **Cancel via the Escape key**. Cancel discards unsaved changes and restores the original read-only render. (QA-testable: type changes, press Escape, confirm read-only render shows the original value with no backend call made.)
- [ ] A successful save updates local `BoardTask.content` and the Description section returns to read-only render showing the new value. Re-opening the drawer on the same task continues to show the new value. (QA-testable: save a change, close and re-open the drawer, confirm the new value persists.)
- [ ] A failed save (network 0, 4xx, 5xx, envelope `success: false`) keeps the editor open with the user's typed value preserved, surfaces a user-readable error message (no status codes, no URLs, no stack traces), and leaves local `BoardTask.content` unchanged. The user can retry or cancel. (QA-testable: disable the network / stub the backend to 500 / 403, attempt save, confirm editor stays open with typed value and an error banner is shown.)
- [ ] Clicking Save twice in rapid succession issues exactly one backend call per editor instance (double-submit protection). (Unit/component-testable: spy on the API service, click Save twice within the same render tick, assert the call count is 1.)
- [ ] The editor is fully keyboard-operable end to end — opening, typing, saving, cancelling, dismissing an error — without any pointer interaction. (QA-testable: unplug the mouse, complete the full edit flow.)
- [ ] Opening the editor, successfully saving, and encountering a save error each produce a polite live-region announcement. (QA-testable: VoiceOver / NVDA reads the new state on each transition.)
- [ ] The task card on the board (title + count + drag-handle) is NOT modified by this ticket — `content` rendering is drawer-only in scope. (Regression QA.)

### Test coverage

- [ ] Component test(s) for `TaskDetailPanelComponent` cover: (a) non-empty `content` renders, (b) null / empty `content` renders empty-state, (c) Phase 2 only — edit-save-success path updates local state, (d) Phase 2 only — edit-save-failure path preserves typed value and surfaces error. (Regression guard: reverting the render change causes the non-empty test to fail; reverting the empty-state handler causes the null/empty test to fail.)
- [ ] Phase 2 only — service test(s) for the new update method in `TasksApiService` assert the correct HTTP verb + URL, the correct request body shape, and the unwrap-on-success / throw-on-envelope-failure semantics already used by `moveTask` and `createTask`.
- [ ] Existing `task-detail-panel.component.spec.ts`, `tasks-api.service.spec.ts`, and `board-state.service.spec.ts` tests continue to pass with no INTRODUCED failures (classification per [`CLAUDE.md`](../../CLAUDE.md)).

### Verification

- [ ] `npm run build` succeeds with no new errors or warnings.
- [ ] `npm run test -- --watch=false` passes with no INTRODUCED test failures.
- [ ] Manual QA of Flow 1 (read non-empty), Flow 2 (read empty-state), and Flow 3 (accessibility read-only) confirms the Phase 1 ACs in a real browser. If Phase 2 is in scope, Flows 4–7 are also manually verified.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
