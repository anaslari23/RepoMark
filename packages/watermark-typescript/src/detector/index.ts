import { Project, Node } from 'ts-morph';
import { registry } from '../embedder/index.js';
import { PayloadCoder } from '../embedder/payload.js';
import { PermutationPRNG } from '../embedder/permutation.js';

export interface DetectorOptions {
  projectPath: string; // path to tsconfig.json
  issuanceKey: Buffer;
  artifactContext: string;
}

export interface DetectionResult {
  confidence: number;
  payloadFrame: Buffer | null;
  abstainReason?: string;
}

export async function detectWatermark(options: DetectorOptions): Promise<DetectionResult> {
  const project = new Project({ tsConfigFilePath: options.projectPath });
  const checker = project.getTypeChecker();
  
  // 1. Gather all eligible sites across all files
  const eligibleSites: { node: Node; ruleId: string }[] = [];
  const rules = registry.getRules();

  for (const sourceFile of project.getSourceFiles()) {
    sourceFile.forEachDescendant(node => {
      for (const rule of rules) {
        if (rule.isEligible(node, checker)) {
          eligibleSites.push({ node, ruleId: rule.id });
          break;
        }
      }
    });
  }

  const totalBitsNeeded = 63 * 8; // 504 bits
  if (eligibleSites.length < totalBitsNeeded) {
    return {
      confidence: 0,
      payloadFrame: null,
      abstainReason: `Insufficient eligible sites. Found ${eligibleSites.length}, need ${totalBitsNeeded}.`
    };
  }

  // 2. Map via PRNG
  const prng = new PermutationPRNG(options.issuanceKey, options.artifactContext);
  const permutedIndices = prng.generatePermutation(eligibleSites.length);
  const targetIndices = permutedIndices.slice(0, totalBitsNeeded);

  // 3. Read bits and accumulate votes
  // Since some sites may have been modified or deleted by attackers, we'll try to read what we can.
  // We'll construct a 63-byte Uint8Array.
  const encodedBytes = new Uint8Array(63);
  let bitMatchCount = 0;
  let invalidBitCount = 0;

  for (let bitIndex = 0; bitIndex < totalBitsNeeded; bitIndex++) {
    const siteIndex = targetIndices[bitIndex];
    const site = eligibleSites[siteIndex];
    
    const rule = rules.find(r => r.id === site.ruleId)!;
    const variant = rule.detectVariant(site.node);
    
    if (variant === -1) {
      invalidBitCount++;
      continue;
    }

    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    
    if (variant === 1) {
      encodedBytes[byteIndex] |= (1 << bitOffset);
    }
    bitMatchCount++;
  }

  const errorRate = invalidBitCount / totalBitsNeeded;
  if (errorRate > 0.4) {
    return {
      confidence: 1 - errorRate,
      payloadFrame: null,
      abstainReason: `Bit error rate too high (${(errorRate * 100).toFixed(2)}%)`
    };
  }

  // 4. RS Decode
  const coder = new PayloadCoder();
  let decodedFrame: Buffer | null = null;
  try {
    decodedFrame = coder.decode(encodedBytes);
  } catch (err) {
    return {
      confidence: 1 - errorRate,
      payloadFrame: null,
      abstainReason: 'Reed-Solomon decoding failed'
    };
  }

  return {
    confidence: 1 - errorRate,
    payloadFrame: decodedFrame
  };
}
