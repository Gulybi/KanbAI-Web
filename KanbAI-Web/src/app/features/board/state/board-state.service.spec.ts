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
import { BoardColumn } from './board-state.model';
import { TaskResponseDto } from '../models/task.model';
import { ColumnResponseDto } from '../models/column.model';

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
});
