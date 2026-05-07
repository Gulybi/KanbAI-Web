# Feature: Dynamic Column Setup on Project Creation

**GitHub Issue:** [#70](https://github.com/Gulybi/KanbAI-Web/issues/70)
**Milestone:** _none_ (unassigned)
**Repository:** Gulybi/KanbAI-Web
**Branch (to be created):** `70-dynamic-column-setup-on-project-creation`

---

## Business Value

### Who is this for?
- **Authenticated KanbAI users** creating a new project through the dashboard "New Project" flow (shipped in #32). Today these users land on an empty board immediately after creation and must discover column creation as a separate step before any real work can begin.
- **Team leads / project owners** who want each new project to match their team's working style (e.g. `Backlog / Ready / In Progress / Review / Done`, or `To Do / Doing / Done`, or a domain-specific variant) without editing defaults after the fact.

### Why is it valuable?
The create-project dialog (#32) and the board view (#47) are both live, but the bridge between them is broken UX: the backend stores only the project shell, so the first time a user clicks into the board of a freshly-created project they see a blank canvas with no way to start organising work. Issue #66 (cannot open board from dashboard) was already a symptom of how disorienting a zero-column board is — fixing navigation only exposes the emptier downstream state.

Issue #70 closes this loop by making the column set a first-class part of project creation:
- **Removes the "dead board" anti-pattern.** Every newly-created project ships with a usable, editable starter flow.
- **Keeps expert users in control.** The suggested defaults are pre-filled but fully editable in the same step — rename, reorder, add, and remove before the project is persisted.
- **Establishes the first "compound create" form in the app.** The existing create-project form is Title + Description only; this is the first time the dashboard will ship a form whose submission is atomic across multiple backend resources (project + N columns). The pattern it establishes (optimistic defaults, editable list, one-shot submit with multi-step server work) is reusable for later flows like project templates and bulk-task imports.

### What problem does it solve?
1. **Empty-board UX on first entry.** [`CreateProjectDialogComponent.onSubmit`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts#L96-L136) calls only `ProjectStateService.createProject({ name, description })` — there is no column creation side-effect. The backend's `POST /api/project` (see [`.claude/backend_api_map.md:58`](../../.claude/backend_api_map.md#L58)) likewise creates only the project row; the board is empty until someone hits `POST /api/column/project/{projectId}` ([`.claude/backend_api_map.md:82`](../../.claude/backend_api_map.md#L82)).
2. **No column-management UI exists inside the app.** [`ColumnsApiService`](../../KanbAI-Web/src/app/features/board/services/columns-api.service.ts) implements only `getColumnsForProject` — `ColumnOperation` is explicitly `'list'`-only and the service comment at lines 17-18 notes that create/delete are out of scope for earlier tickets. Users who land on an empty board today have no in-app surface at all to add columns. #70 is the first user-facing entry point for column creation.
3. **Cognitive load at the wrong moment.** Requiring the user to name every column from scratch forces a decision before they even know the project's scope. Suggesting "To Do / In Progress / Done" lowers the activation energy to zero while still allowing full customization for teams that want it.
4. **Product parity.** Competing kanban tools (Trello, Jira, Linear, Notion) universally offer a starter column set on project creation. Shipping an empty board is a noticeable gap.

---

## Current State vs Desired State

### Current State
- **Create-project dialog captures only Title + Description.** [`CreateProjectDialogComponent`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts) renders a reactive form with two fields and submits to `ProjectStateService.createProject(input)` where `input` is `{ name, description }` (see [`ProjectInput`](../../KanbAI-Web/src/app/features/projects/state/project-state.model.ts#L20-L27)). There is no column-related UI in the dialog.
- **Project state service has no column awareness.** [`ProjectStateService.createProject`](../../KanbAI-Web/src/app/features/projects/state/project-state.service.ts#L200-L211) calls the projects API directly and prepends the returned `ProjectSummary` to the cache. The created project has zero columns at this point.
- **Column creation endpoint exists and is stable.** [`.claude/backend_api_map.md:82`](../../.claude/backend_api_map.md#L82) documents `POST /api/column/project/{projectId}` accepting `CreateColumnDto { name (required, max 100), colorCode (optional, max 20), columnOrder (optional) }` and returning `201 ApiResponse<ColumnResponseDto>`. No frontend code currently calls this endpoint.
- **Column state is board-scoped, not project-creation-scoped.** [`BoardStateService`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) owns columns only while a board is viewed; it does not know about the create-project flow.
- **Behavior today (reproduction):**
  1. User opens `/dashboard`, clicks "New Project", fills Title (e.g. "Website Redesign"), clicks "Create project".
  2. Dialog closes; new card appears on the dashboard grid (correct).
  3. User clicks the new project card → `BoardPageComponent` loads via `/board/:projectId` → columns list request returns `[]` → board shows zero columns and zero tasks.
  4. User has **no in-app affordance** to add a first column (create/delete column UI does not exist yet as of the current `main`).
- **Real-time event for column creation exists** ([`.claude/backend_api_map.md:150`](../../.claude/backend_api_map.md#L150) — `ColumnCreated` SignalR event) but no client subscriber is currently registered for it (not relevant to this ticket unless the tech spec chooses to use it for post-create reconciliation).

### Desired State
- **Project-creation dialog becomes a two-part form.** The existing Title + Description fields remain; below them, a new "Initial columns" section lets the user inspect, edit, reorder, add, and remove the column set that will be created alongside the project.
- **Default column set is pre-populated.** When the dialog opens, the initial-columns section is pre-filled with a suggested starter set — exactly `"To Do"`, `"In Progress"`, `"Done"` in that order, matching the issue body. The user is not required to change anything.
- **The submit button is labeled and behaves as a single "Create project" action** that results, on success, in a project with the user's chosen columns already in place. From the user's perspective it is one click, one success, one close.
- **The newly-created project, when opened from the dashboard, shows the user's columns immediately** (no additional setup step, no empty-board flash).
- **Expected user flows:**
  1. **Accept-defaults path (fast).** User opens the dialog, types a Title, leaves columns untouched, clicks Create → on success, the dialog closes, the new project is on the dashboard, and clicking into its board shows three columns: "To Do", "In Progress", "Done" in that order, all empty.
  2. **Edit-defaults path.** User opens the dialog, renames "In Progress" to "Working", drags "Done" above "Working" (or reorders via keyboard), removes "To Do", adds a new column "Review", clicks Create → on success, the new board shows "Done", "Working", "Review" in that order, all empty.
  3. **Build-from-scratch path.** User opens the dialog, removes all three defaults, adds their own columns one by one (e.g. "Ideas", "Validating", "Building", "Shipped"), clicks Create → on success, the new board shows exactly those four columns in the order the user arranged them.
  4. **Zero-columns path (edge).** User opens the dialog, removes all three defaults, and clicks Create without adding any replacement → submission is blocked with a visible message explaining that at least one column is required; the project is not created. (Creating a project with zero columns reproduces exactly the broken state this issue is fixing.)
  5. **Validation path.** User tries to submit a column with a blank name, whitespace-only name, duplicate name (within the same form), or a name longer than 100 characters → the field surfaces a validation error, submit is blocked, project is not created, no API calls are made.
  6. **Cancel path.** User opens the dialog, modifies columns, clicks Cancel / Escape / backdrop → dialog closes with no API call, no state change; re-opening the dialog shows the default set fresh again (no leftover edits).
  7. **Partial-failure path (column creation fails after project succeeds).** The project already exists server-side; the dialog surfaces a user-readable error indicating the project was created but columns could not all be added, and the user is directed to the board where they can retry column setup. The dashboard shows the new project card (it exists) and the failed columns are not phantom-rendered. The exact recovery UX is a tech/design-spec decision; what this context requires is that the user is never left with a silent failure or a project in an unknown state. **Note:** whether to use a transactional backend endpoint (out of scope per [`.claude/backend_api_map.md`](../../.claude/backend_api_map.md) as of today — the current contract is per-column `POST`s) or to sequence N+1 client-side calls is a **technical decision** deferred to the staff-engineer phase.

---

## Milestone Context

**Milestone:** _none assigned_ on the GitHub issue. Contextually this slots after milestone #5 (Real-time UI Updates & Kanban Interaction) and milestone #6 (Asynchronous File Upload UI), both of which are complete, and targets the same surface as milestone #4 (Landing Page & Project Dashboard UI).

### Prerequisite Issues
- [#32](https://github.com/Gulybi/KanbAI-Web/issues/32) — "New Project" Modal or Form — **CLOSED** ✓ (provides the dialog this feature extends; do not rebuild the dialog shell)
- [#31](https://github.com/Gulybi/KanbAI-Web/issues/31) — Project State Management with Signals — **CLOSED** ✓ (provides `ProjectStateService.createProject` and the cache prepend contract)
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) — Project Dashboard Component — **CLOSED** ✓ (the surface the dialog returns to)
- [#47](https://github.com/Gulybi/KanbAI-Web/issues/47) — Visual Drag-and-Drop (Angular CDK) — **CLOSED** ✓ (Angular CDK drag-drop is already installed and in use by the board; if the staff engineer chooses drag-reorder for the initial-columns list, the primitives are already present — this is a tech-spec decision, not a new dependency)
- [#66](https://github.com/Gulybi/KanbAI-Web/issues/66) — Cannot Open Kanban Board View from Project Dashboard — **CLOSED** ✓ (ensures users can actually reach the board of a newly-created project to verify the columns rendered; without this, the feature would ship invisibly)
- Milestone #3 JWT authentication — **CLOSED** ✓ (bearer token, 401 logout/redirect behavior applies unchanged to the new column API calls)

### Downstream Issues (unblocked or improved by this one)
- Future "create column from board" inline UI: once the create-on-project-creation path is in place, adding an in-board "+ Add column" affordance is a straightforward reuse of the same API call and validation rules.
- Future "project templates" work (not filed): a template would extend the default-column list to include default tasks, labels, etc. — #70 lays the groundwork by introducing the concept of a user-editable starter structure at creation time.

### Related Work / Open Assumptions
- **Backend is already complete.** `POST /api/column/project/{projectId}` and `CreateColumnDto` are documented and live ([`.claude/backend_api_map.md:82, 250-256`](../../.claude/backend_api_map.md#L82)). No backend-api-bridge re-scout is required.
- **Transactionality across `POST /api/project` + N × `POST /api/column/project/{projectId}` is NOT guaranteed by the backend.** As of today the client must call them sequentially and handle partial failure (see Desired State path 6). The staff engineer may propose a client strategy (all-or-nothing rollback, best-effort with user-visible recovery, pre-create-project-then-columns) — this document requires only that the user is never stranded with a silently half-created project.
- **`colorCode` and `columnOrder` in `CreateColumnDto` are optional.** The client may omit `colorCode` entirely (no color UI in scope for #70); whether to pass `columnOrder` explicitly or rely on the backend's ordering of successive creates is a technical decision. The observable outcome this document requires is that on the board, the columns appear in the order the user arranged them in the dialog.
- **Column name constraints mirror backend.** `CreateColumnDto.name` is "required, max 100" per [`.claude/backend_api_map.md:254`](../../.claude/backend_api_map.md#L254). The client validation must match.
- **The suggested default set is exactly `"To Do"`, `"In Progress"`, `"Done"`** (verbatim from the issue body) in that order. Localisation of these strings is out of scope for #70 (the app is English-only today); the tech spec may still centralise them as constants.
- **Form primitive reuse.** The existing [`FormInputComponent`](../../KanbAI-Web/src/app/features/auth/components/form-input/form-input.component.ts) is the established pattern for single-line text inputs with label, validation error, and required indicator; whether to reuse it for column names or introduce a column-scoped variant is a tech/design-spec decision.
- **Drag-and-drop reorder vs. up/down buttons vs. both** is a design-spec decision; this context requires only that reorder is possible by some fully keyboard-operable means and (if drag is used) also via pointer.
- **Responsive behavior and modal height** when the default list grows (e.g. user adds 10 columns): the dialog must remain usable on small viewports. Scrolling behavior inside the dialog vs. page-scroll vs. max-height is a design-spec decision; this document requires only that the form remains usable and submit stays reachable.

---

## Acceptance Criteria

### Default Column Presentation
- [ ] When the create-project dialog opens, the initial-columns section is pre-populated with exactly three items with the names `"To Do"`, `"In Progress"`, `"Done"` in that top-to-bottom order.
- [ ] The default items are visibly editable from the moment the dialog opens — no additional "Customize columns" toggle or click is required to start renaming, reordering, or removing them.
- [ ] Re-opening the dialog after a previous successful submission or cancellation shows the defaults again, not the previously-edited list.

### Editing: Rename
- [ ] Each column row exposes a text input for the column name. The input accepts standard keyboard entry, paste, cut, and IME composition without losing focus.
- [ ] Each column name input has an associated `<label>` or `aria-label` so assistive tech announces "Column 1 name", "Column 2 name", or equivalent.
- [ ] Entering a column name longer than 100 characters surfaces a field-level validation error ("Column name must be at most 100 characters" or equivalent) and disables submit until resolved.
- [ ] A blank or whitespace-only column name is treated as invalid (submit disabled, field-level error visible) — matches backend `required` on `CreateColumnDto.name`.
- [ ] Two columns with the same (case-insensitive) trimmed name within the same form surface a duplicate-name validation error on the later rows and disable submit until resolved. (Rationale: a board with two columns named "Done" is confusing; the backend does not prevent this, so the client must.)

### Editing: Add
- [ ] A visible "Add column" affordance is present in the dialog. Activating it (click, Enter, or Space) appends an empty column row to the end of the list and moves keyboard focus to the new row's name input.
- [ ] The user can add arbitrarily many columns; the dialog scrolls or grows to keep submit reachable (exact mechanism is a design-spec decision).

### Editing: Remove
- [ ] Each column row has a visible Remove affordance (e.g. a trash or X button) that is operable by click, Enter, and Space.
- [ ] Activating Remove deletes the row from the form state immediately; no confirmation dialog is required (the project is not yet created, so nothing is persisted to undo).
- [ ] Removing a row moves keyboard focus to a predictable sibling (typically the previous row's name input, or the Add button if the list is empty) — no focus loss to `<body>`.
- [ ] If the user removes all rows the list is empty and submit is blocked (see "Submission & Validation" below).

### Editing: Reorder
- [ ] The user can reorder columns by some fully keyboard-operable mechanism (up/down buttons with `aria-label`, an accessible drag-and-drop implementation, or equivalent). The exact mechanism is a design-spec decision.
- [ ] If drag-and-drop is also provided, it works via pointer (mouse, touch) in addition to keyboard.
- [ ] After a reorder, the updated order is immediately reflected in the list (visually and in the form model) so the user sees what will be submitted.
- [ ] The order the user sees in the dialog at submit time is the order the columns appear on the board after creation.

### Submission & Validation
- [ ] The submit button is disabled while any of the following is true: Title is invalid per existing #32 rules, any column name is blank/whitespace/over 100 chars, any duplicate column name is present, the column list is empty, a submission is already in flight.
- [ ] If the user attempts to submit an empty column list (all defaults removed, none added), the dialog surfaces a visible inline message (e.g. "Add at least one column to continue" or equivalent) and does not issue any API calls.
- [ ] A valid submit creates the project AND the chosen columns. On success, opening the newly-created project's board (via the dashboard card, post-#66) shows exactly the user's columns in the user's order, all empty of tasks.
- [ ] The dialog shows a single "Creating…" / loading state while the compound operation is in flight. The user does not see a flash of "project created, columns pending" as two separate states.
- [ ] Rapid double-clicks on the submit button do not produce duplicate projects or duplicate columns.

### Error Handling
- [ ] If the project creation call itself fails (HTTP 4xx/5xx, network, envelope `success: false`), the dialog stays open with fields and column list populated exactly as the user had them, a user-readable error sentence is displayed, no columns are created server-side (the project never existed), and the submit button is re-enabled so the user can correct and retry.
- [ ] If the project creation succeeds but one or more column creation calls fail, the user is shown a user-readable error that does not expose status codes, URLs, or stack traces. The dashboard reflects that the project was created (the card appears) and the user can open the project's board to see which columns did get created (if any) — they are not stranded without a path to recover. The exact recovery UX (dialog stays open with failed rows marked, or dialog closes and toast surfaces the situation, etc.) is a design-spec decision; what this AC requires is no silent failure and no crash.
- [ ] On network error (HTTP status 0), the user-readable "couldn't reach the server" copy surfaces (consistent with existing `mapErrorToUserMessage` behavior); the form stays open and fields remain populated.
- [ ] On 401 during any call in the sequence, the existing global `authInterceptor` handles redirect; the dialog component does not crash on unmount mid-flight.

### Cancel & Dismissal
- [ ] The Cancel affordance closes the dialog without issuing any API calls — no project is created, no columns are created, the dashboard is unchanged.
- [ ] Escape and backdrop click continue to behave exactly as they did in #32 (close with no-save semantics).
- [ ] Closing the dialog by any path (Cancel, Escape, backdrop, success, navigation-away) leaves no residual DOM and no stale scroll-lock on `<body>`.

### Accessibility
- [ ] The column list is announced coherently by screen readers — each row's name input has a clear label, and the Add / Remove / Reorder controls have meaningful accessible names (e.g. "Remove column 'In Progress'", "Move column 'Done' up").
- [ ] The dialog is fully keyboard-operable end to end: Tab/Shift+Tab traverses Title → Description → each column row's controls (name, remove, reorder) → Add button → Cancel → Submit in a logical order; Escape closes.
- [ ] Focus is trapped within the dialog while it is open, and returns to the triggering button on close (carrying the #32 behavior forward unchanged).
- [ ] Validation errors are announced to assistive tech (e.g. `aria-live="polite"` on the error region, or `aria-invalid` on the offending field) within 100ms of the triggering event.
- [ ] The "form open" state passes `axe-core` with zero critical or serious violations.
- [ ] Color contrast on all text, placeholders, errors, and icon buttons meets WCAG AA (4.5:1 body, 3:1 large text and non-text controls).

### Styling & Consistency
- [ ] Visual styling remains consistent with the existing create-project dialog (typography, spacing scale, button styles) — the column section is visibly a continuation of the same form, not a separate screen. Exact visual spec is delivered by the web-designer phase.
- [ ] Responsive: on viewports <640px, the form remains usable without horizontal scroll; the column list and submit button stay reachable.

### Verification
- [ ] `npm run build` succeeds with no new errors or warnings attributable to this feature.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** test failures. Pre-existing failures are documented but not blocking per CLAUDE.md.
- [ ] Unit tests exist covering, at minimum: dialog opens with three default columns in order; rename persists to form state; add appends a new empty row and focuses its input; remove deletes the row and moves focus; reorder updates form order; duplicate column names block submit; empty column list blocks submit; column name >100 chars blocks submit; successful submit creates the project AND the columns in order; project-level error keeps dialog open with populated state; partial-failure (project ok, column fails) does not crash and surfaces a user-readable message.

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)
- [ ] **Column name at exactly 100 characters:** accepted (boundary is inclusive, matching backend `max 100`).
- [ ] **Column name with only whitespace (`"   "`):** treated as invalid, same as empty.
- [ ] **Leading/trailing whitespace in column names:** trimmed for the duplicate-detection comparison and for submission to the backend (match existing Title trimming behavior in #32).
- [ ] **Case-insensitive duplicate detection within the form:** `"Done"` and `"done"` are considered duplicates in the same form (rationale: rendering both side-by-side on the board is indistinguishable visually). The backend does not enforce this — it is a client-side UX guardrail.
- [ ] **User re-adds a removed default (e.g. removes "To Do" then adds a new column and types "To Do" into it):** accepted; the removed default has no residual identity — the form only cares about the current list.
- [ ] **Adding many columns (e.g. 10+):** the dialog remains usable; submit stays reachable; no fixed artificial cap (if a cap is needed, the staff engineer proposes it — this document does not specify one beyond the backend's per-column validation).
- [ ] **Slow network:** while the compound create is in flight, the Cancel button either remains visibly operable (and cancellation is a deferred tech-spec decision) or is clearly disabled during the request — either is acceptable as long as the user understands the state and no duplicate submissions occur.
- [ ] **User submits, then closes the browser tab mid-request:** if the project-create call completes server-side before the tab dies, the next dashboard load shows the project (columns may or may not all exist). This is a tolerated consequence of the non-transactional backend and is not a regression this ticket needs to solve.
- [ ] **Submit-then-navigate-away within the SPA:** consistent with #32's behavior — late success still updates the project cache; the user does not see a broken overlay after navigating back.

### Explicitly out of scope for #70
- **Column color picker.** The backend's `CreateColumnDto.colorCode` is optional; UI for choosing column colors is a future enhancement, not part of #70.
- **Editing columns on an existing board.** Renaming, reordering, adding, or removing columns on an already-created project is a separate future issue. #70 only covers the creation moment.
- **Deleting columns after creation.** Out of scope; backend endpoint exists (`DELETE /api/column/{id}`) but no client UI is required for #70.
- **Project templates.** Saving a column set as a reusable template for future projects is out of scope.
- **Localisation of default column names.** The app is English-only today; translating "To Do", "In Progress", "Done" is deferred to a future i18n pass.
- **Cross-project column cloning or copying columns from an existing project.** Out of scope.
- **AI-suggested column sets based on project name or description.** Out of scope (despite the milestone #4 being "AI-Driven", #70 is a concrete UX foundation, not an AI feature).
- **Real-time reconciliation of columns created elsewhere during the dialog's lifetime.** Out of scope — the dialog is an authoring surface, not a collaborative editing surface.
- **Undo of the just-created project (soft-delete).** Out of scope — the existing `DELETE /api/project/{id}` is reachable through its own (future) UI; no rollback button is needed in the success toast.
- **Column limits / rate limits on creation.** The backend contract does not specify a per-project column cap. The client does not enforce one beyond the backend's per-column validation.
- **Backend changes.** No modifications to the C# backend, DTOs, or SignalR events are required or permitted by this ticket. The entire feature is implementable against the existing, documented API contract.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
