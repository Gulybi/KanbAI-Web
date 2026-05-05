import { ApiResponse } from '../../projects/models/project.model';

/**
 * Column shape returned by `GET /api/column/project/{projectId}` and
 * `POST /api/column/project/{projectId}`. Mirrors the backend
 * ColumnResponseDto (camelCase). Confirmed against .claude/backend_api_map.md.
 *
 * NOTE: `BoardColumn` (board-state.model.ts) is the local projection used
 * by the UI — it drops `createdAt`/`updatedAt`. A mapping helper lives
 * in the service; it is the only place those two fields are discarded.
 */
export interface ColumnResponseDto {
  id: string;
  name: string;
  colorCode: string | null;
  columnOrder: number;
  projectId: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/** Envelope alias for list endpoint. */
export type ColumnsListResponse = ApiResponse<ColumnResponseDto[]>;
