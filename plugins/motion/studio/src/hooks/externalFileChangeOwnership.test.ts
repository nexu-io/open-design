import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { sseFileChangeChannel } from "./useExternalFileChangeCoordinator";

describe("external file-change subscription ownership", () => {
  it("has one subscriber instead of independent Preview and SDK listeners", () => {
    const preview = readFileSync(new URL("./usePreviewPersistence.ts", import.meta.url), "utf8");
    const sdk = readFileSync(new URL("./useSdkSession.ts", import.meta.url), "utf8");
    const coordinator = readFileSync(
      new URL("./useExternalFileChangeCoordinator.ts", import.meta.url),
      "utf8",
    );

    expect(preview).not.toContain('hot.on("hf:file-change"');
    expect(sdk).not.toContain('hot.on("hf:file-change"');
    expect(coordinator.match(/hot\.on\("hf:file-change"/g)).toHaveLength(1);
  });

  it("selects the SSE channel for production and hands it the shared handler", () => {
    const coordinator = readFileSync(
      new URL("./useExternalFileChangeCoordinator.ts", import.meta.url),
      "utf8",
    );
    expect(coordinator.match(/sseFileChangeChannel\(handler, catchUp\)/g)).toHaveLength(1);
  });

  it("asks to catch up on every reconnect, since changes made while disconnected are never resent", () => {
    const listeners = new Map<string, (event: unknown) => void>();
    class FakeEventSource {
      addEventListener(type: string, listener: (event: unknown) => void) {
        listeners.set(type, listener);
      }
      close = vi.fn();
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    try {
      const onReconnect = vi.fn();
      sseFileChangeChannel(vi.fn(), onReconnect);
      listeners.get("open")?.(new Event("open"));
      expect(onReconnect).not.toHaveBeenCalled();
      listeners.get("error")?.(new Event("error"));
      listeners.get("open")?.(new Event("open"));
      listeners.get("open")?.(new Event("open"));
      expect(onReconnect).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("delivers the raw file-change event from EventSource to the handler and closes on cleanup", () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const close = vi.fn();
    const opened: string[] = [];
    class FakeEventSource {
      constructor(url: string) {
        opened.push(url);
      }
      addEventListener(type: string, listener: (event: unknown) => void) {
        listeners.set(type, listener);
      }
      close = close;
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    try {
      const onDelivery = vi.fn();
      const stop = sseFileChangeChannel(onDelivery, vi.fn());
      const event = new MessageEvent("file-change", { data: JSON.stringify({ path: "a.html" }) });
      listeners.get("file-change")?.(event);
      expect(opened).toEqual(["/api/events"]);
      expect(onDelivery).toHaveBeenCalledWith(event);
      stop();
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
