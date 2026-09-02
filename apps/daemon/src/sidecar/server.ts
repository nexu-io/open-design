import { randomBytes } from "node:crypto";

import {
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  normalizeDaemonSidecarMessage,
  type DaemonStatusSnapshot,
  type DesktopExportArtifactInput,
  type DesktopExportArtifactResult,
  type DesktopExportPdfInput,
  type DesktopExportPdfResult,
  type DesktopRenderFramesInput,
  type DesktopRenderFramesResult,
  type DesktopRenderSlidesInput,
  type DesktopRenderSlidesResult,
  type DesktopStatusSnapshot,
  type MintImportTokenResult,
} from "@open-design/sidecar-proto";

import { startDaemonRuntime, type StartedDaemonRuntime } from "../daemon-startup.js";
import {
  getDesktopAuthSecret,
  isDesktopAuthGateActive,
  isDesktopAuthRegistered,
  setDesktopAuthSecret,
  signDesktopImportToken,
} from "../desktop-auth.js";

/**
 * PR #974 round 6 (mrcfps): pure wrapper that overlays the live
 * `desktopAuthGateActive` flag on a cached startup snapshot. The
 * STATUS IPC handler and the public `status()` method both call this
 * so the gate flag is always read fresh (it flips after
 * REGISTER_DESKTOP_AUTH and stays sticky), even though the rest of
 * the snapshot is captured once at boot. Exported so the daemon
 * test suite can pin the wiring without booting a real IPC server.
 */
export function withCurrentDesktopAuthGate(snapshot: DaemonStatusSnapshot): DaemonStatusSnapshot {
  return { ...snapshot, desktopAuthGateActive: isDesktopAuthGateActive() };
}

const DAEMON_PORT_ENV = SIDECAR_ENV.DAEMON_PORT;
const WEB_PORT_ENV = SIDECAR_ENV.WEB_PORT;
const DESKTOP_IMPORT_TOKEN_TTL_MS = 60_000;

export type DaemonSidecarHandle = {
  invoke(action: string, input: unknown): Promise<unknown>;
  status(): Promise<DaemonStatusSnapshot>;
  stop(): Promise<void>;
  waitUntilStopped(): Promise<void>;
};

export type DaemonSidecarRuntime = {
  base: string;
  mode?: string;
  namespace: string;
  source?: string;
  [field: string]: unknown;
};

function parsePort(value: string | undefined): number {
  if (value == null || value.trim().length === 0) return 0;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${DAEMON_PORT_ENV} must be an integer between 0 and 65535`);
  }
  return port;
}

function parseOptionalTrustedWebPort(value: string | undefined): number | null {
  const port = parsePort(value);
  return port > 0 ? port : null;
}

export function mintImportTokenForCli(baseDir: string): MintImportTokenResult {
  if (!isDesktopAuthGateActive()) {
    return {
      ok: false,
      code: "DESKTOP_AUTH_INACTIVE",
      message: "desktop import auth gate is inactive",
      retryable: false,
    };
  }
  const secret = getDesktopAuthSecret();
  if (secret == null || !isDesktopAuthRegistered()) {
    return {
      ok: false,
      code: "DESKTOP_AUTH_PENDING",
      message: "desktop auth required but secret not yet registered",
      retryable: true,
    };
  }
  const nonce = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + DESKTOP_IMPORT_TOKEN_TTL_MS).toISOString();
  return {
    ok: true,
    expiresAt,
    token: signDesktopImportToken(secret, baseDir, { nonce, exp: expiresAt }),
  };
}

export async function startDaemonSidecar(
  runtime: DaemonSidecarRuntime,
  options: {
    inheritedEnvironment?: (baseEnv?: NodeJS.ProcessEnv) => Record<string, string>;
    invokeDesktop?: <TResult>(action: string, input: unknown, timeoutMs: number) => Promise<TResult>;
    port?: number;
    statusDesktop?: (timeoutMs: number) => Promise<DesktopStatusSnapshot>;
  } = {},
): Promise<DaemonSidecarHandle> {
  const invokeDesktop = options.invokeDesktop ?? (async () => {
    throw new Error("desktop sidecar is unavailable");
  });
  const statusDesktop = options.statusDesktop ?? (async () => {
    throw new Error("desktop sidecar is unavailable");
  });
  const serverHandle: StartedDaemonRuntime = await startDaemonRuntime({
    desktopPdfExporter: async (input: DesktopExportPdfInput): Promise<DesktopExportPdfResult> => {
      return await invokeDesktop<DesktopExportPdfResult>(SIDECAR_MESSAGES.EXPORT_PDF, input, 600_000);
    },
    desktopFrameRenderer: async (input: DesktopRenderFramesInput): Promise<DesktopRenderFramesResult> => {
      let status: DesktopStatusSnapshot;
      try {
        status = await statusDesktop(5_000);
      } catch {
        return {
          ok: false,
          error: "Open Design desktop is not running. Open or upgrade the desktop client before rendering HyperFrames video.",
          errorCode: "FRAME_RENDERER_NOT_READY",
        };
      }
      if (status.state !== "running" || status.capabilities?.frameRenderer !== true) {
        return {
          ok: false,
          error: "This Open Design desktop version does not support HyperFrames rendering. Upgrade the desktop client and try again.",
          errorCode: "FRAME_RENDERER_NOT_READY",
        };
      }
      return await invokeDesktop<DesktopRenderFramesResult>(SIDECAR_MESSAGES.RENDER_FRAMES, input, 600_000);
    },
    desktopSlideRenderer: async (input: DesktopRenderSlidesInput): Promise<DesktopRenderSlidesResult> => {
      return await invokeDesktop<DesktopRenderSlidesResult>(SIDECAR_MESSAGES.RENDER_SLIDES, input, 600_000);
    },
    desktopArtifactExporter: async (input: DesktopExportArtifactInput): Promise<DesktopExportArtifactResult> => {
      return await invokeDesktop<DesktopExportArtifactResult>(SIDECAR_MESSAGES.EXPORT_ARTIFACT, input, 600_000);
    },
    ...(options.inheritedEnvironment == null ? {} : { inheritedEnvironment: options.inheritedEnvironment }),
    port: options.port ?? parsePort(process.env[DAEMON_PORT_ENV]),
    runtime,
  });

  // PR #974 round 6 (mrcfps): tools-dev's split-start hardening reads
  // `desktopAuthGateActive` from the STATUS IPC. The flag is dynamic
  // (flips to true on REGISTER_DESKTOP_AUTH) so the STATUS handler and
  // the public `status()` method below recompute it from
  // `isDesktopAuthGateActive()` per request — the value cached here is
  // a startup snapshot only.
  const state: DaemonStatusSnapshot = {
    desktopAuthGateActive: isDesktopAuthGateActive(),
    pid: process.pid,
    state: "running",
    trustedWebOriginPort: parseOptionalTrustedWebPort(process.env[WEB_PORT_ENV]),
    updatedAt: new Date().toISOString(),
    url: serverHandle.url,
  };
  let stopped = false;
  let resolveStopped!: () => void;
  const stoppedPromise = new Promise<void>((resolveStop) => {
    resolveStopped = resolveStop;
  });

  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    state.state = "stopped";
    state.updatedAt = new Date().toISOString();
    await serverHandle.stop().catch(() => undefined);
    resolveStopped();
  }

  async function invoke(action: string, input: unknown): Promise<unknown> {
      const request = normalizeDaemonSidecarMessage({ input, type: action });
      switch (request.type) {
        case SIDECAR_MESSAGES.STATUS:
          // PR #974 round 6 (mrcfps): recompute the gate flag per
          // request so `tools-dev start desktop` sees the live value
          // (the flag flips after REGISTER_DESKTOP_AUTH and stays sticky).
          return withCurrentDesktopAuthGate(state);
        case SIDECAR_MESSAGES.SHUTDOWN:
          throw new Error("sidecar lifecycle messages are private");
        case SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH:
          // PR #974: the desktop main process registers its per-process
          // auth secret here at startup. From this point on the HTTP
          // server's POST /api/import/folder middleware requires a valid
          // HMAC token signed with this secret, closing the
          // renderer→arbitrary-baseDir→shell.openPath bypass.
          setDesktopAuthSecret(Buffer.from(request.input.secret, "base64"));
          return { accepted: true };
        case SIDECAR_MESSAGES.MINT_IMPORT_TOKEN:
          return mintImportTokenForCli(request.input.baseDir);
        case SIDECAR_MESSAGES.REGISTER_WEB_URL: {
          // Packaged startup binds the web sidecar only after the daemon is
          // ready, so its dynamic port cannot be delivered in the daemon spawn
          // environment. The namespace-scoped control plane registers the
          // actual URL here as soon as web reports ready. Keep OD_WEB_PORT as
          // the daemon-wide live source because origin validation and MCP
          // install-info already resolve it per request.
          const webPort = Number(new URL(request.input.url).port);
          process.env[WEB_PORT_ENV] = String(webPort);
          state.trustedWebOriginPort = webPort;
          state.updatedAt = new Date().toISOString();
          return { accepted: true };
        }
      }
  }

  return {
    invoke,
    async status() {
      return withCurrentDesktopAuthGate(state);
    },
    stop,
    waitUntilStopped() {
      return stoppedPromise;
    },
  };
}
