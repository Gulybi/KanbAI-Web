import { ApiResponse } from './project.model';

/**
 * Frontend projection of backend `MemberResponseDto`. Field names are the
 * camelCase JSON forms confirmed from KanbAI-Core's `MemberResponseDto.cs`.
 *
 * `role` carries "Owner" | "Member" at time of writing but is widened to
 * `string` defensively — a future backend role must not break the
 * frontend type-check.
 */
export interface MemberSummary {
  /** User id (GUID). Opaque — never derived from email, never parsed. */
  userId: string;

  /** Display name for the row. Required by backend contract. */
  name: string;

  /** Email, case as stored by backend. Rendered alongside name. */
  email: string;

  /** "Owner" | "Member" at time of writing; widened to string defensively. */
  role: string;

  /** ISO-8601 timestamp, e.g. "2026-04-29T14:12:00Z". */
  joinedAt: string;
}

/**
 * Envelope for `GET /api/project/{projectId}/members`. The members endpoints
 * use the same `ApiResponse<T>` wrapper as the projects endpoints.
 */
export type MembersListResponse = ApiResponse<MemberSummary[]>;

/**
 * Envelope for `POST /api/project/{projectId}/members`.
 */
export type AddMemberResponse = ApiResponse<MemberSummary>;
