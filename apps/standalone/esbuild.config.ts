import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["./src/index.ts", "./src/bootloader.ts", "./src/process-bridge.ts", "./src/sidecars.ts"],
  format: "esm",
  outbase: "./src",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  target: "node24",
});
