import { TestBed } from '@angular/core/testing';
import { Signal, WritableSignal, signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Subject } from 'rxjs';

import { BoardStateService } from './board-state.service';
import {
  SignalRConnectionState,
  SignalRService
} from '../../../core/services/signalr.service';
import { ProjectStateService } from '../../projects/state/project-state.service';
import { ProjectSummary } from '../../projects/models/project.model';
import {
  ColumnCreatedEvent,
  ColumnDeletedEvent,
  REALTIME_EVENT,
  TaskCreatedEvent,
  TaskMovedEvent
} from '../../../core/models/realtime-events';

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

function makeProject(partial?: Partial<ProjectSummary>): ProjectSummary {
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

describe('BoardStateService', () => {
  const PROJECT_ID = 'p-1';
  const OTHER_PROJECT_ID = 'p-2';
  let service: BoardStateService;
  let signalRMock: MockSignalRService;
  let projectsSig: WritableSignal<ProjectSummary[]>;

  beforeEach(() => {
    signalRMock = createMockSignalRService('connected');
    projectsSig = signal<ProjectSummary[]>([makeProject({ id: PROJECT_ID })]);

    const projectsReadonly: Signal<ProjectSummary[]> = projectsSig.asReadonly();

    TestBed.configureTestingModule({
      providers: [
        BoardStateService,
        { provide: SignalRService, useValue: signalRMock },
        {
          provide: ProjectStateService,
          useValue: {
            projects: projectsReadonly,
            isLoading: signal(false),
            error: signal<string | null>(null),
            hasLoaded: signal(true),
            loadProjects: () => undefined
          }
        }
      ]
    });

    service = TestBed.inject(BoardStateService);
    TestBed.flushEffects();
  });

  describe('Initial state', () => {
    it('exposes null currentProjectId and empty buckets', () => {
      expect(service.currentProjectId()).toBeNull();
      expect(service.columns()).toEqual([]);
      expect(service.tasksByColumnId()).toEqual({});
    });
  });

  describe('enterBoard() / leaveBoard()', () => {
    it('enterBoard sets currentProjectId and invokes joinProjectGroup', () => {
      service.enterBoard(PROJECT_ID);
      expect(service.currentProjectId()).toBe(PROJECT_ID);
      expect(signalRMock.joinProjectGroup).toHaveBeenCalledWith(PROJECT_ID);
    });

    it('enterBoard resets columns/tasks from a prior session', () => {
      // Seed by entering and emitting a column.
      service.enterBoard(PROJECT_ID);
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-1',
        name: 'To Do',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.columns().length).toBe(1);

      // Enter a different board — old state wiped.
      service.enterBoard(OTHER_PROJECT_ID);
      expect(service.currentProjectId()).toBe(OTHER_PROJECT_ID);
      expect(service.columns()).toEqual([]);
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('leaveBoard does NOT invoke leaveProjectGroup when user is still a member', () => {
      service.enterBoard(PROJECT_ID);
      signalRMock.leaveProjectGroup.mockClear();

      service.leaveBoard();
      expect(service.currentProjectId()).toBeNull();
      // User is still a member of PROJECT_ID (seeded in beforeEach).
      expect(signalRMock.leaveProjectGroup).not.toHaveBeenCalled();
    });

    it('leaveBoard invokes leaveProjectGroup when user is no longer a member', () => {
      service.enterBoard(PROJECT_ID);

      // Simulate "user removed mid-session": remove the project from the list.
      projectsSig.set([]);
      TestBed.flushEffects();
      signalRMock.leaveProjectGroup.mockClear();

      service.leaveBoard();
      expect(signalRMock.leaveProjectGroup).toHaveBeenCalledWith(PROJECT_ID);
      expect(signalRMock.leaveProjectGroup).toHaveBeenCalledTimes(1);
    });

    it('leaveBoard is a harmless no-op when currentProjectId is already null', () => {
      service.leaveBoard();
      expect(signalRMock.leaveProjectGroup).not.toHaveBeenCalled();
    });
  });

  describe('Reconnect — re-issues board-scope Join', () => {
    it('re-joins currentProjectId on connectionState → connected after a drop', () => {
      service.enterBoard(PROJECT_ID);
      signalRMock.joinProjectGroup.mockClear();

      signalRMock.connectionState.set('reconnecting');
      TestBed.flushEffects();
      signalRMock.connectionState.set('connected');
      TestBed.flushEffects();

      expect(signalRMock.joinProjectGroup).toHaveBeenCalledWith(PROJECT_ID);
    });

    it('does NOT re-issue a Join on reconnect when no board is active (currentProjectId === null)', () => {
      // Sanity: currentProjectId starts as null (no enterBoard yet).
      expect(service.currentProjectId()).toBeNull();
      signalRMock.joinProjectGroup.mockClear();

      signalRMock.connectionState.set('reconnecting');
      TestBed.flushEffects();
      signalRMock.connectionState.set('connected');
      TestBed.flushEffects();

      // The board-scope Layer-2 Join must NOT fire — tech spec §"Edge Cases"
      // gates the reconnect Join on `currentProjectId !== null`.
      expect(signalRMock.joinProjectGroup).not.toHaveBeenCalled();
    });
  });

  describe('Logout → login cycle (AC12 — subscribers re-wire to fresh Subjects)', () => {
    it('a ColumnCreated emitted on a FRESH Subject after a stop()/start() cycle still reconciles', () => {
      service.enterBoard(PROJECT_ID);
      // Baseline on the first cycle: event arrives, state updates.
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-before',
        name: 'Before',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.columns().map(c => c.id)).toEqual(['col-before']);

      // Simulate logout: disconnect + discard the old Subjects (the real
      // SignalRService.stop() completes every subject and clears its map).
      signalRMock.connectionState.set('disconnected');
      TestBed.flushEffects();
      signalRMock._subjects.clear();

      // Simulate login + re-enter the board. The next `on()` call mints a
      // FRESH Subject; the service's connection-state effect must re-subscribe
      // to it so events still land.
      signalRMock.connectionState.set('connected');
      TestBed.flushEffects();

      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-after',
        name: 'After',
        colorCode: null,
        columnOrder: 2,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });

      expect(service.columns().map(c => c.id)).toEqual(['col-before', 'col-after']);
    });
  });

  describe('ColumnCreated', () => {
    beforeEach(() => {
      service.enterBoard(PROJECT_ID);
    });

    it('appends when projectId matches the current board', () => {
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-2',
        name: 'Doing',
        colorCode: null,
        columnOrder: 2,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });

      expect(service.columns()).toEqual([
        {
          id: 'col-2',
          name: 'Doing',
          colorCode: null,
          columnOrder: 2,
          projectId: PROJECT_ID
        }
      ]);
    });

    it('maintains columnOrder ascending across multiple emits', () => {
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-b',
        name: 'B',
        colorCode: null,
        columnOrder: 2,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-a',
        name: 'A',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });

      expect(service.columns().map(c => c.id)).toEqual(['col-a', 'col-b']);
    });

    it('ignores a ColumnCreated for a different project', () => {
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-foreign',
        name: 'Foreign',
        colorCode: null,
        columnOrder: 1,
        projectId: OTHER_PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.columns()).toEqual([]);
    });

    it('dedupes a ColumnCreated with an id already in state', () => {
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-1',
        name: 'A',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-1',
        name: 'A-dup',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.columns().length).toBe(1);
      expect(service.columns()[0].name).toBe('A');
    });
  });

  describe('ColumnDeleted', () => {
    beforeEach(() => {
      service.enterBoard(PROJECT_ID);
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-1',
        name: 'To Do',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-1',
        title: 'T1',
        content: null,
        taskOrder: 1,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
    });

    it('removes the column and drops its tasks bucket', () => {
      expect(service.columns().length).toBe(1);
      expect(service.tasksByColumnId()['col-1']).toHaveLength(1);

      signalRMock.emit<ColumnDeletedEvent>(REALTIME_EVENT.ColumnDeleted, {
        columnId: 'col-1',
        projectId: PROJECT_ID
      });

      expect(service.columns()).toEqual([]);
      expect(service.tasksByColumnId()['col-1']).toBeUndefined();
    });

    it('is a silent no-op when the column is absent', () => {
      signalRMock.emit<ColumnDeletedEvent>(REALTIME_EVENT.ColumnDeleted, {
        columnId: 'col-missing',
        projectId: PROJECT_ID
      });
      expect(service.columns().length).toBe(1);
    });

    it('ignores a ColumnDeleted for a different project', () => {
      signalRMock.emit<ColumnDeletedEvent>(REALTIME_EVENT.ColumnDeleted, {
        columnId: 'col-1',
        projectId: OTHER_PROJECT_ID
      });
      expect(service.columns().length).toBe(1);
    });
  });

  describe('TaskCreated', () => {
    beforeEach(() => {
      service.enterBoard(PROJECT_ID);
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-1',
        name: 'To Do',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
    });

    it('appends to the matching bucket in taskOrder ascending', () => {
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-b',
        title: 'B',
        content: null,
        taskOrder: 2,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-a',
        title: 'A',
        content: null,
        taskOrder: 1,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()['col-1'].map(t => t.id)).toEqual(['t-a', 't-b']);
    });

    it('is a silent no-op when the target column is unknown', () => {
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-orphan',
        title: 'Orphan',
        content: null,
        taskOrder: 1,
        columnId: 'col-missing',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('is a silent no-op when no currentProjectId is set', () => {
      service.leaveBoard();
      expect(service.currentProjectId()).toBeNull();
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-1',
        title: 'T',
        content: null,
        taskOrder: 1,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('dedupes a TaskCreated whose id is already in the bucket', () => {
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-1',
        title: 'First',
        content: null,
        taskOrder: 1,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-1',
        title: 'Dup',
        content: null,
        taskOrder: 1,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      const bucket = service.tasksByColumnId()['col-1'];
      expect(bucket.length).toBe(1);
      expect(bucket[0].title).toBe('First');
    });
  });

  describe('TaskMoved', () => {
    beforeEach(() => {
      service.enterBoard(PROJECT_ID);
      for (const column of ['col-1', 'col-2']) {
        signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
          id: column,
          name: column,
          colorCode: null,
          columnOrder: column === 'col-1' ? 1 : 2,
          projectId: PROJECT_ID,
          createdAt: '',
          updatedAt: ''
        });
      }
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-1',
        title: 'Task 1',
        content: null,
        taskOrder: 1,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
    });

    it('removes from oldColumnId and inserts into newColumnId', () => {
      signalRMock.emit<TaskMovedEvent>(REALTIME_EVENT.TaskMoved, {
        taskId: 't-1',
        oldColumnId: 'col-1',
        newColumnId: 'col-2',
        oldTaskOrder: 1,
        newTaskOrder: 1,
        task: {
          id: 't-1',
          title: 'Task 1',
          content: null,
          taskOrder: 1,
          columnId: 'col-2',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        }
      });

      const buckets = service.tasksByColumnId();
      expect(buckets['col-1']).toEqual([]);
      expect(buckets['col-2'].map(t => t.id)).toEqual(['t-1']);
      expect(buckets['col-2'][0].columnId).toBe('col-2');
    });

    it('is a silent no-op when the task is not in local state', () => {
      signalRMock.emit<TaskMovedEvent>(REALTIME_EVENT.TaskMoved, {
        taskId: 't-unknown',
        oldColumnId: 'col-1',
        newColumnId: 'col-2',
        oldTaskOrder: 1,
        newTaskOrder: 1,
        task: {
          id: 't-unknown',
          title: 'T',
          content: null,
          taskOrder: 1,
          columnId: 'col-2',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        }
      });
      // col-1 still holds t-1; col-2 is untouched.
      expect(service.tasksByColumnId()['col-1'].map(t => t.id)).toEqual(['t-1']);
      expect(service.tasksByColumnId()['col-2']).toBeUndefined();
    });

    it('is a silent no-op when currentProjectId is null', () => {
      service.leaveBoard();
      signalRMock.emit<TaskMovedEvent>(REALTIME_EVENT.TaskMoved, {
        taskId: 't-1',
        oldColumnId: 'col-1',
        newColumnId: 'col-2',
        oldTaskOrder: 1,
        newTaskOrder: 1,
        task: {
          id: 't-1',
          title: 'Task 1',
          content: null,
          taskOrder: 1,
          columnId: 'col-2',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        }
      });
      expect(service.tasksByColumnId()).toEqual({});
    });
  });

  describe('Malformed / partial payloads', () => {
    beforeEach(() => {
      service.enterBoard(PROJECT_ID);
    });

    it('each handler is no-throw on undefined/empty payloads', () => {
      const malformed: unknown[] = [
        undefined,
        null,
        {},
        { projectId: undefined },
        { id: null }
      ];
      expect(() => {
        for (const payload of malformed) {
          signalRMock.emit(REALTIME_EVENT.ColumnCreated, payload as ColumnCreatedEvent);
          signalRMock.emit(REALTIME_EVENT.ColumnDeleted, payload as ColumnDeletedEvent);
          signalRMock.emit(REALTIME_EVENT.TaskCreated, payload as TaskCreatedEvent);
          signalRMock.emit(REALTIME_EVENT.TaskMoved, payload as TaskMovedEvent);
        }
      }).not.toThrow();
    });
  });

  describe('Console hygiene', () => {
    it('never logs payload fields on any path', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const SECRET_PROJECT = 'secret-project-id';
      const SECRET_COLUMN = 'secret-column-id';
      const SECRET_TASK = 'secret-task-id';

      service.enterBoard(SECRET_PROJECT);
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: SECRET_COLUMN,
        name: 'X',
        colorCode: null,
        columnOrder: 1,
        projectId: SECRET_PROJECT,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: SECRET_TASK,
        title: 'X',
        content: null,
        taskOrder: 1,
        columnId: SECRET_COLUMN,
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskMovedEvent>(REALTIME_EVENT.TaskMoved, {
        taskId: SECRET_TASK,
        oldColumnId: SECRET_COLUMN,
        newColumnId: SECRET_COLUMN,
        oldTaskOrder: 1,
        newTaskOrder: 2,
        task: {
          id: SECRET_TASK,
          title: 'X',
          content: null,
          taskOrder: 2,
          columnId: SECRET_COLUMN,
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        }
      });
      signalRMock.emit<ColumnDeletedEvent>(REALTIME_EVENT.ColumnDeleted, {
        columnId: SECRET_COLUMN,
        projectId: SECRET_PROJECT
      });

      const allArgs = [
        ...consoleLogSpy.mock.calls.flat(),
        ...consoleErrorSpy.mock.calls.flat()
      ];
      for (const arg of allArgs) {
        const asString = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(asString).not.toContain(SECRET_PROJECT);
        expect(asString).not.toContain(SECRET_COLUMN);
        expect(asString).not.toContain(SECRET_TASK);
      }

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
