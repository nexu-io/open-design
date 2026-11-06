// @vitest-environment happy-dom
/** Value controls: one drag is one commit and one telemetry event; classes resolve; hotkey roles match. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { compile } from "tailwindcss";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const trackStudioEvent = vi.fn();
vi.mock("../../utils/studioTelemetry", () => ({
  trackStudioEvent: (...args: unknown[]) => trackStudioEvent(...args),
}));

import { Input } from "./Input";
import { NumberField } from "./NumberField";
import { Select } from "./Select";
import { Slider } from "./Slider";
import { Toggle } from "./Toggle";
import { isTypingTarget } from "../../utils/typingTarget";
import { shouldIgnorePlaybackShortcutTarget } from "../../player/lib/playbackShortcuts";
import { __resetDesignInputThrottle, trackDesignInput } from "../../utils/designInputTracking";
import { cleanupMounted, mountHost as render } from "./mountHost.testHelpers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  trackStudioEvent.mockReset();
  __resetDesignInputThrottle();
});
afterEach(cleanupMounted);

/** Base UI moves focus a task later than React renders; happy-dom is no faster. */
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

function fire(el: Element, type: string, init: MouseEventInit & { key?: string } = {}) {
  const event =
    init.key === undefined
      ? new MouseEvent(type, { bubbles: true, ...init })
      : new KeyboardEvent(type, { bubbles: true, key: init.key });
  act(() => void el.dispatchEvent(event));
}

/** Types into a React-controlled input the way the browser does. */
function type(input: HTMLInputElement, text: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.bind(
      input,
    );
    setter(text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** One design-input telemetry call, through the real coalescing sink. */
const track = (control: string) => () =>
  trackDesignInput({ ui: "flat", section: "style", control, name: "Opacity" });

const designInputCalls = () =>
  trackStudioEvent.mock.calls.filter(([event]) => event === "design_input");

// -- the compiled stylesheet, built once for the whole file --

const STYLES_DIR = path.resolve(__dirname, "../../styles");
const require = createRequire(import.meta.url);
const TAILWIND_DIR = path.dirname(require.resolve("tailwindcss/package.json"));

async function loadStylesheet(id: string, base: string) {
  const file = id === "tailwindcss" ? path.join(TAILWIND_DIR, "index.css") : path.resolve(base, id);
  return { path: file, base: path.dirname(file), content: readFileSync(file, "utf8") };
}

/** How Tailwind escapes a candidate into a selector: `\` before each symbol. */
function asSelector(candidate: string): string {
  return candidate.replace(/[^a-zA-Z0-9-]/g, (char) => `\\${char}`);
}

let compileStudioCss: (candidates: string[]) => string;

beforeAll(async () => {
  const compiled = await compile(readFileSync(path.join(STYLES_DIR, "studio.css"), "utf8"), {
    base: STYLES_DIR,
    loadStylesheet,
  });
  compileStudioCss = (candidates) => compiled.build(candidates);
});

function unresolved(candidates: string[]): string[] {
  const css = compileStudioCss(candidates);
  return candidates.filter((candidate) => !css.includes(asSelector(candidate)));
}

/** All five, rendered together, so one sweep covers the set. */
function allFive(previewState?: "hover" | "active" | "focus") {
  const noop = () => {};
  return (
    <>
      <Input value="hello" onCommit={noop} aria-label="Name" data-preview-state={previewState} />
      <NumberField
        label="Size"
        value={24}
        unit="px"
        onCommit={noop}
        data-preview-state={previewState}
      />
      <Select
        label="Weight"
        value="400"
        options={[
          { label: "Regular", value: "400" },
          { label: "Semibold", value: "600" },
        ]}
        onCommit={noop}
        data-preview-state={previewState}
      />
      <Slider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        onCommit={noop}
        data-preview-state={previewState}
      />
      <Toggle label="Visible" checked onCommit={noop} data-preview-state={previewState} />
    </>
  );
}

describe("value control classes", () => {
  it("emits only classes Studio's stylesheet defines", () => {
    const host = render(allFive());
    const emitted = new Set<string>();
    for (const el of host.querySelectorAll("*")) {
      for (const cls of el.classList) emitted.add(cls);
    }

    expect(emitted.size).toBeGreaterThan(20);
    expect(unresolved([...emitted])).toEqual([]);
  });

  it("fails an undefined class, so the check above is not vacuous", () => {
    expect(unresolved(["bg-not-a-token", "text-step-999"])).toEqual([
      "bg-not-a-token",
      "text-step-999",
    ]);
  });

  it("keeps every interactive look reachable without a pointer", () => {
    // Same contract as Button: the `data-preview-state` half of each recipe
    // repeats the real state's half exactly, so a gallery shot cannot drift
    // away from what a pointer actually produces.
    const realPrefix: Record<string, string[]> = {
      hover: ["hover:"],
      active: ["active:"],
      focus: ["focus-visible:", "focus-within:", "has-[:focus-visible]:"],
    };
    const host = render(allFive());
    const classes = [...host.querySelectorAll("*")].flatMap((el) => [...el.classList]);

    for (const [state, prefixes] of Object.entries(realPrefix)) {
      const previewPrefix = `data-[preview-state=${state}]:`;
      const preview = classes
        .filter((cls) => cls.startsWith(previewPrefix))
        .map((cls) => cls.slice(previewPrefix.length));
      const real = classes
        .filter((cls) => prefixes.some((prefix) => cls.startsWith(prefix)))
        .map((cls) => cls.slice(cls.lastIndexOf(":") + 1));

      expect([...new Set(preview)].sort(), state).toEqual([...new Set(real)].sort());
      expect(preview.length, state).toBeGreaterThan(0);
    }
  });

  it("boxes every value control, so an input reads as an input", () => {
    // R10. The three text-shaped controls carry a real border and a background
    // that differs from the panel behind them.
    const host = render(allFive());
    const boxes = [...host.querySelectorAll(".border-border-input")];

    expect(boxes.length).toBe(4); // Input, NumberField, Select trigger, Toggle
    for (const box of boxes) {
      expect([...box.classList]).toContain("bg-input");
    }
  });
});

describe("Slider", () => {
  /** Gives the control a width so Base UI's pointer maths has a rect to use. */
  function stubRect(el: Element, width = 100) {
    el.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: 10, width, height: 10 }) as DOMRect;
  }

  it("commits once and tracks once for a drag across five moves", () => {
    const commits: number[] = [];
    const previews: number[] = [];
    // Counted at the wrapper as well as at the sink. The sink's 600 ms window
    // would collapse a per-move `track()` into one event on its own, so
    // asserting only the event count would pass even if the call moved to
    // `onValueChange`. The raw count is what pins KTD11.
    let trackCalls = 0;
    const trackOnce = track("slider");
    const host = render(
      <Slider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        onPreview={(n) => previews.push(n)}
        onCommit={(n) => commits.push(n)}
        onTrack={() => {
          trackCalls += 1;
          trackOnce();
        }}
      />,
    );
    const control = host.querySelector("[data-slider-control]")!;
    stubRect(control);

    fire(control, "pointerdown", { clientX: 10, button: 0 });
    // 10 to 40 over five moves. The release commits the last value a move
    // delivered, not the pointerup coordinate, which is why the last move and
    // the release sit at the same x.
    for (const x of [15, 20, 25, 30, 40]) {
      // `buttons: 1` is not decoration: Base UI reads it to tell a real drag
      // from a move whose pointerup another element swallowed, and treats
      // `buttons: 0` as the end of the gesture.
      act(
        () =>
          void document.dispatchEvent(new MouseEvent("pointermove", { clientX: x, buttons: 1 })),
      );
    }
    act(
      () => void document.dispatchEvent(new MouseEvent("pointerup", { clientX: 40, buttons: 0 })),
    );

    expect(previews.length).toBeGreaterThan(1);
    expect(commits).toEqual([40]);
    expect(trackCalls).toBe(1);
    expect(designInputCalls()).toHaveLength(1);
  });

  it("puts the value back when a drag is aborted with the right button", () => {
    // KTD8. The pointer is still down: the abort has to stop Base UI applying
    // any further move, not merely reset the number once.
    const commits: number[] = [];
    const host = render(
      <Slider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        onCommit={(n) => commits.push(n)}
        onTrack={track("slider")}
      />,
    );
    const control = host.querySelector("[data-slider-control]")!;
    stubRect(control);

    fire(control, "pointerdown", { clientX: 10, button: 0 });
    act(
      () => void document.dispatchEvent(new MouseEvent("pointermove", { clientX: 60, buttons: 1 })),
    );
    fire(control, "contextmenu", { clientX: 60, button: 2 });
    act(
      () => void document.dispatchEvent(new MouseEvent("pointermove", { clientX: 90, buttons: 1 })),
    );
    act(
      () => void document.dispatchEvent(new MouseEvent("pointerup", { clientX: 90, buttons: 0 })),
    );

    const input = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(input.value).toBe("10");
    expect(commits.at(-1) ?? 10).toBe(10);
    expect(designInputCalls()).toHaveLength(0);
  });

  it("steps by one on ArrowRight and coalesces three fast presses into one event", () => {
    const commits: number[] = [];
    const host = render(
      <Slider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        onCommit={(n) => commits.push(n)}
        onTrack={track("slider")}
      />,
    );
    const input = host.querySelector<HTMLInputElement>('input[type="range"]')!;

    fire(input, "keydown", { key: "ArrowRight" });
    fire(input, "keydown", { key: "ArrowRight" });
    fire(input, "keydown", { key: "ArrowRight" });

    expect(commits).toEqual([11, 12, 13]);
    // Three commits, one event: the sink's 600 ms window is what turns a burst
    // of keyboard steps into one "the user worked this control".
    expect(designInputCalls()).toHaveLength(1);
  });
});

describe("NumberField", () => {
  it("commits a typed number on Enter and keeps the unit", () => {
    const commits: number[] = [];
    const host = render(
      <NumberField
        label="Size"
        value={24}
        unit="px"
        onCommit={(n) => commits.push(n)}
        onTrack={track("metric")}
      />,
    );
    const input = host.querySelector("input")!;

    type(input, "48");
    expect(commits).toEqual([]); // a keystroke is not a commit

    fire(input, "keydown", { key: "Enter" });

    expect(commits).toEqual([48]);
    expect(designInputCalls()).toHaveLength(1);
    expect(host.textContent).toContain("px");
  });

  it("shows the error state for text it cannot parse, and commits nothing", () => {
    // Not "abc": Base UI filters a non-numeral character out of the input
    // before the text ever reaches this component, so that case is unreachable
    // rather than untested. A lone minus sign is the reachable one. It is a
    // legal character, it survives into the field, and it is not a number.
    const commits: number[] = [];
    const host = render(
      <NumberField label="Size" value={24} unit="px" onCommit={(n) => commits.push(n)} />,
    );
    const input = host.querySelector("input")!;

    type(input, "abc");
    expect(input.value).toBe("24"); // rejected at the keystroke, nothing to commit

    type(input, "-");
    fire(input, "keydown", { key: "Enter" });

    expect(commits).toEqual([]);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("px");
  });

  it("treats an emptied field as an error rather than as zero", () => {
    const commits: number[] = [];
    const host = render(
      <NumberField label="Size" value={24} unit="px" onCommit={(n) => commits.push(n)} />,
    );
    const input = host.querySelector("input")!;

    type(input, "");
    fire(input, "keydown", { key: "Enter" });

    expect(commits).toEqual([]);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Input", () => {
  it("commits a typed value on Enter, once, and not per keystroke", () => {
    const commits: string[] = [];
    const host = render(
      <Input
        value="hello"
        aria-label="Name"
        onCommit={(v) => commits.push(v)}
        onTrack={track("text")}
      />,
    );
    const input = host.querySelector("input")!;

    type(input, "world");
    expect(commits).toEqual([]);

    fire(input, "keydown", { key: "Enter" });

    expect(commits).toEqual(["world"]);
    expect(designInputCalls()).toHaveLength(1);
  });

  it("abandons the draft on Escape", () => {
    const commits: string[] = [];
    const host = render(
      <Input value="hello" aria-label="Name" onCommit={(v) => commits.push(v)} />,
    );
    const input = host.querySelector("input")!;

    type(input, "world");
    fire(input, "keydown", { key: "Escape" });

    expect(input.value).toBe("hello");
    expect(commits).toEqual([]);
  });
});

describe("Select", () => {
  it("opens with Space, moves the highlight, and commits on Enter", async () => {
    const commits: string[] = [];
    const host = render(
      <Select
        label="Weight"
        value="400"
        options={[
          { label: "Regular", value: "400" },
          { label: "Semibold", value: "600" },
        ]}
        onCommit={(v) => commits.push(v)}
        onTrack={track("select")}
      />,
    );
    const trigger = host.querySelector('[role="combobox"]')!;

    // The trigger is a real `<button>`, so Space reaches it as keydown, keyup
    // and then a click the browser synthesises. happy-dom does not synthesise
    // that click, so the test dispatches the sequence a browser produces.
    fire(trigger, "keydown", { key: " " });
    fire(trigger, "keyup", { key: " " });
    act(() => (trigger as HTMLElement).click());
    await settle();
    const options = [...document.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(2);

    fire(document.activeElement ?? document.body, "keydown", { key: "ArrowDown" });
    await settle();
    expect(document.querySelector("[data-highlighted]")?.textContent).toBe("Semibold");

    fire(document.activeElement ?? document.body, "keydown", { key: "Enter" });
    await settle();

    expect(commits).toEqual(["600"]);
    expect(designInputCalls()).toHaveLength(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Toggle", () => {
  it("flips on click and on Space, and reports aria-checked", () => {
    const flips: boolean[] = [];
    const host = render(
      <Toggle
        label="Visible"
        checked={false}
        onCommit={(v) => flips.push(v)}
        onTrack={track("toggle")}
      />,
    );
    const control = host.querySelector('[role="switch"]') as HTMLElement;

    expect(control.getAttribute("aria-checked")).toBe("false");

    act(() => control.click());
    fire(control, "keydown", { key: " " });
    fire(control, "keyup", { key: " " });

    expect(flips).toEqual([true, true]);
    expect(designInputCalls()).toHaveLength(1); // coalesced, same control
  });
});

describe("hotkey classification (KTD13)", () => {
  it("classifies each control the way the native input it replaces was", async () => {
    // Native reference on the left, primitive on the right. Both selector lists
    // have to agree on each pair, or a global shortcut starts behaving
    // differently after a consumer migrates.
    const host = render(
      <>
        <input type="text" data-testid="native-text" />
        <input type="range" data-testid="native-range" />
        <select data-testid="native-select">
          <option>a</option>
        </select>
        <input type="checkbox" data-testid="native-checkbox" />
        {allFive()}
      </>,
    );
    await settle();

    const native = (id: string) => host.querySelector(`[data-testid="${id}"]`)!;
    const pairs: Array<[string, Element]> = [
      ["native-text", host.querySelectorAll("input[type='text']")[1]!],
      ["native-range", host.querySelector("input[type='range']")!],
      ["native-select", host.querySelector('[role="combobox"]')!],
      ["native-checkbox", host.querySelector('[role="switch"]')!],
    ];

    for (const [nativeId, primitive] of pairs) {
      expect(isTypingTarget(primitive), `${nativeId}: typing target`).toBe(
        isTypingTarget(native(nativeId)),
      );
      expect(shouldIgnorePlaybackShortcutTarget(primitive), `${nativeId}: playback`).toBe(
        shouldIgnorePlaybackShortcutTarget(native(nativeId)),
      );
    }

    // The slider thumb in particular: arrow keys must step the slider rather
    // than nudge the canvas selection, which only holds while its input counts
    // as a typing target.
    expect(isTypingTarget(host.querySelector("input[type='range']"))).toBe(true);
  });
});
