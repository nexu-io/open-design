import { describe, expect, it, vi } from "vitest";

import {
  ElectronProductRuntimeError,
  readElectronProductRuntime,
} from "@/adapters/standalone/product-runtime.js";

const bindingDigest = "b".repeat(64);
const identity = Object.freeze({
  attachmentId: "electron-runtime",
  bindingDigest,
  requestId: "renderer-attempt",
});

function handle(invoke: (command: Record<string, unknown>) => unknown) {
  return {
    readStatus: vi.fn(),
    close: vi.fn(),
    waitForTerminal: vi.fn(),
    invoke: vi.fn(async (command: Record<string, unknown>) => invoke(command)),
  };
}

describe("Electron product runtime adapter", () => {
  it("sends one exact attachment/binding-fenced command and validates its projection", async () => {
    const runtime = handle((command) => ({
      requestId: command.requestId,
      attachmentId: command.attachmentId,
      bindingDigest: command.bindingDigest,
      outcome: "accepted",
      output: {
        schemaVersion: 1,
        web: { url: "http://127.0.0.1:17579" },
        daemon: { url: "http://localhost:17578" },
      },
    }));
    await expect(readElectronProductRuntime({ ...identity, handle: runtime as never })).resolves.toEqual({
      schemaVersion: 1,
      web: { url: "http://127.0.0.1:17579/" },
      daemon: { url: "http://localhost:17578/" },
    });
    expect(runtime.invoke).toHaveBeenCalledWith({
      requestId: identity.requestId,
      attachmentId: identity.attachmentId,
      bindingDigest,
      command: "open-design.product-runtime.read.v1",
      input: { schemaVersion: 1, operation: "read" },
    });
  });

  it("fails closed on unsupported commands and mismatched response fences", async () => {
    const unsupported = handle((command) => ({
      requestId: command.requestId,
      attachmentId: command.attachmentId,
      bindingDigest: command.bindingDigest,
      outcome: "unsupported",
      error: { code: "private-runtime-error", message: "private detail" },
    }));
    await expect(readElectronProductRuntime({ ...identity, handle: unsupported as never }))
      .rejects.toEqual(new ElectronProductRuntimeError("product-runtime-unavailable"));

    const escaped = handle((command) => ({
      requestId: command.requestId,
      attachmentId: "another-attachment",
      bindingDigest: command.bindingDigest,
      outcome: "accepted",
      output: { schemaVersion: 1, web: { url: "http://localhost:1/" }, daemon: { url: "http://localhost:2/" } },
    }));
    await expect(readElectronProductRuntime({ ...identity, handle: escaped as never }))
      .rejects.toEqual(new ElectronProductRuntimeError("product-runtime-invalid"));
  });

  it("rejects expanded or non-loopback runtime output", async () => {
    const runtime = handle((command) => ({
      requestId: command.requestId,
      attachmentId: command.attachmentId,
      bindingDigest: command.bindingDigest,
      outcome: "accepted",
      output: {
        schemaVersion: 1,
        web: { url: "https://private.example/" },
        daemon: { url: "http://localhost:2/" },
        runtimeRoot: "/private/runtime",
      },
    }));
    await expect(readElectronProductRuntime({ ...identity, handle: runtime as never }))
      .rejects.toEqual(new ElectronProductRuntimeError("product-runtime-invalid"));
  });
});
