// Codex hatch-pet atlas helpers.
//
// The companion `hatch-pet` skill (vendored under `skills/hatch-pet/`)
// produces a fixed-shape spritesheet that the Codex app reads directly:
//
//   - Format: PNG or WebP, transparent background.
//   - Dimensions: 1536 x 1872 px.
//   - Grid: 8 columns x 9 rows of 192 x 208 cells.
//   - Each row encodes one animation state (idle, running-right, …).
//
// The pet overlay can render the full atlas and switch the active row
// based on interaction state (hover, drag direction, idle timeout) —
// matching the codex-pets-react `PetWidget` behaviour. For users who
// prefer a single-row loop (or a non-Codex strip) we still expose the
// `cropAtlasRow` helper, which slices one row into a standalone strip.
//
// Source contract:
// https://github.com/openai/skills/tree/main/skills/.curated/hatch-pet/references

import type { PetAtlasLayout, PetAtlasRowDef } from '../../types';

export const CODEX_ATLAS_COLS = 8;
export const CODEX_ATLAS_ROWS = 9;
export const CODEX_CELL_WIDTH = 192;
export const CODEX_CELL_HEIGHT = 208;
export const CODEX_ATLAS_WIDTH = CODEX_ATLAS_COLS * CODEX_CELL_WIDTH; // 1536
export const CODEX_ATLAS_HEIGHT = CODEX_ATLAS_ROWS * CODEX_CELL_HEIGHT; // 1872
export const CODEX_ATLAS_ASPECT = CODEX_ATLAS_WIDTH / CODEX_ATLAS_HEIGHT; // ~0.821

export interface CodexAtlasRow {
  // Row index in the atlas, top to bottom. Stable ordering matches the
  // `animation-rows.md` reference shipped with the upstream skill.
  index: number;
  // Stable id used for translation lookup and React keys.
  id:
    | 'idle'
    | 'running-right'
    | 'running-left'
    | 'waving'
    | 'jumping'
    | 'failed'
    | 'waiting'
    | 'running'
    | 'review';
  // Number of frames the row uses, per the upstream reference. Frames
  // beyond this index are required to be transparent so we crop them
  // out by default to keep the strip tight.
  frames: number;
  // Recommended fps so the strip plays at roughly the same cadence as
  // the Codex app's own per-frame ms timings. Each row uses different
  // per-frame timings; this is a reasonable rounded average.
  fps: number;
}

// Mirrors `references/animation-rows.md` from the hatch-pet skill.
export const CODEX_ATLAS_ROWS_DEF: CodexAtlasRow[] = [
  { index: 0, id: 'idle', frames: 6, fps: 6 },
  { index: 1, id: 'running-right', frames: 8, fps: 8 },
  { index: 2, id: 'running-left', frames: 8, fps: 8 },
  { index: 3, id: 'waving', frames: 4, fps: 6 },
  { index: 4, id: 'jumping', frames: 5, fps: 7 },
  { index: 5, id: 'failed', frames: 8, fps: 7 },
  { index: 6, id: 'waiting', frames: 6, fps: 6 },
  { index: 7, id: 'running', frames: 6, fps: 8 },
  { index: 8, id: 'review', frames: 6, fps: 6 },
];

// Canonical layout passed to `PetCustom.atlas` when the user adopts a
// Codex hatch-pet without freezing it to a single row. The overlay reads
// this to know how to slice the grid + which rows are populated.
export const CODEX_ATLAS_LAYOUT: PetAtlasLayout = {
  cols: CODEX_ATLAS_COLS,
  rows: CODEX_ATLAS_ROWS,
  rowsDef: CODEX_ATLAS_ROWS_DEF.map(
    (row): PetAtlasRowDef => ({
      index: row.index,
      id: row.id,
      frames: row.frames,
      fps: row.fps,
    }),
  ),
};

// Aspect-only check is enough to handle WebP/PNG atlases that have been
// resized for transport. We accept anything within ~6% of the canonical
// 8x9 / 192x208 aspect, which comfortably catches resized variants while
// rejecting normal screenshots and selfies.
export function looksLikeCodexAtlas(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;
  const aspect = width / height;
  return Math.abs(aspect - CODEX_ATLAS_ASPECT) < 0.06;
}

// Read a user-picked file into a data URL without re-encoding through a
// canvas. The Codex atlas import path needs the original full-resolution
// pixels so the per-row crop stays sharp; the regular pet upload path in
// `image.ts` would downscale to 384 px on the longest side and destroy
// the grid alignment.
export interface RawAtlasImage {
  dataUrl: string;
  width: number;
  height: number;
}

const ACCEPTED_TYPES = new Set([
  'image/png',
  'image/webp',
  'image/jpeg',
  'image/gif',
]);

export async function loadAtlasImageFromFile(file: File): Promise<RawAtlasImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are supported.');
  }
  if (!ACCEPTED_TYPES.has(file.type) && file.type !== 'image/svg+xml') {
    throw new Error('Use a PNG, WebP, JPEG, or GIF spritesheet.');
  }
  const dataUrl = await readFileAsDataUrl(file);
  const dims = await measureImage(dataUrl);
  return { dataUrl, width: dims.width, height: dims.height };
}

export interface CropAtlasOptions {
  // Which row to extract. Defaults to row 0 (`idle`).
  rowIndex: number;
  // Override the columns / rows / cell size if the source is a non-Codex
  // atlas. Defaults to the canonical 8x9 / 192x208 layout.
  cols?: number;
  rows?: number;
  // Number of leading frames to keep from the row. Defaults to the
  // upstream-defined "used columns" for the chosen row, falling back to
  // `cols` when the row isn't recognised.
  frames?: number;
  // Cap on the cell height of the resulting strip. The pet overlay only
  // renders at ~56-72 px, so 96 px cells stay crisp without bloating
  // the localStorage payload. Set to `null` to skip downscaling.
  maxCellHeight?: number | null;
}

export interface CroppedAtlasRow {
  // PNG data URL of the horizontal strip ready to drop into
  // `PetCustom.imageUrl` and animated via `pet-frames` keyframes.
  dataUrl: string;
  // Final strip dimensions after optional downscale.
  width: number;
  height: number;
  // Number of frames packed into the strip.
  frames: number;
}

const DEFAULT_MAX_CELL_HEIGHT = 96;

export async function cropAtlasRow(
  dataUrl: string,
  options: CropAtlasOptions,
): Promise<CroppedAtlasRow> {
  const cols = Math.max(1, Math.floor(options.cols ?? CODEX_ATLAS_COLS));
  const rows = Math.max(1, Math.floor(options.rows ?? CODEX_ATLAS_ROWS));
  const rowIndex = Math.max(0, Math.min(rows - 1, Math.floor(options.rowIndex)));
  const def = CODEX_ATLAS_ROWS_DEF.find((r) => r.index === rowIndex);
  const requestedFrames =
    options.frames ?? def?.frames ?? cols;
  const frames = Math.max(1, Math.min(cols, Math.floor(requestedFrames)));
  const maxCellHeight =
    options.maxCellHeight === null
      ? null
      : options.maxCellHeight ?? DEFAULT_MAX_CELL_HEIGHT;

  const img = await loadImage(dataUrl);
  const cellWidth = Math.floor(img.naturalWidth / cols);
  const cellHeight = Math.floor(img.naturalHeight / rows);
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error('Atlas image is too small to crop.');
  }

  const targetCellHeight =
    maxCellHeight && cellHeight > maxCellHeight ? maxCellHeight : cellHeight;
  const scale = targetCellHeight / cellHeight;
  const targetCellWidth = Math.max(1, Math.round(cellWidth * scale));
  const targetWidth = targetCellWidth * frames;
  const targetHeight = targetCellHeight;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is unavailable in this browser.');
  }
  // Pixel-art atlases lose readability under bilinear smoothing, so we
  // explicitly disable it before drawing.
  ctx.imageSmoothingEnabled = false;
  for (let f = 0; f < frames; f++) {
    const sx = f * cellWidth;
    const sy = rowIndex * cellHeight;
    ctx.drawImage(
      img,
      sx,
      sy,
      cellWidth,
      cellHeight,
      f * targetCellWidth,
      0,
      targetCellWidth,
      targetCellHeight,
    );
  }
  const out = canvas.toDataURL('image/png');
  return {
    dataUrl: out,
    width: targetWidth,
    height: targetHeight,
    frames,
  };
}

// Same idea as `cropAtlasRow` but keeps every row so the overlay can
// switch animations on the fly. We downscale to a target cell height
// (default 80 px → 8x9 grid lands at ~528 KB PNG which fits inside the
// MAX_DATA_URL_BYTES guard from `image.ts` even for busy spritesheets)
// while preserving the grid layout 1:1 so background-position math in
// `PetSpriteFace` stays simple.
const DEFAULT_FULL_ATLAS_MAX_CELL = 80;

export interface PreparedAtlas {
  // PNG data URL of the full atlas, ready to drop into
  // `PetCustom.imageUrl` together with the matching layout.
  dataUrl: string;
  // Final pixel dimensions of the downscaled atlas.
  width: number;
  height: number;
  // Layout metadata describing the grid + per-row playback config.
  layout: PetAtlasLayout;
}

export async function prepareCodexAtlas(
  sourceDataUrl: string,
  options?: { maxCellHeight?: number | null },
): Promise<PreparedAtlas> {
  const maxCellHeight =
    options?.maxCellHeight === null
      ? null
      : options?.maxCellHeight ?? DEFAULT_FULL_ATLAS_MAX_CELL;
  const img = await loadImage(sourceDataUrl);
  const cellWidth = Math.floor(img.naturalWidth / CODEX_ATLAS_COLS);
  const cellHeight = Math.floor(img.naturalHeight / CODEX_ATLAS_ROWS);
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error('Atlas image is too small to slice.');
  }
  const targetCellHeight =
    maxCellHeight && cellHeight > maxCellHeight ? maxCellHeight : cellHeight;
  const scale = targetCellHeight / cellHeight;
  const targetCellWidth = Math.max(1, Math.round(cellWidth * scale));
  const targetWidth = targetCellWidth * CODEX_ATLAS_COLS;
  const targetHeight = targetCellHeight * CODEX_ATLAS_ROWS;
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is unavailable in this browser.');
  }
  ctx.imageSmoothingEnabled = false;
  // Draw cell-by-cell so alignment survives even if the source has a
  // slightly off canvas size (some tools add a 1 px gutter that would
  // otherwise smear into adjacent cells under a single drawImage).
  for (let r = 0; r < CODEX_ATLAS_ROWS; r++) {
    for (let c = 0; c < CODEX_ATLAS_COLS; c++) {
      ctx.drawImage(
        img,
        c * cellWidth,
        r * cellHeight,
        cellWidth,
        cellHeight,
        c * targetCellWidth,
        r * targetCellHeight,
        targetCellWidth,
        targetCellHeight,
      );
    }
  }
  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    layout: CODEX_ATLAS_LAYOUT,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not decode the image.'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function measureImage(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not load that image.'));
    img.src = dataUrl;
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load that image.'));
    img.src = dataUrl;
  });
}
