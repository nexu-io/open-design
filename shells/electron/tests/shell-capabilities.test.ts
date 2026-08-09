import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_SHELL_CAPABILITIES,
  createStandaloneHandoffEnvelope,
  type StandaloneProtocolJsonValue,
} from "@open-design/standalone-proto";

import { createElectronShellCapabilityPort } from "../src/shell-capabilities.js";

const handoff = createStandaloneHandoffEnvelope({
  descriptor: {
    release: { version: "0.19.0-beta.1" },
    standalone: {
      digest: `sha256:${"2".repeat(64)}`,
      protocolVersion: 1,
      version: "0.19.0-beta.1",
    },
  },
  scope: { channel: "beta", generation: 0, namespace: "release-beta" },
});

function request(
  capability: string,
  input: StandaloneProtocolJsonValue = { html: "<main>demo</main>" },
) {
  return {
    attachmentId: "electron-a",
    capability,
    handoff,
    input,
    requestId: "request-1",
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
  } as const;
}

describe("Electron Shell capability port", () => {
  it("keeps transport and legacy sidecar DTOs behind the Electron adapter", async () => {
    const source = await readFile(new URL("../src/shell-capabilities.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/@open-design\/sidecar(?:-proto)?["']/u);
    expect(source).not.toMatch(/createJsonIpc|requestJsonIpc|socketPath|desktopIpc/u);
  });

  it("maps Standalone rendering onto the active Desktop runtime", async () => {
    const renderSlides = vi.fn(async () => ({ ok: true, slides: ["data:image/png;base64,AA=="] }));
    const port = createElectronShellCapabilityPort({
      handlers: {
        exportArtifact: vi.fn(),
        exportPdf: vi.fn(),
        renderSlides,
      },
    });

    await expect(port.invoke(request(STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES))).resolves.toMatchObject({
      outcome: "completed",
      output: { ok: true, slides: ["data:image/png;base64,AA=="] },
      requestId: "request-1",
    });
    expect(renderSlides).toHaveBeenCalledWith({ html: "<main>demo</main>" });
  });

  it("reports unknown or failed Shell capabilities without leaking transport details", async () => {
    const failed = createElectronShellCapabilityPort({
      handlers: {
        exportArtifact: vi.fn(),
        exportPdf: async () => { throw new Error("private ipc path"); },
        renderSlides: vi.fn(),
      },
    });
    await expect(failed.invoke(request(STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF, {
      deck: false,
      defaultFilename: "demo.pdf",
      html: "<main>demo</main>",
      title: "Demo",
    }))).resolves.toMatchObject({
      error: { code: "shell-capability-failed" },
      outcome: "failed",
    });
    await expect(failed.invoke(request("future-capability"))).resolves.toMatchObject({
      outcome: "unsupported",
    });
  });
});
