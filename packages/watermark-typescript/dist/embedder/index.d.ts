import { SafetyRegistry } from './registry.js';
export declare const registry: SafetyRegistry;
export interface EmbedderOptions {
    projectPath: string;
    issuanceKey: Buffer;
    artifactContext: string;
    payloadFrame: Buffer;
}
export declare function embedWatermark(options: EmbedderOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map