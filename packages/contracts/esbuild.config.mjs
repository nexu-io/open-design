import { build } from "esbuild";

await build({
  bundle: true,
  entryNames: "[dir]/[name]",
  entryPoints: [
    "./src/index.ts",
    "./src/critique.ts",
    "./src/api/connectionTest.ts",
    "./src/api/amrWallet.ts",
    "./src/api/orbit.ts",
    "./src/api/finalize.ts",
    "./src/api/handoff.ts",
    "./src/api/providerModels.ts",
    "./src/api/reasoningExecution.ts",
    "./src/api/research.ts",
    "./src/design-systems/components-manifest.ts",
    "./src/design-systems/derived-token-outputs.ts",
    "./src/design-systems/token-schema.ts",
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
