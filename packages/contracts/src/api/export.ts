// Shared DTOs for the programmatic export capability (PDF / image).
//
// Both surfaces speak this shape: the web UI's Download menu rasterizes
// client-side (SVG-foreignObject snapshot + jsPDF) and the
// `od export` CLI calls `POST /api/projects/:id/export`, which delegates
// rasterization to the desktop Electron renderer. Keep this file pure
// TypeScript — no Node, DOM, or runtime deps — per the contracts boundary.

export const EXPORT_FORMATS = ['pdf', 'image'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// Programmatic image export delegates to the desktop Electron renderer, whose
// `nativeImage` encoder only supports PNG and JPEG. WebP is intentionally not
// offered here so `od export --format image --image-format webp` fails fast with
// a clear error rather than silently returning PNG bytes. The web Download
// menu's own client-side path (canvas.toBlob) still offers WebP independently.
export const EXPORT_IMAGE_FORMATS = ['png', 'jpeg'] as const;
export type ExportImageFormat = (typeof EXPORT_IMAGE_FORMATS)[number];

/** Default deck stage dimensions (16:9) shared by the browser and Electron paths. */
export const EXPORT_DEFAULT_WIDTH = 1920;
export const EXPORT_DEFAULT_HEIGHT = 1080;

export interface ExportRequest {
  /** Project-relative path of the file to export (e.g. `index.html`). */
  fileName: string;
  /** Display title; used for the output filename and PPTX/PDF metadata. */
  title?: string;
  /** Treat the artifact as a multi-slide deck (one page/slide per `.slide`). */
  deck?: boolean;
  format: ExportFormat;
  /** Only meaningful when `format === 'image'`. Defaults to `png`. */
  imageFormat?: ExportImageFormat;
  /** Deck stage size in CSS px. Defaults to {@link EXPORT_DEFAULT_WIDTH}×{@link EXPORT_DEFAULT_HEIGHT}. */
  width?: number;
  height?: number;
}

/** JSON envelope returned by the daemon/CLI export path (binary modes stream bytes instead). */
export interface ExportResult {
  ok: boolean;
  format: ExportFormat;
  /** Absolute path the file was written to (CLI `--out` / desktop Save dialog). */
  path?: string;
  /** Byte size of the produced file when known. */
  bytes?: number;
  /** The user dismissed the desktop Save dialog — treated as a successful no-op. */
  canceled?: boolean;
  error?: string;
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function isExportImageFormat(value: unknown): value is ExportImageFormat {
  return typeof value === 'string' && (EXPORT_IMAGE_FORMATS as readonly string[]).includes(value);
}
