import { MemberSummary } from '../../../models/member.model';

/**
 * Data passed into `RemoveMemberConfirmDialogComponent` via CDK
 * `DIALOG_DATA`. The project name is included so the consequence
 * sentence can name the project the member will lose access to.
 */
export interface RemoveMemberConfirmData {
  member: MemberSummary;
  projectName: string;
}

/**
 * Close result:
 *  - `true`  → user confirmed.
 *  - `undefined` → user cancelled / Esc / backdrop dismiss.
 */
export type RemoveMemberConfirmResult = true | undefined;
