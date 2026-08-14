import crypto from 'node:crypto';
import { embedWatermark } from '../embedder/index.js';
import { detectWatermark } from '../detector/index.js';
export async function runAttackSimulation(projectPath) {
    console.log(`[Experimental Runner] Starting structural watermark simulation on ${projectPath}`);
    const issuanceKey = crypto.randomBytes(32);
    const macKey = crypto.randomBytes(32);
    const artifactContext = 'experimental-run-v1';
    // 1. Clean Corpus detection (False Positive rate)
    console.log('[Experimental Runner] Detecting on clean corpus...');
    const fpResult = await detectWatermark({ projectPath, issuanceKey, artifactContext });
    console.log(`[Experimental Runner] Clean corpus detection: ${fpResult.abstainReason || 'False Positive!'}`);
    // 2. Embed
    console.log('[Experimental Runner] Embedding watermark...');
    // We'll stub a 32-byte frame
    const payloadFrame = crypto.randomBytes(32);
    await embedWatermark({
        projectPath,
        issuanceKey,
        artifactContext,
        payloadFrame
    });
    console.log('[Experimental Runner] Watermark successfully embedded. Passed compiler gate.');
    // 3. True Positive Rate (no attack)
    console.log('[Experimental Runner] Detecting on embedded corpus (no attack)...');
    const tpResult = await detectWatermark({ projectPath, issuanceKey, artifactContext });
    if (tpResult.payloadFrame && tpResult.payloadFrame.equals(payloadFrame)) {
        console.log(`[Experimental Runner] Detection SUCCESS! Confidence: ${tpResult.confidence}`);
    }
    else {
        console.log(`[Experimental Runner] Detection FAILED. ${tpResult.abstainReason}`);
    }
    // Next steps for researchers: 
    // - Simulate Prettier re-formatting.
    // - Simulate renaming of identifiers.
    // - Simulate 30% AST deletion.
    // - Re-run detection and aggregate Bit Error Rate.
}
//# sourceMappingURL=runner.js.map