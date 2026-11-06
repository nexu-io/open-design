// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarLintButton } from "./SidebarLintButton";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(
  window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }
).happyDOM.settings.disableIframePageLoading = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function renderBadge(lintHasError: boolean): HTMLElement | null {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <SidebarLintButton
        onLint={vi.fn()}
        linting={false}
        findingCount={2}
        hasError={lintHasError}
      />,
    );
  });
  return host.querySelector<HTMLElement>("[data-lint-badge]");
}

describe("SidebarLintButton badge", () => {
  it("pulses, and stops for reduced motion, while an error finding exists", () => {
    const badge = renderBadge(true);
    expect(badge?.dataset.lintBadge).toBe("error");
    expect(badge?.className).toContain("animate-pulse");
    expect(badge?.className).toContain("motion-reduce:animate-none");
    expect(badge?.textContent).toContain("including errors");
  });

  it("pulses a few times and then holds still, so an idle Studio paints nothing", () => {
    const badge = renderBadge(true);
    expect(badge?.style.animationIterationCount).toBe("3");
  });

  it("pulses again when the finding count changes", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const render = (findingCount: number) =>
      act(() => {
        root?.render(
          <SidebarLintButton
            onLint={vi.fn()}
            linting={false}
            findingCount={findingCount}
            hasError
          />,
        );
      });
    render(2);
    const first = host.querySelector("[data-lint-badge]");
    render(2);
    expect(host.querySelector("[data-lint-badge]")).toBe(first);
    render(3);
    // A new element restarts its CSS animation; a text change on the old one would not.
    expect(host.querySelector("[data-lint-badge]")).not.toBe(first);
  });

  it("stays still when the findings are warnings only", () => {
    const badge = renderBadge(false);
    expect(badge?.dataset.lintBadge).toBe("warning");
    expect(badge?.className).not.toContain("animate-pulse");
    expect(badge?.textContent).toContain("warnings only");
  });
});
