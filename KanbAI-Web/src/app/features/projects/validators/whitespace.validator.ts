import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Rejects a control whose trimmed string value is empty.
 *
 * Returns `{ whitespaceOnly: true }` on failure, `null` on success.
 * Safe to compose after `Validators.required`: the two validators report
 * different error keys and may both fire for an empty-string value.
 */
export const whitespaceOnlyValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const raw = control.value;
  const asString = raw == null ? '' : String(raw);
  return asString.trim().length === 0 ? { whitespaceOnly: true } : null;
};
