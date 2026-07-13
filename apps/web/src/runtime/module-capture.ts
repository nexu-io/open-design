import { requestPreviewSnapshotResult } from './exports';

/**
 * Module capture: the "double-Command" screenshot of the design-file module
 * the user is pointing at.
 *
 * The preview iframes are sandboxed without allow-same-origin, so the host
 * cannot read their DOM. The snapshot bridges (srcDoc: apps/web/src/runtime/
 * srcdoc.ts; URL-load: the daemon's URL_PREVIEW_SNAPSHOT_BRIDGE) answer
 * `od:module-rect` with the pointed module's identity + geometry; the host
 * then requests a normal `od:snapshot` and crops the returned bitmap here,
 * so both render modes share one capture pipeline.
 */

export interface PreviewModuleRectInfo {
  /** data-od-id / data-screen-label of the resolved module, when one was hit. */
  elementId?: string;
  /** Short human label ("section.hero"), mirrors the selection bridge's shape. */
  label?: string;
  /** Module rect in iframe viewport CSS px (getBoundingClientRect). */
  rect?: { x: number; y: number; width: number; height: number };
  dpr: number;
  viewport: { w: number; h: number };
  doc: { w: number; h: number };
  scroll: { x: number; y: number };
}

export interface PreviewModuleSnapshot {
  dataUrl: string;
  w: number;
  h: number;
  elementId?: string;
  label?: string;
  /** Viewport-space rect of the captured module (CSS px), when resolved. */
  rect?: { x: number; y: number; width: number; height: number };
}

export function requestPreviewModuleRect(
  iframe: HTMLIFrameElement,
  timeout = 5000,
): Promise<PreviewModuleRectInfo | null> {
  const win = iframe.contentWindow;
  if (!win) return Promise.resolve(null);
  const id = `module-rect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: PreviewModuleRectInfo | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      resolve(value);
    };
    function onMsg(ev: MessageEvent) {
      if (ev.source !== win) return;
      const d = ev.data as ({ type?: string; id?: string } & Partial<PreviewModuleRectInfo>) | null;
      if (!d || d.type !== 'od:module-rect:result' || d.id !== id) return;
      if (!d.viewport || !d.doc || !d.scroll) {
        finish(null);
        return;
      }
      finish({
        elementId: typeof d.elementId === 'string' && d.elementId ? d.elementId : undefined,
        label: typeof d.label === 'string' && d.label ? d.label : undefined,
        rect: d.rect && [d.rect.x, d.rect.y, d.rect.width, d.rect.height].every(Number.isFinite)
          ? d.rect
          : undefined,
        dpr: Number.isFinite(d.dpr) && (d.dpr as number) > 0 ? (d.dpr as number) : 1,
        viewport: d.viewport,
        doc: d.doc,
        scroll: d.scroll,
      });
    }
    window.addEventListener('message', onMsg);
    try {
      win.postMessage({ type: 'od:module-rect', id }, '*');
    } catch {
      finish(null);
      return;
    }
    setTimeout(() => finish(null), timeout);
  });
}

/**
 * Source crop rect in snapshot-bitmap pixels for a module rect.
 *
 * The snapshot may be a full-document raster (srcDoc bridge honors
 * `full: true`) or just the viewport (URL-load bridge). The bitmap itself
 * does not say which, so classify by which interpretation better explains
 * the bitmap height, then map the viewport-space module rect accordingly.
 * Returns null when the module does not intersect the captured area.
 */
export function resolveModuleCropRect(
  snap: { w: number; h: number },
  info: PreviewModuleRectInfo,
): { x: number; y: number; width: number; height: number } | null {
  const rect = info.rect;
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const fullDocError = Math.abs(snap.h - info.doc.h * info.dpr);
  const viewportError = Math.abs(snap.h - info.viewport.h * info.dpr);
  const isFullDoc = info.doc.h > info.viewport.h && fullDocError < viewportError;
  const cssWidth = isFullDoc ? info.doc.w : info.viewport.w;
  const cssHeight = isFullDoc ? info.doc.h : info.viewport.h;
  const scaleX = snap.w / Math.max(1, cssWidth);
  const scaleY = snap.h / Math.max(1, cssHeight);
  const x = (rect.x + (isFullDoc ? info.scroll.x : 0)) * scaleX;
  const y = (rect.y + (isFullDoc ? info.scroll.y : 0)) * scaleY;
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(snap.w, Math.ceil(x + rect.width * scaleX));
  const bottom = Math.min(snap.h, Math.ceil(y + rect.height * scaleY));
  if (right - left < 4 || bottom - top < 4) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function cropDataUrl(
  dataUrl: string,
  crop: { x: number; y: number; width: number; height: number },
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = crop.width;
        canvas.height = crop.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Capture the module the user is pointing at inside the preview iframe.
 * Falls back to the whole snapshot when no module resolves (empty designs,
 * bridge missing the responder) so the hotkey still yields a useful image.
 */
export async function capturePreviewModuleSnapshot(
  iframe: HTMLIFrameElement,
): Promise<PreviewModuleSnapshot | null> {
  const info = await requestPreviewModuleRect(iframe);
  if (!info) return null;
  // Generous window: on a cold dev server the page's main thread can stall
  // for many seconds mid-hydration, delaying both the raster and the reply.
  const result = await requestPreviewSnapshotResult(iframe, 20000, { full: Boolean(info.rect) });
  if (!result.ok) return null;
  const snap = result.snapshot;
  const crop = resolveModuleCropRect({ w: snap.w, h: snap.h }, info);
  if (!crop) {
    return { dataUrl: snap.dataUrl, w: snap.w, h: snap.h };
  }
  const cropped = await cropDataUrl(snap.dataUrl, crop);
  if (!cropped) {
    return { dataUrl: snap.dataUrl, w: snap.w, h: snap.h };
  }
  return {
    dataUrl: cropped,
    w: crop.width,
    h: crop.height,
    elementId: info.elementId,
    label: info.label,
    rect: info.rect,
  };
}

/**
 * Registry connecting the composer's double-Command hotkey to whichever
 * design-file preview is currently mounted. Providers return true when they
 * staged a capture; false lets the composer fall back (desktop host page
 * screenshot). Last registered wins so the most recently opened viewer
 * answers first.
 */
type PreviewModuleCaptureProvider = () => Promise<boolean>;

const moduleCaptureProviders: PreviewModuleCaptureProvider[] = [];

export function registerPreviewModuleCaptureProvider(
  provider: PreviewModuleCaptureProvider,
): () => void {
  moduleCaptureProviders.push(provider);
  return () => {
    const index = moduleCaptureProviders.indexOf(provider);
    if (index >= 0) moduleCaptureProviders.splice(index, 1);
  };
}

export async function requestPreviewModuleCapture(): Promise<boolean> {
  for (let i = moduleCaptureProviders.length - 1; i >= 0; i--) {
    const provider = moduleCaptureProviders[i]!;
    try {
      if (await provider()) return true;
    } catch {
      // A broken provider must not block the fallback chain.
    }
  }
  return false;
}
