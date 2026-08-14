import {
  releaseChannelFromNamespace,
  releaseChannelFromVersion,
  type ReleaseChannel,
} from "@open-design/release";

export const TOOL_PACK_LOCAL_NAMESPACE = "local";
export type ToolPackProductChannel = "local" | ReleaseChannel;

/**
 * Resolve the installed product identity independently from its runtime
 * namespace. A release version is authoritative for immutable builds; an
 * explicit debug channel is authoritative for local lifecycle commands. The
 * namespace fallback exists only for small identity helpers and old callers
 * that have not constructed a full resolved config.
 */
export function resolveToolPackProductChannel(
  input: Readonly<{
    debugChannel?: ToolPackProductChannel;
    namespace: string;
    releaseVersion?: string;
  }>,
  defaultNamespace: string,
): ToolPackProductChannel {
  const versionChannel = releaseChannelFromVersion(input.releaseVersion);
  if (versionChannel != null) return versionChannel;
  if (input.releaseVersion != null && /^\d+\.\d+\.\d+$/.test(input.releaseVersion)) {
    return "stable";
  }
  if (input.debugChannel != null) return input.debugChannel;
  return releaseChannelFromNamespace(input.namespace, defaultNamespace) ?? "local";
}
