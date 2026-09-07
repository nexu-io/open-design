import { build } from "esbuild";

await build({ bundle: true, entryPoints: ["./src/build-api.ts"], format: "esm", outfile: "./dist/build-api.mjs", platform: "node", target: "node24" });

await build({
  bundle: true,
  entryPoints: ["./src/exact-api.ts"],
  format: "esm",
  outfile: "./dist/exact-api.mjs",
  platform: "node",
  target: "node24",
});

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

await build({
  banner: { js: "#!/usr/bin/env node" },
  bundle: true,
  entryPoints: ["./src/exact/control-cli.ts"],
  format: "esm",
  outfile: "./dist/exact-control.mjs",
  platform: "node",
  target: "node24",
});
