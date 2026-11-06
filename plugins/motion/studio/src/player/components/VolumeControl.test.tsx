// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VolumeControl } from "./VolumeControl";

vi.mock("../../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

function renderVolumeControl(overrides: Partial<React.ComponentProps<typeof VolumeControl>> = {}) {
  const props = {
    audioMuted: false,
    audioVolume: 1,
    disabled: false,
    setAudioMuted: vi.fn(),
    setAudioVolume: vi.fn(),
    ...overrides,
  };
  act(() => root.render(<VolumeControl {...props} />));
  return { host, props };
}

function setRangeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("expected native range value setter");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("VolumeControl", () => {
  it("exposes the current preview volume as an accessible range", () => {
    const { host } = renderVolumeControl({ audioVolume: 0.42 });
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Preview volume"]');

    expect(slider?.value).toBe("42");
    expect(slider?.getAttribute("aria-valuetext")).toBe("42%");
  });

  it("updates the preview volume while dragging", () => {
    const { host, props } = renderVolumeControl();
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Preview volume"]');
    if (!slider) throw new Error("preview volume slider did not render");

    act(() => setRangeValue(slider, "35"));

    expect(props.setAudioVolume).toHaveBeenCalledWith(0.35);
  });

  it("unmutes when a muted preview is given a positive volume", () => {
    const { host, props } = renderVolumeControl({ audioMuted: true });
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Preview volume"]');
    if (!slider) throw new Error("preview volume slider did not render");

    act(() => setRangeValue(slider, "60"));

    expect(props.setAudioVolume).toHaveBeenCalledWith(0.6);
    expect(props.setAudioMuted).toHaveBeenCalledWith(false);
  });

  it("restores an audible level when unmuting from zero", () => {
    const { host, props } = renderVolumeControl({ audioVolume: 0 });
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Unmute audio"]');
    if (!button) throw new Error("unmute button did not render");

    act(() => button.click());

    expect(props.setAudioVolume).toHaveBeenCalledWith(1);
    expect(props.setAudioMuted).toHaveBeenCalledWith(false);
  });
});
