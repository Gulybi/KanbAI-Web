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
import { AttachmentsStateService } from '../../attachments/state/attachments-state.service';
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
  applyCreatedColumn: ReturnType<typeof vi.fn>;
}

interface ColumnsApiMock {
  getColumnsForProject: ReturnType<typeof vi.fn>;
  createColumn: ReturnType<typeof vi.fn>;
}

interface TasksApiMock {
  moveTask: ReturnType<typeof vi.fn>;
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
  createColumnResult?: Observable<ColumnResponseDto>;
  tasksApiResult?: Observable<TaskResponseDto>;
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
      })
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
      const { fixture, component } = await mount({
        columnsApiResult: of([makeColumnDto({ id: 'col-1', name: 'To Do' })])
      });
      fixture.detectChanges();

      const task = makeTask({ id: 't-77', title: 'Open me' });
      component.handleTaskOpened(task);
      fixture.detectChanges();

      expect(component.selectedTask()).toBe(task);
      const panel = fixture.debugElement.query(By.css('app-task-detail-panel'));
      expect(panel).toBeTruthy();
    });

    it('closes the drawer when handleTaskDetailClosed is called', async () => {
      const { fixture, component } = await mount();
      fixture.detectChanges();
      component.handleTaskOpened(makeTask());
      fixture.detectChanges();

      component.handleTaskDetailClosed();
      fixture.detectChanges();

      expect(component.selectedTask()).toBeNull();
      const panel = fixture.debugElement.query(By.css('app-task-detail-panel'));
      expect(panel).toBeNull();
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
});
