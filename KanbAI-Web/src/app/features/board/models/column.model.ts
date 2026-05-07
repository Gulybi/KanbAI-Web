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

/**
 * Backend `CreateColumnDto` shape — mirrors
 * .claude/backend_api_map.md lines 252-256.
 *
 * `colorCode` is optional and explicitly omitted by issue #70 (no color
 * picker in scope per context line 171). `columnOrder` is passed by #70
 * as 0..N-1 to make ordering deterministic without depending on the
 * backend's ordering of successive creates.
 */
export interface CreateColumnDto {
  name: string;
  colorCode?: string | null;
  columnOrder?: number | null;
}

/** Envelope alias for the single-DTO create response. */
export type ColumnCreateResponse = ApiResponse<ColumnResponseDto>;
