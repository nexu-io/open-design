import { rmSync } from 'node:fs';

import { build } from 'esbuild';

rmSync('./dist', { force: true, recursive: true });

await build({
  // esbuild extracts CSS imported by component modules into index.css, but
  // does not retain a reference to that file in the JavaScript bundle.
  // Packaged production resolves dist/index.mjs (unlike development, which
  // resolves src/), so attach the extracted stylesheet to that entry.
  banner: { js: 'import "./index.css";' },
  bundle: true,
  entryPoints: ['./src/index.ts'],
  format: 'esm',
  outbase: './src',
  outdir: './dist',
  outExtension: { '.js': '.mjs' },
  packages: 'external',
  platform: 'browser',
  target: 'es2022',
});
