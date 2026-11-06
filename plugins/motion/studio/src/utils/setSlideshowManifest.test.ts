import { describe, expect, it, vi } from "vitest";
import { buildSlideshowIslandHtml } from "./setSlideshowManifest";
import { parseSlideshowManifest } from "@hyperframes/core/slideshow";
import type { CutoverDeps } from "./sdkCutover";

// Fix 3: vi.mock must be at module top level so Vitest can hoist them.
vi.mock("../components/editor/manualEditingAvailability", () => ({
  STUDIO_SDK_CUTOVER_ENABLED: true,
  STUDIO_SDK_RESOLVER_SHADOW_ENABLED: false,
}));
vi.mock("./studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

describe("buildSlideshowIslandHtml", () => {
  it("serializes a manifest into a script island", () => {
    const html = buildSlideshowIslandHtml({ slides: [{ sceneId: "a" }] });
    expect(html).toContain('type="application/hyperframes-slideshow+json"');
    expect(html).toContain('"sceneId": "a"');
  });

  it("stamps version 1, preserving an existing version", () => {
    expect(buildSlideshowIslandHtml({ slides: [] })).toContain('"version": 1');
    expect(buildSlideshowIslandHtml({ version: 2, slides: [] })).toContain('"version": 2');
  });

  it("round-trips through parseSlideshowManifest", () => {
    const html = `<html><body>${buildSlideshowIslandHtml({ slides: [{ sceneId: "x" }] })}</body></html>`;
    const parsed = parseSlideshowManifest(html);
    expect(parsed?.slides[0]?.sceneId).toBe("x");
  });

  it("wraps the JSON in a script tag with no extra nesting", () => {
    const html = buildSlideshowIslandHtml({ slides: [] });
    expect(html.startsWith("<script")).toBe(true);
    expect(html.trimEnd().endsWith("</script>")).toBe(true);
  });

  // Fix 1: </script> breakout test
  it("does NOT embed a literal </script> inside the JSON body", () => {
    const manifest = { slides: [{ sceneId: "s1", notes: "</script><b>x</b>" }] };
    const html = buildSlideshowIslandHtml(manifest);
    // The only closing </script> should be the real one at the very end.
    // Strip that trailing tag and confirm no </script> remains.
    const withoutClosingTag = html.slice(0, html.lastIndexOf("</script>"));
    expect(withoutClosingTag).not.toContain("</script>");
  });

  it("round-trips a manifest containing </script> in notes via parseSlideshowManifest", () => {
    const notes = "</script><b>x</b>";
    const manifest = { slides: [{ sceneId: "s1", notes }] };
    const html = `<html><body>${buildSlideshowIslandHtml(manifest)}</body></html>`;
    const parsed = parseSlideshowManifest(html);
    expect(parsed?.slides[0]).toMatchObject({ sceneId: "s1", notes });
  });
});

describe("persistSlideshowManifest — op construction", () => {
  function makeDeps(writeProjectFile: ReturnType<typeof vi.fn>): CutoverDeps {
    return {
      editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
      writeProjectFile,
      reloadPreview: vi.fn(),
    };
  }

  it("writes the serialized manifest when the island already exists", async () => {
    const { persistSlideshowManifest } = await import("./setSlideshowManifest");

    const manifest = { slides: [{ sceneId: "scene-1" }] };
    const island = buildSlideshowIslandHtml(manifest);
    const originalHtml = `<html><head></head><body>${island}</body></html>`;

    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps(writeProjectFile);
    const recordEdit = deps.editHistory.recordEdit as ReturnType<typeof vi.fn>;

    await persistSlideshowManifest({
      manifest: { slides: [{ sceneId: "scene-2" }] },
      originalContent: originalHtml,
      targetPath: "/proj/comp.html",
      deps,
    });

    expect(writeProjectFile).toHaveBeenCalledOnce();
    const written: string = writeProjectFile.mock.calls[0]?.[1] as string;
    expect(written).toContain('"sceneId": "scene-2"');
    expect(recordEdit).toHaveBeenCalledWith(expect.objectContaining({ label: "Edit slideshow" }));
  });

  it("inserts the island when none exists in the serialized HTML", async () => {
    const { persistSlideshowManifest } = await import("./setSlideshowManifest");

    const baseHtml = "<html><head></head><body></body></html>";
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps(writeProjectFile);
    await persistSlideshowManifest({
      manifest: { slides: [{ sceneId: "new-scene" }] },
      originalContent: baseHtml,
      targetPath: "/proj/comp.html",
      deps,
    });

    expect(writeProjectFile).toHaveBeenCalledOnce();
    const written: string = writeProjectFile.mock.calls[0]?.[1] as string;
    expect(written).toContain('"sceneId": "new-scene"');
    expect(written).toContain('type="application/hyperframes-slideshow+json"');
  });

  // Fix 2: two stale islands should collapse to exactly one after persist
  it("collapses two stale islands into exactly one after persist", async () => {
    const { persistSlideshowManifest } = await import("./setSlideshowManifest");

    const staleIsland1 = buildSlideshowIslandHtml({ slides: [{ sceneId: "old-1" }] });
    const staleIsland2 = buildSlideshowIslandHtml({ slides: [{ sceneId: "old-2" }] });
    const twoIslandHtml = `<html><head></head><body>${staleIsland1}${staleIsland2}</body></html>`;

    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps(writeProjectFile);
    await persistSlideshowManifest({
      manifest: { slides: [{ sceneId: "fresh" }] },
      originalContent: twoIslandHtml,
      targetPath: "/proj/comp.html",
      deps,
    });

    expect(writeProjectFile).toHaveBeenCalledOnce();
    const written: string = writeProjectFile.mock.calls[0]?.[1] as string;

    // Count occurrences of the island script open tag
    const islandCount = (written.match(/type="application\/hyperframes-slideshow\+json"/g) ?? [])
      .length;
    expect(islandCount).toBe(1);
    expect(written).toContain('"sceneId": "fresh"');
    expect(written).not.toContain('"sceneId": "old-1"');
    expect(written).not.toContain('"sceneId": "old-2"');
  });
});
