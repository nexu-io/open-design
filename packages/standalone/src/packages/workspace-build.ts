import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, readdir, readlink, realpath, rm, symlink, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const inside = (root: string, path: string) => {
  const suffix = relative(root, path);
  return !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith("../") && !suffix.startsWith("..\\");
};

export type DeployWorkspacePackageInput = Readonly<{
  workspaceRoot: string;
  packageDirectory: string;
  outputRoot: string;
  /** Caller-selected pinned pnpm executable; otherwise use PATH. */
  pnpmPath?: string;
}>;

/** Export already-built production dependencies. This never installs from the
 * network, executes lifecycle scripts, builds sources or chooses cache identity.
 * Keep the enclosing directory when archiving: package self-links remain internal. */
export async function deployWorkspacePackage(input: DeployWorkspacePackageInput) {
  if (![input.workspaceRoot, input.packageDirectory, input.outputRoot].every(isAbsolute)) {
    throw new Error("workspace package deployment paths must be absolute");
  }
  const workspace = await realpath(input.workspaceRoot), source = await realpath(input.packageDirectory);
  const output = resolve(input.outputRoot);
  if (!inside(workspace, source) || source === workspace || inside(source, output)) {
    throw new Error("package deployment requires an owned workspace package and separate output");
  }
  const workspaceManifest = JSON.parse(await readFile(join(workspace, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const manager = /^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/u.exec(workspaceManifest.packageManager ?? "");
  if (!manager || typeof manifest.name !== "string" || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(manifest.name)
    || typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error("package deployment requires a named package and pinned pnpm workspace");
  }
  const pnpm = input.pnpmPath ?? "pnpm";
  const version = await execute(pnpm, ["--version"], { cwd: workspace, timeout: 15_000 });
  if (version.stdout.trim() !== manager[1]) throw new Error("workspace pnpm version mismatch");
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output); // Refuse an existing destination; cleanup owns only this directory.
  try {
    const root = await realpath(output), packageRoot = join(root, "package");
    if (inside(source, root)) throw new Error("package deployment requires separate output");
    await execute(pnpm, ["--filter", manifest.name,
      "deploy", "--legacy", "--prod", "--offline", "--ignore-scripts", packageRoot],
    { cwd: workspace, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
    const deployed = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    if (deployed.name !== manifest.name || deployed.version !== manifest.version) throw new Error("deployed package identity mismatch");
    const links: string[] = [];
    const directories = [packageRoot];
    let entries = 0;
    while (directories.length) {
      const directory = directories.pop()!;
      for (const name of await readdir(directory)) {
        if (++entries > 100_000) throw new Error("portable package inventory exceeds bound");
        const path = join(directory, name), stat = await lstat(path);
        if (stat.isDirectory()) directories.push(path);
        else if (stat.isSymbolicLink()) links.push(path);
        else if (!stat.isFile()) throw new Error("portable package contains a special entry");
      }
    }
    // pnpm legacy deployment can retain one self-reference to its source package.
    // Normalize only that verified identity, never arbitrary workspace dependencies.
    for (const path of links) {
      const target = await readlink(path), resolved = resolve(dirname(path), target);
      if (inside(packageRoot, resolved) && !isAbsolute(target)) continue;
      if (await realpath(path) !== source) throw new Error("portable package link escapes its deployment");
      await unlink(path);
      await symlink(relative(dirname(path), packageRoot), path, "dir");
    }
    // Resolve chains only after self-reference normalization; dangling/cyclic or
    // transitively external links must not become a reusable package artifact.
    for (const path of links) {
      if (!inside(packageRoot, await realpath(path))) throw new Error("portable package link escapes its deployment");
    }
    return Object.freeze({ root, packageRoot, name: manifest.name as string, version: deployed.version as string });
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}
