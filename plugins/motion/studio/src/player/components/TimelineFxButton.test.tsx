// @vitest-environment happy-dom
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { serializeAudioFxChain } from "@hyperframes/core/audio-fx";
import { TimelineFxButton } from "./TimelineFxButton.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function byTextButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
}

function mount(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  act(() => createRoot(host).render(node));
  return host;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TimelineFxButton", () => {
  it("reads FX with no count when the chain is empty", () => {
    const host = mount(
      <TimelineFxButton
        variant="chain"
        fxChainRaw={undefined}
        onChainChange={vi.fn()}
        onOpenRack={vi.fn()}
      />,
    );
    expect(byTextButton(host, "FX")?.textContent).toBe("FX");
  });

  it("counts only enabled nodes", () => {
    const chain = {
      version: 1 as const,
      nodes: [
        { type: "peaking", params: {}, enabled: true },
        { type: "gain", params: {}, enabled: false },
      ],
    };
    const host = mount(
      <TimelineFxButton
        variant="chain"
        fxChainRaw={serializeAudioFxChain(chain)}
        onChainChange={vi.fn()}
        onOpenRack={vi.fn()}
      />,
    );
    expect(byTextButton(host, "FX 1")).toBeDefined();
  });

  it("opens the popover on click, anchored off the button", () => {
    const host = mount(
      <TimelineFxButton
        variant="chain"
        fxChainRaw={undefined}
        onChainChange={vi.fn()}
        onOpenRack={vi.fn()}
      />,
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() => byTextButton(host, "FX")?.click());
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  // A muted target auditions anyway — the mute is lifted on the running graph
  // for the hover and put back on the way out. The read has to happen on the
  // way IN: the live unmute flows back into this component's props, so a
  // restore that re-read `isMuted` would find it false and never re-mute.
  it("borrows a muted target's mute for the audition and returns it", () => {
    const onSetMutedLive = vi.fn();
    const host = mount(
      <TimelineFxButton
        variant="chain"
        fxChainRaw={undefined}
        isMuted
        onSetMutedLive={onSetMutedLive}
        onChainChange={vi.fn()}
        onChainPreview={vi.fn()}
        onOpenRack={vi.fn()}
      />,
    );
    act(() => byTextButton(host, "FX")?.click());
    const preset = document.querySelector<HTMLButtonElement>(".hf-fx-preset-item");
    act(() => preset?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(onSetMutedLive).toHaveBeenLastCalledWith(false);
    const shelf = document.querySelector(".hf-fx-preset-menu");
    act(() => shelf?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    expect(onSetMutedLive).toHaveBeenLastCalledWith(true);
  });

  it("leaves an unmuted target's mute alone", () => {
    const onSetMutedLive = vi.fn();
    const host = mount(
      <TimelineFxButton
        variant="chain"
        fxChainRaw={undefined}
        onSetMutedLive={onSetMutedLive}
        onChainChange={vi.fn()}
        onChainPreview={vi.fn()}
        onOpenRack={vi.fn()}
      />,
    );
    act(() => byTextButton(host, "FX")?.click());
    const preset = document.querySelector<HTMLButtonElement>(".hf-fx-preset-item");
    act(() => preset?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(onSetMutedLive).not.toHaveBeenCalled();
  });

  // Hovering writes the preset through the preview channel, and the chain prop
  // is read back from that same live attribute. Applying while a DIFFERENT
  // preset is being auditioned used to save both — heard as the effect running
  // twice — so the apply has to land on the stored chain.
  it("applies onto the stored chain, not the one being auditioned", () => {
    const onChainChange = vi.fn();
    // The write-back the real timeline does: a preview patches the live
    // attribute, and the row re-reads it into `fxChainRaw`. Without this the
    // prop never moves and the bug cannot show.
    function Harness() {
      const [raw, setRaw] = React.useState<string | undefined>(undefined);
      return (
        <TimelineFxButton
          variant="chain"
          fxChainRaw={raw}
          onChainChange={onChainChange}
          onChainPreview={(next) => setRaw(serializeAudioFxChain(next))}
          onOpenRack={vi.fn()}
        />
      );
    }
    const host = mount(<Harness />);
    act(() => byTextButton(host, "FX")?.click());
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>(".hf-fx-preset-item"));
    const [hovered, clicked] = [items[0], items[1]];
    act(() => hovered?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    act(() => clicked?.click());
    const saved = onChainChange.mock.calls.at(-1)?.[0];
    const presets = new Set(saved?.nodes.map((n: { fromPreset?: string }) => n.fromPreset));
    expect(presets.size).toBe(1);
  });

  // The design doc calls the sentence this dialog carries "the highest-leverage
  // copy in this plan": it is the concept of a submix bus delivered without the
  // word, to an author who has never met one. The old pointer auto-named the
  // group on one click and never mentioned the shared volume.
  it("group-pointer variant names the group and explains what one is", () => {
    const onGroupClips = vi.fn();
    const host = mount(
      <TimelineFxButton variant="group-pointer" clipCount={2} onGroupClips={onGroupClips} />,
    );
    act(() => byTextButton(host, "FX")?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      "Effects you add to the group apply to both clips at once, and they share one volume.",
    );
    const group = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Group",
    );
    act(() => group?.click());
    expect(onGroupClips).toHaveBeenCalledWith("Voiceover");
  });

  // Three or more must not read "both".
  it("counts the clips in the explanation", () => {
    mount(<TimelineFxButton variant="group-pointer" clipCount={3} onGroupClips={vi.fn()} />);
    act(() => byTextButton(document.body as HTMLElement, "FX")?.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("all 3 clips at once");
  });

  // §1.4 keeps groups audio-only in v1, and §5 is explicit that a deliberate
  // limit must be stated: "silent ones just send authors hunting for something
  // that was never built."
  it("states the video limit instead of offering a name field", () => {
    const onGroupClips = vi.fn();
    const host = mount(
      <TimelineFxButton
        variant="group-pointer"
        clipCount={2}
        refusal="This track can't be grouped."
        onGroupClips={onGroupClips}
      />,
    );
    act(() => byTextButton(host, "FX")?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("This track can't be grouped");
    expect(document.querySelector('input[aria-label="Group name"]')).toBeNull();
    expect(
      Array.from(document.body.querySelectorAll("button")).some((b) => b.textContent === "Group"),
    ).toBe(false);
  });

  // #3421: the dialog positioned itself at `anchorRect.bottom + 4` with no flip
  // and no clamp, and this button lives in a track header at the bottom of the
  // studio window — so it opened past the viewport edge and was reported as
  // "the grouping button did nothing". Numbers derive from GROUP_DIALOG_SIZE
  // (256x160) against happy-dom's 1024x768 window and a 12px margin.
  it("flips the group dialog above the anchor when there is no room below", () => {
    const host = mount(
      <TimelineFxButton variant="group-pointer" clipCount={2} onGroupClips={vi.fn()} />,
    );
    const fx = byTextButton(host, "FX");
    fx!.getBoundingClientRect = () =>
      ({ left: 300, top: 760, right: 320, bottom: 776, width: 20, height: 16 }) as DOMRect;
    act(() => fx?.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    const top = Number.parseFloat(dialog.style.top);
    // Fully inside the viewport on both edges, which the unclamped form was not.
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + 160).toBeLessThanOrEqual(768 - 12);
  });

  it("keeps the group dialog inside the right edge of the window", () => {
    const host = mount(
      <TimelineFxButton variant="group-pointer" clipCount={2} onGroupClips={vi.fn()} />,
    );
    const fx = byTextButton(host, "FX");
    fx!.getBoundingClientRect = () =>
      ({ left: 1010, top: 100, right: 1024, bottom: 116, width: 14, height: 16 }) as DOMRect;
    act(() => fx?.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const left = Number.parseFloat(dialog.style.left);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(left + 256).toBeLessThanOrEqual(1024 - 12);
  });

  it("carries the typed name into the group it creates", () => {
    const onGroupClips = vi.fn();
    const host = mount(
      <TimelineFxButton variant="group-pointer" clipCount={2} onGroupClips={onGroupClips} />,
    );
    act(() => byTextButton(host, "FX")?.click());
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Group name"]');
    expect(input).not.toBeNull();
    // React tracks the input's value on the node, so assigning `.value`
    // directly is swallowed — the native setter is what makes onChange fire.
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      if (input && setValue) {
        setValue.call(input, "SFX");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const group = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Group",
    );
    act(() => group?.click());
    expect(onGroupClips).toHaveBeenCalledWith("SFX");
  });
});
