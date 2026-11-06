import { build } from "esbuild";

const entryPoints = ["./src/index.ts"];

await Promise.all([
  build({
    bundle: true,
    entryPoints,
    format: "esm",
    outbase: "./src",
    outdir: "./dist",
    outExtension: { ".js": ".mjs" },
    packages: "external",
    platform: "neutral",
    target: "es2024",
  }),
  build({
    bundle: true,
    entryPoints,
    format: "cjs",
    outbase: "./src",
    outdir: "./dist",
    outExtension: { ".js": ".cjs" },
    packages: "external",
    platform: "node",
    target: "node24",
  }),
]);
