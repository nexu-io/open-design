import { createMockOpenDesignElectron } from "@open-design/electron-contract/testing";
import { describe, expect, it, vi } from "vitest";

import { installElectronRendererContract } from "@/runtime/window/renderer-contract.js";

describe("Electron renderer contract", () => {
  it("delegates exposure without publishing the physical locator", () => {
    const exposeInMainWorld = vi.fn();
    const bridge = createMockOpenDesignElectron();

    installElectronRendererContract({ exposeInMainWorld }, bridge);

    expect(exposeInMainWorld).toHaveBeenCalledOnce();
    expect(exposeInMainWorld.mock.calls[0]?.[1]).toBe(bridge);
    expect(typeof exposeInMainWorld.mock.calls[0]?.[0]).toBe("string");
  });
});
