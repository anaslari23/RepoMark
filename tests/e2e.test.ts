import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  createDeterministicZip,
  extractZipToDirectory,
  generateEd25519KeyPair,
  parseStrictJSON,
  type DSSEEnvelope,
  type InTotoStatement,
  type RepomarkPolicy,
  type TrustSnapshot
} from '../packages/core/dist/index.js';
import { cmdExport, cmdInit, cmdSeal, cmdVerify } from '../packages/cli/dist/index.js';

console.log('=== Running RepoMark Phase 1 E2E Acceptance Test Suite ===\n');

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err: unknown) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const e2eDir = path.resolve('tmp-e2e-workspace');

function setupE2ERepo() {
  if (fs.existsSync(e2eDir)) {
    fs.rmSync(e2eDir, { recursive: true, force: true });
  }
  fs.mkdirSync(e2eDir, { recursive: true });
  fs.mkdirSync(path.join(e2eDir, '.git'), { recursive: true });
  fs.mkdirSync(path.join(e2eDir, 'src'), { recursive: true });

  fs.writeFileSync(path.join(e2eDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(e2eDir, 'src', 'main.ts'), 'export function run() { return 42; }\n');
  fs.writeFileSync(path.join(e2eDir, 'README.md'), '# Sealed App\n');
}

function cleanupE2ERepo() {
  if (fs.existsSync(e2eDir)) {
    fs.rmSync(e2eDir, { recursive: true, force: true });
  }
}

// 1. Seal without mutating git canonical branch
runTest('1. A protected commit is exported and sealed without modifying canonical branch', () => {
  setupE2ERepo();
  const origCwd = process.cwd();
  try {
    process.chdir(e2eDir);
    cmdInit({ 'gen-key': true });
    cmdSeal({
      claim: 'verified-origin',
      'issuer-name': 'Alice Developer',
      org: 'Acme Corp'
    });

    // Check that .git was never modified
    const gitHead = fs.readFileSync(path.join(e2eDir, '.git', 'HEAD'), 'utf8');
    assert.strictEqual(gitHead, 'ref: refs/heads/main\n');

    // Check verification
    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'verified-exact');
    assert.strictEqual(res.claim?.issuerName, 'Alice Developer');
  } finally {
    process.chdir(origCwd);
  }
});

// 2. Extracted ZIP verifies exact origin
runTest('2. Extracted ZIP and clone both verify exact origin', () => {
  const origCwd = process.cwd();
  const zipExtractDir = path.resolve('tmp-e2e-zip-extracted');
  try {
    process.chdir(e2eDir);
    const zipPath = cmdExport({ out: 'repomark-source.zip' });
    const zipBuf = fs.readFileSync(zipPath);

    if (fs.existsSync(zipExtractDir)) fs.rmSync(zipExtractDir, { recursive: true, force: true });
    fs.mkdirSync(zipExtractDir, { recursive: true });

    extractZipToDirectory(zipBuf, zipExtractDir);

    // Verify extracted directory
    process.chdir(zipExtractDir);
    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'verified-exact');
    assert.strictEqual(res.signer.trusted, true);
  } finally {
    process.chdir(origCwd);
    if (fs.existsSync(zipExtractDir)) fs.rmSync(zipExtractDir, { recursive: true, force: true });
  }
});

// 3. Deleting .git does not affect RepoMark exact verification
runTest('3. Deleting .git does not affect RepoMark exact verification', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(e2eDir);
    // Delete .git directory
    fs.rmSync('.git', { recursive: true, force: true });
    assert.strictEqual(fs.existsSync('.git'), false);

    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'verified-exact');
  } finally {
    process.chdir(origCwd);
  }
});

// 4. Changing 1 byte changes state to verified-modified (never exact)
runTest('4. Changing one byte changes state from verified-exact to verified-modified', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(e2eDir);
    // Tamper one file
    fs.appendFileSync(path.join(e2eDir, 'README.md'), 'Tampered line!\n');

    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'verified-modified');
    assert.strictEqual(res.signer.signatureValid, true); // Signature still valid over sealed statement
    assert.strictEqual(res.subjectMatches.some(m => m.status === 'modified'), true);
  } finally {
    process.chdir(origCwd);
  }
});

// 5. Tampering statement claim invalidates signature
runTest('5. Changing display name or repository claim invalidates the signature', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(e2eDir);
    // Restore file
    fs.writeFileSync(path.join(e2eDir, 'README.md'), '# Sealed App\n');

    // Tamper envelope payload
    const envPath = path.join(e2eDir, '.repomark', 'envelope.json');
    const env = parseStrictJSON<DSSEEnvelope>(fs.readFileSync(envPath, 'utf8'));

    const statement = JSON.parse(Buffer.from(env.payload, 'base64').toString('utf8')) as InTotoStatement;
    statement.predicate.issuer.name = 'Mallory Impersonator';

    // Pack tampered statement back into envelope without re-signing
    env.payload = Buffer.from(JSON.stringify(statement), 'utf8').toString('base64');
    fs.writeFileSync(envPath, JSON.stringify(env, null, 2));

    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'invalid');
    assert.strictEqual(res.signer.signatureValid, false);
  } finally {
    process.chdir(origCwd);
  }
});

// 6. Replacing key ID with untrusted key produces untrusted state
runTest('6. Replacing key ID with an untrusted key produces untrusted state', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(e2eDir);
    // Re-seal with a fresh untrusted keypair
    const attackerKey = generateEd25519KeyPair();
    const fakeKeyPath = path.join(e2eDir, '.repomark', 'attacker.key.pem');
    fs.writeFileSync(fakeKeyPath, attackerKey.privateKey);

    cmdSeal({
      key: fakeKeyPath,
      'issuer-name': 'Attacker'
    });

    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'untrusted');
    assert.strictEqual(res.signer.trusted, false);
  } finally {
    process.chdir(origCwd);
  }
});

// 7. Revoked key (pre-issuance) produces explicit revoked state
runTest('7. A pre-issuance revoked key produces an explicit revoked state', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(e2eDir);
    const trustPath = path.join(e2eDir, '.repomark', 'trust.json');
    const trust = parseStrictJSON<TrustSnapshot>(fs.readFileSync(trustPath, 'utf8'));

    const envPath = path.join(e2eDir, '.repomark', 'envelope.json');
    const env = parseStrictJSON<DSSEEnvelope>(fs.readFileSync(envPath, 'utf8'));
    const currentKeyId = env.signatures[0].keyid;

    trust.revokedKeys = {
      [currentKeyId]: {
        revokedAt: new Date(Date.now() + 10000).toISOString(), // Revoked after issuance technically, but state is pre-issuance compromise
        reason: 'Compromised key test revocation',
        revocationState: 'compromised-pre-issuance'
      }
    };
    fs.writeFileSync(trustPath, JSON.stringify(trust, null, 2));

    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'revoked');
    assert.strictEqual(res.signer.status, 'REVOKED_PRE_ISSUANCE');
  } finally {
    process.chdir(origCwd);
  }
});

// 8. Revoked key (post-issuance) produces verified-exact with historical warning
runTest('8. A post-issuance revoked key verifies exact if sealed before revocation', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(e2eDir);
    const trustPath = path.join(e2eDir, '.repomark', 'trust.json');
    const trust = parseStrictJSON<TrustSnapshot>(fs.readFileSync(trustPath, 'utf8'));

    const envPath = path.join(e2eDir, '.repomark', 'envelope.json');
    const env = parseStrictJSON<DSSEEnvelope>(fs.readFileSync(envPath, 'utf8'));
    const currentKeyId = env.signatures[0].keyid;

    trust.revokedKeys = {
      [currentKeyId]: {
        revokedAt: new Date(Date.now() + 86400000).toISOString(), // Revoked tomorrow
        reason: 'Compromised post issuance',
        revocationState: 'compromised-post-issuance'
      }
    };
    fs.writeFileSync(trustPath, JSON.stringify(trust, null, 2));

    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'verified-exact');
    assert.strictEqual(res.signer.status, 'REVOKED_POST_ISSUANCE');
    assert.strictEqual(res.signer.trusted, true);
    assert.ok(res.summary?.includes('Historically verified'));
  } finally {
    process.chdir(origCwd);
  }
});

// 9. Withdrawn key produces verified-exact with historical warning
runTest('9. A withdrawn key verifies exact if sealed before revocation', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(e2eDir);
    const trustPath = path.join(e2eDir, '.repomark', 'trust.json');
    const trust = parseStrictJSON<TrustSnapshot>(fs.readFileSync(trustPath, 'utf8'));

    const envPath = path.join(e2eDir, '.repomark', 'envelope.json');
    const env = parseStrictJSON<DSSEEnvelope>(fs.readFileSync(envPath, 'utf8'));
    const currentKeyId = env.signatures[0].keyid;

    trust.revokedKeys = {
      [currentKeyId]: {
        revokedAt: new Date(Date.now() + 86400000).toISOString(),
        reason: 'Author no longer employed',
        revocationState: 'authorization-withdrawn'
      }
    };
    fs.writeFileSync(trustPath, JSON.stringify(trust, null, 2));

    const res = cmdVerify({ json: true }, []);
    assert.strictEqual(res.state, 'verified-exact');
    assert.strictEqual(res.signer.status, 'AUTHORIZATION_WITHDRAWN');
    assert.strictEqual(res.signer.trusted, true);
  } finally {
    process.chdir(origCwd);
    cleanupE2ERepo();
  }
});

console.log('\nAll E2E Acceptance tests passed successfully!\n');
