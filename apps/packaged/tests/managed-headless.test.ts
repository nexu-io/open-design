import { SIDECAR_MESSAGES, type DesktopStatusSnapshot } from "@open-design/sidecar-proto";
import { describe, expect, it, vi } from "vitest";

import {
  createDeferredDesktopController,
  isPackagedManagedLaunch,
  isPackagedPayloadDelegation,
  markPackagedManagedOuter,
  PACKAGED_MANAGED_OUTER_ENV,
  supportsDeferredHeadlessDesktop,
} from "../src/managed-headless.js";

describe("managed outer signal", () => {
  it("delegates only from an outer whose active target is a payload", () => {
    expect(isPackagedPayloadDelegation({ payloadDesktopProcess: false, source: "payload" })).toBe(true);
    expect(isPackagedPayloadDelegation({ payloadDesktopProcess: true, source: "payload" })).toBe(false);
    expect(isPackagedPayloadDelegation({ payloadDesktopProcess: false, source: "current-package" })).toBe(false);
  });

  it("treats a payload as managed only when a managed outer marked the launch", () => {
    const env: NodeJS.ProcessEnv = {};
    const payload = { payloadDesktopProcess: true, source: "payload" } as const;
    // An older outer delegates without the signal: the payload keeps today's behavior.
    expect(isPackagedManagedLaunch(payload, env, "darwin")).toBe(false);
    markPackagedManagedOuter(env);
    expect(env[PACKAGED_MANAGED_OUTER_ENV]).toBe("1");
    expect(isPackagedManagedLaunch(payload, env, "darwin")).toBe(true);
  });

  it("treats the installed package itself as managed", () => {
    expect(isPackagedManagedLaunch({ payloadDesktopProcess: false, source: "current-package" }, {}, "darwin")).toBe(true);
  });

  it("keeps other platforms unmanaged", () => {
    const env = { [PACKAGED_MANAGED_OUTER_ENV]: "1" };
    expect(isPackagedManagedLaunch({ payloadDesktopProcess: true, source: "payload" }, env, "win32")).toBe(false);
    expect(isPackagedManagedLaunch({ payloadDesktopProcess: false, source: "current-package" }, {}, "linux")).toBe(false);
  });

  it("defers the headless desktop only on macOS and never for MCP installation", () => {
    const headless = { headless: true, mcpInstallAgent: null };
    expect(supportsDeferredHeadlessDesktop(headless, "darwin")).toBe(true);
    expect(supportsDeferredHeadlessDesktop(headless, "win32")).toBe(false);
    expect(supportsDeferredHeadlessDesktop(headless, "linux")).toBe(false);
    expect(supportsDeferredHeadlessDesktop({ headless: true, mcpInstallAgent: "codex" }, "darwin")).toBe(false);
    expect(supportsDeferredHeadlessDesktop({ headless: false, mcpInstallAgent: null }, "darwin")).toBe(false);
  });
});

describe("createDeferredDesktopController", () => {
  function desktopHandle() {
    return {
      invoke: vi.fn(async () => ({ ok: true })),
      status: vi.fn(async (): Promise<DesktopStatusSnapshot> => ({ state: "running", windowVisible: true })),
      stop: vi.fn(async () => undefined),
    };
  }

  function setup(launch?: () => Promise<ReturnType<typeof desktopHandle>>) {
    const handle = desktopHandle();
    const options = {
      headlessStatus: () => ({ pid: 42, state: "running" as const, url: "http://127.0.0.1:1" }),
      launch: vi.fn(launch ?? (async () => handle)),
      onRestoreFailed: vi.fn(),
      stopHeadless: vi.fn(async () => undefined),
    };
    return { controller: createDeferredDesktopController(options), handle, options };
  }

  it("reports a restorable windowless owner until restored", async () => {
    const { controller } = setup();
    await expect(controller.status()).resolves.toEqual({
      pid: 42, restorable: true, state: "running", url: "http://127.0.0.1:1", windowVisible: false,
    });
  });

  it("restores once on SHOW and forwards the same SHOW to the restored desktop", async () => {
    const { controller, handle, options } = setup();
    const input = { deeplinkUrl: "opendesign://workspace/open" };
    // Two launchers racing: both are answered, but the desktop starts once.
    await expect(Promise.all([
      controller.invoke(SIDECAR_MESSAGES.SHOW, input),
      controller.invoke(SIDECAR_MESSAGES.SHOW, {}),
    ])).resolves.toEqual([{ accepted: true }, { accepted: true }]);
    await vi.waitFor(() => expect(handle.invoke).toHaveBeenCalledWith(SIDECAR_MESSAGES.SHOW, input));
    expect(options.launch).toHaveBeenCalledTimes(1);
    expect(controller.current()).toBe(handle);
    await expect(controller.status()).resolves.toEqual({ state: "running", windowVisible: true });
  });

  it("rejects other actions while windowless", async () => {
    const { controller } = setup();
    await expect(controller.invoke(SIDECAR_MESSAGES.SCREENSHOT, {})).rejects.toThrow("not running");
  });

  it("allows a retry after a failed restore and reports the failure", async () => {
    const failure = new Error("renderer failed");
    let attempts = 0;
    const handle = desktopHandle();
    const { controller, options } = setup(async () => {
      attempts += 1;
      if (attempts === 1) throw failure;
      return handle;
    });
    await expect(controller.restore()).rejects.toBe(failure);
    expect(options.onRestoreFailed).toHaveBeenCalledWith(failure);
    await expect(controller.restore()).resolves.toBe(handle);
  });

  it("stops the headless sidecars while windowless and the desktop once restored", async () => {
    const windowless = setup();
    await windowless.controller.stop();
    expect(windowless.options.stopHeadless).toHaveBeenCalledTimes(1);

    const restored = setup();
    await restored.controller.restore();
    await restored.controller.stop();
    expect(restored.handle.stop).toHaveBeenCalledTimes(1);
    expect(restored.options.stopHeadless).not.toHaveBeenCalled();
  });

  it("lets a restore in flight finish before stopping through the desktop", async () => {
    let finish!: () => void;
    const handle = desktopHandle();
    const { controller, options } = setup(() => new Promise((resolve) => { finish = () => resolve(handle); }));
    void controller.restore();
    const stopping = controller.stop();
    finish();
    await stopping;
    expect(handle.stop).toHaveBeenCalledTimes(1);
    expect(options.stopHeadless).not.toHaveBeenCalled();
  });
});
