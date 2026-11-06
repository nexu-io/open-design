import type { StudioSelectionSnapshot } from "@hyperframes/studio-server";
import type { DomEditSelection } from "../components/editor/domEditing";

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function thumbnailUrl({
  projectId,
  selection,
  currentTime,
}: {
  projectId: string;
  selection: DomEditSelection;
  currentTime: number;
}): string {
  const compPath = encodeURIComponent(
    selection.compositionPath || selection.sourceFile || "index.html",
  );
  const params = new URLSearchParams({
    t: String(round3(currentTime)),
    format: "png",
    output: "source",
  });
  if (selection.selector) params.set("selector", selection.selector);
  if (selection.selectorIndex != null) params.set("selectorIndex", String(selection.selectorIndex));
  return `/api/projects/${encodeURIComponent(projectId)}/thumbnail/${compPath}?${params.toString()}`;
}

export function buildStudioSelectionSnapshot({
  projectId,
  selection,
  currentTime,
}: {
  projectId: string;
  selection: DomEditSelection;
  currentTime: number;
}): StudioSelectionSnapshot {
  return {
    schemaVersion: 1,
    projectId,
    compositionPath: selection.compositionPath,
    sourceFile: selection.sourceFile,
    currentTime: round3(currentTime),
    target: {
      id: selection.id,
      hfId: selection.hfId,
      selector: selection.selector,
      selectorIndex: selection.selectorIndex,
    },
    label: selection.label,
    tagName: selection.tagName,
    boundingBox: {
      x: round3(selection.boundingBox.x),
      y: round3(selection.boundingBox.y),
      width: round3(selection.boundingBox.width),
      height: round3(selection.boundingBox.height),
    },
    textContent: selection.textContent,
    dataAttributes: { ...selection.dataAttributes },
    inlineStyles: { ...selection.inlineStyles },
    computedStyles: { ...selection.computedStyles },
    textFields: selection.textFields.map((field) => ({
      key: field.key,
      label: field.label,
      value: field.value,
      tagName: field.tagName,
      source: field.source,
    })),
    capabilities: { ...selection.capabilities },
    thumbnailUrl: thumbnailUrl({ projectId, selection, currentTime }),
  };
}
