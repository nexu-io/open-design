import { createHash } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
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

const digestPattern = /^[a-f0-9]{64}$/;
const resourceNamePattern = /^[a-z][a-z0-9.-]{0,127}$/;

async function verifiedResource(root, descriptor, label) {
  if (descriptor == null || typeof descriptor !== "object" || Array.isArray(descriptor)) throw new Error(`Electron Standalone ${label} descriptor is invalid`);
  const { file, sha256, size } = descriptor;
  if (typeof file !== "string" || basename(file) !== file || !resourceNamePattern.test(file) || !digestPattern.test(sha256) || !Number.isSafeInteger(size) || size < 1) {
    throw new Error(`Electron Standalone ${label} descriptor is invalid`);
  }
  const path = join(root, file);
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink() || details.size !== size) throw new Error(`Electron Standalone ${label} resource differs from its descriptor`);
  const bytes = await readFile(path);
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`Electron Standalone ${label} resource failed its digest`);
  return Object.freeze({ name: file, path });
}

/** Resolve one complete, immutable installed authority resource set for scene assembly. */
export async function loadElectronStandaloneAuthorityResources(resourceRoot) {
  const root = resolve(resourceRoot);
  const installationPath = join(root, "standalone-installation.json");
  const installation = JSON.parse(await readFile(installationPath, "utf8"));
  if (installation?.schemaVersion !== 1 || !Array.isArray(installation.seeds) || installation.seeds.length === 0) throw new Error("Electron Standalone installation declaration is invalid");
  const resources = [
    Object.freeze({ name: "standalone-installation.json", path: installationPath }),
    await verifiedResource(root, installation.host, "host"),
    await verifiedResource(root, installation.supervisor, "supervisor"),
    await verifiedResource(root, installation.content, "content"),
    await verifiedResource(root, installation.trust, "trust"),
    ...await Promise.all(installation.seeds.map((seed, index) => verifiedResource(root, seed, `seed ${index}`))),
  ];
  const names = resources.map(({ name }) => name);
  if (new Set(names).size !== names.length) throw new Error("Electron Standalone installed authority resource names are not unique");
  return Object.freeze(resources);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputRoot = process.argv[2];
  if (outputRoot == null) throw new Error("usage: build-authority.mjs <output-root>");
  process.stdout.write(`${JSON.stringify(await buildElectronStandaloneAuthority(outputRoot), null, 2)}\n`);
}
