// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../player";
import { resolveAudioGroups } from "@hyperframes/core/audio-groups";
import { readTagSnippetByTarget } from "../utils/sourcePatcher";
import { createAudioGroupAndAssignMembers } from "./timelineAudioGroupCreate";
import { toggleTimelineElementHidden, toggleTimelineTrackHidden } from "./timelineTrackVisibility";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  usePlayerStore.getState().reset();
});

function element(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: "clip",
    tag: "div",
    start: 0,
    duration: 2,
    track: 0,
    ...overrides,
  };
}

function stubProjectFiles(files: Map<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const encodedPath = url.slice(url.lastIndexOf("/") + 1);
      const path = decodeURIComponent(encodedPath);
      const content = files.get(path);
      return new Response(JSON.stringify({ content }), {
        status: content === undefined ? 404 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

describe("toggleTimelineTrackHidden", () => {
  it("patches iframe DOM and persists all track elements as one edit-history entry", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    if (iframe.contentDocument) {
      iframe.contentDocument.body.innerHTML = `
        <div id="hero"></div>
        <div data-composition-id="scene" data-composition-file="scene.html">
          <div id="subtitle"></div>
        </div>
      `;
    }

    const files = new Map([
      [
        "index.html",
        `<div id="hero" data-start="0" data-duration="2"></div>
<div id="skip" data-start="0" data-duration="2"></div>`,
      ],
      ["scene.html", `<div id="subtitle" data-start="1" data-duration="2"></div>`],
    ]);
    stubProjectFiles(files);

    const writes = new Map<string, string>();
    const recordEdit = vi.fn();
    const pendingRef = { current: new Set<string>() };

    await toggleTimelineTrackHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [
        element({ id: "hero", domId: "hero", track: 0 }),
        element({ id: "skip", domId: "skip", track: 1 }),
        element({ id: "subtitle", domId: "subtitle", track: 0, sourceFile: "scene.html" }),
      ],
      track: 0,
      hidden: true,
      previewIframe: iframe,
      writeProjectFile: async (path, content) => {
        writes.set(path, content);
      },
      recordEdit,
      pendingTimelineEditPathRef: pendingRef,
    });

    expect(iframe.contentDocument?.getElementById("hero")?.hasAttribute("data-hidden")).toBe(true);
    expect(iframe.contentDocument?.getElementById("subtitle")?.hasAttribute("data-hidden")).toBe(
      true,
    );
    expect(writes.get("index.html")).toContain('id="hero" data-start="0" data-duration="2"');
    expect(writes.get("index.html")).toContain('data-hidden=""');
    expect(writes.get("index.html")).toContain('id="skip" data-start="0" data-duration="2"');
    expect(writes.get("scene.html")).toContain('data-hidden=""');
    expect(pendingRef.current).toEqual(new Set(["index.html", "scene.html"]));
    expect(recordEdit).toHaveBeenCalledTimes(1);
    // Display row, not the raw key: track 0 is the first row, so it reads "1",
    // the same number the track header announces for that row.
    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Hide track 1");
    expect(Object.keys(recordEdit.mock.calls[0]?.[0]?.files ?? {}).sort()).toEqual([
      "index.html",
      "scene.html",
    ]);
  });

  it("removes data-hidden from every element on the track", async () => {
    const files = new Map([
      [
        "index.html",
        `<div id="hero" data-start="0" data-duration="2" data-hidden=""></div>
<div id="caption" data-start="2" data-duration="2" data-hidden=""></div>`,
      ],
    ]);
    stubProjectFiles(files);

    const writes = new Map<string, string>();

    await toggleTimelineTrackHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [
        element({ id: "hero", domId: "hero", track: 0, hidden: true }),
        element({ id: "caption", domId: "caption", track: 0, hidden: true }),
      ],
      track: 0,
      hidden: false,
      previewIframe: null,
      writeProjectFile: async (path, content) => {
        writes.set(path, content);
      },
      recordEdit: vi.fn(),
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(writes.get("index.html")).not.toContain("data-hidden");
  });

  // An expanded sub-comp child gets a synthesized FRACTIONAL track key
  // (`display.track + n / (siblings + 2)`), so a label built from the raw key
  // reads "Hide track 0.16666666666666666" in the undo history. Track 0 would
  // format cleanly and prove nothing, hence 1 / 6.
  it("labels the undo entry with the display row, not the fractional track key", async () => {
    const files = new Map([
      ["index.html", `<div id="child" data-start="0" data-duration="2"></div>`],
    ]);
    stubProjectFiles(files);

    const recordEdit = vi.fn();

    await toggleTimelineTrackHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [
        element({ id: "host", domId: "host", track: 0 }),
        element({ id: "child", domId: "child", track: 1 / 6 }),
      ],
      track: 1 / 6,
      hidden: true,
      previewIframe: null,
      writeProjectFile: async () => {},
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Hide track 2");
  });

  it("labels a show back with the display row too", async () => {
    const files = new Map([
      ["index.html", `<div id="child" data-start="0" data-duration="2" data-hidden=""></div>`],
    ]);
    stubProjectFiles(files);

    const recordEdit = vi.fn();

    await toggleTimelineTrackHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [
        element({ id: "host", domId: "host", track: 0 }),
        element({ id: "child", domId: "child", track: 1 / 6, hidden: true }),
      ],
      track: 1 / 6,
      hidden: false,
      previewIframe: null,
      writeProjectFile: async () => {},
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Show track 2");
  });

  it("labels an audio-only track Mute/Unmute instead of Hide/Show", async () => {
    const files = new Map([
      ["index.html", `<div id="voiceover" data-start="0" data-duration="2"></div>`],
    ]);
    stubProjectFiles(files);

    const recordEdit = vi.fn();

    await toggleTimelineTrackHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [element({ id: "voiceover", domId: "voiceover", track: 0, tag: "audio" })],
      track: 0,
      hidden: true,
      previewIframe: null,
      writeProjectFile: async () => {},
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Mute track 1");
  });

  // The header derives its row from the GROUP-AWARE order (a synthetic anchor
  // row, members pulled contiguous); this function's own fallback derives it
  // from ascending element-bearing keys. Once a group exists those disagree, so
  // the same click announced "Mute track 2" and recorded "Mute track 1". The
  // clicked control passes the row it showed, and that is what gets recorded.
  it("records the display row the clicked control announced, not its own derivation", async () => {
    const files = new Map([
      ["index.html", `<div id="voiceover" data-start="0" data-duration="2"></div>`],
    ]);
    stubProjectFiles(files);

    const recordEdit = vi.fn();

    await toggleTimelineTrackHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [element({ id: "voiceover", domId: "voiceover", track: 0, tag: "audio" })],
      track: 0,
      hidden: true,
      // Row 2 in the header: the group's anchor row sits above this member.
      displayNumber: 2,
      previewIframe: null,
      writeProjectFile: async () => {},
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Mute track 2");
  });

  it("labels unmuting an audio-only track back on", async () => {
    const files = new Map([
      ["index.html", `<div id="voiceover" data-start="0" data-duration="2" data-hidden=""></div>`],
    ]);
    stubProjectFiles(files);

    const recordEdit = vi.fn();

    await toggleTimelineTrackHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [
        element({ id: "voiceover", domId: "voiceover", track: 0, tag: "audio", hidden: true }),
      ],
      track: 0,
      hidden: false,
      previewIframe: null,
      writeProjectFile: async () => {},
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Unmute track 1");
  });

  it("keeps Hide/Show wording for a mixed (audio + visual) track", async () => {
    const files = new Map([
      [
        "index.html",
        `<div id="voiceover" data-start="0" data-duration="2"></div>
<div id="caption" data-start="0" data-duration="2"></div>`,
      ],
    ]);
    stubProjectFiles(files);

    const recordEdit = vi.fn();

    await toggleTimelineTrackHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [
        element({ id: "voiceover", domId: "voiceover", track: 0, tag: "audio" }),
        element({ id: "caption", domId: "caption", track: 0, tag: "div" }),
      ],
      track: 0,
      hidden: true,
      previewIframe: null,
      writeProjectFile: async () => {},
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Hide track 1");
  });
});

describe("toggleTimelineElementHidden", () => {
  it("persists data-hidden for only the selected element and updates the player store", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const seek = vi.fn();
    const forceTimelineRebind = vi.fn();
    const win = iframe.contentWindow;
    if (!win) throw new Error("Expected iframe contentWindow");
    const playerWindow: Window & {
      __player?: { seek?: (time: number) => void };
      __hfForceTimelineRebind?: () => void;
    } = win;
    playerWindow.__player = { seek };
    playerWindow.__hfForceTimelineRebind = forceTimelineRebind;

    const files = new Map([
      [
        "index.html",
        `<div id="hero" data-start="0" data-duration="2"></div>
<div id="track-mate" data-start="1" data-duration="2"></div>`,
      ],
    ]);
    stubProjectFiles(files);

    const hero = element({ id: "hero", key: "index.html:#hero", domId: "hero", track: 0 });
    const trackMate = element({
      id: "track-mate",
      key: "index.html:#track-mate",
      domId: "track-mate",
      track: 0,
    });
    usePlayerStore.getState().setElements([hero, trackMate]);
    usePlayerStore.getState().setCurrentTime(1.25);

    const writes = new Map<string, string>();
    const recordEdit = vi.fn();

    const changedPaths = await toggleTimelineElementHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [hero, trackMate],
      elementKey: "index.html:#hero",
      hidden: true,
      previewIframe: iframe,
      writeProjectFile: async (path, content) => {
        writes.set(path, content);
      },
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(changedPaths).toEqual(["index.html"]);
    expect(writes.get("index.html")).toContain('id="hero" data-start="0" data-duration="2"');
    expect(writes.get("index.html")).toContain(
      'id="hero" data-start="0" data-duration="2" data-hidden=""',
    );
    expect(writes.get("index.html")).toContain(
      'id="track-mate" data-start="1" data-duration="2"></div>',
    );
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Hide element");
    expect(seek).toHaveBeenCalledWith(1.25);
    expect(forceTimelineRebind).toHaveBeenCalledTimes(1);
    expect(
      usePlayerStore.getState().elements.find((el) => el.key === "index.html:#hero")?.hidden,
    ).toBe(true);
    expect(
      usePlayerStore.getState().elements.find((el) => el.key === "index.html:#track-mate")?.hidden,
    ).toBeUndefined();
  });

  it("hides several elements in ONE atomic write when given an array of keys", async () => {
    const files = new Map([
      [
        "index.html",
        `<div id="hero" data-start="0" data-duration="2"></div>
<div id="caption" data-start="1" data-duration="2"></div>
<div id="badge" data-start="2" data-duration="2"></div>`,
      ],
    ]);
    stubProjectFiles(files);

    const hero = element({ id: "hero", key: "index.html:#hero", domId: "hero", track: 0 });
    const caption = element({
      id: "caption",
      key: "index.html:#caption",
      domId: "caption",
      track: 1,
    });
    const badge = element({ id: "badge", key: "index.html:#badge", domId: "badge", track: 2 });

    const writes: Array<{ path: string; content: string }> = [];
    const recordEdit = vi.fn();

    await toggleTimelineElementHidden({
      projectId: "project-1",
      activeCompPath: "index.html",
      timelineElements: [hero, caption, badge],
      elementKey: ["index.html:#hero", "index.html:#caption"],
      hidden: true,
      previewIframe: null,
      writeProjectFile: async (path, content) => {
        writes.push({ path, content });
      },
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    // One write carrying BOTH hides — per-element writes would clobber each
    // other (each starts from the original file content).
    expect(writes).toHaveLength(1);
    expect(writes[0]?.content).toContain(
      'id="hero" data-start="0" data-duration="2" data-hidden=""',
    );
    expect(writes[0]?.content).toContain(
      'id="caption" data-start="1" data-duration="2" data-hidden=""',
    );
    expect(writes[0]?.content).toContain('id="badge" data-start="2" data-duration="2"></div>');
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Hide 2 elements");
  });
});

describe("createAudioGroupAndAssignMembers", () => {
  it("writes data-audio-group on every member in ONE atomic edit and updates the player store", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    if (iframe.contentDocument) {
      iframe.contentDocument.body.innerHTML = `
        <audio id="narration"></audio>
        <audio id="interview-guest"></audio>
      `;
    }

    const files = new Map([
      [
        "index.html",
        `<audio id="narration" data-start="0" data-duration="5"></audio>
<audio id="interview-guest" data-start="10" data-duration="5"></audio>
<audio id="sfx-boom" data-start="0" data-duration="1"></audio>`,
      ],
    ]);
    stubProjectFiles(files);

    const narration = element({
      id: "narration",
      key: "index.html:#narration",
      domId: "narration",
      track: 0,
    });
    const guest = element({
      id: "interview-guest",
      key: "index.html:#interview-guest",
      domId: "interview-guest",
      track: 1,
    });
    usePlayerStore.getState().setElements([narration, guest]);

    const writes = new Map<string, string>();
    const recordEdit = vi.fn();

    const changedPaths = await createAudioGroupAndAssignMembers({
      projectId: "project-1",
      activeCompPath: "index.html",
      elements: [narration, guest],
      groupId: "voiceover",
      previewIframe: iframe,
      writeProjectFile: async (path, content) => {
        writes.set(path, content);
      },
      recordEdit,
      pendingTimelineEditPathRef: { current: new Set() },
    });

    expect(changedPaths).toEqual(["index.html"]);
    expect(
      iframe.contentDocument?.getElementById("narration")?.getAttribute("data-audio-group"),
    ).toBe("voiceover");
    expect(
      iframe.contentDocument?.getElementById("interview-guest")?.getAttribute("data-audio-group"),
    ).toBe("voiceover");
    // One write carrying BOTH members — per-element writes would clobber each
    // other (each starts from the original file content).
    expect(writes.get("index.html")).toContain(
      'id="narration" data-start="0" data-duration="5" data-audio-group="voiceover"',
    );
    expect(writes.get("index.html")).toContain(
      'id="interview-guest" data-start="10" data-duration="5" data-audio-group="voiceover"',
    );
    expect(writes.get("index.html")).toContain(
      'id="sfx-boom" data-start="0" data-duration="1"></audio>',
    );
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(recordEdit.mock.calls[0]?.[0]?.label).toBe("Group 2 voice clips");
    expect(
      usePlayerStore.getState().elements.find((el) => el.key === "index.html:#narration")
        ?.audioGroup,
    ).toBe("voiceover");
    expect(
      usePlayerStore.getState().elements.find((el) => el.key === "index.html:#interview-guest")
        ?.audioGroup,
    ).toBe("voiceover");
  });

  // The group element is what every LATER group write addresses — mute, the bus
  // fader's data-volume, an FX preset all go through
  // `buildPatchTarget({ domId: groupId })`. Membership alone parses, but leaves
  // a group nothing can edit.
  it("emits the group's own <hf-audio-group> element, patchable by its DOM id", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    if (iframe.contentDocument) {
      iframe.contentDocument.body.innerHTML = `
        <audio id="narration"></audio>
        <audio id="interview-guest"></audio>
      `;
    }
    const files = new Map([
      [
        "index.html",
        `<html><body>
<audio id="narration" data-start="0" data-duration="5"></audio>
<audio id="interview-guest" data-start="10" data-duration="5"></audio>
</body></html>`,
      ],
    ]);
    stubProjectFiles(files);

    const narration = element({ id: "narration", domId: "narration", track: 0 });
    const guest = element({ id: "interview-guest", domId: "interview-guest", track: 1 });
    usePlayerStore.getState().setElements([narration, guest]);

    const writes = new Map<string, string>();
    await createAudioGroupAndAssignMembers({
      projectId: "project-1",
      activeCompPath: "index.html",
      elements: [narration, guest],
      groupId: "voiceover",
      previewIframe: iframe,
      writeProjectFile: async (path, content) => {
        writes.set(path, content);
      },
      recordEdit: vi.fn(),
      pendingTimelineEditPathRef: { current: new Set() },
    });

    const written = writes.get("index.html") ?? "";
    expect(written).toContain('<hf-audio-group id="voiceover"></hf-audio-group>');
    // The actual contract: the group-attribute writer can now find a target.
    // This is the read that threw "Unable to patch element in index.html".
    expect(readTagSnippetByTarget(written, { id: "voiceover" })).toBeDefined();
    // ...and in the live preview, which is what patchLiveGroupAttribute reads
    // before the next reload.
    expect(iframe.contentDocument?.getElementById("voiceover")?.tagName.toLowerCase()).toBe(
      "hf-audio-group",
    );
    // Both members still resolve into it.
    expect(resolveAudioGroups(iframe.contentDocument as Document)[0]).toMatchObject({
      id: "voiceover",
      memberIds: ["narration", "interview-guest"],
    });
  });

  // Rejects rather than resolving empty: the carve's auto-group persists
  // `sources: [groupId]` once this resolves, so a silent no-op leaves the carve
  // pointing at a group that was never written — and stops ducking.
  it("rejects for fewer than two elements — grouping is a plural concept", async () => {
    const recordEdit = vi.fn();
    await expect(
      createAudioGroupAndAssignMembers({
        projectId: "project-1",
        activeCompPath: "index.html",
        elements: [element({ id: "narration", domId: "narration" })],
        groupId: "voiceover",
        previewIframe: null,
        writeProjectFile: async () => {},
        recordEdit,
        pendingTimelineEditPathRef: { current: new Set() },
      }),
    ).rejects.toThrow("a group needs at least two");
    expect(recordEdit).not.toHaveBeenCalled();
  });

  it("rejects a group id that is not safe to interpolate into markup or a path", async () => {
    await expect(
      createAudioGroupAndAssignMembers({
        projectId: "project-1",
        activeCompPath: "index.html",
        elements: [
          element({ id: "narration", domId: "narration" }),
          element({ id: "guest", domId: "guest" }),
        ],
        groupId: '../x"><script>',
        previewIframe: null,
        writeProjectFile: async () => {},
        recordEdit: vi.fn(),
        pendingTimelineEditPathRef: { current: new Set() },
      }),
    ).rejects.toThrow("Invalid audio group id");
  });

  it("reverts the optimistic live patch when the save fails", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    if (iframe.contentDocument) {
      iframe.contentDocument.body.innerHTML = `
        <audio id="narration"></audio>
        <audio id="interview-guest"></audio>
      `;
    }
    // No stubbed fetch: readFileContent's request will fail, forcing the
    // catch path.
    const narration = element({ id: "narration", domId: "narration" });
    const guest = element({ id: "interview-guest", domId: "interview-guest" });

    await expect(
      createAudioGroupAndAssignMembers({
        projectId: "project-1",
        activeCompPath: "index.html",
        elements: [narration, guest],
        groupId: "voiceover",
        previewIframe: iframe,
        writeProjectFile: async () => {},
        recordEdit: vi.fn(),
        pendingTimelineEditPathRef: { current: new Set() },
      }),
    ).rejects.toThrow();

    expect(
      iframe.contentDocument?.getElementById("narration")?.hasAttribute("data-audio-group"),
    ).toBe(false);
    expect(
      iframe.contentDocument?.getElementById("interview-guest")?.hasAttribute("data-audio-group"),
    ).toBe(false);
  });
});
