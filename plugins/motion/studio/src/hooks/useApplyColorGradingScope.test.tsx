// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useApplyColorGradingScope } from "./useApplyColorGradingScope";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readProjectFile = vi.fn(async (_path: string) => "<html><body></body></html>");

vi.mock("../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({
    projectId: "demo",
    activeCompPath: "index.html",
    showToast: vi.fn(),
    waitForPendingDomEditSaves: async () => {},
  }),
}));
vi.mock("../contexts/DomEditContext", () => ({
  useDomEditContext: () => ({ domEditSelection: null }),
}));
vi.mock("../contexts/FileManagerContext", () => ({
  useFileManagerContext: () => ({
    readProjectFile,
    writeProjectFile: vi.fn(),
    fileTree: ["index.html", "scene.html", ".hyperframes/preview/4884df6e.html"],
    compositions: ["index.html", "scene.html"],
  }),
}));

it("grades the project's compositions, not Studio's generated preview documents", async () => {
  let apply: ReturnType<typeof useApplyColorGradingScope> | null = null;
  function Probe() {
    apply = useApplyColorGradingScope(
      vi.fn(async () => {}),
      vi.fn(),
    );
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));

  await act(async () => {
    await apply!("project", null);
  });

  expect(readProjectFile.mock.calls.map(([path]) => path).sort()).toEqual([
    "index.html",
    "scene.html",
  ]);
  act(() => root.unmount());
});
