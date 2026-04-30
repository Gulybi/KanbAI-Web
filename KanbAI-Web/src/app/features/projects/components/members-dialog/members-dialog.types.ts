import { MemberSummary } from '../../models/member.model';
import { ProjectSummary } from '../../models/project.model';

/**
 * Data passed into the dialog via CDK DIALOG_DATA. The dialog reads
 * `project.role` to derive the initial `isOwner` flag and `project.name`
 * for the title.
 */
export interface MembersDialogData {
  project: ProjectSummary;
}

/** Close result — currently always void; exposed for future extension. */
export type MembersDialogResult = void;

/** List-branch view model for the roster area. */
export type MembersListViewModel =
  | { status: 'loading' }
  | { status: 'success'; members: MemberSummary[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/** Add-form view model. */
export type AddMemberViewModel =
  | { status: 'idle'; errorMessage: string | null; resetCounter: number }
  | { status: 'submitting'; errorMessage: null; resetCounter: number };
