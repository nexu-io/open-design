import { describe, expect, it, vi } from "vitest";

import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";

import { createDesktopCapabilityAdapter } from "../src/desktop-capability-adapter.js";

describe("Electron desktop capability adapter", () => {
  it("keeps the current Desktop message catalog inside the platform adapter", async () => {
    const requestDesktop = vi.fn(async () => ({ ok: true }));
    const adapter = createDesktopCapabilityAdapter("/ignored", requestDesktop);
    const input = {
      deck: false,
      defaultFilename: "artifact.pdf",
      html: "<main>artifact</main>",
      title: "Artifact",
    } as const;

    await expect(adapter.exportPdf(input)).resolves.toEqual({ ok: true });
    expect(requestDesktop).toHaveBeenCalledWith({
      input,
      type: SIDECAR_MESSAGES.EXPORT_PDF,
    });
  });
});
