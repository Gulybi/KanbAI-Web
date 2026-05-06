import { AttachmentIconCategory } from '../models/attachment-download.model';

/**
 * Exact MIME → category table. Case-insensitive lookup.
 */
export const MIME_TO_ICON_CATEGORY: Readonly<
  Record<string, AttachmentIconCategory>
> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/plain': 'text'
};

/**
 * Extension (lowercase, dotted) → category table.
 */
export const EXTENSION_TO_ICON_CATEGORY: Readonly<
  Record<string, AttachmentIconCategory>
> = {
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.pdf': 'pdf',
  '.docx': 'word',
  '.xlsx': 'excel',
  '.txt': 'text'
};

/**
 * Lookup order:
 *   1. Exact MIME hit in MIME_TO_ICON_CATEGORY (case-insensitive).
 *   2. `image/*` prefix → 'image'.
 *   3. Filename extension hit in EXTENSION_TO_ICON_CATEGORY (case-insensitive).
 *   4. Fallback → 'generic'.
 */
export function resolveAttachmentIconCategory(input: {
  mimeType: string;
  fileName: string;
}): AttachmentIconCategory {
  const mime = (input.mimeType ?? '').toLowerCase();
  const exact = MIME_TO_ICON_CATEGORY[mime];
  if (exact) {
    return exact;
  }
  if (mime.startsWith('image/')) {
    return 'image';
  }
  const name = (input.fileName ?? '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot >= 0 && dot < name.length - 1) {
    const ext = name.slice(dot);
    const byExt = EXTENSION_TO_ICON_CATEGORY[ext];
    if (byExt) {
      return byExt;
    }
  }
  return 'generic';
}
