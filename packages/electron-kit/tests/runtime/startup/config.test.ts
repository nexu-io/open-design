import { describe, expect, it } from "vitest";

import { validateElectronRuntimeConfig, type ElectronRuntimeConfig } from "@/runtime/startup/config.js";

const config: ElectronRuntimeConfig = {
  schemaVersion: 1,
  preflight: {
    schemaVersion: 1,
    atoms: [{ id: "language", executor: "electron.preferred-language" }],
  },
  warmup: {
    schemaVersion: 1,
    nodes: [
      { id: "carrier", executor: "electron.ensure-carrier", dependsOn: [], blocking: true },
      { id: "resolve", executor: "standalone.resolve", dependsOn: ["carrier"], blocking: true },
      { id: "ready", executor: "standalone.await-ready", dependsOn: ["resolve"], blocking: true },
      { id: "renderer", executor: "electron.mount-renderer", dependsOn: ["ready"], blocking: true },
    ],
  },
};

describe("Electron runtime config", () => {
  it("validates preflight and warmup as one Shell-owned document", () => {
    expect(validateElectronRuntimeConfig(config)).toEqual(config);
  });

  it("rejects an unknown envelope schema", () => {
    expect(() => validateElectronRuntimeConfig({ ...config, schemaVersion: 2 as never })).toThrow(/runtime config schema/u);
  });
});
