import { describe, expect, it, vi } from "vitest";

import { linuxRemovalStatusMessage } from "../lib/linux-helpers.js";

describe("linux e2e helpers", () => {
  it("delegates user-home resolution to node os.homedir", async () => {
    vi.resetModules();
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/open-design-test-home" }));

    try {
      const { linuxUserHome } = await import("../lib/linux-helpers.js");
      expect(linuxUserHome()).toBe("/tmp/open-design-test-home");
    } finally {
      vi.doUnmock("node:os");
      vi.resetModules();
    }
  });

  it("surfaces skipped-process-running as a lifecycle cleanup diagnostic", () => {
    expect(linuxRemovalStatusMessage("appImage", "skipped-process-running")).toContain(
      "process remained running before removal",
    );
  });
});
