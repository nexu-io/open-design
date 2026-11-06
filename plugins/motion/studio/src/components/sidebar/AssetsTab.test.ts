import { describe, expect, it } from "vitest";
import { filterByUsage, countUsage, deriveUsedPaths } from "./AssetsTab";
import { truncateMiddle, formatDuration } from "./assetHelpers";
import { globalAssetRows } from "./GlobalAssetsView";

const assets = ["bgm.mp3", "logo.png", "orphan.wav"];
const used = new Set(["bgm.mp3", "logo.png"]);

describe("filterByUsage", () => {
  it("returns everything for 'all'", () => {
    expect(filterByUsage(assets, used, "all")).toEqual(assets);
  });

  it("keeps only referenced assets for 'used'", () => {
    expect(filterByUsage(assets, used, "used")).toEqual(["bgm.mp3", "logo.png"]);
  });

  it("keeps only unreferenced assets for 'unused'", () => {
    expect(filterByUsage(assets, used, "unused")).toEqual(["orphan.wav"]);
  });

  it("treats everything as unused when nothing is referenced", () => {
    expect(filterByUsage(assets, new Set(), "used")).toEqual([]);
    expect(filterByUsage(assets, new Set(), "unused")).toEqual(assets);
  });
});

describe("deriveUsedPaths", () => {
  it("matches the asset-list format across every src shape", () => {
    const used = deriveUsedPaths([
      { src: "assets/logo.png" }, // raw authored relative path
      { src: "/api/projects/demo/preview/assets/bgm.mp3" }, // served form
      { src: "./assets/icon.svg" }, // ./-prefixed
      { src: "assets/clip.mp4?v=2" }, // cache-busted
      {}, // no src — skipped
    ]);
    expect(used.has("assets/logo.png")).toBe(true);
    expect(used.has("assets/bgm.mp3")).toBe(true);
    expect(used.has("assets/icon.svg")).toBe(true);
    expect(used.has("assets/clip.mp4")).toBe(true);
    expect(used.size).toBe(4);
  });

  it("an authored relative src lines up with the asset entry (the live bug class)", () => {
    const used = deriveUsedPaths([{ src: "assets/logo.png" }]);
    // asset-list entries are project-relative (see serveUrl = preview/${asset})
    expect(filterByUsage(["assets/logo.png", "assets/orphan.wav"], used, "used")).toEqual([
      "assets/logo.png",
    ]);
  });

  it("handles fully-absolute URLs produced by the core runtime (toAbsoluteAssetUrl)", () => {
    // The runtime calls new URL(raw, document.baseURI).toString() which produces
    // "http://localhost:3012/api/projects/demo/preview/assets/clip.mp4"
    const used = deriveUsedPaths([
      { src: "http://localhost:3012/api/projects/demo/preview/assets/clip.mp4" },
      { src: "http://localhost:3012/api/projects/abc123/preview/assets/logo.png" },
    ]);
    expect(used.has("assets/clip.mp4")).toBe(true);
    expect(used.has("assets/logo.png")).toBe(true);
    expect(used.size).toBe(2);
  });

  it("decodes percent-encoded filenames (spaces, parens) so they match the asset list", () => {
    // Files with spaces/parens: "assets/my file (1).mp4" authored in HTML
    // → runtime resolves to "http://…/assets/my%20file%20(1).mp4"
    const used = deriveUsedPaths([
      { src: "http://localhost:3012/api/projects/p/preview/assets/my%20file%20(1).mp4" },
      { src: "/api/projects/p/preview/assets/track%20one.mp3" },
    ]);
    expect(used.has("assets/my file (1).mp4")).toBe(true);
    expect(used.has("assets/track one.mp3")).toBe(true);
    expect(used.size).toBe(2);
  });

  it("round-trips: absolute URL with spaces matches filterByUsage against plain asset list", () => {
    const used = deriveUsedPaths([
      { src: "http://localhost:3012/api/projects/demo/preview/assets/my%20video.mp4" },
    ]);
    expect(filterByUsage(["assets/my video.mp4", "assets/other.png"], used, "used")).toEqual([
      "assets/my video.mp4",
    ]);
  });
});

describe("countUsage", () => {
  it("counts used vs unused", () => {
    expect(countUsage(assets, used)).toEqual({ used: 2, unused: 1 });
  });

  it("is all-unused with an empty used set", () => {
    expect(countUsage(assets, new Set())).toEqual({ used: 0, unused: 3 });
  });
});

describe("truncateMiddle", () => {
  it("returns the original string when it fits within maxLen", () => {
    expect(truncateMiddle("short.mp4", 20)).toBe("short.mp4");
    expect(truncateMiddle("exact_length_str.mp4", 20)).toBe("exact_length_str.mp4");
  });

  it("truncates longer strings with an ellipsis in the middle", () => {
    const result = truncateMiddle("2a37eabf-long-uuid-887d8.mp4", 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toContain("…");
    // Preserves head
    expect(result.startsWith("2a37eabf-long-uuid-8")).toBe(false); // head is shortened
    expect(result.startsWith("2a37eabf")).toBe(true);
    // Preserves tail
    expect(result.endsWith("887d8.mp4")).toBe(false); // tail portion only
    expect(result.endsWith(".mp4")).toBe(true);
  });

  it("preserves the full filename extension in the tail", () => {
    const result = truncateMiddle("verylongnamehere12345.mp4", 14);
    expect(result.endsWith(".mp4")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(14);
  });

  it("handles maxLen of 1 (degenerate)", () => {
    const result = truncateMiddle("abcdef", 1);
    // head = 0, tail = 0 → just the ellipsis
    expect(result).toBe("…");
  });

  it("handles a string of exactly maxLen+1 chars", () => {
    const result = truncateMiddle("abcdefgh", 7);
    expect(result.length).toBeLessThanOrEqual(7);
    expect(result).toContain("…");
  });
});

describe("formatDuration", () => {
  it("formats whole seconds as MM:SS", () => {
    expect(formatDuration(28)).toBe("00:28");
    expect(formatDuration(60)).toBe("01:00");
    expect(formatDuration(90)).toBe("01:30");
    expect(formatDuration(3661)).toBe("61:01");
  });

  it("rounds fractional seconds to nearest whole", () => {
    expect(formatDuration(28.4)).toBe("00:28");
    expect(formatDuration(28.6)).toBe("00:29");
  });

  it("returns empty string for non-positive values", () => {
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-1)).toBe("");
  });

  it("returns empty string for non-finite values", () => {
    expect(formatDuration(NaN)).toBe("");
    expect(formatDuration(Infinity)).toBe("");
    expect(formatDuration(-Infinity)).toBe("");
  });
});

describe("globalAssetRows", () => {
  const recs = [
    { id: "bgm_001", type: "bgm", description: "calm ambient" },
    { id: "img_001", type: "image", entity: "Acme" },
    { sha: "abc", type: "sfx" },
  ];

  it("maps records to display rows with a sensible label", () => {
    const rows = globalAssetRows(recs);
    expect(rows).toEqual([
      { id: "bgm_001", type: "bgm", label: "calm ambient" },
      { id: "img_001", type: "image", label: "Acme" },
      { id: "abc", type: "sfx", label: "abc" },
    ]);
  });

  it("filters by id / type / description / entity, case-insensitively", () => {
    expect(globalAssetRows(recs, "ACME").map((r) => r.id)).toEqual(["img_001"]);
    expect(globalAssetRows(recs, "bgm").map((r) => r.id)).toEqual(["bgm_001"]);
    expect(globalAssetRows(recs, "ambient").map((r) => r.id)).toEqual(["bgm_001"]);
  });

  it("empty query returns all", () => {
    expect(globalAssetRows(recs, "  ").length).toBe(3);
  });
});
