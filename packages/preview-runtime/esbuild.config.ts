import { build } from 'esbuild';

await build({
  bundle: true,
  entryNames: '[dir]/[name]',
  entryPoints: [
    './src/index.ts',
    './src/font-stylesheet.ts',
    './src/manual-edit.ts',
    './src/manual-edit-source.ts',
    './src/srcdoc.ts',
  ],
  format: 'esm',
  outbase: './src',
  outdir: './dist',
  outExtension: { '.js': '.mjs' },
  packages: 'external',
  platform: 'neutral',
  target: 'es2022',
});
