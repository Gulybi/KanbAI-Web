import { ApiResponse } from '../../projects/models/project.model';

/**
 * Task shape returned by `PUT /api/task/{taskId}/move` and
 * `POST /api/task/column/{columnId}`. Mirrors the backend
 * TaskResponseDto. Confirmed against .claude/backend_api_map.md.
 */
export interface TaskResponseDto {
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
 * Request body for `PUT /api/task/{taskId}/move`. Backend enforces
 * taskOrder ≥ 0 and rejects cross-project moves with 400.
 */
export interface MoveTaskDto {
  columnId: string;
  taskOrder: number;
}

/** Envelope alias for the move endpoint. */
export type TaskMoveResponse = ApiResponse<TaskResponseDto>;

/**
 * Request body for `POST /api/task/column/{columnId}`. Mirrors the
 * backend `CreateTaskDto` shape at .claude/backend_api_map.md:270-276.
 *
 * Issue #78 only populates `title`; `content` and `assignedId` are
 * optional on the backend and explicitly out of scope — the client omits
 * them on create. `taskOrder` is NOT part of the DTO: the backend
 * assigns it server-side.
 */
export interface CreateTaskDto {
  title: string;
  content?: string | null;
  assignedId?: string | null;
}

/** Envelope alias for the single-DTO task-create response. */
export type TaskCreateResponse = ApiResponse<TaskResponseDto>;
