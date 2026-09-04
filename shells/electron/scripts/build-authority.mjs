import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

export async function buildElectronStandaloneAuthority(outputRoot) {
  const root = resolve(outputRoot);
  await mkdir(root, { recursive: true });
  const hostPath = resolve(root, "standalone-host.mjs");
  const supervisorPath = resolve(root, "supervisor.mjs");
  const shared = {
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
  };
  await Promise.all([
    build({
      ...shared,
      entryPoints: [fileURLToPath(new URL("../src/adapters/standalone/host.ts", import.meta.url))],
      outfile: hostPath,
    }),
    // Sidecar's package build intentionally externalizes workspace packages.
    // A Shell release instead needs one self-contained supervisor resource.
    build({
      ...shared,
      entryPoints: [fileURLToPath(new URL("../../../packages/sidecar/src/supervisor.ts", import.meta.url))],
      outfile: supervisorPath,
    }),
  ]);
  return Object.freeze({
    host: Object.freeze({ name: "standalone-host.mjs", path: hostPath }),
    supervisor: Object.freeze({ name: "supervisor.mjs", path: supervisorPath }),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputRoot = process.argv[2];
  if (outputRoot == null) throw new Error("usage: build-authority.mjs <output-root>");
  process.stdout.write(`${JSON.stringify(await buildElectronStandaloneAuthority(outputRoot), null, 2)}\n`);
}
