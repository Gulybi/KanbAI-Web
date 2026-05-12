/**
 * Typed DTOs for server-sent SignalR events broadcast by KanbAI-Core on the
 * `/hubs/kanban` hub. Payloads mirror the backend event DTOs (camelCase JSON,
 * nullable fields preserved, ISO-8601 timestamps as `string`).
 *
 * See `.claude/backend_api_map.md` §"Server-sent events" for the authoritative
 * name/payload list.
 */

/**
 * String-literal constants for every server-sent event name. Used by
 * subscribers (`SignalRService.on<T>(REALTIME_EVENT.ProjectUpdated)`) as a
 * single source of truth so a typo cannot drift between the publisher side
 * (backend DTO name) and the subscriber side.
 */
export const REALTIME_EVENT = {
  ProjectUpdated: 'ProjectUpdated',
  ProjectDeleted: 'ProjectDeleted',
  MemberAdded: 'MemberAdded',
  MemberRemoved: 'MemberRemoved',
  ColumnCreated: 'ColumnCreated',
  ColumnDeleted: 'ColumnDeleted',
  TaskCreated: 'TaskCreated',
  TaskMoved: 'TaskMoved',
  TaskUpdated: 'TaskUpdated',
  TaskDeleted: 'TaskDeleted'
} as const;

export type RealtimeEventName = typeof REALTIME_EVENT[keyof typeof REALTIME_EVENT];

/** Payload of `ProjectUpdated`, emitted by `PUT /api/project/{id}`. */
export interface ProjectUpdatedEvent {
  projectId: string;
  name: string;
  description: string | null;
  updatedAt: string; // ISO-8601
}

/** Payload of `ProjectDeleted`, emitted by `DELETE /api/project/{id}`. */
export interface ProjectDeletedEvent {
  projectId: string;
}

/**
 * Payload of `MemberAdded`, emitted by `POST /api/project/{projectId}/members`.
 *
 * ⚠ BACKEND CAVEAT: the server broadcasts the raw `MemberResponseDto` — there
 * is no `projectId` on the wire. Attribution is done via the "current dialog
 * context" held by `MembersStateService.currentProjectContext`. See
 * `issue_46_tech_spec.md` §"Known Backend Contract Caveats" for the
 * follow-up backend ticket.
 */
export interface MemberAddedEvent {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string; // ISO-8601
}

/**
 * Payload of `MemberRemoved`, emitted by
 * `DELETE /api/project/{projectId}/members/{userId}`. Carries `projectId`.
 */
export interface MemberRemovedEvent {
  userId: string;
  projectId: string;
}

/**
 * Payload of `ColumnCreated`, emitted by
 * `POST /api/column/project/{projectId}`. Carries `projectId` directly.
 */
export interface ColumnCreatedEvent {
  id: string;
  name: string;
  colorCode: string | null;
  columnOrder: number;
  projectId: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/**
 * Payload of `ColumnDeleted`, emitted by `DELETE /api/column/{id}`.
 * Carries `projectId` directly.
 */
export interface ColumnDeletedEvent {
  columnId: string;
  projectId: string;
}

/**
 * Payload of `TaskCreated`, emitted by `POST /api/task/column/{columnId}`.
 *
 * ⚠ BACKEND CAVEAT: the server broadcasts the raw `TaskResponseDto` — there
 * is no `projectId` on the wire. Attribution is done via
 * `BoardStateService.currentProjectId` plus the fact that the client only
 * receives events from project groups it has joined.
 */
export interface TaskCreatedEvent {
  id: string;
  title: string;
  content: string | null;
  taskOrder: number;
  columnId: string;
  assignedId: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/**
 * Payload of `TaskMoved`, emitted by `PUT /api/task/{taskId}/move`.
 * Includes the full post-move task DTO so the subscriber can rebuild
 * bucket state without a round-trip.
 */
export interface TaskMovedEvent {
  taskId: string;
  oldColumnId: string;
  newColumnId: string;
  oldTaskOrder: number;
  newTaskOrder: number;
  /** Full post-move `TaskResponseDto`. */
  task: TaskCreatedEvent;
}

/**
 * Payload of `TaskUpdated`, emitted by
 * `PUT /api/task/{taskId}/description` and
 * `DELETE /api/task/{taskId}/description` (per backend_api_map.md:165).
 *
 * Structurally identical to `TaskCreatedEvent` — the backend broadcasts
 * the same `TaskResponseDto` shape. Kept as a distinct interface so the
 * typed `on<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated)` subscription
 * reads cleanly and can diverge later (e.g. if the backend adds a
 * `previousContent` field).
 *
 * ⚠ BACKEND CAVEAT (same as TaskCreatedEvent): no `projectId` on the wire;
 * attribution via `BoardStateService.currentProjectId` + group membership.
 */
export interface TaskUpdatedEvent {
  id: string;
  title: string;
  content: string | null;
  taskOrder: number;
  columnId: string;
  assignedId: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/**
 * Payload of `TaskDeleted`, emitted by `DELETE /api/task/{taskId}` (issue #96).
 * Backend scopes the event to the joined project group — the wire payload is
 * `{ taskId, columnId }`; `projectId` is not included because attribution
 * happens server-side via group membership.
 *
 * CASCADE: this event is NOT emitted for tasks removed as a side-effect of
 * `DELETE /api/project/{id}` or `DELETE /api/column/{id}`. Clients must
 * remove child tasks locally from the parent `ProjectDeleted` /
 * `ColumnDeleted` event — see BoardStateService.onColumnDeleted cascade.
 */
export interface TaskDeletedEvent {
  taskId: string;
  columnId: string;
}
