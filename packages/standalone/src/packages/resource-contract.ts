import type { StandaloneBlob } from "../protocol.js";
import type { OfficialNodeTarget } from "./runtime.js";

/** Authenticated by the owning Shell/Capsule before acquisition; no latest,
 * release channel, or independent update lifecycle is defined by this resource. */
export type NodePlatformResource = Readonly<{
  schemaVersion: 1;
  target: OfficialNodeTarget;
  blob: StandaloneBlob;
  treeSha256: string;
  executables: readonly string[];
}>;

export function validateNodePlatformResource(input: unknown): NodePlatformResource {
  const object = (value: unknown, keys: string[]) => {
    if (value == null || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join(",") !== keys.sort().join(",")) throw new Error("invalid Node platform resource fields");
    return value as Record<string, unknown>;
  };
  const value = object(input, ["schemaVersion", "target", "blob", "treeSha256", "executables"]);
  const blob = object(value.blob, ["sha256", "size", "mediaType", "sources"]);
  const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
  if (value.schemaVersion !== 1 || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(String(value.target))
    || !digest(value.treeSha256) || !digest(blob.sha256) || blob.mediaType !== "application/zip"
    || typeof blob.size !== "number" || !Number.isSafeInteger(blob.size) || blob.size <= 0) throw new Error("invalid Node platform resource identity");
  if (!Array.isArray(blob.sources)) throw new Error("invalid Node platform sources");
  const sources = blob.sources.map(source => {
    const item = object(source, ["kind", "url"]);
    if (item.kind !== "remote" || typeof item.url !== "string") throw new Error("invalid Node platform source");
    const url = new URL(item.url);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("invalid Node platform source URL");
    return Object.freeze({ kind: "remote" as const, url: url.href });
  });
  if (!Array.isArray(value.executables) || value.executables.length === 0) throw new Error("Node platform requires executable paths");
  const executables = value.executables.map(path => {
    if (typeof path !== "string" || path.includes("\\") || path.includes(":") || /[\x00-\x1f]/u.test(path)
      || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("unsafe Node platform executable path");
    return path;
  });
  const command = value.target === "win32-x64" ? "node.exe" : "bin/node";
  if (!executables.includes(command) || new Set(executables).size !== executables.length) throw new Error("invalid Node platform executable allowlist");
  return Object.freeze({ schemaVersion: 1, target: value.target as OfficialNodeTarget, treeSha256: value.treeSha256,
    blob: Object.freeze({ sha256: blob.sha256, size: blob.size, mediaType: "application/zip", sources: Object.freeze(sources) }),
    executables: Object.freeze(executables.sort()) });
}
