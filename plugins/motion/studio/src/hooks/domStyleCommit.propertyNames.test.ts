// @vitest-environment jsdom
import { expect, it } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { PatchOperation } from "../utils/sourcePatcher";
import { commitDomStyles, type DomStyleCommitContext } from "./domStyleCommit";

const selection = {
  id: "target",
  selector: "#target",
  label: "Target",
  tagName: "div",
  sourceFile: "index.html",
  compositionPath: "index.html",
  textFields: [],
  inlineStyles: {},
  computedStyles: {},
  dataAttributes: {},
  capabilities: { canSelect: true, canEditStyles: true },
} as unknown as DomEditSelection;

async function savedPatches(styles: Record<string, string>) {
  const saves: Array<{ operations: PatchOperation[]; label?: string }> = [];
  const context: DomStyleCommitContext = {
    activeCompPath: "index.html",
    previewIframeRef: { current: null },
    showToast: () => undefined,
    versions: new Map(),
    persistDomEditOperations: (async (
      _selection: DomEditSelection,
      operations: PatchOperation[],
      options?: { label?: string },
    ) => {
      saves.push({ operations, label: options?.label });
    }) as unknown as DomStyleCommitContext["persistDomEditOperations"],
  };
  await commitDomStyles(context, selection, styles);
  return saves;
}

const written = (operations: PatchOperation[]) =>
  operations.map((op) => [(op as { property: string }).property, (op as { value: string }).value]);

it("writes a style named the JavaScript way under its CSS name", async () => {
  const saves = await savedPatches({ backgroundColor: "#ff0000" });
  expect(saves.map((save) => written(save.operations))).toEqual([
    [["background-color", "#ff0000"]],
  ]);
});

it("saves a map mixing both forms as one patch and one undo step, all under CSS names", async () => {
  const saves = await savedPatches({
    borderRadius: "4",
    "border-color": "red",
    WebkitTextStroke: "1px black",
    msTransform: "none",
  });
  expect(saves).toHaveLength(1);
  expect(saves[0]!.label).toBe("Edit layer style");
  expect(written(saves[0]!.operations)).toEqual([
    ["border-radius", "4px"],
    ["border-color", "red"],
    ["-webkit-text-stroke", "1px black"],
    ["-ms-transform", "none"],
  ]);
});

it("keeps a custom property's name exactly as given", async () => {
  const saves = await savedPatches({ "--brand": "#123456", "--brandAccent": "#654321" });
  expect(written(saves[0]!.operations)).toEqual([
    ["--brand", "#123456"],
    ["--brandAccent", "#654321"],
  ]);
});
