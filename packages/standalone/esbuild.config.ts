import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["./src/index.ts"],
  outbase: "./src",
  format: "esm",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  platform: "node",
  target: "node24",
});
