import { resolveClosureStorePaths } from "@open-design/closure-store";
import {
  updateClosureFromRelease,
  type ApplyClosureUpdateResult,
} from "@open-design/closure-update";
import type { LauncherChannel } from "@open-design/launcher-proto";

export type PackagedClosureUpdateSkipReason =
  | "metadata-unconfigured"
  | "shell-version-unavailable"
  | "unsupported-platform";

export type PackagedClosureUpdateResult =
  | ApplyClosureUpdateResult
  | {
      reason: PackagedClosureUpdateSkipReason;
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

/** Project the release truth only after this Store has accepted that release. */
export function resolvePackagedClosureReleaseVersion(
  result: PackagedClosureUpdateResult | null,
  fallback: string | null,
): string | null {
  if (result == null || !("candidate" in result)) return fallback;
  if (result.state === "activated") return result.candidate.releaseVersion;
  if (result.state === "retained" && result.reason === "already-active") {
    return result.candidate.releaseVersion;
  }
  return fallback;
}

/** Preserve the discovered installer floor when no compatible Store generation can be selected. */
export function resolvePackagedClosureInstallerRequiredVersion(
  result: PackagedClosureUpdateResult | null,
): string | null {
  if (
    result?.state !== "retained"
    || result.reason !== "shell-incompatible"
    || !("candidate" in result)
  ) return null;
  return result.candidate.manifest.compatibility.shell.minVersion;
}

export async function checkForPackagedClosureUpdate(input: {
  channel: LauncherChannel;
  installationRoot: string;
  metadataUrl: string | null;
  namespace: string;
  shellVersion: string | null;
}, options: {
  arch?: string;
  fetch?: typeof globalThis.fetch;
  platform?: NodeJS.Platform;
} = {}): Promise<PackagedClosureUpdateResult> {
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
  const paths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.installationRoot,
  });
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
