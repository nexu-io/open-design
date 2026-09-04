import { describe, expect, it, vi } from "vitest";

import {
  ELECTRON_DESIGN_BROWSER_PARTITION,
  installElectronRendererSecurity,
  isAllowedChildWindowUrl,
  isAllowedEmbeddedBrowserUrl,
  isHttpUrl,
} from "@/adapters/renderer/security.js";

function cancellableEvent() {
  return { preventDefault: vi.fn() };
}

function fakeContents() {
  const listeners = new Map<string, (...args: any[]) => void>();
  let openHandler: ((details: { url: string }) => { action: string }) | null = null;
  return {
    contents: {
      on(name: string, listener: (...args: any[]) => void) { listeners.set(name, listener); },
      removeListener(name: string) { listeners.delete(name); },
      setWindowOpenHandler(handler: (details: { url: string }) => { action: string }) { openHandler = handler; },
    },
    listeners,
    open(url: string) { return openHandler?.({ url }); },
  };
}

describe("Electron renderer URL policy", () => {
  it("keeps HTTP, child-window, and embedded-browser schemes finite", () => {
    expect(isHttpUrl("https://open-design.ai")).toBe(true);
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedChildWindowUrl("od://app/api/live-artifacts/a/preview", "od")).toBe(true);
    expect(isAllowedChildWindowUrl("od://other/", "od")).toBe(false);
    expect(isAllowedChildWindowUrl("blob:http://127.0.0.1/id", "od")).toBe(true);
    expect(isAllowedChildWindowUrl("about:blank", "od")).toBe(true);
    expect(isAllowedChildWindowUrl("javascript:alert(1)", "od")).toBe(false);
    expect(isAllowedEmbeddedBrowserUrl("https://example.com/reference")).toBe(true);
    expect(isAllowedEmbeddedBrowserUrl("about:blank")).toBe(true);
    expect(isAllowedEmbeddedBrowserUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedEmbeddedBrowserUrl("od://app/")).toBe(false);
  });

  it("allows only the mounted main-frame identity and opens foreign HTTP externally", () => {
    const target = fakeContents();
    const openExternal = vi.fn();
    const lease = installElectronRendererSecurity({
      openExternal,
      shellProtocol: "od",
      trustedMainFrameUrl: "od://app/",
      window: { webContents: target.contents } as never,
    });

    const sameShell = cancellableEvent();
    target.listeners.get("will-navigate")!(sameShell, "od://app/projects/1");
    expect(sameShell.preventDefault).not.toHaveBeenCalled();

    const otherShellHost = cancellableEvent();
    target.listeners.get("will-navigate")!(otherShellHost, "od://attacker/");
    expect(otherShellHost.preventDefault).toHaveBeenCalledOnce();

    const external = cancellableEvent();
    target.listeners.get("will-navigate")!(external, "https://example.com/");
    expect(external.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith("https://example.com/");

    expect(target.open("od://app/api/live-artifacts/a/preview")).toEqual({ action: "allow" });
    expect(target.open("od://attacker/")).toEqual({ action: "deny" });
    expect(target.open("https://example.com/")).toEqual({ action: "deny" });
    expect(openExternal).toHaveBeenCalledTimes(2);

    lease.dispose();
    expect(target.listeners.size).toBe(0);
    expect(target.open("od://app/")).toEqual({ action: "deny" });
  });

  it("pins webviews to the product partition and rechecks every guest navigation", () => {
    const target = fakeContents();
    const lease = installElectronRendererSecurity({
      openExternal() {},
      shellProtocol: "od",
      trustedMainFrameUrl: "od://app/",
      window: { webContents: target.contents } as never,
    });
    const attach = target.listeners.get("will-attach-webview")!;

    const rejected = cancellableEvent();
    attach(rejected, {}, { src: "file:///etc/passwd", partition: ELECTRON_DESIGN_BROWSER_PARTITION });
    expect(rejected.preventDefault).toHaveBeenCalledOnce();

    const preferences: Record<string, unknown> = { preload: "/tmp/hostile.cjs", nodeIntegration: true };
    const accepted = cancellableEvent();
    attach(accepted, preferences, { src: "https://example.com/", partition: ELECTRON_DESIGN_BROWSER_PARTITION });
    expect(accepted.preventDefault).not.toHaveBeenCalled();
    expect(preferences).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true });

    const guest = fakeContents();
    target.listeners.get("did-attach-webview")!({}, guest.contents);
    const guestNavigation = cancellableEvent();
    guest.listeners.get("will-navigate")!(guestNavigation, "file:///etc/passwd");
    expect(guestNavigation.preventDefault).toHaveBeenCalledOnce();
    expect(guest.open("https://example.com/popup")).toEqual({ action: "deny" });

    lease.dispose();
  });
});
