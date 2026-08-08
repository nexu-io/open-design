/**
 * Generates the stand-in xDesign brand icons for all three packaging platforms:
 *   - xdesign/brand/icon.icns  (macOS)
 *   - xdesign/brand/icon.ico   (Windows, PNG-in-ICO)
 *   - xdesign/brand/icon.png   (Linux, 512×512)
 *
 * These are PLACEHOLDERS — a flat indigo tile with a white "X" mark, clearly
 * distinct from the upstream Open Design icon so the brand-injection mechanism
 * is visually verifiable end to end. When the real xDesign logo is available,
 * drop replacements at the same paths directly and delete this generator;
 * nothing else needs to change.
 *
 *   node --experimental-strip-types xdesign/scripts/generate-placeholder-icon.ts
 *
 * The macOS .icns requires macOS `iconutil` (ships with the OS); the .ico and
 * .png are pure Node and generate on any platform.
 */
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outIcns = join(repoRoot, "xdesign", "brand", "icon.icns");
const outIco = join(repoRoot, "xdesign", "brand", "icon.ico");
const outPng = join(repoRoot, "xdesign", "brand", "icon.png");
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

// Linux: a single 512×512 PNG is all the AppImage/desktop install needs.
await rm(outPng, { force: true });
await writeFile(outPng, encodeIcon(512));
console.log(`wrote ${outPng}`);

// Windows: a one-entry .ico wrapping a 256×256 PNG. Vista+ and electron-builder
// both accept PNG-compressed ICO entries, so no BMP/DIB encoding is needed.
// ICO layout: 6-byte header + 16-byte directory entry, then the PNG at offset 22.
const icoPng = encodeIcon(256);
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type = icon
icoHeader.writeUInt16LE(1, 4); // 1 image
const icoDir = Buffer.alloc(16);
icoDir[0] = 0; // width 256 (0 == 256)
icoDir[1] = 0; // height 256
icoDir[2] = 0; // color count (0 for >8-bit)
icoDir[3] = 0; // reserved
icoDir.writeUInt16LE(1, 4); // color planes
icoDir.writeUInt16LE(32, 6); // bits per pixel
icoDir.writeUInt32LE(icoPng.length, 8); // image size
icoDir.writeUInt32LE(22, 12); // image offset (6 + 16)
await rm(outIco, { force: true });
await writeFile(outIco, Buffer.concat([icoHeader, icoDir, icoPng]));
console.log(`wrote ${outIco}`);

await rm(outIcns, { force: true });
execFileSync("iconutil", ["-c", "icns", iconset, "-o", outIcns]);
console.log(`wrote ${outIcns}`);
