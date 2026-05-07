import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { describe, it, expect } from 'vitest';

import {
  duplicateColumnNamesValidator,
  minColumnsValidator
} from './column-array.validators';
import { whitespaceOnlyValidator } from './whitespace.validator';
import {
  ColumnDraftFormShape,
  buildColumnDraftGroup
} from '../components/create-project-dialog/column-draft.model';

function makeArray(names: string[]): FormArray<FormGroup<ColumnDraftFormShape>> {
  return new FormArray<FormGroup<ColumnDraftFormShape>>(
    names.map(n => buildColumnDraftGroup(n))
  );
}

describe('minColumnsValidator', () => {
  it('flags an empty FormArray with { required: 1, actual: 0 }', () => {
    const array = new FormArray<FormGroup<ColumnDraftFormShape>>([]);
    expect(minColumnsValidator(array)).toEqual({
      minColumns: { required: 1, actual: 0 }
    });
  });

  it('passes a single-row FormArray', () => {
    const array = makeArray(['To Do']);
    expect(minColumnsValidator(array)).toBeNull();
  });

  it('passes a multi-row FormArray', () => {
    const array = makeArray(['To Do', 'In Progress', 'Done']);
    expect(minColumnsValidator(array)).toBeNull();
  });
});

describe('duplicateColumnNamesValidator', () => {
  it('returns null for an empty FormArray', () => {
    const array = new FormArray<FormGroup<ColumnDraftFormShape>>([]);
    expect(duplicateColumnNamesValidator(array)).toBeNull();
  });

  it('returns null for a single-row FormArray', () => {
    const array = makeArray(['To Do']);
    expect(duplicateColumnNamesValidator(array)).toBeNull();
  });

  it('returns null when all names are distinct', () => {
    const array = makeArray(['A', 'B', 'C']);
    expect(duplicateColumnNamesValidator(array)).toBeNull();
  });

  it('flags the later of two exact-match duplicates', () => {
    const array = makeArray(['A', 'A']);
    expect(duplicateColumnNamesValidator(array)).toEqual({
      duplicateNames: { duplicates: [1] }
    });
  });

  it('treats case-insensitive duplicates as duplicates', () => {
    const array = makeArray(['A', 'a']);
    expect(duplicateColumnNamesValidator(array)).toEqual({
      duplicateNames: { duplicates: [1] }
    });
  });

  it('trims before comparing', () => {
    const array = makeArray([' A ', 'a']);
    expect(duplicateColumnNamesValidator(array)).toEqual({
      duplicateNames: { duplicates: [1] }
    });
  });

  it('ignores rows whose name is whitespace-only or empty', () => {
    const array = new FormArray<FormGroup<ColumnDraftFormShape>>([
      new FormGroup<ColumnDraftFormShape>({
        name: new FormControl<string>('', {
          nonNullable: true,
          validators: [Validators.required, whitespaceOnlyValidator]
        })
      }),
      new FormGroup<ColumnDraftFormShape>({
        name: new FormControl<string>('   ', {
          nonNullable: true,
          validators: [Validators.required, whitespaceOnlyValidator]
        })
      })
    ]);
    expect(duplicateColumnNamesValidator(array)).toBeNull();
  });

  it('flags only the later index when a third row matches the first', () => {
    const array = makeArray(['A', 'B', 'A']);
    expect(duplicateColumnNamesValidator(array)).toEqual({
      duplicateNames: { duplicates: [2] }
    });
  });

  it('flags every later duplicate when several rows collide', () => {
    const array = makeArray(['A', 'B', 'A', 'a']);
    expect(duplicateColumnNamesValidator(array)).toEqual({
      duplicateNames: { duplicates: [2, 3] }
    });
  });
});
