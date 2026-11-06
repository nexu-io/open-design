// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  captureProjectProvenance,
  projectProvenance,
  resetProjectProvenance,
} from "./projectProvenance";

const CONFIG = "hyperframes.json";

/**
 * The real `/files/*` route answers with an envelope, not the file. Mocking the
 * raw config here instead let a broken parse pass the suite and fail live, so
 * this helper is deliberately shaped like the server's actual response.
 */
function mockConfigResponse(fileContent: string, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      json: async () => ({ filename: CONFIG, content: fileContent, version: "abc" }),
    })),
  );
}

beforeEach(() => {
  resetProjectProvenance();
  vi.unstubAllGlobals();
});

describe("captureProjectProvenance", () => {
  it("reads the authoring workflow that built the project", async () => {
    mockConfigResponse(JSON.stringify({ authoringSkill: "faceless-explainer" }));
    await captureProjectProvenance("p1", [CONFIG, "index.html"], ["index.html"]);
    expect(projectProvenance()).toMatchObject({
      project_scaffolded: true,
      project_authoring_skill: "faceless-explainer",
    });
  });

  it("counts compositions and media, which is what actually reproduces a bug", async () => {
    mockConfigResponse("{}");
    await captureProjectProvenance(
      "p1",
      [CONFIG, "index.html", "a.html", "assets/clip.mp4", "assets/vo.wav", "assets/logo.png"],
      ["index.html", "a.html"],
    );
    expect(projectProvenance()).toMatchObject({
      project_composition_count: 2,
      project_media_count: 3,
      project_file_count: 6,
    });
  });

  it("flags a project that init never scaffolded, and skips the config fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await captureProjectProvenance("p1", ["index.html"], ["index.html"]);
    expect(projectProvenance().project_scaffolded).toBe(false);
    expect(projectProvenance().project_authoring_skill).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Every way the config can fail to yield a skill must still leave the counts
  // behind: a partial report beats no report.
  it.each([
    ["the config is corrupt", () => mockConfigResponse("{ not json")],
    [
      "the envelope has no content field",
      () =>
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => ({ ok: true, json: async () => ({ error: "not found" }) })),
        ),
    ],
    [
      "the fetch fails outright",
      () =>
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => {
            throw new Error("offline");
          }),
        ),
    ],
    ["the route answers non-ok", () => mockConfigResponse("{}", false)],
  ])("keeps the counts when %s", async (_case, arrange) => {
    arrange();
    await expect(
      captureProjectProvenance("p1", [CONFIG, "index.html"], ["index.html"]),
    ).resolves.toBeUndefined();
    expect(projectProvenance().project_scaffolded).toBe(true);
    expect(projectProvenance().project_composition_count).toBe(1);
    expect(projectProvenance().project_authoring_skill).toBeUndefined();
  });

  describe("privacy", () => {
    it("drops a hand-edited skill that is not a slug, so no free text escapes", async () => {
      mockConfigResponse(
        JSON.stringify({ authoringSkill: "my client's secret campaign /Users/me/x" }),
      );
      await captureProjectProvenance("p1", [CONFIG], []);
      expect(projectProvenance().project_authoring_skill).toBeUndefined();
    });

    it("never copies file names, paths or the project title", async () => {
      mockConfigResponse(JSON.stringify({ authoringSkill: "slideshow", title: "Secret Launch" }));
      await captureProjectProvenance(
        "p1",
        [CONFIG, "assets/unreleased-product-hero.mp4"],
        ["index.html"],
      );
      const flat = JSON.stringify(projectProvenance());
      expect(flat).not.toContain("unreleased");
      expect(flat).not.toContain("Secret");
      expect(flat).not.toContain("assets/");
    });
  });
});
