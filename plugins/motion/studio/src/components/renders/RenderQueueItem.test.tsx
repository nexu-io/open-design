// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RenderQueueItem } from "./RenderQueueItem";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("GIF render preview", () => {
  it("uses an image instead of video playback, with open, download and delete actions", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onDelete = vi.fn();
    try {
      act(() =>
        root.render(
          <RenderQueueItem
            job={{ id: "j1", filename: "j1.gif", status: "complete", progress: 100, createdAt: 0 }}
            projectId="demo"
            onDelete={onDelete}
            onCancel={vi.fn()}
          />,
        ),
      );
      expect(host.querySelector("img")?.getAttribute("src")).toBe(
        "/api/projects/demo/renders/file/j1.gif",
      );
      expect(host.querySelector("video")).toBeNull();
      expect(host.querySelector('[aria-label="Open j1.gif in a new tab"]')).not.toBeNull();
      expect(
        host.querySelector<HTMLButtonElement>('[aria-label="Download j1.gif"]')?.disabled,
      ).toBe(false);
      const deleteButton = host.querySelector<HTMLButtonElement>('[aria-label="Delete j1.gif"]');
      act(() => deleteButton?.click());
      const confirm = Array.from(host.querySelectorAll("button")).find(
        (button) => button.textContent === "Delete?",
      );
      act(() => confirm?.click());
      expect(onDelete).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
