import { createHash } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build, type BuildOptions } from "esbuild";

type InstalledResource = Readonly<{ file: string; sha256: string; size: number }>;

export async function buildElectronStandaloneAuthority(outputRoot: string) {
  const root = resolve(outputRoot);
  await mkdir(root, { recursive: true });
  const hostPath = resolve(root, "standalone-host.mjs");
  const supervisorPath = resolve(root, "supervisor.mjs");
  const shared = {
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
  } satisfies BuildOptions;
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

const digestPattern = /^[a-f0-9]{64}$/u;
const resourceNamePattern = /^[a-z][a-z0-9.-]{0,127}$/u;

function installedResource(value: unknown, label: string): InstalledResource {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`Electron Standalone ${label} descriptor is invalid`);
  const { file, sha256, size } = value as Partial<InstalledResource>;
  if (typeof file !== "string" || basename(file) !== file || !resourceNamePattern.test(file)
    || typeof sha256 !== "string" || !digestPattern.test(sha256)
    || !Number.isSafeInteger(size) || (size as number) < 1) throw new Error(`Electron Standalone ${label} descriptor is invalid`);
  return Object.freeze({ file, sha256, size: size as number });
}

async function verifiedResource(root: string, value: unknown, label: string) {
  const descriptor = installedResource(value, label);
  const path = join(root, descriptor.file);
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink() || details.size !== descriptor.size) throw new Error(`Electron Standalone ${label} resource differs from its descriptor`);
  const bytes = await readFile(path);
  if (createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) throw new Error(`Electron Standalone ${label} resource failed its digest`);
  return Object.freeze({ name: descriptor.file, path });
}

/** Resolve one complete, immutable installed authority resource set for scene assembly. */
export async function loadElectronStandaloneAuthorityResources(resourceRoot: string) {
  const root = resolve(resourceRoot);
  const installationPath = join(root, "standalone-installation.json");
  const installation = JSON.parse(await readFile(installationPath, "utf8")) as Record<string, unknown>;
  if (installation.schemaVersion !== 1 || !Array.isArray(installation.seeds) || installation.seeds.length === 0) throw new Error("Electron Standalone installation declaration is invalid");
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
  if (outputRoot == null) throw new Error("usage: build-authority.ts <output-root>");
  process.stdout.write(`${JSON.stringify(await buildElectronStandaloneAuthority(outputRoot), null, 2)}\n`);
}
