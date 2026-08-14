import { type VerificationResult } from '@repomark/core';
export interface FileVerificationStatus {
    state: 'verified-exact' | 'verified-modified' | 'untrusted' | 'invalid' | 'revoked' | 'inconclusive' | 'untracked';
    claimKind?: string;
    issuerName?: string;
    issuerId?: string;
    keyId?: string;
    expectedDigest?: string;
    actualDigest?: string;
    merkleRoot?: string;
    rawDigestMatch?: boolean;
    signerTrusted?: boolean;
    cleanExport?: boolean;
    vcsRevision?: string;
    timestamp?: string;
}
export declare class VerifierService {
    private workspaceRoot;
    private cache;
    private workspaceResult;
    private lastVerificationTime;
    constructor(workspaceRoot: string);
    invalidateCache(): void;
    getWorkspaceResult(): VerificationResult | null;
    verifyFile(filePath: string): FileVerificationStatus;
    runWorkspaceVerification(): VerificationResult | null;
}
//# sourceMappingURL=verifier-service.d.ts.map