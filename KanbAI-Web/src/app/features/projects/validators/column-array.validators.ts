import {
  AbstractControl,
  FormArray,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';

/**
 * Rejects an empty `FormArray<FormGroup<ColumnDraftFormShape>>`. Emits
 * `{ minColumns: { required: 1, actual: 0 } }` on the array itself.
 *
 * Context AC: empty column list blocks submit (context lines 112, 122).
 */
export const minColumnsValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const array = control as FormArray;
  const actual = array?.controls?.length ?? 0;
  if (actual < 1) {
    return { minColumns: { required: 1, actual } };
  }
  return null;
};

/**
 * Flags case-insensitive trimmed duplicate column names. Emits
 * `{ duplicateNames: { duplicates: number[] } }` on the array, where
 * `duplicates` is the list of indices whose trimmed-lowercase name
 * matches the trimmed-lowercase name of some earlier index. The
 * first occurrence is NOT flagged; only the later ones are — so the
 * row the user most recently edited is the one that surfaces the error.
 *
 * Whitespace-only / empty names are skipped (they already fail per-row
 * validators — no need to double-error them).
 *
 * Context edge case: `"Done"` and `"done"` are duplicates (context line 163).
 */
export const duplicateColumnNamesValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const array = control as FormArray;
  const controls = array?.controls ?? [];
  if (controls.length < 2) {
    return null;
  }

  const seen = new Map<string, number>();
  const duplicates: number[] = [];

  for (let i = 0; i < controls.length; i++) {
    const row = controls[i] as AbstractControl & {
      controls?: { name?: AbstractControl };
    };
    const nameControl = row?.controls?.name;
    const rawValue = nameControl?.value;
    const asString = rawValue == null ? '' : String(rawValue);
    const normalised = asString.trim().toLowerCase();
    // Skip empty / whitespace-only — already invalid per row.
    if (normalised.length === 0) {
      continue;
    }
    if (seen.has(normalised)) {
      duplicates.push(i);
    } else {
      seen.set(normalised, i);
    }
  }

  if (duplicates.length === 0) {
    return null;
  }
  return { duplicateNames: { duplicates } };
};
