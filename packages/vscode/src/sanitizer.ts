/**
 * Hostile input sanitization and length bounding for VS Code extension.
 * Protects against prompt injection, UI distortion, and markdown/HTML injection.
 */

const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_PATH_LENGTH = 512;
const MAX_DIGEST_LENGTH = 128;

/**
 * Strips control characters (0x00-0x1F, 0x7F) and bounds string length.
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = MAX_DISPLAY_NAME_LENGTH): string {
  if (!input || typeof input !== 'string') return '';

  // Remove control characters
  // eslint-disable-next-line no-control-regex
  const cleaned = input.replace(/[\x00-\x1F\x7F]/g, '');

  // Truncate to maximum length
  if (cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength) + '...';
  }
  return cleaned;
}

/**
 * Escapes characters that have special meaning in Markdown.
 */
export function escapeMarkdown(input: string): string {
  const sanitized = sanitizeString(input, MAX_DISPLAY_NAME_LENGTH);
  return sanitized.replace(/([\\`*_#[\]()<>~!+=-])/g, '\\$1');
}

/**
 * Sanitizes and bounds file path for display.
 */
export function sanitizePath(inputPath: string): string {
  return sanitizeString(inputPath, MAX_PATH_LENGTH);
}

/**
 * Validates and sanitizes a hex digest string.
 */
export function sanitizeDigest(digest: string): string {
  const cleaned = sanitizeString(digest, MAX_DIGEST_LENGTH);
  if (!/^[0-9a-fA-F]{64,128}$/.test(cleaned)) {
    return 'invalid-digest';
  }
  return cleaned;
}
