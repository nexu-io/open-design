import { mkdir, rm } from "node:fs/promises";

import { build } from "esbuild";

await rm("./dist", { force: true, recursive: true });
await mkdir("./dist", { recursive: true });
await build({
  bundle: true,
  entryPoints: ["./src/index.ts"],
  format: "esm",
  outfile: "./dist/index.mjs",
  packages: "external",
  platform: "node",
  target: "node24",
});
await build({
  bundle: true,
  entryPoints: ["./src/runtime-api.ts"],
  format: "esm",
  outfile: "./dist/runtime-api.mjs",
  packages: "external",
  platform: "node",
  target: "node24",
});
const publicEntries = {
  "boundary/index": "boundary/index",
  "bootstrap/index": "bootstrap/index",
  "carrier/index": "carrier/index",
  "installer/index": "installer/index",
  "warmup/index": "warmup/index",
  "sidecar/index": "sidecar/index",
  "lifecycle/fixture-port": "lifecycle/fixture-port",
  "updater/fixture-provider": "updater/fixture-provider",
  "build/index": "build/index",
  "commands/dev": "commands/dev",
  "commands/pack": "commands/pack",
};
for (const [entry, output] of Object.entries(publicEntries)) {
  await build({
    bundle: true,
    entryPoints: [`./src/${entry}.ts`],
    format: "esm",
    outfile: `./dist/${output}.mjs`,
    packages: "external",
    platform: "node",
    target: "node24",
  });
}
await build({
  bundle: true,
  entryPoints: ["./src/lifecycle/fixture-sidecar.ts"],
  format: "cjs",
  outfile: "./dist/lifecycle/fixture-sidecar.cjs",
  platform: "node",
  target: "node24",
});
