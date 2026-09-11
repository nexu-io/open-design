import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, cp, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { createPackageWithOptions, getRawHeader, uncache } from "@electron/asar";
import { validateElectronShellManifest, type ElectronShellManifest } from "../../contracts/index.js";
import { assertMacBaseObjectsUnchanged, type MacBaseSeal } from "./base-seal.js";

const execute = promisify(execFile);
const carrierFiles = ["main.cjs", "renderer-mount-preload.cjs", "carrier.json"] as const;
type Run = (command: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;
function overlaps(a: string, b: string): boolean {
  const distance = relative(a, b);
  return distance === "" || (!isAbsolute(distance) && distance !== ".." && !distance.startsWith("../"));
}

/** Only the outer version projection is mutable. Helpers and Frameworks have
 * already received their final identity and signatures in the reusable base.
 * This operation neither signs nor performs electron-builder's runtime rewrite. */
export async function projectMacBaseVersion(input: Readonly<{
  baseAppPath: string; seal: MacBaseSeal; appPath: string;
  carrierDirectory: string; manifest: ElectronShellManifest;
  resources: readonly Readonly<{ name: string; path: string }>[];
  run?: Run;
}>): Promise<void> {
  const manifest = validateElectronShellManifest(input.manifest);
  const source = resolve(input.baseAppPath), destination = resolve(input.appPath);
  if (overlaps(source, destination) || overlaps(destination, source)
    || overlaps(destination, resolve(input.carrierDirectory))) throw new Error("Electron base projection paths overlap");
  const names = new Set<string>();
  for (const resource of input.resources) {
    if (!/^[a-z][a-z0-9.-]{0,127}$/u.test(resource.name) || names.has(resource.name)
      || ["app.asar", "electron.icns"].includes(resource.name)) throw new Error("invalid Electron base projection resource");
    names.add(resource.name);
    if (!isAbsolute(resource.path) || overlaps(destination, resolve(resource.path)) || !(await lstat(resource.path)).isFile()) {
      throw new Error("invalid Electron base projection resource source");
    }
  }
  const run: Run = input.run ?? ((command, args) => execute(command, [...args]));
  const sourcePlist = join(source, "Contents/Info.plist");
  const original = JSON.parse((await run("/usr/bin/plutil", ["-convert", "json", "-o", "-", sourcePlist])).stdout);
  if (original.CFBundleIdentifier !== manifest.appId || original.CFBundleExecutable !== manifest.executableName
    || original.CFBundleName !== manifest.productName) throw new Error("Electron base native identity mismatch");
  // Base production must not retain a version-bound outer seal or payload.
  for (const path of ["Contents/_CodeSignature", "Contents/Resources/app.asar"]) {
    try { await lstat(join(source, path)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    throw new Error("Electron base contains an outer signature or version payload");
  }
  await assertMacBaseObjectsUnchanged(source, input.seal);
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination); // Never replace an existing installation or result.
  const scratch = await mkdtemp(join(tmpdir(), "electron-version-projection-"));
  try {
    for (const name of await readdir(source)) {
      await cp(join(source, name), join(destination, name), { recursive: true, verbatimSymlinks: true, force: false, errorOnExist: true });
    }
    const carrier = join(scratch, "carrier"); await mkdir(carrier);
    for (const name of carrierFiles) {
      const file = join(input.carrierDirectory, name);
      if (!(await lstat(file)).isFile()) throw new Error("Electron carrier projection requires physical files");
      await copyFile(file, join(carrier, name));
    }
    await writeFile(join(carrier, "shell.json"), JSON.stringify(manifest));
    await writeFile(join(carrier, "package.json"), JSON.stringify({ name: manifest.executableName,
      version: manifest.version, private: true, main: "main.cjs" }));
    const resourceRoot = join(destination, "Contents/Resources");
    await mkdir(resourceRoot, { recursive: true });
    const archive = join(resourceRoot, "app.asar");
    await createPackageWithOptions(carrier, archive, {});
    const header = getRawHeader(archive);
    const integrity = { algorithm: "SHA256", hash: createHash("sha256").update(header.headerString).digest("hex") };
    uncache(archive);
    for (const resource of input.resources) {
      // Exclusive copy: installation input may not replace base-owned resources.
      await copyFile(resource.path, join(resourceRoot, resource.name), constants.COPYFILE_EXCL);
    }
    const plist = { ...original, CFBundleVersion: manifest.version, CFBundleShortVersionString: manifest.version,
      ElectronAsarIntegrity: { "Resources/app.asar": integrity } };
    const plistPath = join(destination, "Contents/Info.plist");
    await writeFile(plistPath, JSON.stringify(plist));
    await run("/usr/bin/plutil", ["-convert", "xml1", plistPath]);
    await assertMacBaseObjectsUnchanged(destination, input.seal);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
