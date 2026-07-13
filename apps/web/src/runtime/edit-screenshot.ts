import type { PreviewSnapshot } from './exports';

/**
 * Manual-edit-mode workspace screenshot: capture everything the user sees in
 * the preview module — the previewed page, the in-iframe edit guides and
 * spacing measurements, and the host-DOM overlays (floating inspector panel,
 * hover affordance) — for staging into the chat composer.
 *
 * The preview iframes are sandboxed without allow-same-origin, so the host
 * cannot read their DOM. On desktop the compositor capture already returns
 * the fully composited pixels; on pure web the caller combines the iframe's
 * `od:snapshot` bitmap (which includes the guides layer, since the bridge
 * draws it inside the iframe document) with host-side rasterizations of the
 * overlay elements, composited here.
 */

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GuidesRestoreResult {
  /** Guides were re-rendered and are on screen for the capture. */
  restored: boolean;
  /** The guides belong to a still-active hover (keyboard-triggered capture):
   *  the host must NOT clear them afterwards or they'd vanish under the
   *  user's stationary cursor. */
  live: boolean;
}

/**
 * Ask the edit bridge to re-render the hover guides the user was looking at
 * before the cursor left the canvas (od-edit-guides-restore). When
 * `restored && !live`, the capture flow owes a post-capture
 * `od-edit-hover-reset` to clear them again.
 */
export function requestManualEditGuidesRestore(
  iframe: HTMLIFrameElement | null,
  opts?: { maxAgeMs?: number; timeoutMs?: number },
): Promise<GuidesRestoreResult> {
  const win = iframe?.contentWindow;
  if (!win) return Promise.resolve({ restored: false, live: false });
  const id = `guides-restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timeoutMs = opts?.timeoutMs ?? 600;
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: GuidesRestoreResult) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      resolve(value);
    };
    function onMsg(ev: MessageEvent) {
      if (ev.source !== win) return;
      const d = ev.data as {
        type?: string;
        id?: string | null;
        restored?: boolean;
        live?: boolean;
      } | null;
      if (!d || d.type !== 'od-edit-guides-restore:result' || d.id !== id) return;
      finish({ restored: Boolean(d.restored), live: Boolean(d.live) });
    }
    window.addEventListener('message', onMsg);
    try {
      win.postMessage({ type: 'od-edit-guides-restore', id, maxAgeMs: opts?.maxAgeMs ?? 0 }, '*');
    } catch {
      finish({ restored: false, live: false });
      return;
    }
    setTimeout(() => finish({ restored: false, live: false }), timeoutMs);
  });
}

/**
 * Pure layout math for the web-path composite: the final canvas covers the
 * workspace rect at device resolution, and every layer lands at its
 * getBoundingClientRect offset by the workspace origin (rects already bake in
 * the preview scale shell's transform, so no explicit scale factor appears).
 */
export function computeWorkspaceCompositeLayout(input: {
  workspaceRect: RectLike;
  iframeRect: RectLike;
  overlays: Array<{ rect: RectLike }>;
  dpr: number;
}): {
  canvasWidth: number;
  canvasHeight: number;
  iframeDest: RectLike;
  overlayDests: RectLike[];
} {
  const dpr = Number.isFinite(input.dpr) && input.dpr > 0 ? input.dpr : 1;
  const offset = (rect: RectLike): RectLike => ({
    left: rect.left - input.workspaceRect.left,
    top: rect.top - input.workspaceRect.top,
    width: rect.width,
    height: rect.height,
  });
  return {
    canvasWidth: Math.max(1, Math.round(input.workspaceRect.width * dpr)),
    canvasHeight: Math.max(1, Math.round(input.workspaceRect.height * dpr)),
    iframeDest: offset(input.iframeRect),
    overlayDests: input.overlays.map((overlay) => offset(overlay.rect)),
  };
}

// Style subset inlined onto the clone. Mirrors SNAPSHOT_STYLE_PROPS in the
// srcDoc snapshot bridge (apps/web/src/runtime/srcdoc.ts) — that list lives
// inside an injected script string and cannot be imported.
const HOST_SNAPSHOT_STYLE_PROPS = [
  'display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius',
  'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'color', 'background-color', 'opacity', 'transform', 'transform-origin', 'overflow', 'overflow-x', 'overflow-y',
  'white-space', 'text-align', 'vertical-align', 'object-fit', 'object-position',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'grid', 'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'gap', 'row-gap', 'column-gap', 'align-items', 'align-content', 'align-self',
  'justify-items', 'justify-content', 'justify-self', 'inset', 'top', 'right', 'bottom', 'left',
  'z-index', 'box-shadow', 'text-shadow',
];

function copyComputedStyle(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source);
  let style = target.getAttribute('style') || '';
  for (const prop of HOST_SNAPSHOT_STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (value) style += `${prop}:${value};`;
  }
  target.setAttribute('style', style);
}

/** Same-origin <img> → data URL so the SVG-as-<img> document (which cannot
 *  fetch) still paints it. Cross-origin images taint the canvas — skipped. */
function inlineImageSource(img: HTMLImageElement): string | null {
  if (!img.complete || !img.naturalWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Live form/media state does not survive cloneNode — sync it explicitly so
 *  the inspector panel (mostly inputs/selects) doesn't rasterize empty. */
function syncElementState(source: Element, target: Element): void {
  const tag = source.tagName.toLowerCase();
  if (tag === 'img') {
    const img = source as HTMLImageElement;
    const inlined = inlineImageSource(img);
    if (inlined) target.setAttribute('src', inlined);
    else if (img.currentSrc) target.setAttribute('src', img.currentSrc);
  } else if (tag === 'input') {
    const input = source as HTMLInputElement;
    target.setAttribute('value', input.value || '');
    if (input.checked) target.setAttribute('checked', '');
    else target.removeAttribute('checked');
  } else if (tag === 'textarea') {
    target.textContent = (source as HTMLTextAreaElement).value || '';
  } else if (tag === 'select') {
    const selectedIndex = (source as HTMLSelectElement).selectedIndex;
    const options = target.querySelectorAll('option');
    options.forEach((option, index) => {
      if (index === selectedIndex) option.setAttribute('selected', '');
      else option.removeAttribute('selected');
    });
  } else if (tag === 'canvas') {
    try {
      const img = document.createElement('img');
      img.setAttribute('src', (source as HTMLCanvasElement).toDataURL('image/png'));
      img.setAttribute('style', target.getAttribute('style') || '');
      target.parentNode?.replaceChild(img, target);
    } catch {
      /* tainted canvas — leave the blank element */
    }
  }
}

function isTransparentColor(color: string): boolean {
  return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

/** Nearest non-transparent ancestor background: backdrop-filter surfaces do
 *  not rasterize, so the overlay gets an opaque stand-in behind it. */
export function resolveOpaqueBackground(el: Element | null): string {
  let node: Element | null = el;
  while (node) {
    try {
      const bg = window.getComputedStyle(node).backgroundColor;
      if (!isTransparentColor(bg)) return bg;
    } catch {
      break;
    }
    node = node.parentElement;
  }
  return '#ffffff';
}

/**
 * Build the SVG-foreignObject document for a same-origin host element.
 * Exported separately from the rasterizer so tests can assert on the markup
 * (value sync, script stripping) without a canvas implementation.
 */
export function buildHostElementSvg(
  el: HTMLElement,
): { svg: string; width: number; height: number; background: string } | null {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  const clone = el.cloneNode(true) as HTMLElement;
  copyComputedStyle(el, clone);
  syncElementState(el, clone);
  const originals = el.querySelectorAll('*');
  const clones = clone.querySelectorAll('*');
  const count = Math.min(originals.length, clones.length, 3500);
  for (let i = 0; i < count; i++) {
    copyComputedStyle(originals[i]!, clones[i]!);
    syncElementState(originals[i]!, clones[i]!);
  }
  clone.querySelectorAll('script').forEach((node) => node.remove());
  clone
    .querySelectorAll('link[rel~="stylesheet"], link[rel~="preload"], link[rel~="preconnect"]')
    .forEach((node) => node.remove());
  clone.querySelectorAll('style').forEach((styleEl) => {
    styleEl.textContent = (styleEl.textContent || '')
      .replace(/@import[^;]+;/gi, '')
      .replace(/@font-face\s*\{[^}]*\}/gi, '');
  });
  const background = resolveOpaqueBackground(el);
  // The element's own positioning (absolute + inset) must not re-apply inside
  // the wrapper — the wrapper IS its box.
  clone.setAttribute(
    'style',
    `${clone.getAttribute('style') || ''}position:static;inset:auto;margin:0;transform:none;`,
  );
  const wrapper = document.createElement('div');
  wrapper.setAttribute(
    'style',
    `position:relative;width:${width}px;height:${height}px;overflow:hidden;background-color:${background};`,
  );
  wrapper.appendChild(clone);
  // XMLSerializer emits well-formed XML (self-closed void elements), which the
  // strict data:image/svg+xml parser requires — outerHTML would not.
  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject></svg>`;
  return { svg, width, height, background };
}

/** Rasterize a same-origin host DOM element to an offscreen canvas. */
export function rasterizeHostElement(
  el: HTMLElement,
  opts?: { dpr?: number },
): Promise<HTMLCanvasElement | null> {
  const built = buildHostElementSvg(el);
  if (!built) return Promise.resolve(null);
  const dpr = opts?.dpr && opts.dpr > 0 ? opts.dpr : window.devicePixelRatio || 1;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(built.width * dpr));
        canvas.height = Math.max(1, Math.floor(built.height * dpr));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.scale(dpr, dpr);
        ctx.fillStyle = built.background;
        ctx.fillRect(0, 0, built.width, built.height);
        ctx.drawImage(img, 0, 0, built.width, built.height);
        resolve(canvas);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.svg)}`;
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Web-path composite: iframe snapshot (already containing the in-iframe
 * guides layer) as the background, host overlays rasterized on top, all in
 * workspace coordinates. Overlay rasterization is best-effort — a failed
 * overlay never sinks the capture.
 */
export async function compositeManualEditWorkspace(opts: {
  workspaceEl: HTMLElement;
  iframeEl: HTMLIFrameElement;
  iframeSnapshot: PreviewSnapshot;
  overlaySelector?: string;
}): Promise<PreviewSnapshot | null> {
  const wsRect = opts.workspaceEl.getBoundingClientRect();
  if (wsRect.width < 1 || wsRect.height < 1) return null;
  const ifRect = opts.iframeEl.getBoundingClientRect();
  const selector = opts.overlaySelector ?? '.manual-edit-right, .manual-edit-hover-action';
  const overlayEls = Array.from(opts.workspaceEl.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => {
      const rect = el.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    },
  );
  const dpr = window.devicePixelRatio || 1;
  const rectLike = (rect: DOMRect): RectLike => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  });
  const layout = computeWorkspaceCompositeLayout({
    workspaceRect: rectLike(wsRect),
    iframeRect: rectLike(ifRect),
    overlays: overlayEls.map((el) => ({ rect: rectLike(el.getBoundingClientRect()) })),
    dpr,
  });
  const background = await loadImage(opts.iframeSnapshot.dataUrl);
  if (!background) return null;
  const canvas = document.createElement('canvas');
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = resolveOpaqueBackground(opts.workspaceEl);
  ctx.fillRect(0, 0, wsRect.width, wsRect.height);
  ctx.drawImage(
    background,
    0,
    0,
    background.naturalWidth,
    background.naturalHeight,
    layout.iframeDest.left,
    layout.iframeDest.top,
    layout.iframeDest.width,
    layout.iframeDest.height,
  );
  for (let i = 0; i < overlayEls.length; i++) {
    const raster = await rasterizeHostElement(overlayEls[i]!, { dpr });
    if (!raster) continue;
    const dest = layout.overlayDests[i]!;
    ctx.drawImage(raster, dest.left, dest.top, dest.width, dest.height);
  }
  try {
    return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}
