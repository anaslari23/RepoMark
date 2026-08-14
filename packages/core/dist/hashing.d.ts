import type { HashAlgorithm } from './types.js';
/**
 * Computes a cryptographic hash over raw bytes.
 * SECURITY INVARIANT: Never normalize line endings or whitespace for security digests.
 */
export declare function hashBytes(bytes: Uint8Array | Buffer | string, algorithm?: HashAlgorithm): string;
/**
 * Derives a deterministic 128-bit opaque copy ID using HMAC-SHA256.
 * The output is truncated to 16 bytes (32 hex characters) to satisfy the 128-bit requirement.
 */
export declare function deriveCopyId(issuanceKey: string | Buffer, recipientInternalId: string, epochOrNonce?: string): string;
/**
 * Normalizes a relative file path according to repomark-c14n-v1 rules:
 * - Forward slashes only (replaces backslashes)
 * - Strip leading `./` and leading `/`
 * - Strip trailing `/`
 * - Reject `..` segments (prevents path traversal / escape)
 * - Case preserved
 * - UTF-8 validated, control characters (0x00-0x1F, 0x7F) rejected
 */
export declare function normalizePath(rawPath: string): string;
/**
 * Validates an array of paths for uniqueness and canonical form.
 * Fails closed on duplicates.
 */
export declare function validateCanonicalPaths(paths: string[]): string[];
/**
 * Computes an optional diagnostic-only text-normalized digest (sha256-crlf-norm-v1).
 * NOTE: This is NEVER a substitute for raw byte security digests.
 */
export declare function computeDiagnosticTextDigest(text: string): string;
//# sourceMappingURL=hashing.d.ts.map