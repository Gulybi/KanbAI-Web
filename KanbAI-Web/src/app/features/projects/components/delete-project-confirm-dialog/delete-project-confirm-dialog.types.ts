/**
 * Data passed into `DeleteProjectConfirmDialogComponent` via CDK
 * `DIALOG_DATA`. Only the project name is interpolated by the copy —
 * everything else is text-frozen in the template.
 */
export interface DeleteProjectConfirmData {
  projectName: string;
}

/** `true` = primary confirmed; `undefined` = cancelled / Escape / backdrop. */
export type DeleteProjectConfirmResult = true | undefined;
