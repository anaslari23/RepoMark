import { Project } from 'ts-morph';
import { SafetyRegistry } from './registry.js';
import { BooleanInversionRule } from './transforms/boolean-inversion.js';
import { ArrayIterationRule } from './transforms/array-iteration.js';
import { PayloadCoder } from './payload.js';
import { PermutationPRNG } from './permutation.js';
export const registry = new SafetyRegistry();
registry.register(BooleanInversionRule);
registry.register(ArrayIterationRule);
export async function embedWatermark(options) {
    const project = new Project({ tsConfigFilePath: options.projectPath });
    const checker = project.getTypeChecker();
    // 1. Gather all eligible sites across all files
    const eligibleSites = [];
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
    // 2. Encode payload using RS
    const coder = new PayloadCoder();
    const encodedBytes = coder.encode(options.payloadFrame);
    // 3. Derive PRNG and permute the sites
    const prng = new PermutationPRNG(options.issuanceKey, options.artifactContext);
    const totalBitsNeeded = encodedBytes.length * 8; // 63 * 8 = 504 bits
    if (eligibleSites.length < totalBitsNeeded) {
        throw new Error(`Not enough eligible sites for embedding. Need ${totalBitsNeeded}, found ${eligibleSites.length}`);
    }
    // We take the first `totalBitsNeeded` from the permuted indices
    const permutedIndices = prng.generatePermutation(eligibleSites.length);
    const targetIndices = permutedIndices.slice(0, totalBitsNeeded);
    // 4. Apply transformations
    for (let bitIndex = 0; bitIndex < totalBitsNeeded; bitIndex++) {
        const siteIndex = targetIndices[bitIndex];
        const site = eligibleSites[siteIndex];
        const byteIndex = Math.floor(bitIndex / 8);
        const bitOffset = bitIndex % 8;
        const bitValue = (encodedBytes[byteIndex] >> bitOffset) & 1;
        const rule = rules.find(r => r.id === site.ruleId);
        if (bitValue === 0) {
            rule.applyVariant0(site.node);
        }
        else {
            rule.applyVariant1(site.node);
        }
    }
    // 5. Verify semantic correctness by ensuring it still type checks
    const diagnostics = project.getPreEmitDiagnostics();
    if (diagnostics.length > 0) {
        throw new Error(`Embedding caused semantic regressions. Found ${diagnostics.length} diagnostic errors.`);
    }
    // 6. Save modifications
    await project.save();
}
//# sourceMappingURL=index.js.map