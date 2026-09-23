import { lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createTarArchive, downloadCopyAndClear, extractArchive, listArchive, readTarEntry } from "@open-design/download";
import { WORKSPACE_BUILD_UNITS as units, type WorkspaceBuildUnit as Unit } from "./units.js";
import { workspaceBuildUnitResult } from "../workspace-build.js";

type Output = { schemaVersion: number; unit: Unit; platform?: string; arch?: string; webOutputMode?: string; kind?: string; outputPaths: string[] };
export type WorkspaceSource = { unit: Unit; url: string; sha256: string };

// Recovery belongs to transport, never to build selection. Missing/invalid
// products remain failures; only enumerated transient requests get a small,
// bounded backoff window. A single immediate retry is too narrow for the short
// R2 edge/network stalls seen by parallel release consumers.
function workspaceFetch(signal: AbortSignal): typeof globalThis.fetch {
  let transientFailures = 0;
  const retryDelaysMs = [100, 300, 900];
  const transientStatuses = new Set([429, 500, 502, 503, 504]);
  const transientCodes = new Set(["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);
  return async (input, init) => {
    for (;;) {
      try {
        const response = await globalThis.fetch(input, { ...init, signal });
        if (!transientStatuses.has(response.status) || transientFailures >= retryDelaysMs.length) return response;
        await response.body?.cancel();
      } catch (error) {
        const cause = error instanceof Error && error.cause != null ? error.cause : error;
        const code = typeof cause === "object" && cause != null && "code" in cause ? String(cause.code) : "";
        if (transientFailures >= retryDelaysMs.length || signal.aborted || !transientCodes.has(code)) {
          throw new Error(`workspace product request failed after ${transientFailures + 1} request(s): ${code || (error instanceof Error ? error.name : "unknown")}`, { cause: error });
        }
        process.stderr.write(`[tools-pack workspace] transient connection error code=${code}\n`);
      }
      const delayMs = retryDelaysMs[transientFailures];
      transientFailures += 1;
      process.stderr.write(`[tools-pack workspace] transient product request failed; retry ${transientFailures}/${retryDelaysMs.length} in ${delayMs}ms\n`);
      await sleep(delayMs, undefined, { signal });
    }
  };
}
function pathsOf(outputs: Output[], selected: readonly Unit[] = units): string[] {
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length || selected.some((unit) => !units.includes(unit))) throw new Error("invalid source units");
  if (!Array.isArray(outputs) || outputs.length !== selected.length) throw new Error("incomplete source output set");
  const paths: string[] = [];
  for (const [index, output] of outputs.entries()) {
    const portable = output.schemaVersion === 2 && output.kind === "javascript" && output.unit !== "web"
      && output.platform === undefined && output.arch === undefined;
    const native = output.schemaVersion === 1 && output.platform === process.platform
      && output.arch === process.arch && output.webOutputMode === "standalone";
    if ((!portable && !native) || output.unit !== selected[index] || !Array.isArray(output.outputPaths)
      || output.outputPaths.length === 0) throw new Error("incompatible source output set");
    for (const path of output.outputPaths) {
      // Generated leaf directories only. Never permit a repository/package root
      // as a deletion or replacement target, even from a checksum-verified file.
      if (!/^(packages\/[a-z0-9-]+\/dist|apps\/(daemon|web|desktop|packaged)\/dist|apps\/web\/\.next\/(standalone|static))$/.test(path)) {
        throw new Error(`unsafe source output path: ${path}`);
      }
      const owner = path.startsWith("packages/") ? "packages" : path.startsWith("apps/daemon/") ? "daemon" : path.startsWith("apps/web/") ? "web" : "shell";
      if (owner !== output.unit) throw new Error("source output belongs to another unit");
      paths.push(path);
    }
  }
  if (new Set(paths).size !== paths.length) throw new Error("duplicate source output path");
  return paths;
}

function assertMaterializedTree(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) assertMaterializedTree(join(directory, entry.name));
    else if (!entry.isFile()) throw new Error("source product contains an unmaterialized link or special file");
  }
}

export function exportWorkspaceOutputs(root: string, directory: string, outputs: Output[], selected: readonly Unit[]): string {
  const paths = pathsOf(outputs, selected);
  mkdirSync(directory, { recursive: true });
  const archive = resolve(directory, "workspace.tar.gz");
  writeFileSync(join(directory, "outputs.json"), JSON.stringify(outputs));
  createTarArchive(archive, [{ directory: root, entries: paths }, { directory: resolve(directory), entries: ["outputs.json"] }], { reproducible: true });
  return archive;
}

export async function importWorkspaceOutputs(root: string, scratch: string, source: WorkspaceSource): Promise<number> {
  const url = new URL(source.url);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || !/^[a-f0-9]{64}$/.test(source.sha256) || !units.includes(source.unit)) throw new Error("invalid workspace source");
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(join(scratch, "import-"));
  let retainRecovery = false;
  try {
    const zip = join(directory, "product.zip");
    const signal = AbortSignal.timeout(120_000);
    const result = await downloadCopyAndClear({ basePath: join(directory, "download"), bucket: "workspace", fileName: "product.zip",
      payload: { url: source.url, checksum: { algorithm: "sha256", value: source.sha256 } },
      maxAttempts: 1, signal, fetch: workspaceFetch(signal), outputPath: zip,
      onProgress: ({ receivedBytes }) => { if (receivedBytes > 2 * 1024 ** 3) throw new Error("workspace source exceeds 2 GiB"); },
    });
    const members = listArchive(zip, "zip");
    if (members.length !== 1 || members[0] !== "workspace.tar.gz") throw new Error("unexpected workspace archive");
    extractArchive(zip, directory, "zip", members);
    const archive = join(directory, "workspace.tar.gz");
    if (!lstatSync(archive).isFile()) throw new Error("workspace archive must be a regular file");
    const outputs = JSON.parse(readTarEntry(archive, "outputs.json")) as Output[];
    const selected = [source.unit];
    const paths = pathsOf(outputs, selected);
    const entries = listArchive(archive, "tar.gz");
    for (const entry of entries) {
      const path = entry.replace(/\/$/, "");
      if (path.split("/").includes("..") || path.includes("\\")
        || (path !== "outputs.json" && !paths.some((output) => path === output || path.startsWith(`${output}/`)))) {
        throw new Error("source archive escapes declared outputs");
      }
    }
    const stage = join(directory, "tree");
    mkdirSync(stage);
    // The complete listing is already validated; passing every member again
    // can exceed Windows command-line limits for large standalone trees.
    extractArchive(archive, stage, "tar.gz");
    assertMaterializedTree(stage);
    await workspaceBuildUnitResult({ workspaceRoot: stage, webOutputMode: "standalone" }, source.unit);
    for (const path of paths) {
      if (!lstatSync(join(stage, path)).isDirectory()) throw new Error("source output is not a directory");
    }
    // The consumer runs only after the complete set is committed. Retain old
    // leaves until then so a local replacement failure cannot leave mixed output.
    const moved: { destination: string; backup: string; hadPrevious: boolean; installed: boolean }[] = [];
    const backups = join(directory, "previous");
    mkdirSync(backups);
    try {
      for (const [index, path] of paths.entries()) {
        const destination = join(root, path);
        mkdirSync(dirname(destination), { recursive: true });
        const entry = { destination, backup: join(backups, String(index)), hadPrevious: false, installed: false };
        moved.push(entry);
        try { renameSync(destination, entry.backup); entry.hadPrevious = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        renameSync(join(stage, path), destination);
        entry.installed = true;
      }
    } catch (error) {
      const failures: unknown[] = [];
      for (const entry of moved.reverse()) {
        try {
          if (entry.installed) rmSync(entry.destination, { recursive: true, force: true });
          if (entry.hadPrevious) renameSync(entry.backup, entry.destination);
        } catch (rollbackError) { failures.push(rollbackError); }
      }
      if (failures.length) {
        retainRecovery = true;
        throw new AggregateError([error, ...failures], `source rollback failed; recovery retained at ${directory}`);
      }
      throw error;
    }
    return result.bytes;
  } finally {
    if (!retainRecovery) rmSync(directory, { recursive: true, force: true });
  }
}
