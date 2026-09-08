import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";

await rm(new URL("./dist", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("./dist", import.meta.url), { recursive: true });

await build({ bundle: true, entryPoints: ["./src/build-api.ts"], format: "esm", outfile: "./dist/build-api.mjs", platform: "node", target: "node24" });

await build({
  banner: {
    js: "#!/usr/bin/env node",
  },
  bundle: true,
  entryPoints: ["./src/index.ts"],
  format: "esm",
  outfile: "./dist/index.mjs",
  packages: "external",
  platform: "node",
  target: "node24",
});
