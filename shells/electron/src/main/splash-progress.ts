import type { StandaloneBootstrapProgress } from "@open-design/standalone/protocol";

export type SplashBootStage =
  | "starting"
  | "engine"
  | "engineReady"
  | "interface"
  | "interfaceReady"
  | "workspace"
  | "finishing";

export type SplashProgressPayload = Readonly<{
  detail: string;
  label: string;
  percent: number | null;
}>;

export type SplashStageSurface = {
  isDestroyed(): boolean;
  webContents: {
    executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
    once(event: "did-finish-load", listener: () => void): void;
  };
};

type SplashStageState = {
  pendingPayload: SplashProgressPayload | null;
  ready: boolean;
  standaloneBlocking: boolean;
};

const SPLASH_STAGE_LABELS: Record<SplashBootStage, string> = {
  starting: "Starting Open Design",
  engine: "Starting the local engine",
  engineReady: "Local engine ready",
  interface: "Preparing the interface",
  interfaceReady: "Interface ready",
  workspace: "Opening your workspace",
  finishing: "Almost ready",
};

const SPLASH_STANDALONE_LABELS: Record<StandaloneBootstrapProgress["stage"], string> = {
  checking: "Checking Standalone",
  copying: "Loading Standalone",
  discovering: "Finding Standalone",
  downloading: "Downloading Standalone",
  materializing: "Installing Standalone",
  verifying: "Verifying Standalone",
  ready: "Standalone ready",
};

const SPLASH_RESOURCE_VERBS: Record<StandaloneBootstrapProgress["stage"], string> = {
  checking: "Preparing",
  copying: "Loading",
  discovering: "Finding",
  downloading: "Downloading",
  materializing: "Installing",
  ready: "Ready",
  verifying: "Verifying",
};

const splashStageState = new WeakMap<SplashStageSurface, SplashStageState>();

function formatSplashBytes(value: number): string {
  const mebibytes = value / (1024 * 1024);
  return `${mebibytes < 10 ? mebibytes.toFixed(1) : Math.round(mebibytes)} MB`;
}

export function splashBootProgressPayload(stage: SplashBootStage): SplashProgressPayload {
  return Object.freeze({ detail: "", label: SPLASH_STAGE_LABELS[stage], percent: null });
}

export function splashStandaloneProgressPayload(
  progress: StandaloneBootstrapProgress,
): SplashProgressPayload {
  const quantitative = progress.progress;
  let detail = "";
  let percent: number | null = progress.stage === "ready" ? 100 : null;
  if (quantitative != null) {
    percent = Math.round((quantitative.completed / quantitative.total) * 100);
    detail = quantitative.unit === "bytes"
      ? `${formatSplashBytes(quantitative.completed)} / ${formatSplashBytes(quantitative.total)}`
      : `${quantitative.completed} / ${quantitative.total} components`;
  }
  const resourceLabel = progress.stage === "ready"
    ? `${progress.subject.title} ready`
    : `${SPLASH_RESOURCE_VERBS[progress.stage]} ${progress.subject.title.toLowerCase()}`;
  const label = progress.subject.kind === "resource"
    ? resourceLabel
    : `${progress.initialLoad ? "First launch · " : ""}${SPLASH_STANDALONE_LABELS[progress.stage]}`;
  return Object.freeze({
    detail,
    label,
    percent,
  });
}

function applySplashProgress(splash: SplashStageSurface, payload: SplashProgressPayload): void {
  void splash.webContents
    .executeJavaScript(
      `window.__odSplashSetProgress && window.__odSplashSetProgress(${JSON.stringify(payload)});`,
      true,
    )
    .catch(() => undefined);
}

function deliver(splash: SplashStageSurface, state: SplashStageState, payload: SplashProgressPayload): void {
  if (state.ready) applySplashProgress(splash, payload);
  else state.pendingPayload = payload;
}

export function registerSplashStageTracking(splash: SplashStageSurface): void {
  const state: SplashStageState = {
    pendingPayload: null,
    ready: false,
    standaloneBlocking: false,
  };
  splashStageState.set(splash, state);
  splash.webContents.once("did-finish-load", () => {
    state.ready = true;
    const pending = state.pendingPayload;
    state.pendingPayload = null;
    if (pending != null) applySplashProgress(splash, pending);
  });
}

export function setSplashStage(splash: SplashStageSurface | null, stage: SplashBootStage): void {
  if (splash == null || splash.isDestroyed()) return;
  const state = splashStageState.get(splash);
  if (state == null) {
    applySplashProgress(splash, splashBootProgressPayload(stage));
    return;
  }
  if (state.standaloneBlocking) return;
  deliver(splash, state, splashBootProgressPayload(stage));
}

export function setSplashStandaloneProgress(
  splash: SplashStageSurface | null,
  progress: StandaloneBootstrapProgress,
): void {
  if (splash == null || splash.isDestroyed()) return;
  const state = splashStageState.get(splash);
  if (state == null) {
    applySplashProgress(splash, splashStandaloneProgressPayload(progress));
    return;
  }
  state.standaloneBlocking = progress.stage !== "ready";
  deliver(splash, state, splashStandaloneProgressPayload(progress));
}
