// @vitest-environment happy-dom

// The card's job is to be actionable at the exact moment someone is stuck.
// The case worth pinning is a recheck that finds nothing: it changes no other
// pixel on screen, so without an explicit cue the button reads as broken.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FfmpegRequiredNotice } from "./FfmpegRequiredNotice";
import type { FfmpegStatus } from "./useFfmpegStatus";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const MISSING: FfmpegStatus = {
  ok: false,
  title: "FFmpeg not found",
  detail: "FFmpeg is required to encode video.",
  hint: "brew install ffmpeg",
  command: "brew install ffmpeg",
};

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function render(props: {
  status?: FfmpegStatus;
  checking?: boolean;
  onRecheck?: () => void;
}): void {
  act(() => {
    root?.render(
      <FfmpegRequiredNotice
        status={props.status ?? MISSING}
        checking={props.checking ?? false}
        onRecheck={props.onRecheck ?? vi.fn()}
      />,
    );
  });
}

describe("FfmpegRequiredNotice", () => {
  it("leads with the command, not the apology", () => {
    render({});

    expect(host.querySelector("code")?.textContent).toBe("brew install ffmpeg");
    expect(host.textContent).toContain("FFmpeg not found");
  });

  it("says so when a recheck still finds nothing", () => {
    render({ checking: false });
    expect(host.textContent).not.toContain("Still not found");

    render({ checking: true });
    expect(host.textContent).toContain("Checking…");

    render({ checking: false });
    expect(host.textContent).toContain("Still not found");
  });

  it("retires the cue so it cannot be mistaken for the card's steady state", () => {
    render({ checking: false });
    render({ checking: true });
    render({ checking: false });
    expect(host.textContent).toContain("Still not found");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(host.textContent).not.toContain("Still not found");
  });

  it("shows no cue before the user has ever asked for a recheck", () => {
    render({ checking: false });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(host.textContent).not.toContain("Still not found");
  });

  it("falls back to the prose hint on a platform with no single command", () => {
    render({
      status: { ok: false, title: "FFmpeg not found", hint: "See the download page." },
    });

    expect(host.querySelector("code")).toBeNull();
    expect(host.textContent).toContain("See the download page.");
  });
});
