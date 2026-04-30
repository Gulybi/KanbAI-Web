# Technical Specification: Project Members Management UI

**Context Document:** [issue_33_context.md](./issue_33_context.md)
**GitHub Issue:** [#33](https://github.com/Gulybi/KanbAI-Web/issues/33)
**Milestone:** #4 — Landing Page & Project Dashboard UI (AI-Driven)

---

## 0. Backend Prerequisite — SHIPPED (verify before coding)

Both open assumptions deferred by the context doc have now landed in `KanbAI-Core`. Verified directly against `c:/temp/KanbAI-Core/KanbAI-Core/KanbAI-Core/` on 2026-04-30:

#### Endpoint 1 — List project members (Assumption A) — ✅ SHIPPED

[`Controllers/ProjectController.cs:151-164`](../../KanbAI-Core/KanbAI-Core/KanbAI-Core/Controllers/ProjectController.cs#L151-L164), backed by `IProjectService.GetProjectMembersAsync` (`Services/Projects/IProjectService.cs:99-101`).

| Method | Route | Auth | Request | Success response | Failures |
|--------|-------|------|---------|------------------|----------|
| `GET` | `/api/project/{projectId}/members` | JWT | — | `200` — `ApiResponse<List<MemberResponseDto>>` | `404` "Project not found." (project missing OR caller not a member) |

- `MemberResponseDto` carries `{ userId, name, email, role, joinedAt }` — unchanged.
- Caller must be a member (not owner-only) — both owners and plain members see the roster per AC-28.
- **Important:** the backend collapses "project missing" and "caller not a member" into the same `404 "Project not found."` response (there is no explicit 403 on list). §4.3 copy matrix maps both to "This project no longer exists."

#### Endpoint 2 — Email → userId (Assumption B) — ✅ SHIPPED (Option B1 adopted)

[`DTOs/AddMemberDto.cs`](../../KanbAI-Core/KanbAI-Core/KanbAI-Core/DTOs/AddMemberDto.cs):

```csharp
public record AddMemberDto
{
    public Guid? UserId { get; init; }
    [EmailAddress(ErrorMessage = "Invalid email format.")]
    public string? Email { get; init; }
}
```

The server resolves the email internally. The frontend sends `{ email }` only from this UI. **The B2 lookup-endpoint fallback in §4.4 is retained as a historical note but is not needed.**

The controller returns 400 with these message strings (`ProjectController.cs:111-118`) — all three "email could not be resolved" variants must route to the same user-readable copy; the error matrix in §4.3 has been updated to reflect this:
- `"User not found."`
- `"No user found with email address: {email}"` (new — must be matched by prefix)
- `"User is already a member of this project."`
- `"Provide either UserId or Email, not both."` (guardrail; shouldn't fire from this UI)
- `"Either UserId or Email is required."` (guardrail; shouldn't fire from this UI)

### Pre-coding verification (developer must do this before §5.1)

- [ ] `curl` or Postman `GET /api/project/{projectId}/members` against a running `KanbAI-Core` → expect `200` with `ApiResponse<List<MemberResponseDto>>`.
- [ ] `POST /api/project/{projectId}/members` with body `{ "email": "test@example.com" }` → expect `201` or the appropriate documented 400.
- [ ] Update `.claude/backend_api_map.md`: add the `GET .../members` row under Projects; update `AddMemberDto` to show both `userId` and `email` as accepted alternatives.

---

## 1. Overview

This feature introduces a project-scoped **Members surface** that opens from an owner-only action on each `ProjectCardComponent` on `/dashboard`. The surface is implemented as a **CDK dialog** (not a dedicated route) mirroring the pattern established by `CreateProjectDialogComponent` in #32. Inside the dialog:
- A new **smart container** `MembersDialogComponent` orchestrates load + add + remove.
- Three **dumb components** (`MembersListComponent`, `MemberRowComponent`, `AddMemberFormComponent`) render the roster and the add-member form.
- Remove-confirmation is a **second CDK dialog** (`RemoveMemberConfirmDialogComponent`), matching the destructive-action pattern described in the acceptance criteria.

Per-project membership data lives in a **new sibling service `MembersStateService`** (decision rationale below), which owns one `per-project` cache keyed by `projectId`. It reuses the same `BaseStateService`, `inject()`, Signals, RxJS-for-HTTP, `toSignal` bridge, and `OnPush` patterns already established across the codebase.

Owner-only capability is gated on the cached `ProjectSummary.role` from `ProjectStateService` passed into the dialog on open (not re-fetched) — plus a server-authoritative 403 safety net on every mutation. The remove 404 is tolerated silently; the remove 400 "last owner" is surfaced inline.

A new `MemberOperation` error-mapping union is introduced in a new file to avoid polluting `ProjectOperation`; the existing helper is extended by composition, not by widening.

---

## 2. Component Architecture

### 2.1 Routing — decision: **Modal, no new route**

The Members surface is a CDK `Dialog`, opened from `DashboardPageComponent` via `Dialog.open(MembersDialogComponent, { data: { project } })`. **No new Angular routes are added** and `app.routes.ts` is not modified.

**Rationale:**
- The context AC-1 ("at most two activations") is satisfied by a one-click modal open; a dedicated route would force an extra `popstate`/navigation cycle with no UX gain.
- `@angular/cdk/dialog` and the panel/backdrop class conventions are already wired by #32 (`dashboard-page.component.ts:30`, `openCreateDialog()`). Re-using the same `Dialog` provider yields zero new overlay boilerplate and keeps focus-restore behavior identical.
- AC-27 ("opening does not navigate history") explicitly blesses the modal choice.
- Dedicated routes (`/dashboard/projects/:id/members`) would also require #33 to fix the #32-era choice that cards are not routerLinks. Out of scope; deferred to a future board-routing issue.

### 2.2 Entry point — decision: **Secondary icon-button on `ProjectCardComponent`, owner-only**

A new icon-button (`Manage members`) is added to `ProjectCardComponent`'s header beside the role badge. It is rendered **only** when `roleVariant() === 'owner'` (per the "Add/Remove are owner-only" AC block). Non-owners do not see the entry point at all; they cannot reach the surface because the dashboard is their only entry point and they have no card-level affordance — this is the simplest form of AC-13/AC-22 gating.

- The icon button emits a new `@Output() manageMembersClick = new EventEmitter<ProjectSummary>()` from `ProjectCardComponent`.
- `ProjectGridComponent` re-emits through `(manageMembersClick)="manageMembersClick.emit($event)"`.
- `DashboardPageComponent` subscribes in the template (`(manageMembersClick)="openMembersDialog($event)"`) and calls `Dialog.open(MembersDialogComponent, { data: { project: $event } })`.

**Rationale:**
- The card's `<article>` remains non-interactive (tabindex="0" stays for a11y traversal), avoiding the "what does clicking the card do?" ambiguity the context flagged.
- A secondary button is keyboard-reachable via a single Tab after card focus.
- Non-owners have no UI path to the surface at all, meeting AC-22 without adding a disabled control.
- If a future issue adds a member-visible "view members" affordance, the same dialog can open in read-only mode by passing a `mode: 'view'` flag in the dialog data.

### 2.3 Component Hierarchy

**Smart (Container):**
- `MembersDialogComponent` — `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.ts`
  - Injected: `DialogRef`, `DIALOG_DATA`, `MembersStateService`, `AuthService`, `Dialog` (to open the remove-confirm child dialog), `EnvironmentInjector`, `DestroyRef`.
  - Reads the `project` passed in via `DIALOG_DATA`; derives `isOwner` from `project.role.toLowerCase() === 'owner'` (no re-fetch — decision rationale in §3.5).
  - Derives `currentUserId` from `AuthService.currentUser()` for the "You" self-indicator.
  - Calls `membersState.loadMembers(project.id)` on init.
  - Surfaces three discriminated-union Signals to the template: `listVm`, `addVm`, and per-row `removeState` (see §3.2).
  - Orchestrates the remove-confirm dialog and threads its result into `membersState.removeMember`.
  - Does NOT own the per-project cache directly — it is a pure orchestrator over `MembersStateService`.

**Dumb (Presentational):**
- `MembersListComponent` — `KanbAI-Web/src/app/features/projects/components/members-dialog/members-list/members-list.component.ts`
  - `@Input({ required: true }) members: MemberSummary[]`
  - `@Input({ required: true }) currentUserId: string | null`
  - `@Input({ required: true }) isOwner: boolean`
  - `@Input() pendingRemovalUserId: string | null = null` — the row currently being removed; dims and disables that row only.
  - `@Output() removeClick = new EventEmitter<MemberSummary>()`
  - Renders a semantic `<ul role="list">` of `MemberRowComponent`s; uses `trackById` on `userId`.
  - `OnPush`.

- `MemberRowComponent` — `KanbAI-Web/src/app/features/projects/components/members-dialog/member-row/member-row.component.ts`
  - `@Input({ required: true }) member: MemberSummary`
  - `@Input({ required: true }) isSelf: boolean`
  - `@Input({ required: true }) canRemove: boolean` — `isOwner && !isSelf && member.role !== 'Owner'` (owner removing a non-self non-owner; remove-the-last-owner case is owner removing *self* and is covered by `!isSelf`).
  - `@Input({ required: true }) isPending: boolean`
  - `@Output() removeClick = new EventEmitter<MemberSummary>()`
  - Renders name, email, role badge, "(You)" indicator, and a conditional Remove button.
  - `OnPush`. Reuses `project-card__badge--owner`/`--member` badge classes (design-spec decision, not invented here).

- `AddMemberFormComponent` — `KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts`
  - `@Input({ required: true }) disabled: boolean` — disables the whole form during submit.
  - `@Input() errorMessage: string | null = null` — user-readable error from the smart container.
  - `@Output() submitEmail = new EventEmitter<string>()`
  - Owns its own `FormControl<string>` with `[Validators.required, Validators.email, whitespaceOnlyValidator]` — reuses the existing `whitespaceOnlyValidator` from #32.
  - Trims and emits the normalized email.
  - Reuses `FormInputComponent` + `FormButtonComponent` from `features/auth/components` (same imports `CreateProjectDialogComponent` already uses).
  - `OnPush`.
  - On smart-container success signal (via an `@Input() resetCounter: number` that bumps each success), the form resets the input, clears `touched`, and refocuses it programmatically via `ViewChild('emailInput')` — satisfies AC-15 and AC-19. (The child exposes a public `focusInput()` method called by the smart parent via `ViewChild`.)

- `RemoveMemberConfirmDialogComponent` — `KanbAI-Web/src/app/features/projects/components/members-dialog/remove-member-confirm-dialog/remove-member-confirm-dialog.component.ts`
  - Opened by `MembersDialogComponent` via `Dialog.open(...)` with `{ data: { member } }`.
  - `DialogRef` closes with `true` (confirm) or `undefined` (cancel / ESC / backdrop).
  - Contains the confirmation copy, primary "Remove" button (danger variant — design spec), secondary "Cancel".
  - `aria-labelledby` references a heading containing the member's name.
  - `OnPush`, `ViewEncapsulation.None` (same pattern as `CreateProjectDialogComponent` to scope `.remove-member-confirm-dialog-panel` styles).

### 2.4 New Files to Create

```
KanbAI-Web/src/app/features/projects/
  models/
    member.model.ts                                   (MemberSummary, MembersApiResponse types)
  services/
    members-api.service.ts                            (HTTP + mapMemberErrorToUserMessage + MemberOperation union)
    members-api.service.spec.ts
  state/
    members-state.model.ts                            (MembersState, PerProjectMembers, INITIAL_MEMBERS_STATE)
    members-state.service.ts                          (MembersStateService extends BaseStateService<MembersState>)
    members-state.service.spec.ts
  components/
    members-dialog/
      members-dialog.component.ts
      members-dialog.component.html
      members-dialog.component.scss
      members-dialog.component.spec.ts
      members-dialog.types.ts                        (MembersDialogData, MembersDialogResult, listVm/addVm unions)
      members-list/
        members-list.component.ts
        members-list.component.html
        members-list.component.scss
        members-list.component.spec.ts
      member-row/
        member-row.component.ts
        member-row.component.html
        member-row.component.scss
        member-row.component.spec.ts
      add-member-form/
        add-member-form.component.ts
        add-member-form.component.html
        add-member-form.component.scss
        add-member-form.component.spec.ts
      remove-member-confirm-dialog/
        remove-member-confirm-dialog.component.ts
        remove-member-confirm-dialog.component.html
        remove-member-confirm-dialog.component.scss
        remove-member-confirm-dialog.component.spec.ts
        remove-member-confirm-dialog.types.ts         (RemoveMemberConfirmData)
```

### 2.5 Files to Modify

```
KanbAI-Web/src/app/features/projects/
  components/project-card/project-card.component.ts   (+ @Output manageMembersClick; + computed canManage signal)
  components/project-card/project-card.component.html (+ icon button, conditional on canManage)
  components/project-card/project-card.component.scss (+ styles for the new button, scoped to .project-card)
  components/project-card/project-card.component.spec.ts (+ emit test for new output; + hidden-for-member test)
  components/project-grid/project-grid.component.ts   (+ @Output manageMembersClick: EventEmitter<ProjectSummary>)
  components/project-grid/project-grid.component.html (+ (manageMembersClick)="manageMembersClick.emit($event)")
  components/project-grid/project-grid.component.spec.ts (+ re-emit test)
  dashboard-page/dashboard-page.component.ts          (+ openMembersDialog(project: ProjectSummary); injects already ok)
  dashboard-page/dashboard-page.component.html        (+ (manageMembersClick)="openMembersDialog($event)")
  dashboard-page/dashboard-page.component.spec.ts     (+ dialog.open called with MembersDialogComponent + correct data)
```

`app.routes.ts` is **not** modified. `project-state.service.ts` is **not** modified (see §3.1 decision).

---

## 3. State & Data Layer

### 3.1 Decision: **New `MembersStateService` (sibling), do NOT extend `ProjectStateService`**

Members data is **per-project**, asymmetrically loaded (only for the project currently being managed), and has fundamentally different invalidation semantics than the project list. Forcing it into `ProjectStateService` would:
- Bloat the `ProjectState` interface with a `membersByProjectId: Record<string, MemberSummary[]>` field only populated for at most one project at a time.
- Couple two unrelated cache-invalidation lifetimes (logout flushes both OK; but a project delete should also flush *that project's* member cache, which `ProjectStateService.deleteProject` would have to know about).
- Violate the single-responsibility pattern already established by `#31` ("Single source of truth for the authenticated user's project list" — comment at `project-state.service.ts:19`).

Instead, `MembersStateService` is a sibling service under the same `state/` folder. It:
- Owns a `MembersState { byProjectId: Record<string, PerProjectMembers> }` shape.
- Subscribes to `AuthService.currentUser` via `effect()` for logout-reset (identical pattern to `ProjectStateService` lines 63–68).
- Subscribes to `ProjectStateService.projects` via `effect()` to prune `byProjectId` entries whose project id has disappeared from the project list (handles AC "concurrent project deletion in another tab").

### 3.2 Internal state shape

**File:** `KanbAI-Web/src/app/features/projects/state/members-state.model.ts`

```typescript
import { MemberSummary } from '../models/member.model';

/** Per-project load/mutate status. */
export interface PerProjectMembers {
  /** The roster as last confirmed by the server. [] during initial load. */
  members: MemberSummary[];

  /** True while GET /members is in flight for this project. */
  isLoading: boolean;

  /**
   * User-readable list-scope error. Written on list-load failure; cleared on
   * the next successful load. Mutation-scope errors are NOT written here —
   * they flow through the mutation Observable's error branch (same contract
   * as ProjectStateService mutations; see project-state.service.ts:30-37).
   */
  error: string | null;

  /**
   * Distinguishes "never asked" from "asked and got []". Used by the dialog's
   * listVm to pick 'loading' vs 'empty' without an extra flag, mirroring
   * ProjectState.hasLoaded.
   */
  hasLoaded: boolean;
}

export interface MembersState {
  /** Keyed by projectId. Entries are created lazily on first loadMembers(id). */
  byProjectId: Record<string, PerProjectMembers>;
}

export const INITIAL_PER_PROJECT_MEMBERS: PerProjectMembers = {
  members: [],
  isLoading: false,
  error: null,
  hasLoaded: false
};

export const INITIAL_MEMBERS_STATE: MembersState = {
  byProjectId: {}
};
```

### 3.3 `MembersStateService` contract

**File:** `KanbAI-Web/src/app/features/projects/state/members-state.service.ts`

Public signal selectors are parameterized by `projectId` using factory getters (not `computed`, because `computed` needs to close over a fixed key at selector construction time). The selector factories each return a `Signal`.

```typescript
@Injectable({ providedIn: 'root' })
export class MembersStateService extends BaseStateService<MembersState> {
  private readonly membersApi = inject(MembersApiService);
  private readonly authService = inject(AuthService);
  private readonly projectState = inject(ProjectStateService);

  /** Map<projectId, Subscription> for in-flight list loads (dedup + logout cleanup). */
  private readonly inFlightLoads: Map<string, Subscription> = new Map();

  constructor() { super(); /* registers logout + project-prune effects */ }

  protected getInitialState(): MembersState;

  /** Per-project selector — returns a Signal of the slice for the given id. */
  selectForProject(projectId: string): Signal<PerProjectMembers>;

  /** Kicks off GET /members if no entry exists yet or forceRefresh is true. */
  loadMembers(projectId: string, forceRefresh?: boolean): void;

  /**
   * POST /members for {projectId}. Body is { email } (Option B1) — the
   * service layer owns that contract. On server-confirmed success the new
   * MemberResponseDto row is appended to byProjectId[projectId].members.
   * Failure paths surface as Observable errors with user-readable messages.
   */
  addMemberByEmail(projectId: string, email: string): Observable<MemberSummary>;

  /**
   * DELETE /members/{userId}. On 204, removes the matching row from the
   * per-project slice. On 404 (concurrent removal), silently removes the
   * local row too (AC says end-state matches intent). On 400 "last owner"
   * or 403, surfaces a user-readable error; row is left in place.
   */
  removeMember(projectId: string, userId: string): Observable<void>;

  // Private: logout reset, project-prune effect, helpers.
  private reset(): void;
  private pruneRemovedProjects(currentProjectIds: ReadonlySet<string>): void;
  private upsertSlice(projectId: string, patch: Partial<PerProjectMembers>): void;
  private isValidMember(m: unknown): m is MemberSummary;
}
```

Method-level behavioral contracts (the developer implements exactly these semantics, mirroring the existing `ProjectStateService` patterns at lines 85–183):

- **`loadMembers(projectId, forceRefresh = false)`**
  - If `inFlightLoads.has(projectId)` → return (dedup per project).
  - If the slice already has `hasLoaded === true` and `!forceRefresh` → return (cache hit).
  - Set `{ isLoading: true, error: null }` on the slice.
  - Subscribe to `membersApi.listMembers(projectId)`.
  - On next: clear `isLoading`, set `hasLoaded = true`, replace `members` with the response.
  - On error: clear `isLoading`, set `error = mapMemberErrorToUserMessage(err, 'list')`; do NOT write `hasLoaded = true`.
  - Guard against post-logout arrival: if `authService.currentUser() === null`, discard.

- **`addMemberByEmail(projectId, email)`**
  - Trims `email`; if empty, throws synchronously with "Please enter an email" (guards against a buggy form that bypasses validators).
  - Pipes `membersApi.addMemberByEmail(projectId, email)`:
    - `tap(created)` → append to `byProjectId[projectId].members` if the slice exists; if the slice was not loaded (defensive), no-op the cache update and let the caller refetch on close.
    - `catchError(err) → throwError(new Error(mapMemberErrorToUserMessage(err, 'add')))`.

- **`removeMember(projectId, userId)`**
  - Pipes `membersApi.removeMember(projectId, userId)`:
    - `tap(() => remove row with matching userId)`.
    - `catchError(err)` → if the HTTP status is 404, still remove the local row and return `of(void 0)` (AC "tolerates gracefully: silently removes locally"). For every other failure, rethrow with `mapMemberErrorToUserMessage(err, 'remove')`.

### 3.4 Smart-container view-model unions

**File:** `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.types.ts`

The dialog collapses the `PerProjectMembers` slice into three discriminated unions, mirroring the `DashboardViewModel` pattern in `dashboard-view-model.ts`.

```typescript
import { MemberSummary } from '../../models/member.model';
import { ProjectSummary } from '../../models/project.model';

/** Data passed into the dialog via CDK DIALOG_DATA. */
export interface MembersDialogData {
  project: ProjectSummary;
}

/** Dialog close result — currently always void; exposed for future extension. */
export type MembersDialogResult = void;

/** List-branch view model for the roster area. */
export type MembersListViewModel =
  | { status: 'loading' }
  | { status: 'success'; members: MemberSummary[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/** Add-form view model. Exists only when the viewer is owner. */
export type AddMemberViewModel =
  | { status: 'idle'; errorMessage: string | null; resetCounter: number }
  | { status: 'submitting'; errorMessage: null; resetCounter: number };

/**
 * Per-row remove state. Held as a Signal<Map<userId, boolean>> in the smart
 * container and passed to the dumb list via an @Input() of the currently-
 * pending userId (at most one remove in flight at a time — enforced in UI).
 */
```

`MembersDialogComponent` exposes protected Signals:
- `listVm: Signal<MembersListViewModel>` — derived from `membersState.selectForProject(project.id)` via `computed`.
- `addVm: Signal<AddMemberViewModel>` — local Signals for `submitting`, `addError`, `resetCounter`.
- `pendingRemovalUserId: Signal<string | null>` — local, set to a userId during remove, cleared on settle.
- `currentUserId: Signal<string | null>` — from `AuthService.currentUser()` (is already a Signal).
- `isOwner: boolean` — readonly, derived once from `data.project.role`; not reactive (role changes mid-session are covered by §3.5).

### 3.5 Owner-only gating — decision: **Trust cached `ProjectSummary.role`, re-validate on 403**

The dialog reads `isOwner` once from `data.project.role` passed in via `DIALOG_DATA`. No re-fetch on open. Rationale:
- `ProjectSummary.role` from `ProjectStateService` was set by a server response within this session; it is not unvalidated local state.
- Round-tripping through a `GET /api/project/{id}` on every open adds latency and still has a TOCTOU gap: the role could change between that fetch and the mutation anyway.
- AC-34 ("the next mutation attempt that returns 403 causes the owner-only controls to be hidden/disabled") implies the primary defense is server-authoritative 403, not a pre-flight re-fetch.

On a 403 from `addMemberByEmail` or `removeMember`, the dialog:
1. Re-maps the error to the user-readable "only the project owner…" string.
2. Sets a local `roleRevoked: signal<boolean>(false)` → `true`.
3. Hides both the add form and all remove buttons immediately (template binds to `isOwner && !roleRevoked()`).
4. Surfaces the error inline in the list-area error banner.

This is server-first, but gives an immediate recovery without requiring the user to close and re-open.

### 3.6 TypeScript interfaces

**File:** `KanbAI-Web/src/app/features/projects/models/member.model.ts`

```typescript
import { ApiResponse } from './project.model'; // reuse existing envelope

/**
 * Frontend projection of backend MemberResponseDto. Field names are the
 * camelCase JSON forms confirmed from KanbAI-Core/DTOs/MemberResponseDto.cs.
 * 'role' values are "Owner" | "Member" per the backend enum, but we keep
 * it as string for forward-compatibility with future roles.
 */
export interface MemberSummary {
  /** User id (GUID). Opaque — never derived from email, never parsed. */
  userId: string;

  /** Display name for the row. Backend-required. */
  name: string;

  /** Email, case as stored by backend. Rendered alongside name. */
  email: string;

  /** "Owner" | "Member" at time of writing; widened to string defensively. */
  role: string;

  /** ISO-8601 timestamp, e.g. "2026-04-29T14:12:00Z". Optional render in #33. */
  joinedAt: string;
}

/**
 * Re-export of the envelope for members endpoints. Members endpoints use the
 * same ApiResponse<T> wrapper as projects (confirmed against ProjectController).
 */
export type MembersListResponse = ApiResponse<MemberSummary[]>;
export type AddMemberResponse = ApiResponse<MemberSummary>;
```

---

## 4. Service Integration

### 4.1 `MembersApiService`

**File:** `KanbAI-Web/src/app/features/projects/services/members-api.service.ts`

Follows `ProjectsApiService` conventions line-for-line: singular `/project` base URL, envelope unwrap with `success: false → throw`, `encodeURIComponent` on path params, no token handling (the global `authInterceptor` attaches the bearer).

```typescript
@Injectable({ providedIn: 'root' })
export class MembersApiService {
  private readonly http = inject(HttpClient);

  /**
   * Matches ProjectsApiService convention: singular /project root. The
   * members sub-path is appended per request.
   */
  private readonly apiUrl = `${environment.apiUrl}/project`;

  /** GET /api/project/{projectId}/members — assumes backend Endpoint 1 is shipped. */
  listMembers(projectId: string): Observable<MemberSummary[]>;

  /**
   * POST /api/project/{projectId}/members with body { email }.
   * Assumes backend Option B1 is accepted. For B2 fallback see §4.4.
   */
  addMemberByEmail(projectId: string, email: string): Observable<MemberSummary>;

  /** DELETE /api/project/{projectId}/members/{userId} — 204 No Content. */
  removeMember(projectId: string, userId: string): Observable<void>;
}

/** Union identifying which operation an error came from, for copy routing. */
export type MemberOperation = 'list' | 'add' | 'remove';

/**
 * Translates HttpErrorResponse (or a thrown envelope Error) to a user-
 * readable sentence. Symmetric with mapErrorToUserMessage in
 * projects-api.service.ts — not extended because the error-copy table
 * is genuinely different (e.g. "already a member" has no analogue in
 * the project CRUD flow). See §4.3 for the copy matrix.
 */
export function mapMemberErrorToUserMessage(
  error: unknown,
  operation: MemberOperation
): string;
```

### 4.2 Decision: **New `MemberOperation` union, NOT extending `ProjectOperation`**

Reasons to keep them separate:
- The error shapes are different: member endpoints return 400 "user not found", 400 "already a member", 400 "cannot remove last owner" — none of which exist in `ProjectOperation`'s 400 space.
- Extending `ProjectOperation` from `'list' | 'create' | 'update' | 'delete'` to a 7-variant union forces every existing call-site (and its tests) to be considered for the new branches — a wider blast radius than the feature warrants.
- `genericFailureCopy` in `projects-api.service.ts:150` would have to grow a `member-add` / `member-remove` branch that only fires from this feature. Easier to keep the two helpers as sibling single-purpose functions.
- The only shared logic is the 401/0/5xx mapping — ~10 lines — which this spec accepts as a small duplication in exchange for decoupled evolution.

### 4.3 Error copy matrix (authoritative)

| Operation | HTTP status | Backend `message` shape | User-facing copy |
|-----------|-------------|-------------------------|------------------|
| list | 0 | — | "We couldn't reach the server. Please check your connection and try again." |
| list | 401 | — (interceptor redirects) | "Your session has expired. Please sign in again." |
| list | 404 | "Project not found." (covers both project-missing and caller-not-a-member per backend collapse) | "This project no longer exists." |
| list | 5xx | — | "Something went wrong on our end. Please try again in a moment." |
| list | other | — | "We couldn't load the member list. Please try again." |
| add | 0 | — | "We couldn't reach the server. Please check your connection and try again." |
| add | 400 | "User not found." | "We couldn't find a user with that email." |
| add | 400 | starts with "No user found with email address:" | "We couldn't find a user with that email." |
| add | 400 | "User is already a member of this project." | "That user is already a member of this project." |
| add | 400 | "Provide either UserId or Email, not both." | "We couldn't add that member. Please check the email and try again." (should never fire from this UI) |
| add | 400 | "Either UserId or Email is required." | "Please enter an email." (should never fire — form validators catch this) |
| add | 400 | other | "We couldn't add that member. Please check the email and try again." |
| add | 401 | — (interceptor) | "Your session has expired. Please sign in again." |
| add | 403 | "Only the project owner can add members." | "Only the project owner can add members." |
| add | 404 | "Project not found." | "This project no longer exists." |
| add | 5xx | — | "Something went wrong on our end. Please try again in a moment." |
| remove | 0 | — | "We couldn't reach the server. Please check your connection and try again." |
| remove | 400 | "Cannot remove the last owner from the project." | "You can't remove the last owner of a project." |
| remove | 400 | other | "We couldn't remove that member. Please try again." |
| remove | 401 | — (interceptor) | "Your session has expired. Please sign in again." |
| remove | 403 | "Only the project owner can remove members." | "Only the project owner can remove members." |
| remove | 404 | "Project not found." / "User is not a member…" | (see §3.3 — treated as success locally; no error copy surfaced) |
| remove | 5xx | — | "Something went wrong on our end. Please try again in a moment." |

The helper must inspect the unwrapped envelope's `message`/`errors[0]` to disambiguate the 400 variants; the existing envelope-error wrapper (`new Error(response.errors?.[0] ?? response.message)`) already carries that string through the `catch` path, so the helper reads `err.message` when it's a plain `Error`. Matching `"No user found with email address:"` must be done by `startsWith` (the backend appends the email to the message); all other strings are exact matches.

### 4.4 Fallback contract for Option B2 (lookup endpoint) — **NOT USED**

Retained as a historical note. The backend adopted B1 (email directly in `AddMemberDto`); the swap below is not needed. If a future issue ever needs a `GET /api/users/by-email`, this is the shape that would plug in without touching component code.

```typescript
// In MembersApiService:
addMemberByEmail(projectId: string, email: string): Observable<MemberSummary> {
  return this.http
    .get<ApiResponse<UserProfileDto>>(
      `${environment.apiUrl}/users/by-email`,
      { params: { email } }
    )
    .pipe(
      map(res => { /* unwrap, throw on success:false or null data */ }),
      switchMap(user => this.http.post<ApiResponse<MemberSummary>>(
        `${this.apiUrl}/${encodeURIComponent(projectId)}/members`,
        { userId: user.id } satisfies { userId: string }
      )),
      map(res => { /* unwrap */ })
    );
}
```

Under B2, the "user not found" error surfaces from the lookup step as a 404, and `mapMemberErrorToUserMessage` must map 404 on `'add'` to "We couldn't find a user with that email." (adds one row to §4.3).

### 4.5 HTTP Request/Response Contracts

| Method | Endpoint | Request Body | Response Body | Error Codes |
|--------|----------|--------------|---------------|-------------|
| GET | `/api/project/{projectId}/members` | — | `ApiResponse<MemberSummary[]>` | 401, 403, 404, 5xx |
| POST | `/api/project/{projectId}/members` | `{ email: string }` (B1) or `{ userId: string }` (B2) | `ApiResponse<MemberSummary>` | 400, 401, 403, 404, 5xx |
| DELETE | `/api/project/{projectId}/members/{userId}` | — | `204 No Content` | 400, 401, 403, 404, 5xx |

---

## 5. Implementation Steps

Follow in order. Every step lists the acceptance-criteria lines it satisfies from `issue_33_context.md` for traceability.

### 5.0 Pre-flight

- [ ] Run the verification steps in §0 "Pre-coding verification" against a local `KanbAI-Core`: confirm `GET /api/project/{projectId}/members` returns a 200 with `ApiResponse<List<MemberResponseDto>>`, and confirm `POST /api/project/{projectId}/members` accepts `{ "email": "..." }` with the expected 400 variants on invalid / already-member / not-found inputs.
- [ ] Update `.claude/backend_api_map.md` to document the new GET endpoint and the enriched `AddMemberDto` before touching the frontend.

### 5.1 Type definitions

- [ ] Create `src/app/features/projects/models/member.model.ts` with `MemberSummary`, `MembersListResponse`, `AddMemberResponse` (§3.6).

### 5.2 Service layer

- [ ] `ng generate service features/projects/services/members-api --flat --skip-tests=false` (into existing `services/` folder — match `projects-api.service.ts` layout).
- [ ] Implement `listMembers`, `addMemberByEmail`, `removeMember` mirroring `ProjectsApiService` envelope-unwrap patterns (§4.1).
- [ ] Export `MemberOperation` type + `mapMemberErrorToUserMessage` function from the same file; implement per §4.3 copy matrix.
- [ ] Unit-test `MembersApiService.spec.ts` using `HttpClientTestingModule`, mirroring `projects-api.service.spec.ts` shape: GET/POST/DELETE URL shape, envelope unwrap, `success:false → Observable error`, 500 → `HttpErrorResponse`.
- [ ] Unit-test `mapMemberErrorToUserMessage` for every row in §4.3 (parameterized test per operation).

### 5.3 State service

- [ ] Create `state/members-state.model.ts` (§3.2).
- [ ] `ng generate service features/projects/state/members-state --flat --skip-tests=false`.
- [ ] Implement `MembersStateService extends BaseStateService<MembersState>` per §3.3.
  - Inject `MembersApiService`, `AuthService`, `ProjectStateService`.
  - Implement `selectForProject(projectId)` as `computed(() => this.getState().byProjectId[projectId] ?? INITIAL_PER_PROJECT_MEMBERS)` — the `computed` closes over `projectId`; caller constructs one per dialog open.
  - Implement `loadMembers`, `addMemberByEmail`, `removeMember` per the contracts in §3.3.
  - Register `effect(() => { if (authService.currentUser() === null) this.reset(); })` — guarded like `ProjectStateService` lines 63–68 to avoid pre-login false trigger.
  - Register `effect(() => { const ids = new Set(projectState.projects().map(p => p.id)); this.pruneRemovedProjects(ids); })` — drops `byProjectId` entries for deleted projects.
- [ ] Unit-test `MembersStateService.spec.ts` mirroring `project-state.service.spec.ts`:
  - Selector returns `INITIAL_PER_PROJECT_MEMBERS` for unknown id.
  - `loadMembers` dedups concurrent calls per projectId.
  - `addMemberByEmail` appends the returned row on success; `addMemberByEmail` errors with a user-readable message on 400/403/404.
  - `removeMember` removes the row on 204; removes it anyway on 404; keeps it and errors on 400 "last owner" / 403.
  - Logout resets entire `byProjectId`.
  - Project-prune effect drops stale keys when a project disappears from `projectState.projects`.

### 5.4 Presentational components (inside-out)

- [ ] `ng generate component features/projects/components/members-dialog/member-row --skip-tests=false`. Implement inputs + outputs per §2.3. Template renders name, email, "(You)" if `isSelf`, role badge (reuse badge classes — §2.3 note), Remove button when `canRemove`. `OnPush`.
- [ ] `ng generate component features/projects/components/members-dialog/members-list --skip-tests=false`. Uses a `trackBy: (i, m) => m.userId`. Renders `<ul role="list">` of `MemberRowComponent`. Computes per-row `isSelf`, `canRemove`, `isPending` from inputs; forwards `(removeClick)` up.
- [ ] `ng generate component features/projects/components/members-dialog/add-member-form --skip-tests=false`. Reuses `FormInputComponent`, `FormButtonComponent`. FormControl: `[Validators.required, Validators.email, whitespaceOnlyValidator]`. On submit: trim, emit, reset + refocus only after parent bumps `resetCounter` (via `ngOnChanges` watching the input).
- [ ] `ng generate component features/projects/components/members-dialog/remove-member-confirm-dialog --skip-tests=false`. Mirrors `CreateProjectDialogComponent` shell (ViewEncapsulation.None; panelClass prefix; DialogRef closes with `true`/`undefined`).
- [ ] Unit tests for each dumb component: input projection, output emission, presence/absence of owner-only controls, keyboard activation (Enter/Space).

### 5.5 Smart container component

- [ ] `ng generate component features/projects/components/members-dialog/members-dialog --skip-tests=false`. Place its subcomponents' folders *inside* this folder per the tree in §2.4.
- [ ] Inject `DialogRef`, `DIALOG_DATA` (using `inject(DIALOG_DATA) as MembersDialogData`), `MembersStateService`, `AuthService`, `Dialog`, `EnvironmentInjector`, `DestroyRef`.
- [ ] `ngOnInit`: call `membersState.loadMembers(data.project.id)`.
- [ ] Define signals:
  - `protected readonly listVm = computed<MembersListViewModel>(() => collapse(membersState.selectForProject(data.project.id)()))`
  - `protected readonly addVm = computed<AddMemberViewModel>(() => ...)` derived from local `submitting` + `addError` + `resetCounter` signals.
  - `protected readonly pendingRemovalUserId = signal<string | null>(null)`
  - `protected readonly roleRevoked = signal<boolean>(false)`
  - `protected readonly canManage = computed(() => this.isOwner && !this.roleRevoked())`
- [ ] Implement `onAddSubmit(email)`: trims, sets `submitting=true`, clears `addError`, subscribes (via `runInInjectionContext(this.appInjector, …)` — same pattern as `CreateProjectDialogComponent:120` so the request is not cancelled if the dialog closes mid-flight) to `membersState.addMemberByEmail(projectId, email)`. On next → bump `resetCounter`, clear `submitting`. On error → check for `/owner/i` or 403-equivalent copy and set `roleRevoked=true` if applicable; set `addError` to the user-readable message; clear `submitting`.
- [ ] Implement `onRemoveClick(member)`: open `RemoveMemberConfirmDialogComponent` via injected `Dialog`. On afterClosed → if `true`, set `pendingRemovalUserId=member.userId`; subscribe to `membersState.removeMember(projectId, member.userId)` (again in `runInInjectionContext`). On settle clear `pendingRemovalUserId`. On error set `addError` and `roleRevoked` if 403. On success: focus management per AC — if there is a next row, focus it; else focus add-member input via `@ViewChild(AddMemberFormComponent).focusInput()`; else focus dialog close button.
- [ ] Template layout (to be styled per design spec):
  - Header: `<h2 id="members-dialog-title">Members — {{ data.project.name }}</h2>` + close button.
  - If `listVm().status === 'error'` → error banner with retry button calling `membersState.loadMembers(projectId, true)`.
  - Else the list area renders per `listVm()` switch (loading skeleton / empty-state copy / list).
  - Below the list: owner-only `AddMemberFormComponent` if `canManage()`; otherwise a small muted note "Only owners can add or remove members." (design-spec decision on exact copy).
  - Set `aria-labelledby="members-dialog-title"` on the root container.
- [ ] Call `Dialog.open(MembersDialogComponent, { data: { project }, ariaLabelledBy: 'members-dialog-title', autoFocus: 'first-tabbable', restoreFocus: true, panelClass: 'members-dialog-panel', backdropClass: 'members-dialog-backdrop' })` from `DashboardPageComponent.openMembersDialog(project)`. Mirror the `CreateProjectDialogComponent` dialog-open options for consistency.

### 5.6 Entry-point wiring on the card

- [ ] In `ProjectCardComponent`: add `@Output() manageMembersClick = new EventEmitter<ProjectSummary>()` and `protected readonly canManage = computed(() => this.roleVariant() === 'owner')`. Template renders the button inside `@if (canManage()) { … }` with `aria-label="Manage members for {{ project.name }}"` and `(click)="manageMembersClick.emit(project)"`. Click propagation: call `$event.stopPropagation()` since the `<article>` is `tabindex="0"` and might receive a future click handler.
- [ ] In `ProjectGridComponent`: add `@Output() manageMembersClick` and wire through in the template.
- [ ] In `DashboardPageComponent`: add `protected openMembersDialog(project: ProjectSummary): void` that calls `Dialog.open` per §5.5. Wire `(manageMembersClick)` on the grid.

### 5.7 Error handling & recovery

- [ ] List-fetch error → error banner with Retry (§5.5).
- [ ] Add error → inline banner above form, form stays editable, submit button re-enabled (driven by `addVm.status === 'idle'`).
- [ ] Remove error → banner at dialog-level; row unchanged; `pendingRemovalUserId` cleared.
- [ ] 401 → global `authInterceptor` already redirects; dialog's `runInInjectionContext` + `DestroyRef` guarantees no post-destroy writes.
- [ ] 403 on mutation → set `roleRevoked=true` so hide owner-only controls; mirror AC-34.

### 5.8 Accessibility & a11y polish

- [ ] `aria-labelledby` on the dialog container referencing the "Members — {name}" heading (AC-45).
- [ ] `<ul role="list">` for the member list; each `<li>` holds the row (AC-43).
- [ ] Every input has an associated label — `FormInputComponent` handles this already; confirm the `label` input is set to "Email" on the add form (AC-41).
- [ ] Focus trap is automatic via `Dialog`; confirm `autoFocus: 'first-tabbable'` and `restoreFocus: true` options (AC-44, AC-26).
- [ ] Pressing Escape closes the dialog (CDK default); on close the trigger button on the card receives focus back (CDK `restoreFocus`).
- [ ] Remove-confirm child dialog: `aria-labelledby` to its heading containing the member's name (AC-47).
- [ ] Focus management after a successful remove (§5.5 onRemoveClick last step).
- [ ] Color contrast handled in design spec, not here.
- [ ] `axe-core` run in component tests with `jest-axe`/`vitest-axe` equivalent — see §6.4 (AC-48).

### 5.9 Build verification

- [ ] `npm run build` from `KanbAI-Web/KanbAI-Web/` — zero new errors / warnings attributable to this feature.
- [ ] `npm run test -- --watch=false` — zero INTRODUCED failures.

**Performance Considerations**
- Every component `OnPush`.
- `trackBy` on the members list (by `userId`).
- No virtual scroll — the context confirms the expected member count per project is small.
- HTTP calls are one-shot (no polling / no WebSocket in #33).

---

## 6. QA Guidance

### 6.1 Unit Tests (component-level)

**`MembersDialogComponent`:**
- Renders loading state while `listVm().status === 'loading'`.
- Renders error state + retry button; retry triggers `loadMembers(projectId, true)`.
- Owner + loaded state: add-form and remove buttons are rendered.
- Non-owner + loaded state: add-form is absent AND no remove buttons appear on any row.
- Self-row is visibly indicated (the `isSelf` prop drives a "(You)" marker on the row).
- `onAddSubmit` happy path: calls `membersState.addMemberByEmail`; on success the `resetCounter` increments.
- `onAddSubmit` 400 "not found": the returned error message "We couldn't find a user with that email." appears in the add banner; no row added.
- `onAddSubmit` 400 "already a member": the corresponding copy appears; no duplicate row.
- `onAddSubmit` 403: `roleRevoked` flips true; add form and all remove buttons disappear.
- `onRemoveClick`: opens the confirm dialog; cancel → no API call; confirm → `removeMember` invoked once.
- Remove success removes the row; focus moves to the next row (assert `document.activeElement`).
- Remove 400 "last owner": row remains; error copy visible.
- Rapid double-click on Remove button does not produce two requests (button disabled by `pendingRemovalUserId` binding).

**`MembersListComponent` + `MemberRowComponent`:**
- Input projection for `members`, `currentUserId`, `isOwner`, `pendingRemovalUserId`.
- Output emission from `(removeClick)`.
- `canRemove` is false when `!isOwner || isSelf || member.role === 'Owner'`.
- `isPending` disables the row's Remove button and shows a spinner affordance.

**`AddMemberFormComponent`:**
- Email Validators: empty, whitespace-only, malformed → submit disabled / field-level error.
- Valid email → emits trimmed value on submit.
- `resetCounter` change resets form and refocuses input (via ViewChild spy).
- `disabled=true` disables input and submit button.

**`RemoveMemberConfirmDialogComponent`:**
- Close-with-`true` on confirm, close-with-`undefined` on cancel / ESC.
- `aria-labelledby` points to a heading containing the member's name.

**`ProjectCardComponent` changes:**
- `manageMembersClick` output emits the `project` when clicked.
- The Manage button renders iff `role` is "Owner" (case-insensitive via `roleVariant()`).
- `(click)` on the button calls `stopPropagation()` (spy on event).

**`DashboardPageComponent` changes:**
- `(manageMembersClick)` → `Dialog.open` called with `MembersDialogComponent` and the clicked project as `data.project`.

### 6.2 Unit Tests (service-level)

**`MembersApiService`:** mirror `projects-api.service.spec.ts` shape. One test per HTTP method + envelope unwrap + `success:false → error` + HTTP error surfaces through error branch. For `mapMemberErrorToUserMessage`, one parameterized test per row in §4.3.

**`MembersStateService`:** mirror `project-state.service.spec.ts` shape. Tests listed in §5.3 last bullet.

### 6.3 Integration tests (component + service wiring)

- Mount `DashboardPageComponent` with a stub `ProjectStateService` producing one owned and one member-role project. Click the Manage button on the owned card → assert `Dialog.open` is called with `MembersDialogComponent`.
- Mount `MembersDialogComponent` with a real `MembersStateService` but `HttpClientTestingModule`. Flush the GET → list renders. Flush an add POST → new row appears. Flush a DELETE → row disappears.

### 6.4 a11y tests

- `axe-core` (via `@axe-core/angular` or component-test equivalent) on the dialog's "list loaded" state and its "add-form focused" state. Zero critical or serious violations.
- Keyboard traversal test: Tab from the close button reaches add input, submit, each row's remove button (if owner), in order. ESC closes.

### 6.5 Mocking patterns

```typescript
// MembersStateService mock used by dialog component tests
const mockMembersState = {
  selectForProject: (id: string) => computed(() => ({
    members: [/* fixture */], isLoading: false, error: null, hasLoaded: true
  })),
  loadMembers: vi.fn(),
  addMemberByEmail: vi.fn(() => of(<MemberSummary>{ /* fixture */ })),
  removeMember: vi.fn(() => of(void 0))
};

TestBed.configureTestingModule({
  providers: [
    { provide: MembersStateService, useValue: mockMembersState },
    { provide: DIALOG_DATA, useValue: <MembersDialogData>{ project: ownedProject } },
    { provide: DialogRef, useValue: { close: vi.fn() } },
    { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(true) })) } }
  ]
});
```

### 6.6 Edge cases to cover

- **Empty roster post-load** (theoretically impossible but defensive): renders "No members yet" rather than crashing. The backend always has the owner, so this state is only reachable via a buggy response.
- **Project deleted in another tab while dialog open:** next mutation returns 404 project → dialog surfaces "This project no longer exists" message; `pruneRemovedProjects` effect will also drop the slice on next `projectState.loadProjects` — confirm dialog does not crash on that prune.
- **Rapid successful adds:** resetCounter increments each time; no focus flicker; no duplicate rows (server is the source of truth).
- **Concurrent removal in another tab:** the row is already gone server-side; remove returns 404 → local remove still proceeds silently (AC-33).
- **Trailing whitespace in email:** `AddMemberFormComponent.onSubmit` trims before emitting.
- **User pastes own email:** server responds 400 "already a member"; shared copy applies. No special client-side guard.

---

## 7. Decision Summary (answers to every context-doc deferral)

| Context-doc question | Decision | Rationale |
|----------------------|----------|-----------|
| Entry point from the dashboard card | New owner-only icon-button on `ProjectCardComponent` header (next to role badge); hidden for non-owners | One-click (≤ 2 activations per AC-1); keyboard-reachable; non-owners have no path — simplest form of owner-only gating |
| Modal vs. route | CDK Dialog, no new route | Reuses #32 `Dialog` infra; no history noise (AC-27); matches design conventions |
| Extend `ProjectStateService` vs. new service | **New sibling `MembersStateService`** | Per-project cache lifecycle differs; avoids coupling unrelated invalidation; single-responsibility |
| Owner-only gating strategy | Trust cached `ProjectSummary.role` on open + 403 safety-net that flips `roleRevoked` signal | Zero extra round-trip; 403 is server-authoritative anyway; avoids TOCTOU illusion |
| Remove confirmation pattern | Secondary CDK Dialog (`RemoveMemberConfirmDialogComponent`) | Mirrors destructive-action pattern; screen-reader friendly via `aria-labelledby`; prevents single-click removal (AC-24) |
| Error-mapping extension | **New `MemberOperation` union + `mapMemberErrorToUserMessage` sibling helper** | Different error shapes (400 "not found" / "already a member" / "last owner") have no analogue in project CRUD; keeps `ProjectOperation` stable |
| Open Assumption A (member-list endpoint) | **Resolved — `GET /api/project/{projectId}/members` shipped in `KanbAI-Core`** | Backend collapses "project missing" and "caller not a member" into one `404 "Project not found."` — reflected in §4.3 |
| Open Assumption B (email → userId) | **Resolved — Option B1 shipped (`AddMemberDto.Email` accepted)** | B2 fallback retained only as historical note; frontend sends `{ email }` directly |

---

## 8. Security & Privacy

- All member endpoints require JWT; the global `authInterceptor` handles token attachment and 401-redirect. No token handling in the new code.
- No PII logged. `console.error` / `console.log` of error bodies is prohibited — only user-readable copy is rendered.
- Email input: `Validators.email` (client-side shape check) + server-side validation. No further sanitisation — email is rendered only as text content, never as innerHTML.
- No local-storage use for member data. The state service is memory-only and is cleared on logout via the existing `AuthService.currentUser` effect pattern.
- Dialog `DIALOG_DATA` carries a `ProjectSummary` reference from the cache — no deep-cloning needed because the dialog never mutates it.

---

*The technical specification is saved. The backend prerequisite in §0 has shipped; you can now instruct the web-designer agent to create the design specification.*

---

## Development Status

**Implementation Date:** 2026-04-30
**Developer:** Claude (Opus 4.7)

### Working-tree notes
- Actual Angular source root is `KanbAI-Web/src/...` (the spec occasionally shows a doubled `KanbAI-Web/KanbAI-Web/src/...` prefix — ignored).
- `npm run build` / `npm test` are run from `KanbAI-Web/` (package.json location).
- Live backend was NOT exercised; contracts verified against §0 documentation and `.claude/backend_api_map.md`, which was updated in this pass to add the new `GET /members` row and enrich `AddMemberDto`.

### Files created (24)
Models / state:
- `src/app/features/projects/models/member.model.ts`
- `src/app/features/projects/state/members-state.model.ts`
- `src/app/features/projects/state/members-state.service.ts`
- `src/app/features/projects/state/members-state.service.spec.ts`

Service:
- `src/app/features/projects/services/members-api.service.ts`
- `src/app/features/projects/services/members-api.service.spec.ts`

Components (all OnPush, standalone):
- `src/app/features/projects/components/members-dialog/members-dialog.component.{ts,html,scss,spec.ts}`
- `src/app/features/projects/components/members-dialog/members-dialog.types.ts`
- `src/app/features/projects/components/members-dialog/members-list/members-list.component.{ts,html,scss,spec.ts}`
- `src/app/features/projects/components/members-dialog/member-row/member-row.component.{ts,html,scss,spec.ts}`
- `src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.{ts,html,scss,spec.ts}`
- `src/app/features/projects/components/members-dialog/remove-member-confirm-dialog/remove-member-confirm-dialog.component.{ts,html,scss,spec.ts}`
- `src/app/features/projects/components/members-dialog/remove-member-confirm-dialog/remove-member-confirm-dialog.types.ts`

### Files modified (7)
- `src/app/features/projects/components/project-card/project-card.component.{ts,html,scss,spec.ts}` — owner-only icon-button; `canManage` computed; `manageMembersClick` output; click `stopPropagation`.
- `src/app/features/projects/components/project-grid/project-grid.component.{ts,html,spec.ts}` — `manageMembersClick` re-emit wiring.
- `src/app/features/projects/dashboard-page/dashboard-page.component.{ts,html,spec.ts}` — `openMembersDialog(project)` plus wiring on the grid output.
- `.claude/backend_api_map.md` — added `GET /project/{id}/members` row, enriched `AddMemberDto` (userId OR email), copy-matrix hints for 400 variants.

`app.routes.ts` was **not** modified (modal pattern — see §2.1).  
`ProjectStateService` was **not** modified (new sibling service — see §3.1).

### Build & Test results
- **Build:** SUCCESS (`npm run build`, 5.4s, 0 errors, 0 warnings attributable to this feature).
- **Tests:** 547 / 547 passed across 38 test files. 0 INTRODUCED failures, 0 PRE-EXISTING failures. Previous `main` total was 518; this feature adds 29 new passing tests plus incremental assertions in the modified specs.

### Design-spec deviations / notes
- `member-row.component.scss` re-declares the `.project-card__badge` / `--owner` / `--member` / `--default` classes scoped under `.member-row__badge-slot`. Reason: the row lives inside an `OnPush` child component under the members-dialog shadow boundary; the global class rules in `project-card.component.scss` are scoped to that component's own encapsulated styles, so the badge would render unstyled without a local copy. Values are lifted **verbatim** from `project-card.component.scss:70-94` — no new tokens introduced.
- The skeleton-row branch from design-spec §3.3 was not implemented: the `MembersListComponent` only renders `success`; the parent `MembersDialogComponent` uses a simple "Loading members…" copy during `listVm.status === 'loading'` (matches the business AC — loading, empty, error must be designed, but skeleton fidelity is presentation detail). The live-region already announces "Loading members…", so screen-reader feedback is preserved.
- Only one `rgba(0,0,0,0.08)` literal survives — the Remove-button hover overlay in the confirm dialog, as flagged by design-spec §3.6.

### Edge cases for QA
- **Owner removing self** → never renders Remove on the self row (dumb component guard).
- **Last-owner 400** → inline error banner via `addError` + row stays at full opacity.
- **Concurrent-remove 404** → silent local removal; no error banner.
- **403 on add or remove** → `roleRevoked` flips true; add-form and all Remove buttons unmount in the same render.
- **Project deleted in another tab** → `MembersStateService` prune effect drops the slice when the project disappears from `ProjectStateService.projects`.
- **Rapid double-click on Remove** → `pendingRemovalUserId` guard blocks a second request.
- **Late response after dialog close** → `runInInjectionContext(appInjector, ...)` keeps the subscription alive so the cache update still lands (mirrors `CreateProjectDialogComponent`).
- **Logout while dialog open** → `MembersStateService.reset()` unsubscribes in-flight loads and clears `byProjectId`.

### Known limitations
- No `mode: 'view'` branch for non-owners (explicitly deferred in tech spec §2.2; non-owners have no entry point today so the branch is unreachable).
- No `@axe-core/angular` integration — test harness uses Vitest + Angular 21 `TestBed`; a11y coverage is via unit tests for aria attributes, focus, and copy. Adding axe-core would be a separate infra issue.
- Skeleton shimmer and row enter/leave animations not implemented (see design-spec deviation note above). Not blocking any AC.

*Ready for QA review.*
