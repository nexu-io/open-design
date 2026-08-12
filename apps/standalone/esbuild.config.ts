import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: [
    "./src/index.ts",
    "./src/bootloader.ts",
    "./src/bootstrap.ts",
    "./src/launcher-bootstrap.ts",
    "./src/process-bridge.ts",
    "./src/sidecars.ts",
  ],
  format: "esm",
  outbase: "./src",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  target: "node24",
});

// launcher.mjs is the fossil-thin official-Node entry. Bundle every workspace
// dependency so it does not depend on the body package graph it is about to
// select and enter.
await build({
  bundle: true,
  entryPoints: {
    "generation-bootloader": "./src/generation-bootloader.ts",
    launcher: "./src/launcher.ts",
  },
  format: "esm",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "bundle",
  platform: "node",
  target: "node24",
});
