import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as rpc from 'vscode-jsonrpc/node';
import { sealDirectory, defaultVerifier } from '@repomark/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../dist/server.js');
const fixtureRoot = path.resolve(__dirname, 'fixture');

async function setupFixture() {
  if (fs.existsSync(fixtureRoot)) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(fixtureRoot, { recursive: true });

  const testFile = path.join(fixtureRoot, 'index.ts');
  fs.writeFileSync(testFile, 'console.log("hello LSP");\n', 'utf8');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  
  const signer = {
    keyId: 'test-key-id',
    sign: (payload: Buffer) => crypto.sign(null, payload, privateKey).toString('base64'),
    trusted: true,
    algorithm: 'ed25519' as const,
    publicKey: pubKeyDer.toString('base64')
  };

  const policy = {
    version: 'v1' as const,
    trustedIssuers: [{ id: 'test-issuer', publicKey: pubKeyDer.toString('base64') }],
    algorithms: { 
      hash: 'sha256' as const, 
      signature: 'ed25519' as const,
      tree: 'repomark-merkle-v1' as const,
      canonicalization: 'repomark-c14n-v1' as const
    },
    exclusions: [],
    cleanExportOnly: false
  };

  const { statement, envelope } = sealDirectory(
    fixtureRoot,
    { issuerId: 'test-issuer', issuerName: 'Test Issuer' },
    policy,
    signer
  );

  const repomarkDir = path.join(fixtureRoot, '.repomark');
  fs.mkdirSync(repomarkDir);
  fs.writeFileSync(path.join(repomarkDir, 'statement.json'), JSON.stringify(statement, null, 2));
  fs.writeFileSync(path.join(repomarkDir, 'envelope.json'), JSON.stringify(envelope, null, 2));
  fs.writeFileSync(path.join(repomarkDir, 'policy.json'), JSON.stringify(policy, null, 2));
  
  // Create a trust snapshot
  const trustSnapshot = {
    version: '1.0',
    snapshotAt: new Date().toISOString(),
    trustedKeys: {
      'test-key-id': {
        status: 'trusted',
        trustedAt: new Date().toISOString()
      }
    }
  };
  fs.writeFileSync(path.join(repomarkDir, 'trust.json'), JSON.stringify(trustSnapshot, null, 2));

  return testFile;
}

async function main() {
  const testFile = await setupFixture();

  const childProcess = spawn('node', [serverPath, '--stdio'], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const connection = rpc.createMessageConnection(
    new rpc.StreamMessageReader(childProcess.stdout),
    new rpc.StreamMessageWriter(childProcess.stdin)
  );

  connection.listen();

  connection.onRequest('client/registerCapability', () => {
    return {};
  });

  connection.onNotification('window/logMessage', (params: any) => {
    console.log(`[Server Log] ${params.message}`);
  });
  
  // 1. Initialize
  await connection.sendRequest('initialize', {
    processId: process.pid,
    rootUri: `file://${fixtureRoot}`,
    capabilities: {}
  });

  await connection.sendNotification('initialized', {});

  // 2. Open document
  const testFileUri = `file://${testFile}`;
  const text = fs.readFileSync(testFile, 'utf8');
  
  let diagnosticsPromise = new Promise((resolve) => {
    connection.onNotification('textDocument/publishDiagnostics', (params: any) => {
      console.log('[Client] Received diagnostics:', params);
      resolve(params);
    });
  });

  await connection.sendNotification('textDocument/didOpen', {
    textDocument: {
      uri: testFileUri,
      languageId: 'typescript',
      version: 1,
      text: text
    }
  });

  // Give server time to process didOpen
  await new Promise(r => setTimeout(r, 500));

  // 3. Request CodeLens
  const codeLenses: any = await connection.sendRequest('textDocument/codeLens', {
    textDocument: { uri: testFileUri }
  });
  console.log('[Client] Received CodeLens:', JSON.stringify(codeLenses, null, 2));

  // Assertions for CodeLens
  if (!codeLenses || codeLenses.length === 0) {
    throw new Error('CodeLens failed: no lenses returned');
  }
  if (!codeLenses[0].command.title.includes('Verified')) {
    throw new Error(`CodeLens failed: expected Verified title, got ${codeLenses[0].command.title}`);
  }

  // 4. Request Hover
  const hover: any = await connection.sendRequest('textDocument/hover', {
    textDocument: { uri: testFileUri },
    position: { line: 0, character: 0 }
  });
  console.log('[Client] Received Hover:', JSON.stringify(hover, null, 2));

  // Assertions for Hover
  if (!hover || !hover.contents || !hover.contents.value.includes('VERIFIED EXACT')) {
    throw new Error('Hover failed: missing expected content');
  }

  console.log('[Client] Success! All assertions passed.');
  
  connection.dispose();
  childProcess.kill();
}

main().catch(console.error);
