/**
 * Generates the stand-in xDesign macOS app icon at xdesign/brand/icon.icns.
 *
 * This is a PLACEHOLDER — a flat indigo tile with a white "X" mark, clearly
 * distinct from the upstream Open Design icon so the brand-injection mechanism
 * is visually verifiable end to end. When the real xDesign logo is available,
 * drop a replacement icon.icns at xdesign/brand/icon.icns directly and delete
 * this generator; nothing else needs to change.
 *
 *   node --experimental-strip-types xdesign/scripts/generate-placeholder-icon.ts
 *
 * Requires macOS `iconutil` (ships with the OS).
 */
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outIcon = join(repoRoot, "xdesign", "brand", "icon.icns");
const iconset = join(repoRoot, ".tmp", "xdesign-icon.iconset");

const BG: readonly [number, number, number] = [99, 102, 241]; // indigo-500
const FG: readonly [number, number, number] = [255, 255, 255]; // white X

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode an `size`×`size` 8-bit RGB PNG: indigo tile with a centered white X. */
function encodeIcon(size: number): Buffer {
  const pad = Math.max(1, Math.round(size * 0.18));
  const band = Math.max(1, Math.round(size * 0.14));
  const rowLen = size * 3;
  const stride = 1 + rowLen;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // PNG row filter: none
    for (let x = 0; x < size; x += 1) {
      const inFrame = x >= pad && x < size - pad && y >= pad && y < size - pad;
      const lx = x - pad;
      const ly = y - pad;
      const s = size - pad * 2;
      const onDiag = Math.abs(lx - ly) < band;
      const onAntiDiag = Math.abs(lx - (s - 1 - ly)) < band;
      const color = inFrame && (onDiag || onAntiDiag) ? FG : BG;
      const off = y * stride + 1 + x * 3;
      raw[off] = color[0];
      raw[off + 1] = color[1];
      raw[off + 2] = color[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const entries: Record<string, number> = {
  icon_16x16: 16,
  "icon_16x16@2x": 32,
  icon_32x32: 32,
  "icon_32x32@2x": 64,
  icon_128x128: 128,
  "icon_128x128@2x": 256,
  icon_256x256: 256,
  "icon_256x256@2x": 512,
  icon_512x512: 512,
  "icon_512x512@2x": 1024,
};

await rm(iconset, { recursive: true, force: true });
await mkdir(iconset, { recursive: true });

for (const [name, size] of Object.entries(entries)) {
  await writeFile(join(iconset, `${name}.png`), encodeIcon(size));
}

await rm(outIcon, { force: true });
execFileSync("iconutil", ["-c", "icns", iconset, "-o", outIcon]);
console.log(`wrote ${outIcon}`);
