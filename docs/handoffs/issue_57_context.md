# Feature: Handle Dashboard Empty State and Remove Unused Sidebar

**GitHub Issue:** [#57](https://github.com/Gulybi/KanbAI-Web/issues/57)
**Milestone:** None (bug / UX regression ticket, adjacent to Milestone #4 "Landing Page & Project Dashboard UI")
**Repository:** Gulybi/KanbAI-Web
**Labels:** `bug`

---

## Business Value

### Who is this for?

- **Brand-new authenticated users** who have just completed registration and have not yet created a project. Today, the moment they land on `/dashboard` with an empty project list, the page never exits its loading indicator — they see an infinite skeleton and no path forward. This is the single most important moment in the product's first-run experience, and it is currently broken.
- **Every authenticated user on every authenticated screen**, who today loses ~240px of horizontal workspace to a sidebar that renders only the static text "Sidebar" and no functional controls. On 1280px laptops (our most common viewport), that is ~19% of the screen taken by empty chrome.
- **Returning users who have deleted all their projects**, who fall into the same empty-list path as new users and hit the same infinite loader.
- **The product/business**, which needs the first post-signup screen to behave correctly. An infinite spinner on the first real interaction after signup is the kind of defect that directly drives churn in the first session.

### Why is it valuable?

- **Restores the first-run experience.** The dashboard is the authenticated home of the product (shipped by issue [#30](https://github.com/Gulybi/KanbAI-Web/issues/30)). A new user who signs up, lands on `/dashboard`, and is met with a spinner that never resolves has no way to discover the "Create your first project" call-to-action that already exists in the codebase ([dashboard-empty-state.component.html](KanbAI-Web/src/app/features/projects/components/dashboard-empty-state/dashboard-empty-state.component.html)) but is never rendered.
- **Reclaims screen real estate on every authenticated screen.** The sidebar is mounted unconditionally in [app.html](KanbAI-Web/src/app/app.html) at `w-60` (240px). It renders no navigation, no filters, no controls — only the placeholder text "Sidebar". Removing it widens the dashboard grid and any future authenticated content on every viewport with no loss of functionality.
- **Removes a dead component from the shell.** [SidebarComponent](KanbAI-Web/src/app/core/layout/sidebar/sidebar.component.ts) has been in the shell since the Milestone #1 scaffolding (issue [#10](https://github.com/Gulybi/KanbAI-Web/issues/10)) but has never been given a purpose. Keeping unused UI in the shell makes the app look unfinished to new users and confuses contributors about where navigation is supposed to live.
- **Completes the dashboard work started in #30.** Issue #30 defined and built the empty-state component; a regression (or bug introduced by a later change) is preventing that component from ever rendering. This ticket closes that gap.

### What problem does it solve?

**Problem A — Infinite loading on empty projects:** A user with zero projects navigates to the dashboard and never sees the "No projects yet / Create your first project" block. The page remains stuck on the skeleton loader indefinitely. The empty-state component exists, the view-model has an `'empty'` branch, and the API returns successfully — yet the empty branch is never reached in this scenario. The user has no affordance to proceed and typically refreshes or leaves.

**Problem B — Unused sidebar consumes screen space:** On every authenticated route (dashboard, board, and any future protected route), a left-hand `<app-sidebar>` renders a 240px-wide dark panel whose only content is the static label "Sidebar" and an HTML comment reading `<!-- Future: Navigation menu will be added here -->`. It provides no value and actively competes with the primary content area for horizontal space.

**Solution:** Make the dashboard reliably reach its empty-state UI when the authenticated user has no projects, and remove the unused sidebar component from the application shell so the main content area uses the full viewport width.

---

## Current State vs Desired State

### Current State

#### A. Dashboard empty-state path

- **Route target:** `/dashboard` → [DashboardPageComponent](KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts) (the authenticated home, set by issue #30).
- **View model:** [DashboardPageComponent](KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts#L52-L71) computes a discriminated-union `vm()` with four variants — `loading`, `success`, `empty`, `error` — declared in [dashboard-view-model.ts](KanbAI-Web/src/app/features/projects/models/dashboard-view-model.ts). The `'empty'` branch is only entered when `hasLoaded === true` **and** `projects.length === 0`. Any other shape falls back to `'loading'`.
- **State plumbing:** [ProjectStateService.loadProjects()](KanbAI-Web/src/app/features/projects/state/project-state.service.ts#L85-L118) is invoked in the dashboard's `ngOnInit`. Its `next` callback is expected to set `{ projects: [], isLoading: false, error: null, hasLoaded: true }` on an empty success — which is the shape the view model requires to reach `'empty'`.
- **Empty-state UI already exists:** [dashboard-empty-state.component.html](KanbAI-Web/src/app/features/projects/components/dashboard-empty-state/dashboard-empty-state.component.html) renders an icon, the heading "No projects yet", a one-sentence explanatory paragraph, and a "Create your first project" CTA that emits `createClick`. The dashboard page is already wired to open the create-project dialog when this event fires.
- **Observed behavior (bug):** A newly registered user with no projects lands on `/dashboard`, the skeleton loader appears, and it stays visible indefinitely. The empty-state block is never shown. No console error is reported by the user. The "Create your first project" affordance is therefore unreachable from the dashboard for any user in the empty-list state.

#### B. Unused sidebar in the application shell

- **Shell layout:** [app.html](KanbAI-Web/src/app/app.html) composes a full-height flex column — navbar on top, then a `flex-1` row containing `<app-sidebar>` (240px wide, `w-60`) and a `<main>` element hosting `<router-outlet>`. The sidebar is mounted on every route unconditionally.
- **Sidebar implementation:** [sidebar.component.ts](KanbAI-Web/src/app/core/layout/sidebar/sidebar.component.ts) is an empty `SidebarComponent` class. Its template [sidebar.component.html](KanbAI-Web/src/app/core/layout/sidebar/sidebar.component.html) contains only a `<p>Sidebar</p>` label and a comment `<!-- Future: Navigation menu will be added here -->`. No `@Input`s, no `@Output`s, no navigation items.
- **References:** The sidebar is imported and registered in [app.ts](KanbAI-Web/src/app/app.ts#L4,L8) and mounted in `app.html`. Grepping the codebase, no other component or test reads from the sidebar or depends on its presence apart from the shell itself and the scaffolded `sidebar.component.spec.ts`.
- **Observed behavior:** On every authenticated route the left 240px of the viewport is occupied by an empty dark panel labelled "Sidebar". On a 1280px viewport this reduces the usable dashboard grid area by roughly 19%.

### Desired State

#### A. Dashboard empty-state path

- **Zero-project path terminates correctly.** When an authenticated user with zero projects navigates to `/dashboard`, the skeleton loader is replaced — within the same time budget as the non-empty path (≤2 seconds under a normal backend response) — by the existing empty-state block containing the heading "No projects yet", the explanatory sentence, and the "Create your first project" CTA.
- **CTA is functional.** Clicking "Create your first project" opens the existing create-project dialog (already wired via `createClick` in the dashboard page). After a successful creation, the dashboard transitions out of the empty state into the project grid without requiring a page refresh.
- **Other dashboard states are unaffected.** The success, error, and initial-loading paths continue to behave exactly as defined in issue #30's acceptance criteria. This ticket changes only the behavior of the empty-list path; it does not redesign the dashboard.
- **Recovery from delete-all.** A user who deletes every remaining project from the dashboard ends up on the empty-state block (not a stuck spinner, not a blank grid).

#### B. Unused sidebar in the application shell

- **Sidebar is removed from the shell.** The application shell no longer renders `<app-sidebar>`. The `<main>` element hosting the router outlet occupies the full viewport width below the navbar on every route.
- **Layout adjusts cleanly.** The dashboard grid, the board view, and every other authenticated route render correctly in the reclaimed horizontal space at all supported breakpoints (≥1024px desktop, 640–1023px tablet, <640px mobile) with no horizontal scroll, no clipped content, and no overflowing cards.
- **Sidebar files are deleted.** The `SidebarComponent` (TypeScript, template, styles, spec) and its import in the shell are removed. No dead references remain in the codebase.
- **No regression on other routes.** The public routes (`/`, `/login`, `/register`) continue to render the navbar and their existing content; removing the sidebar must not shift or break the landing or auth screens (whose current appearance the sidebar already occupies visual space on today).

---

## Milestone Context

### Prerequisite Issues
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) — Implement Project Dashboard Component — **CLOSED** ✓ (introduced the dashboard page, the four-state view model, and the empty-state component that is currently unreachable).
- [#31](https://github.com/Gulybi/KanbAI-Web/issues/31) — Setup Project State Management with Signals — **CLOSED** ✓ (introduced `ProjectStateService` and the `hasLoaded` flag the view model keys off of).
- [#32](https://github.com/Gulybi/KanbAI-Web/issues/32) — Create "New Project" Modal or Form — **CLOSED** ✓ (provides the create-project dialog that the empty-state CTA will open).
- [#10](https://github.com/Gulybi/KanbAI-Web/issues/10) — Create the Application Shell (Base Layout) and Routing — **CLOSED** ✓ (introduced the sidebar into the shell; this ticket removes it).

### Related / Adjacent Issues
- [#56](https://github.com/Gulybi/KanbAI-Web/issues/56) — Fix Header Navigation, Auth Buttons, and Logo Routing — **MERGED** ✓ on the current branch. Touches the other half of the app shell (navbar). Sidebar removal in this ticket should not regress the navbar behavior delivered by #56.
- [#55](https://github.com/Gulybi/KanbAI-Web/issues/55) — Restore Login UI and Fix Authentication Flow — **MERGED** ✓. Ensures the authentication flow that seats a user on `/dashboard` is working; relevant because the bug is reproduced immediately after a fresh signup.

### Downstream Issues (unblocked or influenced by this fix)
- Any future issue that introduces a real left-rail navigation will reintroduce a sidebar deliberately, with a documented purpose. Removing the empty placeholder now does **not** preclude that work — a future ticket can re-add a sidebar designed for its actual content.

### Open Assumptions
- The root-cause mechanism that leaves the dashboard stuck on loading (rather than reaching `'empty'`) is deferred to the staff-engineer phase. The bug may live in `ProjectStateService.loadProjects` (e.g., a logout-guard short-circuit that skips the `hasLoaded: true` write), in the view-model branch precedence, in the API response shape, or in a race between the auth state and the initial fetch. This context document specifies only the observable requirement: an authenticated user with zero projects must reach the empty-state UI.
- The removal of the sidebar is assumed safe because no other component reads from it. If the staff-engineer phase discovers a hidden dependency (tests, e2e fixtures, CSS selectors in other components), that dependency should be updated or removed as part of this ticket.

---

## Acceptance Criteria

### A. Dashboard empty-state path

- [ ] When an authenticated user whose account has zero projects navigates to `/dashboard`, the skeleton loader is replaced by the empty-state block within 2 seconds under a normal backend response (same budget as the non-empty path established by #30).
- [ ] The empty-state block that renders in this case contains: (a) a visible heading with the text "No projects yet", (b) at least one sentence of explanatory body text, and (c) a button labelled "Create your first project" that is reachable via keyboard Tab and shows a visible focus indicator.
- [ ] Clicking (or activating via Enter/Space on) the "Create your first project" button opens the existing create-project dialog. Closing the dialog without creating anything returns the page to the empty-state block; creating a project successfully replaces the empty-state block with the project grid containing at least that newly-created project — without a page refresh.
- [ ] A user who deletes their final remaining project from the dashboard sees the empty-state block (not a persistent spinner, not a blank grid) within 2 seconds of the deletion succeeding.
- [ ] The non-empty success path is unchanged: an authenticated user with ≥1 project continues to see the project grid, and every acceptance criterion from issue #30 continues to hold.
- [ ] The error path is unchanged: on a non-2xx response or network failure, the dashboard continues to show the existing error block with its Retry affordance.
- [ ] No console errors or warnings are produced on the empty-state path from route activation through CTA click through dialog close.

### B. Unused sidebar removal

- [ ] On every authenticated route (`/dashboard`, `/board`, and any further protected route), no element matching `app-sidebar`, `<aside>`, or a 240px dark left-hand panel is present; the main content area visually begins at the left edge of the viewport immediately below the navbar.
- [ ] On every public route (`/`, `/login`, `/register`), the navbar is still visible at the top of the viewport, and the routed content renders below it without a left-hand dark panel.
- [ ] The `SidebarComponent` is no longer registered in the root `App` component's `imports` array, and the `<app-sidebar>` element is no longer present in `app.html`.
- [ ] The files under `KanbAI-Web/src/app/core/layout/sidebar/` (component TS, template, styles, and spec) are deleted from the repository; no dangling references to `SidebarComponent` remain anywhere in the codebase.
- [ ] The dashboard grid renders correctly at ≥1024px, 640–1023px, and <640px viewports with the reclaimed horizontal space — no horizontal page scroll, no clipped cards, no cards overflowing the viewport.
- [ ] The board view (`/board`), the landing page (`/`), the login page (`/login`), and the register page (`/register`) each render without visual regression attributable to the sidebar removal. No content is cut off, duplicated, or reflowed into an unreadable layout.

### Verification

- [ ] `npm run build` succeeds with no new errors or warnings attributable to this ticket's changes.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** test failures. Pre-existing failures (if any) are documented per CLAUDE.md but not blocking.
- [ ] The existing dashboard test suite continues to cover loading, success, empty, and error states; the empty-state test exercises the real path an authenticated-with-zero-projects user takes (not a manually-forced view-model mock), so that a recurrence of the infinite-loading bug would cause a test failure.
- [ ] The previously existing `sidebar.component.spec.ts` is removed alongside the component — the suite does not reference a deleted class.

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)

- [ ] **Zero-projects user on slow network (>2s response):** Skeleton remains visible until the response arrives; on an empty success the page transitions to the empty-state block (not to an error block, not stuck on the skeleton).
- [ ] **Zero-projects user on network failure:** The error block (not the empty-state block) is shown; Retry works.
- [ ] **User deletes their last project:** The page transitions from the grid directly to the empty-state block without an intermediate stuck-spinner flash.
- [ ] **User creates a project from the empty-state CTA, then cancels / deletes it again:** The page returns to the empty-state block cleanly each time.
- [ ] **Page refresh while authenticated with zero projects:** Empty-state block renders reliably on every refresh; the bug does not re-appear on reload.

### Explicitly out of scope for #57

- Designing or implementing a replacement sidebar (left-rail navigation). Removing the placeholder now is not a decision against having a sidebar in the future; that work belongs to a dedicated ticket.
- Redesigning the empty-state visual language (icon, copy, layout). The existing empty-state component's content is accepted as-is; this ticket only ensures it renders when it is supposed to.
- Changes to the dashboard's loading, success, or error states beyond ensuring they are not regressed.
- Navbar changes (delivered separately by #56).
- Route-level changes (no new routes are added or removed).
- Changes to the backend API contract for `/api/project`.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
