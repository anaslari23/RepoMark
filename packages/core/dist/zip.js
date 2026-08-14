import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { normalizePath } from './hashing.js';
/**
 * Deterministic ZIP Creator.
 * Guarantees bit-for-bit identical ZIP output across different OS platforms for identical inputs.
 */
export function createDeterministicZip(entries) {
    // 1. Sort entries canonically by normalized path
    const sorted = [...entries].map(e => ({
        path: normalizePath(e.path),
        data: Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data),
        isExecutable: !!e.isExecutable
    }));
    sorted.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;
    // Fixed DOS timestamp: 1980-01-01 00:00:00
    const dosTime = 0x0000;
    const dosDate = 0x0021; // (1980 - 1980) << 9 | 1 << 5 | 1
    for (const entry of sorted) {
        const filenameBuf = Buffer.from(entry.path, 'utf8');
        const uncompressedSize = entry.data.length;
        const crc = zlib.crc32(entry.data);
        // Compress using DEFLATE with fixed level 6
        const compressedData = zlib.deflateRawSync(entry.data, { level: 6 });
        // Use compressed if smaller, else store (0)
        let compressionMethod = 8; // Deflate
        let finalData = compressedData;
        if (compressedData.length >= uncompressedSize) {
            compressionMethod = 0; // Store
            finalData = Buffer.from(entry.data);
        }
        const compressedSize = finalData.length;
        // Local Header (30 bytes + filename)
        const localHeader = Buffer.alloc(30 + filenameBuf.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
        localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
        localHeader.writeUInt16LE(0x0800, 6); // General purpose bit flag (Bit 11: UTF-8)
        localHeader.writeUInt16LE(compressionMethod, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(compressedSize, 18);
        localHeader.writeUInt32LE(uncompressedSize, 22);
        localHeader.writeUInt16LE(filenameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28); // Extra field length
        filenameBuf.copy(localHeader, 30);
        const localEntryOffset = offset;
        const localEntryChunk = Buffer.concat([localHeader, finalData]);
        localHeaders.push(localEntryChunk);
        offset += localEntryChunk.length;
        // Central Directory Header (46 bytes + filename)
        const centralHeader = Buffer.alloc(46 + filenameBuf.length);
        centralHeader.writeUInt32LE(0x02014b50, 0); // Central file header signature
        centralHeader.writeUInt16LE(0x0314, 4); // Version made by (UNIX 3.0, PKZIP 2.0)
        centralHeader.writeUInt16LE(20, 6); // Version needed to extract
        centralHeader.writeUInt16LE(0x0800, 8); // Bit flag (UTF-8)
        centralHeader.writeUInt16LE(compressionMethod, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(compressedSize, 20);
        centralHeader.writeUInt32LE(uncompressedSize, 24);
        centralHeader.writeUInt16LE(filenameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30); // Extra field length
        centralHeader.writeUInt16LE(0, 32); // File comment length
        centralHeader.writeUInt16LE(0, 34); // Disk number start
        centralHeader.writeUInt16LE(0, 36); // Internal file attributes
        // External file attributes: Unix permissions (0o100644 or 0o100755) << 16
        const unixMode = entry.isExecutable ? 0o100755 : 0o100644;
        centralHeader.writeUInt32LE((unixMode << 16) >>> 0, 38);
        centralHeader.writeUInt32LE(localEntryOffset, 42); // Relative offset of local header
        filenameBuf.copy(centralHeader, 46);
        centralHeaders.push(centralHeader);
    }
    const centralDirOffset = offset;
    const centralDirBuffer = Buffer.concat(centralHeaders);
    const centralDirSize = centralDirBuffer.length;
    // End of Central Directory Record (EOCD - 22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4); // Disk number
    eocd.writeUInt16LE(0, 6); // Central dir start disk
    eocd.writeUInt16LE(sorted.length, 8); // Number of central dir records on this disk
    eocd.writeUInt16LE(sorted.length, 10); // Total number of central dir records
    eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
    eocd.writeUInt32LE(centralDirOffset, 16); // Offset of central directory
    eocd.writeUInt16LE(0, 20); // ZIP comment length
    return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}
/**
 * Extracts all files from a ZIP buffer into memory.
 */
export function extractZipEntries(zipBuffer) {
    const entries = [];
    // Find EOCD from end of buffer
    let eocdOffset = -1;
    for (let i = zipBuffer.length - 22; i >= 0; i--) {
        if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset === -1) {
        throw new Error('Invalid ZIP archive: End of Central Directory record not found.');
    }
    const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
    const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
    let cdPos = centralDirOffset;
    for (let i = 0; i < totalEntries; i++) {
        if (zipBuffer.readUInt32LE(cdPos) !== 0x02014b50) {
            throw new Error(`Corrupted central directory header at offset ${cdPos}`);
        }
        const compressionMethod = zipBuffer.readUInt16LE(cdPos + 10);
        const uncompressedSize = zipBuffer.readUInt32LE(cdPos + 24);
        const filenameLen = zipBuffer.readUInt16LE(cdPos + 28);
        const extraLen = zipBuffer.readUInt16LE(cdPos + 30);
        const commentLen = zipBuffer.readUInt16LE(cdPos + 32);
        const localOffset = zipBuffer.readUInt32LE(cdPos + 42);
        const filename = zipBuffer.toString('utf8', cdPos + 46, cdPos + 46 + filenameLen);
        cdPos += 46 + filenameLen + extraLen + commentLen;
        // Read local file header
        if (zipBuffer.readUInt32LE(localOffset) !== 0x04034b50) {
            throw new Error(`Corrupted local header at offset ${localOffset}`);
        }
        const localFilenameLen = zipBuffer.readUInt16LE(localOffset + 26);
        const localExtraLen = zipBuffer.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + localFilenameLen + localExtraLen;
        const compressedSize = zipBuffer.readUInt32LE(localOffset + 18);
        const rawData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);
        let decompressed;
        if (compressionMethod === 0) {
            decompressed = Buffer.from(rawData);
        }
        else if (compressionMethod === 8) {
            decompressed = zlib.inflateRawSync(rawData);
        }
        else {
            throw new Error(`Unsupported compression method ${compressionMethod} in ZIP archive`);
        }
        if (decompressed.length !== uncompressedSize) {
            throw new Error(`Uncompressed size mismatch for ${filename}: expected ${uncompressedSize}, got ${decompressed.length}`);
        }
        entries.push({
            path: normalizePath(filename),
            data: decompressed
        });
    }
    return entries;
}
/**
 * Extracts a ZIP buffer into a target directory.
 */
export function extractZipToDirectory(zipBuffer, targetDir) {
    const entries = extractZipEntries(zipBuffer);
    for (const ent of entries) {
        const fullPath = path.join(targetDir, ent.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, ent.data);
    }
}
//# sourceMappingURL=zip.js.map