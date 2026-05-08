/**
 * Data passed into `TaskDescriptionClearConfirmDialogComponent` via CDK
 * `DIALOG_DATA` (issue #91). Intentionally empty — the heading copy is
 * frozen in `task-description-copy.ts` and needs no per-open context.
 * An empty interface (rather than `void`) keeps the CDK generic happy.
 */
export type TaskDescriptionClearConfirmData = Record<string, never>;

/**
 * Close result:
 *  - `true`      → user confirmed; parent fires DELETE.
 *  - `undefined` → user cancelled / Escape / backdrop click.
 */
export type TaskDescriptionClearConfirmResult = true | undefined;
