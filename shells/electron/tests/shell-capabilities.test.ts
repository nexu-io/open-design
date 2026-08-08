import { describe, expect, it, vi } from "vitest";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_SHELL_CAPABILITIES,
  createStandaloneHandoffEnvelope,
} from "@open-design/standalone-proto";
import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";

import { createElectronShellCapabilityPort } from "../src/shell-capabilities.js";

const handoff = createStandaloneHandoffEnvelope({
  descriptor: {
    release: { version: "0.19.0-beta.1" },
    shell: {
      digest: `sha256:${"1".repeat(64)}`,
      type: "electron",
      version: "0.19.0-beta.1",
    },
    standalone: {
      digest: `sha256:${"2".repeat(64)}`,
      protocolVersion: 1,
      version: "0.19.0-beta.1",
    },
  },
  scope: { channel: "beta", generation: 0, namespace: "release-beta" },
});

function request(capability: string) {
  return {
    capability,
    handoff,
    input: { html: "<main>demo</main>" },
    requestId: "request-1",
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
  } as const;
}

describe("Electron Shell capability port", () => {
  it("maps Standalone rendering onto the active Desktop runtime", async () => {
    const requestDesktop = vi.fn(async () => ({ ok: true, slides: ["data:image/png;base64,AA=="] }));
    const port = createElectronShellCapabilityPort({ desktopIpc: "/ignored", requestDesktop });

    await expect(port.invoke(request(STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES))).resolves.toMatchObject({
      outcome: "completed",
      output: { ok: true, slides: ["data:image/png;base64,AA=="] },
      requestId: "request-1",
    });
    expect(requestDesktop).toHaveBeenCalledWith({
      input: { html: "<main>demo</main>" },
      type: SIDECAR_MESSAGES.RENDER_SLIDES,
    });
  });

  it("reports unknown or failed Shell capabilities without leaking transport details", async () => {
    const failed = createElectronShellCapabilityPort({
      desktopIpc: "/ignored",
      requestDesktop: async () => { throw new Error("private ipc path"); },
    });
    await expect(failed.invoke(request(STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF))).resolves.toMatchObject({
      error: { code: "shell-capability-failed" },
      outcome: "failed",
    });
    await expect(failed.invoke(request("future-capability"))).resolves.toMatchObject({
      outcome: "unsupported",
    });
  });
});
