import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  Signal,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';

import { BoardStateService } from '../state/board-state.service';
import { BoardColumn, BoardTask } from '../state/board-state.model';
import {
  ColumnsApiService,
  mapColumnErrorToUserMessage
} from '../services/columns-api.service';
import {
  TasksApiService,
  mapTaskCreateErrorToUserMessage,
  mapTaskMoveErrorToUserMessage
} from '../services/tasks-api.service';
import { ColumnResponseDto, CreateColumnDto } from '../models/column.model';
import { BoardColumnComponent } from '../components/board-column/board-column.component';
import { BoardAddColumnComponent } from '../components/board-add-column/board-add-column.component';
import { TaskDetailPanelComponent } from '../components/task-detail-panel/task-detail-panel.component';
import type { DropzoneFileSelectedEvent } from '../../attachments/models/dropzone.model';
import { AttachmentsStateService } from '../../attachments/state/attachments-state.service';

/** Auto-dismiss duration (ms) for the inline move-error strip. */
const MOVE_ERROR_AUTO_DISMISS_MS = 5000;

/** Per-column transient UI state for the add-task flow (issue #78). */
interface TaskDraftState {
  open: boolean;
  submitting: boolean;
  error: string | null;
}
type TaskDraftMap = Record<string, TaskDraftState>;

/** Default slice for columns the user has never opened. */
const EMPTY_DRAFT: TaskDraftState = {
  open: false,
  submitting: false,
  error: null
};

/**
 * Board page — smart container.
 *
 * Owns the lifecycle (`enterBoard` / `leaveBoard`), the initial column
 * fetch, and the optimistic-then-HTTP drop orchestration. Delegates
 * rendering of columns and cards to presentational children.
 */
@Component({
  selector: 'app-board-page',
  standalone: true,
  imports: [
    DragDropModule,
    BoardColumnComponent,
    BoardAddColumnComponent,
    TaskDetailPanelComponent
  ],
  templateUrl: './board-page.component.html',
  styleUrl: './board-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly boardState = inject(BoardStateService);
  private readonly columnsApi = inject(ColumnsApiService);
  private readonly tasksApi = inject(TasksApiService);
  private readonly attachmentsState = inject(AttachmentsStateService);
  private readonly destroyRef = inject(DestroyRef);

  /** Read-through from the state service. */
  readonly columns: Signal<BoardColumn[]> = this.boardState.columns;
  readonly tasksByColumnId: Signal<Record<string, BoardTask[]>> =
    this.boardState.tasksByColumnId;

  /**
   * Full list of sibling drop-list IDs. Passed to every column so CDK's
   * `cdkDropListConnectedTo` wires cross-column transfers.
   */
  readonly dropListIds: Signal<string[]> = computed(() =>
    this.columns().map(c => `drop-list-${c.id}`)
  );

  /**
   * Block-level error message rendered when the initial column fetch
   * fails. Never cleared within this ticket's UI (no retry button — user
   * navigates back to dashboard per the context doc).
   */
  readonly columnLoadError = signal<string | null>(null);

  /**
   * Transient inline move-error strip. Set on a failed task move,
   * auto-cleared on the next successful move or after
   * `MOVE_ERROR_AUTO_DISMISS_MS`.
   */
  readonly moveError = signal<string | null>(null);

  /**
   * Id of the task to shake after a rejected move, paired with an
   * incrementing `rolledBackTrigger` counter so the TaskCardComponent
   * replays the animation.
   */
  readonly rolledBackTaskId = signal<string | null>(null);
  readonly rolledBackTrigger = signal<number>(0);

  /** Screen-reader announcement region — kept in sync via `announce()`. */
  readonly dragAnnouncement = signal<string>('');

  /**
   * The task whose detail drawer is currently open, or null when the
   * drawer is closed. Set by `handleTaskOpened`, cleared by `handleTaskDetailClosed`.
   */
  readonly selectedTask = signal<BoardTask | null>(null);

  // ---------------- Issue #77 — add-column flow ----------------

  /**
   * `'closed'` shows the trigger affordance (empty-state button or
   * trailing "+ Add column"); `'open'` renders the
   * `BoardAddColumnComponent` inline in the originating slot.
   */
  readonly addColumnMode = signal<'closed' | 'open'>('closed');

  /** True while an HTTP create is in flight. Blocks re-submit. */
  readonly createColumnSubmitting = signal<boolean>(false);

  /**
   * Inline server-side error copy for the add-column surface. `null` when
   * no error is pending. Populated via `mapColumnErrorToUserMessage` on
   * HTTP failure; cleared on every reopen / successful submit.
   */
  readonly createColumnError = signal<string | null>(null);

  /**
   * Derived list of current column names. Passed into
   * `BoardAddColumnComponent` to drive the duplicate validator. Computed
   * rather than plain `.map` so the validator-side effect only re-fires
   * when the names actually change.
   */
  readonly existingColumnNames: Signal<readonly string[]> = computed(() =>
    this.columns().map(c => c.name)
  );

  // ---------------- Issue #78 — add-task flow ----------------

  /**
   * Per-column add-task state map. Keyed by `columnId`; missing keys
   * mean the column has never opened its form. Every mutation replaces
   * the entire map reference so OnPush CD picks up the change.
   */
  readonly taskDrafts = signal<TaskDraftMap>({});

  /**
   * Trigger button inside the empty-state panel. Receives focus when the
   * user cancels from the empty-board flow.
   */
  @ViewChild('emptyStateAddButton', { read: ElementRef })
  private emptyStateAddButton?: ElementRef<HTMLButtonElement>;

  /**
   * Trailing "+ Add column" trigger button on populated boards. Receives
   * focus after a cancel OR a successful submit.
   */
  @ViewChild('trailingAddButton', { read: ElementRef })
  private trailingAddButton?: ElementRef<HTMLButtonElement>;

  /** Pending auto-dismiss timer for `moveError`. */
  private moveErrorTimerId: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('projectId');
    if (projectId === null || projectId.length === 0) {
      return;
    }
    this.boardState.enterBoard(projectId);
    this.loadColumns(projectId);
  }

  ngOnDestroy(): void {
    if (this.moveErrorTimerId !== null) {
      clearTimeout(this.moveErrorTimerId);
      this.moveErrorTimerId = null;
    }
    this.boardState.leaveBoard();
  }

  /** Handler invoked when a `BoardColumnComponent` re-emits a CDK drop. */
  handleTaskDropped(
    targetColumnId: string,
    event: CdkDragDrop<BoardTask[]>
  ): void {
    const movedTask = event.item.data as BoardTask | undefined;
    if (!movedTask) {
      return;
    }
    const fromColumnId = movedTask.columnId;
    const fromOrder = event.previousIndex;
    const toColumnId = targetColumnId;
    const toOrder = event.currentIndex;

    // Early-exit guard: no-op drag + cancelled drag (CDK fires the event
    // with identical container + index in both cases).
    if (fromColumnId === toColumnId && fromOrder === toOrder) {
      this.announce(`Cancelled move of task ${movedTask.title}.`);
      return;
    }

    const token = this.boardState.applyOptimisticTaskMove(
      movedTask.id,
      fromColumnId,
      fromOrder,
      toColumnId,
      toOrder
    );
    if (token === null) {
      return;
    }

    // Narrate the successful local drop for AT users. The network result
    // will either confirm (no extra announcement) or trigger a rollback
    // announcement further down.
    const destination = this.columns().find(c => c.id === toColumnId);
    if (destination) {
      if (fromColumnId === toColumnId) {
        this.announce(
          `Moved task ${movedTask.title} to position ${toOrder + 1} in ${destination.name}.`
        );
      } else {
        this.announce(
          `Moved task ${movedTask.title} to ${destination.name}, position ${toOrder + 1}.`
        );
      }
    }

    this.tasksApi
      .moveTask(movedTask.id, {
        columnId: toColumnId,
        taskOrder: toOrder
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.boardState.reconcileServerTaskMove(response);
          this.clearMoveError();
        },
        error: err => {
          this.boardState.rollbackOptimisticTaskMove(token);
          const body = mapTaskMoveErrorToUserMessage(err);
          this.setMoveError(body);
          this.rolledBackTaskId.set(movedTask.id);
          this.rolledBackTrigger.update(v => v + 1);
          this.announce(`Move undone. ${body}`);
        }
      });
  }

  /** User-dismiss action for the inline move-error strip. */
  dismissMoveError(): void {
    this.clearMoveError();
  }

  /** Invoked by `BoardColumnComponent` when a task card is activated. */
  handleTaskOpened(task: BoardTask): void {
    this.selectedTask.set(task);
  }

  /** Invoked by `TaskDetailPanelComponent.panelClosed`. */
  handleTaskDetailClosed(): void {
    this.selectedTask.set(null);
  }

  /**
   * Dispatches a validated dropzone emission into the root-provided
   * AttachmentsStateService, which owns the HTTP + SignalR pipeline.
   * Thin handler — no state mutation here so the upload survives
   * panel-close and board-navigation.
   */
  handleAttachmentSelected(event: DropzoneFileSelectedEvent): void {
    this.attachmentsState.startUpload(event);
  }

  // ---------------- Issue #77 — add-column handlers ----------------

  /**
   * Opens the inline column-create flow. Called by both the empty-state
   * CTA and the trailing "+ Add column" button. Clearing
   * `createColumnError` BEFORE the `@if` flips open guarantees the fresh
   * child mount does not inherit the previous attempt's server error.
   */
  openAddColumnFlow(): void {
    this.createColumnError.set(null);
    this.addColumnMode.set('open');
    // BoardAddColumnComponent's own `afterNextRender` places focus on the
    // native input — no explicit focus call needed here.
  }

  /**
   * HTTP-success orchestrator for the add-column flow. Emits from the
   * child's `submitted` output with the already-trimmed / already-validated
   * column name. Guards against double-submit + stale project context.
   */
  handleAddColumnSubmit(trimmedName: string): void {
    const projectId = this.boardState.currentProjectId();
    if (projectId === null || this.createColumnSubmitting()) {
      return;
    }
    const currentColumns = this.columns();
    const nextOrder =
      currentColumns.length === 0
        ? 0
        : Math.max(...currentColumns.map(c => c.columnOrder)) + 1;
    const dto: CreateColumnDto = { name: trimmedName, columnOrder: nextOrder };

    this.createColumnSubmitting.set(true);
    this.createColumnError.set(null);

    this.columnsApi
      .createColumn(projectId, dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.boardState.applyCreatedColumn(projectId, created);
          this.createColumnSubmitting.set(false);
          this.addColumnMode.set('closed');
          this.announce(`Column '${created.name}' added.`);
          queueMicrotask(() => this.focusTrailingAddButton());
        },
        error: err => {
          this.createColumnSubmitting.set(false);
          this.createColumnError.set(mapColumnErrorToUserMessage(err, 'create'));
          // Stay open; the child component preserves the typed value.
        }
      });
  }

  /**
   * Cancel handler for both entry surfaces. Closes the form, clears any
   * server error, and restores focus to the originating trigger button.
   * The originating surface is inferred from the current column count
   * (cancel from the empty-state panel fires while `columns().length === 0`;
   * cancel from the trailing slot fires while `columns().length > 0`).
   */
  handleAddColumnCancel(): void {
    const wasEmpty = this.columns().length === 0;
    this.addColumnMode.set('closed');
    this.createColumnError.set(null);
    queueMicrotask(() => {
      if (wasEmpty) {
        this.focusEmptyStateAddButton();
      } else {
        this.focusTrailingAddButton();
      }
    });
  }

  private focusEmptyStateAddButton(): void {
    this.emptyStateAddButton?.nativeElement.focus();
  }

  private focusTrailingAddButton(): void {
    this.trailingAddButton?.nativeElement.focus();
  }

  // ---------------- Issue #78 — add-task handlers ----------------

  /** Per-column accessor used inline in the template — cheap, signal-backed. */
  draftFor(columnId: string): TaskDraftState {
    return this.taskDrafts()[columnId] ?? EMPTY_DRAFT;
  }

  /**
   * Updates a single column's draft slot, replacing the map reference so
   * the OnPush template picks up the change.
   */
  private setDraft(columnId: string, next: TaskDraftState): void {
    this.taskDrafts.update(current => ({ ...current, [columnId]: next }));
  }

  /**
   * User clicked the "Add task" trigger in a column. Open the form and
   * clear any prior error so the fresh mount does not inherit stale copy.
   */
  openAddTaskFlow(columnId: string): void {
    this.setDraft(columnId, { open: true, submitting: false, error: null });
    // BoardAddTaskComponent's own `afterNextRender` focuses the native
    // input — no explicit focus call needed here.
  }

  /**
   * HTTP-success orchestrator for the add-task flow. Guards against
   * double-submit, stale project context, and stale `columnId`
   * (ColumnDeleted arriving between open and submit).
   */
  handleAddTaskSubmit(columnId: string, trimmedTitle: string): void {
    const projectId = this.boardState.currentProjectId();
    if (projectId === null) {
      return;
    }
    if (this.draftFor(columnId).submitting) {
      // Rapid double-submit defence (AC: one POST only).
      return;
    }
    const columnStillPresent = this.columns().some(c => c.id === columnId);
    if (!columnStillPresent) {
      // Concurrency window: SignalR ColumnDeleted arrived before the user
      // finished typing. Surface the same copy the 404 branch would show.
      this.setDraft(columnId, {
        open: true,
        submitting: false,
        error: mapTaskCreateErrorToUserMessage(
          new HttpErrorResponse({ status: 404 })
        )
      });
      return;
    }

    this.setDraft(columnId, { open: true, submitting: true, error: null });

    this.tasksApi
      .createTask(columnId, { title: trimmedTitle })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.boardState.applyCreatedTask(projectId, created);
          this.setDraft(columnId, EMPTY_DRAFT);
          const columnName =
            this.columns().find(c => c.id === columnId)?.name ?? 'column';
          this.announce(`Task '${created.title}' added to ${columnName}.`);
          queueMicrotask(() => this.focusAddTaskTrigger(columnId));
        },
        error: err => {
          this.setDraft(columnId, {
            open: true,
            submitting: false,
            error: mapTaskCreateErrorToUserMessage(err)
          });
          // Stay open; typed value is preserved in the child FormControl.
        }
      });
  }

  /** Cancel handler — closes the slot and restores focus to the trigger. */
  handleAddTaskCancel(columnId: string): void {
    this.setDraft(columnId, EMPTY_DRAFT);
    queueMicrotask(() => this.focusAddTaskTrigger(columnId));
  }

  /**
   * Re-focuses the column's "Add task" trigger by looking it up via the
   * stable DOM id rendered by `BoardColumnComponent.addTaskTriggerId`.
   * Using a DOM lookup (rather than a ViewChild registration output)
   * sidesteps the `ExpressionChangedAfterItHasBeenChecked` re-check that
   * would otherwise fire when the parent handles a `ViewChild`-driven
   * output during the verify pass.
   */
  private focusAddTaskTrigger(columnId: string): void {
    const id = `add-task-trigger-${columnId}`;
    const el = document.getElementById(id);
    if (el instanceof HTMLButtonElement) {
      el.focus();
    }
  }

  private loadColumns(projectId: string): void {
    this.columnsApi
      .getColumnsForProject(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: dtos => {
          const mapped = this.projectColumnDtos(dtos);
          this.boardState.setColumns(projectId, mapped);
        },
        error: err => {
          this.columnLoadError.set(mapColumnErrorToUserMessage(err, 'list'));
        }
      });
  }

  private projectColumnDtos(dtos: ColumnResponseDto[]): BoardColumn[] {
    // Drop `createdAt` / `updatedAt` — the board UI does not need them
    // and keeping them in local state leaks backend fields that are
    // irrelevant to the view layer.
    return dtos.map(d => ({
      id: d.id,
      name: d.name,
      colorCode: d.colorCode,
      columnOrder: d.columnOrder,
      projectId: d.projectId
    }));
  }

  private setMoveError(message: string): void {
    this.moveError.set(message);
    if (this.moveErrorTimerId !== null) {
      clearTimeout(this.moveErrorTimerId);
    }
    this.moveErrorTimerId = setTimeout(() => {
      this.moveError.set(null);
      this.moveErrorTimerId = null;
    }, MOVE_ERROR_AUTO_DISMISS_MS);
  }

  private clearMoveError(): void {
    if (this.moveErrorTimerId !== null) {
      clearTimeout(this.moveErrorTimerId);
      this.moveErrorTimerId = null;
    }
    this.moveError.set(null);
  }

  private announce(text: string): void {
    this.dragAnnouncement.set(text);
  }
}
