// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import { VariablesPanel } from "./VariablesPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const withTitle = (id: string, label: string) => `<!DOCTYPE html>
<html data-composition-variables='[{"id":"title","type":"string","label":"${label}","default":"Hello"}]'>
<body><div data-composition-id="${id}" data-hf-id="hf-stage" data-hf-root data-duration="5"></div></body>
</html>`;

const files: Record<string, string> = {
  "index.html":
    '<html><body><div data-hf-id="hf-stage" data-hf-root data-duration="5"></div></body></html>',
  "main.html": withTitle("main", "Main title"),
  "scene.html": withTitle("scene", "Scene title"),
  ".hyperframes/preview/4884df6e.html": withTitle("root", "Generated title"),
};
const shell = {
  activeCompPath: "index.html" as string | null,
  compositions: ["index.html", "scene.html"],
};

vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({ activeCompPath: shell.activeCompPath, showToast: vi.fn() }),
  useStudioPlaybackContext: () => ({ refreshKey: 0 }),
}));
vi.mock("../../contexts/DomEditContext", () => ({
  useDomEditContext: () => ({ domEditSelection: null }),
}));
vi.mock("../../contexts/FileManagerContext", () => ({
  useFileManagerContext: () => ({
    readProjectFile: async (path: string) => files[path] ?? "",
    writeProjectFile: vi.fn(),
    fileTree: Object.keys(files),
    compositions: shell.compositions,
  }),
}));

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function renderOtherCompositions(sessionPath: string): Promise<string> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const session = await openComposition(files[sessionPath]!, { history: false });
  await act(async () => {
    root?.render(
      <VariablesPanel
        sdkSession={session}
        publishSdkSession={vi.fn()}
        reloadPreview={vi.fn()}
        recordEdit={vi.fn(async () => {})}
      />,
    );
  });
  const other = () =>
    [...host.querySelectorAll("p")].find((p) => p.textContent === "Other compositions")
      ?.parentElement?.textContent ?? "";
  await vi.waitFor(() => expect(other()).toContain("scene.html"));
  return other();
}

describe("VariablesPanel other compositions", () => {
  it("lists the project's compositions, not Studio's generated preview documents", async () => {
    shell.activeCompPath = "index.html";
    shell.compositions = ["index.html", "scene.html"];
    expect(await renderOtherCompositions("index.html")).not.toContain(".hyperframes/preview");
  });

  it("leaves out the main composition in the master view when it is not index.html", async () => {
    shell.activeCompPath = null;
    shell.compositions = ["main.html", "scene.html"];
    expect(await renderOtherCompositions("main.html")).not.toContain("main.html");
  });
});
