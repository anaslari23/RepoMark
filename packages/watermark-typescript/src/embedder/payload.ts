import crypto from 'node:crypto';
import { ReedSolomon } from '@bnb-chain/reed-solomon';

export interface WatermarkPayload {
  copyId: string; // 32 hex chars (16 bytes)
  version: number; // 16-bit uint (2 bytes)
  // MAC is computed automatically (8 bytes)
  // Total 26 bytes. Padded to 32 bytes for RS.
}

/**
 * Builds the 32-byte frame.
 */
export function buildPayloadFrame(payload: WatermarkPayload, macKey: Buffer): Buffer {
  const frame = Buffer.alloc(32, 0); // 32 bytes frame

  // 1. Write copyId (16 bytes)
  const copyIdBuf = Buffer.from(payload.copyId, 'hex');
  if (copyIdBuf.length !== 16) {
    throw new Error('copyId must be exactly 16 bytes (32 hex chars)');
  }
  copyIdBuf.copy(frame, 0);

  // 2. Write version (2 bytes)
  frame.writeUInt16LE(payload.version, 16);

  // 3. Compute MAC over the first 18 bytes
  const hmac = crypto.createHmac('sha256', macKey);
  hmac.update(frame.subarray(0, 18));
  const fullMac = hmac.digest();
  
  // 4. Write MAC (8 bytes)
  fullMac.copy(frame, 18, 0, 8);

  // Remaining 6 bytes are left as padding (0)
  return frame;
}

/**
 * Extracts and verifies the 32-byte frame.
 */
export function verifyPayloadFrame(frame: Buffer, macKey: Buffer): WatermarkPayload | null {
  if (frame.length !== 32) return null;

  const copyIdBuf = frame.subarray(0, 16);
  const version = frame.readUInt16LE(16);
  const providedMac = frame.subarray(18, 26);

  const hmac = crypto.createHmac('sha256', macKey);
  hmac.update(frame.subarray(0, 18));
  const expectedMac = hmac.digest().subarray(0, 8);

  if (!crypto.timingSafeEqual(providedMac, expectedMac)) {
    return null; // MAC mismatch
  }

  return {
    copyId: copyIdBuf.toString('hex'),
    version
  };
}

export class PayloadCoder {
  /**
   * Mock encoder for RS(63, 32) over GF(2^8)
   * Encodes a 32-byte frame into 63 symbols (bytes)
   */
  encode(frame: Buffer): Uint8Array {
    if (frame.length !== 32) throw new Error('Frame must be 32 bytes');
    
    const out = new Uint8Array(63);
    frame.copy(out, 0);
    
    // Simulate parity generation
    for (let i = 32; i < 63; i++) {
      out[i] = frame[i % 32] ^ 0xff; // Dummy parity
    }
    
    return out;
  }

  /**
   * Mock decoder for RS(63, 32)
   */
  decode(shards: Uint8Array): Buffer {
    if (shards.length !== 63) throw new Error('Expected 63 shards');
    
    const frame = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      frame[i] = shards[i];
    }
    return frame;
  }
}

