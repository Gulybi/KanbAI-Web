import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  CreateTaskDto,
  MoveTaskDto,
  TaskCreateResponse,
  TaskDescriptionUpdateResponse,
  TaskListResponse,
  TaskMoveResponse,
  TaskResponseDto,
  UpdateTaskDescriptionDto
} from '../models/task.model';
import { TASK_DESCRIPTION_COPY } from '../components/task-description-section/task-description-copy';

/**
 * Only task operation supported in this ticket is a drag-triggered move.
 */
export type TaskMoveOperation = 'move';

@Injectable({ providedIn: 'root' })
export class TasksApiService {
  private readonly http = inject(HttpClient);

  /**
   * Backend root is singular `/api/task` — confirmed against
   * .claude/backend_api_map.md.
   */
  private readonly apiUrl = `${environment.apiUrl}/task`;

  /**
   * `PUT /api/task/{taskId}/move` with body `{ columnId, taskOrder }`.
   * Returns the full post-move `TaskResponseDto` so the caller can
   * reconcile local optimistic state against server truth.
   */
  moveTask(taskId: string, dto: MoveTaskDto): Observable<TaskResponseDto> {
    const url = `${this.apiUrl}/${encodeURIComponent(taskId)}/move`;
    return this.http.put<TaskMoveResponse>(url, dto).pipe(
      map(response => {
        if (!response.success || response.data == null) {
          throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed');
        }
        return response.data;
      })
    );
  }

  /**
   * `POST /api/task/column/{columnId}` — creates a task inside the target
   * column. Returns the created `TaskResponseDto`.
   *
   * Envelope unwrap mirrors `ColumnsApiService.createColumn` (issue #77):
   *  - `success: false` or `data == null` → observable error.
   *  - `success: true` with non-null data → unwrapped DTO.
   *
   * Service does NOT retry, does NOT translate errors — callers own
   * user-copy via {@link mapTaskCreateErrorToUserMessage}.
   */
  createTask(columnId: string, dto: CreateTaskDto): Observable<TaskResponseDto> {
    const url = `${this.apiUrl}/column/${encodeURIComponent(columnId)}`;
    return this.http.post<TaskCreateResponse>(url, dto).pipe(
      map(response => {
        if (!response.success || response.data == null) {
          throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed');
        }
        return response.data;
      })
    );
  }

  /**
   * `GET /api/task/project/{projectId}` — returns every task in the project,
   * sorted ascending by `taskOrder` within each `columnId` (backend
   * pre-sorted per the recommended shape). JWT attached automatically by
   * `authInterceptor`.
   *
   * Envelope unwrap mirrors `ColumnsApiService.getColumnsForProject`:
   *  - `success: false` → observable error.
   *  - `success: true` with `data == null` → observable error (defensive;
   *    the recommended backend shape returns `[]` for an empty project,
   *    not `null`, but we harden for contract drift).
   *  - `success: true` with array `data` → unwrapped `TaskResponseDto[]`.
   *
   * The service does NOT retry, does NOT swallow errors, does NOT translate
   * to user copy. Callers own user-copy via {@link mapTaskListErrorToUserMessage}.
   */
  getTasksForProject(projectId: string): Observable<TaskResponseDto[]> {
    const url = `${this.apiUrl}/project/${encodeURIComponent(projectId)}`;
    return this.http.get<TaskListResponse>(url).pipe(
      map(response => {
        if (!response.success || response.data == null) {
          throw new Error(
            response.errors?.[0] ?? response.message ?? 'Request failed'
          );
        }
        return response.data;
      })
    );
  }

  /**
   * `PUT /api/task/{taskId}/description` with body `{ content }` (issue #91).
   * Returns the full post-update `TaskResponseDto` so the caller could
   * reconcile if it wanted to — in this ticket the caller does NOT
   * reconcile locally (BoardStateService.onTaskUpdated already will via
   * the SignalR echo); it just uses `200` as the signal to flip back to
   * read mode. Envelope unwrap mirrors `moveTask` / `createTask`.
   */
  updateTaskDescription(
    taskId: string,
    dto: UpdateTaskDescriptionDto
  ): Observable<TaskResponseDto> {
    const url = `${this.apiUrl}/${encodeURIComponent(taskId)}/description`;
    return this.http.put<TaskDescriptionUpdateResponse>(url, dto).pipe(
      map(response => {
        if (!response.success || response.data == null) {
          throw new Error(
            response.errors?.[0] ?? response.message ?? 'Request failed'
          );
        }
        return response.data;
      })
    );
  }

  /**
   * `DELETE /api/task/{taskId}/description` (issue #91). Server returns
   * `204 No Content` on success; no envelope on the wire.
   */
  clearTaskDescription(taskId: string): Observable<void> {
    const url = `${this.apiUrl}/${encodeURIComponent(taskId)}/description`;
    return this.http.delete<void>(url);
  }
}

/**
 * Operation-appropriate user copy for a failed task move. Matches the
 * verbatim strings enumerated in the issue #47 tech spec §"Error mapping
 * (task move)" — any drift from these strings is a bug.
 */
export function mapTaskMoveErrorToUserMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. The move was undone.";
    }
    if (error.status === 401) {
      // Intercepted globally by authInterceptor — the UI rarely sees this,
      // but map defensively in case the interceptor is ever bypassed.
      return 'Your session has expired. Please sign in again.';
    }
    if (error.status === 403) {
      return 'You are no longer a member of this project and cannot move tasks.';
    }
    if (error.status === 404) {
      return 'That task or column no longer exists.';
    }
    if (error.status === 400) {
      return "We couldn't move that task. Please try again.";
    }
    if (error.status >= 500) {
      return 'Something went wrong on our end. The move was undone.';
    }
    return "We couldn't move that task. Please try again.";
  }

  return "We couldn't move that task. Please try again.";
}

/**
 * Operation-appropriate user copy for a failed task create (issue #78).
 * Verbatim strings frozen in issue_78_tech_spec.md §"HTTP Contracts Summary".
 * Never exposes status codes, URLs, stack traces, or envelope error arrays.
 */
export function mapTaskCreateErrorToUserMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }
    if (error.status === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (error.status === 403) {
      return 'You are no longer a member of this project and cannot add tasks.';
    }
    if (error.status === 404) {
      return "We couldn't add this task — the column no longer exists.";
    }
    if (error.status === 400) {
      return "We couldn't add this task. Please check the title and try again.";
    }
    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }
    return "We couldn't add this task. Please try again.";
  }

  return "We couldn't add this task. Please try again.";
}

/**
 * Operation-appropriate user copy for a failed task-list read (issue #87).
 * Verbatim strings frozen in issue_87_context.md §"Error copy".
 * Never exposes status codes, URLs, stack traces, or envelope error arrays.
 */
export function mapTaskListErrorToUserMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }
    if (error.status === 401) {
      // The global authInterceptor (#86/#88) owns redirect-to-login; this
      // string is defensive for the rare case the interceptor is bypassed.
      return 'Your session has expired. Please sign in again.';
    }
    if (error.status === 403) {
      return 'You are no longer a member of this project.';
    }
    if (error.status === 404) {
      return 'This project no longer exists.';
    }
    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }
    return "We couldn't load this board. Please try again.";
  }
  return "We couldn't load this board. Please try again.";
}

/** Operation passed into `mapTaskDescriptionErrorToUserMessage`. */
export type TaskDescriptionOperation = 'save' | 'clear';

/**
 * Discriminated result returned by `mapTaskDescriptionErrorToUserMessage`
 * (issue #91). Callers switch on `kind`:
 *  - `inline`        → render `text` inline inside the editor / confirm.
 *  - `not-found`     → close the panel + show the 404 toast.
 *  - `server-errors` → 400 with a non-empty `ApiResponse.errors`; the
 *                      component renders `texts[0]` verbatim as inline copy,
 *                      falling back to `INLINE_ERROR_GENERIC_SAVE` when empty.
 *
 * The mapper never exposes status codes, URLs, stack traces, or raw envelope
 * errors beyond the single first string on 400 — same contract as the
 * existing mappers.
 */
export type TaskDescriptionErrorResult =
  | { kind: 'inline'; text: string }
  | { kind: 'not-found' }
  | { kind: 'server-errors'; texts: readonly string[] };

interface ApiResponseLikeErrors {
  errors?: readonly string[];
}

/**
 * Translates an HTTP error from the description PUT/DELETE into the
 * discriminated result above. `operation` parameterises 400 handling —
 * save's 400 carries `ApiResponse.errors`; clear is not expected to
 * produce 400 per the backend contract, so defensively falls back to
 * `INLINE_ERROR_GENERIC_SAVE`.
 */
export function mapTaskDescriptionErrorToUserMessage(
  error: unknown,
  operation: TaskDescriptionOperation
): TaskDescriptionErrorResult {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { kind: 'inline', text: TASK_DESCRIPTION_COPY.INLINE_ERROR_NETWORK };
    }
    if (error.status === 403) {
      return {
        kind: 'inline',
        text: TASK_DESCRIPTION_COPY.INLINE_ERROR_PERMISSION
      };
    }
    if (error.status === 404) {
      return { kind: 'not-found' };
    }
    if (error.status === 400 && operation === 'save') {
      const envelope = error.error as ApiResponseLikeErrors | null | undefined;
      const texts = Array.isArray(envelope?.errors) ? envelope!.errors! : [];
      return { kind: 'server-errors', texts };
    }
    // 401 is owned by the global authInterceptor; every other status falls
    // back to the generic save copy so the user sees actionable advice.
    return {
      kind: 'inline',
      text: TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
    };
  }

  return {
    kind: 'inline',
    text: TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
  };
}
