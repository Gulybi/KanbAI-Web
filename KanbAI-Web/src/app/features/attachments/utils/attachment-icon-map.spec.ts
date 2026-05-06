import { describe, it, expect } from 'vitest';

import { resolveAttachmentIconCategory } from '../constants/attachment-icon-map';

describe('resolveAttachmentIconCategory', () => {
  it('maps common MIME types to their expected category', () => {
    expect(
      resolveAttachmentIconCategory({ mimeType: 'image/png', fileName: 'a.png' })
    ).toBe('image');
    expect(
      resolveAttachmentIconCategory({
        mimeType: 'application/pdf',
        fileName: 'a.pdf'
      })
    ).toBe('pdf');
    expect(
      resolveAttachmentIconCategory({
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileName: 'a.docx'
      })
    ).toBe('word');
    expect(
      resolveAttachmentIconCategory({
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: 'a.xlsx'
      })
    ).toBe('excel');
    expect(
      resolveAttachmentIconCategory({
        mimeType: 'text/plain',
        fileName: 'a.txt'
      })
    ).toBe('text');
  });

  it('falls back to image for any image/* MIME prefix (e.g. image/webp)', () => {
    expect(
      resolveAttachmentIconCategory({
        mimeType: 'image/webp',
        fileName: 'photo.webp'
      })
    ).toBe('image');
  });

  it('falls back to the filename extension when the MIME type is opaque', () => {
    expect(
      resolveAttachmentIconCategory({
        mimeType: 'application/octet-stream',
        fileName: 'foo.pdf'
      })
    ).toBe('pdf');
  });

  it('returns generic when neither MIME nor extension match', () => {
    expect(
      resolveAttachmentIconCategory({
        mimeType: 'application/octet-stream',
        fileName: 'foo.bin'
      })
    ).toBe('generic');
  });

  it('is case-insensitive on the MIME type', () => {
    expect(
      resolveAttachmentIconCategory({
        mimeType: 'IMAGE/PNG',
        fileName: 'foo.PNG'
      })
    ).toBe('image');
  });

  it('is case-insensitive on the extension', () => {
    expect(
      resolveAttachmentIconCategory({
        mimeType: 'application/octet-stream',
        fileName: 'foo.PDF'
      })
    ).toBe('pdf');
  });

  it('handles filenames with no extension', () => {
    expect(
      resolveAttachmentIconCategory({
        mimeType: 'application/octet-stream',
        fileName: 'no-extension'
      })
    ).toBe('generic');
  });
});
