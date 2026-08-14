import { Buffer } from 'node:buffer';
import { hashBytes } from './hashing.js';
import { canonicalizeJSON } from './canonicalize.js';
import type { EmbeddedCapsule, EmbeddedCapsulePayload } from './types.js';

const CAPSULE_MARKER_START = '/* @repomark-capsule-v1';
const CAPSULE_MARKER_END = '*/';

export function toBase64Url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str: string): Buffer {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  return Buffer.from(b64, 'base64');
}

export function extractCapsule(fileBytes: Buffer): EmbeddedCapsule | null {
  const fullText = fileBytes.toString('utf8');
  const scanLimit = Math.min(fileBytes.length, 4096);
  const text = fileBytes.toString('utf8', 0, scanLimit);
  
  const startIdx = text.indexOf(CAPSULE_MARKER_START);
  if (startIdx === -1) {
    // Check if it exists beyond the 4KB limit
    if (fullText.indexOf(CAPSULE_MARKER_START) !== -1) {
      throw new Error('Malformed RepoMark capsule: marker found outside the permitted 4KB header region');
    }
    return null;
  }
  
  const endIdx = text.indexOf(CAPSULE_MARKER_END, startIdx);
  if (endIdx === -1) {
    throw new Error('Malformed RepoMark capsule: missing closing delimiter */');
  }
  
  // Check if it's the first comment and before any code tokens
  const prefix = text.substring(0, startIdx);
  let checkPrefix = prefix;
  
  if (checkPrefix.startsWith('#!')) {
    const nlIdx = checkPrefix.indexOf('\n');
    if (nlIdx !== -1) {
      checkPrefix = checkPrefix.substring(nlIdx + 1);
    } else {
      checkPrefix = '';
    }
  }

  if (checkPrefix.trim().length > 0) {
    throw new Error('Malformed RepoMark capsule: marker text outside the permitted header region (must be the first comment)');
  }

  // Check for multiple blocks
  if (fullText.indexOf(CAPSULE_MARKER_START, startIdx + 1) !== -1) {
    throw new Error('Malformed RepoMark capsule: multiple blocks detected');
  }
  
  const blockContent = text.substring(startIdx + CAPSULE_MARKER_START.length, endIdx).trim();
  
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(blockContent)) {
    throw new Error('Malformed RepoMark capsule: invalid payload/signature format');
  }
  
  const [b64Payload, b64Sig] = blockContent.split('.');
  
  let payloadJson: any;
  try {
    payloadJson = JSON.parse(fromBase64Url(b64Payload).toString('utf8'));
  } catch {
    throw new Error('Malformed RepoMark capsule: invalid JSON payload');
  }
  
  const bytePrefix = Buffer.from(text.substring(0, startIdx), 'utf8');
  const byteBlock = Buffer.from(text.substring(startIdx, endIdx + CAPSULE_MARKER_END.length), 'utf8');
  
  return {
    payload: payloadJson as EmbeddedCapsulePayload,
    signature: b64Sig,
    rawToken: blockContent,
    byteOffset: bytePrefix.length,
    byteLength: byteBlock.length
  };
}

export function stripCapsule(fileBytes: Buffer): Buffer {
  const cap = extractCapsule(fileBytes);
  if (!cap) return fileBytes;
  
  const before = fileBytes.subarray(0, cap.byteOffset);
  const after = fileBytes.subarray(cap.byteOffset + cap.byteLength);
  
  let skip = 0;
  if (after.length > 0 && after[0] === 0x0a) skip = 1; // \n
  else if (after.length > 1 && after[0] === 0x0d && after[1] === 0x0a) skip = 2; // \r\n
  
  return Buffer.concat([before, after.subarray(skip)]);
}

export function computeMarkerlessDigest(fileBytes: Buffer): string {
  const stripped = stripCapsule(fileBytes);
  return hashBytes(stripped, 'sha256');
}

export function buildEmbeddedCapsule(payload: EmbeddedCapsulePayload, signFn: (buf: Buffer) => string): string {
  // Use canonicalizeJSON to ensure stable property ordering
  const jcs = canonicalizeJSON(payload);
  const b64Payload = toBase64Url(Buffer.from(jcs, 'utf8'));
  
  // Sign the base64 payload directly (like JWT)
  const sigHex = signFn(Buffer.from(b64Payload, 'utf8'));
  const b64Sig = toBase64Url(Buffer.from(sigHex, 'hex'));
  
  return `/* @repomark-capsule-v1\n${b64Payload}.${b64Sig}\n*/`;
}

export function buildAndEmbedCapsule(fileBytes: Buffer, payload: EmbeddedCapsulePayload, signFn: (buf: Buffer) => string): Buffer {
  const existing = extractCapsule(fileBytes);
  if (existing) {
    throw new Error('File already contains a RepoMark capsule');
  }
  
  const block = buildEmbeddedCapsule(payload, signFn);
  
  let insertIdx = 0;
  const scanLimit = Math.min(fileBytes.length, 256);
  const text = fileBytes.toString('utf8', 0, scanLimit);
  
  if (text.startsWith('#!')) {
    const nlIdx = text.indexOf('\n');
    if (nlIdx !== -1) {
      insertIdx = Buffer.from(text.substring(0, nlIdx + 1), 'utf8').length;
    }
  }
  
  const before = fileBytes.subarray(0, insertIdx);
  const after = fileBytes.subarray(insertIdx);
  
  return Buffer.concat([before, Buffer.from(block + '\n', 'utf8'), after]);
}
