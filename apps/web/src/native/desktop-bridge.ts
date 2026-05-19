import type { ImportFolderResponse } from '@open-design/contracts';

export type DesktopBridgeKind = 'electron' | 'tauri';

export type DesktopPickAndImportResult =
  | { ok: true; response: ImportFolderResponse }
  | { canceled: true; ok: false }
  | { details?: unknown; ok: false; reason: string };

export interface DesktopBridge {
  kind: DesktopBridgeKind;
  openExternal?: (url: string) => Promise<boolean>;
  openPath?: (projectId: string) => Promise<string>;
  pickAndImport?: (init?: {
    name?: string;
    skillId?: string | null;
    designSystemId?: string | null;
  }) => Promise<DesktopPickAndImportResult>;
  printPdf?: (html: string, nonce?: string) => Promise<void>;
}

type ElectronBridgeWindow = Window & {
  __odDesktop?: {
    isDesktop?: boolean;
    printPdf?: (html: string, nonce?: string) => Promise<void>;
  };
  electronAPI?: {
    openExternal?: (url: string) => Promise<boolean>;
    openPath?: (projectId: string) => Promise<string>;
    pickAndImport?: DesktopBridge['pickAndImport'];
  };
};

type TauriBridgeWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

type TauriCore = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

type TauriCoreLoader = () => Promise<TauriCore>;

const loadDefaultTauriCore: TauriCoreLoader = async () => await import('@tauri-apps/api/core');
let loadTauriCore: TauriCoreLoader = loadDefaultTauriCore;

export function setTauriCoreLoaderForTests(loader: TauriCoreLoader | null): void {
  loadTauriCore = loader ?? loadDefaultTauriCore;
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await loadTauriCore();
  return await core.invoke<T>(command, args);
}

function hasTauriRuntime(win: Window): boolean {
  return (win as TauriBridgeWindow).__TAURI_INTERNALS__ != null;
}

function resolveElectronBridge(win: Window): DesktopBridge | null {
  const desktopWin = win as ElectronBridgeWindow;
  const electronApi = desktopWin.electronAPI;
  const desktopApi = desktopWin.__odDesktop;
  if (electronApi == null && typeof desktopApi?.printPdf !== 'function') return null;
  return {
    kind: 'electron',
    ...(electronApi?.openExternal == null ? {} : { openExternal: electronApi.openExternal }),
    ...(electronApi?.openPath == null ? {} : { openPath: electronApi.openPath }),
    ...(electronApi?.pickAndImport == null ? {} : { pickAndImport: electronApi.pickAndImport }),
    ...(desktopApi?.printPdf == null ? {} : { printPdf: desktopApi.printPdf }),
  };
}

function resolveTauriBridge(win: Window): DesktopBridge | null {
  if (!hasTauriRuntime(win)) return null;
  return {
    kind: 'tauri',
    openExternal: async (url) => await invokeTauri<boolean>('desktop_open_external', { url }),
    openPath: async (projectId) => await invokeTauri<string>('desktop_open_project_path', { projectId }),
    pickAndImport: async (init) => await invokeTauri<DesktopPickAndImportResult>('desktop_pick_and_import', {
      init: init ?? {},
    }),
  };
}

export function resolveDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return resolveElectronBridge(window) ?? resolveTauriBridge(window);
}

export function hasDesktopBridge(): boolean {
  return resolveDesktopBridge() != null;
}
