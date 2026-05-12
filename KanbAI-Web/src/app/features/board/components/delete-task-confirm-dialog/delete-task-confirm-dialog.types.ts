/**
 * Data passed into `DeleteTaskConfirmDialogComponent` via CDK `DIALOG_DATA`
 * (issue #96 sub-feature C).
 */
export interface DeleteTaskConfirmData {
  taskTitle: string;
}

/** `true` = primary confirmed; `undefined` = cancelled / Escape / backdrop. */
export type DeleteTaskConfirmResult = true | undefined;
