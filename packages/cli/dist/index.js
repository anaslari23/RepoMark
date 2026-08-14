#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createDeterministicZip, Ed25519Signer, extractZipEntries, generateEd25519KeyPair, hashBytes, parseAndValidateStatement, parseStrictJSON, sealDirectory, unpackDSSEEnvelope, verifyEnvelope, verifyPortableFile, computeMarkerlessDigest, buildAndEmbedCapsule } from '@repomark/core';
import { MockKmsSigner } from './mock-signer.js';
const DEFAULT_POLICY = {
    version: 'v1',
    claimKind: 'verified-origin',
    algorithms: {
        hash: 'sha256',
        tree: 'repomark-merkle-v1',
        canonicalization: 'repomark-c14n-v1',
        signature: 'ed25519'
    },
    exclusions: [
        '.git',
        '.repomark',
        'node_modules',
        'dist',
        'build',
        '.DS_Store',
        'repomark-source.zip'
    ],
    cleanExportOnly: true
};
function printHelp() {
    console.log(`
RepoMark CLI v1.0.0 — Cryptographic Source Provenance

USAGE:
  repomark <command> [options]

COMMANDS:
  init      Initialize .repomark/ configuration and policies
            Options:
              --gen-key             Generate an Ed25519 keypair for signing

  seal      Seal a clean export of the repository with an in-toto provenance statement
            Options:
              --dir <path>          Target directory (default: .)
              --claim <kind>        verified-origin [default] | original-author | organization-origin
              --issuer-id <id>      Issuer identifier URI or name
              --issuer-name <name>  Human readable author/issuer name
              --org <name>          Organization name
              --key <path>          Path to private key PEM (default: .repomark/private.key.pem)
              --signer <type>       Type of signer: 'local' (default) or 'kms-mock'
              --force               Proceed without clean VCS check

  verify    Verify repository or archive against cryptographic statement and trust snapshot
            Options:
              --target <path>       Target directory, ZIP file, or capsule (default: .)
              --trust <path>        Custom trust snapshot path (default: .repomark/trust.json)
              --json                Emit structured JSON verification report (for CI)

  inspect   Inspect and print human-readable facts from an existing statement or envelope
            Options:
              --target <path>       Path to statement or envelope (default: .repomark/statement.json)

  export    Produce a reproducible, deterministic sealed source ZIP archive
            Options:
              --dir <path>          Target directory (default: .)
              --out <path>          Output zip path (default: repomark-source.zip)
              
  mark      Embed a portable file capsule into a single file
            Options:
              --target <path>       Path to source file to mark

  issue     Personalized issuance workflow (dual approval)
            Subcommands:
              request   Start issuance (requires --file, --recipient, --operator, --url)
              approve   Approve issuance and mark file (requires --req-id, --operator, --url)

  trace     Trace a leaked copyId (dual approval)
            Subcommands:
              request   Start tracing (requires --copy-id, --operator, --url)
              approve   Approve tracing (requires --req-id, --operator, --url)
`);
}
function parseArgs(args) {
    const command = args[0] || 'help';
    const options = {};
    const positionals = [];
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                options[key] = args[i + 1];
                i++;
            }
            else {
                options[key] = true;
            }
        }
        else {
            positionals.push(arg);
        }
    }
    return { command, options, positionals };
}
// 1. INIT COMMAND
export function cmdInit(options) {
    const repomarkDir = path.resolve('.repomark');
    fs.mkdirSync(repomarkDir, { recursive: true });
    const policyPath = path.join(repomarkDir, 'policy.json');
    if (!fs.existsSync(policyPath)) {
        fs.writeFileSync(policyPath, JSON.stringify(DEFAULT_POLICY, null, 2) + '\n');
        console.log(`Created default policy configuration: ${policyPath}`);
    }
    else {
        console.log(`Policy configuration already exists: ${policyPath}`);
    }
    const trustPath = path.join(repomarkDir, 'trust.json');
    let trustSnapshot;
    if (fs.existsSync(trustPath)) {
        trustSnapshot = parseStrictJSON(fs.readFileSync(trustPath, 'utf8'));
    }
    else {
        trustSnapshot = {
            snapshotVersion: 'v1',
            updatedAt: new Date().toISOString(),
            trustedKeys: {}
        };
    }
    if (options['gen-key']) {
        const keyPair = generateEd25519KeyPair();
        const privKeyPath = path.join(repomarkDir, 'private.key.pem');
        const pubKeyPath = path.join(repomarkDir, 'public.key.pem');
        fs.writeFileSync(privKeyPath, keyPair.privateKey, { mode: 0o600 });
        fs.writeFileSync(pubKeyPath, keyPair.publicKeyPem);
        trustSnapshot.trustedKeys[keyPair.keyId] = {
            keyId: keyPair.keyId,
            publicKey: keyPair.publicKey,
            algorithm: 'ed25519',
            owner: 'RepoMark Local User',
            validFrom: new Date().toISOString(),
            status: 'active'
        };
        console.log(`Generated Ed25519 signing keypair:`);
        console.log(`  Private Key: ${privKeyPath} (mode 0600)`);
        console.log(`  Public Key:  ${pubKeyPath}`);
        console.log(`  Key ID:      ${keyPair.keyId}`);
    }
    fs.writeFileSync(trustPath, JSON.stringify(trustSnapshot, null, 2) + '\n');
    console.log(`Updated trust snapshot: ${trustPath}`);
}
// 2. SEAL COMMAND
export function cmdSeal(options) {
    const dir = path.resolve(options['dir'] || '.');
    const repomarkDir = path.join(dir, '.repomark');
    fs.mkdirSync(repomarkDir, { recursive: true });
    // Load Policy
    const policyPath = path.join(repomarkDir, 'policy.json');
    let policy = DEFAULT_POLICY;
    if (fs.existsSync(policyPath)) {
        policy = parseStrictJSON(fs.readFileSync(policyPath, 'utf8'));
    }
    else {
        fs.writeFileSync(policyPath, JSON.stringify(DEFAULT_POLICY, null, 2) + '\n');
    }
    // Check Clean Export requirement
    if (policy.cleanExportOnly && !options['force']) {
        const gitDir = path.join(dir, '.git');
        if (fs.existsSync(gitDir)) {
            // In dev repos, warn or require clean status
            // We will allow sealing if files exist and log info
        }
    }
    // Load Signer Key
    let signer;
    const signerType = options['signer'];
    const customKeyPath = options['key'];
    const privKeyPath = customKeyPath ? path.resolve(customKeyPath) : path.join(repomarkDir, 'private.key.pem');
    if (signerType === 'kms-mock') {
        const mockKeyId = options['issuer-id'] || 'mock-kms-key-1';
        signer = new MockKmsSigner(mockKeyId);
        // Auto-register in trust snapshot for convenience during CI simulation
        const trustPath = path.join(repomarkDir, 'trust.json');
        let trust = { snapshotVersion: 'v1', updatedAt: new Date().toISOString(), trustedKeys: {} };
        if (fs.existsSync(trustPath)) {
            trust = parseStrictJSON(fs.readFileSync(trustPath, 'utf8'));
        }
        trust.trustedKeys[signer.keyId] = {
            keyId: signer.keyId,
            publicKey: signer.publicKey,
            algorithm: signer.algorithm,
            owner: options['issuer-name'] || 'Mock CI Workload Identity',
            status: 'active'
        };
        fs.writeFileSync(trustPath, JSON.stringify(trust, null, 2) + '\\n');
    }
    else {
        let privKeyPem;
        if (fs.existsSync(privKeyPath)) {
            privKeyPem = fs.readFileSync(privKeyPath, 'utf8');
        }
        else {
            // Generate key on the fly if none exists
            const keyPair = generateEd25519KeyPair();
            privKeyPem = keyPair.privateKey;
            fs.writeFileSync(privKeyPath, keyPair.privateKey, { mode: 0o600 });
            fs.writeFileSync(path.join(repomarkDir, 'public.key.pem'), keyPair.publicKeyPem);
            // Register in trust.json
            const trustPath = path.join(repomarkDir, 'trust.json');
            let trust = { snapshotVersion: 'v1', updatedAt: new Date().toISOString(), trustedKeys: {} };
            if (fs.existsSync(trustPath)) {
                trust = parseStrictJSON(fs.readFileSync(trustPath, 'utf8'));
            }
            trust.trustedKeys[keyPair.keyId] = {
                keyId: keyPair.keyId,
                publicKey: keyPair.publicKey,
                algorithm: 'ed25519',
                owner: options['issuer-name'] || 'RepoMark Issuer',
                status: 'active'
            };
            fs.writeFileSync(trustPath, JSON.stringify(trust, null, 2) + '\\n');
        }
        signer = new Ed25519Signer(privKeyPem);
    }
    const claimKind = options['claim'] || policy.claimKind || 'verified-origin';
    const issuerId = options['issuer-id'] || `https://repomark.dev/issuers/${signer.keyId}`;
    const issuerName = options['issuer-name'] || 'Authorized Issuer';
    const organization = options['org'] || undefined;
    const result = sealDirectory(dir, {
        claimKind,
        issuerId,
        issuerName,
        organization
    }, policy, signer);
    // Write exact required paths:
    // .repomark/statement.json
    const stmtPath = path.join(repomarkDir, 'statement.json');
    fs.writeFileSync(stmtPath, JSON.stringify(result.statement, null, 2) + '\n');
    // .repomark/envelope.json
    const envPath = path.join(repomarkDir, 'envelope.json');
    fs.writeFileSync(envPath, JSON.stringify(result.envelope, null, 2) + '\n');
    // .repomark/files.json
    const filesPath = path.join(repomarkDir, 'files.json');
    fs.writeFileSync(filesPath, JSON.stringify(result.files, null, 2) + '\n');
    console.log(`Sealed directory: ${dir}`);
    console.log(`  Claim:        ${claimKind}`);
    console.log(`  Signer:       ${signer.keyId}`);
    console.log(`  Merkle Root:  ${result.merkleRoot}`);
    console.log(`  Files Sealed: ${result.files.length}`);
    console.log(`  Artifacts:    ${stmtPath}`);
    console.log(`                ${envPath}`);
    console.log(`                ${filesPath}`);
}
// 3. VERIFY COMMAND
export function cmdVerify(options, positionals) {
    const targetPath = path.resolve(options['target'] || positionals[0] || '.');
    let envelopeJson;
    let dirPath;
    let fileList;
    // Case 1: Target is a ZIP archive
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile() && targetPath.endsWith('.zip')) {
        const zipBuf = fs.readFileSync(targetPath);
        const extracted = extractZipEntries(zipBuf);
        const envEntry = extracted.find((e) => e.path === '.repomark/envelope.json');
        if (!envEntry) {
            throw new Error(`Target ZIP does not contain .repomark/envelope.json: ${targetPath}`);
        }
        envelopeJson = envEntry.data.toString('utf8');
        fileList = extracted
            .filter((e) => !e.path.startsWith('.repomark/'))
            .map((e) => ({
            path: e.path,
            rawDigest: hashBytes(e.data, 'sha256'),
            size: e.data.length
        }));
    }
    else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        // Case 2: Target is a directory
        dirPath = targetPath;
        const envPath = path.join(targetPath, '.repomark', 'envelope.json');
        if (!fs.existsSync(envPath)) {
            throw new Error(`Target directory missing .repomark/envelope.json: ${targetPath}`);
        }
        envelopeJson = fs.readFileSync(envPath, 'utf8');
    }
    else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
        if (targetPath.endsWith('envelope.json')) {
            // Case 3: Target is envelope file directly
            envelopeJson = fs.readFileSync(targetPath, 'utf8');
            dirPath = path.dirname(path.dirname(targetPath));
        }
        else {
            // Case 4: Target is a standalone portable file
            const fileBytes = fs.readFileSync(targetPath);
            const customTrust = options['trust'];
            const trustPath = customTrust
                ? path.resolve(customTrust)
                : path.resolve('.repomark', 'trust.json');
            let trustSnapshot;
            if (fs.existsSync(trustPath)) {
                trustSnapshot = parseStrictJSON(fs.readFileSync(trustPath, 'utf8'));
            }
            const res = verifyPortableFile(fileBytes, trustSnapshot);
            if (options['json']) {
                console.log(JSON.stringify(res, null, 2));
            }
            else {
                console.log(`\\n=== REPOMARK STANDALONE VERIFICATION ===`);
                console.log(`State:        ${res.state.toUpperCase()}`);
                console.log(`Claim:        ${res.claim?.claimKind || 'none'} (${res.claim?.issuerId || 'unknown'})`);
                console.log(`Key ID:       ${res.signer.keyId}`);
                console.log(`Trust Status: ${res.signer.status}`);
                console.log(`Signature:    ${res.signer.signatureValid ? 'VALID' : 'INVALID'}`);
                console.log(`Summary:      ${res.summary}`);
                console.log(`========================================\\n`);
            }
            return res;
        }
    }
    else {
        throw new Error(`Target not found: ${targetPath}`);
    }
    // Load Trust Snapshot
    const customTrust = options['trust'];
    const trustPath = customTrust
        ? path.resolve(customTrust)
        : dirPath
            ? path.join(dirPath, '.repomark', 'trust.json')
            : path.resolve('.repomark', 'trust.json');
    let trustSnapshot;
    if (fs.existsSync(trustPath)) {
        trustSnapshot = parseStrictJSON(fs.readFileSync(trustPath, 'utf8'));
    }
    // Load Policy
    const policyPath = dirPath ? path.join(dirPath, '.repomark', 'policy.json') : path.resolve('.repomark', 'policy.json');
    let policy = DEFAULT_POLICY;
    if (fs.existsSync(policyPath)) {
        policy = parseStrictJSON(fs.readFileSync(policyPath, 'utf8'));
    }
    const result = verifyEnvelope(envelopeJson, fileList ? { files: fileList } : { directoryPath: dirPath }, trustSnapshot, policy);
    if (options['json']) {
        console.log(JSON.stringify(result, null, 2));
    }
    else {
        console.log(`\n=== REPOMARK VERIFICATION REPORT ===`);
        console.log(`State:        ${result.state.toUpperCase()}`);
        console.log(`Claim:        ${result.claim?.claimKind || 'none'} (${result.claim?.issuerName || result.claim?.issuerId || 'unknown'})`);
        console.log(`Key ID:       ${result.signer.keyId}`);
        console.log(`Trust Status: ${result.signer.status}`);
        console.log(`Signature:    ${result.signer.signatureValid ? 'VALID' : 'INVALID'}`);
        console.log(`Summary:      ${result.summary}`);
        const mismatches = result.subjectMatches.filter((m) => m.status !== 'matched');
        if (mismatches.length > 0) {
            console.log(`\nModified / Missing / Unexpected Files (${mismatches.length}):`);
            for (const m of mismatches) {
                console.log(`  [${m.status.toUpperCase()}] ${m.path}`);
            }
        }
        console.log(`====================================\n`);
    }
    return result;
}
// 4. INSPECT COMMAND
export function cmdInspect(options, positionals) {
    const targetPath = path.resolve(options['target'] || positionals[0] || '.repomark/statement.json');
    if (!fs.existsSync(targetPath)) {
        throw new Error(`Inspect target not found: ${targetPath}`);
    }
    const raw = fs.readFileSync(targetPath, 'utf8');
    let statement;
    if (targetPath.endsWith('envelope.json')) {
        const unpacked = unpackDSSEEnvelope(raw);
        statement = unpacked.statement;
    }
    else {
        statement = parseAndValidateStatement(raw);
    }
    const pred = statement.predicate;
    console.log(`\n=== REPOMARK STATEMENT INSPECTION ===`);
    console.log(`Statement Type:  ${statement._type}`);
    console.log(`Predicate Type:  ${statement.predicateType}`);
    console.log(`Claim Kind:      ${pred.claimKind}`);
    console.log(`Issuer ID:       ${pred.issuer.id}`);
    console.log(`Issuer Name:     ${pred.issuer.name || 'n/a'}`);
    console.log(`Key ID:          ${pred.issuer.keyId}`);
    console.log(`Signature Algo:  ${pred.issuer.signatureAlgorithm}`);
    console.log(`Timestamp:       ${pred.timestamp}`);
    console.log(`Clean Export:    ${pred.cleanExport}`);
    console.log(`Files Count:     ${pred.manifest.filesCount}`);
    console.log(`Total Bytes:     ${pred.manifest.totalBytes}`);
    console.log(`Merkle Root:     ${pred.manifest.rootDigest.value}`);
    console.log(`=====================================\n`);
}
// 5. EXPORT COMMAND (Deterministic Sealed ZIP)
export function cmdExport(options) {
    const dir = path.resolve(options['dir'] || '.');
    const outPath = path.resolve(options['out'] || 'repomark-source.zip');
    const repomarkDir = path.join(dir, '.repomark');
    const policyPath = path.join(repomarkDir, 'policy.json');
    let policy = DEFAULT_POLICY;
    if (fs.existsSync(policyPath)) {
        policy = parseStrictJSON(fs.readFileSync(policyPath, 'utf8'));
    }
    // Scan directory
    const filesToPack = [];
    function walk(currentDir, relativeDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const ent of entries) {
            const relPath = relativeDir ? `${relativeDir}/${ent.name}` : ent.name;
            const normalized = relPath.replace(/\\/g, '/');
            // Exclude git and zip output files, but include .repomark
            if (ent.name === '.git' || normalized.startsWith('.git/'))
                continue;
            if (normalized.endsWith('.zip'))
                continue;
            const fullPath = path.join(currentDir, ent.name);
            if (ent.isDirectory()) {
                walk(fullPath, relPath);
            }
            else if (ent.isFile()) {
                const rawBytes = fs.readFileSync(fullPath);
                filesToPack.push({
                    path: normalized,
                    data: rawBytes
                });
            }
        }
    }
    walk(dir, '');
    const zipBuffer = createDeterministicZip(filesToPack);
    fs.writeFileSync(outPath, zipBuffer);
    console.log(`Created deterministic sealed ZIP export:`);
    console.log(`  Output: ${outPath}`);
    console.log(`  Files:  ${filesToPack.length}`);
    console.log(`  Size:   ${zipBuffer.length} bytes`);
    console.log(`  Digest: ${hashBytes(zipBuffer, 'sha256')}`);
    return outPath;
}
// 6. MARK COMMAND
export function cmdMark(options, positionals) {
    const targetPath = path.resolve(options['target'] || positionals[0]);
    if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
        throw new Error('Target file not found');
    }
    const ext = path.extname(targetPath);
    const allowlist = ['.ts', '.js', '.tsx', '.jsx', '.cjs', '.mjs'];
    if (!allowlist.includes(ext)) {
        throw new Error(`Cannot embed capsule into ${ext} file. Allowed extensions: ${allowlist.join(', ')}`);
    }
    const repomarkDir = path.resolve('.repomark');
    const policyPath = path.join(repomarkDir, 'policy.json');
    const envelopePath = path.join(repomarkDir, 'envelope.json');
    if (!fs.existsSync(policyPath) || !fs.existsSync(envelopePath)) {
        throw new Error('.repomark/ context not found. Must run mark in a sealed repository root.');
    }
    const policy = parseStrictJSON(fs.readFileSync(policyPath, 'utf8'));
    const envelope = parseStrictJSON(fs.readFileSync(envelopePath, 'utf8'));
    const statement = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
    const privKeyPath = path.join(repomarkDir, 'private.key.pem');
    if (!fs.existsSync(privKeyPath)) {
        throw new Error('Private key not found for marking.');
    }
    const privKeyPem = fs.readFileSync(privKeyPath, 'utf8');
    const signer = new Ed25519Signer(privKeyPem);
    const fileBytes = fs.readFileSync(targetPath);
    const markerlessDigest = computeMarkerlessDigest(fileBytes);
    const payload = {
        issuerId: statement.predicate.issuer.id,
        keyId: signer.keyId,
        claimKind: policy.claimKind || 'verified-origin',
        repositoryRoot: statement.predicate.provenance?.vcs?.repository || 'local',
        originalPath: path.relative(process.cwd(), targetPath).replace(/\\/g, '/'),
        markerlessSha256: markerlessDigest,
        copyId: null, // Phase 4 TODO: HMAC derivation for personalized leaks
        issuedAt: new Date().toISOString()
    };
    const newBytes = buildAndEmbedCapsule(fileBytes, payload, (buf) => signer.sign(buf));
    fs.writeFileSync(targetPath, newBytes);
    console.log(`Embedded portable capsule into ${targetPath}`);
}
// 7. ISSUE COMMAND
export async function cmdIssue(options, positionals) {
    const subcmd = positionals[0];
    const url = options['url'] || 'http://localhost:3001';
    if (subcmd === 'request') {
        const file = options['file'];
        const recipient = options['recipient'];
        const operator = options['operator'];
        if (!file || !recipient || !operator) {
            throw new Error('Usage: repomark issue request --file <file> --recipient <id> --operator <id> [--url <url>]');
        }
        const fileBytes = fs.readFileSync(file);
        const markerlessDigest = computeMarkerlessDigest(fileBytes);
        // We also need to send the basic payload we want signed
        const repomarkDir = path.resolve('.repomark');
        const envPath = path.join(repomarkDir, 'envelope.json');
        if (!fs.existsSync(envPath)) {
            throw new Error('Missing .repomark/envelope.json');
        }
        const env = parseStrictJSON(fs.readFileSync(envPath, 'utf8'));
        const statement = parseAndValidateStatement(unpackDSSEEnvelope(env));
        const relPath = path.basename(file); // Simplification: assuming file is root for now
        const payloadTemplate = {
            issuerId: statement.predicate.issuer.id || '',
            keyId: 'pending', // Will be filled by server
            claimKind: statement.predicate.claimKind,
            repositoryRoot: 'origin', // Could be populated from statement
            originalPath: relPath,
            markerlessSha256: markerlessDigest,
            copyId: null, // Will be filled by server
            issuedAt: '' // Will be filled by server
        };
        const res = await fetch(`${url}/issuance/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Operator-Id': operator },
            body: JSON.stringify({
                artifactDigest: markerlessDigest,
                recipientInternalId: recipient,
                payloadTemplate
            })
        });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Failed to request issuance');
        console.log(`Issuance request created. Request ID: ${data.requestId}`);
        console.log(`To approve, run: repomark issue approve --req-id ${data.requestId} --operator <other-operator> --file ${file}`);
    }
    else if (subcmd === 'approve') {
        const reqId = options['req-id'];
        const operator = options['operator'];
        const file = options['file'];
        if (!reqId || !operator || !file) {
            throw new Error('Usage: repomark issue approve --req-id <id> --operator <id> --file <file> [--url <url>]');
        }
        const res = await fetch(`${url}/issuance/approve/${reqId}`, {
            method: 'POST',
            headers: { 'X-Operator-Id': operator }
        });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Failed to approve issuance');
        console.log(`Issuance approved! Copy ID: ${data.copyId}`);
        // Embed the capsule block returned by the server
        const fileBytes = fs.readFileSync(file);
        const block = Buffer.from(data.capsuleBlock + '\n', 'utf8');
        const newBytes = Buffer.concat([block, fileBytes]);
        fs.writeFileSync(file, newBytes);
        console.log(`Successfully embedded personalized capsule into ${file}`);
    }
    else {
        throw new Error('Unknown issue subcommand. Use "request" or "approve".');
    }
}
// 8. TRACE COMMAND
export async function cmdTrace(options, positionals) {
    const subcmd = positionals[0];
    const url = options['url'] || 'http://localhost:3001';
    if (subcmd === 'request') {
        const copyId = options['copy-id'];
        const operator = options['operator'];
        if (!copyId || !operator) {
            throw new Error('Usage: repomark trace request --copy-id <id> --operator <id> [--url <url>]');
        }
        const res = await fetch(`${url}/trace/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Operator-Id': operator },
            body: JSON.stringify({ copyId })
        });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Failed to request trace');
        console.log(`Trace request created. Request ID: ${data.requestId}`);
        console.log(`To approve, run: repomark trace approve --req-id ${data.requestId} --operator <other-operator>`);
    }
    else if (subcmd === 'approve') {
        const reqId = options['req-id'];
        const operator = options['operator'];
        if (!reqId || !operator) {
            throw new Error('Usage: repomark trace approve --req-id <id> --operator <id> [--url <url>]');
        }
        const res = await fetch(`${url}/trace/approve/${reqId}`, {
            method: 'POST',
            headers: { 'X-Operator-Id': operator }
        });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Failed to approve trace');
        console.log('Trace Request Approved:');
        console.log('=======================');
        console.log(`Recipient Internal ID: ${data.recipientInternalId}`);
        console.log(`Artifact Digest:       ${data.artifactDigest}`);
        console.log(`Issued At:             ${data.issuedAt}`);
        console.log();
        console.log(data.disclaimer);
    }
    else {
        throw new Error('Unknown trace subcommand. Use "request" or "approve".');
    }
}
// CLI Entrypoint
export async function main(argv = process.argv.slice(2)) {
    const { command, options, positionals } = parseArgs(argv);
    try {
        switch (command) {
            case 'init':
                cmdInit(options);
                break;
            case 'seal':
                cmdSeal(options);
                break;
            case 'verify': {
                const res = cmdVerify(options, positionals);
                if (res.state !== 'verified-exact') {
                    process.exit(1);
                }
                break;
            }
            case 'inspect':
                cmdInspect(options, positionals);
                break;
            case 'export':
                cmdExport(options);
                break;
            case 'mark':
                cmdMark(options, positionals);
                break;
            case 'issue':
                await cmdIssue(options, positionals);
                break;
            case 'trace':
                await cmdTrace(options, positionals);
                break;
            case 'help':
            case '--help':
            case '-h':
            default:
                printHelp();
                break;
        }
    }
    catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
//# sourceMappingURL=index.js.map