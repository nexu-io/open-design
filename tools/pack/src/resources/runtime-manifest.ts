import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative } from "node:path";

/** Read-only validation of the collected application, including cache hits. */
export async function assertPackagedSidecarRuntime(appRoot: string, entries: readonly string[]): Promise<void> {
  const root = await realpath(appRoot);
  async function ownedFile(file: string): Promise<string> {
    const resolved = await realpath(file);
    const within = relative(root, resolved);
    if (within === ".." || within.startsWith("../") || within.startsWith("..\\") || isAbsolute(within)
      || !(await stat(resolved)).isFile()) throw new Error(`runtime file is outside the app or not a file: ${file}`);
    return resolved;
  }
  for (const entry of entries) {
    const entryPath = await ownedFile(join(root, entry));
    const sidecar = await ownedFile(createRequire(entryPath).resolve("@open-design/sidecar"));
    const supervisor = await ownedFile(join(dirname(sidecar), "supervisor.mjs"));
    await ownedFile(createRequire(sidecar).resolve("@open-design/platform"));
    await ownedFile(createRequire(supervisor).resolve("@open-design/platform"));
  }
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>;
  };
  for (const [name, value] of Object.entries({...manifest.dependencies, ...manifest.optionalDependencies})) {
    if (value.startsWith("file:")) throw new Error(`build-only runtime dependency remains: ${name}`);
  }
}

/** Installation uses local tarballs; the shipped manifest describes installed versions. */
export async function finalizeRuntimeManifest(appRoot: string): Promise<void> {
  const root = await realpath(appRoot);
  const manifestPath = join(root, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  let changed = false;
  for (const dependencies of [manifest.dependencies, manifest.optionalDependencies]) {
    for (const [name, specifier] of Object.entries(dependencies ?? {})) {
      if (!specifier.startsWith("file:")) continue;
      const installedPath = await realpath(join(root, "node_modules", name, "package.json"));
      const within = relative(root, installedPath);
      if (within === ".." || within.startsWith("../") || within.startsWith("..\\") || isAbsolute(within)) {
        throw new Error(`runtime dependency resolves outside assembled app: ${name}`);
      }
      const installed = JSON.parse(await readFile(installedPath, "utf8")) as { name?: string; version?: string };
      if (installed.name !== name || typeof installed.version !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(installed.version)) {
        throw new Error(`invalid installed runtime dependency: ${name}`);
      }
      dependencies![name] = installed.version;
      changed = true;
    }
  }
  if (changed) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
