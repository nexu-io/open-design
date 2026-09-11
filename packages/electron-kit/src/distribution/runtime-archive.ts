import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readElectronRuntimeVersion } from "./runtime-version.js";

export async function resolveElectronDistributionArchive(target: string) {
  if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)) throw new Error("unsupported Electron archive target");
  const packagePath = createRequire(import.meta.url).resolve("electron/package.json");
  const installed = JSON.parse(await readFile(packagePath, "utf8"));
  const version = await readElectronRuntimeVersion();
  if (installed.version !== version) throw new Error("installed Electron differs from the pinned runtime contract");
  const fileName = `electron-v${version}-${target}.zip`;
  const checksums = JSON.parse(await readFile(join(dirname(packagePath), "checksums.json"), "utf8"));
  const sha256 = checksums[fileName];
  if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(sha256)) throw new Error("Electron archive lacks a pinned checksum");
  return { version, fileName, sha256, url: `https://github.com/electron/electron/releases/download/v${version}/${fileName}` };
}
