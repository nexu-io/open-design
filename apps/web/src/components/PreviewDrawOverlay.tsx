import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type PointerEvent, type ReactNode, type WheelEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';

import { Icon } from './Icon';
import { RemixIcon } from './RemixIcon';
import { useT } from '../i18n';
import type { PreviewVisualMarkKind } from '../types';
import { requestPreviewSnapshot } from '../runtime/exports';
import { isImeComposing } from '../utils/imeComposing';

interface Point { x: number; y: number }
interface Stroke { points: Point[] }
interface NormalizedRect { x: number; y: number; width: number; height: number }
// A free-floating text label the user drops onto the preview. `x`/`y` are the
// top-left position normalized to the frame (0..1) so it tracks the artifact as
// the device frame scales; `text` is the raw multi-line string.
interface TextMark { id: number; x: number; y: number; text: string }
interface Rect { x: number; y: number; width: number; height: number }
type MarkTool = 'box' | 'pen' | 'text';
type DrawDockLayout = 'floating' | 'docked';
type DrawDockSide = 'right' | 'left' | 'bottom' | 'top';
interface CaptureTarget {
  filePath?: string;
  elementId?: string;
  selector?: string;
  label?: string;
  text?: string;
  position: { x: number; y: number; width: number; height: number };
  htmlHint?: string;
}
interface PreviewSnapshot {
  dataUrl: string;
  w: number;
  h: number;
}
type CaptureFrameRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

export const ANNOTATION_EVENT = 'opendesign:annotation';
export type AnnotationAction = 'draft' | 'queue' | 'send';
export type DrawToolbarElement =
  | 'rect'
  | 'pen'
  | 'text'
  | 'undo'
  | 'redo'
  | 'attach_image'
  | 'annotation_submit'
  | 'exit';

export interface AnnotationEventDetail {
  file: File | null;
  note: string;
  action: AnnotationAction;
  filePath?: string;
  markKind?: PreviewVisualMarkKind;
  bounds?: { x: number; y: number; width: number; height: number };
  target?: CaptureTarget | null;
  /** Images the user attached in the markup composer to combine with the mark. */
  extraFiles?: File[];
  ack?: (result: { ok: boolean; message?: string }) => void;
}

interface Props {
  children: ReactNode;
  active?: boolean;
  captureViewport?: boolean;
  onActiveChange?: (active: boolean) => void;
  captureTarget?: CaptureTarget | null;
  captureSnapshot?: () => Promise<PreviewSnapshot | null>;
  captureFrameRect?: () => CaptureFrameRect | null;
  filePath?: string;
  hideChrome?: boolean;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
  onToolbarClick?: (element: DrawToolbarElement, submitAction?: AnnotationAction) => void;
  toolbarHost?: HTMLElement | null;
}

const STROKE_COLOR = '#ff3b30';
const STROKE_WIDTH = 4;
const TARGET_COLOR = '#1677ff';
// Text-annotation glyph height as a fraction of the frame height, so a dropped
// label reads at a consistent size across desktop/tablet/phone frames and its
// on-screen size matches what gets baked into the exported screenshot.
const TEXT_FONT_FRACTION = 0.03;
const TEXT_LINE_HEIGHT = 1.25;
const TEXT_MIN_FONT_PX = 12;
const TEXT_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
const DRAW_DOCK_GAP = 12;
const DRAW_DOCK_MARGIN = 16;
const DRAW_DOCK_MIN_WIDTH = 320;
const DRAW_DOCK_MIN_HEIGHT = 120;

// Render `node` into `host` via a portal when one is provided, otherwise inline.
function maybePortal(node: ReactNode, host: HTMLElement | null) {
  return host ? createPortal(node, host) : node;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function dockPlacementEquals(
  a: { layout: DrawDockLayout; side: DrawDockSide | null; style: CSSProperties },
  b: { layout: DrawDockLayout; side: DrawDockSide | null; style: CSSProperties },
) {
  return (
    a.layout === b.layout &&
    a.side === b.side &&
    a.style.left === b.style.left &&
    a.style.top === b.style.top &&
    a.style.bottom === b.style.bottom &&
    a.style.transform === b.style.transform &&
    a.style.maxWidth === b.style.maxWidth
  );
}

export function PreviewDrawOverlay({
  children,
  active = false,
  captureViewport = false,
  onActiveChange,
  captureTarget = null,
  captureSnapshot,
  captureFrameRect,
  filePath,
  hideChrome = false,
  sendDisabled = false,
  sendDisabledReason,
  onToolbarClick,
  toolbarHost,
}: Props) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [note, setNote] = useState('');
  const [markTool, setMarkTool] = useState<MarkTool>('box');
  const [markToolMenuOpen, setMarkToolMenuOpen] = useState(false);
  const markToolMenuRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const undoneStrokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  // Box-select accumulates: each drag commits another region, so the user can
  // mark several areas in one pass instead of one box replacing the last.
  const selectionBoxesRef = useRef<NormalizedRect[]>([]);
  const boxDraftRef = useRef<{ start: Point; current: Point } | null>(null);
  const composingRef = useRef(false);
  // Text tool: each drop is a transparent label — bare glyphs and a blinking
  // caret, nothing else. State drives the DOM textareas; the ref mirror lets the
  // async capture pipeline read the latest labels synchronously. `textIdRef`
  // hands out stable, monotonic ids (no Date.now/random needed). A label is
  // "editing" (typeable, focused) only while its id is `editingTextId`;
  // otherwise it's a placed label you drag to move or double-click to re-edit.
  const [textMarks, setTextMarks] = useState<TextMark[]>([]);
  const textMarksRef = useRef<TextMark[]>([]);
  const textIdRef = useRef(0);
  const [editingTextId, setEditingTextId] = useState<number | null>(null);
  const textAreaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const textWrapRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Drag-to-move state for a placed label, plus last-tap tracking so a
  // double-tap (mouse or touch) re-opens it for editing.
  const textDragRef = useRef<{
    id: number;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    curX: number;
    curY: number;
    moved: boolean;
  } | null>(null);
  const lastTextTapRef = useRef<{ id: number; time: number } | null>(null);
  // Untransformed layout size of the frame, tracked so the text glyph size can
  // scale with the frame the same way the exported screenshot does.
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hasInk, setHasInk] = useState(false);
  const [hasBox, setHasBox] = useState(false);
  const [hasText, setHasText] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [pendingAction, setPendingAction] = useState<AnnotationAction | null>(null);
  // The submit control is one split button: the main half runs the selected
  // action (default 'send', so nothing changes for existing users) and the
  // chevron opens a menu to switch to Add-to-input / Queue / Send.
  const [submitAction, setSubmitAction] = useState<AnnotationAction>('send');
  const [submitMenuOpen, setSubmitMenuOpen] = useState(false);
  const submitMenuRef = useRef<HTMLDivElement | null>(null);
  // True only for the brief window while a host compositor capture is in
  // flight: hides this overlay's strokes/toolbar so they don't appear in the
  // screenshot (they're re-painted onto the result by compositeWithBackground).
  const [capturing, setCapturing] = useState(false);
  // Images the user attaches (picker/paste/drop) to combine with the mark.
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Object-URL thumbnails for the attached (not-yet-uploaded) images, so the
  // markup composer can preview/open/remove them just like the main chat
  // composer's staged attachments. Revoked whenever the file set changes.
  const [imagePreviews, setImagePreviews] = useState<{ file: File; url: string }[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [captureWarning, setCaptureWarning] = useState<{
    action: AnnotationAction;
    message: string;
  } | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [dockPlacement, setDockPlacement] = useState<{
    layout: DrawDockLayout;
    side: DrawDockSide | null;
    style: CSSProperties;
  }>({
    layout: 'docked',
    side: null,
    style: previewDrawDockDockedStyle,
  });
  const sending = pendingAction !== null;

  const bumpLayoutRevision = useCallback(() => {
    setLayoutRevision((value) => value + 1);
  }, []);

  const redraw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    if (typeof window.CanvasRenderingContext2D === 'undefined') return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.strokeStyle = STROKE_COLOR;
    const dpr = window.devicePixelRatio || 1;
    ctx.lineWidth = STROKE_WIDTH * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const box of selectionBoxesRef.current) drawNormalizedBox(ctx, box, cvs.width, cvs.height);
    const draft = boxDraftRef.current
      ? normalizedRectFromPoints(boxDraftRef.current.start, boxDraftRef.current.current)
      : null;
    if (draft) drawNormalizedBox(ctx, draft, cvs.width, cvs.height);
    for (const s of all) {
      const first = s.points[0];
      if (!first) continue;
      ctx.beginPath();
      ctx.moveTo(first.x * cvs.width, first.y * cvs.height);
      for (let i = 1; i < s.points.length; i++) {
        const p = s.points[i]!;
        ctx.lineTo(p.x * cvs.width, p.y * cvs.height);
      }
      ctx.stroke();
    }
  }, []);

  // rAF-coalesce redraws driven by the pointermove hot path so a high-Hz
  // pointer (or trackpad) repaints the canvas at most once per frame instead of
  // once per raw event. One-shot redraws (pointerup, undo, clear) stay sync.
  const redrawFrameRef = useRef<number | null>(null);
  const scheduleRedraw = useCallback(() => {
    if (redrawFrameRef.current !== null) return;
    redrawFrameRef.current = requestAnimationFrame(() => {
      redrawFrameRef.current = null;
      redraw();
    });
  }, [redraw]);
  useEffect(
    () => () => {
      if (redrawFrameRef.current !== null) cancelAnimationFrame(redrawFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs) return;
    const resize = () => {
      // Size the canvas from the frame's *layout* box (offsetWidth/Height), not
      // getBoundingClientRect(). In a scaled tablet/phone device frame this wrap
      // lives inside a `transform: scale()` shell, so getBoundingClientRect()
      // returns the already-scaled width; feeding that back into the canvas'
      // CSS width scales it a second time and it covers only the left slice of
      // the frame — the right half became un-drawable. offsetWidth is the
      // untransformed size, so the canvas fills the whole frame at any scale.
      const width = wrap.offsetWidth;
      const height = wrap.offsetHeight;
      const dpr = window.devicePixelRatio || 1;
      cvs.width = Math.max(1, Math.floor(width * dpr));
      cvs.height = Math.max(1, Math.floor(height * dpr));
      cvs.style.width = `${width}px`;
      cvs.style.height = `${height}px`;
      setFrameSize((cur) => (cur.w === width && cur.h === height ? cur : { w: width, h: height }));
      redraw();
    };
    resize();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw, active, hasInk, hasBox, hasText]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onActiveChange?.(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoStroke();
        else undoStroke();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onActiveChange, sending]);

  function syncHistoryState() {
    setHasInk(strokesRef.current.length > 0);
    setHasBox(selectionBoxesRef.current.length > 0);
    setHasText(textMarksRef.current.some((mark) => mark.text.trim().length > 0));
    setUndoCount(strokesRef.current.length);
    setRedoCount(undoneStrokesRef.current.length);
  }

  // Text marks live in React state (they render DOM textareas) with a ref mirror
  // for the async capture read. Route every mutation through here so the two
  // never drift, then refresh the derived history flags.
  function commitTextMarks(next: TextMark[]) {
    textMarksRef.current = next;
    setTextMarks(next);
    setHasText(next.some((mark) => mark.text.trim().length > 0));
  }

  function pointFromEvent(e: PointerEvent): Point {
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  function activePreviewIframe(): HTMLIFrameElement | null {
    return (
      wrapRef.current?.querySelector<HTMLIFrameElement>('iframe[data-od-active="true"]') ??
      wrapRef.current?.querySelector<HTMLIFrameElement>('iframe')
    ) ?? null;
  }

  // The snapshot bridge only lives in the srcDoc transport iframe. For URL-load
  // previews (e.g. decks) that iframe is mounted but hidden (data-od-active is on
  // the bridgeless URL iframe), so snapshotting the *active* frame times out and
  // capture fails. Prefer the srcDoc-render-mode frame; capture mode keeps it on
  // full content, so it carries the bridge.
  function snapshotHostIframe(): HTMLIFrameElement | null {
    return (
      wrapRef.current?.querySelector<HTMLIFrameElement>('iframe[data-od-render-mode="srcdoc"]') ??
      activePreviewIframe()
    );
  }

  function canTryDirectFrameScroll(iframe: HTMLIFrameElement): boolean {
    const sandbox = iframe.getAttribute('sandbox');
    return sandbox === null || /\ballow-same-origin\b/.test(sandbox);
  }

  function postFrameScrollBy(win: Window, left: number, top: number): boolean {
    try {
      win.postMessage({ type: 'od:preview-scroll-by', left, top }, '*');
      return true;
    } catch {
      return false;
    }
  }

  function scrollPreviewIframeBy(iframe: HTMLIFrameElement, left: number, top: number): boolean {
    const win = iframe.contentWindow;
    if (!win) return false;

    if (canTryDirectFrameScroll(iframe)) {
      try {
        const scrollBy = win.scrollBy;
        if (typeof scrollBy === 'function') {
          win.scrollBy({ left, top, behavior: 'auto' });
          return true;
        }
      } catch {
        // Sandboxed / cross-origin frames throw on Window property reads.
        // Fall through to the postMessage bridge injected into srcDoc previews.
      }
    }

    return postFrameScrollBy(win, left, top);
  }

  function onPointerDown(e: PointerEvent) {
    if (!active) return;
    e.preventDefault();
    if (sending) return;
    if (markTool === 'text') {
      // A press on empty canvas drops a fresh label there and opens it for
      // typing. Presses that land on an existing label are handled by that
      // label's wrapper (it sits above the canvas), so this only adds new ones.
      const point = pointFromEvent(e);
      const id = (textIdRef.current += 1);
      commitTextMarks([...textMarksRef.current, { id, x: point.x, y: point.y, text: '' }]);
      setEditingTextId(id);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const point = pointFromEvent(e);
    if (markTool === 'box') {
      // Start a fresh draft on top of any already-committed boxes.
      boxDraftRef.current = { start: point, current: point };
      syncHistoryState();
      redraw();
      return;
    }
    drawingRef.current = { points: [point] };
    redraw();
  }
  function onPointerMove(e: PointerEvent) {
    if (!active) return;
    e.preventDefault();
    if (sending) return;
    if (boxDraftRef.current) {
      boxDraftRef.current.current = pointFromEvent(e);
      scheduleRedraw();
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current.points.push(pointFromEvent(e));
    scheduleRedraw();
  }
  function onPointerUp(e: PointerEvent) {
    if (!active) return;
    e.preventDefault();
    if (sending) return;
    // A final synchronous redraw follows; drop any pending move-frame.
    if (redrawFrameRef.current !== null) {
      cancelAnimationFrame(redrawFrameRef.current);
      redrawFrameRef.current = null;
    }
    if (boxDraftRef.current) {
      boxDraftRef.current.current = pointFromEvent(e);
      const next = normalizedRectFromPoints(boxDraftRef.current.start, boxDraftRef.current.current);
      boxDraftRef.current = null;
      // Commit the drawn region; ignore accidental micro-drags (click without move).
      if (next.width >= 0.006 && next.height >= 0.006) {
        selectionBoxesRef.current = [...selectionBoxesRef.current, next];
        bumpLayoutRevision();
      }
      syncHistoryState();
      redraw();
      return;
    }
    if (!drawingRef.current) return;
    if (drawingRef.current.points.length > 1) {
      strokesRef.current.push(drawingRef.current);
      undoneStrokesRef.current = [];
      bumpLayoutRevision();
      syncHistoryState();
    }
    drawingRef.current = null;
    redraw();
  }

  function onCanvasWheel(e: WheelEvent<HTMLCanvasElement>) {
    if (!active || sending) return;
    const iframe = activePreviewIframe();
    if (!iframe) return;
    if (scrollPreviewIframeBy(iframe, e.deltaX, e.deltaY)) {
      e.preventDefault();
    }
  }

  function clearInk() {
    strokesRef.current = [];
    undoneStrokesRef.current = [];
    drawingRef.current = null;
    selectionBoxesRef.current = [];
    boxDraftRef.current = null;
    resetTextEditingState();
    commitTextMarks([]);
    syncHistoryState();
    redraw();
    bumpLayoutRevision();
  }

  function resetTextEditingState() {
    textAreaRefs.current.clear();
    textWrapRefs.current.clear();
    textDragRef.current = null;
    lastTextTapRef.current = null;
    setEditingTextId(null);
  }

  // Grow a label textarea to exactly fit its text in both axes. `wrap="off"`
  // keeps lines from soft-wrapping, so scrollWidth/scrollHeight report the real
  // content box; resetting to 0 first lets it shrink back when text is deleted.
  const autosizeTextArea = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.width = '0px';
    el.style.height = '0px';
    el.style.width = `${el.scrollWidth + 2}px`;
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  function updateTextMark(id: number, text: string) {
    commitTextMarks(textMarksRef.current.map((mark) => (mark.id === id ? { ...mark, text } : mark)));
  }

  function removeTextMark(id: number) {
    textAreaRefs.current.delete(id);
    commitTextMarks(textMarksRef.current.filter((mark) => mark.id !== id));
  }

  // Leaving edit mode drops a label that was never typed into, so it doesn't
  // linger as an invisible target.
  function handleTextBlur(id: number) {
    setEditingTextId((cur) => (cur === id ? null : cur));
    const mark = textMarksRef.current.find((item) => item.id === id);
    if (mark && mark.text.trim() === '') removeTextMark(id);
  }

  // Focus the label being edited (caret at end) once it has rendered.
  useEffect(() => {
    if (editingTextId === null) return;
    const el = textAreaRefs.current.get(editingTextId);
    if (el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  }, [editingTextId, textMarks]);

  // Begin dragging a placed label; pointer capture keeps move events flowing
  // even when the pointer leaves the small label box.
  function onTextPointerDown(e: PointerEvent, mark: TextMark) {
    if (editingTextId === mark.id) return; // editing: let the textarea handle it
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    textDragRef.current = {
      id: mark.id,
      pointerId: e.pointerId,
      startX: (e.clientX - rect.left) / rect.width,
      startY: (e.clientY - rect.top) / rect.height,
      originX: mark.x,
      originY: mark.y,
      curX: mark.x,
      curY: mark.y,
      moved: false,
    };
  }

  // Move the label live by writing its wrapper style directly (no per-frame
  // React re-render); the final position is committed to state on pointer up.
  function onTextPointerMove(e: PointerEvent, mark: TextMark) {
    const drag = textDragRef.current;
    if (!drag || drag.id !== mark.id) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const nx = clamp01(drag.originX + ((e.clientX - rect.left) / rect.width - drag.startX));
    const ny = clamp01(drag.originY + ((e.clientY - rect.top) / rect.height - drag.startY));
    drag.curX = nx;
    drag.curY = ny;
    if (Math.abs(nx - drag.originX) > 0.002 || Math.abs(ny - drag.originY) > 0.002) drag.moved = true;
    const el = e.currentTarget as HTMLElement;
    el.style.left = `${nx * 100}%`;
    el.style.top = `${ny * 100}%`;
  }

  function onTextPointerUp(e: PointerEvent, mark: TextMark) {
    const drag = textDragRef.current;
    if (!drag || drag.id !== mark.id) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    textDragRef.current = null;
    if (drag.moved) {
      commitTextMarks(
        textMarksRef.current.map((item) => (item.id === mark.id ? { ...item, x: drag.curX, y: drag.curY } : item)),
      );
      lastTextTapRef.current = null;
      return;
    }
    // A tap that didn't move: a second tap on the same label within the window
    // re-opens it for editing (works for both mouse double-click and touch).
    const prev = lastTextTapRef.current;
    if (prev && prev.id === mark.id && e.timeStamp - prev.time < 320) {
      lastTextTapRef.current = null;
      setEditingTextId(mark.id);
    } else {
      lastTextTapRef.current = { id: mark.id, time: e.timeStamp };
    }
  }

  // The glyph size is a fraction of the frame height, so a frame resize (e.g.
  // switching device presets) must re-fit every label to the new font size.
  useEffect(() => {
    textAreaRefs.current.forEach((el) => autosizeTextArea(el));
  }, [frameSize, textMarks, autosizeTextArea]);

  function addExtraFiles(files: FileList | File[] | null) {
    if (!files) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    setExtraFiles((cur) => [...cur, ...imgs]);
  }
  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    addExtraFiles(e.target.files);
    e.target.value = '';
  }
  function onNotePaste(e: ClipboardEvent<HTMLInputElement>) {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    e.preventDefault();
    addExtraFiles(imgs);
  }
  function removeExtraFile(index: number) {
    setExtraFiles((cur) => cur.filter((_, i) => i !== index));
    setPreviewIndex(null);
  }

  function selectMarkTool(nextTool: MarkTool) {
    onToolbarClick?.(nextTool === 'box' ? 'rect' : nextTool === 'text' ? 'text' : 'pen');
    setMarkTool(nextTool);
    setMarkToolMenuOpen(false);
  }

  // Keep object-URL thumbnails in sync with the attached files; revoke on
  // change/unmount so we never leak blob URLs.
  useEffect(() => {
    const next = extraFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImagePreviews(next);
    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [extraFiles]);

  // Escape closes the image preview first (capture phase so it runs before the
  // overlay's own Escape-to-close handler).
  useEffect(() => {
    if (previewIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPreviewIndex(null);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [previewIndex]);

  // Dismiss the submit menu on outside pointer / Escape. Capture phase + stop
  // lets Escape close the menu first without also closing the whole overlay.
  useEffect(() => {
    if (!submitMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (submitMenuRef.current && !submitMenuRef.current.contains(e.target as Node)) {
        setSubmitMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSubmitMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [submitMenuOpen]);

  useEffect(() => {
    if (!markToolMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (markToolMenuRef.current && !markToolMenuRef.current.contains(e.target as Node)) {
        setMarkToolMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMarkToolMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [markToolMenuOpen]);

  function undoStroke() {
    if (sending) return;
    // Discard an in-progress draft first, then pop committed boxes one at a
    // time (most recent first) before falling back to freehand strokes.
    if (boxDraftRef.current) {
      boxDraftRef.current = null;
      syncHistoryState();
      redraw();
      bumpLayoutRevision();
      onToolbarClick?.('undo');
      return;
    }
    if (selectionBoxesRef.current.length > 0) {
      selectionBoxesRef.current = selectionBoxesRef.current.slice(0, -1);
      syncHistoryState();
      redraw();
      bumpLayoutRevision();
      onToolbarClick?.('undo');
      return;
    }
    const stroke = strokesRef.current.pop();
    if (!stroke) return;
    onToolbarClick?.('undo');
    undoneStrokesRef.current.push(stroke);
    drawingRef.current = null;
    syncHistoryState();
    redraw();
    bumpLayoutRevision();
  }

  function redoStroke() {
    if (sending) return;
    const stroke = undoneStrokesRef.current.pop();
    if (!stroke) return;
    onToolbarClick?.('redo');
    strokesRef.current.push(stroke);
    drawingRef.current = null;
    syncHistoryState();
    redraw();
    bumpLayoutRevision();
  }

  function closeOverlay() {
    onActiveChange?.(false);
  }

  useEffect(() => {
    if (active) return;
    strokesRef.current = [];
    undoneStrokesRef.current = [];
    drawingRef.current = null;
    selectionBoxesRef.current = [];
    boxDraftRef.current = null;
    resetTextEditingState();
    commitTextMarks([]);
    setExtraFiles([]);
    setPreviewIndex(null);
    syncHistoryState();
    redraw();
    bumpLayoutRevision();
  }, [active, redraw]);

  function normalizedRectToCanvasRect(box: NormalizedRect): Rect | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: box.x * rect.width,
      y: box.y * rect.height,
      width: Math.max(1, box.width * rect.width),
      height: Math.max(1, box.height * rect.height),
    };
  }

  function boxBounds(): Rect | null {
    const boxes = selectionBoxesRef.current.map((box) => normalizedRectToCanvasRect(box)).filter((box): box is Rect => Boolean(box));
    if (boxes.length === 0) return null;
    // Collapse every committed box into one enclosing rect so the annotation
    // bounds still describe a single region for the downstream capture crop.
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  function lastBoxBounds(): Rect | null {
    const last = selectionBoxesRef.current.at(-1);
    return last ? normalizedRectToCanvasRect(last) : null;
  }

  function strokeRect(stroke: Stroke | null | undefined): Rect | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    const points = stroke?.points ?? [];
    if (!rect || rect.width <= 0 || rect.height <= 0 || points.length === 0) return null;
    const xs = points.map((point) => point.x * rect.width);
    const ys = points.map((point) => point.y * rect.height);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const pad = 8;
    return {
      x: Math.max(0, minX - pad),
      y: Math.max(0, minY - pad),
      width: Math.max(1, maxX - minX + pad * 2),
      height: Math.max(1, maxY - minY + pad * 2),
    };
  }

  function textBounds(): { x: number; y: number; width: number; height: number } | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const rects: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const mark of textMarksRef.current) {
      if (mark.text.trim().length === 0) continue;
      const el = textAreaRefs.current.get(mark.id);
      if (el) {
        const box = el.getBoundingClientRect();
        rects.push({
          left: box.left - rect.left,
          top: box.top - rect.top,
          right: box.right - rect.left,
          bottom: box.bottom - rect.top,
        });
      } else {
        // No live element (e.g. capture path measured after unmount): fall back
        // to the drop point so the label still contributes to the crop bounds.
        const left = mark.x * rect.width;
        const top = mark.y * rect.height;
        rects.push({ left, top, right: left + 1, bottom: top + 1 });
      }
    }
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map((item) => item.left));
    const top = Math.min(...rects.map((item) => item.top));
    const right = Math.max(...rects.map((item) => item.right));
    const bottom = Math.max(...rects.map((item) => item.bottom));
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  function strokeBounds(): Rect | null {
    const points = strokesRef.current.flatMap((stroke) => stroke.points);
    return strokeRect(points.length > 0 ? { points } : null);
  }

  function lastStrokeBounds(): Rect | null {
    return strokeRect(strokesRef.current.at(-1));
  }

  function anchorBounds(): Rect | null {
    return lastBoxBounds() ?? lastStrokeBounds() ?? captureTarget?.position ?? null;
  }

  function annotationBounds(): { x: number; y: number; width: number; height: number } | undefined {
    const box = boxBounds();
    const stroke = strokeBounds();
    const text = textBounds();
    const target = captureTarget?.position ?? null;
    const bounds = [box, stroke, text, target].filter((item): item is { x: number; y: number; width: number; height: number } => Boolean(item));
    if (bounds.length === 0) return undefined;
    if (bounds.length === 1) return bounds[0];
    const left = Math.min(...bounds.map((item) => item.x));
    const top = Math.min(...bounds.map((item) => item.y));
    const right = Math.max(...bounds.map((item) => item.x + item.width));
    const bottom = Math.max(...bounds.map((item) => item.y + item.height));
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  function markKind(): PreviewVisualMarkKind | undefined {
    const hasTarget = Boolean(captureTarget);
    const hasVisualMark = hasInk || hasBox || hasText;
    if (hasTarget && hasVisualMark) return 'click+stroke';
    if (hasTarget) return 'click';
    if (hasVisualMark) return 'stroke';
    return undefined;
  }

  function waitForOverlayHidden(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  function snapshotFrameRect(): CaptureFrameRect | null {
    return (
      captureFrameRect?.() ??
      (captureSnapshot
        ? wrapRef.current?.getBoundingClientRect()
        : activePreviewIframe()?.getBoundingClientRect()) ??
      null
    );
  }

  async function requestSnapshot(): Promise<PreviewSnapshot | null> {
    if (captureSnapshot) {
      // The host's captureSnapshot is a compositor screenshot of the on-screen
      // region, which would otherwise include this overlay's own strokes +
      // toolbar. Hide them for the capture; compositeWithBackground re-paints
      // the marks onto the result afterwards.
      flushSync(() => setCapturing(true));
      try {
        await waitForOverlayHidden();
        return await captureSnapshot();
      } finally {
        flushSync(() => setCapturing(false));
      }
    }
    const iframe = snapshotHostIframe();
    if (!iframe) return null;
    // Capture mode may still be swapping the srcDoc frame to full content when
    // the user submits, so retry with growing timeouts before giving up.
    const timeouts = [1500, 3000, 6000];
    for (const timeout of timeouts) {
      const snapshot = await requestPreviewSnapshot(iframe, timeout);
      if (snapshot) return snapshot;
    }
    return null;
  }

  function drawCaptureTarget(
    ctx: CanvasRenderingContext2D,
    scaleX: number,
    scaleY: number,
    target: CaptureTarget | null,
  ) {
    if (!target) return;
    const { x, y, width, height } = target.position;
    if (![x, y, width, height].every(Number.isFinite)) return;
    if (width <= 0 || height <= 0) return;
    const left = x * scaleX;
    const top = y * scaleY;
    const boxWidth = Math.max(1, width * scaleX);
    const boxHeight = Math.max(1, height * scaleY);
    ctx.save();
    ctx.fillStyle = 'rgba(22, 119, 255, 0.12)';
    ctx.strokeStyle = TARGET_COLOR;
    ctx.lineWidth = Math.max(2, Math.round(Math.max(scaleX, scaleY) * 2));
    ctx.setLineDash([Math.max(8, 8 * scaleX), Math.max(4, 4 * scaleX)]);
    ctx.fillRect(left, top, boxWidth, boxHeight);
    ctx.strokeRect(left, top, boxWidth, boxHeight);
    const label = (target.label || target.elementId || '').trim();
    if (label) {
      const fontSize = Math.max(12, Math.round(12 * Math.max(scaleX, scaleY)));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
      const text = label.length > 42 ? `${label.slice(0, 39)}...` : label;
      const metrics = ctx.measureText(text);
      const padX = Math.max(6, Math.round(6 * scaleX));
      const padY = Math.max(4, Math.round(4 * scaleY));
      const labelWidth = metrics.width + padX * 2;
      const labelHeight = fontSize + padY * 2;
      const labelTop = Math.max(0, top - labelHeight - Math.max(4, 4 * scaleY));
      ctx.setLineDash([]);
      ctx.fillStyle = TARGET_COLOR;
      ctx.fillRect(left, labelTop, labelWidth, labelHeight);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, left + padX, labelTop + padY + fontSize * 0.82);
    }
    ctx.restore();
  }

  async function compositeWithBackground(snap: PreviewSnapshot): Promise<Blob | null> {
    const frameRect = snapshotFrameRect();
    if (!frameRect) return null;
    const rect = frameRect;
    const out = document.createElement('canvas');
    out.width = snap.w;
    out.height = snap.h;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    const bg = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = snap.dataUrl;
    });
    if (!bg) return null;
    // Opaque base: even when the captured snapshot is transparent (web fallback
    // rasterizer painted nothing) the composited annotation never flattens to
    // black — it degrades to a white frame with the marks on top.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(bg, 0, 0, snap.w, snap.h);
    const sx = snap.w / Math.max(1, rect.width);
    const sy = snap.h / Math.max(1, rect.height);
    drawCaptureTarget(ctx, sx, sy, captureTarget);
    for (const box of selectionBoxesRef.current) drawNormalizedBox(ctx, box, snap.w, snap.h);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH * Math.max(sx, sy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokesRef.current) {
      const first = s.points[0];
      if (!first) continue;
      ctx.beginPath();
      ctx.moveTo(first.x * snap.w, first.y * snap.h);
      for (let i = 1; i < s.points.length; i++) {
        const p = s.points[i]!;
        ctx.lineTo(p.x * snap.w, p.y * snap.h);
      }
      ctx.stroke();
    }
    drawTextMarks(ctx, textMarksRef.current, snap.w, snap.h);
    return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  }

  async function send(action: AnnotationAction) {
    const hasTarget = Boolean(captureTarget);
    const shouldCapture = hasInk || hasBox || hasText || hasTarget || captureViewport;
    const canSubmit = shouldCapture || Boolean(note.trim()) || extraFiles.length > 0;
    if (sending || !canSubmit) return;
    // While a task is running the primary Send is disabled (use Queue instead).
    // The note/attachment is not lost: Queue still stages it for the next turn.
    if (action === 'send' && sendDisabled) return;
    onToolbarClick?.('annotation_submit', action);
    setCaptureWarning(null);
    setPendingAction(action);
    try {
      let file: File | null = null;
      if (shouldCapture) {
        let blob: Blob | null = null;
        const snap = await requestSnapshot();
        if (snap) blob = await compositeWithBackground(snap);
        if (blob) {
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          file = new File([blob], `drawing-${ts}.png`, { type: 'image/png' });
        } else if (!note.trim() && extraFiles.length === 0) {
          // The snapshot pipeline is best-effort — the srcDoc foreignObject
          // rasterizer legitimately fails on real-world artifacts (issue
          // #4064), and retrying replays the same failure. Only block when
          // the annotation has no meaning without pixels: ink/box-only marks
          // are pure bitmap. A typed note or attached images still carry the
          // user's intent, so those fall through and send without the shot.
          setCaptureWarning({
            action,
            message: captureViewport && !hasInk && !hasBox && !hasTarget
              ? t('chat.annotationPreviewMissing')
              : t('chat.annotationPreviewMissingInk'),
          });
          return;
        }
      }
      const sentWithoutScreenshot = shouldCapture && !file;
      const kind = markKind();
      const result = await new Promise<{ ok: boolean; message?: string }>((resolve) => {
        let settled = false;
        const finish = (next: { ok: boolean; message?: string }) => {
          if (settled) return;
          settled = true;
          resolve(next);
        };
        window.setTimeout(() => {
          finish({ ok: false, message: t('chat.annotationTimeout') });
        }, 60000);
        const detail: AnnotationEventDetail = {
          file,
          note: note.trim(),
          action,
          filePath: captureTarget?.filePath || filePath,
          markKind: kind,
          bounds: kind ? annotationBounds() : undefined,
          target: captureTarget,
          extraFiles: extraFiles.length ? extraFiles : undefined,
          ack: finish,
        };
        window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, { detail }));
      });
      if (!result.ok) {
        setCaptureWarning({
          action,
          message: result.message || t('chat.annotationFailed'),
        });
        return;
      }
      clearInk();
      // Degraded sends keep the user honest about what the agent received:
      // the note went out, the pixels did not.
      setCaptureWarning(
        sentWithoutScreenshot
          ? { action, message: t('chat.annotationSentWithoutScreenshot') }
          : null,
      );
      setNote('');
      setExtraFiles([]);
      setPreviewIndex(null);
    } finally {
      setPendingAction(null);
    }
  }

  // In a scaled, clipped device frame (tablet/mobile viewports) the draw toolbar would
  // be cut off by the frame. Prefer the caller-provided preview viewport so the toolbar
  // is constrained to the same visible product surface; fall back to .viewer-body for
  // direct component usage. Resolve in a layout effect to avoid a clipped first paint.
  const [resolvedToolbarHost, setResolvedToolbarHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!active) {
      setResolvedToolbarHost(null);
      return;
    }
    setResolvedToolbarHost(
      toolbarHost ?? (wrapRef.current?.closest('.viewer-body') as HTMLElement | null) ?? null,
    );
  }, [active, toolbarHost]);

  useLayoutEffect(() => {
    if (!active) {
      setDockPlacement((current) => (
        current.layout === 'docked' && current.side === null && dockPlacementEquals(current, {
          layout: 'docked',
          side: null,
          style: previewDrawDockDockedStyle,
        })
          ? current
          : { layout: 'docked', side: null, style: previewDrawDockDockedStyle }
      ));
      return;
    }

    const wrap = wrapRef.current;
    const dock = dockRef.current;
    const host = resolvedToolbarHost ?? wrap;
    const anchor = anchorBounds();
    if (!wrap || !dock || !host || !anchor) {
      setDockPlacement((current) => (
        current.layout === 'docked' && current.side === null && current.style === previewDrawDockDockedStyle
          ? current
          : { layout: 'docked', side: null, style: previewDrawDockDockedStyle }
      ));
      return;
    }

    const hostRect = host.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    if (
      hostRect.width <= DRAW_DOCK_MARGIN * 2 ||
      hostRect.height <= DRAW_DOCK_MARGIN * 2 ||
      dockRect.width <= 0 ||
      dockRect.height <= 0 ||
      hostRect.width < Math.max(DRAW_DOCK_MIN_WIDTH, dockRect.width) + DRAW_DOCK_MARGIN * 2 ||
      hostRect.height < Math.max(DRAW_DOCK_MIN_HEIGHT, dockRect.height) + DRAW_DOCK_MARGIN * 2
    ) {
      setDockPlacement((current) => (
        current.layout === 'docked' && current.side === null && current.style === previewDrawDockDockedStyle
          ? current
          : { layout: 'docked', side: null, style: previewDrawDockDockedStyle }
      ));
      return;
    }

    const anchorInHost: Rect = {
      x: wrapRect.left - hostRect.left + anchor.x,
      y: wrapRect.top - hostRect.top + anchor.y,
      width: anchor.width,
      height: anchor.height,
    };
    const safeLeft = DRAW_DOCK_MARGIN;
    const safeTop = DRAW_DOCK_MARGIN;
    const safeRight = Math.max(safeLeft, hostRect.width - dockRect.width - DRAW_DOCK_MARGIN);
    const safeBottom = Math.max(safeTop, hostRect.height - dockRect.height - DRAW_DOCK_MARGIN);
    const centeredLeft = anchorInHost.x + anchorInHost.width / 2 - dockRect.width / 2;
    const centeredTop = anchorInHost.y + anchorInHost.height / 2 - dockRect.height / 2;
    const candidates: Array<{ side: DrawDockSide; left: number; top: number; fits: boolean }> = [
      {
        side: 'right',
        left: anchorInHost.x + anchorInHost.width + DRAW_DOCK_GAP,
        top: centeredTop,
        fits: anchorInHost.x + anchorInHost.width + DRAW_DOCK_GAP + dockRect.width <= hostRect.width - DRAW_DOCK_MARGIN,
      },
      {
        side: 'left',
        left: anchorInHost.x - DRAW_DOCK_GAP - dockRect.width,
        top: centeredTop,
        fits: anchorInHost.x - DRAW_DOCK_GAP - dockRect.width >= DRAW_DOCK_MARGIN,
      },
      {
        side: 'bottom',
        left: centeredLeft,
        top: anchorInHost.y + anchorInHost.height + DRAW_DOCK_GAP,
        fits: anchorInHost.y + anchorInHost.height + DRAW_DOCK_GAP + dockRect.height <= hostRect.height - DRAW_DOCK_MARGIN,
      },
      {
        side: 'top',
        left: centeredLeft,
        top: anchorInHost.y - DRAW_DOCK_GAP - dockRect.height,
        fits: anchorInHost.y - DRAW_DOCK_GAP - dockRect.height >= DRAW_DOCK_MARGIN,
      },
    ];

    let nextPlacement: { layout: DrawDockLayout; side: DrawDockSide | null; style: CSSProperties } = {
      layout: 'docked',
      side: null,
      style: previewDrawDockDockedStyle,
    };

    for (const candidate of candidates) {
      if (!candidate.fits) continue;
      const clampedLeft = clamp(candidate.left, safeLeft, safeRight);
      const clampedTop = clamp(candidate.top, safeTop, safeBottom);
      const candidateRect: Rect = {
        x: clampedLeft,
        y: clampedTop,
        width: dockRect.width,
        height: dockRect.height,
      };
      if (rectsOverlap(candidateRect, anchorInHost)) continue;
      nextPlacement = {
        layout: 'floating',
        side: candidate.side,
        style: {
          position: 'absolute',
          left: `${Math.round(clampedLeft)}px`,
          top: `${Math.round(clampedTop)}px`,
          transform: 'none',
          bottom: 'auto',
          maxWidth: `${Math.max(0, hostRect.width - DRAW_DOCK_MARGIN * 2)}px`,
        },
      };
      break;
    }

    setDockPlacement((current) => (dockPlacementEquals(current, nextPlacement) ? current : nextPlacement));
  }, [
    active,
    resolvedToolbarHost,
    captureTarget,
    layoutRevision,
    imagePreviews.length,
    captureWarning?.message,
  ]);

  useLayoutEffect(() => {
    if (!active || typeof ResizeObserver === 'undefined') return undefined;
    const wrap = wrapRef.current;
    const dock = dockRef.current;
    const host = resolvedToolbarHost ?? wrap;
    if (!wrap || !dock || !host) return undefined;
    const recompute = () => setLayoutRevision((value) => value + 1);
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    ro.observe(dock);
    if (host !== wrap) ro.observe(host);
    return () => ro.disconnect();
  }, [active, resolvedToolbarHost]);

  const overlayPointer = active ? 'auto' : 'none';
  const showCanvas = active || hasInk || hasBox || hasText;
  const textLayerVisible = active || hasText;
  const textFontPx = Math.max(TEXT_MIN_FONT_PX, TEXT_FONT_FRACTION * frameSize.h);
  const canSubmit = hasInk || hasBox || hasText || Boolean(captureTarget) || captureViewport || Boolean(note.trim()) || extraFiles.length > 0;
  const activePreview = previewIndex !== null ? imagePreviews[previewIndex] ?? null : null;
  const canAddToInput = canSubmit;
  const canSend = canSubmit && !sendDisabled;
  const canUndo = (undoCount > 0 || hasBox) && !sending;
  const canRedo = redoCount > 0 && !sending;
  const chromeHidden = capturing || hideChrome;
  // Each submit action's icon, labels, and enable rule, driving the split
  // button and its dropdown. `send` is gated while a task runs (Queue and
  // Add-to-input stay usable then); the others only need something to submit.
  const submitOptions: {
    action: AnnotationAction;
    label: string;
    pendingLabel: string;
    title: string;
    icon: ReactNode;
    enabled: boolean;
  }[] = [
    {
      action: 'send',
      label: t('chat.send'),
      pendingLabel: t('chat.annotationSending'),
      title: sendDisabled
        ? sendDisabledReason ?? t('chat.annotationSendDisabledReason')
        : t('chat.send'),
      icon: <Icon name="send" size={14} />,
      enabled: canSend,
    },
    {
      action: 'draft',
      label: t('chat.annotationAddToInput'),
      pendingLabel: t('chat.annotationAddingToInput'),
      title: t('chat.annotationAddToInput'),
      icon: <RemixIcon name="input-field" size={15} />,
      enabled: canAddToInput,
    },
    {
      action: 'queue',
      label: t('chat.annotationQueue'),
      pendingLabel: t('chat.annotationQueueing'),
      title: t('chat.annotationQueue'),
      icon: <RemixIcon name="list-check-2" size={15} />,
      enabled: canSubmit,
    },
  ];
  const currentSubmit = submitOptions.find((opt) => opt.action === submitAction) ?? submitOptions[0]!;
  // The one current-tool button and its dropdown share this list: box-select,
  // freehand pen, and drop-a-text-label.
  const markToolOptions: { tool: MarkTool; label: string; icon: string }[] = [
    { tool: 'box', label: t('fileViewer.boxSelect'), icon: 'checkbox-blank-line' },
    { tool: 'pen', label: t('sketch.toolPen'), icon: 'pencil-line' },
    { tool: 'text', label: t('fileViewer.textTool'), icon: 'text' },
  ];
  const currentMarkTool = markToolOptions.find((item) => item.tool === markTool) ?? markToolOptions[0]!;

  return (
    <div
      ref={wrapRef}
      className={`preview-draw-overlay${active ? ' preview-draw-overlay-active' : ''}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    >
      {children}
      {showCanvas ? (
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onCanvasWheel}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: overlayPointer,
            cursor: active ? (markTool === 'text' ? 'text' : 'crosshair') : 'default',
            visibility: chromeHidden ? 'hidden' : 'visible',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            zIndex: 80,
          }}
        />
      ) : null}
      {textLayerVisible ? (
        <div
          className="preview-draw-text-layer"
          style={{
            position: 'absolute',
            inset: 0,
            // The layer itself passes pointers through to the canvas (so a press
            // on empty space still drops a new label); only the textareas and
            // their remove buttons opt back into pointer events, and only while
            // the text tool is active.
            pointerEvents: 'none',
            visibility: chromeHidden ? 'hidden' : 'visible',
            zIndex: 81,
          }}
        >
          {textMarks.map((mark) => {
            const editing = editingTextId === mark.id;
            return (
              <div
                key={mark.id}
                className="preview-draw-text-mark"
                ref={(el) => {
                  if (el) textWrapRefs.current.set(mark.id, el);
                  else textWrapRefs.current.delete(mark.id);
                }}
                onPointerDown={(e) => onTextPointerDown(e, mark)}
                onPointerMove={(e) => onTextPointerMove(e, mark)}
                onPointerUp={(e) => onTextPointerUp(e, mark)}
                onPointerCancel={(e) => onTextPointerUp(e, mark)}
                style={{
                  position: 'absolute',
                  left: `${mark.x * 100}%`,
                  top: `${mark.y * 100}%`,
                  display: 'block',
                  // Placed labels are draggable; a live editing label yields
                  // pointer handling to its textarea for caret placement.
                  pointerEvents: markTool === 'text' ? 'auto' : 'none',
                  cursor: editing ? 'default' : 'move',
                  touchAction: 'none',
                }}
              >
                <textarea
                  ref={(el) => {
                    if (el) {
                      textAreaRefs.current.set(mark.id, el);
                      autosizeTextArea(el);
                    } else {
                      textAreaRefs.current.delete(mark.id);
                    }
                  }}
                  value={mark.text}
                  wrap="off"
                  rows={1}
                  spellCheck={false}
                  readOnly={!editing}
                  aria-label={t('fileViewer.textTool')}
                  onChange={(e) => {
                    updateTextMark(mark.id, e.target.value);
                    autosizeTextArea(e.currentTarget);
                  }}
                  onBlur={() => handleTextBlur(mark.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      e.currentTarget.blur();
                    }
                  }}
                  style={{
                    display: 'block',
                    margin: 0,
                    padding: 0,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    resize: 'none',
                    overflow: 'hidden',
                    whiteSpace: 'pre',
                    boxShadow: 'none',
                    color: STROKE_COLOR,
                    caretColor: STROKE_COLOR,
                    fontFamily: TEXT_FONT_FAMILY,
                    fontWeight: 600,
                    fontSize: textFontPx,
                    lineHeight: TEXT_LINE_HEIGHT,
                    // Just enough to show the blinking caret in an empty label;
                    // autosize takes over the moment text is typed.
                    minWidth: Math.max(2, Math.round(textFontPx * 0.5)),
                    textShadow: '0 0 3px rgba(255,255,255,0.75)',
                    // Only the editing label captures pointers (caret/selection);
                    // a placed label lets the wrapper handle drag + double-tap.
                    pointerEvents: editing ? 'auto' : 'none',
                    userSelect: editing ? 'text' : 'none',
                    WebkitUserSelect: editing ? 'text' : 'none',
                    cursor: editing ? 'text' : 'move',
                  }}
                />
                {markTool === 'text' ? (
                  <button
                    type="button"
                    className="preview-draw-text-remove"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => removeTextMark(mark.id)}
                    aria-label={t('fileViewer.textAnnotationRemove')}
                    title={t('fileViewer.textAnnotationRemove')}
                  >
                    <Icon name="close" size={8} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {active ? maybePortal(
        <>
          <style>{tooltipStyle}</style>
          <div
            ref={dockRef}
            className="preview-draw-dock"
            data-draw-layout={dockPlacement.layout}
            data-draw-side={dockPlacement.side ?? undefined}
            style={{
              ...previewDrawDockBaseStyle,
              ...dockPlacement.style,
            }}
          >
          {captureWarning ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                display: 'flex',
                alignItems: 'center',
                maxWidth: '100%',
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(20,20,20,0.92)',
                color: '#fff',
                boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
                backdropFilter: 'blur(8px)',
                zIndex: 92,
                pointerEvents: 'none',
                fontSize: 13,
                lineHeight: 1.35,
                visibility: chromeHidden ? 'hidden' : undefined,
              }}
            >
              <span>{captureWarning.message}</span>
            </div>
          ) : null}
          {imagePreviews.length > 0 ? (
            <div
              aria-label={t('chat.annotationAttachedImages')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                maxWidth: '100%',
                overflowX: 'auto',
                padding: '6px 8px',
                background: 'rgba(20,20,20,0.92)',
                borderRadius: 12,
                boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
                backdropFilter: 'blur(8px)',
                zIndex: 90,
                pointerEvents: 'auto',
                visibility: chromeHidden ? 'hidden' : undefined,
              }}
            >
              {imagePreviews.map((item, i) => (
                <div key={item.url} style={{ position: 'relative', flex: '0 0 auto' }}>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(i)}
                    disabled={sending}
                    title={item.file.name}
                    aria-label={item.file.name}
                    style={{
                      display: 'block',
                      width: 44,
                      height: 44,
                      padding: 0,
                      border: '1px solid rgba(255,255,255,0.22)',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.08)',
                      cursor: sending ? 'wait' : 'zoom-in',
                    }}
                  >
                    <img
                      src={item.url}
                      alt=""
                      aria-hidden
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeExtraFile(i)}
                    disabled={sending}
                    aria-label={t('chat.annotationAttachedRemove')}
                    title={t('chat.annotationAttachedRemove')}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 999,
                      border: '1px solid rgba(0,0,0,0.25)',
                      background: '#1f1f1f',
                      color: '#fff',
                      cursor: sending ? 'wait' : 'pointer',
                      padding: 0,
                    }}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div
            className="preview-draw-toolbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignContent: 'center',
              flexWrap: 'nowrap',
              gap: 6,
              boxSizing: 'border-box',
              width: 'max-content',
              maxWidth: '100%',
              overflow: 'visible',
              padding: 6,
              background: 'rgba(20,20,20,0.92)',
              color: '#fff',
              borderRadius: 22,
              boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
              backdropFilter: 'blur(8px)',
              zIndex: 91,
              pointerEvents: 'auto',
              fontSize: 13,
              visibility: chromeHidden ? 'hidden' : undefined,
            }}
          >
          <div className="preview-draw-tool-cluster" style={drawToolbarClusterStyle}>
            <div ref={markToolMenuRef} style={subToolGroupStyle} aria-label={t('fileViewer.markTool')}>
              <button
                type="button"
                onClick={() => setMarkToolMenuOpen((open) => !open)}
                disabled={sending}
                aria-haspopup="menu"
                aria-expanded={markToolMenuOpen}
                aria-label={currentMarkTool.label}
                title={currentMarkTool.label}
                data-tooltip={currentMarkTool.label}
                className="preview-draw-subtool-action"
                style={subToolButtonStyle}
              >
                <RemixIcon name={currentMarkTool.icon} size={14} />
                <RemixIcon name="arrow-down-s-line" size={12} style={{ opacity: 0.78 }} />
              </button>
              {markToolMenuOpen ? (
                <div role="menu" aria-label={t('fileViewer.markTool')} style={markToolMenuStyle}>
                  {markToolOptions.map((item) => {
                    const activeTool = markTool === item.tool;
                    return (
                      <button
                        key={item.tool}
                        type="button"
                        role="menuitemradio"
                        aria-checked={activeTool}
                        aria-label={item.label}
                        disabled={sending}
                        onClick={() => selectMarkTool(item.tool)}
                        style={submitMenuItemStyle(activeTool, !sending)}
                      >
                        <span style={submitMenuItemIconStyle}>
                          <RemixIcon name={item.icon} size={14} />
                        </span>
                        <span style={{ flex: '1 1 auto' }}>{item.label}</span>
                        {activeTool ? <RemixIcon name="check-line" size={14} /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={undoStroke}
              disabled={!canUndo}
              style={historyButtonStyle(canUndo)}
              aria-label={t('manualEdit.undo')}
              title={t('manualEdit.undo')}
            >
              <RemixIcon name="arrow-go-back-line" size={14} />
            </button>
            <button
              type="button"
              onClick={redoStroke}
              disabled={!canRedo}
              style={historyButtonStyle(canRedo)}
              aria-label={t('manualEdit.redo')}
              title={t('manualEdit.redo')}
            >
              <RemixIcon name="arrow-go-forward-line" size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={onFileInputChange}
            />
            <button
              type="button"
              onClick={() => {
                onToolbarClick?.('attach_image');
                fileInputRef.current?.click();
              }}
              disabled={sending}
              aria-label={t('chat.annotationAttachImage')}
              title={t('chat.annotationAttachImage')}
              data-tooltip={t('chat.annotationAttachImage')}
              className="preview-draw-icon-action"
              style={historyButtonStyle(!sending)}
            >
              <RemixIcon name="image-add-line" size={14} />
            </button>
          </div>
          <div className="preview-draw-note-actions" style={drawToolbarNoteActionsStyle}>
            <input
              className="preview-draw-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onPaste={onNotePaste}
              disabled={sending}
              placeholder={t('chat.annotationNotePlaceholder')}
              style={{
                background: 'rgba(218, 97, 56, 0.18)',
                border: '1px solid rgba(248, 150, 104, 0.82)',
                borderRadius: 999,
                outline: 'none',
                boxShadow: '0 0 0 3px rgba(218, 97, 56, 0.22)',
                color: 'inherit',
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 240,
                minWidth: 0,
                width: 'clamp(160px, 28vw, 320px)',
                maxWidth: '100%',
                padding: '5px 10px',
                fontSize: 13,
                transition: 'background 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(e) => {
                if (isImeComposing(e, composingRef.current)) return;
                if (e.key === 'Enter') void send('queue');
              }}
            />
            <div className="preview-draw-submit" ref={submitMenuRef} style={submitSplitStyle}>
              <button
                type="button"
                onClick={() => void send(submitAction)}
                disabled={sending || !currentSubmit.enabled}
                aria-label={pendingAction === submitAction ? currentSubmit.pendingLabel : currentSubmit.label}
                title={pendingAction === submitAction ? currentSubmit.pendingLabel : currentSubmit.title}
                data-tooltip={pendingAction === submitAction ? currentSubmit.pendingLabel : currentSubmit.title}
                className="preview-draw-icon-action"
                style={{
                  ...drawActionButtonStyle(true),
                  width: 'auto',
                  minWidth: 40,
                  padding: '0 7px 0 12px',
                  borderRadius: '999px 0 0 999px',
                  opacity: currentSubmit.enabled ? 1 : 0.4,
                  cursor: sending ? 'wait' : (currentSubmit.enabled ? 'pointer' : 'not-allowed'),
                }}
              >
                {pendingAction === submitAction ? <Icon name="spinner" size={14} /> : currentSubmit.icon}
              </button>
              <button
                type="button"
                onClick={() => setSubmitMenuOpen((open) => !open)}
                disabled={sending || !canSubmit}
                aria-haspopup="menu"
                aria-expanded={submitMenuOpen}
                aria-label={t('chat.annotationSubmitOptions')}
                title={t('chat.annotationSubmitOptions')}
                style={{
                  ...drawActionButtonStyle(true),
                  width: 25,
                  borderRadius: '0 999px 999px 0',
                  borderLeft: '1px solid rgba(255,255,255,0.28)',
                  opacity: (!sending && canSubmit) ? 1 : 0.5,
                  cursor: sending ? 'wait' : (canSubmit ? 'pointer' : 'not-allowed'),
                }}
              >
                <RemixIcon name={submitMenuOpen ? 'arrow-down-s-line' : 'arrow-up-s-line'} size={14} />
              </button>
              {submitMenuOpen ? (
                <div role="menu" aria-label={t('chat.annotationSubmitOptions')} style={submitMenuStyle}>
                  {submitOptions.map((opt) => {
                    const itemEnabled = !sending && opt.enabled;
                    const active = submitAction === opt.action;
                    return (
                      <button
                        key={opt.action}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        aria-label={opt.label}
                        disabled={itemEnabled ? undefined : true}
                        title={opt.title}
                        onClick={() => {
                          setSubmitAction(opt.action);
                          setSubmitMenuOpen(false);
                          void send(opt.action);
                        }}
                        style={submitMenuItemStyle(active, itemEnabled)}
                      >
                        <span style={submitMenuItemIconStyle}>{opt.icon}</span>
                        <span style={{ flex: '1 1 auto' }}>{opt.label}</span>
                        {active ? <RemixIcon name="check-line" size={14} /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onToolbarClick?.('exit');
              closeOverlay();
            }}
            disabled={sending}
            aria-label={t('common.close')}
            title={t('common.close')}
            style={closeButtonStyle}
          >
            <Icon name="close" size={13} />
          </button>
          </div>
          </div>
          {activePreview ? createPortal(
            <div
              className="staged-preview-modal"
              role="dialog"
              aria-modal="true"
              aria-label={activePreview.file.name}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setPreviewIndex(null);
              }}
            >
              <div className="staged-preview-card">
                <div className="staged-preview-head">
                  <span title={activePreview.file.name}>{activePreview.file.name}</span>
                  <button
                    type="button"
                    className="icon-only"
                    onClick={() => setPreviewIndex(null)}
                    aria-label={t('common.close')}
                    title={t('common.close')}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <img src={activePreview.url} alt={activePreview.file.name} />
              </div>
            </div>,
            document.body,
          ) : null}
        </>,
        resolvedToolbarHost,
      ) : null}
    </div>
  );
}

const tooltipStyle = `
  .preview-draw-overlay-active iframe {
    pointer-events: none !important;
    user-select: none !important;
    -webkit-user-select: none !important;
  }
  .preview-draw-icon-action,
  .preview-draw-subtool-action {
    position: relative;
  }
  .preview-draw-icon-action::after,
  .preview-draw-subtool-action::after {
    content: attr(data-tooltip);
    position: absolute;
    z-index: 12;
    left: 50%;
    bottom: calc(100% + 8px);
    transform: translateX(-50%) translateY(2px);
    padding: 4px 7px;
    border-radius: 6px;
    background: rgba(20,20,20,0.94);
    color: #fff;
    font-size: 11px;
    line-height: 1.2;
    opacity: 0;
    pointer-events: none;
    white-space: nowrap;
    transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .preview-draw-icon-action:hover::after,
  .preview-draw-icon-action:focus-visible::after,
  .preview-draw-subtool-action:hover::after,
  .preview-draw-subtool-action:focus-visible::after {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  /* A label's remove control stays hidden until you hover the label (or tab to
     it), then fades + scales in — subtle, not a permanent hard chip. */
  .preview-draw-text-remove {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 15px;
    height: 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.28);
    background: rgba(28,28,30,0.5);
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
    color: rgba(255,255,255,0.92);
    box-shadow: 0 1px 4px rgba(0,0,0,0.28);
    cursor: pointer;
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .preview-draw-text-mark:hover .preview-draw-text-remove,
  .preview-draw-text-remove:focus-visible {
    opacity: 1;
    transform: scale(1);
  }
  .preview-draw-text-remove:hover {
    background: rgba(42,42,46,0.62);
    color: #fff;
  }
`;

function normalizedRectFromPoints(a: Point, b: Point): NormalizedRect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Bake the transparent on-screen labels into the exported screenshot. The glyph
// height is the same frame-height fraction the DOM textareas use, so what the
// user typed lands at the same size and position in the captured PNG. A soft
// white halo keeps red text legible over any artifact background.
function drawTextMarks(
  ctx: CanvasRenderingContext2D,
  marks: TextMark[],
  width: number,
  height: number,
) {
  const fontPx = Math.max(TEXT_MIN_FONT_PX, TEXT_FONT_FRACTION * height);
  const lineHeight = fontPx * TEXT_LINE_HEIGHT;
  const topPad = (lineHeight - fontPx) / 2;
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = `600 ${fontPx}px ${TEXT_FONT_FAMILY}`;
  ctx.fillStyle = STROKE_COLOR;
  ctx.shadowColor = 'rgba(255,255,255,0.75)';
  ctx.shadowBlur = Math.max(1, fontPx * 0.14);
  for (const mark of marks) {
    if (mark.text.trim().length === 0) continue;
    const baseX = mark.x * width;
    const baseY = mark.y * height + topPad;
    mark.text.split('\n').forEach((line, index) => {
      ctx.fillText(line, baseX, baseY + index * lineHeight);
    });
  }
  ctx.restore();
}

function drawNormalizedBox(ctx: CanvasRenderingContext2D, box: NormalizedRect, width: number, height: number) {
  const left = box.x * width;
  const top = box.y * height;
  const boxWidth = Math.max(1, box.width * width);
  const boxHeight = Math.max(1, box.height * height);
  ctx.save();
  ctx.fillStyle = 'rgba(255, 59, 48, 0.10)';
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.002));
  ctx.setLineDash([10, 6]);
  ctx.fillRect(left, top, boxWidth, boxHeight);
  ctx.strokeRect(left, top, boxWidth, boxHeight);
  ctx.restore();
}

const subToolGroupStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  padding: 0,
  borderRadius: 999,
  background: 'transparent',
  border: 'none',
  flex: '0 0 auto',
};

const drawToolbarClusterStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  flex: '0 0 auto',
};

const drawToolbarNoteActionsStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  flex: '1 1 360px',
  minWidth: 0,
  maxWidth: 420,
};

const subToolButtonStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 999,
  width: 54,
  minWidth: 54,
  height: 30,
  padding: '0 8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  flex: '0 0 54px',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function drawActionButtonStyle(primary: boolean): CSSProperties {
  return {
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.2)',
    borderRadius: 999,
    width: 34,
    height: 34,
    padding: 0,
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? '#fff' : 'inherit',
  };
}

function historyButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...iconButtonStyle,
    opacity: enabled ? 1 : 0.36,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

const iconButtonStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 999,
  width: 30,
  minWidth: 30,
  height: 30,
  padding: 0,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 30px',
  aspectRatio: '1 / 1',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
};

const closeButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  borderColor: 'rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.05)',
};

// Bottom-anchored column that stacks the capture warning, attached-image
// strip, and toolbar with real spacing. Absolute per-element `bottom` offsets
// used to collide once the toolbar wrapped taller, so the image strip visually
// covered the controls; a flex column keeps them apart at any height.
const previewDrawDockBaseStyle: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  zIndex: 91,
  pointerEvents: 'none',
};

const previewDrawDockDockedStyle: CSSProperties = {
  left: 'calc(50% - 52px)',
  bottom: 16,
  transform: 'translateX(-50%)',
  maxWidth: 'min(760px, calc(100% - 144px))',
};

const submitSplitStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  flex: '0 0 auto',
};

const submitMenuStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 8px)',
  minWidth: 184,
  padding: 4,
  borderRadius: 12,
  background: 'rgba(20,20,20,0.98)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.32)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  zIndex: 12,
};

const markToolMenuStyle: CSSProperties = {
  ...submitMenuStyle,
  left: 0,
  right: 'auto',
  minWidth: 144,
};

function submitMenuItemStyle(active: boolean, enabled: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '7px 9px',
    borderRadius: 8,
    border: 'none',
    background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
    color: '#fff',
    fontSize: 12.5,
    lineHeight: 1.2,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    opacity: enabled ? 1 : 0.4,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

const submitMenuItemIconStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  flex: '0 0 auto',
};
