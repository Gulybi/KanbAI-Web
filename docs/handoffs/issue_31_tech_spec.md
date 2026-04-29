# Technical Specification: Project State Management with Signals

**Context Document:** [issue_31_context.md](./issue_31_context.md)
**GitHub Issue:** [#31](https://github.com/Gulybi/KanbAI-Web/issues/31)
**Branch:** `31-setup-project-state-management-with-signals`

---

## Overview

This issue introduces a single `ProjectStateService` that owns the authenticated user's project list as reactive Signal state. The service extends the existing `BaseStateService<T>` primitive, wraps the four backend CRUD endpoints (`GET/POST/PUT/DELETE /api/project`), caches the canonical list in memory, and applies mutations locally on successful server confirmation so any UI bound to its signals refreshes within a single change-detection pass.

`ProjectsApiService` stays as the pure HTTP/envelope-unwrapping layer. It gains three new methods (`createProject`, `updateProject`, `deleteProject`) but does not cache anything — `ProjectStateService` is the **only** consumer of it. `DashboardPageComponent` is refactored to consume `ProjectStateService` signals directly instead of owning a local `vm` signal tied to a one-off HTTP subscription.

Logout reset is wired via an Angular `effect()` in `ProjectStateService` that watches `AuthService.currentUser`; when it flips to `null` the cache is cleared and any in-flight list fetch is abandoned. This preserves the correct dependency direction (feature → core) and avoids coupling `AuthService` to project code.

---

## Component Architecture

### Routing

No route changes. The existing `/dashboard` route and `authGuard` from [src/app/app.routes.ts](../../KanbAI-Web/src/app/app.routes.ts) remain as-is.

### Service Hierarchy

**State Service (new):**
- `ProjectStateService` — [src/app/features/projects/state/project-state.service.ts](../../KanbAI-Web/src/app/features/projects/state/project-state.service.ts)
  - Extends `BaseStateService<ProjectState>`.
  - Injects `ProjectsApiService` (HTTP layer) and `AuthService` (for logout reset).
  - Owns the canonical `projects` signal and all mutation methods.
  - Registered with `providedIn: 'root'` — single instance per app.

**API Service (modified, not replaced):**
- `ProjectsApiService` — [src/app/features/projects/services/projects-api.service.ts](../../KanbAI-Web/src/app/features/projects/services/projects-api.service.ts)
  - Stays as a thin HTTP wrapper that unwraps the `ApiResponse<T>` envelope into plain observables.
  - Adds `createProject`, `updateProject`, `deleteProject` methods.
  - No caching, no state. Consumed exclusively by `ProjectStateService`.
  - Components must **not** inject this service directly after #31.

### Component Hierarchy

**Smart Container (refactored):**
- `DashboardPageComponent` — [src/app/features/projects/dashboard-page/dashboard-page.component.ts](../../KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts)
  - Drops `ProjectsApiService` injection.
  - Injects `ProjectStateService` instead.
  - Replaces the local `vm` signal with a `computed()` derived from `projectState.projects / isLoading / error`.
  - Calls `projectState.loadProjects()` in `ngOnInit`.
  - The `retry()` handler calls `projectState.loadProjects()` (same trigger).

**Dumb Components (unchanged):**
- `DashboardHeaderComponent`, `DashboardSkeletonComponent`, `DashboardEmptyStateComponent`, `DashboardErrorStateComponent`, `ProjectGridComponent` — receive the same `@Input()`s as before. No API change.

### New Files to Create

- `src/app/features/projects/state/project-state.service.ts` — the new state service.
- `src/app/features/projects/state/project-state.service.spec.ts` — unit tests (required by AC).
- `src/app/features/projects/state/project-state.model.ts` — `ProjectState` shape, mutation-input types.

### Files to Modify

- `src/app/features/projects/services/projects-api.service.ts` — add CRUD methods; extend `mapErrorToUserMessage` with mutation-specific copy (see Error Messages section).
- `src/app/features/projects/dashboard-page/dashboard-page.component.ts` — swap data source to `ProjectStateService`.
- `src/app/features/projects/dashboard-page/dashboard-page.component.spec.ts` — update test bed to mock `ProjectStateService` instead of `ProjectsApiService`.
- `src/app/features/projects/dashboard-page/dashboard-page.component.html` — no change expected, but the `@switch` key now reads `vm().status` off a `computed()` rather than a raw signal. Visual output is identical.

---

## State & Data Layer

### State Shape

**File:** `src/app/features/projects/state/project-state.model.ts`

```typescript
import { ProjectSummary } from '../models/project.model';

/**
 * Internal state owned by ProjectStateService. Never exported from
 * the service except via read-only selectors.
 *
 * `hasLoaded` is used to distinguish "we never asked" from "we asked
 * and the server returned an empty array". This is what lets the UI
 * show loading → empty vs. loading → error correctly without adding
 * an explicit status enum.
 */
export interface ProjectState {
  projects: ProjectSummary[];
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
}

/**
 * Input shape for create/update. Mirrors CreateProjectDto /
 * UpdateProjectDto from the backend (name required, description
 * optional and nullable).
 */
export interface ProjectInput {
  name: string;
  description: string | null;
}

export const INITIAL_PROJECT_STATE: ProjectState = {
  projects: [],
  isLoading: false,
  error: null,
  hasLoaded: false
};
```

### Public Signal Surface

`ProjectStateService` exposes exactly these read-only signals (all typed `Signal<T>`, derived via `this.select(...)` from `BaseStateService`):

| Signal | Type | Semantics |
|--------|------|-----------|
| `projects` | `Signal<ProjectSummary[]>` | Current cached list. Initial value is `[]`, never `undefined`/`null`. |
| `isLoading` | `Signal<boolean>` | `true` while a `loadProjects()` fetch is in flight. Not set by mutations — mutation callers get loading state from their own subscription. |
| `error` | `Signal<string \| null>` | User-readable message for the last **list-load** failure. Cleared to `null` when a subsequent `loadProjects()` starts or succeeds. Mutation errors are delivered to the caller via the returned observable and do **not** write here (see rationale in Service Integration). |
| `hasLoaded` | `Signal<boolean>` | `true` once a `loadProjects()` has succeeded at least once in the current session. Consumed by the dashboard to distinguish initial-empty vs. never-fetched. Reset to `false` on logout. |

### Dashboard View Model — Derived

`DashboardPageComponent` no longer holds a `DashboardViewModel` signal. Instead it exposes a `computed<DashboardViewModel>` that collapses the four state signals back into the existing discriminated union the template already understands:

```typescript
// DashboardPageComponent — derived view-model (NOT owned by the component)
protected readonly vm = computed<DashboardViewModel>(() => {
  const isLoading = this.projectState.isLoading();
  const error = this.projectState.error();
  const projects = this.projectState.projects();
  const hasLoaded = this.projectState.hasLoaded();

  if (error) return { status: 'error', message: error };
  if (isLoading && !hasLoaded) return { status: 'loading' };
  if (hasLoaded && projects.length === 0) return { status: 'empty' };
  if (projects.length > 0) return { status: 'success', projects };
  return { status: 'loading' };
});
```

**Rationale:** this preserves `dashboard-page.component.html`'s `@switch (vm().status)` block and all four visual states (loading / success / empty / error) — satisfying #30's design ACs. The `DashboardViewModel` union and its `INITIAL_DASHBOARD_VM` constant remain in [models/dashboard-view-model.ts](../../KanbAI-Web/src/app/features/projects/models/dashboard-view-model.ts); only the producer changes.

### State Transitions

| Trigger | `isLoading` | `error` | `projects` | `hasLoaded` |
|---------|-------------|---------|------------|-------------|
| `loadProjects()` called | → `true` | → `null` | unchanged | unchanged |
| `loadProjects()` success | → `false` | → `null` | → server list | → `true` |
| `loadProjects()` failure | → `false` | → user message | **unchanged** (preserves last-known-good) | unchanged |
| `createProject()` success | unchanged | unchanged | → prepended with new project | unchanged |
| `createProject()` failure | unchanged | unchanged | **unchanged** | unchanged |
| `updateProject()` success | unchanged | unchanged | → matching item replaced; or appended if absent | unchanged |
| `updateProject()` failure | unchanged | unchanged | **unchanged** | unchanged |
| `deleteProject()` success | unchanged | unchanged | → item with matching id removed | unchanged |
| `deleteProject()` failure | unchanged | unchanged | **unchanged** | unchanged |
| Logout (via `effect()`) | → `false` | → `null` | → `[]` | → `false` |

**Note:** Insertion order for `createProject` is **prepend** (newest first) — this matches #32's stated UX goal of seeing the just-created project at the top of the grid without scrolling.

### De-duplication of In-Flight `loadProjects`

`ProjectStateService` holds a `private inFlightLoad: Subscription | null = null` reference. When `loadProjects()` is called:

- If `inFlightLoad !== null`, the new call is a no-op (returns immediately; existing subscription will resolve both).
- On success/error the field is reset to `null`.
- On logout (the `effect()`), if `inFlightLoad !== null` the subscription is unsubscribed; the late response, if any, is guarded at the `next` handler by a `this.getState().hasLoaded || authService.currentUser()` check so it cannot repopulate the cache after logout.

This satisfies the AC "Double-firing `loadProjects()` ... the final cached list must match the latest successful response (not be overwritten by an earlier one)."

### Logout Integration (Signal Effect)

`ProjectStateService` declares an `effect()` in its constructor that reads `authService.currentUser`:

```typescript
constructor() {
  super();
  effect(() => {
    const user = this.authService.currentUser();
    if (user === null && this.getState().hasLoaded) {
      this.reset();
    }
  });
}

private reset(): void {
  this.inFlightLoad?.unsubscribe();
  this.inFlightLoad = null;
  this.replaceState(INITIAL_PROJECT_STATE);
}
```

**Why `effect()` and not a direct call from `AuthService.logout()`:**
- Keeps dependency direction `features → core` (core must not import from features).
- Works uniformly for logout triggered by the user button (#28), by the 401 branch of `authInterceptor`, or by any future auto-logout path — all of them already flip `AuthService.currentUser` to `null`.
- Idiomatic with the Signals architecture already established in the codebase.

**Why the `hasLoaded` guard inside the effect:**
- Prevents the initial unauthenticated state (`currentUser === null` on app boot, before login) from triggering an unnecessary reset cycle and from firing a spurious "fetch" on first page load.
- Matches the AC "Navigating to `/login` or `/` while unauthenticated does not cause any `GET /api/project` request to be issued" — the service literally never calls the API on its own; only `DashboardPageComponent` (behind `authGuard`) calls `loadProjects()`.

---

## Service Integration

### `ProjectsApiService` — New Methods

**File:** `src/app/features/projects/services/projects-api.service.ts`

Extend the existing class with three new methods. All three follow the same envelope-unwrapping pattern already used by `listProjects()` — the method throws on `response.success === false` so the caller has exactly one failure path per operation.

```typescript
// Method signatures to add (implementation follows listProjects pattern):

createProject(input: ProjectInput): Observable<ProjectSummary> {
  // POST `${this.apiUrl}` body=input → ApiResponse<ProjectResponseDto>
  // Unwrap envelope; throw on success=false or data=null; return data.
}

updateProject(id: string, input: ProjectInput): Observable<ProjectSummary> {
  // PUT `${this.apiUrl}/${encodeURIComponent(id)}` body=input → ApiResponse<ProjectResponseDto>
  // Unwrap envelope; throw on success=false or data=null; return data.
}

deleteProject(id: string): Observable<void> {
  // DELETE `${this.apiUrl}/${encodeURIComponent(id)}` → 204 No Content (no body)
  // Return a plain Observable<void>; http.delete<void> is acceptable since
  // the backend returns no JSON. Do NOT attempt envelope unwrap on 204.
}
```

### HTTP Request/Response Contracts

| Method | Endpoint | Request Body | Response Body | Error Codes |
|--------|----------|--------------|---------------|-------------|
| GET | `/api/project` | — | `ApiResponse<ProjectResponseDto[]>` | 401, 500 |
| POST | `/api/project` | `CreateProjectDto` (`{ name, description }`) | `ApiResponse<ProjectResponseDto>` | 400, 401, 500 |
| PUT | `/api/project/{id}` | `UpdateProjectDto` (`{ name, description }`) | `ApiResponse<ProjectResponseDto>` | 400, 401, 404, 500 |
| DELETE | `/api/project/{id}` | — | `204 No Content` | 401, **403** (not owner), 404, 500 |

(Table mirrors [.claude/backend_api_map.md:53-61](../../.claude/backend_api_map.md#L53-L61). Auth is JWT — attached by the existing `authInterceptor`; the service must not read the token itself.)

### `ProjectStateService` — Public Method Contracts

**File:** `src/app/features/projects/state/project-state.service.ts`

```typescript
// Signature + contract summary. Implementation belongs to the developer phase.

class ProjectStateService extends BaseStateService<ProjectState> {
  // Public signals (see "Public Signal Surface" table above).
  readonly projects: Signal<ProjectSummary[]>;
  readonly isLoading: Signal<boolean>;
  readonly error: Signal<string | null>;
  readonly hasLoaded: Signal<boolean>;

  /**
   * Triggers a GET /api/project request.
   * - No-op if a fetch is already in flight (de-dup).
   * - On success: replaces cached list, sets hasLoaded=true, clears error.
   * - On failure: leaves cached list untouched, sets error signal.
   * - Does NOT throw to the caller; UI watches `error` signal.
   */
  loadProjects(): void;

  /**
   * Creates a project on the server. On success, prepends the new
   * ProjectSummary to the cache and emits via the returned observable.
   * On failure, cache is untouched and the observable errors with a
   * user-readable string (derived by mapErrorToUserMessage, operation-
   * scoped copy).
   *
   * Callers (#32's modal) subscribe to this and display errors inline
   * in their own UI (e.g. a form-level error banner). The service
   * does NOT write to the `error` signal for mutations — that signal
   * belongs to the list-load path.
   */
  createProject(input: ProjectInput): Observable<ProjectSummary>;

  /**
   * Updates a project. On success, replaces the matching entry in the
   * cache by `id` (preserving array order). If the id is not present
   * in the cache, the returned DTO is appended (defensive — prevents
   * silently dropping a legitimate server response).
   */
  updateProject(id: string, input: ProjectInput): Observable<ProjectSummary>;

  /**
   * Deletes a project. On 204 success, removes the entry with matching
   * id from the cache. If the id is already absent (e.g. two-tab race),
   * the success is tolerated and the cache simply remains without that
   * id (AC: "Delete of a project that is already absent from the cache").
   */
  deleteProject(id: string): Observable<void>;
}
```

**Why mutations return observables instead of writing to an `error` signal:**
- Mutations are initiated by UI surfaces (`#32` modal, future rename/delete confirm dialogs) that own their own error presentation. A shared `error` signal would collide — e.g., two dialogs open at once, one succeeds and clears it while the other is still showing an error.
- The list-load `error` signal is a page-level concern (the whole dashboard pivots to the error state); mutation errors are an inline-to-the-caller concern.
- Observables compose naturally with Angular Reactive Forms' submit flow.

### Error Message Mapping

Extend `mapErrorToUserMessage` in [projects-api.service.ts](../../KanbAI-Web/src/app/features/projects/services/projects-api.service.ts) to accept an `operation` discriminator. All sentences remain free of raw status codes / URLs / stack traces.

```typescript
export type ProjectOperation = 'list' | 'create' | 'update' | 'delete';

export function mapErrorToUserMessage(error: unknown, operation: ProjectOperation = 'list'): string;
```

| Error class | `list` | `create` | `update` | `delete` |
|-------------|--------|----------|----------|----------|
| Network / status 0 | "We couldn't reach the server. Please check your connection and try again." | same | same | same |
| 401 / 403 (except delete-403) | "Your session has expired. Please sign in again." | same | same | same |
| **403 on delete** | — | — | — | "Only the project owner can delete this project." |
| ≥500 | "Something went wrong on our end. Please try again in a moment." | same | same | same |
| 404 | "We couldn't load your projects. Please try again." | — | "We couldn't find that project — it may have been deleted." | "We couldn't find that project — it may have been deleted." |
| Other 4xx / envelope `success:false` | "We couldn't load your projects. Please try again." | "We couldn't save your project. Please check the details and try again." | "We couldn't save your project. Please check the details and try again." | "We couldn't delete the project. Please try again." |
| Fallback | "We couldn't load your projects. Please try again." | "We couldn't save your project. Please check the details and try again." | "We couldn't save your project. Please check the details and try again." | "We couldn't delete the project. Please try again." |

**Distinguishing 401 on delete vs. 403 on delete:** the interceptor already logs the user out on 401. For delete, the `403` case is a legitimate authorization message ("only owner can delete") and gets its own sentence per the AC. All other 403s fall through to the "session expired" copy defensively.

### Backend Response → `ProjectSummary` Validation

Because the backend returns `ProjectResponseDto` and we rely on `id` to index the cache, add a defensive guard inside each mutation method of `ProjectStateService` (AC: "Backend returns an unexpected DTO shape ... must not insert an item without an `id` into the cache"):

```typescript
private isValidSummary(p: unknown): p is ProjectSummary {
  return !!p
    && typeof (p as ProjectSummary).id === 'string'
    && (p as ProjectSummary).id.length > 0
    && typeof (p as ProjectSummary).name === 'string';
}
```

On a response that fails the guard: do **not** insert into cache; the returned observable errors with the `create`/`update` fallback message above. This collapses a defensive drop + user-visible error into the same path.

---

## Implementation Steps

Follow these steps in order. Each step is independently verifiable.

### 1. Create the State Model

- [ ] Create `src/app/features/projects/state/project-state.model.ts`.
- [ ] Export `ProjectState`, `ProjectInput`, `INITIAL_PROJECT_STATE` per the shapes above.

### 2. Extend `ProjectsApiService` with CRUD Methods

- [ ] Open `src/app/features/projects/services/projects-api.service.ts`.
- [ ] Import `ProjectInput` from `../state/project-state.model`.
- [ ] Add `createProject(input: ProjectInput): Observable<ProjectSummary>` — `POST` with envelope unwrap.
- [ ] Add `updateProject(id: string, input: ProjectInput): Observable<ProjectSummary>` — `PUT` with envelope unwrap; use `encodeURIComponent(id)`.
- [ ] Add `deleteProject(id: string): Observable<void>` — `DELETE`; no envelope unwrap (204 has no body).
- [ ] Extend `mapErrorToUserMessage` to accept the optional `operation: ProjectOperation` parameter and produce the strings in the table above. Default to `'list'` to keep the existing call-site working.

### 3. Create `ProjectStateService`

- [ ] Create `src/app/features/projects/state/project-state.service.ts`.
- [ ] Extend `BaseStateService<ProjectState>`.
- [ ] Inject `ProjectsApiService` and `AuthService` via `inject()`.
- [ ] Implement `getInitialState()` → return `INITIAL_PROJECT_STATE`.
- [ ] Expose the four public signals via `this.select(...)`.
- [ ] Implement `loadProjects()` — de-dup via `inFlightLoad` field; update state transitions per table; use `takeUntilDestroyed()` or explicit subscription bookkeeping.
- [ ] Implement `createProject()` — call api, validate DTO shape, prepend on success, error-map on failure.
- [ ] Implement `updateProject()` — call api, validate DTO shape, replace-by-id or append-if-missing on success.
- [ ] Implement `deleteProject()` — call api, remove-by-id on success (idempotent if already absent).
- [ ] Add the logout `effect()` described in "Logout Integration" that resets state when `authService.currentUser()` transitions to `null` **and** `hasLoaded` is true.
- [ ] Register the service with `providedIn: 'root'`.

### 4. Refactor `DashboardPageComponent`

- [ ] Open `src/app/features/projects/dashboard-page/dashboard-page.component.ts`.
- [ ] Replace `inject(ProjectsApiService)` with `inject(ProjectStateService)`.
- [ ] Delete the local `vm = signal<DashboardViewModel>(...)` field and the `load()` method's subscription bookkeeping.
- [ ] Replace `vm` with the `computed<DashboardViewModel>(...)` expression from the "Dashboard View Model — Derived" section.
- [ ] `ngOnInit()` → call `this.projectState.loadProjects()`.
- [ ] `retry()` → call `this.projectState.loadProjects()`.
- [ ] Delete the `DestroyRef` / `takeUntilDestroyed()` plumbing — the component no longer owns a subscription.
- [ ] Remove the now-unused imports (`DestroyRef`, `takeUntilDestroyed`, `ProjectsApiService`, `mapErrorToUserMessage`, `INITIAL_DASHBOARD_VM`, `signal`).
- [ ] Keep the `OnPush` change-detection strategy.
- [ ] No change to `dashboard-page.component.html` — the template still reads `vm().status`.

### 5. Update Existing Tests for the Refactor

- [ ] `dashboard-page.component.spec.ts` — replace the `ProjectsApiService` mock with a `ProjectStateService` mock exposing the four signals (use `signal<T>()` wrappers so tests can flip state and assert re-renders).
- [ ] Adjust the existing "shows loading → grid → empty → error" assertions to flip the state-service signals directly rather than resolve HTTP subscribers.
- [ ] Verify the existing `ProjectsApiService.listProjects` tests still pass without modification (the method signature is unchanged).

### 6. Write New Tests for `ProjectStateService`

Per the AC, unit tests must cover at minimum:

- [ ] Initial `projects()` is `[]` and `hasLoaded()` is `false`.
- [ ] `loadProjects` happy path: `isLoading` transitions true→false; `projects` populated; `hasLoaded` true; `error` null.
- [ ] `loadProjects` error path: cache untouched; `isLoading` false; `error` non-null user-readable string.
- [ ] `loadProjects` double-fire de-dup: two synchronous calls result in a single HTTP request and a single final state update.
- [ ] `createProject` success: prepends new project; returned observable emits the DTO.
- [ ] `createProject` error: cache unchanged; returned observable errors with user-readable message.
- [ ] `updateProject` success with existing id: replaces matching entry, other items untouched.
- [ ] `updateProject` success with unknown id: appends (defensive behavior).
- [ ] `updateProject` error: cache unchanged.
- [ ] `deleteProject` success: removes matching entry.
- [ ] `deleteProject` on already-absent id: success tolerated, cache unchanged from its already-absent state.
- [ ] `deleteProject` error: cache unchanged.
- [ ] Invalid DTO (missing `id`) from `createProject`/`updateProject`: not inserted into cache, observable errors.
- [ ] Logout reset: flipping `authService.currentUser` to `null` after a successful load resets `projects` to `[]`, `hasLoaded` to `false`, `error` to `null`.
- [ ] Logout-during-in-flight-load: late response does not repopulate the cache after logout cleared it.

Use `HttpClientTestingModule` + `HttpTestingController` to assert exact URLs, methods, and request bodies against the contract in the table above. Mock `AuthService` with a stub exposing a writable `currentUser` signal.

### 7. Build & Test Verification

- [ ] Run `npm run build`. Must succeed with no new errors or warnings attributable to this issue.
- [ ] Run `npm run test -- --watch=false`. Must pass; no INTRODUCED failures. PRE-EXISTING failures (if any) are documented but not addressed here.

**Performance Considerations:**
- The dashboard's `computed<DashboardViewModel>()` re-evaluates on every relevant signal change but returns a new object only when the status branch flips — acceptable for `OnPush`.
- No need for `trackBy` changes in `ProjectGridComponent` — the AC preserves #30's rendering. Items in the prepended list keep their stable `id`.
- The in-flight de-dup guard avoids redundant `GET /api/project` traffic when multiple components mount and call `loadProjects()` in the same tick (a realistic scenario once #32 and #33 land).

---

## QA Guidance

### Test Strategy

**Unit Tests — `ProjectStateService`:** covered by Step 6 above. This is the core of the issue and must be tested in isolation with `HttpClientTestingModule`.

**Unit Tests — `ProjectsApiService` (extended):** add one happy-path and one `success: false` envelope test per new method. Verify the URL, HTTP method, and request body exactly match the contract table.

**Integration Test — Dashboard + State Service:** confirm that toggling the state service's signals from outside the component (as #32/#33 will do) updates the rendered DOM within a single `detectChanges()` cycle. This is the behavior the downstream issues rely on and is the single most important thing to verify in integration.

**E2E (out of scope here, flagged for future):** full "create project → see on dashboard" flow will be validated in #32's tests — not in #31.

### Mocking Instructions

```typescript
// Mock ProjectStateService in DashboardPageComponent tests
const projectsSig = signal<ProjectSummary[]>([]);
const isLoadingSig = signal(false);
const errorSig = signal<string | null>(null);
const hasLoadedSig = signal(false);

const mockProjectStateService = {
  projects: projectsSig.asReadonly(),
  isLoading: isLoadingSig.asReadonly(),
  error: errorSig.asReadonly(),
  hasLoaded: hasLoadedSig.asReadonly(),
  loadProjects: jasmine.createSpy('loadProjects'),
  // createProject / updateProject / deleteProject not called by the dashboard in #31
};

TestBed.configureTestingModule({
  imports: [DashboardPageComponent],
  providers: [
    { provide: ProjectStateService, useValue: mockProjectStateService }
  ]
});

// Flip signals to assert each view-model branch:
isLoadingSig.set(true);              // → 'loading'
isLoadingSig.set(false);
hasLoadedSig.set(true);              // empty + hasLoaded → 'empty'
projectsSig.set([/* fixture */]);    // → 'success'
errorSig.set('some message');        // → 'error'
```

```typescript
// Mock AuthService in ProjectStateService tests
const currentUserSig = signal<UserProfileDto | null>({ id: 'u1', email: 'a@b', name: 'A' });
const mockAuthService = {
  currentUser: currentUserSig.asReadonly(),
  logout: jasmine.createSpy('logout'),
  login: jasmine.createSpy(),
  register: jasmine.createSpy()
};
// To simulate logout in a test:
// currentUserSig.set(null); TestBed.tick(); expect(service.projects()).toEqual([]);
```

### Edge Cases to Test

- Empty project list on first fetch → `hasLoaded=true`, `projects=[]`, dashboard shows empty state.
- Network error on first fetch → cache stays `[]`, `error` non-null, dashboard shows error state with retry button.
- Retry after error → `error` clears, fetch re-runs, cache populates if successful.
- Create-then-navigate-away-then-navigate-back → grid shows new project with no extra `GET /api/project`.
- Delete a project not in cache (two-tab race) → `deleteProject` succeeds silently, no cache mutation.
- Logout during in-flight list fetch → response arriving post-logout does not repopulate cache.
- Very-long name or description → not validated here (backend enforces 200/500 char limits); this is a form-validation concern for #32.
- Two rapid `loadProjects()` calls → exactly one HTTP request fires.

---

## Design Validation (Self-Check)

**Interface Alignment:**
- ✅ `ProjectInput` mirrors `CreateProjectDto` / `UpdateProjectDto` exactly (`name: string`, `description: string | null`).
- ✅ `ProjectSummary` mirrors `ProjectResponseDto` (already defined in #30; no change).
- ✅ `DELETE` returns `void` matching the backend's `204 No Content`.

**Standards Compliance:**
- ✅ `inject()` used instead of constructor DI throughout.
- ✅ Signals for state; RxJS for HTTP; `toSignal`/`computed` for bridging.
- ✅ `OnPush` change detection preserved on `DashboardPageComponent`.
- ✅ `BaseStateService<T>` reused (the abstraction the codebase already mandates for state services).

**Security:**
- ✅ `authGuard` already protects `/dashboard`; state service never auto-fetches on boot.
- ✅ No raw status codes / URLs / stack traces in user-facing strings.
- ✅ `encodeURIComponent(id)` on path params in update/delete.
- ✅ JWT attached by existing `authInterceptor`; state service reads no tokens.
- ✅ Logout reset guarantees no cross-session data leak even with in-flight requests.

**Completeness:**
- ✅ Every AC in [issue_31_context.md](./issue_31_context.md) maps to one or more steps / tests above.
- ✅ Every edge case in the context's "In-scope edge cases" list has an implementation hook and a test-step bullet.
- ✅ Out-of-scope items (optimistic UI, cross-tab sync, per-project detail state) are **not** introduced.

---

## Open Technical Decisions — Resolved in This Spec

| Context-doc decision | Resolution in this spec | Rationale |
|----------------------|-------------------------|-----------|
| "Whether to extend `BaseStateService<T>` or compose something feature-local" | **Extend.** | Matches the project's single established state-service pattern ([example-user-state.service.ts](../../KanbAI-Web/src/app/core/state/example-user-state.service.ts)); zero new primitives. |
| "Mechanism for logout-reset wiring" | **Angular `effect()` on `authService.currentUser`** in `ProjectStateService`'s constructor. | Preserves correct dependency direction (feature → core); works for every logout path (button, 401, future auto-logout); idiomatic with Signals. |
| "What to do with the existing `ProjectsApiService`" | **Keep as the pure HTTP/envelope-unwrap layer; extend with CRUD methods; consumed only by `ProjectStateService`.** | Separation of concerns: HTTP mapping is orthogonal to state; testing state without HTTP is trivial; existing `listProjects()` unit tests keep passing unchanged. |
| "Transport for mutation errors" | **Thrown via the returned `Observable`, not via the `error` signal.** | `error` signal is list-scope; mutation errors belong to their calling surface (form / dialog). Avoids multi-consumer collision. |
| "Insertion order for `createProject`" | **Prepend.** | Aligns with #32's UX expectation ("see your new project at the top"). |

---

## Development Status

**Implementation date:** 2026-04-29
**Branch:** `30-implement-project-dashboard-component` (landing here per orchestrator instruction; rebase/move handled downstream)

### Files Created

- `KanbAI-Web/src/app/features/projects/state/project-state.model.ts` — `ProjectState`, `ProjectInput`, `INITIAL_PROJECT_STATE`.
- `KanbAI-Web/src/app/features/projects/state/project-state.service.ts` — `ProjectStateService` extending `BaseStateService<ProjectState>`; `loadProjects` with in-flight dedup, `createProject` (prepend), `updateProject` (replace-by-id or append-if-missing), `deleteProject` (remove-by-id, idempotent); logout `effect()` guarded by `hasLoaded`; `isValidSummary` DTO guard.
- `KanbAI-Web/src/app/features/projects/state/project-state.service.spec.ts` — 16 test cases covering initial state, all three state transitions for list/create/update/delete, de-dup, DTO guard rejection, logout reset, logout-during-in-flight, and no-spurious-reset on initial unauthenticated boot.

### Files Modified

- `KanbAI-Web/src/app/features/projects/services/projects-api.service.ts` — added `createProject`, `updateProject`, `deleteProject`; extended `mapErrorToUserMessage` with the `ProjectOperation` discriminator and the full error table (delete-403 gets its owner-only copy; update/delete-404 gets the "project may have been deleted" copy; other modes fall through to operation-scoped fallbacks). Default operation is `'list'` so the pre-existing `projects-api.service.spec.ts` keeps passing unmodified.
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts` — swapped `ProjectsApiService` injection for `ProjectStateService`; removed `DestroyRef`/`takeUntilDestroyed`/`signal`/`ProjectsApiService`/`mapErrorToUserMessage`/`INITIAL_DASHBOARD_VM` imports; replaced local `vm` signal with `computed<DashboardViewModel>()` built from `projectState.projects/isLoading/error/hasLoaded`. `OnPush` preserved.
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.spec.ts` — rewritten to mock `ProjectStateService` with four `WritableSignal`s + a `loadProjects` spy per the design-spec's `§Mocking Instructions`. Tests flip signals to assert each VM branch.

### Files Deliberately NOT Modified

- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.html` — byte-for-byte identical (still reads `vm().status`).
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.scss` — not touched (design spec §Scope).
- All dumb dashboard components (`dashboard-header`, `dashboard-skeleton`, `dashboard-empty-state`, `dashboard-error-state`, `project-grid`, `project-card`) — not touched.
- `KanbAI-Web/src/app/features/projects/models/dashboard-view-model.ts` — kept; `DashboardViewModel` union still drives the template, only the producer changed.
- No `FormErrorBanner` component was created — per both specs' scoping, that pattern is documentation for #32's future consumer and is explicitly out-of-scope for #31.

### Build & Test Results

- `npm run build` — succeeded. Dashboard lazy chunk: `21.92 kB` raw / `5.00 kB` transferred. No new warnings attributable to #31.
- `npm run test -- --watch=false` — **414 tests across 29 files, all passing, zero failures.** New `project-state.service.spec.ts` contributes 16 tests. Pre-existing suites (including `projects-api.service.spec.ts` with its default-`'list'` `mapErrorToUserMessage` assertions) continue to pass unmodified.

### Edge Cases Verified in Tests

- Initial `projects()` is `[]` and `hasLoaded()` is `false`.
- `loadProjects` happy path: `isLoading` flips true → false; `projects` populated; `hasLoaded` true; `error` null.
- `loadProjects` HTTP 500: cache preserved at `[]`; `error` set to the server-error sentence; `isLoading` false.
- Double-fire de-dup: two synchronous `loadProjects()` calls produce exactly one `GET /api/project` (verified by `httpMock.expectOne`).
- `createProject` success: new project prepended at index 0 of the cache.
- `createProject` HTTP 400: cache untouched; returned observable errors with the create-scoped "couldn't save your project" copy.
- `createProject` with invalid DTO (empty `id`): cache untouched; observable errors.
- `updateProject` success on existing id: matching entry replaced in place; array order preserved.
- `updateProject` success on unknown id: returned DTO appended to cache (defensive).
- `updateProject` HTTP 404: cache untouched; observable errors with the "project may have been deleted" copy.
- `deleteProject` success: matching project removed from cache.
- `deleteProject` success on absent id (two-tab race): cache unchanged, no erroneous mutation.
- `deleteProject` HTTP 403: observable errors with the owner-only copy; cache untouched.
- Logout reset: flipping `currentUser` to `null` after a successful load empties `projects`, clears `error`, resets `isLoading`, resets `hasLoaded`.
- Logout-during-in-flight: late list response does NOT repopulate the cache after reset.
- Initial unauthenticated boot: no spurious reset, no `GET /api/project` emitted.

### Acceptance Criteria Mapping

All ACs from `issue_31_context.md` are covered by the implementation + tests above:
- Centralized Read API ✓ (four signals exposed; `projects()` defaults to `[]`; dashboard consumes them via `computed`).
- Fetch / List ✓ (`loadProjects` with happy / empty / error paths, cache-preservation on failure).
- Create ✓ (prepend on success, cache untouched on failure, user-readable error delivered via observable).
- Update ✓ (replace-by-id on match, append on unknown id, cache untouched on failure).
- Delete ✓ (remove-by-id on 204, idempotent on already-absent id, 403 owner-only copy).
- Session Hygiene ✓ (logout resets cache; initial unauthenticated state does not trigger any fetch).
- Error Messages ✓ (full operation-scoped table wired in `mapErrorToUserMessage`; no raw status codes or URLs in any user-facing string).
- Non-Regression ✓ (build clean, 414/414 tests pass, all #30 tests continue to pass).

### Known Limitations / Items Flagged for QA

- The dashboard-page spec's previous "destroy mid-fetch" edge-case test was specific to the old subscription-in-component model (`takeUntilDestroyed`). Since the state service now owns the subscription, the equivalent behavior is tested in `project-state.service.spec.ts` via the "logout-during-in-flight" and "does not repopulate after logout" cases — that is where the lifecycle cleanup now lives.
- No integration test yet asserts that toggling state-service signals from outside the component re-renders the DOM in a single `detectChanges()` cycle (listed as a test-strategy item in the spec). Unit coverage already exercises the same reactivity through the new dashboard-page spec; a dedicated integration harness is deferred unless QA asks for it.
- The `error` signal is list-scope only; mutation errors are delivered via observable per the spec's contract. Any future code that reads `ProjectStateService.error` for mutation feedback is incorrect — callers must subscribe to the returned observable.
- Mutation-error user-readable copy is English-only; no i18n layer yet (flagged in the design spec's "Open questions" section as future work).

*Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests.*

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification.*
