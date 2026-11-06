// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { addBlockToProject } from "./blockInstaller";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("addBlockToProject", () => {
  it("uses an explicit selected-media duration and track for a Registry overlay block", async () => {
    const componentPath = "compositions/camcorder-hud.html";
    const targetPath = "compositions/scene.html";
    const files = new Map([
      [
        componentPath,
        `<body><div data-composition-id="camcorder-hud"><div class="hud"></div></div></body>`,
      ],
      [
        targetPath,
        `<main data-composition-id="scene" data-duration="10" data-width="1920" data-height="1080"></main>`,
      ],
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          written: [componentPath],
          block: {
            name: "camcorder-hud",
            title: "Camcorder HUD",
            description: "HUD",
            type: "hyperframes:block",
            files: [],
            dimensions: { width: 1920, height: 1080 },
            duration: 4,
          },
        }),
      }),
    );
    const writeProjectFile = vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    });

    const result = await addBlockToProject({
      projectId: "project",
      blockName: "camcorder-hud",
      activeCompPath: targetPath,
      placement: { start: 2.5, duration: 4.25, track: 3 },
      timelineElements: [],
      readProjectFile: async (path) => files.get(path) ?? "",
      writeProjectFile,
      recordEdit: vi.fn().mockResolvedValue(undefined),
      refreshFileTree: vi.fn().mockResolvedValue(undefined),
      reloadPreview: vi.fn(),
      showToast: vi.fn(),
    });

    expect(result?.block.name).toBe("camcorder-hud");
    const source = files.get(targetPath);
    expect(source).toContain('data-composition-src="compositions/camcorder-hud.html"');
    expect(source).toContain('data-start="2.5"');
    expect(source).toContain('data-duration="4.25"');
    expect(source).toContain('data-track-index="3"');
    // hostKey addresses the new element the same way the timeline selects
    // clips (sourceFile#domId), so the caller can select and reveal it.
    expect(result?.hostKey).toBe("compositions/scene.html#camcorder-hud");
    expect(source).toContain('id="camcorder-hud"');
  });
});
