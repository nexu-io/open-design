const EXACT_RELEASE_NAME_PATTERN = /^[a-z0-9]{1,12}$/;

export function isNotificationReleaseChannel(value: unknown): value is string {
  return typeof value === "string"
    && (value === "stable" || value === "prerelease" || EXACT_RELEASE_NAME_PATTERN.test(value));
}

export function releaseChannelDisplayLabel(channel: string): string {
  if (!isNotificationReleaseChannel(channel)) {
    throw new Error(`unsupported release notification channel: ${channel}`);
  }
  if (channel === "stable") return "Stable";
  if (channel === "prerelease") return "Prerelease";
  return channel[0]!.toUpperCase() + channel.slice(1);
}
