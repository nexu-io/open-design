export const EXACT_RELEASE_NAME_PATTERN = /^[a-z0-9]{1,12}$/;
export const RESERVED_RELEASE_NAMES = Object.freeze(["local"] as const);

/** Counted lanes are prerelease or a data-defined exact release name. */
export type CountedReleaseChannel = string;
export type ReleaseChannel = CountedReleaseChannel | "stable";
export type ReleasePlatform = "mac" | "macIntel" | "win" | "linux";

export type ParsedReleaseVersion =
  | {
      baseVersion: string;
      channel: CountedReleaseChannel;
      number: number;
      releaseVersion: string;
    }
  | {
      baseVersion: string;
      channel: "stable";
      releaseVersion: string;
    };

export type ReleaseBaseVersionTuple = readonly [number, number, number];

export type ReleaseChannelDescriptor = {
  appId: string;
  baseVersionField: "baseVersion";
  channel: ReleaseChannel;
  counterField: "releaseNumber" | null;
  displayLabel: string;
  githubReleaseEnabled: boolean;
  internal: boolean;
  productName: string;
  releaseVersionField: "releaseVersion";
  storagePrefix: ReleaseChannel;
};

export type ReleaseInstallIdentity = {
  appId: string;
  executableName: string;
  productName: string;
};

export const RELEASE_CHANNELS = Object.freeze({
  BETA: "beta",
  PRERELEASE: "prerelease",
  STABLE: "stable",
} as const);

export const RELEASE_PLATFORM_NAMESPACE_SUFFIXES = Object.freeze({
  linux: "linux",
  mac: "",
  macIntel: "intel",
  win: "win",
} as const satisfies Record<ReleasePlatform, string>);

const PRODUCT_NAME = "Open Design";
const DEFAULT_NAMESPACE = "open-design";

const descriptors: Record<"prerelease" | "stable", ReleaseChannelDescriptor> = {
  prerelease: {
    appId: "io.open-design.desktop.prerelease",
    baseVersionField: "baseVersion",
    channel: "prerelease",
    counterField: "releaseNumber",
    displayLabel: "Prerelease",
    githubReleaseEnabled: false,
    internal: true,
    productName: `${PRODUCT_NAME} Prerelease`,
    releaseVersionField: "releaseVersion",
    storagePrefix: "prerelease",
  },
  stable: {
    appId: "io.open-design.desktop",
    baseVersionField: "baseVersion",
    channel: "stable",
    counterField: null,
    displayLabel: "Stable",
    githubReleaseEnabled: true,
    internal: false,
    productName: PRODUCT_NAME,
    releaseVersionField: "releaseVersion",
    storagePrefix: "stable",
  },
};

export function isReleaseChannel(value: unknown): value is ReleaseChannel {
  return typeof value === "string"
    && value !== "local"
    && (value === "stable" || value === "prerelease" || EXACT_RELEASE_NAME_PATTERN.test(value));
}

export function releaseChannelDescriptor(channel: string): ReleaseChannelDescriptor {
  if (!isReleaseChannel(channel)) {
    throw new Error(`RELEASE_CHANNEL must be stable, prerelease, or a non-reserved exact name matching [a-z0-9]{1,12}; got ${channel}`);
  }
  if (channel === "stable" || channel === "prerelease") return descriptors[channel];
  const displayLabel = channel[0]!.toUpperCase() + channel.slice(1);
  return {
    appId: `io.open-design.desktop.${channel}`,
    baseVersionField: "baseVersion",
    channel,
    counterField: "releaseNumber",
    displayLabel,
    githubReleaseEnabled: false,
    internal: true,
    productName: `${PRODUCT_NAME} ${displayLabel}`,
    releaseVersionField: "releaseVersion",
    storagePrefix: channel,
  };
}

export function releaseChannelFromVersion(version: string | null | undefined): ReleaseChannel | null {
  if (version == null || version.length === 0) return null;
  const match = /^\d+\.\d+\.\d+-([a-z0-9]{1,12})\.\d+$/.exec(version);
  if (isReleaseChannel(match?.[1])) return match[1];
  // Development builds such as `beta-internal.N` are not public exact
  // versions, but they still inherit the corresponding updater feed.
  if (/(?:^|[-.])beta(?:[-.]|$)/i.test(version)) return "beta";
  if (/(?:^|[-.])prerelease(?:[-.]|$)/i.test(version)) return "prerelease";
  return null;
}

export function releaseChannelFromNamespace(namespace: string, defaultNamespace = DEFAULT_NAMESPACE): ReleaseChannel | null {
  if (namespace === defaultNamespace || isReleaseChannelNamespace(namespace, "stable")) return "stable";
  const match = /^release-([a-z0-9]{1,12})(?:$|[-_.])/.exec(namespace);
  return isReleaseChannel(match?.[1]) ? match[1] : null;
}

export function isReleaseChannelNamespace(namespace: string, channel: ReleaseChannel): boolean {
  return new RegExp(`^release-${channel}(?:$|[-_.])`, "i").test(namespace);
}

export function releaseNamespace(channel: ReleaseChannel, platform: ReleasePlatform = "mac"): string {
  const suffix = RELEASE_PLATFORM_NAMESPACE_SUFFIXES[platform];
  return suffix.length === 0 ? `release-${channel}` : `release-${channel}-${suffix}`;
}

export function releaseInstallIdentity(channel: ReleaseChannel): ReleaseInstallIdentity {
  const descriptor = releaseChannelDescriptor(channel);
  return {
    appId: descriptor.appId,
    executableName: descriptor.productName,
    productName: descriptor.productName,
  };
}

export function parseCountedReleaseVersion(
  value: string,
  channel: CountedReleaseChannel,
): { baseVersion: string; number: number; releaseVersion: string } | null {
  const match = new RegExp(`^(\\d+\\.\\d+\\.\\d+)-${channel}\\.(\\d+)$`).exec(value);
  if (match?.[1] == null || match[2] == null) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { baseVersion: match[1], number, releaseVersion: value };
}

export function parseStableReleaseVersion(value: string): { baseVersion: string; releaseVersion: string } | null {
  return /^\d+\.\d+\.\d+$/.test(value) ? { baseVersion: value, releaseVersion: value } : null;
}

export function parseReleaseBaseVersion(value: string): ReleaseBaseVersionTuple | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (match?.[1] == null || match[2] == null || match[3] == null) return null;
  const parsed: ReleaseBaseVersionTuple = [Number(match[1]), Number(match[2]), Number(match[3])];
  return parsed.every((part) => Number.isSafeInteger(part) && part >= 0) ? parsed : null;
}

export function compareReleaseBaseVersions(left: ReleaseBaseVersionTuple, right: ReleaseBaseVersionTuple): number {
  for (let index = 0; index < 3; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

export function parseReleaseVersion(value: string, channel: ReleaseChannel): ParsedReleaseVersion {
  if (channel === "stable") {
    const parsed = parseStableReleaseVersion(value);
    if (parsed == null) throw new Error(`stable release version must be x.y.z; got ${value}`);
    return { ...parsed, channel };
  }
  const parsed = parseCountedReleaseVersion(value, channel);
  if (parsed == null) throw new Error(`${channel} release version must be x.y.z-${channel}.N; got ${value}`);
  return { ...parsed, channel };
}

export function formatReleaseVersion(channel: CountedReleaseChannel, baseVersion: string, number: number): string {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${channel} release number must be a positive integer; got ${String(number)}`);
  }
  return `${baseVersion}-${channel}.${number}`;
}

export function releaseMetadataVersionFields(channel: ReleaseChannel, releaseVersion: string): Record<string, unknown> {
  const descriptor = releaseChannelDescriptor(channel);
  const parsed = parseReleaseVersion(releaseVersion, channel);
  const baseVersion = parsed.baseVersion;
  if (!("number" in parsed)) {
    return {
      [descriptor.baseVersionField]: baseVersion,
      releaseVersion,
      stableVersion: baseVersion,
    };
  }
  if (descriptor.counterField == null) {
    throw new Error(`${channel} release channel is missing a counter field`);
  }
  return {
    [descriptor.baseVersionField]: baseVersion,
    [descriptor.counterField]: parsed.number,
    releaseVersion,
  };
}
