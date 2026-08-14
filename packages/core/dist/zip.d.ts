export interface ZipEntryInput {
    path: string;
    data: Buffer | Uint8Array;
    isExecutable?: boolean;
}
export interface ExtractedZipEntry {
    path: string;
    data: Buffer;
}
/**
 * Deterministic ZIP Creator.
 * Guarantees bit-for-bit identical ZIP output across different OS platforms for identical inputs.
 */
export declare function createDeterministicZip(entries: ZipEntryInput[]): Buffer;
/**
 * Extracts all files from a ZIP buffer into memory.
 */
export declare function extractZipEntries(zipBuffer: Buffer): ExtractedZipEntry[];
/**
 * Extracts a ZIP buffer into a target directory.
 */
export declare function extractZipToDirectory(zipBuffer: Buffer, targetDir: string): void;
//# sourceMappingURL=zip.d.ts.map