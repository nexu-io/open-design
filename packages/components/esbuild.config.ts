import { rmSync } from 'node:fs';

import { build } from 'esbuild';

rmSync('./dist', { force: true, recursive: true });

await build({
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
