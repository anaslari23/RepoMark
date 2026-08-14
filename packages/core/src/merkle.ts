import crypto from 'node:crypto';
import { normalizePath } from './hashing.js';
import type {
  FileDigestEntry,
  MerkleInclusionProof,
  MerkleProofStep
} from './types.js';

const DOMAIN_LEAF = 0x00;
const DOMAIN_INTERIOR = 0x01;
const DOMAIN_EMPTY = 0x02;

/**
 * Computes deterministic empty fileset root digest for repomark-merkle-v1.
 */
export function getEmptyMerkleRoot(): string {
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from([DOMAIN_EMPTY]));
  hash.update(Buffer.from('repomark-empty-fileset-v1', 'utf8'));
  return hash.digest('hex');
}

/**
 * Computes a domain-separated leaf hash for a single file entry.
 * Leaf = SHA-256( 0x00 || utf8(canonicalPath) || 0x00 || rawDigestBytes )
 */
export function computeLeafDigest(canonicalPath: string, rawDigestHex: string): string {
  const normalized = normalizePath(canonicalPath);
  const digestBuffer = Buffer.from(rawDigestHex, 'hex');
  if (digestBuffer.length !== 32 && digestBuffer.length !== 64) {
    throw new Error(`Invalid raw digest length: ${rawDigestHex.length} hex chars`);
  }

  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from([DOMAIN_LEAF]));
  hash.update(Buffer.from(normalized, 'utf8'));
  hash.update(Buffer.from([0x00]));
  hash.update(digestBuffer);
  return hash.digest('hex');
}

/**
 * Computes a domain-separated interior parent hash from left and right child digests.
 * Parent = SHA-256( 0x01 || leftDigestBytes || rightDigestBytes )
 */
export function computeParentDigest(leftHex: string, rightHex: string): string {
  const leftBuf = Buffer.from(leftHex, 'hex');
  const rightBuf = Buffer.from(rightHex, 'hex');

  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from([DOMAIN_INTERIOR]));
  hash.update(leftBuf);
  hash.update(rightBuf);
  return hash.digest('hex');
}

export interface MerkleTreeResult {
  rootDigest: string;
  leaves: { path: string; rawDigest: string; leafDigest: string }[];
  getProof: (path: string) => MerkleInclusionProof;
}

/**
 * Builds a deterministic repomark-merkle-v1 Merkle tree from file entries.
 */
export function buildMerkleTree(entries: FileDigestEntry[]): MerkleTreeResult {
  if (!entries || entries.length === 0) {
    const emptyRoot = getEmptyMerkleRoot();
    return {
      rootDigest: emptyRoot,
      leaves: [],
      getProof: (targetPath: string) => {
        throw new Error(`Cannot generate proof for ${targetPath} in empty file set.`);
      }
    };
  }

  // 1. Sort entries canonically by path
  const sorted = [...entries].map(e => ({
    ...e,
    path: normalizePath(e.path)
  }));

  // Detect duplicates
  const seen = new Set<string>();
  for (const e of sorted) {
    if (seen.has(e.path)) {
      throw new Error(`Duplicate file path in Merkle tree construction: ${e.path}`);
    }
    seen.add(e.path);
  }

  sorted.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // 2. Compute leaf digests
  const leaves = sorted.map(e => ({
    path: e.path,
    rawDigest: e.rawDigest,
    leafDigest: computeLeafDigest(e.path, e.rawDigest)
  }));

  // 3. Build tree levels
  const levels: string[][] = [leaves.map(l => l.leafDigest)];

  while (levels[levels.length - 1].length > 1) {
    const currentLevel = levels[levels.length - 1];
    const nextLevel: string[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // Pair of nodes
        nextLevel.push(computeParentDigest(currentLevel[i], currentLevel[i + 1]));
      } else {
        // Odd unpaired node: promote directly to next level
        nextLevel.push(currentLevel[i]);
      }
    }

    levels.push(nextLevel);
  }

  const rootDigest = levels[levels.length - 1][0];

  // 4. Proof generator function
  const getProof = (targetPath: string): MerkleInclusionProof => {
    const norm = normalizePath(targetPath);
    const leafIndex = leaves.findIndex(l => l.path === norm);
    if (leafIndex === -1) {
      throw new Error(`File path not found in Merkle tree: ${targetPath}`);
    }

    const targetLeaf = leaves[leafIndex];
    const proofSteps: MerkleProofStep[] = [];
    let currentIndex = leafIndex;

    for (let levelIdx = 0; levelIdx < levels.length - 1; levelIdx++) {
      const currentLevel = levels[levelIdx];
      const isRightChild = currentIndex % 2 === 1;
      const siblingIndex = isRightChild ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < currentLevel.length) {
        proofSteps.push({
          position: isRightChild ? 'left' : 'right',
          digest: currentLevel[siblingIndex]
        });
      }
      // If no sibling (odd node at end), it was promoted, so no step added for this level.

      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      algorithm: 'repomark-merkle-v1',
      rootDigest,
      leafIndex,
      totalLeaves: leaves.length,
      path: norm,
      leafDigest: targetLeaf.leafDigest,
      proof: proofSteps
    };
  };

  return {
    rootDigest,
    leaves,
    getProof
  };
}

/**
 * Verifies a Merkle inclusion proof against a target file path, raw digest, and expected root.
 */
export function verifyMerkleProof(
  proof: MerkleInclusionProof,
  expectedRoot: string
): boolean {
  if (proof.algorithm !== 'repomark-merkle-v1') {
    return false;
  }

  let current = proof.leafDigest;

  for (const step of proof.proof) {
    if (step.position === 'left') {
      current = computeParentDigest(step.digest, current);
    } else if (step.position === 'right') {
      current = computeParentDigest(current, step.digest);
    } else {
      return false;
    }
  }

  return current.toLowerCase() === expectedRoot.toLowerCase();
}
