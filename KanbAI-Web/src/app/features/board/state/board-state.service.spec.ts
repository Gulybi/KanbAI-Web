import { TestBed } from '@angular/core/testing';
import { Signal, WritableSignal, signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';

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
  TaskDeletedEvent,
  TaskMovedEvent,
  TaskUpdatedEvent
} from '../../../core/models/realtime-events';
import { BoardColumn } from './board-state.model';
import { TaskResponseDto } from '../models/task.model';
import { ColumnResponseDto } from '../models/column.model';
import { ColumnsApiService } from '../services/columns-api.service';
import { TasksApiService } from '../services/tasks-api.service';

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
          signalRMock.emit(REALTIME_EVENT.TaskUpdated, payload as TaskUpdatedEvent);
        }
      }).not.toThrow();
    });
  });

  // ----------------------------------------------------------------------
  // Issue #47 — optimistic drag-and-drop support
  // ----------------------------------------------------------------------

  describe('setColumns() (issue #47)', () => {
    it('stores the columns sorted by columnOrder when projectId matches', () => {
      service.enterBoard(PROJECT_ID);
      const inbound: BoardColumn[] = [
        { id: 'c-b', name: 'B', colorCode: null, columnOrder: 2, projectId: PROJECT_ID },
        { id: 'c-a', name: 'A', colorCode: null, columnOrder: 1, projectId: PROJECT_ID }
      ];
      service.setColumns(PROJECT_ID, inbound);
      expect(service.columns().map(c => c.id)).toEqual(['c-a', 'c-b']);
    });

    it('is a no-op when projectId does not match currentProjectId (stale response)', () => {
      service.enterBoard(PROJECT_ID);
      const inbound: BoardColumn[] = [
        { id: 'c-a', name: 'A', colorCode: null, columnOrder: 1, projectId: OTHER_PROJECT_ID }
      ];
      service.setColumns(OTHER_PROJECT_ID, inbound);
      expect(service.columns()).toEqual([]);
    });

    it('drops tasksByColumnId buckets for columns not in the new list', () => {
      service.enterBoard(PROJECT_ID);
      // Seed a pre-existing column + task.
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-keep',
        name: 'Keep',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-drop',
        name: 'Drop',
        colorCode: null,
        columnOrder: 2,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-keep',
        title: 'keep',
        content: null,
        taskOrder: 1,
        columnId: 'col-keep',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-drop',
        title: 'drop',
        content: null,
        taskOrder: 1,
        columnId: 'col-drop',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });

      service.setColumns(PROJECT_ID, [
        {
          id: 'col-keep',
          name: 'Keep',
          colorCode: null,
          columnOrder: 1,
          projectId: PROJECT_ID
        }
      ]);

      const buckets = service.tasksByColumnId();
      expect(buckets['col-keep']?.map(t => t.id)).toEqual(['t-keep']);
      expect(buckets['col-drop']).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------------
  // Issue #87 — hydrate tasks on board entry
  // ----------------------------------------------------------------------

  describe('setTasks() (issue #87)', () => {
    const makeTaskDto = (partial?: Partial<TaskResponseDto>): TaskResponseDto => ({
      id: 't-1',
      title: 'Task 1',
      content: null,
      taskOrder: 0,
      columnId: 'col-1',
      assignedId: null,
      createdAt: '2026-05-04T00:00:00Z',
      updatedAt: '2026-05-04T00:00:00Z',
      ...partial
    });

    const seedProjectAndColumns = (columnIds: string[] = ['col-1', 'col-2']) => {
      service.enterBoard(PROJECT_ID);
      columnIds.forEach((id, index) => {
        signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
          id,
          name: id,
          colorCode: null,
          columnOrder: index + 1,
          projectId: PROJECT_ID,
          createdAt: '',
          updatedAt: ''
        });
      });
    };

    it('is a silent no-op when projectId does not match currentProjectId (stale response)', () => {
      seedProjectAndColumns();
      service.setTasks(OTHER_PROJECT_ID, [makeTaskDto()]);
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('drops tasks whose columnId is not in the current column set', () => {
      seedProjectAndColumns(['col-1']);
      service.setTasks(PROJECT_ID, [
        makeTaskDto({ id: 't-keep', columnId: 'col-1' }),
        makeTaskDto({ id: 't-orphan', columnId: 'col-missing' })
      ]);
      const buckets = service.tasksByColumnId();
      expect(buckets['col-1']?.map(t => t.id)).toEqual(['t-keep']);
      expect(buckets['col-missing']).toBeUndefined();
    });

    it('buckets tasks by columnId across multiple columns', () => {
      seedProjectAndColumns(['col-1', 'col-2']);
      service.setTasks(PROJECT_ID, [
        makeTaskDto({ id: 't-a', columnId: 'col-1', taskOrder: 0 }),
        makeTaskDto({ id: 't-b', columnId: 'col-2', taskOrder: 0 }),
        makeTaskDto({ id: 't-c', columnId: 'col-1', taskOrder: 1 })
      ]);
      const buckets = service.tasksByColumnId();
      expect(buckets['col-1'].map(t => t.id)).toEqual(['t-a', 't-c']);
      expect(buckets['col-2'].map(t => t.id)).toEqual(['t-b']);
    });

    it('sorts each bucket by taskOrder ascending', () => {
      seedProjectAndColumns(['col-1']);
      service.setTasks(PROJECT_ID, [
        makeTaskDto({ id: 't-c', columnId: 'col-1', taskOrder: 2 }),
        makeTaskDto({ id: 't-a', columnId: 'col-1', taskOrder: 0 }),
        makeTaskDto({ id: 't-b', columnId: 'col-1', taskOrder: 1 })
      ]);
      expect(service.tasksByColumnId()['col-1'].map(t => t.id)).toEqual([
        't-a',
        't-b',
        't-c'
      ]);
    });

    it('drops createdAt / updatedAt from the projected BoardTask', () => {
      seedProjectAndColumns(['col-1']);
      service.setTasks(PROJECT_ID, [makeTaskDto({ id: 't-proj', columnId: 'col-1' })]);
      const stored = service.tasksByColumnId()['col-1'][0];
      expect(stored).toEqual({
        id: 't-proj',
        title: 'Task 1',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null
      });
      expect(stored as unknown as { createdAt?: string }).not.toHaveProperty('createdAt');
      expect(stored as unknown as { updatedAt?: string }).not.toHaveProperty('updatedAt');
    });

    it('replaces pre-existing buckets atomically (no merge with prior state)', () => {
      seedProjectAndColumns(['col-1']);
      // Seed a pre-existing task via SignalR — the hydration should overwrite it.
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-stale',
        title: 'stale',
        content: null,
        taskOrder: 9,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()['col-1']?.map(t => t.id)).toEqual(['t-stale']);

      service.setTasks(PROJECT_ID, [
        makeTaskDto({ id: 't-fresh', columnId: 'col-1', taskOrder: 0 })
      ]);

      // 't-stale' is gone — hydration replaced the bucket.
      expect(service.tasksByColumnId()['col-1']?.map(t => t.id)).toEqual(['t-fresh']);
    });

    it('TaskCreated dedupe after hydration — AC7 — existing id is not double-rendered', () => {
      seedProjectAndColumns(['col-1']);
      service.setTasks(PROJECT_ID, [
        makeTaskDto({ id: 't-X', columnId: 'col-1', taskOrder: 0 })
      ]);
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-X',
        title: 'echo',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      const bucket = service.tasksByColumnId()['col-1'];
      expect(bucket.length).toBe(1);
      expect(bucket[0].id).toBe('t-X');
    });

    it('TaskMoved pre-hydration is a no-op; subsequent setTasks plants the task at its post-move position — AC8', () => {
      seedProjectAndColumns(['col-1', 'col-2']);
      // TaskMoved arrives for an unknown id — silent no-op.
      signalRMock.emit<TaskMovedEvent>(REALTIME_EVENT.TaskMoved, {
        taskId: 't-pre',
        oldColumnId: 'col-1',
        newColumnId: 'col-2',
        oldTaskOrder: 0,
        newTaskOrder: 0,
        task: {
          id: 't-pre',
          title: 'pre',
          content: null,
          taskOrder: 0,
          columnId: 'col-2',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        }
      });
      expect(service.tasksByColumnId()).toEqual({});

      // Hydration plants the task at its post-move column/position.
      service.setTasks(PROJECT_ID, [
        makeTaskDto({ id: 't-pre', columnId: 'col-2', taskOrder: 0 })
      ]);
      expect(service.tasksByColumnId()['col-2']?.map(t => t.id)).toEqual(['t-pre']);
    });
  });

  describe('onTaskUpdated handler (issue #87)', () => {
    const seed = () => {
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
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-2',
        name: 'Doing',
        colorCode: null,
        columnOrder: 2,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-1',
        title: 'Original',
        content: 'old content',
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
    };

    it('updates content on a task present in state (AC9)', () => {
      seed();
      signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
        id: 't-1',
        title: 'Original',
        content: 'new content',
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()['col-1'][0].content).toBe('new content');
    });

    it('preserves null content (description cleared)', () => {
      seed();
      signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
        id: 't-1',
        title: 'Original',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()['col-1'][0].content).toBeNull();
    });

    it('is a silent no-op when the task is not in state', () => {
      seed();
      const before = service.tasksByColumnId();
      signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
        id: 't-unknown',
        title: 'T',
        content: 'x',
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()).toEqual(before);
    });

    it('is a silent no-op when currentProjectId is null', () => {
      service.leaveBoard();
      expect(() => {
        signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
          id: 't-1',
          title: 'T',
          content: 'x',
          taskOrder: 0,
          columnId: 'col-1',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        });
      }).not.toThrow();
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('moves the task across buckets if evt.columnId differs (defensive cross-bucket reconcile)', () => {
      seed();
      signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
        id: 't-1',
        title: 'Original',
        content: 'new content',
        taskOrder: 0,
        columnId: 'col-2',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      const buckets = service.tasksByColumnId();
      expect(buckets['col-1']?.map(t => t.id)).toEqual([]);
      expect(buckets['col-2']?.map(t => t.id)).toEqual(['t-1']);
      expect(buckets['col-2'][0].content).toBe('new content');
    });

    it('equality guard — idempotent echo of the already-applied state is a silent no-op (issue #94)', () => {
      seed();
      // Apply a real change first so state holds `content: 'new content'`.
      signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
        id: 't-1',
        title: 'Original',
        content: 'new content',
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      const afterFirst = service.tasksByColumnId();

      // Re-emit the exact same post-state — equality guard must skip setState
      // so the signal reference is unchanged (no downstream re-render).
      signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
        id: 't-1',
        title: 'Original',
        content: 'new content',
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()).toBe(afterFirst);
    });
  });

  // ----------------------------------------------------------------------
  // Issue #94 — description save/clear render the freshest value on the
  // originating client (apply-local-* entry points + equality guard)
  // ----------------------------------------------------------------------

  describe('applyLocalTaskUpdateFromDto() (issue #94)', () => {
    const makeTaskDto = (partial?: Partial<TaskResponseDto>): TaskResponseDto => ({
      id: 't-1',
      title: 'Original',
      content: 'updated content',
      taskOrder: 0,
      columnId: 'col-1',
      assignedId: null,
      createdAt: '2026-05-08T00:00:00Z',
      updatedAt: '2026-05-08T00:00:00Z',
      ...partial
    });

    const seedBoardAndTask = (content: string | null = 'old content') => {
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
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-2',
        name: 'Doing',
        colorCode: null,
        columnOrder: 2,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-1',
        title: 'Original',
        content,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
    };

    it('replaces the task row in its owner bucket with the projected DTO', () => {
      seedBoardAndTask('old content');
      service.applyLocalTaskUpdateFromDto(makeTaskDto({ content: 'updated content' }));
      const stored = service.tasksByColumnId()['col-1'][0];
      expect(stored.content).toBe('updated content');
      expect(stored).toEqual({
        id: 't-1',
        title: 'Original',
        content: 'updated content',
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null
      });
      // createdAt / updatedAt are dropped by the projection.
      expect(stored as unknown as { createdAt?: string }).not.toHaveProperty('createdAt');
      expect(stored as unknown as { updatedAt?: string }).not.toHaveProperty('updatedAt');
    });

    it('moves the task across buckets if the DTO reports a different columnId (defensive)', () => {
      seedBoardAndTask('old content');
      service.applyLocalTaskUpdateFromDto(
        makeTaskDto({ content: 'updated content', columnId: 'col-2' })
      );
      const buckets = service.tasksByColumnId();
      expect(buckets['col-1']?.map(t => t.id)).toEqual([]);
      expect(buckets['col-2']?.map(t => t.id)).toEqual(['t-1']);
      expect(buckets['col-2'][0].content).toBe('updated content');
    });

    it('is a silent no-op when currentProjectId is null', () => {
      // No enterBoard — currentProjectId is null.
      expect(() =>
        service.applyLocalTaskUpdateFromDto(makeTaskDto())
      ).not.toThrow();
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('is a silent no-op when the task id is not present in any bucket', () => {
      seedBoardAndTask('old content');
      const before = service.tasksByColumnId();
      service.applyLocalTaskUpdateFromDto(makeTaskDto({ id: 't-unknown' }));
      expect(service.tasksByColumnId()).toBe(before);
    });

    it('is a safe no-op on a null/undefined dto (defensive)', () => {
      seedBoardAndTask('old content');
      expect(() =>
        service.applyLocalTaskUpdateFromDto(null as unknown as TaskResponseDto)
      ).not.toThrow();
      expect(() =>
        service.applyLocalTaskUpdateFromDto(undefined as unknown as TaskResponseDto)
      ).not.toThrow();
      expect(service.tasksByColumnId()['col-1'][0].content).toBe('old content');
    });

    it('equality guard — DTO that projects to the current row is a silent no-op (no setState)', () => {
      seedBoardAndTask('old content');
      const before = service.tasksByColumnId();
      // DTO projects to the exact same BoardTask fields as already in state.
      service.applyLocalTaskUpdateFromDto(
        makeTaskDto({ content: 'old content' })
      );
      expect(service.tasksByColumnId()).toBe(before);
    });

    it('apply-local then SignalR echo of the same post-state is absorbed (no second setState)', () => {
      seedBoardAndTask('old content');

      // Originating client's HTTP-success apply — this IS a net change so
      // setState fires (reference changes).
      service.applyLocalTaskUpdateFromDto(
        makeTaskDto({ content: 'new content' })
      );
      const afterApply = service.tasksByColumnId();
      expect(afterApply['col-1'][0].content).toBe('new content');

      // SignalR echo of the same post-state — equality guard skips setState.
      signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
        id: 't-1',
        title: 'Original',
        content: 'new content',
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()).toBe(afterApply);
    });
  });

  describe('applyLocalTaskDescriptionCleared() (issue #94)', () => {
    const seedBoardWithTaskHavingContent = (content: string | null = 'old content') => {
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
        title: 'Original',
        content,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: 'user-1',
        createdAt: '',
        updatedAt: ''
      });
    };

    it('flips content to null while leaving other fields unchanged', () => {
      seedBoardWithTaskHavingContent('old content');
      service.applyLocalTaskDescriptionCleared('t-1');
      const stored = service.tasksByColumnId()['col-1'][0];
      expect(stored).toEqual({
        id: 't-1',
        title: 'Original',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: 'user-1'
      });
    });

    it('is a silent no-op when currentProjectId is null', () => {
      // No enterBoard.
      expect(() => service.applyLocalTaskDescriptionCleared('t-1')).not.toThrow();
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('is a silent no-op when the task id is not present in any bucket', () => {
      seedBoardWithTaskHavingContent('old content');
      const before = service.tasksByColumnId();
      service.applyLocalTaskDescriptionCleared('t-missing');
      expect(service.tasksByColumnId()).toBe(before);
    });

    it('equality guard — clearing an already-null content is a silent no-op (no setState)', () => {
      seedBoardWithTaskHavingContent(null);
      const before = service.tasksByColumnId();
      service.applyLocalTaskDescriptionCleared('t-1');
      expect(service.tasksByColumnId()).toBe(before);
    });

    it('apply-local-clear then SignalR echo with content:null is absorbed as a no-op', () => {
      seedBoardWithTaskHavingContent('old content');

      service.applyLocalTaskDescriptionCleared('t-1');
      const afterClear = service.tasksByColumnId();
      expect(afterClear['col-1'][0].content).toBeNull();

      // Echo of the client's own clear.
      signalRMock.emit<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated, {
        id: 't-1',
        title: 'Original',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: 'user-1',
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()).toBe(afterClear);
    });
  });

  describe('applyCreatedColumn() (issue #77)', () => {
    const makeColumnDto = (partial?: Partial<ColumnResponseDto>): ColumnResponseDto => ({
      id: 'col-new',
      name: 'Blocked',
      colorCode: null,
      columnOrder: 3,
      projectId: PROJECT_ID,
      createdAt: '2026-05-04T00:00:00Z',
      updatedAt: '2026-05-04T00:00:00Z',
      ...partial
    });

    it('is a no-op when projectId does not match currentProjectId', () => {
      service.enterBoard(PROJECT_ID);
      service.applyCreatedColumn(
        OTHER_PROJECT_ID,
        makeColumnDto({ projectId: OTHER_PROJECT_ID })
      );
      expect(service.columns()).toEqual([]);
    });

    it('is a no-op when no board is active (currentProjectId null)', () => {
      service.applyCreatedColumn(PROJECT_ID, makeColumnDto());
      expect(service.columns()).toEqual([]);
    });

    it('appends a new column and preserves ascending columnOrder', () => {
      service.enterBoard(PROJECT_ID);
      // Seed with columns at order 1 and 3 so an order-2 insert lands in the middle.
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-a',
        name: 'A',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-c',
        name: 'C',
        colorCode: null,
        columnOrder: 3,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });

      service.applyCreatedColumn(
        PROJECT_ID,
        makeColumnDto({ id: 'col-b', name: 'B', columnOrder: 2 })
      );

      expect(service.columns().map(c => c.id)).toEqual(['col-a', 'col-b', 'col-c']);
    });

    it('drops createdAt / updatedAt from the projected BoardColumn', () => {
      service.enterBoard(PROJECT_ID);
      service.applyCreatedColumn(PROJECT_ID, makeColumnDto({ id: 'col-new' }));
      const stored = service.columns()[0];
      expect(stored).toEqual({
        id: 'col-new',
        name: 'Blocked',
        colorCode: null,
        columnOrder: 3,
        projectId: PROJECT_ID
      });
      // Belt-and-braces: no stray timestamp fields survive the projection.
      expect(stored as unknown as { createdAt?: string }).not.toHaveProperty('createdAt');
      expect(stored as unknown as { updatedAt?: string }).not.toHaveProperty('updatedAt');
    });

    it('is idempotent — calling it twice with the same DTO leaves a single column in state', () => {
      service.enterBoard(PROJECT_ID);
      const dto = makeColumnDto({ id: 'col-new', columnOrder: 1 });
      service.applyCreatedColumn(PROJECT_ID, dto);
      service.applyCreatedColumn(PROJECT_ID, dto);
      expect(service.columns().length).toBe(1);
      expect(service.columns()[0].id).toBe('col-new');
    });

    it('applyCreatedColumn + subsequent ColumnCreated echo with the same id does not double-insert', () => {
      service.enterBoard(PROJECT_ID);

      // Client-side HTTP-success path.
      service.applyCreatedColumn(
        PROJECT_ID,
        makeColumnDto({ id: 'col-echo', name: 'Echo', columnOrder: 2 })
      );
      expect(service.columns().length).toBe(1);

      // SignalR echo of the same id — shared helper dedupes by id.
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-echo',
        name: 'Echo',
        colorCode: null,
        columnOrder: 2,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.columns().length).toBe(1);
    });

    it('ColumnCreated echo received BEFORE applyCreatedColumn still dedupes on the subsequent HTTP success', () => {
      service.enterBoard(PROJECT_ID);

      // Echo lands first (rare but possible under slow local CPU + fast signalR).
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-early',
        name: 'Early',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.columns().length).toBe(1);

      // HTTP success reply carries the same id — must not double-insert.
      service.applyCreatedColumn(
        PROJECT_ID,
        makeColumnDto({ id: 'col-early', name: 'Early', columnOrder: 1 })
      );
      expect(service.columns().length).toBe(1);
    });

    it('is a safe no-op on a null/undefined dto (defensive)', () => {
      service.enterBoard(PROJECT_ID);
      expect(() =>
        service.applyCreatedColumn(PROJECT_ID, null as unknown as ColumnResponseDto)
      ).not.toThrow();
      expect(() =>
        service.applyCreatedColumn(PROJECT_ID, undefined as unknown as ColumnResponseDto)
      ).not.toThrow();
      expect(service.columns()).toEqual([]);
    });

    it('applyCreatedColumn + out-of-order ColumnCreated with a DIFFERENT id both appear, sorted by columnOrder', () => {
      // Tech-spec QA case: "Two tabs / concurrent echo — `applyCreatedColumn`
      // then an out-of-order `ColumnCreated` with a DIFFERENT id → both
      // appear, sorted by `columnOrder`."
      service.enterBoard(PROJECT_ID);

      // Client's own HTTP success — arrives first, columnOrder 2.
      service.applyCreatedColumn(
        PROJECT_ID,
        makeColumnDto({ id: 'col-mine', name: 'Mine', columnOrder: 2 })
      );
      // Another user's column — echoes in after, with a smaller columnOrder.
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: 'col-theirs',
        name: 'Theirs',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });

      // Both present, sorted ascending by columnOrder — the lower-order
      // "Theirs" lands in front despite arriving second.
      expect(service.columns().map(c => c.id)).toEqual(['col-theirs', 'col-mine']);
      expect(service.columns().map(c => c.columnOrder)).toEqual([1, 2]);
    });
  });

  describe('applyCreatedTask() (issue #78)', () => {
    const COLUMN_ID = 'col-1';
    const makeTaskDto = (partial?: Partial<TaskResponseDto>): TaskResponseDto => ({
      id: 't-new',
      title: 'Wire up onboarding flow',
      content: null,
      taskOrder: 2,
      columnId: COLUMN_ID,
      assignedId: null,
      createdAt: '2026-05-04T00:00:00Z',
      updatedAt: '2026-05-04T00:00:00Z',
      ...partial
    });

    const seedProjectAndColumn = () => {
      service.enterBoard(PROJECT_ID);
      signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
        id: COLUMN_ID,
        name: 'To Do',
        colorCode: null,
        columnOrder: 1,
        projectId: PROJECT_ID,
        createdAt: '',
        updatedAt: ''
      });
    };

    it('is a no-op when projectId does not match currentProjectId', () => {
      seedProjectAndColumn();
      service.applyCreatedTask(OTHER_PROJECT_ID, makeTaskDto());
      expect(service.tasksByColumnId()[COLUMN_ID] ?? []).toEqual([]);
    });

    it('is a no-op when the target column is not in state', () => {
      seedProjectAndColumn();
      service.applyCreatedTask(PROJECT_ID, makeTaskDto({ columnId: 'col-ghost' }));
      expect(service.tasksByColumnId()['col-ghost']).toBeUndefined();
    });

    it('is a no-op when a task with the same id already exists in that bucket', () => {
      seedProjectAndColumn();
      // Seed an existing task via SignalR first.
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-existing',
        title: 'existing',
        content: null,
        taskOrder: 1,
        columnId: COLUMN_ID,
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()[COLUMN_ID].length).toBe(1);

      service.applyCreatedTask(
        PROJECT_ID,
        makeTaskDto({ id: 't-existing', title: 'should-not-replace' })
      );

      // Still one entry, original title preserved.
      const bucket = service.tasksByColumnId()[COLUMN_ID];
      expect(bucket.length).toBe(1);
      expect(bucket[0].title).toBe('existing');
    });

    it('appends a new task and preserves taskOrder ascending', () => {
      seedProjectAndColumn();
      // Seed two tasks at orders 0 and 3.
      for (const order of [0, 3]) {
        signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
          id: `t-${order}`,
          title: `t${order}`,
          content: null,
          taskOrder: order,
          columnId: COLUMN_ID,
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        });
      }
      // Insert a task at order 2 — should land between them.
      service.applyCreatedTask(PROJECT_ID, makeTaskDto({ id: 't-2', taskOrder: 2 }));
      const bucket = service.tasksByColumnId()[COLUMN_ID];
      expect(bucket.map(t => t.id)).toEqual(['t-0', 't-2', 't-3']);
    });

    it('drops createdAt / updatedAt from the projected BoardTask', () => {
      seedProjectAndColumn();
      service.applyCreatedTask(PROJECT_ID, makeTaskDto({ id: 't-proj' }));
      const stored = service.tasksByColumnId()[COLUMN_ID][0];
      expect(stored).toEqual({
        id: 't-proj',
        title: 'Wire up onboarding flow',
        content: null,
        taskOrder: 2,
        columnId: COLUMN_ID,
        assignedId: null
      });
      expect(stored as unknown as { createdAt?: string }).not.toHaveProperty('createdAt');
      expect(stored as unknown as { updatedAt?: string }).not.toHaveProperty('updatedAt');
    });

    it('applyCreatedTask + subsequent TaskCreated echo with the same id does not double-insert', () => {
      seedProjectAndColumn();
      // Client-side HTTP-success path.
      service.applyCreatedTask(
        PROJECT_ID,
        makeTaskDto({ id: 't-echo', title: 'Echo', taskOrder: 0 })
      );
      expect(service.tasksByColumnId()[COLUMN_ID].length).toBe(1);

      // SignalR echo of the same id — shared helper dedupes by id.
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-echo',
        title: 'Echo',
        content: null,
        taskOrder: 0,
        columnId: COLUMN_ID,
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()[COLUMN_ID].length).toBe(1);
    });

    it('is a safe no-op on a null/undefined dto (defensive)', () => {
      seedProjectAndColumn();
      expect(() =>
        service.applyCreatedTask(PROJECT_ID, null as unknown as TaskResponseDto)
      ).not.toThrow();
      expect(() =>
        service.applyCreatedTask(PROJECT_ID, undefined as unknown as TaskResponseDto)
      ).not.toThrow();
      expect(service.tasksByColumnId()[COLUMN_ID] ?? []).toEqual([]);
    });
  });

  describe('applyOptimisticTaskMove() (issue #47)', () => {
    beforeEach(() => {
      service.enterBoard(PROJECT_ID);
      for (const [id, order] of [
        ['col-1', 1],
        ['col-2', 2]
      ] as const) {
        signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
          id,
          name: id,
          colorCode: null,
          columnOrder: order,
          projectId: PROJECT_ID,
          createdAt: '',
          updatedAt: ''
        });
      }
      // Seed col-1 with three tasks, col-2 with one.
      for (const i of [0, 1, 2]) {
        signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
          id: `t-${i}`,
          title: `Task ${i}`,
          content: null,
          taskOrder: i,
          columnId: 'col-1',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        });
      }
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-other',
        title: 'Other',
        content: null,
        taskOrder: 0,
        columnId: 'col-2',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
    });

    it('within-column reorder: moves task, renumbers, returns token', () => {
      const token = service.applyOptimisticTaskMove('t-2', 'col-1', 2, 'col-1', 0);
      expect(token).not.toBeNull();
      const bucket = service.tasksByColumnId()['col-1'];
      expect(bucket.map(t => t.id)).toEqual(['t-2', 't-0', 't-1']);
      expect(bucket.map(t => t.taskOrder)).toEqual([0, 1, 2]);
    });

    it('cross-column move: mutates both buckets and renumbers', () => {
      const token = service.applyOptimisticTaskMove('t-0', 'col-1', 0, 'col-2', 0);
      expect(token).not.toBeNull();
      const buckets = service.tasksByColumnId();
      expect(buckets['col-1'].map(t => t.id)).toEqual(['t-1', 't-2']);
      expect(buckets['col-1'].map(t => t.taskOrder)).toEqual([0, 1]);
      expect(buckets['col-2'].map(t => t.id)).toEqual(['t-0', 't-other']);
      expect(buckets['col-2'].map(t => t.taskOrder)).toEqual([0, 1]);
      // The moved task now has columnId updated to the destination.
      expect(buckets['col-2'][0].columnId).toBe('col-2');
    });

    it('returns a token carrying the pre-move snapshots for both buckets', () => {
      const before = service.tasksByColumnId();
      const fromBefore = [...before['col-1']];
      const toBefore = [...before['col-2']];

      const token = service.applyOptimisticTaskMove('t-0', 'col-1', 0, 'col-2', 1);
      expect(token).not.toBeNull();
      expect(token?.fromColumnId).toBe('col-1');
      expect(token?.toColumnId).toBe('col-2');
      expect(token?.fromBucket).toEqual(fromBefore);
      expect(token?.toBucket).toEqual(toBefore);
    });

    it('returns null and does not mutate state on no-op same-column same-order', () => {
      const before = service.tasksByColumnId();
      const token = service.applyOptimisticTaskMove('t-0', 'col-1', 0, 'col-1', 0);
      expect(token).toBeNull();
      expect(service.tasksByColumnId()).toBe(before);
    });

    it('returns null when taskId is not present in the source bucket', () => {
      const token = service.applyOptimisticTaskMove('t-unknown', 'col-1', 0, 'col-2', 0);
      expect(token).toBeNull();
    });

    it('returns null when currentProjectId is null', () => {
      service.leaveBoard();
      const token = service.applyOptimisticTaskMove('t-0', 'col-1', 0, 'col-2', 0);
      expect(token).toBeNull();
    });
  });

  describe('rollbackOptimisticTaskMove() (issue #47)', () => {
    beforeEach(() => {
      service.enterBoard(PROJECT_ID);
      for (const [id, order] of [
        ['col-1', 1],
        ['col-2', 2]
      ] as const) {
        signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
          id,
          name: id,
          colorCode: null,
          columnOrder: order,
          projectId: PROJECT_ID,
          createdAt: '',
          updatedAt: ''
        });
      }
      for (const i of [0, 1]) {
        signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
          id: `t-${i}`,
          title: `Task ${i}`,
          content: null,
          taskOrder: i,
          columnId: 'col-1',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        });
      }
    });

    it('restores the exact pre-apply buckets after apply + rollback', () => {
      const snapshot = service.tasksByColumnId();
      const before1 = [...(snapshot['col-1'] ?? [])];
      const before2 = [...(snapshot['col-2'] ?? [])];

      const token = service.applyOptimisticTaskMove('t-0', 'col-1', 0, 'col-2', 0);
      expect(token).not.toBeNull();
      // Sanity: state changed.
      expect(service.tasksByColumnId()['col-2']?.length).toBeGreaterThan(before2.length);

      service.rollbackOptimisticTaskMove(token!);

      expect(service.tasksByColumnId()['col-1']).toEqual(before1);
      expect(service.tasksByColumnId()['col-2']).toEqual(before2);
    });

    it('is a no-op when token.projectId does not match currentProjectId', () => {
      const token = service.applyOptimisticTaskMove('t-0', 'col-1', 0, 'col-2', 0);
      expect(token).not.toBeNull();
      const midState = service.tasksByColumnId();

      // Navigate away.
      service.enterBoard(OTHER_PROJECT_ID);
      // Token was for PROJECT_ID — rollback should no-op against the new board.
      service.rollbackOptimisticTaskMove(token!);

      // We navigated away so the new board has empty buckets — and nothing
      // the rollback could restore. State must not regain the old bucket.
      expect(service.tasksByColumnId()).not.toEqual(midState);
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('within-column rollback restores only the single affected bucket', () => {
      const token = service.applyOptimisticTaskMove('t-1', 'col-1', 1, 'col-1', 0);
      expect(token).not.toBeNull();
      service.rollbackOptimisticTaskMove(token!);
      expect(service.tasksByColumnId()['col-1'].map(t => t.id)).toEqual(['t-0', 't-1']);
    });
  });

  describe('reconcileServerTaskMove() (issue #47)', () => {
    beforeEach(() => {
      service.enterBoard(PROJECT_ID);
      for (const [id, order] of [
        ['col-1', 1],
        ['col-2', 2]
      ] as const) {
        signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
          id,
          name: id,
          colorCode: null,
          columnOrder: order,
          projectId: PROJECT_ID,
          createdAt: '',
          updatedAt: ''
        });
      }
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-0',
        title: 'T0',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
    });

    it('is a safe idempotent no-op when the server DTO matches state', () => {
      // Optimistically move into col-2 at order 0.
      service.applyOptimisticTaskMove('t-0', 'col-1', 0, 'col-2', 0);
      const serverDto: TaskResponseDto = {
        id: 't-0',
        title: 'T0',
        content: null,
        taskOrder: 0,
        columnId: 'col-2',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      };
      service.reconcileServerTaskMove(serverDto);
      const bucket = service.tasksByColumnId()['col-2'];
      expect(bucket.length).toBe(1);
      expect(bucket[0].id).toBe('t-0');
      expect(bucket[0].taskOrder).toBe(0);
    });

    it('re-sorts the destination bucket when the server normalises taskOrder', () => {
      // Seed col-2 with an existing task at order 0.
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-other',
        title: 'Other',
        content: null,
        taskOrder: 0,
        columnId: 'col-2',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      // Optimistically insert t-0 at col-2 index 0 (so t-other is at 1 locally).
      service.applyOptimisticTaskMove('t-0', 'col-1', 0, 'col-2', 0);
      // Server normalises t-0 to the tail (taskOrder 5 — arbitrarily bigger than
      // anything else in the column).
      const serverDto: TaskResponseDto = {
        id: 't-0',
        title: 'T0',
        content: null,
        taskOrder: 5,
        columnId: 'col-2',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      };
      service.reconcileServerTaskMove(serverDto);
      const bucket = service.tasksByColumnId()['col-2'];
      expect(bucket.map(t => t.id)[bucket.length - 1]).toBe('t-0');
      expect(bucket.find(t => t.id === 't-0')?.taskOrder).toBe(5);
    });

    it('is a no-op when the response columnId is not known to local state', () => {
      const before = service.tasksByColumnId();
      service.reconcileServerTaskMove({
        id: 't-0',
        title: 'T0',
        content: null,
        taskOrder: 0,
        columnId: 'col-ghost',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      expect(service.tasksByColumnId()).toEqual(before);
    });

    it('is a no-op when currentProjectId is null', () => {
      service.leaveBoard();
      service.reconcileServerTaskMove({
        id: 't-0',
        title: 'T0',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      // No throws; buckets remain cleared by leaveBoard.
      expect(service.tasksByColumnId()).toEqual({});
    });
  });

  describe('Echo idempotency with onTaskMoved (issue #47 ↔ #46)', () => {
    it('optimistic move + reconcile + echoed TaskMoved leaves the task in exactly one place', () => {
      service.enterBoard(PROJECT_ID);
      for (const [id, order] of [
        ['col-A', 1],
        ['col-B', 2]
      ] as const) {
        signalRMock.emit<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated, {
          id,
          name: id,
          colorCode: null,
          columnOrder: order,
          projectId: PROJECT_ID,
          createdAt: '',
          updatedAt: ''
        });
      }
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 'T',
        title: 'The task',
        content: null,
        taskOrder: 0,
        columnId: 'col-A',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });

      // Optimistic drag from col-A order 0 to col-B order 0.
      const token = service.applyOptimisticTaskMove('T', 'col-A', 0, 'col-B', 0);
      expect(token).not.toBeNull();

      // Server response (reconcile).
      service.reconcileServerTaskMove({
        id: 'T',
        title: 'The task',
        content: null,
        taskOrder: 0,
        columnId: 'col-B',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });

      // Echo broadcast lands after.
      signalRMock.emit<TaskMovedEvent>(REALTIME_EVENT.TaskMoved, {
        taskId: 'T',
        oldColumnId: 'col-A',
        newColumnId: 'col-B',
        oldTaskOrder: 0,
        newTaskOrder: 0,
        task: {
          id: 'T',
          title: 'The task',
          content: null,
          taskOrder: 0,
          columnId: 'col-B',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        }
      });

      const buckets = service.tasksByColumnId();
      expect(buckets['col-A']?.filter(t => t.id === 'T') ?? []).toEqual([]);
      expect(buckets['col-B']?.filter(t => t.id === 'T') ?? []).toHaveLength(1);
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

  // ----------------------------------------------------------------------
  // Issue #96 — delete column/task state surface
  // ----------------------------------------------------------------------

  describe('applyDeletedColumn() cascade invariant (issue #96)', () => {
    it('drops the task bucket even when the column holds tasks (cascade)', () => {
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
      for (const id of ['t-a', 't-b', 't-c']) {
        signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
          id,
          title: id,
          content: null,
          taskOrder: 1,
          columnId: 'col-1',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        });
      }
      expect(service.tasksByColumnId()['col-1']).toHaveLength(3);

      service.applyDeletedColumn('col-1');

      // Cascade invariant: entire bucket dropped with no per-task TaskDeleted.
      expect(service.columns()).toEqual([]);
      expect(service.tasksByColumnId()['col-1']).toBeUndefined();
    });

    it('is a silent no-op when the column is not in state', () => {
      service.enterBoard(PROJECT_ID);
      expect(() => service.applyDeletedColumn('col-missing')).not.toThrow();
      expect(service.columns()).toEqual([]);
    });
  });

  describe('applyDeletedTask() (issue #96)', () => {
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
      signalRMock.emit<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated, {
        id: 't-2',
        title: 'T2',
        content: null,
        taskOrder: 2,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
    });

    it('removes the task from its bucket and preserves siblings', () => {
      service.applyDeletedTask('t-1', 'col-1');
      const bucket = service.tasksByColumnId()['col-1'];
      expect(bucket.map(t => t.id)).toEqual(['t-2']);
    });

    it('drops the bucket key entirely when the last task is removed', () => {
      service.applyDeletedTask('t-1', 'col-1');
      service.applyDeletedTask('t-2', 'col-1');
      expect(service.tasksByColumnId()['col-1']).toBeUndefined();
    });

    it('is a silent no-op when the bucket is missing (absorbs stale events)', () => {
      expect(() => service.applyDeletedTask('t-stale', 'col-ghost')).not.toThrow();
      expect(service.tasksByColumnId()['col-1']).toHaveLength(2);
    });

    it('is a silent no-op when the task is not in the bucket (stale event after cascade)', () => {
      expect(() => service.applyDeletedTask('t-gone', 'col-1')).not.toThrow();
      expect(service.tasksByColumnId()['col-1']).toHaveLength(2);
    });
  });

  describe('onTaskDeleted() SignalR handler (issue #96)', () => {
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

    it('removes the task when the event arrives with a matching {taskId, columnId}', () => {
      signalRMock.emit<TaskDeletedEvent>(REALTIME_EVENT.TaskDeleted, {
        taskId: 't-1',
        columnId: 'col-1'
      });
      expect(service.tasksByColumnId()['col-1']).toBeUndefined();
    });

    it('is a silent no-op when currentProjectId is null (post-leaveBoard)', () => {
      service.leaveBoard();
      expect(() =>
        signalRMock.emit<TaskDeletedEvent>(REALTIME_EVENT.TaskDeleted, {
          taskId: 't-1',
          columnId: 'col-1'
        })
      ).not.toThrow();
      expect(service.tasksByColumnId()).toEqual({});
    });

    it('is a silent no-op for an unknown task id', () => {
      signalRMock.emit<TaskDeletedEvent>(REALTIME_EVENT.TaskDeleted, {
        taskId: 't-ghost',
        columnId: 'col-1'
      });
      expect(service.tasksByColumnId()['col-1']).toHaveLength(1);
    });

    it('is a silent no-op on malformed payloads', () => {
      expect(() => {
        signalRMock.emit(REALTIME_EVENT.TaskDeleted, undefined as unknown as TaskDeletedEvent);
        signalRMock.emit(REALTIME_EVENT.TaskDeleted, {} as TaskDeletedEvent);
        signalRMock.emit(REALTIME_EVENT.TaskDeleted, {
          taskId: undefined as unknown as string,
          columnId: 'col-1'
        } as TaskDeletedEvent);
      }).not.toThrow();
      expect(service.tasksByColumnId()['col-1']).toHaveLength(1);
    });

    it('absorbs a stale TaskDeleted that arrives after the column has been cascaded (#96 edge 8)', () => {
      // ColumnDeleted (cascade) fires first, clearing the bucket without
      // emitting per-child TaskDeleted. A late TaskDeleted for a task that
      // *was* in that bucket must be a no-op.
      signalRMock.emit<ColumnDeletedEvent>(REALTIME_EVENT.ColumnDeleted, {
        columnId: 'col-1',
        projectId: PROJECT_ID
      });
      expect(service.tasksByColumnId()['col-1']).toBeUndefined();

      expect(() =>
        signalRMock.emit<TaskDeletedEvent>(REALTIME_EVENT.TaskDeleted, {
          taskId: 't-1',
          columnId: 'col-1'
        })
      ).not.toThrow();
      // Still no bucket, still no columns.
      expect(service.tasksByColumnId()).toEqual({});
      expect(service.columns()).toEqual([]);
    });
  });

  describe('deleteColumn() / deleteTask() HTTP wrappers (issue #96)', () => {
    let columnsApiMock: { deleteColumn: ReturnType<typeof vi.fn> };
    let tasksApiMock: { deleteTask: ReturnType<typeof vi.fn> };
    let localService: BoardStateService;

    beforeEach(() => {
      columnsApiMock = { deleteColumn: vi.fn() };
      tasksApiMock = { deleteTask: vi.fn() };
      TestBed.resetTestingModule();
      signalRMock = createMockSignalRService('connected');
      projectsSig = signal<ProjectSummary[]>([makeProject({ id: PROJECT_ID })]);

      TestBed.configureTestingModule({
        providers: [
          BoardStateService,
          { provide: SignalRService, useValue: signalRMock },
          {
            provide: ProjectStateService,
            useValue: {
              projects: projectsSig.asReadonly(),
              isLoading: signal(false),
              error: signal<string | null>(null),
              hasLoaded: signal(true),
              loadProjects: () => undefined
            }
          },
          { provide: ColumnsApiService, useValue: columnsApiMock },
          { provide: TasksApiService, useValue: tasksApiMock }
        ]
      });
      localService = TestBed.inject(BoardStateService);
      TestBed.flushEffects();
      localService.enterBoard(PROJECT_ID);
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

    it('deleteColumn success path delegates to the API and applies local removal', () => {
      columnsApiMock.deleteColumn.mockReturnValue(of(undefined));
      let completed = false;
      localService.deleteColumn('col-1').subscribe({ complete: () => (completed = true) });

      expect(columnsApiMock.deleteColumn).toHaveBeenCalledWith('col-1');
      expect(completed).toBe(true);
      expect(localService.columns()).toEqual([]);
      expect(localService.tasksByColumnId()['col-1']).toBeUndefined();
    });

    it('deleteColumn error path re-throws the raw HttpErrorResponse and leaves state intact', () => {
      const err = new HttpErrorResponse({ status: 500, statusText: 'x' });
      columnsApiMock.deleteColumn.mockReturnValue(throwError(() => err));
      let caught: unknown;
      localService.deleteColumn('col-1').subscribe({
        next: () => {},
        error: e => (caught = e)
      });
      expect(caught).toBe(err);
      // No state mutation on error — the caller handles copy mapping.
      expect(localService.columns().map(c => c.id)).toEqual(['col-1']);
      expect(localService.tasksByColumnId()['col-1']).toHaveLength(1);
    });

    it('deleteTask success path delegates to the API and applies local removal', () => {
      tasksApiMock.deleteTask.mockReturnValue(of(undefined));
      let completed = false;
      localService.deleteTask('t-1', 'col-1').subscribe({ complete: () => (completed = true) });

      expect(tasksApiMock.deleteTask).toHaveBeenCalledWith('t-1');
      expect(completed).toBe(true);
      expect(localService.tasksByColumnId()['col-1']).toBeUndefined();
    });

    it('deleteTask error path re-throws the raw HttpErrorResponse and leaves state intact', () => {
      const err = new HttpErrorResponse({ status: 403, statusText: 'x' });
      tasksApiMock.deleteTask.mockReturnValue(throwError(() => err));
      let caught: unknown;
      localService.deleteTask('t-1', 'col-1').subscribe({
        next: () => {},
        error: e => (caught = e)
      });
      expect(caught).toBe(err);
      expect(localService.tasksByColumnId()['col-1']).toHaveLength(1);
    });
  });
});
