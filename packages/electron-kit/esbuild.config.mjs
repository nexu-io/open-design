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
  "contracts/index": "contracts/index",
  "integrations/shortcuts/index": "integrations/shortcuts/index",
  "distribution/index": "distribution/index",
  "platform/windows/index": "platform/windows/index",
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
  entryPoints: ["./src/fixtures/lifecycle/sidecar.ts"],
  format: "cjs",
  outfile: "./dist/fixtures/lifecycle/sidecar.cjs",
  platform: "node",
  target: "node24",
});
