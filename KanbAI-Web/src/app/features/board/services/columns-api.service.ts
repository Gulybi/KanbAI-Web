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
export type ColumnOperation = 'list' | 'create';

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
    case 'list':
    default:
      return "We couldn't load this board. Please try again.";
  }
}
