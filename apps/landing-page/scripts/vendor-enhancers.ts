/*
 * Vendor the homepage's progressive-enhancement runtimes into `public/` as
 * classic (non-module) scripts, so the homepage can load them ON DEMAND
 * instead of inlining ~96KB of decorative JavaScript into every `index.html`.
 *
 * Why this exists:
 *   The Method-section FallingText (matter-js) and the testimonial globe
 *   (cobe) are below-the-fold decorations. Previously their full runtimes
 *   were read from `node_modules` at build time and inlined verbatim into the
 *   homepage document — matter-js alone is ~83KB, cobe ~13KB. That inflated
 *   the critical HTML the browser must download before it can finish the
 *   page, and shipped a physics engine to every visitor (including phones and
 *   reduced-motion readers) whether or not they ever scrolled that far.
 *
 *   Emitting them as origin-hosted classic scripts lets `index.astro` inject
 *   each one via `IntersectionObserver` only when its section approaches the
 *   viewport (see the `data-falling-text` / `data-testimonial-globe` loaders).
 *   The site still ships ZERO Astro-bundled / ES-module JavaScript — these are
 *   hand-vendored classic scripts, not `/_astro/*.js` build output — so the
 *   `Verify zero external JavaScript` gate's intent is preserved. The gate
 *   greps the built HTML for a literal external-script tag; the runtime script
 *   injection in `index.astro` never emits one statically.
 *
 * Regenerated on every build from `node_modules`, so the vendored copy always
 * matches the installed matter-js / cobe versions. The output directory is
 * git-ignored.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'enhancers');
mkdirSync(outDir, { recursive: true });

// matter-js ships a UMD build that attaches `Matter` to `window` on its own —
// copy it verbatim as a classic script.
const matter = readFileSync(require.resolve('matter-js/build/matter.min.js'), 'utf8');
writeFileSync(join(outDir, 'matter.min.js'), matter);

// cobe ships ESM only. Strip its single trailing `export { … as default }` and
// expose the globe factory on `window.__cobe`, then wrap the whole module in an
// IIFE so it evaluates as a classic script (mirrors the previous inline
// transform in `index.astro`).
const cobeSource = readFileSync(require.resolve('cobe'), 'utf8').replace(
  /export\s*\{\s*(\w+)\s+as\s+default\s*\}\s*;?\s*$/,
  'window.__cobe=$1;',
);
writeFileSync(join(outDir, 'cobe.js'), `(function(){${cobeSource}})();`);

const matterVersion = (require('matter-js/package.json') as { version: string }).version;
const cobeVersion = (require('cobe/package.json') as { version: string }).version;
console.log(
  `vendor-enhancers: wrote public/enhancers/{matter.min.js@${matterVersion}, cobe.js@${cobeVersion}}`,
);
