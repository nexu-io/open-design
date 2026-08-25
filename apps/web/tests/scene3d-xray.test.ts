import { describe, expect, it } from 'vitest';
import {
  XRAY_ID_STEPS,
  decodeIdMap,
  filmArc,
  idMapUrlFor,
  inspectionRamp,
  renderXrayComposite,
} from '../src/runtime/scene3d-xray';

/*
 * The 2D x-ray is a constant-for-constant port of the kit shader's spectral
 * pass; these pin the constants and the decode's noise tolerance, which are
 * the two things that would rot silently (a drifted ramp still renders — it
 * just stops matching the kit).
 */
const imageData = (width: number, height: number, fill: (i: number) => [number, number, number, number]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = fill(i);
    data.set([r, g, b, a], i * 4);
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
};

describe('inspectionRamp / filmArc — shader constants', () => {
  it('starts at the shader\'s ink indigo and ends at cream white-hot', () => {
    expect(inspectionRamp(0).map((v) => Number(v.toFixed(3)))).toEqual([0.043, 0.063, 0.149]);
    expect(inspectionRamp(1).map((v) => Number(v.toFixed(3)))).toEqual([0.961, 0.902, 0.784]);
  });

  it('climbs in luminance overall — the property that makes it read as data', () => {
    // The steel→amber leg dips ~0.03 in Rec709 luminance (the shader's
    // "monotonic" is perceptual, not strict); pin the honest property:
    // strongly rising end to end, never a real reversal.
    let previous = -1;
    for (let k = 0; k <= 20; k++) {
      const [r, g, b] = inspectionRamp(k / 20);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(luminance).toBeGreaterThan(previous - 0.05);
      previous = luminance;
    }
    const lumOf = (t: number) => {
      const [r, g, b] = inspectionRamp(t);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(lumOf(1) - lumOf(0)).toBeGreaterThan(0.7);
  });

  it('filmArc matches the shader cosine at p = 0', () => {
    const [r, g, b] = filmArc(0);
    expect(r).toBeCloseTo(0.6 + 0.28, 5);
    expect(g).toBeCloseTo(0.56 + 0.24 * Math.cos(6.28318 * 0.2), 4);
    expect(b).toBeCloseTo(0.58 + 0.3 * Math.cos(6.28318 * 0.45), 4);
  });
});

describe('decodeIdMap', () => {
  it('decodes exact step colours and survives ±15 of channel noise', () => {
    // code 73 = digits (1, 1, 1) → channels [36, 36, 36]
    const clean = imageData(2, 1, (i) => (i === 0 ? [36, 36, 36, 255] : [47, 25, 39, 255]));
    const codes = decodeIdMap(clean);
    expect(codes[0]).toBe(73);
    expect(codes[1]).toBe(73); // noisy variant still lands on the same steps
  });

  it('reads transparent pixels as background', () => {
    const map = imageData(1, 1, () => [36, 36, 36, 0]);
    expect(decodeIdMap(map)[0]).toBe(0);
  });

  it('steps match the runner encoder', () => {
    expect([...XRAY_ID_STEPS]).toEqual([0, 36, 73, 109, 146, 182, 219, 255]);
  });
});

describe('renderXrayComposite', () => {
  const W = 8;
  const H = 8;
  // A 4×4 part (code 1) in the middle of a grey frame.
  const codes = new Uint16Array(W * H);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) codes[y * W + x] = 1;
  const beauty = imageData(W, H, () => [128, 128, 128, 255]);

  it('keeps the selected part real and drops the world into the teal ghost', () => {
    const out = imageData(W, H, () => [0, 0, 0, 0]);
    renderXrayComposite(beauty, codes, new Set([1]), out);
    const inside = (3 * W + 3) * 4;
    const corner = 0;
    // The selection stays matter: its pixels survive (with the 6% lift).
    expect(out.data[inside]).toBe(Math.min(255, Math.round(128 * 1.06)));
    expect(out.data[inside + 3]).toBe(255);
    // The world outside goes spectral: darker than it was, teal-leaning
    // (blue channel above red — the ghost body), never vanished.
    expect(out.data[corner]!).toBeLessThan(128);
    expect(out.data[corner + 2]!).toBeGreaterThan(out.data[corner]!);
    expect(out.data[corner + 3]).toBe(255);
  });

  it('passes the frame through untouched when nothing is selected', () => {
    const out = imageData(W, H, () => [0, 0, 0, 0]);
    renderXrayComposite(beauty, codes, new Set([9]), out);
    expect(out.data[0]).toBe(128);
    expect(out.data[3]).toBe(255);
  });
});

describe('idMapUrlFor', () => {
  it('derives the runner\'s naming contract', () => {
    expect(idMapUrlFor('/api/p/files/out/proof/proof-ab-000.png')).toBe(
      '/api/p/files/out/proof/proof-ab-000.idx.png',
    );
    expect(idMapUrlFor('/x/y.png?v=2')).toBe('/x/y.idx.png?v=2');
  });
});
