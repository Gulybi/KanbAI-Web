import { describe, it, expect } from 'vitest';

import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_ALLOWED_EXTENSIONS,
  ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY
} from '../constants/attachment-rules';
import { formatFileSize } from './format-file-size';
import {
  getExtension,
  isValidFileName,
  validateAttachment
} from './validate-attachment';

function makeFile(name: string, size: number, type = 'application/octet-stream'): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('getExtension', () => {
  it('returns the lowercase extension including the leading dot', () => {
    expect(getExtension('a.PDF')).toBe('.pdf');
    expect(getExtension('spec.pdf')).toBe('.pdf');
  });

  it('returns "" when the name has no dot', () => {
    expect(getExtension('noext')).toBe('');
  });

  it('returns "" for names that start with a dot and have no further dots', () => {
    expect(getExtension('.pdf')).toBe('');
  });

  it('returns "" for names ending in a dot', () => {
    expect(getExtension('file.')).toBe('');
  });

  it('returns the last extension for multi-dot names', () => {
    expect(getExtension('archive.tar.gz')).toBe('.gz');
  });
});

describe('isValidFileName', () => {
  it('accepts a plain filename', () => {
    expect(isValidFileName('spec.pdf')).toBe(true);
  });

  it('rejects empty names', () => {
    expect(isValidFileName('')).toBe(false);
  });

  it('rejects names with forward slashes', () => {
    expect(isValidFileName('../etc/passwd.txt')).toBe(false);
  });

  it('rejects names with backslashes', () => {
    expect(isValidFileName('foo\\bar.txt')).toBe(false);
  });

  it('rejects names containing null bytes', () => {
    expect(isValidFileName('foo\0bar.txt')).toBe(false);
  });

  it('rejects leading-dot names with no stem', () => {
    expect(isValidFileName('.pdf')).toBe(false);
  });
});

describe('validateAttachment', () => {
  describe('happy paths', () => {
    it('accepts a canonical PDF', () => {
      expect(validateAttachment(makeFile('spec.pdf', 1024))).toEqual({ ok: true });
    });

    it('accepts uppercase extensions (case-insensitive)', () => {
      expect(validateAttachment(makeFile('IMAGE.PNG', 1024))).toEqual({ ok: true });
    });

    it('accepts every whitelisted extension', () => {
      for (const ext of ATTACHMENT_ALLOWED_EXTENSIONS) {
        const result = validateAttachment(makeFile(`sample${ext}`, 1024));
        expect(result).toEqual({ ok: true });
      }
    });

    it('accepts a 1-byte file', () => {
      expect(validateAttachment(makeFile('tiny.txt', 1))).toEqual({ ok: true });
    });

    it('accepts an exact-max file (inclusive boundary)', () => {
      expect(validateAttachment(makeFile('big.pdf', ATTACHMENT_MAX_BYTES))).toEqual({ ok: true });
    });
  });

  describe('format rejections', () => {
    it('rejects .exe', () => {
      const result = validateAttachment(makeFile('malware.exe', 1024));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FORMAT_NOT_ALLOWED');
      }
    });

    it('rejects files with no extension', () => {
      const result = validateAttachment(makeFile('noext', 1024));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FORMAT_NOT_ALLOWED');
      }
    });

    it('format error message lists every allowed extension', () => {
      const result = validateAttachment(makeFile('malware.exe', 1024));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain(ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY);
      }
    });
  });

  describe('size rejections', () => {
    it('rejects empty files', () => {
      const result = validateAttachment(makeFile('spec.pdf', 0));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SIZE_ZERO');
      }
    });

    it('rejects files larger than the max', () => {
      const result = validateAttachment(makeFile('spec.pdf', ATTACHMENT_MAX_BYTES + 1));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SIZE_EXCEEDED');
      }
    });

    it('size-exceeded message mentions the formatted actual size', () => {
      const oversize = 12 * 1024 * 1024;
      const result = validateAttachment(makeFile('huge.pdf', oversize));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain(formatFileSize(oversize));
      }
    });
  });

  describe('name rejections', () => {
    it('rejects path-traversal names', () => {
      const result = validateAttachment(makeFile('../etc/passwd.txt', 1024));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NAME_INVALID');
      }
    });

    it('rejects backslash names', () => {
      const result = validateAttachment(makeFile('foo\\bar.txt', 1024));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NAME_INVALID');
      }
    });

    it('rejects null-byte names', () => {
      const result = validateAttachment(makeFile('foo\0bar.txt', 1024));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NAME_INVALID');
      }
    });
  });

  describe('check order', () => {
    it('NAME_INVALID wins over FORMAT_NOT_ALLOWED', () => {
      const result = validateAttachment(makeFile('../malware.exe', 1024));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NAME_INVALID');
      }
    });

    it('FORMAT_NOT_ALLOWED wins over SIZE_ZERO', () => {
      const result = validateAttachment(makeFile('malware.exe', 0));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FORMAT_NOT_ALLOWED');
      }
    });

    it('SIZE_ZERO wins over SIZE_EXCEEDED (size_zero is checked first)', () => {
      const result = validateAttachment(makeFile('spec.pdf', 0));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SIZE_ZERO');
      }
    });
  });
});
