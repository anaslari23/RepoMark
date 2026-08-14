import { generateEd25519KeyPair, Ed25519Signer } from '@repomark/core';
export class MockKmsSigner {
    keyId;
    algorithm = 'ed25519';
    publicKey;
    privateSigner;
    constructor(keyId) {
        if (!process.env.REPOMARK_ALLOW_MOCK_SIGNER) {
            throw new Error('MockKmsSigner is for non-production/CI demonstration purposes only. ' +
                'Set the REPOMARK_ALLOW_MOCK_SIGNER environment variable to explicitly allow its use.');
        }
        console.warn('\\n[WARNING] Using MockKmsSigner. This signer produces cryptographic attestations using an ephemeral key in memory. IT IS NOT SUITABLE FOR PRODUCTION.\\n');
        this.keyId = keyId;
        const kp = generateEd25519KeyPair();
        this.privateSigner = new Ed25519Signer(kp.privateKey, keyId);
        this.publicKey = this.privateSigner.publicKey;
    }
    sign(payload) {
        return this.privateSigner.sign(payload);
    }
}
//# sourceMappingURL=mock-signer.js.map