import type { KeyObject } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildElectronCapsuleContent } from "@open-design/electron-kit/distribution";
import { composeElectronCapsuleManifest, type ElectronCapsuleTarget } from "@open-design/electron-kit/contracts";
import { canonicalJson, signDocument } from "@open-design/standalone";
import type { NodePlatformResource } from "@open-design/standalone/packages";

export function platformFixture(target: NodePlatformResource["target"] = "darwin-arm64"): NodePlatformResource {
  return { schemaVersion: 1, target, treeSha256: "f".repeat(64),
    blob: { sha256: "e".repeat(64), size: 123, mediaType: "application/zip",
      sources: [{ kind: "remote", url: "https://fixture.invalid/platform.zip" }] },
    executables: [target === "win32-x64" ? "node.exe" : "bin/node"] };
}

export async function writeCapsuleSeed(input: Readonly<{
  root: string; privateKey: KeyObject; keyId: string; version?: string; target?: ElectronCapsuleTarget; moduleSource?: string;
}>) {
  const entryPath = join(input.root, "capsule-fixture.ts");
  await writeFile(entryPath, input.moduleSource ?? "export const createElectronCapsuleDefinition = manifest => ({manifest}); export async function runElectronCapsule() {}\n");
  const built = await buildElectronCapsuleContent({ entryPath, outputRoot: join(input.root, "capsule-content"), target: input.target ?? "darwin-arm64" });
  const version = input.version ?? "0.1.0";
  const manifest = composeElectronCapsuleManifest({ content: built.content, platform: platformFixture(built.content.target), version, minimumCarrierVersion: version, providedShellVersion: version });
  const envelope = signDocument(manifest, [{ keyId: input.keyId, privateKey: input.privateKey }]);
  const manifestFile = join(input.root, "capsule-manifest.json");
  await writeFile(manifestFile, canonicalJson(envelope));
  return { ...built, manifestFile, archiveFile: built.archivePath, envelope };
}
