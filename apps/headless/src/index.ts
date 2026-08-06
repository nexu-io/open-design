export const HEADLESS_CLOSURE_PHASES = {
  PREPARING: "preparing",
  DAEMON_STARTING: "daemon-starting",
  DAEMON_READY: "daemon-ready",
  WEB_STARTING: "web-starting",
  WEB_READY: "web-ready",
  RUNNING: "running",
  STOPPING: "stopping",
  STOPPED: "stopped",
  FAILED: "failed",
} as const;

export type HeadlessClosurePhase =
  (typeof HEADLESS_CLOSURE_PHASES)[keyof typeof HEADLESS_CLOSURE_PHASES];

/**
 * Roots already resolved by a launcher for one local product namespace.
 * Headless deliberately preserves these values verbatim: path discovery and
 * shell-specific storage policy belong to the launcher adapter.
 */
export interface HeadlessClosurePaths {
  cacheRoot: string;
  dataRoot: string;
  installationRoot: string;
  logsRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
}

export interface HeadlessRuntimeStatus {
  state: string;
  url: string | null;
}

export interface HeadlessRuntimeHandle<
  TStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
> {
  close(): Promise<void>;
  readStatus(): Promise<TStatus>;
  status: TStatus;
}

export interface StartHeadlessWebInput<
  TDaemonStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
> {
  daemon: TDaemonStatus;
  namespace: string;
  paths: Readonly<HeadlessClosurePaths>;
}

export interface HeadlessClosureDiagnostic {
  daemonUrl: string | null;
  error: string | null;
  namespace: string;
  paths: Readonly<HeadlessClosurePaths>;
  phase: HeadlessClosurePhase;
  webUrl: string | null;
}

export interface HeadlessClosureHealth<
  TDaemonStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
  TWebStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
> {
  daemon: TDaemonStatus | null;
  issues: string[];
  namespace: string;
  state: "healthy" | "degraded" | "stopped";
  web: TWebStatus | null;
}

export interface HeadlessClosureDependencies<
  TDaemonStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
  TWebStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
> {
  onDiagnostic?(diagnostic: HeadlessClosureDiagnostic): void;
  preparePaths(paths: Readonly<HeadlessClosurePaths>): Promise<void>;
  registerWebUrl(input: {
    daemon: TDaemonStatus;
    webUrl: string;
  }): Promise<void>;
  startDaemon(input: {
    namespace: string;
    paths: Readonly<HeadlessClosurePaths>;
  }): Promise<HeadlessRuntimeHandle<TDaemonStatus>>;
  startWeb(
    input: StartHeadlessWebInput<TDaemonStatus>,
  ): Promise<HeadlessRuntimeHandle<TWebStatus>>;
}

export interface AcquireHeadlessClosureOptions<
  TDaemonStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
  TWebStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
> {
  dependencies: HeadlessClosureDependencies<TDaemonStatus, TWebStatus>;
  namespace: string;
  paths: HeadlessClosurePaths;
}

export interface HeadlessClosureHandle<
  TDaemonStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
  TWebStatus extends HeadlessRuntimeStatus = HeadlessRuntimeStatus,
> {
  close(): Promise<void>;
  diagnostic(): HeadlessClosureDiagnostic;
  health(): Promise<HeadlessClosureHealth<TDaemonStatus, TWebStatus>>;
  readonly namespace: string;
  readonly paths: Readonly<HeadlessClosurePaths>;
  readonly webUrl: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertReadyUrl(runtime: "daemon" | "web", status: HeadlessRuntimeStatus): string {
  if (status.state !== "running" || status.url == null || status.url.length === 0) {
    throw new Error(
      `${runtime} did not report a running status with a URL`,
    );
  }
  return status.url;
}

function reportDiagnostic(
  listener: HeadlessClosureDependencies["onDiagnostic"],
  diagnostic: HeadlessClosureDiagnostic,
): void {
  try {
    listener?.(diagnostic);
  } catch {
    // Product startup and shutdown must not depend on an observability sink.
  }
}

export async function acquireHeadlessClosure<
  TDaemonStatus extends HeadlessRuntimeStatus,
  TWebStatus extends HeadlessRuntimeStatus,
>(
  options: AcquireHeadlessClosureOptions<TDaemonStatus, TWebStatus>,
): Promise<HeadlessClosureHandle<TDaemonStatus, TWebStatus>> {
  const { dependencies, namespace } = options;
  if (namespace.trim().length === 0) {
    throw new Error("headless closure namespace must not be empty");
  }

  const paths = Object.freeze({ ...options.paths });
  let phase: HeadlessClosurePhase = HEADLESS_CLOSURE_PHASES.PREPARING;
  let lastError: string | null = null;
  let daemon: HeadlessRuntimeHandle<TDaemonStatus> | null = null;
  let web: HeadlessRuntimeHandle<TWebStatus> | null = null;
  let daemonUrl: string | null = null;
  let webUrl: string | null = null;
  let closeTask: Promise<void> | null = null;

  const diagnostic = (): HeadlessClosureDiagnostic => ({
    daemonUrl,
    error: lastError,
    namespace,
    paths,
    phase,
    webUrl,
  });
  const transition = (nextPhase: HeadlessClosurePhase): void => {
    phase = nextPhase;
    reportDiagnostic(dependencies.onDiagnostic, diagnostic());
  };

  const closeStartedRuntimes = async (): Promise<void> => {
    const failures: unknown[] = [];
    if (web != null) {
      await web.close().catch((error: unknown) => failures.push(error));
    }
    if (daemon != null) {
      await daemon.close().catch((error: unknown) => failures.push(error));
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "failed to stop every headless closure runtime",
      );
    }
  };

  try {
    transition(HEADLESS_CLOSURE_PHASES.PREPARING);
    await dependencies.preparePaths(paths);

    transition(HEADLESS_CLOSURE_PHASES.DAEMON_STARTING);
    daemon = await dependencies.startDaemon({ namespace, paths });
    daemonUrl = assertReadyUrl("daemon", daemon.status);
    transition(HEADLESS_CLOSURE_PHASES.DAEMON_READY);

    transition(HEADLESS_CLOSURE_PHASES.WEB_STARTING);
    web = await dependencies.startWeb({
      daemon: daemon.status,
      namespace,
      paths,
    });
    webUrl = assertReadyUrl("web", web.status);
    await dependencies.registerWebUrl({ daemon: daemon.status, webUrl });
    transition(HEADLESS_CLOSURE_PHASES.WEB_READY);
    transition(HEADLESS_CLOSURE_PHASES.RUNNING);
  } catch (error) {
    lastError = errorMessage(error);
    await closeStartedRuntimes().catch(() => undefined);
    transition(HEADLESS_CLOSURE_PHASES.FAILED);
    throw error;
  }

  const activeDaemon = daemon;
  const activeWeb = web;
  const activeWebUrl = webUrl;
  if (activeDaemon == null || activeWeb == null || activeWebUrl == null) {
    throw new Error("headless closure reached an impossible incomplete state");
  }

  return {
    async close(): Promise<void> {
      if (closeTask != null) return await closeTask;
      transition(HEADLESS_CLOSURE_PHASES.STOPPING);
      closeTask = (async () => {
        try {
          await closeStartedRuntimes();
          transition(HEADLESS_CLOSURE_PHASES.STOPPED);
        } catch (error) {
          lastError = errorMessage(error);
          transition(HEADLESS_CLOSURE_PHASES.FAILED);
          throw error;
        }
      })();
      return await closeTask;
    },
    diagnostic,
    async health(): Promise<HeadlessClosureHealth<TDaemonStatus, TWebStatus>> {
      if (
        phase === HEADLESS_CLOSURE_PHASES.STOPPED
        || phase === HEADLESS_CLOSURE_PHASES.STOPPING
      ) {
        return {
          daemon: null,
          issues: [],
          namespace,
          state: "stopped",
          web: null,
        };
      }

      const issues: string[] = [];
      let daemonStatus: TDaemonStatus | null = null;
      let webStatus: TWebStatus | null = null;
      try {
        daemonStatus = await activeDaemon.readStatus();
        assertReadyUrl("daemon", daemonStatus);
      } catch (error) {
        issues.push(`daemon: ${errorMessage(error)}`);
      }
      try {
        webStatus = await activeWeb.readStatus();
        assertReadyUrl("web", webStatus);
      } catch (error) {
        issues.push(`web: ${errorMessage(error)}`);
      }
      return {
        daemon: daemonStatus,
        issues,
        namespace,
        state: issues.length === 0 ? "healthy" : "degraded",
        web: webStatus,
      };
    },
    namespace,
    paths,
    webUrl: activeWebUrl,
  };
}
