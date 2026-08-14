import type { FileDigestEntry, MerkleInclusionProof } from './types.js';
/**
 * Computes deterministic empty fileset root digest for repomark-merkle-v1.
 */
export declare function getEmptyMerkleRoot(): string;
/**
 * Computes a domain-separated leaf hash for a single file entry.
 * Leaf = SHA-256( 0x00 || utf8(canonicalPath) || 0x00 || rawDigestBytes )
 */
export declare function computeLeafDigest(canonicalPath: string, rawDigestHex: string): string;
/**
 * Computes a domain-separated interior parent hash from left and right child digests.
 * Parent = SHA-256( 0x01 || leftDigestBytes || rightDigestBytes )
 */
export declare function computeParentDigest(leftHex: string, rightHex: string): string;
export interface MerkleTreeResult {
    rootDigest: string;
    leaves: {
        path: string;
        rawDigest: string;
        leafDigest: string;
    }[];
    getProof: (path: string) => MerkleInclusionProof;
}
/**
 * Builds a deterministic repomark-merkle-v1 Merkle tree from file entries.
 */
export declare function buildMerkleTree(entries: FileDigestEntry[]): MerkleTreeResult;
/**
 * Verifies a Merkle inclusion proof against a target file path, raw digest, and expected root.
 */
export declare function verifyMerkleProof(proof: MerkleInclusionProof, expectedRoot: string): boolean;
//# sourceMappingURL=merkle.d.ts.map