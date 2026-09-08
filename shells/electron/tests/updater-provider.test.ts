import { resolve } from "node:path";
import { expect, it } from "vitest";
import { parseElectronUpdaterProviderConfig } from "@/adapters/standalone/updater-provider.js";

const config = {
  schemaVersion: 3,
  scope: { channel: "betahyx", namespace: "provider" },
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
  carrier: { type: "electron", version: "0.0.9", buildHash: "c".repeat(64), digest: "d".repeat(64) },
  resourceRoot: resolve("provider-resources"), storeRoot: resolve("provider-store"), runtimeRoot: resolve("provider-runtime"),
  carrierRuntimeRoot: resolve("carrier-runtime"),
  channelHeadUrl: "https://releases.invalid/betahyx/latest/channel-head.json",
};

it("accepts only an exact Electron provider configuration", () => {
  const parsed = parseElectronUpdaterProviderConfig(config);
  expect(parsed).toEqual(config);
  expect(Object.isFrozen(parsed.scope)).toBe(true);
  expect(Object.isFrozen(parsed.shell)).toBe(true);
  expect(Object.isFrozen(parsed.carrier)).toBe(true);
  for (const invalid of [
    { ...config, schemaVersion: 1 },
    { ...config, schemaVersion: 2 },
    { ...config, carrierRuntimeRoot: "relative" },
    { ...config, carrier: undefined },
    { ...config, carrier: { ...config.carrier, type: "terminal" } },
    { ...config, carrier: { ...config.carrier, digest: "invalid" } },
    { ...config, hostPath: "/arbitrary/module" },
    { ...config, scope: { ...config.scope, ipc: "private" } },
    { ...config, shell: { ...config.shell, type: "terminal" } },
    { ...config, shell: { ...config.shell, digest: "invalid" } },
    { ...config, storeRoot: "relative" },
    { ...config, channelHeadUrl: "file:///untrusted" },
    { ...config, channelHeadUrl: "https://user:password@releases.invalid/feed" },
    { ...config, channelHeadUrl: `${config.channelHeadUrl}#fragment` },
  ]) expect(() => parseElectronUpdaterProviderConfig(invalid)).toThrow();
});
