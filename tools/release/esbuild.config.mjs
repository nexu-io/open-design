import { build } from "esbuild";

await build({
  banner: {
    // yaml's Node entry is CommonJS and reads built-ins via require(). The
    // bundled ESM CLI needs a real Node require for esbuild's CJS bridge.
    js: "#!/usr/bin/env node\nimport { createRequire as createBundleRequire } from 'node:module';\nconst require = createBundleRequire(import.meta.url);",
  },
  bundle: true,
  entryPoints: ["./src/index.ts"],
  external: ["sharp"],
  format: "esm",
  outfile: "./dist/index.mjs",
  platform: "node",
  target: "node24",
});
