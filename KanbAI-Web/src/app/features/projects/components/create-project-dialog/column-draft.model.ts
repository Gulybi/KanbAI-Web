import { FormControl, FormGroup, Validators } from '@angular/forms';

import { whitespaceOnlyValidator } from '../../validators/whitespace.validator';

/**
 * Per-row form shape. Only `name` is a form control — the row's ordering
 * is implicit in its index inside the parent FormArray.
 */
export interface ColumnDraftFormShape {
  name: FormControl<string>;
}

/** Snapshot value of one draft row after FormArray.value projection. */
export interface ColumnDraftValue {
  name: string;
}

/**
 * Factory used on init and on "Add column". Applies the per-row validators
 * documented in the tech spec:
 *  - `Validators.required`  — matches backend `CreateColumnDto.name` required.
 *  - `Validators.maxLength(100)` — matches backend max length.
 *  - `whitespaceOnlyValidator` — matches the existing whitespaceOnly branch
 *    supported by `FormInputComponent`.
 */
export function buildColumnDraftGroup(
  initialName: string
): FormGroup<ColumnDraftFormShape> {
  return new FormGroup<ColumnDraftFormShape>({
    name: new FormControl<string>(initialName, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(100),
        whitespaceOnlyValidator
      ]
    })
  });
}

/**
 * Single source of truth for the default column set (context line 93).
 * Localisation is explicitly out of scope; this is the correct centralisation
 * point if a future i18n pass wraps these through `$localize`.
 */
export const DEFAULT_COLUMN_NAMES = Object.freeze([
  'To Do',
  'In Progress',
  'Done'
] as const);
