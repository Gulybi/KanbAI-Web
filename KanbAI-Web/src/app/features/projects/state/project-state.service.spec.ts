import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';

import { ProjectStateService } from './project-state.service';
import { AuthService } from '../../../core/services/AuthService';
import { UserProfileDto } from '../../../core/models/auth.models';
import { ProjectSummary, ApiResponse } from '../models/project.model';
import { environment } from '../../../../environments/environment';

const LIST_URL = `${environment.apiUrl}/project`;

const MOCK_USER: UserProfileDto = {
  id: 'u-1',
  name: 'Alice',
  email: 'alice@example.com'
};

function makeProjectSummary(partial?: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 'p-1',
    name: 'Alpha',
    description: null,
    role: 'Owner',
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
    ...partial
  };
}

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let httpMock: HttpTestingController;
  let currentUserSig: WritableSignal<UserProfileDto | null>;

  beforeEach(() => {
    currentUserSig = signal<UserProfileDto | null>(MOCK_USER);

    TestBed.configureTestingModule({
      providers: [
        ProjectStateService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            currentUser: currentUserSig,
            login: () => {
              /* stubbed */
            },
            register: () => {
              /* stubbed */
            },
            logout: () => {
              currentUserSig.set(null);
            }
          }
        }
      ]
    });

    service = TestBed.inject(ProjectStateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('Initial state', () => {
    it('exposes projects() === [] and hasLoaded() === false before any fetch', () => {
      expect(service.projects()).toEqual([]);
      expect(service.hasLoaded()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
    });
  });

  describe('loadProjects()', () => {
    it('populates the cache on happy path and clears error', () => {
      const fixture = [makeProjectSummary({ id: 'p-1', name: 'Alpha' })];

      service.loadProjects();
      expect(service.isLoading()).toBe(true);
      expect(service.error()).toBeNull();

      const req = httpMock.expectOne(LIST_URL);
      expect(req.request.method).toBe('GET');
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: fixture
      } satisfies ApiResponse<ProjectSummary[]>);

      expect(service.projects()).toEqual(fixture);
      expect(service.isLoading()).toBe(false);
      expect(service.hasLoaded()).toBe(true);
      expect(service.error()).toBeNull();
    });

    it('leaves the cache untouched on HTTP failure and sets a user-readable error', () => {
      service.loadProjects();
      const req = httpMock.expectOne(LIST_URL);
      req.flush(
        { success: false, message: null, errors: [], data: null },
        { status: 500, statusText: 'Server Error' }
      );

      expect(service.projects()).toEqual([]);
      expect(service.isLoading()).toBe(false);
      expect(service.hasLoaded()).toBe(false);
      expect(service.error()).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
    });

    it('writes hasLoaded=true on empty-array success', () => {
      // Regression guard for issue #57: a freshly-signed-up user with zero
      // projects must reach the dashboard's empty-state branch, which
      // requires hasLoaded() === true AND projects() === [].
      service.loadProjects();
      expect(service.isLoading()).toBe(true);

      const req = httpMock.expectOne(LIST_URL);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: []
      } satisfies ApiResponse<ProjectSummary[]>);

      expect(service.projects()).toEqual([]);
      expect(service.isLoading()).toBe(false);
      expect(service.hasLoaded()).toBe(true);
      expect(service.error()).toBeNull();
    });

    it('writes hasLoaded=true on empty-array success even when currentUser is null at response time', () => {
      // Explicit regression guard for the removed short-circuit: previously,
      // if currentUser() was null when the response landed, the next
      // callback early-returned and left hasLoaded=false forever. Now the
      // only cancellation path is reset() via unsubscribe() — so a response
      // that actually fires must always populate the cache.
      service.loadProjects();
      const req = httpMock.expectOne(LIST_URL);

      // Null currentUser WITHOUT triggering effects/reset. This simulates
      // the "authenticated shell boots without hydrating currentUser"
      // scenario described in the tech spec's root-cause diagnosis.
      currentUserSig.set(null);
      // Note: we deliberately do NOT call TestBed.flushEffects() here,
      // because doing so would invoke reset() and unsubscribe the request.
      // The scenario we're guarding against is currentUser being null
      // without a logout having occurred.

      req.flush({
        success: true,
        message: null,
        errors: [],
        data: []
      } satisfies ApiResponse<ProjectSummary[]>);

      expect(service.projects()).toEqual([]);
      expect(service.hasLoaded()).toBe(true);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('de-duplicates two synchronous calls into a single HTTP request', () => {
      service.loadProjects();
      service.loadProjects();

      // Exactly one request — the second call was a no-op while the first
      // subscription was still in flight.
      const req = httpMock.expectOne(LIST_URL);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary()]
      } satisfies ApiResponse<ProjectSummary[]>);

      expect(service.projects()).toHaveLength(1);
    });
  });

  describe('createProject()', () => {
    it('prepends the new project to the cache on success', () => {
      // Seed the cache with one existing project.
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-old', name: 'Old' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      let emitted: ProjectSummary | undefined;
      const newProject = makeProjectSummary({ id: 'p-new', name: 'New' });

      service
        .createProject({ name: 'New', description: null })
        .subscribe(p => (emitted = p));

      const req = httpMock.expectOne(LIST_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'New', description: null });
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: newProject
      } satisfies ApiResponse<ProjectSummary>);

      expect(emitted).toEqual(newProject);
      expect(service.projects().map(p => p.id)).toEqual(['p-new', 'p-old']);
    });

    it('does not mutate the cache and delivers a user-readable error on HTTP failure', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-old' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      let caught: unknown;
      service.createProject({ name: 'x', description: null }).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock.expectOne(LIST_URL).flush(
        { success: false, message: null, errors: ['name required'], data: null },
        { status: 400, statusText: 'Bad Request' }
      );

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        "We couldn't save your project. Please check the details and try again."
      );
      expect(service.projects().map(p => p.id)).toEqual(['p-old']);
    });

    it('rejects a DTO that fails the id/name guard', () => {
      let caught: unknown;
      service.createProject({ name: 'x', description: null }).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      // Envelope claims success but `data` lacks a valid id. The API service
      // itself would treat null data as failure, so here we send a payload
      // with an empty id to exercise the state-service guard.
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: { id: '', name: 'x', description: null, role: 'Owner', createdAt: '', updatedAt: '' }
      } satisfies ApiResponse<ProjectSummary>);

      expect(caught).toBeInstanceOf(Error);
      expect(service.projects()).toEqual([]);
    });

    it('rejects a DTO that is missing the id property entirely', () => {
      let caught: unknown;
      service.createProject({ name: 'x', description: null }).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      // Backend unexpectedly returns a summary without an `id` field.
      // The state-service guard requires `typeof id === 'string'`, so this
      // shape must be rejected.
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: { name: 'x', description: null, role: 'Owner', createdAt: '', updatedAt: '' }
      } as unknown as ApiResponse<ProjectSummary>);

      expect(caught).toBeInstanceOf(Error);
      expect(service.projects()).toEqual([]);
    });

    it('rejects a DTO where id is not a string (number)', () => {
      let caught: unknown;
      service.createProject({ name: 'x', description: null }).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: { id: 42, name: 'x', description: null, role: 'Owner', createdAt: '', updatedAt: '' }
      } as unknown as ApiResponse<ProjectSummary>);

      expect(caught).toBeInstanceOf(Error);
      expect(service.projects()).toEqual([]);
    });

    it('does not write to the list-scope error signal on mutation failure (design spec Flow B)', () => {
      // Seed the cache so we can also assert it stays at its last-known-good value.
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-old' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      expect(service.error()).toBeNull();

      service.createProject({ name: 'x', description: null }).subscribe({
        next: () => {
          /* unreachable */
        },
        error: () => {
          /* caller-scope only */
        }
      });

      httpMock.expectOne(LIST_URL).flush(
        { success: false, message: null, errors: [], data: null },
        { status: 400, statusText: 'Bad Request' }
      );

      // Design spec Flow B step 9: mutation errors are delivered inline to
      // the caller and the page-level `error` signal MUST NOT activate.
      expect(service.error()).toBeNull();
      // And the cache stays at its last-known-good state.
      expect(service.projects().map(p => p.id)).toEqual(['p-old']);
    });
  });

  describe('updateProject()', () => {
    it('replaces the matching entry in place and preserves order on success', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [
          makeProjectSummary({ id: 'p-1', name: 'One' }),
          makeProjectSummary({ id: 'p-2', name: 'Two' }),
          makeProjectSummary({ id: 'p-3', name: 'Three' })
        ]
      } satisfies ApiResponse<ProjectSummary[]>);

      const updated = makeProjectSummary({ id: 'p-2', name: 'Two (renamed)' });
      service
        .updateProject('p-2', { name: 'Two (renamed)', description: null })
        .subscribe();

      const req = httpMock.expectOne(`${LIST_URL}/p-2`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ name: 'Two (renamed)', description: null });
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: updated
      } satisfies ApiResponse<ProjectSummary>);

      const ids = service.projects().map(p => p.id);
      expect(ids).toEqual(['p-1', 'p-2', 'p-3']);
      expect(service.projects()[1]).toEqual(updated);
    });

    it('appends the returned DTO when the id is not in the cache (defensive)', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-1', name: 'One' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      const unknown = makeProjectSummary({ id: 'p-missing', name: 'Mystery' });
      service
        .updateProject('p-missing', { name: 'Mystery', description: null })
        .subscribe();

      httpMock.expectOne(`${LIST_URL}/p-missing`).flush({
        success: true,
        message: null,
        errors: [],
        data: unknown
      } satisfies ApiResponse<ProjectSummary>);

      const ids = service.projects().map(p => p.id);
      expect(ids).toEqual(['p-1', 'p-missing']);
    });

    it('does not mutate the cache and delivers a user-readable error on HTTP failure', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-1' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      let caught: unknown;
      service
        .updateProject('p-1', { name: 'x', description: null })
        .subscribe({
          next: () => {
            /* unreachable */
          },
          error: err => (caught = err)
        });

      httpMock.expectOne(`${LIST_URL}/p-1`).flush(
        { success: false, message: null, errors: [], data: null },
        { status: 404, statusText: 'Not Found' }
      );

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        "We couldn't find that project — it may have been deleted."
      );
      expect(service.projects().map(p => p.id)).toEqual(['p-1']);
    });
  });

  describe('deleteProject()', () => {
    it('removes the matching project on 204 success', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [
          makeProjectSummary({ id: 'p-1' }),
          makeProjectSummary({ id: 'p-2' })
        ]
      } satisfies ApiResponse<ProjectSummary[]>);

      let completed = false;
      service.deleteProject('p-1').subscribe({ complete: () => (completed = true) });

      const req = httpMock.expectOne(`${LIST_URL}/p-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
      expect(service.projects().map(p => p.id)).toEqual(['p-2']);
    });

    it('tolerates deletion of an id that is already absent from the cache', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-1' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      service.deleteProject('p-missing').subscribe();
      httpMock
        .expectOne(`${LIST_URL}/p-missing`)
        .flush(null, { status: 204, statusText: 'No Content' });

      // Cache unchanged — still holds p-1.
      expect(service.projects().map(p => p.id)).toEqual(['p-1']);
    });

    it('produces the not-found message on a 404 delete failure', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-1' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      let caught: unknown;
      service.deleteProject('p-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${LIST_URL}/p-1`)
        .flush(null, { status: 404, statusText: 'Not Found' });

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        "We couldn't find that project — it may have been deleted."
      );
      // Cache untouched — delete failed.
      expect(service.projects().map(p => p.id)).toEqual(['p-1']);
    });

    it('produces the owner-only message on a 403 delete failure', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-1' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      let caught: unknown;
      service.deleteProject('p-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${LIST_URL}/p-1`)
        .flush(null, { status: 403, statusText: 'Forbidden' });

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        'Only the project owner can delete this project.'
      );
      expect(service.projects().map(p => p.id)).toEqual(['p-1']);
    });
  });

  describe('Logout reset (effect on AuthService.currentUser)', () => {
    it('clears the cache when currentUser flips to null after a successful load', () => {
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-1' })]
      } satisfies ApiResponse<ProjectSummary[]>);

      // Sanity: cache populated + hasLoaded true.
      expect(service.projects()).toHaveLength(1);
      expect(service.hasLoaded()).toBe(true);

      // Simulate logout.
      currentUserSig.set(null);
      TestBed.flushEffects();

      expect(service.projects()).toEqual([]);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
      expect(service.hasLoaded()).toBe(false);
    });

    it('does not repopulate the cache if a list response arrives after logout', () => {
      // First, perform a successful load so hasLoaded=true. The logout-reset
      // effect only fires when hasLoaded is true (it guards against a
      // spurious reset on the initial unauthenticated boot).
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-existing' })]
      } satisfies ApiResponse<ProjectSummary[]>);
      expect(service.hasLoaded()).toBe(true);

      // Start a refresh; the second request is now in flight.
      service.loadProjects();
      const req = httpMock.expectOne(LIST_URL);

      // Simulate logout while the refresh is still in flight. The effect()
      // observes currentUser flipping to null AND hasLoaded=true, so it
      // invokes reset() which unsubscribes the in-flight subscription and
      // replaces state with INITIAL_PROJECT_STATE.
      currentUserSig.set(null);
      TestBed.flushEffects();

      // The TestRequest is now cancelled (Angular's HttpTestingController
      // throws if we try to flush a cancelled request, which is itself
      // evidence that unsubscribe() propagated correctly).
      expect(req.cancelled).toBe(true);

      expect(service.projects()).toEqual([]);
      expect(service.hasLoaded()).toBe(false);
    });

    it('logout mid-fetch prevents cache repopulation (regression guard for the reset() path)', () => {
      // Belt-and-suspenders version of the above test: the reset() path via
      // unsubscribe() is the sole mechanism protecting against a stale
      // response landing after logout. If that mechanism ever regresses,
      // this assertion will catch it.
      service.loadProjects();
      httpMock.expectOne(LIST_URL).flush({
        success: true,
        message: null,
        errors: [],
        data: [makeProjectSummary({ id: 'p-existing' })]
      } satisfies ApiResponse<ProjectSummary[]>);
      expect(service.hasLoaded()).toBe(true);

      // Trigger a refresh so another subscription is in flight.
      service.loadProjects();
      const req = httpMock.expectOne(LIST_URL);

      // Logout: currentUser flips to null, the effect() observes it (with
      // hasLoaded still true) and invokes reset() which unsubscribes the
      // in-flight subscription and replaces state with INITIAL_PROJECT_STATE.
      currentUserSig.set(null);
      TestBed.flushEffects();

      // unsubscribe() propagated correctly: the underlying TestRequest is
      // cancelled. Angular's HttpTestingController considers this the
      // authoritative signal that `next` cannot fire.
      expect(req.cancelled).toBe(true);

      expect(service.projects()).toEqual([]);
      expect(service.hasLoaded()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });

    it('does not fire a reset on initial unauthenticated state', () => {
      // Fresh TestBed with currentUser=null from the start.
      TestBed.resetTestingModule();
      const unauthSig = signal<UserProfileDto | null>(null);

      TestBed.configureTestingModule({
        providers: [
          ProjectStateService,
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: AuthService,
            useValue: {
              currentUser: unauthSig,
              login: () => undefined,
              register: () => undefined,
              logout: () => unauthSig.set(null)
            }
          }
        ]
      });

      const freshService = TestBed.inject(ProjectStateService);
      TestBed.flushEffects();

      // hasLoaded stays false, cache stays empty — no spurious fetch.
      expect(freshService.projects()).toEqual([]);
      expect(freshService.hasLoaded()).toBe(false);
      expect(freshService.error()).toBeNull();

      // No HTTP request was issued.
      const http = TestBed.inject(HttpTestingController);
      http.expectNone(LIST_URL);
    });
  });
});
