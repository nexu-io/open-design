import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "@/config/index.js";
import {
  allPackagedSidecarStopRequests,
  packagedSidecarStopRequests,
} from "@/config/sidecar-stamps.js";

describe("packaged sidecar resource declaration", () => {
  it("declares both launch sources, every runtime app, and both desktop modes", () => {
    const config = {
      appVersion: "0.10.0-beta.1",
      namespace: "release-beta-win",
    } as ToolPackConfig;

    const stamps = allPackagedSidecarStopRequests(config).map(({ stamp }) => stamp);

    expect(stamps).toHaveLength(12);
    expect(new Set(stamps.map(({ channel }) => channel))).toEqual(new Set(["beta"]));
    expect(new Set(stamps.map(({ source }) => source))).toEqual(new Set(["tools-pack", "packaged"]));
    expect(stamps.filter(({ app, mode }) => app === "desktop" && mode === "runtime")).toHaveLength(2);
    expect(stamps.filter(({ app, mode }) => app === "desktop" && mode === "headless")).toHaveLength(2);
    expect(stamps.filter(({ app, mode }) => app === "web" && mode === "runtime")).toHaveLength(2);
    expect(stamps.filter(({ app, mode }) => app === "daemon" && mode === "runtime")).toHaveLength(2);
    expect(stamps.filter(({ app, mode }) => app === "web" && mode === "headless")).toHaveLength(2);
    expect(stamps.filter(({ app, mode }) => app === "daemon" && mode === "headless")).toHaveLength(2);
  });

  it("keeps exact runtime and headless stop sets disjoint for every app and source", () => {
    const config = {
      appVersion: "0.10.0-beta.1",
      namespace: "release-beta-win",
    } as ToolPackConfig;
    const key = ({ stamp }: ReturnType<typeof packagedSidecarStopRequests>[number]) =>
      [stamp.app, stamp.channel, stamp.mode, stamp.namespace, stamp.source].join(":");
    const runtime = new Set(packagedSidecarStopRequests(config, "runtime").map(key));
    const headless = new Set(packagedSidecarStopRequests(config, "headless").map(key));

    expect(runtime.size).toBe(6);
    expect(headless.size).toBe(6);
    expect([...runtime].filter((stamp) => headless.has(stamp))).toEqual([]);
  });
});
