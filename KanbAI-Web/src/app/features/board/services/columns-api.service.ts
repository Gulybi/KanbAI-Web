import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ColumnCreateResponse,
  ColumnResponseDto,
  ColumnsListResponse,
  CreateColumnDto
} from '../models/column.model';

/**
 * Identifies which user-facing operation triggered an error, so
 * `mapColumnErrorToUserMessage` can produce operation-appropriate copy.
 *
 * `'create'` was added by issue #70; `'list'` was the original operation
 * shipped with #47.
 */
export type ColumnOperation = 'list' | 'create' | 'delete';

@Injectable({ providedIn: 'root' })
export class ColumnsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Backend path is singular (`/api/column`) — confirmed against
   * .claude/backend_api_map.md. Do NOT pluralise.
   */
  private readonly apiUrl = `${environment.apiUrl}/column`;

  /**
   * `GET /api/column/project/{projectId}` — returns the columns for a
   * project in ascending `columnOrder` (backend pre-sorted). JWT is
   * attached automatically by the existing `authInterceptor`.
   *
   * Envelope unwrapping mirrors `ProjectsApiService.listProjects`:
   * `success: false` is projected into an observable error so callers
   * have a single failure branch.
   */
  getColumnsForProject(projectId: string): Observable<ColumnResponseDto[]> {
    const url = `${this.apiUrl}/project/${encodeURIComponent(projectId)}`;
    return this.http.get<ColumnsListResponse>(url).pipe(
      map(response => {
        if (!response.success) {
          throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed');
        }
        return response.data ?? [];
      })
    );
  }

  /**
   * `POST /api/column/project/{projectId}` — creates a single column for
   * a project. Returns the created `ColumnResponseDto`.
   *
   * Envelope unwrap mirrors `ProjectsApiService.createProject`:
   *  - `success: false` or `data == null` → observable error.
   *  - `success: true` with non-null data → unwrapped DTO.
   *
   * The service does NOT retry, does NOT swallow errors, and does NOT
   * translate to user copy — callers (`ProjectCreationService`) own
   * error translation and per-column sequencing semantics.
   */
  createColumn(
    projectId: string,
    dto: CreateColumnDto
  ): Observable<ColumnResponseDto> {
    const url = `${this.apiUrl}/project/${encodeURIComponent(projectId)}`;
    return this.http.post<ColumnCreateResponse>(url, dto).pipe(
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
   * `DELETE /api/column/{id}` — removes a column and cascades its tasks
   * server-side. Backend returns `204 No Content` on success (or `404`
   * if already gone — caller treats 404 as success per the copy matrix);
   * no envelope on the wire, non-2xx surfaces as `HttpErrorResponse` on
   * the Observable's error branch. Issue #96.
   */
  deleteColumn(columnId: string): Observable<void> {
    const url = `${this.apiUrl}/${encodeURIComponent(columnId)}`;
    return this.http.delete<void>(url);
  }
}

/**
 * Translates an `HttpErrorResponse` (or a plain `Error` thrown from
 * envelope-unwrap) into a user-readable sentence. Never exposes status
 * codes, URLs, or stack traces to the UI.
 *
 * `operation` selects the appropriate wording. Both `'list'` (issue #47)
 * and `'create'` (issue #70) are supported.
 */
export function mapColumnErrorToUserMessage(
  error: unknown,
  operation: ColumnOperation
): string {
  // `'delete'` branches first because its copy matrix differs materially:
  // no session-expired re-mapping on 401/403 (context doc routes 403 to a
  // permission-specific string), and 404 is a SUCCESS — the smart parent
  // never calls this mapper for 404 on delete. See dashboard/board-page
  // smart-parent submit handlers.
  if (operation === 'delete') {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return "Couldn't reach the server — try again";
      }
      if (error.status === 403) {
        return "You don't have permission to delete this column";
      }
    }
    return "Couldn't delete column — please try again";
  }

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }

    if (error.status === 401 || error.status === 403) {
      return 'Your session has expired. Please sign in again.';
    }

    if (error.status === 404) {
      if (operation === 'create') {
        return "We couldn't add a column — this project no longer exists.";
      }
      return 'This project no longer exists.';
    }

    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }

    if (error.status >= 400) {
      return operationGenericCopy(operation);
    }
  }

  return operationGenericCopy(operation);
}

function operationGenericCopy(operation: ColumnOperation): string {
  switch (operation) {
    case 'create':
      return "We couldn't add a column. Please try again.";
    case 'delete':
      // `delete` is handled upstream — this branch exists for exhaustiveness.
      return "Couldn't delete column — please try again";
    case 'list':
    default:
      return "We couldn't load this board. Please try again.";
  }
}
