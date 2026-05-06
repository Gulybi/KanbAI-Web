/**
 * Single source of truth for client-side attachment validation rules.
 * These values mirror .claude/backend_api_map.md §Attachments; any
 * change to the backend cap or whitelist requires editing THIS FILE
 * and only this file on the frontend.
 */

/** Hard maximum file size in bytes. Mirrors backend MaxFileSize = 10 MB. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Canonical whitelist (lowercase, leading dot) — mirrors backend. */
export const ATTACHMENT_ALLOWED_EXTENSIONS: readonly string[] = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.pdf',
  '.docx',
  '.xlsx',
  '.txt'
] as const;

/** Value for the hidden <input type="file"> accept attribute. */
export const ATTACHMENT_ACCEPT_ATTRIBUTE: string =
  ATTACHMENT_ALLOWED_EXTENSIONS.join(',');

/**
 * Human-readable formats list shown in the dropzone copy and error text
 * ("JPG, JPEG, PNG, GIF, PDF, DOCX, XLSX, TXT"). Derived from the
 * extension list so the two cannot drift.
 */
export const ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY: string =
  ATTACHMENT_ALLOWED_EXTENSIONS.map(ext => ext.slice(1).toUpperCase()).join(', ');

/** Human-readable max-size string for copy ("10 MB"). */
export const ATTACHMENT_MAX_SIZE_DISPLAY: string = '10 MB';

/**
 * Composed idle-state affordance copy. The design spec's visible copy may
 * tighten the wording; this constant is the canonical fallback and the
 * accessible name fragment.
 */
export const ATTACHMENT_IDLE_COPY: string =
  `Drop a file here or click to browse — up to ${ATTACHMENT_MAX_SIZE_DISPLAY}; ` +
  `${ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY}.`;
