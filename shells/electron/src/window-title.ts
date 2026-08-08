import {
  releaseChannelFromNamespace,
  releaseChannelFromVersion,
  releaseInstallIdentity,
} from "@open-design/release";

const DEFAULT_WINDOW_TITLE = "Open Design";

export function resolvePackagedWindowTitle(config: { namespace: string; shellVersion: string | null }): string {
  const channel =
    releaseChannelFromVersion(config.shellVersion) ??
    releaseChannelFromNamespace(config.namespace);
  return channel == null ? DEFAULT_WINDOW_TITLE : releaseInstallIdentity(channel).productName;
}
