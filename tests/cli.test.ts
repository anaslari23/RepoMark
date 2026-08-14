import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { cmdExport, cmdInit, cmdInspect, cmdSeal, cmdVerify } from '../packages/cli/dist/index.js';

console.log('=== Running RepoMark CLI Integration Tests ===\n');

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

const testWorkspace = path.resolve('tmp-test-cli-workspace');

function setupWorkspace() {
  if (fs.existsSync(testWorkspace)) {
    fs.rmSync(testWorkspace, { recursive: true, force: true });
  }
  fs.mkdirSync(testWorkspace, { recursive: true });
  fs.mkdirSync(path.join(testWorkspace, 'src'), { recursive: true });

  fs.writeFileSync(path.join(testWorkspace, 'src', 'index.ts'), 'export const VERSION = "1.0.0";\n');
  fs.writeFileSync(path.join(testWorkspace, 'package.json'), '{"name": "test-pkg", "version": "1.0.0"}\n');
}

function cleanupWorkspace() {
  if (fs.existsSync(testWorkspace)) {
    fs.rmSync(testWorkspace, { recursive: true, force: true });
  }
}

// 1. Test CLI Init with --gen-key
runTest('CLI repomark init --gen-key', () => {
  setupWorkspace();
  const origCwd = process.cwd();
  try {
    process.chdir(testWorkspace);
    cmdInit({ 'gen-key': true });

    assert.ok(fs.existsSync('.repomark/policy.json'), 'policy.json was not created');
    assert.ok(fs.existsSync('.repomark/trust.json'), 'trust.json was not created');
    assert.ok(fs.existsSync('.repomark/private.key.pem'), 'private.key.pem was not created');
    assert.ok(fs.existsSync('.repomark/public.key.pem'), 'public.key.pem was not created');
  } finally {
    process.chdir(origCwd);
  }
});

// 2. Test CLI Seal
runTest('CLI repomark seal', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(testWorkspace);
    cmdSeal({
      claim: 'verified-origin',
      'issuer-name': 'Test Author',
      org: 'Test Org'
    });

    assert.ok(fs.existsSync('.repomark/statement.json'), 'statement.json was not created');
    assert.ok(fs.existsSync('.repomark/envelope.json'), 'envelope.json was not created');
    assert.ok(fs.existsSync('.repomark/files.json'), 'files.json was not created');

    const statement = JSON.parse(fs.readFileSync('.repomark/statement.json', 'utf8'));
    assert.strictEqual(statement.predicate.claimKind, 'verified-origin');
    assert.strictEqual(statement.predicate.issuer.name, 'Test Author');
    assert.strictEqual(statement.predicate.issuer.organization, 'Test Org');
    assert.strictEqual(statement.predicate.manifest.filesCount, 2);
  } finally {
    process.chdir(origCwd);
  }
});

// 3. Test CLI Verify (Exact)
runTest('CLI repomark verify (Exact)', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(testWorkspace);
    const result = cmdVerify({ json: true }, []);
    assert.strictEqual(result.state, 'verified-exact');
    assert.strictEqual(result.signer.trusted, true);
    assert.strictEqual(result.signer.signatureValid, true);
  } finally {
    process.chdir(origCwd);
  }
});

// 4. Test CLI Export (Deterministic ZIP)
runTest('CLI repomark export (Deterministic ZIP)', () => {
  const origCwd = process.cwd();
  try {
    process.chdir(testWorkspace);
    const out1 = cmdExport({ out: 'repomark-source-1.zip' });
    const out2 = cmdExport({ out: 'repomark-source-2.zip' });

    const buf1 = fs.readFileSync(out1);
    const buf2 = fs.readFileSync(out2);

    assert.strictEqual(buf1.equals(buf2), true, 'Bit-for-bit ZIP determinism failed!');

    // Verify ZIP archive directly using repomark verify
    const verifyZip = cmdVerify({ json: true, target: 'repomark-source-1.zip' }, []);
    assert.strictEqual(verifyZip.state, 'verified-exact', 'ZIP archive verification failed');
  } finally {
    process.chdir(origCwd);
    cleanupWorkspace();
  }
});

console.log('\nAll CLI Integration tests passed successfully!\n');
