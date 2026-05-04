import {
  DestroyRef,
  Injectable,
  Signal,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { Observable, Subscription, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';

import { BaseStateService } from '../../../core/state/base-state.service';
import { AuthService } from '../../../core/services/AuthService';
import { SignalRService } from '../../../core/services/signalr.service';
import { MemberSummary } from '../models/member.model';
import {
  INITIAL_MEMBERS_STATE,
  INITIAL_PER_PROJECT_MEMBERS,
  MembersState,
  PerProjectMembers
} from './members-state.model';
import {
  MembersApiService,
  mapMemberErrorToUserMessage
} from '../services/members-api.service';
import { ProjectStateService } from './project-state.service';
import {
  MemberAddedEvent,
  MemberRemovedEvent,
  REALTIME_EVENT
} from '../../../core/models/realtime-events';

/**
 * Per-project members cache.
 *
 * Owns a `Record<projectId, PerProjectMembers>` keyed by project id. A
 * slice is created lazily on first `loadMembers(id)`. The cache is:
 *  - fully reset on logout (observed via `AuthService.currentUser`);
 *  - incrementally pruned when a project disappears from
 *    `ProjectStateService.projects` (observed via an effect here).
 *
 * Error transport contract mirrors `ProjectStateService`:
 *  - `loadMembers` failures write a user-readable string to the per-project
 *    slice's `error`;
 *  - `addMemberByEmail` / `removeMember` failures flow through the returned
 *    Observable's error branch and do NOT write to any slice's `error`
 *    signal.
 */
@Injectable({ providedIn: 'root' })
export class MembersStateService extends BaseStateService<MembersState> {
  private readonly membersApi = inject(MembersApiService);
  private readonly authService = inject(AuthService);
  private readonly projectState = inject(ProjectStateService);
  private readonly signalRService = inject(SignalRService);
  private readonly destroyRef = inject(DestroyRef);

  /** Map<projectId, Subscription> for in-flight list loads. */
  private readonly inFlightLoads: Map<string, Subscription> = new Map();

  /**
   * Active real-time event subscriptions. Refreshed on every
   * `connectionState → 'connected'` transition so a post-logout login
   * re-subscribes against the fresh Subjects minted after `stop()`/`start()`.
   */
  private realtimeSubscriptions: Subscription[] = [];

  /**
   * Id of the project whose members dialog is currently open, if any.
   * Drives attribution for the `MemberAdded` event, whose payload does
   * not carry a `projectId` (see tech spec §"Known Backend Contract
   * Caveats"). Set by {@link setCurrentProjectContext} on dialog open,
   * cleared by {@link clearCurrentProjectContext} on dialog close.
   */
  private readonly contextSignal = signal<string | null>(null);

  /** Read-only context signal. Consumed by the dialog component's tests. */
  readonly currentProjectContext = this.contextSignal.asReadonly();

  constructor() {
    super();

    // Logout reset — guarded by "at least one slice exists" to avoid
    // a spurious reset during the initial unauthenticated app boot.
    effect(() => {
      const user = this.authService.currentUser();
      if (user === null && Object.keys(this.getState().byProjectId).length > 0) {
        this.reset();
      }
    });

    // Prune-on-project-removed — whenever the project list changes, drop
    // cached slices whose project id is no longer present. This keeps the
    // cache from growing unbounded and handles concurrent deletion.
    effect(() => {
      const ids = new Set(this.projectState.projects().map(p => p.id));
      this.pruneRemovedProjects(ids);
    });

    // Real-time subscriber registration — re-runs on every connection-state
    // transition so post-logout logins re-wire against fresh Subjects.
    effect(() => {
      const state = this.signalRService.connectionState();
      if (state !== 'connected') {
        this.teardownRealtimeSubscriptions();
        return;
      }
      this.teardownRealtimeSubscriptions();
      this.realtimeSubscriptions.push(
        this.signalRService
          .on<MemberAddedEvent>(REALTIME_EVENT.MemberAdded)
          .subscribe(evt => this.onMemberAdded(evt))
      );
      this.realtimeSubscriptions.push(
        this.signalRService
          .on<MemberRemovedEvent>(REALTIME_EVENT.MemberRemoved)
          .subscribe(evt => this.onMemberRemoved(evt))
      );
    });

    this.destroyRef.onDestroy(() => this.teardownRealtimeSubscriptions());
  }

  /**
   * Called by the members-dialog component on open. Attribution hook for
   * `MemberAdded` events, whose payload lacks `projectId`.
   */
  setCurrentProjectContext(projectId: string): void {
    this.contextSignal.set(projectId);
  }

  /** Called by the members-dialog component on close. */
  clearCurrentProjectContext(): void {
    this.contextSignal.set(null);
  }

  protected getInitialState(): MembersState {
    return INITIAL_MEMBERS_STATE;
  }

  /**
   * Per-project selector. Returns a Signal that closes over `projectId`
   * so callers can hold a single reference (typically constructed once
   * in a dialog's class-field).
   */
  selectForProject(projectId: string): Signal<PerProjectMembers> {
    return computed(() => this.getState().byProjectId[projectId] ?? INITIAL_PER_PROJECT_MEMBERS);
  }

  /**
   * Kicks off `GET /members` if no slice exists or `forceRefresh` is true.
   * De-duplicates concurrent calls per projectId.
   */
  loadMembers(projectId: string, forceRefresh: boolean = false): void {
    if (this.inFlightLoads.has(projectId)) {
      return;
    }

    const existing = this.getState().byProjectId[projectId];
    if (existing && existing.hasLoaded && !forceRefresh) {
      return;
    }

    this.upsertSlice(projectId, { isLoading: true, error: null });

    const sub = this.membersApi.listMembers(projectId).subscribe({
      next: members => {
        this.inFlightLoads.delete(projectId);
        // Guard against a response landing after logout.
        if (this.authService.currentUser() === null) {
          return;
        }
        this.upsertSlice(projectId, {
          members,
          isLoading: false,
          error: null,
          hasLoaded: true
        });
      },
      error: err => {
        this.inFlightLoads.delete(projectId);
        if (this.authService.currentUser() === null) {
          return;
        }
        this.upsertSlice(projectId, {
          isLoading: false,
          error: mapMemberErrorToUserMessage(err, 'list')
        });
      }
    });

    this.inFlightLoads.set(projectId, sub);
  }

  /**
   * POST /members — on success the returned row is appended to the slice.
   * On failure the returned Observable errors with a user-readable message.
   */
  addMemberByEmail(projectId: string, email: string): Observable<MemberSummary> {
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      return throwError(() => new Error('Please enter an email.'));
    }

    return this.membersApi.addMemberByEmail(projectId, trimmed).pipe(
      tap(created => {
        if (!this.isValidMember(created)) {
          throw new Error('Invalid member DTO');
        }
        const slice = this.getState().byProjectId[projectId];
        // If the slice hasn't been loaded (defensive), skip cache append;
        // the dialog will be showing loading/empty and will re-sync later.
        if (slice !== undefined) {
          this.upsertSlice(projectId, { members: [...slice.members, created] });
        }
      }),
      catchError(err => throwError(() => new Error(mapMemberErrorToUserMessage(err, 'add'))))
    );
  }

  /**
   * DELETE /members/{userId} — on 204 removes the matching row.
   * On 404 (concurrent remove) still removes the local row silently.
   * On 400 "last owner" / 403 surfaces a user-readable error.
   */
  removeMember(projectId: string, userId: string): Observable<void> {
    return this.membersApi.removeMember(projectId, userId).pipe(
      tap(() => {
        this.removeLocalMember(projectId, userId);
      }),
      catchError(err => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          // Tolerated: the server already lost track of this member.
          this.removeLocalMember(projectId, userId);
          return of(void 0);
        }
        return throwError(() => new Error(mapMemberErrorToUserMessage(err, 'remove')));
      })
    );
  }

  // ------------------- private helpers -------------------

  private removeLocalMember(projectId: string, userId: string): void {
    const slice = this.getState().byProjectId[projectId];
    if (slice === undefined) {
      return;
    }
    const next = slice.members.filter(m => m.userId !== userId);
    if (next.length !== slice.members.length) {
      this.upsertSlice(projectId, { members: next });
    }
  }

  private upsertSlice(projectId: string, patch: Partial<PerProjectMembers>): void {
    const current = this.getState().byProjectId;
    const existing = current[projectId] ?? INITIAL_PER_PROJECT_MEMBERS;
    const nextSlice: PerProjectMembers = { ...existing, ...patch };
    this.setState({
      byProjectId: { ...current, [projectId]: nextSlice }
    });
  }

  private pruneRemovedProjects(currentProjectIds: ReadonlySet<string>): void {
    const current = this.getState().byProjectId;
    const keys = Object.keys(current);
    if (keys.length === 0) {
      return;
    }
    let changed = false;
    const next: Record<string, PerProjectMembers> = {};
    for (const key of keys) {
      if (currentProjectIds.has(key)) {
        next[key] = current[key];
      } else {
        changed = true;
        // Abandon any in-flight load for the dropped id.
        const inFlight = this.inFlightLoads.get(key);
        if (inFlight !== undefined) {
          inFlight.unsubscribe();
          this.inFlightLoads.delete(key);
        }
      }
    }
    if (changed) {
      this.setState({ byProjectId: next });
    }
  }

  private reset(): void {
    for (const [, sub] of this.inFlightLoads) {
      sub.unsubscribe();
    }
    this.inFlightLoads.clear();
    this.replaceState(INITIAL_MEMBERS_STATE);
  }

  private isValidMember(m: unknown): m is MemberSummary {
    return (
      !!m &&
      typeof (m as MemberSummary).userId === 'string' &&
      (m as MemberSummary).userId.length > 0 &&
      typeof (m as MemberSummary).name === 'string' &&
      typeof (m as MemberSummary).email === 'string'
    );
  }

  // ------------------- realtime handlers -------------------

  /**
   * Reconcile `MemberRemoved`: drop the user from the project's slice.
   * Silent no-op if the slice is missing (dialog never opened for this id)
   * or the user is already absent (AC11).
   */
  private onMemberRemoved(evt: MemberRemovedEvent): void {
    if (!evt || typeof evt.projectId !== 'string' || typeof evt.userId !== 'string') {
      return;
    }
    this.removeLocalMember(evt.projectId, evt.userId);
  }

  /**
   * Reconcile `MemberAdded`. ⚠ The payload does not include `projectId`;
   * attribution is done via the "current project context" set by the open
   * members dialog. If no context is set, the event is dropped — per the
   * documented best-effort behavior until the backend wraps the payload.
   *
   * Silent no-op when: no context; slice missing; user already in slice.
   */
  private onMemberAdded(evt: MemberAddedEvent): void {
    if (!evt || typeof evt.userId !== 'string' || evt.userId.length === 0) {
      return;
    }
    const projectId = this.contextSignal();
    if (projectId === null) {
      return;
    }
    const slice = this.getState().byProjectId[projectId];
    if (slice === undefined) {
      return;
    }
    if (slice.members.some(m => m.userId === evt.userId)) {
      return;
    }
    const newMember: MemberSummary = {
      userId: evt.userId,
      name: evt.name,
      email: evt.email,
      role: evt.role,
      joinedAt: evt.joinedAt
    };
    this.upsertSlice(projectId, { members: [...slice.members, newMember] });
  }

  private teardownRealtimeSubscriptions(): void {
    for (const sub of this.realtimeSubscriptions) {
      sub.unsubscribe();
    }
    this.realtimeSubscriptions = [];
  }
}
