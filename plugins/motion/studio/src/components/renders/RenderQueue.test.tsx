// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { RenderQueue, type StartRenderHandler } from "./RenderQueue";
import { getPersistedRenderSettings } from "./renderSettings";
import { buttonBase, buttonSizes, buttonVariants, cn } from "../ui";
import { isTypingTarget } from "../../utils/typingTarget";
import { shouldIgnorePlaybackShortcutTarget } from "../../player/lib/playbackShortcuts";
import type { FfmpegStatus } from "./useFfmpegStatus";

// Encoder availability arrives as a prop (useRenderQueue owns the probe), so
// each case just states the environment it is about.
let ffmpegStatus: FfmpegStatus | null = { ok: true };
const recheck = vi.fn();

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;

beforeEach(() => {
  ffmpegStatus = { ok: true };
  recheck.mockClear();
  // The format, frame-rate and quality controls write through to the real
  // store, so each case has to start from the shipped defaults.
  localStorage.clear();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mountRenderQueue(
  onStartRender: Mock<StartRenderHandler>,
  compositionDimensions = { width: 1920, height: 1080 },
) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <RenderQueue
        jobs={[]}
        projectId="demo"
        onDelete={vi.fn()}
        onClearCompleted={vi.fn()}
        onStartRender={onStartRender}
        isRendering={false}
        compositionDimensions={compositionDimensions}
        ffmpeg={ffmpegStatus}
        ffmpegChecking={false}
        onRecheckFfmpeg={recheck}
      />,
    );
  });
  return host;
}

/** Base UI moves focus a task later than React renders; happy-dom is no faster. */
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

function fire(el: Element, type: string, key?: string) {
  const event =
    key === undefined
      ? new MouseEvent(type, { bubbles: true })
      : new KeyboardEvent(type, { bubbles: true, key });
  act(() => void el.dispatchEvent(event));
}

function triggerFor(host: HTMLElement, label: string): HTMLElement {
  const trigger = host.querySelector<HTMLElement>(`[role="combobox"][aria-label="${label}"]`);
  if (!trigger) throw new Error(`no select labelled ${label}`);
  return trigger;
}

/** Opens a Select and arrows down `steps` items before committing, the way a keyboard user
 * does. happy-dom does not synthesise the click Space would trigger, so it is dispatched here. */
async function chooseByArrowing(trigger: HTMLElement, steps: number) {
  fire(trigger, "keydown", " ");
  fire(trigger, "keyup", " ");
  act(() => trigger.click());
  await settle();
  for (let i = 0; i < steps; i += 1) {
    fire(document.activeElement ?? document.body, "keydown", "ArrowDown");
    await settle();
  }
  fire(document.activeElement ?? document.body, "keydown", "Enter");
  await settle();
}

function exportButtonIn(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('[data-testid="renders-export"]');
  if (!button) throw new Error("export button did not render");
  return button;
}

describe("RenderQueue controls", () => {
  it("has no native select left in the panel", () => {
    // R8. The four format / resolution / frame-rate / quality controls are the
    // shared Select now; a native one would bring back an OS popup that no
    // token can reach.
    expect(mountRenderQueue(vi.fn()).querySelector("select")).toBeNull();
  });

  it("wears exactly the header Export's recipe, plus the full width", () => {
    // AE3. Set equality, not "contains": the bug this replaces was an extra
    // `text-[11px]` on this button, which `cn` resolved by dropping the size
    // recipe's `text-step-12` and left the two Exports a type step apart.
    const shared = cn(buttonBase, buttonVariants.primary, buttonSizes.md);
    const classes = new Set(exportButtonIn(mountRenderQueue(vi.fn())).className.split(/\s+/));

    expect(classes).toEqual(new Set([...shared.split(/\s+/), "w-full"]));
  });

  it("classifies the format Select the way it classified the native one (KTD13)", async () => {
    const host = mountRenderQueue(vi.fn());
    const reference = document.createElement("select");
    document.body.append(reference);
    await settle();

    const trigger = triggerFor(host, "Format");

    // Both true, not merely equal: two falses would agree and prove nothing.
    expect(isTypingTarget(reference)).toBe(true);
    expect(shouldIgnorePlaybackShortcutTarget(reference)).toBe(true);
    expect(isTypingTarget(trigger)).toBe(isTypingTarget(reference));
    expect(shouldIgnorePlaybackShortcutTarget(trigger)).toBe(
      shouldIgnorePlaybackShortcutTarget(reference),
    );
  });

  it("submits the canonical landscape 4K preset selected by the user", async () => {
    const onStartRender: Mock<StartRenderHandler> = vi.fn();
    const host = mountRenderQueue(onStartRender);

    // Auto, 1080p, 4K: two steps down from the default.
    await chooseByArrowing(triggerFor(host, "Resolution"), 2);
    act(() => {
      exportButtonIn(host).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onStartRender).toHaveBeenCalledWith("mp4", "standard", "landscape-4k", 30, false);
  });

  it("refuses a resolution the composition cannot reach, and says why", async () => {
    // 1080p on a 1280x720 comp is a 1.5x scale, which the producer rejects; the
    // option stays listed (its label explains why) but the keyboard skips it.
    const onStartRender: Mock<StartRenderHandler> = vi.fn();
    const host = mountRenderQueue(onStartRender, { width: 1280, height: 720 });
    const trigger = triggerFor(host, "Resolution");

    fire(trigger, "keydown", " ");
    fire(trigger, "keyup", " ");
    act(() => trigger.click());
    await settle();
    const blocked = [...document.querySelectorAll('[role="option"]')].filter((option) =>
      option.hasAttribute("data-disabled"),
    );
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.textContent).toContain("not an integer scale of 1280×720");

    fire(document.activeElement ?? document.body, "keydown", "ArrowDown");
    await settle();
    fire(document.activeElement ?? document.body, "keydown", "Enter");
    await settle();
    fire(document.activeElement ?? document.body, "keydown", "Escape");
    await settle();
    act(() => {
      exportButtonIn(host).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onStartRender).toHaveBeenCalledWith("mp4", "standard", "auto", 30, false);
  });

  it("exports with GPU encoding once the box is ticked, and remembers it", () => {
    const onStartRender: Mock<StartRenderHandler> = vi.fn();
    const host = mountRenderQueue(onStartRender);
    const gpu = [...host.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("Use GPU encoding"),
    );

    act(() => gpu?.querySelector("input")?.click());
    act(() => {
      exportButtonIn(host).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onStartRender).toHaveBeenCalledWith("mp4", "standard", "auto", 30, true);
    expect(getPersistedRenderSettings().gpu).toBe(true);
  });

  it("persists a changed format as the literal union value", async () => {
    const host = mountRenderQueue(vi.fn());

    // MP4, MOV, WebM: one step down commits "mov", not the label "MOV (ProRes)".
    await chooseByArrowing(triggerFor(host, "Format"), 1);

    expect(getPersistedRenderSettings()).toEqual({
      format: "mov",
      quality: "standard",
      fps: 30,
      gpu: false,
    });
    expect(host.textContent).not.toContain("Use GPU encoding");
  });
});

describe("RenderQueue Export button", () => {
  it("leaves the font size to the shared Button", () => {
    const host = mountRenderQueue(vi.fn());
    expect(exportButtonIn(host).className).not.toMatch(/text-\[/);
  });
});

describe("RenderQueue FFmpeg gate", () => {
  it("refuses Export and shows the install command when the server reports no FFmpeg", () => {
    ffmpegStatus = {
      ok: false,
      title: "FFmpeg not found",
      detail: "FFmpeg is required to encode video.",
      hint: "brew install ffmpeg",
      command: "brew install ffmpeg",
    };
    const onStartRender: Mock<StartRenderHandler> = vi.fn();
    const host = mountRenderQueue(onStartRender);

    expect(host.textContent).toContain("FFmpeg not found");
    expect(host.querySelector("code")?.textContent).toBe("brew install ffmpeg");

    const exportButton = exportButtonIn(host);
    expect(exportButton.disabled).toBe(true);
    act(() => {
      exportButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onStartRender).not.toHaveBeenCalled();
  });

  it("offers a recheck so installing FFmpeg does not require restarting Studio", () => {
    ffmpegStatus = { ok: false, title: "FFmpeg not found", command: "brew install ffmpeg" };
    const host = mountRenderQueue(vi.fn());

    const recheckButton = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Recheck",
    );
    if (!recheckButton) throw new Error("recheck button did not render");
    act(() => {
      recheckButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(recheck).toHaveBeenCalledTimes(1);
  });

  // An unreachable or older dev server answers nothing. Treating "no answer"
  // as "not installed" would lock Export for setups that render fine.
  it("leaves Export usable when the probe returns no answer", () => {
    ffmpegStatus = null;
    const onStartRender: Mock<StartRenderHandler> = vi.fn();
    const host = mountRenderQueue(onStartRender);

    expect(host.textContent).not.toContain("FFmpeg not found");
    const exportButton = exportButtonIn(host);
    expect(exportButton.disabled).toBe(false);
    act(() => {
      exportButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onStartRender).toHaveBeenCalledTimes(1);
  });

  it("says nothing when FFmpeg is present", () => {
    const host = mountRenderQueue(vi.fn());

    expect(host.textContent).not.toContain("FFmpeg not found");
    expect(exportButtonIn(host).disabled).toBe(false);
  });
});

function mountGifQueue() {
  localStorage.setItem("hf-studio-render-settings", JSON.stringify({ format: "gif" }));
  const onStartRender: Mock<StartRenderHandler> = vi.fn();
  return { onStartRender, host: mountRenderQueue(onStartRender) };
}

function enterGifLoop(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type="number"]');
  if (!input) throw new Error("missing loop count");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

describe("GIF export controls", () => {
  it("offers GIF, persists the selection, and exports with infinite looping", async () => {
    const onStartRender: Mock<StartRenderHandler> = vi.fn();
    const host = mountRenderQueue(onStartRender);
    await chooseByArrowing(triggerFor(host, "Format"), 3);
    expect(getPersistedRenderSettings().format).toBe("gif");
    const input = host.querySelector<HTMLInputElement>('input[type="number"]');
    expect(input?.value).toBe("0");
    act(() => exportButtonIn(host).click());
    expect(onStartRender).toHaveBeenCalledWith("gif", "standard", "auto", 30, false, 0);
  });

  it("restores GIF settings and exports a finite loop count", () => {
    const { host, onStartRender } = mountGifQueue();
    enterGifLoop(host, "3");
    act(() => exportButtonIn(host).click());
    expect(onStartRender).toHaveBeenCalledWith("gif", "standard", "auto", 30, false, 3);
  });

  it.each(["", "-1", "1.5", "65536"])("blocks export for invalid GIF loop count %j", (value) => {
    const { host, onStartRender } = mountGifQueue();
    const input = enterGifLoop(host, value);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(exportButtonIn(host).disabled).toBe(true);
    act(() => exportButtonIn(host).click());
    expect(onStartRender).not.toHaveBeenCalled();
  });
});

describe("GIF frame-rate controls", () => {
  it("caps a saved GIF frame rate of 60 and disables that option", async () => {
    localStorage.setItem("hf-studio-render-settings", JSON.stringify({ format: "gif", fps: 60 }));
    const onStartRender: Mock<StartRenderHandler> = vi.fn();
    const host = mountRenderQueue(onStartRender);
    const fps = triggerFor(host, "Frame rate");
    expect(fps.textContent).toContain("30 fps");
    act(() => exportButtonIn(host).click());
    expect(onStartRender).toHaveBeenCalledWith("gif", "standard", "auto", 30, false, 0);
    act(() => fps.click());
    await settle();
    const sixty = Array.from(document.querySelectorAll('[role="option"]')).find((option) =>
      option.textContent?.includes("60 fps"),
    );
    expect(sixty?.getAttribute("aria-disabled")).toBe("true");
  });

  it("switches a 60 fps video to a 30 fps GIF and preserves 60 fps for video", async () => {
    localStorage.setItem("hf-studio-render-settings", JSON.stringify({ format: "mp4", fps: 60 }));
    const onStartRender: Mock<StartRenderHandler> = vi.fn();
    const host = mountRenderQueue(onStartRender);
    act(() => exportButtonIn(host).click());
    expect(onStartRender).toHaveBeenLastCalledWith("mp4", "standard", "auto", 60, false);
    await chooseByArrowing(triggerFor(host, "Format"), 3);
    expect(triggerFor(host, "Frame rate").textContent).toContain("30 fps");
    expect(getPersistedRenderSettings()).toMatchObject({ format: "gif", fps: 30 });
    act(() => exportButtonIn(host).click());
    expect(onStartRender).toHaveBeenLastCalledWith("gif", "standard", "auto", 30, false, 0);
  });
});
