import {
  releaseChannelFromNamespace,
  releaseChannelFromVersion,
  releaseInstallIdentity,
} from "@open-design/release";

export { releaseAppVersionArgs } from "./packaged-release-version.js";

export type PackagedWinInstallIdentity = {
  displayName: string;
  namespaceToken: string;
  productName: string;
};

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function resolvePackagedWinInstallIdentity(options: {
  namespace: string;
  releaseVersion: string | null | undefined;
}): PackagedWinInstallIdentity {
  const namespaceToken = sanitizeNamespace(options.namespace);
  const channel = releaseChannelFromVersion(options.releaseVersion)
    ?? releaseChannelFromNamespace(options.namespace, "default");
  const releaseIdentity = channel == null ? null : releaseInstallIdentity(channel);
  const productName = releaseIdentity?.productName ?? `Open Design ${namespaceToken}`;
  const displayName = releaseIdentity?.displayName ?? productName;
  return { displayName, namespaceToken, productName };
}
