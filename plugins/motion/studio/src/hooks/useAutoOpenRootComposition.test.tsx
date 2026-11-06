// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoOpenRootComposition } from "./useAutoOpenRootComposition";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = {
  projectId: string | null;
  activeCompPath: string | null;
  activeCompPathHydrated: boolean;
  masterCompPath: string | null;
  onSelectComposition: (comp: string) => void;
};

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function Harness(props: Props) {
  useAutoOpenRootComposition(props);
  return null;
}

function renderHarness(props: Props) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  let current = props;

  act(() => {
    root?.render(<Harness {...current} />);
  });

  return {
    rerender: (next: Partial<Props>) => {
      current = { ...current, ...next };
      act(() => {
        root?.render(<Harness {...current} />);
      });
    },
  };
}

describe("useAutoOpenRootComposition", () => {
  it("opens the master composition once hydration settles on no selection", () => {
    const onSelectComposition = vi.fn();
    renderHarness({
      projectId: "demo",
      activeCompPath: null,
      activeCompPathHydrated: true,
      masterCompPath: "index.html",
      onSelectComposition,
    });

    expect(onSelectComposition).toHaveBeenCalledExactlyOnceWith("index.html");
  });

  it("waits for the file tree before opening anything", () => {
    const onSelectComposition = vi.fn();
    const { rerender } = renderHarness({
      projectId: "demo",
      activeCompPath: null,
      activeCompPathHydrated: true,
      masterCompPath: null,
      onSelectComposition,
    });

    expect(onSelectComposition).not.toHaveBeenCalled();

    rerender({ masterCompPath: "index.html" });
    expect(onSelectComposition).toHaveBeenCalledExactlyOnceWith("index.html");
  });

  it("never auto-opens once a URL-hydrated selection is already active", () => {
    const onSelectComposition = vi.fn();
    renderHarness({
      projectId: "demo",
      activeCompPath: "hero.html",
      activeCompPathHydrated: true,
      masterCompPath: "index.html",
      onSelectComposition,
    });

    expect(onSelectComposition).not.toHaveBeenCalled();
  });

  it("does not auto-open before hydration has settled", () => {
    const onSelectComposition = vi.fn();
    const { rerender } = renderHarness({
      projectId: "demo",
      activeCompPath: null,
      activeCompPathHydrated: false,
      masterCompPath: "index.html",
      onSelectComposition,
    });

    expect(onSelectComposition).not.toHaveBeenCalled();

    rerender({ activeCompPathHydrated: true });
    expect(onSelectComposition).toHaveBeenCalledExactlyOnceWith("index.html");
  });

  it("fires only once even if the selection is cleared back to null later", () => {
    const onSelectComposition = vi.fn();
    const { rerender } = renderHarness({
      projectId: "demo",
      activeCompPath: null,
      activeCompPathHydrated: true,
      masterCompPath: "index.html",
      onSelectComposition,
    });
    expect(onSelectComposition).toHaveBeenCalledTimes(1);

    rerender({ activeCompPath: "index.html" });
    rerender({ activeCompPath: null });
    expect(onSelectComposition).toHaveBeenCalledTimes(1);
  });

  it("auto-opens again for a different project after already settling for the first one", () => {
    const onSelectComposition = vi.fn();
    const { rerender } = renderHarness({
      projectId: "project-a",
      activeCompPath: null,
      activeCompPathHydrated: true,
      masterCompPath: "index.html",
      onSelectComposition,
    });
    expect(onSelectComposition).toHaveBeenCalledExactlyOnceWith("index.html");

    // This hook's OWN decision logic, given activeCompPath/masterCompPath already reset for
    // the new project (by whatever reset the caller wires up — see
    // useResetSelectionOnProjectSwitch.test.tsx for that end-to-end case with real state).
    rerender({
      projectId: "project-b",
      activeCompPath: null,
      masterCompPath: null,
    });
    expect(onSelectComposition).toHaveBeenCalledTimes(1);

    rerender({ masterCompPath: "hero.html" });
    expect(onSelectComposition).toHaveBeenCalledTimes(2);
    expect(onSelectComposition).toHaveBeenLastCalledWith("hero.html");
  });
});
