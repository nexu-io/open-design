// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MediaPreview } from "./MediaPreview";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  host = null;
  document.body.replaceChildren();
});

async function renderPreview(projectId: string, filePath: string): Promise<HTMLDivElement> {
  if (!root) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => {
    root?.render(<MediaPreview projectId={projectId} filePath={filePath} />);
  });
  return host as HTMLDivElement;
}

describe("MediaPreview", () => {
  it("retries a repaired file after visiting another media source", async () => {
    const host = await renderPreview("test", "broken.png");
    const failedImage = host.querySelector("img");
    expect(failedImage).not.toBeNull();

    await act(async () => {
      failedImage?.dispatchEvent(new Event("error"));
    });
    expect(host.textContent).toContain("Couldn't load this file");

    await renderPreview("test", "healthy.png");
    expect(host.querySelector("img")?.getAttribute("src")).toContain("healthy.png");

    await renderPreview("test", "broken.png");
    expect(host.querySelector("img")?.getAttribute("src")).toContain("broken.png");
  });

  it("resets failure state when the project changes, but preserves a current failure", async () => {
    const host = await renderPreview("first", "broken.png");
    const image = host.querySelector("img");
    await act(async () => {
      image?.dispatchEvent(new Event("error"));
    });
    expect(host.textContent).toContain("Couldn't load this file");

    await renderPreview("second", "broken.png");
    expect(host.querySelector("img")?.getAttribute("src")).toContain("/second/preview/broken.png");

    const secondImage = host.querySelector("img");
    await act(async () => {
      secondImage?.dispatchEvent(new Event("error"));
    });
    expect(host.textContent).toContain("Couldn't load this file");

    await renderPreview("second", "broken.png");
    expect(host.querySelector("img")).toBeNull();
  });
});
