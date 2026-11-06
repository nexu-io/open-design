// fallow-ignore-file code-duplication
// The mount/unmount harness matches ProjectUnreachableBanner.test.tsx's — the
// same small React-root scaffold every banner test in this directory uses.
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CompositionMissingBanner } from "./CompositionMissingBanner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("CompositionMissingBanner", () => {
  it("names the missing composition and does not claim the whole project is gone", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<CompositionMissingBanner path="scenes/intro.html" />);
    });

    expect(host.textContent).toContain("scenes/intro.html");
    expect(host.textContent).toContain("no longer on disk");
    // Distinct from ProjectUnreachableBanner's wording — this is one file
    // inside a project that resolves fine, not the whole project.
    expect(host.textContent).not.toContain("This Studio is serving");
  });
});
