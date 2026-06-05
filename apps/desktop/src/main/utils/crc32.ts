/**
 * crc32.ts — Standard CRC-32 implementation for PNG chunk generation.
 *
 * Matches the implementation in apps/web/src/runtime/zip.ts.
 * Kept as a private module within tray to avoid external dependency.
 */

// CRC32 lookup table (pre-computed)
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

/**
 * Compute CRC-32 checksum over a buffer.
 * Used by PNG chunk encoding (createPngChunk).
 */
export function crc32(buf: Buffer | Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}