import { FormControl } from '@angular/forms';
import { signal } from '@angular/core';
import { describe, it, expect } from 'vitest';

import { duplicateExistingColumnNameValidator } from './duplicate-existing-column-name.validator';

describe('duplicateExistingColumnNameValidator', () => {
  it('returns null when the existing-names list is empty', () => {
    const existing = signal<readonly string[]>([]);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl('To Do');
    expect(validator(control)).toBeNull();
  });

  it('returns { duplicateExisting: true } on an exact match', () => {
    const existing = signal<readonly string[]>(['Done']);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl('Done');
    expect(validator(control)).toEqual({ duplicateExisting: true });
  });

  it('flags case-insensitive + trimmed duplicates (e.g. names ["DONE"], value "  done  ")', () => {
    const existing = signal<readonly string[]>(['DONE']);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl('  done  ');
    expect(validator(control)).toEqual({ duplicateExisting: true });
  });

  it('normalises whitespace on BOTH sides — entries with surrounding whitespace also count', () => {
    const existing = signal<readonly string[]>(['  Blocked  ']);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl('blocked');
    expect(validator(control)).toEqual({ duplicateExisting: true });
  });

  it('returns null for a whitespace-only control value (defers to whitespaceOnlyValidator)', () => {
    const existing = signal<readonly string[]>(['Done']);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl('   ');
    expect(validator(control)).toBeNull();
  });

  it('returns null for an empty-string control value', () => {
    const existing = signal<readonly string[]>(['Done']);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl('');
    expect(validator(control)).toBeNull();
  });

  it('returns null for a null control value', () => {
    const existing = signal<readonly string[]>(['Done']);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl(null);
    expect(validator(control)).toBeNull();
  });

  it('returns null when there is no collision', () => {
    const existing = signal<readonly string[]>(['To Do', 'In Progress', 'Done']);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl('Blocked');
    expect(validator(control)).toBeNull();
  });

  it('picks up signal changes on the next invocation', () => {
    const existing = signal<readonly string[]>(['To Do']);
    const validator = duplicateExistingColumnNameValidator(existing);
    const control = new FormControl('Blocked');

    // Baseline — no collision.
    expect(validator(control)).toBeNull();

    // Mutate the list under the validator; next run must flag it.
    existing.set(['To Do', 'Blocked']);
    expect(validator(control)).toEqual({ duplicateExisting: true });

    // And back — mutation in the other direction clears the error.
    existing.set(['To Do']);
    expect(validator(control)).toBeNull();
  });
});
