import { build } from 'esbuild';

await build({
  bundle: true,
  entryPoints: ['./src/index.ts'],
  format: 'esm',
  outbase: './src',
  outdir: './dist',
  outExtension: { '.js': '.mjs' },
  packages: 'external',
  platform: 'node',
  target: 'node24',
});
