import fs from 'node:fs';
import path from 'node:path';
import {
  hashBytes,
  normalizePath,
  parseStrictJSON,
  verifyEnvelope,
  verifyPortableFile,
  type RepomarkPolicy,
  type SubjectMatch,
  type TrustSnapshot,
  type VerificationResult
} from '@repomark/core';

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

export class VerifierService {
  private workspaceRoot: string;
  private cache = new Map<string, { contentDigest: string; status: FileVerificationStatus }>();
  private workspaceResult: VerificationResult | null = null;
  private lastVerificationTime = 0;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  public invalidateCache(): void {
    this.cache.clear();
    this.workspaceResult = null;
  }

  public getWorkspaceResult(): VerificationResult | null {
    return this.workspaceResult;
  }

  public verifyFile(filePath: string): FileVerificationStatus {
    const relPath = path.relative(this.workspaceRoot, filePath);
    let normalizedPath: string;
    try {
      normalizedPath = normalizePath(relPath);
    } catch {
      return { state: 'untracked' };
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return { state: 'untracked' };
    }

    const rawBytes = fs.readFileSync(filePath);
    const currentDigest = hashBytes(rawBytes, 'sha256');

    // Check in-memory cache keyed by contentDigest
    const cached = this.cache.get(normalizedPath);
    if (cached && cached.contentDigest === currentDigest && this.workspaceResult) {
      return cached.status;
    }

    // Run full workspace verification if not loaded or cache invalid
    this.runWorkspaceVerification();

    if (!this.workspaceResult || !this.workspaceResult.claim) {
      const fallbackTrustPath = path.join(this.workspaceRoot, '.repomark', 'trust.json');
      let trustSnapshot: TrustSnapshot | undefined;
      if (fs.existsSync(fallbackTrustPath)) {
        trustSnapshot = parseStrictJSON<TrustSnapshot>(fs.readFileSync(fallbackTrustPath, 'utf8'));
      }
      const standaloneRes = verifyPortableFile(rawBytes, trustSnapshot);
      if (standaloneRes.state !== 'inconclusive') {
        const claim = standaloneRes.claim;
        const signer = standaloneRes.signer;
        const match = standaloneRes.subjectMatches[0];
        const status: FileVerificationStatus = {
          state: standaloneRes.state as FileVerificationStatus['state'],
          claimKind: claim?.claimKind,
          issuerName: claim?.issuerName || claim?.issuerId,
          issuerId: claim?.issuerId,
          keyId: signer.keyId,
          expectedDigest: match?.expectedDigest,
          actualDigest: match?.actualDigest || undefined,
          merkleRoot: claim?.manifest.rootDigest.value,
          rawDigestMatch: match?.status === 'matched',
          signerTrusted: signer.trusted,
          cleanExport: claim?.cleanExport,
          vcsRevision: claim?.provenance?.vcs?.revision,
          timestamp: claim?.timestamp
        };
        this.cache.set(normalizedPath, { contentDigest: currentDigest, status });
        return status;
      }

      const status: FileVerificationStatus = { state: this.workspaceResult?.state || 'inconclusive' };
      this.cache.set(normalizedPath, { contentDigest: currentDigest, status });
      return status;
    }

    const claim = this.workspaceResult.claim;
    const signer = this.workspaceResult.signer;
    const match = this.workspaceResult.subjectMatches.find((m: SubjectMatch) => m.path === normalizedPath);
    
    console.error(`[verifier] normalizedPath: ${normalizedPath}`);
    console.error(`[verifier] subjectMatches: ${JSON.stringify(this.workspaceResult.subjectMatches.map((m: SubjectMatch) => m.path))}`);

    if (!match) {
      const status: FileVerificationStatus = {
        state: 'untracked',
        issuerName: claim.issuerName,
        keyId: signer.keyId
      };
      this.cache.set(normalizedPath, { contentDigest: currentDigest, status });
      return status;
    }

    const isMatch = match.status === 'matched';
    let state: FileVerificationStatus['state'];

    if (this.workspaceResult.state === 'revoked') {
      state = 'revoked';
    } else if (this.workspaceResult.state === 'untrusted') {
      state = 'untrusted';
    } else if (this.workspaceResult.state === 'invalid') {
      state = 'invalid';
    } else if (isMatch) {
      state = 'verified-exact';
    } else {
      state = 'verified-modified';
    }

    const status: FileVerificationStatus = {
      state,
      claimKind: claim.claimKind,
      issuerName: claim.issuerName || claim.issuerId,
      issuerId: claim.issuerId,
      keyId: signer.keyId,
      expectedDigest: match.expectedDigest,
      actualDigest: currentDigest,
      merkleRoot: claim.manifest.rootDigest.value,
      rawDigestMatch: isMatch,
      signerTrusted: signer.trusted,
      cleanExport: claim.cleanExport,
      vcsRevision: claim.provenance?.vcs?.revision,
      timestamp: claim.timestamp
    };

    this.cache.set(normalizedPath, { contentDigest: currentDigest, status });
    return status;
  }

  public runWorkspaceVerification(): VerificationResult | null {
    const repomarkDir = path.join(this.workspaceRoot, '.repomark');
    const envPath = path.join(repomarkDir, 'envelope.json');

    if (!fs.existsSync(envPath)) {
      this.workspaceResult = null;
      return null;
    }

    try {
      const envelopeJson = fs.readFileSync(envPath, 'utf8');

      // Load trust snapshot
      const trustPath = path.join(repomarkDir, 'trust.json');
      let trustSnapshot: TrustSnapshot | undefined;
      if (fs.existsSync(trustPath)) {
        trustSnapshot = parseStrictJSON<TrustSnapshot>(fs.readFileSync(trustPath, 'utf8'));
      }

      // Load policy
      const policyPath = path.join(repomarkDir, 'policy.json');
      let policy: RepomarkPolicy | undefined;
      if (fs.existsSync(policyPath)) {
        policy = parseStrictJSON<RepomarkPolicy>(fs.readFileSync(policyPath, 'utf8'));
      }
      
      console.error(`[runWorkspaceVerification] workspaceRoot: ${this.workspaceRoot}`);
      console.error(`[runWorkspaceVerification] fs.readdirSync: ${JSON.stringify(fs.readdirSync(this.workspaceRoot))}`);

      this.workspaceResult = verifyEnvelope(
        envelopeJson,
        { directoryPath: this.workspaceRoot },
        trustSnapshot,
        policy
      );

      this.lastVerificationTime = Date.now();
      return this.workspaceResult;
    } catch (err) {
      console.error(`[runWorkspaceVerification] Error: ${err}`);
      this.workspaceResult = null;
      return null;
    }
  }
}
