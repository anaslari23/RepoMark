/**
 * Hostile input sanitization and length bounding for VS Code extension.
 * Protects against prompt injection, UI distortion, and markdown/HTML injection.
 */
/**
 * Strips control characters (0x00-0x1F, 0x7F) and bounds string length.
 */
export declare function sanitizeString(input: string | null | undefined, maxLength?: number): string;
/**
 * Escapes characters that have special meaning in Markdown.
 */
export declare function escapeMarkdown(input: string): string;
/**
 * Sanitizes and bounds file path for display.
 */
export declare function sanitizePath(inputPath: string): string;
/**
 * Validates and sanitizes a hex digest string.
 */
export declare function sanitizeDigest(digest: string): string;
//# sourceMappingURL=sanitizer.d.ts.map