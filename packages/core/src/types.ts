/**
 * Core type definitions for RepoMark (v1)
 */

export type ClaimKind = 'verified-origin' | 'original-author' | 'organization-origin';

export type VerificationState =
  | 'verified-exact'
  | 'verified-modified'
  | 'untrusted'
  | 'invalid'
  | 'revoked'
  | 'inconclusive';

export type KeyTrustStatus =
  | 'TRUSTED'
  | 'UNTRUSTED'
  | 'REVOKED_PRE_ISSUANCE'
  | 'REVOKED_POST_ISSUANCE'
  | 'AUTHORIZATION_WITHDRAWN'
  | 'UNKNOWN'
  | 'REVOKED'; // keeping REVOKED for backward compatibility or general failures

export type SignatureAlgorithm = 'ed25519' | 'ecdsa-p256-sha256' | 'rsa-pss-sha256';
export type HashAlgorithm = 'sha256' | 'sha512';
export type MerkleAlgorithm = 'repomark-merkle-v1';
export type CanonicalizationAlgorithm = 'repomark-c14n-v1';

export interface DigestMap {
  sha256?: string;
  sha512?: string;
  'repomark-merkle-v1'?: string;
  [algo: string]: string | undefined;
}

export interface StatementSubject {
  name: string;
  digest: DigestMap;
}

export interface IssuerIdentity {
  id: string;
  keyId: string;
  signatureAlgorithm: SignatureAlgorithm;
  name?: string;
  organization?: string;
  publicKey?: string;
}

export interface ManifestSummary {
  treeAlgorithm: MerkleAlgorithm;
  canonicalization: CanonicalizationAlgorithm;
  hashAlgorithm: HashAlgorithm;
  filesCount: number;
  totalBytes: number;
  rootDigest: {
    algorithm: MerkleAlgorithm | HashAlgorithm;
    value: string;
  };
}

export interface VcsProvenance {
  type: 'git';
  repository?: string;
  revision: string;
  tag?: string;
  branch?: string;
}

export interface ToolProvenance {
  name: 'repomark';
  version: string;
}

export interface SourceProvenance {
  vcs?: VcsProvenance;
  tool: ToolProvenance;
}

export interface WatermarkMetadata {
  enabled: boolean;
  scheme: 'repomark-ast-v1' | 'repomark-token-v1' | 'none';
  recipientMask?: string;
  appliedAt?: string;
}

export interface SourceOriginPredicate {
  claimKind: ClaimKind;
  issuer: IssuerIdentity;
  timestamp: string;
  cleanExport: true;
  manifest: ManifestSummary;
  provenance?: SourceProvenance;
  watermark?: WatermarkMetadata;
  policy?: {
    license?: string;
    permittedUses?: string[];
  };
}

export interface InTotoStatement {
  _type: 'https://in-toto.io/Statement/v1';
  subject: StatementSubject[];
  predicateType: 'https://repomark.dev/source-origin/v1';
  predicate: SourceOriginPredicate;
}

export interface DSSESignature {
  keyid: string;
  sig: string;
}

export interface DSSEEnvelope {
  payloadType: string;
  payload: string; // Base64 encoded canonicalized statement
  signatures: DSSESignature[];
}

export interface SourceOriginClaim {
  claimKind: ClaimKind;
  isDefaultKind: boolean;
  issuerId: string;
  issuerName?: string;
  organization?: string;
  timestamp: string;
  cleanExport: boolean;
  manifest: ManifestSummary;
  provenance?: SourceProvenance;
}

export interface SubjectMatch {
  path: string;
  expectedDigest: string;
  actualDigest: string | null;
  status: 'matched' | 'modified' | 'missing' | 'unexpected';
}

export interface SignerDecision {
  keyId: string;
  trusted: boolean;
  status: KeyTrustStatus;
  signatureValid: boolean;
  signatureAlgorithm: SignatureAlgorithm;
  identity?: string;
  publicKey?: string;
  revocationReason?: string;
}

export interface PolicyDecision {
  rule: string;
  passed: boolean;
  reason?: string;
}

export interface VerificationResult {
  state: VerificationState;
  claim: SourceOriginClaim | null;
  subjectMatches: SubjectMatch[];
  signer: SignerDecision;
  policy: PolicyDecision[];
  evidenceDigest: string;
  summary?: string;
}

export interface TrustedKeyRecord {
  keyId: string;
  publicKey: string; // Base64 or PEM
  algorithm: SignatureAlgorithm;
  owner: string;
  organization?: string;
  validFrom?: string;
  validUntil?: string;
  status?: 'active' | 'revoked';
  revocationState?: 'compromised-pre-issuance' | 'compromised-post-issuance' | 'authorization-withdrawn';
  revokedAt?: string;
  revocationReason?: string;
}

export interface TrustSnapshot {
  snapshotVersion: 'v1';
  updatedAt: string;
  trustedKeys: Record<string, TrustedKeyRecord>;
  revokedKeys?: Record<string, { 
    revokedAt: string; 
    reason: string;
    revocationState?: 'compromised-pre-issuance' | 'compromised-post-issuance' | 'authorization-withdrawn';
  }>;
}

export interface RepomarkPolicy {
  version: 'v1';
  claimKind?: ClaimKind;
  algorithms: {
    hash: HashAlgorithm;
    tree: MerkleAlgorithm;
    canonicalization: CanonicalizationAlgorithm;
    signature: SignatureAlgorithm;
  };
  exclusions: string[];
  cleanExportOnly: boolean;
}

export interface FileDigestEntry {
  path: string;
  rawDigest: string; // SHA-256 hex over raw bytes
  size: number;
  isExecutable?: boolean;
  isSymlink?: boolean;
}

export interface MerkleProofStep {
  position: 'left' | 'right';
  digest: string;
}

export interface MerkleInclusionProof {
  algorithm: MerkleAlgorithm;
  rootDigest: string;
  leafIndex: number;
  totalLeaves: number;
  path: string;
  leafDigest: string;
  proof: MerkleProofStep[];
}

export interface PortableFileCapsule {
  _type: 'https://repomark.dev/portable-file/v1';
  capsuleVersion: 'v1';
  file: {
    path: string;
    rawDigest: {
      algorithm: HashAlgorithm;
      value: string;
    };
    size: number;
    textNormalizedDigest?: {
      algorithm: string;
      value: string;
    };
  };
  membershipProof: {
    algorithm: MerkleAlgorithm;
    rootDigest: {
      algorithm: MerkleAlgorithm | HashAlgorithm;
      value: string;
    };
    leafIndex: number;
    totalLeaves: number;
    proof: MerkleProofStep[];
  };
  claimKind: ClaimKind;
  issuer: {
    id: string;
    keyId: string;
    signatureAlgorithm: SignatureAlgorithm;
    signature: string;
    publicKey?: string;
  };
  statementRef?: {
    statementDigest: {
      algorithm: HashAlgorithm;
      value: string;
    };
    statementUri?: string;
  };
  watermarkContext?: {
    scheme: 'repomark-ast-v1' | 'repomark-token-v1' | 'none';
    recipientMask?: string;
    confidence?: number;
  };
  sealedAt: string;
}

export interface EmbeddedCapsulePayload {
  issuerId: string;
  keyId: string;
  claimKind: ClaimKind;
  repositoryRoot: string;
  originalPath: string;
  markerlessSha256: string;
  copyId: string | null;
  issuedAt: string;
}

export interface EmbeddedCapsule {
  payload: EmbeddedCapsulePayload;
  signature: string; // Base64URL
  rawToken: string; // The raw base64url.base64url token for easy stripping
  byteOffset: number; // Start byte of the block
  byteLength: number; // Total byte length of the block
}
