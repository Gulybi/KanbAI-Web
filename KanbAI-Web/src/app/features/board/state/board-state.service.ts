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
  TaskMovedEvent,
  TaskUpdatedEvent
} from '../../../core/models/realtime-events';
import {
  BoardColumn,
  BoardState,
  BoardTask,
  INITIAL_BOARD_STATE,
  OptimisticMoveToken
} from './board-state.model';
import { TaskResponseDto } from '../models/task.model';
import { ColumnResponseDto } from '../models/column.model';

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
      this.subscriptionBag.push(
        this.signalRService
          .on<TaskUpdatedEvent>(REALTIME_EVENT.TaskUpdated)
          .subscribe(evt => this.onTaskUpdated(evt))
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
    if (!evt || typeof evt.projectId !== 'string') {
      return;
    }
    this.appendBoardColumnIfNew(evt.projectId, {
      id: evt.id,
      name: evt.name,
      colorCode: evt.colorCode,
      columnOrder: evt.columnOrder,
      projectId: evt.projectId
    });
  }

  /**
   * Shared append-if-new helper used by both the SignalR `ColumnCreated`
   * handler (`onColumnCreated`) and the HTTP-success entry point
   * (`applyCreatedColumn`). Guarantees the two paths follow identical
   * project-guard, id-dedupe, and sort-by-`columnOrder` semantics — so a
   * client's own create + SignalR echo of that create never double-insert.
   */
  private appendBoardColumnIfNew(
    projectId: string,
    column: BoardColumn
  ): void {
    if (projectId !== this.getState().currentProjectId) {
      return;
    }
    const current = this.getState().columns;
    if (current.some(c => c.id === column.id)) {
      return;
    }
    const next = [...current, column].sort(
      (a, b) => a.columnOrder - b.columnOrder
    );
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
   * SignalR handler for `TaskCreated` — delegates to the shared
   * {@link appendBoardTaskIfNew} helper so this path and the HTTP-success
   * path (`applyCreatedTask`) agree on dedupe + project-guard semantics.
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
    this.appendBoardTaskIfNew(this.getState().currentProjectId!, {
      id: evt.id,
      title: evt.title,
      content: evt.content,
      taskOrder: evt.taskOrder,
      columnId: evt.columnId,
      assignedId: evt.assignedId
    });
  }

  /**
   * Shared append-if-new helper used by both the SignalR `TaskCreated`
   * handler (`onTaskCreated`) and the HTTP-success entry point
   * (`applyCreatedTask`, issue #78). Guarantees the two paths follow
   * identical project-guard, column-known guard, id-dedupe, and
   * sort-by-`taskOrder` semantics — so a client's own create + SignalR
   * echo of that create never double-insert.
   */
  private appendBoardTaskIfNew(projectId: string, task: BoardTask): void {
    if (projectId !== this.getState().currentProjectId) {
      return;
    }
    const column = this.getState().columns.find(c => c.id === task.columnId);
    if (!column) {
      return;
    }
    const bucket = this.getState().tasksByColumnId[task.columnId] ?? [];
    if (bucket.some(t => t.id === task.id)) {
      return;
    }
    const next = [...bucket, task].sort((a, b) => a.taskOrder - b.taskOrder);
    this.setState({
      tasksByColumnId: {
        ...this.getState().tasksByColumnId,
        [task.columnId]: next
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

  /**
   * SignalR handler for `TaskUpdated` — fires on description edit/clear
   * (issue #85). Reconciles by `id` with `content` as the source of truth
   * (nullable after a clear, per backend_api_map.md:176). Silently no-ops
   * if the task is not in local state — hydration is the authoritative
   * insertion path and a pre-hydration `TaskUpdated` for an unknown id is
   * a race that resolves itself when the GET lands.
   *
   * If `evt.columnId` differs from the task's current bucket (the backend
   * emits `TaskUpdated` only on description mutations, so this is not
   * expected), the handler trusts `evt.columnId` and moves the task — same
   * cross-bucket reconcile pattern as `reconcileServerTaskMove`.
   */
  private onTaskUpdated(evt: TaskUpdatedEvent): void {
    if (!evt || this.getState().currentProjectId === null) {
      return;
    }
    const buckets = this.getState().tasksByColumnId;
    const ownerEntry = Object.entries(buckets).find(([, bucket]) =>
      bucket.some(t => t.id === evt.id)
    );
    if (!ownerEntry) {
      return;
    }
    const [ownerColumnId, ownerBucket] = ownerEntry;
    const reconciled: BoardTask = {
      id: evt.id,
      title: evt.title,
      content: evt.content,
      taskOrder: evt.taskOrder,
      columnId: evt.columnId,
      assignedId: evt.assignedId
    };
    const nextBuckets: Record<string, BoardTask[]> = { ...buckets };
    if (ownerColumnId === evt.columnId) {
      nextBuckets[ownerColumnId] = ownerBucket
        .map(t => (t.id === evt.id ? reconciled : t))
        .sort((a, b) => a.taskOrder - b.taskOrder);
    } else {
      // Cross-bucket reconcile (defensive — not expected on description-only updates).
      nextBuckets[ownerColumnId] = ownerBucket.filter(t => t.id !== evt.id);
      const destBucket = (nextBuckets[evt.columnId] ?? []).filter(
        t => t.id !== evt.id
      );
      nextBuckets[evt.columnId] = [...destBucket, reconciled].sort(
        (a, b) => a.taskOrder - b.taskOrder
      );
    }
    this.setState({ tasksByColumnId: nextBuckets });
  }

  // ------------------- HTTP-driven mutations (issue #47) -------------------

  /**
   * Public entry point for HTTP-driven column creates (issue #77). The
   * caller passes the full `ColumnResponseDto` returned by
   * `ColumnsApiService.createColumn`; the method projects it down to a
   * {@link BoardColumn} (dropping `createdAt` / `updatedAt` — same
   * projection as `BoardPageComponent.projectColumnDtos`) and delegates to
   * the shared {@link appendBoardColumnIfNew} helper so this path and the
   * SignalR echo path agree on dedupe semantics.
   *
   * Behaviour:
   *  - No-op when `projectId !== currentProjectId` (user navigated away).
   *  - No-op when a column with the same id is already in state (idempotent;
   *    makes the HTTP-success + SignalR-echo sequence safe on the client's
   *    own create).
   *  - Otherwise appends and re-sorts by `columnOrder` ascending.
   */
  applyCreatedColumn(projectId: string, dto: ColumnResponseDto): void {
    if (!dto) {
      return;
    }
    this.appendBoardColumnIfNew(projectId, {
      id: dto.id,
      name: dto.name,
      colorCode: dto.colorCode,
      columnOrder: dto.columnOrder,
      projectId: dto.projectId
    });
  }

  /**
   * Public entry point for HTTP-driven task creates (issue #78). The
   * caller passes the full `TaskResponseDto` returned by
   * `TasksApiService.createTask`; the method projects it to a
   * {@link BoardTask} (dropping `createdAt`/`updatedAt`) and delegates to
   * the shared {@link appendBoardTaskIfNew} helper so this path and the
   * SignalR `onTaskCreated` echo path agree on dedupe semantics.
   *
   * Behaviour:
   *  - No-op when `projectId !== currentProjectId` (user navigated away).
   *  - No-op when the target column is not in state (e.g. ColumnDeleted
   *    arrived between HTTP submit and HTTP 201).
   *  - No-op when a task with the same id already exists in that column's
   *    bucket (idempotent; makes the HTTP-success + SignalR-echo sequence
   *    safe on the client's own create).
   *  - Otherwise appends and re-sorts by `taskOrder` ascending.
   */
  applyCreatedTask(projectId: string, dto: TaskResponseDto): void {
    if (!dto) {
      return;
    }
    this.appendBoardTaskIfNew(projectId, {
      id: dto.id,
      title: dto.title,
      content: dto.content,
      taskOrder: dto.taskOrder,
      columnId: dto.columnId,
      assignedId: dto.assignedId
    });
  }

  /**
   * Replace the column list for the current board. Called by
   * `BoardPageComponent` after the initial `GET /api/column/project/{projectId}`.
   *
   * Idempotent w.r.t. concurrency: if the active project has already changed
   * (e.g. user navigated away during the in-flight request), the call is a
   * no-op — we key on `projectId` matching `currentProjectId` at mutation
   * time to avoid planting columns from a stale board onto the new one.
   *
   * Does NOT touch `tasksByColumnId` for any column id still in the incoming
   * list; buckets whose column is no longer present are dropped (defensive:
   * avoids orphaned rendering).
   */
  setColumns(projectId: string, columns: BoardColumn[]): void {
    if (this.getState().currentProjectId !== projectId) {
      return;
    }
    const sortedColumns = [...columns].sort((a, b) => a.columnOrder - b.columnOrder);
    const allowedIds = new Set(sortedColumns.map(c => c.id));
    const currentBuckets = this.getState().tasksByColumnId;
    const nextBuckets: Record<string, BoardTask[]> = {};
    for (const [key, bucket] of Object.entries(currentBuckets)) {
      if (allowedIds.has(key)) {
        nextBuckets[key] = bucket;
      }
    }
    this.setState({ columns: sortedColumns, tasksByColumnId: nextBuckets });
  }

  /**
   * Replace the task buckets for the current board. Called by
   * `BoardPageComponent` after the initial `GET /api/task/project/{projectId}`.
   *
   * Idempotent w.r.t. concurrency: if the active project has already changed
   * (stale hydration — user navigated A → B while A's request was in flight),
   * the call is a silent no-op. Mirrors the project-id guard on `setColumns`.
   *
   * Orphan filter: any task whose `columnId` is not in the current
   * `columns()` set is dropped. Mirrors the allowed-ids filter on
   * `setColumns`; defends against `ColumnDeleted` arriving between the
   * column fetch and the task fetch.
   *
   * Atomic replace: `tasksByColumnId` is replaced, NOT merged. This is
   * intentional — `setTasks` is authoritative for initial state, and any
   * pre-existing bucket content (e.g. a `TaskCreated` SignalR event that
   * raced the hydration) is overwritten. The SignalR path will either
   * re-deliver the missed event or the hydration payload already contained
   * it (the backend ticket guarantees both `TaskCreated` echo and the GET
   * response agree on persisted state).
   *
   * Projection to `BoardTask`: drops `createdAt`/`updatedAt` per the same
   * reasoning as `applyCreatedTask` — the board UI does not need timestamps
   * and keeping them leaks irrelevant backend fields into local state.
   */
  setTasks(projectId: string, tasks: TaskResponseDto[]): void {
    if (this.getState().currentProjectId !== projectId) {
      return;
    }
    const allowedColumnIds = new Set(
      this.getState().columns.map(c => c.id)
    );
    const nextBuckets: Record<string, BoardTask[]> = {};
    for (const dto of tasks) {
      if (!allowedColumnIds.has(dto.columnId)) {
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
      const bucket = nextBuckets[dto.columnId];
      if (bucket) {
        bucket.push(projected);
      } else {
        nextBuckets[dto.columnId] = [projected];
      }
    }
    for (const key of Object.keys(nextBuckets)) {
      nextBuckets[key].sort((a, b) => a.taskOrder - b.taskOrder);
    }
    this.setState({ tasksByColumnId: nextBuckets });
  }

  /**
   * Apply a drag-and-drop move to local state BEFORE the HTTP PUT returns.
   * The card appears in the new column at the new order on the next template
   * tick; `taskOrder` is renumbered sequentially within both affected buckets
   * so rendered ordering is self-consistent.
   *
   * Returns a rollback token (snapshots of both pre-move buckets) the caller
   * keeps until the HTTP call resolves — or `null` if the move is rejected
   * by a pre-condition (project changed, task not in source bucket, or a
   * no-op drag to the same position).
   */
  applyOptimisticTaskMove(
    taskId: string,
    fromColumnId: string,
    fromOrder: number,
    toColumnId: string,
    toOrder: number
  ): OptimisticMoveToken | null {
    const projectId = this.getState().currentProjectId;
    if (projectId === null) {
      return null;
    }
    if (fromColumnId === toColumnId && fromOrder === toOrder) {
      return null;
    }
    const buckets = this.getState().tasksByColumnId;
    const fromBucket = buckets[fromColumnId] ?? [];
    const movedTask = fromBucket.find(t => t.id === taskId);
    if (!movedTask) {
      return null;
    }
    const toBucket = fromColumnId === toColumnId ? fromBucket : buckets[toColumnId] ?? [];

    // Snapshots captured BEFORE mutation — opaque to the UI and handed to
    // the caller for later rollback.
    const fromSnapshot = [...fromBucket];
    const toSnapshot = [...toBucket];

    const token: OptimisticMoveToken = {
      projectId,
      fromColumnId,
      toColumnId,
      fromBucket: fromSnapshot,
      toBucket: toSnapshot
    };

    if (fromColumnId === toColumnId) {
      // Within-column reorder: splice out, splice in, then renumber.
      const reordered = [...fromBucket];
      const actualFromIndex = reordered.findIndex(t => t.id === taskId);
      reordered.splice(actualFromIndex, 1);
      const clampedToOrder = Math.max(0, Math.min(toOrder, reordered.length));
      reordered.splice(clampedToOrder, 0, { ...movedTask });
      const renumbered = reordered.map((t, index) => ({
        ...t,
        taskOrder: index,
        columnId: toColumnId
      }));
      this.setState({
        tasksByColumnId: {
          ...buckets,
          [fromColumnId]: renumbered
        }
      });
    } else {
      // Cross-column move: remove from source, insert into destination.
      const newFromBucket = fromBucket
        .filter(t => t.id !== taskId)
        .map((t, index) => ({ ...t, taskOrder: index }));
      const newToBucket = [...toBucket];
      const clampedToOrder = Math.max(0, Math.min(toOrder, newToBucket.length));
      newToBucket.splice(clampedToOrder, 0, {
        ...movedTask,
        columnId: toColumnId
      });
      const renumberedTo = newToBucket.map((t, index) => ({
        ...t,
        taskOrder: index,
        columnId: toColumnId
      }));
      this.setState({
        tasksByColumnId: {
          ...buckets,
          [fromColumnId]: newFromBucket,
          [toColumnId]: renumberedTo
        }
      });
    }

    return token;
  }

  /**
   * Undo an optimistic move when the server rejects it. Restores the
   * exact bucket contents captured in the token. Silently no-ops if
   * `currentProjectId` has changed since the token was issued (the user
   * navigated away — nothing to restore).
   */
  rollbackOptimisticTaskMove(token: OptimisticMoveToken): void {
    if (this.getState().currentProjectId !== token.projectId) {
      return;
    }
    const buckets = this.getState().tasksByColumnId;
    if (token.fromColumnId === token.toColumnId) {
      this.setState({
        tasksByColumnId: {
          ...buckets,
          [token.fromColumnId]: token.fromBucket
        }
      });
      return;
    }
    this.setState({
      tasksByColumnId: {
        ...buckets,
        [token.fromColumnId]: token.fromBucket,
        [token.toColumnId]: token.toBucket
      }
    });
  }

  /**
   * Fold the server-authoritative `TaskResponseDto` back into state after a
   * successful move. If the server normalised `taskOrder`, the target bucket
   * re-sorts accordingly; otherwise the method is a cheap idempotent no-op.
   *
   * Safe to call with a DTO whose column is no longer known to local state
   * (a `ColumnDeleted` event could have arrived between drop and response) —
   * the call is then a no-op.
   */
  reconcileServerTaskMove(response: TaskResponseDto): void {
    if (this.getState().currentProjectId === null) {
      return;
    }
    const columnKnown = this.getState().columns.some(c => c.id === response.columnId);
    if (!columnKnown) {
      return;
    }
    const buckets = this.getState().tasksByColumnId;

    // Find where the task currently lives (may be anywhere — if the user
    // performed a cross-column move it's already in `response.columnId`).
    const ownerEntry = Object.entries(buckets).find(([, bucket]) =>
      bucket.some(t => t.id === response.id)
    );

    const reconciledTask: BoardTask = {
      id: response.id,
      title: response.title,
      content: response.content,
      taskOrder: response.taskOrder,
      columnId: response.columnId,
      assignedId: response.assignedId
    };

    const nextBuckets: Record<string, BoardTask[]> = { ...buckets };

    if (ownerEntry && ownerEntry[0] !== response.columnId) {
      // Task is sitting in a different bucket than the server says it
      // should — move it to the server-truth column.
      const [ownerColumnId, ownerBucket] = ownerEntry;
      nextBuckets[ownerColumnId] = ownerBucket
        .filter(t => t.id !== response.id)
        .map((t, index) => ({ ...t, taskOrder: index }));
    }

    const destBucket = nextBuckets[response.columnId] ?? [];
    const deduped = destBucket.filter(t => t.id !== response.id);
    const merged = [...deduped, reconciledTask].sort((a, b) => a.taskOrder - b.taskOrder);
    nextBuckets[response.columnId] = merged;

    this.setState({ tasksByColumnId: nextBuckets });
  }

  private teardownSubscriptions(): void {
    for (const sub of this.subscriptionBag) {
      sub.unsubscribe();
    }
    this.subscriptionBag = [];
  }
}
