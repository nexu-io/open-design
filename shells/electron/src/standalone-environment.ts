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
  nodeCommand: string;
  requireDesktopAuth?: boolean;
}>;

export function resolveShellNodeCommand(configured: string | null): string {
  if (configured != null) return configured;
  if (process.release.name === "node" && process.versions.electron == null) return process.execPath;
  throw new Error("Electron Shell is missing its official Node bootstrap resource; reinstall Open Design");
}

/** Project shell/installer configuration before entering immutable bootloader.mjs. */
export function createStandaloneBootstrapEnvironment(
  input: StandaloneBootstrapEnvironmentInput,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    OD_APP_VERSION: input.appVersion,
    OD_NODE_BIN: input.nodeCommand,
    OD_REQUIRE_DESKTOP_AUTH: input.requireDesktopAuth === false ? "0" : "1",
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
 * The body snapshots this environment into its sidecar launch specs before the
 * first handoff resolves. Electron itself is never repurposed as Node.
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
