import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  TasksApiService,
  mapTaskCreateErrorToUserMessage,
  mapTaskDeleteErrorToUserMessage,
  mapTaskDescriptionErrorToUserMessage,
  mapTaskListErrorToUserMessage,
  mapTaskMoveErrorToUserMessage
} from './tasks-api.service';
import {
  CreateTaskDto,
  MoveTaskDto,
  TaskCreateResponse,
  TaskDescriptionUpdateResponse,
  TaskListResponse,
  TaskMoveResponse,
  TaskResponseDto,
  UpdateTaskDescriptionDto
} from '../models/task.model';
import { environment } from '../../../../environments/environment';
import { TASK_DESCRIPTION_COPY } from '../components/task-description-section/task-description-copy';

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

  describe('getTasksForProject()', () => {
    const task: TaskResponseDto = {
      id: 't-1',
      title: 'Design login page',
      content: null,
      taskOrder: 0,
      columnId: 'col-a',
      assignedId: null,
      createdAt: '2026-05-04T00:00:00Z',
      updatedAt: '2026-05-04T00:00:00Z'
    };

    it('issues a GET to /task/project/{projectId} with the projectId URL-encoded', () => {
      const projectId = 'project id with space';
      service.getTasksForProject(projectId).subscribe();

      const expectedUrl = `${baseUrl}/project/${encodeURIComponent(projectId)}`;
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('GET');
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: [task]
      } satisfies TaskListResponse);
    });

    it('unwraps { success: true, data: TaskResponseDto[] } on success', () => {
      let emitted: TaskResponseDto[] | undefined;
      service.getTasksForProject('p-1').subscribe(t => (emitted = t));

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({
          success: true,
          message: null,
          errors: [],
          data: [task]
        } satisfies TaskListResponse);

      expect(emitted).toEqual([task]);
    });

    it('returns an empty array when the project has no tasks', () => {
      let emitted: TaskResponseDto[] | undefined;
      service.getTasksForProject('p-1').subscribe(t => (emitted = t));

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({
          success: true,
          message: null,
          errors: [],
          data: []
        } satisfies TaskListResponse);

      expect(emitted).toEqual([]);
    });

    it('projects envelope { success: false } into an observable error', () => {
      let caught: unknown;
      service.getTasksForProject('p-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({
          success: false,
          message: 'nope',
          errors: ['bad'],
          data: null
        } satisfies TaskListResponse);

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('bad');
    });

    it('projects { success: true, data: null } into an observable error', () => {
      let caught: unknown;
      service.getTasksForProject('p-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${baseUrl}/project/p-1`)
        .flush({
          success: true,
          message: null,
          errors: [],
          data: null
        } satisfies TaskListResponse);

      expect(caught).toBeInstanceOf(Error);
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service.getTasksForProject('p-1').subscribe({
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

  describe('mapTaskListErrorToUserMessage()', () => {
    const make = (status: number) =>
      new HttpErrorResponse({ status, statusText: 'x', url: '/api/task/project/p-1' });

    it('maps status 0 (network) to the network message', () => {
      expect(mapTaskListErrorToUserMessage(make(0))).toBe(
        "We couldn't reach the server. Please check your connection and try again."
      );
    });

    it('maps 401 to the session-expired message', () => {
      expect(mapTaskListErrorToUserMessage(make(401))).toBe(
        'Your session has expired. Please sign in again.'
      );
    });

    it('maps 403 to the not-a-member message', () => {
      expect(mapTaskListErrorToUserMessage(make(403))).toBe(
        'You are no longer a member of this project.'
      );
    });

    it('maps 404 to the project-missing message', () => {
      expect(mapTaskListErrorToUserMessage(make(404))).toBe(
        'This project no longer exists.'
      );
    });

    it('maps 5xx to the server-error message', () => {
      expect(mapTaskListErrorToUserMessage(make(500))).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
      expect(mapTaskListErrorToUserMessage(make(503))).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
    });

    it('maps 400 to the default fallback copy', () => {
      expect(mapTaskListErrorToUserMessage(make(400))).toBe(
        "We couldn't load this board. Please try again."
      );
    });

    it('maps other 4xx to the default fallback copy', () => {
      expect(mapTaskListErrorToUserMessage(make(418))).toBe(
        "We couldn't load this board. Please try again."
      );
    });

    it('maps plain Error (envelope failure) to the default fallback copy', () => {
      expect(mapTaskListErrorToUserMessage(new Error('envelope failure'))).toBe(
        "We couldn't load this board. Please try again."
      );
    });

    it('maps unknown non-Error values to the default fallback copy', () => {
      expect(mapTaskListErrorToUserMessage('whatever')).toBe(
        "We couldn't load this board. Please try again."
      );
    });
  });

  describe('updateTaskDescription()', () => {
    const task: TaskResponseDto = {
      id: 't-1',
      title: 'Design login page',
      content: 'new body',
      taskOrder: 0,
      columnId: 'col-a',
      assignedId: null,
      createdAt: '2026-05-08T00:00:00Z',
      updatedAt: '2026-05-08T00:00:00Z'
    };
    const dto: UpdateTaskDescriptionDto = { content: 'new body' };

    it('issues a PUT to /task/{taskId}/description with body', () => {
      const taskId = 'task id with space';
      service.updateTaskDescription(taskId, dto).subscribe();

      const expectedUrl = `${baseUrl}/${encodeURIComponent(taskId)}/description`;
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(dto);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: task
      } satisfies TaskDescriptionUpdateResponse);
    });

    it('unwraps { success: true, data: TaskResponseDto } on success', () => {
      let emitted: TaskResponseDto | undefined;
      service.updateTaskDescription('t-1', dto).subscribe(t => (emitted = t));
      httpMock
        .expectOne(`${baseUrl}/t-1/description`)
        .flush({
          success: true,
          message: null,
          errors: [],
          data: task
        } satisfies TaskDescriptionUpdateResponse);
      expect(emitted).toEqual(task);
    });

    it('projects envelope { success: false } into an observable error', () => {
      let caught: unknown;
      service.updateTaskDescription('t-1', dto).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });
      httpMock
        .expectOne(`${baseUrl}/t-1/description`)
        .flush({
          success: false,
          message: 'nope',
          errors: ['bad'],
          data: null
        } satisfies TaskDescriptionUpdateResponse);
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('bad');
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service.updateTaskDescription('t-1', dto).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });
      httpMock
        .expectOne(`${baseUrl}/t-1/description`)
        .flush(
          { success: false, message: null, errors: [], data: null },
          { status: 404, statusText: 'Not Found' }
        );
      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('clearTaskDescription()', () => {
    it('issues a DELETE to /task/{taskId}/description', () => {
      service.clearTaskDescription('task id with space').subscribe();
      const expectedUrl = `${baseUrl}/${encodeURIComponent('task id with space')}/description`;
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('completes without a value on 204', () => {
      let emitted: unknown = 'not-yet';
      service.clearTaskDescription('t-1').subscribe({
        next: v => (emitted = v),
        complete: () => (emitted = 'done')
      });
      httpMock.expectOne(`${baseUrl}/t-1/description`).flush(null, {
        status: 204,
        statusText: 'No Content'
      });
      expect(emitted).toBe('done');
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service.clearTaskDescription('t-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });
      httpMock
        .expectOne(`${baseUrl}/t-1/description`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('mapTaskDescriptionErrorToUserMessage()', () => {
    const makeErr = (status: number, body?: unknown) =>
      new HttpErrorResponse({ status, statusText: 'x', error: body });

    it('maps status 0 to network copy (save + clear)', () => {
      const expected = {
        kind: 'inline' as const,
        text: TASK_DESCRIPTION_COPY.INLINE_ERROR_NETWORK
      };
      expect(mapTaskDescriptionErrorToUserMessage(makeErr(0), 'save')).toEqual(expected);
      expect(mapTaskDescriptionErrorToUserMessage(makeErr(0), 'clear')).toEqual(expected);
    });

    it('maps 403 to the permission copy', () => {
      const expected = {
        kind: 'inline' as const,
        text: TASK_DESCRIPTION_COPY.INLINE_ERROR_PERMISSION
      };
      expect(mapTaskDescriptionErrorToUserMessage(makeErr(403), 'save')).toEqual(expected);
      expect(mapTaskDescriptionErrorToUserMessage(makeErr(403), 'clear')).toEqual(expected);
    });

    it('maps 404 to not-found (save + clear)', () => {
      expect(mapTaskDescriptionErrorToUserMessage(makeErr(404), 'save')).toEqual({
        kind: 'not-found'
      });
      expect(mapTaskDescriptionErrorToUserMessage(makeErr(404), 'clear')).toEqual({
        kind: 'not-found'
      });
    });

    it('maps 400 on save to server-errors with envelope errors', () => {
      const err = makeErr(400, { errors: ['server msg'] });
      expect(mapTaskDescriptionErrorToUserMessage(err, 'save')).toEqual({
        kind: 'server-errors',
        texts: ['server msg']
      });
    });

    it('maps 400 on save with no errors array to empty server-errors', () => {
      const err = makeErr(400, {});
      expect(mapTaskDescriptionErrorToUserMessage(err, 'save')).toEqual({
        kind: 'server-errors',
        texts: []
      });
    });

    it('maps 400 on clear to generic save copy (defensive)', () => {
      const err = makeErr(400, { errors: ['ignored'] });
      expect(mapTaskDescriptionErrorToUserMessage(err, 'clear')).toEqual({
        kind: 'inline',
        text: TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
      });
    });

    it('maps 5xx and other statuses to the generic save copy', () => {
      expect(mapTaskDescriptionErrorToUserMessage(makeErr(500), 'save')).toEqual({
        kind: 'inline',
        text: TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
      });
      expect(mapTaskDescriptionErrorToUserMessage(makeErr(418), 'save')).toEqual({
        kind: 'inline',
        text: TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
      });
    });

    it('maps non-HttpErrorResponse values to the generic save copy', () => {
      expect(mapTaskDescriptionErrorToUserMessage(new Error('x'), 'save')).toEqual({
        kind: 'inline',
        text: TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
      });
      expect(mapTaskDescriptionErrorToUserMessage('whatever', 'clear')).toEqual({
        kind: 'inline',
        text: TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
      });
    });
  });

  describe('deleteTask()', () => {
    it('issues a DELETE to /task/{taskId} with the id URL-encoded', () => {
      const taskId = 'task with space';
      service.deleteTask(taskId).subscribe();
      const req = httpMock.expectOne(
        `${baseUrl}/${encodeURIComponent(taskId)}`
      );
      expect(req.request.method).toBe('DELETE');
      expect(req.request.body).toBeNull();
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('completes on 204', () => {
      let completed = false;
      service.deleteTask('t-1').subscribe({
        complete: () => (completed = true)
      });
      httpMock
        .expectOne(`${baseUrl}/t-1`)
        .flush(null, { status: 204, statusText: 'No Content' });
      expect(completed).toBe(true);
    });

    it('surfaces HttpErrorResponse on non-2xx', () => {
      let caught: unknown;
      service.deleteTask('t-1').subscribe({
        next: () => {},
        error: e => (caught = e)
      });
      httpMock
        .expectOne(`${baseUrl}/t-1`)
        .flush(null, { status: 500, statusText: 'Server Error' });
      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('mapTaskDeleteErrorToUserMessage()', () => {
    const make = (status: number) =>
      new HttpErrorResponse({ status, statusText: 'x' });

    it('maps status 0 to the verbatim network copy', () => {
      expect(mapTaskDeleteErrorToUserMessage(make(0))).toBe(
        "Couldn't reach the server — try again"
      );
    });
    it('maps 403 to the permission copy', () => {
      expect(mapTaskDeleteErrorToUserMessage(make(403))).toBe(
        "You don't have permission to delete this task"
      );
    });
    it('maps 500 to the generic delete-failure copy (retry-in-place)', () => {
      expect(mapTaskDeleteErrorToUserMessage(make(500))).toBe(
        "Couldn't delete task — please try again"
      );
    });
    it('maps other statuses and plain errors to the generic delete-failure copy', () => {
      expect(mapTaskDeleteErrorToUserMessage(make(400))).toBe(
        "Couldn't delete task — please try again"
      );
      expect(mapTaskDeleteErrorToUserMessage(new Error('x'))).toBe(
        "Couldn't delete task — please try again"
      );
    });
  });
});
