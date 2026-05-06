import { describe, it, expect } from 'vitest';

import { formatFileSize } from './format-file-size';

describe('formatFileSize', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('returns "0 B" for negative inputs', () => {
    expect(formatFileSize(-1)).toBe('0 B');
    expect(formatFileSize(-1024)).toBe('0 B');
  });

  it('returns "0 B" for non-finite inputs', () => {
    expect(formatFileSize(Number.NaN)).toBe('0 B');
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe('0 B');
  });

  it('renders small byte counts without a decimal', () => {
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('crosses into KB at 1024 and keeps one decimal', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('crosses into MB at 1,048,576 bytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats the backend cap (10 MB) as "10.0 MB"', () => {
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MB');
  });

  it('formats 25 MB as "25.0 MB"', () => {
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25.0 MB');
  });

  it('scales into GB for large values', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});
