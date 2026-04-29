import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProjectsApiService, mapErrorToUserMessage } from './projects-api.service';
import { ApiResponse, ProjectSummary } from '../models/project.model';
import { environment } from '../../../../environments/environment';

describe('ProjectsApiService', () => {
  let service: ProjectsApiService;
  let httpMock: HttpTestingController;
  const url = `${environment.apiUrl}/project`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProjectsApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ProjectsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('listProjects()', () => {
    it('issues a GET to the singular /project endpoint', () => {
      service.listProjects().subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      expect(req.request.url.endsWith('/project')).toBe(true);
      expect(req.request.url.endsWith('/projects')).toBe(false);
      req.flush({ success: true, message: null, errors: [], data: [] } satisfies ApiResponse<ProjectSummary[]>);
    });

    it('unwraps { success: true, data: [...] } to the project array', () => {
      const fixture: ProjectSummary[] = [
        {
          id: 'p-1',
          name: 'Alpha',
          description: null,
          role: 'Owner',
          createdAt: '2026-04-10T00:00:00Z',
          updatedAt: '2026-04-10T00:00:00Z'
        }
      ];

      let emitted: ProjectSummary[] | undefined;
      service.listProjects().subscribe(projects => (emitted = projects));

      httpMock
        .expectOne(url)
        .flush({ success: true, message: null, errors: [], data: fixture } satisfies ApiResponse<ProjectSummary[]>);

      expect(emitted).toEqual(fixture);
    });

    it('emits [] when data is an empty array', () => {
      let emitted: ProjectSummary[] | undefined;
      service.listProjects().subscribe(projects => (emitted = projects));

      httpMock
        .expectOne(url)
        .flush({ success: true, message: null, errors: [], data: [] } satisfies ApiResponse<ProjectSummary[]>);

      expect(emitted).toEqual([]);
    });

    it('emits [] when data is null (defensive null-coalesce)', () => {
      let emitted: ProjectSummary[] | undefined;
      service.listProjects().subscribe(projects => (emitted = projects));

      httpMock
        .expectOne(url)
        .flush({ success: true, message: null, errors: [], data: null } satisfies ApiResponse<ProjectSummary[]>);

      expect(emitted).toEqual([]);
    });

    it('projects envelope { success: false } into an observable error', () => {
      let caught: unknown;
      service.listProjects().subscribe({
        next: () => { /* unreachable */ },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(url)
        .flush({ success: false, message: 'boom', errors: ['bad'], data: null } satisfies ApiResponse<ProjectSummary[]>);

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('bad');
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service.listProjects().subscribe({
        next: () => { /* unreachable */ },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(url)
        .flush({ success: false, message: null, errors: [], data: null }, { status: 500, statusText: 'Server Error' });

      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('mapErrorToUserMessage()', () => {
    const make = (status: number) =>
      new HttpErrorResponse({ status, statusText: 'x', url: '/api/project' });

    it('maps status 0 (network/CORS) to the network message', () => {
      expect(mapErrorToUserMessage(make(0)))
        .toBe("We couldn't reach the server. Please check your connection and try again.");
    });

    it('maps 401 to the session-expired message', () => {
      expect(mapErrorToUserMessage(make(401)))
        .toBe('Your session has expired. Please sign in again.');
    });

    it('maps 403 to the session-expired message', () => {
      expect(mapErrorToUserMessage(make(403)))
        .toBe('Your session has expired. Please sign in again.');
    });

    it('maps 5xx to the server-error message', () => {
      expect(mapErrorToUserMessage(make(500)))
        .toBe('Something went wrong on our end. Please try again in a moment.');
      expect(mapErrorToUserMessage(make(503)))
        .toBe('Something went wrong on our end. Please try again in a moment.');
    });

    it('maps generic 4xx to the generic-load message', () => {
      expect(mapErrorToUserMessage(make(400)))
        .toBe("We couldn't load your projects. Please try again.");
      expect(mapErrorToUserMessage(make(404)))
        .toBe("We couldn't load your projects. Please try again.");
    });

    it('maps plain Error (envelope failure) to the generic-load message', () => {
      expect(mapErrorToUserMessage(new Error('envelope failure')))
        .toBe("We couldn't load your projects. Please try again.");
    });

    it('maps unknown non-Error values to the generic-load message', () => {
      expect(mapErrorToUserMessage('whatever'))
        .toBe("We couldn't load your projects. Please try again.");
    });
  });
});
