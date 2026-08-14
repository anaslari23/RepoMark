import fs from 'node:fs';
import path from 'node:path';
import { canonicalizeJSON } from './canonicalize.js';
import { hashBytes, normalizePath } from './hashing.js';
import { buildMerkleTree } from './merkle.js';
import { defaultVerifier } from './signing.js';
import { buildSourceOriginStatement, createDSSEEnvelope, unpackDSSEEnvelope } from './statement.js';
import { extractCapsule, stripCapsule } from './capsule.js';
/**
 * Scans a directory to collect raw byte digests for all non-excluded files.
 */
export function scanDirectory(dirPath, exclusions = ['.git', '.repomark', 'node_modules', 'dist', '.DS_Store']) {
    const results = [];
    function walk(currentDir, relativeDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const ent of entries) {
            const relPath = relativeDir ? `${relativeDir}/${ent.name}` : ent.name;
            const normalized = relPath.replace(/\\/g, '/');
            // Check exclusion list
            const isExcluded = exclusions.some(ex => {
                if (normalized === ex || normalized.startsWith(`${ex}/`))
                    return true;
                if (ent.name === ex)
                    return true;
                return false;
            });
            if (isExcluded)
                continue;
            const fullPath = path.join(currentDir, ent.name);
            if (ent.isDirectory()) {
                walk(fullPath, relPath);
            }
            else if (ent.isFile() || ent.isSymbolicLink()) {
                const rawBytes = fs.readFileSync(fullPath);
                const rawDigest = hashBytes(rawBytes, 'sha256');
                results.push({
                    path: normalizePath(relPath),
                    rawDigest,
                    size: rawBytes.length
                });
            }
        }
    }
    walk(dirPath, '');
    return results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
/**
 * Sealed Directory generation: Creates statement, signs envelope, and indexes files.
 */
export function sealDirectory(directory, claimParams, policy, signer) {
    const files = scanDirectory(directory, policy.exclusions);
    if (files.length === 0) {
        throw new Error('Cannot seal an empty directory. No valid files found after applying exclusion rules.');
    }
    const merkleTree = buildMerkleTree(files);
    const statementParams = {
        claimKind: claimParams.claimKind || policy.claimKind || 'verified-origin',
        issuer: {
            id: claimParams.issuerId,
            keyId: signer.keyId,
            signatureAlgorithm: signer.algorithm,
            name: claimParams.issuerName,
            organization: claimParams.organization,
            publicKey: signer.publicKey
        },
        files,
        merkleRoot: merkleTree.rootDigest,
        provenance: claimParams.vcsRevision
            ? {
                vcs: {
                    type: 'git',
                    repository: claimParams.vcsRepository,
                    revision: claimParams.vcsRevision
                },
                tool: {
                    name: 'repomark',
                    version: '1.0.0'
                }
            }
            : undefined
    };
    const statement = buildSourceOriginStatement(statementParams);
    const canonicalStatement = canonicalizeJSON(statement);
    const signature = signer.sign(Buffer.from(canonicalStatement, 'utf8'));
    const envelope = createDSSEEnvelope(statement, typeof signature === 'string' ? signature : '', signer.keyId);
    return {
        statement,
        envelope,
        files,
        merkleRoot: merkleTree.rootDigest
    };
}
/**
 * Executes the full ordered verification pipeline on a DSSE Envelope.
 */
export function verifyEnvelope(envelopeInput, artifact, trustSnapshot, policy) {
    const policyDecisions = [];
    // Step 1: Unpack and validate envelope & statement schema
    let envelope;
    let statement;
    let canonicalPayload;
    try {
        const unpacked = unpackDSSEEnvelope(envelopeInput);
        envelope = unpacked.envelope;
        statement = unpacked.statement;
        canonicalPayload = unpacked.canonicalPayload;
        policyDecisions.push({ rule: 'schema-validation', passed: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            state: 'invalid',
            claim: null,
            subjectMatches: [],
            signer: {
                keyId: 'unknown',
                trusted: false,
                status: 'UNKNOWN',
                signatureValid: false,
                signatureAlgorithm: 'ed25519'
            },
            policy: [{ rule: 'schema-validation', passed: false, reason: msg }],
            evidenceDigest: hashBytes(msg, 'sha256'),
            summary: `Invalid envelope/statement structure: ${msg}`
        };
    }
    const predicate = statement.predicate;
    const issuer = predicate.issuer;
    const primarySig = envelope.signatures[0];
    const claim = {
        claimKind: predicate.claimKind,
        isDefaultKind: predicate.claimKind === 'verified-origin',
        issuerId: issuer.id,
        issuerName: issuer.name,
        organization: issuer.organization,
        timestamp: predicate.timestamp,
        cleanExport: predicate.cleanExport,
        manifest: predicate.manifest,
        provenance: predicate.provenance
    };
    // Step 2: Resolve signer and trust snapshot
    let signerDecision;
    const keyId = primarySig.keyid || issuer.keyId;
    const trustedRecord = trustSnapshot?.trustedKeys?.[keyId];
    const revokedRecord = trustSnapshot?.revokedKeys?.[keyId];
    if (revokedRecord || trustedRecord?.status === 'revoked') {
        const revState = revokedRecord?.revocationState || trustedRecord?.revocationState || 'compromised-pre-issuance';
        const revokedAtStr = revokedRecord?.revokedAt || trustedRecord?.revokedAt;
        const revokedAtTime = revokedAtStr ? new Date(revokedAtStr).getTime() : 0;
        const sealedAtTime = new Date(predicate.timestamp).getTime();
        let effStatus = 'REVOKED';
        let isTrustedHistorically = false;
        if (revState === 'compromised-pre-issuance') {
            effStatus = 'REVOKED_PRE_ISSUANCE';
        }
        else if (revState === 'compromised-post-issuance') {
            effStatus = 'REVOKED_POST_ISSUANCE';
            if (revokedAtTime > 0 && sealedAtTime < revokedAtTime) {
                isTrustedHistorically = true;
            }
        }
        else if (revState === 'authorization-withdrawn') {
            effStatus = 'AUTHORIZATION_WITHDRAWN';
            if (revokedAtTime > 0 && sealedAtTime < revokedAtTime) {
                isTrustedHistorically = true;
            }
        }
        signerDecision = {
            keyId,
            trusted: isTrustedHistorically,
            status: effStatus,
            signatureValid: false,
            signatureAlgorithm: issuer.signatureAlgorithm,
            identity: trustedRecord?.owner || issuer.id,
            publicKey: trustedRecord?.publicKey || issuer.publicKey,
            revocationReason: revokedRecord?.reason || trustedRecord?.revocationReason || 'Key explicitly revoked in trust snapshot'
        };
        if (!isTrustedHistorically) {
            policyDecisions.push({ rule: 'key-trust', passed: false, reason: signerDecision.revocationReason });
        }
        else {
            policyDecisions.push({ rule: 'key-trust', passed: true, reason: `Historically valid (sealed before revocation: ${effStatus})` });
        }
    }
    else if (trustedRecord) {
        signerDecision = {
            keyId,
            trusted: true,
            status: 'TRUSTED',
            signatureValid: false,
            signatureAlgorithm: issuer.signatureAlgorithm,
            identity: trustedRecord.owner,
            publicKey: trustedRecord.publicKey
        };
        policyDecisions.push({ rule: 'key-trust', passed: true });
    }
    else {
        signerDecision = {
            keyId,
            trusted: false,
            status: 'UNTRUSTED',
            signatureValid: false,
            signatureAlgorithm: issuer.signatureAlgorithm,
            identity: issuer.id,
            publicKey: issuer.publicKey
        };
        policyDecisions.push({ rule: 'key-trust', passed: false, reason: `Key ${keyId} not found in local trust snapshot` });
    }
    // Step 3: Verify digital signature
    const pubKey = signerDecision.publicKey || issuer.publicKey;
    let signatureValid = false;
    if (pubKey) {
        signatureValid = defaultVerifier.verify(Buffer.from(canonicalPayload, 'utf8'), primarySig.sig, pubKey, issuer.signatureAlgorithm);
    }
    signerDecision.signatureValid = signatureValid;
    policyDecisions.push({
        rule: 'signature-verification',
        passed: signatureValid,
        reason: signatureValid ? undefined : 'Cryptographic signature verification failed over canonical payload'
    });
    if (!signatureValid) {
        return {
            state: 'invalid',
            claim,
            subjectMatches: [],
            signer: signerDecision,
            policy: policyDecisions,
            evidenceDigest: hashBytes(canonicalPayload, 'sha256'),
            summary: 'Signature invalid: Attestation payload was altered or forged.'
        };
    }
    if (!signerDecision.trusted && (signerDecision.status.startsWith('REVOKED') || signerDecision.status === 'AUTHORIZATION_WITHDRAWN')) {
        return {
            state: 'revoked',
            claim,
            subjectMatches: [],
            signer: signerDecision,
            policy: policyDecisions,
            evidenceDigest: hashBytes(canonicalPayload, 'sha256'),
            summary: `Issuer signing key is revoked: ${signerDecision.revocationReason}`
        };
    }
    if (signerDecision.status === 'UNTRUSTED') {
        return {
            state: 'untrusted',
            claim,
            subjectMatches: [],
            signer: signerDecision,
            policy: policyDecisions,
            evidenceDigest: hashBytes(canonicalPayload, 'sha256'),
            summary: `Signer key ${keyId} is not in local trust root.`
        };
    }
    // Step 4: Digest comparison and Merkle tree verification
    let actualFiles = [];
    if (artifact.files) {
        actualFiles = artifact.files;
    }
    else if (artifact.directoryPath) {
        actualFiles = scanDirectory(artifact.directoryPath, policy?.exclusions);
    }
    const actualMap = new Map();
    for (const f of actualFiles) {
        actualMap.set(normalizePath(f.path), f.rawDigest);
    }
    const subjectMatches = [];
    let allExact = true;
    for (const sub of statement.subject) {
        const pathName = normalizePath(sub.name);
        const expectedDigest = sub.digest.sha256 || '';
        const actualDigest = actualMap.get(pathName) || null;
        if (!actualDigest) {
            allExact = false;
            subjectMatches.push({
                path: pathName,
                expectedDigest,
                actualDigest: null,
                status: 'missing'
            });
        }
        else if (actualDigest.toLowerCase() === expectedDigest.toLowerCase()) {
            subjectMatches.push({
                path: pathName,
                expectedDigest,
                actualDigest,
                status: 'matched'
            });
        }
        else {
            allExact = false;
            subjectMatches.push({
                path: pathName,
                expectedDigest,
                actualDigest,
                status: 'modified'
            });
        }
    }
    // Check for unexpected extra files
    const statementSubjects = new Set(statement.subject.map(s => normalizePath(s.name)));
    for (const [actPath, actDig] of actualMap.entries()) {
        if (!statementSubjects.has(actPath)) {
            allExact = false;
            subjectMatches.push({
                path: actPath,
                expectedDigest: '',
                actualDigest: actDig,
                status: 'unexpected'
            });
        }
    }
    // Recompute Merkle root
    const recalculatedTree = buildMerkleTree(actualFiles);
    const expectedRoot = predicate.manifest.rootDigest.value.toLowerCase();
    const actualRoot = recalculatedTree.rootDigest.toLowerCase();
    const merkleRootMatched = expectedRoot === actualRoot;
    policyDecisions.push({
        rule: 'merkle-root-match',
        passed: merkleRootMatched,
        reason: merkleRootMatched ? undefined : `Merkle root mismatch (expected: ${expectedRoot}, actual: ${actualRoot})`
    });
    const evidenceDigest = hashBytes(canonicalizeJSON({
        canonicalPayload,
        signer: signerDecision,
        merkleRootMatched,
        allExact
    }), 'sha256');
    if (allExact && merkleRootMatched) {
        const isHistorical = signerDecision.status !== 'TRUSTED';
        return {
            state: 'verified-exact',
            claim,
            subjectMatches,
            signer: signerDecision,
            policy: policyDecisions,
            evidenceDigest,
            summary: isHistorical
                ? `Historically verified exact origin for ${claim.issuerName || claim.issuerId} (${signerDecision.status})`
                : `Verified exact origin for ${claim.issuerName || claim.issuerId} (${claim.claimKind})`
        };
    }
    else {
        const isHistorical = signerDecision.status !== 'TRUSTED';
        return {
            state: 'verified-modified',
            claim,
            subjectMatches,
            signer: signerDecision,
            policy: policyDecisions,
            evidenceDigest,
            summary: isHistorical
                ? `Historically verified signature from ${claim.issuerName || claim.issuerId}, but modified (${signerDecision.status})`
                : `Verified signature from ${claim.issuerName || claim.issuerId}, but repository contents have been modified since sealing.`
        };
    }
}
/**
 * Verifies a single file containing an EmbeddedCapsule.
 */
export function verifyPortableFile(fileBytes, trustSnapshot, _policy) {
    const buf = Buffer.isBuffer(fileBytes) ? fileBytes : Buffer.from(fileBytes);
    let capsule;
    try {
        capsule = extractCapsule(buf);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            state: 'invalid',
            claim: null,
            subjectMatches: [],
            signer: {
                keyId: 'unknown',
                trusted: false,
                status: 'UNKNOWN',
                signatureValid: false,
                signatureAlgorithm: 'ed25519'
            },
            policy: [{ rule: 'capsule-extraction', passed: false, reason: msg }],
            evidenceDigest: hashBytes(msg, 'sha256'),
            summary: `Malformed capsule: ${msg}`
        };
    }
    if (!capsule) {
        return {
            state: 'inconclusive',
            claim: null,
            subjectMatches: [],
            signer: {
                keyId: 'unknown',
                trusted: false,
                status: 'UNKNOWN',
                signatureValid: false,
                signatureAlgorithm: 'ed25519'
            },
            policy: [],
            evidenceDigest: '',
            summary: 'No RepoMark capsule found.'
        };
    }
    const { payload } = capsule;
    const keyId = payload.keyId;
    // Compute markerless digest for comparison
    const stripped = stripCapsule(buf);
    const actualMarkerlessDigest = hashBytes(stripped, 'sha256');
    const expectedMarkerlessDigest = payload.markerlessSha256;
    const rawMatches = actualMarkerlessDigest.toLowerCase() === expectedMarkerlessDigest.toLowerCase();
    const trustedRecord = trustSnapshot?.trustedKeys?.[keyId];
    const revokedRecord = trustSnapshot?.revokedKeys?.[keyId];
    let signerDecision;
    if (revokedRecord || trustedRecord?.status === 'revoked') {
        const revState = revokedRecord?.revocationState || trustedRecord?.revocationState || 'compromised-pre-issuance';
        const revokedAtStr = revokedRecord?.revokedAt || trustedRecord?.revokedAt;
        const revokedAtTime = revokedAtStr ? new Date(revokedAtStr).getTime() : 0;
        const sealedAtTime = new Date(payload.issuedAt).getTime();
        let effStatus = 'REVOKED';
        let isTrustedHistorically = false;
        if (revState === 'compromised-pre-issuance') {
            effStatus = 'REVOKED_PRE_ISSUANCE';
        }
        else if (revState === 'compromised-post-issuance') {
            effStatus = 'REVOKED_POST_ISSUANCE';
            if (revokedAtTime > 0 && sealedAtTime < revokedAtTime) {
                isTrustedHistorically = true;
            }
        }
        else if (revState === 'authorization-withdrawn') {
            effStatus = 'AUTHORIZATION_WITHDRAWN';
            if (revokedAtTime > 0 && sealedAtTime < revokedAtTime) {
                isTrustedHistorically = true;
            }
        }
        signerDecision = {
            keyId,
            trusted: isTrustedHistorically,
            status: effStatus,
            signatureValid: false,
            signatureAlgorithm: 'ed25519', // Currently hardcoded to ed25519 for standalone
            identity: trustedRecord?.owner || payload.issuerId,
            publicKey: trustedRecord?.publicKey
        };
    }
    else if (trustedRecord) {
        signerDecision = {
            keyId,
            trusted: true,
            status: 'TRUSTED',
            signatureValid: false,
            signatureAlgorithm: trustedRecord.algorithm,
            identity: trustedRecord.owner,
            publicKey: trustedRecord.publicKey
        };
    }
    else {
        signerDecision = {
            keyId,
            trusted: false,
            status: 'UNTRUSTED',
            signatureValid: false,
            signatureAlgorithm: 'ed25519',
            identity: payload.issuerId
        };
    }
    // Verify signature over the canonicalized payload JSON
    const pubKey = signerDecision.publicKey;
    let signatureValid = false;
    if (pubKey) {
        // The signature covers the base64url encoded payload
        // Reconstruct the base64url payload to verify
        const jcs = canonicalizeJSON(payload);
        const b64Payload = Buffer.from(jcs, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        // Decode the base64url signature back to hex
        let b64Sig = capsule.signature.replace(/-/g, '+').replace(/_/g, '/');
        while (b64Sig.length % 4)
            b64Sig += '=';
        const sigHex = Buffer.from(b64Sig, 'base64').toString('hex');
        try {
            signatureValid = defaultVerifier.verify(Buffer.from(b64Payload, 'utf8'), sigHex, pubKey, signerDecision.signatureAlgorithm);
        }
        catch {
            signatureValid = false;
        }
    }
    signerDecision.signatureValid = signatureValid;
    const state = !signatureValid
        ? 'invalid'
        : (!signerDecision.trusted && (signerDecision.status.startsWith('REVOKED') || signerDecision.status === 'AUTHORIZATION_WITHDRAWN'))
            ? 'revoked'
            : signerDecision.status === 'UNTRUSTED'
                ? 'untrusted'
                : rawMatches
                    ? 'verified-exact'
                    : 'verified-modified';
    return {
        state,
        claim: {
            claimKind: payload.claimKind,
            isDefaultKind: payload.claimKind === 'verified-origin',
            issuerId: payload.issuerId,
            timestamp: payload.issuedAt,
            cleanExport: true,
            manifest: {
                treeAlgorithm: 'repomark-merkle-v1',
                canonicalization: 'repomark-c14n-v1',
                hashAlgorithm: 'sha256',
                filesCount: 1,
                totalBytes: buf.length,
                rootDigest: {
                    algorithm: 'sha256',
                    value: expectedMarkerlessDigest
                }
            },
            provenance: {
                tool: { name: 'repomark', version: '1.0.0' },
                vcs: { type: 'git', revision: payload.repositoryRoot } // Storing root here for mapping
            }
        },
        subjectMatches: [
            {
                path: payload.originalPath,
                expectedDigest: expectedMarkerlessDigest,
                actualDigest: actualMarkerlessDigest,
                status: rawMatches ? 'matched' : 'modified'
            }
        ],
        signer: signerDecision,
        policy: [
            { rule: 'markerless-digest-match', passed: rawMatches },
            { rule: 'signature-valid', passed: signatureValid }
        ],
        evidenceDigest: hashBytes(`${payload.originalPath}:${actualMarkerlessDigest}`, 'sha256'),
        summary: `Portable capsule verification: ${state}`
    };
}
//# sourceMappingURL=verify.js.map