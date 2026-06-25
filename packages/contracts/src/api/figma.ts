// Figma import — shared DTOs for the offline `.fig` decode pipeline.
//
// The daemon decodes a `.fig` (offline, no Figma account) or a Figma URL
// (via the OAuth `figma-extract` atom) into a canonical `figma/` snapshot
// and returns the inventory below. Web (DesignSystemFlow, FigmaImportModal)
// and the `od figma` CLI both consume these shapes; keep this file pure TS.

/** A (family, styles) pair referenced by the file's TEXT nodes. */
export interface FigmaFontFace {
  family: string;
  styles: string[];
}

/** A quick, surface-level summary of what the decode recovered. Drives the
 *  import modal's confirmation UI, the design-system provenance card, and the
 *  CLI `--json` output. */
export interface FigmaInventory {
  /** True when the kiwi node-tree decoded; false = assets-only degraded
   *  result (thumbnail + embedded images + meta only). */
  decoded: boolean;
  /** How the snapshot was produced. */
  source: 'fig-file' | 'figma-url';
  nodeCount: number;
  pageCount: number;
  frameCount: number;
  /** Component / component-instance count (semantic regroup candidates). */
  componentCount: number;
  /** Top color tokens lifted from fills/strokes, as `#RRGGBB(AA)`. */
  colors: string[];
  fonts: FigmaFontFace[];
  /** Embedded raster/vector assets written under `figma/assets/`. */
  assetCount: number;
  hasThumbnail: boolean;
  /** Non-fatal decode notes (degradation reasons, skipped chunks). */
  warnings: string[];
}

/** Result of a successful import. `snapshotDir` and `files` are relative to
 *  the staging root (project cwd for project-scoped imports). */
export interface FigmaImportResult {
  /** Directory holding the `figma/` snapshot (relative to the staging root). */
  snapshotDir: string;
  /** Relative paths of every file written (e.g. `figma/tree.json`). */
  files: string[];
  inventory: FigmaInventory;
  /** `figma/thumbnail.png` when the archive shipped a preview. */
  thumbnailPath?: string;
  /** `figma/DESIGN-context.md` — the agent-facing inventory + reshape brief. */
  contextPath: string;
  /** A ready-to-send prompt that points the agent at the snapshot and asks it
   *  to reshape the import into a responsive, design-system-bound webpage. */
  suggestedPrompt: string;
  /** Human label for the import (file name or Figma file title). */
  label: string;
}

/** JSON body for `POST /api/figma/import` and the project-scoped variant.
 *  A `.fig` upload arrives as multipart instead of `figmaUrl`. */
export interface FigmaImportRequest {
  /** Figma file URL (`https://figma.com/(file|design)/<key>/...`). Routed
   *  through the OAuth `figma-extract` atom; mutually exclusive with an
   *  uploaded `.fig`. */
  figmaUrl?: string;
  /** Optional design brief / migration notes folded into `suggestedPrompt`. */
  notes?: string;
}
