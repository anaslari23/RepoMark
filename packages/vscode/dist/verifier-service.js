"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifierService = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const core_1 = require("@repomark/core");
class VerifierService {
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
        const relPath = node_path_1.default.relative(this.workspaceRoot, filePath);
        let normalizedPath;
        try {
            normalizedPath = (0, core_1.normalizePath)(relPath);
        }
        catch {
            return { state: 'untracked' };
        }
        if (!node_fs_1.default.existsSync(filePath) || !node_fs_1.default.statSync(filePath).isFile()) {
            return { state: 'untracked' };
        }
        const rawBytes = node_fs_1.default.readFileSync(filePath);
        const currentDigest = (0, core_1.hashBytes)(rawBytes, 'sha256');
        // Check in-memory cache keyed by contentDigest
        const cached = this.cache.get(normalizedPath);
        if (cached && cached.contentDigest === currentDigest && this.workspaceResult) {
            return cached.status;
        }
        // Run full workspace verification if not loaded or cache invalid
        this.runWorkspaceVerification();
        if (!this.workspaceResult || !this.workspaceResult.claim) {
            const fallbackTrustPath = node_path_1.default.join(this.workspaceRoot, '.repomark', 'trust.json');
            let trustSnapshot;
            if (node_fs_1.default.existsSync(fallbackTrustPath)) {
                trustSnapshot = (0, core_1.parseStrictJSON)(node_fs_1.default.readFileSync(fallbackTrustPath, 'utf8'));
            }
            const standaloneRes = (0, core_1.verifyPortableFile)(rawBytes, trustSnapshot);
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
        const repomarkDir = node_path_1.default.join(this.workspaceRoot, '.repomark');
        const envPath = node_path_1.default.join(repomarkDir, 'envelope.json');
        if (!node_fs_1.default.existsSync(envPath)) {
            this.workspaceResult = null;
            return null;
        }
        try {
            const envelopeJson = node_fs_1.default.readFileSync(envPath, 'utf8');
            // Load trust snapshot
            const trustPath = node_path_1.default.join(repomarkDir, 'trust.json');
            let trustSnapshot;
            if (node_fs_1.default.existsSync(trustPath)) {
                trustSnapshot = (0, core_1.parseStrictJSON)(node_fs_1.default.readFileSync(trustPath, 'utf8'));
            }
            // Load policy
            const policyPath = node_path_1.default.join(repomarkDir, 'policy.json');
            let policy;
            if (node_fs_1.default.existsSync(policyPath)) {
                policy = (0, core_1.parseStrictJSON)(node_fs_1.default.readFileSync(policyPath, 'utf8'));
            }
            this.workspaceResult = (0, core_1.verifyEnvelope)(envelopeJson, { directoryPath: this.workspaceRoot }, trustSnapshot, policy);
            this.lastVerificationTime = Date.now();
            return this.workspaceResult;
        }
        catch {
            this.workspaceResult = null;
            return null;
        }
    }
}
exports.VerifierService = VerifierService;
//# sourceMappingURL=verifier-service.js.map