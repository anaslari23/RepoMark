import test from 'node:test';
import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { extractCapsule, buildAndEmbedCapsule, stripCapsule, computeMarkerlessDigest } from './capsule.js';
test('extractCapsule: rejects capsules that are not the first comment', () => {
    const invalidCapsule = Buffer.from('// Some random comment\n/* @repomark-capsule-v1\neyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c\n*/\nconsole.log("hello");', 'utf8');
    assert.throws(() => extractCapsule(invalidCapsule), /must be the first comment/);
});
test('extractCapsule: allows shebang before capsule', () => {
    const payload = {
        issuerId: 'test-issuer',
        keyId: 'test-key',
        claimKind: 'verified-origin',
        repositoryRoot: 'origin',
        originalPath: 'test.ts',
        markerlessSha256: 'deadbeef',
        copyId: null,
        issuedAt: '2023-01-01T00:00:00Z'
    };
    const fileBytes = Buffer.from('#!/usr/bin/env node\nconsole.log("hello");', 'utf8');
    const dummySignFn = () => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const newBytes = buildAndEmbedCapsule(fileBytes, payload, dummySignFn);
    const cap = extractCapsule(newBytes);
    assert.ok(cap);
    assert.strictEqual(cap.payload.issuerId, 'test-issuer');
});
test('extractCapsule: parses valid capsule', () => {
    const payload = {
        issuerId: 'test-issuer',
        keyId: 'test-key',
        claimKind: 'verified-origin',
        repositoryRoot: 'origin',
        originalPath: 'test.ts',
        markerlessSha256: 'deadbeef',
        copyId: null,
        issuedAt: '2023-01-01T00:00:00Z'
    };
    const fileBytes = Buffer.from('console.log("hello");', 'utf8');
    const dummySignFn = () => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const newBytes = buildAndEmbedCapsule(fileBytes, payload, dummySignFn);
    const cap = extractCapsule(newBytes);
    assert.ok(cap);
    assert.strictEqual(cap.payload.issuerId, 'test-issuer');
});
test('stripCapsule: completely removes capsule and restores original bytes', () => {
    const payload = {
        issuerId: 'test-issuer',
        keyId: 'test-key',
        claimKind: 'verified-origin',
        repositoryRoot: 'origin',
        originalPath: 'test.ts',
        markerlessSha256: 'deadbeef',
        copyId: null,
        issuedAt: '2023-01-01T00:00:00Z'
    };
    const originalContent = 'console.log("hello");\nlet x = 5;';
    const fileBytes = Buffer.from(originalContent, 'utf8');
    const dummySignFn = () => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const embedded = buildAndEmbedCapsule(fileBytes, payload, dummySignFn);
    const stripped = stripCapsule(embedded);
    assert.strictEqual(stripped.toString('utf8'), originalContent);
});
test('stripCapsule: completely removes capsule with shebang', () => {
    const payload = {
        issuerId: 'test-issuer',
        keyId: 'test-key',
        claimKind: 'verified-origin',
        repositoryRoot: 'origin',
        originalPath: 'test.ts',
        markerlessSha256: 'deadbeef',
        copyId: null,
        issuedAt: '2023-01-01T00:00:00Z'
    };
    const originalContent = '#!/bin/bash\necho "hello";\nexit 0;';
    const fileBytes = Buffer.from(originalContent, 'utf8');
    const dummySignFn = () => '0123456789abcdef';
    const embedded = buildAndEmbedCapsule(fileBytes, payload, dummySignFn);
    const stripped = stripCapsule(embedded);
    assert.strictEqual(stripped.toString('utf8'), originalContent);
});
test('computeMarkerlessDigest: stable against embeddings', () => {
    const payload = {
        issuerId: 'test-issuer',
        keyId: 'test-key',
        claimKind: 'verified-origin',
        repositoryRoot: 'origin',
        originalPath: 'test.ts',
        markerlessSha256: 'placeholder',
        copyId: null,
        issuedAt: '2023-01-01T00:00:00Z'
    };
    const originalContent = Buffer.from('const a = 1;', 'utf8');
    const digest1 = computeMarkerlessDigest(originalContent);
    const embedded = buildAndEmbedCapsule(originalContent, payload, () => '0123456789abcdef');
    const digest2 = computeMarkerlessDigest(embedded);
    assert.strictEqual(digest1, digest2);
});
test('extractCapsule: rejects invalid JWT format', () => {
    const invalidCapsule = Buffer.from('/* @repomark-capsule-v1\ninvalid format\n*/\nconsole.log("hello");', 'utf8');
    assert.throws(() => extractCapsule(invalidCapsule), /invalid payload\/signature format/);
});
test('extractCapsule: rejects multiple capsules', () => {
    const multipleCapsules = Buffer.from('/* @repomark-capsule-v1\na.b\n*/\n/* @repomark-capsule-v1\nc.d\n*/\nconsole.log("hello");', 'utf8');
    assert.throws(() => extractCapsule(multipleCapsules), /multiple blocks detected/);
});
//# sourceMappingURL=capsule.test.js.map