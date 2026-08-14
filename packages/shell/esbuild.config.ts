import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["./src/launch-context/index.ts", "./src/update/index.ts"],
  format: "esm",
  outbase: "./src",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  target: "node24",
});
