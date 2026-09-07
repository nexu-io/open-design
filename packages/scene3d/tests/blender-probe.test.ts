import { afterEach, describe, expect, it } from "vitest";
import { clearProbeCache, parseMajorVersion, probeBlender } from "../src/build/blender.js";

describe("parseMajorVersion", () => {
  it("reads Blender's banner and bpy's bare version alike", () => {
    expect(parseMajorVersion("Blender 5.0.1")).toBe(5);
    expect(parseMajorVersion("4.2.3")).toBe(4);
    expect(parseMajorVersion("v24.4.0")).toBe(24);
  });

  it("returns undefined when no version is recognisable", () => {
    expect(parseMajorVersion("")).toBeUndefined();
    expect(parseMajorVersion("no digits here")).toBeUndefined();
  });
});

describe("probeBlender caching", () => {
  afterEach(() => clearProbeCache());

  /* node itself stands in for a "blender" binary: `node --version` exits 0
     and prints one short line, which is all the probe requires. No Blender
     is spawned anywhere in this file. */
  const fakeBlender = process.execPath;

  it("does not let a failed probe poison later attempts", async () => {
    clearProbeCache();
    const missing = await probeBlender({ blenderBin: "definitely-not-a-real-binary-s3d" });
    expect(missing).toBeNull();
    /* The daemon holds this module for its lifetime. A negative cached at
       startup — Blender installed five minutes later — used to force E-201
       on every compile until a restart nobody had a reason to suspect. */
    const found = await probeBlender({ blenderBin: fakeBlender });
    expect(found).not.toBeNull();
    expect(found?.mode).toBe("blender");
  });

  it("caches a success for the process", async () => {
    clearProbeCache();
    const found = await probeBlender({ blenderBin: fakeBlender });
    expect(found).not.toBeNull();
    // A later call with a bad bin still returns the cached success.
    const again = await probeBlender({ blenderBin: "definitely-not-a-real-binary-s3d" });
    expect(again).toEqual(found);
  });

  it("parses the major version out of the probe line", async () => {
    clearProbeCache();
    const found = await probeBlender({ blenderBin: fakeBlender });
    // node --version prints v<major>.<minor>.<patch>.
    expect(found?.major).toBeGreaterThanOrEqual(18);
  });
});
