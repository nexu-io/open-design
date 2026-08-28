import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * What the default light rig actually delivers to a pixel.
 *
 * The proof is a measurement device: the linter judges blowout, emptiness and
 * exposure from its bytes, and an authoring agent decides whether its scene
 * worked by looking at them. So the rig's job is not "look nice" — it is to
 * make a pixel read as the ALBEDO that produced it, with nothing clipping
 * until albedo approaches 1.
 *
 * This suite exists because that property was once carried by a comment. The
 * key power was fitted to the fixture corpus, the docstring asserted the fit
 * still held, and a change in light transport silently invalidated it. A
 * corpus fit also makes the fixtures the authority on exposure, so the next
 * scene with a brighter albedo breaks it again. Here the invariant is measured
 * on a synthetic probe of known albedo, so it binds the constant, the lamp
 * geometry, the world radiance AND the render's colour management together,
 * and anything that changes delivered irradiance goes red.
 */
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

/** Decode an RGBA8 PNG, undoing the per-scanline filters. */
function decodeRgba(file: string): { w: number; h: number; px: Buffer } {
  const png = fs.readFileSync(file);
  let at = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    if (type === "IHDR") {
      w = png.readUInt32BE(at + 8);
      h = png.readUInt32BE(at + 12);
      colorType = png[at + 17]!;
    }
    if (type === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  expect(colorType, "the proof must carry alpha, so lit pixels are a mask").toBe(6);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++]!;
    for (let x = 0; x < stride; x++) {
      const cur = raw[p + x]!;
      const a = x >= bpp ? out[y * stride + x - bpp]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp]! : 0;
      let v: number;
      if (filter === 0) v = cur;
      else if (filter === 1) v = cur + a;
      else if (filter === 2) v = cur + b;
      else if (filter === 3) v = cur + ((a + b) >> 1);
      else {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + x] = v & 0xff;
    }
    p += stride;
  }
  return { w, h, px: out };
}

const toLinear = (u: number): number => {
  const c = u / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/**
 * The 99th-percentile linear luminance over the pixels the subject covers.
 * A percentile rather than the maximum: one stray specular texel is not the
 * diffuse response this measures.
 */
function litPeak(file: string): number {
  const { w, h, px } = decodeRgba(file);
  const lums: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3]! === 0) continue;
    lums.push(
      0.2126 * toLinear(px[i * 4]!) +
        0.7152 * toLinear(px[i * 4 + 1]!) +
        0.0722 * toLinear(px[i * 4 + 2]!),
    );
  }
  expect(lums.length, "the probe must actually be in frame").toBeGreaterThan(1000);
  lums.sort((a, b) => a - b);
  return lums[Math.floor(lums.length * 0.99)]!;
}

describe.skipIf(!hasBlender)("light rig exposure (real Blender)", () => {
  let seq = 0;
  /**
   * An albedo-`a` Lambertian sphere. Its brightest point faces the key
   * square-on, so the peak lit pixel is the delivered irradiance itself, free
   * of any question about how a flat face happens to be oriented.
   */
  const probe = async (
    name: string,
    albedo: number,
    light?: Record<string, unknown>,
  ): Promise<{ peak: number; blown: number | null | undefined }> => {
    const dir = path.join(__dirname, ".work", `exposure-${name}-${++seq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          ...(light ? { light } : {}),
          materials: {
            mtl_probe: { baseColor: [albedo, albedo, albedo], roughness: 1, metallic: 0 },
          },
          parts: [{ id: "prp_probe", shape: "sphere", size: [1, 1, 1], material: "mtl_probe" }],
          relations: [{ type: "at", part: "prp_probe", center: [0, 0, 0.5] }],
        },
        null,
        2,
      ),
    );
    const r = await compile({
      projectDir: dir,
      proof: { turntable: false },
      noCache: true,
      timeoutMs: 900_000,
    });
    const frame = (r.manifest?.proofImages ?? [])[0];
    expect(frame, "the probe must render").toBeTruthy();
    return {
      peak: litPeak(path.join(dir, frame!)),
      blown: (r.manifest?.proofFrames ?? [])[0]?.blownRatio,
    };
  };

  it("lands an albedo-1 surface just under clipping", async () => {
    // Albedo 1 is the brightest thing that can exist, so it defines the
    // ceiling. Under it every real albedo maps to its own value; over it,
    // distinct materials collapse to the same white and the render stops
    // carrying the information the linter reads out of it.
    const { peak, blown } = await probe("unit", 1);
    expect(peak).toBeGreaterThan(0.85);
    expect(peak).toBeLessThan(1.0);
    // A white sphere is MOSTLY near-white on purpose, so the claim is not that
    // few pixels are bright — it is that the brightest subject the language can
    // express still does not trip the overexposure rule. Anything that does is
    // then a fact about the scene rather than about the rig.
    //
    // The measurement is required, not defaulted: `blown ?? 0` would let this
    // pass on a build that stopped emitting blownRatio at all, which is the
    // unmeasured-reads-as-clean trap the proof linter exists to close.
    expect(typeof blown, "blownRatio must be measured, not absent").toBe("number");
    expect(Number.isFinite(blown)).toBe(true);
    expect(blown!).toBeLessThan(0.6);
  }, 900_000);

  it("renders a pixel as the albedo that produced it", async () => {
    /*
     * Exposure is only meaningful if the mapping is proportional: half the
     * albedo must be half the pixel. That is what makes a render a measurement
     * rather than an impression, and it is the property a tone curve destroys.
     * Blender's default AgX view transform compressed highlights hard enough
     * that the rig's response to lamp power was visibly sublinear and a
     * correctly-baked rust texture photographed as pale cream.
     */
    const unit = await probe("prop-1", 1);
    const half = await probe("prop-half", 0.5);
    expect(half.peak / unit.peak).toBeGreaterThan(0.42);
    expect(half.peak / unit.peak).toBeLessThan(0.58);
  }, 1_800_000);

  it("puts an 18% grey card near photographic middle grey", async () => {
    // The calibration's human-readable consequence, and the reason the target
    // is a ceiling rather than a mid-tone: fixing albedo 1 just under clip
    // puts 0.18 where a photographer expects to find it.
    const { peak } = await probe("grey", 0.18);
    const srgb = 1.055 * Math.pow(peak, 1 / 2.4) - 0.055;
    expect(srgb).toBeGreaterThan(0.38);
    expect(srgb).toBeLessThan(0.52);
  }, 900_000);

  it("gives the same exposure whether the default angle is implied or written", async () => {
    /*
     * The default quarter and an authored azimuth/elevation are the same pose,
     * so they must be the same picture. They were not: the default placed the
     * lamp at its distance on EACH AXIS — sqrt(3) times further out — so
     * writing down the angles the default already implies moved the lamp from
     * 4.33 to 2.5 radii and made the scene three times brighter. A default you
     * cannot state without changing it is not a default.
     */
    const implied = await probe("implied", 0.5);
    const written = await probe("written", 0.5, {
      preset: "studio",
      azimuthDeg: 45,
      elevationDeg: 35.264389682754654,
    });
    const ratio = written.peak / implied.peak;
    expect(ratio).toBeGreaterThan(0.92);
    expect(ratio).toBeLessThan(1.08);
  }, 1_800_000);
});
