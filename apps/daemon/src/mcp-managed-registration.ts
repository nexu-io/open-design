// Extra MCP registration fields written when a managed outer launched this
// daemon (see apps/packaged/src/managed-headless.ts). A managed desktop can
// turn into, or be replaced by, a runtime in another sidecar mode, so the
// registration names every mode's endpoint instead of only this daemon's.
import {
  readCurrentSidecarStamp,
  resolveSidecarClientEndpoint,
  type SidecarStamp,
} from '@open-design/sidecar';
import { APP_KEYS, MCP_BOOTSTRAP_CONTRACT } from '@open-design/sidecar-proto';

import { isManagedMcpBootstrapEnv, type ManagedMcpDiscovery } from './mcp-bootstrap.js';

const MANAGED_OWNER_MODES = ['runtime', 'headless'] as const;

export function buildManagedMcpDiscovery(
  stamp: SidecarStamp,
  resolveEndpoint: (stamp: SidecarStamp) => string = resolveSidecarClientEndpoint,
): ManagedMcpDiscovery {
  const endpoints = (app: string) =>
    MANAGED_OWNER_MODES.map((mode) => resolveEndpoint({ ...stamp, app, mode }));
  return { daemon: endpoints(APP_KEYS.DAEMON), desktop: endpoints(APP_KEYS.DESKTOP) };
}

/** Registration env to add for a managed launch; empty otherwise. */
export function managedMcpRegistrationEnv(
  env: NodeJS.ProcessEnv = process.env,
  readStamp: () => SidecarStamp = readCurrentSidecarStamp,
): Record<string, string> {
  if (!isManagedMcpBootstrapEnv(env)) return {};
  try {
    return { [MCP_BOOTSTRAP_CONTRACT.DISCOVERY_ENV]: JSON.stringify(buildManagedMcpDiscovery(readStamp())) };
  } catch {
    // Not a sidecar-supervised daemon: keep the plain registration.
    return {};
  }
}

function bootstrapTargetArgs(raw: string | undefined): string[] | null {
  if (raw == null || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((arg) => typeof arg !== 'string')) return null;
    return (parsed as string[]).filter((arg) => arg !== MCP_BOOTSTRAP_CONTRACT.MANAGED_ARG);
  } catch {
    return null;
  }
}

/**
 * True when `existing` is this install's own registration: it serves the same
 * daemon data root (scoped by channel and namespace) and bootstraps the same
 * installed app. The Codex registration name is shared by every install on the
 * machine, so anything else (another channel, a local build, a copy of the app
 * elsewhere) belongs to someone else. A registration from before the managed
 * contract still matches: the managed marker is ignored when comparing.
 */
export function isCodexRegistrationOwnedBy(
  existing: { env: Record<string, string> },
  current: { env: Record<string, string> },
): boolean {
  const dataDir = current.env.OD_DATA_DIR;
  if (dataDir == null || dataDir.length === 0 || existing.env.OD_DATA_DIR !== dataDir) return false;
  const command = current.env.OD_MCP_BOOTSTRAP_COMMAND;
  if (command == null || command.length === 0 || existing.env.OD_MCP_BOOTSTRAP_COMMAND !== command) return false;
  const existingArgs = bootstrapTargetArgs(existing.env.OD_MCP_BOOTSTRAP_ARGS);
  const currentArgs = bootstrapTargetArgs(current.env.OD_MCP_BOOTSTRAP_ARGS);
  return existingArgs != null
    && currentArgs != null
    && existingArgs.length === currentArgs.length
    && existingArgs.every((arg, index) => arg === currentArgs[index]);
}
