// Renders one deck slide as inert DOM inside a shadow root — the lightweight
// replacement for a full-deck `<iframe srcDoc>` thumbnail.
//
// Per thumbnail we attach a shadow root, adopt the deck's stylesheets (shared
// across every thumbnail of the same deck via a WeakMap, so 16 thumbnails cost
// one CSS parse), reconstruct the wrapper chain the slide's selectors expect,
// clone the single slide, and scale a fixed design canvas to fit with a
// ResizeObserver. No scripts execute, no document loads, no deck bridge runs —
// which is what removes the main-thread saturation on deck open and drops the
// deck's own nav overlay (it's never built).
//
// Data comes from `parseDeckThumbnails` (deck-thumbnail-parser.ts). If the
// shadow build throws for a slide, `onError` lets the parent fall back to the
// iframe thumbnail for that item.

import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { DECK_CHROME_HIDE_CSS, DECK_MOTION_FREEZE_CSS } from '../runtime/srcdoc';
import type { ParsedDeckThumbnails } from '../runtime/deck-thumbnail-parser';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Thumbnail-only overrides layered on top of the deck's own CSS:
// - `[data-od-thumb-wrap]`: make every reconstructed wrapper fill the canvas and
//   drop the runtime transform / drop-shadow the deck's own JS would set.
// - `[data-od-thumb-slide]`: pin the single slide to the full canvas and force
//   it visible regardless of the deck's active-slide toggle.
// - `.overlay/.tapzones`: template decks (`deck-stage.js`) name their nav this
//   way — belt-and-suspenders on top of DECK_CHROME_HIDE_CSS.
const THUMB_OVERRIDE_CSS = `[data-od-thumb-wrap]{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;transform:none!important;box-shadow:none!important;visibility:visible!important;opacity:1!important;}
[data-od-thumb-slide]{display:block!important;position:absolute!important;inset:0!important;margin:0!important;visibility:visible!important;opacity:1!important;pointer-events:none!important;}
.overlay,.tapzones{display:none!important;visibility:hidden!important;pointer-events:none!important;}`;

interface DeckCssEntry {
  css: string;
  sheet: CSSStyleSheet | null;
}

// One processed-CSS string + one constructable stylesheet per deck source
// (keyed by the parsed object's identity, which changes only when the source
// changes). Shared by every thumbnail of that deck.
const deckCssCache = new WeakMap<ParsedDeckThumbnails, DeckCssEntry>();
// Decks whose fonts have already been injected into the host document head.
const injectedDeckFonts = new WeakSet<ParsedDeckThumbnails>();

function getDeckCss(parsed: ParsedDeckThumbnails): DeckCssEntry {
  let entry = deckCssCache.get(parsed);
  if (!entry) {
    const css = `${parsed.styleText}\n${THUMB_OVERRIDE_CSS}\n${DECK_CHROME_HIDE_CSS}\n${DECK_MOTION_FREEZE_CSS}`;
    let sheet: CSSStyleSheet | null = null;
    try {
      if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
      }
    } catch {
      sheet = null;
    }
    entry = { css, sheet };
    deckCssCache.set(parsed, entry);
  }
  return entry;
}

// `@font-face` is ignored inside a shadow root and external font stylesheets
// are document-scoped, so both must live in the host document. Injected once
// per deck; if the host CSP blocks a font link the browser silently uses the
// deck's fallback stack (thumbnails stay legible).
function ensureDeckFonts(parsed: ParsedDeckThumbnails): void {
  if (typeof document === 'undefined') return;
  if (injectedDeckFonts.has(parsed)) return;
  injectedDeckFonts.add(parsed);
  const head = document.head;
  if (!head) return;
  if (parsed.fontFaces.trim()) {
    const style = document.createElement('style');
    style.setAttribute('data-od-deck-fonts', '');
    style.textContent = parsed.fontFaces;
    head.appendChild(style);
  }
  for (const href of parsed.fontLinks) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(href) : href;
    const selector = `link[data-od-deck-font][href="${escaped}"]`;
    if (head.querySelector(selector)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-od-deck-font', '');
    head.appendChild(link);
  }
}

export interface DeckSlideThumbnailProps {
  parsed: ParsedDeckThumbnails;
  index: number;
  /** Called if the shadow build fails, so the parent can render the iframe. */
  onError?: () => void;
  /** Called once the thumbnail has a non-zero viewport and has been scaled. */
  onReady?: () => void;
}

export const DeckSlideThumbnail = memo(function DeckSlideThumbnail({
  parsed,
  index,
  onError,
  onReady,
}: DeckSlideThumbnailProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cleanup: (() => void) | undefined;
    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      onReady?.();
    };
    try {
      ensureDeckFonts(parsed);
      const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      root.replaceChildren();

      const { css, sheet } = getDeckCss(parsed);
      let adopted = false;
      if (sheet && 'adoptedStyleSheets' in root) {
        try {
          (root as ShadowRoot).adoptedStyleSheets = [sheet];
          adopted = true;
        } catch {
          adopted = false;
        }
      }
      if (!adopted) {
        const styleEl = document.createElement('style');
        styleEl.textContent = css;
        root.appendChild(styleEl);
      }

      const canvas = document.createElement('div');
      canvas.className = 'od-thumb-canvas';
      canvas.style.cssText =
        `position:absolute;top:0;left:0;transform-origin:top left;overflow:hidden;` +
        `width:${parsed.designWidth}px;height:${parsed.designHeight}px;`;

      let mountPoint: HTMLElement = canvas;
      for (const ancestor of parsed.ancestors) {
        const el = document.createElement(ancestor.tag);
        for (const [name, value] of ancestor.attributes) {
          try {
            el.setAttribute(name, value);
          } catch {
            // Ignore invalid attribute names carried over from the source.
          }
        }
        el.setAttribute('data-od-thumb-wrap', '');
        mountPoint.appendChild(el);
        mountPoint = el;
      }

      const template = document.createElement('template');
      template.innerHTML = parsed.slides[index] ?? '';
      const slide = template.content.firstElementChild as HTMLElement | null;
      if (!slide) throw new Error('deck thumbnail: empty slide markup');
      // Inert already (parsed via <template>), but drop scripts defensively.
      slide.querySelectorAll('script').forEach((s) => s.remove());
      slide.classList.add('active', 'is-active', 'current', 'visible');
      slide.setAttribute('data-od-deck-active', '');
      slide.setAttribute('data-od-thumb-slide', '');
      slide.removeAttribute('hidden');
      slide.setAttribute('aria-hidden', 'false');
      mountPoint.appendChild(slide);
      root.appendChild(canvas);

      const apply = () => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (!w || !h) return;
        const scale = Math.min(w / parsed.designWidth, h / parsed.designHeight);
        canvas.style.transform = `scale(${scale})`;
        canvas.style.left = `${(w - parsed.designWidth * scale) / 2}px`;
        canvas.style.top = `${(h - parsed.designHeight * scale) / 2}px`;
        markReady();
      };
      apply();

      let frameOne = 0;
      let frameTwo = 0;
      if (typeof requestAnimationFrame !== 'undefined') {
        frameOne = requestAnimationFrame(() => {
          apply();
          frameTwo = requestAnimationFrame(apply);
        });
      }

      let observer: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(apply);
        observer.observe(host);
      }
      cleanup = () => {
        observer?.disconnect();
        if (frameOne) cancelAnimationFrame(frameOne);
        if (frameTwo) cancelAnimationFrame(frameTwo);
      };
    } catch {
      onError?.();
    }
    return () => cleanup?.();
  }, [parsed, index, onError, onReady]);

  return <div ref={hostRef} className="deck-thumbnail-shadow-host" aria-hidden="true" />;
});
