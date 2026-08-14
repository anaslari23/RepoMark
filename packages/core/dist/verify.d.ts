import { type Signer } from './signing.js';
import type { ClaimKind, DSSEEnvelope, FileDigestEntry, InTotoStatement, RepomarkPolicy, TrustSnapshot, VerificationResult } from './types.js';
export interface VerifyArtifactOptions {
    files?: FileDigestEntry[];
    directoryPath?: string;
}
/**
 * Scans a directory to collect raw byte digests for all non-excluded files.
 */
export declare function scanDirectory(dirPath: string, exclusions?: string[]): FileDigestEntry[];
/**
 * Sealed Directory generation: Creates statement, signs envelope, and indexes files.
 */
export declare function sealDirectory(directory: string, claimParams: {
    claimKind?: ClaimKind;
    issuerId: string;
    issuerName?: string;
    organization?: string;
    vcsRevision?: string;
    vcsRepository?: string;
}, policy: RepomarkPolicy, signer: Signer): {
    statement: InTotoStatement;
    envelope: DSSEEnvelope;
    files: FileDigestEntry[];
    merkleRoot: string;
};
/**
 * Executes the full ordered verification pipeline on a DSSE Envelope.
 */
export declare function verifyEnvelope(envelopeInput: DSSEEnvelope | string, artifact: VerifyArtifactOptions, trustSnapshot?: TrustSnapshot, policy?: Partial<RepomarkPolicy>): VerificationResult;
/**
 * Verifies a single file containing an EmbeddedCapsule.
 */
export declare function verifyPortableFile(fileBytes: Uint8Array | Buffer, trustSnapshot?: TrustSnapshot, _policy?: Partial<RepomarkPolicy>): VerificationResult;
//# sourceMappingURL=verify.d.ts.map