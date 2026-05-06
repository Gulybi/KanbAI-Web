import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  Signal,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';

import { BoardStateService } from '../state/board-state.service';
import { BoardColumn, BoardTask } from '../state/board-state.model';
import {
  ColumnsApiService,
  mapColumnErrorToUserMessage
} from '../services/columns-api.service';
import {
  TasksApiService,
  mapTaskMoveErrorToUserMessage
} from '../services/tasks-api.service';
import { ColumnResponseDto } from '../models/column.model';
import { BoardColumnComponent } from '../components/board-column/board-column.component';
import { TaskDetailPanelComponent } from '../components/task-detail-panel/task-detail-panel.component';
import type { DropzoneFileSelectedEvent } from '../../attachments/models/dropzone.model';

/** Auto-dismiss duration (ms) for the inline move-error strip. */
const MOVE_ERROR_AUTO_DISMISS_MS = 5000;

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
  imports: [DragDropModule, BoardColumnComponent, TaskDetailPanelComponent],
  templateUrl: './board-page.component.html',
  styleUrl: './board-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly boardState = inject(BoardStateService);
  private readonly columnsApi = inject(ColumnsApiService);
  private readonly tasksApi = inject(TasksApiService);
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
   * Consumed by issue #50 (upload pipeline). In #49 we intentionally do
   * nothing with the validated file — the emission is proof that the
   * contract between the dropzone and the future upload service holds.
   */
  handleAttachmentSelected(_event: DropzoneFileSelectedEvent): void {
    // No-op in #49. #50 will replace this with an upload call.
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
