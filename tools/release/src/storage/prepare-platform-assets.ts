import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { optional, required, requiredTarget } from "./common.ts";

type Digest = { sha256: string; sha512: string; size: number };

async function stageAsset(source: string, directory: string, name: string): Promise<Digest> {
  const destination = join(directory, name);
  copyFileSync(source, destination);
  const sha256 = createHash("sha256");
  const sha512 = createHash("sha512");
  let size = 0;
  for await (const chunk of createReadStream(destination)) {
    sha256.update(chunk);
    sha512.update(chunk);
    size += chunk.length;
  }
  const digest = { sha256: sha256.digest("hex"), sha512: sha512.digest("base64"), size };
  writeFileSync(`${destination}.sha256`, `${digest.sha256}  ${basename(destination)}\n`, "utf8");
  return digest;
}

function updateFeed(url: string, version: string, notes: string, digest: Digest): string {
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return [
    `version: ${JSON.stringify(version)}`,
    "files:",
    `  - url: ${JSON.stringify(url)}`,
    `    sha512: ${JSON.stringify(digest.sha512)}`,
    `    size: ${digest.size}`,
    `path: ${JSON.stringify(url)}`,
    `sha512: ${JSON.stringify(digest.sha512)}`,
    `releaseDate: ${JSON.stringify(date)}`,
    `releaseNotes: ${JSON.stringify(notes)}`,
    "",
  ].join("\n");
}

function requiredBuildPath(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`build JSON requires ${field}`);
  return value;
}

export async function preparePlatformAssets(): Promise<void> {
  const target = requiredTarget();
  const directory = required("RELEASE_ASSETS_DIR");
  const channel = required("RELEASE_CHANNEL");
  const version = required("RELEASE_VERSION");
  const origin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
  const suffix = optional("RELEASE_ASSET_SUFFIX");
  const versionPrefix = optional("RELEASE_VERSION_PREFIX", `${channel}/versions/${version}${suffix}`).replace(/^\/+|\/+$/g, "");
  const notes = optional("RELEASE_NOTES", `Open Design ${version}${suffix}`);
  mkdirSync(directory, { recursive: true });

  if (target === "win_x64") {
    const record = JSON.parse(readFileSync(required("RELEASE_BUILD_JSON_PATH"), "utf8")) as Record<string, unknown>;
    const installer = `open-design-${version}${suffix}-win-x64-setup.exe`;
    const digest = await stageAsset(requiredBuildPath(record, "installerPath"), directory, installer);
    await stageAsset(requiredBuildPath(record, "payloadPath"), directory, `open-design-${version}${suffix}-win-x64-payload.7z`);
    if (optional("WIN_INCLUDE_ZIP", "true") !== "false") {
      await stageAsset(requiredBuildPath(record, "portableZipPath"), directory, `open-design-${version}${suffix}-win-x64-portable.zip`);
    }
    writeFileSync(join(directory, "latest.yml"), updateFeed(`${origin}/${versionPrefix}/${installer}`, version, notes, digest), "utf8");
    return;
  }

  const pack = required("TOOLS_PACK_DIR");
  const namespace = required("RELEASE_NAMESPACE");
  if (target === "linux_x64") {
    const source = join(pack, "out/linux/namespaces", namespace, "builder", `Open Design-${namespace}.AppImage`);
    await stageAsset(source, directory, `open-design-${version}${suffix}-linux-x64.AppImage`);
    return;
  }

  const mode = optional("RELEASE_ARTIFACT_MODE", "dmg-and-zip");
  if (!["dmg-only", "dmg-and-zip", "dmg-and-payload", "all"].includes(mode)) {
    throw new Error(`unsupported RELEASE_ARTIFACT_MODE for ${target}: ${mode}`);
  }
  const source = join(pack, "out/mac/namespaces", namespace);
  const stem = `open-design-${version}${suffix}-mac-${target.slice(4)}`;
  await stageAsset(join(source, "dmg", `Open Design-${namespace}.dmg`), directory, `${stem}.dmg`);
  if (mode === "dmg-and-payload" || mode === "all") {
    await stageAsset(join(source, "payload", `Open Design-${namespace}-payload.zip`), directory, `${stem}-payload.zip`);
  }
  if (mode === "dmg-only" || mode === "dmg-and-payload") return;
  const zip = `${stem}.zip`;
  const digest = await stageAsset(join(source, "zip", `Open Design-${namespace}.zip`), directory, zip);
  writeFileSync(join(directory, "latest-mac.yml"), updateFeed(`${origin}/${versionPrefix}/${zip}`, version, notes, digest), "utf8");
}
