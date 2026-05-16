import { build } from "esbuild";

await build({
  banner: {
    js: "#!/usr/bin/env node",
  },
  bundle: true,
  entryNames: "[name]",
  entryPoints: ["./src/index.ts"],
  format: "esm",
  outdir: "./dist",
  outExtension: {
    ".js": ".mjs",
  },
  packages: "external",
  platform: "node",
  target: "node24",
});
