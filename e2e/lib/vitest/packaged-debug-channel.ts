import { isReleaseChannel } from "@open-design/release";

export function packagedDebugChannelArgs(channel: string | null | undefined): string[] {
  const normalized = channel?.trim();
  if (normalized == null || normalized.length === 0) return [];
  if (normalized === "local") return ["--debug-channel", "local"];
  if (!isReleaseChannel(normalized)) {
    throw new Error(`packaged release smoke received an invalid channel: ${normalized}`);
  }
  const debugChannel = normalized === "stable" || normalized === "prerelease"
    ? normalized
    : `exact:${normalized}`;
  return ["--debug-channel", debugChannel];
}
