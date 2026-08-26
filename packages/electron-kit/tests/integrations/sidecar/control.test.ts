import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { requestJsonIpc } from "@open-design/sidecar";
import { describe, expect, it, vi } from "vitest";

import {
  ElectronSidecarControlError,
  openElectronSidecarControl,
  validateElectronSidecarHandlerTopology,
  type ElectronSidecarHandlerRequest,
  type ElectronSidecarSession,
} from "@/integrations/sidecar/index.js";

const topology = {
  schemaVersion: 1 as const,
  handlers: [{ id: "fixture.echo", timeoutMs: 1_000 }],
};

function ipcPath(root: string): string {
  return process.platform === "win32"
    ? `\\\\.\\pipe\\electron-kit-${randomUUID()}`
    : join(root, "desktop.sock");
}

function session(root: string): ElectronSidecarSession {
  return { schemaVersion: 1, sessionId: `session-${randomUUID()}`, ipcPath: ipcPath(root) };
}

function normalize(message: unknown): ElectronSidecarHandlerRequest {
  const value = message as { input?: unknown; type?: unknown };
  return { handlerId: String(value.type), input: value.input };
}

describe("Electron Sidecar control lease", () => {
  it("binds finite Shell handlers to the generic Sidecar JSON-IPC transport", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-sidecar-control-"));
    const binding = session(root);
    const lease = await openElectronSidecarControl({
      session: binding,
      topology,
      normalize,
      handlers: {
        "fixture.echo": (input, context) => ({ input, sessionId: context.session.sessionId }),
      },
    });
    try {
      await expect(requestJsonIpc(binding.ipcPath, { type: "fixture.echo", input: { value: "ok" } })).resolves.toEqual({
        input: { value: "ok" },
        sessionId: binding.sessionId,
      });
      await expect(requestJsonIpc(binding.ipcPath, { type: "fixture.missing" })).rejects.toThrow(/unknown Electron Sidecar handler/u);
      expect(lease.status()).toEqual({
        handlerIds: ["fixture.echo"],
        inFlight: 0,
        sessionId: binding.sessionId,
        state: "open",
      });
    } finally {
      await lease.close();
      await rm(root, { force: true, recursive: true });
    }
    expect(lease.status().state).toBe("closed");
    if (process.platform !== "win32") await expect(access(binding.ipcPath)).rejects.toThrow();
  });

  it("requires bindings to exactly match the declared topology", async () => {
    const serverFactory = vi.fn();
    await expect(openElectronSidecarControl({
      session: session("/tmp"),
      topology,
      normalize,
      handlers: {},
      serverFactory,
    })).rejects.toMatchObject({ code: "invalid-topology" });
    expect(serverFactory).not.toHaveBeenCalled();
  });

  it("aborts in-flight handlers and closes one shared session exactly once", async () => {
    let dispatch: ((message: unknown) => Promise<unknown>) | null = null;
    const close = vi.fn(async () => undefined);
    const lease = await openElectronSidecarControl({
      session: session("/tmp"),
      topology,
      normalize,
      handlers: {
        "fixture.echo": (_input, context) => new Promise<void>((resolve) => {
          context.signal.addEventListener("abort", () => resolve(), { once: true });
        }),
      },
      serverFactory: async (input) => {
        dispatch = input.handler;
        return { close };
      },
    });
    const pending = dispatch!({ type: "fixture.echo" });
    await Promise.resolve();
    expect(lease.status().inFlight).toBe(1);
    await Promise.all([lease.close(), lease.close()]);
    await expect(pending).rejects.toMatchObject({ code: "session-closed" });
    expect(close).toHaveBeenCalledOnce();
    expect(lease.status()).toMatchObject({ inFlight: 0, state: "closed" });
  });

  it("bounds every declared handler with its Shell-supplied timeout", async () => {
    vi.useFakeTimers();
    let dispatch: ((message: unknown) => Promise<unknown>) | null = null;
    const lease = await openElectronSidecarControl({
      session: session("/tmp"),
      topology: { schemaVersion: 1, handlers: [{ id: "fixture.echo", timeoutMs: 100 }] },
      normalize,
      handlers: { "fixture.echo": () => new Promise(() => undefined) },
      serverFactory: async (input) => {
        dispatch = input.handler;
        return { close: async () => undefined };
      },
    });
    try {
      const pending = dispatch!({ type: "fixture.echo" });
      const rejection = expect(pending).rejects.toMatchObject({ code: "handler-timeout" });
      await vi.advanceTimersByTimeAsync(100);
      await rejection;
    } finally {
      await lease.close();
      vi.useRealTimers();
    }
  });

  it("rejects duplicate declarations before opening a transport", () => {
    expect(() => validateElectronSidecarHandlerTopology({
      schemaVersion: 1,
      handlers: [{ id: "fixture.echo" }, { id: "fixture.echo" }],
    })).toThrow(ElectronSidecarControlError);
  });
});
