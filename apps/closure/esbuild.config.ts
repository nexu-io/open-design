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
