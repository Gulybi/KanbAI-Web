/**
 * Formats a byte count as a human-readable string using binary units
 * (1024-based) to match the backend's 10 MB = 10,485,760 convention.
 *
 * Behaviour:
 * - Non-positive or non-finite inputs return "0 B".
 * - Values < 1 KB are rendered with no fractional part (e.g. "1023 B").
 * - Values >= 1 KB are rendered with one decimal place (e.g. "1.0 KB",
 *   "25.0 MB"). Trailing `.0` is retained so unit tests and the UI can
 *   rely on a stable format.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units: readonly string[] = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${Math.floor(value)} ${units[unitIndex]}`;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
