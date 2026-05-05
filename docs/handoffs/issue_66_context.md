# Feature: Cannot Open Kanban Board View from Project Dashboard

**GitHub Issue:** #66
**Milestone:** _(none set on the issue)_
**Label:** `bug`
**Assignee:** Gulybi

## Business Value

**Who is this for?**
Every authenticated user of KanbAI — both project owners and project members — who reaches the dashboard at `/dashboard`, sees their list of projects, and expects to open one of them to actually work on its Kanban board.

**Why is it valuable?**
The dashboard and the board are the two halves of the product. The dashboard lists the user's projects; the board (`/board/:projectId`, delivered across #45, #46, and #47) is where work actually happens — columns, task cards, drag-and-drop, real-time updates. Today there is a navigation gap between them: a user can create a project, see it on the dashboard, but has no working way to open its board. Clicking a project card does nothing. That turns the entire board feature — the product's core — into dead code from a real user's point of view.

This bug undoes the visible value of #47 ("Implement Visual Drag-and-Drop"), #46 ("Integrate Real-time Events"), and #45 ("SignalR Client Service") for anyone who starts from the dashboard: those features exist, work end-to-end when reached directly by URL, but are unreachable through normal navigation. A returning user has no way to get to their board except typing the URL by hand.

**What problem does it solve?**
- Restores the primary user journey `login → dashboard → open project → work on board`. Without this, the product has no path from "I logged in" to "I can use the Kanban board I came here to use".
- Converts existing, merged, tested backend/frontend board work from technically-functional to user-reachable. No new board features are needed; the board itself already works when loaded directly.
- Closes a credibility gap: today a user who creates a new project on the dashboard watches it appear, then clicks it, then sees nothing happen — a silent failure with no error, no loading indicator, no feedback. Silent no-ops on a primary action erode trust in the entire app.

**Business impact:**
- Unblocks the core product demo: "create project → open board → drag a card" is currently broken at step 2.
- Eliminates the single worst perceived-quality defect a new user can hit in the first 60 seconds of using the app (click the thing you just made, nothing happens).
- Removes a hidden blocker for every downstream dashboard-entry-point feature (recent activity, pinned boards, notifications that deep-link to a board) that will assume "opening a project navigates to its board" is already solved.

## Current State

- **Dashboard renders project cards, but the cards are not activatable as navigation affordances.** `src/app/features/projects/components/project-card/project-card.component.html` renders an `<article class="project-card" tabindex="0" [attr.aria-labelledby]="titleId()">` with a title, description, role badge, a "Manage members" icon button (owner-only, `(click)="onManageMembers($event)"`), and a created-date meta row. The `<article>` has `tabindex="0"` (so it is focusable), but there is **no `(click)`, no `(keydown)`, no `routerLink`, and no `[routerLink]` anywhere on the card or any of its children except the owner-only Manage button.** The component class (`project-card.component.ts`) exposes exactly one `@Output`: `manageMembersClick`. There is no `@Output() openBoard` or equivalent.
- **Dashboard page does not listen for "open project" either.** `src/app/features/projects/dashboard-page/dashboard-page.component.ts` imports `ProjectGridComponent`, forwards `manageMembersClick` to `openMembersDialog(project)`, and does nothing else with the card. `Router` / `RouterLink` is not imported in the dashboard page. A grep across `src/app/features/projects` for `board/`, `navigateByUrl`, or `routerLink` returns **no matches** — no code path exists anywhere in the projects feature to send the user to `/board/:projectId`.
- **The project grid is a passive relay.** `src/app/features/projects/components/project-grid/project-grid.component.ts` only re-emits the `manageMembersClick` output; it does not emit any project-open event and does not subscribe to one.
- **The board route itself works.** `src/app/app.routes.ts` (lines 30–35) defines `{ path: 'board/:projectId', loadComponent: ... BoardPageComponent, canActivate: [authGuard] }`. Pasting `/board/{a-real-project-id}` into the address bar loads the board correctly: `BoardPageComponent.ngOnInit` reads `projectId` from the route paramMap, calls `boardState.enterBoard(projectId)`, fetches columns via `GET /api/column/project/{projectId}` through `ColumnsApiService.getColumnsForProject`, and renders the drag-and-drop board per #47. The board and its data-fetch pipeline are not broken — only the navigation entry is missing.
- **Net user-observable behavior today:**
  1. User logs in, is sent to `/dashboard`.
  2. User either sees their existing projects or clicks "Create project" and creates one; the new card appears on the dashboard (behaviour from #55-series tickets).
  3. User clicks anywhere on a project card, or presses `Enter`/`Space` while the card is focused. **Nothing happens** — no navigation, no dialog, no loading indicator, no console error, no network request. The click is absorbed silently by the `<article>` element.
  4. Exception: if the user happens to click the small owner-only "Manage members" icon in the card header, the members dialog opens (unrelated, already-working feature from #56/#57).
  5. The user has no in-app way to reach `/board/:projectId`.

## Desired State

After this bug is fixed, clicking (or keyboard-activating) a project card on the dashboard sends the user to that project's Kanban board, and the board loads and renders as it already does for a direct URL visit.

**Expected behaviors (UI-observable):**

*Primary activation path*
- On the dashboard, clicking anywhere on a project card — excluding the owner-only "Manage members" icon button — navigates the browser to `/board/{project.id}`, where `{project.id}` is the `id` field of that card's `ProjectSummary`. The navigation uses Angular's Router (client-side route change, no full-page reload).
- During the navigation, the browser's URL bar updates to the new path, and the back button returns the user to `/dashboard` with their previously-scrolled state preserved at least to the extent Angular's default scroll behavior provides.
- After navigation, the board page renders according to #47's acceptance criteria: columns load from `GET /api/column/project/{projectId}`, tasks render in `taskOrder`, drag-and-drop works. None of that behavior is redefined by this ticket; it is expected to already work once reached.

*Keyboard activation*
- With a project card focused via keyboard (`Tab` reaches it because `tabindex="0"` is already set), pressing `Enter` activates the card and navigates to `/board/{project.id}`. Pressing `Space` also activates the card (standard button-like activation) and navigates to the same URL.
- The focus on the card is visibly distinct from the non-focused state (existing focus-visible styling must remain in place or be added as part of making the card behave like a button).
- The "Manage members" icon button inside owner-only cards remains independently keyboard-activatable via `Tab` into it and `Enter`/`Space` to open the members dialog, without first triggering board navigation.

*Nested interactive-element isolation*
- Clicking the owner-only "Manage members" icon button does **not** navigate to the board. The existing dialog-open behavior is preserved. Event propagation from the icon button to the card's click handler must be stopped (mechanism is an implementation detail; observable requirement is: owner clicks the Manage icon → dialog opens, URL stays on `/dashboard`).
- Clicking or selecting text inside the card (e.g. drag-selecting the project name) does not trigger navigation. Specifically, a user who press-holds and drags across the title to copy it must not be navigated away as soon as they release the mouse.

*Project identity correctness*
- The navigation target for a card is always that card's own `project.id`. If the dashboard shows three projects A, B, C, clicking card B navigates to `/board/{B.id}` and never to `/board/{A.id}` or `/board/{C.id}`.
- Project ids are GUIDs/strings; they must be passed unaltered into the URL (no truncation, no lower-casing, no manual URL composition that could mis-escape characters). Whatever encoding behaviour `RouterLink` or `Router.navigate` applies is acceptable; hand-rolled string concatenation that skips encoding is not.

*Board fetch handling*
- After landing on `/board/:projectId`, the board's own error/empty handling from #47 applies unchanged. If `GET /api/column/project/{projectId}` returns a 404 (project deleted between the dashboard fetch and the click) or 403 (the user was removed from the project), the board shows its existing error state. This ticket does not need to pre-validate or pre-fetch anything from the dashboard; the failure surfaces on the board page as it does today for a direct URL visit.
- This ticket does not change the dashboard's behaviour after a failed navigation attempt — the user is on the board page in its error state, not stranded somewhere in between.

*No regressions on the dashboard*
- The dashboard's existing states (loading skeleton, empty state, error panel, success grid from #30-series tickets) continue to render identically.
- The "Create project" button, the members dialog for owners, the role badge variants, the "No description" / "—" fallbacks, and the created-date rendering are all unchanged.
- The project card's visual design — layout, colours, badge, hover/focus appearance — is preserved or improved to convey clickability, but no tokens from the design system are invented by this ticket. (If a `cursor: pointer` or role change is introduced to convey clickability, any new styling decisions beyond obvious button-affordance cues are deferred to the design spec in Phase 3.)

**Expected user flow:**
1. User opens the app, signs in, lands on `/dashboard`. The dashboard loads and shows three project cards: "Alpha" (owner), "Beta" (member), "Gamma" (owner).
2. User clicks the body of the "Beta" card. The browser URL changes to `/board/{beta.id}`. The board renders with Beta's columns and tasks per #47.
3. User presses the browser Back button. The URL returns to `/dashboard`, the dashboard re-renders (cached state from the project store; no reload spinner unless data genuinely needs refresh), and "Beta" is still visible.
4. User `Tab`s to the "Gamma" card, presses `Enter`. The URL changes to `/board/{gamma.id}`. The board renders.
5. User presses Back, then `Tab`s to the "Alpha" (owner) card, then `Tab`s one more time into the card's "Manage members" icon button, then presses `Enter`. The members dialog opens. The URL **stays** on `/dashboard`.
6. User dismisses the dialog, focus returns to a sensible anchor on the dashboard per CDK Dialog's `restoreFocus: true`, and clicking on the body of the "Alpha" card (not the Manage icon) then navigates to `/board/{alpha.id}`.
7. User navigates back to the dashboard, clicks a project that was deleted a moment ago by another owner. The board page loads, its column fetch returns 404, and the board's existing error state from #47 is shown. No uncaught errors appear in the console.

**Out of scope for this issue (belongs elsewhere):**
- **New dashboard features** — no pinning, no "recent boards", no per-card context menus. The only new behaviour on the dashboard is "clicking the card opens the board".
- **Board page changes** — the board itself already works when URL-entered. Any defect in how the board renders, fetches columns, or handles errors is covered by #47 and subsequent board tickets, not here.
- **Deep-link preservation / return-to-dashboard-with-state** beyond Angular Router defaults — if scroll-position restoration turns out to require extra work, that is a separate ticket.
- **Pre-fetching or cache-warming board data from the dashboard** — the board fetches its own columns on entry; duplicating that from the dashboard is premature optimisation.
- **Route guards specific to the board** (e.g. "is user still a member of this project before entering?") — the existing `authGuard` and the board's own API 403/404 handling are sufficient. Membership-guard tickets, if any, are their own scope.
- **Card visual redesign** — this ticket must leave the card's existing look intact apart from minimal, obvious affordance cues (cursor, focus ring) needed to communicate "this is clickable". Broader redesign is deferred to the web-designer phase.
- **Analytics / telemetry on project-open** — not required by this bug.

## Milestone Context

The issue has **no milestone set** at the time of writing. It is labelled `bug`. Given its dependencies and downstream impact, it logically belongs to the same release as the board work (#45, #46, #47) that it unblocks for dashboard-originated users.

**Prerequisite Issues (must be closed for this ticket to be meaningful):**
- #30-series (dashboard project list and project cards) — **CLOSED**. Provides the `ProjectCardComponent`, `ProjectGridComponent`, and the `ProjectSummary` model whose `id` field is the navigation target.
- #45 — Setup SignalR Client Service — **CLOSED** (`2f3b4de`). Provides the transport the board uses once reached.
- #46 — Integrate Real-time Events with State Management — **CLOSED**. Provides `BoardStateService.enterBoard` / `leaveBoard`, which `BoardPageComponent.ngOnInit` / `ngOnDestroy` already call.
- #47 — Implement Visual Drag-and-Drop — **CLOSED** (`ed47bae`). Provides the rendered board UI this ticket sends the user into. Without #47 the board would be blank on arrival and this bug would only swap "nothing happens on click" for "blank page on click" — still bad. With #47 merged, the fix is genuinely end-to-end: click → navigate → usable board.
- Authentication (login + `authGuard` on `/board/:projectId`) — **CLOSED**. No additional guard work needed.

**Downstream Issues (blocked or degraded by this bug):**
- No open GitHub issues reference #66 directly at time of writing. However, every dashboard-entry-point feature that is yet to be filed — recent-activity lists, notifications that deep-link to a board, "my assigned tasks" widgets — depends on "clicking a project affordance navigates to its board" being solved. Today every such feature would have to implement navigation itself, which risks three divergent implementations.
- More broadly, the milestone-5 board work (#45/#46/#47) is effectively undiscoverable by normal user behaviour until this bug is fixed. Any product demo, QA exploratory test, or user-acceptance walk-through starting from login will stop at the dashboard.

**Related Work:**
- `docs/handoffs/issue_47_context.md` — details the board page this ticket hands the user off to. Acceptance criteria in #47 presume the user has already reached `/board/:projectId`; this ticket supplies the "how".
- `docs/handoffs/issue_46_tech_spec.md` — board lifecycle (`enterBoard` / `leaveBoard`, `JoinProjectGroup` / `LeaveProjectGroup`) is invoked automatically by `BoardPageComponent`; no dashboard-side coordination is required.
- `src/app/app.routes.ts` — authoritative on the `/board/:projectId` path name and its guard. Any fix must hand-off to this exact path, not invent a new one.
- `src/app/features/projects/components/project-card/project-card.component.html` — the element that today has `tabindex="0"` but no click handler. The primary surface of the fix.
- `src/app/features/projects/dashboard-page/dashboard-page.component.ts` — already receives `manageMembersClick` from the grid; the parallel `openBoard(project)` (or `routerLink`-in-card) plumbing lives here or in the card itself. The exact architecture (event-up vs. `RouterLink` inside the card) is the staff-engineer's call.

## Acceptance Criteria

*Mouse activation — primary fix*
- [ ] On the dashboard, clicking the body of any project card (anywhere inside the `<article class="project-card">` except inside the "Manage members" icon button) changes the browser URL to `/board/{project.id}` using Angular's Router (no full-page reload, verifiable by absence of a document-level navigation in DevTools Network).
- [ ] After the URL change, the board renders according to #47's existing behaviour: columns load from `GET /api/column/project/{projectId}` and the drag-and-drop surface appears. No additional blank / intermediate / flashing state is introduced by this ticket.
- [ ] The navigation target is always the clicked card's own `project.id` — confirmed by clicking each of at least three cards in a populated dashboard in turn and observing that each target URL carries the corresponding id unmodified.
- [ ] The browser Back button returns the user to `/dashboard` and the dashboard re-displays the project grid without requiring a full reload. (This follows from using Router navigation; the criterion exists to pin the behaviour so a future "window.location.href =" regression is caught.)

*Keyboard activation*
- [ ] A project card receives focus via `Tab` from a preceding focusable element on the dashboard (e.g. the "Create project" button or the previous card). The focus state is visibly distinct from the unfocused state.
- [ ] Pressing `Enter` while a project card is focused navigates the user to `/board/{project.id}` with the same end result as a mouse click.
- [ ] Pressing `Space` while a project card is focused also navigates the user to `/board/{project.id}` (matching standard button-like activation semantics).
- [ ] Pressing any other key (arrow keys, letter keys, `Esc`) while a project card is focused does not trigger navigation and does not throw.

*Nested interactive-element isolation*
- [ ] On an owner-owned project card, clicking the "Manage members" icon button opens the members dialog (existing #56/#57 behaviour) and does **not** change the URL away from `/dashboard`. This must hold for both mouse click and keyboard activation of the icon button.
- [ ] Keyboard-`Tab`ping reaches the "Manage members" icon button as a separate focus stop from the card itself. Activating the icon button while it (not the outer card) is focused opens the dialog and does not navigate to the board.

*Non-navigation interactions preserved*
- [ ] A user who presses the mouse on the card title, drags across it to select text, and releases is not navigated to the board. (Navigation fires on a real click/activation, not on mouse-up at the end of a text selection. The exact mechanism — e.g. consulting `window.getSelection()` or relying on platform click semantics — is an implementation detail; the observable requirement is that text selection inside a card does not cause navigation.)
- [ ] A right-click (context menu) on a project card does not navigate the user to the board.

*No dashboard regressions*
- [ ] The dashboard's loading skeleton, empty state, and error state continue to render identically in their respective conditions. None of them gain or lose the click-to-navigate behaviour — only the success-state project cards do.
- [ ] The "Create project" primary action on the dashboard header continues to open the create-project dialog and does not navigate to any board.
- [ ] The members dialog opened from an owner card continues to function (add member, remove member, close) exactly as before. Closing the dialog returns focus to a dashboard anchor per CDK Dialog's `restoreFocus: true`.
- [ ] Visual design of the project cards is unchanged apart from any minimal affordance cues (cursor pointer, focus ring) needed to communicate clickability. No colours, sizes, typography, spacing, or shadow tokens are altered. Anything beyond minimal affordance is deferred to the web-designer phase.

*Correctness under edge data*
- [ ] A project whose `name` contains characters that would require URL-encoding (accents, spaces) is still reachable: the id — not the name — is in the URL, and the navigation is performed via `RouterLink` or `Router.navigate(['/board', project.id])` so encoding is handled by Angular.
- [ ] If the user clicks a card for a project that was deleted on the backend between the dashboard fetch and the click, the board page loads and shows its existing error state (401/403/404 per `mapColumnErrorToUserMessage`). The dashboard does not need to prevent the click.

*Cross-cutting guarantees*
- [ ] No uncaught errors appear in the browser DevTools console when clicking a card, pressing `Enter` on a focused card, pressing `Space` on a focused card, clicking the owner-only Manage icon, or pressing Back from the board.
- [ ] No PII, no raw project payload, and no JWT is written to `console.log` by any click/navigation code introduced by this ticket, consistent with the project's logging/privacy standard.
- [ ] `npm run build` succeeds with the fix in place.
- [ ] `npm run test -- --watch=false` runs to completion. Any test failures tied to the newly modified `ProjectCardComponent` / dashboard page / project grid (for example, specs that previously asserted "the card has no `(click)` handler") are updated to reflect the fixed behaviour. Pre-existing failures unrelated to this ticket are documented, not fixed.

### Quality Gate Check

Each criterion above has been reviewed for:
- **Observable:** Every item is verifiable in the browser — URL change in the address bar, DevTools Network tab (no full-page reload), DevTools Elements tab (focus state), DevTools Console (no errors), or by direct visual confirmation on the dashboard / board. No criterion depends on hidden framework state.
- **Specific:** Concrete activation surfaces (card body vs. Manage icon), concrete keys (`Enter`, `Space`, `Esc`), concrete target URL shape (`/board/{project.id}`), concrete navigation mechanism contract (Angular Router, not a full reload). No "feels responsive" or "works intuitively" language.
- **Testable:** QA can drive each path deterministically — mouse click, keyboard `Tab`+`Enter`, keyboard `Tab`+`Space`, right-click, text selection drag, owner Manage-icon click, Back button. Edge-data criteria are testable by pre-seeding a project with accented characters and by simulating a 404 on the columns endpoint.
- **Edge cases covered:** owner vs. member card, Manage icon nested inside a clickable card, text selection inside the card, right-click, deleted project between fetch and click, URL-encoding of the id, Back navigation, all three dashboard non-success states, and the "no regression" guarantees across dashboard visuals, other dashboard actions, and the members dialog.

---

*"The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification."*
