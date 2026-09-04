import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  bindElectronPhysicalResourceSet,
  validateElectronPhysicalResourceSet,
} from "@/adapters/standalone/physical-resources.js";
import type { StandaloneGenerationBinding } from "@open-design/standalone";

const declaration = {
  schemaVersion: 1 as const,
  resources: [{
    id: "standalone-runtime",
    stamp: { app: "standalone", mode: "runtime", source: "standalone" },
  }],
};

const binding: StandaloneGenerationBinding = {
  schemaVersion: 2,
  protocol: "standalone-launcher-v1",
  scope: { channel: "betahyx", namespace: "electron-foundation" },
  generationId: "a".repeat(64),
  launcher: {
    resourceId: "standalone-launcher",
    blobSha256: "b".repeat(64),
    entrypoint: "/store/generations/launcher.mjs",
    path: "/store/generations/launcher.mjs",
  },
  resources: {
    "standalone-launcher": {
      component: "standalone.launcher",
      blobSha256: "b".repeat(64),
      entrypoint: "/store/generations/launcher.mjs",
      mediaType: "text/javascript",
      path: "/store/generations/launcher.mjs",
      size: 42,
    },
  },
  minimumShellVersions: { electron: "0.1.0" },
  digest: "c".repeat(64),
};

describe("Electron physical resource set", () => {
  it("accepts the complete Shell-owned declaration", async () => {
    const configured = JSON.parse(
      await readFile(new URL("../config/standalone.json", import.meta.url), "utf8"),
    ) as unknown;
    expect(validateElectronPhysicalResourceSet(configured)).toEqual(declaration);
  });

  it("binds every declared identity to the exact Standalone scope", () => {
    expect(bindElectronPhysicalResourceSet(declaration, binding)).toEqual({
      schemaVersion: 1,
      binding,
      resources: [{
        id: "standalone-runtime",
        stamp: {
          app: "standalone",
          channel: "betahyx",
          mode: "runtime",
          namespace: "electron-foundation",
          source: "standalone",
        },
      }],
    });
  });

  it("rejects duplicate ids and duplicate physical identities", () => {
    expect(() => validateElectronPhysicalResourceSet({
      ...declaration,
      resources: [...declaration.resources, declaration.resources[0]],
    })).toThrow(/duplicate id/u);
    expect(() => validateElectronPhysicalResourceSet({
      ...declaration,
      resources: [
        declaration.resources[0],
        { ...declaration.resources[0], id: "other-runtime" },
      ],
    })).toThrow(/duplicate stamp identity/u);
  });

  it("rejects transport, process and executable escape fields", () => {
    for (const field of ["argv", "command", "env", "ipc", "path"]) {
      expect(() => validateElectronPhysicalResourceSet({
        ...declaration,
        resources: [{ ...declaration.resources[0], [field]: "escape" }],
      }), field).toThrow(/fields must be exactly id,stamp/u);
    }
    expect(() => validateElectronPhysicalResourceSet({
      ...declaration,
      resources: [{
        ...declaration.resources[0],
        stamp: { ...declaration.resources[0].stamp, ipc: "/tmp/private.sock" },
      }],
    })).toThrow(/fields must be exactly app,mode,source/u);
  });
});
