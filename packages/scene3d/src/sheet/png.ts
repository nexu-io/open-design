import * as zlib from "node:zlib";

/**
 * A minimal, dependency-free PNG decoder.
 *
 * The 2D asset class — sprite sheets, flipbooks, skybox faces, particles —
 * needs the same treatment as the 3D one: measured facts, then deterministic
 * rules over those facts. Measuring means reading pixels, and reading pixels
 * through Blender would make every 2D check require a DCC install and a
 * process spawn to answer questions about a file format.
 *
 * So the pixels are decoded here instead. PNG is a chunked container around
 * a zlib stream of filtered scanlines, and Node ships the inflate. What is
 * left is chunk walking, unfiltering, and expanding whatever bit depth and
 * colour type the file used into straight RGBA8. That makes 2D linting
 * instant, CI-safe on any machine, and free of a native dependency that
 * would rot.
 *
 * Interlaced (Adam7) images are rejected rather than mis-decoded: silently
 * returning a scrambled buffer would produce confident, wrong lint results.
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** Straight (non-premultiplied) RGBA8, row-major, 4 bytes per pixel. */
  data: Uint8Array;
}

export class PngDecodeError extends Error {}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodePng(buffer: Uint8Array): DecodedImage {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (buffer[i] !== SIGNATURE[i]) throw new PngDecodeError("not a PNG file");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  // A PNG must end with IEND. A file cut short — a partial download, a
  // truncated write — otherwise decoded to a garbage image: the chunk loop
  // simply broke out on the short chunk and inflate happened to succeed on the
  // IDAT collected so far, so measureSheet returned a confident-but-wrong
  // verdict instead of SHEET_UNREADABLE. Track truncation and IEND explicitly.
  let sawIend = false;
  let truncated = false;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  while (offset + 8 <= buffer.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      buffer[offset + 4]!, buffer[offset + 5]!, buffer[offset + 6]!, buffer[offset + 7]!,
    );
    const start = offset + 8;
    if (start + length > buffer.length) {
      truncated = true;
      break;
    }

    if (type === "IHDR") {
      width = view.getUint32(start);
      height = view.getUint32(start + 4);
      depth = buffer[start + 8]!;
      colorType = buffer[start + 9]!;
      interlace = buffer[start + 12]!;
    } else if (type === "PLTE") {
      palette = buffer.subarray(start, start + length);
    } else if (type === "tRNS") {
      transparency = buffer.subarray(start, start + length);
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(start, start + length));
    } else if (type === "IEND") {
      sawIend = true;
      break;
    }
    offset = start + length + 4; // skip the CRC
  }

  if (truncated || !sawIend) {
    throw new PngDecodeError("PNG is truncated — no IEND chunk");
  }
  if (width <= 0 || height <= 0) throw new PngDecodeError("PNG has no valid IHDR");
  if (interlace !== 0) throw new PngDecodeError("interlaced PNG is not supported");
  if (idat.length === 0) throw new PngDecodeError("PNG has no image data");

  const channels = CHANNELS[colorType];
  if (channels === undefined) throw new PngDecodeError(`unsupported colour type ${colorType}`);
  if (![1, 2, 4, 8, 16].includes(depth)) throw new PngDecodeError(`unsupported bit depth ${depth}`);

  // A corrupt IDAT makes zlib throw its own `Z_DATA_ERROR` ("incorrect data
  // check"), and a malformed size can throw out of unfilter/toRgba. Wrap them
  // so decodePng's contract holds — it throws PngDecodeError or succeeds, never
  // a leaked internal error — which keeps SHEET_UNREADABLE the single outcome
  // for any unreadable sheet (found by fuzzing).
  try {
    const raw = zlib.inflateSync(Buffer.concat(idat.map((chunk) => Buffer.from(chunk))));
    const bitsPerPixel = channels * depth;
    const bytesPerPixel = Math.max(1, bitsPerPixel >> 3);
    const bytesPerRow = Math.ceil((bitsPerPixel * width) / 8);

    const unfiltered = unfilter(raw, height, bytesPerRow, bytesPerPixel);
    return {
      width,
      height,
      data: toRgba(unfiltered, width, height, bytesPerRow, depth, colorType, palette, transparency),
    };
  } catch (err) {
    if (err instanceof PngDecodeError) throw err;
    throw new PngDecodeError(`PNG image data could not be decoded: ${(err as Error).message}`);
  }
}

const CHANNELS: Record<number, number | undefined> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Encode straight RGBA8 back to PNG.
 *
 * Exists so the sheet fixture corpus can be *generated* rather than
 * committed as opaque binaries. A poisoned sheet whose defect is described
 * in code — "this flipbook's third cell is blank", "these two beam edges
 * differ by one channel" — is reviewable and reproducible; the same defect
 * baked into a committed PNG is a blob nobody can audit. Filter 0 and a
 * fixed deflate level keep output byte-stable across runs.
 */
export function encodePng(image: DecodedImage): Uint8Array {
  const { width, height, data } = image;
  const bytesPerRow = width * 4;
  const raw = Buffer.alloc(height * (bytesPerRow + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (bytesPerRow + 1)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * bytesPerRow, bytesPerRow).copy(
      raw,
      y * (bytesPerRow + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return new Uint8Array(
    Buffer.concat([
      Buffer.from(SIGNATURE),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

let CRC_TABLE: Uint32Array | null = null;
function crc32(bytes: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Reverse the per-scanline filters. Each row is prefixed with its filter
 * type and predicts from the pixel to the left and the row above, so this
 * has to run in order and in place.
 */
function unfilter(
  raw: Buffer,
  height: number,
  bytesPerRow: number,
  bytesPerPixel: number,
): Uint8Array {
  const out = new Uint8Array(height * bytesPerRow);
  let at = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++];
    if (filter === undefined) throw new PngDecodeError("PNG data ended early");
    const row = y * bytesPerRow;
    const prior = row - bytesPerRow;
    for (let x = 0; x < bytesPerRow; x++) {
      const value = raw[at + x];
      if (value === undefined) throw new PngDecodeError("PNG data ended early");
      const left = x >= bytesPerPixel ? out[row + x - bytesPerPixel]! : 0;
      const up = y > 0 ? out[prior + x]! : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? out[prior + x - bytesPerPixel]! : 0;
      let result: number;
      switch (filter) {
        case 0: result = value; break;
        case 1: result = value + left; break;
        case 2: result = value + up; break;
        case 3: result = value + ((left + up) >> 1); break;
        case 4: result = value + paeth(left, up, upLeft); break;
        default: throw new PngDecodeError(`unknown scanline filter ${filter}`);
      }
      out[row + x] = result & 0xff;
    }
    at += bytesPerRow;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Expand any supported depth/colour-type combination to straight RGBA8. */
function toRgba(
  bytes: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  depth: number,
  colorType: number,
  palette: Uint8Array | null,
  transparency: Uint8Array | null,
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const channels = CHANNELS[colorType]!;
  const max = (1 << depth) - 1;

  const sample = (row: number, index: number): number => {
    if (depth === 16) {
      // Downsample to 8 bits: the rules are all thresholds and ratios, and
      // carrying 16-bit precision through would change no verdict.
      return bytes[row + index * 2]!;
    }
    if (depth === 8) return bytes[row + index]!;
    const bitsAt = index * depth;
    const byte = bytes[row + (bitsAt >> 3)]!;
    const shift = 8 - depth - (bitsAt & 7);
    const raw = (byte >> shift) & max;
    return colorType === 3 ? raw : Math.round((raw * 255) / max);
  };

  for (let y = 0; y < height; y++) {
    const row = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const base = x * channels;
      if (colorType === 0 || colorType === 4) {
        const grey = sample(row, base);
        out[at] = grey; out[at + 1] = grey; out[at + 2] = grey;
        out[at + 3] = colorType === 4 ? sample(row, base + 1) : 255;
      } else if (colorType === 2 || colorType === 6) {
        out[at] = sample(row, base);
        out[at + 1] = sample(row, base + 1);
        out[at + 2] = sample(row, base + 2);
        out[at + 3] = colorType === 6 ? sample(row, base + 3) : 255;
      } else {
        const index = sample(row, base);
        const p = index * 3;
        out[at] = palette?.[p] ?? 0;
        out[at + 1] = palette?.[p + 1] ?? 0;
        out[at + 2] = palette?.[p + 2] ?? 0;
        out[at + 3] = transparency?.[index] ?? 255;
      }
    }
  }
  return out;
}
