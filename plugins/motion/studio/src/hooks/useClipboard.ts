import { useCallback, useRef } from "react";
import { EXCLUDED_TAGS, mintHfId, walkCompositionDescendants } from "@hyperframes/parsers/hf-ids";
import type { TimelineElement } from "../player";
import { usePlayerStore } from "../player";
import { toAuthoredStart } from "../player/store/timelineElement";
import type { DomEditSelection } from "../components/editor/domEditing";
import {
  type ClipboardPayload,
  type TimelineClipboardClip,
  ID_ATTR_RE,
  deduplicateIds,
  insertAsSibling,
} from "../utils/clipboardPayload";
import { carryLook, renamedIds } from "../utils/clipboardLook";
import { collectHtmlIds } from "../utils/studioHelpers";
import { insertTimelineAssetIntoSource } from "../utils/timelineAssetDrop";
import { extendRootDurationInSource } from "../utils/rootDuration";
import { saveProjectFilesWithHistory } from "../utils/studioFileHistory";
import { formatTimelineAttributeNumber } from "../player/components/timelineEditing";
import { findElementForSelection } from "../components/editor/domEditingElement";
import { findTimelineElementInIframe, readFileContent } from "./timelineEditingHelpers";
import { buildTimelineElementKey } from "../player/lib/timelineElementHelpers";
import { timeRangesOverlap } from "../player/components/timelineCollision";
import {
  authoredMarkup,
  findAuthoredElement,
  findAuthoredElementById,
  liveMarkupWithoutPreviewMarks,
  parseSavedSource,
} from "../utils/authoredSource";
import { serializeStudioFileMutations } from "../utils/studioFileMutationCoordinator";

type InPlace = { inPlace?: boolean };

const pasteStart = (
  payload: Extract<ClipboardPayload, { kind: "timeline-clip" }>,
  targetPath: string,
  playhead: number,
  options?: InPlace,
) =>
  options?.inPlace && payload.copiedInComposition === targetPath
    ? Math.min(...payload.clips.map((clip) => clip.start))
    : playhead;

const pasteWords = (payload: ClipboardPayload) =>
  payload.kind === "timeline-clip"
    ? {
        label: clipLabel("Paste", payload.clips.length),
        toast: clipToast("Pasted", payload.clips.length),
      }
    : { label: "Paste element", toast: "Pasted element" };

interface RecordEditInput {
  label: string;
  coalesceKey?: string;
  files: Record<string, { before: string; after: string }>;
}

export interface UseClipboardOptions {
  projectId: string | null;
  activeCompPath: string | null;
  domEditSelectionRef: React.MutableRefObject<DomEditSelection | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  reloadPreview: () => void;
  handleTimelineElementsDelete: (elements: TimelineElement[]) => Promise<void>;
  handleDomEditElementDelete: (selection: DomEditSelection) => Promise<void>;
  previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  waitForPendingDomEditSaves: () => Promise<void>;
}

/** The timeline element(s) a copy/cut/duplicate acts on: the multi-selection
 *  when one is active, else the single primary selection. */
function getSelectedElements(): TimelineElement[] {
  const { selectedElementId, selectedElementIds, elements } = usePlayerStore.getState();
  if (!selectedElementId) return [];
  const ids = selectedElementIds.size > 1 ? selectedElementIds : new Set([selectedElementId]);
  return elements.filter((el) => ids.has(el.key ?? el.id));
}

function elementKey(domId: string, sourceFile: string): string {
  return buildTimelineElementKey({ id: domId, fallbackIndex: 0, domId, sourceFile });
}

/** "Paste clip" / "Paste clips" — the edit-history label, no count shown. */
function clipLabel(verb: string, clipCount: number): string {
  return `${verb} ${clipCount > 1 ? "clips" : "clip"}`;
}

/** "Pasted clip" / "Pasted 3 clips" — the toast message, count shown once plural. */
function clipToast(verbPast: string, clipCount: number): string {
  return clipCount > 1 ? `${verbPast} ${clipCount} clips` : `${verbPast} clip`;
}

function getSelectedDomElement(
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>,
  selection: DomEditSelection,
  activeCompositionPath: string | null,
): Element | null {
  let doc: Document | null = null;
  try {
    doc = iframeRef.current?.contentDocument ?? null;
  } catch {
    return null;
  }
  if (!doc) return null;

  return findElementForSelection(doc, selection, activeCompositionPath);
}

function savedMarkupElseLive(saved: Document, live: Element, sourceFile: string): string {
  const authored = findAuthoredElement(saved, live) ?? findAuthoredElementById(saved, live);
  return authored
    ? authoredMarkup(authored, live, sourceFile)
    : liveMarkupWithoutPreviewMarks(live);
}

async function readSavedMarkup(
  readSaved: (path: string) => Promise<string>,
  paths: string[],
  lives: Element[],
): Promise<string[]> {
  const sources = new Map<string, Promise<Document>>();
  return Promise.all(
    paths.map(async (path, index) => {
      if (!sources.has(path)) sources.set(path, readSaved(path).then(parseSavedSource));
      const saved = await (sources.get(path) as Promise<Document>);
      return savedMarkupElseLive(saved, lives[index] as Element, path);
    }),
  );
}

export interface PlacedClip {
  track: number;
  start: number;
  duration: number;
}

function tracksOverlap(a: PlacedClip, b: PlacedClip): boolean {
  return (
    a.track === b.track &&
    timeRangesOverlap(a.start, a.start + a.duration, b.start, b.start + b.duration)
  );
}

/** CapCut: keeps the preferred track if free at the new time, else the next
 *  unused track index. Exported so placement is tested with values directly. */
export function resolveFreeTrack(preferred: PlacedClip, taken: readonly PlacedClip[]): number {
  if (!taken.some((t) => tracksOverlap(preferred, t))) return preferred.track;
  const maxTrack = taken.reduce((max, t) => Math.max(max, t.track), preferred.track);
  return maxTrack + 1;
}

/** Gives a clone's root and every descendant a fresh data-hf-id, clear of `taken`. Minted here,
 *  inside the edit, or the server stamps them on the next preview load, behind undo's back.
 *  DOMParser, not a regex, so a `>` inside an attribute value can't defeat it. */
function remintHfIds(html: string, parser: DOMParser, taken: Set<string>): string {
  const root = parser.parseFromString(html, "text/html").body.firstElementChild;
  if (!root) {
    // A tag the HTML parser hoists out of <body> (title/meta/style/base/link)
    // never reaches the walk above — fall back to a direct strip so
    // data-hf-id still can't survive, even though no real clip root is one
    // of these tags today.
    return html.replace(/\sdata-hf-id=("[^"]*"|'[^']*')/g, "");
  }
  const elements = [root];
  walkCompositionDescendants(root, (el) => elements.push(el));
  for (const el of elements) {
    if (EXCLUDED_TAGS.has(el.tagName.toLowerCase())) el.removeAttribute("data-hf-id");
    else el.setAttribute("data-hf-id", mintHfId(el, taken));
  }
  return root.outerHTML;
}

const HF_ID_ATTR_RE = /\bdata-hf-id\s*=\s*["']?([^"'\s>]+)/gi;
const hfIdsInFile = (content: string) =>
  new Set(Array.from(content.matchAll(HF_ID_ATTR_RE), (match) => match[1]));

export function pasteElementHtml(
  content: string,
  payload: { html: string; originSelector?: string; originSelectorIndex?: number },
  fromThisFile = false,
): string {
  const reminted = remintHfIds(payload.html, new DOMParser(), hfIdsInFile(content));
  const deduped = deduplicateIds(reminted, collectHtmlIds(content));
  const result = insertAsSibling(
    content,
    deduped,
    payload.originSelector,
    payload.originSelectorIndex,
  );
  return fromThisFile ? carryLook(result, renamedIds(reminted, deduped), 0) : result;
}

/** Shared insertion path for paste and duplicate, anchored at the playhead or the selection's end. Returns the
 *  final ids so the caller can select what it placed, and the furthest end any clip lands at so it can grow the
 *  root duration to cover it. `fromThisFile`: the clips came from `content`, so a renamed copy takes its
 *  original's look. */
export function pasteTimelineClips(
  content: string,
  clips: readonly TimelineClipboardClip[],
  anchorTime: number,
  liveElements: readonly TimelineElement[],
  fromThisFile = false,
): { content: string; ids: string[]; requiredEnd: number } {
  const groupMinStart = Math.min(...clips.map((c) => c.start));
  let existingIds = collectHtmlIds(content);
  const taken: PlacedClip[] = liveElements.map((el) => ({
    track: el.authoredTrack ?? el.track,
    start: el.start,
    duration: el.duration,
  }));
  const ids: string[] = [];
  let result = content;
  let requiredEnd = 0;
  const domParser = new DOMParser();
  const takenHfIds = hfIdsInFile(content);
  for (const clip of clips) {
    const reminted = remintHfIds(clip.html, domParser, takenHfIds);
    const deduped = deduplicateIds(reminted, existingIds);
    existingIds = existingIds.concat(collectHtmlIds(deduped));
    const newStart = anchorTime + (clip.start - groupMinStart);
    const newTrack = resolveFreeTrack(
      { track: clip.track, start: newStart, duration: clip.duration },
      taken,
    );
    taken.push({ track: newTrack, start: newStart, duration: clip.duration });
    requiredEnd = Math.max(requiredEnd, newStart + clip.duration);

    // Only rewrite the outermost opening tag. The non-global regex matches
    // the first occurrence, which is always in the root tag since outerHTML
    // starts with it. Nested clips keep their own timing and track.
    const rootTagEnd = deduped.indexOf(">");
    const rootTag = rootTagEnd >= 0 ? deduped.slice(0, rootTagEnd + 1) : deduped;
    const patchedRootTag = rootTag
      .replace(/data-start="[^"]*"/, `data-start="${formatTimelineAttributeNumber(newStart)}"`)
      .replace(/data-track-index="[^"]*"/, `data-track-index="${newTrack}"`);
    const withPatched = patchedRootTag + deduped.slice(rootTagEnd + 1);
    result = insertTimelineAssetIntoSource(result, withPatched);
    if (fromThisFile) {
      const authored = Number(rootTag.match(/data-start="([^"]*)"/)?.[1]);
      const authoredStart = Number.isFinite(authored) ? authored : clip.start;
      result = carryLook(result, renamedIds(reminted, deduped), newStart - authoredStart);
    }

    const id = patchedRootTag.match(ID_ATTR_RE)?.[1];
    if (id) ids.push(id);
  }
  return { content: result, ids, requiredEnd };
}

export function useClipboard({
  projectId,
  activeCompPath,
  domEditSelectionRef,
  showToast,
  writeProjectFile,
  recordEdit,
  reloadPreview,
  handleTimelineElementsDelete,
  handleDomEditElementDelete,
  previewIframeRef,
  waitForPendingDomEditSaves,
}: UseClipboardOptions) {
  const clipboardRef = useRef<Promise<ClipboardPayload | null> | null>(null);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // After any save still in flight on the file, so a copy right after an edit takes the edit.
  const readSaved = useCallback(
    async (path: string): Promise<string> => {
      const pid = projectIdRef.current;
      if (!pid) throw new Error("No project is open.");
      // Only the order matters here; a failed save already shows its own banner.
      await waitForPendingDomEditSaves().catch(() => {});
      return serializeStudioFileMutations(writeProjectFile, [path], () =>
        readFileContent(pid, path),
      );
    },
    [waitForPendingDomEditSaves, writeProjectFile],
  );

  // Resolved through findTimelineElementInIframe, the same composition-aware
  // lookup every other timeline editor uses — unlike findElementForSelection,
  // it can address a composition-instance clip's root.
  const findSelectedClips = useCallback((): {
    elements: TimelineElement[];
    lives: Element[];
  } | null => {
    const selected = getSelectedElements();
    if (selected.length === 0) return null;
    const lives: Element[] = [];
    for (const element of selected) {
      const live = findTimelineElementInIframe(previewIframeRef.current, element, activeCompPath);
      if (!live) {
        showToast(`Unable to copy "${element.label ?? element.id}".`, "info");
        return null;
      }
      lives.push(live);
    }
    return { elements: selected, lives };
  }, [activeCompPath, previewIframeRef, showToast]);

  const readClips = useCallback(
    async (targets: {
      elements: TimelineElement[];
      lives: Element[];
    }): Promise<TimelineClipboardClip[]> => {
      const paths = targets.elements.map((el) => el.sourceFile || activeCompPath || "index.html");
      const markup = await readSavedMarkup(readSaved, paths, targets.lives);
      return targets.elements.map((element, index) => ({
        html: markup[index] as string,
        start: element.start,
        duration: element.duration,
        // authoredTrack, not track: `track` can be a display-lane number
        // remapped by normalizeToZones, and writing THAT into data-track-index
        // re-targets the wrong track in the sparse authored file.
        track: element.authoredTrack ?? element.track,
      }));
    },
    [activeCompPath, readSaved],
  );

  const copyTimelineSelection = useCallback((): Promise<ClipboardPayload> | null => {
    const targets = findSelectedClips();
    if (!targets) return null;
    const sourceFile = targets.elements[0]?.sourceFile || activeCompPath || "index.html";
    return readClips(targets).then((clips) => {
      showToast(clips.length > 1 ? `Copied ${clips.length} clips` : "Copied clip", "info");
      return {
        kind: "timeline-clip",
        clips,
        sourceFile,
        projectId: projectIdRef.current ?? undefined,
        copiedInComposition: activeCompPath || "index.html",
      };
    });
  }, [activeCompPath, findSelectedClips, readClips, showToast]);

  const copyDomSelection = useCallback(
    (domSelection: DomEditSelection): Promise<ClipboardPayload> | null => {
      const live = getSelectedDomElement(previewIframeRef, domSelection, activeCompPath);
      if (!live) {
        showToast("Unable to copy this element.", "info");
        return null;
      }
      const sourceFile = domSelection.sourceFile || activeCompPath || "index.html";
      return readSaved(sourceFile).then((content) => {
        showToast("Copied element", "info");
        return {
          kind: "dom-element",
          html: savedMarkupElseLive(parseSavedSource(content), live, sourceFile),
          sourceFile,
          projectId: projectIdRef.current ?? undefined,
          originSelector: domSelection.selector,
          originSelectorIndex: domSelection.selectorIndex,
        };
      });
    },
    [activeCompPath, previewIframeRef, readSaved, showToast],
  );

  // The key handler needs its answer now, so the targets are found here and only the file read
  // is pending. Returns this copy's own result; a failed copy leaves the clipboard as it was.
  const copyToClipboard = useCallback((): Promise<ClipboardPayload | null> | null => {
    const domSelection = domEditSelectionRef.current;
    let pending: Promise<ClipboardPayload> | null;
    if (usePlayerStore.getState().selectedElementId) pending = copyTimelineSelection();
    else if (domSelection) pending = copyDomSelection(domSelection);
    else {
      showToast("Nothing selected to copy.", "info");
      return null;
    }
    if (!pending) return null;
    const own = pending.catch((error: unknown) => {
      showToast(error instanceof Error ? error.message : "Failed to copy", "error");
      return null;
    });
    const previous = clipboardRef.current;
    const settled = own.then((payload) => payload ?? previous);
    clipboardRef.current = settled;
    void settled.then((payload) => {
      if (!payload && clipboardRef.current === settled) clipboardRef.current = null;
    });
    return own;
  }, [copyDomSelection, copyTimelineSelection, domEditSelectionRef, showToast]);

  const handleCopy = useCallback((): boolean => copyToClipboard() !== null, [copyToClipboard]);

  // Two independent paste modes (timeline clip vs DOM element) behind one guarded save.
  // fallow-ignore-next-line complexity
  const handlePaste = useCallback(
    async (options?: InPlace) => {
      const payload = await clipboardRef.current;
      if (!payload) {
        showToast("Nothing to paste.", "info");
        return;
      }
      const pid = projectIdRef.current;
      if (!pid) return;

      const targetPath = activeCompPath || "index.html";
      try {
        let pastedIds: string[] = [];
        const fromThisFile = payload.sourceFile === targetPath && payload.projectId === pid;
        const paste = (originalContent: string) => {
          if (payload.kind !== "timeline-clip")
            return pasteElementHtml(originalContent, payload, fromThisFile);
          const { currentTime, elements } = usePlayerStore.getState();
          const pasted = pasteTimelineClips(
            originalContent,
            payload.clips,
            pasteStart(payload, targetPath, currentTime, options),
            elements,
            fromThisFile,
          );
          pastedIds = pasted.ids;
          // A clip pasted past the current composition end would exist in the
          // file but never appear on the timeline or in playback/export (the
          // root's data-duration is what actually bounds the render).
          return extendRootDurationInSource(pasted.content, pasted.requiredEnd);
        };

        const { label, toast } = pasteWords(payload);

        await saveProjectFilesWithHistory({
          projectId: pid,
          label,
          files: { [targetPath]: paste },
          readFile: (path) => readFileContent(pid, path),
          writeFile: writeProjectFile,
          recordEdit,
        });

        // CapCut: the pasted clip(s) become the selection; the playhead does not
        // move. reloadPreview is a bare refresh-key bump with no selection
        // snapshot of its own; calling setSelection before it is what makes the
        // post-reload store state land on the pasted ids instead of stale ones.
        if (pastedIds.length > 0) {
          usePlayerStore.getState().setSelection(pastedIds.map((id) => elementKey(id, targetPath)));
        }
        reloadPreview();
        showToast(toast, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to paste";
        showToast(message);
      }
    },
    [activeCompPath, recordEdit, reloadPreview, showToast, writeProjectFile],
  );

  // Duplicates the selection right after it, or with `inPlace` at its own time on a track of its own,
  // without touching the clipboard — a pending copy must survive a Cmd+D. Shares
  // pasteTimelineClips with handlePaste; only the anchor and clip source differ (the
  // selection's end or start here, the playhead or the copy's own time there).
  const handleDuplicate = useCallback(
    async (options?: InPlace): Promise<boolean> => {
      const targets = findSelectedClips();
      if (!targets) return false;
      const pid = projectIdRef.current;
      if (!pid) return false;

      const { elements } = targets;
      const pathOf = (el: TimelineElement) => el.sourceFile || activeCompPath || "index.html";
      const targetPath = pathOf(elements[0]!);
      // The copy lands in targetPath's own clock, so anchor and lane check are local to it.
      const anchorTime = toAuthoredStart(
        elements[0]!,
        options?.inPlace
          ? Math.min(...elements.map((el) => el.start))
          : Math.max(...elements.map((el) => el.start + el.duration)),
      );

      try {
        const clips = await readClips(targets);
        let ids: string[] = [];
        const duplicate = (originalContent: string) => {
          const liveElements = usePlayerStore
            .getState()
            .elements.filter((el) => pathOf(el) === targetPath)
            .map((el) => ({ ...el, start: toAuthoredStart(el, el.start) }));
          const pasted = pasteTimelineClips(originalContent, clips, anchorTime, liveElements, true);
          ids = pasted.ids;
          return extendRootDurationInSource(pasted.content, pasted.requiredEnd);
        };

        await saveProjectFilesWithHistory({
          projectId: pid,
          label: clipLabel("Duplicate", clips.length),
          files: { [targetPath]: duplicate },
          readFile: (path) => readFileContent(pid, path),
          writeFile: writeProjectFile,
          recordEdit,
        });

        // The duplicate becomes the selection, mirroring CapCut's own paste
        // convention — there is no CapCut Duplicate to match directly (Cmd+D is
        // a no-op there); this is our own choice for consistency with paste.
        // Select before reloading, same reason as handlePaste above.
        if (ids.length > 0) {
          usePlayerStore.getState().setSelection(ids.map((id) => elementKey(id, targetPath)));
        }
        reloadPreview();
        showToast(clipToast("Duplicated", clips.length), "info");
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to duplicate";
        showToast(message);
        return false;
      }
    },
    [
      activeCompPath,
      findSelectedClips,
      readClips,
      recordEdit,
      reloadPreview,
      showToast,
      writeProjectFile,
    ],
  );

  const handleCut = useCallback(async (): Promise<boolean> => {
    const selected = getSelectedElements();
    const domSelection = domEditSelectionRef.current;
    const copied = copyToClipboard();
    if (!copied || !(await copied)) return false;

    if (selected.length > 0) {
      // One call for the whole selection, not one per element: the batched
      // delete writes and records history once, so a multi-clip Cmd+X undoes
      // in a single Cmd+Z instead of needing one per clip.
      await handleTimelineElementsDelete(selected);
      return true;
    }

    if (domSelection) {
      await handleDomEditElementDelete(domSelection);
      return true;
    }
    return true;
  }, [
    copyToClipboard,
    domEditSelectionRef,
    handleTimelineElementsDelete,
    handleDomEditElementDelete,
  ]);

  const canPaste = useCallback(() => clipboardRef.current !== null, []);

  return { handleCopy, handlePaste, handleCut, handleDuplicate, canPaste };
}
