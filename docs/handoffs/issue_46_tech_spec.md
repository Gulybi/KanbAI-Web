# Technical Specification: Integrate Real-time Events with State Management

**Context Document:** [issue_46_context.md](./issue_46_context.md)
**GitHub Issue:** #46
**Milestone:** #5 — Real-time UI Updates & Kanban Interaction
**Depends on:** #45 (SignalR transport) — DONE

## Overview

This ticket wires the already-live SignalR transport to the Signals-based state services so that server-originated mutations appear in the UI within ~2 seconds without a refresh. Three state services are involved: `ProjectStateService` reconciles `ProjectUpdated` / `ProjectDeleted`; `MembersStateService` reconciles `MemberAdded` / `MemberRemoved`; a new `BoardStateService` reconciles `ColumnCreated` / `ColumnDeleted` / `TaskCreated` / `TaskMoved` and owns the `JoinProjectGroup` / `LeaveProjectGroup` lifecycle tied to board navigation. `SignalRService` is extended with two additive hub-invocation methods so consumers never call the underlying `HubConnection.invoke(...)` directly. The board route becomes parameterized (`/board/:projectId`) so the project id for Join/Leave is available from the URL; the empty `BoardPageComponent` shell picks up that param in `ngOnInit` and drives the lifecycle through `BoardStateService`.

Because the `ProjectStateService` and `MembersStateService` subscribers must survive logout → login cycles (the transport completes its event subjects on `stop()`), every real-time subscriber re-registers via an `effect()` on `SignalRService.connectionState` rather than in the constructor.

---

## Component Architecture

### Routing

**Modified route:**

| Path | Component | Guard | Description |
|------|-----------|-------|-------------|
| `/board/:projectId` | BoardPageComponent | authGuard | Board view for a specific project — drives Join/Leave lifecycle |

**Route Configuration (replace the existing `/board` entry in [app.routes.ts](../../KanbAI-Web/src/app/app.routes.ts)):**
```typescript
{
  path: 'board/:projectId',
  loadComponent: () =>
    import('./features/board/board-page/board-page.component').then(m => m.BoardPageComponent),
  canActivate: [authGuard]
}
```

The `path: 'board'` entry is replaced, not kept. Any existing test / navigation to `'/board'` without a project id is updated in the implementation steps. The wildcard fallback stays unchanged.

### Component Hierarchy

**Smart Components (Containers — modified):**
- `BoardPageComponent` ([features/board/board-page/board-page.component.ts](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts)) — reads `projectId` from `ActivatedRoute`, calls `boardStateService.enterBoard(projectId)` in `ngOnInit`, and `boardStateService.leaveBoard()` in `ngOnDestroy`. Still a UI shell — it does NOT render columns or tasks in this ticket (that is #47).

**Services (new):**
- `BoardStateService` ([features/board/state/board-state.service.ts](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts)) — owns local kanban state (`columns`, `tasksByColumnId`, `currentProjectId`), drives Join/Leave through `SignalRService`, and reconciles the four board-scope events into state.

**Services (modified — existing):**
- `ProjectStateService` ([features/projects/state/project-state.service.ts](../../KanbAI-Web/src/app/features/projects/state/project-state.service.ts)) — gains a real-time subscriber that reconciles `ProjectUpdated` / `ProjectDeleted` into the existing `projects` signal. Also manages auto-join/auto-leave of project groups to match the current project list, so project-scope and member-scope events flow even when the user is not on a board. See [Join strategy](#join-strategy-two-layers).
- `MembersStateService` ([features/projects/state/members-state.service.ts](../../KanbAI-Web/src/app/features/projects/state/members-state.service.ts)) — gains a real-time subscriber that reconciles `MemberAdded` / `MemberRemoved` into the per-project slice.
- `SignalRService` ([core/services/signalr.service.ts](../../KanbAI-Web/src/app/core/services/signalr.service.ts)) — **additive only**: two new public methods `joinProjectGroup(projectId)` and `leaveProjectGroup(projectId)`. Existing API (`on`, `start`, `stop`, `connectionState`) is untouched. The interface `SignalRServiceContract` is extended with the two methods.

### New Files to Create
- `src/app/features/board/state/board-state.service.ts`
- `src/app/features/board/state/board-state.service.spec.ts`
- `src/app/features/board/state/board-state.model.ts`
- `src/app/core/models/realtime-events.ts` — typed server-event DTO declarations
- `src/app/features/projects/state/project-state.realtime.spec.ts` — (optional; see Test Strategy) new spec file or add describe-block to existing `project-state.service.spec.ts`
- `src/app/features/projects/state/members-state.realtime.spec.ts` — same pattern

### Files to Modify
- `src/app/app.routes.ts` — replace `path: 'board'` with `path: 'board/:projectId'`
- `src/app/app.routes.spec.ts` — update all `/board` navigations to `/board/{id}`
- `src/app/core/services/signalr.service.ts` — add `joinProjectGroup` / `leaveProjectGroup`; extend `SignalRServiceContract`
- `src/app/core/services/signalr.service.spec.ts` — add tests for the new methods (including "queued when disconnected" and "invoked once connected")
- `src/app/features/projects/state/project-state.service.ts` — add real-time subscribers + auto-join/leave effect
- `src/app/features/projects/state/project-state.service.spec.ts` — add real-time describe-block (provide mock `SignalRService` with test-controlled `Subject`s)
- `src/app/features/projects/state/members-state.service.ts` — add real-time subscribers
- `src/app/features/projects/state/members-state.service.spec.ts` — add real-time describe-block
- `src/app/features/board/board-page/board-page.component.ts` — read route param, drive Join/Leave via `BoardStateService`
- `src/app/features/board/board-page/board-page.component.spec.ts` — update and add tests covering ngOnInit/ngOnDestroy
- `src/app/features/projects/components/project-card/project-card.component.*` — if it navigates to `/board`, update to `/board/{project.id}` (verify during implementation; out-of-scope if no such link exists yet)

---

## State & Data Layer

### TypeScript Interfaces — Realtime Event DTOs

**File:** `src/app/core/models/realtime-events.ts`

Payload shapes mirror the backend `MemberRemovedEventDto`, `ColumnDeletedEventDto`, `TaskMovedEventDto`, `ProjectUpdatedEventDto`, `ProjectDeletedEventDto`, and the re-used response DTOs (`MemberResponseDto`, `ColumnResponseDto`, `TaskResponseDto`). All properties are camelCase — matches ASP.NET Core JSON default; confirmed in `backend_api_map.md`.

```typescript
// Event names — string-literal constants used to subscribe via SignalRService.on<T>(NAME).
// Kept as a single source of truth so typos can't drift between subscribers.
export const REALTIME_EVENT = {
  ProjectUpdated: 'ProjectUpdated',
  ProjectDeleted: 'ProjectDeleted',
  MemberAdded: 'MemberAdded',
  MemberRemoved: 'MemberRemoved',
  ColumnCreated: 'ColumnCreated',
  ColumnDeleted: 'ColumnDeleted',
  TaskCreated: 'TaskCreated',
  TaskMoved: 'TaskMoved'
} as const;
export type RealtimeEventName = typeof REALTIME_EVENT[keyof typeof REALTIME_EVENT];

export interface ProjectUpdatedEvent {
  projectId: string;
  name: string;
  description: string | null;
  updatedAt: string; // ISO-8601
}

export interface ProjectDeletedEvent {
  projectId: string;
}

// ⚠ BACKEND CAVEAT: MemberAdded is broadcast with the raw MemberResponseDto
// — no projectId. Attribution is done from the "current dialog context"
// (MembersStateService.currentProjectContext signal). See Known Backend
// Contract Caveats section.
export interface MemberAddedEvent {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string; // ISO-8601
}

export interface MemberRemovedEvent {
  userId: string;
  projectId: string;
}

// ⚠ BACKEND CAVEAT: ColumnCreated payload carries projectId directly.
export interface ColumnCreatedEvent {
  id: string;
  name: string;
  colorCode: string | null;
  columnOrder: number;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnDeletedEvent {
  columnId: string;
  projectId: string;
}

// ⚠ BACKEND CAVEAT: TaskCreated payload is TaskResponseDto — no projectId.
// Attribution is done via BoardStateService.currentProjectId + the group
// the client is joined to (the only reason this event arrives at all).
export interface TaskCreatedEvent {
  id: string;
  title: string;
  content: string | null;
  taskOrder: number;
  columnId: string;
  assignedId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskMovedEvent {
  taskId: string;
  oldColumnId: string;
  newColumnId: string;
  oldTaskOrder: number;
  newTaskOrder: number;
  task: TaskCreatedEvent; // full post-move TaskResponseDto
}
```

### BoardStateService Model

**File:** `src/app/features/board/state/board-state.model.ts`

```typescript
import { ColumnResponseDto, TaskResponseDto } from '../../../core/models/realtime-events';

// ColumnResponseDto / TaskResponseDto are re-exported from realtime-events.ts
// for this ticket. When #47 lands and introduces HTTP-side DTOs, migrate to a
// shared models folder.

export interface BoardColumn {
  id: string;
  name: string;
  colorCode: string | null;
  columnOrder: number;
  projectId: string;
}

export interface BoardTask {
  id: string;
  title: string;
  content: string | null;
  taskOrder: number;
  columnId: string;
  assignedId: string | null;
}

export interface BoardState {
  /** projectId the user is currently viewing, set by `enterBoard(id)`. */
  currentProjectId: string | null;
  /** Columns belonging to the current project, ordered by columnOrder. */
  columns: BoardColumn[];
  /** Tasks indexed by columnId, ordered by taskOrder within each column. */
  tasksByColumnId: Record<string, BoardTask[]>;
}

export const INITIAL_BOARD_STATE: BoardState = {
  currentProjectId: null,
  columns: [],
  tasksByColumnId: {}
};
```

> **Note on initial population:** Per context ("introducing a board-level kanban state service populated from the backend is out of scope unless strictly necessary"), `columns` and `tasksByColumnId` are NOT fetched via HTTP in this ticket. They start empty. Column/task events reconcile **against whatever is in state**, which in this ticket is always empty unless a preceding event populated it. This is intentional: the reconciliation paths are exercised and tested, but the visible board UI comes in #47 alongside the HTTP load.

### State Management Strategy

**Local state (Signals):** `BoardStateService` uses `BaseStateService` — same pattern as `ProjectStateService` / `MembersStateService`. Public selectors: `currentProjectId`, `columns`, `tasksByColumnId`.

**Real-time subscription pattern (critical):** Every subscriber re-registers on connection. The shape is:

```typescript
// Inside each state service constructor (pseudocode — see implementation steps):
effect(() => {
  const state = this.signalRService.connectionState();
  if (state === 'connected') {
    // teardown previous bag, subscribe fresh
    this.subscriptionBag.forEach(s => s.unsubscribe());
    this.subscriptionBag = [];
    this.subscriptionBag.push(
      this.signalRService.on<ProjectUpdatedEvent>(REALTIME_EVENT.ProjectUpdated)
        .subscribe(evt => this.onProjectUpdated(evt))
    );
    // …one push per event name
  }
});
```

Why a connection-state effect and not `takeUntilDestroyed()` alone: `SignalRService.stop()` (called on logout) completes every event subject and clears the internal map. A `takeUntilDestroyed()` subscription lives for the whole session, but the Observable underneath it completes on logout and the subscriber will never re-receive events after the next login. Re-registering whenever state transitions to `'connected'` restores event flow on post-logout logins.

The `subscriptionBag` is torn down also when the service itself is destroyed (via `DestroyRef`) — defense in depth; `providedIn: 'root'` services live for the app lifetime, but the pattern is the same one used elsewhere in the codebase.

### Join strategy — two layers

**Layer 1 — `ProjectStateService` auto-joins all projects in the user's list.**
Whenever `this.projects()` changes (after a successful `loadProjects()` or CRUD mutation), the service diffs the new list against the previously joined set and invokes `joinProjectGroup(id)` for newly added ids, `leaveProjectGroup(id)` for removed ids. Also re-joins on reconnect (on the `connectionState === 'connected'` effect run). On logout / token clear, all joined groups are forgotten locally — SignalR cleans up group membership automatically on disconnect, so no explicit leave is required on logout.

This layer is what makes the dashboard and members-dialog ACs ("while viewing the dashboard a ProjectUpdated event arrives…") deliverable. Without it, the client would be in no project groups while on the dashboard.

**Layer 2 — `BoardPageComponent` explicitly invokes Join/Leave for the viewed board.**
This is redundant with Layer 1 for projects the user is already in (SignalR's `Groups.AddToGroupAsync` is idempotent on server side), but satisfies the AC literal ("`JoinProjectGroup` is invoked exactly once with that project's id" on board navigation) and is verifiable in DevTools WebSocket frames.

**Leave semantics (important):** On board exit we invoke `LeaveProjectGroup` ONLY IF the project id is NOT in the user's current project list. If it IS in the list (typical case — they're a member of the project they viewed), Layer 1 still wants them in the group. So `BoardStateService.leaveBoard()` calls `signalRService.leaveProjectGroup(id)` **only when the project id is not present in `projectStateService.projects()`** — i.e., the user viewed a project they no longer own/belong to (rare; e.g., they were removed mid-session). In the common case the Layer-2 leave is suppressed because Layer 1 wants the group retained.

> **AC literal vs. user-correct behavior — decision:** The AC says "`LeaveProjectGroup` is invoked exactly once with the same project id" on board exit. Invoking it naively would break the dashboard AC ("while viewing the dashboard a ProjectUpdated event arrives"). The chosen behavior satisfies the **spirit** of the AC (leave when no longer interested) over the **letter** (always leave on exit). This is documented here so QA can validate accordingly; if the literal interpretation is required, escalate.

---

## Service Integration

### SignalRService — additive public surface

**File:** `src/app/core/services/signalr.service.ts`

Extend the existing `SignalRServiceContract` and add two methods. Signatures:

```typescript
export interface SignalRServiceContract {
  readonly connectionState: Signal<SignalRConnectionState>;
  start(): Promise<void>;
  stop(): Promise<void>;
  on<T>(eventName: string): Observable<T>;

  /**
   * Invokes the server hub method `JoinProjectGroup(projectId)` once the
   * connection is `'connected'`. If called before start() completes, the
   * call is queued and re-issued on transition to `'connected'`. If called
   * while `'disconnected'`, returns a resolved Promise (no-op) — the
   * connection-state effect in the state services will re-trigger joins
   * on reconnect.
   *
   * Errors from the underlying `connection.invoke` (e.g., the backend
   * throws HubException on malformed id) are caught and logged via
   * console.error; no payload fields are logged. Does not reject the
   * returned Promise so a caller's await never throws.
   */
  joinProjectGroup(projectId: string): Promise<void>;

  /**
   * Inverse of joinProjectGroup. Same error-handling contract.
   */
  leaveProjectGroup(projectId: string): Promise<void>;
}
```

**Implementation sketch** (staff-engineer-level — developer writes the exact code):

```typescript
async joinProjectGroup(projectId: string): Promise<void> {
  // Validate shape defensively — the backend throws HubException on
  // non-Guid strings. Match by regex rather than round-tripping through
  // the backend to avoid an avoidable error log.
  if (!projectId || projectId.trim().length === 0) return;

  const connection = this.connection;
  if (!connection || this.state() !== 'connected') {
    // Intentional no-op: the state-service effect on connectionState will
    // call this method again when the connection lands in 'connected'.
    return;
  }

  try {
    await connection.invoke('JoinProjectGroup', projectId);
  } catch {
    console.error('SignalR JoinProjectGroup failed');
  }
}
```

`leaveProjectGroup` is symmetric. **Neither method ever logs the projectId or any payload** — per the CLAUDE.md logging/privacy rule and the AC "No payload field, no JWT, and no user id is written to console.log."

### Event handlers — reconciliation rules

All handlers are **idempotent** and **silent-no-op on missing entities**, per the AC "An event whose payload references an entity not currently present in local state is silently ignored."

#### ProjectStateService

```typescript
// ProjectUpdated: replace-in-place by projectId. If absent, ignore (user
// isn't a member locally).
private onProjectUpdated(evt: ProjectUpdatedEvent): void {
  const current = this.getState().projects;
  const index = current.findIndex(p => p.id === evt.projectId);
  if (index === -1) return; // silent no-op
  const updated: ProjectSummary = {
    ...current[index],
    name: evt.name,
    description: evt.description,
    updatedAt: evt.updatedAt
  };
  const next = [
    ...current.slice(0, index),
    updated,
    ...current.slice(index + 1)
  ];
  this.setState({ projects: next });
}

// ProjectDeleted: filter out. No-op if absent.
private onProjectDeleted(evt: ProjectDeletedEvent): void {
  const current = this.getState().projects;
  const next = current.filter(p => p.id !== evt.projectId);
  if (next.length !== current.length) {
    this.setState({ projects: next });
  }
}
```

**Group-membership reconciliation (same service, separate effect):**

```typescript
// Run whenever projects list OR connection state changes. Only acts when
// connected. Joins ids newly present, leaves ids newly absent.
private joinedProjectIds = new Set<string>();

constructor() {
  super();
  // …existing logout effect…

  effect(() => {
    if (this.signalRService.connectionState() !== 'connected') {
      // Disconnect wipes server-side group membership; clear local tracking
      // so a reconnect rejoins all current projects from scratch.
      this.joinedProjectIds.clear();
      return;
    }
    const desired = new Set(this.projects().map(p => p.id));
    // join newly desired
    for (const id of desired) {
      if (!this.joinedProjectIds.has(id)) {
        void this.signalRService.joinProjectGroup(id);
        this.joinedProjectIds.add(id);
      }
    }
    // leave no-longer-desired
    for (const id of this.joinedProjectIds) {
      if (!desired.has(id)) {
        void this.signalRService.leaveProjectGroup(id);
        this.joinedProjectIds.delete(id);
      }
    }
  });
}
```

#### MembersStateService

```typescript
// MemberRemoved: payload carries projectId. Filter out user from that
// slice. No-op if slice missing or user absent.
private onMemberRemoved(evt: MemberRemovedEvent): void {
  const slice = this.getState().byProjectId[evt.projectId];
  if (!slice) return;
  const next = slice.members.filter(m => m.userId !== evt.userId);
  if (next.length !== slice.members.length) {
    this.upsertSlice(evt.projectId, { members: next });
  }
}

// MemberAdded: ⚠ payload has NO projectId (see Known Backend Contract
// Caveats). Attribution strategy: the most-recently-opened members dialog
// sets `currentProjectContext` on MembersStateService; MemberAdded events
// are appended to THAT slice only while the context is set. If no context,
// the event is ignored (fall back to next dialog open triggering a reload).
//
// This is the best we can do until the backend wraps the payload in a
// MemberAddedEventDto with projectId.
private onMemberAdded(evt: MemberAddedEvent): void {
  const projectId = this.currentProjectContext();
  if (!projectId) return; // no open dialog → drop
  const slice = this.getState().byProjectId[projectId];
  if (!slice) return;
  // Dedupe — if the user was just added locally via HTTP response, skip.
  if (slice.members.some(m => m.userId === evt.userId)) return;
  const newMember: MemberSummary = {
    userId: evt.userId,
    name: evt.name,
    email: evt.email,
    role: evt.role,
    joinedAt: evt.joinedAt
  };
  this.upsertSlice(projectId, { members: [...slice.members, newMember] });
}
```

**New public API on `MembersStateService`:**

```typescript
private readonly contextSignal = signal<string | null>(null);
readonly currentProjectContext = this.contextSignal.asReadonly();

/** Called by members-dialog.component.ts on open. */
setCurrentProjectContext(projectId: string): void {
  this.contextSignal.set(projectId);
}

/** Called by members-dialog.component.ts on close. */
clearCurrentProjectContext(): void {
  this.contextSignal.set(null);
}
```

The existing `members-dialog.component.ts` is modified to call these two methods on open/close.

#### BoardStateService

```typescript
// ColumnCreated: append if projectId matches current, else ignore.
// Dedupe by id. Order by columnOrder.
private onColumnCreated(evt: ColumnCreatedEvent): void {
  if (evt.projectId !== this.getState().currentProjectId) return;
  const current = this.getState().columns;
  if (current.some(c => c.id === evt.id)) return;
  const next = [...current, { …evt }].sort((a, b) => a.columnOrder - b.columnOrder);
  this.setState({ columns: next });
}

// ColumnDeleted: remove column + drop its tasks bucket. No-op if absent.
private onColumnDeleted(evt: ColumnDeletedEvent): void {
  if (evt.projectId !== this.getState().currentProjectId) return;
  const current = this.getState().columns;
  const nextColumns = current.filter(c => c.id !== evt.columnId);
  if (nextColumns.length === current.length) return;
  const tasksByColumnId = { ...this.getState().tasksByColumnId };
  delete tasksByColumnId[evt.columnId];
  this.setState({ columns: nextColumns, tasksByColumnId });
}

// TaskCreated: append to the task bucket of evt.columnId, only if that
// column belongs to the current board. No-op if column is unknown
// (covers the "event for entity not in local state" AC).
private onTaskCreated(evt: TaskCreatedEvent): void {
  if (this.getState().currentProjectId === null) return;
  const columns = this.getState().columns;
  const column = columns.find(c => c.id === evt.columnId);
  if (!column) return;
  const bucket = this.getState().tasksByColumnId[evt.columnId] ?? [];
  if (bucket.some(t => t.id === evt.id)) return;
  const next = [...bucket, { …evt }].sort((a, b) => a.taskOrder - b.taskOrder);
  this.setState({
    tasksByColumnId: { ...this.getState().tasksByColumnId, [evt.columnId]: next }
  });
}

// TaskMoved: remove from oldColumnId bucket, insert into newColumnId
// bucket using evt.newTaskOrder. No-op if task is absent from local state.
private onTaskMoved(evt: TaskMovedEvent): void {
  if (this.getState().currentProjectId === null) return;
  const buckets = this.getState().tasksByColumnId;
  const oldBucket = buckets[evt.oldColumnId] ?? [];
  const existsOld = oldBucket.some(t => t.id === evt.taskId);
  if (!existsOld) return; // task not in state → silent no-op
  const newOldBucket = oldBucket.filter(t => t.id !== evt.taskId);
  const newBucket = buckets[evt.newColumnId] ?? [];
  const movedTask: BoardTask = { …evt.task };
  // insert ordered
  const inserted = [...newBucket.filter(t => t.id !== movedTask.id), movedTask]
    .sort((a, b) => a.taskOrder - b.taskOrder);
  this.setState({
    tasksByColumnId: {
      ...buckets,
      [evt.oldColumnId]: newOldBucket,
      [evt.newColumnId]: inserted
    }
  });
}
```

#### BoardStateService — board lifecycle API

```typescript
/**
 * Called by BoardPageComponent.ngOnInit with the :projectId param.
 * Sets currentProjectId, clears columns/tasks from any prior board,
 * and invokes JoinProjectGroup.
 */
enterBoard(projectId: string): void {
  this.setState({
    currentProjectId: projectId,
    columns: [],
    tasksByColumnId: {}
  });
  void this.signalRService.joinProjectGroup(projectId);
}

/**
 * Called by BoardPageComponent.ngOnDestroy. Clears the currentProjectId
 * and invokes LeaveProjectGroup ONLY IF the project is no longer in the
 * user's list (see Layer-2 Leave semantics in the Join strategy section).
 */
leaveBoard(): void {
  const projectId = this.getState().currentProjectId;
  this.setState({ currentProjectId: null, columns: [], tasksByColumnId: {} });
  if (!projectId) return;
  const userProjects = this.projectStateService.projects();
  const stillAMember = userProjects.some(p => p.id === projectId);
  if (!stillAMember) {
    void this.signalRService.leaveProjectGroup(projectId);
  }
}
```

### BoardPageComponent — modified

**Signature:**

```typescript
@Component({
  selector: 'app-board-page',
  imports: [],
  templateUrl: './board-page.component.html',
  styleUrl: './board-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly boardState = inject(BoardStateService);

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('projectId');
    if (!projectId) return; // shouldn't happen given the route shape
    this.boardState.enterBoard(projectId);
  }

  ngOnDestroy(): void {
    this.boardState.leaveBoard();
  }
}
```

The template (`board-page.component.html`) is NOT changed in this ticket — it stays the placeholder shell. Board UI is #47.

### HTTP Contracts — unchanged

No new HTTP endpoints. This ticket consumes only SignalR events. Existing HTTP behavior in `ProjectsApiService` / `MembersApiService` is unchanged.

---

## Implementation Steps

Follow in order. Run `npm run build` and `npm run test -- --watch=false` after step 5 and after step 11.

### 1. Realtime event DTOs
- [ ] Create `src/app/core/models/realtime-events.ts` with all interfaces and the `REALTIME_EVENT` constants object from the [State & Data Layer](#state--data-layer) section.

### 2. Extend SignalRService
- [ ] Add `joinProjectGroup(projectId: string): Promise<void>` and `leaveProjectGroup(projectId: string): Promise<void>` to `SignalRServiceContract`.
- [ ] Implement both methods on `SignalRService`. Guard on `state() !== 'connected'` → no-op. Wrap `connection.invoke(...)` in try/catch; log via `console.error` only (no payload).
- [ ] **Add unit tests** in `signalr.service.spec.ts`:
  - invokes underlying `connection.invoke('JoinProjectGroup', id)` when connected
  - is a no-op (does NOT invoke) when disconnected
  - logs via console.error on invoke rejection; never logs `id`
  - same for `leaveProjectGroup`

### 3. BoardStateService scaffolding
- [ ] Create `src/app/features/board/state/board-state.model.ts`.
- [ ] Create `src/app/features/board/state/board-state.service.ts` extending `BaseStateService<BoardState>`. Inject `SignalRService` and `ProjectStateService`.
- [ ] Implement the `connectionState` effect that (re)subscribes to the four board events. Store subscriptions in a bag; tear down on re-run.
- [ ] Implement `enterBoard(projectId)` and `leaveBoard()` per the [Board lifecycle API](#boardstateservice--board-lifecycle-api).
- [ ] Expose public selectors: `currentProjectId`, `columns`, `tasksByColumnId`.

### 4. ProjectStateService — add realtime subscribers + auto-join effect
- [ ] Inject `SignalRService` (a new private field). `AuthService`, `ProjectsApiService` are already injected.
- [ ] Add a `connectionState` effect that (re)subscribes to `ProjectUpdated` and `ProjectDeleted`. Reconcile per [Event handlers](#projectstateservice).
- [ ] Add a second effect that diffs `this.projects()` against a private `joinedProjectIds: Set<string>` and invokes `joinProjectGroup` / `leaveProjectGroup` as described in [Join strategy](#join-strategy-two-layers). Clears the set on disconnect.
- [ ] **Do NOT** change any existing HTTP flow — just layer realtime on top.

### 5. MembersStateService — add realtime subscribers + dialog context
- [ ] Inject `SignalRService`.
- [ ] Add private `contextSignal = signal<string | null>(null)` and public `setCurrentProjectContext` / `clearCurrentProjectContext` / `currentProjectContext` readonly signal.
- [ ] Add `connectionState` effect that (re)subscribes to `MemberAdded` and `MemberRemoved`. Reconcile per [Event handlers](#membersstateservice).
- [ ] Build verify: `npm run build`. Expected: no compile errors.

### 6. Wire up MembersDialog context
- [ ] In `members-dialog.component.ts`: on component init / dialog open, call `membersStateService.setCurrentProjectContext(projectId)`. On destroy / dialog close, call `clearCurrentProjectContext()`. Use `DestroyRef` pattern already present in that file.
- [ ] Verify no regression in the dialog's existing CRUD flows.

### 7. Route update
- [ ] In `app.routes.ts`: replace `path: 'board'` with `path: 'board/:projectId'`. Keep the loader and guard.
- [ ] Search the codebase for hardcoded `'/board'` strings (router.navigate, routerLink, tests) and convert to `'/board/{id}'`. The grep already surfaced `app.routes.spec.ts` — update every `await router.navigate(['/board'])` to `await router.navigate(['/board/some-id'])`.
- [ ] Update `app.routes.spec.ts` to still validate guard behavior against the parameterized path.

### 8. BoardPageComponent wiring
- [ ] Inject `ActivatedRoute` and `BoardStateService`.
- [ ] Implement `ngOnInit` and `ngOnDestroy` per spec.
- [ ] Update `board-page.component.spec.ts`:
  - existing rendering tests still pass (template is untouched)
  - new test: `ngOnInit` with `paramMap.projectId = 'p-1'` calls `boardState.enterBoard('p-1')`
  - new test: `ngOnDestroy` calls `boardState.leaveBoard()`
  - provide `ActivatedRoute` mock with `snapshot.paramMap.get('projectId')` returning `'p-1'`; provide `BoardStateService` with spy methods

### 9. Project-card navigation (conditional)
- [ ] Open `features/projects/components/project-card/project-card.component.ts` and its template. If it navigates to `/board` on click, update to `/board/${project.id}` (routerLink or router.navigate). If it doesn't yet navigate to a board, leave it — the dashboard→board navigation path is likely a future ticket.

### 10. Realtime tests for state services
- [ ] Add a `describe('real-time events', ...)` block in `project-state.service.spec.ts`:
  - provide mock `SignalRService` with `connectionState` a `WritableSignal<SignalRConnectionState>` under test control, and `on<T>(name)` returning a `Subject<T>` the test can `.next(...)` into
  - test that emitting `ProjectUpdated` replaces the matching entry
  - test that emitting `ProjectDeleted` removes the matching entry
  - test no-op on absent id (no state change, no throw)
  - test auto-join: when `projects()` becomes non-empty and state transitions to `'connected'`, `joinProjectGroup(id)` is invoked once per project id
  - test auto-leave: when a project is removed from the list, `leaveProjectGroup(id)` is invoked
  - test reconnect: on `connected → reconnecting → connected`, subscribers resubscribe and `joinedProjectIds` re-hydrates
- [ ] Add a `describe('real-time events', ...)` block in `members-state.service.spec.ts`:
  - MemberRemoved removes user from the matching slice; no-op if slice missing
  - MemberAdded with context set appends; without context drops; duplicate user ignored
- [ ] Add `board-state.service.spec.ts`:
  - `enterBoard(projectId)` invokes `joinProjectGroup(projectId)` and sets `currentProjectId`
  - `leaveBoard()` invokes `leaveProjectGroup` only when the project is no longer in user's list
  - ColumnCreated appends when projectId matches; ignored when projectId differs
  - ColumnDeleted removes matching column; no-op if absent
  - TaskCreated appends to correct bucket; no-op when column is unknown
  - TaskMoved removes from oldColumnId, inserts into newColumnId; no-op if task unknown in local state (this is the "ignored if not in state" AC)
  - Each handler never throws given malformed/partial input (iterate malformed fixtures)
  - No `console.log`/`console.error` calls contain payload fields (spy on console, fail if `.toHaveBeenCalledWith(stringContaining(projectId))`)

### 11. Build + test verification
- [ ] `npm run build` — must exit 0.
- [ ] `npm run test -- --watch=false` — classify any failures as PRE-EXISTING or INTRODUCED per CLAUDE.md. Fix all INTRODUCED.
- [ ] Manually verify in DevTools: log in, open the dashboard, check the WebSocket frames panel for a burst of `{"type":1,"target":"JoinProjectGroup","arguments":["<id>"]}` frames — one per project. Navigate to a board — one more Join frame for that id. Navigate back — no Leave frame (because user is still a member). Delete the project via API → Leave frame fires.

**Performance considerations:**
- The connection-state effect runs on every `connectionState` change; re-subscription overhead is O(event-count) = 4–8 subjects. Negligible.
- The project-diff effect runs on every `projects()` change. Uses `Set` lookups — O(n).
- TaskMoved reconciliation sorts a bucket — O(n log n) per move, n = tasks in a column. Fine for realistic boards.
- No virtual scrolling needed in this ticket — no UI.

---

## QA Guidance

### Test Strategy

**Unit Tests (services):**
- Every state service has a realtime describe-block using a mock `SignalRService` with test-controlled `Subject`s and a `WritableSignal<SignalRConnectionState>`. This lets each test drive connection-state transitions and emit events deterministically.
- `SignalRService` itself gets two new tests for the hub invocations — using a mock `HubConnection`.

**Integration Tests (component):**
- `BoardPageComponent.ngOnInit` with a fake `ActivatedRoute.paramMap` → verifies `BoardStateService.enterBoard(id)` is called once.
- Same for `ngOnDestroy` → `leaveBoard()`.

**End-to-End (manual, per the AC):**
- Two browser tabs, same user.
- Tab A: dashboard. Tab B: dashboard. In A, rename a project via the edit dialog → B's card reflects the new name within 2s, no refresh.
- In A, delete the project → B's card disappears within 2s.
- Navigate B to `/board/<projectId>`. Capture WebSocket frames; expect one `JoinProjectGroup` frame with that id.
- Navigate B back to `/dashboard`. With the project still present in B's list, expect NO `LeaveProjectGroup` frame (per the documented Leave semantics).
- Manually POST a task/column to that project via the backend API (curl / Postman) → verify the event is received in B's DevTools Network frames.

### Mocking Template

```typescript
// Shared helper for realtime tests
import { Subject } from 'rxjs';
import { signal, WritableSignal } from '@angular/core';

export function createMockSignalRService() {
  const subjects = new Map<string, Subject<any>>();
  const connectionState: WritableSignal<'disconnected' | 'connecting' | 'connected' | 'reconnecting'> =
    signal('disconnected');
  return {
    connectionState,
    on: <T>(name: string) => {
      let subject = subjects.get(name);
      if (!subject) {
        subject = new Subject();
        subjects.set(name, subject);
      }
      return (subject as Subject<T>).asObservable();
    },
    emit: <T>(name: string, payload: T) => subjects.get(name)?.next(payload),
    joinProjectGroup: jasmine.createSpy('joinProjectGroup'),
    leaveProjectGroup: jasmine.createSpy('leaveProjectGroup'),
    start: () => Promise.resolve(),
    stop: () => Promise.resolve()
  };
}

// Usage in TestBed:
TestBed.configureTestingModule({
  providers: [
    ProjectStateService,
    { provide: SignalRService, useValue: createMockSignalRService() },
    // …other providers
  ]
});
```

### Edge Cases to Test
- Event arrives BEFORE connection reaches `'connected'` — no-op, no throw (Subject is buffered only if state service hasn't subscribed yet; if already subscribed after a prior connect cycle, it lands correctly).
- Event with unknown id — silent no-op.
- TaskMoved with task not in state — silent no-op (covered in AC).
- MemberAdded without dialog context — dropped silently (documented behavior).
- Logout while board is open — `AuthStateService` flips, `SignalRService.stop()` runs, all state-service subjects complete; board's `leaveBoard` on destroy runs but is a no-op because connection is down.
- Reconnect during board session — `connectionState` flips `connected → reconnecting → connected`; each state service re-subscribes; `ProjectStateService` re-joins all projects; board's Layer-2 join is NOT automatically re-issued (it was a one-shot at enterBoard). **Decision:** `BoardStateService` also re-joins its `currentProjectId` on `connectionState → connected` transition (if `currentProjectId !== null`) to survive reconnects.
- Two sessions in two tabs, same user, same board — both receive the same events. Reconciliation is idempotent by id, so concurrent state updates converge.
- A malformed payload (e.g., missing `projectId`) — handler type-guards; else silent no-op.

### Console Hygiene Verification
- Jasmine `spyOn(console, 'error')` and `spyOn(console, 'log')` in every new describe-block.
- Assert that no payload field (projectId, userId, email, token) is ever part of a logged string. Use `expect(console.error).not.toHaveBeenCalledWith(jasmine.stringContaining(projectId))` pattern.

---

## Known Backend Contract Caveats

Documented so QA and future work know where the edges are.

1. **`MemberAdded` payload lacks `projectId`.** The payload is the raw `MemberResponseDto` — see `backend_api_map.md` §"Server-sent events." This frontend ticket works around it by attributing `MemberAdded` events to the currently-open members dialog (see [`onMemberAdded`](#membersstateservice)). This is correct for the AC (which only requires the reconciliation while the dialog is open) but will drop events if no dialog is open.
   **Recommendation:** file a backend ticket to wrap the payload in a `MemberAddedEventDto { projectId, member: MemberResponseDto }` so attribution is unambiguous. Once that lands, the attribution logic collapses to the same pattern as `MemberRemoved`.

2. **`TaskCreated` and `TaskMoved` payloads lack `projectId`.** Attribution is done via the `currentProjectId` held by `BoardStateService` plus the fact that the client only receives these events on project groups it has joined. This is safe because: (a) we only enter `enterBoard(id)` when the URL's `:projectId` equals `id`, so `currentProjectId` is accurate; (b) backend broadcasts only to the joined group, so an event arriving while on board X is for project X.

3. **`ProjectCreated` is not broadcast by design** (see `backend_api_map.md` §"Not yet broadcast"). This ticket does NOT subscribe to a `ProjectCreated` event name. Users see newly created projects only on the next `loadProjects()` (which the creator triggers via their own HTTP response handling — unchanged by this ticket).

4. **`LeaveProjectGroup` on board exit — AC literal vs. behavior:** The AC states `LeaveProjectGroup` is invoked on board exit. In the chosen design, Leave is **suppressed** when the user is still a member of that project (Layer 1 still wants the group). If QA's reading of the AC is strict-literal, escalate to re-evaluate.

---

## Design Validation (Staff-Engineer Self-Check)

- [x] Interfaces align with backend DTOs (camelCase, nullable fields preserved, ISO-8601 dates typed as `string`).
- [x] `inject()` is used throughout — matches existing pattern.
- [x] Signals for UI state; RxJS for event streams; `effect()` for connection-state + project-list reconciliation.
- [x] `ChangeDetectionStrategy.OnPush` preserved on `BoardPageComponent`.
- [x] Route guard (`authGuard`) retained on the parameterized board path.
- [x] No payload fields logged anywhere.
- [x] Every new subscriber re-registers on `connectionState === 'connected'` — survives logout/login.
- [x] All reconciliation handlers are idempotent and silent-no-op on missing entities — satisfies the "ignored if not in local state" AC.
- [x] All new files listed; all modifications listed.
- [x] Implementation steps ordered: DTOs → transport extension → services → component wiring → route → tests → build.
- [x] Acceptance criteria mapped:
  - AC 1 (ProjectUpdated dashboard) → `ProjectStateService.onProjectUpdated` + Layer-1 auto-join
  - AC 2 (ProjectDeleted dashboard) → `ProjectStateService.onProjectDeleted`
  - AC 3 (MemberAdded dialog) → `MembersStateService.onMemberAdded` + dialog context
  - AC 4 (MemberRemoved dialog) → `MembersStateService.onMemberRemoved`
  - AC 5 (Join on board, Leave on exit) → `BoardStateService.enterBoard` / `leaveBoard`
  - AC 6 (TaskMoved) → `BoardStateService.onTaskMoved`
  - AC 7 (TaskCreated) → `BoardStateService.onTaskCreated`
  - AC 8 (ColumnCreated) → `BoardStateService.onColumnCreated`
  - AC 9 (ColumnDeleted) → `BoardStateService.onColumnDeleted`
  - AC 10 (unjoined events ignored) → group-filter at backend + `currentProjectId` guard in handlers
  - AC 11 (entity-not-in-state ignored) → each handler's absence-check
  - AC 12 (subscriptions torn down on logout) → `SignalRService.stop()` contract + subscription bag teardown
  - AC 13 (no payload logged) → try/catch with bare-message logs only; verified by spec
  - AC 14 (build succeeds) → implementation step 11
  - AC 15 (tests pass) → implementation step 11

---

## Development Status

**Implemented** — 2026-05-04

### Files created
- `KanbAI-Web/src/app/core/models/realtime-events.ts` — typed DTOs + `REALTIME_EVENT` name constants
- `KanbAI-Web/src/app/features/board/state/board-state.model.ts`
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts`
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts`

### Files modified
- `KanbAI-Web/src/app/core/services/signalr.service.ts` — added `joinProjectGroup` / `leaveProjectGroup` (extended `SignalRServiceContract`)
- `KanbAI-Web/src/app/core/services/signalr.service.spec.ts` — added `invoke` to the mock HubConnection + 5 tests for the new methods (connected, disconnected, empty id, error logging/privacy)
- `KanbAI-Web/src/app/app.routes.ts` — replaced `path: 'board'` with `path: 'board/:projectId'`
- `KanbAI-Web/src/app/app.routes.spec.ts` — migrated every `/board` navigation / returnUrl assertion to `/board/proj-1`
- `KanbAI-Web/src/app/core/constants/auth-routes.ts` — `PROTECTED_PATHS` now carries `'board/:projectId'` instead of `'board'`
- `KanbAI-Web/src/app/core/constants/auth-routes.spec.ts` — updated the "board in PROTECTED_PATHS" lock test to the new path
- `KanbAI-Web/src/app/features/projects/state/project-state.service.ts` — injected `SignalRService`; added real-time subscribers (via connection-state effect) + Layer-1 auto-join/leave effect
- `KanbAI-Web/src/app/features/projects/state/project-state.service.spec.ts` — added `SignalRService` mock to DI + a `real-time events` describe covering `ProjectUpdated` / `ProjectDeleted` / auto-join / auto-leave / reconnect re-subscription / console hygiene
- `KanbAI-Web/src/app/features/projects/state/members-state.service.ts` — injected `SignalRService`; added realtime subscribers, `currentProjectContext` signal + `setCurrentProjectContext` / `clearCurrentProjectContext`
- `KanbAI-Web/src/app/features/projects/state/members-state.service.spec.ts` — added `SignalRService` mock + a `real-time events` describe covering `MemberRemoved` / `MemberAdded` (with and without context) / console hygiene
- `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.ts` — calls `setCurrentProjectContext` on init and clears it on destroy
- `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts` — extended the mock members-state to include the two context methods + 2 new assertions (set on init, clear on destroy)
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` — implements `OnInit` / `OnDestroy`, reads `projectId` from `ActivatedRoute.snapshot.paramMap`, drives `BoardStateService.enterBoard` / `leaveBoard`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` — rewritten to mount with mock `ActivatedRoute` + `BoardStateService`; new tests for `ngOnInit` / `ngOnDestroy` / missing-param guard + kept the rendering tests

### Build
- `npm run build` — **PASS** (clean bundle, no TS errors, no warnings).

### Tests
- `npm run test -- --watch=false` — **684 passed / 0 failed** on the happy full-suite run.
- Total test files: 42 (one new: `board-state.service.spec.ts`, ~30 tests).
- **PRE-EXISTING flakiness** in `src/app/core/services/signalr.service.spec.ts`: the `vi.mock('@microsoft/signalr', …)` factory occasionally loses its race with Angular's `vitest-mock-patch` when the full suite is run, manifesting either as the whole file failing to load (0 tests ran in that file) or as 17 of its tests failing with `TypeError: Cannot read properties of null (reading '_connection')` / `TypeError: Cannot read properties of undefined (reading 'trim')`. **Verified pre-existing by stashing my changes and observing the same intermittent failure on the base commit** (3 runs on base: 2× all-pass, 1× file failed). The file's own top-of-file comment documents this race. This ticket does not touch the underlying mock plumbing — the failure is not introduced by #46.
- No INTRODUCED failures. All realtime tests (ProjectStateService / MembersStateService / BoardStateService / MembersDialogComponent / BoardPageComponent / signalr.service additions / auth-routes) pass deterministically.

### Edge cases handled per tech spec
- Reconnect during board session: `BoardStateService` re-issues `JoinProjectGroup(currentProjectId)` on every `connectionState → connected` transition (see effect in `board-state.service.ts`).
- Logout → login cycle: every realtime subscriber (projects / members / board) lives in a `subscriptionBag` torn down on non-connected transitions and re-created on `connected`, so post-logout logins re-wire to the fresh Subjects minted by `SignalRService.on(...)`.
- `MemberAdded` without dialog context: silently dropped (documented caveat until backend wraps payload).
- `TaskMoved` / `TaskCreated` for a task or column not in state: silent no-op (AC11).
- `LeaveProjectGroup` on board exit suppressed when the user is still a member of the project (tech spec §"AC literal vs. user-correct behavior" decision).
- Malformed payloads (null, missing `projectId`, etc.): each handler type-guards; no throws. Covered by the `Malformed / partial payloads` describe in `board-state.service.spec.ts`.
- Console hygiene: every new handler tested to ensure no `projectId` / `userId` / `email` appears in `console.log` or `console.error`.

### Known limitations / follow-ups
- `BoardPageComponent` remains a visual placeholder per tech spec — the UI binding to `BoardStateService.columns` / `tasksByColumnId` lands in #47.
- Neither the column list nor the task buckets are populated via HTTP in this ticket (explicitly out of scope). Events reconcile against empty state by default, so in current production builds only the Join/Leave lifecycle + subscribers are visibly exercised until the `HTTP load columns + tasks` story lands.
- The `MemberAdded` payload attribution through `currentProjectContext` is a documented workaround; once the backend wraps the payload in a `MemberAddedEventDto { projectId, member }`, `onMemberAdded` should be collapsed to mirror `onMemberRemoved`.

### Decisions made outside the spec
- **PROTECTED_PATHS constant**: the spec lists the `app.routes.spec.ts` migration, but the `auth-routes.spec.ts` file separately locks the `'board'` entry in `PROTECTED_PATHS`. Updated both `auth-routes.ts` (value → `'board/:projectId'`) and its lock-test in the same spirit as the spec's route rename so the `routes.find(r => r.path === p)` sweep keeps guard coverage on the new path. No semantic change for callers.
- **Signal-type for `currentProjectContext`**: exposed as `Signal<string | null>` (via `contextSignal.asReadonly()`) so consumers can `computed()` over it; the spec only required the two setter methods and never nailed down reader access. Chose the readonly-signal idiom already used for `projects` / `hasLoaded` / etc. in the same file.

---

*"Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests."*

---

## QA Review — 2026-05-04

### AC coverage

| AC | Status | Spec file | Test name(s) |
|----|--------|-----------|--------------|
| AC1 ProjectUpdated on dashboard | covered | `KanbAI-Web/src/app/features/projects/state/project-state.service.spec.ts` | `real-time events > ProjectUpdated > replaces the matching entry in place on event arrival` (observable: `service.projects()[0].name` delta asserted) |
| AC2 ProjectDeleted on dashboard | covered | `project-state.service.spec.ts` | `real-time events > ProjectDeleted > removes the matching entry on event arrival` |
| AC3 MemberAdded in dialog | covered | `KanbAI-Web/src/app/features/projects/state/members-state.service.spec.ts` | `real-time events > MemberAdded > appends when context is set to the matching project`; MembersDialogComponent integration: `members-dialog.component.spec.ts > sets the members-state realtime context to the open project id on init` |
| AC4 MemberRemoved in dialog | covered | `members-state.service.spec.ts` | `real-time events > MemberRemoved > removes the user from the matching slice on event arrival` |
| AC5 Join on board enter / conditional Leave on exit (AC-literal deviation) | covered | `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts` | `enterBoard() / leaveBoard() > enterBoard sets currentProjectId and invokes joinProjectGroup`; `leaveBoard does NOT invoke leaveProjectGroup when user is still a member` (suppression); `leaveBoard invokes leaveProjectGroup when user is no longer a member`; `leaveBoard is a harmless no-op when currentProjectId is already null` |
| AC6 TaskMoved | covered | `board-state.service.spec.ts` | `TaskMoved > removes from oldColumnId and inserts into newColumnId`; `is a silent no-op when the task is not in local state` (the "ignored if not in state" half) |
| AC7 TaskCreated | covered | `board-state.service.spec.ts` | `TaskCreated > appends to the matching bucket in taskOrder ascending`; `is a silent no-op when the target column is unknown`; `dedupes a TaskCreated whose id is already in the bucket` |
| AC8 ColumnCreated | covered | `board-state.service.spec.ts` | `ColumnCreated > appends when projectId matches the current board`; `maintains columnOrder ascending across multiple emits`; `dedupes a ColumnCreated with an id already in state` |
| AC9 ColumnDeleted | covered | `board-state.service.spec.ts` | `ColumnDeleted > removes the column and drops its tasks bucket`; `is a silent no-op when the column is absent` |
| AC10 Events for unjoined projects ignored | covered | `board-state.service.spec.ts` | `ColumnCreated > ignores a ColumnCreated for a different project`; `ColumnDeleted > ignores a ColumnDeleted for a different project`; plus Layer-1 auto-join proof in `project-state.service.spec.ts > auto Join / Leave group membership (Layer 1)` |
| AC11 Entity not in local state → silent no-op | covered | `board-state.service.spec.ts` (TaskMoved/TaskCreated/ColumnDeleted no-op tests, `Malformed / partial payloads`); `project-state.service.spec.ts` (`ProjectUpdated is a silent no-op when the project is not in local state`; `ProjectDeleted is a silent no-op when the project is already absent`); `members-state.service.spec.ts` (MemberRemoved `is a silent no-op when the slice is missing`, `is a silent no-op when the user is not in the slice`) | see left |
| AC12 Subscriptions torn down on logout | covered | `project-state.service.spec.ts > real-time events > re-subscription after logout → login cycle`; `project-state.service.spec.ts > Subscription teardown on disconnect` (ADDED); `members-state.service.spec.ts > Subscription teardown on disconnect` (ADDED); `board-state.service.spec.ts > Logout → login cycle` (ADDED) | see left — the existing `re-subscription` test validates that fresh Subjects are wired after stop()/start(); the ADDED describe blocks cover the defense-in-depth angle for each service |
| AC13 No payload logged | covered | `project-state.service.spec.ts > real-time events > Console hygiene`; `members-state.service.spec.ts > real-time events > Console hygiene`; `board-state.service.spec.ts > Console hygiene`; `signalr.service.spec.ts > joinProjectGroup() / leaveProjectGroup() > logs a bare error and never throws when the hub invoke rejects, and never logs the projectId` | see left |
| AC14 Build succeeds | covered | `npm run build` exit 0 | N/A |
| AC15 Tests pass | covered | `npm run test -- --watch=false` | 688 passed / 0 failed |

### Gaps found & gaps filled

Four gap-filler tests were added. All production code is untouched; no new spec files were created.

1. **BoardStateService reconnect with no active board — Join must NOT fire.** The tech spec §"Edge Cases" gates the reconnect Join on `currentProjectId !== null`, but the existing spec only asserted the positive path. **Added:** `board-state.service.spec.ts > Reconnect — re-issues board-scope Join > does NOT re-issue a Join on reconnect when no board is active (currentProjectId === null)`.
2. **BoardStateService post-stop()/start() re-subscription (AC12).** The `ProjectStateService` spec had an explicit `re-subscription after logout → login cycle` test; the `BoardStateService` spec did not. **Added:** `board-state.service.spec.ts > Logout → login cycle (AC12 — subscribers re-wire to fresh Subjects) > a ColumnCreated emitted on a FRESH Subject after a stop()/start() cycle still reconciles`.
3. **ProjectStateService — disconnect tears down subscribers.** Production code explicitly calls `teardownRealtimeSubscriptions()` when `state !== 'connected'`; the spec did not lock that behavior. **Added:** `project-state.service.spec.ts > real-time events > Subscription teardown on disconnect (AC12 defense in depth) > stops reconciling ProjectUpdated after connectionState leaves connected`.
4. **MembersStateService — disconnect tears down subscribers.** Same rationale. **Added:** `members-state.service.spec.ts > real-time events > Subscription teardown on disconnect (AC12 defense in depth) > stops reconciling MemberRemoved after connectionState leaves connected`.

### Final test counts

- Before: 42 files, **684 passed / 0 failed / 0 skipped**
- After: 42 files, **688 passed / 0 failed / 0 skipped**
- Delta: **+4 tests**, 0 files added, 0 production files touched.
- Build: `npm run build` exits 0, bundle generated cleanly, no warnings.

### Bugs / concerns flagged

- **Inconsistency (not a bug at current design):** `BoardStateService`'s connection-state effect does NOT proactively call `teardownSubscriptions()` on transition to non-`'connected'` states (early-return without teardown). `ProjectStateService` and `MembersStateService` DO. Under the current contract this is fine — `SignalRService.stop()` completes every event Subject so stale subscriptions are inert — and on the next 'connected' transition `BoardStateService` does call `teardownSubscriptions()` as part of the refresh step. The `board-state.service.spec.ts > Logout → login cycle` test I added validates the contract end-to-end (subjects cleared → fresh subject after reconnect → event reconciled). No code change recommended in this ticket, but worth a note in #47's scope review if event plumbing is refactored.
- **Console hygiene verified:** the three handler specs (ProjectStateService / MembersStateService / BoardStateService) each include a `Console hygiene` describe that spies `console.log` + `console.error`, emits events with sentinel ids/emails, and asserts no spy call's stringified args contain any sentinel substring. The `SignalRService` Privacy test additionally covers the invoke-rejection path.
- **PRE-EXISTING flake confirmed absent on this run:** the documented `signalr.service.spec.ts` `vi.mock('@microsoft/signalr', …)` race did not manifest on the post-change happy-path run; all 23 tests in that file passed. If it reappears in CI, it is PRE-EXISTING per the tech spec §"Development Status" note and the top-of-file comment in `signalr.service.spec.ts`.
- **No INTRODUCED failures.** The four added tests all pass; no previously-passing test regressed.

### Console-hygiene verdict

**Pass.** Every new real-time handler is covered by a `Console hygiene` describe block that spies both sinks, emits events with sentinel `projectId` / `userId` / `email` / column / task values, and asserts every logged argument's stringified form does NOT contain any sentinel substring. The `SignalRService` group-invoke privacy test additionally covers the `HubException` branch (rejected invoke whose message contains the `projectId`). No `projectId`, `userId`, `email`, or token appears in any `console.error` or `console.log` call exercised by the new handlers.

### Final verdict

**Ready for code review.** All 15 acceptance criteria are covered by deterministic automated tests asserting observable behavior (state deltas on `projects()`, `members`, `columns`, `tasksByColumnId`; spy-call shape on `joinProjectGroup` / `leaveProjectGroup`). Coverage targets are met for the AC surface. Build exits 0. 688/688 tests pass. One design-consistency note flagged (BoardStateService teardown-on-disconnect asymmetry) is explicitly NOT a bug under the current contract; attaching it to #47's scope review is sufficient.

*"Test suite complete. All acceptance criteria covered, coverage targets met, and tests passing. Feature is ready for manual QA and code review."*
