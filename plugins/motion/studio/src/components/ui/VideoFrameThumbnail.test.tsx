// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoFrameThumbnail } from "./VideoFrameThumbnail";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// The component builds its thumbnail from document.createElement("video"/"canvas"),
// so both are faked here. The video fake records load() calls and keeps listener
// sets, letting a test re-fire an event handler after cleanup removed it — the
// exact shape of the error→cleanup→error loop this suite guards against.
interface FakeVideo {
  crossOrigin: string;
  muted: boolean;
  preload: string;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  currentTime: number;
  loadCalls: number;
  _src: string;
  src: string;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  getAttribute(name: string): string | null;
  load(): void;
  dispatch(type: string): void;
}

function makeVideo(): FakeVideo {
  const listeners = new Map<string, Set<() => void>>();
  const video: FakeVideo = {
    crossOrigin: "",
    muted: false,
    preload: "",
    duration: 10,
    videoWidth: 640,
    videoHeight: 360,
    currentTime: 0,
    loadCalls: 0,
    _src: "",
    src: "",
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    getAttribute(name) {
      return name === "src" ? video.src : null;
    },
    load() {
      video.loadCalls++;
    },
    dispatch(type) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
  };
  Object.defineProperty(video, "src", {
    get: () => video._src,
    set: (v: string) => {
      video._src = v;
    },
  });
  return video;
}

const canvas = {
  width: 0,
  height: 0,
  getContext: () => ({ drawImage: () => {} }),
  toDataURL: () => "data:image/jpeg;base64,AAAA",
};

describe("VideoFrameThumbnail", () => {
  let videos: FakeVideo[];
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    videos = [];
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "video") {
        const v = makeVideo();
        videos.push(v);
        return v as unknown as HTMLVideoElement;
      }
      if (tag === "canvas") return canvas as unknown as HTMLCanvasElement;
      return original(tag);
    }) as typeof document.createElement);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const render = (props: { src: string; fallbackLabel?: string }) => {
    act(() => root.render(<VideoFrameThumbnail {...props} />));
    return videos[videos.length - 1];
  };

  it("renders the fallback label when the video errors", () => {
    render({ src: "missing.mp4", fallbackLabel: "VIDEO" });
    const video = videos[0];
    expect(video.src).toBe("missing.mp4");
    expect(video.loadCalls).toBe(1);

    act(() => video.dispatch("error"));

    expect(container.textContent).toContain("VIDEO");
    // cleanup ran once: detached the error listener and reset the media element
    expect(video.src).toBe("");
    expect(video.loadCalls).toBe(2);
  });

  it("does not loop when the cleared src fires a synthetic error", () => {
    render({ src: "missing.mp4", fallbackLabel: "VIDEO" });
    const video = videos[0];
    act(() => video.dispatch("error"));
    expect(video.loadCalls).toBe(2);

    // The empty src makes the browser fire `error` again; the detached handler
    // must stay detached — repeated dispatches must not touch load() anymore.
    act(() => {
      video.dispatch("error");
      video.dispatch("error");
      video.dispatch("error");
    });

    expect(video.loadCalls).toBe(2);
    expect(container.textContent).toContain("VIDEO");
  });

  it("keeps the extracted frame and stays inert after a post-seek synthetic error", () => {
    render({ src: "clip.mp4" });
    const video = videos[0];

    act(() => video.dispatch("loadedmetadata"));
    expect(video.currentTime).toBe(1); // 10% of a 10s clip

    act(() => video.dispatch("seeked"));
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    expect(video.src).toBe("");
    expect(video.loadCalls).toBe(2);

    act(() => {
      video.dispatch("error");
      video.dispatch("error");
    });

    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    expect(video.loadCalls).toBe(2);
  });

  it("shows a still, full-size placeholder while the frame loads", () => {
    render({ src: "clip.mp4" });
    const placeholder = container.querySelector("[data-thumbnail-loading]");
    expect(placeholder).not.toBeNull();
    expect(placeholder?.className).not.toMatch(/\banimate-/);
    expect(placeholder?.classList.contains("w-full")).toBe(true);
    expect(placeholder?.classList.contains("h-full")).toBe(true);
  });

  it("retries with a fresh video element when src changes", () => {
    render({ src: "a.mp4" });
    act(() => root.render(<VideoFrameThumbnail src="b.mp4" />));
    expect(videos.length).toBe(2);
    expect(videos[1].src).toBe("b.mp4");
  });
});
