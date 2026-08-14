import { Buffer } from 'node:buffer';
import type { EmbeddedCapsule, EmbeddedCapsulePayload } from './types.js';
export declare function toBase64Url(buf: Buffer | string): string;
export declare function fromBase64Url(str: string): Buffer;
export declare function extractCapsule(fileBytes: Buffer): EmbeddedCapsule | null;
export declare function stripCapsule(fileBytes: Buffer): Buffer;
export declare function computeMarkerlessDigest(fileBytes: Buffer): string;
export declare function buildEmbeddedCapsule(payload: EmbeddedCapsulePayload, signFn: (buf: Buffer) => string): string;
export declare function buildAndEmbedCapsule(fileBytes: Buffer, payload: EmbeddedCapsulePayload, signFn: (buf: Buffer) => string): Buffer;
//# sourceMappingURL=capsule.d.ts.map