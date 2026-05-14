import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

import { Icon } from './Icon';
import type { PreviewVisualMarkKind } from '../types';
import { requestPreviewSnapshot } from '../runtime/exports';

export type PreviewDrawMode = 'click' | 'draw';

interface Point { x: number; y: number }
interface Stroke { points: Point[] }
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
}

interface Props {
  children: ReactNode;
  active?: boolean;
  onActiveChange?: (active: boolean) => void;
  onModeChange?: (mode: PreviewDrawMode) => void;
  captureTarget?: CaptureTarget | null;
  filePath?: string;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
}

const STROKE_COLOR = '#ff3b30';
const STROKE_WIDTH = 4;
const ACTIVE_BUTTON_COLOR = 'var(--accent)';
const TARGET_COLOR = '#1677ff';

export function PreviewDrawOverlay({
  children,
  active = false,
  onActiveChange,
  onModeChange,
  captureTarget = null,
  filePath,
  sendDisabled = false,
  sendDisabledReason,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<PreviewDrawMode>('click');
  const [note, setNote] = useState('');
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [pendingAction, setPendingAction] = useState<'queue' | 'send' | null>(null);
  const sending = pendingAction !== null;

  useEffect(() => {
    if (active) setMode('draw');
    else setMode('click');
  }, [active]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  const redraw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    if (typeof window.CanvasRenderingContext2D === 'undefined') return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const dpr = window.devicePixelRatio || 1;
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const s of all) {
      const first = s.points[0];
      if (!first) continue;
      ctx.beginPath();
      ctx.moveTo(first.x * dpr, first.y * dpr);
      for (let i = 1; i < s.points.length; i++) {
        const p = s.points[i]!;
        ctx.lineTo(p.x * dpr, p.y * dpr);
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
  }, [redraw, mode, hasInk]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMode('click');
        onActiveChange?.(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onActiveChange]);

  function pointFromEvent(e: PointerEvent): Point {
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent) {
    if (mode !== 'draw' || sending) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawingRef.current = { points: [pointFromEvent(e)] };
    redraw();
  }
  function onPointerMove(e: PointerEvent) {
    if (mode !== 'draw' || sending || !drawingRef.current) return;
    drawingRef.current.points.push(pointFromEvent(e));
    redraw();
  }
  function onPointerUp() {
    if (mode !== 'draw' || sending || !drawingRef.current) return;
    if (drawingRef.current.points.length > 1) {
      strokesRef.current.push(drawingRef.current);
      setHasInk(true);
    }
    drawingRef.current = null;
    redraw();
  }

  function clearInk() {
    strokesRef.current = [];
    drawingRef.current = null;
    setHasInk(false);
    redraw();
  }

  function strokeBounds(): { x: number; y: number; width: number; height: number } | null {
    const points = strokesRef.current.flatMap((stroke) => stroke.points);
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
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
    const stroke = strokeBounds();
    const target = captureTarget?.position ?? null;
    if (!stroke && !target) return undefined;
    if (!stroke) return target ?? undefined;
    if (!target) return stroke;
    const left = Math.min(stroke.x, target.x);
    const top = Math.min(stroke.y, target.y);
    const right = Math.max(stroke.x + stroke.width, target.x + target.width);
    const bottom = Math.max(stroke.y + stroke.height, target.y + target.height);
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  function markKind(): PreviewVisualMarkKind | undefined {
    const hasTarget = Boolean(captureTarget);
    if (hasTarget && hasInk) return 'click+stroke';
    if (hasTarget) return 'click';
    if (hasInk) return 'stroke';
    return undefined;
  }

  async function requestSnapshot(): Promise<{ dataUrl: string; w: number; h: number } | null> {
    const iframe = wrapRef.current?.querySelector('iframe') as HTMLIFrameElement | null;
    if (!iframe) return null;
    return requestPreviewSnapshot(iframe);
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
    const iframe = wrapRef.current?.querySelector('iframe');
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
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH * Math.max(sx, sy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokesRef.current) {
      const first = s.points[0];
      if (!first) continue;
      ctx.beginPath();
      ctx.moveTo(first.x * sx, first.y * sy);
      for (let i = 1; i < s.points.length; i++) {
        const p = s.points[i]!;
        ctx.lineTo(p.x * sx, p.y * sy);
      }
      ctx.stroke();
    }
    return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  }

  async function send(action: 'queue' | 'send') {
    const hasTarget = Boolean(captureTarget);
    const shouldCapture = hasInk || hasTarget;
    const canSubmit = shouldCapture || Boolean(note.trim());
    if (action === 'send' && sendDisabled) return;
    if (sending || !canSubmit) return;
    setPendingAction(action);
    try {
      let file: File | null = null;
      if (shouldCapture) {
        let blob: Blob | null = null;
        const snap = await requestSnapshot();
        if (snap) blob = await compositeWithBackground(snap);
        if (!blob) {
          const cvs = canvasRef.current;
          if (cvs) {
            const copy = document.createElement('canvas');
            copy.width = cvs.width;
            copy.height = cvs.height;
            const ctx = copy.getContext('2d');
            if (ctx) {
              ctx.drawImage(cvs, 0, 0);
              const dpr = window.devicePixelRatio || 1;
              drawCaptureTarget(ctx, dpr, dpr, captureTarget);
              blob = await new Promise<Blob | null>((resolve) => copy.toBlob((b) => resolve(b), 'image/png'));
            } else {
              blob = await new Promise<Blob | null>((resolve) => cvs.toBlob((b) => resolve(b), 'image/png'));
            }
          }
        }
        if (blob) {
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          file = new File([blob], `drawing-${ts}.png`, { type: 'image/png' });
        }
      }
      const kind = markKind();
      const detail: AnnotationEventDetail = {
        file,
        note: note.trim(),
        action,
        filePath: captureTarget?.filePath || filePath,
        markKind: kind,
        bounds: kind ? annotationBounds() : undefined,
        target: captureTarget,
      };
      window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, { detail }));
      clearInk();
      setNote('');
    } finally {
      setPendingAction(null);
    }
  }

  const overlayPointer = mode === 'draw' ? 'auto' : 'none';
  const showCanvas = active || mode === 'draw' || hasInk;
  const canSubmit = hasInk || Boolean(captureTarget) || Boolean(note.trim());
  const canSend = canSubmit && !sendDisabled;

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
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: overlayPointer,
            cursor: mode === 'draw' ? 'crosshair' : 'default',
          }}
        />
      ) : null}
      {active ? (
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
            onClick={() => setMode((m) => (m === 'draw' ? 'click' : 'draw'))}
            disabled={sending}
            style={pillStyle(mode === 'draw')}
            aria-pressed={mode === 'draw'}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => setMode('click')}
            disabled={sending}
            style={pillStyle(mode === 'click')}
            aria-pressed={mode === 'click'}
          >
            Click
          </button>
          {hasInk ? (
            <button type="button" onClick={clearInk} disabled={sending} style={ghostStyle}>
              Clear
            </button>
          ) : null}
          <input
            className="preview-draw-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={sending}
            placeholder="Type anywhere to add a note"
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
            onKeyDown={(e) => { if (e.key === 'Enter') void send('queue'); }}
          />
          <button
            type="button"
            onClick={() => void send('queue')}
            disabled={sending || !canSubmit}
            style={{
              ...ghostStyle,
              opacity: canSubmit ? 1 : 0.4,
              cursor: sending ? 'wait' : (canSubmit ? 'pointer' : 'not-allowed'),
            }}
          >
            {pendingAction === 'queue' ? (
              <>
                <Icon name="spinner" size={12} />
                <span>Queueing...</span>
              </>
            ) : (
              'Queue'
            )}
          </button>
          {!sendDisabled ? (
            <button
              type="button"
              onClick={() => void send('send')}
              disabled={sending || !canSend}
              style={{
                ...pillStyle(true),
                opacity: canSend ? 1 : 0.4,
                cursor: sending ? 'wait' : (canSend ? 'pointer' : 'not-allowed'),
              }}
            >
              {pendingAction === 'send' ? (
                <>
                  <Icon name="spinner" size={12} />
                  <span>Sending...</span>
                </>
              ) : (
                'Send'
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function pillStyle(active: boolean): CSSProperties {
  return {
    border: 'none',
    borderRadius: 999,
    padding: '4px 12px',
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: active ? ACTIVE_BUTTON_COLOR : 'transparent',
    color: active ? '#fff' : 'inherit',
  };
}

const ghostStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 999,
  padding: '3px 10px',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'transparent',
  color: 'inherit',
};
