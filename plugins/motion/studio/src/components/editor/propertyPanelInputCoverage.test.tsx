// @vitest-environment happy-dom

import React, { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesignPanelInputProvider } from "../../contexts/DesignPanelInputContext";
import { __resetDesignInputThrottle } from "../../utils/designInputTracking";
import type { PropertyPanelProps } from "./propertyPanelHelpers";
import { ColorField } from "./propertyPanelColor";
import { FontFamilyField } from "./propertyPanelFont";
import {
  FlatRow,
  FlatSegmentedRow,
  FlatSelectRow,
  FlatSlider,
} from "./propertyPanelFlatPrimitives";
import { FlatToggle } from "./propertyPanelFlatToggle";
import {
  DetailField,
  MetricField,
  Section,
  SegmentedControl,
  SelectField,
  SliderControl,
} from "./propertyPanelPrimitives";
import { TextAreaField } from "./propertyPanelSections";

const trackStudioEvent = vi.hoisted(() => vi.fn());

vi.mock("../../utils/studioTelemetry", () => ({
  trackStudioEvent: (...args: unknown[]) => trackStudioEvent(...args),
}));

vi.mock("../../contexts/StudioContext", async () => {
  const actual = await vi.importActual<typeof import("../../contexts/StudioContext")>(
    "../../contexts/StudioContext",
  );
  return { ...actual, useStudioShellContext: () => ({ showToast: vi.fn() }) };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];

beforeEach(() => {
  trackStudioEvent.mockReset();
  __resetDesignInputThrottle();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
  );
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.doUnmock("./manualEditingAvailability");
  vi.resetModules();
  vi.unstubAllGlobals();
});

function render(ui: ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(ui));
  return host;
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("expected native input value setter");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!setter) throw new Error("expected native textarea value setter");
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function blurInput(input: HTMLInputElement) {
  input.focus();
  input.blur();
}

function expectTracked(control: string, name: string, section = "style") {
  expect(trackStudioEvent).toHaveBeenLastCalledWith("design_input", {
    ui: "classic",
    section,
    control,
    name,
  });
}

function expectFlatTracked(control: string, name: string, section = "layout") {
  expect(trackStudioEvent).toHaveBeenLastCalledWith("design_input", {
    ui: "flat",
    section,
    control,
    name,
  });
}

function flatSection(children: ReactElement) {
  return (
    <DesignPanelInputProvider ui="flat" section="layout">
      {children}
    </DesignPanelInputProvider>
  );
}

function classicSection(children: ReactElement) {
  return (
    <DesignPanelInputProvider ui="classic">
      <Section title="Style" icon={null}>
        {children}
      </Section>
    </DesignPanelInputProvider>
  );
}

describe("classic property-panel primitive telemetry", () => {
  it("tracks MetricField only when a changed value commits", () => {
    const onCommit = vi.fn();
    const host = render(
      classicSection(<MetricField label="Opacity" value="20" onCommit={onCommit} />),
    );
    const input = host.querySelector("input");
    if (!input) throw new Error("expected metric input");

    // Regression guard for CommitField's shared `align` default: the classic
    // panel lays out label-then-value inline, where left-aligned reads
    // naturally — this must stay left even though the flat inspector's
    // FlatRow now opts into `align="right"` for its own justify-between rows.
    expect(input.className).toContain("text-left");
    expect(input.className).not.toContain("text-right");

    act(() => blurInput(input));
    expect(trackStudioEvent).not.toHaveBeenCalled();

    act(() => {
      changeInput(input, "40");
    });
    act(() => blurInput(input));

    expect(onCommit).toHaveBeenCalledWith("40");
    expectTracked("metric", "opacity");
  });

  it("tracks SliderControl on settle, not on its scheduled commit tick", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const host = render(
      classicSection(
        <SliderControl
          trackName="Opacity"
          value={20}
          min={0}
          max={100}
          step={1}
          displayValue="20%"
          onCommit={onCommit}
        />,
      ),
    );
    const input = host.querySelector<HTMLInputElement>('input[type="range"]');
    if (!input) throw new Error("expected slider input");

    act(() => {
      changeInput(input, "40");
    });
    act(() => vi.advanceTimersByTime(40));
    expect(trackStudioEvent).not.toHaveBeenCalled();

    act(() => input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })));
    expectTracked("slider", "opacity");
  });

  it("tracks SelectField with its label", () => {
    const host = render(
      classicSection(
        <SelectField
          label="Blend mode"
          value="normal"
          options={["normal", "multiply"]}
          onChange={vi.fn()}
        />,
      ),
    );
    const select = host.querySelector("select");
    if (!select) throw new Error("expected select");
    act(() => {
      select.value = "multiply";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expectTracked("select", "blend-mode");
  });

  it("tracks DetailField with its label", () => {
    const host = render(
      classicSection(<DetailField label="External URL" value="old.png" onCommit={vi.fn()} />),
    );
    const input = host.querySelector("input");
    if (!input) throw new Error("expected detail input");
    act(() => changeInput(input, "new.png"));
    act(() => blurInput(input));
    expectTracked("text", "external-url");
  });

  it("tracks SegmentedControl with its explicit name", () => {
    const host = render(
      classicSection(
        <SegmentedControl
          trackName="Fill type"
          value="solid"
          options={[
            { label: "Solid", value: "solid" },
            { label: "Gradient", value: "gradient" },
          ]}
          onChange={vi.fn()}
        />,
      ),
    );
    const gradient = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Gradient",
    );
    if (!gradient) throw new Error("expected Gradient segment");
    act(() => gradient.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expectTracked("segmented", "fill-type");
  });
});

describe("flat property-panel primitive telemetry", () => {
  it("tracks FlatRow commits with its label", () => {
    const host = render(
      flatSection(<FlatRow label="Z-index" value="1" tier="default" onCommit={vi.fn()} />),
    );
    const input = host.querySelector("input");
    if (!input) throw new Error("expected flat row input");

    act(() => changeInput(input, "2"));
    act(() => blurInput(input));

    expectFlatTracked("metric", "z-index");
  });

  it("tracks FlatSlider once on pointer settle, not during drag commits", () => {
    const host = render(
      flatSection(
        <FlatSlider
          label="Opacity"
          value={10}
          min={0}
          max={100}
          tier="explicitCustom"
          displayValue="10%"
          onCommit={vi.fn()}
        />,
      ),
    );
    const slider = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!slider) throw new Error("expected flat slider");
    Object.defineProperty(slider, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }),
    });

    act(() => {
      slider.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 20, pointerId: 1 }),
      );
      slider.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 80, pointerId: 1 }),
      );
    });
    expect(trackStudioEvent).not.toHaveBeenCalled();

    act(() => {
      slider.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, clientX: 80, pointerId: 1 }),
      );
    });
    expect(trackStudioEvent).toHaveBeenCalledTimes(1);
    expectFlatTracked("slider", "opacity");
  });

  it("tracks FlatSegmentedRow changes with its label", () => {
    const host = render(
      flatSection(
        <FlatSegmentedRow
          label="Direction"
          options={[
            { key: "row", node: "Row", label: "Row", active: true },
            { key: "column", node: "Column", label: "Column", active: false },
          ]}
          onChange={vi.fn()}
        />,
      ),
    );
    const column = host.querySelector<HTMLButtonElement>('[aria-label="Column"]');
    act(() => column?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expectFlatTracked("segmented", "direction");
  });

  it("tracks FlatToggle changes with its label", () => {
    const host = render(
      flatSection(<FlatToggle label="Loop" checked={false} onChange={vi.fn()} />),
    );
    const toggle = host.querySelector<HTMLButtonElement>('[data-flat-toggle="true"]');
    act(() => toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expectFlatTracked("toggle", "loop");
  });

  it("tracks FlatSelectRow changes with its accessible label", () => {
    const host = render(
      flatSection(
        <FlatSelectRow
          label=""
          ariaLabel="Preset"
          value="neutral"
          options={["neutral", "warm"]}
          tier="default"
          onChange={vi.fn()}
        />,
      ),
    );
    const select = host.querySelector("select");
    if (!select) throw new Error("expected flat select");
    act(() => {
      select.value = "warm";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expectFlatTracked("select", "preset");
  });
});

describe.each(["classic", "flat"] as const)("shared %s input telemetry", (ui) => {
  const section = (children: ReactElement) => (
    <DesignPanelInputProvider ui={ui} section="text">
      {children}
    </DesignPanelInputProvider>
  );

  it("tracks ColorField exactly once for a real color change", () => {
    const host = render(
      section(<ColorField flat={ui === "flat"} label="Color" value="#FF0000" onCommit={vi.fn()} />),
    );
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Pick color color"]');
    act(() => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const hex = Array.from(document.body.querySelectorAll<HTMLInputElement>("input")).find(
      (input) => input.value === "#FF0000",
    );
    if (!hex) throw new Error("expected color hex input");
    act(() => {
      changeInput(hex, "#00FF00");
      blurInput(hex);
    });

    expect(trackStudioEvent).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenLastCalledWith("design_input", {
      ui,
      section: "text",
      control: "color",
      name: "color",
    });
  });

  it("tracks FontFamilyField exactly once for a real selection", () => {
    const host = render(
      section(
        <FontFamilyField
          flat={ui === "flat"}
          value="Arial"
          importedFonts={[]}
          onCommit={vi.fn()}
        />,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>(
      ui === "flat" ? '[data-flat-font-trigger="true"]' : "button",
    );
    act(() => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const option = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("sans-serif"),
    );
    if (!option) throw new Error("expected sans-serif font option");
    act(() => option.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(trackStudioEvent).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenLastCalledWith("design_input", {
      ui,
      section: "text",
      control: "select",
      name: "font-family",
    });
  });

  it("tracks TextAreaField exactly once across scheduled commit and blur", () => {
    vi.useFakeTimers();
    const host = render(
      section(
        <TextAreaField flat={ui === "flat"} label="Content" value="Before" onCommit={vi.fn()} />,
      ),
    );
    const textarea = host.querySelector("textarea");
    if (!textarea) throw new Error("expected text area");
    act(() => changeTextarea(textarea, "After"));
    act(() => vi.advanceTimersByTime(120));
    act(() => {
      textarea.focus();
      textarea.blur();
    });

    expect(trackStudioEvent).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenLastCalledWith("design_input", {
      ui,
      section: "text",
      control: "text",
      name: "content",
    });
  });
});

function representativeElement() {
  return {
    element: document.createElement("div"),
    id: "panel-target",
    selector: "#panel-target",
    label: "Panel Target",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 320, height: 180 },
    textContent: "",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: false,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
  };
}

describe("classic PropertyPanel input coverage", () => {
  it("emits only named, known-section events across body inputs and header/footer chrome", async () => {
    vi.resetModules();
    vi.doMock("./manualEditingAvailability", () => ({ STUDIO_FLAT_INSPECTOR_ENABLED: false }));
    const { PropertyPanel } = await import("./PropertyPanel");
    const host = render(
      <PropertyPanel
        {...({
          element: representativeElement(),
          assets: [],
          onSetStyle: vi.fn(),
          onSetText: vi.fn(),
          onSetAttributeLive: vi.fn(),
          onSetManualOffset: vi.fn(),
          onSetManualSize: vi.fn(),
          onSetManualRotation: vi.fn(),
          onClearSelection: vi.fn(),
          onAskAgent: vi.fn(),
          onToggleElementHidden: vi.fn(),
          recordingState: "idle",
          onToggleRecording: vi.fn(),
        } as unknown as PropertyPanelProps)}
      />,
    );

    // Fire every body text input across the WHOLE panel (not just the layout
    // section): a section rendered without a <DesignPanelInputProvider section="X">
    // would surface here as section "unknown" and fail the invariant below.
    const bodyInputs = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    expect(bodyInputs.length).toBeGreaterThan(0);
    for (const [index, input] of bodyInputs.entries()) {
      act(() => changeInput(input, String(100 + index)));
      act(() => blurInput(input));
    }

    // Header + footer chrome — the classic siblings of the flat header/footer.
    // (Copy is skipped: its handler reaches for the clipboard, unavailable here.
    // The visibility toggle is store-gated on a live selection this unit mock does
    // not model; Clear selection already exercises the header section.)
    const clear = host.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]');
    if (!clear) throw new Error("expected classic Clear selection control");
    act(() => clear.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const recordButton = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Record gesture"),
    );
    if (!recordButton) throw new Error("expected classic gesture record button");
    act(() => recordButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(trackStudioEvent).toHaveBeenCalled();
    const sections = new Set<string>();
    for (const [, payload] of trackStudioEvent.mock.calls) {
      expect(payload.ui).toBe("classic");
      expect(payload.name).not.toBe("");
      expect(payload.name).not.toBe("unnamed");
      expect(payload.section).not.toBe("");
      expect(payload.section).not.toBe("unknown");
      sections.add(payload.section as string);
    }
    // A body section plus both chrome regions: proves coverage beyond one section
    // and that classic chrome is wired in parallel with the flat header/footer.
    expect(sections.has("header")).toBe(true);
    expect(sections.has("footer")).toBe(true);
    expect(sections.size).toBeGreaterThan(2);
  }, 15000);
});

describe("flat PropertyPanel input coverage", () => {
  it("emits only named flat events from known sections for every visible layout input", async () => {
    vi.resetModules();
    vi.doMock("./manualEditingAvailability", () => ({ STUDIO_FLAT_INSPECTOR_ENABLED: true }));
    const { PropertyPanel } = await import("./PropertyPanel");
    const host = render(
      <PropertyPanel
        {...({
          element: representativeElement(),
          assets: [],
          onSetStyle: vi.fn(),
          onSetText: vi.fn(),
          onSetAttributeLive: vi.fn(),
          onSetManualOffset: vi.fn(),
          onSetManualSize: vi.fn(),
          onSetManualRotation: vi.fn(),
          // Header/footer controls render only when their callbacks are wired —
          // supply them so the coverage guard exercises the header + footer sections.
          selectedElementId: "el-1",
          selectedElementHidden: false,
          onToggleElementHidden: vi.fn(),
          onCopyElementInfo: vi.fn(),
          onClearSelection: vi.fn(),
          onAskAgent: vi.fn(),
          onToggleRecording: vi.fn(),
        } as unknown as PropertyPanelProps)}
      />,
    );
    const layout = host.querySelector('[data-flat-group-open="true"]');
    if (!layout || !layout.textContent?.includes("Layout")) {
      throw new Error("expected open flat Layout group");
    }
    const inputs = Array.from(layout.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    expect(inputs.length).toBeGreaterThan(0);

    for (const [index, input] of inputs.entries()) {
      act(() => changeInput(input, String(200 + index)));
      act(() => blurInput(input));
    }
    // Header (Clear selection) and footer (ask + record) controls — exercises the
    // "header" and "footer" sections. The visibility toggle is intentionally omitted:
    // it renders only when the dispatcher forwards a live selection handle, which this
    // unit-level mock does not model. Clear selection already covers the header section.
    for (const selector of [
      '[aria-label="Clear selection"]',
      '[data-flat-footer-ask="true"]',
      '[data-flat-footer-record="true"]',
    ]) {
      const button = host.querySelector<HTMLButtonElement>(selector);
      if (!button) throw new Error(`expected flat panel control ${selector}`);
      act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    }

    expect(trackStudioEvent).toHaveBeenCalled();
    expect(new Set(trackStudioEvent.mock.calls.map(([, payload]) => payload.section))).toEqual(
      new Set(["layout", "header", "footer"]),
    );
    for (const [, payload] of trackStudioEvent.mock.calls) {
      expect(payload).toEqual(
        expect.objectContaining({
          ui: "flat",
        }),
      );
      expect(payload.name).not.toBe("");
      expect(payload.name).not.toBe("unnamed");
      expect(payload.section).not.toBe("");
      expect(payload.section).not.toBe("unknown");
    }
  });
});
