import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  CreateTaskDto,
  MoveTaskDto,
  TaskCreateResponse,
  TaskMoveResponse,
  TaskResponseDto
} from '../models/task.model';

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
