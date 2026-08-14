/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) and strict JSON parser with duplicate-key rejection.
 */
/**
 * Strict JSON parser that throws if duplicate keys are present in any JSON object.
 */
export declare function parseStrictJSON<T = unknown>(jsonString: string): T;
/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 * Deterministically serializes a JavaScript object/value.
 */
export declare function canonicalizeJSON(val: unknown): string;
//# sourceMappingURL=canonicalize.d.ts.map