import {
  releaseChannelFromNamespace,
  releaseChannelFromVersion,
  type ReleaseChannel,
} from "@open-design/release";
import { SIDECAR_DEFAULTS } from "@open-design/sidecar/protocol";

export const TOOL_PACK_LOCAL_NAMESPACE = "local";
export type ToolPackProductChannel = "local" | ReleaseChannel;

/**
 * Persist only a genuinely local updater boundary inside packaged bytes.
 * Immutable release identity is authoritative over the CLI's default local
 * debug channel; otherwise a public package can accidentally carry the local
 * cold-start override and permanently disable its updater.
 */
export function resolvePackagedUpdateEnabled(
  input: Readonly<{
    debugChannel?: ToolPackProductChannel;
    namespace: string;
    releaseVersion?: string;
  }>,
): false | undefined {
  return resolveToolPackProductChannel(input, SIDECAR_DEFAULTS.namespace) === "local"
    ? false
    : undefined;
}

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
