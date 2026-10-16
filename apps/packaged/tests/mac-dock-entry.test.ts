import { describe, expect, it, vi } from "vitest";

import { planMacDockEntries, repairMacDockEntries, type MacDockTile } from "../src/mac-dock-entry.js";

const canonicalAppBundlePath = "/Applications/Open Design Beta.app";
const versionsRoot = "/Users/test/Library/Application Support/Open Design/launcher/channels/beta/namespaces/release-beta-mac/versions";
const appBundleName = "Open Design Beta.app";
const oldPayload = `${versionsRoot}/0.23.1-beta.1/payload/${appBundleName}`;
const newPayload = `${versionsRoot}/0.23.1-beta.2/payload/${appBundleName}`;
const options = { canonicalAppBundlePath, versionsRoot, appBundleName };

function tile(path: string, bundleIdentifier = "io.open-design.desktop.beta"): MacDockTile {
  return { type: "file-tile", url: `file://${encodeURI(path)}/`, bundleIdentifier };
}

describe("planMacDockEntries", () => {
  it("repoints the earliest owned tile and removes later owned versions without moving other apps", () => {
    const tiles = [tile("/Applications/Finder.app", "com.apple.finder"), tile(oldPayload), tile("/Applications/Safari.app", "com.apple.Safari"), tile(newPayload), tile(canonicalAppBundlePath)];
    expect(planMacDockEntries(tiles, options)).toEqual({
      keepIndex: 1,
      removeIndices: [3, 4],
      replacementUrl: "file:///Applications/Open%20Design%20Beta.app",
      replacementLabel: "Open Design Beta",
    });
  });

  it("preserves a pinned custom installation sharing the same bundle ID and another channel", () => {
    const tiles = [tile("/Users/test/Custom/Open Design Beta.app"), tile("/Applications/Open Design.app", "io.open-design.desktop"), tile(oldPayload)];
    expect(planMacDockEntries(tiles, options)).toMatchObject({ keepIndex: 2, removeIndices: [] });
  });

  it("preserves every tile when the user has not pinned an owned app", () => {
    expect(planMacDockEntries([tile("/Applications/Finder.app")], options)).toBeNull();
    expect(planMacDockEntries([], options)).toBeNull();
  });

  it("leaves one already canonical tile and its metadata untouched", () => {
    expect(planMacDockEntries([tile(canonicalAppBundlePath)], options)).toBeNull();
  });

  it("deduplicates canonical tiles without rewriting the preserved tile", () => {
    expect(planMacDockEntries([tile(canonicalAppBundlePath), tile(newPayload)], options)).toEqual({
      keepIndex: 0, removeIndices: [1], replacementUrl: null, replacementLabel: "Open Design Beta",
    });
  });

  it("matches an explicitly known historical outer path", () => {
    const oldOuter = "/Applications/Open Design.beta.app";
    expect(planMacDockEntries([tile(oldOuter)], { ...options, knownAppBundlePaths: [oldOuter] })).toMatchObject({ keepIndex: 0 });
  });

  it("rejects lookalike roots, payloads, versions and non-application tile types", () => {
    const candidates = [
      tile(`${versionsRoot}-other/0.23.1-beta.1/payload/${appBundleName}`),
      tile(`${versionsRoot}/0.23.1-beta.1/custom/${appBundleName}`),
      tile(`${versionsRoot}/0.23.1-beta.1/payload/Another.app`),
      tile(`${versionsRoot}/../versions/0.23.1-beta.1/payload/${appBundleName}`),
      { ...tile(oldPayload), type: "directory-tile" },
      { ...tile(oldPayload), url: "https://example.com/Open%20Design%20Beta.app" },
      { ...tile(oldPayload), url: `file://remote${oldPayload}` },
      { ...tile(oldPayload), url: "file:///bad%encoding" },
    ];
    expect(planMacDockEntries(candidates, options)).toBeNull();
  });

  it("rejects unsafe or nonabsolute canonical paths", () => {
    expect(planMacDockEntries([tile(oldPayload)], { ...options, canonicalAppBundlePath: "relative.app" })).toBeNull();
    expect(planMacDockEntries([tile(oldPayload)], { ...options, canonicalAppBundlePath: "/Applications/../Custom.app" })).toBeNull();
    expect(planMacDockEntries([tile(oldPayload)], { ...options, canonicalAppBundlePath: "/Applications/Open Design" })).toBeNull();
  });
});

describe("repairMacDockEntries", () => {
  it.each(["win32", "linux"] as const)("skips %s without reading preferences", async (platform) => {
    const exec = vi.fn();
    await expect(repairMacDockEntries({ ...options, platform, exec })).resolves.toEqual({ status: "skipped" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("writes a native typed repair then reloads Dock only when changed", async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: JSON.stringify({ revision: "native-plist-data", tiles: [tile(oldPayload), tile(newPayload)] }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ status: "repaired" }) })
      .mockResolvedValueOnce({ stdout: "" });
    await expect(repairMacDockEntries({ ...options, platform: "darwin", exec })).resolves.toEqual({ status: "repaired", removedEntries: 1 });
    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec.mock.calls[0][0]).toBe("/usr/bin/osascript");
    expect(exec.mock.calls[1][1][3]).toContain("isEqualToArray");
    expect(exec.mock.calls[1][1][3]).toContain("setObjectForKey");
    expect(exec.mock.calls[2]).toEqual(["/usr/bin/killall", ["Dock"], { timeout: 5_000, maxBuffer: 1024 * 1024, windowsHide: true }]);
  });

  it("does not write or reload unchanged preferences", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ revision: "native", tiles: [tile(canonicalAppBundlePath)] }) });
    await expect(repairMacDockEntries({ ...options, platform: "darwin", exec })).resolves.toEqual({ status: "unchanged" });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite or reload concurrent user edits", async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: JSON.stringify({ revision: "native", tiles: [tile(oldPayload)] }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ status: "conflict" }) });
    await expect(repairMacDockEntries({ ...options, platform: "darwin", exec })).resolves.toEqual({ status: "conflict" });
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("supports isolated preferences without restarting the user's Dock", async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: JSON.stringify({ revision: "native", tiles: [tile(oldPayload)] }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ status: "repaired" }) });
    await expect(repairMacDockEntries({ ...options, platform: "darwin", exec, preferencesDomain: "io.open-design.dock-test", restartDock: false })).resolves.toEqual({ status: "repaired", removedEntries: 0 });
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[0][1][3]).toContain("io.open-design.dock-test");
  });

  it("returns an OS failure without rejecting the confirmed launch", async () => {
    const error = new Error("preferences unavailable");
    const exec = vi.fn().mockRejectedValue(error);
    await expect(repairMacDockEntries({ ...options, platform: "darwin", exec })).resolves.toEqual({ status: "failed", error });
  });
});
