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
