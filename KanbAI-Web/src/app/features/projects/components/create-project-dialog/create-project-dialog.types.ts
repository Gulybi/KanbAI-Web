import { FormControl } from '@angular/forms';

import { ProjectSummary } from '../../models/project.model';

/**
 * Strongly-typed view of the create-project reactive form. Both controls
 * are non-nullable strings because the FormControls are constructed with
 * `nonNullable: true`.
 */
export interface CreateProjectFormShape {
  name: FormControl<string>;
  description: FormControl<string>;
}

/**
 * Result payload emitted by the dialog on successful creation. Passed via
 * `DialogRef.close(result)`. The dashboard does not read it — the project
 * state cache already holds the new project — but it is exposed for future
 * callers (e.g., a "create and open board" flow).
 */
export interface CreateProjectDialogResult {
  created: ProjectSummary;
}
