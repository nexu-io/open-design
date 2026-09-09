import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { pack } from "@open-design/archive/build";
import { standaloneTreeSha256 } from "@open-design/standalone";
import { buildClosureDataResources, type ClosureDataResourceArtifact } from "@open-design/closure/build-resources";

export const DEV_CLOSURE_RESOURCES_SCHEMA_VERSION = 1 as const;

type Resource = Readonly<{
  entrypoint: "sidecar.mjs";
  file: string;
  id: "open-design-daemon" | "open-design-web";
  path: string;
  treeSha256: string;
  sha256: string;
  size: number;
}>;

export type DevClosureResourcesReceipt = Readonly<{
  operation: "closure.resources.development";
  resources: readonly (Resource | ClosureDataResourceArtifact)[];
  schemaVersion: typeof DEV_CLOSURE_RESOURCES_SCHEMA_VERSION;
}>;

async function regularFile(path: string, label: string): Promise<void> {
  const info = await lstat(path).catch(() => null);
  if (info == null || !info.isFile() || info.isSymbolicLink()) throw new Error(`${label} is not a built regular file: ${path}`);
}

async function standaloneWebRoot(workspaceRoot: string): Promise<string> {
  const root = join(workspaceRoot, "apps", "web", ".next", "standalone");
  const candidates = [join(root, "apps", "web", "server.js"), join(root, "server.js")];
  for (const candidate of candidates) {
    try { await regularFile(candidate, "Web Standalone server"); }
    catch { continue; }
    // Next's standalone trace omits browser assets. The dev wrapper uses this
    // server directly, so assemble its static/public roots just as packing does.
    await cp(join(workspaceRoot, "apps", "web", ".next", "static"), join(dirname(candidate), ".next", "static"), { recursive: true, dereference: true });
    await cp(join(workspaceRoot, "apps", "web", "public"), join(dirname(candidate), "public"), { recursive: true, dereference: true });
    return root;
  }
  throw new Error(`Web Standalone output is missing under ${root}; build @open-design/web first`);
}

function wrapper(importPath: string, environment: NodeJS.ProcessEnv = {}): Buffer {
  const assignments = Object.entries(environment).map(([key, value]) => `process.env[${JSON.stringify(key)}] = ${JSON.stringify(value)};`).join("\n");
  return Buffer.from(`${assignments}${assignments.length === 0 ? "" : "\n"}await import(${JSON.stringify(pathToFileURL(importPath).href)});\n`);
}

async function archive(input: Readonly<{
  body: Buffer;
  file: string;
  id: Resource["id"];
  outputRoot: string;
}>): Promise<Resource> {
  const path = join(input.outputRoot, input.file);
  const stage = await mkdtemp(join(input.outputRoot, ".resource-"));
  let packed;
  try {
    const source = join(stage, "source"); await mkdir(source);
    await writeFile(join(source, "sidecar.mjs"), input.body);
    packed = await pack(source, join(stage, "resource.zip"), { reproducible: true, permissions: "portable" });
    // Development receipts may refresh their own local fixture artifacts.
    await rename(packed.file, path);
  } finally { await rm(stage, { recursive: true, force: true }); }
  return Object.freeze({
    entrypoint: "sidecar.mjs",
    file: input.file,
    id: input.id,
    path,
    sha256: packed.sha256,
    size: packed.size,
    treeSha256: standaloneTreeSha256([{ path: "sidecar.mjs", sha256: createHash("sha256").update(input.body).digest("hex"), size: input.body.byteLength }]),
  });
}

/** Development-only references to local producer outputs, not distributable content.
 * tools-serve signs the fixture metadata; this producer only describes bytes.
 */
export async function buildDevClosureResources(input: Readonly<{
  outputRoot: string;
  workspaceRoot: string;
}>): Promise<DevClosureResourcesReceipt> {
  const outputRoot = resolve(input.outputRoot);
  const workspaceRoot = resolve(input.workspaceRoot);
  if (outputRoot !== input.outputRoot || workspaceRoot !== input.workspaceRoot) throw new Error("Dev Closure resource paths must be absolute and normalized");
  const daemonEntry = join(workspaceRoot, "apps", "daemon", "dist", "sidecar", "index.js");
  const webEntry = join(workspaceRoot, "apps", "web", "dist", "sidecar", "index.js");
  const webRoot = await standaloneWebRoot(workspaceRoot);
  await Promise.all([regularFile(daemonEntry, "daemon Sidecar entry"), regularFile(webEntry, "Web Sidecar entry"), mkdir(outputRoot, { recursive: true })]);
  const runtimeResources = await Promise.all([
    archive({ body: wrapper(daemonEntry), file: "open-design-daemon.zip", id: "open-design-daemon", outputRoot }),
    archive({ body: wrapper(webEntry, { OD_WEB_STANDALONE_ROOT: webRoot }), file: "open-design-web.zip", id: "open-design-web", outputRoot }),
  ]);
  const resources = [...runtimeResources, ...await buildClosureDataResources({ workspaceRoot, outputDirectory: outputRoot })];
  const receipt = Object.freeze({ schemaVersion: 1 as const, operation: "closure.resources.development" as const, resources: Object.freeze(resources) });
  await writeFile(join(outputRoot, "resource-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
