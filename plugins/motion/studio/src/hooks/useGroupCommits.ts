import { buildProjectApiPath } from "../utils/projectRouting";
import { useCallback } from "react";
import {
  saveServerRewriteWithHistory,
  type DomEditCommitBaseParams,
} from "../utils/studioFileHistory";
import {
  buildDomEditPatchTarget,
  readHfId,
  type DomEditSelection,
} from "../components/editor/domEditing";
import { studioWriteHeaders } from "../utils/studioFileVersion";
import {
  findMatchingTimelineElementId,
  resolveElementTrack,
  type ElementMatchSelection,
} from "../utils/studioHelpers";
import type { TimelineElement } from "../player";
import { studioApiFetch } from "../utils/studioApiFetch";

interface UseGroupCommitsParams extends DomEditCommitBaseParams {
  /** Resync the SDK session after a server-side write (the wrapper/unwrap changes
   * structure the in-memory doc doesn't know about). */
  forceReloadSdkSession?: () => void;
  timelineElements: TimelineElement[];
}

interface PatchTarget {
  id?: string | null;
  hfId?: string;
  selector?: string;
  selectorIndex?: number;
}

interface GroupGeometry {
  bbox: { left: number; top: number; width: number; height: number };
  targets: PatchTarget[];
  rebases: Array<{ target: PatchTarget; left: number; top: number; track?: number }>;
}

// The member's current resolved track (authored, or the runtime's positional-
// index fallback). Threaded through so the server can stamp it explicitly —
// same hazard and fix as the razor split.
function resolveAuthoredTrack(
  selection: ElementMatchSelection,
  timelineElements: TimelineElement[],
): number | undefined {
  const id = findMatchingTimelineElementId(selection, timelineElements);
  if (!id) return undefined;
  const match = timelineElements.find((el) => (el.key ?? el.id) === id);
  if (!match) return undefined;
  return resolveElementTrack(match);
}

// Wrapper sits at the members' bounding box top-left; each member is rebased so
// its absolute position is unchanged. offsetLeft/Top are layout coordinates in
// composition space (transforms excluded), exactly the space the rebase formula
// `left_new = left_old - W.left` operates in — GSAP x/y and offset vars are
// transform deltas and stay correct without adjustment.
export function computeGroupGeometry(
  members: DomEditSelection[],
  timelineElements: TimelineElement[],
): GroupGeometry {
  const boxes = members.map((m) => ({
    target: buildDomEditPatchTarget(m),
    left: m.element.offsetLeft,
    top: m.element.offsetTop,
    right: m.element.offsetLeft + m.element.offsetWidth,
    bottom: m.element.offsetTop + m.element.offsetHeight,
    track: resolveAuthoredTrack(m, timelineElements),
  }));
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const width = Math.max(...boxes.map((b) => b.right)) - left;
  const height = Math.max(...boxes.map((b) => b.bottom)) - top;
  return {
    bbox: { left, top, width, height },
    targets: boxes.map((b) => b.target),
    rebases: boxes.map((b) => ({
      target: b.target,
      left: b.left - left,
      top: b.top - top,
      track: b.track,
    })),
  };
}

// Ungroup re-derives each child's track from the raw DOM (no DomEditSelection
// exists per child); matches by id, falling back to hfId for a child with no
// authored id. A child with neither keeps its current track, unstamped.
export function resolveGroupChildTracks(
  group: DomEditSelection,
  timelineElements: TimelineElement[],
): Array<{ target: PatchTarget; track?: number }> {
  const sourceFile = group.sourceFile || "index.html";
  const result: Array<{ target: PatchTarget; track?: number }> = [];
  for (const child of Array.from(group.element.children)) {
    const id = (child as HTMLElement).id || undefined;
    const hfId = readHfId(child);
    if (!id && !hfId) continue;
    const track = resolveAuthoredTrack(
      { id, hfId, sourceFile, isCompositionHost: false },
      timelineElements,
    );
    result.push({ target: buildDomEditPatchTarget({ id, hfId }), track });
  }
  return result;
}

// Shared read → mutate-route → save-with-history → reload pipeline for both
// wrap (group) and unwrap (ungroup). Mirrors the structural-mutation pattern in
// useElementLifecycleOps (delete). Returns the route's JSON, or throws.
async function commitStructuralMutation(
  pid: string,
  targetPath: string,
  route: "wrap-elements" | "unwrap-elements",
  body: unknown,
  label: string,
  deps: Pick<
    UseGroupCommitsParams,
    | "writeProjectFile"
    | "editHistory"
    | "clearDomSelection"
    | "forceReloadSdkSession"
    | "reloadPreview"
  >,
): Promise<{ content?: string; groupId?: string }> {
  let result: { content?: string; groupId?: string } = {};
  await saveServerRewriteWithHistory({
    projectId: pid,
    path: targetPath,
    label,
    writeFile: deps.writeProjectFile,
    recordEdit: deps.editHistory.recordEdit,
    rewrite: async (originalContent) => {
      const mutateResponse = await studioApiFetch(
        buildProjectApiPath(pid, `/file-mutations/${route}/${encodeURIComponent(targetPath)}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
          body: JSON.stringify(body),
        },
      );
      if (!mutateResponse.ok) {
        const errBody = (await mutateResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errBody?.error ?? `Failed to ${label.toLowerCase()} in ${targetPath}`);
      }
      result = (await mutateResponse.json()) as { content?: string; groupId?: string };
      return { disk: typeof result.content === "string" ? result.content : originalContent };
    },
  });
  deps.clearDomSelection();
  deps.forceReloadSdkSession?.();
  deps.reloadPreview();
  return result;
}

export function useGroupCommits(params: UseGroupCommitsParams) {
  const { activeCompPath, showToast, projectIdRef, timelineElements } = params;

  const groupSelection = useCallback(
    async (members: DomEditSelection[]): Promise<string | null> => {
      const pid = projectIdRef.current;
      if (!pid || members.length === 0) return null;

      // All members must live in the same source file — the wrapper is one node
      // in one document. (Cross-file grouping is out of scope.)
      const targetPath = members[0].sourceFile || activeCompPath || "index.html";
      if (members.some((m) => (m.sourceFile || activeCompPath || "index.html") !== targetPath)) {
        showToast("Can't group elements from different files", "error");
        return null;
      }

      // Auto-name "Group N" by the count of existing groups in the document.
      const doc = members[0].element.ownerDocument;
      const groupId = `Group ${doc.querySelectorAll("[data-hf-group]").length + 1}`;
      const { bbox, targets, rebases } = computeGroupGeometry(members, timelineElements);

      try {
        const data = await commitStructuralMutation(
          pid,
          targetPath,
          "wrap-elements",
          { targets, groupId, bbox, rebases },
          "Group elements",
          params,
        );
        return data.groupId ?? groupId;
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Failed to group elements", "error");
        return null;
      }
    },
    [activeCompPath, projectIdRef, showToast, params, timelineElements],
  );

  const ungroupSelection = useCallback(
    async (group: DomEditSelection): Promise<void> => {
      const pid = projectIdRef.current;
      if (!pid) return;
      const targetPath = group.sourceFile || activeCompPath || "index.html";
      const childTracks = resolveGroupChildTracks(group, timelineElements);

      try {
        await commitStructuralMutation(
          pid,
          targetPath,
          "unwrap-elements",
          { target: buildDomEditPatchTarget(group), childTracks },
          "Ungroup elements",
          params,
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Failed to ungroup elements", "error");
      }
    },
    [activeCompPath, projectIdRef, showToast, params, timelineElements],
  );

  return { groupSelection, ungroupSelection };
}
