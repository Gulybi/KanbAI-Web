/**
 * Local projection of a board column. Populated by the `ColumnCreated` /
 * `ColumnDeleted` real-time events; HTTP-side population is introduced in
 * #47. Field set mirrors the backend `ColumnResponseDto`, minus
 * `createdAt` / `updatedAt` (not needed by the board UI at this stage —
 * add if/when a column detail view requires them).
 */
export interface BoardColumn {
  id: string;
  name: string;
  colorCode: string | null;
  columnOrder: number;
  projectId: string;
}

/**
 * Local projection of a task. Populated by `TaskCreated` / `TaskMoved`
 * real-time events. Mirrors the backend `TaskResponseDto` minus the
 * timestamps, for the same reason as {@link BoardColumn}.
 */
export interface BoardTask {
  id: string;
  title: string;
  content: string | null;
  taskOrder: number;
  columnId: string;
  assignedId: string | null;
}

/**
 * Internal state of {@link BoardStateService}. Never exported from the
 * service except via read-only selectors.
 */
export interface BoardState {
  /**
   * Project id the user is currently viewing. Set by `enterBoard(id)`
   * on `BoardPageComponent.ngOnInit`, cleared by `leaveBoard()` on destroy.
   * Events arriving while `null` are dropped silently.
   */
  currentProjectId: string | null;

  /**
   * Columns belonging to `currentProjectId`, kept ordered by `columnOrder`.
   * Empty until an event or (future ticket #47) HTTP load populates it.
   */
  columns: BoardColumn[];

  /**
   * Tasks indexed by `columnId`, each bucket ordered by `taskOrder`.
   * Empty until an event or (future ticket #47) HTTP load populates it.
   */
  tasksByColumnId: Record<string, BoardTask[]>;
}

export const INITIAL_BOARD_STATE: BoardState = {
  currentProjectId: null,
  columns: [],
  tasksByColumnId: {}
};
