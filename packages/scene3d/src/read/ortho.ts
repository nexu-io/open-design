import type { Census } from "../types.js";

/**
 * Plan, front and side elevations with dimensions on them.
 *
 * A beauty render answers "does it look right" — a question the reader is
 * mediocre at and a perspective projection actively works against, since
 * depth foreshortening makes proportion unjudgeable. An architect's drawing
 * answers "what size is it and where is it", which is the question actually
 * being asked, and answers it in numbers.
 *
 * SVG rather than PNG, deliberately: the dimension callouts stay *text*. A
 * reader with no vision at all can read the measurements out of the markup,
 * and one with vision gets the drawing — the same artifact serves both.
 * Rendering the same numbers into a raster would serve only the second, and
 * would need a font rasterizer to do it.
 *
 * Orthographic, so a metre is the same number of pixels everywhere in the
 * frame. That is the whole reason this is legible where a perspective proof
 * frame is not.
 */

type Vec3 = [number, number, number];

/** The three standard views, each dropping one world axis. */
const VIEWS = [
  // Blender is Z-up: plan looks down Z, elevations look along Y and X.
  { id: "plan", label: "Plan (top, −Z)", h: 0, v: 1, flipV: true, across: "X", up: "Y" },
  { id: "front", label: "Front (−Y)", h: 0, v: 2, flipV: true, across: "X", up: "Z" },
  { id: "side", label: "Side (−X)", h: 1, v: 2, flipV: true, across: "Y", up: "Z" },
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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function metres(n: number): string {
  // Millimetre resolution, and a unit on every number: a dimension without
  // units is the classic drawing error.
  const mm = Math.round(n * 1000);
  if (Math.abs(mm) < 1000) return `${mm}mm`;
  return `${Math.round(n * 1000) / 1000}m`;
}

export interface OrthoOptions {
  /** Pixels per view pane. */
  size?: number;
  /** Label every part, not just the overall extents. */
  labelParts?: boolean;
}

/**
 * Render the three views as one SVG document.
 *
 * Deterministic: part order, layout and number formatting are all fixed, so
 * the same census always produces byte-identical markup and the drawing can
 * be diffed like any other artifact.
 */
export function renderOrthoSvg(census: Census, options: OrthoOptions = {}): string {
  const size = options.size ?? 300;
  const pad = 46;
  const parts = partBoxes(census);
  if (parts.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="60" viewBox="0 0 ${size} 60">` +
      `<text x="8" y="34" font-family="ui-monospace,Menlo,monospace" font-size="12">empty scene</text></svg>`;
  }

  const world = {
    min: [Infinity, Infinity, Infinity] as Vec3,
    max: [-Infinity, -Infinity, -Infinity] as Vec3,
  };
  for (const p of parts) {
    for (let a = 0; a < 3; a++) {
      if (p.min[a] < world.min[a]) world.min[a] = p.min[a];
      if (p.max[a] > world.max[a]) world.max[a] = p.max[a];
    }
  }
  const extent: Vec3 = [
    world.max[0] - world.min[0],
    world.max[1] - world.min[1],
    world.max[2] - world.min[2],
  ];

  /*
   * ONE scale for all three views, derived from the largest world extent.
   * Fitting each view independently would make the same part a different
   * size in plan than in elevation, which destroys the only property that
   * makes orthographic drawings comparable at a glance.
   */
  const largest = Math.max(extent[0], extent[1], extent[2], 1e-6);
  const scale = (size - pad * 2) / largest;

  const panes: string[] = [];
  VIEWS.forEach((view, index) => {
    const ox = index * size;
    const hMin = world.min[view.h];
    const vMin = world.min[view.v];
    const hSpan = extent[view.h];
    const vSpan = extent[view.v];
    // Centre each view in its pane; the shared scale means panes differ in
    // how much of their box they fill, which is correct and informative.
    const offX = ox + pad + (size - pad * 2 - hSpan * scale) / 2;
    const offY = pad + (size - pad * 2 - vSpan * scale) / 2;

    const px = (h: number) => offX + (h - hMin) * scale;
    // Screen Y grows downward; world up must grow upward on the page.
    const py = (v: number) => offY + (vSpan - (v - vMin)) * scale;

    const body: string[] = [];
    body.push(
      `<text x="${ox + pad}" y="24" class="title">${esc(view.label)}</text>`,
      `<text x="${ox + pad}" y="38" class="axis">→ ${view.across}   ↑ ${view.up}</text>`,
    );

    for (const p of parts) {
      const x = px(p.min[view.h]);
      const y = py(p.max[view.v]);
      const w = Math.max(0.5, (p.max[view.h] - p.min[view.h]) * scale);
      const h = Math.max(0.5, (p.max[view.v] - p.min[view.v]) * scale);
      body.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" ` +
          `height="${h.toFixed(2)}" class="part"><title>${esc(p.name)} — ` +
          `${metres(p.max[0] - p.min[0])} × ${metres(p.max[1] - p.min[1])} × ` +
          `${metres(p.max[2] - p.min[2])}</title></rect>`,
      );
      if (options.labelParts && w > 26 && h > 12) {
        body.push(
          `<text x="${(x + w / 2).toFixed(2)}" y="${(y + h / 2 + 3).toFixed(2)}" ` +
            `class="partlabel">${esc(p.name)}</text>`,
        );
      }
    }

    /* Dimension lines, drawn the way a drafter would: witness lines out to
       an offset dimension line, with the measurement written on it. */
    const left = px(hMin);
    const right = px(hMin + hSpan);
    const top = py(vMin + vSpan);
    const bottom = py(vMin);
    const dimY = bottom + 20;
    const dimX = left - 22;
    body.push(
      `<line x1="${left.toFixed(2)}" y1="${(bottom + 4).toFixed(2)}" x2="${left.toFixed(2)}" y2="${(dimY + 4).toFixed(2)}" class="witness"/>`,
      `<line x1="${right.toFixed(2)}" y1="${(bottom + 4).toFixed(2)}" x2="${right.toFixed(2)}" y2="${(dimY + 4).toFixed(2)}" class="witness"/>`,
      `<line x1="${left.toFixed(2)}" y1="${dimY.toFixed(2)}" x2="${right.toFixed(2)}" y2="${dimY.toFixed(2)}" class="dim"/>`,
      `<text x="${((left + right) / 2).toFixed(2)}" y="${(dimY + 13).toFixed(2)}" class="dimtext">${metres(hSpan)}</text>`,
      `<line x1="${(left - 4).toFixed(2)}" y1="${top.toFixed(2)}" x2="${(dimX - 4).toFixed(2)}" y2="${top.toFixed(2)}" class="witness"/>`,
      `<line x1="${(left - 4).toFixed(2)}" y1="${bottom.toFixed(2)}" x2="${(dimX - 4).toFixed(2)}" y2="${bottom.toFixed(2)}" class="witness"/>`,
      `<line x1="${dimX.toFixed(2)}" y1="${top.toFixed(2)}" x2="${dimX.toFixed(2)}" y2="${bottom.toFixed(2)}" class="dim"/>`,
      `<text x="${dimX.toFixed(2)}" y="${((top + bottom) / 2).toFixed(2)}" class="dimtext" ` +
        `transform="rotate(-90 ${dimX.toFixed(2)} ${((top + bottom) / 2).toFixed(2)})">${metres(vSpan)}</text>`,
    );

    // The ground plane, where the view shows height. Grounding is judged
    // against z=0, so drawing that line makes floating visible rather than
    // merely reported.
    if (view.v === 2 && vMin <= 0 && vMin + vSpan >= 0) {
      const gy = py(0);
      body.push(
        `<line x1="${(px(hMin) - 8).toFixed(2)}" y1="${gy.toFixed(2)}" ` +
          `x2="${(px(hMin + hSpan) + 8).toFixed(2)}" y2="${gy.toFixed(2)}" class="ground"/>`,
        `<text x="${(px(hMin + hSpan) + 10).toFixed(2)}" y="${(gy + 3).toFixed(2)}" class="axis">z=0</text>`,
      );
    }

    panes.push(body.join("\n"));
  });

  const width = size * VIEWS.length;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size}" viewBox="0 0 ${width} ${size}">`,
    "<style>",
    "  text { font-family: ui-monospace, Menlo, monospace; fill: #24201c; }",
    "  .title { font-size: 12px; font-weight: 600; }",
    "  .axis { font-size: 9px; fill: #8a8178; }",
    "  .part { fill: rgba(120,96,64,.22); stroke: #6b5842; stroke-width: 1; }",
    "  .partlabel { font-size: 8px; text-anchor: middle; fill: #4a4038; }",
    "  .dim { stroke: #b4433a; stroke-width: 1; }",
    "  .witness { stroke: #b4433a; stroke-width: .5; opacity: .55; }",
    "  .dimtext { font-size: 10px; fill: #b4433a; text-anchor: middle; }",
    "  .ground { stroke: #2f7d54; stroke-width: 1; stroke-dasharray: 4 3; }",
    "</style>",
    `<rect width="${width}" height="${size}" fill="#faf7f2"/>`,
    panes.join("\n"),
    "</svg>",
  ].join("\n");
}

/**
 * The same measurements as text.
 *
 * The drawing is for eyes; this is for a reader that has none. Kept beside
 * the SVG rather than inside it so neither has to be parsed out of the
 * other.
 */
export function orthoDimensions(census: Census): string {
  const parts = partBoxes(census);
  if (parts.length === 0) return "empty scene";
  const lines = ["part                        X        Y        Z      origin (min corner)"];
  for (const p of parts) {
    const size: Vec3 = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]];
    lines.push(
      `${p.name.padEnd(26)} ${metres(size[0]).padStart(8)} ${metres(size[1]).padStart(8)} ` +
        `${metres(size[2]).padStart(8)}   ${p.min.map((v) => metres(v)).join(", ")}`,
    );
  }
  return lines.join("\n");
}
