import fs from 'node:fs';
import path from 'node:path';
import { hashBytes, normalizePath, parseStrictJSON, verifyEnvelope, verifyPortableFile } from '@repomark/core';
export class VerifierService {
    workspaceRoot;
    cache = new Map();
    workspaceResult = null;
    lastVerificationTime = 0;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    invalidateCache() {
        this.cache.clear();
        this.workspaceResult = null;
    }
    getWorkspaceResult() {
        return this.workspaceResult;
    }
    verifyFile(filePath) {
        const relPath = path.relative(this.workspaceRoot, filePath);
        let normalizedPath;
        try {
            normalizedPath = normalizePath(relPath);
        }
        catch {
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
            let trustSnapshot;
            if (fs.existsSync(fallbackTrustPath)) {
                trustSnapshot = parseStrictJSON(fs.readFileSync(fallbackTrustPath, 'utf8'));
            }
            const standaloneRes = verifyPortableFile(rawBytes, trustSnapshot);
            if (standaloneRes.state !== 'inconclusive') {
                const claim = standaloneRes.claim;
                const signer = standaloneRes.signer;
                const match = standaloneRes.subjectMatches[0];
                const status = {
                    state: standaloneRes.state,
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
            const status = { state: this.workspaceResult?.state || 'inconclusive' };
            this.cache.set(normalizedPath, { contentDigest: currentDigest, status });
            return status;
        }
        const claim = this.workspaceResult.claim;
        const signer = this.workspaceResult.signer;
        const match = this.workspaceResult.subjectMatches.find((m) => m.path === normalizedPath);
        console.error(`[verifier] normalizedPath: ${normalizedPath}`);
        console.error(`[verifier] subjectMatches: ${JSON.stringify(this.workspaceResult.subjectMatches.map((m) => m.path))}`);
        if (!match) {
            const status = {
                state: 'untracked',
                issuerName: claim.issuerName,
                keyId: signer.keyId
            };
            this.cache.set(normalizedPath, { contentDigest: currentDigest, status });
            return status;
        }
        const isMatch = match.status === 'matched';
        let state;
        if (this.workspaceResult.state === 'revoked') {
            state = 'revoked';
        }
        else if (this.workspaceResult.state === 'untrusted') {
            state = 'untrusted';
        }
        else if (this.workspaceResult.state === 'invalid') {
            state = 'invalid';
        }
        else if (isMatch) {
            state = 'verified-exact';
        }
        else {
            state = 'verified-modified';
        }
        const status = {
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
    runWorkspaceVerification() {
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
            let trustSnapshot;
            if (fs.existsSync(trustPath)) {
                trustSnapshot = parseStrictJSON(fs.readFileSync(trustPath, 'utf8'));
            }
            // Load policy
            const policyPath = path.join(repomarkDir, 'policy.json');
            let policy;
            if (fs.existsSync(policyPath)) {
                policy = parseStrictJSON(fs.readFileSync(policyPath, 'utf8'));
            }
            console.error(`[runWorkspaceVerification] workspaceRoot: ${this.workspaceRoot}`);
            console.error(`[runWorkspaceVerification] fs.readdirSync: ${JSON.stringify(fs.readdirSync(this.workspaceRoot))}`);
            this.workspaceResult = verifyEnvelope(envelopeJson, { directoryPath: this.workspaceRoot }, trustSnapshot, policy);
            this.lastVerificationTime = Date.now();
            return this.workspaceResult;
        }
        catch (err) {
            console.error(`[runWorkspaceVerification] Error: ${err}`);
            this.workspaceResult = null;
            return null;
        }
    }
}
//# sourceMappingURL=verifier.js.map