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

if (process.argv.includes("--executor")) {
  await build({
    banner: { js: "#!/usr/bin/env node\nimport { createRequire as createBundleRequire } from 'node:module';\nconst require = createBundleRequire(import.meta.url);" },
    bundle: true,
    entryPoints: ["./src/index.ts"],
    external: ["sharp"],
    format: "esm",
    outfile: "./dist/executor/index.mjs",
    platform: "node",
    target: "node24",
  });
}
