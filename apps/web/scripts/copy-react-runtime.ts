/**
 * Stage the React UMD builds the component preview needs into `public/`.
 *
 * `runtime/react-component.ts` builds a sandboxed document that renders an
 * authored `.tsx`/`.jsx` component. That document is a separate browsing
 * context with no `allow-same-origin`, so it cannot borrow the application's
 * own React — it has to load a copy over the network. Pointing that at a CDN is
 * what made the surface fail in the packaged client offline and behind
 * firewalls; the Preview Lab corpus run attributed 8 of its 12 white screens to
 * `external-network-required`.
 *
 * The copies are generated rather than committed. `react` is already a
 * dependency of this app, so it is the single source of truth: a version bump
 * restages automatically and there is no vendored duplicate anyone has to
 * remember to re-sync. The output is gitignored.
 *
 * Production builds, not development: development React is 1.16 MB against
 * 139 KB here, and the preview harness renders thrown errors into its own panel
 * either way.
 */
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'vendor', 'react-runtime');

const ASSETS = [
  { pkg: 'react', file: 'umd/react.production.min.js' },
  { pkg: 'react-dom', file: 'umd/react-dom.production.min.js' },
] as const;

function packageRoot(pkg: string): string {
  return dirname(require.resolve(`${pkg}/package.json`));
}

function isCurrent(from: string, to: string): boolean {
  try {
    const a = statSync(from);
    const b = statSync(to);
    return a.size === b.size && b.mtimeMs >= a.mtimeMs;
  } catch {
    return false;
  }
}

mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const asset of ASSETS) {
  const from = join(packageRoot(asset.pkg), asset.file);
  const to = join(outDir, asset.file.split('/').pop()!);
  // Fail loudly rather than leave a preview that 404s at runtime: React
  // dropped UMD builds after 18, so a major bump has to be a deliberate
  // decision here, not a silently missing file.
  if (!statSync(from).isFile()) {
    throw new Error(`${asset.pkg} has no ${asset.file}; the preview harness needs a UMD build.`);
  }
  if (isCurrent(from, to)) continue;
  copyFileSync(from, to);
  copied += 1;
}

const version = JSON.parse(
  readFileSync(join(packageRoot('react'), 'package.json'), 'utf8'),
) as { version: string };
if (copied > 0) {
  process.stdout.write(`staged react ${version.version} preview runtime into public/vendor/react-runtime\n`);
}
