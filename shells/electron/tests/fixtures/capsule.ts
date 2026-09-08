import type { KeyObject } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildElectronCapsuleContent } from "@open-design/electron-kit/distribution";
import { composeElectronCapsuleManifest, type ElectronCapsuleTarget } from "@open-design/electron-kit/contracts";
import { canonicalJson, signDocument } from "@open-design/standalone";

export async function writeCapsuleSeed(input: Readonly<{
  root: string; privateKey: KeyObject; keyId: string; version?: string; target?: ElectronCapsuleTarget;
}>) {
  const entryPath = join(input.root, "capsule-fixture.ts");
  await writeFile(entryPath, "export const createElectronCapsuleDefinition = manifest => ({manifest}); export async function runElectronCapsule() {}\n");
  const built = await buildElectronCapsuleContent({ entryPath, outputRoot: join(input.root, "capsule-content"), target: input.target ?? "darwin-arm64" });
  const version = input.version ?? "0.1.0";
  const manifest = composeElectronCapsuleManifest({ content: built.content, version, minimumCarrierVersion: version, providedShellVersion: version });
  const envelope = signDocument(manifest, [{ keyId: input.keyId, privateKey: input.privateKey }]);
  const manifestFile = join(input.root, "capsule-manifest.json");
  await writeFile(manifestFile, canonicalJson(envelope));
  return { ...built, manifestFile, archiveFile: built.archivePath, envelope };
}
