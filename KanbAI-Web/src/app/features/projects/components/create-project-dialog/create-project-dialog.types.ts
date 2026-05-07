import { FormArray, FormControl, FormGroup } from '@angular/forms';

import { ProjectSummary } from '../../models/project.model';
import { ColumnResponseDto } from '../../../board/models/column.model';
import { ColumnDraftFormShape } from './column-draft.model';

/**
 * Strongly-typed view of the create-project reactive form. `name` and
 * `description` carry over from #32; `columns` was added by #70 as a
 * FormArray of per-row FormGroups.
 */
export interface CreateProjectFormShape {
  name: FormControl<string>;
  description: FormControl<string>;
  columns: FormArray<FormGroup<ColumnDraftFormShape>>;
}

/**
 * Discriminated-union result emitted on `DialogRef.close(result)`.
 *
 * - `success`: project was created, every column was created.
 * - `partial`: project was created, one or more columns failed. The
 *   dashboard surfaces this via a toast (see PartialFailureToastComponent).
 *
 * No `failure` variant: project-level failures keep the dialog open and
 * render the existing error banner; the dialog only closes on success
 * (full or partial).
 */
export type CreateProjectDialogResult =
  | { status: 'success'; project: ProjectSummary; columns: ColumnResponseDto[] }
  | {
      status: 'partial';
      project: ProjectSummary;
      createdColumns: ColumnResponseDto[];
      failedNames: string[];
      message: string;
    };
