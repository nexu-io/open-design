import { createHash } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import JSZip from "jszip";
import { canonicalJson, standaloneTreeSha256 } from "@open-design/standalone";

export const ELECTRON_DEV_CLOSURE_RESOURCES_SCHEMA_VERSION = 1 as const;

type Resource = Readonly<{
  entrypoint: "sidecar.mjs";
  file: string;
  id: "open-design-daemon" | "open-design-web";
  path: string;
  treeSha256: string;
}>;

export type ElectronDevClosureResourcesReceipt = Readonly<{
  operation: "electron.dev.closure-resources.build";
  resources: readonly Resource[];
  schemaVersion: typeof ELECTRON_DEV_CLOSURE_RESOURCES_SCHEMA_VERSION;
}>;

async function regularFile(path: string, label: string): Promise<void> {
  const info = await lstat(path).catch(() => null);
  if (info == null || !info.isFile() || info.isSymbolicLink()) throw new Error(`${label} is not a built regular file: ${path}`);
}

async function standaloneWebRoot(workspaceRoot: string): Promise<string> {
  const root = join(workspaceRoot, "apps", "web", ".next", "standalone");
  const candidates = [join(root, "apps", "web", "server.js"), join(root, "server.js")];
  for (const candidate of candidates) {
    try { await regularFile(candidate, "Web Standalone server"); return root; }
    catch { /* try the supported alternate Next layout */ }
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
  const zip = new JSZip();
  zip.file("sidecar.mjs", input.body, { date: new Date(0), unixPermissions: 0o100644 });
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "UNIX" });
  const path = join(input.outputRoot, input.file);
  await writeFile(path, bytes);
  return Object.freeze({
    entrypoint: "sidecar.mjs",
    file: input.file,
    id: input.id,
    path,
    treeSha256: standaloneTreeSha256([{ path: "sidecar.mjs", sha256: createHash("sha256").update(input.body).digest("hex"), size: input.body.byteLength }]),
  });
}

/** Build signed dev adapters; production resources must be self-contained. */
export async function buildElectronDevClosureResources(input: Readonly<{
  outputRoot: string;
  workspaceRoot: string;
}>): Promise<ElectronDevClosureResourcesReceipt> {
  const outputRoot = resolve(input.outputRoot);
  const workspaceRoot = resolve(input.workspaceRoot);
  if (outputRoot !== input.outputRoot || workspaceRoot !== input.workspaceRoot) throw new Error("Electron dev Closure resource paths must be absolute and normalized");
  const daemonEntry = join(workspaceRoot, "apps", "daemon", "dist", "sidecar", "index.js");
  const webEntry = join(workspaceRoot, "apps", "web", "dist", "sidecar", "index.js");
  const webRoot = await standaloneWebRoot(workspaceRoot);
  await Promise.all([regularFile(daemonEntry, "daemon Sidecar entry"), regularFile(webEntry, "Web Sidecar entry"), mkdir(outputRoot, { recursive: true })]);
  const resources = await Promise.all([
    archive({ body: wrapper(daemonEntry), file: "open-design-daemon.zip", id: "open-design-daemon", outputRoot }),
    archive({ body: wrapper(webEntry, { OD_WEB_STANDALONE_ROOT: webRoot }), file: "open-design-web.zip", id: "open-design-web", outputRoot }),
  ]);
  return Object.freeze({ schemaVersion: 1, operation: "electron.dev.closure-resources.build", resources: Object.freeze(resources) });
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const receiptPath = argument("--receipt");
  const receipt = await buildElectronDevClosureResources({
    outputRoot: argument("--output-root"),
    workspaceRoot: argument("--workspace-root"),
  });
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, canonicalJson(receipt));
}
