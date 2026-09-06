import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { parseReleaseBaseVersion } from "@open-design/release";

export type LegacyReleaseChannel = "beta" | "prerelease" | "preview" | "stable";

const registryPath = fileURLToPath(new URL("../../resources/channel-versions.json", import.meta.url));

export async function readChannelBaseVersion(channel: LegacyReleaseChannel): Promise<string> {
  const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
    schemaVersion?: unknown;
    channels?: Record<string, { baseVersion?: unknown }>;
  };
  if (registry.schemaVersion !== 1 || registry.channels == null) {
    throw new Error("release channel version registry is invalid");
  }
  const version = registry.channels[channel]?.baseVersion;
  if (typeof version !== "string" || parseReleaseBaseVersion(version) == null) {
    throw new Error(`release channel ${channel} must declare a stable x.y.z baseVersion`);
  }
  return version;
}
