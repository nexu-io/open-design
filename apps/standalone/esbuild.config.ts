import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: [
    "./src/index.ts",
    "./src/bootloader.ts",
    "./src/bootstrap.ts",
    "./src/bootstrap-entry.ts",
    "./src/fossil-bootloader.ts",
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

// The Shell executes this fossil using its official Node. It must carry every
// Standalone selection/Store dependency and never resolve modules from Shell.
await build({
  bundle: true,
  entryPoints: { launcher: "./src/bootstrap-entry.ts" },
  format: "esm",
  outdir: "./dist/bootstrap/baseline",
  outExtension: { ".js": ".mjs" },
  packages: "bundle",
  platform: "node",
  target: "node24",
});

await build({
  bundle: true,
  entryPoints: { bootloader: "./src/fossil-bootloader.ts" },
  external: ["./baseline/launcher.mjs"],
  format: "esm",
  outdir: "./dist/bootstrap",
  outExtension: { ".js": ".mjs" },
  packages: "bundle",
  platform: "node",
  target: "node24",
});
