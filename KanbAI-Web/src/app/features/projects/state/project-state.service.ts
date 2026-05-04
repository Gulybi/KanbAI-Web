import { DestroyRef, Injectable, Signal, effect, inject } from '@angular/core';
import { Observable, Subscription, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { BaseStateService } from '../../../core/state/base-state.service';
import { AuthService } from '../../../core/services/AuthService';
import { SignalRService } from '../../../core/services/signalr.service';
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
import {
  ProjectDeletedEvent,
  ProjectUpdatedEvent,
  REALTIME_EVENT
} from '../../../core/models/realtime-events';

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
  private readonly signalRService = inject(SignalRService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Subscription reference for the in-flight `loadProjects()` call, used
   * to de-duplicate concurrent calls and to abandon a pending fetch when
   * the user logs out mid-request.
   */
  private inFlightLoad: Subscription | null = null;

  /**
   * Active real-time event subscriptions. Refreshed on every
   * `connectionState → 'connected'` transition so the fresh Subjects
   * handed out by `SignalRService.on()` after a `stop()`/`start()` cycle
   * (e.g. logout → login) are actually wired up.
   */
  private realtimeSubscriptions: Subscription[] = [];

  /**
   * Project ids currently represented as a SignalR group membership on the
   * server. Maintained by the auto-join/leave effect below. Cleared on
   * disconnect (server wipes group membership anyway; we re-join from
   * scratch on reconnect).
   */
  private readonly joinedProjectIds = new Set<string>();

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

    // Real-time subscriber (re-)registration. Re-runs whenever
    // connectionState changes: on 'connected' we wire fresh subscribers
    // against the fresh Subjects the transport handed out after the most
    // recent `stop()`/`start()`. On any other state we tear down so we
    // don't leak Subject references across cycles.
    effect(() => {
      const state = this.signalRService.connectionState();
      if (state !== 'connected') {
        this.teardownRealtimeSubscriptions();
        return;
      }
      this.teardownRealtimeSubscriptions();
      this.realtimeSubscriptions.push(
        this.signalRService
          .on<ProjectUpdatedEvent>(REALTIME_EVENT.ProjectUpdated)
          .subscribe(evt => this.onProjectUpdated(evt))
      );
      this.realtimeSubscriptions.push(
        this.signalRService
          .on<ProjectDeletedEvent>(REALTIME_EVENT.ProjectDeleted)
          .subscribe(evt => this.onProjectDeleted(evt))
      );
    });

    // Layer-1 auto-join/leave (see tech spec §"Join strategy — two layers").
    // Diffs `projects()` against `joinedProjectIds`; fires Join for newly
    // desired ids and Leave for no-longer-desired ids. Runs only while
    // connected — on disconnect the local tracking set is cleared so a
    // subsequent reconnect re-joins everything from scratch.
    effect(() => {
      const connected = this.signalRService.connectionState() === 'connected';
      if (!connected) {
        this.joinedProjectIds.clear();
        return;
      }
      const desired = new Set(this.projects().map(p => p.id));

      for (const id of desired) {
        if (!this.joinedProjectIds.has(id)) {
          void this.signalRService.joinProjectGroup(id);
          this.joinedProjectIds.add(id);
        }
      }
      for (const id of Array.from(this.joinedProjectIds)) {
        if (!desired.has(id)) {
          void this.signalRService.leaveProjectGroup(id);
          this.joinedProjectIds.delete(id);
        }
      }
    });

    this.destroyRef.onDestroy(() => this.teardownRealtimeSubscriptions());
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
      // Cancellation of a mid-flight fetch on logout is handled by
      // `reset()` via `inFlightLoad.unsubscribe()`, so these callbacks do
      // not need to re-check `currentUser()` before writing to state.
      next: projects => {
        this.inFlightLoad = null;
        this.setState({
          projects,
          isLoading: false,
          error: null,
          hasLoaded: true
        });
      },
      error: err => {
        this.inFlightLoad = null;
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

  // ------------------- realtime handlers -------------------

  /**
   * Reconcile `ProjectUpdated`: replace-in-place by projectId.
   * Silent no-op if the project is not in the local list (AC11).
   */
  private onProjectUpdated(evt: ProjectUpdatedEvent): void {
    if (!evt || typeof evt.projectId !== 'string') {
      return;
    }
    const current = this.getState().projects;
    const index = current.findIndex(p => p.id === evt.projectId);
    if (index === -1) {
      return;
    }
    const updated: ProjectSummary = {
      ...current[index],
      name: evt.name,
      description: evt.description,
      updatedAt: evt.updatedAt
    };
    const next = [
      ...current.slice(0, index),
      updated,
      ...current.slice(index + 1)
    ];
    this.setState({ projects: next });
  }

  /**
   * Reconcile `ProjectDeleted`: filter out the matching id.
   * Silent no-op if the project is absent (AC11).
   */
  private onProjectDeleted(evt: ProjectDeletedEvent): void {
    if (!evt || typeof evt.projectId !== 'string') {
      return;
    }
    const current = this.getState().projects;
    const next = current.filter(p => p.id !== evt.projectId);
    if (next.length !== current.length) {
      this.setState({ projects: next });
    }
  }

  private teardownRealtimeSubscriptions(): void {
    for (const sub of this.realtimeSubscriptions) {
      sub.unsubscribe();
    }
    this.realtimeSubscriptions = [];
  }
}
