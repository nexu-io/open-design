import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  OPEN_DESIGN_ELECTRON_CONTRACT_VERSION,
  applyElectronUpdater,
  clearElectronBrowserData,
  checkElectronUpdater,
  detectOpenDesignElectronClientType,
  getLatestElectronPreviewNavigationFailure,
  getElectronUpdaterStatus,
  getOpenDesignElectron,
  isOpenDesignElectronAvailable,
  isOpenDesignElectronBridge,
  normalizeOpenDesignElectronProjectImportResult,
  openElectronExternalUrl,
  pickAndImportElectronProject,
  printElectronPdf,
  openElectronProjectPath,
  setElectronUpdaterMenuLabels,
  setElectronPetVisible,
  signalElectronReady,
  subscribeElectronUpdaterOpenDialog,
  subscribeElectronUpdater,
  subscribeElectronPreviewNavigationFailure,
} from "@/index.js";
import { createMockOpenDesignElectron, installMockOpenDesignElectron } from "@/testing.js";
import { validateOpenDesignElectronAuthRegisterRequest } from "@/runtime-auth.js";

const contractRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return filesUnder(path);
    return /\.(ts|tsx|cts|mts)$/.test(path) ? [path] : [];
  });
}

describe("open-design electron contract", () => {
  it("validates the finite Electron auth registration command", () => {
    const secret = Buffer.alloc(32, 7).toString("base64");
    expect(validateOpenDesignElectronAuthRegisterRequest({ schemaVersion: 1, operation: "register", secret }))
      .toEqual({ schemaVersion: 1, operation: "register", secret });
    expect(() => validateOpenDesignElectronAuthRegisterRequest({ schemaVersion: 1, operation: "register", secret: "short" })).toThrow();
  });
  it("stays a dependency leaf", () => {
    const pkg = JSON.parse(readFileSync(join(contractRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect({
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    }).not.toHaveProperty("@open-design/contracts");
    expect(pkg.dependencies).toBeUndefined();

    const forbiddenImports = ["@open-design/contracts", "@open-design/electron-kit", "@open-design/release", "@open-design/sidecar"];
    const offenders = filesUnder(join(contractRoot, "src")).filter((path) =>
      forbiddenImports.some((dependency) => readFileSync(path, "utf8").includes(dependency)),
    );
    expect(offenders).toEqual([]);
  });

  it("recognizes the canonical bridge shape", () => {
    const host = createMockOpenDesignElectron();
    expect(isOpenDesignElectronBridge(host)).toBe(true);
    expect(host.version).toBe(OPEN_DESIGN_ELECTRON_CONTRACT_VERSION);
  });

  it("rejects legacy or incomplete bridge shapes", () => {
    expect(isOpenDesignElectronBridge({ version: OPEN_DESIGN_ELECTRON_CONTRACT_VERSION })).toBe(false);
    expect(isOpenDesignElectronBridge({ ...createMockOpenDesignElectron(), version: 1 })).toBe(false);
    expect(isOpenDesignElectronBridge({
      ...createMockOpenDesignElectron(),
      browser: {},
    })).toBe(false);
    expect(isOpenDesignElectronBridge({
      ...createMockOpenDesignElectron(),
      capture: {},
    })).toBe(false);
    expect(isOpenDesignElectronBridge({
      ...createMockOpenDesignElectron(),
      shell: { openExternal: async () => ({ ok: true }) },
    })).toBe(false);
    expect(isOpenDesignElectronBridge({
      ...createMockOpenDesignElectron(),
      updater: { status: async () => createMockOpenDesignElectron().updater.status() },
    })).toBe(false);
    const { apply: _apply, ...updaterWithoutApply } = createMockOpenDesignElectron().updater;
    expect(isOpenDesignElectronBridge({
      ...createMockOpenDesignElectron(),
      updater: updaterWithoutApply,
    })).toBe(false);
  });

  it("reads the bridge through the package-owned global accessor", () => {
    const scope: Record<string, unknown> = {};
    installMockOpenDesignElectron({ scope });
    expect(getOpenDesignElectron(scope)?.client.type).toBe("desktop");
    expect(isOpenDesignElectronAvailable(scope)).toBe(true);
    expect(detectOpenDesignElectronClientType(scope)).toBe("desktop");
  });

  it("falls back to web when no host is installed", () => {
    expect(getOpenDesignElectron({})).toBeNull();
    expect(isOpenDesignElectronAvailable({})).toBe(false);
    expect(detectOpenDesignElectronClientType({})).toBe("web");
  });

  it("signals business readiness only through the installed contract", () => {
    const ready = vi.fn();
    const scope: Record<string, unknown> = {};
    installMockOpenDesignElectron({ scope, host: { lifecycle: { ready } } });

    expect(signalElectronReady(scope)).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
    expect(signalElectronReady({})).toBe(false);
  });

  it("wraps host action throws into structured failures", async () => {
    const scope: Record<string, unknown> = {};
    installMockOpenDesignElectron({ scope, host: {
      shell: {
        openPath: vi.fn(async () => {
          throw new Error("failed");
        }),
      },
    } });

    await expect(openElectronProjectPath("project-1", scope)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("normalizes privileged project-import results into host-owned identifiers", () => {
    const result = normalizeOpenDesignElectronProjectImportResult({
      ok: true,
      response: {
        project: {
          id: "project-1",
          name: "Imported project",
          resolvedDir: "/private/path/that-must-not-cross",
        },
        conversationId: "conversation-1",
        entryFile: "index.html",
      },
    });

    expect(result).toEqual({
      ok: true,
      projectId: "project-1",
      conversationId: "conversation-1",
      entryFile: "index.html",
    });
    expect(JSON.stringify(result)).not.toContain("resolvedDir");
  });

  it("accepts imported folders with no detected entry file", () => {
    const result = normalizeOpenDesignElectronProjectImportResult({
      ok: true,
      response: {
        project: {
          id: "project-1",
          name: "Imported source repo",
          resolvedDir: "/private/path/that-must-not-cross",
        },
        conversationId: "conversation-1",
        entryFile: null,
      },
    });

    expect(result).toEqual({
      ok: true,
      projectId: "project-1",
      conversationId: "conversation-1",
      entryFile: null,
    });
    expect(JSON.stringify(result)).not.toContain("resolvedDir");
  });

  it("preserves canceled and structured failure project-import results", () => {
    expect(normalizeOpenDesignElectronProjectImportResult({ canceled: true, ok: false })).toEqual({
      canceled: true,
      ok: false,
    });
    expect(normalizeOpenDesignElectronProjectImportResult({
      ok: false,
      reason: "daemon returned HTTP 500",
      details: { code: "boom" },
    })).toEqual({
      ok: false,
      reason: "daemon returned HTTP 500",
      details: { code: "boom" },
    });
  });

  it("rejects malformed successful project-import results before they reach web callers", () => {
    expect(normalizeOpenDesignElectronProjectImportResult({
      ok: true,
      response: {
        project: { id: "project-1" },
        conversationId: "conversation-1",
      },
    })).toEqual({
      ok: false,
      reason: "daemon import response did not include host project identifiers",
      details: {
        project: { id: "project-1" },
        conversationId: "conversation-1",
      },
    });
  });

  it("routes all host actions through package-owned helpers", async () => {
    const openExternal = vi.fn(async () => ({ ok: true as const }));
    const openPath = vi.fn(async () => ({ ok: true as const }));
    const clearData = vi.fn(async () => ({ ok: true as const }));
    const pickAndImport = vi.fn(async () => ({
      ok: true as const,
      projectId: "project-2",
      conversationId: "conversation-2",
      entryFile: "app.html",
    }));
    const print = vi.fn(async () => ({ ok: true as const }));
    const setVisible = vi.fn();
    const scope: Record<string, unknown> = {};
    installMockOpenDesignElectron({ scope, host: {
      browser: { clearData },
      shell: { openExternal, openPath },
      project: { pickAndImport },
      pdf: { print },
      pet: { setVisible },
    } });

    await expect(openElectronExternalUrl("https://example.com", scope)).resolves.toEqual({ ok: true });
    await expect(openElectronProjectPath("project-2", scope)).resolves.toEqual({ ok: true });
    await expect(clearElectronBrowserData({ cookies: true }, scope)).resolves.toEqual({ ok: true });
    await expect(pickAndImportElectronProject({ skillId: "skill-1" }, scope)).resolves.toMatchObject({
      ok: true,
      projectId: "project-2",
    });
    await expect(printElectronPdf("<html></html>", "nonce", { deck: true }, scope)).resolves.toEqual({ ok: true });
    expect(setElectronPetVisible(true, scope)).toEqual({ ok: true });

    expect(openExternal).toHaveBeenCalledWith("https://example.com");
    expect(openPath).toHaveBeenCalledWith("project-2");
    expect(clearData).toHaveBeenCalledWith({ cookies: true });
    expect(pickAndImport).toHaveBeenCalledWith({ skillId: "skill-1" });
    expect(print).toHaveBeenCalledWith("<html></html>", "nonce", { deck: true });
    expect(setVisible).toHaveBeenCalledWith(true);
  });

  it("routes updater status, actions, and subscriptions through package-owned helpers", async () => {
    const status = {
      schemaVersion: 1 as const,
      channel: "betahyx",
      lines: {
        closure: { actions: ["check" as const], blockedBy: 0, revision: 2, state: "current" as const, target: "closure" as const },
        shell: {
          actions: ["apply" as const, "later" as const],
          blockedBy: 0,
          candidateVersion: "betahyx-1.0.1-beta.1",
          currentVersion: "betahyx-1.0.0-beta.0",
          revision: 3,
          state: "ready" as const,
          target: "shell" as const,
        },
      },
    };
    const check = vi.fn(async () => status);
    const apply = vi.fn(async () => status);
    const statusFn = vi.fn(async () => status);
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const unsubscribeOpenDialog = vi.fn();
    const subscribeOpenDialog = vi.fn(() => unsubscribeOpenDialog);
    const setMenuLabels = vi.fn(async () => ({ ok: true as const }));
    const scope: Record<string, unknown> = {};
    installMockOpenDesignElectron({ scope, host: {
      updater: { apply, check, setMenuLabels, status: statusFn, subscribe, subscribeOpenDialog },
    } });

    await expect(getElectronUpdaterStatus(scope)).resolves.toEqual({
      ok: true,
      status,
    });
    await expect(checkElectronUpdater("shell", scope)).resolves.toEqual({
      ok: true,
      status,
    });
    await expect(applyElectronUpdater("shell", { force: true }, scope)).resolves.toEqual({
      ok: true,
      status,
    });

    const listener = vi.fn();
    expect(subscribeElectronUpdater(listener, scope)).toBe(unsubscribe);
    const openDialogListener = vi.fn();
    expect(subscribeElectronUpdaterOpenDialog(openDialogListener, scope)).toBe(unsubscribeOpenDialog);
    await expect(setElectronUpdaterMenuLabels({
      check: "Check for Updates…",
      checking: "Checking for Updates…",
      downloading: "Downloading Update…",
      install: "Install Update…",
      installing: "Installing Update…",
      restart: "Restart to Update OpenDesign…",
    }, scope)).resolves.toEqual({ ok: true });
    expect(statusFn).toHaveBeenCalledWith();
    expect(check).toHaveBeenCalledWith("shell");
    expect(apply).toHaveBeenCalledWith("shell", { force: true });
    expect(subscribe).toHaveBeenCalledWith(listener);
    expect(subscribeOpenDialog).toHaveBeenCalledWith(openDialogListener);
    expect(setMenuLabels).toHaveBeenCalledOnce();
  });

  it("routes optional preview navigation failure subscriptions", () => {
    const failure = {
      errorCode: -3,
      eventId: 1,
      frameName: "od-artifact-preview-srcdoc-preview-host-1",
      occurredAtMs: 1234,
      validatedUrl: "about:srcdoc",
    };
    const unsubscribe = vi.fn();
    const subscribeNavigationFailure = vi.fn(() => unsubscribe);
    const getLatestNavigationFailure = vi.fn(() => failure);
    const scope: Record<string, unknown> = {};
    installMockOpenDesignElectron({ scope, host: {
      preview: { getLatestNavigationFailure, subscribeNavigationFailure },
    } });
    const listener = vi.fn();

    expect(getLatestElectronPreviewNavigationFailure(scope)).toBe(failure);
    expect(getLatestNavigationFailure).toHaveBeenCalledOnce();
    expect(subscribeElectronPreviewNavigationFailure(listener, scope)).toBe(unsubscribe);
    expect(subscribeNavigationFailure).toHaveBeenCalledWith(listener);
    expect(getLatestElectronPreviewNavigationFailure({})).toBeNull();
    expect(subscribeElectronPreviewNavigationFailure(listener, {})).toEqual(expect.any(Function));
  });

  it("wraps updater action throws into structured failures", async () => {
    const scope: Record<string, unknown> = {};
    installMockOpenDesignElectron({ scope, host: {
      updater: {
        check: vi.fn(async () => {
          throw new Error("updater failed");
        }),
      },
    } });

    await expect(checkElectronUpdater(undefined, scope)).resolves.toEqual({
      ok: false,
      reason: "updater failed",
    });
  });

  it("installs and restores test hosts without exposing callers to the global key", () => {
    const scope: Record<string, unknown> = {};
    const restore = installMockOpenDesignElectron({ scope });
    expect(getOpenDesignElectron(scope)).not.toBeNull();
    restore();
    expect(getOpenDesignElectron(scope)).toBeNull();
  });
});
