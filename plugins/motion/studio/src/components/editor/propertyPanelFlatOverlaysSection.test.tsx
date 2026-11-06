// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { RegistryItem } from "@hyperframes/core/registry";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveMediaOverlayPlacement,
  filterMediaTreatmentOverlays,
  FlatOverlaysSection,
  MEDIA_TREATMENT_OVERLAY_TAG,
} from "./propertyPanelFlatOverlaysSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function registryItem(
  name: string,
  tags: string[],
  type: RegistryItem["type"] = "hyperframes:component",
  preview?: RegistryItem["preview"],
): RegistryItem {
  const base = {
    name,
    title: name,
    description: `${name} description`,
    tags,
    preview,
    files: [{ path: `${name}.html`, target: `${name}.html`, type: "hyperframes:snippet" as const }],
  };
  if (type === "hyperframes:component") return { ...base, type };
  if (type === "hyperframes:block") {
    return { ...base, type, dimensions: { width: 1920, height: 1080 }, duration: 2 };
  }
  return { ...base, type, dimensions: { width: 1920, height: 1080 }, duration: 2 };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("FlatOverlaysSection", () => {
  it("places an overlay over the selected media in its own composition", () => {
    expect(
      deriveMediaOverlayPlacement(
        {
          sourceFile: "compositions/scene.html",
          dataAttributes: { "track-index": "2" },
        },
        { start: 1.5, duration: 3 },
      ),
    ).toEqual({
      start: 1.5,
      duration: 3,
      track: 3,
      compositionPath: "compositions/scene.html",
    });
  });

  it("keeps only tagged Registry overlay blocks", () => {
    const overlay = registryItem(
      "camcorder-hud",
      [MEDIA_TREATMENT_OVERLAY_TAG],
      "hyperframes:block",
    );
    const ordinary = registryItem("caption", ["caption"]);
    const taggedComponent = registryItem("scene", [MEDIA_TREATMENT_OVERLAY_TAG]);

    expect(
      filterMediaTreatmentOverlays([overlay, ordinary, taggedComponent]).map(({ name }) => name),
    ).toEqual(["camcorder-hud"]);
  });

  it("loads tagged overlays and delegates installation by Registry name", async () => {
    const items = [
      registryItem("camcorder-hud", [MEDIA_TREATMENT_OVERLAY_TAG], "hyperframes:block", {
        poster: "https://example.com/camcorder.png",
        video: "https://example.com/camcorder.mp4",
      }),
      registryItem("ordinary-component", ["overlay"]),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => items }));
    const onAddOverlay = vi.fn().mockResolvedValue(undefined);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<FlatOverlaysSection onAddOverlay={onAddOverlay} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('[data-flat-overlay="ordinary-component"]')).toBeNull();
    const add = host.querySelector<HTMLButtonElement>('[data-flat-overlay="camcorder-hud"]');
    expect(add).not.toBeNull();
    expect(
      host.querySelector<HTMLImageElement>('[data-flat-overlay-preview="camcorder-hud"]')?.src,
    ).toBe("https://example.com/camcorder.png");
    expect(host.querySelector('[data-flat-overlays="true"]')?.className).toContain("auto-fill");
    act(() => add?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(host.querySelector<HTMLVideoElement>("video")?.src).toBe(
      "https://example.com/camcorder.mp4",
    );
    await act(async () => {
      add?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(onAddOverlay).toHaveBeenCalledWith("camcorder-hud");

    act(() => root.unmount());
  });
});
