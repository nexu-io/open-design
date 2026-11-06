import { buildProjectApiPath } from "./projectRouting";
import type { RegistryItem } from "@hyperframes/core/registry";
import type { TimelineElement } from "../player";
import {
  insertTimelineAssetIntoSource,
  resolveTimelineAssetCompositionSize,
} from "./timelineAssetDrop";
import { collectHtmlIds } from "./studioHelpers";
import { generateId } from "./generateId";
import { formatTimelineAttributeNumber } from "../player/components/timelineEditing";
import { saveProjectFilesWithHistory } from "./studioFileHistory";
import { serializeStudioFileMutation } from "./studioFileMutationCoordinator";
import { extendRootDurationInSource } from "./rootDuration";
import { deriveTimelineStoreKeyForDomId } from "../player/lib/timelineElementHelpers";
import { studioApiFetch } from "./studioApiFetch";

function getMaxZIndexFromIframe(iframe: HTMLIFrameElement | null): number {
  try {
    const doc = iframe?.contentDocument;
    if (!doc) return 0;
    let max = 0;
    for (const el of doc.body.querySelectorAll("*")) {
      const z = parseInt(getComputedStyle(el).zIndex, 10);
      if (Number.isFinite(z) && z > max) max = z;
    }
    return max;
  } catch {
    return 0;
  }
}

interface AddBlockOptions {
  projectId: string;
  blockName: string;
  activeCompPath: string | null;
  placement?: { start: number; duration?: number; track?: number };
  visualPosition?: { left: number; top: number };
  previewIframe?: HTMLIFrameElement | null;
  currentTime?: number;
  timelineElements: TimelineElement[];
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (entry: {
    label: string;
    coalesceKey?: string;
    files: Record<string, { before: string; after: string }>;
  }) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  reloadPreview: () => void;
  showToast: (msg: string) => void;
}

function buildUniqueCompositionId(baseName: string, existingIds: Iterable<string>): string {
  const idSet = new Set(existingIds);
  if (!idSet.has(baseName)) return baseName;
  let i = 2;
  while (idSet.has(`${baseName}_${i}`)) i++;
  return `${baseName}_${i}`;
}

async function installRegistryItem({
  projectId,
  blockName,
  showToast,
}: Pick<AddBlockOptions, "projectId" | "blockName" | "showToast">): Promise<{
  block: RegistryItem;
  compositionFile: string;
} | null> {
  const response = await studioApiFetch(buildProjectApiPath(projectId, `/registry/install`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockName }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Install failed" }));
    showToast((error as { error?: string }).error || "Failed to install block");
    return null;
  }
  const { written, block } = (await response.json()) as {
    written: string[];
    block: RegistryItem;
  };
  const compositionFile = written.find((file) => file.endsWith(".html")) ?? written[0];
  if (!compositionFile) {
    showToast("Installed but no composition file was written");
    return null;
  }
  return { block, compositionFile };
}

async function makeComponentBackgroundTransparent(
  block: RegistryItem,
  compositionFile: string,
  readProjectFile: AddBlockOptions["readProjectFile"],
  writeProjectFile: AddBlockOptions["writeProjectFile"],
): Promise<void> {
  if (block.type !== "hyperframes:component") return;
  await serializeStudioFileMutation(writeProjectFile, compositionFile, async () => {
    const content = await readProjectFile(compositionFile);
    const transparentContent = content.replace(
      /background:\s*(?:#(?:0a0a0a|000000|000|0a0805)|rgba?\([^)]*\))\s*;/g,
      "background: transparent;",
    );
    if (transparentContent !== content) await writeProjectFile(compositionFile, transparentContent);
  });
}

function resolveBlockPlacement({
  block,
  placement,
  timelineElements,
  currentTime,
}: {
  block: RegistryItem;
  placement: AddBlockOptions["placement"];
  timelineElements: TimelineElement[];
  currentTime: number;
}) {
  const isBlock = block.type === "hyperframes:block";
  const {
    start: placementStart = currentTime,
    duration: placementDuration,
    track: placementTrack,
  } = placement ?? {};
  const start = Number(formatTimelineAttributeNumber(placementStart));
  const blockDuration = "duration" in block ? (block as { duration: number }).duration : undefined;
  const duration =
    placementDuration ??
    blockDuration ??
    timelineElements.reduce(
      (max, element) => Math.max(max, (element.start ?? 0) + (element.duration ?? 0)),
      10,
    );
  const nextTrack = Math.max(0, ...timelineElements.map((element) => element.track)) + 1;
  const track = placementTrack ?? (isBlock ? 0 : nextTrack);
  return { duration, isBlock, start, track };
}

function buildSubCompositionHtml({
  id,
  compositionFile,
  start,
  duration,
  track,
  width,
  height,
  left,
  top,
  zIndex,
}: {
  id: string;
  compositionFile: string;
  start: number;
  duration: number;
  track: number;
  width: number;
  height: number;
  left: number;
  top: number;
  zIndex: number;
}): string {
  return [
    `<div`,
    `  id="${id}"`,
    `  data-hf-id="hf-${generateId()}"`,
    `  data-composition-id="${id}"`,
    `  data-composition-src="${compositionFile}"`,
    `  data-start="${formatTimelineAttributeNumber(start)}"`,
    `  data-duration="${formatTimelineAttributeNumber(duration)}"`,
    `  data-track-index="${track}"`,
    `  data-width="${width}"`,
    `  data-height="${height}"`,
    `  style="position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; z-index: ${zIndex}"`,
    `></div>`,
  ].join("\n");
}

export async function addBlockToProject(
  opts: AddBlockOptions,
): Promise<{ block: RegistryItem; compositionPath: string; hostKey: string } | null> {
  const {
    projectId,
    blockName,
    activeCompPath,
    placement,
    visualPosition,
    timelineElements,
    readProjectFile,
    writeProjectFile,
    recordEdit,
    refreshFileTree,
    reloadPreview,
    showToast,
  } = opts;

  try {
    const installed = await installRegistryItem({ projectId, blockName, showToast });
    if (!installed) return null;
    const { block, compositionFile } = installed;
    await makeComponentBackgroundTransparent(
      block,
      compositionFile,
      readProjectFile,
      writeProjectFile,
    );

    const targetPath = activeCompPath || "index.html";
    const relevantElements = timelineElements.filter(
      (element) => (element.sourceFile || targetPath) === targetPath,
    );
    const { duration, isBlock, start, track } = resolveBlockPlacement({
      block,
      placement,
      timelineElements: relevantElements,
      currentTime: opts.currentTime ?? 0,
    });
    let hostId = "";
    const insertHost = (originalContent: string) => {
      const { width, height } = resolveTimelineAssetCompositionSize(originalContent);
      hostId = buildUniqueCompositionId(block.name, collectHtmlIds(originalContent));
      const subComposition = buildSubCompositionHtml({
        id: hostId,
        compositionFile,
        start,
        duration,
        track,
        width,
        height,
        left: visualPosition ? Math.round(visualPosition.left) : 0,
        top: visualPosition ? Math.round(visualPosition.top) : 0,
        zIndex: getMaxZIndexFromIframe(opts.previewIframe ?? null) + 1,
      });
      return extendRootDurationInSource(
        insertTimelineAssetIntoSource(originalContent, subComposition),
        start + duration,
      );
    };
    await saveProjectFilesWithHistory({
      projectId,
      label: `Add ${isBlock ? "block" : "component"}: ${block.title}`,
      files: { [targetPath]: insertHost },
      readFile: readProjectFile,
      writeFile: writeProjectFile,
      recordEdit,
    });

    await refreshFileTree();
    reloadPreview();

    return {
      block,
      compositionPath: compositionFile,
      hostKey: deriveTimelineStoreKeyForDomId(hostId, targetPath),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add block";
    showToast(message);
    return null;
  }
}
