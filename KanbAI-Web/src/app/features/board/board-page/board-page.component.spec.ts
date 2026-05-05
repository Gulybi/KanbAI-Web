import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { WritableSignal, signal } from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { Observable, Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { BoardPageComponent } from './board-page.component';
import { BoardStateService } from '../state/board-state.service';
import { ColumnsApiService } from '../services/columns-api.service';
import { TasksApiService } from '../services/tasks-api.service';
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
  applyOptimisticTaskMove: ReturnType<typeof vi.fn>;
  rollbackOptimisticTaskMove: ReturnType<typeof vi.fn>;
  reconcileServerTaskMove: ReturnType<typeof vi.fn>;
}

interface ColumnsApiMock {
  getColumnsForProject: ReturnType<typeof vi.fn>;
}

interface TasksApiMock {
  moveTask: ReturnType<typeof vi.fn>;
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
    reconcileServerTaskMove: vi.fn()
  };
}

function createMockColumnsApi(result: Observable<ColumnResponseDto[]>): ColumnsApiMock {
  return {
    getColumnsForProject: vi.fn().mockReturnValue(result)
  };
}

function createMockTasksApi(result: Observable<TaskResponseDto>): TasksApiMock {
  return {
    moveTask: vi.fn().mockReturnValue(result)
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
  tasksApiResult?: Observable<TaskResponseDto>;
}

async function mount(options: MountOptions = {}): Promise<{
  fixture: ComponentFixture<BoardPageComponent>;
  component: BoardPageComponent;
  boardState: BoardStateMock;
  columnsApi: ColumnsApiMock;
  tasksApi: TasksApiMock;
}> {
  TestBed.resetTestingModule();
  const boardState = createMockBoardState();
  const columnsApi = createMockColumnsApi(options.columnsApiResult ?? of([]));
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
      })
  );

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
      { provide: TasksApiService, useValue: tasksApi }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(BoardPageComponent);
  return {
    fixture,
    component: fixture.componentInstance,
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

    it('renders the cdkDropListGroup container when no columnLoadError is set', async () => {
      const { fixture } = await mount({ columnsApiResult: of([]) });
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
});
