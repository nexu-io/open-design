/**
 * @module protocol
 *
 * The OpenDesign renderer host-bridge wire contract: the injected-global name
 * and version, client/updater constant registries, and every request/result
 * type that crosses the host bridge — including the {@link OpenDesignElectronBridge}
 * shape itself. Pure declarations only; depends on nothing else in the package.
 */

export const OPEN_DESIGN_ELECTRON_CONTRACT_VERSION = 2;

export const OPEN_DESIGN_ELECTRON_CLIENT_TYPES = Object.freeze({
  DESKTOP: "desktop",
} as const);

export type OpenDesignElectronClientType =
  (typeof OPEN_DESIGN_ELECTRON_CLIENT_TYPES)[keyof typeof OPEN_DESIGN_ELECTRON_CLIENT_TYPES];

export type OpenDesignElectronClient = {
  // BCP-47 locale string (e.g. "zh-CN", "pt-BR") the host process read from
  // the OS at startup. The renderer uses this so the packaged desktop app
  // can follow the OS language even when Chromium's built-in
  // `navigator.language` would have defaulted to en-US.
  osLocale?: string;
  platform?: string;
  type: OpenDesignElectronClientType;
};

export type OpenDesignElectronFailure = {
  details?: unknown;
  ok: false;
  reason: string;
};

export type OpenDesignElectronActionResult =
  | { ok: true }
  | OpenDesignElectronFailure;

export type OpenDesignElectronDiagnosticsExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

/**
 * The workspace attribution the renderer gives the host so a folder import
 * lands in the caller's current workspace instead of the host's ambient one.
 *
 * This is a deliberate structural subset of the daemon/web
 * `WorkspaceCollabContext`, redeclared here rather than imported: this package
 * is the renderer host-bridge wire contract and must stay independent of the
 * daemon/web contracts package (enforced by the "stays independent from
 * daemon/web contracts" test). A full `WorkspaceCollabContext` is structurally
 * assignable to this type, so callers pass theirs unchanged.
 *
 * Only the fields the host actually forwards are modelled, and the enum-like
 * fields stay `string` because the host treats them as opaque pass-through
 * values — the daemon remains the authority that parses and validates them.
 * Deliberately no index signature: an interface never satisfies one, so adding
 * it would reject the very `WorkspaceCollabContext` callers pass. Callers hand
 * over a variable, not a fresh literal, so the extra fields ride along fine.
 */
export type OpenDesignElectronWorkspaceContext = {
  lifecycleState: string;
  memberStatus: string;
  permissions: {
    canShareProjects: boolean;
    canWriteSyncedFiles: boolean;
  };
  role: string;
  workspaceId: string;
  workspaceMemberId: string;
  workspaceType: string;
};

export type OpenDesignElectronProjectImportInit = {
  designSystemId?: string | null;
  name?: string;
  skillId?: string | null;
  workspaceContext?: OpenDesignElectronWorkspaceContext | null;
};

export type OpenDesignElectronProjectImportSuccess = {
  conversationId: string;
  entryFile: string | null;
  ok: true;
  projectId: string;
};

export type OpenDesignElectronProjectImportResult =
  | OpenDesignElectronProjectImportSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignElectronFailure;

export type OpenDesignElectronProjectReplaceWorkingDirSuccess = {
  baseDir: string;
  entryFile: string | null;
  ok: true;
};

export type OpenDesignElectronProjectReplaceWorkingDirResult =
  | OpenDesignElectronProjectReplaceWorkingDirSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignElectronFailure;

export type OpenDesignElectronPickWorkingDirSuccess = {
  baseDir: string;
  ok: true;
  // Single-use HMAC token (minted by the host main process for `baseDir`)
  // that the renderer threads into POST /api/projects/:id/working-dir once
  // the project exists. Lets the Home flow pick a folder before the project
  // is created without exposing the daemon's desktop-auth gate.
  token: string;
};

export type OpenDesignElectronPickWorkingDirResult =
  | OpenDesignElectronPickWorkingDirSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignElectronFailure;

export type OpenDesignElectronPdfPrintOptions = {
  deck?: boolean;
};

export type OpenDesignElectronCaptureClip = { x: number; y: number; width: number; height: number };
export type OpenDesignElectronCaptureOptions = { clip?: OpenDesignElectronCaptureClip };
export type OpenDesignElectronCaptureSuccess = { dataUrl: string; h: number; ok: true; w: number };
export type OpenDesignElectronCaptureResult = OpenDesignElectronCaptureSuccess | OpenDesignElectronFailure;

export type OpenDesignElectronPreviewNavigationFailure = {
  errorCode: number;
  eventId: number;
  frameName?: string;
  occurredAtMs: number;
  validatedUrl: string;
};

export type OpenDesignElectronPreviewNavigationFailureListener = (
  failure: OpenDesignElectronPreviewNavigationFailure,
) => void;

export type OpenDesignElectronBrowserClearDataOptions = {
  cookies?: boolean;
  storage?: boolean;
};

/**
 * App theme values the renderer may pin the host window appearance to.
 * `light`/`dark` force the native window material (macOS under-window
 * vibrancy glass follows the OS appearance by default, which reads as a
 * muddy gray when the OS is dark but the app theme is explicitly light);
 * `system` restores following the OS.
 */
export const OPEN_DESIGN_ELECTRON_APPEARANCE_THEMES = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
  SYSTEM: "system",
} as const);

export type OpenDesignElectronAppearanceTheme =
  (typeof OPEN_DESIGN_ELECTRON_APPEARANCE_THEMES)[keyof typeof OPEN_DESIGN_ELECTRON_APPEARANCE_THEMES];

export const OPEN_DESIGN_ELECTRON_UPDATER_ACTIONS = Object.freeze({
  APPLY: "apply",
  CHECK: "check",
  DOWNLOAD: "download",
  LATER: "later",
} as const);

export type OpenDesignElectronUpdaterAction =
  (typeof OPEN_DESIGN_ELECTRON_UPDATER_ACTIONS)[keyof typeof OPEN_DESIGN_ELECTRON_UPDATER_ACTIONS];

export const OPEN_DESIGN_ELECTRON_UPDATER_STATES = Object.freeze({
  AVAILABLE: "available",
  APPLYING: "applying",
  BLOCKED: "blocked",
  CHECKING: "checking",
  DOWNLOADING: "downloading",
  ERROR: "error",
  IDLE: "idle",
  CURRENT: "current",
  READY: "ready",
  UNSUPPORTED: "unsupported",
} as const);

export type OpenDesignElectronUpdaterState =
  (typeof OPEN_DESIGN_ELECTRON_UPDATER_STATES)[keyof typeof OPEN_DESIGN_ELECTRON_UPDATER_STATES];

export type OpenDesignElectronUpdaterTarget = "closure" | "shell";

export type OpenDesignElectronUpdaterProgressSnapshot = {
  receivedBytes: number;
  totalBytes?: number;
};

export type OpenDesignElectronUpdaterErrorSnapshot = {
  code: string;
  details?: unknown;
  message: string;
};

export type OpenDesignElectronUpdaterLineSnapshot = {
  actions: readonly OpenDesignElectronUpdaterAction[];
  blockedBy: number;
  candidateVersion?: string;
  currentVersion?: string;
  error?: OpenDesignElectronUpdaterErrorSnapshot;
  progress?: OpenDesignElectronUpdaterProgressSnapshot;
  revision: number;
  state: OpenDesignElectronUpdaterState;
  target: OpenDesignElectronUpdaterTarget;
};

export type OpenDesignElectronUpdaterStatusSnapshot = {
  channel: string;
  lines: {
    closure: OpenDesignElectronUpdaterLineSnapshot;
    shell: OpenDesignElectronUpdaterLineSnapshot;
  };
  schemaVersion: 1;
};

export type OpenDesignElectronUpdaterResult =
  | { ok: true; status: OpenDesignElectronUpdaterStatusSnapshot }
  | OpenDesignElectronFailure;

export type OpenDesignElectronUpdaterStatusListener = (status: OpenDesignElectronUpdaterStatusSnapshot) => void;

export type OpenDesignElectronUpdaterApplyOptions = {
  force?: boolean;
};

export type OpenDesignElectronUpdaterMenuLabels = {
  check: string;
  checking: string;
  downloading: string;
  install: string;
  installing: string;
  restart: string;
};

export type OpenDesignElectronUpdaterOpenDialogRequest = {
  source: string;
};

export type OpenDesignElectronUpdaterOpenDialogListener = (request: OpenDesignElectronUpdaterOpenDialogRequest) => void;

export type OpenDesignElectronBridge = {
  // Optional so older host builds still satisfy the bridge shape; callers
  // must feature-detect before invoking.
  appearance?: {
    setTheme(theme: OpenDesignElectronAppearanceTheme): void;
  };
  browser: {
    clearData(options?: OpenDesignElectronBrowserClearDataOptions): Promise<OpenDesignElectronActionResult>;
  };
  capture: {
    page(options?: OpenDesignElectronCaptureOptions): Promise<OpenDesignElectronCaptureResult>;
  };
  client: OpenDesignElectronClient;
  diagnostics: {
    exportToFile(): Promise<OpenDesignElectronDiagnosticsExportResult>;
  };
  lifecycle: {
    ready(): void;
  };
  pdf: {
    print(html: string, nonce?: string, options?: OpenDesignElectronPdfPrintOptions): Promise<OpenDesignElectronActionResult>;
  };
  pet: {
    setVisible(visible: boolean): void;
  };
  // Optional so web builds and older desktop hosts keep the same contract.
  // Electron is the only layer that can observe a compositor-affecting
  // subframe navigation failure after the iframe DOM remains healthy.
  preview?: {
    getLatestNavigationFailure(): OpenDesignElectronPreviewNavigationFailure | null;
    subscribeNavigationFailure(listener: OpenDesignElectronPreviewNavigationFailureListener): () => void;
  };
  project: {
    pickAndImport(init?: OpenDesignElectronProjectImportInit): Promise<OpenDesignElectronProjectImportResult>;
    pickAndReplaceWorkingDir(projectId: string): Promise<OpenDesignElectronProjectReplaceWorkingDirResult>;
    // Optional so older host builds still satisfy the bridge shape; callers
    // must feature-detect before invoking.
    pickWorkingDir?(): Promise<OpenDesignElectronPickWorkingDirResult>;
  };
  shell: {
    openExternal(url: string): Promise<OpenDesignElectronActionResult>;
    openPath(projectId: string): Promise<OpenDesignElectronActionResult>;
  };
  updater: {
    apply(target: OpenDesignElectronUpdaterTarget, options?: OpenDesignElectronUpdaterApplyOptions): Promise<OpenDesignElectronUpdaterStatusSnapshot>;
    check(target?: OpenDesignElectronUpdaterTarget): Promise<OpenDesignElectronUpdaterStatusSnapshot>;
    download(target: OpenDesignElectronUpdaterTarget): Promise<OpenDesignElectronUpdaterStatusSnapshot>;
    later(target: OpenDesignElectronUpdaterTarget): Promise<OpenDesignElectronUpdaterStatusSnapshot>;
    setMenuLabels(labels: OpenDesignElectronUpdaterMenuLabels): Promise<OpenDesignElectronActionResult>;
    status(): Promise<OpenDesignElectronUpdaterStatusSnapshot>;
    subscribe(listener: OpenDesignElectronUpdaterStatusListener): () => void;
    subscribeOpenDialog(listener: OpenDesignElectronUpdaterOpenDialogListener): () => void;
  };
  version: typeof OPEN_DESIGN_ELECTRON_CONTRACT_VERSION;
};

export type OpenDesignElectronGlobalScope = Record<string, unknown> & {
  window?: unknown;
};
