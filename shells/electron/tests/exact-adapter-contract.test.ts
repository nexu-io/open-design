import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseElectronExactDistributionRequest, parseElectronExactSceneRequest } from "../scripts/exact-adapter-contract.ts";

const absolute = (name: string) => resolve("/tmp", name);

describe("Electron exact Shell adapter contract", () => {
  it("accepts only the finite scene request", () => {
    const request = {
      closureArtifactFile: absolute("closure.mjs"), operation: "electron.scene.build", sceneDirectory: absolute("scene"), schemaVersion: 1,
      shellManifestFile: absolute("shell.json"), standaloneLauncherFile: absolute("standalone-launcher.mjs"), target: "darwin-arm64",
    } as const;
    expect(parseElectronExactSceneRequest(request)).toEqual(request);
    expect(() => parseElectronExactSceneRequest({ ...request, target: "linux-x64" })).toThrow(/target/u);
    expect(() => parseElectronExactSceneRequest({ ...request, extra: true })).toThrow(/fields/u);
    expect(() => parseElectronExactSceneRequest({ ...request, sceneDirectory: "relative" })).toThrow(/absolute/u);
  });

  it("accepts only a digest-bound native distribution request", () => {
    const request = {
      channelHeadUrl: "https://releases.example/betahyx/latest/channel-head.json", contentMetadataFile: absolute("content-metadata.json"),
      operation: "electron.distribution.build", outputDirectory: absolute("distribution"), sceneDirectory: absolute("scene"),
      sceneManifestSha256: "a".repeat(64), schemaVersion: 1, target: "win32-x64", trustFile: absolute("keys.json"),
    } as const;
    expect(parseElectronExactDistributionRequest(request)).toEqual(request);
    expect(() => parseElectronExactDistributionRequest({ ...request, schemaVersion: 2 })).toThrow(/identity/u);
    expect(() => parseElectronExactDistributionRequest({ ...request, sceneManifestSha256: "bad" })).toThrow(/digest/u);
    expect(() => parseElectronExactDistributionRequest({ ...request, channelHeadUrl: "file:///tmp/head.json" })).toThrow(/URL/u);
  });
});
