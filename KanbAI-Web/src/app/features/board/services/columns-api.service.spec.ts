import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ColumnsApiService, mapColumnErrorToUserMessage } from './columns-api.service';
import {
  ColumnResponseDto,
  ColumnsListResponse
} from '../models/column.model';
import { environment } from '../../../../environments/environment';

describe('ColumnsApiService', () => {
  let service: ColumnsApiService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/column`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ColumnsApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ColumnsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getColumnsForProject()', () => {
    it('issues a GET to /column/project/{projectId} with the projectId URL-encoded', () => {
      const projectId = 'project id with space';
      service.getColumnsForProject(projectId).subscribe();

      const expectedUrl = `${baseUrl}/project/${encodeURIComponent(projectId)}`;
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('GET');
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: []
      } satisfies ColumnsListResponse);
    });

    it('unwraps { success: true, data: [...] } to the column array', () => {
      const fixture: ColumnResponseDto[] = [
        {
          id: 'col-1',
          name: 'To Do',
          colorCode: null,
          columnOrder: 1,
          projectId: 'p-1',
          createdAt: '2026-05-04T00:00:00Z',
          updatedAt: '2026-05-04T00:00:00Z'
        }
      ];

      let emitted: ColumnResponseDto[] | undefined;
      service.getColumnsForProject('p-1').subscribe(cols => (emitted = cols));

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({ success: true, message: null, errors: [], data: fixture } satisfies ColumnsListResponse);

      expect(emitted).toEqual(fixture);
    });

    it('emits [] when data is null (defensive null-coalesce)', () => {
      let emitted: ColumnResponseDto[] | undefined;
      service.getColumnsForProject('p-1').subscribe(cols => (emitted = cols));

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({ success: true, message: null, errors: [], data: null } satisfies ColumnsListResponse);

      expect(emitted).toEqual([]);
    });

    it('projects envelope { success: false } into an observable error', () => {
      let caught: unknown;
      service.getColumnsForProject('p-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({ success: false, message: 'boom', errors: ['bad'], data: null } satisfies ColumnsListResponse);

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('bad');
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service.getColumnsForProject('p-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush(
          { success: false, message: null, errors: [], data: null },
          { status: 500, statusText: 'Server Error' }
        );

      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('mapColumnErrorToUserMessage()', () => {
    const make = (status: number) =>
      new HttpErrorResponse({ status, statusText: 'x', url: '/api/column/project/p-1' });

    it('maps status 0 (network) to the network message', () => {
      expect(mapColumnErrorToUserMessage(make(0), 'list')).toBe(
        "We couldn't reach the server. Please check your connection and try again."
      );
    });

    it('maps 401 to the session-expired message', () => {
      expect(mapColumnErrorToUserMessage(make(401), 'list')).toBe(
        'Your session has expired. Please sign in again.'
      );
    });

    it('maps 403 to the session-expired message', () => {
      expect(mapColumnErrorToUserMessage(make(403), 'list')).toBe(
        'Your session has expired. Please sign in again.'
      );
    });

    it('maps 404 to the project-missing message', () => {
      expect(mapColumnErrorToUserMessage(make(404), 'list')).toBe(
        'This project no longer exists.'
      );
    });

    it('maps 5xx to the server-error message', () => {
      expect(mapColumnErrorToUserMessage(make(500), 'list')).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
      expect(mapColumnErrorToUserMessage(make(503), 'list')).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
    });

    it('maps other 4xx to the generic-load message', () => {
      expect(mapColumnErrorToUserMessage(make(400), 'list')).toBe(
        "We couldn't load this board. Please try again."
      );
      expect(mapColumnErrorToUserMessage(make(418), 'list')).toBe(
        "We couldn't load this board. Please try again."
      );
    });

    it('maps plain Error (envelope failure) to the generic-load message', () => {
      expect(mapColumnErrorToUserMessage(new Error('envelope failure'), 'list')).toBe(
        "We couldn't load this board. Please try again."
      );
    });

    it('maps unknown non-Error values to the generic-load message', () => {
      expect(mapColumnErrorToUserMessage('whatever', 'list')).toBe(
        "We couldn't load this board. Please try again."
      );
    });
  });
});
