/**
 * Generic ASP.NET Core response envelope used by KanbAI-Core for
 * most endpoints. Auth endpoints are the exception — they return
 * their DTO raw. Confirmed against .claude/backend_api_map.md.
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  errors: string[];
  data: T | null;
}

/**
 * Shape of a single project as returned by GET /api/project
 * (backend path is singular). Mirrors backend ProjectResponseDto,
 * serialized with camelCase. Confirmed against
 * .claude/backend_api_map.md.
 */
export interface ProjectSummary {
  /** Stable unique identifier (UUID — opaque to the frontend). */
  id: string;

  /** Display name. Required by backend contract (max 200 chars). */
  name: string;

  /**
   * Optional description. May be `null` (backend allows null; max 500 chars);
   * the UI renders "No description" in that case.
   */
  description: string | null;

  /**
   * Caller's role within this project, e.g. "Owner" or "Member".
   * Surfaced on the card as a small badge.
   */
  role: string;

  /**
   * ISO-8601 timestamp of project creation, e.g. "2026-04-29T14:12:00Z".
   * Always present per backend contract. Defensive fallback to "—" if
   * the string is unparseable by DatePipe. Never displayed raw.
   */
  createdAt: string;

  /**
   * ISO-8601 timestamp of last update. Not rendered in #30, but kept
   * in the model for parity with the backend DTO and for future use
   * (e.g., sorting by most-recently-updated).
   */
  updatedAt: string;
}
