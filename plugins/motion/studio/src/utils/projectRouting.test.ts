import { describe, expect, it, vi } from "vitest";
import { buildFrameCaptureUrl } from "./frameCapture";
import {
  buildProjectApiPath,
  buildProjectHash,
  encodeProjectId,
  parseProjectHashRoute,
  parseProjectIdFromHash,
} from "./projectRouting";

describe("project routing utilities", () => {
  it.each(["C:", "C:demo", ".", "..", "../sessions", "a/b", "a\\b", "a\u0000b", "a\nb"])(
    "rejects unsafe decoded project IDs: %s",
    (id) => {
      expect(parseProjectIdFromHash(`#project/${encodeURIComponent(id)}`)).toBeNull();
      expect(() => buildProjectApiPath(id, "/files/index.html")).toThrow("Invalid project ID");
      expect(() => buildProjectHash(id)).toThrow("Invalid project ID");
    },
  );

  it("opens a folder whose name has a colon, encoded once both ways", () => {
    const id = "Customer story: Northwind";
    expect(encodeProjectId(id)).toBe("Customer%20story%3A%20Northwind");
    expect(buildProjectApiPath(id, "/preview")).toBe(
      "/api/projects/Customer%20story%3A%20Northwind/preview",
    );
    expect(parseProjectIdFromHash(buildProjectHash(id))).toBe(id);
  });

  it("decodes project ids from hash routes before building capture URLs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));

    const projectId = parseProjectIdFromHash("#project/Notion%20Showcase");

    expect(projectId).toBe("Notion Showcase");
    expect(
      buildFrameCaptureUrl({
        projectId: projectId ?? "",
        compositionPath: null,
        currentTime: 1.809,
        origin: "http://localhost:3002",
      }),
    ).toBe(
      "http://localhost:3002/api/projects/Notion%20Showcase/thumbnail/index.html?t=1.809&format=png&output=source&v=1777636800000",
    );

    vi.useRealTimers();
  });

  it("accepts legacy raw-space hash routes", () => {
    expect(parseProjectIdFromHash("#project/Notion Showcase")).toBe("Notion Showcase");
  });

  it("decodes reserved characters when the hash route is encoded", () => {
    expect(parseProjectIdFromHash("#project/Launch%20%231%3F%20v2")).toBe("Launch #1? v2");
  });

  it("does not throw on malformed percent escapes in hash routes", () => {
    expect(parseProjectIdFromHash("#project/Broken%ZZName")).toBe("Broken%ZZName");
  });

  it("ignores non-project hash routes", () => {
    expect(parseProjectIdFromHash("")).toBeNull();
    expect(parseProjectIdFromHash("#settings")).toBeNull();
    expect(parseProjectIdFromHash("#project/")).toBeNull();
    expect(parseProjectIdFromHash("#project/foo/bar")).toBeNull();
  });

  it("encodes project ids when writing hash routes", () => {
    expect(buildProjectHash("Notion Showcase")).toBe("#project/Notion%20Showcase");
    expect(buildProjectHash("Notion%20Showcase")).toBe("#project/Notion%2520Showcase");
    expect(buildProjectHash("Launch #1? v2")).toBe("#project/Launch%20%231%3F%20v2");
  });

  it("round-trips unicode project ids through hash routes", () => {
    const hash = buildProjectHash("Mañana demo");

    expect(hash).toBe("#project/Ma%C3%B1ana%20demo");
    expect(parseProjectIdFromHash(hash)).toBe("Mañana demo");
  });

  it("parses project hash routes with query params", () => {
    const route = parseProjectHashRoute("#project/Notion%20Showcase?tab=design&t=4.2");

    expect(route?.projectId).toBe("Notion Showcase");
    expect(route?.params.get("tab")).toBe("design");
    expect(route?.params.get("t")).toBe("4.2");
  });

  it("builds hash routes with query params", () => {
    expect(buildProjectHash("Notion Showcase", { tab: "design", t: "4.2" })).toBe(
      "#project/Notion%20Showcase?tab=design&t=4.2",
    );
  });

  it("encodes project ids as one API path segment", () => {
    expect(encodeProjectId("Notion Showcase")).toBe("Notion%20Showcase");
    expect(encodeProjectId("Notion%20Showcase")).toBe("Notion%2520Showcase");
    expect(encodeProjectId("Launch #1? v2")).toBe("Launch%20%231%3F%20v2");
  });

  it("builds API paths without double encoding decoded project ids", () => {
    expect(buildProjectApiPath("Notion Showcase", "/thumbnail/index.html")).toBe(
      "/api/projects/Notion%20Showcase/thumbnail/index.html",
    );
  });

  it("keeps literal percent signs safe in API paths", () => {
    expect(buildProjectApiPath("Percent%20Name", "/preview")).toBe(
      "/api/projects/Percent%2520Name/preview",
    );
  });

  it("keeps unicode project ids safe in API paths", () => {
    expect(buildProjectApiPath("Mañana demo", "/preview")).toBe(
      "/api/projects/Ma%C3%B1ana%20demo/preview",
    );
  });
});
