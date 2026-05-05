import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ColumnResponseDto,
  ColumnsListResponse
} from '../models/column.model';

/**
 * Identifies which user-facing operation triggered an error, so
 * `mapColumnErrorToUserMessage` can produce operation-appropriate copy.
 *
 * Only `'list'` is supported in this ticket — create/delete column are
 * out of scope per the issue #47 context document.
 */
export type ColumnOperation = 'list';

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
}

/**
 * Translates an `HttpErrorResponse` (or a plain `Error` thrown from
 * envelope-unwrap) into a user-readable sentence. Never exposes status
 * codes, URLs, or stack traces to the UI.
 *
 * Operation is `'list'` only in this ticket; the signature keeps the
 * parameter for parity with sibling helpers so future column CRUD can
 * extend the table without changing call-sites.
 */
export function mapColumnErrorToUserMessage(
  error: unknown,
  operation: ColumnOperation
): string {
  // Reference `operation` so TS doesn't flag it unused while we are
  // still single-operation (future extensions will branch on this).
  void operation;

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }

    if (error.status === 401 || error.status === 403) {
      return 'Your session has expired. Please sign in again.';
    }

    if (error.status === 404) {
      return 'This project no longer exists.';
    }

    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }

    // Any other 4xx.
    if (error.status >= 400) {
      return "We couldn't load this board. Please try again.";
    }
  }

  return "We couldn't load this board. Please try again.";
}
