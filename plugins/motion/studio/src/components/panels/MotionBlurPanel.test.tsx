// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import { MotionBlurPanel } from "./MotionBlurPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = (attrs = "") =>
  `<!DOCTYPE html><html><body><div data-composition-id="main" data-hf-root data-duration="5" data-width="1920" data-height="1080"${attrs}></div></body></html>`;

const shell = {
  activeCompPath: null as string | null,
  previewIframeRef: { current: null as HTMLIFrameElement | null },
  showToast: vi.fn(),
};

vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContext: () => shell,
  useStudioPlaybackContext: () => ({ refreshKey: 0 }),
}));

const files: Record<string, string> = {};
const writeProjectFile = vi.fn(async (path: string, content: string) => {
  files[path] = content;
});
vi.mock("../../contexts/FileManagerContext", () => ({
  useFileManagerContext: () => ({
    readProjectFile: async (path: string) => files[path] ?? "",
    writeProjectFile,
    compositions: ["index.html", "scene.html"],
  }),
}));

let root: Root | null = null;
const recordEdit = vi.fn(async () => {});

function cleanup() {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
}

afterEach(() => {
  cleanup();
  shell.activeCompPath = null;
  shell.previewIframeRef.current = null;
  vi.clearAllMocks();
});

async function mount(attrs = "") {
  files["index.html"] = page(attrs);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const session = await openComposition(files["index.html"], { history: false });
  await act(async () => {
    root?.render(
      <MotionBlurPanel
        sdkSession={session}
        publishSdkSession={vi.fn()}
        reloadPreview={vi.fn()}
        recordEdit={recordEdit}
      />,
    );
  });
  return host;
}

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = async (el: Element | null) => {
  await act(async () => (el as HTMLElement).click());
  await settle();
};

const radio = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('[role="radio"]')].find((el) => el.textContent === label) ?? null;
const checked = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="radio"]')]
    .filter((el) => el.getAttribute("aria-checked") === "true")
    .map((el) => el.textContent);

describe("MotionBlurPanel", () => {
  it("offers Off, Subtle and Strong and nothing else", async () => {
    const host = await mount();
    expect([...host.querySelectorAll('[role="radio"]')].map((el) => el.textContent)).toEqual([
      "Off",
      "Subtle",
      "Strong",
    ]);
    expect(
      host.querySelectorAll('[role="slider"], [role="switch"], [role="combobox"], input'),
    ).toHaveLength(0);
  });

  it("shows the level the root is at", async () => {
    expect(checked(await mount())).toEqual(["Off"]);
    cleanup();
    expect(checked(await mount(' data-motion-blur="on"'))).toEqual(["Subtle"]);
    cleanup();
    expect(
      checked(
        await mount(
          ' data-motion-blur="on" data-motion-blur-shutter="720" data-motion-blur-samples="64"',
        ),
      ),
    ).toEqual(["Strong"]);
  });

  it("Subtle writes data-motion-blur and leaves the default shutter off the root", async () => {
    const host = await mount(
      ' data-motion-blur="on" data-motion-blur-shutter="720" data-motion-blur-samples="64"',
    );
    await click(radio(host, "Subtle"));
    const html = files["index.html"] ?? "";
    expect(html).toContain('data-motion-blur="on"');
    expect(html).not.toContain("data-motion-blur-shutter");
    expect(html).not.toContain("data-motion-blur-samples");
    expect(recordEdit).toHaveBeenCalledTimes(1);
  });

  it("Strong writes the maximum shutter and samples", async () => {
    const host = await mount();
    await click(radio(host, "Strong"));
    const html = files["index.html"] ?? "";
    expect(html).toContain('data-motion-blur="on"');
    expect(html).toContain('data-motion-blur-shutter="720"');
    expect(html).toContain('data-motion-blur-samples="64"');
  });

  it("Off removes data-motion-blur and its events, and leaves the other settings on the root", async () => {
    const host = await mount(
      ' data-motion-blur="on" data-motion-blur-shutter="720" data-motion-blur-samples="64" data-motion-blur-tier="filter" data-motion-blur-events="on"',
    );
    await click(radio(host, "Off"));
    const html = files["index.html"] ?? "";
    expect(html).not.toContain('data-motion-blur="on"');
    expect(html).not.toContain("data-motion-blur-events");
    for (const kept of ['shutter="720"', 'samples="64"', 'tier="filter"']) {
      expect(html).toContain(`data-motion-blur-${kept}`);
    }
  });

  it("turns the events attribute on with Subtle and Strong, so callback-driven motion is found", async () => {
    const host = await mount();
    await click(radio(host, "Subtle"));
    expect(files["index.html"]).toContain('data-motion-blur-events="on"');
    await click(radio(host, "Strong"));
    expect(files["index.html"]).toContain('data-motion-blur-events="on"');
  });

  it("writes nothing when the chosen level is already set", async () => {
    const host = await mount(' data-motion-blur="on" data-motion-blur-events="on"');
    await click(radio(host, "Subtle"));
    expect(writeProjectFile).not.toHaveBeenCalled();
  });

  it("follows the live preview over the session, so an undo or an outside edit shows", async () => {
    const doc = document.implementation.createHTMLDocument("preview");
    doc.body.innerHTML =
      '<div data-composition-id="main" data-motion-blur="on" data-motion-blur-shutter="720"></div>';
    shell.previewIframeRef.current = { contentDocument: doc } as unknown as HTMLIFrameElement;
    expect(checked(await mount(' data-motion-blur="on"'))).toEqual(["Strong"]);
  });

  it("writes the level picked even when the preview and the file disagree", async () => {
    const doc = document.implementation.createHTMLDocument("preview");
    doc.body.innerHTML =
      '<div data-composition-id="main" data-motion-blur="on" data-motion-blur-shutter="720" data-motion-blur-samples="64"></div>';
    shell.previewIframeRef.current = { contentDocument: doc } as unknown as HTMLIFrameElement;
    const host = await mount();
    await click(radio(host, "Subtle"));
    expect(files["index.html"]).toContain('data-motion-blur="on"');
    expect(files["index.html"]).not.toContain("data-motion-blur-samples");
  });

  it("is read-only for a sub-composition, which blur does not read", async () => {
    shell.activeCompPath = "scene.html";
    const host = await mount();
    expect(host.textContent).toContain("read from the main composition");
    expect(radio(host, "Strong")?.hasAttribute("disabled")).toBe(true);
    expect(checked(host)).toEqual([]);
  });
});
