// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { thumbnailScheduler } from "../player/lib/thumbnailScheduler";
// By package name, as a host imports it: the test fails if the export goes.
import { useThumbnailStill, type ThumbnailStill } from "@hyperframes/studio";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 320;
  naturalHeight = 180;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const URL_ONE = "http://localhost:3000/api/projects/demo/thumbnail/index.html?t=1.00&revision=1";
const originalImage = globalThis.Image;
const originalFetch = globalThis.fetch;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let host: HTMLDivElement;
let root: Root | null = null;
let shown: ThumbnailStill | null = null;

function Still({ url }: { url: string | null }) {
  shown = useThumbnailStill(url, "demo");
  return null;
}

const mount = (url: string | null) =>
  act(async () => {
    root ??= createRoot(host);
    root.render(React.createElement(Still, { url }));
  });

beforeEach(() => {
  globalThis.Image = MockImage as unknown as typeof Image;
  globalThis.fetch = vi.fn(async () => new Response(new Blob(["still"]), { status: 200 }));
  URL.createObjectURL = vi.fn(() => "blob:still");
  URL.revokeObjectURL = vi.fn();
  shown = null;
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  thumbnailScheduler.setPreviewReloading(false);
  thumbnailScheduler.invalidateProject("demo");
  globalThis.Image = originalImage;
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  document.body.replaceChildren();
});

describe("useThumbnailStill", () => {
  it("hands back the still's object URL once the scheduler has loaded it", async () => {
    await mount(URL_ONE);
    expect(globalThis.fetch).toHaveBeenCalledWith(URL_ONE, expect.anything());
    await vi.waitFor(() => expect(shown).toEqual({ status: "ready", url: "blob:still" }));
  });

  it("hands back the same object while nothing changes", async () => {
    await mount(URL_ONE);
    await vi.waitFor(() => expect(shown).toEqual({ status: "ready", url: "blob:still" }));
    const first = shown;
    await mount(URL_ONE);
    expect(shown).toBe(first);
  });

  it("asks for nothing without a url", async () => {
    await mount(null);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(shown).toEqual({ status: "loading" });
  });

  it("says failed when the still cannot load, so a host can fall back", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 500 }));
    await mount(URL_ONE);
    await vi.waitFor(() => expect(shown).toEqual({ status: "failed" }));
  });

  it("holds the fetch while a preview reloads, and runs it once the reload is over", async () => {
    thumbnailScheduler.setPreviewReloading(true);
    await mount(URL_ONE);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(shown).toEqual({ status: "loading" });
    await act(async () => thumbnailScheduler.setPreviewReloading(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(shown).toEqual({ status: "ready", url: "blob:still" }));
  });
});
