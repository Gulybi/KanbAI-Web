import { DestroyRef, Injectable, Signal, effect, inject } from '@angular/core';
import { Subscription } from 'rxjs';

import { BaseStateService } from '../../../core/state/base-state.service';
import { SignalRService } from '../../../core/services/signalr.service';
import { ProjectStateService } from '../../projects/state/project-state.service';
import {
  ColumnCreatedEvent,
  ColumnDeletedEvent,
  REALTIME_EVENT,
  TaskCreatedEvent,
  TaskMovedEvent
} from '../../../core/models/realtime-events';
import {
  BoardColumn,
  BoardState,
  BoardTask,
  INITIAL_BOARD_STATE
} from './board-state.model';

/**
 * Board-scope state + realtime reconciler.
 *
 * Owns the `currentProjectId` + `columns` + `tasksByColumnId` slice, drives
 * `JoinProjectGroup` / `LeaveProjectGroup` via {@link SignalRService} for the
 * currently-viewed board (the "Layer 2" join described in the tech spec),
 * and reconciles the four board-scope events into local state.
 *
 * All reconciliation is idempotent and silent-no-op on missing entities —
 * see issue_46_tech_spec.md §"Event handlers → BoardStateService" and AC11
 * in issue_46_context.md.
 */
@Injectable({ providedIn: 'root' })
export class BoardStateService extends BaseStateService<BoardState> {
  private readonly signalRService = inject(SignalRService);
  private readonly projectStateService = inject(ProjectStateService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Active event subscriptions. Refreshed on every `connectionState → 'connected'`
   * transition so the subjects emitted after a `stop()`/`start()` cycle
   * (e.g. logout → login) land in fresh subscribers.
   */
  private subscriptionBag: Subscription[] = [];

  /** Public selectors. */
  readonly currentProjectId: Signal<string | null> = this.select(s => s.currentProjectId);
  readonly columns: Signal<BoardColumn[]> = this.select(s => s.columns);
  readonly tasksByColumnId: Signal<Record<string, BoardTask[]>> = this.select(
    s => s.tasksByColumnId
  );

  constructor() {
    super();

    // (Re)subscribe to the four board events on every connect. Also
    // re-joins the current board group on reconnect — see Edge Cases in
    // the tech spec ("Reconnect during board session").
    effect(() => {
      const state = this.signalRService.connectionState();
      if (state !== 'connected') {
        return;
      }

      this.teardownSubscriptions();

      this.subscriptionBag.push(
        this.signalRService
          .on<ColumnCreatedEvent>(REALTIME_EVENT.ColumnCreated)
          .subscribe(evt => this.onColumnCreated(evt))
      );
      this.subscriptionBag.push(
        this.signalRService
          .on<ColumnDeletedEvent>(REALTIME_EVENT.ColumnDeleted)
          .subscribe(evt => this.onColumnDeleted(evt))
      );
      this.subscriptionBag.push(
        this.signalRService
          .on<TaskCreatedEvent>(REALTIME_EVENT.TaskCreated)
          .subscribe(evt => this.onTaskCreated(evt))
      );
      this.subscriptionBag.push(
        this.signalRService
          .on<TaskMovedEvent>(REALTIME_EVENT.TaskMoved)
          .subscribe(evt => this.onTaskMoved(evt))
      );

      // If a board session straddled a reconnect, the server-side group
      // membership was wiped on disconnect. Re-issue the board-scope join
      // so task/column broadcasts keep flowing.
      const active = this.getState().currentProjectId;
      if (active !== null) {
        void this.signalRService.joinProjectGroup(active);
      }
    });

    this.destroyRef.onDestroy(() => this.teardownSubscriptions());
  }

  protected getInitialState(): BoardState {
    return INITIAL_BOARD_STATE;
  }

  /**
   * Called by `BoardPageComponent.ngOnInit(projectId)`. Clears any state
   * held for a previously viewed board, records the new `currentProjectId`,
   * and invokes `JoinProjectGroup` so task/column broadcasts flow.
   */
  enterBoard(projectId: string): void {
    this.setState({
      currentProjectId: projectId,
      columns: [],
      tasksByColumnId: {}
    });
    void this.signalRService.joinProjectGroup(projectId);
  }

  /**
   * Called by `BoardPageComponent.ngOnDestroy`. Clears board-scope state
   * and invokes `LeaveProjectGroup` ONLY IF the project is no longer in
   * the user's current project list — otherwise `ProjectStateService`
   * (Layer 1) still wants the group retained so dashboard-scope events
   * keep arriving. See tech spec §"Join strategy — two layers".
   */
  leaveBoard(): void {
    const projectId = this.getState().currentProjectId;
    this.setState({
      currentProjectId: null,
      columns: [],
      tasksByColumnId: {}
    });
    if (projectId === null) {
      return;
    }
    const stillAMember = this.projectStateService
      .projects()
      .some(p => p.id === projectId);
    if (!stillAMember) {
      void this.signalRService.leaveProjectGroup(projectId);
    }
  }

  // ------------------- event handlers -------------------

  /**
   * Append when projectId matches the current board; ignore otherwise.
   * Dedupe by id. Maintains `columnOrder` ascending.
   */
  private onColumnCreated(evt: ColumnCreatedEvent): void {
    if (!evt || evt.projectId !== this.getState().currentProjectId) {
      return;
    }
    const current = this.getState().columns;
    if (current.some(c => c.id === evt.id)) {
      return;
    }
    const next = [
      ...current,
      {
        id: evt.id,
        name: evt.name,
        colorCode: evt.colorCode,
        columnOrder: evt.columnOrder,
        projectId: evt.projectId
      }
    ].sort((a, b) => a.columnOrder - b.columnOrder);
    this.setState({ columns: next });
  }

  /**
   * Remove the column and drop its task bucket. No-op if absent.
   */
  private onColumnDeleted(evt: ColumnDeletedEvent): void {
    if (!evt || evt.projectId !== this.getState().currentProjectId) {
      return;
    }
    const current = this.getState().columns;
    const nextColumns = current.filter(c => c.id !== evt.columnId);
    if (nextColumns.length === current.length) {
      return;
    }
    const tasksByColumnId = { ...this.getState().tasksByColumnId };
    delete tasksByColumnId[evt.columnId];
    this.setState({ columns: nextColumns, tasksByColumnId });
  }

  /**
   * Append to the bucket of `evt.columnId` iff that column is known.
   * Dedupe by id. Maintains `taskOrder` ascending.
   *
   * Attribution: the backend only broadcasts to the joined group, so the
   * combination of (client is in this group) + (`currentProjectId !== null`)
   * + (column exists in state) is sufficient. A `TaskCreated` for a column
   * that isn't in state is silently dropped per AC11.
   */
  private onTaskCreated(evt: TaskCreatedEvent): void {
    if (!evt || this.getState().currentProjectId === null) {
      return;
    }
    const column = this.getState().columns.find(c => c.id === evt.columnId);
    if (!column) {
      return;
    }
    const bucket = this.getState().tasksByColumnId[evt.columnId] ?? [];
    if (bucket.some(t => t.id === evt.id)) {
      return;
    }
    const newTask: BoardTask = {
      id: evt.id,
      title: evt.title,
      content: evt.content,
      taskOrder: evt.taskOrder,
      columnId: evt.columnId,
      assignedId: evt.assignedId
    };
    const next = [...bucket, newTask].sort((a, b) => a.taskOrder - b.taskOrder);
    this.setState({
      tasksByColumnId: {
        ...this.getState().tasksByColumnId,
        [evt.columnId]: next
      }
    });
  }

  /**
   * Move a task from `oldColumnId` to `newColumnId`.
   *  - If the task is not present in the old bucket, silent no-op (AC11).
   *  - The new row comes from `evt.task` (full post-move TaskResponseDto)
   *    so we don't have to reach for any pre-move fields.
   */
  private onTaskMoved(evt: TaskMovedEvent): void {
    if (!evt || !evt.task || this.getState().currentProjectId === null) {
      return;
    }
    const buckets = this.getState().tasksByColumnId;
    const oldBucket = buckets[evt.oldColumnId] ?? [];
    const existsOld = oldBucket.some(t => t.id === evt.taskId);
    if (!existsOld) {
      return;
    }
    const newOldBucket = oldBucket.filter(t => t.id !== evt.taskId);
    const newBucket = buckets[evt.newColumnId] ?? [];
    const movedTask: BoardTask = {
      id: evt.task.id,
      title: evt.task.title,
      content: evt.task.content,
      taskOrder: evt.task.taskOrder,
      columnId: evt.task.columnId,
      assignedId: evt.task.assignedId
    };
    const inserted = [
      ...newBucket.filter(t => t.id !== movedTask.id),
      movedTask
    ].sort((a, b) => a.taskOrder - b.taskOrder);
    this.setState({
      tasksByColumnId: {
        ...buckets,
        [evt.oldColumnId]: newOldBucket,
        [evt.newColumnId]: inserted
      }
    });
  }

  private teardownSubscriptions(): void {
    for (const sub of this.subscriptionBag) {
      sub.unsubscribe();
    }
    this.subscriptionBag = [];
  }
}
