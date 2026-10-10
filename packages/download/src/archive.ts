import { spawnSync } from "node:child_process";
import { lstatSync, readlinkSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, win32 } from "node:path";

export type ArchiveFormat = "tar.gz" | "zip";

/** Native archive tools are injected by callers/environment, never installed here. */
export function archiveExecutable(platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (env.OD_ARCHIVE_TAR) return env.OD_ARCHIVE_TAR;
  if (platform !== "win32") return "tar";
  if (!env.SystemRoot || !win32.isAbsolute(env.SystemRoot)) throw new Error("Windows SystemRoot is required for native tar");
  // Avoid Git Bash GNU tar treating drive letters as remote archive hosts.
  return win32.join(env.SystemRoot, "System32", "tar.exe");
}

function run(executable: string, args: string[], input?: string): string {
  const result = spawnSync(executable, args, { input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`archive tool failed (${result.signal ?? result.status}): ${result.stderr}`);
  return result.stdout;
}

function validateEntry(entry: string): void {
  if (!entry || entry.startsWith("/") || entry.includes("\\") || entry.includes(":")
    || entry.split("/").includes("..") || entry.startsWith("-")) throw new Error(`unsafe archive entry: ${entry}`);
}

export function listArchive(archive: string, format: ArchiveFormat): string[] {
  const listing = format === "zip" && process.platform === "linux"
    ? run(process.env.OD_ARCHIVE_UNZIP || "unzip", ["-Z1", archive])
    : run(archiveExecutable(), ["-tf", archive]);
  const entries = listing.trim().split(/\r?\n/).filter(Boolean);
  entries.forEach(validateEntry);
  return entries;
}

/** Caller supplies a fresh staging directory and validates its application manifest. */
export function extractArchive(archive: string, destination: string, format: ArchiveFormat, entries?: string[]): void {
  (entries ?? listArchive(archive, format)).forEach(validateEntry);
  if (format === "zip" && process.platform === "linux") {
    run(process.env.OD_ARCHIVE_UNZIP || "unzip", ["-q", archive, ...(entries ?? []), "-d", destination]);
  } else {
    run(archiveExecutable(), ["-xf", archive, "-C", destination, ...(entries ?? [])]);
  }
}

export function readTarEntry(archive: string, entry: string): string {
  validateEntry(entry);
  return run(archiveExecutable(), ["-xOf", archive, entry]);
}

/** Dereference producer-owned links so consumers do not inherit pnpm symlinks. */
export function createTarArchive(archive: string, sources: { directory: string; entries: string[] }[], options: { dereference?: boolean; reproducible?: boolean } = {}): void {
  const args = sources.flatMap(({ directory, entries }) => {
    entries.forEach(validateEntry);
    return ["-C", directory, ...entries];
  });
  const executable = archiveExecutable();
  if (!options.reproducible) {
    run(executable, [options.dereference === false ? "-czf" : "-czhf", archive, ...args]);
    return;
  }
  const version = run(executable, ["--version"]);
  if (version.includes("GNU tar")) {
    run(executable, ["--format=gnu", "--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", options.dereference === false ? "-czf" : "-czhf", archive, ...args]);
    return;
  }
  if (!version.includes("bsdtar")) throw new Error("reproducible archives require GNU tar or bsdtar");
  // BSD tar accepts an mtree archive as input. Declare metadata instead of
  // copying large trees or mutating producer mtimes; contents stay native I/O.
  const escape = (value: string) => value.replace(/[\\\s#=]/g, (char) => `\\${char.charCodeAt(0).toString(8).padStart(3, "0")}`);
  const manifest = ["#mtree", "/set uid=0 gid=0 uname=root gname=root time=0"];
  const names = new Set<string>();
  function visit(directory: string, entry: string, ancestors: Set<string>): void {
    validateEntry(entry);
    if (names.has(entry)) throw new Error(`duplicate archive entry: ${entry}`);
    names.add(entry);
    const path = resolve(directory, entry);
    const stat = options.dereference === false ? lstatSync(path) : statSync(path);
    const mode = (stat.mode & 0o777).toString(8);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(path);
      const targetPath = relative(resolve(directory), resolve(dirname(path), target));
      if (!target || target.startsWith("/") || target.includes("\\") || targetPath === ".." || targetPath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(targetPath)) {
        throw new Error(`unsafe archive link: ${entry}`);
      }
      manifest.push(`${escape(entry)} type=link mode=${mode} link=${escape(target)}`);
    } else if (stat.isDirectory()) {
      const real = realpathSync(path);
      if (ancestors.has(real)) throw new Error(`archive directory cycle: ${entry}`);
      manifest.push(`${escape(entry)} type=dir mode=${mode}`);
      const next = new Set([...ancestors, real]);
      for (const child of readdirSync(path).sort()) visit(directory, join(entry, child).replaceAll("\\", "/"), next);
    } else if (stat.isFile()) {
      // mtree otherwise inherits the source link count and inode. On Windows,
      // pnpm's content-store hardlinks can make bsdtar coalesce unrelated
      // archive entries, replacing their bytes with the first file it saw.
      manifest.push(`${escape(entry)} type=file mode=${mode} nlink=1 size=${stat.size} contents=${escape(path)}`);
    } else throw new Error(`unsupported archive entry: ${entry}`);
  }
  for (const source of sources) for (const entry of [...source.entries].sort()) visit(source.directory, entry, new Set());
  run(executable, ["-czf", archive, "--format=gnutar", "@-"], manifest.join("\n") + "\n");
}
