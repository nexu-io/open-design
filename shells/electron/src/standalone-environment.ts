import type { PackagedConfig } from "./config.js";

export type StandaloneBootstrapEnvironmentInput = Readonly<{
  appVersion: string;
  config: Pick<
    PackagedConfig,
    | "amrProfile"
    | "posthogHost"
    | "posthogKey"
    | "telemetryRelayUrl"
    | "velaWebUrl"
  >;
  mcpBootstrap: Readonly<{
    args: readonly string[];
    command: string | null;
  }>;
  requireDesktopAuth?: boolean;
  runElectronAsNode?: boolean;
}>;

/** Project shell/installer configuration before entering immutable bootloader.mjs. */
export function createStandaloneBootstrapEnvironment(
  input: StandaloneBootstrapEnvironmentInput,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    OD_APP_VERSION: input.appVersion,
    OD_REQUIRE_DESKTOP_AUTH: input.requireDesktopAuth === false ? "0" : "1",
    ...(input.runElectronAsNode === false ? {} : { ELECTRON_RUN_AS_NODE: "1" }),
    ...(input.config.amrProfile == null ? {} : {
      OPEN_DESIGN_AMR_PROFILE: input.config.amrProfile,
    }),
    ...(input.config.posthogHost == null ? {} : { POSTHOG_HOST: input.config.posthogHost }),
    ...(input.config.posthogKey == null ? {} : { POSTHOG_KEY: input.config.posthogKey }),
    ...(input.config.telemetryRelayUrl == null ? {} : {
      OPEN_DESIGN_TELEMETRY_RELAY_URL: input.config.telemetryRelayUrl,
    }),
    ...(input.config.velaWebUrl == null ? {} : { OD_VELA_WEB_URL: input.config.velaWebUrl }),
    ...(input.mcpBootstrap.command == null ? {} : {
      OD_MCP_BOOTSTRAP_COMMAND: input.mcpBootstrap.command,
      OD_MCP_BOOTSTRAP_ARGS: JSON.stringify(input.mcpBootstrap.args),
    }),
  };
}

/**
 * Project Shell-owned launch context only while entering Standalone. Electron
 * renderer processes must never inherit ELECTRON_RUN_AS_NODE; the body has
 * already snapshotted this environment into its sidecar launch specs before
 * the first handoff resolves.
 */
export async function withStandaloneBootstrapEnvironment<T>(
  input: StandaloneBootstrapEnvironmentInput,
  task: () => Promise<T>,
): Promise<T> {
  const projected = createStandaloneBootstrapEnvironment(input, {});
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(projected)) {
    previous.set(key, process.env[key]);
    if (value != null) process.env[key] = value;
  }
  try {
    return await task();
  } finally {
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
