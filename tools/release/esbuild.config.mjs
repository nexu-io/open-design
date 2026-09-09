import { build } from "esbuild";
import { chmod } from "node:fs/promises";

await build({
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as exactCreateRequire } from 'node:module'; const require = exactCreateRequire(import.meta.url);" },
  bundle: true,
  entryPoints: ["./src/index.ts"],
  // Electron built-in used only by ASAR's Electron host branch. This controller
  // runs under Node, whose branch uses fs; do not bundle an Electron runtime.
  external: ["original-fs", "sharp", "playwright"],
  format: "esm",
  outfile: "./dist/tools-release",
  platform: "node",
  target: "node24",
});
await chmod("./dist/tools-release", 0o755);
