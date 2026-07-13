// Liquid Glass — SDF displacement-map refraction for floating surfaces.
//
// Ported from the opendesign skill's liquid-glass.js (itself a port of
// shuding/liquid-glass). For every pixel inside the element a rounded-rect
// signed distance field yields a displacement factor (center = 1 so the
// glass stays see-through, edges pull toward the center like a lens); the
// dx/dy pair is encoded into a canvas's R/G channels and fed to an SVG
// feDisplacementMap that the element references through the `--flt` custom
// property (see `.od-glass-refract--sdf` in styles/material.css).
//
// Refraction requires `backdrop-filter: url(#…)`, which only Chromium
// implements. Detection is UA-based on purpose: Safari parses the url()
// syntax, so `@supports`/`CSS.supports` misreport support there.

export interface LiquidGlassOptions {
  /** Refraction band as a fraction of the short edge. Default 0.42. */
  reach?: number;
  /** Max edge displacement (pull-to-center ratio). Default 0.22; small
   *  elements like buttons read best at 0.18–0.25. */
  strength?: number;
}

export interface LiquidGlassHandle {
  /** Rebuild the displacement map (e.g. after a programmatic resize). */
  update: () => void;
  /** Remove the SVG filter, observer, and the element's --flt binding. */
  destroy: () => void;
}

// Above this many pixels a rebuild stalls the main thread noticeably
// (the SDF loop is O(W×H) plus a toDataURL encode), so oversized surfaces
// keep their previous map instead of rebuilding.
const MAX_MAP_PIXELS = 500_000;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

let filterSeq = 0;

export function supportsSdfRefraction(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  // Capability gates double as a jsdom/test-environment guard.
  if (typeof ResizeObserver !== 'function' || typeof ImageData !== 'function') return false;
  if (typeof window.matchMedia !== 'function') return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
  const isFirefox = /Firefox/.test(ua);
  return !isSafari && !isFirefox;
}

function smoothStep(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return clamped * clamped * (3 - 2 * clamped);
}

function length2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

// Rounded-rectangle signed distance field: 0 = edge, negative = inside.
function roundedRectSDF(x: number, y: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + length2(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function ensureFilterRoot(): SVGSVGElement {
  let root = document.getElementById('lg-filters') as SVGSVGElement | null;
  if (!root) {
    root = document.createElementNS(SVG_NS, 'svg');
    root.id = 'lg-filters';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('style', 'position:absolute;width:0;height:0;pointer-events:none');
    document.body.appendChild(root);
  }
  return root;
}

export function applyLiquidGlass(el: HTMLElement, opts: LiquidGlassOptions = {}): LiquidGlassHandle {
  const reachFrac = opts.reach ?? 0.42;
  const strength = opts.strength ?? 0.22;
  const id = `lg-${++filterSeq}`;
  const root = ensureFilterRoot();

  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const feImage = document.createElementNS(SVG_NS, 'feImage');
  feImage.setAttribute('id', `${id}_map`);
  const feDisp = document.createElementNS(SVG_NS, 'feDisplacementMap');
  feDisp.setAttribute('in', 'SourceGraphic');
  feDisp.setAttribute('in2', `${id}_map`);
  feDisp.setAttribute('xChannelSelector', 'R');
  feDisp.setAttribute('yChannelSelector', 'G');
  filter.appendChild(feImage);
  filter.appendChild(feDisp);
  root.appendChild(filter);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  function build(): void {
    if (!ctx) return;
    const rect = el.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width));
    const H = Math.max(1, Math.round(rect.height));
    if (W * H > MAX_MAP_PIXELS) return;
    let R = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    R = Math.min(R, Math.min(W, H) / 2);
    canvas.width = W;
    canvas.height = H;
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', String(W));
    filter.setAttribute('height', String(H));
    feImage.setAttribute('width', String(W));
    feImage.setAttribute('height', String(H));

    const reach = Math.min(W, H) * reachFrac;
    const data = new Uint8ClampedArray(W * H * 4);
    const raw: number[] = [];
    let maxScale = 0;
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % W;
      const y = Math.floor(i / 4 / W);
      const cx = x - W / 2;
      const cy = y - H / 2;
      const depth = -roundedRectSDF(cx, cy, W / 2, H / 2, R); // positive inside
      const f = 1 - strength + strength * smoothStep(0, reach, depth); // 1 at center
      const dx = cx * f + W / 2 - x;
      const dy = cy * f + H / 2 - y;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      raw.push(dx, dy);
    }
    maxScale = Math.max(maxScale * 0.5, 0.001);
    let k = 0;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = ((raw[k++] ?? 0) / maxScale + 0.5) * 255;
      data[i + 1] = ((raw[k++] ?? 0) / maxScale + 0.5) * 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    ctx.putImageData(new ImageData(data, W, H), 0, 0);
    feImage.setAttributeNS(XLINK_NS, 'href', canvas.toDataURL());
    feDisp.setAttribute('scale', String(maxScale));
  }

  el.style.setProperty('--flt', `url(#${id})`);
  build();

  // Rebuilds are rAF-coalesced: resizes during layout churn (open/close
  // animations) collapse into one map rebuild per frame.
  let frame = 0;
  const ro = new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      build();
    });
  });
  ro.observe(el);

  return {
    update: build,
    destroy: () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      filter.remove();
      el.style.removeProperty('--flt');
    },
  };
}
