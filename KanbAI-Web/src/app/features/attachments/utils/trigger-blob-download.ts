/**
 * Triggers a browser file-save for the given blob with the given filename.
 *
 * Implementation notes:
 *  1. URL.createObjectURL(blob) — build a same-origin object URL.
 *  2. Create a detached <a> with `href`, `download`, and `rel="noopener"`.
 *     Append to document.body (Firefox requires an in-DOM anchor to click).
 *  3. .click() to invoke the browser's native save dialog.
 *  4. Remove the anchor from the DOM.
 *  5. Revoke the object URL on the next microtask so Safari/WebKit has a
 *     chance to begin the download before the URL becomes invalid.
 *
 * Synchronous: the caller invokes this from an HttpResponse next callback.
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    queueMicrotask(() => URL.revokeObjectURL(url));
  }
}
