import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_ALLOWED_EXTENSIONS,
  ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY,
  ATTACHMENT_MAX_SIZE_DISPLAY
} from '../constants/attachment-rules';
import type {
  DropzoneValidationError,
  ValidationResult
} from '../models/dropzone.model';
import { formatFileSize } from './format-file-size';

/**
 * Returns the lowercase extension including the leading dot, or '' if
 * the name has no '.' (or starts with '.', meaning it has no stem).
 */
export function getExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return '';
  }
  return name.slice(lastDot).toLowerCase();
}

/**
 * Returns true if the filename looks like the OS-provided sanitized
 * name: non-empty, no path separators, no null bytes, and has a non-empty
 * stem before the extension. Mirrors the server's SanitizeFileName
 * rejection criteria.
 */
export function isValidFileName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  if (name.includes('/') || name.includes('\\')) {
    return false;
  }
  if (name.includes('\0')) {
    return false;
  }
  // A leading dot with no stem (e.g. ".pdf") is treated as invalid — it's
  // effectively an extension with no filename.
  if (name.startsWith('.')) {
    return false;
  }
  return true;
}

function error(
  code: DropzoneValidationError['code'],
  message: string,
  informational = false
): ValidationResult {
  return { ok: false, error: { code, message, informational } };
}

/**
 * Validates a single File against the attachment rules.
 *
 * Checks run in this order (first failure wins):
 *   1. Name validity → NAME_INVALID
 *   2. Format (extension, case-insensitive) → FORMAT_NOT_ALLOWED
 *   3. Size zero → SIZE_ZERO
 *   4. Size > max → SIZE_EXCEEDED
 */
export function validateAttachment(file: File): ValidationResult {
  if (!isValidFileName(file.name)) {
    return error(
      'NAME_INVALID',
      "File name is invalid — special characters or path separators aren't allowed."
    );
  }

  const ext = getExtension(file.name);
  if (ext === '' || !ATTACHMENT_ALLOWED_EXTENSIONS.includes(ext)) {
    return error(
      'FORMAT_NOT_ALLOWED',
      `File type not supported. Allowed: ${ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY}.`
    );
  }

  if (file.size === 0) {
    return error(
      'SIZE_ZERO',
      'File is empty — pick a non-empty file and try again.'
    );
  }

  if (file.size > ATTACHMENT_MAX_BYTES) {
    return error(
      'SIZE_EXCEEDED',
      `File is too large — max ${ATTACHMENT_MAX_SIZE_DISPLAY}, this file is ${formatFileSize(file.size)}.`
    );
  }

  return { ok: true };
}
