import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ColumnsApiService, mapColumnErrorToUserMessage } from './columns-api.service';
import {
  ColumnCreateResponse,
  ColumnResponseDto,
  ColumnsListResponse,
  CreateColumnDto
} from '../models/column.model';
import { environment } from '../../../../environments/environment';

function makeColumn(partial?: Partial<ColumnResponseDto>): ColumnResponseDto {
  return {
    id: 'col-1',
    name: 'To Do',
    colorCode: null,
    columnOrder: 0,
    projectId: 'p-1',
    createdAt: '2026-05-07T00:00:00Z',
    updatedAt: '2026-05-07T00:00:00Z',
    ...partial
  };
}

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

  describe('createColumn()', () => {
    it('POSTs to /column/project/{projectId} with the DTO as body', () => {
      const projectId = 'p-1';
      const dto: CreateColumnDto = { name: 'To Do', columnOrder: 0 };

      service.createColumn(projectId, dto).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/project/p-1`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(dto);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: makeColumn()
      } satisfies ColumnCreateResponse);
    });

    it('URL-encodes the projectId', () => {
      const projectId = 'project id with space';
      service.createColumn(projectId, { name: 'A' }).subscribe();

      const req = httpMock.expectOne(
        `${baseUrl}/project/${encodeURIComponent(projectId)}`
      );
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: makeColumn()
      } satisfies ColumnCreateResponse);
    });

    it('emits the unwrapped DTO on success', () => {
      const dto = makeColumn({ id: 'col-new' });

      let emitted: ColumnResponseDto | undefined;
      service
        .createColumn('p-1', { name: 'To Do' })
        .subscribe(v => (emitted = v));

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({
          success: true,
          message: null,
          errors: [],
          data: dto
        } satisfies ColumnCreateResponse);

      expect(emitted).toEqual(dto);
    });

    it('errors when envelope success is false', () => {
      let caught: unknown;
      service
        .createColumn('p-1', { name: 'A' })
        .subscribe({ next: () => {}, error: e => (caught = e) });

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({
          success: false,
          message: 'bad request',
          errors: ['name too long'],
          data: null
        } satisfies ColumnCreateResponse);

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('name too long');
    });

    it('errors when data is null even if success is true', () => {
      let caught: unknown;
      service
        .createColumn('p-1', { name: 'A' })
        .subscribe({ next: () => {}, error: e => (caught = e) });

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({
          success: true,
          message: null,
          errors: [],
          data: null
        } satisfies ColumnCreateResponse);

      expect(caught).toBeInstanceOf(Error);
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service
        .createColumn('p-1', { name: 'A' })
        .subscribe({ next: () => {}, error: e => (caught = e) });

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush(
          { success: false, message: null, errors: [], data: null },
          { status: 500, statusText: 'Server Error' }
        );

      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('mapColumnErrorToUserMessage() with operation="create"', () => {
    const make = (status: number) =>
      new HttpErrorResponse({ status, statusText: 'x', url: '/api/column/project/p-1' });

    it('maps status 0 (network) to the network message', () => {
      expect(mapColumnErrorToUserMessage(make(0), 'create')).toBe(
        "We couldn't reach the server. Please check your connection and try again."
      );
    });

    it('maps 401/403 to session-expired', () => {
      expect(mapColumnErrorToUserMessage(make(401), 'create')).toBe(
        'Your session has expired. Please sign in again.'
      );
      expect(mapColumnErrorToUserMessage(make(403), 'create')).toBe(
        'Your session has expired. Please sign in again.'
      );
    });

    it('maps 404 to the create-specific "project no longer exists" copy', () => {
      expect(mapColumnErrorToUserMessage(make(404), 'create')).toBe(
        "We couldn't add a column — this project no longer exists."
      );
    });

    it('maps 5xx to the server-error message', () => {
      expect(mapColumnErrorToUserMessage(make(500), 'create')).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
    });

    it('maps other 4xx to the create-specific generic copy', () => {
      expect(mapColumnErrorToUserMessage(make(400), 'create')).toBe(
        "We couldn't add a column. Please try again."
      );
      expect(mapColumnErrorToUserMessage(make(418), 'create')).toBe(
        "We couldn't add a column. Please try again."
      );
    });

    it('maps plain Error to the create-specific generic copy', () => {
      expect(
        mapColumnErrorToUserMessage(new Error('envelope failure'), 'create')
      ).toBe("We couldn't add a column. Please try again.");
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
