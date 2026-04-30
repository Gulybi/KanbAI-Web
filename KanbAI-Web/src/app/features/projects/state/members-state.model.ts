import { MemberSummary } from '../models/member.model';

/**
 * Per-project load/mutate status. One slice is materialised per projectId
 * on first `loadMembers(id)` and pruned when the project disappears from
 * `ProjectStateService.projects` (observed via an effect in
 * `MembersStateService`).
 */
export interface PerProjectMembers {
  /** The roster as last confirmed by the server. `[]` during initial load. */
  members: MemberSummary[];

  /** True while `GET /members` is in flight for this project. */
  isLoading: boolean;

  /**
   * User-readable list-scope error. Written on list-load failure; cleared
   * on the next successful load. Mutation-scope errors are NOT written
   * here — they flow through the mutation Observable's error branch.
   */
  error: string | null;

  /**
   * Distinguishes "never asked" from "asked and got []". Used by the
   * dialog's `listVm` to pick `'loading'` vs `'empty'` without an extra
   * flag, mirroring `ProjectState.hasLoaded`.
   */
  hasLoaded: boolean;
}

export interface MembersState {
  /** Keyed by projectId. Entries created lazily on first `loadMembers(id)`. */
  byProjectId: Record<string, PerProjectMembers>;
}

export const INITIAL_PER_PROJECT_MEMBERS: PerProjectMembers = {
  members: [],
  isLoading: false,
  error: null,
  hasLoaded: false
};

export const INITIAL_MEMBERS_STATE: MembersState = {
  byProjectId: {}
};
