import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { mapDownloadHttpErrorToUserMessage } from './download-errors';

/**
 * Complete coverage of the download failure table documented in the tech
 * spec §"Failure mapping — download (AC-critical …)". Each branch is
 * asserted independently at the constant-level so a regression in the
 * mapper surfaces here before it cascades into the row component.
 */
describe('mapDownloadHttpErrorToUserMessage', () => {
  function blobOf(payload: unknown): Blob {
    return new Blob([JSON.stringify(payload)], { type: 'application/json' });
  }

  describe('non-HTTP error fallbacks', () => {
    it('classifies a thrown Error as NETWORK (retryable)', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new Error('boom'),
        'f.pdf'
      );
      expect(result.code).toBe('NETWORK');
      expect(result.retryable).toBe(true);
    });

    it('classifies an arbitrary non-error thrown value as NETWORK', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        'weird-string',
        'f.pdf'
      );
      expect(result.code).toBe('NETWORK');
    });
  });

  describe('status 0 (network)', () => {
    it('maps to NETWORK, retryable', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({ status: 0 }),
        'f.pdf'
      );
      expect(result.code).toBe('NETWORK');
      expect(result.retryable).toBe(true);
    });
  });

  describe('400 branch', () => {
    it('maps "File is still being processed." blob body → HTTP_400_PROCESSING, retryable', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 400,
          error: blobOf({ message: 'File is still being processed.' })
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_400_PROCESSING');
      expect(result.retryable).toBe(true);
    });

    it('maps any other 400 message → HTTP_400_OTHER, retryable', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 400,
          error: blobOf({ message: 'Validation failed.' })
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_400_OTHER');
      expect(result.retryable).toBe(true);
    });

    it('maps 400 with no parseable body → HTTP_400_OTHER', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({ status: 400 }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_400_OTHER');
    });
  });

  describe('403 branch', () => {
    it('maps to HTTP_403, non-retryable regardless of body', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({ status: 403 }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_403');
      expect(result.retryable).toBe(false);
    });
  });

  describe('404 branch (three outcomes disambiguated by server message)', () => {
    it('maps "File not found." → HTTP_404_MISSING, non-retryable', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 404,
          error: blobOf({ message: 'File not found.' })
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_404_MISSING');
      expect(result.retryable).toBe(false);
    });

    it('maps "File upload failed." → HTTP_404_FAILED, non-retryable', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 404,
          error: blobOf({ message: 'File upload failed.' })
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_404_FAILED');
      expect(result.retryable).toBe(false);
    });

    it('maps unparseable 404 body → HTTP_404_OTHER, non-retryable', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 404,
          error: new Blob(['not-json'], { type: 'application/json' })
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_404_OTHER');
      expect(result.retryable).toBe(false);
    });

    it('maps unknown 404 message → HTTP_404_OTHER', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 404,
          error: blobOf({ message: 'Some other 404 flavour.' })
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_404_OTHER');
    });
  });

  describe('5xx branch', () => {
    it('maps 500 → HTTP_5XX, retryable', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({ status: 500 }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_5XX');
      expect(result.retryable).toBe(true);
    });

    it('maps 503 → HTTP_5XX', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({ status: 503 }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_5XX');
    });
  });

  describe('HTTP_OTHER branch', () => {
    it('maps 418 (teapot) → HTTP_OTHER, retryable', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({ status: 418 }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_OTHER');
      expect(result.retryable).toBe(true);
    });
  });

  describe('server-message extraction quirks', () => {
    it('reads .message from a parsed JSON object body (no Blob)', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 404,
          error: { message: 'File not found.' }
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_404_MISSING');
    });

    it('falls back to .errors[0] when .message is missing', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 404,
          error: blobOf({ errors: ['File not found.'] })
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_404_MISSING');
    });

    it('reads message from a string error body', async () => {
      const result = await mapDownloadHttpErrorToUserMessage(
        new HttpErrorResponse({
          status: 404,
          error: JSON.stringify({ message: 'File upload failed.' })
        }),
        'f.pdf'
      );
      expect(result.code).toBe('HTTP_404_FAILED');
    });
  });

  describe('user-facing copy', () => {
    it('returns a non-empty user message on every branch', async () => {
      const branches: Array<HttpErrorResponse | Error> = [
        new Error('x'),
        new HttpErrorResponse({ status: 0 }),
        new HttpErrorResponse({
          status: 400,
          error: blobOf({ message: 'File is still being processed.' })
        }),
        new HttpErrorResponse({ status: 400 }),
        new HttpErrorResponse({ status: 403 }),
        new HttpErrorResponse({
          status: 404,
          error: blobOf({ message: 'File not found.' })
        }),
        new HttpErrorResponse({
          status: 404,
          error: blobOf({ message: 'File upload failed.' })
        }),
        new HttpErrorResponse({ status: 404 }),
        new HttpErrorResponse({ status: 500 }),
        new HttpErrorResponse({ status: 418 })
      ];
      for (const err of branches) {
        const result = await mapDownloadHttpErrorToUserMessage(err, 'f.pdf');
        expect(result.userMessage.length).toBeGreaterThan(0);
      }
    });
  });
});
