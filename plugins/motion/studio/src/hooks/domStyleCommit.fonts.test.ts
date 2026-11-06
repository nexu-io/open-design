// @vitest-environment jsdom
import { expect, it } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { ImportedFontAsset } from "../components/editor/fontAssets";
import { importedFontFaceCssFor } from "../utils/studioFontHelpers";
import { commitDomStyles, type DomStyleCommitContext } from "./domStyleCommit";

const selection = (id: string): DomEditSelection =>
  ({
    id,
    selector: `#${id}`,
    label: id,
    tagName: "p",
    sourceFile: "index.html",
    compositionPath: "index.html",
    textFields: [],
    inlineStyles: {},
    computedStyles: {},
    dataAttributes: {},
    capabilities: { canSelect: true, canEditStyles: true },
  }) as unknown as DomEditSelection;

const poppins = (file: string, weight: string): ImportedFontAsset => ({
  family: "Poppins",
  path: `assets/fonts/Poppins/${file}`,
  url: `/preview/assets/fonts/Poppins/${file}`,
  weight,
  style: "normal",
});

it("each font a host hands over is saved as its own face, with the weight and style it draws", async () => {
  const faces: string[] = [];
  let listed: ImportedFontAsset | null = null;
  const context: DomStyleCommitContext = {
    activeCompPath: "index.html",
    previewIframeRef: { current: null },
    showToast: () => undefined,
    versions: new Map(),
    resolveImportedFontAsset: () => listed,
    persistDomEditOperations: (async (
      _selection: DomEditSelection,
      _operations: unknown,
      options?: { importedFont?: ImportedFontAsset },
    ) => {
      if (options?.importedFont)
        faces.push(importedFontFaceCssFor(options.importedFont, "index.html"));
    }) as unknown as DomStyleCommitContext["persistDomEditOperations"],
  };
  listed = poppins("Poppins-SemiBold.ttf", "600");
  await commitDomStyles(context, selection("title"), { "font-family": "Poppins" });
  listed = poppins("Poppins-Regular.ttf", "400");
  await commitDomStyles(context, selection("subtitle"), { "font-family": "Poppins" });
  expect(faces).toHaveLength(2);
  expect(faces[0]).toContain('Poppins-SemiBold.ttf"); font-weight: 600; font-style: normal;');
  expect(faces[1]).toContain('Poppins-Regular.ttf"); font-weight: 400; font-style: normal;');
});
