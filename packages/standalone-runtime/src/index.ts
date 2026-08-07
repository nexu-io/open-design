/** Shell-neutral lifecycle shared by the Standalone app and launcher adapters. */
export const STANDALONE_PHASES = {
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

export type StandalonePhase =
  (typeof STANDALONE_PHASES)[keyof typeof STANDALONE_PHASES];

/**
 * Roots already resolved by a launcher for one local product namespace.
 * Standalone deliberately preserves these values verbatim: path discovery and
 * shell-specific storage policy belong to the launcher adapter.
 */
export interface StandalonePaths {
  cacheRoot: string;
  dataRoot: string;
  installationRoot: string;
  logsRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
}

export interface StandaloneRuntimeStatus {
  state: string;
  url: string | null;
}

export interface StandaloneRuntimeHandle<
  TStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
> {
  close(): Promise<void>;
  readStatus(): Promise<TStatus>;
  status: TStatus;
}

export interface StartStandaloneWebInput<
  TDaemonStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
> {
  daemon: TDaemonStatus;
  namespace: string;
  paths: Readonly<StandalonePaths>;
}

export interface StandaloneDiagnostic {
  daemonUrl: string | null;
  error: string | null;
  namespace: string;
  paths: Readonly<StandalonePaths>;
  phase: StandalonePhase;
  webUrl: string | null;
}

export interface StandaloneHealth<
  TDaemonStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
  TWebStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
> {
  daemon: TDaemonStatus | null;
  issues: string[];
  namespace: string;
  state: "healthy" | "degraded" | "stopped";
  web: TWebStatus | null;
}

export interface StandaloneDependencies<
  TDaemonStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
  TWebStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
> {
  onDiagnostic?(diagnostic: StandaloneDiagnostic): void;
  preparePaths(paths: Readonly<StandalonePaths>): Promise<void>;
  registerWebUrl(input: {
    daemon: TDaemonStatus;
    webUrl: string;
  }): Promise<void>;
  startDaemon(input: {
    namespace: string;
    paths: Readonly<StandalonePaths>;
  }): Promise<StandaloneRuntimeHandle<TDaemonStatus>>;
  startWeb(
    input: StartStandaloneWebInput<TDaemonStatus>,
  ): Promise<StandaloneRuntimeHandle<TWebStatus>>;
}

export interface AcquireStandaloneOptions<
  TDaemonStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
  TWebStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
> {
  dependencies: StandaloneDependencies<TDaemonStatus, TWebStatus>;
  namespace: string;
  paths: StandalonePaths;
}

export interface StandaloneHandle<
  TDaemonStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
  TWebStatus extends StandaloneRuntimeStatus = StandaloneRuntimeStatus,
> {
  close(): Promise<void>;
  diagnostic(): StandaloneDiagnostic;
  health(): Promise<StandaloneHealth<TDaemonStatus, TWebStatus>>;
  readonly namespace: string;
  readonly paths: Readonly<StandalonePaths>;
  readonly webUrl: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertReadyUrl(runtime: "daemon" | "web", status: StandaloneRuntimeStatus): string {
  if (status.state !== "running" || status.url == null || status.url.length === 0) {
    throw new Error(
      `${runtime} did not report a running status with a URL`,
    );
  }
  return status.url;
}

function reportDiagnostic(
  listener: StandaloneDependencies["onDiagnostic"],
  diagnostic: StandaloneDiagnostic,
): void {
  try {
    listener?.(diagnostic);
  } catch {
    // Product startup and shutdown must not depend on an observability sink.
  }
}

export async function acquireStandalone<
  TDaemonStatus extends StandaloneRuntimeStatus,
  TWebStatus extends StandaloneRuntimeStatus,
>(
  options: AcquireStandaloneOptions<TDaemonStatus, TWebStatus>,
): Promise<StandaloneHandle<TDaemonStatus, TWebStatus>> {
  const { dependencies, namespace } = options;
  if (namespace.trim().length === 0) {
    throw new Error("standalone namespace must not be empty");
  }

  const paths = Object.freeze({ ...options.paths });
  let phase: StandalonePhase = STANDALONE_PHASES.PREPARING;
  let lastError: string | null = null;
  let daemon: StandaloneRuntimeHandle<TDaemonStatus> | null = null;
  let web: StandaloneRuntimeHandle<TWebStatus> | null = null;
  let daemonUrl: string | null = null;
  let webUrl: string | null = null;
  let closeTask: Promise<void> | null = null;

  const diagnostic = (): StandaloneDiagnostic => ({
    daemonUrl,
    error: lastError,
    namespace,
    paths,
    phase,
    webUrl,
  });
  const transition = (nextPhase: StandalonePhase): void => {
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
        "failed to stop every standalone runtime",
      );
    }
  };

  try {
    transition(STANDALONE_PHASES.PREPARING);
    await dependencies.preparePaths(paths);

    transition(STANDALONE_PHASES.DAEMON_STARTING);
    daemon = await dependencies.startDaemon({ namespace, paths });
    daemonUrl = assertReadyUrl("daemon", daemon.status);
    transition(STANDALONE_PHASES.DAEMON_READY);

    transition(STANDALONE_PHASES.WEB_STARTING);
    web = await dependencies.startWeb({
      daemon: daemon.status,
      namespace,
      paths,
    });
    webUrl = assertReadyUrl("web", web.status);
    await dependencies.registerWebUrl({ daemon: daemon.status, webUrl });
    transition(STANDALONE_PHASES.WEB_READY);
    transition(STANDALONE_PHASES.RUNNING);
  } catch (error) {
    lastError = errorMessage(error);
    await closeStartedRuntimes().catch(() => undefined);
    transition(STANDALONE_PHASES.FAILED);
    throw error;
  }

  const activeDaemon = daemon;
  const activeWeb = web;
  const activeWebUrl = webUrl;
  if (activeDaemon == null || activeWeb == null || activeWebUrl == null) {
    throw new Error("standalone reached an impossible incomplete state");
  }

  return {
    async close(): Promise<void> {
      if (closeTask != null) return await closeTask;
      transition(STANDALONE_PHASES.STOPPING);
      closeTask = (async () => {
        try {
          await closeStartedRuntimes();
          transition(STANDALONE_PHASES.STOPPED);
        } catch (error) {
          lastError = errorMessage(error);
          transition(STANDALONE_PHASES.FAILED);
          throw error;
        }
      })();
      return await closeTask;
    },
    diagnostic,
    async health(): Promise<StandaloneHealth<TDaemonStatus, TWebStatus>> {
      if (
        phase === STANDALONE_PHASES.STOPPED
        || phase === STANDALONE_PHASES.STOPPING
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
