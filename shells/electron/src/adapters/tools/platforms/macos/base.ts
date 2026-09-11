import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSignedMacBaseFromArchive } from "@open-design/electron-kit/distribution";
import { resolveElectronSceneManifest, resolveElectronReleaseManifest } from "../../manifests.ts";
import { electronMacSigningPolicy } from "./signing.ts";

export async function buildElectronMacBase(input: Readonly<{ target: string; channel: string; archivePath: string; outputRoot: string }>) {
  if (!input.target.startsWith("darwin-")) throw new Error("signed Electron base currently supports macOS only");
  const neutral = await resolveElectronSceneManifest();
  // Only the three native identity fields are projected. The helper/base
  // version comes from Electron's pinned runtime, not this Shell manifest.
  const manifest = await resolveElectronReleaseManifest({ channel: input.channel, releaseVersion: neutral.version });
  const policy = JSON.parse(await readFile(new URL("../../../../../config/distribution.json", import.meta.url), "utf8"));
  const signing = await electronMacSigningPolicy();
  const scratch = await mkdtemp(join(tmpdir(), "electron-base-icon-"));
  try {
    const icon = manifest.iconDataUrl == null ? undefined : join(scratch, "icon.png");
    if (icon) await writeFile(icon, Buffer.from(manifest.iconDataUrl!.slice("data:image/png;base64,".length), "base64"));
    return await buildSignedMacBaseFromArchive({ ...input, ...signing,
      identity: { appId: manifest.appId, executableName: manifest.executableName, productName: manifest.productName },
      category: policy.mac.category, ...(icon == null ? {} : { icon }) });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
