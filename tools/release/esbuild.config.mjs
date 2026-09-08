import { build } from "esbuild";

await build({
  banner: {
    js: "#!/usr/bin/env node",
  },
  bundle: true,
  entryPoints: ["./src/index.ts"],
  format: "esm",
  outfile: "./dist/index.mjs",
  packages: "external",
  platform: "node",
  target: "node24",
});

await build({
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as exactCreateRequire } from 'node:module'; const require = exactCreateRequire(import.meta.url);" },
  bundle: true,
  entryPoints: ["./src/exact/control-cli.ts"],
  // Electron built-in used only by ASAR's Electron host branch. This controller
  // runs under Node, whose branch uses fs; do not bundle an Electron runtime.
  external: ["original-fs"],
  format: "esm",
  outfile: "./dist/exact-control.mjs",
  platform: "node",
  target: "node24",
});
