import { describe, expect, it } from "vitest";

import {
  applyElectronPreflight,
  validateElectronPreflightTopology,
  type ElectronPreflightApp,
  type ElectronPreflightTopology,
} from "@/runtime/startup/preflight/index.js";

function topology(atoms: ElectronPreflightTopology["atoms"]): ElectronPreflightTopology {
  return { schemaVersion: 1, atoms };
}

describe("Electron preflight", () => {
  it("applies the finite atom set before readiness and returns renderer input", () => {
    const switches: Array<readonly [string, string | undefined]> = [];
    const app: ElectronPreflightApp = {
      isReady: () => false,
      getPreferredSystemLanguages: () => ["zh-CN", "en-US"],
      commandLine: { appendSwitch: (name, value) => switches.push([name, value]) },
    };

    const result = applyElectronPreflight(app, topology([
      { id: "locale", executor: "electron.preferred-language" },
      { id: "service-hosts", executor: "electron.connection-limit-exemptions", hosts: ["service.internal", "[::1]"] },
    ]));

    expect(switches).toEqual([
      ["lang", "zh-CN"],
      ["ignore-connections-limit", "service.internal,[::1]"],
    ]);
    expect(result).toEqual({ appliedAtomIds: ["locale", "service-hosts"], preferredLanguage: "zh-CN" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects late application without mutating command-line state", () => {
    const switches: unknown[] = [];
    expect(() => applyElectronPreflight({
      isReady: () => true,
      getPreferredSystemLanguages: () => ["en-US"],
      commandLine: { appendSwitch: (...args) => switches.push(args) },
    }, topology([{ id: "locale", executor: "electron.preferred-language" }]))).toThrow(/before app readiness/u);
    expect(switches).toEqual([]);
  });

  it("resolves every switch before mutating command-line state", () => {
    const switches: unknown[] = [];
    expect(() => applyElectronPreflight({
      isReady: () => false,
      getPreferredSystemLanguages: () => { throw new Error("locale unavailable"); },
      commandLine: { appendSwitch: (...args) => switches.push(args) },
    }, topology([
      { id: "hosts", executor: "electron.connection-limit-exemptions", hosts: ["service.internal"] },
      { id: "locale", executor: "electron.preferred-language" },
    ]))).toThrow(/locale unavailable/u);
    expect(switches).toEqual([]);
  });

  it("rejects arbitrary executors, duplicate atoms and non-host values", () => {
    expect(() => validateElectronPreflightTopology(topology([
      { id: "arbitrary", executor: "chromium.append-switch" } as never,
    ]))).toThrow(/unknown or duplicate/u);
    expect(() => validateElectronPreflightTopology(topology([
      { id: "first", executor: "electron.preferred-language" },
      { id: "second", executor: "electron.preferred-language" },
    ]))).toThrow(/unknown or duplicate/u);
    expect(() => validateElectronPreflightTopology(topology([
      { id: "hosts", executor: "electron.connection-limit-exemptions", hosts: ["https://service.internal/path"] },
    ]))).toThrow(/invalid Electron connection-limit exemption host/u);
  });
});
