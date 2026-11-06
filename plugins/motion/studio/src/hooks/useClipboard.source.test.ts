// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ensureHfIds } from "@hyperframes/parsers/hf-ids";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClipboard } from "./useClipboard";
import { usePlayerStore, type TimelineElement } from "../player";
import type { DomEditSelection } from "../components/editor/domEditing";
import { serializeStudioFileMutations } from "../utils/studioFileMutationCoordinator";

// Saved without hf-ids and with no element id: the preview stamps ids only in memory.
const SAVED = `<!doctype html><html><body>
<div data-composition-id="main" data-start="0" data-duration="10">
<h1 class="clip" data-start="2" data-duration="3" data-track-index="0">Title</h1>
</div></body></html>`;

const SUB = `<template id="sub-template"><div data-composition-id="sub" data-start="0" data-duration="4">
<h2 class="clip" data-start="1" data-duration="2" data-track-index="0">Sub</h2>
</div></template>`;

// What the runtime leaves on a clip while the playhead is before its start.
const RUNTIME_HIDE = "visibility: hidden; display: none; position: absolute";

function stampedHfId(source: string, selector: string): string {
  const doc = new DOMParser().parseFromString(ensureHfIds(source), "text/html");
  const roots = [doc, ...Array.from(doc.querySelectorAll("template"), (t) => t.content)];
  const el = roots.map((root) => root.querySelector(selector)).find(Boolean);
  return el?.getAttribute("data-hf-id") ?? "";
}

const TITLE_HF_ID = stampedHfId(SAVED, "h1");
const SUB_HF_ID = stampedHfId(SUB, "h2");

const TITLE: TimelineElement = {
  id: TITLE_HF_ID,
  hfId: TITLE_HF_ID,
  tag: "h1",
  start: 2,
  duration: 3,
  track: 0,
  authoredTrack: 0,
  sourceFile: "index.html",
};

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

// The preview page: the saved markup with the preview's in-memory ids, a sub-composition
// mounted inline, and the runtime's hide on both clips.
function mountPreview(
  sub: string,
  bundle: (host: Element) => void,
  saved = SAVED,
): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument as Document;
  doc.open();
  doc.write(ensureHfIds(saved));
  doc.close();
  const parsed = new DOMParser().parseFromString(ensureHfIds(sub), "text/html");
  const subRoot = (parsed.querySelector("template") as HTMLTemplateElement).content
    .firstElementChild;
  const host = doc.createElement("div");
  host.setAttribute("data-composition-src", "compositions/sub.html");
  host.append(doc.importNode(subRoot as Element, true));
  bundle(host);
  doc.querySelector('[data-composition-id="main"]')?.append(host);
  for (const clip of doc.querySelectorAll(".clip"))
    (clip as HTMLElement).style.cssText = RUNTIME_HIDE;
  return iframe;
}

function stubFiles(
  files: Record<string, string>,
  fail: { on: boolean },
  delayMs: Record<string, number>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = decodeURIComponent(String(url).split("/files/")[1] ?? "");
      // The server answers later, so a write that lands first is what the read sees.
      await new Promise((resolve) => setTimeout(resolve, delayMs[path] ?? 0));
      if (fail.on) return new Response("", { status: 500 });
      return new Response(JSON.stringify({ content: files[path] }));
    }),
  );
}

function mountClipboard(
  domSelection: DomEditSelection | null = null,
  sub = SUB,
  bundle: (host: Element) => void = () => {},
  saved = SAVED,
  view = { path: "index.html" },
) {
  const files: Record<string, string> = { "index.html": saved, "compositions/sub.html": sub };
  const fail = { on: false };
  const delayMs: Record<string, number> = {};
  const domEditSave = { pending: Promise.resolve() };
  const domSelectionRef = { current: domSelection };
  stubFiles(files, fail, delayMs);
  const iframe = mountPreview(sub, bundle, saved);
  const writes: string[] = [];
  const deleted: string[] = [];
  const writeProjectFile = async (_path: string, content: string) => {
    writes.push(content);
  };
  let api: ReturnType<typeof useClipboard> | null = null;
  function Harness() {
    api = useClipboard({
      projectId: "p",
      activeCompPath: view.path,
      domEditSelectionRef: domSelectionRef,
      showToast: () => {},
      writeProjectFile,
      recordEdit: async () => {},
      reloadPreview: () => {},
      handleTimelineElementsDelete: async (elements) => {
        deleted.push(...elements.map((el) => el.id));
        files["index.html"] = SAVED.replace(/<h1[\s\S]*<\/h1>/, "");
      },
      handleDomEditElementDelete: async () => {},
      previewIframeRef: { current: iframe },
      waitForPendingDomEditSaves: () => domEditSave.pending,
    });
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root?.render(React.createElement(Harness)));
  const clipboard = () => api as ReturnType<typeof useClipboard>;
  const rerender = () => act(() => root?.render(React.createElement(Harness)));
  return {
    rerender,
    clipboard,
    writes,
    deleted,
    files,
    fail,
    writeProjectFile,
    iframe,
    delayMs,
    domEditSave,
    domSelectionRef,
  };
}

function selectTitle() {
  usePlayerStore.setState({
    elements: [TITLE],
    selectedElementId: TITLE.id,
    selectedElementIds: new Set([TITLE.id]),
    currentTime: 6,
  });
}

function clearSelection() {
  usePlayerStore.setState({ selectedElementId: null, selectedElementIds: new Set() });
}

describe("copy takes a clip's saved markup, not the runtime's live styling", () => {
  it("pastes a timeline clip copied while hidden, matched through the preview's hf-id", async () => {
    selectTitle();
    const { clipboard, writes } = mountClipboard();
    expect(clipboard().handleCopy()).toBe(true);
    await clipboard().handlePaste();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain(">Title</h1>");
    expect(writes[0]).not.toContain("display: none");
    expect(writes[0]).not.toContain("visibility: hidden");
  });

  it("pastes a sub-composition clip copied while hidden, found inside its template", async () => {
    clearSelection();
    const selection = {
      hfId: SUB_HF_ID,
      selector: "h2",
      selectorIndex: 0,
      sourceFile: "compositions/sub.html",
    } as DomEditSelection;
    const { clipboard, writes } = mountClipboard(selection);
    expect(clipboard().handleCopy()).toBe(true);
    await clipboard().handlePaste();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain(">Sub</h2>");
    expect(writes[0]).not.toContain("display: none");
  });

  it("cuts only once the saved markup is read, and pastes it", async () => {
    selectTitle();
    const { clipboard, writes, deleted } = mountClipboard();
    await clipboard().handleCut();
    expect(deleted).toEqual([TITLE.id]);
    await clipboard().handlePaste();
    expect(writes[0]).toContain(">Title</h1>");
    expect(writes[0]).not.toContain("display: none");
  });

  it("reads a save still in flight when the copy starts", async () => {
    selectTitle();
    const { clipboard, writes, files, writeProjectFile } = mountClipboard();
    void serializeStudioFileMutations(writeProjectFile, ["index.html"], async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      // The host pins hf-ids on disk, so a Studio save keeps the clip's id.
      files["index.html"] = ensureHfIds(SAVED).replace(">Title<", ">Title v2<");
    });
    clipboard().handleCopy();
    await clipboard().handlePaste();
    expect(writes[0]?.match(/>Title v2<\/h1>/g)).toHaveLength(2);
    expect(writes[0]).not.toContain(">Title</h1>");
  });

  it("finds a clip by its id once its saved markup no longer hashes to the preview's hf-id", async () => {
    selectTitle();
    const { clipboard, writes, files, iframe } = mountClipboard();
    iframe.contentDocument?.querySelector("h1")?.setAttribute("id", "title");
    files["index.html"] = SAVED.replace("<h1 ", '<h1 id="title" ').replace(">Title<", ">Title v2<");
    clipboard().handleCopy();
    await clipboard().handlePaste();
    expect(writes[0]?.match(/>Title v2<\/h1>/g)).toHaveLength(2);
    expect(writes[0]).not.toContain("display: none");
  });
});

describe("copy of a clip missing from its saved file", () => {
  it("takes the preview's markup without its lazy loading or look-ahead mark, keeping authored loading", async () => {
    selectTitle();
    const { clipboard, writes, files, iframe } = mountClipboard();
    const title = iframe.contentDocument?.querySelector("h1") as Element;
    title.setAttribute("data-hf-upcoming", "");
    title.insertAdjacentHTML(
      "beforeend",
      '<img src="plate.png" loading="lazy" data-hf-preview-lazy><img src="own.png" loading="lazy">',
    );
    files["index.html"] = SAVED.replace(/<h1[\s\S]*<\/h1>/, "");
    clipboard().handleCopy();
    await clipboard().handlePaste();
    expect(writes[0]).toMatch(
      /<img src="plate.png" data-hf-id="[^"]+"><img src="own.png" loading="lazy"/,
    );
    expect(writes[0]).not.toContain("data-hf-preview-lazy");
    expect(writes[0]).not.toContain("data-hf-upcoming");
  });
});

const SUB_SELECTION = {
  hfId: SUB_HF_ID,
  selector: "h2",
  selectorIndex: 0,
  sourceFile: "compositions/sub.html",
} as DomEditSelection;

const copySubNext = ({ clipboard, domSelectionRef }: ReturnType<typeof mountClipboard>) => {
  clearSelection();
  domSelectionRef.current = SUB_SELECTION;
  clipboard().handleCopy();
};

const expectSubPastedAlone = (writes: string[]) => {
  expect(writes[0]).toContain(">Sub</h2>");
  expect(writes[0]?.match(/>Title<\/h1>/g)).toHaveLength(1);
};

describe("paste of an element styled by its id", () => {
  it("gives the copy the look its original has", async () => {
    clearSelection();
    const saved = SAVED.replace(
      "<body>",
      "<body><style>#badge { color: rgb(200, 30, 40); letter-spacing: 3px; }</style>",
    ).replace("</h1>", '</h1><p id="badge">New</p>');
    const selection = {
      hfId: stampedHfId(saved, "#badge"),
      selector: "#badge",
      selectorIndex: 0,
      sourceFile: "index.html",
    } as DomEditSelection;
    const { clipboard, writes } = mountClipboard(selection, SUB, () => {}, saved);
    clipboard().handleCopy();
    await clipboard().handlePaste();
    const page = document.createElement("iframe");
    document.body.appendChild(page);
    const doc = page.contentDocument as Document;
    doc.open();
    doc.write(writes[0] ?? "");
    doc.close();
    const look = (id: string) => {
      const style = (page.contentWindow as Window).getComputedStyle(
        doc.getElementById(id) as Element,
      );
      return { color: style.color, letterSpacing: style.letterSpacing };
    };
    expect(look("badge")).toEqual({ color: "rgb(200, 30, 40)", letterSpacing: "3px" });
    expect(look("badge-2")).toEqual(look("badge"));
  });
});

describe("copy of a sub-composition clip", () => {
  it("rebases its relative asset paths to the project root, as the preview does", async () => {
    clearSelection();
    const sub = SUB.replace(
      ">Sub<",
      '><img src="../assets/logo.png?v=2"><img src="logo.png"><img src="assets/shared.png">' +
        '<img src="../assets/100%.png"><span style="background: url(\'../fonts/My Font.woff2\')"></span>Sub<',
    );
    const selection = { ...SUB_SELECTION, hfId: stampedHfId(sub, "h2") };
    const { clipboard, writes } = mountClipboard(selection, sub, (host) => {
      const [up, sibling] = Array.from(host.querySelectorAll("img"));
      up?.setAttribute("src", "assets/logo.png?v=2");
      sibling?.setAttribute("src", "compositions/logo.png");
    });
    clipboard().handleCopy();
    await clipboard().handlePaste();
    expect(writes[0]).toContain('src="assets/logo.png?v=2"');
    expect(writes[0]).toContain('src="compositions/logo.png"');
    expect(writes[0]).toContain('src="assets/shared.png"');
    expect(writes[0]).toContain('src="assets/100%.png"');
    expect(writes[0]).toContain("url('fonts/My Font.woff2')");
    expect(writes[0]).not.toContain("../");
    expect(writes[0]).not.toContain("display: none");
  });
});

describe("copy order", () => {
  it("waits for a DOM edit save still in flight", async () => {
    selectTitle();
    const { clipboard, writes, files, domEditSave } = mountClipboard();
    domEditSave.pending = new Promise((resolve) =>
      setTimeout(() => {
        files["index.html"] = ensureHfIds(SAVED).replace(">Title<", ">Title v2<");
        resolve();
      }, 5),
    );
    clipboard().handleCopy();
    await clipboard().handlePaste();
    expect(writes[0]?.match(/>Title v2<\/h1>/g)).toHaveLength(2);
  });

  it("still copies after a DOM edit save failed", async () => {
    selectTitle();
    const { clipboard, writes, domEditSave } = mountClipboard();
    domEditSave.pending = Promise.reject(new Error("save conflict"));
    domEditSave.pending.catch(() => {});
    clipboard().handleCopy();
    await clipboard().handlePaste();
    expect(writes[0]?.match(/>Title<\/h1>/g)).toHaveLength(2);
  });

  it("pastes the second of two copies", async () => {
    selectTitle();
    const view = mountClipboard();
    view.clipboard().handleCopy();
    await new Promise((resolve) => setTimeout(resolve, 10));
    copySubNext(view);
    await view.clipboard().handlePaste();
    expectSubPastedAlone(view.writes);
  });

  it("pastes the later copy even when the earlier copy's read lands last", async () => {
    selectTitle();
    const view = mountClipboard();
    view.delayMs["index.html"] = 20;
    view.clipboard().handleCopy();
    copySubNext(view);
    await new Promise((resolve) => setTimeout(resolve, 40));
    view.delayMs["index.html"] = 0;
    await view.clipboard().handlePaste();
    expectSubPastedAlone(view.writes);
  });

  it("duplicates a hidden clip with its saved markup", async () => {
    selectTitle();
    const { clipboard, writes } = mountClipboard();
    await clipboard().handleDuplicate();
    expect(writes[0]?.match(/>Title<\/h1>/g)).toHaveLength(2);
    expect(writes[0]).not.toContain("display: none");
  });
});

describe("a copy in place, as the canvas makes one", () => {
  // The copy's start and track: the saved original has no data-hf-id, its copy is minted one.
  const copyAt = (html: string | undefined) => {
    const copy = html?.match(/<h1[^>]*data-hf-id[^>]*>Title<\/h1>/)?.[0] ?? "";
    return [copy.match(/data-start="([^"]*)"/)?.[1], copy.match(/data-track-index="([^"]*)"/)?.[1]];
  };

  it("duplicates at the clip's own time, on the next free track", async () => {
    selectTitle();
    const { clipboard, writes } = mountClipboard();
    await clipboard().handleDuplicate({ inPlace: true });
    expect(copyAt(writes[0])).toEqual(["2", "1"]);
  });

  it("pastes at the copied clip's time, not the playhead's", async () => {
    selectTitle();
    const { clipboard, writes } = mountClipboard();
    clipboard().handleCopy();
    await clipboard().handlePaste({ inPlace: true });
    expect(copyAt(writes[0])).toEqual(["2", "1"]);
  });

  // Host at 2 s: the clip's local 1-3 s shows as a 3-5 s master row, the clock the film's own timeline has.
  const SUB_CLIP: TimelineElement = {
    id: SUB_HF_ID,
    hfId: SUB_HF_ID,
    tag: "h2",
    start: 3,
    duration: 2,
    track: 0,
    authoredTrack: 0,
    sourceFile: "compositions/sub.html",
    parentCompositionStart: 2,
  };
  const pastedSubStarts = (html: string | undefined) =>
    [...(html ?? "").matchAll(/<h2[^>]*data-hf-id[^>]*data-start="([^"]+)"/g)].map((m) => m[1]);
  const mountSubClip = (currentTime = 0, view = { path: "index.html" }) => {
    usePlayerStore.setState({
      elements: [TITLE, SUB_CLIP],
      selectedElementId: SUB_CLIP.id,
      selectedElementIds: new Set([SUB_CLIP.id]),
      currentTime,
    });
    return mountClipboard(null, SUB, (host) => host.setAttribute("data-start", "2"), SAVED, view);
  };

  it("pastes a sub-composition's clip into the film at the moment the film shows it", async () => {
    const { clipboard, writes } = mountSubClip(7);
    clipboard().handleCopy();
    await clipboard().handlePaste({ inPlace: true });
    expect(pastedSubStarts(writes[0])).toEqual(["3"]);
  });

  it("duplicates a sub-composition's clip at its own local time, on another track", async () => {
    const { clipboard, writes } = mountSubClip();
    await clipboard().handleDuplicate({ inPlace: true });
    const copy = /<h2[^>]*data-hf-id[^>]*>/.exec(writes[0] ?? "")?.[0] ?? "";
    expect(copy).toContain('data-start="1"');
    expect(copy).toContain('data-track-index="1"');
  });

  it("pastes at the playhead once the edited composition is another, whose clock differs", async () => {
    const view = { path: "index.html" };
    const { clipboard, writes, rerender } = mountSubClip(0.5, view);
    clipboard().handleCopy();
    view.path = "compositions/sub.html";
    rerender();
    await clipboard().handlePaste({ inPlace: true });
    expect(pastedSubStarts(writes[0])).toEqual(["0.5"]);
  });
});

describe("duplicate of a clip inside a sub-composition", () => {
  it("writes the copy at local time right after the original", async () => {
    // Host at 2 s, so the clip's local 1-3 s shows as a 3-5 s master row.
    const sub: TimelineElement = {
      id: SUB_HF_ID,
      hfId: SUB_HF_ID,
      tag: "h2",
      start: 3,
      duration: 2,
      track: 0,
      authoredTrack: 0,
      sourceFile: "compositions/sub.html",
      parentCompositionStart: 2,
    };
    usePlayerStore.setState({
      elements: [TITLE, sub],
      selectedElementId: sub.id,
      selectedElementIds: new Set([sub.id]),
    });
    const { clipboard, writes } = mountClipboard(null, SUB, (host) =>
      host.setAttribute("data-start", "2"),
    );
    await clipboard().handleDuplicate();
    const starts = [...(writes[0] ?? "").matchAll(/<h2[^>]*data-start="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(starts.sort()).toEqual(["1", "3"]);
  });

  it("moves the copy off a lane its own file already fills right after the original", async () => {
    // Host at 10 s: the clip is local 1-3 (master 11-13); its neighbour is local 3-5,
    // exactly where the copy lands, so the lane check must compare in local time.
    const sub: TimelineElement = {
      id: SUB_HF_ID,
      hfId: SUB_HF_ID,
      tag: "h2",
      start: 11,
      duration: 2,
      track: 0,
      authoredTrack: 0,
      sourceFile: "compositions/sub.html",
      parentCompositionStart: 10,
    };
    const neighbour: TimelineElement = { ...sub, id: "next", hfId: "next", start: 13 };
    usePlayerStore.setState({
      elements: [TITLE, sub, neighbour],
      selectedElementId: sub.id,
      selectedElementIds: new Set([sub.id]),
    });
    const { clipboard, writes } = mountClipboard(null, SUB, (host) =>
      host.setAttribute("data-start", "10"),
    );
    await clipboard().handleDuplicate();
    const copy = /<h2[^>]*data-start="3"[^>]*>/.exec(writes[0] ?? "")?.[0] ?? "";
    expect(copy).toContain('data-track-index="1"');
  });
});

describe("a copy that fails", () => {
  it("leaves the previous copy on the clipboard", async () => {
    selectTitle();
    const { clipboard, writes, fail } = mountClipboard();
    clipboard().handleCopy();
    await new Promise((resolve) => setTimeout(resolve, 10));
    fail.on = true;
    clipboard().handleCopy();
    await new Promise((resolve) => setTimeout(resolve, 10));
    fail.on = false;
    await clipboard().handlePaste();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain(">Title</h1>");
  });

  it("deletes nothing on a cut", async () => {
    selectTitle();
    const { clipboard, deleted, fail } = mountClipboard();
    fail.on = true;
    expect(await clipboard().handleCut()).toBe(false);
    expect(deleted).toEqual([]);
  });
});

describe("with no DOM edit session", () => {
  it("refuses copy, cut and duplicate when nothing is selected", async () => {
    clearSelection();
    const { clipboard, deleted } = mountClipboard();
    expect(clipboard().handleCopy()).toBe(false);
    expect(await clipboard().handleCut()).toBe(false);
    expect(await clipboard().handleDuplicate()).toBe(false);
    expect(deleted).toEqual([]);
  });
});
