import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, ProjectSummary } from '../models/project.model';

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
}

/**
 * Converts an HttpErrorResponse (or a plain Error from an envelope
 * `success: false`) into a user-readable sentence. Never exposes
 * status codes, URLs, or stack traces to the UI.
 *
 * The 401 case is already handled globally by `authInterceptor`
 * (logout + redirect); this helper still maps it defensively in
 * case the interceptor ever short-circuits.
 */
export function mapErrorToUserMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }
    if (error.status === 401 || error.status === 403) {
      return 'Your session has expired. Please sign in again.';
    }
    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }
    if (error.status >= 400) {
      return "We couldn't load your projects. Please try again.";
    }
  }

  return "We couldn't load your projects. Please try again.";
}
