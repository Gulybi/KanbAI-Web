/**
 * Data passed into `DeleteColumnConfirmDialogComponent` via CDK `DIALOG_DATA`
 * (issue #96 sub-feature B). The body copy branches on `taskCount > 0`.
 */
export interface DeleteColumnConfirmData {
  columnName: string;
  taskCount: number;
}

/** `true` = primary confirmed; `undefined` = cancelled / Escape / backdrop. */
export type DeleteColumnConfirmResult = true | undefined;
