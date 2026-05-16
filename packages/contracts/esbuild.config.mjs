import { build } from "esbuild";

await build({
  bundle: true,
  entryNames: "[dir]/[name]",
  entryPoints: [
    "./src/index.ts",
    "./src/critique.ts",
    "./src/api/connectionTest.ts",
    "./src/api/orbit.ts",
    "./src/api/finalize.ts",
    "./src/api/providerModels.ts",
    "./src/api/research.ts",
    "./src/analytics/index.ts",
  ],
  format: "esm",
  outbase: "./src",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  target: "node24",
});
