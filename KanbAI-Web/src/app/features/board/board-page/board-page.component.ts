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
  effect,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
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
  mapTaskListErrorToUserMessage,
  mapTaskMoveErrorToUserMessage
} from '../services/tasks-api.service';
import { ColumnResponseDto, CreateColumnDto } from '../models/column.model';
import { BoardColumnComponent } from '../components/board-column/board-column.component';
import { BoardAddColumnComponent } from '../components/board-add-column/board-add-column.component';
import { BoardHeaderComponent } from '../components/board-header/board-header.component';
import { TaskDetailPanelComponent } from '../components/task-detail-panel/task-detail-panel.component';
import { TaskNotFoundToastComponent } from '../components/task-not-found-toast/task-not-found-toast.component';
import type { DropzoneFileSelectedEvent } from '../../attachments/models/dropzone.model';
import { AttachmentsStateService } from '../../attachments/state/attachments-state.service';
import { TASK_DESCRIPTION_COPY } from '../components/task-description-section/task-description-copy';
import { ProjectStateService } from '../../projects/state/project-state.service';
import { ProjectsApiService } from '../../projects/services/projects-api.service';
import { ProjectSummary } from '../../projects/models/project.model';
import { DeleteProjectConfirmDialogComponent } from '../../projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.component';
import {
  DeleteProjectConfirmData,
  DeleteProjectConfirmResult
} from '../../projects/components/delete-project-confirm-dialog/delete-project-confirm-dialog.types';
import { DELETE_PROJECT_DISABLED_COPY } from '../../projects/constants/delete-project-copy';
import { ToastService } from '../../../core/services/toast.service';
import { DeleteColumnConfirmDialogComponent } from '../components/delete-column-confirm-dialog/delete-column-confirm-dialog.component';
import {
  DeleteColumnConfirmData,
  DeleteColumnConfirmResult
} from '../components/delete-column-confirm-dialog/delete-column-confirm-dialog.types';
import { DeleteTaskConfirmDialogComponent } from '../components/delete-task-confirm-dialog/delete-task-confirm-dialog.component';
import {
  DeleteTaskConfirmData,
  DeleteTaskConfirmResult
} from '../components/delete-task-confirm-dialog/delete-task-confirm-dialog.types';

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
    BoardHeaderComponent,
    TaskDetailPanelComponent,
    TaskNotFoundToastComponent
  ],
  templateUrl: './board-page.component.html',
  styleUrl: './board-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly boardState = inject(BoardStateService);
  private readonly columnsApi = inject(ColumnsApiService);
  private readonly tasksApi = inject(TasksApiService);
  private readonly attachmentsState = inject(AttachmentsStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(Dialog);
  private readonly projectState = inject(ProjectStateService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly toastService = inject(ToastService);

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
   * Inline error strip copy for a failed task-read (issue #87). Set by
   * `loadTasks` on error; cleared on a successful Retry or on destroy.
   * Explicitly NOT auto-dismissed — the board is unusable without tasks,
   * so the user must retry or navigate away. Do not copy the auto-dismiss
   * pattern from `moveError`.
   */
  readonly taskLoadError = signal<string | null>(null);

  /** True while `loadTasks` is in flight. Disables the Retry button. */
  readonly isLoadingTasks = signal<boolean>(false);

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
   * Id of the task whose detail drawer is currently open, or null when
   * the drawer is closed. Private — consumers read through the
   * {@link selectedTask} projection below.
   */
  private readonly selectedTaskId = signal<string | null>(null);

  /**
   * The task whose detail drawer is currently open, or null when the
   * drawer is closed. Live projection off `boardState.tasksByColumnId()`
   * keyed by {@link selectedTaskId}. When the open task's row is mutated
   * (either by a remote `TaskUpdated` echo or the originating client's
   * own save / clear via `applyLocalTaskUpdateFromDto` /
   * `applyLocalTaskDescriptionCleared`), this computed re-emits and the
   * template's `@if (selectedTask(); as task)` binding re-fires, which
   * re-fires the `[task]` input into `TaskDetailPanelComponent` and
   * `TaskDescriptionSectionComponent`, which re-derives `readDisplay`.
   * That is the mechanism that makes the freshest `content` reach the
   * rendered read mode within the same microtask as the save's `next`
   * handler (issue #94).
   */
  readonly selectedTask: Signal<BoardTask | null> = computed(() => {
    const id = this.selectedTaskId();
    if (id === null) {
      return null;
    }
    const buckets = this.boardState.tasksByColumnId();
    for (const bucket of Object.values(buckets)) {
      const found = bucket.find(t => t.id === id);
      if (found) {
        return found;
      }
    }
    // Task was removed from state (ColumnDeleted, TaskMoved to a bucket
    // we don't track, etc.) — panel collapses. The 404 toast path is
    // separate and still runs on explicit 404 handling (unchanged by #94).
    return null;
  });

  /**
   * 404 toast surfaced when description save/clear hits a deleted task
   * (issue #91). Null when the toast is not showing.
   */
  readonly taskNotFoundToast = signal<{ message: string } | null>(null);

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

  // ---------------- Issue #96 — delete-project flow ----------------

  /**
   * The `ProjectSummary` for the currently-viewed board, or null during
   * boot or if the user no longer has access. Derived from the dashboard-
   * scope cache — no extra HTTP.
   */
  readonly currentProject: Signal<ProjectSummary | null> = computed(() => {
    const id = this.boardState.currentProjectId();
    if (id === null) {
      return null;
    }
    return this.projectState.projects().find(p => p.id === id) ?? null;
  });

  private readonly deleteProjectSubmitting = signal<boolean>(false);
  private readonly deleteProjectError = signal<string | null>(null);

  // Delete-column dialog state (issue #96 sub-feature B).
  private readonly deleteColumnSubmitting = signal<boolean>(false);
  private readonly deleteColumnError = signal<string | null>(null);

  // Delete-task dialog state (issue #96 sub-feature C).
  private readonly deleteTaskSubmitting = signal<boolean>(false);
  private readonly deleteTaskError = signal<string | null>(null);

  constructor() {
    // Remote-delete navigation for the currently-viewed board (issue #96).
    // Fires when the current project id disappears from the dashboard
    // cache (SignalR `ProjectDeleted` → `ProjectStateService.onProjectDeleted`
    // removes it). Gated on `hasLoaded` so the pre-hydration empty list
    // does not trigger a spurious bounce.
    let navigatedForCurrent: string | null = null;
    effect(() => {
      const hasLoaded = this.projectState.hasLoaded();
      const activeId = this.boardState.currentProjectId();
      if (!hasLoaded || activeId === null) {
        return;
      }
      const stillPresent = this.projectState
        .projects()
        .some(p => p.id === activeId);
      if (stillPresent || navigatedForCurrent === activeId) {
        return;
      }
      navigatedForCurrent = activeId;
      // Remote delete — navigate back and surface the info toast.
      void this.router.navigate(['/dashboard']);
      this.toastService.show(
        'This project was deleted by another member',
        'info'
      );
    });
  }

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
    this.selectedTaskId.set(task.id);
  }

  /** Invoked by `TaskDetailPanelComponent.panelClosed`. */
  handleTaskDetailClosed(): void {
    this.selectedTaskId.set(null);
  }

  /**
   * Invoked when the description child reports a 404 (issue #91). Closes
   * the panel and surfaces the "This task no longer exists" toast.
   */
  handleTaskNotFound(): void {
    this.selectedTaskId.set(null);
    this.taskNotFoundToast.set({
      message: TASK_DESCRIPTION_COPY.TOAST_TASK_NOT_FOUND
    });
  }

  /** Dismiss handler for the 404 toast (click or auto-dismiss). */
  dismissTaskNotFoundToast(): void {
    this.taskNotFoundToast.set(null);
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
          // Only issue the task-read if the column load succeeded AND we're
          // still on the same project. The stale-id guard inside setTasks is
          // a second line of defence, but avoiding the HTTP call at all on
          // stale navigation is cheaper.
          if (this.boardState.currentProjectId() === projectId) {
            this.loadTasks(projectId);
          }
        },
        error: err => {
          this.columnLoadError.set(mapColumnErrorToUserMessage(err, 'list'));
          // Do NOT issue loadTasks — the full-board columnLoadError panel is
          // already rendering in place of the columns UI, so tasks are moot.
        }
      });
  }

  /**
   * HTTP read for the project's tasks. Invoked on `ngOnInit` after
   * `loadColumns` resolves (so `setTasks`'s allowed-ids filter has columns
   * to filter against) and on `retryLoadTasks`. The stale-project guard
   * inside `setTasks` makes it safe to interleave with user navigation.
   *
   * Success path announces hydration via `dragAnnouncement` (reusing the
   * existing polite live-region); error path populates `taskLoadError`
   * with mapped copy.
   */
  private loadTasks(projectId: string): void {
    this.isLoadingTasks.set(true);
    this.taskLoadError.set(null);

    this.tasksApi
      .getTasksForProject(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: dtos => {
          this.boardState.setTasks(projectId, dtos);
          this.isLoadingTasks.set(false);

          // Announce only if this hydration actually landed — the stale-project
          // guard inside `setTasks` may have no-op'd if the user navigated away.
          if (this.boardState.currentProjectId() === projectId) {
            const columnCount = this.columns().length;
            const taskCount = Object.values(this.tasksByColumnId()).reduce(
              (sum, bucket) => sum + bucket.length,
              0
            );
            if (taskCount > 0) {
              this.announce(
                `Board loaded with ${taskCount} tasks across ${columnCount} columns.`
              );
            }
          }
        },
        error: err => {
          this.isLoadingTasks.set(false);
          this.taskLoadError.set(mapTaskListErrorToUserMessage(err));
        }
      });
  }

  /** Retry handler for the inline task-load error strip. */
  retryLoadTasks(): void {
    const projectId = this.boardState.currentProjectId();
    if (projectId === null || this.isLoadingTasks()) {
      return;
    }
    this.loadTasks(projectId);
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

  // ---------------- Issue #96 — delete-project orchestration ----------------

  /**
   * Entry point bound to `BoardHeaderComponent.deleteProjectRequested`. Opens
   * the destructive-confirm dialog and wires the child's `confirmClicked` to
   * the HTTP submit. Mirrors `DashboardPageComponent.openDeleteProjectDialog`
   * — the only difference is that success navigates back to `/dashboard`
   * BEFORE firing the toast so the live-region announcement lands on the
   * destination page.
   */
  openDeleteProjectDialog(): void {
    const project = this.currentProject();
    if (project === null) {
      return;
    }
    this.deleteProjectSubmitting.set(false);
    this.deleteProjectError.set(null);

    const ref = this.dialog.open<
      DeleteProjectConfirmResult,
      DeleteProjectConfirmData,
      DeleteProjectConfirmDialogComponent
    >(DeleteProjectConfirmDialogComponent, {
      data: { projectName: project.name },
      ariaLabelledBy: 'delete-project-confirm-heading',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      disableClose: false,
      panelClass: 'delete-project-confirm-panel',
      backdropClass: 'delete-project-confirm-backdrop'
    });

    const sub = ref.componentInstance?.confirmClicked.subscribe(() =>
      this.submitDeleteProject(project, ref)
    );
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      sub?.unsubscribe();
    });

    this.syncDeleteProjectInputs(ref);
  }

  private syncDeleteProjectInputs(
    ref: DialogRef<DeleteProjectConfirmResult, DeleteProjectConfirmDialogComponent>
  ): void {
    ref.componentRef?.setInput('submitting', this.deleteProjectSubmitting());
    ref.componentRef?.setInput('inlineError', this.deleteProjectError());
  }

  private submitDeleteProject(
    project: ProjectSummary,
    ref: DialogRef<DeleteProjectConfirmResult, DeleteProjectConfirmDialogComponent>
  ): void {
    if (this.deleteProjectSubmitting()) {
      return;
    }
    this.deleteProjectSubmitting.set(true);
    this.deleteProjectError.set(null);
    this.syncDeleteProjectInputs(ref);

    this.projectsApi
      .deleteProject(project.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onBoardDeleteSuccess(project, ref),
        error: err => this.onBoardDeleteError(project, err, ref)
      });
  }

  private onBoardDeleteSuccess(
    project: ProjectSummary,
    ref: DialogRef<DeleteProjectConfirmResult, DeleteProjectConfirmDialogComponent>
  ): void {
    this.deleteProjectSubmitting.set(false);
    this.projectState.applyDeletedProject(project.id);
    ref.close(true);
    // Navigate FIRST so the toast + announcement land on the dashboard.
    void this.router.navigate(['/dashboard']).then(() => {
      this.toastService.show(`Project '${project.name}' was deleted`);
      this.toastService.announce('Project deleted');
    });
  }

  private onBoardDeleteError(
    project: ProjectSummary,
    err: unknown,
    ref: DialogRef<DeleteProjectConfirmResult, DeleteProjectConfirmDialogComponent>
  ): void {
    this.deleteProjectSubmitting.set(false);
    const status = err instanceof HttpErrorResponse ? err.status : null;

    if (status === 404) {
      this.onBoardDeleteSuccess(project, ref);
      return;
    }
    if (status === 403) {
      ref.close(undefined);
      this.toastService.show(DELETE_PROJECT_DISABLED_COPY, 'info');
      return;
    }
    if (status === 0) {
      this.deleteProjectError.set("Couldn't reach the server — try again");
      this.syncDeleteProjectInputs(ref);
      return;
    }
    this.deleteProjectError.set("Couldn't delete project — please try again");
    this.syncDeleteProjectInputs(ref);
  }

  // ---------------- Issue #96 — delete-column orchestration ----------------

  /** Entry point bound to `BoardColumnComponent.deleteColumnRequested`. */
  openDeleteColumnDialog(column: BoardColumn): void {
    this.deleteColumnSubmitting.set(false);
    this.deleteColumnError.set(null);

    const taskCount = (this.tasksByColumnId()[column.id] ?? []).length;

    const ref = this.dialog.open<
      DeleteColumnConfirmResult,
      DeleteColumnConfirmData,
      DeleteColumnConfirmDialogComponent
    >(DeleteColumnConfirmDialogComponent, {
      data: { columnName: column.name, taskCount },
      ariaLabelledBy: 'delete-column-confirm-heading',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      disableClose: false,
      panelClass: 'delete-column-confirm-panel',
      backdropClass: 'delete-column-confirm-backdrop'
    });

    const sub = ref.componentInstance?.confirmClicked.subscribe(() =>
      this.submitDeleteColumn(column, ref)
    );
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      sub?.unsubscribe();
    });

    this.syncDeleteColumnInputs(ref);
  }

  private syncDeleteColumnInputs(
    ref: DialogRef<DeleteColumnConfirmResult, DeleteColumnConfirmDialogComponent>
  ): void {
    ref.componentRef?.setInput('submitting', this.deleteColumnSubmitting());
    ref.componentRef?.setInput('inlineError', this.deleteColumnError());
  }

  private submitDeleteColumn(
    column: BoardColumn,
    ref: DialogRef<DeleteColumnConfirmResult, DeleteColumnConfirmDialogComponent>
  ): void {
    if (this.deleteColumnSubmitting()) {
      return;
    }
    this.deleteColumnSubmitting.set(true);
    this.deleteColumnError.set(null);
    this.syncDeleteColumnInputs(ref);

    this.boardState
      .deleteColumn(column.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onColumnDeleteSuccess(column, ref),
        error: err => this.onColumnDeleteError(column, err, ref)
      });
  }

  private onColumnDeleteSuccess(
    column: BoardColumn,
    ref: DialogRef<DeleteColumnConfirmResult, DeleteColumnConfirmDialogComponent>
  ): void {
    this.deleteColumnSubmitting.set(false);
    // If the currently-open task lived in the deleted column, close the panel.
    // Idempotent when no task is open — see handleTaskDetailClosed.
    const openTask = this.selectedTask();
    if (openTask !== null && openTask.columnId === column.id) {
      this.handleTaskDetailClosed();
    }
    ref.close(true);
    this.toastService.show(`Column '${column.name}' was deleted`);
    this.toastService.announce('Column deleted');
  }

  private onColumnDeleteError(
    column: BoardColumn,
    err: unknown,
    ref: DialogRef<DeleteColumnConfirmResult, DeleteColumnConfirmDialogComponent>
  ): void {
    this.deleteColumnSubmitting.set(false);
    const status = err instanceof HttpErrorResponse ? err.status : null;

    if (status === 404) {
      // Already gone server-side: apply the local cascade and run success.
      this.boardState.applyDeletedColumn(column.id);
      this.onColumnDeleteSuccess(column, ref);
      return;
    }
    if (status === 403) {
      ref.close(undefined);
      this.toastService.show(
        "You don't have permission to delete this column",
        'info'
      );
      return;
    }
    if (status === 0) {
      this.deleteColumnError.set("Couldn't reach the server — try again");
      this.syncDeleteColumnInputs(ref);
      return;
    }
    this.deleteColumnError.set("Couldn't delete column — please try again");
    this.syncDeleteColumnInputs(ref);
  }

  // ---------------- Issue #96 — delete-task orchestration ----------------

  /** Entry point bound to `TaskDetailPanelComponent.deleteTaskRequested`. */
  openDeleteTaskDialog(task: BoardTask): void {
    this.deleteTaskSubmitting.set(false);
    this.deleteTaskError.set(null);

    const ref = this.dialog.open<
      DeleteTaskConfirmResult,
      DeleteTaskConfirmData,
      DeleteTaskConfirmDialogComponent
    >(DeleteTaskConfirmDialogComponent, {
      data: { taskTitle: task.title },
      ariaLabelledBy: 'delete-task-confirm-heading',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      disableClose: false,
      panelClass: 'delete-task-confirm-panel',
      backdropClass: 'delete-task-confirm-backdrop'
    });

    const sub = ref.componentInstance?.confirmClicked.subscribe(() =>
      this.submitDeleteTask(task, ref)
    );
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      sub?.unsubscribe();
    });

    this.syncDeleteTaskInputs(ref);
  }

  private syncDeleteTaskInputs(
    ref: DialogRef<DeleteTaskConfirmResult, DeleteTaskConfirmDialogComponent>
  ): void {
    ref.componentRef?.setInput('submitting', this.deleteTaskSubmitting());
    ref.componentRef?.setInput('inlineError', this.deleteTaskError());
  }

  private submitDeleteTask(
    task: BoardTask,
    ref: DialogRef<DeleteTaskConfirmResult, DeleteTaskConfirmDialogComponent>
  ): void {
    if (this.deleteTaskSubmitting()) {
      return;
    }
    this.deleteTaskSubmitting.set(true);
    this.deleteTaskError.set(null);
    this.syncDeleteTaskInputs(ref);

    this.boardState
      .deleteTask(task.id, task.columnId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onTaskDeleteSuccess(task, ref),
        error: err => this.onTaskDeleteError(task, err, ref)
      });
  }

  private onTaskDeleteSuccess(
    task: BoardTask,
    ref: DialogRef<DeleteTaskConfirmResult, DeleteTaskConfirmDialogComponent>
  ): void {
    this.deleteTaskSubmitting.set(false);
    // Close the detail panel first — the card and panel should not linger
    // over deleted state. `selectedTask` also collapses automatically once
    // the task is gone from state, but the explicit call is belt-and-braces
    // per tech spec §C.5.
    this.handleTaskDetailClosed();
    ref.close(true);
    this.toastService.show(`Task '${task.title}' was deleted`);
    this.toastService.announce('Task deleted');
  }

  private onTaskDeleteError(
    task: BoardTask,
    err: unknown,
    ref: DialogRef<DeleteTaskConfirmResult, DeleteTaskConfirmDialogComponent>
  ): void {
    this.deleteTaskSubmitting.set(false);
    const status = err instanceof HttpErrorResponse ? err.status : null;

    if (status === 404) {
      // Idempotent-delete success — remove locally and run success path.
      this.boardState.applyDeletedTask(task.id, task.columnId);
      this.onTaskDeleteSuccess(task, ref);
      return;
    }
    if (status === 403) {
      // Task 403 surfaces INLINE (not a toast) per the copy matrix — the
      // user already has the panel open; stacking a toast on a collapsing
      // panel is noisy.
      this.deleteTaskError.set("You don't have permission to delete this task");
      this.syncDeleteTaskInputs(ref);
      return;
    }
    if (status === 0) {
      this.deleteTaskError.set("Couldn't reach the server — try again");
      this.syncDeleteTaskInputs(ref);
      return;
    }
    // 500, other, parse failure — retry-in-place is valid for 500 (task
    // preserved server-side). Single generic copy per the matrix.
    this.deleteTaskError.set("Couldn't delete task — please try again");
    this.syncDeleteTaskInputs(ref);
  }
}
