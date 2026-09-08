import { describe, expect, it } from "vitest";

import { validateElectronCarrierConfig, type ElectronCarrierConfig } from "@/runtime/startup/config.js";

const config: ElectronCarrierConfig = {
  schemaVersion: 1,
  preflight: {
    schemaVersion: 1,
    atoms: [{ id: "language", executor: "electron.preferred-language" }],
  },
  startupTimeoutMs: 360000,
  shutdownTimeoutMs: 75000,
};

describe("Electron carrier config", () => {
  it("validates only fixed preflight and physical lifecycle budgets", () => {
    expect(validateElectronCarrierConfig(config)).toEqual(config);
  });

  it("rejects an unknown envelope schema", () => {
    expect(() => validateElectronCarrierConfig({ ...config, schemaVersion: 2 })).toThrow(/carrier config schema/u);
  });
  it("rejects Capsule policy and invalid lifecycle budgets", () => {
    expect(() => validateElectronCarrierConfig({ ...config, warmup: {} })).toThrow("carrier config fields");
    for (const value of [0, -1, 1.5, 3_600_001, Number.NaN, "360000"]) {
      expect(() => validateElectronCarrierConfig({ ...config, startupTimeoutMs: value })).toThrow("lifecycle timeout");
      expect(() => validateElectronCarrierConfig({ ...config, shutdownTimeoutMs: value })).toThrow("lifecycle timeout");
    }
  });
});
