import { build } from "esbuild";

await build({
  bundle: true,
  entryNames: "[name]",
  entryPoints: ["./src/index.ts", "./src/critique.ts"],
  format: "esm",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  target: "node24",
});
