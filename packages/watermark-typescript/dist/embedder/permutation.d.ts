/**
 * Derives a deterministic permutation of size N using HMAC-DRBG (conceptually).
 * We implement a simple HKDF-based or Hash-DRBG for the PRNG, seeded by the issuance key
 * and the specific artifact digest to ensure each artifact has a unique permutation.
 */
export declare class PermutationPRNG {
    private state;
    private counter;
    constructor(issuanceKey: string | Buffer, artifactContext: string);
    /**
     * Returns a deterministic 32-bit unsigned integer.
     */
    nextUint32(): number;
    /**
     * Generates a random permutation of indices [0...n-1]
     */
    generatePermutation(n: number): number[];
}
//# sourceMappingURL=permutation.d.ts.map