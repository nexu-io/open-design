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
}

export interface McpInstallPayload {
  command: string;
  args: string[];
  env: Record<string, string>;
  daemonUrl: string;
  platform: NodeJS.Platform;
  cliExists: boolean;
  nodeExists: boolean;
  buildHint: string | null;
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
  return {
    command: inputs.execPath,
    args,
    env,
    daemonUrl: `http://127.0.0.1:${inputs.port}`,
    // Surface platform so the install panel can localize path hints
    // (~/.cursor vs %USERPROFILE%\.cursor) and keyboard shortcuts
    // (Cmd vs Ctrl).
    platform: inputs.platform,
    cliExists: inputs.cliExists,
    nodeExists: inputs.nodeExists,
    buildHint: hints.length ? hints.join(' ') : null,
  };
}
