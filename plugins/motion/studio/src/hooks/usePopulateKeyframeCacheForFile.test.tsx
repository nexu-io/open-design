// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePopulateKeyframeCacheForFile } from "./useGsapTweenCache";
import { usePlayerStore } from "../player/store/playerStore";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function HookHost({ sourceFile = "index.html", version = 1 }) {
  usePopulateKeyframeCacheForFile("demo", sourceFile, version);
  return null;
}

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  usePlayerStore.setState({
    timelineProjectId: "demo",
    previewBooted: true,
    elements: [
      {
        id: "lab",
        tag: "div",
        start: 0,
        duration: 12,
        track: 1,
        compositionSrc: "compositions/keyframe-lab.html",
      },
    ] as never,
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  vi.unstubAllGlobals();
});

describe("usePopulateKeyframeCacheForFile", () => {
  it("loads every sub-composition file the timeline shows, not just the active one", async () => {
    // Keyframe lanes must be populated when the project opens. Fetching only the
    // active file left them empty until a clip from the sub-composition was
    // selected (which is the only thing that switched `sourceFile`).
    const urls: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      urls.push(String(input));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ animations: [] }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    act(() => {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      root.render(<HookHost />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(urls.some((u) => u.endsWith("/index.html"))).toBe(true);
    expect(urls.some((u) => u.includes("keyframe-lab.html"))).toBe(true);
  });

  it("keeps every covered file when the selection switches between them, and refetches all on new data", async () => {
    // Every click on a clip from another file flips `sourceFile`; a flip must not
    // re-read every composition file, or a multi-select pays files x clicks fetches.
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        urls.push(String(input));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ animations: [] }) });
      }),
    );
    const render = async (props: { sourceFile: string; version: number }) => {
      await act(async () => {
        if (!root) {
          container = document.createElement("div");
          document.body.appendChild(container);
          root = createRoot(container);
        }
        root.render(<HookHost {...props} />);
      });
      await act(async () => {
        await Promise.resolve();
      });
    };

    await render({ sourceFile: "index.html", version: 1 });
    const loaded = urls.length;
    await render({ sourceFile: "compositions/keyframe-lab.html", version: 1 });
    expect(urls.length).toBe(loaded);
    await render({ sourceFile: "index.html", version: 1 });
    expect(urls.length).toBe(loaded);

    await render({ sourceFile: "index.html", version: 2 });
    expect(urls.length).toBe(loaded * 2);
  });

  it("asks again for a covered file whose first read failed", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        const failed =
          url.includes("keyframe-lab.html") && urls.filter((u) => u === url).length === 1;
        return Promise.resolve({
          ok: !failed,
          json: () => Promise.resolve({ animations: [] }),
        });
      }),
    );
    const render = async (sourceFile: string) => {
      await act(async () => {
        if (!root) {
          container = document.createElement("div");
          document.body.appendChild(container);
          root = createRoot(container);
        }
        root.render(<HookHost sourceFile={sourceFile} />);
      });
      await act(async () => {
        await Promise.resolve();
      });
    };

    await render("index.html");
    const labReads = () => urls.filter((u) => u.includes("keyframe-lab.html")).length;
    expect(labReads()).toBe(1);
    await render("compositions/keyframe-lab.html");
    expect(labReads()).toBe(2);
    await render("index.html");
    expect(labReads()).toBe(2);
  });
});
