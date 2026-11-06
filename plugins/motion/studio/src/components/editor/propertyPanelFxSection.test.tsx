// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultAudioFxParams,
  getAudioFxDef,
  HF_AUDIO_FX,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import { DEFAULT_CARVE } from "@hyperframes/core/audio-carve";
import { BANDS, EFFECT_COPY, PRESET_PROBLEM } from "@hyperframes/core/audio-fx-copy";
import { HF_AUDIO_FX_JOBS, HF_AUDIO_FX_JOB_TYPES } from "@hyperframes/core/audio-fx-jobs";
import { audioFxProfileStrength } from "@hyperframes/core/audio-fx-profiles";
import { fxPresetStyle } from "./propertyPanelFxPresetStyle.js";
import { applyAudioFxPreset, getAudioFxPreset } from "@hyperframes/core/audio-fx-presets";

/**
 * What a knob is CALLED in the panel, looked up rather than spelled out.
 *
 * The rack speaks the plain-language layer now, so a row is addressed by the
 * parameter it belongs to and the copy decides the words. Hard-coding them here
 * would make every copy edit a test edit, and these tests are about which row
 * carries the automate button — not about how it reads.
 */
function plainLabel(effectId: string, key: string): string {
  const label = EFFECT_COPY[effectId]?.params[key]?.label;
  if (!label) throw new Error(`no copy for ${effectId}.${key}`);
  return label;
}
import { createRoot } from "react-dom/client";
import { FxSection } from "./propertyPanelFxSection.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderInto(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

const chainOf = (...types: string[]): HfAudioFxChain => ({
  version: 1,
  nodes: types.map((t) => ({ type: t, enabled: true, params: defaultAudioFxParams(t) })),
});

/** A carve's own filters and level stage, plus one effect the author added. */
const carved = {
  version: 1,
  nodes: [
    { type: "peaking", id: "n1", fromCarve: true, params: { frequency: 400, gain: -6, q: 1.4 } },
    { type: "peaking", id: "n2", fromCarve: true, params: { frequency: 1600, gain: -9, q: 1.4 } },
    { type: "gain", id: "n3", fromCarve: true, params: { gain: -6 } },
    { type: "lowpass", id: "n4", params: { frequency: 8000, q: 0.7, poles: "2" } },
  ],
} as unknown as HfAudioFxChain;

/** The first effect the author added, skipping the carve module that leads the rack. */
function fxCard(host: HTMLElement): HTMLElement {
  return host.querySelector<HTMLElement>(".hf-fx-node:not(.hf-fx-carve-module)")!;
}

/** Open the carve module if something closed it — it starts open. */
function ensureCarveOpen(host: HTMLElement): HTMLElement {
  const module = host.querySelector<HTMLElement>(".hf-fx-carve-module")!;
  const head = module.querySelector<HTMLButtonElement>(".hf-fx-node-name")!;
  if (head.getAttribute("aria-expanded") === "false") act(() => head.click());
  return module;
}

function mount(overrides: Partial<Parameters<typeof FxSection>[0]> = {}) {
  const onChainChange = vi.fn();
  const onChainPreview = vi.fn();
  const onCarveChange = vi.fn();
  const { host, root } = renderInto(
    <FxSection
      chain={overrides.chain ?? { version: 1, nodes: [] }}
      onChainChange={overrides.onChainChange ?? onChainChange}
      onChainPreview={overrides.onChainPreview ?? onChainPreview}
      carve={overrides.carve ?? null}
      onCarveChange={overrides.onCarveChange ?? onCarveChange}
      sourceOptions={overrides.sourceOptions ?? [{ id: "vo", label: "Voiceover" }]}
      analysing={overrides.analysing}
      disabled={overrides.disabled}
      automatedTargets={overrides.automatedTargets}
      onAutomateParam={overrides.onAutomateParam}
      onRemoveParamAutomation={overrides.onRemoveParamAutomation}
      onRemoveNodeAutomation={overrides.onRemoveNodeAutomation}
      onRemoveNodesAutomation={overrides.onRemoveNodesAutomation}
      onAutomatePreset={overrides.onAutomatePreset}
      onRemovePresetAutomation={overrides.onRemovePresetAutomation}
      onAuditionTransport={overrides.onAuditionTransport}
      automatedPresets={overrides.automatedPresets}
      onLevel={overrides.onLevel}
      onRemoveLevel={overrides.onRemoveLevel}
      levelled={overrides.levelled}
      onAuditionLevel={overrides.onAuditionLevel}
      auditioningLevel={overrides.auditioningLevel}
      trackKind={overrides.trackKind}
    />,
  );
  return { host, root, onChainChange, onChainPreview, onCarveChange };
}

const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  act(() => {
    (el as HTMLElement).click();
  });
};
/**
 * Open a module's Details, where every control that is not the primary one now
 * lives — a module opens on one knob and the rest is one click away.
 */
function openDetails(host: HTMLElement, index = 0): void {
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>(".hf-fx-node-details"));
  const button = buttons[index];
  if (!button) throw new Error("no Details disclosure to open");
  act(() => button.click());
}

const byText = (host: HTMLElement, sel: string, text: string) =>
  Array.from(host.querySelectorAll(sel)).find((e) => e.textContent?.trim() === text);

const openAddMenuItems = (host: HTMLElement) => {
  click(host.querySelector(".hf-fx-add"));
  return Array.from(host.querySelectorAll(".hf-fx-add-item")).map((e) => e.textContent?.trim());
};

/**
 * A preset button, found by the preset it applies rather than by its words.
 *
 * The shelf leads with the complaint and follows with the name, so a button's
 * text is two sentences and neither of them alone is what an author would call
 * it. Addressing it by id keeps the test about what applying it does.
 */
const presetButton = (host: HTMLElement, id: string): Element | undefined =>
  Array.from(host.querySelectorAll(".hf-fx-preset-item")).find(
    (e) =>
      e.querySelector(".hf-fx-preset-name")?.textContent?.trim() === getAudioFxPreset(id)?.label,
  );

/**
 * React tracks an input's value on the DOM node, so assigning `.value` and
 * dispatching looks like a no-op change and the handler never fires. Going
 * through the native setter clears that tracker.
 */
const typeInto = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("FxSection chain", () => {
  it("scrolls again when the same open parameter is revealed twice", () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const chain: HfAudioFxChain = {
      version: 1,
      nodes: [
        {
          type: "lowpass",
          id: "filter-1",
          enabled: true,
          params: defaultAudioFxParams("lowpass"),
        },
      ],
    };
    const renderFxSection = (revealNonce: number) => (
      <FxSection
        chain={chain}
        onChainChange={vi.fn()}
        onCarveChange={vi.fn()}
        carve={null}
        sourceOptions={[]}
        revealTarget="fx.filter-1.frequency"
        revealNonce={revealNonce}
      />
    );

    try {
      const { root } = renderInto(renderFxSection(1));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      act(() => root.render(renderFxSection(2)));
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("says so when the track has no effects", () => {
    const { host } = mount();
    // "other", because the carve module is in the rack whenever a voice exists.
    expect(host.querySelector(".hf-fx-empty")?.textContent).toMatch(/No other effects/);
  });

  it("offers every effect in the registry, grouped", () => {
    // The add menu is generated, so a new effect upstream appears here with no
    // change to the panel.
    const { host } = mount();
    const items = openAddMenuItems(host);
    // Every effect is reachable, but not every one under its own name: the jobs
    // stand in for the effect they are made of, because picking `peaking` is
    // picking a machine and leaving the real decision for afterwards.
    const standIns = HF_AUDIO_FX.filter((d) => HF_AUDIO_FX_JOB_TYPES.has(d.id));
    expect(items).toHaveLength(HF_AUDIO_FX.length - standIns.length + HF_AUDIO_FX_JOBS.length);
    for (const def of HF_AUDIO_FX) {
      if (HF_AUDIO_FX_JOB_TYPES.has(def.id)) {
        // Not offered as itself, and it must not be — two doors to the same
        // effect, one of them the incoherent one, is worse than either alone.
        expect(items).not.toContain(EFFECT_COPY[def.id]?.title);
        continue;
      }
      // By the name the RACK will use, not the registry's — picking "High-pass"
      // and getting a module called "Remove Rumble" is the inconsistency this
      // whole layer exists to remove.
      expect(items).toContain(EFFECT_COPY[def.id]?.title);
    }
    for (const job of HF_AUDIO_FX_JOBS) expect(items).toContain(job.label);
  });

  it("adds a job as an ordinary effect, already named and already aimed", () => {
    // The range IS the module: one knob is honest here because the decision the
    // knob depends on has already been made.
    const { host, onChainChange } = mount({ chain: { version: 1, nodes: [] } });
    click(host.querySelector(".hf-fx-add"));
    click(byText(host, ".hf-fx-add-item", "Reduce Mud"));

    const next = onChainChange.mock.calls[0]?.[0] as HfAudioFxChain;
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]?.type).toBe("peaking");
    expect(next.nodes[0]?.label).toBe("Reduce Mud");
    expect(next.nodes[0]?.params?.frequency).toBe(250);
  });

  it("shows two jobs over the same effect as the different things they are", () => {
    // The whole point. Read down the rack, "Shape One Range" twice was two rows
    // an author could not tell apart — and one of them was cutting while the
    // other was boosting.
    const { host } = mount({
      chain: {
        version: 1,
        nodes: [
          { type: "peaking", label: "Reduce Mud", params: { frequency: 250, gain: -3, q: 1.2 } },
          { type: "peaking", label: "Add Clarity", params: { frequency: 3000, gain: 2.5, q: 1 } },
        ],
      } as unknown as HfAudioFxChain,
    });
    const names = Array.from(host.querySelectorAll(".hf-fx-node-name")).map((e) =>
      e.textContent?.trim(),
    );
    expect(names).toContain("Reduce Mud");
    expect(names).toContain("Add Clarity");
    expect(names).not.toContain(EFFECT_COPY.peaking?.title);
  });

  it("adds an effect seeded with its declared defaults", () => {
    // An effect with no derived knob arrives exactly as the registry declares
    // it. The five that DO have one are seeded on their curve instead — see
    // "adds a profiled effect on its curve" below.
    const { host, onChainChange } = mount();
    click(host.querySelector(".hf-fx-add"));
    click(byText(host, ".hf-fx-add-item", EFFECT_COPY.delay?.title ?? ""));
    expect(onChainChange).toHaveBeenCalledTimes(1);
    const next = onChainChange.mock.calls[0]![0] as HfAudioFxChain;
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]!.type).toBe("delay");
    expect(next.nodes[0]!.params).toEqual(defaultAudioFxParams("delay"));
  });

  it("renders a control for every parameter the effect declares", () => {
    const { host } = mount({ chain: chainOf("compressor") });
    const def = getAudioFxDef("compressor")!;
    const labels = Array.from(host.querySelectorAll(".hf-fx-label")).map((e) =>
      e.textContent?.trim(),
    );
    // Under Details: a compressor's face is one derived knob, and its seven real
    // controls are one click in.
    openDetails(host);
    const opened = Array.from(host.querySelectorAll(".hf-fx-label")).map((e) =>
      e.textContent?.trim(),
    );
    for (const p of def.params) expect(opened).toContain(plainLabel("compressor", p.key));
    void labels;
  });

  it("uses a select for an enum parameter and a slider for a number", () => {
    const { host } = mount({ chain: chainOf("saturate") });
    // Its curve type is an enum and lives under Details, since saturation's one
    // knob is derived rather than being any single parameter.
    openDetails(host);
    expect(host.querySelector(".hf-fx-select")).toBeTruthy();
    expect(host.querySelector(".hf-fx-slider")).toBeTruthy();
  });

  it("bypasses without removing, so the settings survive", () => {
    const { host, onChainChange } = mount({ chain: chainOf("peaking") });
    click(fxCard(host).querySelector(".hf-fx-bypass"));
    const next = onChainChange.mock.calls[0]![0] as HfAudioFxChain;
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]!.enabled).toBe(false);
    expect(next.nodes[0]!.params).toEqual(defaultAudioFxParams("peaking"));
  });

  it("reorders, because chain order changes the sound", () => {
    const { host, onChainChange } = mount({ chain: chainOf("peaking", "reverb") });
    const downs = Array.from(host.querySelectorAll('.hf-fx-move[title="Move down"]'));
    click(downs[0]);
    const next = onChainChange.mock.calls[0]![0] as HfAudioFxChain;
    expect(next.nodes.map((n) => n.type)).toEqual(["reverb", "peaking"]);
  });

  it("keeps a half-typed value with its own effect across a reorder", () => {
    // Rows used to be keyed `${type}-${index}`, so two effects of the same type
    // kept their keys through a reorder and React reused each row where it
    // stood. The controls hold real state — a number field mid-edit is held as
    // text — so the buffer stayed at the position and landed on whichever
    // effect moved into it.
    const peaking = (id: string, frequency: number) => ({
      type: "peaking",
      id,
      enabled: true,
      params: { ...defaultAudioFxParams("peaking"), frequency },
    });
    const a = peaking("pa", 400);
    const b = peaking("pb", 1600);
    const chainOfNodes = (...nodes: unknown[]): HfAudioFxChain =>
      ({ version: 1, nodes }) as HfAudioFxChain;

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (chain: HfAudioFxChain) =>
      act(() => {
        root.render(
          <FxSection
            chain={chain}
            onChainChange={vi.fn()}
            onChainPreview={vi.fn()}
            carve={null}
            onCarveChange={vi.fn()}
            sourceOptions={[]}
          />,
        );
      });

    render(chainOfNodes(a, b));
    // Frequency is behind Details for a peaking node — the module opens on how
    // much, now that picking the module is what picks the range.
    openDetails(host);
    // Only the first card is open, which is the one being edited.
    const openFrequency = (): HTMLInputElement =>
      host.querySelector<HTMLInputElement>(".hf-fx-node .hf-fx-number")!;

    expect(openFrequency().value).toBe("400");
    typeInto(openFrequency(), "123");
    expect(openFrequency().value).toBe("123");

    // The author moves that effect down; the other one takes the open slot.
    render(chainOfNodes(b, a));

    // Its own Details, not the one that was open: the disclosure is per module,
    // so the effect arriving in the slot arrives closed like any other.
    openDetails(host);
    expect(openFrequency().value).toBe("1600");
  });

  /**
   * The shelf leads with the complaint a preset answers, so offering the voice
   * family on a music bed offers the author a problem they cannot have. The
   * hiding is deliberately timid: only a name that plainly reads as music or as
   * an effect loses anything, because a name is a hint and hiding what somebody
   * came for costs more than one extra shelf to scroll past.
   */
  const shelfFamilies = (host: HTMLElement): string[] =>
    Array.from(host.querySelectorAll(".hf-fx-preset-group-label")).map((e) =>
      (e.textContent ?? "").trim(),
    );

  it("keeps the voice presets on a track whose name says nothing", () => {
    const { host } = mount({ trackKind: "unknown" });
    click(byText(host, "button", "Presets"));
    expect(shelfFamilies(host)).toEqual(["Voice", "Fix", "Character", "Space"]);
  });

  it("keeps them when nothing classified the track at all", () => {
    const { host } = mount({});
    click(byText(host, "button", "Presets"));
    expect(shelfFamilies(host)).toContain("Voice");
  });

  it("drops the voice shelf on a music bed, and on an effect", () => {
    for (const kind of ["music", "sfx"] as const) {
      const { host } = mount({ trackKind: kind });
      click(byText(host, "button", "Presets"));
      expect(shelfFamilies(host)).toEqual(["Fix", "Character", "Space"]);
      // The rest of the shelf is untouched — this hides one family, it does not
      // narrow the panel down to "repair".
      expect(presetButton(host, "telephone")).toBeTruthy();
      expect(presetButton(host, "voice-clean")).toBeUndefined();
    }
  });

  it("applies a preset as ordinary nodes, tagged with where they came from", () => {
    const { host, onChainChange } = mount({ chain: { version: 1, nodes: [] } });
    click(byText(host, "button", "Presets"));
    click(presetButton(host, "telephone"));

    const next = onChainChange.mock.calls[0]![0] as HfAudioFxChain;
    // The band, its honk and de-mud shaping, and the soft clip — a chain the
    // author can now see and edit, not an opaque "telephone" setting.
    expect(next.nodes.map((n) => n.type)).toEqual([
      "highpass",
      "highpass",
      "lowpass",
      "lowpass",
      "peaking",
      "peaking",
      "saturate",
    ]);
    expect(next.nodes.every((n) => n.fromPreset === "telephone")).toBe(true);
    // Every node needs an id or its parameters can never be automated.
    expect(new Set(next.nodes.map((n) => n.id)).size).toBe(next.nodes.length);
  });

  it("names an effect for the job it does, and keeps the DSP name for inside", () => {
    // The rack is read by somebody who has never opened a mixer. "Remove Rumble"
    // is what they came here for; "High-pass" is a fact about the mechanism, so
    // it waits until they open the module and ask.
    const { host } = mount({ chain: chainOf("highpass") });
    const node = fxCard(host);
    const name = node.querySelector(".hf-fx-node-name")?.textContent?.trim();
    expect(name).toBe(EFFECT_COPY.highpass?.title);
    expect(name).not.toBe(getAudioFxDef("highpass")?.label);
    // And a sentence under it, so the rack reads top to bottom.
    expect(node.querySelector(".hf-fx-node-summary")?.textContent).toContain("Cutting everything");
    // Open, it says what it is for and offers ONE knob — the rest is behind a
    // disclosure, which is also the only place the DSP name appears.
    expect(node.querySelector(".hf-fx-node-does")?.textContent).toBe(EFFECT_COPY.highpass?.does);
    expect(node.querySelectorAll(".hf-fx-row")).toHaveLength(1);
    const details = node.querySelector(".hf-fx-node-details");
    expect(details?.textContent).toContain(getAudioFxDef("highpass")?.label);
    expect(details?.getAttribute("aria-expanded")).toBe("false");

    openDetails(host);
    expect(node.querySelectorAll(".hf-fx-row").length).toBe(
      getAudioFxDef("highpass")?.params.length,
    );
  });

  it("draws the rack as a signal path, with both ends named", () => {
    // Order is audible here, and a list does not look ordered. Numbering the
    // steps and naming the two ends is what makes "move up" read as the most
    // consequential control in the panel rather than a cosmetic one.
    const { host } = mount({ chain: chainOf("highpass", "limiter") });
    const terms = Array.from(host.querySelectorAll(".hf-fx-term")).map((e) => e.textContent);
    expect(terms).toHaveLength(2);
    expect(terms[0]).toContain("In");
    expect(terms[1]).toContain("Out");
    // Counted over what the rack SHOWS: the carve module leads it, so the first
    // hand-built effect is 02.
    const numbers = Array.from(host.querySelectorAll(".hf-fx-node-index")).map((e) =>
      e.textContent?.trim(),
    );
    expect(numbers).toEqual(["02", "03"]);
  });

  it("draws a preset's nodes as the one thing that was added", () => {
    // Applying a preset drops five rows into the rack with nothing saying they
    // arrived together — the same failure the carve module exists to fix, one
    // level down.
    const { host, onChainChange } = mount({ chain: { version: 1, nodes: [] } });
    click(byText(host, "button", "Presets"));
    click(presetButton(host, "telephone"));
    // Applying does not re-render this mount — the chain comes back as a prop —
    // so the rack is read from what was written.
    const applied = onChainChange.mock.calls[0]?.[0] as HfAudioFxChain | undefined;
    const written = applied?.nodes ?? [];
    const { host: after } = mount({ chain: { version: 1, nodes: written } });

    const run = after.querySelector("[data-fx-preset='telephone']");
    expect(run).toBeTruthy();
    // The label carries a disclosure caret, so match the name inside it.
    expect(run?.querySelector(".hf-fx-preset-run-label")?.textContent).toContain("Telephone");
    expect(run?.querySelectorAll(".hf-fx-node")).toHaveLength(written.length);
  });

  describe("a preset is one thing to switch off or take away", () => {
    /**
     * The run's own Amount row — not a member module's.
     *
     * It is a direct child of the bracket; a member's rows are nested inside its
     * own card, which is what makes the distinction structural rather than
     * positional.
     */
    const amountRow = (host: HTMLElement): HTMLElement | null => {
      const bracket = host.querySelector("[data-fx-preset='telephone']");
      // A direct-child walk rather than `:scope >`, which happy-dom's matcher
      // does not support — it returns nothing rather than erroring, which reads
      // as "the control is missing".
      return (Array.from(bracket?.children ?? []).find((c) => c.classList.contains("hf-fx-row")) ??
        null) as HTMLElement | null;
    };

    /** A telephone preset applied, plus one hand-built effect beside it. */
    const applied = (): HfAudioFxChain => {
      const preset = getAudioFxPreset("telephone");
      if (!preset) throw new Error("no telephone preset");
      // Through the real applier: `fromPreset` is stamped there, not carried in
      // the catalogue, and the tag is the whole basis of the bracket.
      const withPreset = applyAudioFxPreset({ version: 1, nodes: [] }, preset);
      return {
        ...withPreset,
        nodes: [
          ...withPreset.nodes,
          { type: "reverb", id: "own", enabled: true, params: defaultAudioFxParams("reverb") },
        ],
      };
    };

    it("switches the whole preset off in one gesture", () => {
      // Reaching into five modules and toggling each is exactly the bookkeeping
      // the bracket exists to remove.
      const { host, onChainChange } = mount({ chain: applied() });
      const run = host.querySelector("[data-fx-preset='telephone']");
      click(run?.querySelector(".hf-fx-preset-run-toggle"));

      const next = onChainChange.mock.calls[0]?.[0] as HfAudioFxChain;
      // Amount, not `enabled`: the switch and the lane are the same value, so
      // Off is one end of the control a ramp moves along rather than a second
      // way of silencing the preset. Writing `enabled` would take the nodes out
      // of the graph, which a lane cannot do part-way.
      const members = next.nodes.filter((n) => n.fromPreset === "telephone");
      expect(members.every((n) => n.presetAmount === 0)).toBe(true);
      // Still in the graph, so the settings survive and it can come back.
      expect(members.every((n) => n.enabled !== false)).toBe(true);
      // And leaves what the author added themselves alone.
      expect(next.nodes.find((n) => n.id === "own")?.presetAmount).toBeUndefined();
    });

    it("puts the whole preset half in", () => {
      // The point of the blend: a preset is not only on or off, and the same
      // value a lane ramps is one an author can just set.
      const { host, onChainChange } = mount({ chain: applied() });
      const input = amountRow(host)?.querySelector<HTMLInputElement>(".hf-fx-number");
      if (!input) throw new Error("no amount control");
      typeInto(input, "0.4");
      act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

      const next = onChainChange.mock.calls.at(-1)?.[0] as HfAudioFxChain;
      expect(
        next.nodes.filter((n) => n.fromPreset === "telephone").every((n) => n.presetAmount === 0.4),
      ).toBe(true);
    });

    it("switches back on rather than deleting, so the settings survive", () => {
      const off = applied();
      off.nodes = off.nodes.map((n) =>
        n.fromPreset === "telephone" ? { ...n, presetAmount: 0 } : n,
      );
      const { host, onChainChange } = mount({ chain: off });
      const toggle = host
        .querySelector("[data-fx-preset='telephone']")
        ?.querySelector(".hf-fx-preset-run-toggle");
      expect(toggle?.getAttribute("aria-pressed")).toBe("false");
      click(toggle);

      const next = onChainChange.mock.calls[0]?.[0] as HfAudioFxChain;
      const back = next.nodes.filter((n) => n.fromPreset === "telephone");
      expect(back.every((n) => n.presetAmount === 1)).toBe(true);
      // Nothing was thrown away.
      expect(back).toHaveLength(off.nodes.filter((n) => n.fromPreset === "telephone").length);
    });

    it("reads as on while any of it is still applied", () => {
      // Anything above zero is a preset that is doing something, and the switch
      // has to offer to stop it rather than claim it has already stopped.
      const partial = applied();
      partial.nodes = partial.nodes.map((n) =>
        n.fromPreset === "telephone" ? { ...n, presetAmount: 0.2 } : n,
      );
      const { host } = mount({ chain: partial });
      expect(
        host
          .querySelector("[data-fx-preset='telephone']")
          ?.querySelector(".hf-fx-preset-run-toggle")
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
    });

    it("hands the whole preset to a lane, seeded where it already sits", () => {
      // The reason a preset needs its own target at all: its nodes share no
      // automatable parameter, and its worklet effects expose none. One lane on
      // the blend is what lets a preset ramp in over time.
      const onAutomatePreset = vi.fn();
      const half = applied();
      half.nodes = half.nodes.map((n) =>
        n.fromPreset === "telephone" ? { ...n, presetAmount: 0.6 } : n,
      );
      const { host } = mount({ chain: half, onAutomatePreset });
      click(amountRow(host)?.querySelector(".hf-fx-automate"));
      // Seeded where it sits, so switching to a lane never changes the sound.
      expect(onAutomatePreset).toHaveBeenCalledWith("telephone", 0.6);
    });

    it("shows an automated preset as driven rather than offering a slider", () => {
      const { host } = mount({
        chain: applied(),
        automatedPresets: new Set(["telephone"]),
      });
      const row = amountRow(host);
      expect(row?.hasAttribute("data-automated")).toBe(true);
      expect(row?.querySelector<HTMLInputElement>('input[type="range"]')?.disabled).toBe(true);
    });

    it("takes the preset back out whole, with its lanes", () => {
      const onRemoveNodesAutomation = vi.fn();
      const { host, onChainChange } = mount({ chain: applied(), onRemoveNodesAutomation });
      click(
        host
          .querySelector("[data-fx-preset='telephone']")
          ?.querySelector(".hf-fx-preset-run-remove"),
      );

      const next = onChainChange.mock.calls[0]?.[0] as HfAudioFxChain;
      expect(next.nodes.filter((n) => n.fromPreset === "telephone")).toEqual([]);
      expect(next.nodes.map((n) => n.id)).toEqual(["own"]);
      // ONE call carrying every node id, not one call per node: each write is
      // computed from the same snapshot and replaces the whole attribute, so a
      // loop kept only its last write and left the rest as orphans — which the
      // next effect added would inherit along with the id.
      expect(onRemoveNodesAutomation).toHaveBeenCalledTimes(1);
      const [ids, presetId] = onRemoveNodesAutomation.mock.calls[0] ?? [];
      expect((ids as string[]).length).toBeGreaterThan(1);
      // And the whole-preset amount lane, which belongs to no node and would
      // otherwise survive to be resurrected by re-applying the preset.
      expect(presetId).toBe("telephone");
    });
  });

  it("brackets only nodes a preset still sits next to", () => {
    // Pulled apart by a reorder, they are no longer a unit — and a bracket
    // around the gap would claim an adjacency the signal path does not have.
    const { host } = mount({
      chain: {
        version: 1,
        nodes: [
          { type: "highpass", fromPreset: "telephone", params: defaultAudioFxParams("highpass") },
          { type: "reverb", params: defaultAudioFxParams("reverb") },
          { type: "lowpass", fromPreset: "telephone", params: defaultAudioFxParams("lowpass") },
        ],
      } as unknown as HfAudioFxChain,
    });
    const runs = Array.from(host.querySelectorAll("[data-fx-preset='telephone']"));
    expect(runs).toHaveLength(2);
    for (const run of runs) expect(run.querySelectorAll(".hf-fx-node")).toHaveLength(1);
  });

  it("letters each family differently, so the kind reads before the word does", () => {
    // A rack of eight modules is eight lines of text. Reading it should not mean
    // reading eight names — the shape of the line carries what KIND of module
    // this is, and the word only confirms it.
    const { host } = mount({ chain: chainOf("lowpass", "compressor", "saturate", "delay") });
    const families = Array.from(host.querySelectorAll("[data-fx-family]")).map((e) =>
      e.getAttribute("data-fx-family"),
    );
    // The carve module leads the rack and is smart; then the four registry ones.
    expect(families).toEqual(["smart", "filter", "dynamics", "nonlinear", "time"]);

    const names = Array.from(host.querySelectorAll(".hf-fx-node-name")).map((e) => e.className);
    // Four families told apart by the sans, and the serif spent on the one that
    // generates signal rather than measuring or shaping what is there.
    expect(names.filter((c) => c.includes("font-serif"))).toHaveLength(1);
    expect(names[3]).toContain("font-serif");
    expect(new Set(names.map((c) => c.replace(/^.*?(?=font-)/, "")))).toHaveProperty("size", 5);
  });

  it("tints two modules of the same family apart without changing family", () => {
    const { host } = mount({ chain: chainOf("lowpass", "highpass") });
    const cards = Array.from(host.querySelectorAll<HTMLElement>("[data-fx-family='filter']"));
    expect(cards).toHaveLength(2);
    // Same hue, different step: two filters, visibly two modules.
    const tints = cards.map((c) => c.style.borderLeftColor);
    expect(tints[0]).not.toBe(tints[1]);
    for (const tint of tints) expect(tint).toContain("205");
  });

  it("says where a filter is working, in the words the rack shares", () => {
    // Frequencies mean nothing to somebody who has not been taught them, and the
    // rack speaks entirely in them. The ruler is where they get taught.
    const { host } = mount({
      chain: {
        version: 1,
        nodes: [{ type: "highpass", params: { frequency: 250, q: 0.707, poles: "2" } }],
      } as unknown as HfAudioFxChain,
    });
    const ruler = fxCard(host).querySelector(".hf-fx-ruler");
    expect(ruler?.getAttribute("data-band")).toBe("Mud");
    expect(ruler?.querySelector(".hf-fx-ruler-name")?.textContent).toBe("Mud");
    // Every named range is on the bar, or it is not a shared ruler.
    const segments = Array.from(ruler?.querySelectorAll<HTMLElement>(".hf-fx-ruler-band") ?? []);
    expect(segments).toHaveLength(BANDS.length);
    // Log-spaced, because hearing is. Rumble is 20-80 Hz — three tenths of one
    // percent of the range linearly, and a fifth of it by ear. Laid out linearly
    // the bottom six bands collapse into a sliver and the ruler teaches nothing.
    const rumble = Number.parseFloat(segments[0]?.style.width ?? "0");
    expect(rumble).toBeGreaterThan(10);
  });

  it("puts no ruler under an effect that does not act on a range", () => {
    // A limiter has no frequency to place, and a bar under one would be a
    // decoration claiming to be information.
    const { host } = mount({ chain: chainOf("limiter") });
    expect(fxCard(host).querySelector(".hf-fx-ruler")).toBeNull();
  });

  it("adds a profiled effect on its curve, not at registry defaults", () => {
    // The registry's defaults are not a point on the profile's curve, so an
    // effect seeded with them opened reading a strength it was not set to: a
    // compressor arrived showing Evenness 0.67 with its make-up gain at 0 dB —
    // the "quieter as you turn it up" bug the profiles exist to prevent, on the
    // very first frame. Caught in a running studio, not by these tests.
    const { host, onChainChange } = mount({ chain: { version: 1, nodes: [] } });
    click(host.querySelector(".hf-fx-add"));
    click(byText(host, ".hf-fx-add-item", EFFECT_COPY.compressor?.title ?? ""));

    const written = onChainChange.mock.calls[0]?.[0] as HfAudioFxChain | undefined;
    const added = written?.nodes[0]?.params ?? {};
    expect(audioFxProfileStrength("compressor", added)).toBeCloseTo(0.5, 2);
    // And the mechanism agrees with the knob rather than sitting at its default.
    expect(added.makeup).not.toBe(defaultAudioFxParams("compressor").makeup);
  });

  it("gives a module with no single real control a derived one", () => {
    // A compressor has seven controls and an author wants one, but no single one
    // of them can be its face: threshold means nothing without ratio. So the
    // knob is derived, and it sets all five at once.
    const { host, onChainChange } = mount({ chain: chainOf("compressor") });
    const node = fxCard(host);
    expect(EFFECT_COPY.compressor?.primary).toBe("strength");
    // One control on the open face, named for the outcome.
    const rows = Array.from(node.querySelectorAll(".hf-fx-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.querySelector(".hf-fx-label")?.textContent).toBe("Evenness");
    expect(node.querySelector(".hf-fx-node-details")).toBeTruthy();

    // Moving it moves the mechanism underneath.
    const before = defaultAudioFxParams("compressor");
    typeInto(node.querySelector<HTMLInputElement>(".hf-fx-number")!, "0.9");
    act(() =>
      node
        .querySelector(".hf-fx-number")
        ?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
    const next = onChainChange.mock.calls.at(-1)?.[0] as HfAudioFxChain;
    const params = next.nodes[0]?.params ?? {};
    expect(params.ratio).not.toBe(before.ratio);
    expect(params.threshold).not.toBe(before.threshold);
    // And leaves alone what the author set under Details.
    expect(params.knee).toBe(before.knee);
  });

  it("offers presets as the complaint they answer", () => {
    const { host } = mount({ chain: { version: 1, nodes: [] } });
    click(byText(host, "button", "Presets"));
    const item = presetButton(host, "telephone");
    expect(item?.querySelector(".hf-fx-preset-problem")?.textContent).toBe(
      PRESET_PROBLEM.telephone,
    );
    // The name is still there, under it — which is how it gets learned.
    expect(item?.querySelector(".hf-fx-preset-name")?.textContent).toBe("Telephone");
  });

  describe("folding a preset shut", () => {
    const applied = (): HfAudioFxChain => {
      const preset = getAudioFxPreset("telephone");
      if (!preset) throw new Error("no telephone preset");
      return applyAudioFxPreset({ version: 1, nodes: [] }, preset);
    };
    const bracket = (host: HTMLElement) => host.querySelector("[data-fx-preset='telephone']");

    it("hides what it contains, and says how much is in there", () => {
      // A preset is one thing the author added; once it is set, the seven
      // modules inside are detail. Two presets in a rack was thirteen cards
      // deep before anything hand-built appeared.
      const { host } = mount({ chain: applied() });
      const nodes = bracket(host)?.querySelectorAll(".hf-fx-node").length ?? 0;
      expect(nodes).toBeGreaterThan(1);

      click(bracket(host)?.querySelector(".hf-fx-preset-run-label"));
      expect(bracket(host)?.querySelectorAll(".hf-fx-node")).toHaveLength(0);
      // The count is what says it is still a chain rather than one opaque effect.
      expect(bracket(host)?.querySelector(".hf-fx-preset-run-count")?.textContent).toBe(
        String(nodes),
      );
    });

    it("arrives open, so nobody has to discover it is a chain", () => {
      const { host } = mount({ chain: applied() });
      expect(bracket(host)?.hasAttribute("data-collapsed")).toBe(false);
      expect(
        bracket(host)?.querySelector(".hf-fx-preset-run-label")?.getAttribute("aria-expanded"),
      ).toBe("true");
    });

    it("keeps the whole-preset controls reachable while folded", () => {
      // Collapsing hides the detail, not the preset — switching it off or
      // taking it out has to stay possible without unfolding first.
      const { host } = mount({ chain: applied() });
      click(bracket(host)?.querySelector(".hf-fx-preset-run-label"));
      expect(bracket(host)?.querySelector(".hf-fx-preset-run-toggle")).toBeTruthy();
      expect(bracket(host)?.querySelector(".hf-fx-preset-run-remove")).toBeTruthy();
    });

    it("gives each preset its own title treatment", () => {
      // A preset is a character, and the point of Telephone or Megaphone is
      // that you know what it sounds like before you play it. Type carries that.
      const { host } = mount({ chain: applied() });
      const label = bracket(host)?.querySelector<HTMLElement>(".hf-fx-preset-run-label");
      const styled = fxPresetStyle("telephone");
      expect(label?.className).toContain("tracking-[0.3em]");
      expect(label?.style.color).toBeTruthy();
      // And it differs from another preset's, or it is not a treatment.
      expect(styled.type).not.toBe(fxPresetStyle("megaphone").type);
      expect(styled.color).not.toBe(fxPresetStyle("megaphone").color);
    });
  });

  describe("auditioning while the transport is paused", () => {
    it("starts playback so a paused author can hear the preset at all", () => {
      // The audition is written to the running graph, which is silent while the
      // transport is paused — so without this, hovering a preset did nothing
      // whatsoever unless the author happened to be mid-playback.
      const onAuditionTransport = vi.fn();
      const { host } = mount({ chain: chainOf("peaking"), onAuditionTransport });
      click(byText(host, "button", "Presets"));
      act(() => (presetButton(host, "telephone") as HTMLElement | null)?.focus());
      expect(onAuditionTransport).toHaveBeenLastCalledWith(true);
    });

    it("stops it again on the way out", () => {
      const onAuditionTransport = vi.fn();
      const { host } = mount({ chain: chainOf("peaking"), onAuditionTransport });
      click(byText(host, "button", "Presets"));
      act(() => (presetButton(host, "telephone") as HTMLElement | null)?.focus());
      act(() => {
        host
          .querySelector(".hf-fx-preset-menu")
          ?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });
      expect(onAuditionTransport).toHaveBeenLastCalledWith(false);
    });

    it("stops it when the preset is applied, rather than playing on", () => {
      // The click means "keep this", not "and carry on playing from wherever
      // the audition reached".
      const onAuditionTransport = vi.fn();
      const { host } = mount({ chain: { version: 1, nodes: [] }, onAuditionTransport });
      click(byText(host, "button", "Presets"));
      act(() => (presetButton(host, "telephone") as HTMLElement | null)?.focus());
      click(presetButton(host, "telephone"));
      expect(onAuditionTransport).toHaveBeenLastCalledWith(false);
    });

    it("stops it if the panel goes away mid-audition", () => {
      const onAuditionTransport = vi.fn();
      const { host, root } = mount({ chain: chainOf("peaking"), onAuditionTransport });
      click(byText(host, "button", "Presets"));
      act(() => (presetButton(host, "telephone") as HTMLElement | null)?.focus());
      act(() => root.unmount());
      expect(onAuditionTransport).toHaveBeenLastCalledWith(false);
    });
  });

  describe("getting back out of a menu", () => {
    /** Escape, from inside the section, the way a keystroke really arrives. */
    const escape = (host: HTMLElement) =>
      act(() => {
        host
          .querySelector(".hf-fx-section")
          ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

    it("closes the preset shelf with the button that opened it", () => {
      // Opening a menu used to hide both buttons, and picking something was the
      // only thing that set them back — so an author who changed their mind had
      // to add an effect they did not want, or deselect the clip.
      const { host } = mount();
      click(byText(host, "button", "Presets"));
      expect(host.querySelector(".hf-fx-preset-menu")).toBeTruthy();

      click(byText(host, "button", "Close"));
      expect(host.querySelector(".hf-fx-preset-menu")).toBeNull();
      expect(byText(host, "button", "Presets")).toBeTruthy();
    });

    it("closes the add menu the same way", () => {
      const { host } = mount();
      click(host.querySelector(".hf-fx-add"));
      expect(host.querySelector(".hf-fx-add-menu")).toBeTruthy();

      click(host.querySelector(".hf-fx-add"));
      expect(host.querySelector(".hf-fx-add-menu")).toBeNull();
      expect(byText(host, "button", "+ effect")).toBeTruthy();
    });

    it("opens one menu in place of the other", () => {
      // Two open at once is two surfaces covering the rack, and neither says
      // which one the next click belongs to.
      const { host } = mount();
      click(byText(host, "button", "Presets"));
      click(host.querySelector(".hf-fx-add"));
      expect(host.querySelector(".hf-fx-add-menu")).toBeTruthy();
      expect(host.querySelector(".hf-fx-preset-menu")).toBeNull();

      // And back the other way, which is a separate handler.
      click(byText(host, "button", "Presets"));
      expect(host.querySelector(".hf-fx-preset-menu")).toBeTruthy();
      expect(host.querySelector(".hf-fx-add-menu")).toBeNull();
    });

    it("closes on Escape, which is what anyone reaches for first", () => {
      const { host } = mount();
      click(byText(host, "button", "Presets"));
      escape(host);
      expect(host.querySelector(".hf-fx-preset-menu")).toBeNull();

      click(host.querySelector(".hf-fx-add"));
      escape(host);
      expect(host.querySelector(".hf-fx-add-menu")).toBeNull();
    });

    it("puts the chain back when a closing menu was auditioning", () => {
      // Leaving the shelf by closing it is still leaving it, and an audition
      // left playing is audible over a chain the document does not have.
      const { host, onChainPreview } = mount({ chain: chainOf("peaking") });
      click(byText(host, "button", "Presets"));
      act(() => (presetButton(host, "telephone") as HTMLElement | null)?.focus());
      click(byText(host, "button", "Close"));

      const back = onChainPreview.mock.calls.at(-1)?.[0] as HfAudioFxChain;
      expect(back.nodes.map((n) => n.type)).toEqual(["peaking"]);
    });

    it("leaves Escape alone when no menu is open", () => {
      // The panel has its own Escape handling; swallowing the key when this has
      // nothing to close would break it.
      const { host } = mount();
      let reached = false;
      host.addEventListener("keydown", () => {
        reached = true;
      });
      escape(host);
      expect(reached).toBe(true);
    });
  });

  it("shows a wave on a preset only when hovering it can be heard", () => {
    // Hovering plays the preset, and playing is otherwise invisible — the panel
    // looks identical whether the audition is sounding or the pointer is just
    // resting there. Without an audition channel there is no audio to claim.
    const { host } = mount({ chain: { version: 1, nodes: [] } });
    click(byText(host, "button", "Presets"));
    expect(presetButton(host, "telephone")?.querySelector(".hf-fx-preset-wave")).toBeTruthy();

    // Rendered directly rather than through `mount`, which supplies a preview
    // handler by default — the case being covered is a section that has none.
    const { host: dry } = renderInto(
      <FxSection
        chain={{ version: 1, nodes: [] }}
        onChainChange={vi.fn()}
        carve={null}
        onCarveChange={vi.fn()}
        sourceOptions={[]}
      />,
    );
    click(byText(dry, "button", "Presets"));
    expect(presetButton(dry, "telephone")?.querySelector(".hf-fx-preset-wave")).toBeNull();
  });

  describe("hover-audition", () => {
    /** Focus is the keyboard's hover, and both go through the same handler. */
    const enter = (el: Element | null | undefined) => {
      if (!el) throw new Error("element not found");
      act(() => (el as HTMLElement).focus());
    };
    const leave = (host: HTMLElement, sel: string) =>
      act(() => {
        host.querySelector(sel)?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });

    it("plays a preset without committing to it", () => {
      const { host, onChainPreview, onChainChange } = mount({ chain: { version: 1, nodes: [] } });
      click(byText(host, "button", "Presets"));
      enter(presetButton(host, "telephone"));

      const heard = onChainPreview.mock.calls.at(-1)?.[0] as HfAudioFxChain;
      expect(heard.nodes.length).toBeGreaterThan(0);
      expect(heard.nodes.every((n) => n.fromPreset === "telephone")).toBe(true);
      // Heard, not written. Hovering is not a decision.
      expect(onChainChange).not.toHaveBeenCalled();
    });

    it("puts the chain back on the way out", () => {
      const { host, onChainPreview } = mount({ chain: chainOf("peaking") });
      click(byText(host, "button", "Presets"));
      enter(presetButton(host, "telephone"));
      leave(host, ".hf-fx-preset-menu");

      const back = onChainPreview.mock.calls.at(-1)?.[0] as HfAudioFxChain;
      expect(back.nodes.map((n) => n.type)).toEqual(["peaking"]);
    });

    it("does not put the old chain back over the preset it just applied", () => {
      // The audition WAS the preset, so reverting after the write is a race the
      // author hears as it arriving and then leaving again.
      //
      // Applying closes the shelf, so the pointer never leaves it — the revert
      // that would fire is the panel's own teardown, which is what unmounting
      // here exercises. It is also the real route: applying a preset and then
      // clicking another clip does exactly this.
      const { host, root, onChainPreview } = mount({ chain: { version: 1, nodes: [] } });
      click(byText(host, "button", "Presets"));
      enter(presetButton(host, "telephone"));
      const auditions = onChainPreview.mock.calls.length;
      click(presetButton(host, "telephone"));
      act(() => root.unmount());

      expect(onChainPreview.mock.calls.length).toBe(auditions);
    });

    it("puts the chain back if the panel goes away mid-audition", () => {
      // Deselecting the clip while hovering is not a decision either, and the
      // preview channel does not persist — so without this the author hears a
      // chain the document does not have until something else writes.
      const { host, root, onChainPreview } = mount({ chain: chainOf("peaking") });
      click(byText(host, "button", "Presets"));
      enter(presetButton(host, "telephone"));
      act(() => root.unmount());

      const back = onChainPreview.mock.calls.at(-1)?.[0] as HfAudioFxChain;
      expect(back.nodes.map((n) => n.type)).toEqual(["peaking"]);
    });

    it("survives the panel re-rendering under it, which playback does constantly", () => {
      // The group re-renders on every playhead tick to move the automation
      // readouts, handing down a fresh preview callback each time. A teardown
      // keyed on that callback ran on every tick, so an audition reverted itself
      // about thirty times a second — during playback, which is the only time
      // there is anything to audition.
      const { host, root, onChainPreview } = mount({ chain: chainOf("peaking") });
      click(byText(host, "button", "Presets"));
      enter(presetButton(host, "telephone"));
      const auditions = onChainPreview.mock.calls.length;

      // Same behaviour, new identity — exactly what a tick hands down.
      act(() =>
        root.render(
          <FxSection
            chain={chainOf("peaking")}
            onChainChange={vi.fn()}
            onChainPreview={(next) => onChainPreview(next)}
            carve={null}
            onCarveChange={vi.fn()}
            sourceOptions={[{ id: "vo", label: "Voiceover" }]}
          />,
        ),
      );

      expect(onChainPreview.mock.calls.length).toBe(auditions);
    });

    it("auditions an effect the add menu is offering", () => {
      const { host, onChainPreview, onChainChange } = mount({ chain: chainOf("peaking") });
      click(byText(host, "button", "+ effect"));
      enter(byText(host, "button", EFFECT_COPY.reverb?.title ?? ""));

      const heard = onChainPreview.mock.calls.at(-1)?.[0] as HfAudioFxChain;
      expect(heard.nodes.map((n) => n.type)).toEqual(["peaking", "reverb"]);
      expect(onChainChange).not.toHaveBeenCalled();
    });

    it("asks for a levelling measurement on hover, and calls it off on the way out", () => {
      // The one module that cannot answer instantly: there is nothing to hear
      // until the track has been decoded and measured.
      const onAuditionLevel = vi.fn();
      const { host } = mount({
        chain: { version: 1, nodes: [] },
        onLevel: vi.fn(),
        onAuditionLevel,
      });
      click(byText(host, "button", "+ effect"));
      enter(byText(host, "button", "Even Out Levels"));
      expect(onAuditionLevel).toHaveBeenLastCalledWith(true);
      leave(host, ".hf-fx-add-menu");
      expect(onAuditionLevel).toHaveBeenLastCalledWith(false);
    });
  });

  it("adds a preset to what is already there rather than replacing it", () => {
    const existing: HfAudioFxChain = {
      version: 1,
      nodes: [
        { type: "reverb", id: "mine", enabled: true, params: defaultAudioFxParams("reverb") },
      ],
    };
    const { host, onChainChange } = mount({ chain: existing });
    click(byText(host, "button", "Presets"));
    click(presetButton(host, "rumble-cut"));

    const next = onChainChange.mock.calls[0]![0] as HfAudioFxChain;
    expect(next.nodes.map((n) => n.id)).toContain("mine");
    expect(next.nodes.map((n) => n.type)).toEqual(["reverb", "highpass"]);
  });

  it("shows a preset node by the job it is doing, not its filter type", () => {
    const { host } = mount({
      chain: {
        version: 1,
        nodes: [
          {
            type: "peaking",
            id: "a",
            label: "Reduce Mud",
            enabled: true,
            params: defaultAudioFxParams("peaking"),
          },
          {
            type: "peaking",
            id: "b",
            label: "Add Clarity",
            enabled: true,
            params: defaultAudioFxParams("peaking"),
          },
        ],
      } as HfAudioFxChain,
    });
    const names = Array.from(host.querySelectorAll(".hf-fx-node-name")).map((e) =>
      e.textContent?.trim(),
    );
    // Without the label both rows read "Peaking EQ" and an author cannot tell
    // which one is cutting and which is lifting.
    expect(names).toContain("Reduce Mud");
    expect(names).toContain("Add Clarity");
    expect(names).not.toContain("Peaking EQ");
  });

  it("adds a Tone EQ as three ordinary filters on one control surface", () => {
    const { host, onChainChange } = mount({ chain: { version: 1, nodes: [] } });
    click(host.querySelector(".hf-fx-add"));
    click(byText(host, ".hf-fx-add-composite", "Tone (EQ)"));

    const next = onChainChange.mock.calls[0]![0] as HfAudioFxChain;
    expect(next.nodes.map((n) => n.type)).toEqual(["lowshelf", "peaking", "highshelf"]);
    expect(next.nodes.map((n) => n.label)).toEqual(["Bass", "Middle", "Treble"]);
    expect(next.nodes.every((n) => n.fromEq === "eq1")).toBe(true);
  });

  it("shows the EQ as one module, not as its individual bands", () => {
    // The bands belong to the Tone module. Listing them again in the rack would
    // put the same filter on screen twice with two ways to edit it.
    const { host } = mount({
      chain: {
        version: 1,
        nodes: [
          {
            type: "lowshelf",
            id: "a",
            fromEq: "eq1",
            label: "Bass",
            enabled: true,
            params: defaultAudioFxParams("lowshelf"),
          },
          {
            type: "peaking",
            id: "b",
            fromEq: "eq1",
            label: "Middle",
            enabled: true,
            params: defaultAudioFxParams("peaking"),
          },
          {
            type: "highshelf",
            id: "c",
            fromEq: "eq1",
            label: "Treble",
            enabled: true,
            params: defaultAudioFxParams("highshelf"),
          },
        ],
      } as HfAudioFxChain,
    });
    expect(host.querySelectorAll(".hf-fx-eq-module")).toHaveLength(1);
    const names = Array.from(host.querySelectorAll(".hf-fx-node-name")).map((e) =>
      e.textContent?.trim(),
    );
    expect(names).toContain("Tone");
    expect(names).not.toContain("Bass");
    // Closed, it says what it is doing rather than listing three zeroes.
    expect(host.querySelector(".hf-fx-eq-summary")?.textContent).toMatch(/^Flat/);
  });

  it("moves one band without persisting until the fader is released", () => {
    const { host, onChainChange, onChainPreview } = mount({
      chain: {
        version: 1,
        nodes: [
          {
            type: "lowshelf",
            id: "a",
            fromEq: "eq1",
            label: "Bass",
            enabled: true,
            params: defaultAudioFxParams("lowshelf"),
          },
          {
            type: "peaking",
            id: "b",
            fromEq: "eq1",
            label: "Middle",
            enabled: true,
            params: defaultAudioFxParams("peaking"),
          },
          {
            type: "highshelf",
            id: "c",
            fromEq: "eq1",
            label: "Treble",
            enabled: true,
            params: defaultAudioFxParams("highshelf"),
          },
        ],
      } as HfAudioFxChain,
    });
    // The carve module leads the rack, so its header is the first one — open
    // the EQ's own.
    click(host.querySelector(".hf-fx-eq-module .hf-fx-node-name"));
    const fader = host.querySelectorAll<HTMLInputElement>(".hf-fx-eq-fader")[0]!;
    expect(fader, "the EQ did not open").toBeTruthy();
    typeInto(fader, "4");
    // Heard, not written — a persisting write per drag event reloads the
    // composition and restarts the audio.
    expect(onChainPreview).toHaveBeenCalled();
    expect(onChainChange).not.toHaveBeenCalled();

    act(() => fader.dispatchEvent(new Event("pointerup", { bubbles: true })));
    const next = onChainChange.mock.calls[0]![0] as HfAudioFxChain;
    expect(next.nodes.find((n) => n.label === "Bass")!.params!.gain).toBe(4);
    expect(next.nodes.find((n) => n.label === "Middle")!.params!.gain).toBe(0);
  });

  it("offers levelling, and offers to take it away once it is there", () => {
    const onLevel = vi.fn();
    const onRemoveLevel = vi.fn();
    const { host } = mount({ onLevel, onRemoveLevel });
    click(host.querySelector(".hf-fx-add"));
    click(byText(host, ".hf-fx-add-composite", "Even Out Levels"));
    expect(onLevel).toHaveBeenCalledTimes(1);

    const already = mount({ onLevel, onRemoveLevel, levelled: true });
    click(already.host.querySelector(".hf-fx-add"));
    // The same control, because adding a second levelling stage is never what
    // an author means by pressing it twice.
    click(byText(already.host, ".hf-fx-add-composite", "Remove levelling"));
    expect(onRemoveLevel).toHaveBeenCalledTimes(1);
  });

  it("cannot move the ends past themselves", () => {
    const { host } = mount({ chain: chainOf("peaking", "reverb") });
    const ups = host.querySelectorAll('.hf-fx-move[title="Move up"]');
    const downs = host.querySelectorAll('.hf-fx-move[title="Move down"]');
    expect((ups[0] as HTMLButtonElement).disabled).toBe(true);
    expect((downs[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("removes an effect", () => {
    const { host, onChainChange } = mount({ chain: chainOf("peaking", "reverb") });
    click(host.querySelector(".hf-fx-remove"));
    const next = onChainChange.mock.calls[0]![0] as HfAudioFxChain;
    expect(next.nodes.map((n) => n.type)).toEqual(["reverb"]);
  });

  it("previews while dragging and only persists on release", () => {
    // Persisting on every input event refreshes the preview, which reloads the
    // composition and restarts audio — that is what made playback stutter.
    const { host, onChainChange, onChainPreview } = mount({ chain: chainOf("peaking") });
    // Details, because this is about the drag mechanics on a real control and
    // the frequency it asserts on is not the one knob the module opens with.
    openDetails(host);
    const slider = fxCard(host).querySelector<HTMLInputElement>(".hf-fx-slider")!;
    act(() => slider.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    for (const v of ["5000", "10000", "15000"]) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      act(() => {
        setter?.call(slider, v);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(onChainPreview.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onChainChange).not.toHaveBeenCalled();

    act(() => slider.dispatchEvent(new Event("pointerup", { bubbles: true })));
    expect(onChainChange).toHaveBeenCalledTimes(1);
  });

  it("stays where it was dropped while the write is still coming back", () => {
    // The value only returns after the attribute is written and the selection
    // resynced — and for a carve, after the analysis that write kicks off. Dropping
    // back to the prop in that gap made the control snap to where the drag started
    // and then jump to where it ended.
    const { host } = mount({ chain: chainOf("peaking") });
    const card = fxCard(host);
    const slider = card.querySelector<HTMLInputElement>(".hf-fx-slider")!;
    const number = card.querySelector<HTMLInputElement>(".hf-fx-number")!;
    const before = number.value;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => slider.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    act(() => {
      setter?.call(slider, "8000");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const dragged = number.value;
    expect(dragged).not.toBe(before);
    // Release. The parent is a spy here, so the prop never updates — exactly the
    // window the snap happened in.
    act(() => slider.dispatchEvent(new Event("pointerup", { bubbles: true })));
    expect(number.value).toBe(dragged);
  });

  it("adopts a value that comes back different from the one dragged to", () => {
    // Held only until there is newer information — a clamp upstream, an undo, or
    // any other write must still win over the gesture's own guess.
    const shared = {
      onChainChange: vi.fn(),
      onChainPreview: vi.fn(),
      carve: null,
      onCarveChange: vi.fn(),
      sourceOptions: [{ id: "vo", label: "Voiceover" }],
    };
    const { host, root } = renderInto(<FxSection {...shared} chain={chainOf("peaking")} />);
    openDetails(host);
    const slider = fxCard(host).querySelector<HTMLInputElement>(".hf-fx-slider")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => slider.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    act(() => {
      setter?.call(slider, "8000");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => slider.dispatchEvent(new Event("pointerup", { bubbles: true })));
    // The write came back as something else entirely.
    act(() =>
      root.render(
        <FxSection
          {...shared}
          chain={{
            version: 1,
            nodes: [
              {
                type: "peaking",
                enabled: true,
                params: { ...defaultAudioFxParams("peaking"), frequency: 1234 },
              },
            ],
          }}
        />,
      ),
    );
    expect(fxCard(host).querySelector<HTMLInputElement>(".hf-fx-number")!.value).toBe("1234");
  });

  it("commits an enum immediately, since a select has no drag", () => {
    const { host, onChainChange } = mount({ chain: chainOf("saturate") });
    openDetails(host);
    const select = fxCard(host).querySelector<HTMLSelectElement>(".hf-fx-select")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    act(() => {
      setter?.call(select, "atan");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChainChange).toHaveBeenCalledTimes(1);
  });

  it("clamps a typed value into the renderable range", () => {
    const { host, onChainChange } = mount({ chain: chainOf("peaking") });
    openDetails(host);
    const input = fxCard(host).querySelector<HTMLInputElement>(".hf-fx-number")!;
    typeInto(input, "999999");
    // React delegates onBlur through focusout, which is the event that bubbles.
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    const next = onChainChange.mock.calls.at(-1)![0] as HfAudioFxChain;
    expect(next.nodes[0]!.params!.frequency).toBe(20000);
  });
});

describe("FxSection carve module", () => {
  /**
   * A carve is one thing an author turned on, not the six filters it happens to
   * compile to. Listed individually they read as hand-built effects: removable
   * one at a time, reorderable, each with knobs that the next strength change
   * overwrites without warning.
   */
  it("shows the carve's effects as one module, alongside hand-built ones", () => {
    const { host } = mount({ chain: carved });
    const rows = Array.from(host.querySelectorAll<HTMLElement>(".hf-fx-node"));
    // One row for the carve, one for the low-pass the author added.
    expect(rows).toHaveLength(2);
    expect(host.querySelector(".hf-fx-carve-module")).not.toBeNull();
    expect(host.querySelector(".hf-fx-carve-module")?.textContent).toContain("Voiceover carve");
  });

  it("says what the module contains, since its parts are not listed", () => {
    const { host } = mount({ chain: carved });
    const text = host.querySelector(".hf-fx-carve-module")?.textContent ?? "";
    expect(text).toMatch(/2 bands/);
    expect(text).toMatch(/level/);
  });

  it("offers one switch for the whole carve, not a bypass and a delete", () => {
    // The module is the unit: there is nothing meaningful between "carving" and
    // "not carving", and two buttons implied there was.
    const { host } = mount({ chain: carved });
    const module = host.querySelector<HTMLElement>(".hf-fx-carve-module")!;
    expect(module.querySelectorAll(".hf-fx-remove")).toHaveLength(0);
    expect(module.querySelectorAll(".hf-fx-carve-toggle")).toHaveLength(1);
  });

  it("switching it off records that, rather than erasing the settings", () => {
    // An absent carve reads as never-configured, and a bed with one voice above it
    // is carved by default — so erasing would re-apply it on the next selection.
    const onCarveChange = vi.fn();
    const { host } = mount({
      chain: carved,
      carve: { ...DEFAULT_CARVE, sources: ["vo"] },
      onCarveChange,
    });
    act(() => host.querySelector<HTMLButtonElement>(".hf-fx-carve-toggle")!.click());
    expect(onCarveChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, sources: ["vo"] }),
    );
  });

  it("lists what each effect inside it is set to", () => {
    // Grouped is not hidden: the carve compiles to real filters and an author has
    // to be able to see where they landed. What they cannot do is edit them by
    // hand — strength owns those numbers — so the settings read out rather than
    // offering controls that the next adjustment would overwrite.
    const { host } = mount({ chain: carved });
    const module = ensureCarveOpen(host);
    const members = Array.from(module.querySelectorAll<HTMLElement>(".hf-fx-carve-member"));
    expect(members).toHaveLength(3);
    // Named by what tells them apart, the way the timeline lanes name them.
    expect(members.map((m) => m.querySelector(".hf-fx-carve-member-name")?.textContent)).toEqual([
      "Peaking EQ 400 Hz",
      "Peaking EQ 1.6 kHz",
      "Gain",
    ]);
    // And every one of its settings is visible.
    const first = members[0]!.textContent ?? "";
    expect(first).toContain("Gain");
    expect(first).toMatch(/-6(\.0)? dB/);
    expect(first).toMatch(/1\.4/); // Q
  });

  it("reads the analysis out rather than offering controls over it", () => {
    // The module's own knobs — voice, strength, dynamic — are the carve's controls.
    // What the analysis produced is not editable by hand: strength owns those
    // numbers and the next adjustment would overwrite anything typed here.
    const { host } = mount({ chain: carved });
    const module = ensureCarveOpen(host);
    expect(module.querySelector(".hf-fx-carve-members")!.querySelectorAll("input")).toHaveLength(0);
    // The controls themselves are present, in the same card.
    expect(module.querySelectorAll(".hf-fx-carve-controls input").length).toBeGreaterThan(0);
    expect(module.querySelector(".hf-fx-carve-controls .hf-fx-carve-source")).not.toBeNull();
  });

  it("says which of them the timeline is driving", () => {
    // A carve in dynamic mode automates every one of these, and that is where the
    // values come from — so the module has to point at the lane rather than look
    // like a static setting.
    const { host } = mount({
      chain: carved,
      automatedTargets: new Set(["fx.n1.gain", "fx.n3.gain"]),
    });
    const module = ensureCarveOpen(host);
    const automated = Array.from(module.querySelectorAll("[data-automated]"));
    expect(automated).toHaveLength(2);
  });

  it("keeps the summary readable while collapsed", () => {
    const { host } = mount({ chain: carved });
    const module = host.querySelector<HTMLElement>(".hf-fx-carve-module")!;
    // Collapse it: the module opens by default now, because it holds the controls.
    act(() => module.querySelector<HTMLButtonElement>(".hf-fx-node-name")!.click());
    expect(module.querySelectorAll(".hf-fx-carve-member")).toHaveLength(0);
    expect(module.querySelectorAll(".hf-fx-carve-controls")).toHaveLength(0);
    expect(module.textContent).toContain("2 bands + level");
  });

  it("offers no per-effect controls inside the module", () => {
    // Reordering or editing one band is meaningless: the next strength change
    // rewrites every one of them.
    const { host } = mount({ chain: carved });
    const module = host.querySelector(".hf-fx-carve-module")!;
    expect(module.querySelectorAll(".hf-fx-move")).toHaveLength(0);
    // One range in the card — Strength, the carve's own — and none per band.
    expect(module.querySelectorAll("input[type=range]")).toHaveLength(1);
    expect(module.querySelectorAll(".hf-fx-carve-members input[type=range]")).toHaveLength(0);
  });
});

describe("FxSection carve", () => {
  it("is off by default and is not an entry in the chain", () => {
    const { host } = mount();
    expect(host.querySelector(".hf-fx-carve")).toBeTruthy();
    const items = openAddMenuItems(host);
    expect(items).not.toContain("Voiceover carve");
  });

  it("presents itself on, at the default strength", () => {
    // A bed under a voice wants carving, so the module does not start switched off
    // waiting to be discovered.
    const { host } = mount();
    const module = host.querySelector<HTMLElement>(".hf-fx-carve-module")!;
    expect(module.querySelector(".hf-fx-carve-toggle")?.getAttribute("aria-pressed")).toBe("true");
    expect(
      Number(module.querySelector<HTMLInputElement>(".hf-fx-carve-controls .hf-fx-number")!.value),
    ).toBe(DEFAULT_CARVE.strength);
    // No dynamic switch: every carve follows the voice now, because a static one
    // thinned the bed through every pause and nobody wanted that once they heard both.
    expect(module.querySelector(".hf-fx-carve-dynamic")).toBeNull();
  });

  it("lists every other audio track as something to make room for", () => {
    // Two candidates, so they are things to include rather than one readout.
    const { host } = mount({
      carve: { ...DEFAULT_CARVE },
      sourceOptions: [
        { id: "vo", label: "Voiceover" },
        { id: "nar", label: "Narration" },
      ],
    });
    const options = Array.from(host.querySelectorAll(".hf-fx-carve-sources label")).map((o) =>
      o.textContent?.trim(),
    );
    expect(options).toContain("Voiceover");
    expect(options).toContain("Narration");
  });

  it("offers no analyse button — picking a voice is the whole gesture", () => {
    // A carve with a source and no filters is a setting nobody applied; the
    // button was a second step for something the panel already knew to do.
    const { host } = mount({ carve: { ...DEFAULT_CARVE, sources: ["vo"] } });
    expect(host.querySelector(".hf-fx-analyse")).toBeNull();
    // No button offering it. The card may still SAY the analysis has not happened —
    // that is a status, not a step to take.
    const buttons = Array.from(host.querySelectorAll("button")).map((b) => b.textContent ?? "");
    expect(buttons.filter((t) => /analys/i.test(t))).toHaveLength(0);
  });

  it("says when it is working, since there is no button to grey out", () => {
    const { host } = mount({ carve: { ...DEFAULT_CARVE, sources: ["vo"] }, analysing: true });
    expect(host.querySelector(".hf-fx-carve-working")?.textContent).toMatch(/Analysing/i);
    // A spinner, not just a word: the analysis decodes both tracks and can take a
    // moment, and a static line reads as a state rather than as work in progress.
    expect(host.querySelector(".hf-fx-carve-spinner")).not.toBeNull();
    // Honours a reader who asked for less movement.
    expect(host.querySelector(".hf-fx-carve-spinner")?.getAttribute("class")).toContain(
      "motion-reduce:animate-none",
    );
  });

  it("clears the previous analysis while a new one runs", () => {
    // Moving strength re-derives every one of those numbers, so leaving them up
    // shows settings that are already history as though they were in force.
    const { host } = mount({
      chain: carved,
      carve: { ...DEFAULT_CARVE, sources: ["vo"] },
      analysing: true,
    });
    const module = host.querySelector<HTMLElement>(".hf-fx-carve-module")!;
    expect(module.querySelectorAll(".hf-fx-carve-member")).toHaveLength(0);
    expect(module.querySelector(".hf-fx-carve-spinner")).not.toBeNull();
    // The controls stay put — only the analysis is in flight.
    expect(module.querySelector(".hf-fx-carve-controls .hf-fx-slider")).not.toBeNull();
  });

  it("shows the analysis again once it lands", () => {
    const { host } = mount({ chain: carved, carve: { ...DEFAULT_CARVE, sources: ["vo"] } });
    const module = host.querySelector<HTMLElement>(".hf-fx-carve-module")!;
    expect(module.querySelectorAll(".hf-fx-carve-member").length).toBeGreaterThan(0);
    expect(module.querySelector(".hf-fx-carve-spinner")).toBeNull();
  });

  it("disables everything when the panel is read-only", () => {
    const { host } = mount({ chain: chainOf("peaking"), disabled: true });
    for (const b of Array.from(host.querySelectorAll("button.hf-fx-bypass, .hf-fx-remove"))) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe("automation in the panel", () => {
  const automatable = (chain: HfAudioFxChain, over = {}) =>
    mount({
      chain,
      automatedTargets: new Set<string>(),
      onAutomateParam: vi.fn(),
      onRemoveParamAutomation: vi.fn(),
      ...over,
    });

  const idChain = (type: string, id = "n1"): HfAudioFxChain => ({
    version: 1,
    nodes: [{ type, id, enabled: true, params: defaultAudioFxParams(type) }],
  });

  const rowFor = (host: HTMLElement, label: string): HTMLElement | null => {
    for (const row of Array.from(host.querySelectorAll<HTMLElement>(".hf-fx-row"))) {
      if (row.querySelector(".hf-fx-label")?.textContent === label) return row;
    }
    return null;
  };

  it("offers an automate button only for parameters an envelope can drive", () => {
    // Saturate: `output` is a make-up gain, but the curve's type and threshold
    // are rebuilt wholesale and cannot be scheduled.
    const { host } = automatable(idChain("saturate"));
    // Under Details, where the real parameters are: the derived knob on the open
    // face has no AudioParam behind it and nothing to automate.
    openDetails(host);
    expect(
      rowFor(host, plainLabel("saturate", "output"))?.querySelector(".hf-fx-automate"),
    ).toBeTruthy();
    expect(
      rowFor(host, plainLabel("saturate", "threshold"))?.querySelector(".hf-fx-automate"),
    ).toBeNull();
  });

  it("offers nothing for a worklet effect, which exposes no AudioParams", () => {
    const { host } = automatable(idChain("compressor"));
    expect(host.querySelectorAll(".hf-fx-automate").length).toBe(0);
  });

  it("asks to automate a parameter by node id and key", () => {
    const onAutomateParam = vi.fn();
    const { host } = automatable(idChain("lowpass", "n7"), { onAutomateParam });
    const button = rowFor(host, plainLabel("lowpass", "frequency"))!.querySelector(
      ".hf-fx-automate",
    ) as HTMLButtonElement;
    expect(button.hasAttribute("title")).toBe(false);
    act(() => button.click());
    expect(onAutomateParam).toHaveBeenCalledWith("n7", "frequency");
  });

  it("disables an automated control, since a value typed here would be overwritten", () => {
    const { host } = automatable(idChain("lowpass"), {
      automatedTargets: new Set(["fx.n1.frequency"]),
    });
    const row = rowFor(host, plainLabel("lowpass", "frequency"))!;
    expect(row.querySelector<HTMLInputElement>('input[type="range"]')?.disabled).toBe(true);
    expect(row.querySelector<HTMLInputElement>('input[type="number"]')?.disabled).toBe(true);
    expect(row.hasAttribute("data-automated")).toBe(true);
    // A sibling parameter on the same effect stays editable — one click in,
    // which is where every control that is not the primary one lives.
    openDetails(host);
    const q = rowFor(host, plainLabel("lowpass", "q"))!;
    expect(q.querySelector<HTMLInputElement>('input[type="range"]')?.disabled).toBe(false);
  });

  it("turns the automated parameter's button into a delete", () => {
    const onRemoveParamAutomation = vi.fn();
    const { host } = automatable(idChain("lowpass"), {
      automatedTargets: new Set(["fx.n1.frequency"]),
      onRemoveParamAutomation,
    });
    const button = rowFor(host, plainLabel("lowpass", "frequency"))!.querySelector(
      ".hf-fx-automate",
    ) as HTMLButtonElement;
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toMatch(/remove/i);
    // The wording lives in the Tooltip component, which only renders its bubble
    // on hover; the button itself carries no native title hover.
    expect(button.hasAttribute("title")).toBe(false);
    act(() => button.click());
    expect(onRemoveParamAutomation).toHaveBeenCalledWith("n1", "frequency");
  });

  it("shows the wording in a tooltip bubble, not a native browser hover", async () => {
    vi.useFakeTimers();
    try {
      const { host } = automatable(idChain("lowpass"), {
        automatedTargets: new Set(["fx.n1.frequency"]),
      });
      const button = rowFor(host, plainLabel("lowpass", "frequency"))!.querySelector(
        ".hf-fx-automate",
      ) as HTMLButtonElement;
      // Tooltip positions itself from the trigger's box and gives up on a 0x0
      // one, which is every element in happy-dom.
      vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
        x: 100,
        y: 300,
        left: 100,
        top: 300,
        right: 116,
        bottom: 316,
        width: 16,
        height: 16,
        toJSON: () => ({}),
      } as DOMRect);
      // React synthesises pointer-enter from pointerover and delegates focus via
      // focusin; focus is also how a keyboard user reaches the same tooltip.
      act(() => {
        button.dispatchEvent(new Event("focusin", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      const bubble = document.querySelector('[role="tooltip"]');
      expect(bubble?.textContent).toBe("Automated");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cannot automate a node with no id, which a lane could not address", () => {
    const { host } = automatable({
      version: 1,
      nodes: [{ type: "lowpass", enabled: true, params: defaultAudioFxParams("lowpass") }],
    });
    expect(host.querySelectorAll(".hf-fx-automate").length).toBe(0);
  });

  it("gives a newly added effect an id, so its parameters can be automated", () => {
    const onChainChange = vi.fn();
    const { host } = mount({ chain: { version: 1, nodes: [] }, onChainChange });
    const add = host.querySelector(".hf-fx-add") as HTMLButtonElement;
    act(() => add.click());
    const item = Array.from(host.querySelectorAll<HTMLButtonElement>(".hf-fx-add-item")).find(
      (b) => b.textContent === EFFECT_COPY.lowpass?.title,
    )!;
    act(() => item.click());
    expect(onChainChange.mock.calls[0][0].nodes[0].id).toBe("n1");
  });
});

describe("voiceover carve visibility", () => {
  const carveBlock = (host: HTMLElement) => host.querySelector(".hf-fx-carve");

  it("is hidden when the composition has no other audio track to listen to", () => {
    // Carve dips this bed where another track's voice sits. Alone, the control
    // could only offer an empty picker.
    const { host } = mount({ chain: chainOf("lowpass"), sourceOptions: [] });
    expect(carveBlock(host)).toBeNull();
  });

  it("is shown once there is another audio track", () => {
    const { host } = mount({
      chain: chainOf("lowpass"),
      sourceOptions: [{ id: "vo", label: "vo" }],
    });
    expect(carveBlock(host)).toBeTruthy();
  });

  it("stays shown for an existing carve whose voice track has gone", () => {
    // Otherwise the setting would keep dipping the bed from out of sight.
    const { host } = mount({
      chain: chainOf("lowpass"),
      sourceOptions: [],
      carve: { ...DEFAULT_CARVE, sources: ["vo"] },
    });
    expect(carveBlock(host)).toBeTruthy();
  });
});

vi.mock("../../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { __resetDesignInputThrottle } from "../../utils/designInputTracking";
import { DesignPanelInputProvider } from "../../contexts/DesignPanelInputContext";
function renderTrackedFx(props: Partial<Parameters<typeof FxSection>[0]> = {}) {
  vi.mocked(trackStudioEvent).mockClear();
  __resetDesignInputThrottle();
  return renderInto(
    <DesignPanelInputProvider ui="flat" section="media">
      <FxSection
        chain={chainOf("lowpass", "gain")}
        onChainChange={vi.fn()}
        carve={null}
        onCarveChange={vi.fn()}
        sourceOptions={[]}
        {...props}
      />
    </DesignPanelInputProvider>,
  );
}

describe("custom FX inspector input usage", () => {
  it.each([
    [".hf-fx-bypass", "toggle", "effect-bypass"],
    ['.hf-fx-move[title="Move down"]', "button", "move-effect"],
    [".hf-fx-remove", "button", "remove-effect"],
  ])("tracks %s through design_input once", (selector, control, name) => {
    const onChainChange = vi.fn();
    const { host, root } = renderTrackedFx({ onChainChange });
    click(host.querySelector(selector));
    expect(onChainChange).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(trackStudioEvent).mock.calls.filter(([event]) => event === "design_input"),
    ).toEqual([["design_input", { ui: "flat", section: "media", control, name }]]);
    expect(vi.mocked(trackStudioEvent).mock.calls.some(([event]) => event === "feature_used")).toBe(
      false,
    );
    act(() => root.unmount());
  });
  it.each([false, true])("tracks a levelling button once (already levelled: %s)", (levelled) => {
    const action = vi.fn();
    const { host, root } = renderTrackedFx({ levelled, onLevel: action, onRemoveLevel: action });
    click(byText(host, "button", "+ effect"));
    vi.mocked(trackStudioEvent).mockClear();
    click(byText(host, "button", levelled ? "Remove levelling" : "Even Out Levels"));
    expect(action).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("design_input", {
      ui: "flat",
      section: "media",
      control: "button",
      name: levelled ? "remove-levelling" : "add-levelling",
    });
    act(() => root.unmount());
  });
});
