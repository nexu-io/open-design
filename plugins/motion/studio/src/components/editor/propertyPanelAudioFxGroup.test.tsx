// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { AudioFxGroup } from "./propertyPanelAudioFxGroup.js";
import type { DomEditSelection } from "./domEditingTypes";
import { EFFECT_COPY } from "@hyperframes/core/audio-fx-copy";
import { liveTime, usePlayerStore } from "../../player";

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

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHAIN = JSON.stringify({
  version: 1,
  nodes: [{ type: "lowpass", id: "n1", params: { frequency: 900, q: 1.2, poles: "2" } }],
});

// Each mount appends its tracks to the document; without clearing, a later
// "only one audio track" case would still find the previous test's sibling.
afterEach(() => {
  document.body.innerHTML = "";
});

/**
 * A selected `<audio>` with sibling tracks, so carve — which needs another track
 * to listen to — is offered.
 *
 * TWO siblings by default, on purpose. One candidate voice is unambiguous and the
 * panel carves the bed by itself, which is right in the product and wrong as a
 * background condition for a test about something else: every write assertion
 * would have to account for a carve nobody in the test asked for. Two leaves the
 * choice open, so nothing is applied until a test picks. `voices: 1` is how the
 * auto-apply tests opt in, `alone` for a composition holding just this track.
 */
function audioSelection(
  dataAttributes: Record<string, string>,
  alone = false,
  voices = 2,
): DomEditSelection {
  const bed = document.createElement("audio");
  bed.id = "bed";
  document.body.append(bed);
  if (!alone) {
    for (let i = 0; i < voices; i += 1) {
      const voice = document.createElement("audio");
      // The first keeps the id every existing test names.
      voice.id = i === 0 ? "vo" : `vo${i + 1}`;
      document.body.append(voice);
    }
  }
  return { dataAttributes, id: "bed", element: bed } as unknown as DomEditSelection;
}

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

/** A button found by the text it contains, since several now read as sentences. */
function byTextButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
}

const SAMPLE_RATE = 48000;

function mount(dataAttributes: Record<string, string>, alone = false, voices = 2) {
  // Every write is quiet: persisted without the preview reload that would
  // restart every playing track, but with a selection resync so the panel sees
  // what it just wrote.
  const onSetAttributeQuiet = vi.fn();
  const onSetAttributeLive = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const selection = audioSelection(dataAttributes, alone, voices);
  act(() => {
    createRoot(host).render(
      <AudioFxGroup
        element={selection}
        onSetAttributeQuiet={onSetAttributeQuiet}
        onSetAttributeLive={onSetAttributeLive}
      />,
    );
  });
  return { host, onSetAttributeQuiet, onSetAttributeLive };
}

function mountGroup(memberStart: number, memberTag: "audio" | "video" = "audio") {
  const bus = document.createElement("hf-audio-group");
  bus.id = "voiceover";
  document.body.append(bus);
  const member = document.createElement(memberTag);
  member.id = "vo-1";
  member.setAttribute("data-audio-group", "voiceover");
  member.setAttribute("data-start", String(memberStart));
  member.setAttribute("data-duration", "5");
  document.body.append(member);

  const host = document.createElement("div");
  document.body.append(host);
  const selection = {
    dataAttributes: { "fx-chain": CHAIN },
    id: "voiceover",
    element: bus,
    tagName: "hf-audio-group",
  } as unknown as DomEditSelection;
  act(() => {
    createRoot(host).render(
      <AudioFxGroup
        element={selection}
        onSetAttributeQuiet={vi.fn()}
        onSetAttributeLive={vi.fn()}
      />,
    );
  });
  return host;
}

const rowFor = (host: HTMLElement, label: string): HTMLElement | null => {
  for (const row of Array.from(host.querySelectorAll<HTMLElement>(".hf-fx-row"))) {
    if (row.querySelector(".hf-fx-label")?.textContent === label) return row;
  }
  return null;
};

const parseWrite = (call: unknown[]) => JSON.parse(String(call[1]));

/**
 * The last write to one attribute.
 *
 * Positional indexing broke once a bed with voices above it started carving itself
 * on mount: the carve's own writes share the queue with whatever the test did.
 */
const writeTo = (calls: unknown[][], attr: string): unknown[] | undefined =>
  calls.filter((c) => c[0] === attr).at(-1);

describe("AudioFxGroup automation", () => {
  it("renders the chain's parameters", () => {
    const { host } = mount({ "fx-chain": CHAIN });
    // The one knob that carries the module is on the open face; the rest are one
    // click away, which is what Details is.
    expect(rowFor(host, plainLabel("lowpass", "frequency"))).toBeTruthy();
    expect(rowFor(host, plainLabel("lowpass", "q"))).toBeNull();
    openDetails(host);
    expect(rowFor(host, plainLabel("lowpass", "q"))).toBeTruthy();
  });

  it("seeds a new lane at the value the control already holds", () => {
    // Switching to an envelope must not change the sound — only where the value
    // comes from. The chain has frequency at 900, not the registry default.
    const { host, onSetAttributeQuiet } = mount({ "fx-chain": CHAIN });
    const button = rowFor(host, plainLabel("lowpass", "frequency"))!.querySelector(
      ".hf-fx-automate",
    ) as HTMLButtonElement;
    act(() => button.click());
    const write = writeTo(onSetAttributeQuiet.mock.calls, "data-automation");
    expect(write).toBeTruthy();
    expect(JSON.parse(String(write![1]))).toEqual({
      version: 1,
      lanes: [{ target: "fx.n1.frequency", points: [{ t: 0, v: 900 }] }],
    });
  });

  it("keeps lanes it is not touching when adding one", () => {
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": CHAIN,
      automation: JSON.stringify({
        version: 1,
        lanes: [{ target: "volume", points: [{ t: 0, v: 0.5 }] }],
      }),
    });
    openDetails(host);
    act(() =>
      (
        rowFor(host, plainLabel("lowpass", "q"))!.querySelector(
          ".hf-fx-automate",
        ) as HTMLButtonElement
      ).click(),
    );
    expect(
      parseWrite(writeTo(onSetAttributeQuiet.mock.calls, "data-automation")!).lanes.map(
        (l: { target: string }) => l.target,
      ),
    ).toEqual(["volume", "fx.n1.q"]);
  });

  it("disables a control the timeline already drives", () => {
    const { host } = mount({
      "fx-chain": CHAIN,
      automation: JSON.stringify({
        version: 1,
        lanes: [{ target: "fx.n1.frequency", points: [{ t: 0, v: 400 }] }],
      }),
    });
    const cutoff = rowFor(host, plainLabel("lowpass", "frequency"))!;
    expect(cutoff.querySelector<HTMLInputElement>('input[type="range"]')?.disabled).toBe(true);
    expect(cutoff.hasAttribute("data-automated")).toBe(true);
    openDetails(host);
    expect(
      rowFor(host, plainLabel("lowpass", "q"))!.querySelector<HTMLInputElement>(
        'input[type="range"]',
      )?.disabled,
    ).toBe(false);
  });

  it("deletes just that lane, handing the value back to the control", () => {
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": CHAIN,
      automation: JSON.stringify({
        version: 1,
        lanes: [
          { target: "fx.n1.frequency", points: [{ t: 0, v: 400 }] },
          { target: "volume", points: [{ t: 0, v: 0.5 }] },
        ],
      }),
    });
    act(() =>
      (
        rowFor(host, plainLabel("lowpass", "frequency"))!.querySelector(
          ".hf-fx-automate",
        ) as HTMLButtonElement
      ).click(),
    );
    expect(
      parseWrite(writeTo(onSetAttributeQuiet.mock.calls, "data-automation")!).lanes.map(
        (l: { target: string }) => l.target,
      ),
    ).toEqual(["volume"]);
  });

  it("clears the attribute when the last lane goes", () => {
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": CHAIN,
      automation: JSON.stringify({
        version: 1,
        lanes: [{ target: "fx.n1.frequency", points: [{ t: 0, v: 400 }] }],
      }),
    });
    act(() =>
      (
        rowFor(host, plainLabel("lowpass", "frequency"))!.querySelector(
          ".hf-fx-automate",
        ) as HTMLButtonElement
      ).click(),
    );
    // Null rather than "": the live path removes an attribute it is given null for.
    expect(writeTo(onSetAttributeQuiet.mock.calls, "data-automation")![1]).toBeNull();
  });

  it("ignores a lane for an effect that is no longer in the chain", () => {
    const { host } = mount({
      "fx-chain": CHAIN,
      automation: JSON.stringify({
        version: 1,
        lanes: [{ target: "fx.gone.frequency", points: [{ t: 0, v: 400 }] }],
      }),
    });
    // Nothing is automated, so every control stays live.
    expect(
      rowFor(host, plainLabel("lowpass", "frequency"))!.querySelector<HTMLInputElement>(
        'input[type="range"]',
      )?.disabled,
    ).toBe(false);
  });
});

describe("AudioFxGroup carve", () => {
  const carvedChain = JSON.stringify({
    version: 1,
    nodes: [
      { type: "peaking", id: "n1", fromCarve: true, params: { frequency: 900, gain: -6, q: 1.4 } },
      { type: "lowpass", id: "n2", params: { frequency: 400, q: 0.9, poles: "2" } },
    ],
  });

  const carveOn = JSON.stringify({ sources: ["vo"], strength: 0.5 });

  const carveToggle = (host: HTMLElement): HTMLButtonElement => {
    const block = host.querySelector(".hf-fx-carve")!;
    return block.querySelector(".hf-fx-bypass") as HTMLButtonElement;
  };

  it("removes the filters it generated when carve is switched off", async () => {
    // Leaving them behind would keep dipping the bed with no carve to explain it.
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": carvedChain,
      "fx-carve": carveOn,
    });
    await act(async () => {
      carveToggle(host).click();
    });
    const chainWrite = onSetAttributeQuiet.mock.calls.find((c) => c[0] === "data-fx-chain");
    expect(chainWrite).toBeTruthy();
    const kept = JSON.parse(String(chainWrite![1])).nodes;
    expect(kept.map((n: { type: string }) => n.type)).toEqual(["lowpass"]);
    // The settings stay, marked off — after the chain write, not alongside it: both
    // are read-modify-writes of the same file, so fired together the later one reads
    // pre-edit content and drops the earlier. Kept rather than erased because an
    // absent carve reads as never-configured, and a bed with one voice above it is
    // carved by default: erasing would re-apply it on the next selection.
    expect(onSetAttributeQuiet.mock.calls.map((c) => c[0])).toEqual([
      "data-fx-chain",
      "data-fx-carve",
    ]);
    const carveWrite = onSetAttributeQuiet.mock.calls.find((c) => c[0] === "data-fx-carve");
    expect(JSON.parse(String(carveWrite![1])).enabled).toBe(false);
  });

  it("leaves a hand-built chain alone when carve is switched off", () => {
    const handBuilt = JSON.stringify({
      version: 1,
      nodes: [{ type: "lowpass", id: "n1", params: { frequency: 400, q: 0.9, poles: "2" } }],
    });
    const { host, onSetAttributeQuiet } = mount({ "fx-chain": handBuilt, "fx-carve": carveOn });
    act(() => carveToggle(host).click());
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-chain")).toBe(false);
  });

  it("drags a carve dial live and persists once on release", () => {
    // Without the split every pointermove patched the source file and resynced
    // the selection, which is what makes the audio stutter mid-drag.
    const { host, onSetAttributeQuiet, onSetAttributeLive } = mount({
      "fx-chain": carvedChain,
      "fx-carve": carveOn,
    });
    const dial = host.querySelector<HTMLInputElement>(".hf-fx-carve input[type=range]");
    expect(dial).not.toBeNull();
    act(() => {
      // React's value tracker swallows a plain assignment, so go through the
      // prototype setter the way the other panel tests do.
      // A different value than the carve holds; setting the same one is not a change.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dial, "0.8");
      dial?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onSetAttributeLive.mock.calls.map((c) => c[0])).toEqual(["data-fx-carve"]);
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(false);
    act(() => dial?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(true);
  });

  it("writes carve settings quietly, so switching it does not reload the preview", async () => {
    // A reload restarts every playing track, which is heard as the audio chopping.
    // Awaited because switching off drops the generated filters first, and both
    // writes touch the same file — the settings land on the next microtask.
    const { host, onSetAttributeQuiet } = mount({ "fx-chain": carvedChain, "fx-carve": carveOn });
    await act(async () => {
      carveToggle(host).click();
    });
    const write = onSetAttributeQuiet.mock.calls.find((c) => c[0] === "data-fx-carve");
    expect(write).toBeTruthy();
    expect(JSON.parse(String(write![1])).enabled).toBe(false);
  });
});

describe("AudioFxGroup dynamic carve", () => {
  const carvedChain = JSON.stringify({
    version: 1,
    nodes: [{ type: "lowpass", id: "n1", params: { frequency: 400, q: 0.9, poles: "2" } }],
  });
  // Strength 0 carves frequencies only — no level ducking — so the spectral
  // cases measure just the spectral half. A case that wants the duck raises it.
  const settings = (dynamic: boolean, over: Record<string, unknown> = {}) =>
    JSON.stringify({ sources: ["vo"], strength: 0, dynamic, ...over });

  /** The value written for one attribute, whatever order the writes landed in. */
  const writeFor = (calls: unknown[][], attr: string) =>
    JSON.parse(String(calls.find((c) => c[0] === attr)![1]));

  /** Choose a voice track the way the select does. */
  /**
   * Include one voice in the carve.
   *
   * A set of things to include rather than a choice between them, since every named
   * voice is analysed together — so this ticks a box instead of picking an option.
   */
  const pickSource = (host: HTMLElement, id: string) => {
    const box = host.querySelector<HTMLInputElement>(`[data-carve-source="${id}"]`)!;
    box.click();
  };

  /** A voice with a pause in it, decoded through a stubbed offline context. */
  function stubDecode(): void {
    const sampleRate = 48000;
    const data = new Float32Array(sampleRate * 4);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = t > 1 && t < 3 ? 0.7 * Math.sin(2 * Math.PI * 1000 * t) : 0;
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => ({ sampleRate, getChannelData: () => data });
      },
    );
  }

  /**
   * The same voice, but the decode does not finish until it is let go.
   *
   * Hover-auditioning the leveller is the one path where the result can arrive
   * after the author has moved on, so the tests that cover that need to hold the
   * decode open across a second gesture.
   */
  function stubGatedDecode(): { release: () => void; decoded: Promise<void> } {
    const sampleRate = 48000;
    const data = new Float32Array(sampleRate * 4);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = t > 1 && t < 3 ? 0.7 * Math.sin(2 * Math.PI * 1000 * t) : 0;
    }
    let release = (): void => {};
    const decoded = new Promise<void>((r) => {
      release = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        async decodeAudioData() {
          await decoded;
          return { sampleRate, getChannelData: () => data };
        }
      },
    );
    return { release: () => release(), decoded };
  }

  /** Let the held decode finish, and the measurement it feeds after it. */
  async function settleDecode(release: () => void, decoded: Promise<void>): Promise<void> {
    await act(async () => {
      release();
      await decoded;
      await Promise.resolve();
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  /** Runs Even Out Levels on a decode of `data` and returns the fx lane's nearest point to a clip time. */
  async function levelledLane(data: Float32Array, dataAttributes: Record<string, string>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => ({ sampleRate: SAMPLE_RATE, getChannelData: () => data });
      },
    );
    const { host, onSetAttributeQuiet } = mount({ "fx-chain": CHAIN, ...dataAttributes });
    document.getElementById("bed")?.setAttribute("src", "bed.wav");
    act(() => byTextButton(host, "Audio FX")?.click());
    act(() => byTextButton(host, "+ effect")?.click());
    await act(async () => {
      byTextButton(host, "Even Out Levels")?.click();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    const write = onSetAttributeQuiet.mock.calls.filter((c) => c[0] === "data-automation").at(-1);
    if (!write) throw new Error("no levelling lane written");
    const lane = (
      JSON.parse(String(write[1])).lanes as { target: string; points: { t: number; v: number }[] }[]
    ).find((l) => l.target.startsWith("fx."));
    if (!lane) throw new Error("no fx lane");
    return (t: number) =>
      lane.points.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best));
  }

  /** A 300 Hz tone, 16 s long: quiet between `quietFrom` and `quietTo`, loud elsewhere. */
  function toneWithQuietPassage(quietFrom: number, quietTo: number): Float32Array {
    const data = new Float32Array(SAMPLE_RATE * 16);
    for (let i = 0; i < data.length; i++) {
      const t = i / SAMPLE_RATE;
      data[i] = (t >= quietFrom && t < quietTo ? 0.05 : 0.5) * Math.sin(2 * Math.PI * 300 * t);
    }
    return data;
  }

  it("levels the part of the file the clip plays, not the file from its start", async () => {
    // A lane's `t` is seconds from the start of the CLIP, but the decode is the
    // whole file. The file is quiet 2-5 s and the clip trims the first 2 s, so
    // from the clip's zero t=0.5 wants a real lift; from the file's zero it wants none.
    const near = await levelledLane(toneWithQuietPassage(2, 5), {
      "playback-start": "2",
      "media-start": "0",
      duration: "6",
    });
    expect(near(0.5).v).toBeGreaterThan(4);
  });

  it.each<{
    label: string;
    attrs: Record<string, string>;
    quiet: [number, number];
    quietAt: number;
    loudAt: number;
  }>([
    // 2x: 6 s of clip play source 0-12 s; source 2-6 s is quiet, so clip 1-3 s wants lift.
    {
      label: "2x",
      attrs: { "playback-rate": "2", duration: "6" },
      quiet: [2, 6],
      quietAt: 2,
      loudAt: 5,
    },
    // 0.5x: 8 s of clip play source 0-4 s; source 1-2 s is quiet, so clip 2-4 s wants lift and clip 1 s none.
    {
      label: "0.5x",
      attrs: { "playback-rate": "0.5", duration: "8" },
      quiet: [1, 2],
      quietAt: 3.5,
      loudAt: 1,
    },
    // A rate lane holding 2x: playback reads the lane, not the missing data-playback-rate.
    {
      label: "a 2x rate lane",
      attrs: {
        automation:
          '{"version":1,"lanes":[{"target":"rate","points":[{"t":0,"v":2},{"t":6,"v":2}]}]}',
        duration: "6",
      },
      quiet: [2, 6],
      quietAt: 2,
      loudAt: 5,
    },
  ])("levels on the clip's clock at $label", async (c) => {
    const near = await levelledLane(toneWithQuietPassage(...c.quiet), c.attrs);
    expect({ quiet: near(c.quietAt).v > 4, loud: near(c.loudAt).v < 2 }).toEqual({
      quiet: true,
      loud: true,
    });
  });

  it("removes every lane a preset owned, not just the last node's", () => {
    // Each write is computed from the same render-time snapshot and replaces the
    // whole attribute, so removing lanes one node at a time kept only the final
    // write — the earlier nodes' lanes survived as orphans, and with ids minted
    // lowest-free the next effect added inherited one, arriving "Automated" with
    // an envelope nobody drew and baked into the render.
    const chain = {
      version: 1,
      nodes: [
        {
          type: "highpass",
          id: "n1",
          fromPreset: "telephone",
          params: { frequency: 300, q: 0.707, poles: "2" },
        },
        {
          type: "peaking",
          id: "n2",
          fromPreset: "telephone",
          params: { frequency: 1200, gain: 6, q: 1.2 },
        },
      ],
    };
    const automation = {
      version: 1,
      lanes: [
        { target: "fx.n1.frequency", points: [{ t: 0, v: 300 }] },
        { target: "fx.n2.gain", points: [{ t: 0, v: 6 }] },
        { target: "fx.preset.telephone", points: [{ t: 0, v: 1 }] },
        { target: "volume", points: [{ t: 0, v: 0.5 }] },
      ],
    };
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": JSON.stringify(chain),
      automation: JSON.stringify(automation),
    });
    act(() => byTextButton(host, "Audio FX")?.click());
    act(() => host.querySelector<HTMLElement>(".hf-fx-preset-run-remove")?.click());

    const write = onSetAttributeQuiet.mock.calls.filter((c) => c[0] === "data-automation").at(-1);
    const lanes = JSON.parse(String(write?.[1] ?? '{"lanes":[]}')).lanes as { target: string }[];
    const targets = lanes.map((l) => l.target);
    // Both nodes gone, and the whole-preset lane with them.
    expect(targets).not.toContain("fx.n1.frequency");
    expect(targets).not.toContain("fx.n2.gain");
    expect(targets).not.toContain("fx.preset.telephone");
    // The track's own volume lane is untouched.
    expect(targets).toContain("volume");
  });

  describe("auditioning starts the transport when it has to", () => {
    const store = () => usePlayerStore.getState();

    const hoverPreset = (host: HTMLElement) => {
      act(() => byTextButton(host, "Presets")?.click());
      act(() => host.querySelector<HTMLElement>(".hf-fx-preset-item")?.focus());
    };
    const leaveShelf = (host: HTMLElement) =>
      act(() => {
        host
          .querySelector(".hf-fx-preset-menu")
          ?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });

    it("plays from the playhead, then puts it back exactly where it was", () => {
      // Browsing the shelf must not cost the author their place: hovering is not
      // an edit, so the playhead it borrows has to be returned.
      act(() => usePlayerStore.setState({ isPlaying: false, currentTime: 42 }));
      const { host } = mount({ "fx-chain": CHAIN });
      hoverPreset(host);
      expect(store().playbackRequest?.playing).toBe(true);

      leaveShelf(host);
      expect(store().playbackRequest?.playing).toBe(false);
      expect(store().playbackRequest?.returnTo).toBe(42);
    });

    it("seeks a group audition to the next member span", () => {
      act(() =>
        usePlayerStore.setState({
          isPlaying: false,
          currentTime: 2,
          requestedSeekTime: null,
        }),
      );
      const host = mountGroup(10);
      hoverPreset(host);
      expect(store().requestedSeekTime).toBe(10);
      leaveShelf(host);
    });

    it("seeks a group audition to an audible video member's span", () => {
      act(() =>
        usePlayerStore.setState({ isPlaying: false, currentTime: 2, requestedSeekTime: null }),
      );
      const host = mountGroup(7, "video");
      hoverPreset(host);
      expect(store().requestedSeekTime).toBe(7);
      leaveShelf(host);
    });

    it("leaves a transport the author started alone", () => {
      // Stopping their playback because they passed over a preset would be the
      // panel taking a decision nobody offered it.
      act(() => usePlayerStore.setState({ isPlaying: true, currentTime: 12 }));
      const { host } = mount({ "fx-chain": CHAIN });
      const before = store().playbackRequest?.nonce ?? 0;
      hoverPreset(host);
      leaveShelf(host);
      expect(store().playbackRequest?.nonce ?? 0).toBe(before);
    });
  });

  it("drops a levelling measurement that lands after the pointer has gone", async () => {
    const { release, decoded } = stubGatedDecode();
    const { host, onSetAttributeLive } = mount({ "fx-chain": CHAIN });
    document.getElementById("bed")?.setAttribute("src", "bed.wav");
    act(() => byTextButton(host, "+ effect")?.click());
    const level = byTextButton(host, "Even Out Levels");
    expect(level, "the levelling button was not offered").toBeTruthy();
    act(() => level?.focus());
    // Gone again before the decode finishes.
    act(() => {
      host
        .querySelector(".hf-fx-add-menu")
        ?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await settleDecode(release, decoded);

    // The revert on the way out is allowed to write; a levelling stage is not.
    const levelled = onSetAttributeLive.mock.calls.filter((c) =>
      String(c[1] ?? "").includes("fromLeveller"),
    );
    expect(levelled).toEqual([]);
  });

  /**
   * Sliding from the leveller to the effect beside it is not leaving the menu,
   * so the shelf's own leave never fires — and the measurement already in flight
   * used to land on top of whatever was being auditioned next, writing a
   * levelled version of the chain as it was through a channel the document never
   * sees. Every entry in the shelf calls its neighbours' auditions off.
   */
  it("calls the levelling measurement off when the pointer moves to the effect beside it", async () => {
    const { release, decoded } = stubGatedDecode();
    const { host, onSetAttributeLive } = mount({ "fx-chain": CHAIN });
    document.getElementById("bed")?.setAttribute("src", "bed.wav");
    act(() => byTextButton(host, "+ effect")?.click());
    act(() => byTextButton(host, "Even Out Levels")?.focus());
    // Straight to a neighbour, without ever leaving the shelf.
    act(() =>
      byTextButton(host, EFFECT_COPY.reverb?.title ?? "")?.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      ),
    );
    await settleDecode(release, decoded);

    expect(
      onSetAttributeLive.mock.calls.filter((c) => String(c[1] ?? "").includes("fromLeveller")),
    ).toEqual([]);
  });

  it("automates the carve filters' gain from the voice, in the bed's own time", async () => {
    stubDecode();
    // Voice starts 10s into the composition, bed at 0: the envelope is measured
    // against the voice but read from the start of the bed, so it has to shift.
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": carvedChain,
      // No source yet: picking one is what applies the carve.
      "fx-carve": settings(true, { sources: [] }),
      start: "0",
    });
    const vo = document.getElementById("vo")!;
    vo.setAttribute("data-start", "10");
    vo.setAttribute("src", "voice.wav");
    await act(async () => {
      pickSource(host, "vo");
    });

    // Chain first, then automation: a lane naming a node the chain does not
    // carry yet is dropped when it is read back.
    const order = onSetAttributeQuiet.mock.calls.map((c) => c[0]);
    // The settings land first, then the filters they imply, then the envelopes.
    expect(order.indexOf("data-fx-chain")).toBeLessThan(order.indexOf("data-automation"));

    const carved = writeFor(onSetAttributeQuiet.mock.calls, "data-fx-chain").nodes;
    const carveNode = carved.find((n: { fromCarve?: boolean }) => n.fromCarve);
    expect(carveNode.id).toBeTruthy();

    const lanes = writeFor(onSetAttributeQuiet.mock.calls, "data-automation").lanes;
    const lane = lanes.find((l: { target: string }) => l.target === `fx.${carveNode.id}.gain`) as {
      points: { t: number; v: number }[];
    };
    expect(lane).toBeTruthy();
    // Flat at the bed's own start, before the voice exists at all.
    expect(lane.points[0]).toMatchObject({ t: 0, v: 0 });
    // The voice's pause is at 0-1s of its own clip, so 10-11s of the bed's.
    expect(lane.points.find((p) => p.t > 10.5 && p.t < 11)?.v ?? 0).toBe(0);
    // And it cuts once the voice speaks, a second later. Depth is per band and
    // relative to that band's own peak in the voice, so the invariant is that the
    // envelope gets most of the way to what the analysis put on the node — not a
    // fixed number of dB, which changes with the band the analysis chose.
    const bandGain = Number(carveNode.params?.gain ?? 0);
    // At least half the depth the analysis put on the node; the exact floor
    // depends on which band it chose and how the envelope was thinned.
    expect(Math.min(...lane.points.map((p) => p.v))).toBeLessThanOrEqual(bandGain * 0.5);
    // Ends back at no cut, so the bed is not left dipped for the rest of the clip.
    expect(lane.points.at(-1)!.v).toBe(0);
  });

  it("adds a gain stage that ducks the bed under the voice, automated when dynamic", async () => {
    // Carving frequencies cannot beat a bed that is simply louder than the
    // voice. The level half rides a gain node the carve owns, so the track's own
    // volume lane is left alone.
    stubDecode();
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": carvedChain,
      "fx-carve": settings(true, { strength: 1, sources: [] }),
      start: "0",
    });
    const vo = document.getElementById("vo")!;
    vo.setAttribute("data-start", "0");
    vo.setAttribute("src", "voice.wav");
    // The bed is measured too — "how far over the voice is it" needs both.
    document.getElementById("bed")!.setAttribute("src", "bed.m4a");
    await act(async () => {
      pickSource(host, "vo");
    });

    const nodes = writeFor(onSetAttributeQuiet.mock.calls, "data-fx-chain").nodes;
    const gain = nodes.find((n: { type: string }) => n.type === "gain");
    expect(gain).toBeTruthy();
    expect(gain.fromCarve).toBe(true);
    // Dynamic hands the value to the envelope, so the static one stays at unity.
    expect(gain.params.gain).toBe(0);

    const lanes = writeFor(onSetAttributeQuiet.mock.calls, "data-automation").lanes;
    const duckLane = lanes.find((l: { target: string }) => l.target === `fx.${gain.id}.gain`);
    expect(duckLane).toBeTruthy();
    expect(Math.min(...duckLane.points.map((p: { v: number }) => p.v))).toBeLessThan(0);
    // Every carved band gets an envelope reaching that band's own analysed depth.
    for (const node of nodes.filter((n: { type: string }) => n.type === "peaking")) {
      const lane = lanes.find((l: { target: string }) => l.target === `fx.${node.id}.gain`) as
        | { points: { v: number }[] }
        | undefined;
      expect(lane, `band ${node.id} has no envelope`).toBeTruthy();
      const deepest = Math.min(...lane!.points.map((p) => p.v));
      expect(deepest).toBeLessThanOrEqual(0);
      expect(deepest).toBeGreaterThanOrEqual(node.params.gain - 0.2);
      expect(deepest).toBeLessThanOrEqual(node.params.gain * 0.5);
    }
    // The author's own volume lane is not something a carve gets to touch.
    expect(lanes.some((l: { target: string }) => l.target === "volume")).toBe(false);
  });

  it("carves frequencies only when the duck is off", async () => {
    stubDecode();
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": carvedChain,
      "fx-carve": settings(true, { strength: 0, sources: [] }),
      start: "0",
    });
    document.getElementById("vo")!.setAttribute("src", "voice.wav");
    document.getElementById("bed")!.setAttribute("src", "bed.m4a");
    await act(async () => {
      pickSource(host, "vo");
    });
    const nodes = writeFor(onSetAttributeQuiet.mock.calls, "data-fx-chain").nodes;
    expect(nodes.some((n: { type: string }) => n.type === "gain")).toBe(false);
  });

  it("analyses when the module is switched back on", async () => {
    // Off drops the filters, so On has nothing to hear until they are rebuilt. It
    // used to restore the setting and leave the bed uncarved — the switch looked
    // like it had worked and the mix was unchanged.
    stubDecode();
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": JSON.stringify({ version: 1, nodes: [] }),
      "fx-carve": JSON.stringify({ enabled: false, sources: ["vo"], strength: 0.25 }),
      start: "0",
    });
    document.getElementById("vo")!.setAttribute("src", "voice.wav");
    document.getElementById("bed")!.setAttribute("src", "bed.m4a");
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".hf-fx-carve-toggle")!.click();
    });
    const chainWrite = onSetAttributeQuiet.mock.calls
      .filter((c) => c[0] === "data-fx-chain")
      .at(-1);
    expect(chainWrite).toBeTruthy();
    const nodes = JSON.parse(String(chainWrite![1])).nodes as {
      type: string;
      fromCarve?: boolean;
    }[];
    expect(nodes.filter((n) => n.fromCarve).length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.type === "peaking")).toBe(true);
  });

  it("analyses every named voice, not just the first", async () => {
    // The point of a list: a bed running under a narrator and an interview answer
    // should make room for both, so both are decoded and summed onto the bed's clock
    // before a single band is chosen.
    stubDecode();
    const { host, onSetAttributeQuiet } = mount(
      {
        "fx-chain": JSON.stringify({ version: 1, nodes: [] }),
        "fx-carve": JSON.stringify({ enabled: true, sources: ["vo", "vo2"], strength: 0.3 }),
        start: "0",
      },
      false,
      2,
    );
    document.getElementById("vo")!.setAttribute("src", "voice.wav");
    document.getElementById("vo2")!.setAttribute("src", "guest.wav");
    document.getElementById("bed")!.setAttribute("src", "bed.m4a");
    // Nudge strength so the analysis runs against the stored two-voice list.
    const dial = host.querySelector<HTMLInputElement>(".hf-fx-carve input[type=range]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dial, "0.6");
      dial.dispatchEvent(new Event("input", { bubbles: true }));
      dial.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    const fetched = (
      globalThis.fetch as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.map((c) => String(c[0]));
    expect(fetched.some((u) => u.includes("voice.wav"))).toBe(true);
    expect(fetched.some((u) => u.includes("guest.wav"))).toBe(true);
    const chainWrite = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-chain");
    expect(chainWrite).toBeTruthy();
    const nodes = parseWrite(chainWrite!).nodes as { type: string; fromCarve?: boolean }[];
    expect(nodes.some((n) => n.fromCarve && n.type === "peaking")).toBe(true);
  });

  it("applies as soon as another voice is included, with no second step", async () => {
    // Including a voice is the whole gesture: a carve naming a track with no filters
    // behind it is a setting nobody applied.
    stubDecode();
    const { host, onSetAttributeQuiet } = mount(
      {
        "fx-chain": JSON.stringify({ version: 1, nodes: [] }),
        "fx-carve": JSON.stringify({ enabled: true, sources: ["vo"], strength: 0.25 }),
        start: "0",
      },
      false,
      2,
    );
    document.getElementById("vo")!.setAttribute("src", "voice.wav");
    document.getElementById("vo2")!.setAttribute("src", "voice2.wav");
    document.getElementById("bed")!.setAttribute("src", "bed.m4a");
    const before = onSetAttributeQuiet.mock.calls.length;
    await act(async () => {
      pickSource(host, "vo2");
    });
    const after = onSetAttributeQuiet.mock.calls.slice(before).map((c) => c[0]);
    // Both voices recorded, and the filters rebuilt from the two of them together.
    expect(after).toContain("data-fx-carve");
    expect(after).toContain("data-fx-chain");
    const carveWrite = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(JSON.parse(String(carveWrite![1])).sources).toEqual(["vo", "vo2"]);
  });

  it("re-applies an existing carve when strength moves", async () => {
    // Strength is the whole control surface, so it has to act on what is already
    // applied. Left to the button alone, a carve kept the filters and envelopes
    // its old strength produced and the knob silently described nothing.
    stubDecode();
    const carvedAlready = JSON.stringify({
      version: 1,
      nodes: [
        {
          type: "peaking",
          id: "n1",
          fromCarve: true,
          params: { frequency: 1000, gain: -6, q: 1.4 },
        },
        { type: "gain", id: "n2", fromCarve: true, params: { gain: -6 } },
      ],
    });
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": carvedAlready,
      "fx-carve": settings(true, { strength: 0.25 }),
      start: "0",
    });
    document.getElementById("vo")!.setAttribute("src", "voice.wav");
    document.getElementById("bed")!.setAttribute("src", "bed.m4a");

    const dial = host.querySelector<HTMLInputElement>(".hf-fx-carve input[type=range]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dial, "1");
      dial.dispatchEvent(new Event("input", { bubbles: true }));
      dial.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    const written = onSetAttributeQuiet.mock.calls.map((c) => c[0]);
    expect(written).toContain("data-fx-carve");
    // The settings land first, then the filters they imply, then the envelopes.
    expect(written.indexOf("data-fx-carve")).toBeLessThan(written.indexOf("data-fx-chain"));
    expect(written.indexOf("data-fx-chain")).toBeLessThan(written.indexOf("data-automation"));

    const chainWrite = onSetAttributeQuiet.mock.calls.find((c) => c[0] === "data-fx-chain");
    const nodes = JSON.parse(String(chainWrite![1])).nodes;
    // Full strength: deeper than the 6 dB the quarter-strength carve had.
    const deepest = Math.min(
      ...nodes
        .filter((n: { type: string }) => n.type === "peaking")
        .map((n: { params: { gain: number } }) => n.params.gain),
    );
    expect(deepest).toBeLessThan(-6);
  });

  it("does not re-analyse on every pixel of a drag", async () => {
    // Only the release re-applies. Analysing per pointermove would decode both
    // tracks on each pixel.
    stubDecode();
    const carvedAlready = JSON.stringify({
      version: 1,
      nodes: [
        {
          type: "peaking",
          id: "n1",
          fromCarve: true,
          params: { frequency: 1000, gain: -6, q: 1.4 },
        },
      ],
    });
    const { host, onSetAttributeQuiet, onSetAttributeLive } = mount({
      "fx-chain": carvedAlready,
      "fx-carve": settings(true, { strength: 0.25 }),
      start: "0",
    });
    document.getElementById("vo")!.setAttribute("src", "voice.wav");
    const dial = host.querySelector<HTMLInputElement>(".hf-fx-carve input[type=range]")!;
    await act(async () => {
      for (const v of ["0.4", "0.6", "0.8"]) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dial, v);
        dial.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(onSetAttributeLive.mock.calls.every((c) => c[0] === "data-fx-carve")).toBe(true);
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-chain")).toBe(false);
  });

  describe("on each clip's own clock", () => {
    type Point = { t: number; v: number };
    /** `hz` at `amp` over [from, to) of a `seconds`-long file, silence elsewhere. */
    const tone = (seconds: number, [from, to]: [number, number], hz = 1000, amp = 0.7) =>
      Float32Array.from({ length: SAMPLE_RATE * seconds }, (_, i) => {
        const t = i / SAMPLE_RATE;
        return t >= from && t < to ? amp * Math.sin(2 * Math.PI * hz * t) : 0;
      });

    /** Each file decodes to its own samples, found by the URL that was fetched. */
    function stubFiles(files: Record<string, Float32Array>): void {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => ({ arrayBuffer: async () => url })),
      );
      vi.stubGlobal(
        "OfflineAudioContext",
        class {
          decodeAudioData = async (url: string) => {
            const data = Object.entries(files).find(([name]) => url.endsWith(name))![1];
            return { sampleRate: SAMPLE_RATE, getChannelData: () => data };
          };
        },
      );
    }

    const valueAt = (points: Point[], t: number): number => {
      const i = points.findIndex((p) => p.t >= t);
      if (i <= 0) return points.at(i)!.v;
      const [a, b] = [points[i - 1]!, points[i]!];
      return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    };

    /** Carves the bed against `vo` and reads back the lane driving the first node of `type`. */
    async function carveLane(
      type: string,
      voice: Record<string, string>,
      bed: Record<string, string> = {},
      strength = 0,
    ) {
      const { host, onSetAttributeQuiet } = mount({
        "fx-chain": carvedChain,
        "fx-carve": settings(true, { strength, sources: [] }),
        start: "0",
        ...bed,
      });
      const vo = document.getElementById("vo")!;
      vo.setAttribute("src", "voice.wav");
      for (const [name, value] of Object.entries(voice)) vo.setAttribute(`data-${name}`, value);
      document.getElementById("bed")!.setAttribute("src", "bed.wav");
      await act(async () => {
        pickSource(host, "vo");
      });
      const calls = onSetAttributeQuiet.mock.calls;
      const nodes = parseWrite(writeTo(calls, "data-fx-chain")!).nodes as {
        id: string;
        type: string;
        params: { gain: number; frequency: number };
      }[];
      const node = nodes.find((n) => n.type === type)!;
      const lanes = parseWrite(writeTo(calls, "data-automation")!).lanes as {
        target: string;
        points: Point[];
      }[];
      const points = lanes.find((l) => l.target === `fx.${node.id}.gain`)!.points;
      return {
        depth: node.params.gain,
        frequency: node.params.frequency,
        points,
        at: (t: number) => valueAt(points, t),
      };
    }

    /** Quiet 1 kHz speech at 0-2 s, loud 4 kHz speech at 4-6 s, in an 8 s file. */
    const lateSpeech = () => {
      const after = tone(8, [4, 6], 4000, 0.9);
      return tone(8, [0, 2], 1000, 0.3).map((v, i) => v + after[i]!);
    };

    it("ignores speech after the bed has stopped playing", async () => {
      // The bed file runs 8 s, but the clip plays only its first 3 s.
      stubFiles({ "voice.wav": lateSpeech(), "bed.wav": tone(8, [0, 8], 200) });
      const lane = await carveLane("peaking", { start: "0" }, { duration: "3" });
      expect(lane.frequency).toBe(1000);
    });

    it("ignores speech after a bed with no duration runs out, when it ducks", async () => {
      // No data-duration: the bed plays its 3 s file. Strength 0.05 ducks and keeps one band.
      stubFiles({ "voice.wav": lateSpeech(), "bed.wav": tone(3, [0, 3], 200) });
      const lane = await carveLane("peaking", { start: "0" }, {}, 0.05);
      expect(lane.frequency).toBe(1000);
    });

    it.each([
      ["no duration", {}],
      ["a duration longer than its file", { duration: "6" }],
    ])("ignores speech after a 3 s bed file with %s, without ducking", async (_, bed) => {
      stubFiles({ "voice.wav": lateSpeech(), "bed.wav": tone(3, [0, 3], 200) });
      const lane = await carveLane("peaking", { start: "0" }, bed);
      expect(lane.frequency).toBe(1000);
    });

    it("cuts where a trimmed voice speaks, not where its file does", async () => {
      // File speech 2-3.5 s; the clip plays 2-4 s of it, so the bed hears it at 0-1.5 s.
      stubFiles({ "voice.wav": tone(6, [2, 3.5]), "bed.wav": tone(8, [0, 8], 200) });
      const lane = await carveLane("peaking", { start: "0", "media-start": "2", duration: "2" });
      expect({ speaking: lane.at(0.8) <= lane.depth * 0.5, after: lane.at(3) }).toEqual({
        speaking: true,
        after: 0,
      });
    });

    it("cuts over half the source length for a voice at 2x", async () => {
      // File speech 1-3 s at 2x: the bed hears it at 0.5-1.5 s.
      stubFiles({ "voice.wav": tone(4, [1, 3]), "bed.wav": tone(8, [0, 8], 200) });
      const lane = await carveLane("peaking", { start: "0", "playback-rate": "2", duration: "2" });
      expect({
        speaking: lane.at(0.8) <= lane.depth * 0.5 && lane.at(1.3) <= lane.depth * 0.5,
        after: lane.at(2.5),
      }).toEqual({ speaking: true, after: 0 });
    });

    it("ducks against the part of the bed that plays", async () => {
      // The bed file is silent for 4 s and loud after; the clip starts 4 s in, so it is loud under the voice.
      stubFiles({ "voice.wav": tone(4, [1, 3]), "bed.wav": tone(8, [4, 8], 200, 0.9) });
      const lane = await carveLane(
        "gain",
        { start: "0" },
        { "media-start": "4", duration: "4" },
        1,
      );
      expect(Math.min(...lane.points.map((p) => p.v))).toBeLessThan(0);
    });
  });
});

describe("AudioFxGroup successive edits", () => {
  const three = JSON.stringify({
    version: 1,
    nodes: [
      { type: "peaking", id: "n1", params: { frequency: 900, gain: -6, q: 1.4 } },
      { type: "lowpass", id: "n2", params: { frequency: 400, q: 0.9, poles: "2" } },
      { type: "delay", id: "n3", params: { time: 250, feedback: 0.3, mix: 0.4 } },
    ],
  });

  const removeButtons = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>(".hf-fx-remove"));

  /**
   * The panel computes each edit from the attribute it is holding. Written
   * without a selection resync, the second delete worked from the pre-delete
   * chain and wrote the same result — so after deleting one effect, no further
   * delete did anything.
   */
  it("deletes a second effect after the first, not from a stale chain", () => {
    const first = mount({ "fx-chain": three });
    act(() => removeButtons(first.host)[0]!.click());
    const afterFirst = parseWrite(writeTo(first.onSetAttributeQuiet.mock.calls, "data-fx-chain")!);
    expect(afterFirst.nodes.map((n: { id: string }) => n.id)).toEqual(["n2", "n3"]);

    // The resync hands the panel what it just wrote; the next delete starts there.
    const second = mount({ "fx-chain": JSON.stringify(afterFirst) });
    act(() => removeButtons(second.host)[0]!.click());
    const afterSecond = parseWrite(
      writeTo(second.onSetAttributeQuiet.mock.calls, "data-fx-chain")!,
    );
    expect(afterSecond.nodes.map((n: { id: string }) => n.id)).toEqual(["n3"]);

    const third = mount({ "fx-chain": JSON.stringify(afterSecond) });
    act(() => removeButtons(third.host)[0]!.click());
    // The last one leaves no chain at all.
    expect(writeTo(third.onSetAttributeQuiet.mock.calls, "data-fx-chain")![1]).toBeNull();
  });

  it("writes with the commit that resyncs the selection, not the silent one", () => {
    // Both skip the preview reload; only this one re-reads the selection, which
    // is what makes a following edit see the current value.
    const { host, onSetAttributeQuiet } = mount({ "fx-chain": three });
    act(() => removeButtons(host)[0]!.click());
    // One chain write, through the resyncing path. The carve's own writes share the
    // queue now, so this counts the ones this edit made.
    expect(onSetAttributeQuiet.mock.calls.filter((c) => c[0] === "data-fx-chain")).toHaveLength(1);
  });
});

describe("AudioFxGroup carve visibility", () => {
  /**
   * A carve is a relationship: a bed is carved *against* a voice. The voice is the
   * other end of it, so offering the same control there is offering to carve a
   * track against itself by proxy — and switching it on left a setting that could
   * never do anything.
   */
  it("does not offer carve on a track another track is carving against", () => {
    const bed = document.createElement("audio");
    bed.id = "bed";
    bed.setAttribute("src", "bed.m4a");
    bed.setAttribute("data-fx-carve", JSON.stringify({ sources: ["vo"], strength: 0.25 }));
    document.body.append(bed);
    const voice = document.createElement("audio");
    voice.id = "vo";
    voice.setAttribute("src", "voice.wav");
    document.body.append(voice);

    const host = document.createElement("div");
    document.body.append(host);
    const selection = {
      dataAttributes: {},
      id: "vo",
      element: voice,
    } as unknown as DomEditSelection;
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={selection}
          onSetAttributeQuiet={vi.fn()}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    expect(host.querySelector(".hf-fx-carve")).toBeNull();
  });

  it("still offers it on the bed doing the carving", () => {
    const bed = document.createElement("audio");
    bed.id = "bed";
    bed.setAttribute("src", "bed.m4a");
    bed.setAttribute("data-fx-carve", JSON.stringify({ sources: ["vo"], strength: 0.25 }));
    document.body.append(bed);
    const voice = document.createElement("audio");
    voice.id = "vo";
    voice.setAttribute("src", "voice.wav");
    document.body.append(voice);

    const host = document.createElement("div");
    document.body.append(host);
    const selection = {
      dataAttributes: { "fx-carve": JSON.stringify({ sources: ["vo"], strength: 0.25 }) },
      id: "bed",
      element: bed,
    } as unknown as DomEditSelection;
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={selection}
          onSetAttributeQuiet={vi.fn()}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    expect(host.querySelector(".hf-fx-carve")).not.toBeNull();
  });

  it("offers carve when the composition holds another audio track", () => {
    const { host } = mount({ "fx-chain": CHAIN });
    expect(host.querySelector(".hf-fx-carve")).toBeTruthy();
  });

  it("does not offer carve for the only audio track in the composition", () => {
    // Nothing to listen to, so the picker would be empty and Analyse inert.
    const { host } = mount({ "fx-chain": CHAIN }, true);
    expect(host.querySelector(".hf-fx-carve")).toBeNull();
  });
});

describe("AudioFxGroup deleting an effect", () => {
  const twoNodes = JSON.stringify({
    version: 1,
    nodes: [
      { type: "lowpass", id: "n1", params: { frequency: 400, q: 0.9, poles: "2" } },
      { type: "peaking", id: "n2", params: { frequency: 900, gain: -6, q: 1 } },
    ],
  });

  it("takes the deleted node's lanes with it", () => {
    // resolveAutomation only hides an orphan at read time. Left in the attribute,
    // and with ids minted lowest-free, the next effect added takes the same id and
    // inherits the dead envelope — disabled and "Automated" without the author
    // ever automating it, and baked into the render.
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": twoNodes,
      automation: JSON.stringify({
        version: 1,
        lanes: [
          { target: "fx.n1.frequency", points: [{ t: 0, v: 400 }] },
          { target: "fx.n2.gain", points: [{ t: 0, v: -6 }] },
          { target: "volume", points: [{ t: 0, v: 1 }] },
        ],
      }),
    });
    const remove = host.querySelectorAll<HTMLButtonElement>(".hf-fx-remove")[0]!;
    act(() => remove.click());
    const automationWrite = onSetAttributeQuiet.mock.calls.find((c) => c[0] === "data-automation");
    expect(automationWrite).toBeTruthy();
    expect(
      JSON.parse(String(automationWrite![1])).lanes.map((l: { target: string }) => l.target),
    ).toEqual(["fx.n2.gain", "volume"]);
  });

  it("leaves automation alone when the deleted node had none", () => {
    const { host, onSetAttributeQuiet } = mount({
      "fx-chain": twoNodes,
      automation: JSON.stringify({
        version: 1,
        lanes: [{ target: "fx.n2.gain", points: [{ t: 0, v: -6 }] }],
      }),
    });
    act(() => host.querySelectorAll<HTMLButtonElement>(".hf-fx-remove")[0]!.click());
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-automation")).toBe(false);
  });
});

describe("AudioFxGroup carve module readouts", () => {
  /**
   * A carve on a bed running 0–10 s, with a lane that ramps its 400 Hz band from
   * no cut to −6 dB across the first five seconds. The stored gain is −1, which is
   * deliberately not a value the lane ever passes through: it stands in for the
   * seed a lane leaves behind, so a readout showing it can only mean the playhead
   * was not consulted.
   */
  const carved = {
    start: "0",
    duration: "10",
    "fx-chain": JSON.stringify({
      version: 1,
      nodes: [
        {
          type: "peaking",
          id: "n1",
          fromCarve: true,
          params: { frequency: 400, gain: -1, q: 1.4 },
        },
      ],
    }),
    automation: JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "fx.n1.gain",
          points: [
            { t: 0, v: 0 },
            { t: 5, v: -6 },
          ],
        },
      ],
    }),
    "fx-carve": JSON.stringify({ sources: ["vo"], strength: 0.25 }),
  };

  /** Park the playhead somewhere, paused — a scrub is the same question as playback. */
  const seek = (time: number) => {
    act(() => {
      usePlayerStore.setState({ currentTime: time, isPlaying: false });
    });
  };

  const gainReadout = (host: HTMLElement): HTMLElement | null => {
    for (const span of Array.from(host.querySelectorAll<HTMLElement>(".hf-fx-carve-member span"))) {
      if (span.textContent?.startsWith("Gain")) return span;
    }
    return null;
  };

  /** Ensure the module is open. It starts open, so this only acts if something closed it. */
  const openModule = (host: HTMLElement) => {
    const head = host.querySelector<HTMLButtonElement>(".hf-fx-carve-module .hf-fx-node-name");
    if (head?.getAttribute("aria-expanded") === "false") act(() => head.click());
  };

  afterEach(() => {
    usePlayerStore.setState({ currentTime: 0, isPlaying: false });
  });

  it("shows the envelope's value at the playhead, not the stored seed", () => {
    seek(2.5);
    const { host } = mount(carved);
    openModule(host);
    const gain = gainReadout(host);
    // Halfway along a 0 → −6 dB ramp.
    expect(gain?.textContent).toContain("-3 dB");
    expect(gain?.hasAttribute("data-automation-live")).toBe(true);
  });

  it("follows the playhead as it moves", () => {
    seek(0);
    const { host } = mount(carved);
    openModule(host);
    expect(gainReadout(host)?.textContent).toContain("0 dB");
    seek(5);
    expect(gainReadout(host)?.textContent).toContain("-6 dB");
    seek(1);
    expect(gainReadout(host)?.textContent).toContain("-1.2 dB");
  });

  it("follows the transport during playback, off the live-time channel", async () => {
    // The RAF loop deliberately keeps every frame out of the store — it notifies
    // `liveTime` instead — so a panel that only watched the store would sit still
    // for the whole take and then jump when playback stopped.
    seek(0);
    const { host } = mount(carved);
    openModule(host);
    act(() => {
      usePlayerStore.setState({ isPlaying: true });
    });
    act(() => liveTime.notify(4));
    // Throttled to 30 Hz rather than rendered per frame, so the readout lands on
    // the next tick and not in this one.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(gainReadout(host)?.textContent).toContain("-4.8 dB");

    act(() => liveTime.notify(5));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(gainReadout(host)?.textContent).toContain("-6 dB");
  });

  it("reserves the same width whatever the value reads", () => {
    // The readout updates 30 times a second while the transport runs, and a value
    // one character narrower shunts everything after it sideways. So the width comes
    // from what the parameter CAN read, not from what it currently does.
    seek(2.5);
    const { host } = mount(carved);
    openModule(host);
    const widthAt = (): string | undefined =>
      gainReadout(host)?.querySelector<HTMLElement>(".tabular-nums")?.style.minWidth;
    const narrow = widthAt();
    expect(narrow).toBe("8ch"); // -40..40 dB at one decimal: "-12.5 dB"
    seek(5); // -6 dB — two characters shorter than -3 dB was
    expect(gainReadout(host)?.textContent).toContain("-6 dB");
    expect(widthAt()).toBe(narrow);
  });

  it("moves a hand-built effect's own slider and number, not just the carve rack", () => {
    // Every automated value follows its lane, whatever put the effect there. This
    // one is a delay the author added and automated by hand: its control is locked
    // (the lane owns the value), so the fader has no drag to fight and can simply
    // show the truth.
    const { host } = mount({
      start: "0",
      duration: "10",
      "fx-chain": JSON.stringify({
        version: 1,
        nodes: [{ type: "delay", id: "n1", params: { time: 250, feedback: 0.35, mix: 0.4 } }],
      }),
      automation: JSON.stringify({
        version: 1,
        lanes: [
          {
            target: "fx.n1.mix",
            points: [
              { t: 0, v: 0 },
              { t: 4, v: 1 },
            ],
          },
        ],
      }),
    });
    const mixRow = rowFor(host, plainLabel("delay", "mix"));
    const number = mixRow?.querySelector<HTMLInputElement>(".hf-fx-number");
    const slider = mixRow?.querySelector<HTMLInputElement>(".hf-fx-slider");
    expect(number?.disabled).toBe(true); // the lane owns it

    seek(1); // a quarter along a 0 → 1 ramp
    expect(Number(number?.value)).toBeCloseTo(0.25, 2);
    const quarter = Number(slider?.value);

    seek(3);
    expect(Number(number?.value)).toBeCloseTo(0.75, 2);
    expect(Number(slider?.value)).toBeGreaterThan(quarter);
  });

  it("shows the lane's own edge value off the clip, not the stored seed", () => {
    // Past the bed's end, where a lane holds its last value — which is what would
    // play if the playhead came back. The stored -1 dB is a seed the lane replaced
    // and nothing will ever use it, so putting it on screen only made the fader
    // jump when the clip came under the playhead.
    seek(20);
    const { host } = mount(carved);
    openModule(host);
    const gain = gainReadout(host);
    expect(gain?.textContent).toContain("-6 dB"); // the ramp's last point
    expect(gain?.hasAttribute("data-automation-live")).toBe(true);
    expect(gain?.hasAttribute("data-automated")).toBe(true);
  });

  it("holds the lane's first value before the clip starts", () => {
    // Same rule at the other end: a lane opens on its first point, so that is what
    // the fader should read while the playhead is still upstream of the clip.
    seek(-5);
    const { host } = mount(carved);
    openModule(host);
    expect(gainReadout(host)?.textContent).toContain("0 dB");
  });
});

describe("AudioFxGroup carve by default", () => {
  const parse = (calls: unknown[][], attr: string) => {
    const call = calls.find((c) => c[0] === attr);
    return call ? JSON.parse(String(call[1])) : null;
  };

  it("carves a bed that has exactly one voice above it, unasked", () => {
    // Carving is what a bed under narration wants. Making the author find the
    // control, pick the only possible voice and set a strength before hearing the
    // thing they already wanted is ceremony.
    const { onSetAttributeQuiet } = mount({ "fx-chain": "" }, false, 1);
    const carve = parse(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(carve).toMatchObject({ enabled: true, sources: ["vo"] });
    expect(carve.strength).toBe(0.25);
  });

  it("applies the default carve exactly once for a single candidate", () => {
    // The regression: the multi-candidate effect and the single-candidate effect
    // both passed their guards for exactly one candidate (the first only checks
    // sourceOptions.length === 0, not === 1), so a bed with one narrator above it
    // fired two identical setCarve calls — two decodes, two FFT runs, two
    // concurrent attribute writes.
    const { onSetAttributeQuiet } = mount({ "fx-chain": "" }, false, 1);
    const carveWrites = onSetAttributeQuiet.mock.calls.filter((c) => c[0] === "data-fx-carve");
    expect(carveWrites).toHaveLength(1);
  });

  it("makes room for every voice above the bed, not one of them", () => {
    // A bed usually runs under a whole sequence. Carving against one speaker leaves
    // the others fighting it, and choosing between them was never the question — so
    // several candidates is no longer a reason to refuse.
    const { onSetAttributeQuiet } = mount({ "fx-chain": "" }, false, 2);
    const write = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(write).toBeTruthy();
    expect(JSON.parse(String(write![1])).sources).toEqual(["vo", "vo2"]);
  });

  it("does not carve a track with nothing to listen to", () => {
    const { host, onSetAttributeQuiet } = mount({ "fx-chain": "" }, true);
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(false);
    // And offers nothing: a carve needs a second track to be a relationship with.
    expect(host.querySelector(".hf-fx-carve-module")).toBeNull();
  });

  it("stays off once switched off, rather than re-applying itself", () => {
    // The reason `enabled` exists. With "off" represented by an absent attribute,
    // selecting the clip again would read it as never-configured and carve it back.
    const { onSetAttributeQuiet } = mount(
      {
        "fx-carve": JSON.stringify({ enabled: false, sources: ["vo"], strength: 0.25 }),
      },
      false,
      1,
    );
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(false);
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-chain")).toBe(false);
  });

  it("does not carve the voice track itself", () => {
    // This track is the far end of someone else's relationship. Carving it against
    // its own bed is a feedback loop nobody asked for.
    const bed = document.createElement("audio");
    bed.id = "other-bed";
    bed.setAttribute(
      "data-fx-carve",
      JSON.stringify({ enabled: true, sources: ["bed"], strength: 0.3 }),
    );
    document.body.append(bed);
    const { host, onSetAttributeQuiet } = mount({ "fx-chain": "" }, false, 0);
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(false);
    expect(host.querySelector(".hf-fx-carve-module")).toBeNull();
  });

  /**
   * Mount a track of the test's own naming as the selection, with siblings.
   *
   * `mount` always calls the selected track `bed`, which is what let the near-end
   * hole go unnoticed: nothing ever selected a track whose NAME said voice.
   */
  const mountNamed = (id: string, siblings: string[]) => {
    const onSetAttributeQuiet = vi.fn();
    const selected = document.createElement("audio");
    selected.id = id;
    document.body.append(selected);
    for (const other of siblings) {
      const el = document.createElement("audio");
      el.id = other;
      document.body.append(el);
    }
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={
            {
              dataAttributes: { "fx-chain": "" },
              id,
              element: selected,
            } as unknown as DomEditSelection
          }
          onSetAttributeQuiet={onSetAttributeQuiet}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    return { host, onSetAttributeQuiet };
  };

  // The reported bug. A carve makes room in a bed for a voice, so a voice track
  // is the one thing that can never be the bed — `couldBeCarveSource` has said
  // as much since it was written, and nothing called it. Selecting a narration
  // clip offered it the module, found one candidate, and applied a carve nobody
  // asked for.
  it("never offers the carve on a track whose name says voice", () => {
    const { host, onSetAttributeQuiet } = mountNamed("vo-2", ["music-bed"]);
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(false);
    expect(host.querySelector(".hf-fx-carve-module")).toBeNull();
  });

  // Offering is a suggestion, applying is a decision. An unnamed track keeps the
  // module — the author may know better than the name does — but nothing is
  // written until they say so.
  it("offers but does not apply on a track whose name says nothing", () => {
    const { host, onSetAttributeQuiet } = mountNamed("a1", ["vo-1"]);
    expect(host.querySelector(".hf-fx-carve-module")).not.toBeNull();
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(false);
  });
});

describe("AudioFxGroup carve source list", () => {
  /** Mount a bed alongside tracks named however the test needs. */
  const mountWith = (
    tracks: {
      id: string;
      src?: string;
      start?: string;
      duration?: string;
      tag?: "audio" | "video";
      muted?: boolean;
    }[],
    bedAttrs: Record<string, string> = {},
  ) => {
    const bed = document.createElement("audio");
    bed.id = "bed";
    for (const [k, v] of Object.entries(bedAttrs)) bed.setAttribute(`data-${k}`, v);
    document.body.append(bed);
    for (const t of tracks) {
      const el = document.createElement(t.tag ?? "audio");
      el.id = t.id;
      if (t.muted) el.setAttribute("muted", "");
      if (t.src) el.setAttribute("src", t.src);
      if (t.start !== undefined) el.setAttribute("data-start", t.start);
      if (t.duration !== undefined) el.setAttribute("data-duration", t.duration);
      document.body.append(el);
    }
    const onSetAttributeQuiet = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={
            { dataAttributes: bedAttrs, id: "bed", element: bed } as unknown as DomEditSelection
          }
          onSetAttributeQuiet={onSetAttributeQuiet}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    // What the panel is willing to listen to, however it presents it: a picker's
    // options, or the single track it reads out when there is nothing to choose.
    const offered = Array.from(host.querySelectorAll<HTMLElement>("[data-carve-source]"));
    const options = offered.map((el) => el.dataset["carveSource"] ?? "");
    // Boxes to tick when there is a set of voices; a plain readout when there is one
    // and nothing to decide.
    const boxes = offered.filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    return { host, options, boxes, onSetAttributeQuiet };
  };

  it("offers an audible video as a voice and never a muted one", () => {
    const { options } = mountWith([
      { id: "a-roll", tag: "video" },
      { id: "b-roll", tag: "video", muted: true },
      { id: "narration" },
    ]);
    expect(options).toContain("a-roll");
    expect(options).not.toContain("b-roll");
  });

  it("reads the one voice out instead of offering a picker with one entry", () => {
    // A question with one answer is not a question. It is also the common case: a
    // narration and a bed, with a couple of stings that cannot be the voice.
    const { host, boxes } = mountWith([
      { id: "narration" },
      { id: "music-bed" },
      { id: "sfx-boom" },
    ]);
    expect(boxes).toHaveLength(0);
    expect(host.querySelector("[data-carve-source]")?.textContent).toBe("narration");
  });

  it("lists every voice as something to include once there is more than one", () => {
    const { boxes, options, onSetAttributeQuiet } = mountWith([
      { id: "narration" },
      { id: "interview-guest" },
    ]);
    expect(options).toEqual(["narration", "interview-guest"]);
    expect(boxes).toHaveLength(2);
    // Both included, by default. Asserted on the write rather than on the ticks: this
    // fixture never resyncs the attribute back, so the boxes still read the empty
    // list the panel started from.
    const write = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(JSON.parse(String(write![1])).sources).toEqual(["narration", "interview-guest"]);
  });

  it("keeps the picker when the stored voice is not among the candidates", () => {
    // The stored track is still there but no longer classifies as a voice.
    // Reading the one remaining candidate out would quietly claim the carve
    // listens to it. (A stored track that is GONE is a different case — see the
    // deleted-voice tests, which re-analyse rather than sit on a measurement of
    // something that is not there.)
    const bed = document.createElement("audio");
    bed.id = "bed";
    bed.setAttribute(
      "data-fx-carve",
      JSON.stringify({ enabled: true, sources: ["backing-music"], strength: 0.25 }),
    );
    document.body.append(bed);
    const stored = document.createElement("audio");
    stored.id = "backing-music";
    document.body.append(stored);
    const voice = document.createElement("audio");
    voice.id = "narration";
    document.body.append(voice);
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={
            {
              dataAttributes: {
                "fx-carve": JSON.stringify({
                  enabled: true,
                  sources: ["backing-music"],
                  strength: 0.25,
                }),
              },
              id: "bed",
              element: bed,
            } as unknown as DomEditSelection
          }
          onSetAttributeQuiet={vi.fn()}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    // Boxes rather than a readout, so the mismatch is visible and fixable.
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>("[data-carve-source]"));
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.checked).toBe(false);
  });

  it("leaves music and effects out of what it will listen to", () => {
    // A bed is the thing being carved and a 200 ms sting has no speech in it, so
    // offering either is offering an answer that cannot be right.
    const { options } = mountWith([
      { id: "narration" },
      { id: "music-bed" },
      { id: "sfx-explosion" },
      { id: "whoosh" },
    ]);
    expect(options).toEqual(["narration"]);
  });

  it("keeps tracks whose names say nothing, and sorts speech first", () => {
    // A name is a hint, not a fact: hiding `a1` could hide the only voice there is.
    const { options, boxes } = mountWith([{ id: "a1" }, { id: "bgm" }, { id: "vo-take2" }]);
    expect(boxes).toHaveLength(2);
    expect(options).toEqual(["vo-take2", "a1"]);
  });

  it("reads the filename when the id says nothing", () => {
    const { options } = mountWith([
      { id: "a1", src: "assets/narration-final.mp3" },
      { id: "a2", src: "assets/bgm_loop.m4a" },
    ]);
    expect(options).toEqual(["a1"]);
  });

  it("offers everything rather than nothing when no track looks like a voice", () => {
    // Filtering to an empty picker would make the carve unusable on a composition
    // whose tracks are all named like music.
    const { options } = mountWith([{ id: "music-bed" }, { id: "bgm-2" }]);
    expect(options).toEqual(["music-bed", "bgm-2"]);
  });

  it("carves by itself once the effects are filtered out of the count", () => {
    // The payoff: a voice, a bed and two stings used to read as four candidates,
    // which is ambiguous, so nothing was applied. One plausible voice carves.
    const { onSetAttributeQuiet } = mountWith([
      { id: "narration" },
      { id: "sfx-boom" },
      { id: "sfx-riser" },
    ]);
    const write = onSetAttributeQuiet.mock.calls.find((c) => c[0] === "data-fx-carve");
    expect(write).toBeTruthy();
    expect(JSON.parse(String(write![1]))).toMatchObject({ enabled: true, sources: ["narration"] });
  });
});

describe("AudioFxGroup carve targets groups (B6)", () => {
  // These tests are the only ones in this file whose auto-carve effect makes a
  // real cross-element write call (`onAutoGroupCarveSources`), which can be a
  // genuine Promise. None of this file's other `mount*` helpers ever unmount
  // their React root — harmless everywhere else because their effects only
  // ever touch a plain `onSetAttributeQuiet` mock, so an orphaned root left
  // over from an earlier test does nothing observable if it ever re-renders.
  // Here it can re-fire the auto-group effect against WHATEVER a later test's
  // fixture put in the (file-global) `document`, calling a long-dead test's
  // mock — unmounting is what prevents that.
  const roots: ReturnType<typeof createRoot>[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
  });

  /** A bed, plus tracks that may carry `data-audio-group`, plus an optional auto-group handler. */
  const mountWith = (
    tracks: { id: string; group?: string; start?: string; duration?: string }[],
    onAutoGroupCarveSources?: (clipIds: readonly string[], groupId: string) => Promise<void>,
  ) => {
    const bed = document.createElement("audio");
    bed.id = "bed";
    document.body.append(bed);
    for (const t of tracks) {
      const el = document.createElement("audio");
      el.id = t.id;
      if (t.group) el.setAttribute("data-audio-group", t.group);
      if (t.start !== undefined) el.setAttribute("data-start", t.start);
      if (t.duration !== undefined) el.setAttribute("data-duration", t.duration);
      document.body.append(el);
    }
    const onSetAttributeQuiet = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(
        <AudioFxGroup
          element={{ dataAttributes: {}, id: "bed", element: bed } as unknown as DomEditSelection}
          onSetAttributeQuiet={onSetAttributeQuiet}
          onSetAttributeLive={vi.fn()}
          onAutoGroupCarveSources={onAutoGroupCarveSources}
        />,
      );
    });
    const offered = Array.from(host.querySelectorAll<HTMLElement>("[data-carve-source]"));
    const options = offered.map((el) => el.dataset["carveSource"] ?? "");
    const boxes = offered.filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    return { host, options, boxes, onSetAttributeQuiet };
  };

  it("offers one entry for a group and hides its members individually", () => {
    const { options } = mountWith([
      { id: "vo-1", group: "voiceover" },
      { id: "vo-2", group: "voiceover" },
    ]);
    expect(options).toEqual(["voiceover"]);
  });

  it("offers the group when only ONE member overlaps the bed (union, not per-clip)", () => {
    // The bed spans the whole default window (no start/duration on the
    // selection itself in this harness resolves to [0, Infinity)), so give the
    // members explicit, non-overlapping-with-each-other spans and confirm the
    // group still appears as long as at least one of them is in range.
    const { options } = mountWith([
      { id: "vo-1", group: "voiceover", start: "0", duration: "5" },
      { id: "vo-2", group: "voiceover", start: "1000", duration: "5" },
    ]);
    expect(options).toEqual(["voiceover"]);
  });

  it("auto-selects the group over its individual members", () => {
    const { onSetAttributeQuiet } = mountWith([
      { id: "vo-1", group: "voiceover" },
      { id: "vo-2", group: "voiceover" },
    ]);
    const write = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(JSON.parse(String(write![1])).sources).toEqual(["voiceover"]);
  });

  it("auto-groups a multi-voice carve into one named group, atomically", async () => {
    // Two ungrouped, both voice-classified: the existing "every candidate
    // carves itself" mount effect names both by id, which is exactly the
    // plural-ungrouped case B6 intercepts — the carve should land on the
    // minted group, not on the two ids directly.
    const onAutoGroupCarveSources = vi.fn().mockResolvedValue(undefined);
    const { onSetAttributeQuiet } = mountWith(
      [
        { id: "narration", start: "0", duration: "5" },
        { id: "interview-guest", start: "10", duration: "5" },
      ],
      onAutoGroupCarveSources,
    );
    expect(onAutoGroupCarveSources).toHaveBeenCalledWith(
      ["narration", "interview-guest"],
      "voiceover",
    );
    // Explicitly await the exact promise `assignGroup` returned — a bare
    // `await Promise.resolve()`/`setTimeout` flush is guessing how deep the
    // chain behind it goes (its `.then(...)`, the write, and the re-analysis
    // `setCarve` awaits afterward). Left genuinely unresolved when this test
    // returns, that chain settles during a LATER test instead, after this
    // one's mocks and DOM are gone.
    await act(async () => {
      await onAutoGroupCarveSources.mock.results[0]?.value;
      // Two more turns of the microtask queue: one for the `.then(...)` that
      // builds the grouped settings, one for `setCarve`'s own trailing
      // `await analyse(next)` (a no-op here — the fixture's tracks have no
      // `src`, so `resolveCarveVoices` returns empty and `analyse` exits
      // immediately, but it still has to actually run to completion).
      await Promise.resolve();
      await Promise.resolve();
    });
    const write = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(write).toBeTruthy();
    expect(JSON.parse(String(write![1])).sources).toEqual(["voiceover"]);
  });

  it("leaves sources alone when one of them already names a group", () => {
    const onAutoGroupCarveSources = vi.fn();
    const { onSetAttributeQuiet } = mountWith(
      [
        { id: "vo-1", group: "voiceover" },
        { id: "vo-2", group: "voiceover" },
      ],
      onAutoGroupCarveSources,
    );
    // The default-carve effect already named the group (previous test above),
    // so no auto-group call should ever fire for an all-group source list.
    expect(onAutoGroupCarveSources).not.toHaveBeenCalled();
    const write = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(JSON.parse(String(write![1])).sources).toEqual(["voiceover"]);
  });
});

describe("AudioFxGroup carve source range", () => {
  const spanned = (tracks: { id: string; start?: string; duration?: string }[]): string[] => {
    const bed = document.createElement("audio");
    bed.id = "bed";
    document.body.append(bed);
    for (const t of tracks) {
      const el = document.createElement("audio");
      el.id = t.id;
      if (t.start !== undefined) el.setAttribute("data-start", t.start);
      if (t.duration !== undefined) el.setAttribute("data-duration", t.duration);
      document.body.append(el);
    }
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={
            {
              dataAttributes: { start: "0", duration: "100" },
              id: "bed",
              element: bed,
            } as unknown as DomEditSelection
          }
          onSetAttributeQuiet={vi.fn()}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    return Array.from(host.querySelectorAll<HTMLElement>("[data-carve-source]")).map(
      (el) => el.dataset["carveSource"] ?? "",
    );
  };

  it("ignores a voice that never plays while the bed does", () => {
    // It cannot mask what is not sounding, so including it would feed the analysis
    // silence and leave the author wondering why it changed nothing.
    expect(
      spanned([
        { id: "narration", start: "0", duration: "20" },
        { id: "outtake", start: "500", duration: "30" },
      ]),
    ).toEqual(["narration"]);
  });

  it("keeps a voice that only partly overlaps the bed", () => {
    // Half a sentence over the bed is still half a sentence to make room for.
    expect(spanned([{ id: "narration", start: "90", duration: "40" }])).toEqual(["narration"]);
  });

  it("keeps a voice whose length the composition does not write down", () => {
    // Refusing it would drop the commonest case there is: a clip whose duration is
    // left to the media. `Number(null)` being 0 made exactly that mistake once.
    expect(spanned([{ id: "narration", start: "10" }])).toEqual(["narration"]);
  });
});

describe("AudioFxGroup carve across tracks", () => {
  it("considers every voice wherever it sits on the timeline", () => {
    // A track is a row to draw on — `data-track-index` is parsed in one place, to
    // decide layout — so where a voice lives says nothing about whether it masks the
    // bed. An author may put four narration slices on one row or on four; the carve
    // has to see all of them either way.
    const bed = document.createElement("audio");
    bed.id = "music-bed";
    bed.setAttribute("data-track-index", "8");
    document.body.append(bed);
    const rows = ["11", "12", "13", "3"];
    rows.forEach((row, i) => {
      const voice = document.createElement("audio");
      voice.id = `narration-${i + 1}`;
      voice.setAttribute("data-track-index", row);
      voice.setAttribute("data-start", String(i * 10));
      document.body.append(voice);
    });
    const host = document.createElement("div");
    document.body.append(host);
    const onSetAttributeQuiet = vi.fn();
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={
            {
              dataAttributes: { start: "0", duration: "200", "track-index": "8" },
              id: "music-bed",
              element: bed,
            } as unknown as DomEditSelection
          }
          onSetAttributeQuiet={onSetAttributeQuiet}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    const offered = Array.from(host.querySelectorAll<HTMLElement>("[data-carve-source]")).map(
      (el) => el.dataset["carveSource"] ?? "",
    );
    expect(offered).toEqual(["narration-1", "narration-2", "narration-3", "narration-4"]);
    // And it carves against all four without being asked.
    const write = onSetAttributeQuiet.mock.calls.find((c) => c[0] === "data-fx-carve");
    expect(JSON.parse(String(write![1])).sources).toEqual([
      "narration-1",
      "narration-2",
      "narration-3",
      "narration-4",
    ]);
  });
});

/**
 * The filters and envelopes a carve produces are a MEASUREMENT of specific
 * tracks. Delete one and they describe something nobody can hear any more — the
 * bed keeps ducking for a voice that is gone.
 */
describe("AudioFxGroup carve against a deleted voice", () => {
  const CARVED_CHAIN = JSON.stringify({
    version: 1,
    nodes: [
      { type: "peaking", id: "c1", enabled: true, fromCarve: true, params: { frequency: 1000 } },
      { type: "lowpass", id: "k1", enabled: true, params: { frequency: 8000 } },
    ],
  });
  const CARVED_AUTOMATION = JSON.stringify({
    version: 1,
    lanes: [
      { target: "fx.c1.gain", points: [{ t: 0, v: -6 }] },
      { target: "fx.k1.frequency", points: [{ t: 0, v: 8000 }] },
    ],
  });

  /**
   * A bed carving against `sources`, with only `present` still in the composition.
   *
   * The timeline is what says a track is gone — not the preview DOM, which keeps
   * a deleted element around — so the store is seeded and the document is left
   * holding every track, which is exactly the mismatch the studio produces.
   */
  function mountCarved(sources: string[], present: string[]) {
    const carve = JSON.stringify({ enabled: true, sources, strength: 0.25 });
    const bed = document.createElement("audio");
    bed.id = "bed";
    document.body.append(bed);
    for (const id of new Set([...sources, ...present])) {
      const el = document.createElement("audio");
      el.id = id;
      document.body.append(el);
    }
    usePlayerStore.setState({
      elements: [
        { id: "bed", tag: "audio", start: 0, duration: 10, track: 0 },
        ...present.map((id) => ({ id, tag: "audio", start: 0, duration: 10, track: 1 })),
      ] as never,
    });
    const onSetAttributeQuiet = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={
            {
              dataAttributes: {
                "fx-carve": carve,
                "fx-chain": CARVED_CHAIN,
                automation: CARVED_AUTOMATION,
              },
              id: "bed",
              element: bed,
            } as unknown as DomEditSelection
          }
          onSetAttributeQuiet={onSetAttributeQuiet}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    return { host, onSetAttributeQuiet };
  }

  it("re-analyses against the voices that are left", () => {
    // Two voices were measured together into one set of bands. With one gone that
    // set answers a question nobody asked; the survivor has to be measured again.
    const { onSetAttributeQuiet } = mountCarved(["narration", "guest"], ["narration"]);
    const write = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(JSON.parse(String(write![1]))).toMatchObject({
      enabled: true,
      sources: ["narration"],
    });
  });

  it("leaves a carve alone while every voice it names is still there", () => {
    const { onSetAttributeQuiet } = mountCarved(["narration", "guest"], ["narration", "guest"]);
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(false);
  });

  it("does not fall back to carving against an effect when no voice is left", async () => {
    // Found in the studio, not here: deleting the narration emptied the source
    // list, and the panel filled it again with the only audio in the composition
    // — a 200 ms explosion. The picker's fallback (offer everything rather than
    // hide the track somebody needs) is for the AUTHOR to choose from. The panel
    // choosing off it is the panel deciding, and that is never the answer.
    const carve = JSON.stringify({ enabled: true, sources: [], strength: 0.25 });
    const bed = document.createElement("audio");
    bed.id = "bed";
    bed.setAttribute("data-fx-carve", carve);
    document.body.append(bed);
    const sfx = document.createElement("audio");
    sfx.id = "sfx-explosion";
    document.body.append(sfx);
    const onSetAttributeQuiet = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <AudioFxGroup
          element={
            {
              dataAttributes: { "fx-carve": carve },
              id: "bed",
              element: bed,
            } as unknown as DomEditSelection
          }
          onSetAttributeQuiet={onSetAttributeQuiet}
          onSetAttributeLive={vi.fn()}
        />,
      );
    });
    await act(async () => {});
    // Nothing written: the carve waits rather than picking the explosion.
    expect(onSetAttributeQuiet.mock.calls.some((c) => c[0] === "data-fx-carve")).toBe(false);
    // Still offered, so the author can say "actually, listen to that one".
    expect(
      Array.from(host.querySelectorAll("[data-carve-source]")).map((e) =>
        e.getAttribute("data-carve-source"),
      ),
    ).toEqual(["sfx-explosion"]);
  });

  it("drops what it generated when the last voice goes and none is left to pick", async () => {
    // Staying on with nothing to listen to is honest — a voice may come back, and
    // "off" is a different thing the author chose. What cannot stay is the output:
    // those filters and that envelope are making room for nobody.
    const { onSetAttributeQuiet } = mountCarved(["narration"], []);
    // The three writes are sequenced, not fired together: each is a
    // read-modify-write against the same file, so the carve write lands only
    // after the two that strip its output.
    await act(async () => {});
    const carve = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-carve");
    expect(JSON.parse(String(carve![1]))).toMatchObject({ enabled: true, sources: [] });

    const chain = writeTo(onSetAttributeQuiet.mock.calls, "data-fx-chain");
    // The hand-added low-pass survives; only what the carve minted goes.
    expect(JSON.parse(String(chain![1])).nodes.map((n: { id: string }) => n.id)).toEqual(["k1"]);

    const automation = writeTo(onSetAttributeQuiet.mock.calls, "data-automation");
    expect(
      JSON.parse(String(automation![1])).lanes.map((l: { target: string }) => l.target),
    ).toEqual(["fx.k1.frequency"]);
  });
});

describe("AudioFxGroup while the carve is measuring", () => {
  /**
   * `analyse` captures the chain and the automation before its fetch and decode,
   * then rewrites the whole `data-fx-chain` from that snapshot. An effect added
   * — or a knob committed — during those seconds landed first and was silently
   * discarded when the analysis returned. Only the Analyse control was gated;
   * every other control in the rack stayed live throughout.
   */
  it("locks the rack, so an edit cannot be made against a snapshot that is moving", async () => {
    // A fetch that never settles holds the panel in its analysing state, which
    // is exactly the window the race lives in.
    const hang = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", hang);
    // happy-dom has no Web Audio, and without a constructor `analyse` returns
    // before it ever reaches the decode — closing the window under test.
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData() {
          return new Promise(() => {});
        }
      },
    );
    try {
      const bed = document.createElement("audio");
      bed.id = "bed";
      bed.setAttribute("src", "bed.wav");
      document.body.append(bed);
      const voice = document.createElement("audio");
      voice.id = "narration";
      voice.setAttribute("src", "vo.wav");
      document.body.append(voice);

      const host = document.createElement("div");
      document.body.append(host);
      await act(async () => {
        createRoot(host).render(
          <AudioFxGroup
            element={
              {
                dataAttributes: { "fx-chain": CHAIN },
                id: "bed",
                element: bed,
              } as unknown as DomEditSelection
            }
            onSetAttributeQuiet={vi.fn()}
            onSetAttributeLive={vi.fn()}
          />,
        );
      });

      // The bed carves itself against its one candidate, which starts the
      // decode — and the whole rack goes read-only until it lands.
      expect(hang).toHaveBeenCalled();
      const controls = Array.from(host.querySelectorAll<HTMLInputElement>(".hf-fx-slider"));
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.every((c) => c.disabled)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
