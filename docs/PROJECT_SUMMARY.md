# KanbAI-Web — Project Summary

> Generated: 2026-05-11
> Scope: Frontend-only. The Angular SPA in this repository — not the ASP.NET Core backend (`KanbAI-Core`) it talks to.

---

## 1. What is KanbAI-Web?

**KanbAI-Web** is the **Angular 21 single-page frontend** of a real-time, multi-user **Kanban / project-management** product. Its job is to let an authenticated user:

1. Sign up / sign in,
2. See a dashboard of projects they own or are a member of,
3. Create new projects (with a customisable starter column set),
4. Invite / remove members on each project,
5. Open a project's **Kanban board**, read hydrated columns and tasks from the backend,
6. Create columns and tasks live on the board,
7. **Drag & drop** task cards within and across columns with an optimistic UI,
8. Open a **task detail drawer** to read / edit a task description and attach files,
9. Upload files (with progress tracking) and download teammates' uploads,
10. See **every teammate's change in real time** via SignalR broadcasts — no manual refresh.

The name "KanbAI" = "Kanban" + "AI". The landing page still flags an "AI assistance" card as **coming soon** (see [`landing-page.component.ts:39-45`](../KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.ts#L39-L45)). None of the AI features are implemented yet; the product today is a credible real-time collaborative Kanban tool with AI on the roadmap.

The sibling backend (`KanbAI-Core`, ASP.NET Core + SignalR, documented in `.claude/backend_api_map.md`) owns data, auth (JWT), authorisation, SignalR hub, and asset storage. This frontend is the only client.

---

## 2. Repository Layout (where everything lives)

```
KanbAI-Web/                      ← git root
├── CLAUDE.md                    ← Project instructions for Claude Code
├── MIGRATION_GUIDE.md           ← Notes on moving .junie/ agents → .claude/ agents
├── README.md                    ← Short "KanbAI web part" stub
├── docs/
│   └── handoffs/                ← ~80 markdown handoff files (one per GitHub issue)
│       ├── issue_{N}_context.md       (Product Manager phase — WHAT/WHY)
│       ├── issue_{N}_tech_spec.md     (Staff Engineer phase — HOW)
│       └── issue_{N}_design_spec.md   (Web Designer phase — LOOK)
└── KanbAI-Web/                  ← Nested Angular workspace (the actual app)
    ├── angular.json
    ├── package.json
    ├── tailwind.config.js
    ├── tsconfig*.json
    ├── docs/
    │   ├── patterns/
    │   │   └── state-management.md    ← Signals-based state pattern doc
    │   └── handoffs/            ← A few additional handoffs (older issues)
    └── src/
        ├── environments/
        │   ├── environment.ts               (production)
        │   └── environment.development.ts   (local dev, localhost:5257)
        └── app/
            ├── app.config.ts            ← providers (Router, HttpClient + authInterceptor)
            ├── app.routes.ts            ← lazy-loaded routes, guarded
            ├── core/                    ← cross-feature infra (auth, signalr, layout)
            └── features/                ← vertical slices (auth, projects, board, attachments, landing)
```

**Notable quirk:** The actual Angular project is in `KanbAI-Web/KanbAI-Web/` (one nesting level deep). The outer `KanbAI-Web/` is the git root; the inner `KanbAI-Web/` is the `ng`-workspace.

---

## 3. Technology Stack

### 3.1 Runtime / framework

| Tech | Version | Why |
|---|---|---|
| **Angular** | 21.2.0 | Latest at project start. Unlocks **Signals** (stable), **standalone components**, **`input.required()`**, new control flow (`@if` / `@for` / `@else`). |
| **TypeScript** | ~5.9.2 | Matches Angular 21's bundled compiler. |
| **RxJS** | ~7.8.0 | For async HTTP flows, interoping with signals via `toSignal()` / `takeUntilDestroyed()`. Not used as primary state — signals are. |
| **@angular/cdk** | ^21.2.7 | Drag-and-drop primitives (`cdkDropListGroup`, `CdkDrag`) used on the Kanban board (issue #8 installed it, issue #47 wired it up). |
| **@microsoft/signalr** | ^8.0.17 | Real-time transport. Single persistent hub connection to `/hubs/kanban`, JWT-authenticated. |
| **Tailwind CSS** | ^3.4.19 | Utility-first styling. Chosen (issue #6) for rapid iteration and consistency. |
| **PostCSS + Autoprefixer** | latest | Tailwind's build pipeline. |

### 3.2 Tooling

| Tool | Purpose |
|---|---|
| **Angular CLI** 21.2.5 | `ng serve`, `ng build`, `ng test`. |
| **Vitest** ^4.0.8 | Unit test runner. Project explicitly uses Vitest (not Karma/Jasmine) — `ng test` is wired to it. |
| **jsdom** | DOM environment for Vitest component tests. |
| **@vitest/coverage-v8** | Coverage reporting. |
| **Prettier** | Formatting. |

### 3.3 Rationale for the stack (cross-referenced from context docs)

- **Signals over BehaviorSubject**: [`docs/patterns/state-management.md`](../KanbAI-Web/docs/patterns/state-management.md) documents the migration rationale. Signals give synchronous reads, work seamlessly with `OnPush`, and do not require manual subscription cleanup.
- **Standalone components only**: No NgModules anywhere in the app. Every component declares its own imports (see e.g. [`BoardPageComponent`](../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts#L65-L78)).
- **Lazy-loaded routes**: Every route uses `loadComponent` (see [`app.routes.ts`](../KanbAI-Web/src/app/app.routes.ts)) to keep the initial bundle small.
- **SignalR chosen over raw WebSocket**: The backend is ASP.NET Core; SignalR ships built-in, handles reconnection and grouping, and integrates cleanly with the existing JWT auth (Bearer token via `accessTokenFactory`).
- **Tailwind over SCSS-heavy design system**: Chosen for speed; component-local `.scss` files are used where utilities are insufficient (e.g. drag-and-drop visual state).

---

## 4. High-Level Architecture

### 4.1 Layering

```
┌───────────────────────────────────────────────────────────────────┐
│ Angular SPA                                                       │
│                                                                   │
│  Presentational components (task-card, project-card, ...)         │
│                 ▲                                                 │
│                 │ inputs / outputs                                │
│  Smart/container components (board-page, dashboard-page, ...)     │
│                 ▲                                                 │
│                 │ inject()                                        │
│  State services (BoardStateService, ProjectStateService, ...)     │
│   - Signals for reads                                             │
│   - SignalR event reconciler                                      │
│   - extends BaseStateService<TState>                              │
│                 ▲                                                 │
│                 │ calls                                           │
│  API services (ProjectsApiService, TasksApiService, ...)          │
│   - Thin HttpClient wrappers                                      │
│   - map<ApiResponse<T>> → T, domain-specific error mapping        │
└───────────────────────────────────────────────────────────────────┘
                  │                              │
                  │ HTTP (JWT via interceptor)   │ WebSocket (SignalR)
                  ▼                              ▼
            ASP.NET Core backend — owns data, auth, authorization.
```

### 4.2 Cross-cutting infrastructure (`src/app/core/`)

| Folder / file | Role |
|---|---|
| `core/services/AuthService.ts` | Login / register / logout. Writes JWT to `localStorage.jwt_token`, hydrates `AuthStateService`. |
| `core/services/auth-state.service.ts` | Tiny signal-only store: `{ token, userId }` + `isAuthenticated` computed. Consumed by guards, the interceptor, and the SignalR service. |
| `core/services/signalr.service.ts` | Single shared `HubConnection`. Auto-connects when authenticated, disconnects on logout. `joinProjectGroup()` / `leaveProjectGroup()` for board-scope events. Exposes `on<T>(eventName)` → `Observable<T>`. |
| `core/interceptors/auth.interceptor.ts` | Attaches `Authorization: Bearer <token>` to any URL under `environment.apiUrl`. Forces logout + redirect to `/login` on any `401` (issue #86 hardened this). |
| `core/guards/auth.guard.ts` / `unauth.guard.ts` | Signals-based route guards. `authGuard` redirects anonymous → `/login?returnUrl=...`; `unauthGuard` redirects authenticated → `AUTH_HOME_ROUTE`. |
| `core/guards/return-url.util.ts` | Sanitises and validates `returnUrl` query param (rejects external URLs, issue #27). |
| `core/constants/auth-routes.ts` | `AUTH_HOME_ROUTE = '/dashboard'` (switched from `/board` when #30 shipped). |
| `core/state/base-state.service.ts` | Abstract base for every state service. Provides `getState()`, `setState(partial)`, `select(fn)` → `Signal<T>`. Ensures immutable updates. |
| `core/layout/navbar/` | The only globally-visible UI chrome. Reactive to `AuthService.currentUser`; shows Login/Register when anonymous, name + Logout when signed in (issues #28, #56). |
| `core/models/auth.models.ts` | DTOs mirroring the backend auth contract. |
| `core/models/realtime-events.ts` | **Typed names + payload interfaces for every SignalR event**. Single source of truth for the backend/frontend event contract: `ProjectUpdated`, `ProjectDeleted`, `MemberAdded`, `MemberRemoved`, `ColumnCreated`, `ColumnDeleted`, `TaskCreated`, `TaskMoved`, `TaskUpdated`. |
| `core/models/environment.interface.ts` | `Environment` interface: `{ production, apiUrl, hubUrl }`. |

### 4.3 Routing

All routes lazy-loaded via `loadComponent`. See [`app.routes.ts`](../KanbAI-Web/src/app/app.routes.ts):

| Path | Guard | Renders |
|---|---|---|
| `/` | `unauthGuard` | Public **Landing page** (redirect to `AUTH_HOME_ROUTE` if authenticated). |
| `/login` | `unauthGuard` | Login form. |
| `/register` | `unauthGuard` | Registration form. |
| `/dashboard` | `authGuard` | Project dashboard (grid of project cards). |
| `/board/:projectId` | `authGuard` | Kanban board for a specific project. |
| `**` | — | Redirects to `/` (anonymous stays on landing; authenticated falls through `unauthGuard` → `AUTH_HOME_ROUTE`). |

### 4.4 State-management pattern

Documented in full in [`docs/patterns/state-management.md`](../KanbAI-Web/docs/patterns/state-management.md).

- Every feature owns one or more **state services** extending `BaseStateService<State>`.
- Internal state is held in a single `signal<State>()`; external callers only read **computed selectors** returned by `select()`.
- Updates are **immutable** (`setState({ foo: [...oldFoo, newItem] })`).
- State services subscribe to SignalR events in their constructor and **reconcile** incoming events into state (dedupe-by-id, reorder, silent-no-op on unknown ids). See `BoardStateService.onTaskCreated` / `onTaskMoved` / `onTaskUpdated`.
- Logout clears all state (prevents user-A data leaking into user-B's session).

### 4.5 Real-time pipeline (the SignalR loop)

```
 User action (e.g. drag a task)
       │
       ▼
 Optimistic local mutation (state service)    ← card appears in new column INSTANTLY
       │
       ▼
 HTTP call (API service)                      ← e.g. PUT /api/task/{id}/move
       │
       ▼ (success)                            ▼ (error)
 Server broadcasts TaskMoved over SignalR     Rollback snapshot (OptimisticMoveToken)
       │                                      inline error strip auto-dismisses 5s later
       ▼
 Every connected client (incl. originator) receives TaskMoved
       │
       ▼
 State service reconciles: dedupe-by-id; replace in bucket; re-sort
       │
       ▼
 UI re-renders (OnPush + signal = no manual change-detection)
```

Key invariants:
- **Idempotent reconciliation**: receiving the same event twice is a no-op.
- **Dedupe-by-id**: optimistic insert and SignalR echo both fire `applyCreatedTask` / `onTaskCreated`; whichever lands second is a silent no-op.
- **Project group isolation**: the client calls `JoinProjectGroup(projectId)` on board entry and `LeaveProjectGroup` on exit; it only receives events for boards it currently views.

---

## 5. Features (vertical slices under `src/app/features/`)

### 5.1 `landing/` — Public landing page

**Purpose:** First impression for anonymous visitors. Hero section + feature grid (4 cards: Project Dashboard, Team Members, Secure Sign-in, and "AI Assistance — Coming Soon"). Login / Register CTAs route to `/login` and `/register`.

- **Delivered by:** #29 (page), #58 (content cleanup to remove AI hallucinations), #56 (header buttons, logo-as-home-link).
- **Structure:**
  - `landing-page/` — page component.
  - `components/hero-section/`, `components/features-section/`, `components/feature-card/`.
  - `models/feature-highlight.interface.ts`.

### 5.2 `auth/` — Login & Registration

**Purpose:** Sign in and sign up with email + password. Stores the returned JWT in `localStorage` and hydrates the auth state.

- **Delivered by:** #23 (AuthService), #24 (Login UI), #25 (Register UI), #55 (restore broken login UI).
- **Structure:**
  - `login-page/`, `register-page/`.
  - `components/form-card/`, `components/form-input/`, `components/form-button/` — reusable form UI primitives. (`form-button` is the same chassis later involved in the #76 / #80 / #84 / #89 submit-button-stuck bug family.)
  - `validator/password-match.validator.ts` — custom Angular validator for the register form.

### 5.3 `projects/` — Dashboard, Create-project, Members

**Purpose:** Everything a user does *with* projects (list, create, invite members) outside the board itself.

- **Delivered by:** #30 (dashboard), #31 (`ProjectStateService`), #32 (create-project dialog), #33 (members dialog), #57 (empty state + remove the old unused sidebar), #70 (compound create-with-columns), #76/#80 (create-button stuck bugs), #89 (add-member button stuck bug).
- **Structure:**
  - `dashboard-page/` — grid, loading skeleton, empty state, error state.
  - `components/`:
    - `dashboard-header/`, `dashboard-empty-state/`, `dashboard-error-state/`, `dashboard-skeleton/` — state surfaces.
    - `project-grid/`, `project-card/` — the grid of projects.
    - `create-project-dialog/` — modal with Title + Description + a **`column-draft-list`** child (issue #70's "dynamic column setup" — pre-filled editable rows that submit one project + N columns atomically).
    - `column-draft-list/` — reactive `FormArray`-driven editable list.
    - `members-dialog/` — list members, add by email, remove, with role-gated actions.
    - `partial-failure-toast/` — the "project created but some columns failed" recovery surface.
  - `models/`:
    - `project.model.ts` — `ProjectSummary`, `ApiResponse<T>` (the backend envelope contract).
    - `member.model.ts` — `MemberSummary`, envelope aliases.
    - `dashboard-view-model.ts` — discriminated-union view-model for loading/success/empty/error rendering.
  - `services/`:
    - `projects-api.service.ts` — `listProjects`, `createProject`, etc. All requests return `ApiResponse<T>` and the service unwraps to `T` + maps errors.
    - `members-api.service.ts`.
    - `project-creation.service.ts` — orchestrator for the "create project + create N columns" compound operation, with partial-failure tracking.
  - `state/`:
    - `project-state.service.ts` + `project-state.model.ts` — single source of truth for the user's project list.
    - `members-state.service.ts` + `members-state.model.ts`.
  - `validators/`:
    - `column-array.validators.ts` — `minColumnsValidator`, `duplicateColumnNamesValidator`.
    - `whitespace.validator.ts`.

### 5.4 `board/` — Kanban board (the product's core)

**Purpose:** The interactive Kanban surface. Columns, tasks, drag-and-drop, task detail drawer, real-time updates.

- **Delivered by:** #47 (drag-and-drop, project-scoped SignalR), #66 (clicking a project card routes to its board), #77 (add-column button + empty-board state), #78 (per-column "New task" inline form), #87 (hydrate tasks on board entry — fixes "empty board after refresh"), #83 (render task description in detail drawer), #91 (edit/clear task description), #94 (render freshest description without close-and-reopen).
- **Structure:**
  - `board-page/` — smart container. Owns `enterBoard(projectId)` / `leaveBoard()` lifecycle, initial column + task fetch, optimistic drop orchestration.
  - `components/`:
    - `board-column/` — a column shell (header, color accent, task list, drop zone).
    - `task-card/` — a draggable card.
    - `board-add-column/` — trailing "+ Add column" affordance (#77).
    - `board-add-task/` — per-column inline "+ Add task" form (#78).
    - `task-detail-panel/` — right-hand drawer opened when a card is clicked.
    - `task-description-section/` — the editable description inside the drawer (#83, #91, #94).
    - `task-description-clear-confirm-dialog/` — confirm dialog for "Clear description" (#91).
    - `task-not-found-toast/` — flashes when a realtime delete removes the task you're viewing.
  - `models/`:
    - `task.model.ts` — `TaskResponseDto`, `MoveTaskDto`, `CreateTaskDto`, `UpdateTaskDescriptionDto`, envelope aliases.
    - `column.model.ts` — `ColumnResponseDto`, `CreateColumnDto`, envelope aliases.
  - `services/`:
    - `columns-api.service.ts` — list, create columns; error mapper `mapColumnErrorToUserMessage`.
    - `tasks-api.service.ts` — list tasks for a board, move task, create task, update task description, delete task description; **per-operation error mappers** (`mapTaskMoveErrorToUserMessage`, `mapTaskCreateErrorToUserMessage`, `mapTaskListErrorToUserMessage`, `mapTaskDescriptionUpdateErrorToUserMessage`).
  - `state/`:
    - `board-state.service.ts` — the board's brain. Holds `{ currentProjectId, columns, tasksByColumnId }`. Subscribes to `ColumnCreated`, `ColumnDeleted`, `TaskCreated`, `TaskMoved`, `TaskUpdated`. Drives `JoinProjectGroup` / `LeaveProjectGroup` from an `effect()` over `connectionState`. Exposes the optimistic-move primitives: `applyOptimisticTaskMove(...)` → `OptimisticMoveToken`, `rollbackOptimisticTaskMove(token)`.
    - `board-state.model.ts` — `BoardState`, `BoardColumn`, `BoardTask`, `INITIAL_BOARD_STATE`, `OptimisticMoveToken`.
  - `validators/duplicate-existing-column-name.validator.ts` — client-side validator used by `board-add-column`.

### 5.5 `attachments/` — File upload / download

**Purpose:** Drag a file onto a task, watch it upload with progress, see it listed on the task card, and let teammates download it.

- **Delivered by:** #49 (dropzone + client-side validation), #50 (HTTP upload with progress tracking), #51 (attachment list + download).
- **Structure:**
  - `components/`:
    - `file-dropzone/` — drag-and-drop + click-to-browse. Emits a validated `DropzoneFileSelectedEvent`.
    - `upload-progress-row/` — the per-upload progress UI while bytes are travelling.
    - `attachment-list/` + `attachment-row/` — completed attachments on the task.
  - `models/`:
    - `attachment.model.ts` — `AssetResponseDto`, `ProcessingStatus` enum, SignalR asset event DTOs (`AssetStatusEventDto`, `AssetFailedEventDto`).
    - `attachment-upload.model.ts`, `attachment-download.model.ts`, `attachment-list-fetch.model.ts`, `dropzone.model.ts`.
  - `services/attachments-api.service.ts` — `multipart/form-data` `POST`, `GET /api/attachment/{assetId}` blob download, list per task.
  - `state/attachments-state.service.ts` + `attachments-state.model.ts` — per-task buckets: `uploadsByTaskId` (in-flight, originated here), `completedByTaskId` (finalised — from the local upload OR from a teammate's `AssetCompleted` event), `completedFetchByTaskId` (panel-open list-fetch lifecycle: loading/ready/error).
  - `constants/` — icon map, validation rules (size cap, MIME whitelist), error-code mappers.
  - `utils/` — `format-file-size.ts`, `trigger-blob-download.ts`, `validate-attachment.ts`.

---

## 6. Actors and Use Cases

### 6.1 Actors

| Actor | Description |
|---|---|
| **Anonymous visitor** | Any browser hitting `/`, `/login`, or `/register`. No token. |
| **Authenticated user** | Logged-in user with a valid JWT in `localStorage`. Always has `id`, `name`, `email`. |
| **Project owner** | Authenticated user whose `role === 'Owner'` on a given project. Can invite/remove members; can delete the project (backend contract). |
| **Project member** | Authenticated user whose `role === 'Member'`. Can view the project and the board, edit tasks, upload attachments. Cannot manage membership. |
| **Teammate** | Any other user currently connected to the same project's SignalR group. Sees your changes live. |
| **Backend (KanbAI-Core)** | ASP.NET Core service at `http://localhost:5257/api` (dev) / `https://api.kanbai.com` (prod). Issues JWTs, hosts `/hubs/kanban`, owns all data. |
| **Developer** | Runs `ng serve`, consumes specs in `docs/handoffs/`, follows `CLAUDE.md`. |

### 6.2 Primary use cases (happy paths)

1. **First-time visitor → sign up → first project → first task**
   - Visit `/`, read the landing page, click **Sign up**.
   - Submit `/register` form → backend returns JWT → SPA stores token, hydrates `AuthStateService`, SignalR auto-connects, router navigates to `/dashboard`.
   - Dashboard shows empty state with "Create your first project" CTA.
   - Click CTA → create-project dialog opens with title field and pre-filled starter columns (`To Do`, `In Progress`, `Done`).
   - Submit → project is created (one POST) + columns are created (N POSTs in order); state service optimistically prepends.
   - Click the new project card → router goes to `/board/:projectId`.
   - `BoardPageComponent.enterBoard` sets `currentProjectId`, calls `JoinProjectGroup`, fetches columns & tasks.
   - Click **+ Add task** on a column → inline input opens → type title → Enter → task appears instantly → backend confirms → `TaskCreated` echo is deduped.

2. **Daily use — two teammates on the same board**
   - User A drags a card from *In Progress* to *Done*. Their UI updates instantly (optimistic). HTTP `PUT /api/task/{id}/move` fires. On 200, the backend broadcasts `TaskMoved` to project group. User A receives the echo → dedupe. User B (in the same group) receives the echo → their board updates with no flicker.
   - User A uploads `spec.pdf` to a task. A progress bar shows live percentage. On `AssetCompleted`, User B's task card on the same board gains an attachment indicator without refresh.
   - User A edits the task description. On save, same-tick apply (#94) re-renders read mode with the new text. The `TaskUpdated` event fans out to User B.

3. **Owner invites a collaborator**
   - Open project members dialog from the dashboard.
   - Type teammate's email → **Add** (button is only enabled once email is syntactically valid).
   - On success, the member row appears. The backend broadcasts `MemberAdded`.
   - Teammate at login time now sees the project on their dashboard.

### 6.3 Edge / failure paths explicitly handled

- **JWT rejected mid-session** (token rotation, expiry, malformed claim): the `authInterceptor` catches any `401`, clears the token, forces logout, redirects to `/login?returnUrl=<current>` — closing the "zombie session" gap (#86).
- **Drag-and-drop fails on the server**: `BoardStateService.rollbackOptimisticTaskMove(token)` reverts the buckets from the snapshot; an inline error strip shows for 5 s.
- **Project create / column create partial failure** (#70): `ProjectCreationService` tracks which columns succeeded; `partial-failure-toast` surfaces a recovery message listing which columns the user needs to re-add.
- **Empty board on entry** (#77): if a project has zero columns, the board renders a descriptive empty state with a primary "Add column" CTA instead of a blank flex container.
- **Refresh on a board** (#87): `enterBoard` fetches both columns *and* tasks (`GET /api/task/column/{columnId}` per column), closing the "tasks disappear on F5" bug.
- **Invalid or external `returnUrl`**: `return-url.util.ts` sanitises; external URLs fall back to `AUTH_HOME_ROUTE`.
- **SignalR disconnect**: `withAutomaticReconnect([0, 2000, 10000, 30000])` + state-machine (`disconnected`/`connecting`/`connected`/`reconnecting`); on reconnect, state services re-subscribe and (for the board) re-join the project group.
- **File too big or wrong MIME type**: `validate-attachment.ts` rejects client-side before a byte is sent, mapped to a user-readable message.

---

## 7. Data Contracts (at a glance)

All backend responses use the envelope

```ts
interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  errors: string[];
  data: T | null;
}
```

…except the auth endpoints, which return their DTO raw.

Key DTOs (TypeScript mirrors of backend contracts — documented in `.claude/backend_api_map.md`):

- `UserProfileDto { id, name, email }`
- `AuthResponseDto { token, user: UserProfileDto }`
- `ProjectSummary { id, name, description, role, createdAt, updatedAt }`
- `MemberSummary { userId, name, email, role, joinedAt }`
- `ColumnResponseDto { id, name, colorCode, columnOrder, projectId, createdAt, updatedAt }`
- `TaskResponseDto { id, title, content, taskOrder, columnId, assignedId, createdAt, updatedAt }`
- `AssetResponseDto { id, fileName, mimeType, fileSize, processingStatus, kanbanTaskId, createdAt, updatedAt, storageKey, thumbnailKey }`

Realtime event names (one file: [`core/models/realtime-events.ts`](../KanbAI-Web/src/app/core/models/realtime-events.ts)):
`ProjectUpdated`, `ProjectDeleted`, `MemberAdded`, `MemberRemoved`, `ColumnCreated`, `ColumnDeleted`, `TaskCreated`, `TaskMoved`, `TaskUpdated`, plus asset lifecycle events.

Documented caveats (also in the same file): some events (`MemberAdded`, `TaskCreated`, `TaskUpdated`) broadcast the raw DTO with **no `projectId` on the wire** — attribution is done via client-side "current context" (e.g. `BoardStateService.currentProjectId`) plus the fact that the SignalR group you joined guarantees you only receive events you subscribed to.

---

## 8. Security Posture

- **Transport auth:** Bearer JWT attached by `authInterceptor` to any URL under `environment.apiUrl`. Never attached to unrelated URLs.
- **SignalR auth:** JWT passed via `accessTokenFactory` on the `HubConnectionBuilder`; backend validates on connect *and* on every hub method.
- **401 handling:** Hardcoded to **force logout + redirect**, no exceptions (#86). Eliminates zombie sessions.
- **403 handling:** Per-feature error mappers produce user-readable copy ("Only the project owner can add members.", etc.).
- **Route guards:** Every authenticated route has `authGuard`; every anonymous-only route has `unauthGuard`. A route-configuration test asserts coverage so a future route can't be added unguarded (#27).
- **Return-URL sanitisation:** External URLs in `?returnUrl=` are rejected (#27 AC).
- **Input validation:** Reactive Forms + custom validators (`whitespaceValidator`, `passwordMatchValidator`, `duplicateColumnNamesValidator`, `minColumnsValidator`, etc.).
- **No `[innerHTML]`** anywhere with user content; no direct `ElementRef.nativeElement` DOM manipulation for state.
- **No PII in logs:** `console.error` sites are bare strings (`"SignalR start failed"`), never include tokens or payload fields (see `invokeGroupMethod` in [`signalr.service.ts`](../KanbAI-Web/src/app/core/services/signalr.service.ts#L191-L209)).
- **`localStorage` token:** Acknowledged trade-off. XSS could read it; `httpOnly` cookies are the "correct" fix and are flagged in `state-management.md` best practices.

---

## 9. Testing & Build

- **Unit tests:** Co-located `*.spec.ts` next to every file. Runner is **Vitest** (not Karma). `ng test` invokes it.
- **Pre-existing vs introduced failures:** `CLAUDE.md` mandates classifying every failing test as PRE-EXISTING (unrelated area) or INTRODUCED (touched area). Developer agents must fix introduced failures before marking work complete.
- **Build:** `ng build` (production default) and `ng build --configuration development`.
- **Coverage:** `@vitest/coverage-v8`.
- **No E2E harness checked in.** `README.md` notes "Angular CLI does not come with an end-to-end testing framework by default."

---

## 10. Development Workflow (how features get built)

The project follows a strict **4-phase handoff workflow** codified in [`CLAUDE.md`](../CLAUDE.md) and implemented as Claude Code sub-agents under `.claude/agents/`. Each phase produces a versioned markdown document under `docs/handoffs/`:

| Phase | Agent | Output | Constraint |
|---|---|---|---|
| 1. Product Management | `product-manager` | `issue_{N}_context.md` — WHAT & WHY, acceptance criteria, edge cases. | **Must not** design architecture or write code. |
| 2. Technical Architecture | `staff-engineer` | `issue_{N}_tech_spec.md` — component hierarchy, state design, TypeScript interfaces, migration steps. | **Must not** write concrete implementation code. |
| 3. UI/UX Design | `web-designer` | `issue_{N}_design_spec.md` — design tokens, exact SCSS, responsive rules, WCAG-AA compliance. | **Must not** write component logic. |
| 4. Implementation | `developer` | Angular source code + status-updated tech spec. | **Must not** invent features beyond specs. |

Supporting agents: `codebase-scanner` (read-only architecture mapping), `build-verifier` (runs `ng build` / `ng test` and classifies failures), `backend-api-bridge` (scouts ASP.NET controllers and produces `backend_api_map.md` with TypeScript-compatible interfaces).

The repo has evolved from an older `.ai/.junie/` agent system (Cursor/JetBrains) — see [`MIGRATION_GUIDE.md`](../MIGRATION_GUIDE.md). Both systems are compatible with the same handoff format.

---

## 11. Feature / Issue History (milestones)

Reading `docs/handoffs/` front-to-back reconstructs the product's roadmap:

### Milestone 2 — Angular Frontend Foundations
- **#6** Tailwind CSS + PostCSS.
- **#7** Global `HttpClient` + `authInterceptor` skeleton.
- **#8** Install `@angular/cdk` (for later drag-and-drop).
- **#9** Environment configuration (`environment.ts` / `environment.development.ts`).
- **#10** Application shell (navbar + placeholder sidebar + `<router-outlet>`) and the first routes.
- **#11** **State-management pattern** (`BaseStateService` + docs).

### Milestone 3 — JWT Authentication UI
- **#23** `AuthService` with signals.
- **#24** Login form.
- **#25** Register form.
- **#26** JWT HTTP interceptor (token attach + baseline 401 handling).
- **#27** Route guards (`authGuard` + `unauthGuard`) with `returnUrl` preservation.
- **#28** Navbar becomes auth-aware (shows user + Logout).
- **#29** Public landing page.

### Milestone 4 — Landing Page & Project Dashboard UI
- **#30** Project dashboard (grid, loading, empty, error).
- **#31** `ProjectStateService` (central project list).
- **#32** New-project dialog.
- **#33** Project members management UI.

### Milestone 5 — Real-time UI Updates & Kanban Interaction
- **#45** SignalR client service.
- **#46** Integrate realtime events with state services (`BoardStateService` reconcilers).
- **#47** Visual drag-and-drop with optimistic UI + rollback.
- **#66** Clicking a project card routes to its board (bug — primary path was broken).
- **#70** Dynamic column setup on project creation (compound create: project + N columns, starter set `To Do / In Progress / Done`, partial-failure UX).
- **#77** Add-column button + empty-board empty state.
- **#78** Per-column "Add task" inline form.

### Milestone 6 — Asynchronous File Upload UI
- **#49** Drag-and-drop file dropzone with client-side validation.
- **#50** Async file upload with progress tracking (multipart, `reportProgress: true`).
- **#51** Attachment list + download button on the task detail drawer.

### Unnumbered / bug-fix stream
- **#55** Restore login UI (regression).
- **#56** Header nav, auth buttons, logo routing.
- **#57** Dashboard empty-state + remove the unused sidebar (reclaims ~240 px).
- **#58** Clean up landing-page AI hallucinations.
- **#59** Fix dev `environment.apiUrl` so local dev doesn't hit `https://api.kanbai.com`.
- **#68** Fix unexpected logout when inviting a member (interceptor misread 401).
- **#76** NG0950 in `ColumnDraftListComponent` + "Create project" stuck.
- **#80** Parent form-control + `[disabled]` re-evaluation on `app-form-button` (create-project).
- **#83** Surface `content` (task description) in the detail drawer.
- **#86** Force logout + redirect on **any** 401 — fix zombie session.
- **#87** Hydrate tasks on board entry — fix "tasks disappear on refresh".
- **#89** Same defect class as #80 on the members-dialog add button.
- **#91** Editable task description with save, cancel, clear.
- **#94** Same-tick apply so the originating client sees its own save without close-and-reopen.

---

## 12. Conventions worth knowing before touching the code

- **Standalone components only.** Don't add NgModules.
- **`inject()` over constructor injection.** Constructor stays reserved for `super()` + setup effects.
- **`ChangeDetectionStrategy.OnPush` on every new component** where possible.
- **Every state service extends `BaseStateService<TState>`.**
- **Every HTTP API service unwraps `ApiResponse<T>` to `T` and attaches a domain-specific error mapper** (`mapXxxErrorToUserMessage`).
- **`takeUntilDestroyed()` on every subscription** that would otherwise outlive its component/service.
- **No direct mutation** — always `[...xs, x]`, `{ ...s, f: v }`, never `xs.push(x)`.
- **Tests are introduced or pre-existing** — never silently skipped; failures must be classified.
- **Handoff discipline:** Before writing code for a new issue, check `docs/handoffs/issue_{N}_context.md` and `issue_{N}_tech_spec.md`; if either is missing or ambiguous, stop and create / clarify rather than guess.

---

## 13. Open Gaps / Known Non-Goals

From the landing page and the commit history:
- **AI features:** Not implemented. Marked "Coming soon" on the landing page.
- **Task-level edit beyond description:** No due date, assignee UI, labels, priority, or comments. The pattern established by #91 / #94 is the chassis future fields will plug into.
- **Column rename / delete / reorder from the UI:** Not shipped. Backend may or may not expose the endpoints; `docs/handoffs` has no ticket for it yet.
- **Project rename / delete from the UI:** Not shipped.
- **E2E test harness:** Not configured.
- **`localStorage` JWT:** Intentional for the current milestone; moving to `httpOnly` cookie is a future hardening item.
- **`MemberAdded` / `TaskCreated` events without `projectId`:** Attribution is done client-side; a future backend ticket is filed to add `projectId` to the wire payload (see caveats in [`realtime-events.ts`](../KanbAI-Web/src/app/core/models/realtime-events.ts)).

---

## 14. TL;DR

KanbAI-Web is a **modern Angular 21 + Signals + SignalR** single-page frontend for a collaborative Kanban product. It's organised as a thin `core/` (auth, signalr, guards, interceptor, base state) plus five **vertical features** (`landing`, `auth`, `projects`, `board`, `attachments`). Every feature owns its own API service, state service, model, and presentational + smart components. The state pattern is uniform: `BaseStateService<T>` + immutable `setState` + signal selectors + SignalR-event reconcilers. The UX pattern is uniform: **optimistic mutation → HTTP → server echo or rollback**. Development is disciplined through a 4-phase PM → architect → designer → developer handoff workflow recorded in `docs/handoffs/`, with one markdown doc per GitHub issue. The product is demo-ready for the Kanban core loop today and has AI assistance reserved for a later milestone.
