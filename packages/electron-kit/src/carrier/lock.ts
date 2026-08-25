import { readFile } from "node:fs/promises";

import { OfficialNodeCarrierError, type OfficialNodeLock, type OfficialNodeTarget } from "./contracts.js";

const digest = /^[a-f0-9]{64}$/u;
const archive = /^node-v\d+\.\d+\.\d+-(?:darwin-(?:arm64|x64)|win-x64)\.(?:tar\.gz|zip)$/u;

export function currentOfficialNodeTarget(platform = process.platform, architecture = process.arch): OfficialNodeTarget {
  const target = `${platform}-${architecture}`;
  if (target === "darwin-arm64" || target === "darwin-x64" || target === "win32-x64") return target;
  throw new OfficialNodeCarrierError("unsupported-target", `official Node carrier does not support ${target}`);
}

export function validateOfficialNodeLock(value: unknown): OfficialNodeLock {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("official Node lock must be an object");
  const lock = value as OfficialNodeLock;
  if (lock.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/u.test(lock.version) || lock.targets == null) {
    throw new Error("unsupported official Node lock");
  }
  for (const [target, entry] of Object.entries(lock.targets)) {
    if (!(["darwin-arm64", "darwin-x64", "win32-x64"] as const).includes(target as OfficialNodeTarget)) throw new Error(`unknown official Node target: ${target}`);
    if (!archive.test(entry.archive) || !digest.test(entry.sha256)) throw new Error(`invalid official Node archive identity: ${target}`);
    const url = new URL(entry.url);
    if (url.protocol !== "https:" || url.hostname !== "nodejs.org" || !url.pathname.endsWith(`/${entry.archive}`)) {
      throw new Error(`invalid official Node source: ${target}`);
    }
    const expectedMediaType = entry.archive.endsWith(".zip") ? "application/zip" : "application/gzip";
    if (entry.mediaType !== expectedMediaType) throw new Error(`invalid official Node media type: ${target}`);
  }
  return structuredClone(lock);
}

export async function readOfficialNodeLock(path: string): Promise<OfficialNodeLock> {
  return validateOfficialNodeLock(JSON.parse(await readFile(path, "utf8")) as unknown);
}
