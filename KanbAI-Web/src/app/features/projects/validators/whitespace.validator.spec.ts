import { FormControl } from '@angular/forms';
import { describe, it, expect } from 'vitest';

import { whitespaceOnlyValidator } from './whitespace.validator';

describe('whitespaceOnlyValidator', () => {
  it('returns the whitespaceOnly error for an empty string', () => {
    const control = new FormControl('');
    expect(whitespaceOnlyValidator(control)).toEqual({ whitespaceOnly: true });
  });

  it('returns the whitespaceOnly error for spaces only', () => {
    const control = new FormControl('   ');
    expect(whitespaceOnlyValidator(control)).toEqual({ whitespaceOnly: true });
  });

  it('returns the whitespaceOnly error for mixed whitespace (tabs, newlines)', () => {
    const control = new FormControl('\t\n ');
    expect(whitespaceOnlyValidator(control)).toEqual({ whitespaceOnly: true });
  });

  it('returns null for non-whitespace content', () => {
    const control = new FormControl('hello');
    expect(whitespaceOnlyValidator(control)).toBeNull();
  });

  it('returns null for internal content with surrounding whitespace', () => {
    const control = new FormControl(' hello ');
    expect(whitespaceOnlyValidator(control)).toBeNull();
  });

  it('treats null value as whitespace-only', () => {
    const control = new FormControl(null);
    expect(whitespaceOnlyValidator(control)).toEqual({ whitespaceOnly: true });
  });
});
