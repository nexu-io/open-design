import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { inventoryNativeTree, type NativeTreeEntry } from "../native-tree.js";

const execute = promisify(execFile);
type Run = (command: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;
export type MacBaseSigner = Readonly<{ teamIdentifier: string; certificateSha256: string }>;
export type MacBaseSeal = Readonly<{
  schemaVersion: 1;
  signer: MacBaseSigner;
  objects: readonly Readonly<{ path: string; tree: readonly NativeTreeEntry[] }>[];
}>;

function signerIdentity(signer: MacBaseSigner) {
  if (!/^[A-Z0-9]{10}$/u.test(signer.teamIdentifier) || !/^[a-f0-9]{64}$/u.test(signer.certificateSha256)) {
    throw new Error("invalid signed Electron base signer");
  }
}

/** Finite top-level nested bundles. Their signatures recursively bind internal
 * code and resources. Unknown top-level content refuses instead of becoming an
 * unverified sign-ignore subtree. */
async function objectPaths(app: string): Promise<string[]> {
  const paths: string[] = [];
  for (const directory of ["Contents/Frameworks", "Contents/Library/LoginItems"]) {
    let entries;
    try { entries = await readdir(join(app, directory), { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" && directory.endsWith("LoginItems")) continue; throw error; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !/\.(?:app|framework)$/u.test(entry.name) || entry.name.includes("\\")) {
        throw new Error(`unsupported signed Electron base object: ${entry.name}`);
      }
      paths.push(`${directory}/${entry.name}`);
    }
  }
  if (paths.length === 0) throw new Error("signed Electron base has no nested objects");
  return paths.sort();
}

async function verifySigner(path: string, signer: MacBaseSigner, run: Run) {
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", path]);
  const details = await run("/usr/bin/codesign", ["--display", "--verbose=4", path]);
  if (!`${details.stdout}\n${details.stderr}`.split("\n").includes(`TeamIdentifier=${signer.teamIdentifier}`)) {
    throw new Error("signed Electron base team mismatch");
  }
  const scratch = await mkdtemp(join(tmpdir(), "electron-base-certificate-"));
  try {
    const prefix = join(scratch, "certificate-");
    await run("/usr/bin/codesign", ["--display", `--extract-certificates=${prefix}`, path]);
    const fingerprint = createHash("sha256").update(await readFile(`${prefix}0`)).digest("hex");
    if (fingerprint !== signer.certificateSha256) throw new Error("signed Electron base certificate mismatch");
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** Capture only after base signing; this is physical evidence, never a plan
 * identity or permission to skip verification at a later consumption boundary. */
export async function captureMacBaseSeal(input: Readonly<{ appPath: string; signer: MacBaseSigner; run?: Run }>): Promise<MacBaseSeal> {
  signerIdentity(input.signer);
  const status = await lstat(input.appPath);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("signed Electron base app must be a physical directory");
  const run: Run = input.run ?? ((command, args) => execute(command, [...args]));
  const objects = [];
  for (const path of await objectPaths(input.appPath)) {
    const root = join(input.appPath, path), before = await inventoryNativeTree(root);
    await verifySigner(root, input.signer, run);
    if (JSON.stringify(before) !== JSON.stringify(await inventoryNativeTree(root))) throw new Error("signed Electron base changed during verification");
    objects.push({ path, tree: before });
  }
  return { schemaVersion: 1, signer: { ...input.signer }, objects };
}

/** Use both after restoration and after version projection. Never re-sign a
 * mismatch: the producer must supply a new explicitly selected base. */
export async function verifyMacBaseSeal(input: Readonly<{ appPath: string; seal: MacBaseSeal; signer: MacBaseSigner; run?: Run }>): Promise<void> {
  signerIdentity(input.signer);
  if (input.seal.schemaVersion !== 1 || input.seal.signer.teamIdentifier !== input.signer.teamIdentifier
    || input.seal.signer.certificateSha256 !== input.signer.certificateSha256) throw new Error("signed Electron base signer binding mismatch");
  const observed = await captureMacBaseSeal(input);
  if (JSON.stringify(observed.objects) !== JSON.stringify(input.seal.objects)) throw new Error("signed Electron base objects changed");
}

/** A post-projection byte invariant, not a substitute for native signature
 * verification when acquiring the base or verifying the final application. */
export async function assertMacBaseObjectsUnchanged(appPath: string, seal: MacBaseSeal): Promise<void> {
  const paths = await objectPaths(appPath);
  if (JSON.stringify(paths) !== JSON.stringify(seal.objects.map(object => object.path))) throw new Error("signed Electron base object set changed");
  for (const object of seal.objects) {
    if (JSON.stringify(await inventoryNativeTree(join(appPath, object.path))) !== JSON.stringify(object.tree)) {
      throw new Error(`signed Electron base object changed: ${object.path}`);
    }
  }
}
