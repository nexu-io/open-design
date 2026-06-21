import {
  OPEN_DESIGN_HOST_GLOBAL,
  OPEN_DESIGN_HOST_VERSION,
  type OpenDesignHostBridge,
  type OpenDesignHostGlobalScope,
  type OpenDesignHostUpdaterStatusSnapshot,
} from "./index.js";

export type MockOpenDesignHost = Partial<Omit<OpenDesignHostBridge, "capture" | "client" | "pdf" | "pet" | "project" | "shell" | "updater">> & {
  browser?: Partial<OpenDesignHostBridge["browser"]>;
  capture?: Partial<OpenDesignHostBridge["capture"]>;
  client?: Partial<OpenDesignHostBridge["client"]>;
  pdf?: Partial<OpenDesignHostBridge["pdf"]>;
  pet?: Partial<OpenDesignHostBridge["pet"]>;
  project?: Partial<OpenDesignHostBridge["project"]>;
  shell?: Partial<OpenDesignHostBridge["shell"]>;
  updater?: Partial<OpenDesignHostBridge["updater"]>;
};

export type MockOpenDesignHostOptions = {
  host?: MockOpenDesignHost;
  scope?: OpenDesignHostGlobalScope;
};

function defaultHost(): OpenDesignHostBridge {
  const updaterStatus: OpenDesignHostUpdaterStatusSnapshot = {
    arch: "arm64",
    capabilities: {
      canApplyInPlace: false,
      canDownload: true,
      canOpenInstaller: true,
      requiresManualInstall: true,
    },
    channel: "beta",
    currentVersion: "1.0.0-beta.0",
    enabled: true,
    mode: "package-launcher",
    platform: "darwin",
    state: "idle",
    supported: true,
  };
  return {
    version: OPEN_DESIGN_HOST_VERSION,
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
    updater: {
      check: async () => updaterStatus,
      download: async () => updaterStatus,
      install: async () => updaterStatus,
      quit: async () => ({ ok: true }),
      status: async () => updaterStatus,
      subscribe: () => () => undefined,
    },
  };
}

export function createMockOpenDesignHost(overrides: MockOpenDesignHost = {}): OpenDesignHostBridge {
  const base = defaultHost();
  return {
    ...base,
    ...overrides,
    browser: { ...base.browser, ...overrides.browser },
    capture: { ...base.capture, ...overrides.capture },
    client: { ...base.client, ...overrides.client },
    shell: { ...base.shell, ...overrides.shell },
    project: { ...base.project, ...overrides.project },
    pdf: { ...base.pdf, ...overrides.pdf },
    pet: { ...base.pet, ...overrides.pet },
    updater: { ...base.updater, ...overrides.updater },
  };
}

export function installMockOpenDesignHost(options: MockOpenDesignHostOptions = {}): () => void {
  const scope = (options.scope ?? globalThis) as OpenDesignHostGlobalScope;
  const host = createMockOpenDesignHost(options.host);
  const windowValue = scope.window;
  const targets = [
    scope,
    ...(typeof windowValue === "object" && windowValue != null && windowValue !== scope
      ? [windowValue as OpenDesignHostGlobalScope]
      : []),
  ];
  const previous = targets.map((target) => ({
    had: Object.prototype.hasOwnProperty.call(target, OPEN_DESIGN_HOST_GLOBAL),
    target,
    value: target[OPEN_DESIGN_HOST_GLOBAL],
  }));

  for (const target of targets) {
    Object.defineProperty(target, OPEN_DESIGN_HOST_GLOBAL, {
      configurable: true,
      value: host,
      writable: true,
    });
  }

  return () => {
    for (const entry of previous) {
      if (entry.had) {
        Object.defineProperty(entry.target, OPEN_DESIGN_HOST_GLOBAL, {
          configurable: true,
          value: entry.value,
          writable: true,
        });
      } else {
        delete entry.target[OPEN_DESIGN_HOST_GLOBAL];
      }
    }
  };
}
