import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["./src/index.ts", "./src/packages/index.ts", "./src/packages/build.ts"],
  external: ["esbuild"],
  outbase: "./src",
  format: "esm",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  platform: "node",
  target: "node24",
});
