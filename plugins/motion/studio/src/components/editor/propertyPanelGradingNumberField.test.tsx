// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GradingNumberField } from "./propertyPanelGradingNumberField";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Expected the native input setter");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderField() {
  const callbacks = {
    onBegin: vi.fn(),
    onPreview: vi.fn(),
    onSettle: vi.fn(),
    onCancel: vi.fn(),
  };
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() =>
    root.render(
      <GradingNumberField label="Level" value={10} min={-100} max={100} {...callbacks} />,
    ),
  );
  const input = host.querySelector("input");
  if (!input) throw new Error("Expected a grading field");
  return { root, input, callbacks };
}

describe("GradingNumberField", () => {
  it("does not begin or settle an untouched focus and blur", () => {
    const { root, input, callbacks } = renderField();
    act(() => input.focus());
    act(() => input.blur());

    expect(callbacks.onBegin).not.toHaveBeenCalled();
    expect(callbacks.onPreview).not.toHaveBeenCalled();
    expect(callbacks.onSettle).not.toHaveBeenCalled();
    expect(callbacks.onCancel).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("cancels a real edit that returns to its baseline", () => {
    const { root, input, callbacks } = renderField();
    act(() => input.focus());
    act(() => changeInput(input, "25"));
    act(() => changeInput(input, "10"));
    act(() => input.blur());

    expect(callbacks.onBegin).toHaveBeenCalledOnce();
    expect(callbacks.onSettle).not.toHaveBeenCalled();
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("previews valid text and settles once on Enter", () => {
    const { root, input, callbacks } = renderField();
    act(() => input.focus());
    act(() => changeInput(input, "-25"));
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });

    expect(callbacks.onBegin).toHaveBeenCalledOnce();
    expect(callbacks.onPreview).toHaveBeenLastCalledWith(-25);
    expect(callbacks.onSettle).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
