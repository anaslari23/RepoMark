import crypto from 'node:crypto';
import type { SignatureAlgorithm } from './types.js';

export interface Signer {
  readonly keyId: string;
  readonly algorithm: SignatureAlgorithm;
  readonly publicKey: string; // Base64 or SPKI PEM
  sign(payload: Uint8Array | Buffer): Promise<string> | string; // Returns hex or base64 signature
}

export interface Verifier {
  verify(
    payload: Uint8Array | Buffer,
    signature: string,
    publicKey: string,
    algorithm: SignatureAlgorithm
  ): boolean;
}

export interface KeyPairResult {
  keyId: string;
  publicKey: string; // Base64 raw or SPKI
  privateKey: string; // PKCS8 PEM or Base64
  publicKeyPem: string;
  algorithm: SignatureAlgorithm;
}

/**
 * Generates an Ed25519 keypair and deterministic keyId fingerprint.
 */
export function generateEd25519KeyPair(): KeyPairResult {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Calculate keyId as SHA-256 fingerprint over DER-encoded SPKI public key
  const der = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const rawBytes = der.subarray(der.length - 32); // Last 32 bytes of Ed25519 SPKI is the raw public key
  const keyId = `ed25519:${crypto.createHash('sha256').update(der).digest('hex')}`;
  const base64Pub = rawBytes.toString('base64');

  return {
    keyId,
    publicKey: base64Pub,
    privateKey,
    publicKeyPem: publicKey,
    algorithm: 'ed25519'
  };
}

/**
 * In-memory Ed25519 Signer implementation.
 */
export class Ed25519Signer implements Signer {
  readonly keyId: string;
  readonly algorithm: SignatureAlgorithm = 'ed25519';
  readonly publicKey: string;
  private readonly privateKeyObject: crypto.KeyObject;

  constructor(privateKeyPemOrDer: string | Buffer, explicitKeyId?: string) {
    if (typeof privateKeyPemOrDer === 'string' && privateKeyPemOrDer.includes('PRIVATE KEY')) {
      this.privateKeyObject = crypto.createPrivateKey(privateKeyPemOrDer);
    } else {
      this.privateKeyObject = crypto.createPrivateKey({
        key: typeof privateKeyPemOrDer === 'string' ? Buffer.from(privateKeyPemOrDer, 'base64') : privateKeyPemOrDer,
        format: 'der',
        type: 'pkcs8'
      });
    }

    const pubKeyObject = crypto.createPublicKey(this.privateKeyObject);
    const spkiDer = pubKeyObject.export({ type: 'spki', format: 'der' });
    const rawBytes = spkiDer.subarray(spkiDer.length - 32);

    this.publicKey = rawBytes.toString('base64');
    this.keyId = explicitKeyId || `ed25519:${crypto.createHash('sha256').update(spkiDer).digest('hex')}`;
  }

  sign(payload: Uint8Array | Buffer): string {
    const signature = crypto.sign(null, payload, this.privateKeyObject);
    return signature.toString('hex');
  }
}

/**
 * Standard Ed25519 / crypto Verifier implementation.
 */
export class NodeCryptoVerifier implements Verifier {
  verify(
    payload: Uint8Array | Buffer,
    signatureHexOrBase64: string,
    publicKeyPemOrBase64: string,
    algorithm: SignatureAlgorithm
  ): boolean {
    if (algorithm !== 'ed25519') {
      // Fail closed on unsupported algorithms
      return false;
    }

    try {
      let keyObject: crypto.KeyObject;

      if (publicKeyPemOrBase64.includes('PUBLIC KEY')) {
        keyObject = crypto.createPublicKey(publicKeyPemOrBase64);
      } else {
        // Raw 32-byte Ed25519 public key (or base64 der)
        const rawBuf = Buffer.from(publicKeyPemOrBase64, 'base64');
        if (rawBuf.length === 32) {
          // Wrap into standard 44-byte Ed25519 SPKI DER prefix: 302a300506032b6570032100 + raw32
          const prefix = Buffer.from('302a300506032b6570032100', 'hex');
          const spki = Buffer.concat([prefix, rawBuf]);
          keyObject = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
        } else {
          keyObject = crypto.createPublicKey({ key: rawBuf, format: 'der', type: 'spki' });
        }
      }

      let sigBuffer: Buffer;
      if (/^[0-9a-fA-F]+$/.test(signatureHexOrBase64) && signatureHexOrBase64.length % 2 === 0) {
        sigBuffer = Buffer.from(signatureHexOrBase64, 'hex');
      } else {
        sigBuffer = Buffer.from(signatureHexOrBase64, 'base64');
      }

      return crypto.verify(null, payload, keyObject, sigBuffer);
    } catch {
      return false;
    }
  }
}

export const defaultVerifier = new NodeCryptoVerifier();
