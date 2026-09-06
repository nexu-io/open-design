import {
  OPEN_DESIGN_ELECTRON_CONTRACT_VERSION,
  type OpenDesignElectronBridge,
  type OpenDesignElectronDiagnosticsExportResult,
  type OpenDesignElectronGlobalScope,
  type OpenDesignElectronUpdaterStatusSnapshot,
} from "./index.js";
import { installElectronContractForTesting } from "./locator.js";

export type MockOpenDesignElectron = Partial<Omit<OpenDesignElectronBridge, "capture" | "client" | "diagnostics" | "lifecycle" | "pdf" | "pet" | "preview" | "project" | "shell" | "updater">> & {
  browser?: Partial<OpenDesignElectronBridge["browser"]>;
  capture?: Partial<OpenDesignElectronBridge["capture"]>;
  client?: Partial<OpenDesignElectronBridge["client"]>;
  diagnostics?: Partial<OpenDesignElectronBridge["diagnostics"]>;
  lifecycle?: Partial<OpenDesignElectronBridge["lifecycle"]>;
  pdf?: Partial<OpenDesignElectronBridge["pdf"]>;
  pet?: Partial<OpenDesignElectronBridge["pet"]>;
  preview?: Partial<NonNullable<OpenDesignElectronBridge["preview"]>>;
  project?: Partial<OpenDesignElectronBridge["project"]>;
  shell?: Partial<OpenDesignElectronBridge["shell"]>;
  updater?: Partial<OpenDesignElectronBridge["updater"]>;
};

export type MockOpenDesignElectronOptions = {
  host?: MockOpenDesignElectron;
  scope?: OpenDesignElectronGlobalScope;
};

function defaultHost(): OpenDesignElectronBridge {
  const updaterStatus: OpenDesignElectronUpdaterStatusSnapshot = {
    channel: "beta",
    schemaVersion: 1,
    lines: {
      closure: { actions: ["check"], blockedBy: 0, revision: 0, state: "idle", target: "closure" },
      shell: { actions: ["check"], blockedBy: 0, currentVersion: "1.0.0-beta.0", revision: 0, state: "idle", target: "shell" },
    },
  };
  return {
    version: OPEN_DESIGN_ELECTRON_CONTRACT_VERSION,
    browser: {
      clearData: async () => ({ ok: true }),
    },
    capture: {
      page: async () => ({ ok: true, dataUrl: "data:image/png;base64,", h: 1, w: 1 }),
    },
    client: {
      type: "desktop",
      platform: "test",
    },
    diagnostics: {
      exportToFile: async (): Promise<OpenDesignElectronDiagnosticsExportResult> => ({ ok: true, path: "/tmp/open-design-diagnostics.zip" }),
    },
    lifecycle: {
      ready: () => undefined,
    },
    shell: {
      openExternal: async () => ({ ok: true }),
      openPath: async () => ({ ok: true }),
    },
    project: {
      pickAndImport: async () => ({
        ok: true,
        projectId: "project-test",
        conversationId: "conversation-test",
        entryFile: "index.html",
      }),
      pickAndReplaceWorkingDir: async () => ({
        ok: true,
        baseDir: "/tmp/open-design-test",
        entryFile: null,
      }),
    },
    pdf: {
      print: async () => ({ ok: true }),
    },
    pet: {
      setVisible: () => undefined,
    },
    preview: {
      getLatestNavigationFailure: () => null,
      subscribeNavigationFailure: () => () => undefined,
    },
    updater: {
      apply: async () => updaterStatus,
      check: async () => updaterStatus,
      download: async () => updaterStatus,
      later: async () => updaterStatus,
      setMenuLabels: async () => ({ ok: true }),
      status: async () => updaterStatus,
      subscribe: () => () => undefined,
      subscribeOpenDialog: () => () => undefined,
    },
  };
}

export function createMockOpenDesignElectron(overrides: MockOpenDesignElectron = {}): OpenDesignElectronBridge {
  const base = defaultHost();
  return {
    ...base,
    ...overrides,
    browser: { ...base.browser, ...overrides.browser },
    capture: { ...base.capture, ...overrides.capture },
    client: { ...base.client, ...overrides.client },
    diagnostics: { ...base.diagnostics, ...overrides.diagnostics },
    lifecycle: { ...base.lifecycle, ...overrides.lifecycle },
    shell: { ...base.shell, ...overrides.shell },
    project: { ...base.project, ...overrides.project },
    pdf: { ...base.pdf, ...overrides.pdf },
    pet: { ...base.pet, ...overrides.pet },
    preview: {
      getLatestNavigationFailure:
        overrides.preview?.getLatestNavigationFailure
        ?? base.preview!.getLatestNavigationFailure,
      subscribeNavigationFailure:
        overrides.preview?.subscribeNavigationFailure
        ?? base.preview!.subscribeNavigationFailure,
    },
    updater: { ...base.updater, ...overrides.updater },
  };
}

export function installMockOpenDesignElectron(options: MockOpenDesignElectronOptions = {}): () => void {
  const scope = (options.scope ?? globalThis) as OpenDesignElectronGlobalScope;
  const host = createMockOpenDesignElectron(options.host);
  return installElectronContractForTesting(scope, host);
}
