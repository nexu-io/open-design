// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTimelineMoveTimingPatch,
  buildTimelineResizeTimingPatch,
  persistElementAttribute,
  persistTimelineBatchEdit,
  persistTimelineEdit,
} from "./timelineEditingHelpers";
import type { TimelineElement } from "../player/store/playerStore";
import { finishClipTimingFallback } from "./timelineTimingSync";
import { applyColorGradingScopeUpdate } from "../components/studioColorGradingScope";

const SOURCE =
  '<div id="root"><video id="a" class="clip" data-start="1" data-duration="5" data-track-index="0"></video>' +
  '<video id="b" class="clip" data-start="2" data-duration="5" data-track-index="1"></video>' +
  '<script>gsap.to("#a", { x: 1 }, 1)</script></div>';

// Refuses a write whose base is stale, like the server's If-Match; one write can be held mid-flight.
// A GSAP shift lands 10 ms after it is posted and releases the held write.
function fakeProject() {
  let file = SOURCE;
  const refused: string[] = [];
  let writes = 0;
  let release = () => {};
  const firstWrite = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("/gsap-mutation-capabilities")) {
        return Response.json({ atomicOwnershipPairs: true });
      }
      if (input.includes("/gsap-mutations/")) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const before = file;
        file = file.replace("{ x: 1 }, 1)", "{ x: 1 }, 3)");
        release();
        return Response.json({ mutated: true, before, after: file, scriptText: null });
      }
      return Response.json({ content: file });
    }),
  );
  const writeProjectFile = async (path: string, content: string, expected?: string) => {
    if (++writes === 1) await firstWrite;
    if (expected !== undefined && expected !== file && content !== file) {
      refused.push(path);
      throw new Error(`409 conflict on ${path}`);
    }
    file = content;
  };
  return { writeProjectFile, refused, release: () => release(), read: () => file };
}

type Project = ReturnType<typeof fakeProject>;

function clip(id: string): TimelineElement {
  return { id, key: id, domId: id, tag: "video", label: id, start: 0, duration: 5, track: 0 };
}

const shared = (project: Project) => ({
  projectId: "p1",
  activeCompPath: "index.html",
  writeProjectFile: project.writeProjectFile,
  recordEdit: async () => {},
  pendingTimelineEditPathRef: { current: new Set<string>() },
});

const move = (project: Project, id: string, start: number) =>
  persistTimelineEdit({
    ...shared(project),
    element: clip(id),
    label: "Move clip",
    buildPatches: (original, target) => buildTimelineMoveTimingPatch(original, target, start, 5),
  });

const trim = (project: Project, id: string, duration: number) =>
  persistTimelineBatchEdit({
    ...shared(project),
    label: "Trim clip",
    changes: [
      {
        element: clip(id),
        buildPatches: (original, target) =>
          buildTimelineResizeTimingPatch(original, target, clip(id), { start: 0, duration }),
      },
    ],
  });

// Starts the second save while the first one's write is in flight; both must land unrefused.
async function expectBothLand(
  project: Project,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  const saves = [first()];
  await new Promise((resolve) => setTimeout(resolve, 0));
  saves.push(second());
  await new Promise((resolve) => setTimeout(resolve, 0));
  project.release();
  const results = await Promise.allSettled(saves);
  expect(project.refused).toEqual([]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("two quick timeline saves on one file", () => {
  it("lands both moves", async () => {
    const project = fakeProject();
    await expectBothLand(
      project,
      () => move(project, "a", 3),
      () => move(project, "b", 4),
    );

    expect(project.read()).toContain('id="a" class="clip" data-start="3"');
    expect(project.read()).toContain('id="b" class="clip" data-start="4"');
  });

  it("lands both trims", async () => {
    const project = fakeProject();
    await expectBothLand(
      project,
      () => trim(project, "a", 3),
      () => trim(project, "b", 2),
    );

    expect(project.read()).toMatch(/id="a"[^>]*data-duration="3"/);
    expect(project.read()).toMatch(/id="b"[^>]*data-duration="2"/);
  });

  it("lands a move started while a volume save is writing", async () => {
    const project = fakeProject();
    const volume = () =>
      persistElementAttribute({
        ...shared(project),
        targetPath: "index.html",
        patchTarget: { id: "a" },
        attr: "data-volume",
        value: "0.5",
        label: "Set volume",
        patchLive: () => {},
        onFileRead: () => {},
      });
    await expectBothLand(project, volume, () => move(project, "b", 4));

    expect(project.read()).toContain('data-volume="0.5"');
    expect(project.read()).toContain('id="b" class="clip" data-start="4"');
  });

  it("keeps a move when a color grade starts while it is writing", async () => {
    const project = fakeProject();
    const grade = () =>
      applyColorGradingScopeUpdate({
        scope: "source-file",
        value: "warm",
        selectedSourceFile: "index.html",
        fileTree: ["index.html"],
        projectId: "p1",
        waitForPendingDomEditSaves: async () => {},
        readProjectFile: async () => project.read(),
        writeProjectFile: project.writeProjectFile,
        recordEdit: async () => {},
        reloadPreview: () => {},
        showToast: () => {},
      });
    await expectBothLand(project, () => move(project, "a", 3), grade);

    expect(project.read()).toContain('id="a" class="clip" data-start="3"');
    expect(project.read()).toContain('data-color-grading="warm"');
  });

  it("lands a move started while the previous move's GSAP rewrite is in flight", async () => {
    const project = fakeProject();
    const shiftA = finishClipTimingFallback({
      iframe: null,
      reloadPreview: () => {},
      projectId: "p1",
      targetPath: "index.html",
      domId: "a",
      label: "Move clip",
      recordEdit: async () => {},
      writeProjectFile: project.writeProjectFile,
      edit: { kind: "shift", delta: 2 },
    });
    const results = await Promise.allSettled([shiftA, move(project, "b", 4)]);

    expect(project.refused).toEqual([]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(project.read()).toContain('gsap.to("#a", { x: 1 }, 3)');
    expect(project.read()).toContain('id="b" class="clip" data-start="4"');
  });
});
