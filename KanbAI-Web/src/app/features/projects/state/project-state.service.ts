import { Injectable, Signal, effect, inject } from '@angular/core';
import { Observable, Subscription, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { BaseStateService } from '../../../core/state/base-state.service';
import { AuthService } from '../../../core/services/AuthService';
import { ProjectSummary } from '../models/project.model';
import {
  INITIAL_PROJECT_STATE,
  ProjectInput,
  ProjectState
} from './project-state.model';
import {
  ProjectsApiService,
  mapErrorToUserMessage
} from '../services/projects-api.service';

/**
 * Single source of truth for the authenticated user's project list.
 *
 * Responsibilities:
 *  - Own the canonical `projects` signal backed by `BaseStateService`.
 *  - Proxy the four CRUD endpoints through `ProjectsApiService`.
 *  - Apply mutations locally on server confirmation (prepend / replace /
 *    remove) so every UI bound to `projects` refreshes within a single
 *    change-detection pass.
 *  - Reset the cache when the user logs out (observed via an Angular
 *    `effect()` on `AuthService.currentUser`), so session data never
 *    leaks across users on the same browser.
 *
 * Error transport contract:
 *  - `loadProjects()` failures are written to the `error` signal so the
 *    page-level error panel can render them.
 *  - Mutation failures (`create`/`update`/`delete`) are delivered through
 *    the returned Observable's error branch; they do NOT write to the
 *    `error` signal — that signal is list-scope only. Callers attach their
 *    own inline error surface (see design spec's FormErrorBanner).
 */
@Injectable({ providedIn: 'root' })
export class ProjectStateService extends BaseStateService<ProjectState> {
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly authService = inject(AuthService);

  /**
   * Subscription reference for the in-flight `loadProjects()` call, used
   * to de-duplicate concurrent calls and to abandon a pending fetch when
   * the user logs out mid-request.
   */
  private inFlightLoad: Subscription | null = null;

  // Public selectors — read-only signals exposed to the rest of the app.
  readonly projects: Signal<ProjectSummary[]> = this.select(state => state.projects);
  readonly isLoading: Signal<boolean> = this.select(state => state.isLoading);
  readonly error: Signal<string | null> = this.select(state => state.error);
  readonly hasLoaded: Signal<boolean> = this.select(state => state.hasLoaded);

  constructor() {
    super();

    // Logout reset. Guarded by `hasLoaded` so the initial unauthenticated
    // state (currentUser === null on app boot, before any login) does NOT
    // trigger a spurious reset cycle.
    effect(() => {
      const user = this.authService.currentUser();
      if (user === null && this.getState().hasLoaded) {
        this.reset();
      }
    });
  }

  protected getInitialState(): ProjectState {
    return INITIAL_PROJECT_STATE;
  }

  /**
   * Triggers `GET /api/project` and populates the cache.
   *
   * - No-op if a fetch is already in flight (de-dup): the second caller
   *   relies on the first subscription's resolution.
   * - On success: replaces cached list, sets `hasLoaded=true`, clears `error`.
   * - On failure: leaves the cached list untouched, sets `error` to a
   *   user-readable string.
   * - Does NOT throw to the caller; UI watches the `error` signal.
   */
  loadProjects(): void {
    if (this.inFlightLoad !== null) {
      return;
    }

    this.setState({ isLoading: true, error: null });

    this.inFlightLoad = this.projectsApi.listProjects().subscribe({
      next: projects => {
        this.inFlightLoad = null;
        // Guard against a response arriving after logout cleared the cache
        // and reset `hasLoaded` — do NOT repopulate in that case.
        if (this.authService.currentUser() === null) {
          return;
        }
        this.setState({
          projects,
          isLoading: false,
          error: null,
          hasLoaded: true
        });
      },
      error: err => {
        this.inFlightLoad = null;
        if (this.authService.currentUser() === null) {
          return;
        }
        this.setState({
          isLoading: false,
          error: mapErrorToUserMessage(err, 'list')
        });
      }
    });
  }

  /**
   * Creates a project on the server and prepends the returned DTO onto
   * the cache so the newest project appears at the top of the grid.
   *
   * On failure (HTTP error, envelope success:false, or an invalid DTO
   * that fails the id/name guard), the cache is untouched and the
   * returned Observable errors with a user-readable string.
   */
  createProject(input: ProjectInput): Observable<ProjectSummary> {
    return this.projectsApi.createProject(input).pipe(
      tap(created => {
        if (!this.isValidSummary(created)) {
          throw new Error('Invalid project DTO');
        }
        const current = this.getState().projects;
        this.setState({ projects: [created, ...current] });
      }),
      catchError(err => throwError(() => new Error(mapErrorToUserMessage(err, 'create'))))
    );
  }

  /**
   * Updates a project. On success the matching entry (by `id`) is
   * replaced in place preserving array order; if the id is absent
   * the returned DTO is appended — defensive behavior so a legitimate
   * server response is never silently dropped.
   */
  updateProject(id: string, input: ProjectInput): Observable<ProjectSummary> {
    return this.projectsApi.updateProject(id, input).pipe(
      tap(updated => {
        if (!this.isValidSummary(updated)) {
          throw new Error('Invalid project DTO');
        }
        const current = this.getState().projects;
        const index = current.findIndex(p => p.id === updated.id);
        const next =
          index === -1
            ? [...current, updated]
            : [...current.slice(0, index), updated, ...current.slice(index + 1)];
        this.setState({ projects: next });
      }),
      catchError(err => throwError(() => new Error(mapErrorToUserMessage(err, 'update'))))
    );
  }

  /**
   * Deletes a project. On 204 success, removes the entry with the matching
   * id from the cache. If the id is already absent (e.g. two-tab race),
   * success is tolerated and the cache simply remains without that id.
   */
  deleteProject(id: string): Observable<void> {
    return this.projectsApi.deleteProject(id).pipe(
      tap(() => {
        const current = this.getState().projects;
        const next = current.filter(p => p.id !== id);
        // Only write if something actually changed — avoids unnecessary
        // signal emissions for the already-absent case.
        if (next.length !== current.length) {
          this.setState({ projects: next });
        }
      }),
      catchError(err => throwError(() => new Error(mapErrorToUserMessage(err, 'delete'))))
    );
  }

  /**
   * Defensive type-guard against an unexpected response shape. The cache
   * is indexed by `id`, so an item missing `id` (or with a non-string
   * name) must never enter it — we would lose the ability to address
   * it later in `updateProject` / `deleteProject`.
   */
  private isValidSummary(p: unknown): p is ProjectSummary {
    return (
      !!p &&
      typeof (p as ProjectSummary).id === 'string' &&
      (p as ProjectSummary).id.length > 0 &&
      typeof (p as ProjectSummary).name === 'string'
    );
  }

  /**
   * Clears the cache and abandons any in-flight list fetch. Triggered by
   * the logout `effect()` — never called directly from outside the service.
   */
  private reset(): void {
    if (this.inFlightLoad !== null) {
      this.inFlightLoad.unsubscribe();
      this.inFlightLoad = null;
    }
    this.replaceState(INITIAL_PROJECT_STATE);
  }
}
