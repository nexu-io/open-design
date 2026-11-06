// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ensureHfIds } from "@hyperframes/parsers/hf-ids";
import { runtimeProtocolMetadata } from "@hyperframes/core/runtime/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { useElementPicker } from "./useElementPicker";

// As the host leaves it on disk: hf-ids pinned, no element ids.
const SAVED = ensureHfIds(`<!doctype html><html><body>
<div data-composition-id="main" data-start="0" data-duration="10">
<h1 class="clip" data-start="2" data-duration="3" data-track-index="0">Title</h1>
</div></body></html>`);

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

// The runtime's element-picked message, posted by `from`.
const picked = (from: Window | null, selector: string) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        source: from,
        data: {
          source: "hf-preview",
          type: "element-picked",
          elementInfo: { selector, tagName: "h1" },
          ...runtimeProtocolMetadata(30),
        },
      }),
    );
  });

// The preview page: the saved markup plus what the runtime adds to it.
function mountPreview(mounted = ""): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument as Document;
  doc.open();
  doc.write(SAVED);
  doc.close();
  (doc.querySelector("h1") as HTMLElement).style.cssText = "visibility: hidden; display: none";
  doc.body.append(Object.assign(doc.createElement("script"), { textContent: "/* runtime */" }));
  doc.body.insertAdjacentHTML("beforeend", mounted);
  return iframe;
}

function mountPicker(
  files: Record<string, string>,
  selector = "h1",
  mounted = "",
  hostAppliesWrites = true,
) {
  const iframe = mountPreview(mounted);
  const synced: Record<string, string>[] = [];
  let api: ReturnType<typeof useElementPicker> | null = null;
  let setHostFiles: (next: Record<string, string>) => void = () => {};
  // Like a Studio host: it holds the files in state and rerenders after each write.
  function Harness() {
    const [workspaceFiles, setFiles] = useState(files);
    setHostFiles = setFiles;
    api = useElementPicker(
      { current: iframe },
      {
        workspaceFiles,
        onSyncFiles: (changed) => {
          synced.push(changed);
          if (hostAppliesWrites) setFiles((prev) => ({ ...prev, ...changed }));
        },
      },
    );
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root?.render(React.createElement(Harness)));
  picked(iframe.contentWindow, selector);
  const picker = () => api as ReturnType<typeof useElementPicker>;
  return {
    picker,
    synced,
    setHostFiles: (next: Record<string, string>) => act(() => setHostFiles(next)),
  };
}

describe("an edit to a picked element without an id", () => {
  it("writes only that edit into the saved file", () => {
    const { picker, synced } = mountPicker({ "index.html": SAVED });
    expect(picker().pickedElement?.selector).toBe("h1");
    act(() => picker().setStyle("color", "red"));
    expect(synced).toHaveLength(1);
    const written = synced[0]?.["index.html"] ?? "";
    expect(written).toMatch(/<h1 [^>]*style="color: red"[^>]*>Title<\/h1>/);
    expect(written).not.toContain("display: none");
    expect(written).not.toContain("/* runtime */");
  });

  it("persists a text edit", () => {
    const { picker, synced } = mountPicker({ "index.html": SAVED });
    act(() => picker().setTextContent("Hello"));
    expect(synced[0]?.["index.html"]).toMatch(/>Hello<\/h1>/);
  });

  // The same h1 in index.html and compositions/b.html, so both carry one hf-id.
  const SUB = ensureHfIds(`<template><div data-composition-id="b">
<h1 class="clip" data-start="2" data-duration="3" data-track-index="0">Title</h1>
</div></template>`);
  const subH1 = new DOMParser()
    .parseFromString(SUB, "text/html")
    .querySelector("template")
    ?.content.querySelector("h1");
  const host = `<div data-composition-file="compositions/b.html">${subH1?.outerHTML}</div>`;

  it.each([
    ["index.html first", { "index.html": SAVED, "compositions/b.html": SUB }],
    ["the sub-composition first", { "compositions/b.html": SUB, "index.html": SAVED }],
  ])("writes a twin element into its own file (%s)", (_order, files) => {
    expect(SAVED).toContain(`data-hf-id="${subH1?.getAttribute("data-hf-id")}"`);
    const inSub = mountPicker(files, "[data-composition-file] h1", host);
    act(() => inSub.picker().setStyle("color", "red"));
    expect(inSub.synced.map((changed) => Object.keys(changed))).toEqual([["compositions/b.html"]]);
    act(() => root?.unmount());
    const inRoot = mountPicker(files, "h1", host);
    act(() => inRoot.picker().setStyle("color", "red"));
    expect(inRoot.synced.map((changed) => Object.keys(changed))).toEqual([["index.html"]]);
  });

  it("keeps both of two edits made before the host rerenders", () => {
    const { picker, synced } = mountPicker({ "index.html": SAVED });
    act(() => {
      picker().setStyle("color", "red");
      picker().setStyle("background", "blue");
    });
    expect(synced.at(-1)?.["index.html"]).toMatch(/<h1 [^>]*style="color: red; background: blue"/);
  });

  it("builds the next edit on a file the host changed meanwhile", () => {
    const { picker, synced, setHostFiles } = mountPicker({ "index.html": SAVED });
    act(() => picker().setStyle("color", "red"));
    setHostFiles({ "index.html": SAVED.replace(">Title<", ">Renamed<") });
    act(() => picker().setStyle("background", "blue"));
    const written = synced.at(-1)?.["index.html"] ?? "";
    expect(written).toContain(">Renamed</h1>");
    expect(written).not.toContain("color: red");
  });

  it("builds the next edit on the host's undo", () => {
    const { picker, synced, setHostFiles } = mountPicker({ "index.html": SAVED });
    act(() => picker().setStyle("color", "red"));
    setHostFiles({ "index.html": SAVED });
    act(() => picker().setStyle("background", "blue"));
    expect(synced.at(-1)?.["index.html"]).not.toContain("color: red");
  });

  it("keeps later edits while the host has applied only the first", () => {
    const { picker, synced, setHostFiles } = mountPicker({ "index.html": SAVED }, "h1", "", false);
    act(() => {
      picker().setStyle("color", "red");
      picker().setStyle("background", "blue");
    });
    setHostFiles(synced[0] as Record<string, string>);
    act(() => picker().setStyle("border", "0"));
    expect(synced.at(-1)?.["index.html"]).toMatch(
      /style="color: red; background: blue; border: 0"/,
    );
  });

  it("writes nothing when no saved file holds the element", () => {
    const { picker, synced } = mountPicker({ "index.html": "<div>other</div>" });
    act(() => picker().setStyle("color", "red"));
    expect(synced).toEqual([]);
  });
});

describe("a pick across a reload that swaps the preview frame", () => {
  function mountSwapping() {
    const live = mountPreview();
    const ref: { current: HTMLIFrameElement | null } = { current: live };
    let api: ReturnType<typeof useElementPicker> | null = null;
    function Harness() {
      api = useElementPicker(ref);
      return null;
    }
    root = createRoot(document.createElement("div"));
    act(() => root?.render(React.createElement(Harness)));
    return { live, ref, picker: () => api as ReturnType<typeof useElementPicker> };
  }

  it("keeps a pick posted by the frame it was made in after a new frame took its place", () => {
    const { live, ref, picker } = mountSwapping();
    picked(live.contentWindow, "h1");
    act(() => picker().clearPick());
    // The reload promotes its frame before the old frame's pick message is handled.
    const old = live.contentWindow;
    ref.current = mountPreview();
    live.remove();
    picked(old, "h1.next");
    expect(picker().pickedElement?.selector).toBe("h1.next");
  });

  it("does not keep trusting a zoomed frame once the zoom is gone", () => {
    const { picker } = mountSwapping();
    const zoom = mountPreview();
    act(() => picker().setActiveIframe(zoom));
    picked(zoom.contentWindow, "h1");
    expect(picker().pickedElement?.selector).toBe("h1");
    act(() => picker().setActiveIframe(null));
    picked(zoom.contentWindow, "h1.late");
    expect(picker().pickedElement?.selector).toBe("h1");
  });

  it("still ignores a frame it never showed", () => {
    const { picker } = mountSwapping();
    const stranger = mountPreview();
    picked(stranger.contentWindow, "h1");
    expect(picker().pickedElement).toBeNull();
  });
});
