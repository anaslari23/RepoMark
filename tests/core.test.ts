import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalizeJSON,
  computeLeafDigest,
  computeParentDigest,
  getEmptyMerkleRoot,
  hashBytes,
  normalizePath,
  parseStrictJSON,
  validateCanonicalPaths,
  verifyMerkleProof
} from '../packages/core/dist/index.js';

console.log('=== Running RepoMark Core Unit & Property Tests ===\n');

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

// 1. Golden Hashing Vectors
runTest('Golden Hashing & Path Normalization Vectors', () => {
  const golden = JSON.parse(fs.readFileSync('test-vectors/hashing.golden.json', 'utf8'));

  for (const h of golden.hashing) {
    const computed = hashBytes(Buffer.from(h.inputUtf8, 'utf8'), h.algorithm);
    assert.strictEqual(computed, h.expectedDigest, `Hash mismatch for input "${h.inputUtf8}"`);
  }

  for (const p of golden.pathNormalization) {
    if (p.shouldThrow) {
      assert.throws(() => normalizePath(p.raw), `Expected normalizePath('${p.raw}') to throw`);
    } else {
      const normalized = normalizePath(p.raw);
      assert.strictEqual(normalized, p.expected, `Path normalization mismatch for ${p.raw}`);
    }
  }
});

// 2. Raw Byte Security Digest Invariance
runTest('Raw Byte Security Digest Invariance (CRLF vs LF)', () => {
  const crlf = Buffer.from('export const a = 1;\r\nexport const b = 2;\r\n', 'utf8');
  const lf = Buffer.from('export const a = 1;\nexport const b = 2;\n', 'utf8');

  const digestCrlf = hashBytes(crlf, 'sha256');
  const digestLf = hashBytes(lf, 'sha256');

  // Security Invariant: Raw digests MUST differ
  assert.notStrictEqual(digestCrlf, digestLf, 'Security violation: CRLF and LF must have distinct raw security digests');
});

// 3. Duplicate Path Rejection
runTest('Duplicate Path Rejection in Canonical Sets', () => {
  assert.throws(() => {
    validateCanonicalPaths(['src/index.ts', './src/index.ts']);
  }, /Duplicate file path detected/);

  assert.throws(() => {
    validateCanonicalPaths(['src/a.ts', 'src\\a.ts']);
  }, /Duplicate file path detected/);

  const valid = validateCanonicalPaths(['src/a.ts', 'src/b.ts', 'package.json']);
  assert.strictEqual(valid.length, 3);
});

// 4. Golden Canonicalization (RFC 8785 JCS)
runTest('Golden Canonicalization Vectors (RFC 8785 JCS)', () => {
  const golden = JSON.parse(fs.readFileSync('test-vectors/canonicalize.golden.json', 'utf8'));

  for (const v of golden.vectors) {
    const c14n = canonicalizeJSON(v.input);
    assert.strictEqual(c14n, v.expected, `JCS canonicalization mismatch`);
  }

  for (const sj of golden.strictJsonVectors) {
    if (sj.shouldReject) {
      assert.throws(() => parseStrictJSON(sj.json), /Strict JSON rejection: duplicate object key/);
    } else {
      const parsed = parseStrictJSON(sj.json);
      assert.ok(parsed);
    }
  }
});

// 5. Golden Merkle Tree Vectors & Proof Verification
runTest('Golden Merkle Tree Vectors (repomark-merkle-v1)', () => {
  const golden = JSON.parse(fs.readFileSync('test-vectors/merkle.golden.json', 'utf8'));

  assert.strictEqual(getEmptyMerkleRoot(), golden.emptyRoot);

  // Single file proof verification
  const singleProof = golden.singleFile.proof;
  const singleValid = verifyMerkleProof(singleProof, golden.singleFile.rootDigest);
  assert.strictEqual(singleValid, true, 'Single file Merkle proof verification failed');

  // Two files proofs verification
  assert.strictEqual(verifyMerkleProof(golden.twoFiles.proofA, golden.twoFiles.rootDigest), true);
  assert.strictEqual(verifyMerkleProof(golden.twoFiles.proofB, golden.twoFiles.rootDigest), true);

  // Three files (odd node promotion) proofs verification
  for (const [, proof] of Object.entries(golden.threeFilesOdd.proofs)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = verifyMerkleProof(proof as any, golden.threeFilesOdd.rootDigest);
    assert.strictEqual(valid, true, `Proof verification failed for odd-node Merkle tree`);
  }
});

console.log('\nAll Core unit and property tests passed successfully!\n');
