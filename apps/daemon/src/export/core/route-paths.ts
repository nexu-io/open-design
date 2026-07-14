/** @module export/core/route-paths
 * Foundation primitive: maps an export format to its daemon route path. Pure and
 * dependency-free (imports nothing) — the kernel of the export domain that every
 * subdirectory may import directly.
 */
// Pure routing helper for the `od export` CLI, extracted so it can be unit
// tested without executing the CLI entrypoint (cli.ts runs argv dispatch on
// import). All three formats rasterize through the desktop screenshot renderer
// so the CLI output matches the web UI exactly.
//
// In particular `pdf` maps to `/export/pdf-image` (one raster page per deck
// slide, or per viewport for a long page) — NOT the generic `/export` route,
// whose `desktopArtifactExporter` renders vector PDF via `printToPDF()` and
// drops CJK glyphs in the packaged runtime. The UI was switched to the raster
// path for that reason, and the CLI must not diverge.
/**
 * Maps an `od export` format to the daemon route path that rasterizes it: `pptx` and
 * `image` map to their own routes; everything else (pdf) resolves to `export/pdf-image`
 * (per-slide raster) rather than the vector `/export` route that drops CJK glyphs when packaged.
 * @param format the requested export format.
 * @returns the daemon-relative route path.
 */
export function exportRoutePath(format: string): string {
  if (format === 'pptx') return 'export/pptx';
  if (format === 'image') return 'export/image';
  return 'export/pdf-image';
}
