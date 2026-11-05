import { build } from "esbuild";
await build({ entryPoints: ["src/index.ts"], outfile: "dist/index.mjs", bundle: true, format: "esm", packages: "external", platform: "node", target: "node24" });
