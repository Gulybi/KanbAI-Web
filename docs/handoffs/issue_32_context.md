# Feature: "New Project" Modal or Form

**GitHub Issue:** [#32](https://github.com/Gulybi/KanbAI-Web/issues/32)
**Milestone:** Landing Page & Project Dashboard UI (AI-Driven) (#4)
**Repository:** Gulybi/KanbAI-Web
**Branch:** `32-create-new-project-modal-or-form`

---

## Business Value

### Who is this for?
- **Authenticated KanbAI users** who have just signed up or logged in and land on the project dashboard (#30). Until this issue ships, the dashboard is strictly read-only: a brand-new user sees the "No projects yet" empty state and has nowhere to go.
- **Returning users** who want to start a new piece of work (a new team, a new client project, a new personal initiative) without leaving the dashboard.

### Why is it valuable?
The dashboard (#30) and the shared project state service (#31) are both in place, but the user cannot yet produce a project inside the app. A user flow that stalls at "No projects yet" is a hard churn point — the user has authenticated, reached the authenticated home, and has no path forward. This issue closes the loop:
- Converts the empty dashboard from a dead end into a functional starting point.
- Is the **first mutation** the UI has ever performed against the project state service — every subsequent CRUD surface (#33 members, later rename/delete) reuses the same plumbing validated here.
- Delivers the first "form in a dialog" pattern on the authenticated side of the app; reusable for subsequent flows.

### What problem does it solve?
1. **Dead-end dashboard.** A new user lands on `/dashboard`, sees the empty state's "Create your first project" CTA, clicks it, and today nothing happens — the handler is a documented no-op placeholder at [`DashboardPageComponent.onCreatePlaceholder`](../../KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts#L70-L73) and the empty-state button at [`dashboard-empty-state.component.html:19-23`](../../KanbAI-Web/src/app/features/projects/components/dashboard-empty-state/dashboard-empty-state.component.html#L19-L23) has nothing to trigger.
2. **No discoverable "new project" affordance outside the empty state.** A user who already has projects has no way to add another without the empty state ever re-appearing.
3. **`createProject` is untested in real UI.** [`ProjectStateService.createProject`](../../KanbAI-Web/src/app/features/projects/state/project-state.service.ts#L128-L139) was delivered by #31 but has no consumer in the app yet, so its error-transport contract (throws a user-readable `Error` on failure; prepends on success) is not yet validated end-to-end.
4. **Milestone blocker.** The milestone's explicit theme is "create and manage projects"; without a create path, #33 (member management) is the only remaining mutation surface and it assumes the user already owns at least one project.

---

## Current State vs Desired State

### Current State
- **Dashboard surface exists but is read-only.** [`DashboardPageComponent`](../../KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts) renders load / success / empty / error states via `vm().status` and consumes `ProjectStateService`. It exposes a stub `onCreatePlaceholder(): void {}` that the empty state calls.
- **The "Create your first project" button is already wired to emit.** [`DashboardEmptyStateComponent`](../../KanbAI-Web/src/app/features/projects/components/dashboard-empty-state/dashboard-empty-state.component.ts) emits `createClick` on click; the dashboard binds that event to `onCreatePlaceholder()`. The button exists; the handler does nothing.
- **No "New Project" button exists in the dashboard header.** [`DashboardHeaderComponent`](../../KanbAI-Web/src/app/features/projects/components/dashboard-header/dashboard-header.component.html) currently renders only the `<h1>Projects</h1>` title and a subtitle — no CTA — so a user who already has projects has **no entry point** to create another.
- **Project state service is ready.** [`ProjectStateService.createProject(input)`](../../KanbAI-Web/src/app/features/projects/state/project-state.service.ts#L128-L139) accepts `{ name, description }`, returns `Observable<ProjectSummary>`, prepends on success, and errors with a user-readable message on failure. The cache update is synchronous within the `tap()`, so the dashboard grid refreshes in the same change-detection pass.
- **Backend contract is documented and stable.** `POST /api/project` with `CreateProjectDto { name: string (required, max 200); description: string \| null (optional, max 500) }` returns `201 ApiResponse<ProjectResponseDto>` per [`.claude/backend_api_map.md:57, 136-141`](../../.claude/backend_api_map.md#L57).
- **Form primitives exist from the auth flow.** [`FormInputComponent`](../../KanbAI-Web/src/app/features/auth/components/form-input/form-input.component.ts), [`FormButtonComponent`](../../KanbAI-Web/src/app/features/auth/components/form-button/form-button.component.ts), and [`FormCardComponent`](../../KanbAI-Web/src/app/features/auth/components/form-card/form-card.component.ts) are the precedent for reactive-forms field layout in this codebase. Whether #32 reuses them or defines project-scoped variants is a tech/design-spec decision.
- **`@angular/cdk ^21.2.7` is available.** [`KanbAI-Web/package.json:14`](../../KanbAI-Web/package.json#L14). The overlay/dialog primitives exist but no dialog host is currently wired into the app; no existing modal pattern in the codebase. Whether to use `@angular/cdk/dialog`, `@angular/cdk/overlay`, a hand-rolled dialog, or a dedicated route is a **technical decision** deferred to the staff-engineer phase.
- **Behavior today:** Clicking "Create your first project" in the empty state does nothing — no modal, no navigation, no feedback. A user who already has ≥1 project has no visible way to create another from anywhere in the authenticated app.

### Desired State
- **A "New Project" affordance is reachable from the dashboard at all times** — both when the dashboard is in the empty state and when it already shows one or more projects. The affordance opens the create-project form. The exact placement (header button, FAB, etc.) is a tech/design-spec decision; the requirement is that the affordance is discoverable in every non-error dashboard state.
- **The form captures two fields: Title and Description**, as mandated by the issue body. Title is required; Description is optional (backend allows `null`). Client-side validation mirrors the backend contract: Title max 200 chars, Description max 500 chars.
- **On submit, the form calls `ProjectStateService.createProject`** (it does **not** call `ProjectsApiService` directly). On success the form closes/navigates back to the dashboard; on failure the form surfaces a user-readable error and stays open so the user can correct and retry.
- **The newly-created project appears on the dashboard without a page refetch** (guaranteed by #31's prepend-on-success behavior; the dashboard binds to the shared `projects` signal).
- **Expected user flows:**
  1. **Empty-state path:** User lands on `/dashboard`, sees "No projects yet" + CTA, clicks the CTA → create-project form opens (modal or route). User fills Title, optionally Description, submits → on success the form closes/navigates, the dashboard transitions from empty to success with the new project card visible at the top of the grid.
  2. **Already-has-projects path:** User on `/dashboard` with ≥1 project clicks the "New Project" affordance (e.g. in the header) → same form opens → on success the dashboard shows the new card prepended to the existing grid.
  3. **Cancel path:** User opens the form, clicks Cancel / presses Escape / clicks the backdrop (if modal) → form closes without calling the API, no state change, dashboard unchanged.
  4. **Validation path:** User tries to submit with Title blank or >200 chars (or Description >500 chars) → submit button is disabled or a field-level error appears; no API call is issued.
  5. **API error path:** User submits, backend returns a failure → form stays open, a user-readable error message appears near the submit button, fields remain populated so the user can correct or retry.
  6. **Session-expiry path:** If the backend returns 401 mid-submit, the existing global `authInterceptor` handles the logout/redirect; the form does not need to implement its own 401 handling but must not crash on unmount mid-flight.

---

## Milestone Context

**Milestone #4:** Landing Page & Project Dashboard UI (AI-Driven)

### Prerequisite Issues
- [#29](https://github.com/Gulybi/KanbAI-Web/issues/29) — Public Landing Page — **CLOSED** ✓
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) — Project Dashboard Component — **CLOSED** ✓ (provides the surface the form returns to; the empty-state CTA already exists and is waiting on a handler)
- [#31](https://github.com/Gulybi/KanbAI-Web/issues/31) — Project State Management with Signals — **CLOSED** ✓ (provides `ProjectStateService.createProject`, the `projects` signal the dashboard binds to, and the user-readable error transport contract)
- Milestone #3 JWT authentication (#23–#28) — **CLOSED** ✓ (provides `authGuard` protecting `/dashboard`, the JWT interceptor that attaches the bearer token to `POST /api/project`, and the 401 logout/redirect behavior)

### Downstream Issues (this issue unblocks or touches)
- [#33](https://github.com/Gulybi/KanbAI-Web/issues/33) — Project Members Management UI (**OPEN**) — assumes the user has at least one project they own; #32 is the only path to produce that first project inside the app.
- Future rename / delete project flows will reuse whichever dialog/form pattern is established here.

### Related Work / Open Assumptions
- **Backend contract is final and documented** at [`.claude/backend_api_map.md:57, 136-141`](../../.claude/backend_api_map.md#L57). No backend-api-bridge re-scout is required for this issue.
- **State-service contract is final** at [`ProjectStateService.createProject`](../../KanbAI-Web/src/app/features/projects/state/project-state.service.ts#L128-L139): input is `{ name: string; description: string | null }`, output is `Observable<ProjectSummary>`, errors are already mapped to user-readable strings by `mapErrorToUserMessage(err, 'create')`. The form consumes this contract directly.
- **Modal vs. dedicated route is a technical decision** deferred to the staff-engineer phase. The issue body ("dedicated route or a modal dialog") explicitly allows either. This document requires only the external behavior (discoverable, captures Title+Description, calls the state service, closes or navigates back on success).
- **Reuse of existing auth-flow form primitives** (`FormInputComponent`, `FormButtonComponent`, `FormCardComponent`) vs. project-scoped variants is a tech/design-spec decision.
- **Keyboard and focus-management requirements** (Escape closes the modal, focus trap while open, focus-return on close) are deferred to the design spec for exact interaction patterns, but this context requires that the form be fully keyboard-operable (see ACs below).

---

## Acceptance Criteria

### Entry Points
- [ ] When the dashboard is in the **empty state**, the existing "Create your first project" button in `DashboardEmptyStateComponent` opens the new-project form (modal or dedicated route). The button's `createClick` emission is no longer a no-op.
- [ ] When the dashboard is in the **success state** (≥1 project rendered), a visible "New Project" (or equivalent) affordance is present somewhere on the dashboard page at all times and opens the same form when clicked or activated via Enter/Space.
- [ ] The affordance is **not** rendered (or is disabled) while the dashboard is in the error state — the user must resolve the list-level error (retry) before creating a project. (If the staff-engineer phase prefers to leave it enabled, that is acceptable as long as opening the form while the list is errored does not crash and the new project still appears after the list is successfully re-fetched or on the next successful load.)

### Form Fields & Validation
- [ ] The form renders exactly two input fields labeled (or `aria-label`ed) "Title" (or "Project name") and "Description".
- [ ] The Title field is marked as required in the UI (visible indicator such as `*` or the word "required") and the submit button is disabled while Title is empty or whitespace-only.
- [ ] Entering a Title longer than 200 characters surfaces a field-level validation error ("Title must be at most 200 characters" or equivalent) and disables submit.
- [ ] Entering a Description longer than 500 characters surfaces a field-level validation error ("Description must be at most 500 characters" or equivalent) and disables submit.
- [ ] Submitting with Description blank sends `description: null` to the backend (not `""`) — conforms to [`CreateProjectDto`](../../.claude/backend_api_map.md#L136-L141).
- [ ] Validation errors appear within 100ms of the offending field's blur or value-change event (whichever the design spec settles on).

### Submission & Success Path
- [ ] Submitting a valid form invokes `ProjectStateService.createProject({ name, description })` exactly once per click. Rapid double-clicks do not produce two API calls (submit button is disabled while the request is in flight, or the form otherwise guards against re-entry).
- [ ] While the request is in flight, the submit button shows a loading indicator (spinner or "Creating…" label) and the Cancel affordance remains operable.
- [ ] On successful creation, the form closes (if modal) or navigates back to `/dashboard` (if dedicated route) within 200ms of the success response.
- [ ] After successful creation, the new project card is visible on the dashboard at the top of the grid without any additional `GET /api/project` being issued (verified behavior of #31's `createProject` prepend).
- [ ] If the dashboard was in the empty state before creation, after a successful creation it transitions to the success state showing exactly one card for the newly-created project.

### Cancel & Dismissal
- [ ] The form has a visible Cancel affordance (button labeled "Cancel" or equivalent). Activating it closes the form without calling the backend and without modifying the project list.
- [ ] If the form is implemented as a modal: pressing Escape while the modal is open closes it with the same no-save semantics as Cancel.
- [ ] If the form is implemented as a modal: clicking the backdrop closes it with the same no-save semantics. (If the staff-engineer/designer prefers to require explicit Cancel to prevent accidental dismissal of typed content, that is acceptable — document the choice in the tech/design spec.)
- [ ] Closing the form via any path (Cancel, Escape, backdrop, success, or navigation-away) leaves no residual DOM (no stale overlay, no leaked scroll-lock on `<body>`).

### Error Handling
- [ ] If `createProject` errors (HTTP 4xx/5xx, network, or envelope `success: false`), the form stays open with fields populated, and a user-readable error sentence is displayed near the submit button. The sentence comes from the `Error.message` thrown by `ProjectStateService.createProject` (which has already been mapped from the raw error via `mapErrorToUserMessage(err, 'create')`) — no raw status codes, URLs, or stack traces are surfaced.
- [ ] On error, the submit button returns to its idle state (no longer showing the loading indicator) and becomes re-enabled so the user can correct and retry.
- [ ] On error, the project state cache is not modified (already guaranteed by #31's implementation; this AC asserts the form does not attempt its own optimistic update).
- [ ] If the user submits, navigates away mid-request, and then returns to the dashboard: on success the new project is in the list; on error, no error toast "haunts" the new page (errors belong to the form's lifetime).

### Accessibility
- [ ] Every form input has an associated `<label>` or `aria-label`.
- [ ] The form is fully operable via keyboard: Tab cycles through Title → Description → Cancel → Submit (or the design-spec's equivalent order), Enter in any text field submits the form (or at least does not close the modal), Escape closes the modal.
- [ ] If modal: focus is trapped within the modal while it is open, the first focusable element receives focus when it opens, and focus returns to the triggering button (empty-state CTA or header button) on close.
- [ ] If modal: the dialog exposes an accessible name (via `aria-labelledby` pointing to the form heading, or equivalent) so screen readers announce "New Project" when the modal opens.
- [ ] Color contrast on all form text, placeholders, and error messages meets WCAG AA (4.5:1 body, 3:1 large text).
- [ ] The page passes `axe-core` with zero critical or serious violations in the "form open" state.

### Styling & Consistency
- [ ] All styling is implemented with Tailwind CSS utility classes, consistent with the existing auth and dashboard pages (no new global SCSS introduced beyond the component stylesheet). Exact visual spec is delivered by the web-designer phase.
- [ ] Responsive: on viewports <640px, the form is usable without horizontal scroll and inputs span the available width.

### Verification
- [ ] `npm run build` succeeds with no new errors or warnings attributable to this feature.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** test failures. Pre-existing failures are documented but not blocking per CLAUDE.md.
- [ ] Unit tests exist covering, at minimum: form renders both fields; Title required validation blocks submit; Description blank maps to `null` in the submitted payload; success closes the form and the dashboard shows the new card; API error keeps the form open with the user-readable message displayed; Cancel closes the form without calling the backend.

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)
- [ ] **Title that is all whitespace** (e.g. `"   "`): treated as invalid (same as empty); submit is disabled.
- [ ] **Title at exactly 200 characters / Description at exactly 500 characters**: accepted (boundary is inclusive, matching the backend's `max 200` / `max 500`).
- [ ] **Duplicate project names**: the backend does not enforce uniqueness in the current contract, so the form must not enforce it either. Two projects with the same Title are allowed to be created and both render on the dashboard.
- [ ] **Network offline on submit** (HTTP status 0): the form displays the "We couldn't reach the server…" copy from `mapErrorToUserMessage`, stays open with fields populated, and re-enables submit so the user can retry when back online.
- [ ] **Backend returns 401 mid-submit**: the existing global `authInterceptor` redirects to `/login`; the form component must not throw during its unmount. (No new 401-handling logic in the form.)
- [ ] **Submit-then-navigate-away**: if the user clicks Submit and then navigates away (back button, clicks a different nav item) before the response arrives, the late response must still update the project cache so that the project exists on the next visit to the dashboard. (This is already the behavior of #31's `createProject`; the AC requires the form does not `unsubscribe` the request on its own destroy — or if it does, the state service still processes the response. The exact mechanism is a tech-spec decision.)
- [ ] **Re-opening the form after a prior failed submit**: the form opens fresh with empty fields and no leftover error message from the previous session.

### Explicitly out of scope for #32 (handled by other issues or future work)
- Editing an existing project (rename, change description) — a separate future issue.
- Deleting a project — a separate future issue.
- Managing project members — #33.
- Pagination, sorting, or search over the project grid (not triggered by #32).
- Opening the newly-created project's Kanban board — no board-per-project route exists yet.
- Project templates, starter data, or AI-generated starter tasks — explicitly not in scope for this issue ("AI-Driven" in the milestone name refers to future work, not #32).
- Project icons, colors, or custom metadata beyond Title and Description — the issue body restricts the form to those two fields.
- Cross-tab synchronization (two tabs open, create in tab A, tab B not refreshing) — not requested.
- Undo / soft-delete of a just-created project — not requested.
- Analytics / telemetry on form open, submit, cancel — not requested.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
