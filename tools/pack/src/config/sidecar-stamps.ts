import {
  APP_KEYS,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import type { SidecarStamp, SidecarStopRequest } from "@open-design/sidecar";
import { releaseChannelFromNamespace, releaseChannelFromVersion } from "@open-design/release";

import type { ToolPackConfig } from "./index.js";

type PackagedSource = typeof SIDECAR_SOURCES.TOOLS_PACK | typeof SIDECAR_SOURCES.PACKAGED;

export function toolPackSidecarStamp(
  config: ToolPackConfig,
  options: {
    app?: SidecarStamp["app"];
    mode?: SidecarStamp["mode"];
    source?: PackagedSource;
  } = {},
): SidecarStamp {
  return {
    app: options.app ?? APP_KEYS.DESKTOP,
    channel: releaseChannelFromVersion(config.appVersion)
      ?? releaseChannelFromNamespace(config.namespace, "default")
      ?? "stable",
    mode: options.mode ?? SIDECAR_MODES.RUNTIME,
    namespace: config.namespace,
    source: options.source ?? SIDECAR_SOURCES.TOOLS_PACK,
  };
}

/**
 * Every process resource that may belong to one packaged namespace. tools-pack
 * owns this product declaration; packages/sidecar owns how the set is observed
 * and retired.
 */
export function packagedSidecarStopRequests(
  config: ToolPackConfig,
  desktopMode: SidecarStamp["mode"] = SIDECAR_MODES.RUNTIME,
): SidecarStopRequest[] {
  return [SIDECAR_SOURCES.TOOLS_PACK, SIDECAR_SOURCES.PACKAGED].flatMap((source) => [
    { stamp: toolPackSidecarStamp(config, { app: APP_KEYS.DESKTOP, mode: desktopMode, source }) },
    {
      options: {
        gracefulRequestTimeoutMs: 500,
        killGraceMs: 750,
        termGraceMs: 750,
      },
      stamp: toolPackSidecarStamp(config, { app: APP_KEYS.WEB, mode: desktopMode, source }),
    },
    { stamp: toolPackSidecarStamp(config, { app: APP_KEYS.DAEMON, mode: desktopMode, source }) },
  ]);
}

export function allPackagedSidecarStopRequests(config: ToolPackConfig): SidecarStopRequest[] {
  return [
    ...packagedSidecarStopRequests(config, SIDECAR_MODES.RUNTIME),
    ...packagedSidecarStopRequests(config, "headless"),
  ];
}
