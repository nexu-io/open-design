import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'dist/index.js',
  'dist/startup.js',
  'dist/invariant.js',
  'dist/types/index.d.ts',
  'dist/types/startup.d.ts',
  'dist/types/invariant.d.ts',
];

const missing = [];
for (const rel of requiredFiles) {
  try {
    await access(path.join(pkgRoot, rel));
  } catch {
    missing.push(rel);
  }
}

if (missing.length > 0) {
  console.error(
    `@open-design/dsh-runtime: missing generated entrypoints: ${missing.join(', ')}`,
  );
  process.exit(1);
}

const pkg = JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8'));
const exportTargets = [
  pkg.main,
  pkg.types,
  pkg.exports?.['.']?.default,
  pkg.exports?.['.']?.types,
  pkg.exports?.['./startup']?.default,
  pkg.exports?.['./startup']?.types,
  pkg.exports?.['./invariant']?.default,
  pkg.exports?.['./invariant']?.types,
].filter(Boolean);

for (const rel of exportTargets) {
  try {
    await access(path.join(pkgRoot, rel));
  } catch {
    console.error(`@open-design/dsh-runtime: package export target missing: ${rel}`);
    process.exit(1);
  }
}

// Prove Node can resolve the local entry modules. Peer packages may be absent in
// a packaging-only smoke environment; ignore missing external packages.
for (const rel of ['dist/index.js', 'dist/startup.js', 'dist/invariant.js']) {
  const abs = path.join(pkgRoot, rel);
  try {
    await import(pathToFileURL(abs).href);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
    const message = String(err && typeof err === 'object' && 'message' in err ? err.message : err);
    const specifierIsLocalEntrypoint =
      message.includes(`Cannot find module '${abs}'`) ||
      message.includes(`Cannot find module "${abs}"`) ||
      message.includes(`Cannot find module '${rel}'`) ||
      /Cannot find module '.*dist[/\\](index|startup|invariant)\.js'/.test(message);

    if (code === 'ERR_MODULE_NOT_FOUND' && !specifierIsLocalEntrypoint) {
      // External/peer dependency is not installed; entrypoint file itself resolved.
      continue;
    }

    console.error(`@open-design/dsh-runtime: failed to import ${rel}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('@open-design/dsh-runtime: entrypoint smoke OK');