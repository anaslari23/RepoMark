export interface DetectorOptions {
    projectPath: string;
    issuanceKey: Buffer;
    artifactContext: string;
}
export interface DetectionResult {
    confidence: number;
    payloadFrame: Buffer | null;
    abstainReason?: string;
}
export declare function detectWatermark(options: DetectorOptions): Promise<DetectionResult>;
//# sourceMappingURL=index.d.ts.map