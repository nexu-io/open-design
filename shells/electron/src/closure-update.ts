import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
} from "@open-design/closure-store";
import {
  updateClosureFromRelease,
  type ApplyClosureUpdateResult,
} from "@open-design/closure-update";
import type { LauncherChannel } from "@open-design/launcher-proto";

export type PackagedClosureEnsureSkipReason =
  | "metadata-unconfigured"
  | "shell-version-unavailable"
  | "unsupported-platform";

export type PackagedClosureEnsureResult =
  | ApplyClosureUpdateResult
  | {
      reason: "already-committed";
      state: "available";
    }
  | {
      reason: PackagedClosureEnsureSkipReason;
      state: "skipped";
    };

export type PackagedClosureReleaseTarget = {
  platform: "darwin-arm64" | "win32-x64";
  releaseTarget: "mac_arm64" | "win_x64";
};

export function resolvePackagedClosureReleaseTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): PackagedClosureReleaseTarget | null {
  if (platform === "darwin" && arch === "arm64") {
    return { platform: "darwin-arm64", releaseTarget: "mac_arm64" };
  }
  if (platform === "win32" && arch === "x64") {
    return { platform: "win32-x64", releaseTarget: "win_x64" };
  }
  return null;
}

/** Preserve the discovered installer floor when no compatible Store generation can be selected. */
export function resolvePackagedClosureInstallerRequiredVersion(
  result: PackagedClosureEnsureResult | null,
): string | null {
  if (
    result?.state !== "retained"
    || result.reason !== "shell-incompatible"
    || !("candidate" in result)
  ) return null;
  return result.candidate.manifest.compatibility.shell.minVersion;
}

/**
 * Materialize the first committed Closure only when this namespace has none.
 * Once a binding exists, cold start is offline and never discovers or selects
 * a successor. Rich update policy belongs behind the Standalone handoff.
 */
export async function ensurePackagedClosureAvailable(input: {
  channel: LauncherChannel;
  installationRoot: string;
  metadataUrl: string | null;
  namespace: string;
  shellVersion: string | null;
}, options: {
  arch?: string;
  fetch?: typeof globalThis.fetch;
  platform?: NodeJS.Platform;
} = {}): Promise<PackagedClosureEnsureResult> {
  const paths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.installationRoot,
  });
  const descriptor = await readClosureBindingDescriptor(paths);
  if (descriptor.committed != null) {
    return { reason: "already-committed", state: "available" };
  }
  if (input.metadataUrl == null) {
    return { reason: "metadata-unconfigured", state: "skipped" };
  }
  if (input.shellVersion == null) {
    return { reason: "shell-version-unavailable", state: "skipped" };
  }
  const target = resolvePackagedClosureReleaseTarget(options.platform, options.arch);
  if (target == null) {
    return { reason: "unsupported-platform", state: "skipped" };
  }
  return await updateClosureFromRelease({
    channel: input.channel,
    ...(options.fetch == null ? {} : { fetch: options.fetch }),
    metadataUrl: input.metadataUrl,
    paths,
    platform: target.platform,
    releaseTarget: target.releaseTarget,
    shellVersion: input.shellVersion,
  });
}
