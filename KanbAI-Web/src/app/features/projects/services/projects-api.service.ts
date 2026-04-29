import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, ProjectSummary } from '../models/project.model';
import { ProjectInput } from '../state/project-state.model';

/**
 * Identifies which user-facing operation triggered an error, so
 * `mapErrorToUserMessage` can produce operation-appropriate copy
 * (e.g. "couldn't save your project" vs. "couldn't load your projects").
 */
export type ProjectOperation = 'list' | 'create' | 'update' | 'delete';

@Injectable({ providedIn: 'root' })
export class ProjectsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Backend endpoint is singular (`/api/project`) — confirmed against
   * .claude/backend_api_map.md. Do NOT pluralise.
   */
  private readonly apiUrl = `${environment.apiUrl}/project`;

  /**
   * Fetches the list of projects the authenticated user has access to.
   *
   * Authorization: the JWT bearer token is attached automatically by
   * the existing `authInterceptor` (matches requests whose URL starts
   * with environment.apiUrl). The service does NOT read the token itself.
   *
   * Envelope unwrapping: the backend returns `ApiResponse<List<ProjectResponseDto>>`.
   * This method unwraps `response.data ?? []` (null-coalesced to a safe
   * empty array if the server ever returns `success: true` with null data)
   * and projects the `success: false` case into an observable error so
   * the caller only has one failure path to handle.
   */
  listProjects(): Observable<ProjectSummary[]> {
    return this.http.get<ApiResponse<ProjectSummary[]>>(this.apiUrl).pipe(
      map(response => {
        if (!response.success) {
          throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed');
        }
        return response.data ?? [];
      })
    );
  }

  /**
   * Creates a new project on the backend. Body mirrors CreateProjectDto
   * (`{ name, description }`); response is `ApiResponse<ProjectResponseDto>`.
   * Envelope unwrap + `success: false` -> observable error, identical
   * to `listProjects()`. On success, the unwrapped DTO (`ProjectSummary`)
   * is emitted.
   */
  createProject(input: ProjectInput): Observable<ProjectSummary> {
    return this.http.post<ApiResponse<ProjectSummary>>(this.apiUrl, input).pipe(
      map(response => {
        if (!response.success || response.data == null) {
          throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed');
        }
        return response.data;
      })
    );
  }

  /**
   * Updates a project by id. Body mirrors UpdateProjectDto (same shape
   * as CreateProjectDto); response is `ApiResponse<ProjectResponseDto>`.
   * `encodeURIComponent(id)` defends against any unexpected id characters
   * even though the backend emits UUIDs.
   */
  updateProject(id: string, input: ProjectInput): Observable<ProjectSummary> {
    const url = `${this.apiUrl}/${encodeURIComponent(id)}`;
    return this.http.put<ApiResponse<ProjectSummary>>(url, input).pipe(
      map(response => {
        if (!response.success || response.data == null) {
          throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed');
        }
        return response.data;
      })
    );
  }

  /**
   * Deletes a project by id. Backend returns `204 No Content` with no
   * JSON body, so this method does NOT attempt to unwrap an envelope —
   * any non-2xx response will surface as an HttpErrorResponse through
   * the Observable's error branch.
   */
  deleteProject(id: string): Observable<void> {
    const url = `${this.apiUrl}/${encodeURIComponent(id)}`;
    return this.http.delete<void>(url);
  }
}

/**
 * Converts an HttpErrorResponse (or a plain Error from an envelope
 * `success: false`) into a user-readable sentence. Never exposes
 * status codes, URLs, or stack traces to the UI.
 *
 * The `operation` discriminator selects the appropriate wording for
 * each failure mode; it defaults to `'list'` to preserve compatibility
 * with any call-site that predates the CRUD extension.
 *
 * The 401 case is already handled globally by `authInterceptor`
 * (logout + redirect); this helper still maps it defensively in
 * case the interceptor ever short-circuits.
 */
export function mapErrorToUserMessage(
  error: unknown,
  operation: ProjectOperation = 'list'
): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }

    // 403 on delete is a legitimate authorization signal ("only the
    // project owner can delete this project") — NOT a session-expiry.
    // All other 401/403 paths fall through to the session-expired copy.
    if (error.status === 403 && operation === 'delete') {
      return 'Only the project owner can delete this project.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'Your session has expired. Please sign in again.';
    }

    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }

    if (error.status === 404) {
      if (operation === 'update' || operation === 'delete') {
        return "We couldn't find that project — it may have been deleted.";
      }
      // For 'list' and 'create', 404 is unexpected — fall through to
      // the operation's generic 4xx copy below.
    }

    if (error.status >= 400) {
      return genericFailureCopy(operation);
    }
  }

  return genericFailureCopy(operation);
}

function genericFailureCopy(operation: ProjectOperation): string {
  switch (operation) {
    case 'create':
    case 'update':
      return "We couldn't save your project. Please check the details and try again.";
    case 'delete':
      return "We couldn't delete the project. Please try again.";
    case 'list':
    default:
      return "We couldn't load your projects. Please try again.";
  }
}
