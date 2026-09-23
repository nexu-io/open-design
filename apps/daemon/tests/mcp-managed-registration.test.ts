import { MCP_BOOTSTRAP_CONTRACT } from '@open-design/sidecar-proto';
import { describe, expect, it } from 'vitest';

import { parseManagedMcpDiscovery } from '../src/mcp-bootstrap.js';
import { buildManagedMcpDiscovery, managedMcpRegistrationEnv } from '../src/mcp-managed-registration.js';

const stamp = { app: 'daemon', channel: 'prerelease', mode: 'headless', namespace: 'release-prerelease', source: 'packaged' } as const;
const fakeEndpoint = (s: { app: string; mode: string }) => `/ipc/${s.app}-${s.mode}.sock`;

describe('managed MCP registration', () => {
  it('names every mode of both the daemon and the desktop owner', () => {
    expect(buildManagedMcpDiscovery(stamp, fakeEndpoint)).toEqual({
      daemon: ['/ipc/daemon-runtime.sock', '/ipc/daemon-headless.sock'],
      desktop: ['/ipc/desktop-runtime.sock', '/ipc/desktop-headless.sock'],
    });
  });

  it('adds discovery only for a managed launch, in the shape the MCP process reads', () => {
    const managedArgs = JSON.stringify(['--headless', MCP_BOOTSTRAP_CONTRACT.MANAGED_ARG]);
    const env = managedMcpRegistrationEnv({ OD_MCP_BOOTSTRAP_ARGS: managedArgs }, () => stamp);
    expect(Object.keys(env)).toEqual([MCP_BOOTSTRAP_CONTRACT.DISCOVERY_ENV]);
    expect(parseManagedMcpDiscovery({ OD_MCP_BOOTSTRAP_ARGS: managedArgs, ...env })).not.toBeNull();

    // Registrations under an older outer are unchanged.
    expect(managedMcpRegistrationEnv({ OD_MCP_BOOTSTRAP_ARGS: '["--headless"]' }, () => stamp)).toEqual({});
  });

  it('keeps the plain registration when the daemon is not sidecar-supervised', () => {
    const managedArgs = JSON.stringify(['--headless', MCP_BOOTSTRAP_CONTRACT.MANAGED_ARG]);
    expect(managedMcpRegistrationEnv({ OD_MCP_BOOTSTRAP_ARGS: managedArgs }, () => { throw new Error('no stamp'); })).toEqual({});
  });
});
