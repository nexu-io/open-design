import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["./src/index.ts", "./src/launcher.ts"],
  format: "esm",
  outbase: "./src",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  platform: "node",
  target: "node24",
});

// Build-only producer API; do not change the self-contained runtime closure.
await build({
  bundle: true,
  entryPoints: ["./src/build/data-resources.ts", "./src/build/runtime-resources.ts"],
  packages: "external",
  format: "esm",
  outbase: "./src",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  platform: "node",
  target: "node24",
});
