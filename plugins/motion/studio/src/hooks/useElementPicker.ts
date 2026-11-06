import { useState, useCallback, useRef } from "react";
import { useMountEffect } from "./useMountEffect";
import {
  resolveSourceFile,
  applyPatch,
  applyPatchByTarget,
  findTagByTarget,
  type PatchOperation,
} from "../utils/sourcePatcher";
import {
  acceptStudioRuntimeMessage,
  postRuntimeControlMessage,
} from "../player/lib/runtimeProtocol";
import { compositionPathOfPreviewUrl } from "../player/components/CompositionThumbnail";
import { getSourceFileForElement } from "../components/editor/domEditingDom";

export interface PickedElement {
  id: string | null;
  tagName: string;
  selector: string;
  label: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  textContent: string | null;
  src: string | null;
  dataAttributes: Record<string, string>;
  computedStyles: Record<string, string>;
}

interface UseElementPickerReturn {
  isPickMode: boolean;
  pickedElement: PickedElement | null;
  enablePick: () => void;
  disablePick: () => void;
  clearPick: () => void;
  /** Update a CSS property on the picked element live + persist to source */
  setStyle: (prop: string, value: string) => void;
  /** Update a data attribute on the picked element + persist to source */
  setDataAttr: (attr: string, value: string) => void;
  /** Update the text content of the picked element + persist to source */
  setTextContent: (text: string) => void;
  /** Override the active iframe (for zoomed canvas view). Pass null to restore primary. */
  setActiveIframe: (el: HTMLIFrameElement | null) => void;
  /** Ref that always points to the active iframe (focused canvas frame or preview panel) */
  activeIframeRef: React.RefObject<HTMLIFrameElement | null>;
}

interface PickerOptions {
  /** Workspace files for source patching */
  workspaceFiles?: Record<string, string>;
  /** Callback to sync patched files to the project */
  onSyncFiles?: (files: Record<string, string>) => void;
}

/**
 * Hook for element picking via the HyperFrame runtime's picker API.
 * Communicates with the iframe via postMessage.
 */
export function useElementPicker(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  options?: PickerOptions,
): UseElementPickerReturn {
  const [isPickMode, setIsPickMode] = useState(false);
  const [pickedElement, setPickedElement] = useState<PickedElement | null>(null);

  // Secondary/override iframe ref — set when a zoomed frame is active.
  // When set, all postMessage sends and DOM reads go to this ref instead.
  const activeOverrideRef = useRef<HTMLIFrameElement | null>(null);

  const getActiveIframe = useCallback((): HTMLIFrameElement | null => {
    return activeOverrideRef.current ?? iframeRef.current;
  }, [iframeRef]);

  // Exposed so the host page can wire the focused view's iframe into the picker
  const setActiveIframe = useCallback((el: HTMLIFrameElement | null) => {
    activeOverrideRef.current = el;
  }, []);

  const enablePick = useCallback(() => {
    try {
      postRuntimeControlMessage(getActiveIframe()?.contentWindow, "enable-pick-mode");
      setIsPickMode(true);
    } catch {
      /* cross-origin */
    }
  }, [getActiveIframe]);

  const disablePick = useCallback(() => {
    try {
      postRuntimeControlMessage(getActiveIframe()?.contentWindow, "disable-pick-mode");
    } catch {
      /* cross-origin */
    }
    setIsPickMode(false);
  }, [getActiveIframe]);

  const clearPick = useCallback(() => {
    setPickedElement(null);
  }, []);

  const windowsThatWerePrimary = useRef(new WeakSet<MessageEventSource>());

  // Listen for picker messages from the iframe
  useMountEffect(() => {
    // One guard per message field, then one branch per message type.
    // fallow-ignore-next-line complexity
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data?.source !== "hf-preview") return;
      if (!acceptStudioRuntimeMessage(data)) return;
      // The primary frame, the active override, or a primary frame a reload just swapped out.
      const activeIframe = getActiveIframe();
      if (!activeIframe) return;
      if (!e.source) return;
      if (e.source === iframeRef.current?.contentWindow)
        windowsThatWerePrimary.current.add(e.source);
      else if (
        e.source !== activeIframe.contentWindow &&
        !windowsThatWerePrimary.current.has(e.source)
      )
        return;

      if (data.type === "element-picked" && data.elementInfo) {
        setPickedElement(toPickedElement(data.elementInfo, activeIframe));
        setIsPickMode(false);
      } else if (data.type === "element-pick-candidates") {
        // Multiple candidates at click point — pick the first one
        const el = data.candidates?.[data.selectedIndex ?? 0];
        if (el) setPickedElement(toPickedElement(el, activeIframe));
      }

      if (data.type === "pick-mode-cancelled") {
        setIsPickMode(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  // Ref for options to avoid stale closures in debounced callback
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const pendingWritesRef = useRef(new Map<string, PendingWrite>());
  settlePendingWrites(pendingWritesRef.current, options?.workspaceFiles);

  // Sync immediately (not debounced) — save on every change for reliability
  const syncToSource = useCallback(
    (picked: PickedElement, live: HTMLElement, iframe: HTMLIFrameElement, op: PatchOperation) => {
      const opts = optionsRef.current;
      if (!opts?.workspaceFiles || !opts.onSyncFiles) return;
      // No id: the preview's hf-id names the element, in the file it was served from.
      const hfId = live.getAttribute("data-hf-id");
      const pending = pendingWritesRef.current;
      const files = withPendingWrites(opts.workspaceFiles, pending);
      const patch = picked.id
        ? patchById(files, picked.id, picked.selector, op)
        : hfId
          ? patchByHfId(files, hfId, ownSourceFile(live, iframe), op)
          : null;
      if (!patch || patch.after === patch.before) return;
      recordPendingWrite(pending, patch.path, opts.workspaceFiles[patch.path], patch.after);
      opts.onSyncFiles({ [patch.path]: patch.after });
    },
    [],
  );

  const setStyle = useCallback(
    (prop: string, value: string) => {
      const activeIframe = getActiveIframe();
      if (!pickedElement?.selector || !activeIframe) return;
      try {
        const doc = activeIframe.contentDocument;
        const el = doc?.querySelector(pickedElement.selector) as HTMLElement | null;
        if (el) {
          el.style.setProperty(prop, value);
          setPickedElement((prev) =>
            prev
              ? {
                  ...prev,
                  computedStyles: { ...prev.computedStyles, [prop]: value },
                }
              : null,
          );
          syncToSource(pickedElement, el, activeIframe, {
            type: "inline-style",
            property: prop,
            value,
          });
        }
      } catch {
        /* cross-origin */
      }
    },
    [pickedElement, getActiveIframe, syncToSource],
  );

  const setDataAttr = useCallback(
    (attr: string, value: string) => {
      const activeIframe = getActiveIframe();
      if (!pickedElement?.selector || !activeIframe) return;
      try {
        const doc = activeIframe.contentDocument;
        const el = doc?.querySelector(pickedElement.selector);
        if (el) {
          el.setAttribute(`data-${attr}`, value);
          setPickedElement((prev) =>
            prev
              ? {
                  ...prev,
                  dataAttributes: { ...prev.dataAttributes, [attr]: value },
                }
              : null,
          );
          syncToSource(pickedElement, el as HTMLElement, activeIframe, {
            type: "attribute",
            property: attr,
            value,
          });
        }
      } catch {
        /* cross-origin */
      }
    },
    [pickedElement, getActiveIframe, syncToSource],
  );

  const setTextContent = useCallback(
    (text: string) => {
      const activeIframe = getActiveIframe();
      if (!pickedElement?.selector || !activeIframe) return;
      try {
        const doc = activeIframe.contentDocument;
        const el = doc?.querySelector(pickedElement.selector);
        if (el) {
          el.textContent = text;
          setPickedElement((prev) => (prev ? { ...prev, textContent: text } : null));
          syncToSource(pickedElement, el as HTMLElement, activeIframe, {
            type: "text-content",
            property: "textContent",
            value: text,
          });
        }
      } catch {
        /* cross-origin */
      }
    },
    [pickedElement, getActiveIframe, syncToSource],
  );

  // Ref-like object that always points to the active iframe (override or primary)
  const activeIframeRef = useRef<HTMLIFrameElement | null>(null);
  activeIframeRef.current = getActiveIframe();

  return {
    isPickMode,
    pickedElement,
    enablePick,
    disablePick,
    clearPick,
    setStyle,
    setDataAttr,
    setTextContent,
    setActiveIframe,
    /** Ref that always points to the active iframe (focused canvas frame or preview panel) */
    activeIframeRef,
  };
}

type PickedElementInfo = Partial<Omit<PickedElement, "computedStyles">>;

// workspaceFiles lags this hook's own writes until the host rerenders.
interface PendingWrite {
  hostSource: string | undefined;
  writes: string[];
}

function settlePendingWrites(
  pending: Map<string, PendingWrite>,
  files: Record<string, string> | undefined,
): void {
  for (const [path, write] of pending) {
    const hostSource = files?.[path];
    if (hostSource === write.hostSource) continue;
    const caughtUpTo = hostSource === undefined ? -1 : write.writes.indexOf(hostSource);
    if (caughtUpTo < 0 || caughtUpTo === write.writes.length - 1) {
      pending.delete(path);
    } else {
      write.hostSource = hostSource;
      write.writes = write.writes.slice(caughtUpTo + 1);
    }
  }
}

function withPendingWrites(
  files: Record<string, string>,
  pending: Map<string, PendingWrite>,
): Record<string, string> {
  const merged = { ...files };
  for (const [path, write] of pending) merged[path] = write.writes.at(-1) ?? merged[path];
  return merged;
}

function recordPendingWrite(
  pending: Map<string, PendingWrite>,
  path: string,
  hostSource: string | undefined,
  after: string,
): void {
  const write = pending.get(path) ?? { hostSource, writes: [] };
  write.writes.push(after);
  pending.set(path, write);
}

// A default per field of the runtime's element info.
// fallow-ignore-next-line complexity
function toPickedElement(el: PickedElementInfo, iframe: HTMLIFrameElement): PickedElement {
  return {
    id: el.id ?? null,
    tagName: el.tagName ?? "div",
    selector: el.selector ?? "",
    label: el.label ?? el.tagName ?? "Element",
    boundingBox: el.boundingBox ?? { x: 0, y: 0, width: 0, height: 0 },
    textContent: el.textContent ?? null,
    src: el.src ?? null,
    dataAttributes: el.dataAttributes ?? {},
    computedStyles: readComputedStyles(iframe, el.selector ?? ""),
  };
}

interface SourcePatch {
  path: string;
  before: string;
  after: string;
}

function patchById(
  files: Record<string, string>,
  id: string,
  selector: string,
  op: PatchOperation,
): SourcePatch | null {
  const path = resolveSourceFile(id, selector, files);
  const before = path ? files[path] : undefined;
  return path && before ? { path, before, after: applyPatch(before, id, op) } : null;
}

function ownSourceFile(live: HTMLElement, iframe: HTMLIFrameElement): string {
  const previewed = compositionPathOfPreviewUrl(iframe.getAttribute("src") ?? "");
  return getSourceFileForElement(live, previewed).sourceFile;
}

function patchByHfId(
  files: Record<string, string>,
  hfId: string,
  ownFile: string,
  op: PatchOperation,
): SourcePatch | null {
  const matches = Object.keys(files).filter((file) => findTagByTarget(files[file] ?? "", { hfId }));
  const path = matches.includes(ownFile) ? ownFile : matches.length === 1 ? matches[0] : undefined;
  const before = path ? files[path] : undefined;
  return path && before ? { path, before, after: applyPatchByTarget(before, { hfId }, op) } : null;
}

/** Read a subset of computed styles from an element in the iframe */
function readComputedStyles(iframe: HTMLIFrameElement, selector: string): Record<string, string> {
  const styles: Record<string, string> = {};
  try {
    const doc = iframe.contentDocument;
    const el = doc?.querySelector(selector);
    if (!el) return styles;
    const computed = iframe.contentWindow?.getComputedStyle(el);
    if (!computed) return styles;

    const props = [
      "position",
      "top",
      "left",
      "right",
      "bottom",
      "width",
      "height",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "font-size",
      "font-weight",
      "font-family",
      "color",
      "background-color",
      "background",
      "opacity",
      "border-radius",
      "transform",
      "z-index",
    ];

    for (const prop of props) {
      const val = computed.getPropertyValue(prop);
      if (val) styles[prop] = val;
    }
  } catch {
    /* cross-origin */
  }
  return styles;
}
