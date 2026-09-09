import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ArchiveBackend, ArchiveOptions, ArchiveTool } from "./contracts.js";
export const execute = promisify(execFile);
const probes = new Map<string, Promise<ArchiveBackend>>();
async function locate(executable: string, env: NodeJS.ProcessEnv) {
  const paths = isAbsolute(executable) || executable.includes("/") || executable.includes("\\")
    ? [resolve(executable)] : (env.PATH ?? "").split(delimiter).flatMap(directory =>
      process.platform === "win32" ? [join(directory, executable), join(directory, executable + ".exe")] : [join(directory, executable)]);
  for (const path of paths) { try { await access(path, constants.X_OK); return path; } catch {} }
  throw new Error("archive executable not found: " + executable);
}
/** Resolve once; explicit configuration never falls back to another tool. */
export async function resolveArchiveBackend(operation: "pack" | "extract", options: ArchiveOptions = {}): Promise<ArchiveBackend> {
  const env = options.env ?? process.env;
  const configured = options.tool ?? (env.ARCHIVE_7Z_PATH ? { kind: "7z" as const, executable: env.ARCHIVE_7Z_PATH }
    : operation === "pack" && env.ARCHIVE_ZIP_PATH ? { kind: "zip" as const, executable: env.ARCHIVE_ZIP_PATH }
    : operation === "extract" && env.ARCHIVE_UNZIP_PATH ? { kind: "unzip" as const, executable: env.ARCHIVE_UNZIP_PATH } : undefined);
  if (configured && ((operation === "pack" && configured.kind === "unzip") || (operation === "extract" && configured.kind === "zip"))) throw new Error("archive backend does not support operation");
  const candidates = configured ? [configured] : [
    { kind: "7z" as const, executable: "7zz" }, { kind: "7z" as const, executable: "7z" },
    { kind: operation === "pack" ? "zip" as const : "unzip" as const, executable: operation === "pack" ? "zip" : "unzip" },
  ];
  for (const candidate of candidates) {
    let executable: string;
    try { executable = await locate(candidate.executable, env); } catch (error) { if (configured) throw error; continue; }
    const key = candidate.kind + ":" + executable;
    let probe = probes.get(key);
    if (!probe) {
      probe = (async () => {
        const { stdout } = await execute(executable, candidate.kind === "7z" ? ["i"] : ["-v"], { env, timeout: 3000, maxBuffer: 256 * 1024, encoding: "utf8" });
        const version = candidate.kind === "7z" ? stdout.match(/7-Zip[^\r\n]*/u)?.[0]
          : candidate.kind === "zip" ? stdout.match(/Zip \d[^\r\n]*/u)?.[0] : stdout.match(/UnZip \d[^\r\n]*/u)?.[0];
        if (!version) throw new Error("unrecognized archive backend: " + executable);
        return { kind: candidate.kind as ArchiveTool, executable, version };
      })();
      probes.set(key, probe); probe.catch(() => probes.delete(key));
    }
    return probe;
  }
  throw new Error("no supported archive backend; inject an executable or configure PATH");
}
