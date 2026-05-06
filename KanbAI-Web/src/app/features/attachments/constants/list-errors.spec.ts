import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { mapListFetchHttpErrorToUserMessage } from './list-errors';

/**
 * Covers every branch of the list-fetch failure table documented in the
 * tech spec §"Failure mapping — list fetch (AC-critical)".
 */
describe('mapListFetchHttpErrorToUserMessage', () => {
  it('non-HTTP error → NETWORK, retryable', () => {
    const result = mapListFetchHttpErrorToUserMessage(new Error('boom'));
    expect(result.code).toBe('NETWORK');
    expect(result.retryable).toBe(true);
  });

  it('status 0 → NETWORK, retryable', () => {
    const result = mapListFetchHttpErrorToUserMessage(
      new HttpErrorResponse({ status: 0 })
    );
    expect(result.code).toBe('NETWORK');
    expect(result.retryable).toBe(true);
  });

  it('403 → HTTP_403, NOT retryable', () => {
    const result = mapListFetchHttpErrorToUserMessage(
      new HttpErrorResponse({ status: 403 })
    );
    expect(result.code).toBe('HTTP_403');
    expect(result.retryable).toBe(false);
  });

  it('404 → HTTP_404, NOT retryable', () => {
    const result = mapListFetchHttpErrorToUserMessage(
      new HttpErrorResponse({ status: 404 })
    );
    expect(result.code).toBe('HTTP_404');
    expect(result.retryable).toBe(false);
  });

  it('500 → HTTP_5XX, retryable', () => {
    const result = mapListFetchHttpErrorToUserMessage(
      new HttpErrorResponse({ status: 500 })
    );
    expect(result.code).toBe('HTTP_5XX');
    expect(result.retryable).toBe(true);
  });

  it('503 → HTTP_5XX, retryable', () => {
    const result = mapListFetchHttpErrorToUserMessage(
      new HttpErrorResponse({ status: 503 })
    );
    expect(result.code).toBe('HTTP_5XX');
    expect(result.retryable).toBe(true);
  });

  it('418 (other) → HTTP_OTHER, retryable', () => {
    const result = mapListFetchHttpErrorToUserMessage(
      new HttpErrorResponse({ status: 418 })
    );
    expect(result.code).toBe('HTTP_OTHER');
    expect(result.retryable).toBe(true);
  });

  it('returns a non-empty user message on every branch', () => {
    const branches: Array<HttpErrorResponse | Error> = [
      new Error('x'),
      new HttpErrorResponse({ status: 0 }),
      new HttpErrorResponse({ status: 403 }),
      new HttpErrorResponse({ status: 404 }),
      new HttpErrorResponse({ status: 500 }),
      new HttpErrorResponse({ status: 418 })
    ];
    for (const err of branches) {
      const result = mapListFetchHttpErrorToUserMessage(err);
      expect(result.userMessage.length).toBeGreaterThan(0);
    }
  });
});
