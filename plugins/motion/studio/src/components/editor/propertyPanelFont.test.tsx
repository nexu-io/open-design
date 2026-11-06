// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FontFamilyField } from "./propertyPanelFont";
import { sortFontOptions } from "./propertyPanelHelpers";

vi.mock("./propertyPanelHelpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./propertyPanelHelpers")>();
  return {
    ...actual,
    sortFontOptions: vi.fn(actual.sortFontOptions),
    uniqueFontFamilies: vi.fn(actual.uniqueFontFamilies),
  };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The font APIs are stubbed and every family is off the Google lists, so no test reaches the network.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ fonts: url.includes("google") ? ["Roboto Slab"] : ["Arial"] }),
    })),
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("FontFamilyField flat trigger", () => {
  it("renders as a label/value row with a trailing dropdown caret, no boxed border", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(<FontFamilyField flat value="Georgia" importedFonts={[]} onCommit={vi.fn()} />);
    });
    const trigger = host.querySelector<HTMLButtonElement>('[data-flat-font-trigger="true"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.className).not.toContain("border-neutral-800");
    expect(host.textContent).toContain("Georgia");
    act(() => root.unmount());
  });
});

describe("FontFamilyField font list", () => {
  it("builds the list only while the dropdown is open", async () => {
    vi.mocked(sortFontOptions).mockClear();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (value: string) =>
      root.render(<FontFamilyField flat value={value} importedFonts={[]} onCommit={vi.fn()} />);
    try {
      await act(async () => render("Arial"));
      // The value changes while the dropdown is closed, as during a drag.
      await act(async () => render("Georgia"));
      expect(sortFontOptions).not.toHaveBeenCalled();

      const trigger = host.querySelector<HTMLButtonElement>('[data-flat-font-trigger="true"]');
      await act(async () => trigger?.click());
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(sortFontOptions).toHaveBeenCalled();
      expect(host.textContent).toContain("Roboto Slab");
      expect(document.head.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});

describe("FontFamilyField session font lists", () => {
  const fresh = async () => {
    vi.resetModules();
    const { FontFamilyField } = await import("./propertyPanelFont");
    const { uniqueFontFamilies } = await import("./propertyPanelHelpers");
    const loop = await import("./overlayFrameLoop");
    vi.mocked(uniqueFontFamilies).mockClear();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (value: string) =>
      root.render(<FontFamilyField flat value={value} importedFonts={[]} onCommit={vi.fn()} />);
    const toggle = () =>
      host.querySelector<HTMLButtonElement>('[data-flat-font-trigger="true"]')?.click();
    const done = () => {
      act(() => root.unmount());
      host.remove();
      loop.resetOverlayFrameLoopForTests();
    };
    return { uniqueFontFamilies, loop, host, render, toggle, done };
  };

  it("does no list work in a drag's frames when the lists land mid-drag", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame;
    const lists = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return lists(url);
    });
    const t = await fresh();
    const stopLoop = t.loop.subscribeOverlayFrame(() => undefined);
    try {
      await act(async () => t.render("Georgia"));
      for (let elapsed = 0; elapsed < 600; elapsed += 16) {
        window.dispatchEvent(new Event("pointermove"));
        await act(async () => vi.advanceTimersByTimeAsync(16));
      }
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(t.uniqueFontFamilies).not.toHaveBeenCalled();

      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(t.uniqueFontFamilies).toHaveBeenCalledTimes(1);
      await act(async () => t.toggle());
      expect(t.host.textContent).toContain("Roboto Slab");
    } finally {
      stopLoop();
      t.done();
      window.requestAnimationFrame = raf;
      vi.useRealTimers();
    }
  });

  it("retries a failed list fetch when the picker opens", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    const t = await fresh();
    try {
      await act(async () => t.render("Georgia"));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(t.uniqueFontFamilies).not.toHaveBeenCalled();

      await act(async () => t.toggle());
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(t.host.textContent).toContain("Roboto Slab");
    } finally {
      t.done();
    }
  });
});
