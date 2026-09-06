const { contextBridge, ipcRenderer } = require('electron');

import type {
  OpenDesignElectronBridge,
  OpenDesignElectronActionResult,
  OpenDesignElectronBrowserClearDataOptions,
  OpenDesignElectronCaptureOptions,
  OpenDesignElectronCaptureResult,
  OpenDesignElectronDiagnosticsExportResult,
  OpenDesignElectronFailure,
  OpenDesignElectronProjectImportResult,
  OpenDesignElectronProjectImportInit,
  OpenDesignElectronProjectReplaceWorkingDirResult,
  OpenDesignElectronPickWorkingDirResult,
  OpenDesignElectronPreviewNavigationFailure,
  OpenDesignElectronPreviewNavigationFailureListener,
  OpenDesignElectronUpdaterApplyOptions,
  OpenDesignElectronUpdaterMenuLabels,
  OpenDesignElectronUpdaterOpenDialogListener,
  OpenDesignElectronUpdaterOpenDialogRequest,
  OpenDesignElectronUpdaterStatusListener,
  OpenDesignElectronUpdaterStatusSnapshot,
  OpenDesignElectronUpdaterTarget,
} from '@open-design/electron-contract';
import { OPEN_DESIGN_ELECTRON_CONTRACT_VERSION } from '@open-design/electron-contract';
import {
  installElectronRendererContract,
  parseElectronRendererMountAcknowledgement,
} from '@open-design/electron-kit/renderer';
import { ELECTRON_RENDERER_IPC } from '../../contracts/renderer-ipc.js';

const APP_CONFIG_CHANGED_IPC_CHANNEL = 'od:app-config-changed';
const APP_CONFIG_CHANGED_EVENT = 'open-design:app-config-changed';
const acknowledgement = parseElectronRendererMountAcknowledgement(process.argv);
let acknowledgedReady = false;

// Mirror of the argv prefix used by main's `applyOsLocaleSwitch` and
// runtime's `additionalArguments`. Duplicated literal on purpose: the
// The preload bundle must not pull in product main-process implementation (it
// transitively requires non-electron node modules that the sandboxed
// preload can't load).
const OS_LOCALE_ARG_PREFIX = '--od-os-locale=';

function readOsLocaleFromArgv(): string | undefined {
  for (const arg of process.argv) {
    if (typeof arg === 'string' && arg.startsWith(OS_LOCALE_ARG_PREFIX)) {
      const value = arg.slice(OS_LOCALE_ARG_PREFIX.length);
      if (value.length === 0) return undefined;
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return undefined;
}

type PrintPdfOptions = {
  deck?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function reasonFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure(reason: string, details?: unknown): OpenDesignElectronFailure {
  return {
    ...(details === undefined ? {} : { details }),
    ok: false,
    reason,
  };
}

function actionFailure(reason: string, details?: unknown): OpenDesignElectronActionResult {
  return failure(reason, details);
}

function importFailure(reason: string): OpenDesignElectronProjectImportResult {
  return failure(reason);
}

function replaceWorkingDirFailure(reason: string): OpenDesignElectronProjectReplaceWorkingDirResult {
  return failure(reason);
}

function normalizeProjectReplaceWorkingDirResult(input: unknown): OpenDesignElectronProjectReplaceWorkingDirResult {
  if (!isRecord(input)) return failure('desktop working-dir replace returned an invalid response', input);
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    return failure(
      typeof input.reason === 'string' && input.reason.length > 0 ? input.reason : 'unknown failure',
      input.details,
    );
  }

  const response = input.response;
  if (!isRecord(response)) return failure('daemon working-dir response was not an object', response);
  const baseDir = typeof response.baseDir === 'string' ? response.baseDir : null;
  const entryFile =
    typeof response.entryFile === 'string' ? response.entryFile : null;
  if (baseDir == null) {
    return failure('daemon working-dir response did not include baseDir', response);
  }

  return { baseDir, entryFile, ok: true };
}

function pickWorkingDirFailure(reason: string): OpenDesignElectronPickWorkingDirResult {
  return failure(reason);
}

function normalizePickWorkingDirResult(input: unknown): OpenDesignElectronPickWorkingDirResult {
  if (!isRecord(input)) return failure('desktop working-dir pick returned an invalid response', input);
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    return failure(
      typeof input.reason === 'string' && input.reason.length > 0 ? input.reason : 'unknown failure',
      input.details,
    );
  }
  const baseDir = typeof input.baseDir === 'string' ? input.baseDir : null;
  const token = typeof input.token === 'string' ? input.token : null;
  if (baseDir == null || token == null) {
    return failure('desktop working-dir pick did not include baseDir and token', input);
  }
  return { baseDir, ok: true, token };
}

function normalizeProjectImportResult(input: unknown): OpenDesignElectronProjectImportResult {
  if (!isRecord(input)) return failure('desktop import returned an invalid response', input);
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    return failure(
      typeof input.reason === 'string' && input.reason.length > 0 ? input.reason : 'unknown failure',
      input.details,
    );
  }

  const response = input.response;
  if (!isRecord(response)) return failure('daemon import response was not an object', response);
  const project = response.project;
  const rawProjectId = isRecord(project) ? project.id : null;
  const projectId = typeof rawProjectId === 'string' ? rawProjectId : null;
  const conversationId = typeof response.conversationId === 'string' ? response.conversationId : null;
  const entryFile =
    typeof response.entryFile === 'string' || response.entryFile === null
      ? response.entryFile
      : undefined;
  if (projectId == null || conversationId == null || entryFile === undefined) {
    return failure('daemon import response did not include host project identifiers', response);
  }

  return {
    conversationId,
    entryFile,
    ok: true,
    projectId,
  };
}

// PR #974 trust boundary. The renderer no longer receives a raw
// filesystem path from the main process: `pickFolder` was deleted from
// this bridge and replaced with `pickAndImport`, which shows the
// folder picker, mints an HMAC token bound to the chosen path, and
// POSTs `/api/import/folder` from the main process — all atomically.
// The renderer only ever sees the host-owned project identifiers or a
// structured error envelope. A compromised renderer cannot name an
// arbitrary baseDir even indirectly because the picker dialog is the
// single source of paths crossing into the daemon, and it lives in the
// main process.

// Keep this file dependency-free at runtime: in sandbox: true preloads only
// the `electron` module is safe to require. The diagnostics channel name is
// duplicated from main/diagnostics.ts on purpose so the preload bundle does
// not pull in node-only modules transitively.
const project = {
  pickAndImport: (
    init?: OpenDesignElectronProjectImportInit,
  ): Promise<OpenDesignElectronProjectImportResult> =>
    ipcRenderer.invoke(ELECTRON_RENDERER_IPC.projectPickAndImport, init ?? null)
      .then(normalizeProjectImportResult)
      .catch((error: unknown) => importFailure(reasonFromError(error))),
  pickAndReplaceWorkingDir: (projectId: string): Promise<OpenDesignElectronProjectReplaceWorkingDirResult> =>
    ipcRenderer.invoke(ELECTRON_RENDERER_IPC.projectPickAndReplaceWorkingDir, { projectId })
      .then(normalizeProjectReplaceWorkingDirResult)
      .catch((error: unknown) => replaceWorkingDirFailure(reasonFromError(error))),
  pickWorkingDir: (): Promise<OpenDesignElectronPickWorkingDirResult> =>
    ipcRenderer.invoke(ELECTRON_RENDERER_IPC.projectPickWorkingDir)
      .then(normalizePickWorkingDirResult)
      .catch((error: unknown) => pickWorkingDirFailure(reasonFromError(error))),
};

const shell = {
  openExternal: async (url: string): Promise<OpenDesignElectronActionResult> => {
    try {
      const opened = await ipcRenderer.invoke(ELECTRON_RENDERER_IPC.shellOpenExternal, url);
      return opened === true
        ? { ok: true }
        : actionFailure('external URL was not opened');
    } catch (error) {
      return actionFailure(reasonFromError(error));
    }
  },
  // Reveals the named project's working directory in the OS file
  // manager. The renderer passes a project ID; the main process asks
  // the daemon for the canonical resolvedDir and forwards that path
  // (validated) to shell.openPath. For folder-imported projects, the
  // main process additionally requires `metadata.fromTrustedPicker`
  // to be true (set by the HMAC-gated import flow), so renderer code
  // cannot ask the bridge to open arbitrary local paths even
  // indirectly through legacy or future project-creation routes.
  openPath: async (projectId: string): Promise<OpenDesignElectronActionResult> => {
    try {
      const result = await ipcRenderer.invoke(ELECTRON_RENDERER_IPC.shellOpenProjectPath, projectId);
      if (typeof result === 'string' && result.length > 0) return actionFailure(result);
      return { ok: true };
    } catch (error) {
      return actionFailure(reasonFromError(error));
    }
  },
};

const browser = {
  clearData: async (options?: OpenDesignElectronBrowserClearDataOptions): Promise<OpenDesignElectronActionResult> => {
    try {
      return await ipcRenderer.invoke(ELECTRON_RENDERER_IPC.browserClearData, options ?? null);
    } catch (error) {
      return actionFailure(reasonFromError(error));
    }
  },
};

const capture = {
  page: async (options?: OpenDesignElectronCaptureOptions): Promise<OpenDesignElectronCaptureResult> => {
    try {
      return await ipcRenderer.invoke(ELECTRON_RENDERER_IPC.capturePage, options ?? null);
    } catch (error) {
      return failure(reasonFromError(error));
    }
  },
};

let latestPreviewNavigationFailure: OpenDesignElectronPreviewNavigationFailure | null = null;
const previewNavigationFailureListeners = new Set<OpenDesignElectronPreviewNavigationFailureListener>();

ipcRenderer.on(ELECTRON_RENDERER_IPC.previewNavigationFailed, (
  _event: unknown,
  failure: OpenDesignElectronPreviewNavigationFailure,
): void => {
  if (
    failure == null
    || typeof failure !== 'object'
    || !Number.isSafeInteger(failure.eventId)
    || typeof failure.errorCode !== 'number'
    || !Number.isFinite(failure.occurredAtMs)
    || typeof failure.validatedUrl !== 'string'
    || (failure.frameName !== undefined && typeof failure.frameName !== 'string')
  ) return;
  latestPreviewNavigationFailure = failure;
  for (const listener of previewNavigationFailureListeners) {
    try {
      listener(failure);
    } catch {
      // A renderer listener must not prevent other active viewers from
      // receiving the same host-owned failure signal.
    }
  }
});

const preview = {
  getLatestNavigationFailure: (): OpenDesignElectronPreviewNavigationFailure | null =>
    latestPreviewNavigationFailure,
  subscribeNavigationFailure: (
    listener: OpenDesignElectronPreviewNavigationFailureListener,
  ): (() => void) => {
    previewNavigationFailureListeners.add(listener);
    return () => {
      previewNavigationFailureListeners.delete(listener);
    };
  },
};

const updater = {
  apply: (target: OpenDesignElectronUpdaterTarget, options?: OpenDesignElectronUpdaterApplyOptions): Promise<OpenDesignElectronUpdaterStatusSnapshot> =>
    ipcRenderer.invoke(ELECTRON_RENDERER_IPC.updaterApply, target, options ?? null),
  check: (target?: OpenDesignElectronUpdaterTarget): Promise<OpenDesignElectronUpdaterStatusSnapshot> =>
    ipcRenderer.invoke(ELECTRON_RENDERER_IPC.updaterCheck, target ?? null),
  download: (target: OpenDesignElectronUpdaterTarget): Promise<OpenDesignElectronUpdaterStatusSnapshot> =>
    ipcRenderer.invoke(ELECTRON_RENDERER_IPC.updaterDownload, target),
  later: (target: OpenDesignElectronUpdaterTarget): Promise<OpenDesignElectronUpdaterStatusSnapshot> =>
    ipcRenderer.invoke(ELECTRON_RENDERER_IPC.updaterLater, target),
  setMenuLabels: async (labels: OpenDesignElectronUpdaterMenuLabels): Promise<OpenDesignElectronActionResult> => {
    try {
      return await ipcRenderer.invoke(ELECTRON_RENDERER_IPC.updaterSetMenuLabels, labels);
    } catch (error) {
      return actionFailure(reasonFromError(error));
    }
  },
  status: (): Promise<OpenDesignElectronUpdaterStatusSnapshot> =>
    ipcRenderer.invoke(ELECTRON_RENDERER_IPC.updaterStatus),
  subscribe: (listener: OpenDesignElectronUpdaterStatusListener): (() => void) => {
    const handler = (_event: unknown, status: OpenDesignElectronUpdaterStatusSnapshot): void => {
      listener(status);
    };
    ipcRenderer.on(ELECTRON_RENDERER_IPC.updaterStatusChanged, handler);
    return () => {
      ipcRenderer.removeListener(ELECTRON_RENDERER_IPC.updaterStatusChanged, handler);
    };
  },
  subscribeOpenDialog: (listener: OpenDesignElectronUpdaterOpenDialogListener): (() => void) => {
    const handler = (_event: unknown, request: OpenDesignElectronUpdaterOpenDialogRequest): void => {
      if (request == null || typeof request !== 'object' || typeof request.source !== 'string') return;
      listener({ source: request.source });
    };
    ipcRenderer.on(ELECTRON_RENDERER_IPC.updaterOpenDialog, handler);
    return () => {
      ipcRenderer.removeListener(ELECTRON_RENDERER_IPC.updaterOpenDialog, handler);
    };
  },
};

const osLocale = readOsLocaleFromArgv();

ipcRenderer.on(APP_CONFIG_CHANGED_IPC_CHANNEL, () => {
  window.dispatchEvent(new CustomEvent(APP_CONFIG_CHANGED_EVENT));
});

const hostBridge = {
  version: OPEN_DESIGN_ELECTRON_CONTRACT_VERSION,
  client: {
    type: 'desktop',
    platform: process.platform,
    ...(osLocale !== undefined ? { osLocale } : {}),
  },
  diagnostics: {
    exportToFile: (): Promise<OpenDesignElectronDiagnosticsExportResult> =>
      ipcRenderer.invoke(ELECTRON_RENDERER_IPC.diagnosticsExport) as Promise<OpenDesignElectronDiagnosticsExportResult>,
  },
  lifecycle: {
    ready(): void {
      if (acknowledgedReady) return;
      acknowledgedReady = true;
      ipcRenderer.send(acknowledgement.channel, acknowledgement);
    },
  },
  appearance: {
    // Pin the native window appearance (macOS vibrancy glass material) to the
    // app theme. Fire-and-forget: the main process validates the value.
    setTheme: (theme: 'light' | 'dark' | 'system'): void =>
      ipcRenderer.send(ELECTRON_RENDERER_IPC.appearanceSetTheme, theme),
  },
  shell,
  browser,
  capture,
  preview,
  project,
  pdf: {
    print: async (html: string, nonce?: string, options?: PrintPdfOptions): Promise<OpenDesignElectronActionResult> => {
      try {
        await ipcRenderer.invoke(ELECTRON_RENDERER_IPC.pdfPrint, html, nonce, options ?? null);
        return { ok: true };
      } catch (error) {
        return actionFailure(reasonFromError(error));
      }
    },
  },
  pet: {
    setVisible: (visible: boolean): void =>
      ipcRenderer.send(ELECTRON_RENDERER_IPC.petSetVisible, Boolean(visible)),
  },
  updater,
} satisfies OpenDesignElectronBridge;

installElectronRendererContract({
  exposeInMainWorld(slot, bridge) {
    contextBridge.exposeInMainWorld(slot, bridge);
  },
}, hostBridge);
