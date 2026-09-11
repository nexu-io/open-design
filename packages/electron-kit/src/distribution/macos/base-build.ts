import { Arch, build, Platform, type Configuration } from "electron-builder";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { assertMacBaseObjectsUnchanged, captureMacBaseSeal, verifyMacBaseSeal, type MacBaseSeal, type MacBaseSigner } from "./base-seal.js";
import { inventoryNativeTree, type NativeTreeEntry } from "../native-tree.js";
import { inspectMacSigningResources, macResourceSigningPattern } from "../../platform/macos/resource-signing.js";
import { extract } from "@open-design/archive";
import { resolveElectronDistributionArchive } from "../runtime-archive.js";

const execute = promisify(execFile);
export type SignedMacBaseManifest = Readonly<{
  schemaVersion: 1; operation: "electron.macos-base.build";
  target: "darwin-arm64" | "darwin-x64"; electronVersion: string;
  identity: Readonly<{ appId: string; productName: string; executableName: string }>;
  app: string; seal: MacBaseSeal; tree: readonly NativeTreeEntry[];
}>;
export type SignedMacBase = Readonly<{ root: string; manifestSha256: string }>;
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Official archive authentication precedes any branding or signing. */
export async function buildSignedMacBaseFromArchive(input: Readonly<{
  outputRoot: string; archivePath: string; target: string;
  identity: SignedMacBaseManifest["identity"]; signer: MacBaseSigner;
  category: string; entitlements: string; icon?: string;
}>): Promise<SignedMacBase> {
  if (input.target !== `${process.platform}-${process.arch}` || process.platform !== "darwin") throw new Error("signed Electron base target differs from its host");
  const source = await resolveElectronDistributionArchive(input.target);
  const scratch = await mkdtemp(join(tmpdir(), "electron-base-runtime-"));
  try {
    const bytes = await readFile(input.archivePath);
    if (digest(bytes) !== source.sha256) throw new Error("Official Electron archive checksum mismatch");
    const archive = join(scratch, "runtime.zip"); await writeFile(archive, bytes, { flag: "wx" });
    const runtimeDirectory = join(scratch, "runtime");
    await extract(archive, runtimeDirectory, { allowInternalLinks: true });
    return await buildSignedMacBase({ ...input, runtimeDirectory, electronVersion: source.version });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** One native branding/signing pass per low-frequency base. Helpers use the
 * pinned Electron version, never a release label. The temporary outer app is
 * stripped of its stub payload/seal before becoming a reusable skeleton. */
export async function buildSignedMacBase(input: Readonly<{
  outputRoot: string; runtimeDirectory: string; electronVersion: string;
  identity: SignedMacBaseManifest["identity"]; signer: MacBaseSigner;
  category: string; entitlements: string; icon?: string;
}>): Promise<SignedMacBase> {
  if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch)) throw new Error("signed Electron base requires a supported macOS host");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(input.identity.executableName)
    || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/u.test(input.identity.appId)
    || !input.identity.productName || /[\x00-\x1f/\\]/u.test(input.identity.productName)
    || !/^\d+\.\d+\.\d+$/u.test(input.electronVersion)) throw new Error("invalid signed Electron base identity");
  const root = resolve(input.outputRoot);
  await mkdir(root); // Explicit fresh output: never overwrite signed base bytes.
  const scratch = await mkdtemp(join(tmpdir(), "electron-native-base-"));
  try {
    const projectDir = join(scratch, "project"); await mkdir(projectDir);
    await writeFile(join(projectDir, "package.json"), JSON.stringify({ name: input.identity.executableName,
      version: input.electronVersion, main: "main.cjs", private: true,
      description: "Reusable Electron native base", author: input.identity.productName }));
    await writeFile(join(projectDir, "main.cjs"), "// Native base construction placeholder. Never distributed.\n");
    const app = `${process.arch === "arm64" ? "mac-arm64" : "mac"}/${input.identity.executableName}.app`, appPath = join(root, app);
    const config: Configuration = {
      ...input.identity, electronVersion: input.electronVersion, buildVersion: input.electronVersion,
      electronDist: resolve(input.runtimeDirectory), directories: { output: root },
      files: ["main.cjs", "package.json"], asar: true, npmRebuild: false, nodeGypRebuild: false,
      compression: "store", forceCodeSigning: true,
      ...(input.icon == null ? {} : { icon: input.icon }),
      mac: { category: input.category, target: ["dir"], notarize: false,
        entitlements: input.entitlements, entitlementsInherit: input.entitlements,
        signIgnore: [macResourceSigningPattern(appPath)] },
      afterPack: async () => {
        const sealedDataPacks = await inspectMacSigningResources(appPath);
        console.info(JSON.stringify({ event: "electron.base.signing.begin", sealedDataPacks }));
      },
    };
    const start = performance.now();
    await build({ projectDir, publish: "never", targets: Platform.MAC.createTarget(["dir"], process.arch === "arm64" ? Arch.arm64 : Arch.x64), config });
    const seal = await captureMacBaseSeal({ appPath, signer: input.signer });
    // Only producer-owned, freshly generated outer placeholder state is removed.
    // Nested signatures remain untouched and are checked again below.
    await execute("/usr/bin/codesign", ["--remove-signature", appPath]);
    await rm(join(appPath, "Contents/_CodeSignature"), { recursive: true, force: true });
    await rm(join(appPath, "Contents/Resources/app.asar"));
    const plistPath = join(appPath, "Contents/Info.plist");
    const plist = JSON.parse((await execute("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath])).stdout);
    delete plist.ElectronAsarIntegrity;
    await writeFile(plistPath, JSON.stringify(plist));
    await execute("/usr/bin/plutil", ["-convert", "xml1", plistPath]);
    await assertMacBaseObjectsUnchanged(appPath, seal);
    const manifest: SignedMacBaseManifest = { schemaVersion: 1, operation: "electron.macos-base.build",
      target: `darwin-${process.arch}` as SignedMacBaseManifest["target"], electronVersion: input.electronVersion,
      identity: input.identity, app, seal, tree: await inventoryNativeTree(appPath) };
    const bytes = JSON.stringify(manifest);
    await writeFile(join(root, "base.json"), bytes, { flag: "wx" });
    console.info(JSON.stringify({ event: "electron.base.complete", elapsedMs: Math.round(performance.now() - start), nestedObjects: seal.objects.length }));
    return { root, manifestSha256: digest(bytes) };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

export async function loadSignedMacBase(base: SignedMacBase, expected: Readonly<{
  target: string; electronVersion: string; identity: SignedMacBaseManifest["identity"]; signer: MacBaseSigner;
}>) {
  const bytes = await readFile(join(base.root, "base.json"));
  if (!/^[a-f0-9]{64}$/u.test(base.manifestSha256) || digest(bytes) !== base.manifestSha256) throw new Error("signed Electron base manifest mismatch");
  const manifest = JSON.parse(bytes.toString("utf8")) as SignedMacBaseManifest;
  const app = `${expected.target === "darwin-arm64" ? "mac-arm64" : "mac"}/${expected.identity.executableName}.app`;
  if (manifest.schemaVersion !== 1 || manifest.operation !== "electron.macos-base.build"
    || manifest.target !== expected.target || manifest.electronVersion !== expected.electronVersion
    || manifest.app !== app || manifest.identity.appId !== expected.identity.appId
    || manifest.identity.executableName !== expected.identity.executableName || manifest.identity.productName !== expected.identity.productName) {
    throw new Error("signed Electron base identity mismatch");
  }
  const appPath = join(base.root, app);
  if (JSON.stringify(await inventoryNativeTree(appPath)) !== JSON.stringify(manifest.tree)) throw new Error("signed Electron base skeleton changed");
  await verifyMacBaseSeal({ appPath, seal: manifest.seal, signer: expected.signer });
  return { appPath, manifest };
}
