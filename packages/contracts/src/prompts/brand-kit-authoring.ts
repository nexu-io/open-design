/**
 * Brand kit authoring contract — which files in a brand extraction project an
 * agent may edit, and which ones the host regenerates.
 *
 * After every chat turn in a brand project the web calls
 * `POST /api/brands/:id/finalize`, which rebuilds the whole kit
 * deterministically from the project's inputs and overwrites the outputs
 * (`brand.html`, `DESIGN.md`, everything under `system/`). An edit made
 * directly to an output is therefore lost the moment the turn ends. Authored
 * design decisions that `brand.json` cannot express live in the `overrides/`
 * layer, which the rebuild reads as an input and re-applies every time.
 *
 * One source for the daemon builder and for every prompt path that composes a
 * brand project turn, so the instructions and the rebuild cannot drift.
 */

/** Authored overrides root inside a brand extraction project. */
export const BRAND_OVERRIDES_DIR = 'overrides';

/** Authored stylesheet layered over every generated kit page. */
export const BRAND_OVERRIDES_STYLESHEET = 'overrides/brand.css';

/** Authored files that replace or add `system/<path>` after each rebuild. */
export const BRAND_OVERRIDES_SYSTEM_DIR = 'overrides/system';

/** Bundle-relative path the authored stylesheet is published at in `system/`.
 *  `url()` references in it therefore resolve relative to `system/`. */
export const BRAND_SYSTEM_OVERRIDES_STYLESHEET = 'overrides.css';

/**
 * Bundle-relative `system/` paths an override may not replace. Tokens stay
 * single-sourced from `brand.json` / `brand.json.seed`; the docs and the
 * published stylesheet are owned by the builder. Compared case-insensitively:
 * on a case-insensitive filesystem `Variables.css` overwrites `variables.css`.
 */
export function isReservedBrandSystemPath(path: string): boolean {
  const relPath = path.toLowerCase();
  return (
    relPath === 'seed.json'
    || relPath === 'theme.json'
    || relPath === 'brand-system.md'
    || relPath === BRAND_SYSTEM_OVERRIDES_STYLESHEET
    || /^tokens\.[^/]+\.json$/u.test(relPath)
    || /^variables(?:\.[^/]+)?\.css$/u.test(relPath)
  );
}

/** Prompt lines describing a brand extraction project and its authoring
 *  contract. `brandId` is interpolated into the finalize command when known. */
export function renderBrandProjectAuthoringDirective(brandId?: string | null): string[] {
  const finalize = brandId ? `od brand finalize ${brandId}` : 'od brand finalize <brandId>';
  return [
    '- **brand extraction project**: this project was created by the Brands extractor. Its kit (`DESIGN.md`, `BRAND-SYSTEM.md`, `tokens.*.json`, `theme.json`, `kit.html`, `kit.dark.html`, `artifacts/{landing,deck,poster,email,newsletter,form}.html`) is the reference for what the brand looks like. Do not restart extraction from scratch unless the user explicitly asks; explain the extracted kit, then iterate it when requested.',
    `- **brand kit authoring contract**: when this turn ends the host rebuilds the kit from its inputs and overwrites \`brand.html\`, \`DESIGN.md\`, and everything under \`system/\`. Direct edits to those files are lost. Make every change through the inputs: \`brand.json\` (palette, typography, voice, imagery, layout; engine token overrides go in \`brand.json.seed\`), \`BRAND.md\` (the prose guide), the assets in \`logos/\`, \`fonts/\`, \`imagery/\`, and the authored overrides layer. \`${BRAND_OVERRIDES_STYLESHEET}\` is layered over every generated page (component kits, artifacts, the gallery, and \`brand.html\`); it is published as \`system/${BRAND_SYSTEM_OVERRIDES_STYLESHEET}\`, so resolve its \`url()\` paths relative to \`system/\`. A file at \`${BRAND_OVERRIDES_SYSTEM_DIR}/<path>\` replaces or adds \`system/<path>\` (for example a reworked \`artifacts/newsletter.html\` or a pattern SVG); a replaced page stops following \`brand.json\`, so prefer \`brand.json\` and \`${BRAND_OVERRIDES_STYLESHEET}\` first. Token files (\`seed.json\`, \`tokens.*.json\`, \`variables*.css\`, \`theme.json\`) cannot be overridden; change \`brand.json.seed\` instead. Run \`${finalize}\` to rebuild and check the result before you finish.`,
  ];
}
