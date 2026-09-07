import { readFile } from "node:fs/promises";

import type { OfficialNodeTarget } from "../contracts/index.js";

export type OfficialNodeLock = Readonly<{
  schemaVersion: 1;
  version: string;
  targets: Readonly<Partial<Record<OfficialNodeTarget, Readonly<{
    archive: string; mediaType: "application/gzip" | "application/zip"; sha256: string; url: string;
  }>>>>;
}>;

const digest = /^[a-f0-9]{64}$/u;

export function validateOfficialNodeLock(value: unknown): OfficialNodeLock {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("official Node lock must be an object");
  const lock = value as OfficialNodeLock;
  if (lock.schemaVersion !== 1 || typeof lock.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(lock.version)
    || lock.targets == null || typeof lock.targets !== "object" || Array.isArray(lock.targets) || Object.keys(lock.targets).length === 0) {
    throw new Error("unsupported official Node lock");
  }
  for (const [target, entry] of Object.entries(lock.targets)) {
    if (!(["darwin-arm64", "darwin-x64", "win32-x64"] as const).includes(target as OfficialNodeTarget)) throw new Error(`unknown official Node target: ${target}`);
    const suffix = target === "win32-x64" ? "win-x64.zip" : `${target}.tar.gz`;
    const expectedArchive = `node-v${lock.version}-${suffix}`;
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)
      || entry.archive !== expectedArchive || typeof entry.sha256 !== "string" || !digest.test(entry.sha256)) {
      throw new Error(`invalid official Node archive identity: ${target}`);
    }
    if (entry.url !== `https://nodejs.org/dist/v${lock.version}/${expectedArchive}`) {
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
