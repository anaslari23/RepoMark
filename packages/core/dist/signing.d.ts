import type { SignatureAlgorithm } from './types.js';
export interface Signer {
    readonly keyId: string;
    readonly algorithm: SignatureAlgorithm;
    readonly publicKey: string;
    sign(payload: Uint8Array | Buffer): Promise<string> | string;
}
export interface Verifier {
    verify(payload: Uint8Array | Buffer, signature: string, publicKey: string, algorithm: SignatureAlgorithm): boolean;
}
export interface KeyPairResult {
    keyId: string;
    publicKey: string;
    privateKey: string;
    publicKeyPem: string;
    algorithm: SignatureAlgorithm;
}
/**
 * Generates an Ed25519 keypair and deterministic keyId fingerprint.
 */
export declare function generateEd25519KeyPair(): KeyPairResult;
/**
 * In-memory Ed25519 Signer implementation.
 */
export declare class Ed25519Signer implements Signer {
    readonly keyId: string;
    readonly algorithm: SignatureAlgorithm;
    readonly publicKey: string;
    private readonly privateKeyObject;
    constructor(privateKeyPemOrDer: string | Buffer, explicitKeyId?: string);
    sign(payload: Uint8Array | Buffer): string;
}
/**
 * Standard Ed25519 / crypto Verifier implementation.
 */
export declare class NodeCryptoVerifier implements Verifier {
    verify(payload: Uint8Array | Buffer, signatureHexOrBase64: string, publicKeyPemOrBase64: string, algorithm: SignatureAlgorithm): boolean;
}
export declare const defaultVerifier: NodeCryptoVerifier;
//# sourceMappingURL=signing.d.ts.map