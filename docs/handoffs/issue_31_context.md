# Feature: Project State Management with Signals

**GitHub Issue:** [#31](https://github.com/Gulybi/KanbAI-Web/issues/31)
**Milestone:** Landing Page & Project Dashboard UI (AI-Driven) (#4)
**Repository:** Gulybi/KanbAI-Web
**Branch (expected):** `31-setup-project-state-management-with-signals`

---

## Business Value

### Who is this for?
- **Authenticated KanbAI users** who already land on the dashboard delivered by #30 and will shortly gain "create", "rename", and "delete" project actions (#32, #33, and later milestones).
- **Frontend developers of downstream features (#32, #33)** who need a single, predictable place to read and mutate the user's project list so that any screen reflecting a project stays in sync automatically.

### Why is it valuable?
Today the dashboard owns the project list *locally*: `DashboardPageComponent` calls `ProjectsApiService.listProjects()` in `ngOnInit` and stores the result inside its own `DashboardViewModel` signal ([KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts:29-56](../../KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts#L29-L56)). That works for a read-only dashboard, but every remaining feature in Milestone #4 mutates the list:
- **#32** creates a project and expects it to appear on the dashboard without a full refetch.
- **#33** adds/removes members from a project and expects the caller's role/membership to reflect in the UI.
- Later, "rename" and "delete" actions will expect the same instant feedback.

Without a central state layer, each new feature has to re-fetch the list or poke into `DashboardPageComponent`'s private signal — both bad. Centralizing project state in a dedicated service:
- Gives every screen a **single source of truth** for "what projects does the current user have access to?".
- Makes mutations (create / update / delete) **instantly visible** across the app (the dashboard, any nav counters, future project switchers).
- Resets cleanly on logout, so a second user on the same browser never sees the previous user's projects.

### What problem does it solve?
1. **Stale UI after mutations.** Without shared state, creating a project in a modal (#32) would require a follow-up refetch or manual signal poking from the dashboard.
2. **Duplicated HTTP traffic.** Multiple screens rendering project info would each hit `GET /api/project` independently.
3. **Leaked session data.** Without an explicit reset hook, project data from user A could linger in memory after logout and briefly render to user B after login.
4. **Milestone blocker.** #32 ("create project modal") and #33 ("manage members UI") are both specified to "call the ProjectService" and "update the signal" — they literally cannot ship without this service existing first.

---

## Current State vs Desired State

### Current State
- **Thin API service only, no cached state.** [KanbAI-Web/src/app/features/projects/services/projects-api.service.ts:7-40](../../KanbAI-Web/src/app/features/projects/services/projects-api.service.ts#L7-L40) exposes exactly one method — `listProjects(): Observable<ProjectSummary[]>` — and does not cache the result. Every call re-hits the backend.
- **Per-component ownership of the project list.** [KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts:29-56](../../KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts#L29-L56) is the sole reader today; the array lives inside a local `DashboardViewModel` discriminated-union signal and dies when the component is destroyed.
- **No CRUD endpoints wired.** `POST /api/project`, `PUT /api/project/{id}`, `DELETE /api/project/{id}` are documented in [.claude/backend_api_map.md:53-61](../../.claude/backend_api_map.md#L53-L61) but have no frontend client yet.
- **A generic state primitive already exists.** [KanbAI-Web/src/app/core/state/base-state.service.ts](../../KanbAI-Web/src/app/core/state/base-state.service.ts) provides a `BaseStateService<T>` abstract class with `signal`-backed state, `setState` / `replaceState` / `select` / `toSignal` helpers, and a reference implementation at [KanbAI-Web/src/app/core/state/example-user-state.service.ts](../../KanbAI-Web/src/app/core/state/example-user-state.service.ts). Nothing in the projects feature uses it yet.
- **Behavior today:** If the user somehow creates a project outside the dashboard, the dashboard still shows the old list until the user manually navigates away and back. If the user logs out and another user logs in on the same browser, the old `DashboardPageComponent` instance is destroyed, so technically the list is gone — but nothing is *guaranteed* to clear it, and downstream features that cache on a service would immediately leak.

### Desired State
- **A single `ProjectStateService` owns the authoritative project list** for the authenticated session. It exposes a read-only `Signal<ProjectSummary[]>` (or equivalent) that any component or service in the app can subscribe to without re-fetching.
- **The service is the only place that calls the project HTTP endpoints.** `ProjectsApiService` either merges into it or is consumed exclusively by it. Components never call `ProjectsApiService` directly after this issue ships.
- **The service supports the four CRUD operations** documented in the backend map: list, create, update, delete. Each mutation method updates the cached signal reactively so any UI bound to the signal refreshes within the same change-detection pass.
- **The dashboard consumes the shared signal** instead of owning a private project array. Load/empty/error/success states remain visible to the user exactly as they are today; only the plumbing changes.
- **The cached list is cleared on logout** so session data does not leak across users on the same browser.
- **Expected user flows:**
  1. A logged-in user lands on the dashboard (#30). The service lazily fetches the list on first read and the grid renders from the shared signal.
  2. A logged-in user opens the future "new project" modal (#32), submits it, and sees their new card appear on the dashboard **without** the dashboard re-fetching or reloading.
  3. A logged-in user triggers a future "rename" or "delete" action on a card. The dashboard reflects the change immediately.
  4. A logged-in user clicks "Log out" (#28). Any subsequent login — same user or different — starts from an empty project cache; no stale data is shown.
  5. If any of the above mutations fails (5xx, 4xx, envelope `success: false`, network error), the cached list remains unchanged from its last known-good state and a user-readable error is surfaced to the caller (modal, card action, etc.) for the UI to display.

---

## Milestone Context

**Milestone #4:** Landing Page & Project Dashboard UI (AI-Driven)

### Prerequisite Issues
- [#29](https://github.com/Gulybi/repoKanbAI-Web/issues/29) — Public Landing Page — **CLOSED** (landing surface exists).
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) — Project Dashboard Component — **CLOSED** (provides `ProjectsApiService`, `ProjectSummary` model, `DashboardPageComponent`, and the `/dashboard` route). The current issue replaces that component's local caching with a shared service.
- Milestone #3 (#23–#28) — **CLOSED** (auth, `authGuard`, `AuthStateService`, JWT interceptor, logout button).

### Downstream Issues (this issue unblocks)
- [#32](https://github.com/Gulybi/KanbAI-Web/issues/32) — "New Project" Modal or Form (**OPEN**) — issue body states: "Upon submission, it should call the ProjectService, update the signal, and automatically close the modal/navigate back to the dashboard." This directly names the service created here.
- [#33](https://github.com/Gulybi/KanbAI-Web/issues/33) — Project Members Management UI (**OPEN**) — will read from the same service to display the selected project and reflect membership changes.

### Related Work / Open Assumptions
- **Backend contract confirmed** against [.claude/backend_api_map.md:53-61, 136-156](../../.claude/backend_api_map.md#L53-L156): all project endpoints are `ApiResponse<T>`-wrapped except auth, path is singular (`/api/project`), `CreateProjectDto` and `UpdateProjectDto` share shape (`{ name, description }`), `ProjectResponseDto` is the DTO returned for list/get/create/update, `DELETE` returns `204` (no body).
- **Existing `BaseStateService<T>` abstraction** may be used to implement the new service. Whether to extend it or compose something feature-local is a **technical decision** for the staff-engineer phase; the context document only requires the external behavior (signal-based, centralized, reset on logout).
- **Logout-reset wiring** is an integration point with `AuthStateService` ([KanbAI-Web/src/app/core/services/auth-state.service.ts](../../KanbAI-Web/src/app/core/services/auth-state.service.ts)). The mechanism (explicit call, effect, or subscription) is a **technical decision** deferred to the staff-engineer phase.
- **What to do with the existing `ProjectsApiService`** (merge into state service, or keep as the HTTP layer underneath) is a **technical decision** deferred to the staff-engineer phase.

---

## Acceptance Criteria

### Centralized Read API
- [ ] A project state service exists in `src/app/features/projects/` (path final name deferred to staff-engineer) whose public surface includes a read-only `Signal<ProjectSummary[]>` named in a way that describes the list (e.g. `projects`).
- [ ] The same service exposes at least two additional read-only signals that the UI can bind to without deriving them: (a) a loading indicator for the list fetch, and (b) the last error message (user-readable string, `null` when no error).
- [ ] Reading the `projects` signal when the service has never fetched returns an empty array (`[]`), not `undefined` and not `null`.
- [ ] `DashboardPageComponent` renders its grid from the shared signal, not from a locally-owned `ProjectSummary[]`. Opening the dashboard still shows the loading skeleton → grid / empty / error sequence exactly as it does today (all ACs of #30 continue to pass).

### Fetch / List
- [ ] A `loadProjects()` (or equivalent imperative trigger) method exists on the service. Calling it sets the loading signal to `true`, calls `GET /api/project`, and on success sets the cached list to the returned array and loading to `false`.
- [ ] When `loadProjects()` succeeds with a non-empty list, the `projects` signal emits the full list exactly once (no duplicate emissions for the same fetch).
- [ ] When `loadProjects()` succeeds with an empty list, the `projects` signal emits `[]` and the downstream UI shows the existing empty state (#30 AC preserved).
- [ ] When `loadProjects()` fails (HTTP non-2xx, network, or envelope `success: false`), the cached list is **not replaced** (remains at its previous value or stays `[]` on first load), the loading signal returns to `false`, and the error signal is set to a user-readable sentence (no raw status codes or stack traces).

### Create
- [ ] A `createProject(input: { name: string; description: string | null })` method exists. On success, the service prepends or appends the newly-created `ProjectSummary` to the cached list and the `projects` signal emits the updated array within the same change-detection pass.
- [ ] After a successful `createProject`, navigating to the dashboard (or already being on it) shows the new project card without any additional `GET /api/project` request.
- [ ] On `createProject` failure (4xx, 5xx, envelope `success: false`, network), the cached list is **not modified**, and the caller receives a user-readable error (as an observable error, thrown promise, or error signal — the exact transport is a tech-spec decision) so the form UI can display it.

### Update
- [ ] An `updateProject(id: string, input: { name: string; description: string | null })` method exists. On success, the matching project in the cached list is replaced with the updated DTO (matched by `id`) and the `projects` signal emits the new array; other projects are untouched.
- [ ] On `updateProject` failure, the cached list is not modified and the caller receives a user-readable error.
- [ ] Calling `updateProject` with an `id` that is not in the cached list is a no-op on the cache but still issues the HTTP request; on success the returned DTO is added to the cache (defensive behavior — prevents the cache from silently dropping a legitimate server response).

### Delete
- [ ] A `deleteProject(id: string)` method exists. On success (`204 No Content`), the project with that `id` is removed from the cached list and the `projects` signal emits the new array.
- [ ] On `deleteProject` failure (403 not owner, 404 not found, network, 5xx), the cached list is not modified and the caller receives a user-readable error; the specific 403 "only owner can delete" case produces a distinct user-readable message so the UI can explain why the action was blocked.

### Session Hygiene
- [ ] When the user logs out (via the existing logout flow from #28), the cached project list is reset to `[]`, the loading signal is `false`, and the error signal is `null`. After a subsequent login by a different user, the first read of `projects` triggers a fresh fetch (or returns `[]` until `loadProjects()` is called — the exact trigger point is a tech-spec decision, but **stale data from the previous user must not be observable**).
- [ ] Navigating to `/login` or `/` while unauthenticated does not cause any `GET /api/project` request to be issued.

### Error Messages (spec-locked)
- [ ] For each HTTP failure mode, the error signal / thrown error carries a user-readable string matching the table in the tech spec that #30 already established (`mapErrorToUserMessage` in [projects-api.service.ts:51-68](../../KanbAI-Web/src/app/features/projects/services/projects-api.service.ts#L51-L68)). Concretely: 0 → "We couldn't reach the server…", 401/403 → "Your session has expired…", ≥500 → "Something went wrong on our end…", other 4xx and envelope-failure → "We couldn't load your projects…" (for list) or an analogous "We couldn't save your project." / "We couldn't delete the project." for mutations — exact wording finalized in the tech/design specs, but each operation produces operation-appropriate copy, never a raw status code.

### Non-Regression
- [ ] `npm run build` succeeds with no new errors or warnings attributable to this feature.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** failures. All tests added in #30 (dashboard page, projects-api service, route guards, auth-routes constant) continue to pass after the dashboard is refactored to consume the shared signal.
- [ ] The service ships with unit tests covering, at minimum: initial `projects` value is `[]`; `loadProjects` happy path and error paths; `createProject` inserts on success and does not mutate on error; `updateProject` replaces by id on success and does not mutate on error; `deleteProject` removes by id on success and does not mutate on error; logout clears the cache.

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)
- [ ] **Double-firing `loadProjects()`** (e.g. the dashboard is mounted twice in quick succession during a route transition): the service must not race — either de-duplicate in-flight requests, or accept that the later response wins, but the final cached list must match the latest successful response (not be overwritten by an earlier one).
- [ ] **Mutation followed immediately by navigation-away**: a `createProject` call that resolves after the user leaves the dashboard must still update the cache so returning to the dashboard shows the new project without a refetch.
- [ ] **Envelope `success: false` on mutation**: treated as a failure; cache unchanged; user-readable error delivered to the caller.
- [ ] **Backend returns an unexpected DTO shape** (missing `id`, etc.): the service must not insert an item without an `id` into the cache. Defensive validation is acceptable — a silent drop plus an error signal is acceptable; a crash is not.
- [ ] **Logout while a fetch is in flight**: the pending request's response must not repopulate the cache after logout clears it.
- [ ] **Delete of a project that is already absent from the cache** (e.g. two tabs racing): `deleteProject` success is tolerated; the cache simply remains without that `id`.

### Explicitly out of scope for #31 (handled by other issues or future work)
- UI changes to `DashboardPageComponent` beyond swapping the data source to the shared signal (no visual redesign, no new empty/error copy — #30's design spec still governs visuals).
- The "new project" modal or form itself (#32).
- The members-management UI and its endpoints (`POST /api/project/{projectId}/members`, `DELETE /api/project/{projectId}/members/{userId}`) — #33.
- Pagination, sorting, filtering, or search over the project list.
- Per-project board navigation, columns, or tasks.
- Optimistic UI (applying a mutation to the cache *before* the server confirms). This issue requires server-confirmation-then-cache-update; optimistic updates can be a follow-up if product requests snappier perceived latency.
- Cross-tab synchronization (e.g. `BroadcastChannel` for updates between browser tabs).
- Offline queueing or background refresh.
- Individual project detail state (selected project, breadcrumbs) — a separate concern that will likely land with #33.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
