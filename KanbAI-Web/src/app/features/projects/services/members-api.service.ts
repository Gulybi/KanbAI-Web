import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  AddMemberResponse,
  MemberSummary,
  MembersListResponse
} from '../models/member.model';

/**
 * Identifies which user-facing operation triggered an error, so
 * `mapMemberErrorToUserMessage` can produce operation-appropriate copy
 * (e.g. "couldn't add that member" vs. "couldn't load the member list").
 *
 * Kept as a sibling of `ProjectOperation` — the error shapes (400 "user
 * not found", 400 "already a member", 400 "last owner") have no analogue
 * in project CRUD, so a shared union would force every project call-site
 * to consider irrelevant new branches.
 */
export type MemberOperation = 'list' | 'add' | 'remove';

/**
 * Backend prefix returned by `POST /members` when the email cannot be
 * resolved to a user. The message is `"No user found with email address: {email}"`
 * — match by prefix because the suffix is the user-supplied email.
 */
const NO_USER_FOUND_PREFIX = 'No user found with email address:';

@Injectable({ providedIn: 'root' })
export class MembersApiService {
  private readonly http = inject(HttpClient);

  /**
   * Backend root is singular `/project` (confirmed against
   * `.claude/backend_api_map.md`). Member sub-paths are appended per
   * request.
   */
  private readonly apiUrl = `${environment.apiUrl}/project`;

  /**
   * `GET /api/project/{projectId}/members` — returns the caller-visible
   * roster for a project. Backend collapses "project missing" and
   * "caller not a member" into `404 "Project not found."` — the caller
   * treats both as a list-scope 404.
   */
  listMembers(projectId: string): Observable<MemberSummary[]> {
    const url = `${this.apiUrl}/${encodeURIComponent(projectId)}/members`;
    return this.http.get<MembersListResponse>(url).pipe(
      map(response => {
        if (!response.success) {
          throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed');
        }
        return response.data ?? [];
      })
    );
  }

  /**
   * `POST /api/project/{projectId}/members` with body `{ email }`
   * (Option B1 — backend resolves the email internally). On success
   * the backend returns the newly-added `MemberResponseDto`.
   */
  addMemberByEmail(projectId: string, email: string): Observable<MemberSummary> {
    const url = `${this.apiUrl}/${encodeURIComponent(projectId)}/members`;
    return this.http.post<AddMemberResponse>(url, { email }).pipe(
      map(response => {
        if (!response.success || response.data == null) {
          throw new Error(response.errors?.[0] ?? response.message ?? 'Request failed');
        }
        return response.data;
      })
    );
  }

  /**
   * `DELETE /api/project/{projectId}/members/{userId}` — backend returns
   * `204 No Content`. Any non-2xx response surfaces as an
   * `HttpErrorResponse` on the Observable's error branch.
   */
  removeMember(projectId: string, userId: string): Observable<void> {
    const url = `${this.apiUrl}/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`;
    return this.http.delete<void>(url);
  }
}

/**
 * Translates an `HttpErrorResponse` (or a plain `Error` thrown from
 * envelope-unwrap) into a user-readable sentence. Never exposes status
 * codes, URLs, or stack traces to the UI.
 *
 * Kept as a sibling of `mapErrorToUserMessage` (in `projects-api.service`)
 * rather than extended, because the members 400 space has no overlap with
 * project CRUD and a shared helper would widen the blast radius of any
 * future change.
 */
export function mapMemberErrorToUserMessage(
  error: unknown,
  operation: MemberOperation
): string {
  // Normalise the backend message string once.
  const backendMessage = extractBackendMessage(error);

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }

    if (error.status === 401) {
      return 'Your session has expired. Please sign in again.';
    }

    if (error.status === 403) {
      return operation === 'add'
        ? 'Only the project owner can add members.'
        : operation === 'remove'
          ? 'Only the project owner can remove members.'
          : 'Your session has expired. Please sign in again.';
    }

    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }

    if (error.status === 400) {
      if (operation === 'add') {
        if (
          backendMessage === 'User not found.' ||
          (backendMessage !== null && backendMessage.startsWith(NO_USER_FOUND_PREFIX))
        ) {
          return "We couldn't find a user with that email.";
        }
        if (backendMessage === 'User is already a member of this project.') {
          return 'That user is already a member of this project.';
        }
        if (backendMessage === 'Either UserId or Email is required.') {
          return 'Please enter an email.';
        }
        return "We couldn't add that member. Please check the email and try again.";
      }

      if (operation === 'remove') {
        if (backendMessage === 'Cannot remove the last owner from the project.') {
          return "You can't remove the last owner of a project.";
        }
        return "We couldn't remove that member. Please try again.";
      }

      // list 400 — unexpected from this endpoint, fall through to generic.
    }

    if (error.status === 404) {
      if (operation === 'list' || operation === 'add') {
        return 'This project no longer exists.';
      }
      // 404 on remove is tolerated as success by the state layer — this
      // branch should not be reached in practice, but provide safe copy.
      return 'This project no longer exists.';
    }

    // Any other 4xx.
    return genericFailureCopy(operation);
  }

  // Plain Error (envelope `success: false`) — apply the same matrix to
  // its message so callers that unwrap 400 payloads into a thrown Error
  // still produce the specific copy.
  if (operation === 'add' && backendMessage !== null) {
    if (
      backendMessage === 'User not found.' ||
      backendMessage.startsWith(NO_USER_FOUND_PREFIX)
    ) {
      return "We couldn't find a user with that email.";
    }
    if (backendMessage === 'User is already a member of this project.') {
      return 'That user is already a member of this project.';
    }
  }
  if (operation === 'remove' && backendMessage === 'Cannot remove the last owner from the project.') {
    return "You can't remove the last owner of a project.";
  }

  return genericFailureCopy(operation);
}

function extractBackendMessage(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    if (body && typeof body === 'object') {
      const envelope = body as { errors?: unknown; message?: unknown };
      if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
        const first = envelope.errors[0];
        if (typeof first === 'string') {
          return first;
        }
      }
      if (typeof envelope.message === 'string') {
        return envelope.message;
      }
    }
    return null;
  }
  if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  return null;
}

function genericFailureCopy(operation: MemberOperation): string {
  switch (operation) {
    case 'add':
      return "We couldn't add that member. Please check the email and try again.";
    case 'remove':
      return "We couldn't remove that member. Please try again.";
    case 'list':
    default:
      return "We couldn't load the member list. Please try again.";
  }
}
