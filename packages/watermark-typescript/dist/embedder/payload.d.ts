export interface WatermarkPayload {
    copyId: string;
    version: number;
}
/**
 * Builds the 32-byte frame.
 */
export declare function buildPayloadFrame(payload: WatermarkPayload, macKey: Buffer): Buffer;
/**
 * Extracts and verifies the 32-byte frame.
 */
export declare function verifyPayloadFrame(frame: Buffer, macKey: Buffer): WatermarkPayload | null;
export declare class PayloadCoder {
    /**
     * Mock encoder for RS(63, 32) over GF(2^8)
     * Encodes a 32-byte frame into 63 symbols (bytes)
     */
    encode(frame: Buffer): Uint8Array;
    /**
     * Mock decoder for RS(63, 32)
     */
    decode(shards: Uint8Array): Buffer;
}
//# sourceMappingURL=payload.d.ts.map