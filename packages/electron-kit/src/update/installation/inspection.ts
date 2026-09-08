import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { extractFile, statFile, uncache } from "@electron/asar";
import { validateElectronShellManifest, type ElectronShellManifest } from "../../contracts/index.js";

const digest = (body: Buffer) => createHash("sha256").update(body).digest("hex");

/** Read physical installed bytes, not Capsule capability or an expected receipt.
 * This is an observation, not platform signature verification. No runtime starts
 * and no installed state changes. Keep this ASAR dependency out of runtime APIs.
 */
export async function readElectronInstalledManifest(resourceRoot: string) {
  if (!isAbsolute(resourceRoot) || resolve(resourceRoot) !== resourceRoot || !(await lstat(resourceRoot)).isDirectory()) {
    throw new Error("invalid Electron installation resource root");
  }
  const archivePath = join(resourceRoot, "app.asar");
  const handle = await open(archivePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let body: Buffer;
  try {
    if (!(await handle.stat()).isFile()) throw new Error("installed Electron archive must be a regular file");
    body = await handle.readFile();
  } finally { await handle.close(); }

  // ASAR's path-based reader caches headers. A private snapshot binds parsing and
  // both hashes to the same read and prevents stale cache after an installation swap.
  const temporaryRoot = await mkdtemp(join(tmpdir(), "electron-installation-inspection-"));
  const snapshot = join(temporaryRoot, "app.asar");
  try {
    await writeFile(snapshot, body, { flag: "wx", mode: 0o600 });
    const entry = statFile(snapshot, "shell.json", false);
    if ("link" in entry || "files" in entry || entry.unpacked) throw new Error("installed Electron manifest must be a packed regular file");
    const bytes = extractFile(snapshot, "shell.json", false);
    const manifest = validateElectronShellManifest(JSON.parse(bytes.toString("utf8")) as ElectronShellManifest);
    return { manifest, manifestSha256: digest(bytes), archive: { file: "app.asar", sha256: digest(body), size: body.length } };
  } finally {
    uncache(snapshot);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
