import { describe, expect, it } from "vitest";

import { createZoomMenuItems } from "../../src/main/index.js";

describe("View menu zoom items", () => {
  const items = createZoomMenuItems("win32");

  it("keeps the standard zoom roles in order", () => {
    expect(items.map((item) => item.role)).toEqual([
      "resetZoom",
      "zoomIn",
      "zoomOut",
      "zoomOut",
    ]);
  });

  it("registers the Ctrl+Shift+- spelling of zoom out", () => {
    const hidden = items.at(-1);
    expect(hidden?.accelerator).toBe("CmdOrCtrl+Shift+-");
    expect(hidden?.visible).toBe(false);
  });

  it("leaves the visible zoom items on their default role accelerators", () => {
    for (const item of items.slice(0, 3)) {
      expect(item.accelerator).toBeUndefined();
      expect(item.visible).not.toBe(false);
    }
  });

  it.each(["darwin", "linux"] as const)("does not change the %s zoom accelerators", (platform) => {
    const platformItems = createZoomMenuItems(platform);

    expect(platformItems.map((item) => item.role)).toEqual([
      "resetZoom",
      "zoomIn",
      "zoomOut",
    ]);
    expect(platformItems.every((item) => item.accelerator === undefined)).toBe(true);
  });
});
