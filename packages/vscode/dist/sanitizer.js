"use strict";
/**
 * Hostile input sanitization and length bounding for VS Code extension.
 * Protects against prompt injection, UI distortion, and markdown/HTML injection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeString = sanitizeString;
exports.escapeMarkdown = escapeMarkdown;
exports.sanitizePath = sanitizePath;
exports.sanitizeDigest = sanitizeDigest;
const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_PATH_LENGTH = 512;
const MAX_DIGEST_LENGTH = 128;
/**
 * Strips control characters (0x00-0x1F, 0x7F) and bounds string length.
 */
function sanitizeString(input, maxLength = MAX_DISPLAY_NAME_LENGTH) {
    if (!input || typeof input !== 'string')
        return '';
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
function escapeMarkdown(input) {
    const sanitized = sanitizeString(input, MAX_DISPLAY_NAME_LENGTH);
    return sanitized.replace(/([\\`*_#[\]()<>~!+=-])/g, '\\$1');
}
/**
 * Sanitizes and bounds file path for display.
 */
function sanitizePath(inputPath) {
    return sanitizeString(inputPath, MAX_PATH_LENGTH);
}
/**
 * Validates and sanitizes a hex digest string.
 */
function sanitizeDigest(digest) {
    const cleaned = sanitizeString(digest, MAX_DIGEST_LENGTH);
    if (!/^[0-9a-fA-F]{64,128}$/.test(cleaned)) {
        return 'invalid-digest';
    }
    return cleaned;
}
//# sourceMappingURL=sanitizer.js.map