import { SIDECAR_DEFAULTS } from "@open-design/sidecar/protocol";
import {
  releaseInstallIdentity,
} from "@open-design/release";

import type { ToolPackConfig } from "../config.js";
import { resolveToolPackProductChannel } from "../local-runtime.js";
import { PRODUCT_NAME } from "./constants.js";

export type MacInstallIdentity = {
  appId: string;
  executableName: string;
  installerTitle: string;
  productName: string;
  publicAppBundleName: string;
  systemAppBundleName: string;
};

export function resolveMacInstallIdentity(
  config: Pick<ToolPackConfig, "debugChannel" | "namespace" | "releaseVersion">,
): MacInstallIdentity {
  const channel = resolveToolPackProductChannel(config, SIDECAR_DEFAULTS.namespace);
  if (channel === "local") {
    const productName = `${PRODUCT_NAME} Local`;
    return {
      appId: "io.open-design.desktop.local",
      executableName: productName,
      installerTitle: productName,
      productName,
      publicAppBundleName: `${productName}.app`,
      systemAppBundleName: `${productName}.app`,
    };
  }
  const channelIdentity = releaseInstallIdentity(channel);
  const publicAppBundleName = `${channelIdentity.productName}.app`;

  return {
    ...channelIdentity,
    executableName: channelIdentity.productName,
    installerTitle: channelIdentity.productName,
    publicAppBundleName,
    systemAppBundleName: publicAppBundleName,
  };
}
