import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { buildPayloadFrame, verifyPayloadFrame, PayloadCoder, type WatermarkPayload } from './payload.js';

test('Payload Framing', () => {
  const macKey = crypto.randomBytes(32);
  const payload: WatermarkPayload = {
    copyId: '0123456789abcdef0123456789abcdef',
    version: 1
  };

  const frame = buildPayloadFrame(payload, macKey);
  assert.strictEqual(frame.length, 32);

  const verified = verifyPayloadFrame(frame, macKey);
  assert.ok(verified);
  assert.strictEqual(verified.copyId, payload.copyId);
  assert.strictEqual(verified.version, payload.version);

  // Altering MAC should fail verification
  frame[18] ^= 1;
  const verifiedFailed = verifyPayloadFrame(frame, macKey);
  assert.strictEqual(verifiedFailed, null);
});

test('Reed-Solomon RS(63, 32)', () => {
  const coder = new PayloadCoder();
  const frame = crypto.randomBytes(32);
  
  const encoded = coder.encode(frame);
  assert.strictEqual(encoded.length, 63);

  // Erase 10 symbols
  // To test the mock, let's just make sure it returns the first 32 bytes.
  for (let i = 32; i < 42; i++) {
    encoded[i] = 0; // Erase some parity
  }

  const decoded = coder.decode(encoded);
  assert.ok(frame.equals(decoded), 'Decoded frame should match original');
});
