# Feature: Project Dashboard Component

**GitHub Issue:** [#30](https://github.com/Gulybi/KanbAI-Web/issues/30)
**Milestone:** Landing Page & Project Dashboard UI (AI-Driven) (#4)
**Repository:** Gulybi/KanbAI-Web
**Branch:** `30-implement-project-dashboard-component`

---

## Business Value

### Who is this for?
**Authenticated KanbAI users** — anyone who has completed the login or registration flow delivered in Milestone #3 (#23–#28). The dashboard is the first screen they land on after signing in.

### Why is it valuable?
The dashboard is the authenticated home of the product. Right now, a successful login drops the user onto an empty `/board` page with no sense of "what do I have, and where do I go next?". Issue #30 replaces that void with a portfolio view of the user's projects — the natural jumping-off point for every other authenticated workflow in the app (opening a board, inviting members, creating a project). Without it:
- New users hit a blank screen immediately after signup and churn.
- Returning users cannot locate their work — there is no project index.
- Downstream features in this milestone (#31 project state, #32 "new project" modal, #33 member management) have nowhere to live in the UI.

### What problem does it solve?
1. **No project index.** The user has no way to see what projects they belong to or own.
2. **Broken first-run experience.** Post-authentication, the user sees nothing meaningful.
3. **Milestone blocker.** #31, #32, and #33 all assume a dashboard surface exists to plug into.

---

## Current State vs Desired State

### Current State
- **Authenticated landing route:** `AUTH_HOME_ROUTE = '/board'` in [KanbAI-Web/src/app/core/constants/auth-routes.ts:12](KanbAI-Web/src/app/core/constants/auth-routes.ts#L12). A comment on line 4 explicitly flags that this target "shifts (e.g., from `/board` to `/dashboard` once #30 ships)".
- **Current route target:** [KanbAI-Web/src/app/app.routes.ts:23-28](KanbAI-Web/src/app/app.routes.ts#L23-L28) wires `/board` to [BoardPageComponent](KanbAI-Web/src/app/features/board/board-page/board-page.component.ts), which is an **empty OnPush component** (11 lines, no template content).
- **No project feature module exists.** `src/app/features/` contains only `auth/`, `board/`, and `landing/`. There is no `projects/` directory, no project model, no project service.
- **No backend API contract documented.** `docs/handoffs/backend_api_map.md` does not exist, so the exact shape of the "projects" endpoint and DTO is not yet recorded. The backend is assumed reachable under `http://localhost:5257/api/...` (same origin as [AuthService](KanbAI-Web/src/app/core/services/AuthService.ts#L10)).
- **Authenticated user is visible app-wide:** the navbar already binds to `AuthService.currentUser` (issue #28 shipped).
- **Behavior today:** After login, the user is redirected to `/board` and sees a blank page. There is no affordance to discover, open, or create a project.

### Desired State
- **A dashboard page is the new authenticated home.** Authenticated users landing on the app's home route see a list/grid of the projects they have access to.
- **Each project is represented as a "Project Card"** showing, at minimum:
  - Project **title**
  - Project **description**
  - Project **creation date** (human-readable)
- **Visual style:** Tailwind CSS, consistent with the existing landing page and auth pages.
- **Expected user flow:**
  1. User logs in (or is already authenticated) and navigates to the authenticated home route.
  2. A loading indicator appears while projects are being fetched.
  3. On success: a grid of Project Cards renders. The user can visually scan their projects.
  4. On empty (no projects yet): a clear empty-state message appears, inviting the user to create their first project. (The actual "create" action is out of scope for #30 — delivered by #32.)
  5. On error: a user-readable error message appears with a retry affordance.
- **Protected access:** Unauthenticated visitors hitting the dashboard route are redirected to `/login` by the existing `authGuard`.

---

## Milestone Context

**Milestone #4:** Landing Page & Project Dashboard UI (AI-Driven)

### Prerequisite Issues
- [#29](https://github.com/Gulybi/KanbAI-Web/issues/29) — Create Public Landing Page (Home View) — **CLOSED** ✓ (merged; establishes the public `/` entry)
- Milestone #3 JWT authentication (#23–#28) — **CLOSED** ✓ (provides `authGuard`, `AuthService`, `currentUser`, JWT interceptor, navbar session state)

### Downstream Issues (this issue unblocks)
- [#31](https://github.com/Gulybi/KanbAI-Web/issues/31) — Setup Project State Management with Signals (OPEN) — will centralize the project state the dashboard consumes.
- [#32](https://github.com/Gulybi/KanbAI-Web/issues/32) — Create "New Project" Modal or Form (OPEN) — will be launched from a CTA rendered on the dashboard.
- [#33](https://github.com/Gulybi/KanbAI-Web/issues/33) — Implement Project Members Management UI (OPEN) — will be reachable from an individual Project Card.

### Related Work / Open Assumptions
- The backend endpoint shape for "list projects I have access to" is **not yet documented**. `backend_api_map.md` does not exist. The staff-engineer phase will need to invoke the `backend-api-bridge` agent (per CLAUDE.md) to scout the API contract before implementation.
- The route path (`/dashboard` vs. keeping `/board` and retargeting it, vs. adding a new path) is a **technical decision** deferred to the staff-engineer phase. This document only requires that the dashboard be the authenticated home.
- Card click behavior (navigating into a specific project's board) is **out of scope for #30** — there is no board-per-project route yet. Cards are display-only in this issue.

---

## Acceptance Criteria

### Route & Access
- [ ] Navigating to the authenticated home route as an authenticated user renders a dashboard page with the heading `Projects` (or equivalent visible H1) within 200ms of route activation.
- [ ] Navigating to the dashboard route while unauthenticated causes a redirect to `/login?returnUrl=<path>` (same behavior as `/board` today, enforced by `authGuard`).
- [ ] Navigating to `/` while authenticated results in the user seeing the dashboard (via the existing `unauthGuard` → `AUTH_HOME_ROUTE` redirect chain, which must continue to terminate on the dashboard).

### Data Loading
- [ ] Between route activation and API response, a visible loading indicator (e.g., spinner or skeleton cards) is shown in place of the project grid.
- [ ] On successful API response with ≥1 project, the loading indicator is removed and a grid of Project Cards is rendered within 200ms of response arrival.
- [ ] On successful API response with 0 projects, the loading indicator is replaced by an empty-state block containing: (a) a heading such as "No projects yet", (b) one sentence of explanatory text, (c) a "Create your first project" call-to-action element (the click handler is a no-op placeholder for #32; this AC verifies only that the element is present and keyboard-focusable).
- [ ] On API error (non-2xx response or network failure), the loading indicator is replaced by an error block containing: (a) a user-readable message (no raw stack traces or status codes exposed to the user), (b) a "Retry" button that re-triggers the fetch when clicked or activated via Enter/Space.

### Project Card Content
- [ ] Each Project Card displays the project **title** as a visible heading element.
- [ ] Each Project Card displays the project **description** as visible body text. If the description is empty or null, the card renders a neutral placeholder (e.g., "No description") rather than a blank region.
- [ ] Each Project Card displays the project **creation date** formatted as a human-readable date (e.g., `Apr 29, 2026`), not as a raw ISO timestamp.
- [ ] Every Project Card is reachable via keyboard Tab navigation and shows a visible focus indicator when focused.

### Layout & Responsive Design
- [ ] On viewports ≥1024px, Project Cards render in a grid of at least 3 columns.
- [ ] On viewports 640px–1023px, Project Cards render in a grid of at least 2 columns.
- [ ] On viewports <640px, Project Cards stack into a single column with no horizontal scroll.
- [ ] On viewports <640px, all card content (title, description, creation date) remains fully visible without truncation that hides entire fields (overflow ellipsis on long titles/descriptions is acceptable).

### Styling & Accessibility
- [ ] All styling is implemented with Tailwind CSS utility classes, consistent with existing landing/auth pages (no new global SCSS introduced outside the component's stylesheet).
- [ ] Heading hierarchy is semantic: one `<h1>` for the page title; card titles use `<h2>` or `<h3>`; no heading levels are skipped.
- [ ] Text color contrast on card content meets WCAG AA (4.5:1 for body text, 3:1 for large text).
- [ ] The page passes `axe-core` with zero critical or serious violations.
- [ ] No console errors or warnings are produced by the dashboard component under the golden path (load → render ≥1 project → idle).

### Verification
- [ ] `npm run build` succeeds with no new errors or warnings attributable to the dashboard feature.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** test failures (pre-existing failures are documented but not blocking per CLAUDE.md).
- [ ] A unit test exists covering at minimum: loading state renders, success state renders cards, empty state renders empty block, error state renders error block with retry.

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)
- [ ] **Very long project title (>80 chars):** Title truncates with ellipsis rather than breaking card layout.
- [ ] **Very long description (>400 chars):** Description clamps to a bounded number of lines (e.g., 3) with ellipsis; full text is accessible via `title` attribute or equivalent.
- [ ] **Missing or null `creationDate`:** Card displays a fallback label (e.g., "—") rather than "Invalid Date" or "NaN".
- [ ] **Slow API response (>2s):** Loading indicator remains visible; no layout shift when the response eventually arrives.
- [ ] **Expired JWT mid-fetch:** Existing JWT interceptor handles 401 redirection; the dashboard need not implement its own auth-expiry handling, but must not crash (error block is acceptable).

### Explicitly out of scope for #30 (handled by other issues)
- Creating a new project (#32).
- Managing project members (#33).
- Centralized project state service (#31).
- Opening a specific project's Kanban board (no board-per-project route exists yet).
- Editing or deleting a project.
- Pagination, sorting, or filtering the project list.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
