// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseWiggleEase } from "@hyperframes/core/wiggle-ease";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EaseBezierField, SpringBounceField, WiggleField } from "./EaseParamFields";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});

function renderField(field: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(field));
  return host;
}

function parsedWiggle(ease: string) {
  const config = parseWiggleEase(ease);
  expect(config).not.toBeNull();
  if (!config) throw new Error(`Expected a valid wiggle ease: ${ease}`);
  return config;
}

function expectWiggleCommit(onCommit: ReturnType<typeof vi.fn>, ease: string): void {
  expect(onCommit).toHaveBeenLastCalledWith(ease);
  const emitted = onCommit.mock.lastCall?.[0];
  expect(typeof emitted === "string" ? parseWiggleEase(emitted) : null).not.toBeNull();
}

function inputValue(input: HTMLInputElement, value: string): void {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function commitInputValue(input: HTMLInputElement, value: string): void {
  act(() => input.focus());
  inputValue(input, value);
  act(() => input.blur());
}

// Render a default wiggle field, type `value` into the input labelled `label`,
// and return the commit spy — the shared body of the input-edit cases.
function editWiggle(label: string, value: string): ReturnType<typeof vi.fn> {
  const onCommit = vi.fn();
  const host = renderField(
    <WiggleField config={parsedWiggle("wiggle(6,easeOut,0.26)")} onCommit={onCommit} />,
  );
  const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  expect(input).not.toBeNull();
  if (input) commitInputValue(input, value);
  return onCommit;
}

describe("WiggleField", () => {
  it("reflects a parsed wiggle config", () => {
    const host = renderField(
      <WiggleField config={parsedWiggle("wiggle(6,easeOut,0.26)")} onCommit={vi.fn()} />,
    );

    expect(host.querySelector<HTMLInputElement>('[aria-label="Wiggle count"]')?.value).toBe("6");
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Wiggle type"]')?.value).toBe(
      "easeOut",
    );
    expect(host.querySelector<HTMLInputElement>('[aria-label="Wiggle amplitude"]')?.value).toBe(
      "0.26",
    );
  });

  it("commits an edited count", () => {
    expectWiggleCommit(editWiggle("Wiggle count", "4"), "wiggle(4,easeOut,0.26)");
  });

  it("commits an edited type", () => {
    const onCommit = vi.fn();
    const host = renderField(
      <WiggleField config={parsedWiggle("wiggle(6,easeOut,0.26)")} onCommit={onCommit} />,
    );

    const select = host.querySelector<HTMLSelectElement>('[aria-label="Wiggle type"]');
    expect(select).not.toBeNull();
    act(() => {
      if (!select) return;
      select.value = "anticipate";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expectWiggleCommit(onCommit, "wiggle(6,anticipate,0.26)");
  });

  it("commits an edited amplitude", () => {
    expectWiggleCommit(editWiggle("Wiggle amplitude", "0.1"), "wiggle(6,easeOut,0.1)");
  });

  it("seeds and explicitly commits the per-type default amplitude", () => {
    const onCommit = vi.fn();
    const host = renderField(
      <WiggleField config={parsedWiggle("wiggle(3,easeInOut)")} onCommit={onCommit} />,
    );

    expect(host.querySelector<HTMLInputElement>('[aria-label="Wiggle amplitude"]')?.value).toBe(
      "0.08",
    );
    const count = host.querySelector<HTMLInputElement>('[aria-label="Wiggle count"]');
    expect(count).not.toBeNull();
    if (count) commitInputValue(count, "4");

    expectWiggleCommit(onCommit, "wiggle(4,easeInOut,0.08)");
  });

  it("ignores an empty amplitude", () => {
    expect(editWiggle("Wiggle amplitude", "")).not.toHaveBeenCalled();
  });

  it("rejects a count below one", () => {
    expect(editWiggle("Wiggle count", "0")).not.toHaveBeenCalled();
  });
});

describe("moved ease parameter fields", () => {
  it("keeps the spring bounce commit behavior", () => {
    const onCommit = vi.fn();
    const host = renderField(<SpringBounceField springBounce={0.5} onCommit={onCommit} />);
    const input = host.querySelector<HTMLInputElement>('[aria-label="Spring bounce"]');
    expect(input).not.toBeNull();
    if (input) commitInputValue(input, "0.333");

    expect(onCommit).toHaveBeenLastCalledWith("spring(0.33)");
  });

  it("commits a numeric draft exactly once when Enter blurs the field", () => {
    const onCommit = vi.fn();
    const host = renderField(<SpringBounceField springBounce={0.5} onCommit={onCommit} />);
    const input = host.querySelector<HTMLInputElement>('[aria-label="Spring bounce"]')!;

    act(() => input.focus());
    inputValue(input, "0.7");
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(onCommit).toHaveBeenCalledExactlyOnceWith("spring(0.7)");
  });

  it("keeps the cubic-bezier tuple commit behavior", () => {
    const onCommit = vi.fn();
    const host = renderField(<EaseBezierField tuple={[0.33, 0, 0.67, 1]} onCommit={onCommit} />);
    const input = host.querySelector<HTMLInputElement>(
      '[aria-label="Cubic bezier control points"]',
    );
    expect(input).not.toBeNull();
    act(() => {
      if (!input) return;
      input.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, "0.111, 0.222, 0.777, 0.888");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onCommit).toHaveBeenCalledExactlyOnceWith("custom(M0,0 C0.11,0.22 0.78,0.89 1,1)");
  });

  it("keeps the bezier input mounted and reports invalid values", () => {
    const onCommit = vi.fn();
    const host = renderField(<EaseBezierField tuple={[0.33, 0, 0.67, 1]} onCommit={onCommit} />);
    const input = host.querySelector<HTMLInputElement>(
      '[aria-label="Cubic bezier control points"]',
    )!;

    commitInputValue(input, "0.5, 1e9, 0.5, -1e9");

    expect(input.isConnected).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("Y values must be between -1 and 2");
    expect(onCommit).not.toHaveBeenCalled();
  });
});
