import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { triggerBlobDownload } from './trigger-blob-download';

describe('triggerBlobDownload', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let createSpy: ReturnType<typeof vi.fn>;
  let revokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createSpy = vi.fn().mockReturnValue('blob:mock-url');
    revokeSpy = vi.fn();
    URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
  }

  it('creates an object URL, clicks a hidden anchor, and revokes the URL', async () => {
    const blob = new Blob(['content'], { type: 'application/pdf' });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove');

    triggerBlobDownload(blob, 'spec.pdf');

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);

    await flushMicrotasks();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('sets the download attribute to the exact filename (unicode + spaces preserved)', () => {
    const blob = new Blob(['x']);
    let captured: HTMLAnchorElement | null = null;
    const appendSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node: Node) => {
        captured = node as HTMLAnchorElement;
        return node;
      });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const removeSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'remove')
      .mockImplementation(() => undefined);

    const longName = 'Proj ÁÉÍÓÚ plan — quarterly review.docx';
    triggerBlobDownload(blob, longName);

    expect(captured).not.toBeNull();
    expect(captured!.getAttribute('download')).toBe(longName);
    expect(captured!.getAttribute('rel')).toBe('noopener');

    appendSpy.mockRestore();
    clickSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('revokes the same URL that createObjectURL returned', async () => {
    createSpy.mockReturnValue('blob:specific-id');
    const blob = new Blob(['y']);

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const removeSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'remove')
      .mockImplementation(() => undefined);

    triggerBlobDownload(blob, 'y.txt');
    await flushMicrotasks();
    expect(revokeSpy).toHaveBeenCalledWith('blob:specific-id');

    clickSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
