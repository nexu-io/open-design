import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';

export type Tool = 'select' | 'pen' | 'text' | 'rect' | 'arrow' | 'eraser';

interface Stroke {
  kind: 'pen';
  points: Array<{ x: number; y: number }>;
  color: string;
  size: number;
}
interface RectShape {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  size: number;
}
interface ArrowShape {
  kind: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
}
interface TextItem {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

export type SketchItem = Stroke | RectShape | ArrowShape | TextItem;

export interface SketchDocument {
  version: 1;
  items: SketchItem[];
}

interface Props {
  // Controlled items — the parent owns the strokes so switching to a different
  // tab and back doesn't lose the in-progress sketch. The editor only reports
  // changes via onItemsChange.
  items: SketchItem[];
  onItemsChange: (items: SketchItem[]) => void;
  onSave: () => Promise<void> | void;
  onCancel?: () => void;
  saving?: boolean;
  dirty?: boolean;
  fileName: string;
}

export function SketchEditor({
  items,
  onItemsChange,
  onSave,
  onCancel,
  saving = false,
  dirty = false,
  fileName,
}: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#1c1b1a');
  const [size, setSize] = useState(2);
  const drawingRef = useRef<SketchItem | null>(null);
  const [, force] = useState(0);

  // Resize canvas to its container while keeping a high DPR for crisp lines.
  useEffect(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      cvs.width = Math.max(1, Math.round(rect.width * dpr));
      cvs.height = Math.max(1, Math.round(rect.height * dpr));
      cvs.style.width = `${rect.width}px`;
      cvs.style.height = `${rect.height}px`;
      const ctx = cvs.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // redraw is closure-fresh each render via the items dep below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redraw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const w = cvs.clientWidth;
    const h = cvs.clientHeight;
    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h);
    const all = drawingRef.current ? [...items, drawingRef.current] : items;
    for (const it of all) drawItem(ctx, it);
  }, [items]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === 'select') return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    cvs.setPointerCapture(e.pointerId);
    const pos = pointerPos(e);

    if (tool === 'text') {
      const text = window.prompt(t('sketch.textPrompt'));
      if (text) {
        onItemsChange([
          ...items,
          { kind: 'text', x: pos.x, y: pos.y, text, color, size: 16 + size * 4 },
        ]);
      }
      return;
    }

    if (tool === 'pen' || tool === 'eraser') {
      drawingRef.current = {
        kind: 'pen',
        points: [pos],
        color: tool === 'eraser' ? '#fafaf9' : color,
        size: tool === 'eraser' ? size * 6 : size,
      };
    } else if (tool === 'rect') {
      drawingRef.current = { kind: 'rect', x: pos.x, y: pos.y, w: 0, h: 0, color, size };
    } else if (tool === 'arrow') {
      drawingRef.current = {
        kind: 'arrow',
        x1: pos.x,
        y1: pos.y,
        x2: pos.x,
        y2: pos.y,
        color,
        size,
      };
    }
    force((n) => n + 1);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const cur = drawingRef.current;
    if (!cur) return;
    const pos = pointerPos(e);
    if (cur.kind === 'pen') {
      cur.points.push(pos);
    } else if (cur.kind === 'rect') {
      cur.w = pos.x - cur.x;
      cur.h = pos.y - cur.y;
    } else if (cur.kind === 'arrow') {
      cur.x2 = pos.x;
      cur.y2 = pos.y;
    }
    redraw();
  }

  function handlePointerUp() {
    const cur = drawingRef.current;
    drawingRef.current = null;
    if (!cur) return;
    onItemsChange([...items, cur]);
  }

  function handleUndo() {
    onItemsChange(items.slice(0, -1));
  }
  function handleClear() {
    onItemsChange([]);
  }

  return (
    <div className="sketch-editor">
      <div className="sketch-toolbar">
        <ToolBtn cur={tool} v="select" onClick={setTool} title={t('sketch.toolSelect')} label="↖" />
        <ToolBtn cur={tool} v="pen" onClick={setTool} title={t('sketch.toolPen')} label="✎" />
        <ToolBtn cur={tool} v="text" onClick={setTool} title={t('sketch.toolText')} label="T" />
        <ToolBtn cur={tool} v="rect" onClick={setTool} title={t('sketch.toolRect')} label="▭" />
        <ToolBtn cur={tool} v="arrow" onClick={setTool} title={t('sketch.toolArrow')} label="↗" />
        <ToolBtn cur={tool} v="eraser" onClick={setTool} title={t('sketch.toolEraser')} label="◌" />
        <span className="sketch-divider" />
        <input
          type="color"
          className="sketch-color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          title={t('sketch.color')}
        />
        <input
          type="range"
          min={1}
          max={8}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          title={t('sketch.strokeSize')}
          className="sketch-size"
        />
        <span className="sketch-divider" />
        <button className="ghost" onClick={handleUndo} disabled={items.length === 0}>
          {t('sketch.undo')}
        </button>
        <button className="ghost" onClick={handleClear} disabled={items.length === 0}>
          {t('sketch.clear')}
        </button>
        <span className="sketch-spacer" />
        <span className="sketch-name" title={fileName}>
          {fileName}
          {dirty ? ' •' : ''}
        </span>
        {onCancel ? (
          <button className="ghost" onClick={onCancel}>
            {t('sketch.close')}
          </button>
        ) : null}
        <button
          className="primary"
          onClick={() => void onSave()}
          disabled={saving || items.length === 0}
        >
          {saving ? t('sketch.saving') : t('common.save')}
        </button>
      </div>
      <div className="sketch-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  );
}

function ToolBtn({
  cur,
  v,
  onClick,
  label,
  title,
}: {
  cur: Tool;
  v: Tool;
  onClick: (v: Tool) => void;
  label: string;
  title: string;
}) {
  return (
    <button
      className={`sketch-tool ${cur === v ? 'active' : ''}`}
      onClick={() => onClick(v)}
      title={title}
    >
      {label}
    </button>
  );
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#bfbcb6';
  for (let y = 12; y < h; y += 16) {
    for (let x = 12; x < w; x += 16) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, it: SketchItem) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = it.color;
  ctx.fillStyle = it.color;
  ctx.lineWidth = it.size;
  if (it.kind === 'pen') {
    if (it.points.length < 2) return ctx.restore();
    ctx.beginPath();
    ctx.moveTo(it.points[0]!.x, it.points[0]!.y);
    for (let i = 1; i < it.points.length; i++) {
      ctx.lineTo(it.points[i]!.x, it.points[i]!.y);
    }
    ctx.stroke();
  } else if (it.kind === 'rect') {
    ctx.strokeRect(it.x, it.y, it.w, it.h);
  } else if (it.kind === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(it.x1, it.y1);
    ctx.lineTo(it.x2, it.y2);
    ctx.stroke();
    const ang = Math.atan2(it.y2 - it.y1, it.x2 - it.x1);
    const len = 10 + it.size * 2;
    ctx.beginPath();
    ctx.moveTo(it.x2, it.y2);
    ctx.lineTo(it.x2 - len * Math.cos(ang - Math.PI / 6), it.y2 - len * Math.sin(ang - Math.PI / 6));
    ctx.moveTo(it.x2, it.y2);
    ctx.lineTo(it.x2 - len * Math.cos(ang + Math.PI / 6), it.y2 - len * Math.sin(ang + Math.PI / 6));
    ctx.stroke();
  } else if (it.kind === 'text') {
    ctx.font = `${it.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(it.text, it.x, it.y);
  }
  ctx.restore();
}
