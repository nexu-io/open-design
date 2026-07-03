import type { ToolPackConfig } from "./config.js";

type PackagedRuntimeConfigExtra = Record<string, unknown>;

export function createPackagedRuntimeConfig(
  config: ToolPackConfig,
  packagedVersion: string,
  extra: PackagedRuntimeConfigExtra = {},
): Record<string, unknown> {
  const webSentryDsn = config.webSentryDsn ?? config.webSentryPublicDsn;

  return {
    appVersion: packagedVersion,
    namespace: config.namespace,
    ...extra,
    ...(config.sentryDsn == null ? {} : { sentryDsn: config.sentryDsn }),
    ...(config.sentryEnvironment == null ? {} : { sentryEnvironment: config.sentryEnvironment }),
    ...(config.sentryTracesSampleRate == null ? {} : { sentryTracesSampleRate: config.sentryTracesSampleRate }),
    ...(config.telemetryRelayUrl == null ? {} : { telemetryRelayUrl: config.telemetryRelayUrl }),
    webOutputMode: config.webOutputMode,
    ...(webSentryDsn == null ? {} : { webSentryDsn }),
    ...(config.portable ? {} : { namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot }),
  };
}
