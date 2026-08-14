import crypto from 'node:crypto';
/**
 * Computes a cryptographic hash over raw bytes.
 * SECURITY INVARIANT: Never normalize line endings or whitespace for security digests.
 */
export function hashBytes(bytes, algorithm = 'sha256') {
    if (algorithm !== 'sha256' && algorithm !== 'sha512') {
        throw new Error(`Unsupported hash algorithm: ${algorithm}. Must be 'sha256' or 'sha512'.`);
    }
    const hash = crypto.createHash(algorithm);
    if (typeof bytes === 'string') {
        hash.update(Buffer.from(bytes, 'utf8'));
    }
    else {
        hash.update(bytes);
    }
    return hash.digest('hex');
}
/**
 * Derives a deterministic 128-bit opaque copy ID using HMAC-SHA256.
 * The output is truncated to 16 bytes (32 hex characters) to satisfy the 128-bit requirement.
 */
export function deriveCopyId(issuanceKey, recipientInternalId, epochOrNonce) {
    const hmac = crypto.createHmac('sha256', issuanceKey);
    hmac.update(recipientInternalId);
    if (epochOrNonce) {
        hmac.update(`:${epochOrNonce}`);
    }
    // Hex digest is 64 chars (256 bits). Truncate to 32 chars (128 bits).
    return hmac.digest('hex').substring(0, 32);
}
/**
 * Normalizes a relative file path according to repomark-c14n-v1 rules:
 * - Forward slashes only (replaces backslashes)
 * - Strip leading `./` and leading `/`
 * - Strip trailing `/`
 * - Reject `..` segments (prevents path traversal / escape)
 * - Case preserved
 * - UTF-8 validated, control characters (0x00-0x1F, 0x7F) rejected
 */
export function normalizePath(rawPath) {
    if (typeof rawPath !== 'string') {
        throw new Error('Path must be a string');
    }
    // Reject null bytes and control characters
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1F\x7F]/.test(rawPath)) {
        throw new Error(`Path contains illegal control characters: ${JSON.stringify(rawPath)}`);
    }
    // Replace backslashes with forward slashes
    let p = rawPath.replace(/\\/g, '/');
    // Strip leading ./ and /
    while (p.startsWith('./') || p.startsWith('/')) {
        if (p.startsWith('./'))
            p = p.slice(2);
        else if (p.startsWith('/'))
            p = p.slice(1);
    }
    // Strip trailing /
    while (p.endsWith('/') && p.length > 1) {
        p = p.slice(0, -1);
    }
    if (p === '' || p === '.') {
        throw new Error('Normalized path cannot be empty or root "."');
    }
    // Check segments for '..' or empty intermediate segments (e.g. 'a//b')
    const segments = p.split('/');
    for (const seg of segments) {
        if (seg === '..') {
            throw new Error(`Path traversal segment '..' is prohibited in repomark canonical paths: ${rawPath}`);
        }
        if (seg === '' || seg === '.') {
            throw new Error(`Invalid empty or redundant segment in path: ${rawPath}`);
        }
    }
    return p;
}
/**
 * Validates an array of paths for uniqueness and canonical form.
 * Fails closed on duplicates.
 */
export function validateCanonicalPaths(paths) {
    const seen = new Set();
    const normalized = [];
    for (const raw of paths) {
        const c14n = normalizePath(raw);
        if (seen.has(c14n)) {
            throw new Error(`Duplicate file path detected in set: ${c14n}`);
        }
        seen.add(c14n);
        normalized.push(c14n);
    }
    return normalized;
}
/**
 * Computes an optional diagnostic-only text-normalized digest (sha256-crlf-norm-v1).
 * NOTE: This is NEVER a substitute for raw byte security digests.
 */
export function computeDiagnosticTextDigest(text) {
    // Normalize CRLF -> LF, strip trailing whitespace on each line, strip final trailing newlines
    const normalized = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .trimEnd();
    return hashBytes(normalized, 'sha256');
}
//# sourceMappingURL=hashing.js.map