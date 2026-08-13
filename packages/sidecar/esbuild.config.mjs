import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: {
    index: "./src/index.ts",
    "control/index": "./src/control/index.ts",
    "lifecycle/index": "./src/lifecycle/index.ts",
  },
  format: "esm",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  target: "node24",
});
