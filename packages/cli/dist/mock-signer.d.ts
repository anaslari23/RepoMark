import { Signer, SignatureAlgorithm } from '@repomark/core';
export declare class MockKmsSigner implements Signer {
    keyId: string;
    algorithm: SignatureAlgorithm;
    publicKey: string;
    private privateSigner;
    constructor(keyId: string);
    sign(payload: Buffer | Uint8Array): string | Promise<string>;
}
//# sourceMappingURL=mock-signer.d.ts.map