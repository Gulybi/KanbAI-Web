import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Subject } from 'rxjs';

import { MembersStateService } from './members-state.service';
import { ProjectStateService } from './project-state.service';
import { AuthService } from '../../../core/services/AuthService';
import {
  SignalRConnectionState,
  SignalRService
} from '../../../core/services/signalr.service';
import {
  MemberAddedEvent,
  MemberRemovedEvent,
  REALTIME_EVENT
} from '../../../core/models/realtime-events';
import { UserProfileDto } from '../../../core/models/auth.models';
import { ProjectSummary } from '../models/project.model';
import { MemberSummary, MembersListResponse, AddMemberResponse } from '../models/member.model';
import { environment } from '../../../../environments/environment';

interface MockSignalRService {
  connectionState: WritableSignal<SignalRConnectionState>;
  on: ReturnType<typeof vi.fn>;
  emit<T>(name: string, payload: T): void;
  joinProjectGroup: ReturnType<typeof vi.fn>;
  leaveProjectGroup: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  _subjects: Map<string, Subject<unknown>>;
}

function createMockSignalRService(
  initialState: SignalRConnectionState = 'disconnected'
): MockSignalRService {
  const subjects = new Map<string, Subject<unknown>>();
  const connectionState = signal<SignalRConnectionState>(initialState);
  const onFn = vi.fn((name: string) => {
    let subject = subjects.get(name);
    if (!subject) {
      subject = new Subject<unknown>();
      subjects.set(name, subject);
    }
    return subject.asObservable();
  });
  return {
    connectionState,
    on: onFn,
    emit<T>(name: string, payload: T): void {
      subjects.get(name)?.next(payload);
    },
    joinProjectGroup: vi.fn().mockResolvedValue(undefined),
    leaveProjectGroup: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    _subjects: subjects
  };
}

const BASE_URL = `${environment.apiUrl}/project`;
const PROJECT_ID = 'proj-1';

const MOCK_USER: UserProfileDto = { id: 'u-self', name: 'Self', email: 'self@example.com' };

function makeMember(partial?: Partial<MemberSummary>): MemberSummary {
  return {
    userId: 'u-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Member',
    joinedAt: '2026-04-29T14:12:00Z',
    ...partial
  };
}

function makeProject(partial?: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: PROJECT_ID,
    name: 'Alpha',
    description: null,
    role: 'Owner',
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
    ...partial
  };
}

describe('MembersStateService', () => {
  let service: MembersStateService;
  let httpMock: HttpTestingController;
  let currentUserSig: WritableSignal<UserProfileDto | null>;
  let projectsSig: WritableSignal<ProjectSummary[]>;
  let signalRMock: MockSignalRService;

  beforeEach(() => {
    currentUserSig = signal<UserProfileDto | null>(MOCK_USER);
    projectsSig = signal<ProjectSummary[]>([makeProject()]);
    signalRMock = createMockSignalRService('disconnected');

    TestBed.configureTestingModule({
      providers: [
        MembersStateService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            currentUser: currentUserSig,
            login: () => undefined,
            register: () => undefined,
            logout: () => currentUserSig.set(null)
          }
        },
        {
          provide: ProjectStateService,
          useValue: {
            projects: projectsSig,
            isLoading: signal(false),
            error: signal<string | null>(null),
            hasLoaded: signal(true),
            loadProjects: () => undefined
          }
        },
        { provide: SignalRService, useValue: signalRMock }
      ]
    });

    service = TestBed.inject(MembersStateService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.flushEffects();
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('selectForProject()', () => {
    it('returns INITIAL_PER_PROJECT_MEMBERS for an unknown project id', () => {
      const slice = service.selectForProject('unknown')();
      expect(slice.members).toEqual([]);
      expect(slice.hasLoaded).toBe(false);
      expect(slice.isLoading).toBe(false);
      expect(slice.error).toBeNull();
    });
  });

  describe('loadMembers()', () => {
    it('populates the slice on happy path', () => {
      const fixture = [makeMember({ userId: 'u-1' }), makeMember({ userId: 'u-2', name: 'Bob' })];
      service.loadMembers(PROJECT_ID);
      expect(service.selectForProject(PROJECT_ID)().isLoading).toBe(true);

      httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`).flush({
        success: true,
        message: null,
        errors: [],
        data: fixture
      } satisfies MembersListResponse);

      const slice = service.selectForProject(PROJECT_ID)();
      expect(slice.members).toEqual(fixture);
      expect(slice.isLoading).toBe(false);
      expect(slice.hasLoaded).toBe(true);
      expect(slice.error).toBeNull();
    });

    it('writes a user-readable error on HTTP failure and does not set hasLoaded', () => {
      service.loadMembers(PROJECT_ID);
      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush(
          { success: false, message: null, errors: [], data: null },
          { status: 500, statusText: 'Server Error' }
        );

      const slice = service.selectForProject(PROJECT_ID)();
      expect(slice.error).toBe('Something went wrong on our end. Please try again in a moment.');
      expect(slice.hasLoaded).toBe(false);
      expect(slice.isLoading).toBe(false);
    });

    it('de-duplicates concurrent calls for the same project id', () => {
      service.loadMembers(PROJECT_ID);
      service.loadMembers(PROJECT_ID);

      const req = httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: [makeMember()]
      } satisfies MembersListResponse);

      expect(service.selectForProject(PROJECT_ID)().members).toHaveLength(1);
    });

    it('is a no-op on second call when slice is already loaded (unless forceRefresh)', () => {
      service.loadMembers(PROJECT_ID);
      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush({ success: true, message: null, errors: [], data: [makeMember()] } satisfies MembersListResponse);

      // Second call with no forceRefresh -> no new HTTP request.
      service.loadMembers(PROJECT_ID);
      httpMock.expectNone(`${BASE_URL}/${PROJECT_ID}/members`);

      // forceRefresh triggers a fresh request.
      service.loadMembers(PROJECT_ID, true);
      const req = httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`);
      req.flush({ success: true, message: null, errors: [], data: [] } satisfies MembersListResponse);
      expect(service.selectForProject(PROJECT_ID)().members).toEqual([]);
    });
  });

  describe('addMemberByEmail()', () => {
    beforeEach(() => {
      service.loadMembers(PROJECT_ID);
      httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeMember({ userId: 'u-existing', name: 'Existing' })]
      } satisfies MembersListResponse);
    });

    it('appends the new member on success', () => {
      const added = makeMember({ userId: 'u-new', name: 'New' });
      let emitted: MemberSummary | undefined;
      service.addMemberByEmail(PROJECT_ID, 'new@example.com').subscribe(m => (emitted = m));

      const req = httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'new@example.com' });
      req.flush({ success: true, message: null, errors: [], data: added } satisfies AddMemberResponse);

      expect(emitted).toEqual(added);
      const slice = service.selectForProject(PROJECT_ID)();
      expect(slice.members.map(m => m.userId)).toEqual(['u-existing', 'u-new']);
    });

    it('does not mutate the cache and delivers a user-readable error on 400', () => {
      let caught: unknown;
      service.addMemberByEmail(PROJECT_ID, 'nobody@example.com').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`).flush(
        { errors: ['User not found.'], message: null },
        { status: 400, statusText: 'Bad Request' }
      );

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe("We couldn't find a user with that email.");
      expect(service.selectForProject(PROJECT_ID)().members.map(m => m.userId)).toEqual(['u-existing']);
    });

    it('surfaces the 403 owner-only message', () => {
      let caught: unknown;
      service.addMemberByEmail(PROJECT_ID, 'x@y.com').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush({ errors: [], message: null }, { status: 403, statusText: 'Forbidden' });

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('Only the project owner can add members.');
    });

    it('synchronously errors on empty email (guardrail)', () => {
      let caught: unknown;
      service.addMemberByEmail(PROJECT_ID, '   ').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('Please enter an email.');
    });
  });

  describe('removeMember()', () => {
    beforeEach(() => {
      service.loadMembers(PROJECT_ID);
      httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeMember({ userId: 'u-1' }), makeMember({ userId: 'u-2', name: 'Bob' })]
      } satisfies MembersListResponse);
    });

    it('removes the row on 204', () => {
      let completed = false;
      service.removeMember(PROJECT_ID, 'u-1').subscribe({ complete: () => (completed = true) });

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members/u-1`)
        .flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
      expect(service.selectForProject(PROJECT_ID)().members.map(m => m.userId)).toEqual(['u-2']);
    });

    it('tolerates 404 (concurrent remove) and still removes locally', () => {
      let completed = false;
      service.removeMember(PROJECT_ID, 'u-1').subscribe({ complete: () => (completed = true) });

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members/u-1`)
        .flush(null, { status: 404, statusText: 'Not Found' });

      expect(completed).toBe(true);
      expect(service.selectForProject(PROJECT_ID)().members.map(m => m.userId)).toEqual(['u-2']);
    });

    it('keeps the row and errors with last-owner copy on 400', () => {
      let caught: unknown;
      service.removeMember(PROJECT_ID, 'u-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members/u-1`)
        .flush(
          { errors: ['Cannot remove the last owner from the project.'], message: null },
          { status: 400, statusText: 'Bad Request' }
        );

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe("You can't remove the last owner of a project.");
      expect(service.selectForProject(PROJECT_ID)().members.map(m => m.userId)).toEqual(['u-1', 'u-2']);
    });

    it('keeps the row and errors with owner-only copy on 403', () => {
      let caught: unknown;
      service.removeMember(PROJECT_ID, 'u-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });
      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members/u-1`)
        .flush({ errors: [], message: null }, { status: 403, statusText: 'Forbidden' });
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('Only the project owner can remove members.');
      expect(service.selectForProject(PROJECT_ID)().members.map(m => m.userId)).toEqual(['u-1', 'u-2']);
    });
  });

  describe('logout reset', () => {
    it('clears byProjectId when currentUser flips to null after a load', () => {
      service.loadMembers(PROJECT_ID);
      httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeMember()]
      } satisfies MembersListResponse);

      expect(service.selectForProject(PROJECT_ID)().members).toHaveLength(1);

      currentUserSig.set(null);
      TestBed.flushEffects();

      expect(service.selectForProject(PROJECT_ID)().members).toEqual([]);
      expect(service.selectForProject(PROJECT_ID)().hasLoaded).toBe(false);
    });
  });

  describe('project-prune effect', () => {
    it('drops slices for projects that disappear from the project list', () => {
      service.loadMembers(PROJECT_ID);
      httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeMember()]
      } satisfies MembersListResponse);

      expect(service.selectForProject(PROJECT_ID)().hasLoaded).toBe(true);

      // Remove the project from the project list.
      projectsSig.set([]);
      TestBed.flushEffects();

      expect(service.selectForProject(PROJECT_ID)().members).toEqual([]);
      expect(service.selectForProject(PROJECT_ID)().hasLoaded).toBe(false);
    });
  });

  describe('real-time events', () => {
    /** Seeds a slice and transitions the mock connection to 'connected'. */
    function seedSliceAndConnect(members: MemberSummary[]): void {
      service.loadMembers(PROJECT_ID);
      httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`).flush({
        success: true,
        message: null,
        errors: [],
        data: members
      } satisfies MembersListResponse);
      signalRMock.connectionState.set('connected');
      TestBed.flushEffects();
    }

    describe('MemberRemoved', () => {
      it('removes the user from the matching slice on event arrival', () => {
        seedSliceAndConnect([
          makeMember({ userId: 'u-1' }),
          makeMember({ userId: 'u-2', name: 'Bob' })
        ]);

        signalRMock.emit<MemberRemovedEvent>(REALTIME_EVENT.MemberRemoved, {
          projectId: PROJECT_ID,
          userId: 'u-1'
        });

        expect(
          service.selectForProject(PROJECT_ID)().members.map(m => m.userId)
        ).toEqual(['u-2']);
      });

      it('is a silent no-op when the slice is missing', () => {
        // Transition to connected WITHOUT loading the slice first.
        signalRMock.connectionState.set('connected');
        TestBed.flushEffects();

        signalRMock.emit<MemberRemovedEvent>(REALTIME_EVENT.MemberRemoved, {
          projectId: 'p-unknown',
          userId: 'u-x'
        });

        // No slice was created.
        expect(service.selectForProject('p-unknown')().hasLoaded).toBe(false);
      });

      it('is a silent no-op when the user is not in the slice', () => {
        seedSliceAndConnect([makeMember({ userId: 'u-1' })]);

        signalRMock.emit<MemberRemovedEvent>(REALTIME_EVENT.MemberRemoved, {
          projectId: PROJECT_ID,
          userId: 'u-missing'
        });

        expect(
          service.selectForProject(PROJECT_ID)().members.map(m => m.userId)
        ).toEqual(['u-1']);
      });
    });

    describe('MemberAdded', () => {
      it('appends when context is set to the matching project', () => {
        seedSliceAndConnect([makeMember({ userId: 'u-1' })]);
        service.setCurrentProjectContext(PROJECT_ID);

        const added: MemberAddedEvent = {
          userId: 'u-new',
          name: 'New',
          email: 'new@example.com',
          role: 'Member',
          joinedAt: '2026-04-30T00:00:00Z'
        };
        signalRMock.emit(REALTIME_EVENT.MemberAdded, added);

        expect(
          service.selectForProject(PROJECT_ID)().members.map(m => m.userId)
        ).toEqual(['u-1', 'u-new']);
      });

      it('drops the event when no context is set', () => {
        seedSliceAndConnect([makeMember({ userId: 'u-1' })]);
        // Intentionally do NOT set context.

        signalRMock.emit<MemberAddedEvent>(REALTIME_EVENT.MemberAdded, {
          userId: 'u-new',
          name: 'New',
          email: 'new@example.com',
          role: 'Member',
          joinedAt: '2026-04-30T00:00:00Z'
        });

        expect(
          service.selectForProject(PROJECT_ID)().members.map(m => m.userId)
        ).toEqual(['u-1']);
      });

      it('dedupes a MemberAdded event that mirrors a locally-added row', () => {
        seedSliceAndConnect([
          makeMember({ userId: 'u-1' }),
          makeMember({ userId: 'u-just-added', name: 'Just Added' })
        ]);
        service.setCurrentProjectContext(PROJECT_ID);

        signalRMock.emit<MemberAddedEvent>(REALTIME_EVENT.MemberAdded, {
          userId: 'u-just-added',
          name: 'Just Added',
          email: 'j@example.com',
          role: 'Member',
          joinedAt: '2026-04-30T00:00:00Z'
        });

        expect(
          service.selectForProject(PROJECT_ID)().members.map(m => m.userId)
        ).toEqual(['u-1', 'u-just-added']);
      });

      it('setCurrentProjectContext / clearCurrentProjectContext flip currentProjectContext', () => {
        expect(service.currentProjectContext()).toBeNull();
        service.setCurrentProjectContext(PROJECT_ID);
        expect(service.currentProjectContext()).toBe(PROJECT_ID);
        service.clearCurrentProjectContext();
        expect(service.currentProjectContext()).toBeNull();
      });
    });

    describe('Subscription teardown on disconnect (AC12 defense in depth)', () => {
      it('stops reconciling MemberRemoved after connectionState leaves connected', () => {
        seedSliceAndConnect([
          makeMember({ userId: 'u-1' }),
          makeMember({ userId: 'u-2', name: 'Bob' })
        ]);
        // Baseline: removal is reconciled while connected.
        signalRMock.emit<MemberRemovedEvent>(REALTIME_EVENT.MemberRemoved, {
          projectId: PROJECT_ID,
          userId: 'u-1'
        });
        expect(
          service.selectForProject(PROJECT_ID)().members.map(m => m.userId)
        ).toEqual(['u-2']);

        // Disconnect: the effect should tear down subscribers.
        signalRMock.connectionState.set('disconnected');
        TestBed.flushEffects();

        // Emit on the stale Subject — if teardown worked, the handler is
        // gone and state is untouched.
        signalRMock.emit<MemberRemovedEvent>(REALTIME_EVENT.MemberRemoved, {
          projectId: PROJECT_ID,
          userId: 'u-2'
        });
        expect(
          service.selectForProject(PROJECT_ID)().members.map(m => m.userId)
        ).toEqual(['u-2']);
      });
    });

    describe('Console hygiene', () => {
      it('never logs payload fields in handler execution', () => {
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        seedSliceAndConnect([makeMember({ userId: 'secret-user-id' })]);
        service.setCurrentProjectContext(PROJECT_ID);

        signalRMock.emit<MemberAddedEvent>(REALTIME_EVENT.MemberAdded, {
          userId: 'another-secret-id',
          name: 'Name',
          email: 'private@example.com',
          role: 'Member',
          joinedAt: '2026-04-30T00:00:00Z'
        });
        signalRMock.emit<MemberRemovedEvent>(REALTIME_EVENT.MemberRemoved, {
          projectId: PROJECT_ID,
          userId: 'secret-user-id'
        });

        const allArgs = [
          ...consoleLogSpy.mock.calls.flat(),
          ...consoleErrorSpy.mock.calls.flat()
        ];
        for (const arg of allArgs) {
          const asString = typeof arg === 'string' ? arg : JSON.stringify(arg);
          expect(asString).not.toContain('secret-user-id');
          expect(asString).not.toContain('another-secret-id');
          expect(asString).not.toContain('private@example.com');
        }

        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      });
    });
  });
});
