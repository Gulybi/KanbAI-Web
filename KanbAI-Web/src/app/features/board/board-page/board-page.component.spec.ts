import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { WritableSignal, signal } from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { Dialog } from '@angular/cdk/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { BoardPageComponent } from './board-page.component';
import { BoardStateService } from '../state/board-state.service';
import { ColumnsApiService } from '../services/columns-api.service';
import { TasksApiService } from '../services/tasks-api.service';
import { AttachmentsStateService } from '../../attachments/state/attachments-state.service';
import { ProjectsApiService } from '../../projects/services/projects-api.service';
import { ProjectStateService } from '../../projects/state/project-state.service';
import { ToastService } from '../../../core/services/toast.service';
import { ProjectSummary } from '../../projects/models/project.model';
import { DeleteProjectConfirmDialogComponent } from '../../projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component';
import { DeleteColumnConfirmDialogComponent } from '../components/delete-column-confirm-dialog/delete-column-confirm-dialog.component';
import { DeleteTaskConfirmDialogComponent } from '../components/delete-task-confirm-dialog/delete-task-confirm-dialog.component';
import {
  BoardColumn,
  BoardTask,
  OptimisticMoveToken
} from '../state/board-state.model';
import { ColumnResponseDto } from '../models/column.model';
import { TaskResponseDto, MoveTaskDto } from '../models/task.model';

interface BoardStateMock {
  currentProjectId: WritableSignal<string | null>;
  columns: WritableSignal<BoardColumn[]>;
  tasksByColumnId: WritableSignal<Record<string, BoardTask[]>>;
  enterBoard: ReturnType<typeof vi.fn>;
  leaveBoard: ReturnType<typeof vi.fn>;
  setColumns: ReturnType<typeof vi.fn>;
  setTasks: ReturnType<typeof vi.fn>;
  applyOptimisticTaskMove: ReturnType<typeof vi.fn>;
  rollbackOptimisticTaskMove: ReturnType<typeof vi.fn>;
  reconcileServerTaskMove: ReturnType<typeof vi.fn>;
  applyCreatedColumn: ReturnType<typeof vi.fn>;
  applyCreatedTask: ReturnType<typeof vi.fn>;
}

interface ColumnsApiMock {
  getColumnsForProject: ReturnType<typeof vi.fn>;
  createColumn: ReturnType<typeof vi.fn>;
}

interface TasksApiMock {
  moveTask: ReturnType<typeof vi.fn>;
  createTask: ReturnType<typeof vi.fn>;
  getTasksForProject: ReturnType<typeof vi.fn>;
}

interface AttachmentsStateMock {
  startUpload: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
  hydrateCompletedForTask: ReturnType<typeof vi.fn>;
  uploadsByTaskId: WritableSignal<Record<string, unknown[]>>;
  completedByTaskId: WritableSignal<Record<string, unknown[]>>;
  completedFetchByTaskId: WritableSignal<Record<string, unknown>>;
  uploadsForTask: (taskId: string) => WritableSignal<unknown[]>;
  isUploadingForTask: (taskId: string) => WritableSignal<boolean>;
}

function createMockAttachmentsState(): AttachmentsStateMock {
  const uploadsByTaskId = signal<Record<string, unknown[]>>({});
  const completedByTaskId = signal<Record<string, unknown[]>>({});
  const completedFetchByTaskId = signal<Record<string, unknown>>({});
  return {
    startUpload: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    dismiss: vi.fn(),
    hydrateCompletedForTask: vi.fn(),
    uploadsByTaskId,
    completedByTaskId,
    completedFetchByTaskId,
    uploadsForTask: () => signal<unknown[]>([]),
    isUploadingForTask: () => signal<boolean>(false)
  };
}

function createMockBoardState(): BoardStateMock {
  const columns = signal<BoardColumn[]>([]);
  const tasksByColumnId = signal<Record<string, BoardTask[]>>({});
  const currentProjectId = signal<string | null>(null);
  return {
    currentProjectId,
    columns,
    tasksByColumnId,
    enterBoard: vi.fn((projectId: string) => currentProjectId.set(projectId)),
    leaveBoard: vi.fn(() => currentProjectId.set(null)),
    setColumns: vi.fn((_projectId: string, cols: BoardColumn[]) => columns.set(cols)),
    setTasks: vi.fn((projectId: string, dtos: TaskResponseDto[]) => {
      if (currentProjectId() !== projectId) {
        return;
      }
      const allowed = new Set(columns().map(c => c.id));
      const next: Record<string, BoardTask[]> = {};
      for (const dto of dtos) {
        if (!allowed.has(dto.columnId)) {
          continue;
        }
        const projected: BoardTask = {
          id: dto.id,
          title: dto.title,
          content: dto.content,
          taskOrder: dto.taskOrder,
          columnId: dto.columnId,
          assignedId: dto.assignedId
        };
        (next[dto.columnId] ??= []).push(projected);
      }
      for (const key of Object.keys(next)) {
        next[key].sort((a, b) => a.taskOrder - b.taskOrder);
      }
      tasksByColumnId.set(next);
    }),
    applyOptimisticTaskMove: vi.fn(
      (
        _taskId: string,
        fromColumnId: string,
        _fromOrder: number,
        toColumnId: string,
        _toOrder: number
      ): OptimisticMoveToken | null => ({
        projectId: currentProjectId() ?? '',
        fromColumnId,
        toColumnId,
        fromBucket: [],
        toBucket: []
      })
    ),
    rollbackOptimisticTaskMove: vi.fn(),
    reconcileServerTaskMove: vi.fn(),
    applyCreatedColumn: vi.fn(
      (projectId: string, dto: ColumnResponseDto): void => {
        if (currentProjectId() !== projectId) {
          return;
        }
        const existing = columns();
        if (existing.some(c => c.id === dto.id)) {
          return;
        }
        const next = [
          ...existing,
          {
            id: dto.id,
            name: dto.name,
            colorCode: dto.colorCode,
            columnOrder: dto.columnOrder,
            projectId: dto.projectId
          }
        ].sort((a, b) => a.columnOrder - b.columnOrder);
        columns.set(next);
      }
    ),
    applyCreatedTask: vi.fn(
      (projectId: string, dto: TaskResponseDto): void => {
        if (currentProjectId() !== projectId) {
          return;
        }
        const columnExists = columns().some(c => c.id === dto.columnId);
        if (!columnExists) {
          return;
        }
        const current = tasksByColumnId();
        const bucket = current[dto.columnId] ?? [];
        if (bucket.some(t => t.id === dto.id)) {
          return;
        }
        const appended = [
          ...bucket,
          {
            id: dto.id,
            title: dto.title,
            content: dto.content,
            taskOrder: dto.taskOrder,
            columnId: dto.columnId,
            assignedId: dto.assignedId
          }
        ].sort((a, b) => a.taskOrder - b.taskOrder);
        tasksByColumnId.set({ ...current, [dto.columnId]: appended });
      }
    )
  };
}

function createMockColumnsApi(
  result: Observable<ColumnResponseDto[]>,
  createResult?: Observable<ColumnResponseDto>
): ColumnsApiMock {
  return {
    getColumnsForProject: vi.fn().mockReturnValue(result),
    createColumn: vi.fn().mockReturnValue(
      createResult ??
        of({
          id: 'col-new',
          name: 'Blocked',
          colorCode: null,
          columnOrder: 3,
          projectId: 'p-1',
          createdAt: '2026-05-04T00:00:00Z',
          updatedAt: '2026-05-04T00:00:00Z'
        } as ColumnResponseDto)
    )
  };
}

function createMockTasksApi(
  result: Observable<TaskResponseDto>,
  createResult?: Observable<TaskResponseDto>,
  tasksForProjectResult?: Observable<TaskResponseDto[]>
): TasksApiMock {
  return {
    moveTask: vi.fn().mockReturnValue(result),
    createTask: vi.fn().mockReturnValue(
      createResult ??
        of({
          id: 't-new',
          title: 'New task',
          content: null,
          taskOrder: 0,
          columnId: 'col-1',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        } as TaskResponseDto)
    ),
    getTasksForProject: vi.fn().mockReturnValue(tasksForProjectResult ?? of([]))
  };
}

function createFakeActivatedRoute(projectId: string | null): ActivatedRoute {
  const paramMap = convertToParamMap(projectId === null ? {} : { projectId });
  return {
    snapshot: { paramMap }
  } as unknown as ActivatedRoute;
}

interface MountOptions {
  projectId?: string | null;
  columnsApiResult?: Observable<ColumnResponseDto[]>;
  createColumnResult?: Observable<ColumnResponseDto>;
  tasksApiResult?: Observable<TaskResponseDto>;
  createTaskResult?: Observable<TaskResponseDto>;
  getTasksForProjectResult?: Observable<TaskResponseDto[]>;
}

async function mount(options: MountOptions = {}): Promise<{
  fixture: ComponentFixture<BoardPageComponent>;
  component: BoardPageComponent;
  attachmentsState: AttachmentsStateMock;
  boardState: BoardStateMock;
  columnsApi: ColumnsApiMock;
  tasksApi: TasksApiMock;
}> {
  TestBed.resetTestingModule();
  const boardState = createMockBoardState();
  const columnsApi = createMockColumnsApi(
    options.columnsApiResult ?? of([]),
    options.createColumnResult
  );
  const tasksApi = createMockTasksApi(
    options.tasksApiResult ??
      of({
        id: 't-1',
        title: 'x',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      }),
    options.createTaskResult,
    options.getTasksForProjectResult
  );
  const attachmentsState = createMockAttachmentsState();

  await TestBed.configureTestingModule({
    imports: [BoardPageComponent],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: createFakeActivatedRoute(
          options.projectId === undefined ? 'p-1' : options.projectId
        )
      },
      { provide: BoardStateService, useValue: boardState },
      { provide: ColumnsApiService, useValue: columnsApi },
      { provide: TasksApiService, useValue: tasksApi },
      { provide: AttachmentsStateService, useValue: attachmentsState }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(BoardPageComponent);
  return {
    fixture,
    component: fixture.componentInstance,
    attachmentsState,
    boardState,
    columnsApi,
    tasksApi
  };
}

function makeColumnDto(partial?: Partial<ColumnResponseDto>): ColumnResponseDto {
  return {
    id: 'col-1',
    name: 'To Do',
    colorCode: null,
    columnOrder: 1,
    projectId: 'p-1',
    createdAt: '2026-05-04T00:00:00Z',
    updatedAt: '2026-05-04T00:00:00Z',
    ...partial
  };
}

function makeTask(partial?: Partial<BoardTask>): BoardTask {
  return {
    id: 't-1',
    title: 'T1',
    content: null,
    taskOrder: 0,
    columnId: 'col-1',
    assignedId: null,
    ...partial
  };
}

describe('BoardPageComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Lifecycle', () => {
    it('calls enterBoard(projectId) then fetches columns', async () => {
      const dtos = [makeColumnDto()];
      const { fixture, boardState, columnsApi } = await mount({
        columnsApiResult: of(dtos)
      });

      fixture.detectChanges();

      expect(boardState.enterBoard).toHaveBeenCalledWith('p-1');
      expect(columnsApi.getColumnsForProject).toHaveBeenCalledWith('p-1');
    });

    it('calls leaveBoard() on destroy', async () => {
      const { fixture, boardState } = await mount();
      fixture.detectChanges();
      fixture.destroy();
      expect(boardState.leaveBoard).toHaveBeenCalled();
    });

    it('does not call enterBoard when the projectId param is absent', async () => {
      const { fixture, boardState, columnsApi } = await mount({ projectId: null });
      fixture.detectChanges();
      expect(boardState.enterBoard).not.toHaveBeenCalled();
      expect(columnsApi.getColumnsForProject).not.toHaveBeenCalled();
    });

    it('does not call enterBoard when the projectId param is empty', async () => {
      const { fixture, boardState, columnsApi } = await mount({ projectId: '' });
      fixture.detectChanges();
      expect(boardState.enterBoard).not.toHaveBeenCalled();
      expect(columnsApi.getColumnsForProject).not.toHaveBeenCalled();
    });
  });

  describe('Initial column render', () => {
    it('calls setColumns on the state service with a projected BoardColumn[]', async () => {
      const dto = makeColumnDto({ id: 'c-a', name: 'A' });
      const { fixture, boardState } = await mount({ columnsApiResult: of([dto]) });

      fixture.detectChanges();

      expect(boardState.setColumns).toHaveBeenCalledTimes(1);
      const [, mapped] = boardState.setColumns.mock.calls[0];
      expect(mapped).toEqual([
        {
          id: 'c-a',
          name: 'A',
          colorCode: null,
          columnOrder: 1,
          projectId: 'p-1'
        }
      ]);
    });

    it('renders the cdkDropListGroup container when columns load with ≥1 column and no error', async () => {
      // Post-#77: the populated branch only renders once there is at least
      // one column. Zero-column loads fall into the empty-state branch.
      const { fixture } = await mount({
        columnsApiResult: of([makeColumnDto({ id: 'c-1' })])
      });
      fixture.detectChanges();
      const container = fixture.debugElement.query(By.css('.board-page__columns'));
      expect(container).toBeTruthy();
    });

    it('renders the block-level error panel when the column fetch fails', async () => {
      const err = new HttpErrorResponse({ status: 404, statusText: 'not found' });
      const { fixture } = await mount({ columnsApiResult: throwError(() => err) });

      fixture.detectChanges();

      const panel = fixture.debugElement.query(By.css('.board-page__load-error-panel'));
      expect(panel).toBeTruthy();
      expect(panel.nativeElement.getAttribute('role')).toBe('alert');
      const body = panel.query(By.css('.board-page__load-error-body'));
      expect(body.nativeElement.textContent).toContain('This project no longer exists.');
    });
  });

  describe('Drop orchestration', () => {
    it('no-op drag back to origin does NOT call moveTask and does NOT mutate state', async () => {
      const { fixture, component, boardState, tasksApi } = await mount();
      fixture.detectChanges();

      const task = makeTask();
      const event = {
        previousIndex: 3,
        currentIndex: 3,
        item: { data: task }
      } as unknown as CdkDragDrop<BoardTask[]>;

      component.handleTaskDropped('col-1', event);

      expect(boardState.applyOptimisticTaskMove).not.toHaveBeenCalled();
      expect(tasksApi.moveTask).not.toHaveBeenCalled();
    });

    it('no-op / cancelled drop sets dragAnnouncement to the verbatim cancel copy (design §4.8)', async () => {
      const { fixture, component } = await mount();
      fixture.detectChanges();

      component.handleTaskDropped('col-1', {
        previousIndex: 2,
        currentIndex: 2,
        item: { data: makeTask({ id: 't-1', title: 'Pick me', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);

      expect(component.dragAnnouncement()).toBe('Cancelled move of task Pick me.');
    });

    it('cross-column move calls applyOptimisticTaskMove then moveTask with the correct payload', async () => {
      const { fixture, component, boardState, tasksApi } = await mount();
      fixture.detectChanges();

      const task = makeTask({ id: 't-1', columnId: 'col-1' });
      const event = {
        previousIndex: 0,
        currentIndex: 2,
        item: { data: task }
      } as unknown as CdkDragDrop<BoardTask[]>;

      component.handleTaskDropped('col-2', event);

      expect(boardState.applyOptimisticTaskMove).toHaveBeenCalledWith(
        't-1',
        'col-1',
        0,
        'col-2',
        2
      );
      expect(tasksApi.moveTask).toHaveBeenCalledTimes(1);
      const [taskId, dto] = tasksApi.moveTask.mock.calls[0] as [string, MoveTaskDto];
      expect(taskId).toBe('t-1');
      expect(dto).toEqual({ columnId: 'col-2', taskOrder: 2 });
    });

    it('on HTTP success, calls reconcileServerTaskMove with the returned DTO', async () => {
      const serverDto: TaskResponseDto = {
        id: 't-1',
        title: 'T1',
        content: null,
        taskOrder: 5,
        columnId: 'col-2',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      };
      const { fixture, component, boardState } = await mount({
        tasksApiResult: of(serverDto)
      });
      fixture.detectChanges();

      component.handleTaskDropped('col-2', {
        previousIndex: 0,
        currentIndex: 0,
        item: { data: makeTask({ id: 't-1', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);

      expect(boardState.reconcileServerTaskMove).toHaveBeenCalledWith(serverDto);
    });

    it('within-column drop sets dragAnnouncement to the §4.8 within-column copy', async () => {
      const { fixture, component } = await mount({
        columnsApiResult: of([
          makeColumnDto({ id: 'col-1', name: 'To Do' })
        ]),
        tasksApiResult: of({
          id: 't-1',
          title: 'Solo',
          content: null,
          taskOrder: 2,
          columnId: 'col-1',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        })
      });
      fixture.detectChanges();

      component.handleTaskDropped('col-1', {
        previousIndex: 0,
        currentIndex: 2,
        item: { data: makeTask({ id: 't-1', title: 'Solo', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);

      expect(component.dragAnnouncement()).toBe(
        'Moved task Solo to position 3 in To Do.'
      );
    });

    it('cross-column drop sets dragAnnouncement to the §4.8 cross-column copy', async () => {
      const { fixture, component } = await mount({
        columnsApiResult: of([
          makeColumnDto({ id: 'col-1', name: 'To Do' }),
          makeColumnDto({ id: 'col-2', name: 'In Progress' })
        ]),
        tasksApiResult: of({
          id: 't-1',
          title: 'Crossing',
          content: null,
          taskOrder: 0,
          columnId: 'col-2',
          assignedId: null,
          createdAt: '',
          updatedAt: ''
        })
      });
      fixture.detectChanges();

      component.handleTaskDropped('col-2', {
        previousIndex: 1,
        currentIndex: 0,
        item: { data: makeTask({ id: 't-1', title: 'Crossing', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);

      expect(component.dragAnnouncement()).toBe(
        'Moved task Crossing to In Progress, position 1.'
      );
    });

    it('on HTTP failure, rolls back + surfaces verbatim error copy + flags rollback shake', async () => {
      const err = new HttpErrorResponse({ status: 403, statusText: 'forbidden' });
      const { fixture, component, boardState } = await mount({
        tasksApiResult: throwError(() => err)
      });
      fixture.detectChanges();

      component.handleTaskDropped('col-2', {
        previousIndex: 0,
        currentIndex: 0,
        item: { data: makeTask({ id: 't-1', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);

      expect(boardState.rollbackOptimisticTaskMove).toHaveBeenCalled();
      expect(component.moveError()).toBe(
        'You are no longer a member of this project and cannot move tasks.'
      );
      expect(component.rolledBackTaskId()).toBe('t-1');
      expect(component.rolledBackTrigger()).toBeGreaterThan(0);
    });

    it('auto-dismisses moveError after 5000 ms', async () => {
      vi.useFakeTimers();
      const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
      const { fixture, component } = await mount({
        tasksApiResult: throwError(() => err)
      });
      fixture.detectChanges();

      component.handleTaskDropped('col-2', {
        previousIndex: 0,
        currentIndex: 0,
        item: { data: makeTask({ id: 't-1', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);

      expect(component.moveError()).not.toBeNull();

      vi.advanceTimersByTime(5100);
      expect(component.moveError()).toBeNull();
    });

    it('clears moveError on the next successful drop', async () => {
      const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
      const tasksResult = new Subject<TaskResponseDto>();
      const { fixture, component, tasksApi } = await mount({
        tasksApiResult: throwError(() => err)
      });
      fixture.detectChanges();

      component.handleTaskDropped('col-2', {
        previousIndex: 0,
        currentIndex: 0,
        item: { data: makeTask({ id: 't-1', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);
      expect(component.moveError()).not.toBeNull();

      // Next drop — swap the mock to a success result.
      tasksApi.moveTask.mockReturnValue(tasksResult.asObservable());
      component.handleTaskDropped('col-2', {
        previousIndex: 0,
        currentIndex: 1,
        item: { data: makeTask({ id: 't-2', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);

      tasksResult.next({
        id: 't-2',
        title: 'T2',
        content: null,
        taskOrder: 1,
        columnId: 'col-2',
        assignedId: null,
        createdAt: '',
        updatedAt: ''
      });
      tasksResult.complete();

      expect(component.moveError()).toBeNull();
    });

    it('updates the dragAnnouncement signal on successful drop and on rollback', async () => {
      const err = new HttpErrorResponse({ status: 403, statusText: 'forbidden' });
      const { fixture, component } = await mount({
        tasksApiResult: throwError(() => err),
        columnsApiResult: of([
          makeColumnDto({ id: 'col-1', name: 'To Do' }),
          makeColumnDto({ id: 'col-2', name: 'In Progress' })
        ])
      });
      fixture.detectChanges();

      component.handleTaskDropped('col-2', {
        previousIndex: 0,
        currentIndex: 1,
        item: { data: makeTask({ id: 't-1', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);

      // Rollback announce should contain the verbatim body.
      expect(component.dragAnnouncement()).toContain('Move undone.');
      expect(component.dragAnnouncement()).toContain(
        'You are no longer a member of this project and cannot move tasks.'
      );
    });
  });

  describe('Task detail drawer', () => {
    it('opens the drawer when handleTaskOpened is called with a task', async () => {
      const { fixture, component, boardState } = await mount({
        columnsApiResult: of([makeColumnDto({ id: 'col-1', name: 'To Do' })])
      });
      fixture.detectChanges();

      // Seed the task into the mock board state so the computed projection
      // off tasksByColumnId() can resolve the id (issue #94 changed
      // selectedTask from a snapshot to a live projection).
      const task = makeTask({ id: 't-77', title: 'Open me', columnId: 'col-1' });
      boardState.tasksByColumnId.set({ 'col-1': [task] });
      component.handleTaskOpened(task);
      fixture.detectChanges();

      // Computed returns a value-equal row from state (not the original
      // reference), so assert structural equality rather than identity.
      expect(component.selectedTask()).toEqual(task);
      expect(component.selectedTask()?.id).toBe(task.id);
      const panel = fixture.debugElement.query(By.css('app-task-detail-panel'));
      expect(panel).toBeTruthy();
    });

    it('closes the drawer when handleTaskDetailClosed is called', async () => {
      const { fixture, component, boardState } = await mount();
      fixture.detectChanges();
      const task = makeTask({ id: 't-1', columnId: 'col-1' });
      boardState.tasksByColumnId.set({ 'col-1': [task] });
      component.handleTaskOpened(task);
      fixture.detectChanges();

      component.handleTaskDetailClosed();
      fixture.detectChanges();

      expect(component.selectedTask()).toBeNull();
      const panel = fixture.debugElement.query(By.css('app-task-detail-panel'));
      expect(panel).toBeNull();
    });

    it('selectedTask() re-projects when the open task row is updated in board state (issue #94)', async () => {
      const { fixture, component, boardState } = await mount({
        columnsApiResult: of([makeColumnDto({ id: 'col-1', name: 'To Do' })])
      });
      fixture.detectChanges();

      const task = makeTask({
        id: 't-99',
        title: 'Watch me update',
        content: 'old text',
        columnId: 'col-1'
      });
      boardState.tasksByColumnId.set({ 'col-1': [task] });
      component.handleTaskOpened(task);
      fixture.detectChanges();
      expect(component.selectedTask()?.content).toBe('old text');

      // Simulate an originating-client applyLocalTaskUpdateFromDto landing
      // on the service's tasksByColumnId — replacing the row with an
      // updated version. The computed must re-emit immediately.
      boardState.tasksByColumnId.set({
        'col-1': [{ ...task, content: 'new text' }]
      });
      fixture.detectChanges();

      expect(component.selectedTask()?.content).toBe('new text');
      expect(component.selectedTask()?.id).toBe('t-99');
    });

    it('selectedTask() returns null when the open task is removed from board state', async () => {
      const { fixture, component, boardState } = await mount({
        columnsApiResult: of([makeColumnDto({ id: 'col-1', name: 'To Do' })])
      });
      fixture.detectChanges();

      const task = makeTask({ id: 't-gone', columnId: 'col-1' });
      boardState.tasksByColumnId.set({ 'col-1': [task] });
      component.handleTaskOpened(task);
      fixture.detectChanges();
      expect(component.selectedTask()?.id).toBe('t-gone');

      // Task disappears from state (e.g. ColumnDeleted-driven bucket drop).
      boardState.tasksByColumnId.set({ 'col-1': [] });
      fixture.detectChanges();

      expect(component.selectedTask()).toBeNull();
    });

    it('handleAttachmentSelected dispatches into attachmentsState.startUpload (#50)', async () => {
      const { fixture, component, attachmentsState, tasksApi } = await mount();
      fixture.detectChanges();

      const event = {
        file: new File([new Uint8Array(1)], 'spec.pdf'),
        taskId: 't-1'
      };
      component.handleAttachmentSelected(event);

      expect(attachmentsState.startUpload).toHaveBeenCalledWith(event);
      expect(tasksApi.moveTask).not.toHaveBeenCalled();
    });
  });

  describe('Move-error dismiss button', () => {
    it('clears moveError when dismissMoveError() is called', async () => {
      const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
      const { fixture, component } = await mount({
        tasksApiResult: throwError(() => err)
      });
      fixture.detectChanges();
      component.handleTaskDropped('col-2', {
        previousIndex: 0,
        currentIndex: 0,
        item: { data: makeTask({ id: 't-1', columnId: 'col-1' }) }
      } as unknown as CdkDragDrop<BoardTask[]>);
      expect(component.moveError()).not.toBeNull();

      component.dismissMoveError();
      expect(component.moveError()).toBeNull();
    });
  });

  // ----------------------------------------------------------------------
  // Issue #77 — Add-column from board view
  // ----------------------------------------------------------------------

  describe('Add-column flow (issue #77)', () => {
    describe('Empty-state rendering', () => {
      it('renders the empty-state panel when columns are empty AND no load error', async () => {
        const { fixture } = await mount({ columnsApiResult: of([]) });
        fixture.detectChanges();

        const emptyPanel = fixture.debugElement.query(
          By.css('.board-page__empty-panel')
        );
        expect(emptyPanel).toBeTruthy();
        expect(emptyPanel.nativeElement.getAttribute('role')).toBe('region');
        expect(emptyPanel.nativeElement.getAttribute('aria-label')).toBe(
          'Empty board'
        );
        const heading = emptyPanel.query(By.css('.board-page__empty-heading'));
        expect(heading.nativeElement.textContent).toContain(
          'This board has no columns yet'
        );
        const button = fixture.debugElement.query(
          By.css('.board-page__empty-add')
        );
        expect(button).toBeTruthy();

        // Neither populated-board container nor trailing affordance should render.
        expect(
          fixture.debugElement.query(By.css('.board-page__columns'))
        ).toBeNull();
        expect(
          fixture.debugElement.query(By.css('.board-page__trailing-add'))
        ).toBeNull();
      });

      it('does NOT render the empty-state panel when columnLoadError is set', async () => {
        const err = new HttpErrorResponse({ status: 404, statusText: 'nope' });
        const { fixture } = await mount({ columnsApiResult: throwError(() => err) });
        fixture.detectChanges();

        expect(
          fixture.debugElement.query(By.css('.board-page__load-error-panel'))
        ).toBeTruthy();
        expect(fixture.debugElement.query(By.css('.board-page__empty-panel'))).toBeNull();
      });

      it('does NOT render the trailing affordance when columns are empty', async () => {
        const { fixture } = await mount({ columnsApiResult: of([]) });
        fixture.detectChanges();
        expect(
          fixture.debugElement.query(By.css('.board-page__trailing-add'))
        ).toBeNull();
      });
    });

    describe('Trailing affordance rendering', () => {
      it('renders the trailing "+ Add column" button after the last column when ≥1 column', async () => {
        const { fixture } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1', name: 'To Do' })])
        });
        fixture.detectChanges();

        const container = fixture.debugElement.query(By.css('.board-page__columns'));
        expect(container).toBeTruthy();
        const trailing = fixture.debugElement.query(
          By.css('.board-page__trailing-add')
        );
        expect(trailing).toBeTruthy();
        expect(trailing.nativeElement.getAttribute('aria-label')).toBe('Add column');
        // Empty-state panel must NOT render.
        expect(fixture.debugElement.query(By.css('.board-page__empty-panel'))).toBeNull();
      });
    });

    describe('Open / cancel lifecycle', () => {
      it('clicking the empty-state "Add column" button renders BoardAddColumnComponent inline', async () => {
        const { fixture, component } = await mount({ columnsApiResult: of([]) });
        fixture.detectChanges();

        expect(component.addColumnMode()).toBe('closed');
        component.openAddColumnFlow();
        fixture.detectChanges();

        expect(component.addColumnMode()).toBe('open');
        // Form renders inside the empty-state panel.
        const emptyPanel = fixture.debugElement.query(
          By.css('.board-page__empty-panel')
        );
        const form = emptyPanel.query(By.css('app-board-add-column'));
        expect(form).toBeTruthy();
      });

      it('clicking the trailing "+ Add column" button renders BoardAddColumnComponent inline', async () => {
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1' })])
        });
        fixture.detectChanges();

        component.openAddColumnFlow();
        fixture.detectChanges();

        const slot = fixture.debugElement.query(
          By.css('.board-page__trailing-slot')
        );
        const form = slot.query(By.css('app-board-add-column'));
        expect(form).toBeTruthy();
      });

      it('handleAddColumnCancel closes the flow and clears any pending server error', async () => {
        const { fixture, component } = await mount({ columnsApiResult: of([]) });
        fixture.detectChanges();
        component.openAddColumnFlow();
        component['createColumnError'].set('prior error');

        component.handleAddColumnCancel();
        expect(component.addColumnMode()).toBe('closed');
        expect(component.createColumnError()).toBeNull();
      });
    });

    describe('Focus management (AC: focus moves to predictable destination)', () => {
      it('cancel from empty-state returns focus to the empty-state "Add column" button', async () => {
        const { fixture, component } = await mount({ columnsApiResult: of([]) });
        fixture.detectChanges();

        component.openAddColumnFlow();
        fixture.detectChanges();

        component.handleAddColumnCancel();
        fixture.detectChanges();

        // The cancel path uses queueMicrotask — flush the microtask queue.
        await Promise.resolve();

        const emptyBtn = fixture.debugElement.query(
          By.css('.board-page__empty-add')
        );
        expect(emptyBtn).toBeTruthy();
        expect(document.activeElement).toBe(emptyBtn.nativeElement);
      });

      it('cancel from trailing slot returns focus to the trailing "+ Add column" button', async () => {
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1' })])
        });
        fixture.detectChanges();

        component.openAddColumnFlow();
        fixture.detectChanges();

        component.handleAddColumnCancel();
        fixture.detectChanges();

        // queueMicrotask → flush.
        await Promise.resolve();

        const trailingBtn = fixture.debugElement.query(
          By.css('.board-page__trailing-add')
        );
        expect(trailingBtn).toBeTruthy();
        expect(document.activeElement).toBe(trailingBtn.nativeElement);
      });

      it('successful submit on populated board moves focus to the trailing "+ Add column" button', async () => {
        const created: ColumnResponseDto = {
          id: 'col-new',
          name: 'Blocked',
          colorCode: null,
          columnOrder: 1,
          projectId: 'p-1',
          createdAt: '',
          updatedAt: ''
        };
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1', columnOrder: 0 })]),
          createColumnResult: of(created)
        });
        fixture.detectChanges();

        component.openAddColumnFlow();
        fixture.detectChanges();

        component.handleAddColumnSubmit('Blocked');
        fixture.detectChanges();

        // Success path uses queueMicrotask(() => focusTrailingAddButton()) —
        // flush the microtask queue.
        await Promise.resolve();

        const trailingBtn = fixture.debugElement.query(
          By.css('.board-page__trailing-add')
        );
        expect(trailingBtn).toBeTruthy();
        expect(document.activeElement).toBe(trailingBtn.nativeElement);
      });
    });

    describe('Submit success', () => {
      it('empty-board submit calls createColumn with columnOrder: 0', async () => {
        const created: ColumnResponseDto = {
          id: 'col-new',
          name: 'To Do',
          colorCode: null,
          columnOrder: 0,
          projectId: 'p-1',
          createdAt: '',
          updatedAt: ''
        };
        const { fixture, component, columnsApi } = await mount({
          columnsApiResult: of([]),
          createColumnResult: of(created)
        });
        fixture.detectChanges();

        component.openAddColumnFlow();
        component.handleAddColumnSubmit('To Do');

        expect(columnsApi.createColumn).toHaveBeenCalledTimes(1);
        const [, dto] = columnsApi.createColumn.mock.calls[0];
        expect(dto).toEqual({ name: 'To Do', columnOrder: 0 });
      });

      it('populated-board submit calls createColumn with columnOrder: max+1', async () => {
        const seeded = [
          makeColumnDto({ id: 'c-a', columnOrder: 0 }),
          makeColumnDto({ id: 'c-b', columnOrder: 3 })
        ];
        const { fixture, component, columnsApi } = await mount({
          columnsApiResult: of(seeded)
        });
        fixture.detectChanges();

        component.handleAddColumnSubmit('Blocked');

        const [, dto] = columnsApi.createColumn.mock.calls[0];
        expect(dto).toEqual({ name: 'Blocked', columnOrder: 4 });
      });

      it('on success, calls applyCreatedColumn, closes the flow, and announces', async () => {
        const created: ColumnResponseDto = {
          id: 'col-new',
          name: 'Blocked',
          colorCode: null,
          columnOrder: 1,
          projectId: 'p-1',
          createdAt: '',
          updatedAt: ''
        };
        const { fixture, component, boardState } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1', columnOrder: 0 })]),
          createColumnResult: of(created)
        });
        fixture.detectChanges();

        component.handleAddColumnSubmit('Blocked');

        expect(boardState.applyCreatedColumn).toHaveBeenCalledWith('p-1', created);
        expect(component.addColumnMode()).toBe('closed');
        expect(component.createColumnSubmitting()).toBe(false);
        expect(component.dragAnnouncement()).toBe("Column 'Blocked' added.");
      });
    });

    describe('Submit error', () => {
      it('populates createColumnError via mapColumnErrorToUserMessage and keeps the flow open', async () => {
        const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1' })]),
          createColumnResult: throwError(() => err)
        });
        fixture.detectChanges();

        component.openAddColumnFlow();
        component.handleAddColumnSubmit('Blocked');

        expect(component.createColumnSubmitting()).toBe(false);
        expect(component.createColumnError()).toBe(
          'Something went wrong on our end. Please try again in a moment.'
        );
        expect(component.addColumnMode()).toBe('open');
      });

      it('404 error uses the create-specific copy', async () => {
        const err = new HttpErrorResponse({ status: 404, statusText: 'nope' });
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1' })]),
          createColumnResult: throwError(() => err)
        });
        fixture.detectChanges();
        component.handleAddColumnSubmit('Blocked');
        expect(component.createColumnError()).toContain('project no longer exists');
      });
    });

    describe('Double-submit defence', () => {
      it('short-circuits when createColumnSubmitting is already true', async () => {
        // Use a Subject so we can hold the request open.
        const pending = new Subject<ColumnResponseDto>();
        const { fixture, component, columnsApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1' })]),
          createColumnResult: pending.asObservable()
        });
        fixture.detectChanges();

        component.handleAddColumnSubmit('Blocked');
        expect(component.createColumnSubmitting()).toBe(true);

        // Second call — must NOT issue a second POST.
        component.handleAddColumnSubmit('Blocked');

        expect(columnsApi.createColumn).toHaveBeenCalledTimes(1);
      });

      it('short-circuits when currentProjectId is null', async () => {
        const { fixture, component, boardState, columnsApi } = await mount();
        fixture.detectChanges();
        boardState.currentProjectId.set(null);
        component.handleAddColumnSubmit('Blocked');
        expect(columnsApi.createColumn).not.toHaveBeenCalled();
      });
    });

    describe('Form remount on reopen', () => {
      it('@if-gated remount means a cancel-then-reopen shows the form afresh', async () => {
        const { fixture, component } = await mount({ columnsApiResult: of([]) });
        fixture.detectChanges();

        component.openAddColumnFlow();
        fixture.detectChanges();
        const formBefore = fixture.debugElement.query(By.css('app-board-add-column'));
        expect(formBefore).toBeTruthy();

        component.handleAddColumnCancel();
        fixture.detectChanges();
        const formGone = fixture.debugElement.query(By.css('app-board-add-column'));
        expect(formGone).toBeNull();

        component.openAddColumnFlow();
        fixture.detectChanges();
        const formAfter = fixture.debugElement.query(By.css('app-board-add-column'));
        // Fresh instance — the old nativeElement must not be reused.
        expect(formAfter).toBeTruthy();
        expect(formAfter.nativeElement).not.toBe(formBefore.nativeElement);
      });

      it('createColumnError is cleared on reopen so the fresh child does not inherit stale copy', async () => {
        const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1' })]),
          createColumnResult: throwError(() => err)
        });
        fixture.detectChanges();

        component.handleAddColumnSubmit('Blocked');
        expect(component.createColumnError()).not.toBeNull();

        component.handleAddColumnCancel();
        component.openAddColumnFlow();
        expect(component.createColumnError()).toBeNull();
      });
    });

    describe('existingColumnNames computed', () => {
      it('projects columns().map(c => c.name)', async () => {
        const { fixture, component, boardState } = await mount();
        fixture.detectChanges();
        boardState.columns.set([
          {
            id: 'c-1',
            name: 'To Do',
            colorCode: null,
            columnOrder: 0,
            projectId: 'p-1'
          },
          {
            id: 'c-2',
            name: 'In Progress',
            colorCode: null,
            columnOrder: 1,
            projectId: 'p-1'
          }
        ]);
        expect(component.existingColumnNames()).toEqual(['To Do', 'In Progress']);
      });
    });

    describe('Empty-to-populated / populated-to-empty transitions', () => {
      it('0 → 1 column: empty-state panel disappears, trailing affordance appears', async () => {
        const { fixture, boardState } = await mount({ columnsApiResult: of([]) });
        fixture.detectChanges();
        expect(fixture.debugElement.query(By.css('.board-page__empty-panel'))).toBeTruthy();

        boardState.columns.set([
          {
            id: 'c-1',
            name: 'To Do',
            colorCode: null,
            columnOrder: 0,
            projectId: 'p-1'
          }
        ]);
        fixture.detectChanges();

        expect(fixture.debugElement.query(By.css('.board-page__empty-panel'))).toBeNull();
        expect(
          fixture.debugElement.query(By.css('.board-page__trailing-add'))
        ).toBeTruthy();
      });

      it('1 → 0 columns: trailing affordance disappears, empty-state panel appears', async () => {
        const { fixture, boardState } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1' })])
        });
        fixture.detectChanges();
        expect(
          fixture.debugElement.query(By.css('.board-page__trailing-add'))
        ).toBeTruthy();

        boardState.columns.set([]);
        fixture.detectChanges();

        expect(
          fixture.debugElement.query(By.css('.board-page__trailing-add'))
        ).toBeNull();
        expect(fixture.debugElement.query(By.css('.board-page__empty-panel'))).toBeTruthy();
      });
    });

    describe('Unmount during in-flight submit', () => {
      it('destroying the component during an in-flight create does not throw', async () => {
        const pending = new Subject<ColumnResponseDto>();
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'c-1' })]),
          createColumnResult: pending.asObservable()
        });
        fixture.detectChanges();

        component.handleAddColumnSubmit('Blocked');
        expect(component.createColumnSubmitting()).toBe(true);

        // Destroy BEFORE the HTTP response lands — takeUntilDestroyed must cancel.
        fixture.destroy();

        // Late emission must NOT throw (subscription is torn down).
        expect(() => {
          pending.next({
            id: 'col-late',
            name: 'Late',
            colorCode: null,
            columnOrder: 1,
            projectId: 'p-1',
            createdAt: '',
            updatedAt: ''
          });
          pending.complete();
        }).not.toThrow();
      });
    });
  });

  // ----------------------------------------------------------------------
  // Issue #78 — Add-task from board view (per-column inline form)
  // ----------------------------------------------------------------------

  describe('Add-task flow (issue #78)', () => {
    function makeCreatedTask(partial?: Partial<TaskResponseDto>): TaskResponseDto {
      return {
        id: 't-new',
        title: 'Wire up onboarding flow',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: '',
        ...partial
      };
    }

    describe('openAddTaskFlow', () => {
      it('opens the slot and clears any prior error', async () => {
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1', name: 'To Do' })])
        });
        fixture.detectChanges();

        // Seed a prior error to ensure openAddTaskFlow clears it.
        component.taskDrafts.set({
          'col-1': { open: false, submitting: false, error: 'stale error' }
        });

        component.openAddTaskFlow('col-1');
        expect(component.draftFor('col-1')).toEqual({
          open: true,
          submitting: false,
          error: null
        });
      });

      it('per-column independence: opening column A does not touch column B', async () => {
        const { fixture, component } = await mount({
          columnsApiResult: of([
            makeColumnDto({ id: 'col-A', name: 'A' }),
            makeColumnDto({ id: 'col-B', name: 'B' })
          ])
        });
        fixture.detectChanges();

        component.openAddTaskFlow('col-A');
        component.taskDrafts.update(current => ({
          ...current,
          'col-B': { open: true, submitting: false, error: null }
        }));

        component.openAddTaskFlow('col-A'); // re-open A — should leave B untouched.
        expect(component.draftFor('col-A').open).toBe(true);
        expect(component.draftFor('col-B').open).toBe(true);
      });
    });

    describe('handleAddTaskSubmit — success', () => {
      it('issues a single POST with { title } only (no content, no assignedId, no taskOrder)', async () => {
        const { fixture, component, tasksApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          createTaskResult: of(makeCreatedTask())
        });
        fixture.detectChanges();

        component.handleAddTaskSubmit('col-1', 'Wire up onboarding flow');

        expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
        const [columnId, dto] = tasksApi.createTask.mock.calls[0];
        expect(columnId).toBe('col-1');
        expect(dto).toEqual({ title: 'Wire up onboarding flow' });
      });

      it('on 201 calls applyCreatedTask, closes the slot, and announces', async () => {
        const created = makeCreatedTask({ title: 'Wire up onboarding flow' });
        const { fixture, component, boardState } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1', name: 'To Do' })]),
          createTaskResult: of(created)
        });
        fixture.detectChanges();

        component.openAddTaskFlow('col-1');
        component.handleAddTaskSubmit('col-1', 'Wire up onboarding flow');
        fixture.detectChanges();

        expect(boardState.applyCreatedTask).toHaveBeenCalledWith('p-1', created);
        expect(component.draftFor('col-1')).toEqual({
          open: false,
          submitting: false,
          error: null
        });
        expect(component.dragAnnouncement()).toBe(
          "Task 'Wire up onboarding flow' added to To Do."
        );
      });

      it('refocuses the registered trigger after a successful submit (tech spec D8)', async () => {
        const created = makeCreatedTask({ title: 'A new task' });
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1', name: 'To Do' })]),
          createTaskResult: of(created)
        });
        fixture.detectChanges();

        // Spy on every button's focus() so we don't have to disambiguate
        // between the real column trigger (registered via ViewChild) and
        // any stand-in. The ViewChild emission is deferred via
        // setTimeout(0) — wait for it before submitting so the trigger
        // is already registered.
        await new Promise(resolve => setTimeout(resolve, 0));
        const focusSpy = vi.spyOn(HTMLButtonElement.prototype, 'focus');

        component.handleAddTaskSubmit('col-1', 'A new task');
        // Flush the queueMicrotask focus helper.
        await Promise.resolve();

        expect(focusSpy).toHaveBeenCalled();
        focusSpy.mockRestore();
      });
    });

    describe('handleAddTaskSubmit — error branches', () => {
      it('500 → slot becomes { open:true, submitting:false, error:<mapped> }, no applyCreatedTask, no focus move', async () => {
        const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
        const { fixture, component, boardState } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          createTaskResult: throwError(() => err)
        });
        fixture.detectChanges();

        component.handleAddTaskSubmit('col-1', 'Wire up onboarding flow');

        expect(boardState.applyCreatedTask).not.toHaveBeenCalled();
        expect(component.draftFor('col-1')).toEqual({
          open: true,
          submitting: false,
          error: 'Something went wrong on our end. Please try again in a moment.'
        });
      });

      it('404 uses the column-missing copy', async () => {
        const err = new HttpErrorResponse({ status: 404, statusText: 'nope' });
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          createTaskResult: throwError(() => err)
        });
        fixture.detectChanges();

        component.handleAddTaskSubmit('col-1', 'Oops');
        expect(component.draftFor('col-1').error).toBe(
          "We couldn't add this task — the column no longer exists."
        );
      });
    });

    describe('handleAddTaskSubmit — guards', () => {
      it('short-circuits when submitting is already true (double-submit defence)', async () => {
        const pending = new Subject<TaskResponseDto>();
        const { fixture, component, tasksApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          createTaskResult: pending.asObservable()
        });
        fixture.detectChanges();

        component.handleAddTaskSubmit('col-1', 'First');
        expect(component.draftFor('col-1').submitting).toBe(true);
        // Second call while still pending — must NOT issue a second POST.
        component.handleAddTaskSubmit('col-1', 'Second');
        expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
      });

      it('short-circuits silently when currentProjectId is null', async () => {
        const { fixture, component, boardState, tasksApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })])
        });
        fixture.detectChanges();
        boardState.currentProjectId.set(null);
        component.handleAddTaskSubmit('col-1', 'Nope');
        expect(tasksApi.createTask).not.toHaveBeenCalled();
      });

      it('stale columnId (column no longer present) → 404-equivalent error, no POST', async () => {
        const { fixture, component, tasksApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })])
        });
        fixture.detectChanges();

        component.handleAddTaskSubmit('col-ghost', 'Orphan');
        expect(tasksApi.createTask).not.toHaveBeenCalled();
        expect(component.draftFor('col-ghost').error).toBe(
          "We couldn't add this task — the column no longer exists."
        );
      });
    });

    describe('handleAddTaskCancel', () => {
      it('closes the slot with no POST and restores focus to the trigger', async () => {
        const { fixture, component, tasksApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })])
        });
        fixture.detectChanges();
        // Wait for the deferred trigger registration.
        await new Promise(resolve => setTimeout(resolve, 0));

        const focusSpy = vi.spyOn(HTMLButtonElement.prototype, 'focus');

        component.openAddTaskFlow('col-1');
        component.handleAddTaskCancel('col-1');

        expect(component.draftFor('col-1')).toEqual({
          open: false,
          submitting: false,
          error: null
        });
        expect(tasksApi.createTask).not.toHaveBeenCalled();

        await Promise.resolve();
        expect(focusSpy).toHaveBeenCalled();
        focusSpy.mockRestore();
      });
    });

    describe('SignalR echo dedupe on a just-HTTP-created task', () => {
      it('does not double-insert when the client receives its own echo', async () => {
        const created = makeCreatedTask({ id: 't-echo' });
        const { fixture, component, boardState } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          createTaskResult: of(created)
        });
        fixture.detectChanges();

        component.handleAddTaskSubmit('col-1', 'Wire up onboarding flow');
        // Simulate the SignalR echo by invoking the mocked applyCreatedTask
        // via its mock.calls implementation — the shared mock dedupes by id.
        const applyCreatedTaskFn = boardState.applyCreatedTask as unknown as (
          projectId: string,
          dto: TaskResponseDto
        ) => void;
        applyCreatedTaskFn('p-1', created);

        const bucket = boardState.tasksByColumnId()['col-1'] ?? [];
        expect(bucket.filter(t => t.id === 't-echo').length).toBe(1);
      });
    });

    describe('Unmount during in-flight task create', () => {
      it('destroying the component mid-request does not throw (takeUntilDestroyed cancels)', async () => {
        const pending = new Subject<TaskResponseDto>();
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          createTaskResult: pending.asObservable()
        });
        fixture.detectChanges();

        component.handleAddTaskSubmit('col-1', 'In flight');
        expect(component.draftFor('col-1').submitting).toBe(true);

        fixture.destroy();

        expect(() => {
          pending.next(makeCreatedTask({ id: 't-late' }));
          pending.complete();
        }).not.toThrow();
      });
    });

    describe('Concurrent open across multiple columns', () => {
      it('submitting on column A does not close an open form on column B', async () => {
        const { fixture, component } = await mount({
          columnsApiResult: of([
            makeColumnDto({ id: 'col-A', name: 'A' }),
            makeColumnDto({ id: 'col-B', name: 'B' })
          ]),
          createTaskResult: of(makeCreatedTask({ columnId: 'col-A' }))
        });
        fixture.detectChanges();

        component.openAddTaskFlow('col-A');
        component.openAddTaskFlow('col-B');

        component.handleAddTaskSubmit('col-A', 'Task for A');

        // A closed; B remains open.
        expect(component.draftFor('col-A').open).toBe(false);
        expect(component.draftFor('col-B').open).toBe(true);
      });
    });
  });

  // ----------------------------------------------------------------------
  // Issue #87 — Hydrate tasks on board entry
  // ----------------------------------------------------------------------

  describe('Hydrate tasks on board entry (issue #87)', () => {
    function makeTaskResponseDto(
      partial?: Partial<TaskResponseDto>
    ): TaskResponseDto {
      return {
        id: 't-1',
        title: 'Hydrated task',
        content: null,
        taskOrder: 0,
        columnId: 'col-1',
        assignedId: null,
        createdAt: '',
        updatedAt: '',
        ...partial
      };
    }

    describe('loadColumns → loadTasks sequencing', () => {
      it('calls getTasksForProject only after getColumnsForProject resolves successfully', async () => {
        const columnsSubject = new Subject<ColumnResponseDto[]>();
        const { fixture, tasksApi, columnsApi } = await mount({
          columnsApiResult: columnsSubject.asObservable(),
          getTasksForProjectResult: of([])
        });

        fixture.detectChanges();
        expect(columnsApi.getColumnsForProject).toHaveBeenCalledWith('p-1');
        // Task read has not fired yet.
        expect(tasksApi.getTasksForProject).not.toHaveBeenCalled();

        // Columns resolve — task read fires next.
        columnsSubject.next([makeColumnDto({ id: 'col-1' })]);
        columnsSubject.complete();

        expect(tasksApi.getTasksForProject).toHaveBeenCalledTimes(1);
        expect(tasksApi.getTasksForProject).toHaveBeenCalledWith('p-1');
      });

      it('does NOT fire getTasksForProject when the column fetch fails', async () => {
        const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
        const { fixture, tasksApi, component } = await mount({
          columnsApiResult: throwError(() => err)
        });
        fixture.detectChanges();

        expect(tasksApi.getTasksForProject).not.toHaveBeenCalled();
        expect(component.taskLoadError()).toBeNull();
      });
    });

    describe('setTasks receives hydrated DTOs', () => {
      it('passes the full DTO array into boardState.setTasks', async () => {
        const dtos = [
          makeTaskResponseDto({ id: 't-a', columnId: 'col-1', taskOrder: 0 }),
          makeTaskResponseDto({ id: 't-b', columnId: 'col-1', taskOrder: 1 })
        ];
        const { fixture, boardState } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          getTasksForProjectResult: of(dtos)
        });
        fixture.detectChanges();

        expect(boardState.setTasks).toHaveBeenCalledTimes(1);
        const [projectIdArg, dtosArg] = boardState.setTasks.mock.calls[0];
        expect(projectIdArg).toBe('p-1');
        expect(dtosArg).toEqual(dtos);
      });

      it('announces hydration when taskCount > 0 via dragAnnouncement', async () => {
        const { fixture, component } = await mount({
          columnsApiResult: of([
            makeColumnDto({ id: 'col-1', name: 'To Do', columnOrder: 0 }),
            makeColumnDto({ id: 'col-2', name: 'Doing', columnOrder: 1 })
          ]),
          getTasksForProjectResult: of([
            makeTaskResponseDto({ id: 't-a', columnId: 'col-1' }),
            makeTaskResponseDto({ id: 't-b', columnId: 'col-2' })
          ])
        });
        fixture.detectChanges();

        expect(component.dragAnnouncement()).toBe(
          'Board loaded with 2 tasks across 2 columns.'
        );
      });

      it('does NOT announce when the hydration yields zero tasks', async () => {
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          getTasksForProjectResult: of([])
        });
        fixture.detectChanges();
        expect(component.dragAnnouncement()).toBe('');
      });
    });

    describe('Error strip on task-read failure', () => {
      it('populates taskLoadError with the mapped copy and renders the strip', async () => {
        const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          getTasksForProjectResult: throwError(() => err)
        });
        fixture.detectChanges();

        expect(component.taskLoadError()).toBe(
          'Something went wrong on our end. Please try again in a moment.'
        );
        expect(component.isLoadingTasks()).toBe(false);

        const strip = fixture.debugElement.query(
          By.css('.board-page__task-load-error')
        );
        expect(strip).toBeTruthy();
        expect(strip.nativeElement.getAttribute('role')).toBe('alert');
        const text = strip.query(By.css('.board-page__task-load-error-text'));
        expect(text.nativeElement.textContent).toContain(
          'Something went wrong on our end.'
        );
      });

      it('maps each status code to its verbatim copy (AC23–AC28)', async () => {
        const cases: Array<[number, string]> = [
          [0, "We couldn't reach the server. Please check your connection and try again."],
          [401, 'Your session has expired. Please sign in again.'],
          [403, 'You are no longer a member of this project.'],
          [404, 'This project no longer exists.'],
          [500, 'Something went wrong on our end. Please try again in a moment.'],
          [418, "We couldn't load this board. Please try again."]
        ];

        for (const [status, expected] of cases) {
          const err = new HttpErrorResponse({ status, statusText: 'x' });
          const { fixture, component } = await mount({
            columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
            getTasksForProjectResult: throwError(() => err)
          });
          fixture.detectChanges();
          expect(component.taskLoadError()).toBe(expected);
        }
      });
    });

    describe('Retry behaviour', () => {
      it('retry re-issues getTasksForProject and clears the error on success', async () => {
        const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
        const { fixture, component, tasksApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          getTasksForProjectResult: throwError(() => err)
        });
        fixture.detectChanges();

        expect(component.taskLoadError()).not.toBeNull();
        expect(tasksApi.getTasksForProject).toHaveBeenCalledTimes(1);

        // Flip the stub to a success on the second call.
        tasksApi.getTasksForProject.mockReturnValue(
          of([makeTaskResponseDto({ id: 't-a', columnId: 'col-1' })])
        );

        component.retryLoadTasks();

        expect(tasksApi.getTasksForProject).toHaveBeenCalledTimes(2);
        expect(component.taskLoadError()).toBeNull();
        expect(component.isLoadingTasks()).toBe(false);
      });

      it('retry is a no-op while a load is already in flight', async () => {
        const pending = new Subject<TaskResponseDto[]>();
        const { fixture, component, tasksApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          getTasksForProjectResult: pending.asObservable()
        });
        fixture.detectChanges();

        // Initial load is in flight from ngOnInit.
        expect(component.isLoadingTasks()).toBe(true);
        expect(tasksApi.getTasksForProject).toHaveBeenCalledTimes(1);

        component.retryLoadTasks();
        // Still only one call — the guard short-circuited the second invocation.
        expect(tasksApi.getTasksForProject).toHaveBeenCalledTimes(1);
      });

      it('retry is a no-op when currentProjectId is null', async () => {
        const { fixture, component, boardState, tasksApi } = await mount();
        fixture.detectChanges();
        const baselineCalls = tasksApi.getTasksForProject.mock.calls.length;
        boardState.currentProjectId.set(null);

        component.retryLoadTasks();
        expect(tasksApi.getTasksForProject.mock.calls.length).toBe(baselineCalls);
      });

      it('Retry button is disabled while isLoadingTasks is true (template binding)', async () => {
        // The [disabled] binding on the Retry button is isLoadingTasks().
        // Since retryLoadTasks clears taskLoadError (unmounting the strip)
        // before the new request lands, we verify the binding indirectly:
        // while a request is in flight, isLoadingTasks() is true, so if the
        // strip were present (new failure mid-flight) the button would be
        // disabled via the template binding.
        const pendingInitial = new Subject<TaskResponseDto[]>();
        const { fixture, component } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          getTasksForProjectResult: pendingInitial.asObservable()
        });
        fixture.detectChanges();

        // Initial load is in flight — isLoadingTasks is true, strip NOT rendered.
        expect(component.isLoadingTasks()).toBe(true);
        expect(component.taskLoadError()).toBeNull();
      });

      it('after retry, isLoadingTasks becomes true and the strip unmounts until next failure', async () => {
        const pending = new Subject<TaskResponseDto[]>();
        const err = new HttpErrorResponse({ status: 500, statusText: 'oops' });
        const { fixture, component, tasksApi } = await mount({
          columnsApiResult: of([makeColumnDto({ id: 'col-1' })]),
          getTasksForProjectResult: throwError(() => err)
        });
        fixture.detectChanges();

        // First failure — strip visible.
        expect(component.taskLoadError()).not.toBeNull();
        expect(
          fixture.debugElement.query(By.css('.board-page__task-load-error'))
        ).toBeTruthy();

        tasksApi.getTasksForProject.mockReturnValue(pending.asObservable());
        component.retryLoadTasks();
        fixture.detectChanges();

        // Per design spec §4 Flow B step 5: retry clears taskLoadError then
        // waits; the strip unmounts until the retry also fails.
        expect(component.isLoadingTasks()).toBe(true);
        expect(component.taskLoadError()).toBeNull();
        expect(
          fixture.debugElement.query(By.css('.board-page__task-load-error'))
        ).toBeNull();
      });
    });

    describe('Stale navigation guard', () => {
      it('getTasksForProject is NOT called when columns resolve for a stale project', async () => {
        const columnsSubject = new Subject<ColumnResponseDto[]>();
        const { fixture, tasksApi, boardState } = await mount({
          columnsApiResult: columnsSubject.asObservable()
        });
        fixture.detectChanges();

        // Simulate the user navigating away — currentProjectId flips.
        boardState.currentProjectId.set('p-2');

        // A's columns land after navigation.
        columnsSubject.next([makeColumnDto({ id: 'col-1' })]);
        columnsSubject.complete();

        // The component guards against firing the task read for A.
        expect(tasksApi.getTasksForProject).not.toHaveBeenCalled();
      });
    });
  });

  // ----------------------------------------------------------------------
  // Issue #96 — Delete project / column / task orchestration (board page)
  // ----------------------------------------------------------------------

  describe('Delete orchestration (issue #96)', () => {
    interface DeleteHarness {
      component: BoardPageComponent;
      fixture: ComponentFixture<BoardPageComponent>;
      boardStateMock: {
        currentProjectId: WritableSignal<string | null>;
        columns: WritableSignal<BoardColumn[]>;
        tasksByColumnId: WritableSignal<Record<string, BoardTask[]>>;
        enterBoard: ReturnType<typeof vi.fn>;
        leaveBoard: ReturnType<typeof vi.fn>;
        setColumns: ReturnType<typeof vi.fn>;
        setTasks: ReturnType<typeof vi.fn>;
        applyOptimisticTaskMove: ReturnType<typeof vi.fn>;
        rollbackOptimisticTaskMove: ReturnType<typeof vi.fn>;
        reconcileServerTaskMove: ReturnType<typeof vi.fn>;
        applyCreatedColumn: ReturnType<typeof vi.fn>;
        applyCreatedTask: ReturnType<typeof vi.fn>;
        applyDeletedColumn: ReturnType<typeof vi.fn>;
        applyDeletedTask: ReturnType<typeof vi.fn>;
        deleteColumn: ReturnType<typeof vi.fn>;
        deleteTask: ReturnType<typeof vi.fn>;
      };
      projectStateMock: {
        projects: WritableSignal<ProjectSummary[]>;
        hasLoaded: WritableSignal<boolean>;
        applyDeletedProject: ReturnType<typeof vi.fn>;
      };
      projectsApiMock: { deleteProject: ReturnType<typeof vi.fn> };
      toastMock: {
        show: ReturnType<typeof vi.fn>;
        announce: ReturnType<typeof vi.fn>;
        dismissCurrent: ReturnType<typeof vi.fn>;
        currentToast: WritableSignal<unknown>;
        currentAnnouncement: WritableSignal<string>;
      };
      dialogMock: { open: ReturnType<typeof vi.fn> };
      routerMock: { navigate: ReturnType<typeof vi.fn> };
      lastDialog: {
        confirmClicked$: Subject<void>;
        closed$: Subject<unknown>;
        close: ReturnType<typeof vi.fn>;
        setInput: ReturnType<typeof vi.fn>;
      };
    }

    async function mountForDelete(project: ProjectSummary): Promise<DeleteHarness> {
      TestBed.resetTestingModule();

      const boardStateMock = {
        currentProjectId: signal<string | null>(project.id),
        columns: signal<BoardColumn[]>([]),
        tasksByColumnId: signal<Record<string, BoardTask[]>>({}),
        enterBoard: vi.fn(),
        leaveBoard: vi.fn(),
        setColumns: vi.fn(),
        setTasks: vi.fn(),
        applyOptimisticTaskMove: vi.fn(),
        rollbackOptimisticTaskMove: vi.fn(),
        reconcileServerTaskMove: vi.fn(),
        applyCreatedColumn: vi.fn(),
        applyCreatedTask: vi.fn(),
        applyDeletedColumn: vi.fn(),
        applyDeletedTask: vi.fn(),
        deleteColumn: vi.fn(() => of(undefined)),
        deleteTask: vi.fn(() => of(undefined))
      };
      const projectStateMock = {
        projects: signal<ProjectSummary[]>([project]),
        hasLoaded: signal(true),
        applyDeletedProject: vi.fn()
      };
      const projectsApiMock = {
        deleteProject: vi.fn(() => of(undefined))
      };
      const toastMock = {
        show: vi.fn(),
        announce: vi.fn(),
        dismissCurrent: vi.fn(),
        currentToast: signal(null),
        currentAnnouncement: signal('')
      };

      const lastDialog = {
        confirmClicked$: new Subject<void>(),
        closed$: new Subject<unknown>(),
        close: vi.fn(),
        setInput: vi.fn()
      };
      const dialogMock = {
        open: vi.fn(() => {
          // Refresh Subjects per `open` so successive dialogs start clean.
          lastDialog.confirmClicked$ = new Subject<void>();
          lastDialog.closed$ = new Subject<unknown>();
          lastDialog.close = vi.fn();
          lastDialog.setInput = vi.fn();
          return {
            componentInstance: { confirmClicked: lastDialog.confirmClicked$ },
            componentRef: { setInput: lastDialog.setInput },
            closed: lastDialog.closed$.asObservable(),
            close: lastDialog.close
          };
        })
      };
      const routerMock = { navigate: vi.fn(() => Promise.resolve(true)) };

      await TestBed.configureTestingModule({
        imports: [BoardPageComponent],
        providers: [
          {
            provide: ActivatedRoute,
            useValue: createFakeActivatedRoute(project.id)
          },
          { provide: BoardStateService, useValue: boardStateMock },
          {
            provide: ColumnsApiService,
            useValue: { getColumnsForProject: vi.fn(() => of([])), createColumn: vi.fn(() => of({})) }
          },
          {
            provide: TasksApiService,
            useValue: {
              moveTask: vi.fn(() => of({})),
              createTask: vi.fn(() => of({})),
              getTasksForProject: vi.fn(() => of([]))
            }
          },
          {
            provide: AttachmentsStateService,
            useValue: createMockAttachmentsState()
          },
          { provide: ProjectsApiService, useValue: projectsApiMock },
          { provide: ProjectStateService, useValue: projectStateMock },
          { provide: ToastService, useValue: toastMock },
          { provide: Dialog, useValue: dialogMock },
          { provide: Router, useValue: routerMock }
        ]
      }).compileComponents();

      const fixture = TestBed.createComponent(BoardPageComponent);
      fixture.detectChanges();

      return {
        component: fixture.componentInstance,
        fixture,
        boardStateMock,
        projectStateMock,
        projectsApiMock,
        toastMock,
        dialogMock,
        routerMock,
        lastDialog
      };
    }

    function makeProject(partial?: Partial<ProjectSummary>): ProjectSummary {
      return {
        id: 'p-1',
        name: 'Q2 Launch',
        description: null,
        role: 'Owner',
        createdAt: '2026-05-04T00:00:00Z',
        updatedAt: '2026-05-04T00:00:00Z',
        ...partial
      };
    }

    // ------------------------------------------------------------------
    // Sub-feature A — delete project from board header
    // ------------------------------------------------------------------
    describe('openDeleteProjectDialog (board header)', () => {
      it('opens the confirm dialog with the currentProject name', async () => {
        const project = makeProject({ id: 'p-42', name: 'Acme' });
        const h = await mountForDelete(project);
        h.component.openDeleteProjectDialog();
        expect(h.dialogMock.open).toHaveBeenCalledWith(
          DeleteProjectConfirmDialogComponent,
          expect.objectContaining({
            data: { projectName: 'Acme' },
            ariaLabelledBy: 'delete-project-confirm-heading'
          })
        );
      });

      it('on 204 navigates to /dashboard BEFORE firing the toast/announce', async () => {
        const project = makeProject({ id: 'p-42', name: 'Acme' });
        const h = await mountForDelete(project);
        h.component.openDeleteProjectDialog();
        h.lastDialog.confirmClicked$.next();

        expect(h.projectsApiMock.deleteProject).toHaveBeenCalledWith('p-42');
        expect(h.projectStateMock.applyDeletedProject).toHaveBeenCalledWith('p-42');
        expect(h.lastDialog.close).toHaveBeenCalledWith(true);
        expect(h.routerMock.navigate).toHaveBeenCalledWith(['/dashboard']);
        // Await the router navigation promise resolution.
        await Promise.resolve();
        await Promise.resolve();
        expect(h.toastMock.show).toHaveBeenCalledWith("Project 'Acme' was deleted");
        expect(h.toastMock.announce).toHaveBeenCalledWith('Project deleted');
      });

      it('on 403 closes with permission toast; no mutation; no navigation', async () => {
        const project = makeProject({ id: 'p-42', name: 'Acme' });
        const h = await mountForDelete(project);
        h.projectsApiMock.deleteProject.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' }))
        );
        h.component.openDeleteProjectDialog();
        h.lastDialog.confirmClicked$.next();

        expect(h.projectStateMock.applyDeletedProject).not.toHaveBeenCalled();
        expect(h.routerMock.navigate).not.toHaveBeenCalled();
        expect(h.lastDialog.close).toHaveBeenCalledWith(undefined);
        expect(h.toastMock.show).toHaveBeenCalledWith(
          'Only the project owner can delete this project',
          'info'
        );
      });

      it('on 0 stays open with verbatim retry copy; second confirm retries in place and succeeds', async () => {
        const project = makeProject({ id: 'p-42', name: 'Acme' });
        const h = await mountForDelete(project);
        h.projectsApiMock.deleteProject
          .mockReturnValueOnce(
            throwError(() => new HttpErrorResponse({ status: 0, statusText: 'x' }))
          )
          .mockReturnValueOnce(of(undefined));

        h.component.openDeleteProjectDialog();
        h.lastDialog.confirmClicked$.next();
        expect(h.lastDialog.setInput).toHaveBeenCalledWith(
          'inlineError',
          "Couldn't reach the server — try again"
        );
        expect(h.lastDialog.close).not.toHaveBeenCalled();

        h.lastDialog.confirmClicked$.next();
        expect(h.projectsApiMock.deleteProject).toHaveBeenCalledTimes(2);
        expect(h.projectStateMock.applyDeletedProject).toHaveBeenCalledWith('p-42');
      });
    });

    // ------------------------------------------------------------------
    // Sub-feature B — delete column
    // ------------------------------------------------------------------
    describe('openDeleteColumnDialog', () => {
      function col(partial?: Partial<BoardColumn>): BoardColumn {
        return {
          id: 'col-1',
          name: 'Doing',
          colorCode: null,
          columnOrder: 1,
          projectId: 'p-1',
          ...partial
        };
      }

      it('passes the correct task count (empty column) to the dialog', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.columns.set([col()]);
        h.boardStateMock.tasksByColumnId.set({});
        h.fixture.detectChanges();

        h.component.openDeleteColumnDialog(col());
        expect(h.dialogMock.open).toHaveBeenCalledWith(
          DeleteColumnConfirmDialogComponent,
          expect.objectContaining({
            data: { columnName: 'Doing', taskCount: 0 }
          })
        );
      });

      it('passes the correct task count (with tasks) to the dialog', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.columns.set([col()]);
        h.boardStateMock.tasksByColumnId.set({
          'col-1': [
            { id: 't-1', title: 'A', content: null, taskOrder: 1, columnId: 'col-1', assignedId: null },
            { id: 't-2', title: 'B', content: null, taskOrder: 2, columnId: 'col-1', assignedId: null }
          ]
        });
        h.fixture.detectChanges();

        h.component.openDeleteColumnDialog(col());
        expect(h.dialogMock.open).toHaveBeenCalledWith(
          DeleteColumnConfirmDialogComponent,
          expect.objectContaining({ data: { columnName: 'Doing', taskCount: 2 } })
        );
      });

      it('on 204 closes dialog and fires verbatim success toast + announce', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.columns.set([col({ name: 'Doing' })]);
        h.fixture.detectChanges();

        h.component.openDeleteColumnDialog(col({ name: 'Doing' }));
        h.lastDialog.confirmClicked$.next();

        expect(h.boardStateMock.deleteColumn).toHaveBeenCalledWith('col-1');
        expect(h.lastDialog.close).toHaveBeenCalledWith(true);
        expect(h.toastMock.show).toHaveBeenCalledWith("Column 'Doing' was deleted");
        expect(h.toastMock.announce).toHaveBeenCalledWith('Column deleted');
      });

      it('closes the task detail panel when the currently-open task lives in the deleted column', async () => {
        const h = await mountForDelete(makeProject());
        const column = col();
        const task: BoardTask = {
          id: 't-open',
          title: 'Open',
          content: null,
          taskOrder: 1,
          columnId: 'col-1',
          assignedId: null
        };
        h.boardStateMock.columns.set([column]);
        h.boardStateMock.tasksByColumnId.set({ 'col-1': [task] });
        h.fixture.detectChanges();
        h.component.handleTaskOpened(task);
        h.fixture.detectChanges();
        expect(h.component.selectedTask()).not.toBeNull();

        h.component.openDeleteColumnDialog(column);
        h.lastDialog.confirmClicked$.next();

        expect(h.component.selectedTask()).toBeNull();
      });

      it('on 404 treats as success: applyDeletedColumn called, dialog closes, success toast fires', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.columns.set([col({ name: 'Doing' })]);
        h.boardStateMock.deleteColumn.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 404, statusText: 'x' }))
        );
        h.fixture.detectChanges();

        h.component.openDeleteColumnDialog(col({ name: 'Doing' }));
        h.lastDialog.confirmClicked$.next();

        expect(h.boardStateMock.applyDeletedColumn).toHaveBeenCalledWith('col-1');
        expect(h.lastDialog.close).toHaveBeenCalledWith(true);
        expect(h.toastMock.show).toHaveBeenCalledWith("Column 'Doing' was deleted");
        expect(h.toastMock.announce).toHaveBeenCalledWith('Column deleted');
      });

      it('on 403 closes with the verbatim permission toast; no mutation', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.columns.set([col()]);
        h.boardStateMock.deleteColumn.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' }))
        );
        h.fixture.detectChanges();

        h.component.openDeleteColumnDialog(col());
        h.lastDialog.confirmClicked$.next();

        expect(h.boardStateMock.applyDeletedColumn).not.toHaveBeenCalled();
        expect(h.lastDialog.close).toHaveBeenCalledWith(undefined);
        expect(h.toastMock.show).toHaveBeenCalledWith(
          "You don't have permission to delete this column",
          'info'
        );
      });

      it('on 0 stays open with verbatim retry copy; dialog is not closed', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.columns.set([col()]);
        h.boardStateMock.deleteColumn.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 0, statusText: 'x' }))
        );
        h.fixture.detectChanges();

        h.component.openDeleteColumnDialog(col());
        h.lastDialog.confirmClicked$.next();

        expect(h.lastDialog.close).not.toHaveBeenCalled();
        expect(h.lastDialog.setInput).toHaveBeenCalledWith(
          'inlineError',
          "Couldn't reach the server — try again"
        );
      });

      it('on 500 stays open with verbatim generic copy', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.columns.set([col()]);
        h.boardStateMock.deleteColumn.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 500, statusText: 'x' }))
        );
        h.fixture.detectChanges();

        h.component.openDeleteColumnDialog(col());
        h.lastDialog.confirmClicked$.next();

        expect(h.lastDialog.close).not.toHaveBeenCalled();
        expect(h.lastDialog.setInput).toHaveBeenCalledWith(
          'inlineError',
          "Couldn't delete column — please try again"
        );
      });
    });

    // ------------------------------------------------------------------
    // Sub-feature C — delete task
    // ------------------------------------------------------------------
    describe('openDeleteTaskDialog', () => {
      function task(partial?: Partial<BoardTask>): BoardTask {
        return {
          id: 't-1',
          title: 'Finalise copy',
          content: null,
          taskOrder: 1,
          columnId: 'col-1',
          assignedId: null,
          ...partial
        };
      }

      it('opens the dialog with the task title and the correct aria-labelledby', async () => {
        const h = await mountForDelete(makeProject());
        h.component.openDeleteTaskDialog(task({ title: 'Finalise copy' }));
        expect(h.dialogMock.open).toHaveBeenCalledWith(
          DeleteTaskConfirmDialogComponent,
          expect.objectContaining({
            data: { taskTitle: 'Finalise copy' },
            ariaLabelledBy: 'delete-task-confirm-heading'
          })
        );
      });

      it('on 204 closes the panel + dialog, fires success toast, and announces', async () => {
        const h = await mountForDelete(makeProject());
        const t = task({ id: 't-open', columnId: 'col-1', title: 'Finalise copy' });
        h.boardStateMock.columns.set([
          { id: 'col-1', name: 'To Do', colorCode: null, columnOrder: 0, projectId: 'p-1' }
        ]);
        h.boardStateMock.tasksByColumnId.set({ 'col-1': [t] });
        h.fixture.detectChanges();
        h.component.handleTaskOpened(t);

        h.component.openDeleteTaskDialog(t);
        h.lastDialog.confirmClicked$.next();

        expect(h.boardStateMock.deleteTask).toHaveBeenCalledWith('t-open', 'col-1');
        expect(h.component.selectedTask()).toBeNull();
        expect(h.lastDialog.close).toHaveBeenCalledWith(true);
        expect(h.toastMock.show).toHaveBeenCalledWith("Task 'Finalise copy' was deleted");
        expect(h.toastMock.announce).toHaveBeenCalledWith('Task deleted');
      });

      it('on 404 treats as success (applyDeletedTask + success toast + panel closes)', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.deleteTask.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 404, statusText: 'x' }))
        );
        const t = task({ id: 't-open', title: 'Finalise copy' });

        h.component.openDeleteTaskDialog(t);
        h.lastDialog.confirmClicked$.next();

        expect(h.boardStateMock.applyDeletedTask).toHaveBeenCalledWith('t-open', 'col-1');
        expect(h.lastDialog.close).toHaveBeenCalledWith(true);
        expect(h.toastMock.show).toHaveBeenCalledWith("Task 'Finalise copy' was deleted");
        expect(h.toastMock.announce).toHaveBeenCalledWith('Task deleted');
      });

      it('on 403 surfaces the permission copy INLINE (not as a toast) and keeps the dialog open', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.deleteTask.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' }))
        );
        h.component.openDeleteTaskDialog(task());
        h.lastDialog.confirmClicked$.next();

        expect(h.lastDialog.close).not.toHaveBeenCalled();
        expect(h.toastMock.show).not.toHaveBeenCalled();
        expect(h.lastDialog.setInput).toHaveBeenCalledWith(
          'inlineError',
          "You don't have permission to delete this task"
        );
      });

      it('on 0 stays open with verbatim retry copy', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.deleteTask.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 0, statusText: 'x' }))
        );
        h.component.openDeleteTaskDialog(task());
        h.lastDialog.confirmClicked$.next();

        expect(h.lastDialog.close).not.toHaveBeenCalled();
        expect(h.lastDialog.setInput).toHaveBeenCalledWith(
          'inlineError',
          "Couldn't reach the server — try again"
        );
      });

      it('on 500 stays open with verbatim generic copy; second confirm retries in place and succeeds', async () => {
        const h = await mountForDelete(makeProject());
        h.boardStateMock.deleteTask
          .mockReturnValueOnce(
            throwError(() => new HttpErrorResponse({ status: 500, statusText: 'x' }))
          )
          .mockReturnValueOnce(of(undefined));

        h.component.openDeleteTaskDialog(task({ id: 't-2', title: 'Finalise copy' }));
        h.lastDialog.confirmClicked$.next();
        expect(h.lastDialog.setInput).toHaveBeenCalledWith(
          'inlineError',
          "Couldn't delete task — please try again"
        );
        expect(h.lastDialog.close).not.toHaveBeenCalled();

        h.lastDialog.confirmClicked$.next();
        expect(h.boardStateMock.deleteTask).toHaveBeenCalledTimes(2);
        expect(h.lastDialog.close).toHaveBeenCalledWith(true);
        expect(h.toastMock.show).toHaveBeenCalledWith("Task 'Finalise copy' was deleted");
      });

      it('hygiene: no error copy surfaces an HTTP status, a /api/ URL, or the backend 500 string', async () => {
        const h = await mountForDelete(makeProject());
        const backendMsg = 'An unexpected error occurred.';
        const error500 = new HttpErrorResponse({
          status: 500,
          statusText: 'x',
          error: backendMsg
        });
        const error403 = new HttpErrorResponse({
          status: 403,
          statusText: 'x',
          error: 'You are not a member of this project.'
        });
        const error0 = new HttpErrorResponse({ status: 0, statusText: 'x' });
        for (const err of [error500, error403, error0]) {
          h.boardStateMock.deleteTask.mockReturnValueOnce(throwError(() => err));
          h.component.openDeleteTaskDialog(task({ id: `t-${err.status}` }));
          h.lastDialog.confirmClicked$.next();
        }
        const setInputCalls = h.dialogMock.open.mock.results
          .map(r => (r.value as any).componentRef.setInput.mock?.calls ?? [])
          .flat();
        // Walk every inlineError assignment; none may leak backend copy / status / URL.
        for (const [name, value] of setInputCalls) {
          if (name !== 'inlineError' || typeof value !== 'string') continue;
          expect(value).not.toMatch(/\b\d{3}\b/);
          expect(value).not.toContain('/api/');
          expect(value).not.toContain('An unexpected error occurred');
          expect(value).not.toContain('You are not a member of this project');
        }
      });
    });

    // ------------------------------------------------------------------
    // Real-time: remote ProjectDeleted while on that project's board
    // ------------------------------------------------------------------
    describe('Remote ProjectDeleted (on current project)', () => {
      it('navigates to /dashboard and shows the "another member" toast', async () => {
        const project = makeProject({ id: 'p-42' });
        const h = await mountForDelete(project);
        // Sanity: hasLoaded=true & activeId set from mountForDelete.
        expect(h.boardStateMock.currentProjectId()).toBe('p-42');

        // Simulate `onProjectDeleted` wiping the project from the dashboard cache.
        h.projectStateMock.projects.set([]);
        // Flush the effect.
        h.fixture.detectChanges();
        TestBed.flushEffects();

        expect(h.routerMock.navigate).toHaveBeenCalledWith(['/dashboard']);
        expect(h.toastMock.show).toHaveBeenCalledWith(
          'This project was deleted by another member',
          'info'
        );
      });

      it('does NOT fire before projectState.hasLoaded is true (pre-hydration guard)', async () => {
        const project = makeProject({ id: 'p-42' });
        const h = await mountForDelete(project);
        h.projectStateMock.hasLoaded.set(false);
        h.projectStateMock.projects.set([]);
        TestBed.flushEffects();
        expect(h.routerMock.navigate).not.toHaveBeenCalled();
        expect(h.toastMock.show).not.toHaveBeenCalled();
      });
    });
  });
});
