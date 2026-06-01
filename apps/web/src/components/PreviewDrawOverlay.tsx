import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type WheelEvent } from 'react';

import { Icon } from './Icon';
import { RemixIcon } from './RemixIcon';
import { useT } from '../i18n';
import type { PreviewVisualMarkKind } from '../types';
import { requestPreviewSnapshot } from '../runtime/exports';
import { isImeComposing } from '../utils/imeComposing';

interface Point { x: number; y: number }
interface Stroke { points: Point[] }
interface NormalizedRect { x: number; y: number; width: number; height: number }
type MarkTool = 'box' | 'pen';
interface CaptureTarget {
  filePath?: string;
  elementId?: string;
  selector?: string;
  label?: string;
  text?: string;
  position: { x: number; y: number; width: number; height: number };
  htmlHint?: string;
}

export const ANNOTATION_EVENT = 'opendesign:annotation';

export interface AnnotationEventDetail {
  file: File | null;
  note: string;
  action: 'queue' | 'send';
  filePath?: string;
  markKind?: PreviewVisualMarkKind;
  bounds?: { x: number; y: number; width: number; height: number };
  target?: CaptureTarget | null;
  ack?: (result: { ok: boolean; message?: string }) => void;
}

interface Props {
  children: ReactNode;
  active?: boolean;
  captureViewport?: boolean;
  onActiveChange?: (active: boolean) => void;
  captureTarget?: CaptureTarget | null;
  filePath?: string;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
}

const STROKE_COLOR = '#ff3b30';
const STROKE_WIDTH = 4;
const TARGET_COLOR = '#1677ff';

export function PreviewDrawOverlay({
  children,
  active = false,
  captureViewport = false,
  onActiveChange,
  captureTarget = null,
  filePath,
  sendDisabled = false,
  sendDisabledReason,
}: Props) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [note, setNote] = useState('');
  const [markTool, setMarkTool] = useState<MarkTool>('box');
  const strokesRef = useRef<Stroke[]>([]);
  const undoneStrokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const selectionBoxRef = useRef<NormalizedRect | null>(null);
  const boxDraftRef = useRef<{ start: Point; current: Point } | null>(null);
  const composingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [hasBox, setHasBox] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [pendingAction, setPendingAction] = useState<'queue' | 'send' | null>(null);
  const [captureWarning, setCaptureWarning] = useState<{
    action: 'queue' | 'send';
    message: string;
  } | null>(null);
  const sending = pendingAction !== null;

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
    const box = boxDraftRef.current
      ? normalizedRectFromPoints(boxDraftRef.current.start, boxDraftRef.current.current)
      : selectionBoxRef.current;
    if (box) drawNormalizedBox(ctx, box, cvs.width, cvs.height);
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

  useEffect(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cvs.width = Math.max(1, Math.floor(rect.width * dpr));
      cvs.height = Math.max(1, Math.floor(rect.height * dpr));
      cvs.style.width = `${rect.width}px`;
      cvs.style.height = `${rect.height}px`;
      redraw();
    };
    resize();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw, active, hasInk, hasBox]);

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
    setHasBox(Boolean(selectionBoxRef.current));
    setUndoCount(strokesRef.current.length);
    setRedoCount(undoneStrokesRef.current.length);
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
    if (!active || sending) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const point = pointFromEvent(e);
    if (markTool === 'box') {
      boxDraftRef.current = { start: point, current: point };
      selectionBoxRef.current = null;
      syncHistoryState();
      redraw();
      return;
    }
    drawingRef.current = { points: [point] };
    redraw();
  }
  function onPointerMove(e: PointerEvent) {
    if (!active || sending) return;
    if (boxDraftRef.current) {
      boxDraftRef.current.current = pointFromEvent(e);
      redraw();
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current.points.push(pointFromEvent(e));
    redraw();
  }
  function onPointerUp(e: PointerEvent) {
    if (!active || sending) return;
    if (boxDraftRef.current) {
      boxDraftRef.current.current = pointFromEvent(e);
      const next = normalizedRectFromPoints(boxDraftRef.current.start, boxDraftRef.current.current);
      boxDraftRef.current = null;
      selectionBoxRef.current = next.width >= 0.006 && next.height >= 0.006 ? next : null;
      syncHistoryState();
      redraw();
      return;
    }
    if (!drawingRef.current) return;
    if (drawingRef.current.points.length > 1) {
      strokesRef.current.push(drawingRef.current);
      undoneStrokesRef.current = [];
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
    selectionBoxRef.current = null;
    boxDraftRef.current = null;
    syncHistoryState();
    redraw();
  }

  function undoStroke() {
    if (sending) return;
    if (selectionBoxRef.current || boxDraftRef.current) {
      selectionBoxRef.current = null;
      boxDraftRef.current = null;
      syncHistoryState();
      redraw();
      return;
    }
    const stroke = strokesRef.current.pop();
    if (!stroke) return;
    undoneStrokesRef.current.push(stroke);
    drawingRef.current = null;
    syncHistoryState();
    redraw();
  }

  function redoStroke() {
    if (sending) return;
    const stroke = undoneStrokesRef.current.pop();
    if (!stroke) return;
    strokesRef.current.push(stroke);
    drawingRef.current = null;
    syncHistoryState();
    redraw();
  }

  function closeOverlay() {
    onActiveChange?.(false);
  }

  useEffect(() => {
    if (active) return;
    strokesRef.current = [];
    undoneStrokesRef.current = [];
    drawingRef.current = null;
    selectionBoxRef.current = null;
    boxDraftRef.current = null;
    syncHistoryState();
    redraw();
  }, [active, redraw]);

  function boxBounds(): { x: number; y: number; width: number; height: number } | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    const box = selectionBoxRef.current;
    if (!rect || rect.width <= 0 || rect.height <= 0 || !box) return null;
    return {
      x: box.x * rect.width,
      y: box.y * rect.height,
      width: Math.max(1, box.width * rect.width),
      height: Math.max(1, box.height * rect.height),
    };
  }

  function strokeBounds(): { x: number; y: number; width: number; height: number } | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const points = strokesRef.current.flatMap((stroke) => stroke.points);
    if (points.length === 0) return null;
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

  function annotationBounds(): { x: number; y: number; width: number; height: number } | undefined {
    const box = boxBounds();
    const stroke = strokeBounds();
    const target = captureTarget?.position ?? null;
    const bounds = [box, stroke, target].filter((item): item is { x: number; y: number; width: number; height: number } => Boolean(item));
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
    const hasVisualMark = hasInk || hasBox;
    if (hasTarget && hasVisualMark) return 'click+stroke';
    if (hasTarget) return 'click';
    if (hasVisualMark) return 'stroke';
    return undefined;
  }

  async function requestSnapshot(): Promise<{ dataUrl: string; w: number; h: number } | null> {
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

  async function compositeWithBackground(snap: { dataUrl: string; w: number; h: number }): Promise<Blob | null> {
    const iframe = activePreviewIframe();
    if (!iframe) return null;
    const rect = iframe.getBoundingClientRect();
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
    ctx.drawImage(bg, 0, 0, snap.w, snap.h);
    const sx = snap.w / Math.max(1, rect.width);
    const sy = snap.h / Math.max(1, rect.height);
    drawCaptureTarget(ctx, sx, sy, captureTarget);
    if (selectionBoxRef.current) drawNormalizedBox(ctx, selectionBoxRef.current, snap.w, snap.h);
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
    return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  }

  async function send(action: 'queue' | 'send') {
    const hasTarget = Boolean(captureTarget);
    const shouldCapture = hasInk || hasBox || hasTarget || captureViewport;
    const canSubmit = shouldCapture || Boolean(note.trim());
    if (sending || !canSubmit) return;
    // While a task is running the primary Send is disabled (use Queue instead).
    // The note/attachment is not lost: Queue still stages it for the next turn.
    if (action === 'send' && sendDisabled) return;
    setCaptureWarning(null);
    setPendingAction(action);
    try {
      let file: File | null = null;
      if (shouldCapture) {
        let blob: Blob | null = null;
        const snap = await requestSnapshot();
        if (snap) blob = await compositeWithBackground(snap);
        if (!blob) {
          setCaptureWarning({
            action,
            message: captureViewport && !hasInk && !hasBox && !hasTarget
              ? t('chat.annotationPreviewMissing')
              : t('chat.annotationPreviewMissingInk'),
          });
          return;
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        file = new File([blob], `drawing-${ts}.png`, { type: 'image/png' });
      }
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
      setCaptureWarning(null);
      setNote('');
    } finally {
      setPendingAction(null);
    }
  }

  const overlayPointer = active ? 'auto' : 'none';
  const showCanvas = active || hasInk || hasBox;
  const canSubmit = hasInk || hasBox || Boolean(captureTarget) || captureViewport || Boolean(note.trim());
  const canSend = canSubmit && !sendDisabled;
  const canUndo = (undoCount > 0 || hasBox) && !sending;
  const canRedo = redoCount > 0 && !sending;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
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
            cursor: active ? 'crosshair' : 'default',
          }}
        />
      ) : null}
      {active ? (
        <>
          <style>{tooltipStyle}</style>
          {captureWarning ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 82,
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                maxWidth: 'min(420px, calc(100% - 32px))',
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(20,20,20,0.92)',
                color: '#fff',
                boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
                backdropFilter: 'blur(8px)',
                zIndex: 11,
                pointerEvents: 'none',
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              <span>{captureWarning.message}</span>
            </div>
          ) : null}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 16,
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: 'rgba(20,20,20,0.92)',
              color: '#fff',
              borderRadius: 999,
              boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
              backdropFilter: 'blur(8px)',
              zIndex: 10,
              pointerEvents: 'auto',
              fontSize: 13,
            }}
          >
          <button
            type="button"
            onClick={closeOverlay}
            disabled={sending}
            aria-label={t('common.close')}
            title={t('common.close')}
            style={closeButtonStyle}
          >
            <Icon name="close" size={13} />
          </button>
          <div style={subToolGroupStyle} aria-label={t('fileViewer.markTool')}>
            <button
              type="button"
              onClick={() => setMarkTool('box')}
              disabled={sending}
              aria-label={t('fileViewer.boxSelect')}
              title={t('fileViewer.boxSelect')}
              data-tooltip={t('fileViewer.boxSelect')}
              className="preview-draw-subtool-action"
              style={subToolButtonStyle(markTool === 'box')}
            >
              <RemixIcon name="checkbox-blank-line" size={14} />
            </button>
            <button
              type="button"
              onClick={() => setMarkTool('pen')}
              disabled={sending}
              aria-label={t('sketch.toolPen')}
              title={t('sketch.toolPen')}
              data-tooltip={t('sketch.toolPen')}
              className="preview-draw-subtool-action"
              style={subToolButtonStyle(markTool === 'pen')}
            >
              <RemixIcon name="pencil-line" size={14} />
            </button>
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
            className="preview-draw-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={sending}
            placeholder={t('chat.annotationNotePlaceholder')}
            style={{
              background: 'rgba(218, 97, 56, 0.18)',
              border: '1px solid rgba(248, 150, 104, 0.82)',
              borderRadius: 999,
              outline: 'none',
              boxShadow: '0 0 0 3px rgba(218, 97, 56, 0.22)',
              color: 'inherit',
              width: 280,
              padding: '4px 8px',
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
              if (e.key === 'Enter') void send('send');
            }}
          />
          <button
            type="button"
            onClick={() => void send('queue')}
            disabled={sending || !canSubmit}
            aria-label={pendingAction === 'queue' ? t('chat.annotationQueueing') : t('chat.annotationQueue')}
            title={pendingAction === 'queue' ? t('chat.annotationQueueing') : t('chat.annotationQueue')}
            data-tooltip={pendingAction === 'queue' ? t('chat.annotationQueueing') : t('chat.annotationQueue')}
            className="preview-draw-icon-action"
            style={{
              ...drawActionButtonStyle(false),
              opacity: canSubmit ? 1 : 0.4,
              cursor: sending ? 'wait' : (canSubmit ? 'pointer' : 'not-allowed'),
            }}
          >
            {pendingAction === 'queue' ? (
              <Icon name="spinner" size={14} />
            ) : (
              <RemixIcon name="list-check-2" size={15} />
            )}
          </button>
          <button
            type="button"
            onClick={() => void send('send')}
            disabled={sending || !canSend}
            aria-label={pendingAction === 'send' ? t('chat.annotationSending') : t('chat.send')}
            title={sendDisabled ? sendDisabledReason : pendingAction === 'send' ? t('chat.annotationSending') : t('chat.send')}
            data-tooltip={sendDisabled ? sendDisabledReason : pendingAction === 'send' ? t('chat.annotationSending') : t('chat.send')}
            className="preview-draw-icon-action"
            style={{
              ...drawActionButtonStyle(true),
              opacity: canSend ? 1 : 0.4,
              cursor: sending ? 'wait' : (canSend ? 'pointer' : 'not-allowed'),
            }}
          >
            {pendingAction === 'send' ? (
              <Icon name="spinner" size={14} />
            ) : (
              <Icon name="send" size={14} />
            )}
          </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

const tooltipStyle = `
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
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: 3,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
};

function subToolButtonStyle(active: boolean): CSSProperties {
  return {
    border: 'none',
    borderRadius: 999,
    width: 34,
    height: 30,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
    color: '#fff',
    fontSize: 12,
    fontWeight: active ? 650 : 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function drawActionButtonStyle(primary: boolean): CSSProperties {
  return {
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.2)',
    borderRadius: 999,
    width: 36,
    height: 36,
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
  width: 28,
  height: 28,
  padding: 0,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.06)',
  color: 'inherit',
};

const closeButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  border: 'none',
  background: 'transparent',
};
