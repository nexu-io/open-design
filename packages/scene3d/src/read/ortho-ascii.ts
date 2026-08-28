/**
 * The three orthographic elevations as ASCII box-art — plan, front, side — with
 * a legend and dimension callouts.
 *
 * A perspective proof frame is where proportion goes to die: a luminance
 * silhouette can't tell an agent whether a column is too tall or the roof too
 * wide. The SVG ortho (`renderOrthoSvg`) answers that for eyes, but an LLM reads
 * text — and SVG path data is not text a model reasons over cheaply. This is the
 * same information (each part's world AABB, projected down each axis, drawn to a
 * fixed grid at one shared scale so the three views are comparable) rendered in
 * the medium the model reads natively. Zero Blender: pure census, so it ships in
 * the --fast gear where there are no proof frames at all.
 *
 * Deterministic: part order, character assignment, scale and layout are all
 * fixed functions of the census, so the same scene is byte-identical every run.
 */
import type { Census } from "../types.js";

type Vec3 = [number, number, number];

const VIEWS = [
  // Blender is Z-up: plan looks down Z (X across, Y up); the elevations look
  // along −Y and −X.
  { id: "plan", label: "Plan · top (−Z)", h: 0, v: 1, gnomon: "X→ Y↑" },
  { id: "front", label: "Front (−Y)", h: 0, v: 2, gnomon: "X→ Z↑" },
  { id: "side", label: "Side (−X)", h: 1, v: 2, gnomon: "Y→ Z↑" },
] as const;

interface Box {
  name: string;
  min: Vec3;
  max: Vec3;
}

function partBoxes(census: Census): Box[] {
  const spatial = new Map(census.meshes.map((m) => [m.object, m.spatial]));
  const out: Box[] = [];
  for (const obj of census.objects) {
    if (obj.type !== "MESH") continue;
    const s = spatial.get(obj.name);
    const min = (s?.worldMin ?? obj.worldMin) as Vec3 | null | undefined;
    const max = (s?.worldMax ?? obj.worldMax) as Vec3 | null | undefined;
    if (!min || !max) continue;
    out.push({ name: obj.name, min: [...min] as Vec3, max: [...max] as Vec3 });
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

function metres(n: number): string {
  // A non-finite span (a corrupted/degenerate census: NaN or ±Infinity bounds)
  // must not surface as the literal text "NaNm"/"Infinitym" in the callout — the
  // grid already degrades to a finite fallback, so the label degrades in step.
  if (!Number.isFinite(n)) return "—";
  const mm = Math.round(n * 1000);
  if (Math.abs(mm) < 1000) return `${mm}mm`;
  return `${Math.round(n * 1000) / 1000}m`;
}

/** Distinct paint characters, in assignment order. 62 before any sharing. */
const GLYPHS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export interface OrthoAsciiOptions {
  /** Columns of the WIDEST view pane (the others scale to it). Default 44. */
  columns?: number;
}

/**
 * Render the plan/front/side ASCII triptych for a census. Returns a multi-line
 * string, or a one-line note when there is no measured geometry.
 */
export function renderOrthoAscii(census: Census, options: OrthoAsciiOptions = {}): string {
  const boxes = partBoxes(census);
  if (boxes.length === 0) return "ortho: no measured meshes";

  const cols = Math.max(16, Math.min(120, Math.floor(options.columns ?? 44)));

  // One shared scale across all three views so a part that is wide in plan reads
  // wide in front too — the whole point of an orthographic set.
  const world = {
    min: [Infinity, Infinity, Infinity] as Vec3,
    max: [-Infinity, -Infinity, -Infinity] as Vec3,
  };
  for (const b of boxes) {
    for (let a = 0; a < 3; a++) {
      if (b.min[a] < world.min[a]) world.min[a] = b.min[a];
      if (b.max[a] > world.max[a]) world.max[a] = b.max[a];
    }
  }
  const extent: Vec3 = [
    world.max[0] - world.min[0],
    world.max[1] - world.min[1],
    world.max[2] - world.min[2],
  ];
  const largest = Math.max(extent[0], extent[1], extent[2], 1e-6);
  // Cells are ~2:1 (wide:tall) in a terminal font, so vertical resolution is
  // halved to keep boxes roughly proportional.
  const scaleH = (cols - 1) / largest;
  const scaleV = scaleH / 2;

  // Paint LARGEST parts first so smaller ones land on top and stay legible; the
  // legend glyph, though, is assigned in the deterministic name order.
  const glyphOf = new Map<string, string>();
  boxes.forEach((b, i) => glyphOf.set(b.name, i < GLYPHS.length ? GLYPHS[i]! : "#"));
  const bySize = [...boxes].sort((a, b) => volume(b) - volume(a));

  const panes: string[] = [];
  for (const view of VIEWS) {
    const hSpan = extent[view.h];
    const vSpan = extent[view.v];
    const w = Math.max(1, Math.round(hSpan * scaleH) + 1);
    const hgt = Math.max(1, Math.round(vSpan * scaleV) + 1);
    const grid: string[][] = Array.from({ length: hgt }, () => Array.from({ length: w }, () => " "));
    const px = (x: number) => clamp(Math.round((x - world.min[view.h]) * scaleH), 0, w - 1);
    // v is up, but rows grow downward — flip.
    const py = (y: number) => clamp(hgt - 1 - Math.round((y - world.min[view.v]) * scaleV), 0, hgt - 1);
    for (const b of bySize) {
      const g = glyphOf.get(b.name)!;
      const x0 = px(b.min[view.h]);
      const x1 = px(b.max[view.h]);
      const y0 = py(b.max[view.v]);
      const y1 = py(b.min[view.v]);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y]![x] = g;
    }
    const border = "+" + "-".repeat(w) + "+";
    const body = grid.map((row) => "|" + row.join("") + "|").join("\n");
    const dims = `${metres(hSpan)} ${view.h === 0 ? "×" : "×"} ${metres(vSpan)}`;
    panes.push(`${view.label}   ${view.gnomon}   ${dims}\n${border}\n${body}\n${border}`);
  }

  // Only the glyph-DISTINCT parts get a legend line — the rest all draw '#' and
  // are indistinguishable in the panes, so listing 20k of them (one per part)
  // would be a wall of noise where only 62 entries can be told apart. This is a
  // display-glyph limit (62 printable chars), not an arbitrary size cap on the
  // asset: every part is still MEASURED and drawn; the overflow is named loudly.
  const legend = boxes
    .slice(0, GLYPHS.length)
    .map((b) => {
      const g = glyphOf.get(b.name)!;
      const size = `${metres(b.max[0] - b.min[0])}×${metres(b.max[1] - b.min[1])}×${metres(b.max[2] - b.min[2])}`;
      return `${g} ${b.name} ${size}`;
    })
    .join("\n");
  const overflow =
    boxes.length > GLYPHS.length
      ? `\n(and ${boxes.length - GLYPHS.length} further parts drawn '#' — beyond the ${GLYPHS.length} distinguishable glyphs; query them by region with \`od scene3d describe\`)`
      : "";

  return `${panes.join("\n\n")}\n\nlegend (one glyph per part):\n${legend}${overflow}`;
}

const volume = (b: Box): number =>
  (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
