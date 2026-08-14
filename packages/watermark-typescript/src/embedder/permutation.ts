import crypto from 'node:crypto';

/**
 * Derives a deterministic permutation of size N using HMAC-DRBG (conceptually).
 * We implement a simple HKDF-based or Hash-DRBG for the PRNG, seeded by the issuance key
 * and the specific artifact digest to ensure each artifact has a unique permutation.
 */
export class PermutationPRNG {
  private state: Buffer;
  private counter: number = 0;

  constructor(issuanceKey: string | Buffer, artifactContext: string) {
    // Initial seed is HMAC(issuanceKey, artifactContext)
    const hmac = crypto.createHmac('sha256', issuanceKey);
    hmac.update(artifactContext);
    this.state = hmac.digest();
  }

  /**
   * Returns a deterministic 32-bit unsigned integer.
   */
  nextUint32(): number {
    if (this.counter % 8 === 0) {
      // Re-seed state every 8 words (32 bytes)
      const hmac = crypto.createHmac('sha256', this.state);
      hmac.update(Buffer.from([this.counter]));
      this.state = hmac.digest();
    }
    
    const offset = (this.counter % 8) * 4;
    this.counter++;
    return this.state.readUInt32LE(offset);
  }

  /**
   * Generates a random permutation of indices [0...n-1]
   */
  generatePermutation(n: number): number[] {
    const arr = Array.from({ length: n }, (_, i) => i);
    
    // Fisher-Yates shuffle using our deterministic PRNG
    for (let i = n - 1; i > 0; i--) {
      // Generate a random index j such that 0 <= j <= i
      const j = this.nextUint32() % (i + 1);
      
      // Swap
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    
    return arr;
  }
}
