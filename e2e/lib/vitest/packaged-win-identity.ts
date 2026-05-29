type ReleaseChannelIdentity = "stable" | "beta" | "nightly" | "preview";

export { releaseAppVersionArgs } from "./packaged-release-version.js";

export type PackagedWinInstallIdentity = {
  displayName: string;
  namespaceToken: string;
};

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function isChannelNamespace(namespace: string, channel: ReleaseChannelIdentity): boolean {
  return namespace.toLowerCase() === `release-${channel}-win`;
}

function channelFromVersion(version: string | null | undefined): ReleaseChannelIdentity | null {
  const normalized = version?.trim();
  if (normalized == null || normalized.length === 0) return null;
  if (/(?:^|[-.])beta(?:[-.]|$)/i.test(normalized)) return "beta";
  if (/(?:^|[-.])preview(?:[-.]|$)/i.test(normalized)) return "preview";
  if (/(?:^|[-.])nightly(?:[-.]|$)/i.test(normalized)) return "nightly";
  return null;
}

function channelFromNamespace(namespace: string): ReleaseChannelIdentity | null {
  if (namespace === "default" || isChannelNamespace(namespace, "stable")) return "stable";
  if (isChannelNamespace(namespace, "beta")) return "beta";
  if (isChannelNamespace(namespace, "nightly")) return "nightly";
  if (isChannelNamespace(namespace, "preview")) return "preview";
  return null;
}

function displayNameForChannel(channel: ReleaseChannelIdentity): string {
  if (channel === "beta") return "Open Design Beta";
  if (channel === "nightly") return "Open Design Nightly";
  if (channel === "preview") return "Open Design Preview";
  return "Open Design";
}

export function resolvePackagedWinInstallIdentity(options: {
  namespace: string;
  releaseVersion: string | null | undefined;
}): PackagedWinInstallIdentity {
  const namespaceToken = sanitizeNamespace(options.namespace);
  const channel = channelFromVersion(options.releaseVersion) ?? channelFromNamespace(options.namespace);
  const displayName = channel == null ? `Open Design ${namespaceToken}` : displayNameForChannel(channel);
  return { displayName, namespaceToken };
}
