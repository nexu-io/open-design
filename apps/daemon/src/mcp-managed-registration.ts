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
