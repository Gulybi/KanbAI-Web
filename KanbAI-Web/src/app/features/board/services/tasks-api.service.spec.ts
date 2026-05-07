import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  TasksApiService,
  mapTaskCreateErrorToUserMessage,
  mapTaskMoveErrorToUserMessage
} from './tasks-api.service';
import {
  CreateTaskDto,
  MoveTaskDto,
  TaskCreateResponse,
  TaskMoveResponse,
  TaskResponseDto
} from '../models/task.model';
import { environment } from '../../../../environments/environment';

describe('TasksApiService', () => {
  let service: TasksApiService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/task`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TasksApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(TasksApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('moveTask()', () => {
    const task: TaskResponseDto = {
      id: 't-1',
      title: 'Design login page',
      content: null,
      taskOrder: 0,
      columnId: 'col-b',
      assignedId: null,
      createdAt: '2026-05-04T00:00:00Z',
      updatedAt: '2026-05-04T00:00:00Z'
    };
    const dto: MoveTaskDto = { columnId: 'col-b', taskOrder: 0 };

    it('issues a PUT to /task/{taskId}/move with the taskId URL-encoded and dto as body', () => {
      const taskId = 'task id with space';
      service.moveTask(taskId, dto).subscribe();

      const expectedUrl = `${baseUrl}/${encodeURIComponent(taskId)}/move`;
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(dto);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: task
      } satisfies TaskMoveResponse);
    });

    it('unwraps { success: true, data: TaskResponseDto } on success', () => {
      let emitted: TaskResponseDto | undefined;
      service.moveTask('t-1', dto).subscribe(t => (emitted = t));

      httpMock
        .expectOne(`${baseUrl}/t-1/move`)
        .flush({ success: true, message: null, errors: [], data: task } satisfies TaskMoveResponse);

      expect(emitted).toEqual(task);
    });

    it('projects envelope { success: false } into an observable error', () => {
      let caught: unknown;
      service.moveTask('t-1', dto).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/t-1/move`)
        .flush({ success: false, message: 'nope', errors: ['bad'], data: null } satisfies TaskMoveResponse);

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('bad');
    });

    it('projects { success: true, data: null } into an observable error', () => {
      let caught: unknown;
      service.moveTask('t-1', dto).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/t-1/move`)
        .flush({ success: true, message: null, errors: [], data: null } satisfies TaskMoveResponse);

      expect(caught).toBeInstanceOf(Error);
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service.moveTask('t-1', dto).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/t-1/move`)
        .flush(
          { success: false, message: null, errors: [], data: null },
          { status: 500, statusText: 'Server Error' }
        );

      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('mapTaskMoveErrorToUserMessage()', () => {
    const make = (status: number) =>
      new HttpErrorResponse({ status, statusText: 'x', url: '/api/task/t-1/move' });

    it('maps status 0 (network) to the network message', () => {
      expect(mapTaskMoveErrorToUserMessage(make(0))).toBe(
        "We couldn't reach the server. The move was undone."
      );
    });

    it('maps 401 to the session-expired message', () => {
      expect(mapTaskMoveErrorToUserMessage(make(401))).toBe(
        'Your session has expired. Please sign in again.'
      );
    });

    it('maps 403 to the not-a-member message', () => {
      expect(mapTaskMoveErrorToUserMessage(make(403))).toBe(
        'You are no longer a member of this project and cannot move tasks.'
      );
    });

    it('maps 404 to the task-or-column-missing message', () => {
      expect(mapTaskMoveErrorToUserMessage(make(404))).toBe(
        'That task or column no longer exists.'
      );
    });

    it('maps 400 to the generic retry message', () => {
      expect(mapTaskMoveErrorToUserMessage(make(400))).toBe(
        "We couldn't move that task. Please try again."
      );
    });

    it('maps 5xx to the server-error + rollback message', () => {
      expect(mapTaskMoveErrorToUserMessage(make(500))).toBe(
        'Something went wrong on our end. The move was undone.'
      );
      expect(mapTaskMoveErrorToUserMessage(make(503))).toBe(
        'Something went wrong on our end. The move was undone.'
      );
    });

    it('maps other 4xx to the generic retry message', () => {
      expect(mapTaskMoveErrorToUserMessage(make(418))).toBe(
        "We couldn't move that task. Please try again."
      );
    });

    it('maps plain Error (envelope failure) to the generic retry message', () => {
      expect(mapTaskMoveErrorToUserMessage(new Error('envelope failure'))).toBe(
        "We couldn't move that task. Please try again."
      );
    });

    it('maps unknown non-Error values to the generic retry message', () => {
      expect(mapTaskMoveErrorToUserMessage('whatever')).toBe(
        "We couldn't move that task. Please try again."
      );
    });
  });

  describe('createTask()', () => {
    const task: TaskResponseDto = {
      id: 't-1',
      title: 'Wire up onboarding flow',
      content: null,
      taskOrder: 0,
      columnId: 'col-a',
      assignedId: null,
      createdAt: '2026-05-04T00:00:00Z',
      updatedAt: '2026-05-04T00:00:00Z'
    };
    const dto: CreateTaskDto = { title: 'Wire up onboarding flow' };

    it('issues a POST to /task/column/{columnId} with the columnId URL-encoded and dto as body', () => {
      const columnId = 'column id with space';
      service.createTask(columnId, dto).subscribe();

      const expectedUrl = `${baseUrl}/column/${encodeURIComponent(columnId)}`;
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(dto);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: task
      } satisfies TaskCreateResponse);
    });

    it('unwraps { success: true, data: TaskResponseDto } on success', () => {
      let emitted: TaskResponseDto | undefined;
      service.createTask('col-a', dto).subscribe(t => (emitted = t));

      httpMock
        .expectOne(`${baseUrl}/column/col-a`)
        .flush({ success: true, message: null, errors: [], data: task } satisfies TaskCreateResponse);

      expect(emitted).toEqual(task);
    });

    it('projects envelope { success: false } into an observable error', () => {
      let caught: unknown;
      service.createTask('col-a', dto).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/column/col-a`)
        .flush({ success: false, message: 'nope', errors: ['bad'], data: null } satisfies TaskCreateResponse);

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('bad');
    });

    it('projects { success: true, data: null } into an observable error', () => {
      let caught: unknown;
      service.createTask('col-a', dto).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/column/col-a`)
        .flush({ success: true, message: null, errors: [], data: null } satisfies TaskCreateResponse);

      expect(caught).toBeInstanceOf(Error);
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service.createTask('col-a', dto).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/column/col-a`)
        .flush(
          { success: false, message: null, errors: [], data: null },
          { status: 500, statusText: 'Server Error' }
        );

      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('mapTaskCreateErrorToUserMessage()', () => {
    const make = (status: number) =>
      new HttpErrorResponse({ status, statusText: 'x', url: '/api/task/column/col-a' });

    it('maps status 0 (network) to the network message', () => {
      expect(mapTaskCreateErrorToUserMessage(make(0))).toBe(
        "We couldn't reach the server. Please check your connection and try again."
      );
    });

    it('maps 401 to the session-expired message', () => {
      expect(mapTaskCreateErrorToUserMessage(make(401))).toBe(
        'Your session has expired. Please sign in again.'
      );
    });

    it('maps 403 to the not-a-member message', () => {
      expect(mapTaskCreateErrorToUserMessage(make(403))).toBe(
        'You are no longer a member of this project and cannot add tasks.'
      );
    });

    it('maps 404 to the column-missing message', () => {
      expect(mapTaskCreateErrorToUserMessage(make(404))).toBe(
        "We couldn't add this task — the column no longer exists."
      );
    });

    it('maps 400 to the title-check message', () => {
      expect(mapTaskCreateErrorToUserMessage(make(400))).toBe(
        "We couldn't add this task. Please check the title and try again."
      );
    });

    it('maps 5xx to the server-error message', () => {
      expect(mapTaskCreateErrorToUserMessage(make(500))).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
      expect(mapTaskCreateErrorToUserMessage(make(503))).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
    });

    it('maps other 4xx to the generic retry message', () => {
      expect(mapTaskCreateErrorToUserMessage(make(418))).toBe(
        "We couldn't add this task. Please try again."
      );
    });

    it('maps plain Error (envelope failure) to the generic retry message', () => {
      expect(mapTaskCreateErrorToUserMessage(new Error('envelope failure'))).toBe(
        "We couldn't add this task. Please try again."
      );
    });

    it('maps unknown non-Error values to the generic retry message', () => {
      expect(mapTaskCreateErrorToUserMessage('whatever')).toBe(
        "We couldn't add this task. Please try again."
      );
    });
  });
});
