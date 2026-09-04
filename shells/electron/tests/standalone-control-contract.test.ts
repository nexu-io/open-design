import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createStandaloneGenerationBinding,
  type GenerationRecord,
  type StandaloneShellIdentity,
} from "@open-design/standalone";

import {
  ELECTRON_STANDALONE_CONTROL_ACTION,
  validateElectronStandaloneControlRequest,
} from "@/adapters/standalone/control-contract.js";

const scope = Object.freeze({ channel: "betahyx", namespace: "electron-foundation" });
const launcherPath = resolve("/installed/launcher.mjs");
const shell: StandaloneShellIdentity = Object.freeze({
  type: "electron",
  version: "0.1.0",
  buildHash: "a".repeat(64),
  digest: "b".repeat(64),
});
const generation: GenerationRecord = {
  schemaVersion: 4,
  id: "c".repeat(64),
  channel: scope.channel,
  releaseVersion: "0.1.0-betahyx.1",
  standaloneVersion: "0.1.0",
  sourceCommit: "7a4175c86fe305b6432081c3dc269cd4bd4ec04d",
  minimumShellVersions: { electron: "0.1.0" },
  launcher: {
    protocol: "standalone-launcher-v1",
    resourceId: "standalone-launcher",
    blobSha256: "d".repeat(64),
    entrypoint: launcherPath,
    path: launcherPath,
  },
  resources: {
    "standalone-launcher": {
      component: "standalone.launcher",
      blobSha256: "d".repeat(64),
      entrypoint: launcherPath,
      materialization: { type: "file", entrypoint: "launcher.mjs" },
      mediaType: "text/javascript",
      path: launcherPath,
      size: 42,
      sync: true,
    },
  },
};
const binding = createStandaloneGenerationBinding(generation, scope);

function startRequest() {
  return {
    schemaVersion: 1,
    operation: "lifecycle.start",
    scope,
    generation,
    binding,
    attachment: { id: "electron-1", shell },
    attachmentCapability: null,
  } as const;
}

describe("Electron Standalone finite control contract", () => {
  it("uses one named Sidecar action and accepts an exact bound start", () => {
    expect(ELECTRON_STANDALONE_CONTROL_ACTION).toBe("electron.standalone.control.v1");
    expect(validateElectronStandaloneControlRequest(startRequest(), scope)).toEqual(startRequest());
  });

  it("rejects unknown operations and surplus fields", () => {
    expect(() => validateElectronStandaloneControlRequest({ schemaVersion: 1, operation: "lifecycle.erase", scope }, scope))
      .toThrow("unsupported Electron Standalone control operation");
    expect(() => validateElectronStandaloneControlRequest({ ...startRequest(), command: "surplus" }, scope))
      .toThrow("fields must be exactly");
    expect(() => validateElectronStandaloneControlRequest({ schemaVersion: 1, operation: "lifecycle.status", scope: { ...scope, path: "/tmp" } }, scope))
      .toThrow("control scope fields must be exactly");
  });

  it("rejects cross-scope and altered generation bindings", () => {
    expect(() => validateElectronStandaloneControlRequest(startRequest(), { ...scope, namespace: "other" }))
      .toThrow("escaped its scope");
    expect(() => validateElectronStandaloneControlRequest({
      ...startRequest(),
      binding: { ...binding, digest: "e".repeat(64) },
    }, scope)).toThrow("generation binding is not exact");
  });

  it("enumerates updater actions and validates installed Shell proofs", () => {
    const invoke = { schemaVersion: 1, operation: "updater.invoke", scope, shellType: "electron", action: "install" } as const;
    expect(validateElectronStandaloneControlRequest(invoke, scope)).toEqual(invoke);
    expect(() => validateElectronStandaloneControlRequest({ ...invoke, action: "replace-binary" }, scope))
      .toThrow("updater action is invalid");
    expect(validateElectronStandaloneControlRequest({
      schemaVersion: 1,
      operation: "updater.confirm-installed",
      scope,
      shellType: "electron",
      proof: shell,
    }, scope)).toMatchObject({ operation: "updater.confirm-installed", proof: shell });
  });
});
