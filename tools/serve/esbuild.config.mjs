import { build } from "esbuild";

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
