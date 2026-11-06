// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  audioPillFlags,
  expandToLinkedMembers,
  dropMisalignedTrimPartners,
  linkedGestureKeys,
  linkedMembersOf,
  mediaAssetIdentity,
} from "./audioClipLink";
import { createTimelineElementFromManifestClip, parseTimelineFromDOM } from "../lib/timelineDOM";

const video = { id: "talk", link: "lk-1" };
const audio = { id: "talk-audio", link: "lk-1" };
const other = { id: "music", link: "lk-2" };
const otherAudio = { id: "music-audio", link: "lk-2" };
const plain = { id: "title" };
const elements = [video, audio, other, otherAudio, plain];

describe("audioPillFlags", () => {
  it("greys a hidden clip and a muted group", () => {
    expect(audioPillFlags({ hidden: true }).muted).toBe(true);
    expect(audioPillFlags({ audioGroupHidden: true }).muted).toBe(true);
  });
});

describe("mediaAssetIdentity", () => {
  it("tells same-named files in different folders apart", () => {
    expect(mediaAssetIdentity({ src: "assets/one/talk.mp4" })).not.toBe(
      mediaAssetIdentity({ src: "assets/two/talk.mp4" }),
    );
  });

  it("resolves a src against its own source file and drops query and hash", () => {
    expect(mediaAssetIdentity({ src: "../assets/talk.mp4?v=2", sourceFile: "scenes/a.html" })).toBe(
      mediaAssetIdentity({ src: "./assets/talk.mp4#t=1" }),
    );
    expect(mediaAssetIdentity({ src: "assets/City%20Ride.mp4" })).toBe(
      mediaAssetIdentity({ src: "assets/City Ride.mp4" }),
    );
    expect(mediaAssetIdentity({ src: "" })).toBeNull();
  });

  it("keeps a remote url's query, since it can select a different file", () => {
    expect(mediaAssetIdentity({ src: "https://cdn.example.com/v.mp4?id=1" })).not.toBe(
      mediaAssetIdentity({ src: "https://cdn.example.com/v.mp4?id=2" }),
    );
    expect(mediaAssetIdentity({ src: "https://cdn.example.com/v.mp4?clip=a%26x=b" })).not.toBe(
      mediaAssetIdentity({ src: "https://cdn.example.com/v.mp4?clip=a&x=b" }),
    );
    expect(mediaAssetIdentity({ src: "https://cdn.example.com/v.mp4%3Fclip=a" })).not.toBe(
      mediaAssetIdentity({ src: "https://cdn.example.com/v.mp4?clip=a" }),
    );
    expect(mediaAssetIdentity({ src: "https://cdn.example.com/v.mp4?id=1#t=3" })).toBe(
      mediaAssetIdentity({ src: "https://cdn.example.com/v.mp4?id=1" }),
    );
  });
});

describe("expandToLinkedMembers", () => {
  it("adds every partner of a linked clip", () => {
    expect(expandToLinkedMembers(["talk"], elements)).toEqual(new Set(["talk", "talk-audio"]));
  });

  it("leaves unlinked clips alone and does not pull in other groups", () => {
    expect(expandToLinkedMembers(["title"], elements)).toEqual(new Set(["title"]));
    expect(expandToLinkedMembers(["talk-audio", "title"], elements)).toEqual(
      new Set(["talk-audio", "talk", "title"]),
    );
  });

  it("prefers the store key over the id", () => {
    const keyed = [
      { id: "a", key: "k-a", link: "lk-9" },
      { id: "b", key: "k-b", link: "lk-9" },
    ];
    expect(expandToLinkedMembers(["k-a"], keyed)).toEqual(new Set(["k-a", "k-b"]));
  });
});

describe("link groups stay inside their composition", () => {
  const root = [
    { id: "v", link: "lk-1", sourceFile: undefined },
    { id: "a", link: "lk-1", sourceFile: undefined },
  ];
  const child = [
    { id: "cv", key: "child.html#cv", link: "lk-1", sourceFile: "child.html" },
    { id: "ca", key: "child.html#ca", link: "lk-1", sourceFile: "child.html" },
  ];
  const all = [...root, ...child];

  it("does not pull a child file's same-id link into the root group", () => {
    expect(linkedMembersOf(root[0] ?? video, all).map((el) => el.id)).toEqual(["v", "a"]);
    expect(expandToLinkedMembers(["child.html#cv"], all)).toEqual(
      new Set(["child.html#cv", "child.html#ca"]),
    );
  });

  const media = (id: string, tag: string, start: number) =>
    `<${tag} id="${id}" class="clip" src="${id}.mp4" data-link="lk-1" data-start="${start}" data-duration="4"></${tag}>`;
  const inlineDoc = () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<div data-composition-id="main" data-duration="20">
      ${media("v", "video", 0)}${media("a", "audio", 0)}
      <div id="child" data-composition-id="child" data-start="0" data-duration="10">
        ${media("cv", "video", 5)}${media("ca", "audio", 5)}
      </div>
    </div>`;
    return doc;
  };

  it("does not pull an inline composition's same-id link into the root group", () => {
    const rows = parseTimelineFromDOM(inlineDoc(), 20).filter((row) => row.link);
    const byId = (id: string) => rows.find((row) => row.domId === id) ?? video;
    expect(linkedMembersOf(byId("v"), rows).map((row) => row.domId)).toEqual(["v", "a"]);
    expect(linkedMembersOf(byId("cv"), rows).map((row) => row.domId)).toEqual(["cv", "ca"]);
  });

  it("keeps the inline composition apart on rows built from the runtime manifest", () => {
    const doc = inlineDoc();
    const rows = ["v", "a", "cv", "ca"].map((id, fallbackIndex) =>
      createTimelineElementFromManifestClip({
        clip: {
          ...{ id, label: id, start: 0, duration: 4, track: 0, kind: "video", tagName: "video" },
          ...{
            compositionId: null,
            parentCompositionId: null,
            compositionSrc: null,
            assetUrl: null,
          },
        },
        fallbackIndex,
        doc,
        hostEl: doc.getElementById(id),
      }),
    );
    const [rootVideo] = rows;
    expect(linkedMembersOf(rootVideo ?? video, rows).map((row) => row.domId)).toEqual(["v", "a"]);
  });
});

describe("linkedMembersOf", () => {
  it("returns the group, or the clip alone when unlinked", () => {
    expect(linkedMembersOf(video, elements).map((el) => el.id)).toEqual(["talk", "talk-audio"]);
    expect(linkedMembersOf(plain, elements)).toEqual([plain]);
  });
});

describe("linkedGestureKeys", () => {
  it("drags an unselected linked clip with its partner", () => {
    expect(linkedGestureKeys(new Set(["title"]), video, elements, false)).toEqual(
      new Set(["talk", "talk-audio"]),
    );
  });

  it("keeps a selection that holds the grabbed clip and adds partners", () => {
    expect(linkedGestureKeys(new Set(["talk", "title"]), video, elements, false)).toEqual(
      new Set(["talk", "talk-audio", "title"]),
    );
  });

  it("Linked Selection off edits the grabbed clip alone without Alt", () => {
    expect(linkedGestureKeys(new Set(["talk"]), video, elements, false, false)).toEqual(
      new Set(["talk"]),
    );
  });

  it("Alt edits the grabbed clip alone", () => {
    expect(linkedGestureKeys(new Set(["talk", "talk-audio"]), video, elements, true)).toEqual(
      new Set(["talk"]),
    );
  });
});

describe("selectClipWithLinks", () => {
  const linkedPair = [
    { id: "talk", tag: "video", start: 0, duration: 4, track: 0, link: "lk-1" },
    { id: "talk-audio", tag: "audio", start: 0, duration: 4, track: 1, link: "lk-1" },
    { id: "title", tag: "div", start: 0, duration: 4, track: 2 },
  ];

  async function store() {
    const { usePlayerStore } = await import("../store/playerStore");
    const { selectClipWithLinks } = await import("./timelineLinkSelection");
    usePlayerStore.getState().setElements(linkedPair);
    const click = (key: string, alt = false) =>
      selectClipWithLinks(key, alt, usePlayerStore.getState().setSelectedElementId);
    return { usePlayerStore, click };
  }

  it("a click selects the whole pair; Alt-click then narrows to one member", async () => {
    const { usePlayerStore, click } = await store();
    click("talk");
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["talk", "talk-audio"]));
    click("talk-audio", true);
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["talk-audio"]));
  });

  it("a plain click collapses a larger selection to the clicked clip's link group", async () => {
    const { usePlayerStore, click } = await store();
    usePlayerStore.getState().setSelection(["talk", "talk-audio", "title"], "title");
    click("talk");
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["talk", "talk-audio"]));
    expect(usePlayerStore.getState().selectedElementId).toBe("talk");
  });
});

describe("toggleClipWithLinks", () => {
  const clips = [
    { id: "talk", tag: "video", start: 0, duration: 4, track: 0, link: "lk-1" },
    { id: "talk-audio", tag: "audio", start: 0, duration: 4, track: 1, link: "lk-1" },
    { id: "title", tag: "div", start: 0, duration: 4, track: 2 },
    { id: "music", tag: "audio", start: 0, duration: 4, track: 3 },
  ];

  async function store() {
    const { usePlayerStore } = await import("../store/playerStore");
    const { toggleClipWithLinks } = await import("./timelineLinkSelection");
    usePlayerStore.getState().setElements(clips);
    usePlayerStore.getState().setSelection(["title"], "title");
    return { usePlayerStore, toggle: toggleClipWithLinks };
  }

  it("adds an unlinked clip to the selection and makes it primary", async () => {
    const { usePlayerStore, toggle } = await store();
    expect(toggle("music", false)?.id).toBe("music");
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["title", "music"]));
    expect(usePlayerStore.getState().selectedElementId).toBe("music");
  });

  it("adding a linked clip adds its partner too", async () => {
    const { usePlayerStore, toggle } = await store();
    toggle("talk-audio", false);
    expect(usePlayerStore.getState().selectedElementIds).toEqual(
      new Set(["title", "talk", "talk-audio"]),
    );
  });

  it("toggling a selected clip removes it and its partner, keeping the rest", async () => {
    const { usePlayerStore, toggle } = await store();
    toggle("talk", false);
    expect(toggle("talk", false)?.id).toBe("title");
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["title"]));
    expect(toggle("title", false)).toBeNull();
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set());
  });

  it("Alt adds only the clicked member of a linked pair", async () => {
    const { usePlayerStore, toggle } = await store();
    toggle("talk", true);
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["title", "talk"]));
  });
});

describe("Linked Selection off", () => {
  const linkedPair = [
    { id: "talk", tag: "video", start: 0, duration: 4, track: 0, link: "lk-1" },
    { id: "talk-audio", tag: "audio", start: 0, duration: 4, track: 1, link: "lk-1" },
  ];

  it("expands and lists nothing past the clip itself", () => {
    expect(expandToLinkedMembers(["talk"], linkedPair, false)).toEqual(new Set(["talk"]));
    expect(linkedMembersOf(linkedPair[0], linkedPair, false)).toEqual([linkedPair[0]]);
  });

  it("a click selects only the clicked clip", async () => {
    const { usePlayerStore } = await import("../store/playerStore");
    const { selectClipWithLinks } = await import("./timelineLinkSelection");
    const { useLinkedClipPreferences } = await import("../../utils/linkedClipPreferences");
    usePlayerStore.getState().setElements(linkedPair);
    useLinkedClipPreferences.getState().setLinkedSelection(false);
    try {
      selectClipWithLinks("talk", false, usePlayerStore.getState().setSelectedElementId);
      expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["talk"]));
    } finally {
      useLinkedClipPreferences.getState().setLinkedSelection(true);
    }
  });
});

describe("dropMisalignedTrimPartners", () => {
  const v = { id: "v", link: "lk", start: 2, duration: 6 };
  const a = { id: "a", link: "lk", start: 3, duration: 5 };
  const keys = new Set(["v", "a"]);
  it("keeps a partner whose grabbed edge is at the same time", () => {
    expect(dropMisalignedTrimPartners(keys, v, [v, a], "end")).toEqual(keys);
  });
  it("trims only the grabbed clip when the partner's edge is elsewhere", () => {
    expect(dropMisalignedTrimPartners(keys, v, [v, a], "start")).toEqual(new Set(["v"]));
  });
});
