// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountReactHarness } from "./domSelectionTestHarness";
import { useGestureRecording, type GestureSample } from "./useGestureRecording";
import { CLIP_HIDDEN_ATTR } from "@hyperframes/core/runtime/clip-reveal";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("useGestureRecording", () => {
  it("keeps only the latest gesture sample in each output frame", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    let nowMs = 0;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);

    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const element = iframe.contentDocument!.createElement("div");
    element.id = "card";
    iframe.contentDocument!.body.append(element);

    let recording: ReturnType<typeof useGestureRecording> | null = null;
    function Harness() {
      recording = useGestureRecording();
      return null;
    }
    const root = mountReactHarness(<Harness />);

    act(() => recording?.startRecording(element, iframe));
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 10 }));
    nowMs = 1;
    act(() => animationFrames.shift()?.(1));
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 20 }));
    nowMs = 10;
    act(() => animationFrames.shift()?.(10));
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 40 }));
    nowMs = 20;
    act(() => animationFrames.shift()?.(20));
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 50 }));
    nowMs = 30;
    act(() => animationFrames.shift()?.(30));

    let samples: GestureSample[] = [];
    act(() => {
      samples = recording?.stopRecording() ?? [];
    });

    expect(samples).toEqual([
      { time: 0, properties: { x: 10, y: 0 } },
      { time: 1 / 30, properties: { x: 40, y: 0 } },
    ]);
    act(() => root.unmount());
  });

  it("lifts the runtime's hidden-clip mark while previewing a hidden clip and puts it back on release", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => animationFrames.push(callback)),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const element = iframe.contentDocument!.createElement("div");
    element.id = "card";
    element.style.visibility = "hidden";
    element.setAttribute(CLIP_HIDDEN_ATTR, "");
    iframe.contentDocument!.body.append(element);
    Reflect.set(iframe.contentWindow!, "gsap", { getProperty: vi.fn(() => 0), set: vi.fn() });
    Reflect.set(iframe.contentWindow!, "__timelines", {
      main: { duration: () => 5, seek: vi.fn() },
    });
    Reflect.set(iframe.contentWindow!, "__player", { getTime: () => 1 });

    let recording: ReturnType<typeof useGestureRecording> | null = null;
    function Harness() {
      recording = useGestureRecording();
      return null;
    }
    const root = mountReactHarness(<Harness />);
    act(() => recording?.startRecording(element, iframe, 4));
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 10 }));
    act(() => animationFrames.shift()?.(1));
    expect([element.style.visibility, element.hasAttribute(CLIP_HIDDEN_ATTR)]).toEqual([
      "visible",
      false,
    ]);

    act(() => root.unmount());
    expect([element.style.visibility, element.hasAttribute(CLIP_HIDDEN_ATTR)]).toEqual([
      "hidden",
      true,
    ]);
  });

  it("releases the preview runtime when unmounted during a recording", () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 17),
    );
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const previewDocument = iframe.contentDocument!;
    const element = previewDocument.createElement("div");
    element.id = "card";
    element.style.visibility = "hidden";
    element.style.setProperty("translate", "10px 20px");
    element.style.setProperty("--hf-studio-offset-x", "12px");
    element.style.setProperty("--hf-studio-offset-y", "-8px");
    previewDocument.body.append(element);

    const set = vi.fn();
    const seek = vi.fn();
    Reflect.set(iframe.contentWindow!, "gsap", {
      getProperty: vi.fn(() => 0),
      set,
    });
    Reflect.set(iframe.contentWindow!, "__timelines", {
      main: { duration: () => 5, seek },
    });
    Reflect.set(iframe.contentWindow!, "__player", { getTime: () => 1 });

    let recording: ReturnType<typeof useGestureRecording> | null = null;
    function Harness() {
      recording = useGestureRecording();
      return null;
    }
    const root = mountReactHarness(<Harness />);

    act(() => recording?.startRecording(element, iframe, 4));
    expect(element.style.getPropertyValue("--hf-studio-offset-x")).toBe("0px");
    expect(element.style.getPropertyValue("--hf-studio-offset-y")).toBe("0px");

    act(() => root.unmount());

    expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(set).toHaveBeenCalledWith(element, {
      clearProps: "x,y,scale,scaleX,scaleY,rotation,rotationX,rotationY,opacity,z",
    });
    expect(element.style.visibility).toBe("hidden");
    expect(element.style.getPropertyValue("translate")).toBe("10px 20px");
    expect(element.style.getPropertyValue("--hf-studio-offset-x")).toBe("12px");
    expect(element.style.getPropertyValue("--hf-studio-offset-y")).toBe("-8px");
  });
});
