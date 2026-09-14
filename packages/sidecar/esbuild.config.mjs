import { build } from "esbuild";

const shared = {
  bundle: true,
  format: "esm",
  packages: "external",
  platform: "node",
  target: "node24",
};

await Promise.all([
  build({ ...shared, entryPoints: ["./src/index.ts"], outfile: "./dist/index.mjs" }),
  build({ ...shared, entryPoints: ["./src/supervisor.ts"], outfile: "./dist/supervisor.mjs" }),
]);
