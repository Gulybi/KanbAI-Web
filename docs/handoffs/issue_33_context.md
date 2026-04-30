# Feature: Project Members Management UI

**GitHub Issue:** [#33](https://github.com/Gulybi/KanbAI-Web/issues/33)
**Milestone:** Landing Page & Project Dashboard UI (AI-Driven) (#4)
**Repository:** Gulybi/KanbAI-Web
**Branch:** (not yet created — prerequisite #32 is in flight on `32-create-new-project-modal-or-form`)

---

## Business Value

### Who is this for?
- **Project owners** (role = `"Owner"`, per [`ProjectSummary.role`](../../KanbAI-Web/src/app/features/projects/models/project.model.ts#L36) and the backend `MemberResponseDto.role` contract) who have just created a project via #32 and now need to invite collaborators so they can work together on a Kanban board.
- **Project members** (role = `"Member"`) who need to know *who else* is on the project. Even though they cannot add or remove people, seeing the member list answers the "who can I mention in a task?" question that the later board work will depend on.
- **Authenticated KanbAI users** generally, for whom projects become a multi-user collaborative object rather than a personal workspace.

### Why is it valuable?
KanbAI is positioned as a collaborative Kanban tool, but until #33 ships the word "collaborative" is aspirational: a project created via #32 is accessible only to the user who created it. There is no way inside the app to grant anyone else access to a project, and there is no way to see who already has access. This makes the product effectively single-user and blocks the milestone's "create and manage projects" theme from landing completely. Shipping #33:
- Unlocks the **first multi-user path** through the authenticated app — a project owner can now share a project with another registered user.
- Establishes the **first visible "project detail" surface** (or modal) in the UI. The milestone has built list-level affordances (dashboard, create). #33 introduces the concept of "do something with *this one* project."
- Validates the existing backend member-management endpoints (`POST /api/project/{projectId}/members`, `DELETE /api/project/{projectId}/members/{userId}`) end-to-end through the UI for the first time.
- Establishes the **member-management pattern** that every later permissions feature (role changes, leave-project, transfer-ownership) will reuse.

### What problem does it solve?
1. **No way to share a project.** After #32, a project exists but its owner cannot grant access to anyone else from inside the app. The add-member backend endpoint is unused by any UI surface.
2. **No visibility into who has access.** There is no screen in the app that shows the members of a project, so an owner who shared access out-of-band (e.g., by having the backend team run a SQL update) cannot see the current member roster.
3. **No way to revoke access.** If an owner added a member in error, or a member should no longer have access, there is no UI path to remove them; the remove-member backend endpoint is likewise unused.
4. **Project card is a dead end.** [`ProjectCardComponent`](../../KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.html) renders a project as an `<article tabindex="0">` with no click target, no link, and no affordance that leads anywhere. Until #33 ships, clicking a card does nothing — a discoverability dead-end analogous to the empty-state button #32 is fixing.
5. **Milestone gap.** Milestone #4 is titled "Landing Page & Project Dashboard UI". #29 (landing), #30 (dashboard), #31 (state), and #32 (create) cover the discovery and creation surfaces; #33 is the only remaining open issue in the milestone and is the last UI surface needed to close the "manage projects" loop.

---

## Current State vs Desired State

### Current State
- **Project dashboard exists but cards are not actionable.** [`DashboardPageComponent`](../../KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts) renders a `ProjectGridComponent` of [`ProjectCardComponent`](../../KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.ts) instances. Each card shows the project's name, description, role badge, and creation date (see [`project-card.component.html`](../../KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.html)) but has **no click handler, no route link, and no secondary action** — selecting a card does nothing.
- **No project-detail route exists.** [`app.routes.ts`](../../KanbAI-Web/src/app/app.routes.ts) declares `/`, `/login`, `/register`, `/dashboard`, and `/board` only. There is no `/projects/:id`, no `/projects/:id/members`, and no nested `children` under `/dashboard`. The `board` route takes no `:projectId` parameter today.
- **No member-related TypeScript exists in the frontend.** Grep for "member"/"Member" across `KanbAI-Web/src/app` finds only coincidental matches (none are member-management code). There is no `MemberSummary` model, no `MembersApiService`, no `MemberStateService`, no members component tree.
- **The backend endpoints exist and are stable** per [`.claude/backend_api_map.md:62-63, 158-172`](../../.claude/backend_api_map.md#L62):
  - `POST /api/project/{projectId}/members` with body `AddMemberDto { userId: string (GUID) }` → `201 ApiResponse<MemberResponseDto>` on success; `400` if the user id is unknown or the user is already a member; `403` if the caller is not the owner; `404` if the project is not found.
  - `DELETE /api/project/{projectId}/members/{userId}` → `204 No Content` on success; `400` if the caller tries to remove the last owner; `403` if the caller is not the owner; `404` if not found.
  - `MemberResponseDto` exposes `{ userId, name, email, role, joinedAt }` — enough to render each row (display name, email, joined date, role badge).
  - There is currently **no `GET /api/project/{projectId}/members` documented** in the backend API map. The list of current members must today be derived from the project response, which only exposes the caller's own role (`ProjectResponseDto.role`) — no other members are returned. **This is a backend gap that the staff-engineer phase must resolve** (either by confirming an undocumented endpoint exists, by requesting one be added, or by choosing a workaround).
  - There is currently **no user-search endpoint documented** — no `/api/users?email=`, no `/api/users/search`. The only exposed user-identifying DTO is `UserProfileDto` returned inside `AuthResponseDto`. The issue body mentions "searching by email" but there is no backend contract for email-to-userId resolution. **This is also a backend gap that the staff-engineer phase must resolve** (see the "Open Assumptions" section below).
- **`ProjectStateService` does not know about members.** [`ProjectStateService`](../../KanbAI-Web/src/app/features/projects/state/project-state.service.ts) owns only the list of `ProjectSummary` items; it has no per-project member cache, no `addMember` / `removeMember` methods, and no member-related error-mapping. The `mapErrorToUserMessage` helper in [`projects-api.service.ts`](../../KanbAI-Web/src/app/features/projects/services/projects-api.service.ts) handles the four `ProjectOperation` variants `'list' | 'create' | 'update' | 'delete'` only.
- **Dialog infrastructure is now wired.** #32 introduced `CreateProjectDialogComponent` and brought `@angular/cdk/dialog` online in [`dashboard-page.component.ts:30`](../../KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts#L30). Whether #33 adopts that same modal pattern, uses a dedicated route, or uses an inline side-panel is a tech/design-spec decision.
- **Behavior today:** A user with an owned project has no way, from anywhere in the app, to see who else is on the project or to add/remove anyone. The card click does nothing; there is no "Settings" / "Members" affordance on the card; the board route does not include a members tab.

### Desired State
- **An owner can reach a Members surface from a specific project in the dashboard.** The exact entry point (click the card, click a "Manage members" button on the card, open a project-detail route, open a modal) is a tech/design-spec decision; the requirement is that from `/dashboard`, the owner of a project can reach a surface that shows the members of *that* project in at most two clicks and can tell which project the surface belongs to.
- **The Members surface lists the project's current members.** Each row shows enough information to identify the person (display name and email at minimum) plus their role (`Owner` / `Member`) and — if the backend exposes it — the date they joined. The list reflects the true server state; no local stubs.
- **The surface differentiates viewer capabilities by role.**
  - **Owners** see and can use an "Add member" control (input + submit) and a "Remove" control on each non-owner row.
  - **Non-owners (members)** see the same roster but the add-member control is either hidden or disabled with an accessible explanation, and remove controls are not rendered. (Even if the member opens the surface via URL manipulation, no mutation call should be attempted; the backend's 403 is a safety net, not the primary defense.)
- **Adding a member is possible by identifying the target user.** The issue body describes "searching by email." Because the backend today does not document a search endpoint, the concrete input pattern (live search with suggestions vs. "type the exact email and submit" vs. "paste a user id") is deferred to the staff-engineer phase once the backend contract for user lookup is resolved. The external requirement is: the owner provides identifying information for a registered user and, on submit, that user appears in the member list; if the user is unknown, already a member, or the caller is not the owner, the UI surfaces a user-readable error without adding a phantom row.
- **Removing a member is possible from each non-owner row for an owner.** Clicking remove asks for confirmation (destructive-action pattern consistent with the rest of the app) and, on confirm, the row disappears from the list once the backend confirms.
- **Expected user flows:**
  1. **Owner views member list:** User on `/dashboard` identifies a project they own, activates the "Manage members" entry point for that project → the Members surface opens/navigates and shows a loading indicator, then the list of members (including the owner themselves). The project's name is visible on the surface so the user never wonders which project they are editing.
  2. **Owner adds a member by email:** From the Members surface, the owner enters the email of a registered KanbAI user and submits → on success the new member appears in the list within one change-detection pass; the input clears and remains focused so the owner can add another.
  3. **Owner attempts to add an unknown email:** Backend returns 400 → a user-readable error appears near the input ("We couldn't find a user with that email" or equivalent), the input retains the typed value, and no row is added.
  4. **Owner attempts to add an existing member:** Backend returns 400 → a user-readable error appears ("That user is already a member of this project" or equivalent); no duplicate row is added.
  5. **Owner removes a member:** Owner clicks the Remove control on a non-owner row → a confirmation step (confirm button, dialog, or inline confirm — design-spec decision) prevents accidental removal → on confirm and backend success the row disappears.
  6. **Owner attempts to remove the last owner (themselves in a single-owner project):** Backend returns 400 → a user-readable error appears ("You can't remove the last owner of a project" or equivalent); the row remains.
  7. **Non-owner views member list:** A member opens the surface → they see the full roster, no "Add" input (or a disabled one with an accessible explanation), no "Remove" controls.
  8. **403 / session-expiry path:** If any request returns 401 the global `authInterceptor` handles logout/redirect; 403 on add/remove (e.g., a non-owner who got there via URL manipulation) surfaces a user-readable "only the project owner can manage members" message; no row is mutated.
  9. **Network offline:** Add/remove shows a "couldn't reach the server" message, the list is unchanged, and the user can retry once connectivity returns.
  10. **Dismissal:** If the surface is a modal, Escape/backdrop/Cancel close it and return focus to the trigger; if it is a route, a Back affordance returns to `/dashboard`.

---

## Milestone Context

**Milestone #4:** Landing Page & Project Dashboard UI (AI-Driven)

### Prerequisite Issues
- [#29](https://github.com/Gulybi/KanbAI-Web/issues/29) — Public Landing Page — **CLOSED** (authenticated-home redirect behavior already in place).
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) — Project Dashboard Component — **CLOSED** (provides the surface the Members entry point is attached to).
- [#31](https://github.com/Gulybi/KanbAI-Web/issues/31) — Project State Management with Signals — **CLOSED** (the `projects` signal supplies the project list and role-per-project that #33 keys off of when deciding owner vs. member capability).
- [#32](https://github.com/Gulybi/KanbAI-Web/issues/32) — Create "New Project" Modal or Form — **OPEN** — not strictly blocking (the backend allows a user to have projects without #32 shipping, e.g. seeded), but #32 is the only in-app path for a user to *own* a project today. In practice this means #33 is most usefully exercised after #32 lands. Context doc lives at [`docs/handoffs/issue_32_context.md`](./issue_32_context.md).
- Milestone #3 JWT authentication (#23–#28) — **CLOSED** (provides `authGuard`, the JWT interceptor attaching the bearer token to the member endpoints, and the 401 logout/redirect behavior that #33 relies on).

### Downstream Issues (this issue unblocks or touches)
- **Board / task features.** Subsequent Kanban-board issues will need the "who is on this project" list to implement assignee pickers for tasks. The backend's `CreateTaskDto.assignedId` already refers to "a user who is a member of the project"; #33 produces the authoritative roster that those pickers will read from.
- **Role-change / transfer-ownership flows.** The current backend contract exposes only add and remove; future work to promote a member to owner or transfer ownership will reuse the row-level action pattern #33 establishes.
- **Leave-project flow.** A non-owner today cannot remove themselves; a future issue can add that in the same surface.

### Related Work / Open Assumptions — CRITICAL for staff-engineer phase
- **OPEN ASSUMPTION A — member-list endpoint.** The backend API map at [`.claude/backend_api_map.md:53-69`](../../.claude/backend_api_map.md#L53) does **not** document a `GET /api/project/{projectId}/members` endpoint. A members UI cannot be built without a source of truth for the list. The staff-engineer phase must either (a) confirm an undocumented endpoint exists and update the API map, (b) file a backend issue and block #33 on it, or (c) choose a stopgap (e.g., derive the list from the members returned alongside a `GET /api/project/{id}` — not currently returned by `ProjectResponseDto`). **This decision is out of scope for the product-manager context document.**
- **OPEN ASSUMPTION B — user search / resolution.** The issue body describes "searching by email" but the backend exposes no `/api/users?email=` or similar. The `AddMemberDto` requires a `userId` (GUID), not an email, so email-to-userId resolution must happen somewhere. Options include: (a) a backend search endpoint is added; (b) the backend accepts email in `AddMemberDto` directly; (c) the frontend requires the owner to paste a userId (rejected as a poor UX); (d) a two-step flow where the user types an email and the backend's 400 "user not found" drives the feedback. The staff-engineer phase must pick the approach in consultation with the backend team.
- **Backend contract for add / remove is final** per the API map: `AddMemberDto { userId }`, response `MemberResponseDto`, and `DELETE /api/project/{projectId}/members/{userId}` returning 204. The 400/403/404 semantics documented in the API map drive the error copy in the ACs below.
- **State-service extension is expected.** Members belong to a specific project, not to the global project list, so the members cache is likely per-project. Whether to extend `ProjectStateService` or introduce a sibling `MembersStateService` is a staff-engineer decision.
- **Modal vs. dedicated route** (e.g., `/dashboard/projects/:id/members`, or `/projects/:id/members`) is a tech/design-spec decision. The issue body ("a view or modal") explicitly allows either.
- **Confirmation pattern for remove** (inline confirm button, CDK dialog, toast with undo) is a design-spec decision. This context requires only that an unintentional click does not remove a member silently.
- **How owner-only capability is gated** (via `vm().role` on the dashboard, via a re-check after a fresh `GET`, via the caller's role returned by the list endpoint itself) is a tech-spec decision.

---

## Acceptance Criteria

### Entry Point & Discoverability
- [ ] From `/dashboard`, a user can reach the Members surface for any specific project they have access to in at most two activations (clicks or keyboard activations), without leaving the authenticated app.
- [ ] The Members surface visibly identifies which project it belongs to (the project's name is rendered on the surface itself, not only in the URL or tab title).
- [ ] If the surface is a modal: opening it does not navigate the browser history; closing it returns focus to the triggering control on the dashboard.
- [ ] If the surface is a route: the back-button / browser-history behavior returns the user to `/dashboard` with no console errors and with the project list still populated (no spurious re-fetch that blanks the grid).

### Member List Rendering
- [ ] While the member list is being fetched, the surface shows a non-blocking loading indicator (skeleton or spinner) and no empty-list copy.
- [ ] Once loaded, the surface renders one row per member. Each row shows, at minimum, the member's display name, email, and role.
- [ ] The current user's own row is visibly identifiable (e.g., a "You" badge, a self-indicator, or equivalent) so the owner does not accidentally try to remove themselves without realising it.
- [ ] A newly-created project (owner is the only member) shows exactly one row — the owner — with the role `Owner`.
- [ ] The list is stable across dialog re-opens (re-opening the surface shows the same roster without a stale or empty intermediate state, assuming no mutations happened elsewhere).

### Add Member (Owner Only)
- [ ] When the current user is the project's owner, the surface exposes an input control accepting an email (or the agreed-upon identifier) and a submit affordance labeled "Add member" (or equivalent) reachable via keyboard.
- [ ] When the current user is NOT the project's owner, the add-member control is either not rendered or is rendered disabled with an accessible explanation ("Only the project owner can add members" or equivalent).
- [ ] Submitting with a blank or whitespace-only input is disallowed (submit button disabled, or a field-level error appears); no API call is issued.
- [ ] Submitting with a syntactically invalid email surfaces a field-level error ("Enter a valid email" or equivalent) and does not issue an API call.
- [ ] Submitting with a valid input issues exactly one add-member API call per click. Rapid double-clicks do not produce two calls (the control is disabled while the request is in flight).
- [ ] While the add request is in flight, the submit control shows a loading indicator and the input remains visible with its typed value so the user sees exactly what was submitted.
- [ ] On success, the new member row appears in the list within the same change-detection pass as the success response (no page refresh required); the input clears and receives focus so the owner can add another.
- [ ] On a backend `400 "user not found"`, a user-readable error appears near the input ("We couldn't find a user with that email" or equivalent); the input retains the typed value so the owner can correct it; no row is added.
- [ ] On a backend `400 "already a member"`, a user-readable error appears ("That user is already a member of this project" or equivalent); no duplicate row is added.
- [ ] On a backend `403`, a user-readable error appears ("Only the project owner can add members" or equivalent); no row is added. (This is a safety net for a non-owner who reached the surface via URL manipulation.)
- [ ] On a backend `404` (project not found — e.g., the project was deleted in another tab), a user-readable error appears ("This project no longer exists" or equivalent); no row is added; navigating back to `/dashboard` does not crash.
- [ ] On a network error (status 0), a user-readable "couldn't reach the server" message appears; the input retains its value so the user can retry when connectivity returns.
- [ ] No raw HTTP status codes, URLs, envelope fields, or stack traces are ever rendered to the user.

### Remove Member (Owner Only)
- [ ] When the current user is the project's owner, each non-self, non-owner row exposes a Remove control reachable via keyboard.
- [ ] When the current user is NOT the project's owner, no Remove control is rendered on any row.
- [ ] Activating a Remove control requires a confirmation step before any API call is issued (explicit confirm button, dialog, or equivalent — the exact pattern is a design-spec decision). A single errant click/tap never removes a member.
- [ ] On confirm, exactly one delete-member API call is issued per action.
- [ ] While the remove request is in flight, the row indicates the pending state (disabled, spinner, or equivalent) and the rest of the list remains operable.
- [ ] On success, the row is removed from the list within the same change-detection pass; focus moves to a sensible neighbouring control (next row, add-member input, or the surface's close control) so keyboard users are not stranded.
- [ ] On a backend `400 "cannot remove last owner"`, the row remains, and a user-readable error appears ("You can't remove the last owner of a project" or equivalent).
- [ ] On a backend `403`, the row remains, and a user-readable "only the owner can remove members" message appears.
- [ ] On a backend `404` (member or project not found — e.g., removed concurrently in another tab), the UI tolerates the response gracefully: the row is removed from the local list (or the list is re-fetched) without an error banner, since the end-state matches the user's intent.
- [ ] On a network error, the row is restored to its idle state and a user-readable "couldn't reach the server" message appears; no row is removed optimistically that the server didn't confirm.

### Role & Permission Enforcement
- [ ] Whether the user sees owner-only controls is driven by the project's `role` as returned by the backend (either via `ProjectSummary.role` from the dashboard cache or re-fetched on surface open — tech-spec decision). The UI does not trust a role derived from local state that has never been validated by the server.
- [ ] If the user's role for the project changes while the surface is open (rare — only if the user is demoted in another session), the next mutation attempt from this surface that returns 403 causes the owner-only controls to be hidden/disabled and surfaces the user-readable message. The page does not crash.

### Accessibility
- [ ] Every input has an associated `<label>` or `aria-label`.
- [ ] The member list is marked up with semantic list / table markup such that a screen-reader user can perceive the row count, each member's name, email, and role, and the presence of Remove controls.
- [ ] The surface is fully operable via keyboard: Tab reaches the add-member input, submit, each member row's Remove control (owner only), and the close/Cancel affordance in a logical order; Enter activates the focused control; Escape closes the surface (if modal).
- [ ] If the surface is a modal: focus is trapped within it while open, the first focusable element receives focus on open, and focus returns to the trigger on close.
- [ ] If the surface is a modal: the dialog exposes an accessible name announcing the project it belongs to (e.g., `aria-labelledby` referencing a heading like "Members — {project name}").
- [ ] The remove-confirmation step is announced to screen readers (dialog with accessible name, or a live-region update — design-spec decision) so a keyboard-only user is never uncertain whether the click "took."
- [ ] Color contrast on all text, placeholders, icons conveying meaning, and error messages meets WCAG AA (4.5:1 body, 3:1 large text and meaningful non-text UI).
- [ ] The surface passes `axe-core` with zero critical or serious violations in the "members list loaded" and "add input focused" states.

### Visual Consistency
- [ ] Styling is consistent with the existing dashboard and create-project surfaces (same design tokens, same radius/shadow/spacing scale). No new global SCSS is introduced that is scoped only to this feature.
- [ ] Responsive: on viewports <640px the surface is usable without horizontal scroll, the member list reflows (or scrolls vertically) without truncating critical information, and the add-member control spans the available width.

### Verification
- [ ] `npm run build` succeeds with no new errors or warnings attributable to this feature.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** test failures. Pre-existing failures are documented but not blocking per CLAUDE.md.
- [ ] Unit tests cover, at minimum: (a) owners see add + remove controls, non-owners do not; (b) submitting a valid input calls the add-member endpoint exactly once and renders the returned member row; (c) backend 400 "not found" / "already a member" surfaces the correct user-readable copy and does not add a row; (d) remove requires a confirm step before any API call; (e) remove success removes the row; (f) remove of the last owner surfaces the user-readable copy and leaves the row in place; (g) a non-owner activating the surface sees the roster but no owner-only controls; (h) 401 does not crash the component (interceptor handles redirect).

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)
- [ ] **Single-owner project, owner tries to remove themselves:** backend returns 400 "cannot remove last owner"; UI surfaces the user-readable message, the owner's row remains.
- [ ] **Multi-owner project (if the backend supports it), an owner removes another owner:** treated as a normal remove; the row disappears on success; if the backend rejects (e.g., different invariant), surface the error and keep the row.
- [ ] **Concurrent removal in another tab:** the surface shows a row that no longer exists server-side. Attempting to remove it returns 404; the UI tolerates gracefully (either silently removes locally or re-fetches the list).
- [ ] **Concurrent project deletion in another tab:** the whole project is gone. An add/remove attempt returns 404 project; the UI surfaces a user-readable "this project no longer exists" message; navigating back to `/dashboard` does not crash even though the card for that project may also have vanished (the state service's prepend/remove semantics from #31 handle that).
- [ ] **Project owner's session expires mid-action:** the 401 is handled by the global `authInterceptor`; the surface does not crash during unmount.
- [ ] **Case sensitivity / whitespace in email input:** leading/trailing whitespace is trimmed before submit; case folding is the backend's responsibility (the UI does not normalise further than trim).
- [ ] **Adding a user who is the caller themselves** (caller pastes own email): backend returns "already a member"; UI surfaces that copy. (No special client-side guard is required beyond the generic already-member handling.)
- [ ] **Backend member list is empty on fetch** (theoretically impossible — the owner is always a member — but defensively): UI renders an empty-state message inside the surface rather than crashing.
- [ ] **Re-opening the surface after a failed add/remove:** the surface opens fresh with no leftover error message from the previous session.

### Explicitly out of scope for #33 (handled by other issues or future work)
- **Changing a member's role** (promote member → owner, demote owner → member). The backend does not expose a role-change endpoint in the current API map; future work.
- **Transferring project ownership** to a different user as a single atomic action. Future work.
- **A member removing themselves** ("leave project"). The backend's `DELETE /api/project/{projectId}/members/{userId}` may support it (the API map does not say), but the UX affordance is out of scope for #33.
- **Bulk invites** (paste multiple emails, CSV upload). Not requested.
- **Inviting unregistered users by email** (email-based invitations that send a signup link). Not supported by the backend today; future work.
- **Per-member permission scopes** beyond the `Owner` / `Member` roles exposed by the backend. Not in the current DTO.
- **Audit log of who added/removed whom and when.** Not in the current DTOs.
- **Project-level settings beyond members** (rename, change description, delete the project). These are separate from #33; rename/delete are separate future issues flagged in #32's out-of-scope list.
- **Pagination / search within the member list.** The expected upper bound of members per project is small; if that assumption ever breaks, pagination is a future issue.
- **Assignee picker in tasks** (the downstream consumer of the member list). That belongs to the board / task issues in a later milestone.
- **Analytics / telemetry** on add, remove, confirm, cancel. Not requested.
- **Email / in-app notifications** when a user is added to or removed from a project. Not requested.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
