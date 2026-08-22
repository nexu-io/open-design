import { describe, expect, it } from "vitest";
import * as zlib from "node:zlib";
import { encodePng, decodePng, PngDecodeError } from "../src/sheet/png.js";

/** A tiny solid-colour RGBA image, generated so the test is auditable. */
function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

describe("decodePng (SH-6)", () => {
  it("round-trips a valid PNG", () => {
    const src = solid(4, 3, [10, 20, 30, 255]);
    const decoded = decodePng(encodePng(src));
    expect([decoded.width, decoded.height]).toEqual([4, 3]);
    expect(Array.from(decoded.data.subarray(0, 4))).toEqual([10, 20, 30, 255]);
  });

  it("throws on a truncated PNG instead of decoding garbage", () => {
    // A sheet cut short must read as SHEET_UNREADABLE (collect.ts routes a
    // decode throw there), not as a confident-but-wrong measurement.
    const full = encodePng(solid(8, 8, [200, 100, 50, 255]));
    const cut = full.subarray(0, full.length - 12); // drop IEND
    expect(() => decodePng(cut)).toThrow(PngDecodeError);
  });

  it("still rejects a non-PNG", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(PngDecodeError);
  });
});

/**
 * A hand-built PNG of an arbitrary colour type, so the decoder can be tested
 * against spellings `encodePng` never produces. Real sheets arrive from
 * Aseprite, Photoshop and texture packers, not from this module.
 */
function buildPng(
  colorType: number,
  width: number,
  height: number,
  rows: number[][],
  chunks: Array<{ type: string; data: number[] }> = [],
): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  const raw = Buffer.concat(rows.map((r) => Buffer.from([0, ...r]))); // filter 0
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      ...chunks.map((c) => chunk(c.type, Buffer.from(c.data))),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

describe("decodePng chroma-key transparency (tRNS)", () => {
  it("honours a truecolour transparent colour", () => {
    // tRNS was parsed but consumed only in the PALETTE branch, so a spec-legal
    // RGB image with a transparent colour decoded fully opaque — and every
    // alpha-derived sheet fact (opaqueRatio, maxAlpha, the visible-pixel gate
    // the flipbook rules read) was wrong for it.
    const png = buildPng(
      2,
      2,
      1,
      [[255, 0, 255, 10, 20, 30]],
      // tRNS for colour type 2: R, G, B as 16-bit big-endian samples.
      [{ type: "tRNS", data: [0, 255, 0, 0, 0, 255] }],
    );
    const out = decodePng(png).data;
    expect(Array.from(out.subarray(0, 4))).toEqual([255, 0, 255, 0]); // keyed out
    expect(Array.from(out.subarray(4, 8))).toEqual([10, 20, 30, 255]); // untouched
  });

  it("honours a greyscale transparent value", () => {
    const png = buildPng(0, 2, 1, [[128, 200]], [{ type: "tRNS", data: [0, 128] }]);
    const out = decodePng(png).data;
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(255);
  });

  it("leaves an image with no tRNS fully opaque", () => {
    const png = buildPng(2, 2, 1, [[255, 0, 255, 10, 20, 30]]);
    const out = decodePng(png).data;
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(255);
  });
});

describe("decodePng refuses what it cannot safely allocate", () => {
  /** A PNG header declaring any dimensions, with a tiny IDAT. */
  function headerOnly(width: number, height: number): Uint8Array {
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc = (buf: Buffer): number => {
      let c = 0xffffffff;
      for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer): Buffer => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const tail = Buffer.alloc(4);
      tail.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, tail]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6; // RGBA
    return new Uint8Array(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(Buffer.alloc(16))),
        chunk("IEND", Buffer.alloc(0)),
      ]),
    );
  }

  it("rejects dimensions no runtime could load, before allocating for them", () => {
    // IHDR is two attacker-chosen uint32s and every allocation derives from
    // them: 65535x65535 reserves ~17GB in toRgba alone. An out-of-memory abort
    // is not a catchable exception, so the decoder's own try/catch cannot turn
    // it into SHEET_UNREADABLE — the process just dies. A few hundred bytes
    // should not be able to do that.
    expect(() => decodePng(headerOnly(65535, 65535))).toThrow(PngDecodeError);
    expect(() => decodePng(headerOnly(65535, 65535))).toThrow(/decoder limit/);
  });

  it("still accepts the largest sheet a runtime does load", () => {
    // The guard must not become a policy: 16384 is Godot's Basis limit and the
    // ceiling conventions.sheets.maxDimension is documented against, so the
    // decoder allows it and S3D-E-604 decides whether it is too big.
    const img = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4).fill(255) };
    expect(decodePng(encodePng(img)).width).toBe(4);
    expect(() => decodePng(headerOnly(16384, 1))).not.toThrow(/decoder limit/);
  });

  it("refuses an IDAT that inflates past what the image can hold", () => {
    // A decompression bomb: a small IDAT that expands far beyond the declared
    // image. The excess would be discarded anyway, so allocating it is pure
    // loss — and it is exactly how a sheet takes the process down.
    const bomb = zlib.deflateSync(Buffer.alloc(4 * 1024 * 1024));
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc = (buf: Buffer): number => {
      let c = 0xffffffff;
      for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer): Buffer => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const tail = Buffer.alloc(4);
      tail.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, tail]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const png = new Uint8Array(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", bomb),
        chunk("IEND", Buffer.alloc(0)),
      ]),
    );
    // Reported as an unreadable sheet, like any other malformed input.
    expect(() => decodePng(png)).toThrow(PngDecodeError);
  });
});
