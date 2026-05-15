import os from 'node:os';

// Pure builder for the /api/mcp/install-info payload. Extracted from
// the Express handler so the test fixture and the production handler
// share the exact env/argv/buildHint shape; a divergence here is the
// difference between an MCP snippet that works and one that EPERMs out
// when pasted into Antigravity / Cursor / VS Code (issue #848), or
// silently misses the sidecar transport endpoint.
//
// Side effects (the fs.existsSync probes, process.execPath, the
// ELECTRON_RUN_AS_NODE env read, OD_DATA_DIR resolution, sidecar IPC
// detection) all stay in the caller. This module is intentionally pure
// and free of @open-design/sidecar-proto so it can be unit-tested
// without booting the daemon.

export interface BuildMcpInstallPayloadInputs {
  cliPath: string;
  cliExists: boolean;
  execPath: string;
  nodeExists: boolean;
  port: number;
  platform: NodeJS.Platform;
  dataDir: string;
  electronAsNode: boolean;
  /** True when the daemon was bootstrapped as a sidecar and the
   *  spawned `od mcp` should discover the live URL via the IPC
   *  status socket instead of a baked --daemon-url. */
  isSidecarMode: boolean;
  /** Already-filtered sidecar transport env entries the
   *  caller wants propagated into the snippet. The caller decides
   *  what's worth propagating; this builder just merges. */
  sidecarEnv: Record<string, string>;
  /** Browser-facing Open Design studio base URL (e.g.
   *  `http://127.0.0.1:65321`). Used by MCP clients to build deep
   *  links to `/projects/.../conversations/.../files/...` so the
   *  outer agent can suggest a URL that shows both the file preview
   *  and the chat history for the run. Null when the daemon was
   *  launched without a known web port (CLI-only / headless). */
  webBaseUrl?: string | null;
  /** First valid daemon API key, when auth is enabled. Included in the
   *  snippet env as OD_API_KEY so the spawned `od mcp` can authenticate
   *  to a network-exposed daemon. Omitted when auth is not active. */
  apiKey?: string;
  /** When true, the daemon requires an API key but the raw key is not
   *  available (stored as hash). The snippet env will include a placeholder
   *  OD_API_KEY that the user must fill in. */
  authRequired?: boolean;
  /** True when the daemon is bound to a non-loopback address (0.0.0.0,
   *  LAN IP, Tailscale IP). The UI uses this to prompt key setup. */
  networkExposed?: boolean;
  /** The host the daemon is bound to (from --host or OD_BIND_HOST).
   *  Used to compute the remote MCP URL. */
  bindHost?: string;
  /** First valid MCP key, when available. Included in the payload so
   *  the UI can pre-fill Authorization headers in remote snippets. */
  mcpKey?: string;
  /** Externally routable base URL (from OD_PUBLIC_BASE_URL). When set,
   *  overrides the IP-derived remoteUrl so Cloudflare Tunnel / reverse
   *  proxy users get the correct public address. */
  publicBaseUrl?: string;
}

export interface McpInstallPayload {
  command: string;
  args: string[];
  env: Record<string, string>;
  daemonUrl: string;
  /** Browser-facing studio base URL the daemon is paired with, when
   *  known. MCP clients use this plus run/project context to build a
   *  studio deep link the outer agent can hand back to the user. */
  webBaseUrl: string | null;
  platform: NodeJS.Platform;
  cliExists: boolean;
  nodeExists: boolean;
  buildHint: string | null;
  networkExposed?: boolean;
  /** Streamable HTTP MCP URL for remote agents.
   *  Only present when the daemon is network-exposed. */
  remoteUrl?: string;
  /** First valid MCP key for remote auth. Included so the UI
   *  can pre-fill the Authorization header in remote snippets. */
  remoteMcpKey?: string;
}

export function buildMcpInstallPayload(
  inputs: BuildMcpInstallPayloadInputs,
): McpInstallPayload {
  const hints: string[] = [];
  if (!inputs.cliExists) {
    hints.push(
      `Open Design CLI entry is missing at ${inputs.cliPath}. Rebuild the daemon or packaged app and refresh.`,
    );
  }
  if (!inputs.nodeExists) {
    hints.push(
      `Node-compatible runtime at ${inputs.execPath} no longer exists. Reinstall Open Design or Node and restart the daemon.`,
    );
  }
  // Pin OD_DATA_DIR to the daemon's resolved data root so the spawned
  // MCP process writes to the same directory the daemon already uses
  // even when the IDE that launched it (Antigravity, VS Code, etc.)
  // does not inherit the packaged app's environment. Without this,
  // `od mcp` falls back to `<cwd>/.od/...` which is the read-only
  // macOS app bundle for packaged installs and trips EPERM. Issue #848.
  const env: Record<string, string> = {
    OD_DATA_DIR: inputs.dataDir,
    ...inputs.sidecarEnv,
  };
  if (inputs.apiKey) {
    env.OD_API_KEY = inputs.apiKey;
  } else if (inputs.authRequired) {
    env.OD_API_KEY = '<your-api-key>';
  }
  if (inputs.electronAsNode) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  // Sidecar mode: omit --daemon-url so the spawned `od mcp` discovers
  // the live URL via the IPC status socket on every spawn, surviving
  // ephemeral-port restarts. Direct `od --port X` launches have no
  // socket and need the URL baked.
  const args = inputs.isSidecarMode
    ? [inputs.cliPath, 'mcp']
    : [
        inputs.cliPath,
        'mcp',
        '--daemon-url',
        `http://127.0.0.1:${inputs.port}`,
      ];
  // Build the remote MCP URL. OD_PUBLIC_BASE_URL wins (Cloudflare Tunnel /
  // reverse proxy), otherwise derive from the bind host with interface
  // detection for Tailscale (100.x.x.x) and LAN IPs.
  const remoteUrl = inputs.publicBaseUrl
    ? `${inputs.publicBaseUrl}/mcp`
    : `http://${resolveRemoteHost(inputs.bindHost)}:${inputs.port}/mcp`;
  return {
    command: inputs.execPath,
    args,
    env,
    daemonUrl: `http://127.0.0.1:${inputs.port}`,
    webBaseUrl:
      typeof inputs.webBaseUrl === 'string' && inputs.webBaseUrl.length > 0
        ? inputs.webBaseUrl
        : null,
    // Surface platform so the install panel can localize path hints
    // (~/.cursor vs %USERPROFILE%\.cursor) and keyboard shortcuts
    // (Cmd vs Ctrl).
    platform: inputs.platform,
    cliExists: inputs.cliExists,
    nodeExists: inputs.nodeExists,
    buildHint: hints.length ? hints.join(' ') : null,
    ...(inputs.networkExposed ? {
      networkExposed: true,
      remoteUrl,
      ...(inputs.mcpKey ? { remoteMcpKey: inputs.mcpKey } : {}),
    } : {}),
  };
}

/** Map a bind host to a connectable address for remote clients.
 *
 *  Priority: Tailscale CGNAT range (100.64/10) → private LAN → hostname.
 *  Only invoked when bindHost is 0.0.0.0 / ::; specific IPs are returned
 *  as-is, and loopback falls back to 127.0.0.1. */
function resolveRemoteHost(bindHost?: string): string {
  if (!bindHost || bindHost === '127.0.0.1' || bindHost === '::1' || bindHost === 'localhost') {
    return '127.0.0.1';
  }
  if (bindHost === '0.0.0.0' || bindHost === '::') {
    return findTailscaleIp() ?? findLanIp() ?? os.hostname();
  }
  return bindHost;
}

/** Return the first Tailscale IP (100.64.0.0/10 CGNAT range) found on any
 *  network interface. Works on macOS (utun*) and Linux (tailscale0). */
function findTailscaleIp(): string | undefined {
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const second = parseInt(addr.address.split('.')[1] ?? '', 10);
      if (addr.address.startsWith('100.') && second >= 64 && second <= 127) {
        return addr.address;
      }
    }
  }
  return undefined;
}

/** Return the first private LAN IPv4 address (RFC 1918). */
function findLanIp(): string | undefined {
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const ip = addr.address;
      const b = parseInt(ip.split('.')[1] ?? '', 10);
      if (
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        (ip.startsWith('172.') && b >= 16 && b <= 31)
      ) {
        return ip;
      }
    }
  }
  return undefined;
}
