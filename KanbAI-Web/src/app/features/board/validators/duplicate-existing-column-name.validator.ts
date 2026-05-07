import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Signal } from '@angular/core';

/**
 * Rejects a control whose trimmed-lowercase value matches any entry in
 * `existingNames()` after identical normalisation. Case-insensitive-trim
 * duplicate detection matches issue #70's `duplicateColumnNamesValidator`
 * normalisation semantics so the two surfaces agree on what counts as a
 * duplicate.
 *
 * Returns `{ duplicateExisting: true }` on failure, `null` on success.
 * Whitespace-only / empty values are skipped (they are already covered by
 * `whitespaceOnlyValidator`; surfacing two errors for the same condition
 * would be noisy).
 *
 * The signal is read on every invocation so CDK-level changes to the
 * column list (HTTP echo, SignalR echo) cause the validator to re-flag
 * correctly once the owning component calls `control.updateValueAndValidity()`
 * in response.
 */
export function duplicateExistingColumnNameValidator(
  existingNames: Signal<readonly string[]>
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    const asString = raw == null ? '' : String(raw);
    const normalised = asString.trim().toLowerCase();
    if (normalised.length === 0) {
      return null;
    }
    const collides = existingNames().some(
      n => n.trim().toLowerCase() === normalised
    );
    return collides ? { duplicateExisting: true } : null;
  };
}
