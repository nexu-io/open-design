// Open Design web clipper page-capture runtime.
//
// Injected on demand by the service worker via
// `chrome.scripting.executeScript({ files: ['capture.js'] })`. It runs in the
// page (the extension's isolated content-script world — full DOM + layout
// access) and exposes two entry points:
//
//   • `window.__odCapture(opts)` — full-page snapshot (the two artifacts below).
//   • `window.__odCaptureElement(opts)` — a single picked element captured as a
//     self-contained `html` snapshot: the page's CSS is kept so the element's
//     cascade resolves, but the DOM is pruned to just the element (and its
//     ancestor chain), so opening the saved file shows that one element styled
//     as it was on the page. One HTML file, easy to share/distribute.
//
// The full-page pass produces, in ONE go, two artifacts:
//
//   1. `html`  — a self-contained, high-fidelity snapshot of the page:
//                readable stylesheets inlined, scripts stripped, every URL
//                absolutized, and a `<base>` injected. Cross-origin image /
//                background URLs are left absolute in the string; the worker
//                rewrites them to data URIs afterwards (only the worker can
//                fetch cross-origin without CORS).
//
//   2. `figmaIr` — the OD Figma capture IR (a JSON node-tree of FRAME / TEXT /
//                RECTANGLE nodes with absolute geometry, fills, strokes,
//                corner radii, shadows and fonts). See `figma-plugin/IR.md`.
//                Image fills carry a `url` placeholder the worker swaps for a
//                data URI.
//
// `resources` is the deduped list of absolute http(s) URLs both outputs depend
// on, so the worker fetches each one only once.
//
// Self-contained, dependency-free, never throws into the caller (the worker
// wraps it best-effort).

(function () {
  if (window.__odCapture) return; // idempotent across repeated injections

  const IR_VERSION = 1;
  const MAX_NODES = 6000; // safety cap on IR size; logged when hit
  const MAX_RESOURCES = 300;

  // --- small utilities -----------------------------------------------------

  function absUrl(url, base) {
    if (!url) return url;
    try {
      return new URL(url, base || document.baseURI).href;
    } catch {
      return url;
    }
  }

  function isHttp(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  }

  // Rewrite every `url(...)` inside a CSS string to an absolute URL resolved
  // against `base` (the stylesheet's own href, so relative asset paths work).
  function absolutizeCss(cssText, base) {
    return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, ref) => {
      if (/^(data:|blob:|#)/i.test(ref)) return m;
      return `url(${q}${absUrl(ref, base)}${q})`;
    });
  }

  // Collect absolute http(s) url()s out of a CSS string into `sink`.
  function collectCssUrls(cssText, sink) {
    const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    let m;
    while ((m = re.exec(cssText))) {
      if (isHttp(m[1])) sink.add(m[1]);
    }
  }

  function absolutizeSrcset(srcset) {
    return srcset
      .split(',')
      .map((part) => {
        const seg = part.trim();
        if (!seg) return '';
        const sp = seg.indexOf(' ');
        const url = sp === -1 ? seg : seg.slice(0, sp);
        const desc = sp === -1 ? '' : seg.slice(sp);
        return `${absUrl(url)}${desc}`;
      })
      .filter(Boolean)
      .join(', ');
  }

  // --- self-contained HTML -------------------------------------------------

  // Clone <html>, strip the bits a saved snapshot must never carry (live
  // scripts, our own on-page UI, the page's <base>). Shared by the full-page
  // and single-element capture paths.
  function cloneDocument() {
    const clone = document.documentElement.cloneNode(true);
    // Strip scripts (the Library renders snapshots sandboxed; live JS only
    // mutates the DOM after load and would never run there anyway).
    clone.querySelectorAll('script, noscript').forEach((n) => n.remove());
    // Never serialize our own injected on-page UI (toolbar / toast / pickers).
    clone.querySelectorAll('[id^="od-clipper-"]').forEach((n) => n.remove());
    // Drop any existing <base>; we inject our own from the live baseURI.
    clone.querySelectorAll('base').forEach((n) => n.remove());
    return clone;
  }

  // Inline readable stylesheets in place of their <link>, and absolutize the
  // page's inline <style> blocks. Live <link rel=stylesheet> elements map 1:1
  // (document order) to those in the clone, so this must run BEFORE any pruning
  // that could shift that alignment. `collectImageUrls` controls whether the
  // stylesheets' `url()` assets are queued for inlining: a full-page capture
  // wants them, but a single-element clip leaves page-wide CSS imagery as live
  // URLs (resolved against <base>) so a small element doesn't drag in the whole
  // site's background art.
  function inlineStylesheets(clone, resources, collectImageUrls) {
    const liveLinks = Array.from(document.querySelectorAll('link[rel~="stylesheet"]'));
    const cloneLinks = Array.from(clone.querySelectorAll('link[rel~="stylesheet"]'));
    liveLinks.forEach((live, i) => {
      const target = cloneLinks[i];
      if (!target) return;
      let cssText = null;
      const base = live.href || document.baseURI;
      try {
        const rules = live.sheet && live.sheet.cssRules;
        if (rules) cssText = Array.from(rules).map((r) => r.cssText).join('\n');
      } catch {
        cssText = null; // cross-origin / opaque — leave the <link>, absolutize below
      }
      if (cssText != null) {
        const style = document.createElement('style');
        style.setAttribute('data-od-inlined', '');
        const css = absolutizeCss(cssText, base);
        if (collectImageUrls) collectCssUrls(css, resources);
        style.textContent = css;
        target.replaceWith(style);
      } else if (target.getAttribute('href')) {
        target.setAttribute('href', absUrl(target.getAttribute('href')));
      }
    });

    // Inline <style> elements that the CSSOM exposes but that contain relative
    // url()s — absolutize them and (optionally) harvest their resources.
    clone.querySelectorAll('style:not([data-od-inlined])').forEach((style) => {
      if (!style.textContent) return;
      const css = absolutizeCss(style.textContent, document.baseURI);
      if (collectImageUrls) collectCssUrls(css, resources);
      style.textContent = css;
    });
  }

  // Absolutize element URLs + inline-style url()s on the (possibly pruned) clone,
  // and harvest the image refs that elements carry in their own markup (<img>
  // src and inline `style` background-image). These belong to whatever subtree
  // survives, so they are inlined for both capture paths.
  function absolutizeUrls(clone, resources, includeImages) {
    clone.querySelectorAll('*').forEach((el) => {
      for (const attr of ['src', 'href', 'poster']) {
        const v = el.getAttribute && el.getAttribute(attr);
        if (v && !/^(data:|blob:|#|javascript:)/i.test(v)) {
          const abs = absUrl(v);
          el.setAttribute(attr, abs);
          if (includeImages && el.tagName === 'IMG' && attr === 'src' && isHttp(abs)) {
            resources.add(abs);
          }
        }
      }
      const srcset = el.getAttribute && el.getAttribute('srcset');
      if (srcset) el.setAttribute('srcset', absolutizeSrcset(srcset));
      const inlineStyle = el.getAttribute && el.getAttribute('style');
      if (inlineStyle && inlineStyle.includes('url(')) {
        const css = absolutizeCss(inlineStyle, document.baseURI);
        if (includeImages) collectCssUrls(css, resources);
        el.setAttribute('style', css);
      }
    });
  }

  // Inject <base> so any URL we didn't rewrite still resolves against the live
  // page, then serialize with a doctype.
  function serializeClone(clone) {
    const head = clone.querySelector('head') || clone;
    const base = document.createElement('base');
    base.setAttribute('href', document.baseURI);
    head.insertBefore(base, head.firstChild);

    const doctype = document.doctype
      ? `<!DOCTYPE ${document.doctype.name}>`
      : '<!DOCTYPE html>';
    return `${doctype}\n${clone.outerHTML}`;
  }

  function buildHtml(resources, includeImages) {
    const clone = cloneDocument();
    inlineStylesheets(clone, resources, includeImages);
    absolutizeUrls(clone, resources, includeImages);
    return serializeClone(clone);
  }

  // --- single-element capture ----------------------------------------------
  //
  // Walk up from the marked element, deleting every off-path sibling so only
  // the chain <html> → … → target (and the target's own subtree) survives.
  // <head> is preserved at the documentElement level so the inlined stylesheets
  // — and the cascade/inheritance the element depends on — stay intact. The
  // result is a self-contained HTML document of just the picked element, styled
  // exactly as it sat on the page.
  function pruneToElementPath(root, target) {
    let node = target;
    while (node && node.parentNode && node !== root) {
      const parent = node.parentNode;
      for (const sib of Array.from(parent.childNodes)) {
        if (sib === node) continue;
        if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === 'HEAD') continue;
        parent.removeChild(sib);
      }
      node = parent;
    }
  }

  function buildElementHtml(marker, resources, includeImages) {
    const clone = cloneDocument();
    // Full page CSS is kept (so the element's cascade resolves) but its url()
    // assets are NOT queued — only the element's own markup imagery is inlined.
    inlineStylesheets(clone, resources, false);
    const target = clone.querySelector(`[${marker}]`);
    if (target) {
      pruneToElementPath(clone, target);
      target.removeAttribute(marker);
    }
    absolutizeUrls(clone, resources, includeImages);
    return serializeClone(clone);
  }

  // --- Figma IR ------------------------------------------------------------

  function parseColor(str) {
    if (!str) return null;
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(str);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    return {
      r: Math.min(1, Number(m[1]) / 255),
      g: Math.min(1, Number(m[2]) / 255),
      b: Math.min(1, Number(m[3]) / 255),
      a: Number.isFinite(a) ? a : 1,
    };
  }

  function solidFill(color) {
    if (!color || color.a === 0) return null;
    return { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
  }

  function px(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function uniformRadius(s) {
    const tl = px(s.borderTopLeftRadius);
    const tr = px(s.borderTopRightRadius);
    const br = px(s.borderBottomRightRadius);
    const bl = px(s.borderBottomLeftRadius);
    if (tl === tr && tr === br && br === bl) return tl;
    return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
  }

  function borderStroke(s) {
    const w = px(s.borderTopWidth);
    if (!w || s.borderTopStyle === 'none' || s.borderTopStyle === 'hidden') return null;
    const color = parseColor(s.borderTopColor);
    const fill = solidFill(color);
    if (!fill) return null;
    // Only emit when all four edges roughly match (the common card/box case).
    const uniform =
      s.borderTopWidth === s.borderRightWidth &&
      s.borderRightWidth === s.borderBottomWidth &&
      s.borderBottomWidth === s.borderLeftWidth;
    if (!uniform) return null;
    return { stroke: fill, weight: w };
  }

  // Best-effort parse of the first (outer) box-shadow into a DROP_SHADOW.
  function parseShadow(boxShadow) {
    if (!boxShadow || boxShadow === 'none') return null;
    const first = boxShadow.split(/,(?![^(]*\))/)[0].trim();
    if (/\binset\b/.test(first)) return null; // inner shadows skipped for now
    const colorMatch = /rgba?\([^)]+\)|#[0-9a-f]{3,8}/i.exec(first);
    const color = parseColor(colorMatch ? colorMatch[0] : '');
    const nums = (first.replace(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i, '').match(/-?[\d.]+px/g) || []).map(px);
    if (!color || nums.length < 2) return null;
    return {
      type: 'DROP_SHADOW',
      color: { r: color.r, g: color.g, b: color.b, a: color.a },
      offset: { x: nums[0] || 0, y: nums[1] || 0 },
      radius: nums[2] || 0,
      spread: nums[3] || 0,
    };
  }

  function fontStyleName(weight, italic) {
    const w = Number(weight) || 400;
    const name =
      w <= 100 ? 'Thin'
      : w <= 200 ? 'ExtraLight'
      : w <= 300 ? 'Light'
      : w <= 400 ? 'Regular'
      : w <= 500 ? 'Medium'
      : w <= 600 ? 'SemiBold'
      : w <= 700 ? 'Bold'
      : w <= 800 ? 'ExtraBold'
      : 'Black';
    if (italic) return name === 'Regular' ? 'Italic' : `${name} Italic`;
    return name;
  }

  function firstFamily(fontFamily) {
    return (fontFamily || 'Inter').split(',')[0].replace(/["']/g, '').trim() || 'Inter';
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'TITLE', 'BR', 'svg', 'SVG']);

  function isVisible(el, s) {
    if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false;
    if (Number(s.opacity) === 0) return false;
    return true;
  }

  // Rect of a single text node via Range, in absolute document coords.
  function textRect(node) {
    try {
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      return r;
    } catch {
      return null;
    }
  }

  function buildFigmaIr(resources, includeImages) {
    const sx = window.scrollX || 0;
    const sy = window.scrollY || 0;
    const fonts = new Map(); // family -> Set(styles)
    let nodeCount = 0;
    let truncated = false;

    function noteFont(family, style) {
      if (!fonts.has(family)) fonts.set(family, new Set());
      fonts.get(family).add(style);
    }

    function elementNode(el) {
      if (nodeCount >= MAX_NODES) {
        truncated = true;
        return null;
      }
      if (el.id && el.id.startsWith('od-clipper-')) return null; // skip our own UI
      const s = getComputedStyle(el);
      if (!isVisible(el, s)) return null;
      const rect = el.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) return null;

      nodeCount += 1;
      const node = {
        type: 'FRAME',
        name: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
        x: rect.left + sx,
        y: rect.top + sy,
        width,
        height,
      };

      const fills = [];
      // Background image (first url) → image fill; else background color.
      const bgImage = s.backgroundImage;
      let imageUrl = null;
      if (includeImages && bgImage && bgImage !== 'none') {
        const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(bgImage);
        if (m && isHttp(m[1])) imageUrl = absUrl(m[1]);
      }
      if (el.tagName === 'IMG' && includeImages) {
        const src = el.currentSrc || el.src;
        if (isHttp(src)) imageUrl = absUrl(src);
      }
      if (imageUrl) {
        resources.add(imageUrl);
        fills.push({ type: 'IMAGE', scaleMode: 'FILL', url: imageUrl });
      } else {
        const bg = solidFill(parseColor(s.backgroundColor));
        if (bg) fills.push(bg);
      }
      if (fills.length) node.fills = fills;

      const stroke = borderStroke(s);
      if (stroke) {
        node.strokes = [stroke.stroke];
        node.strokeWeight = stroke.weight;
      }
      const radius = uniformRadius(s);
      if (typeof radius === 'number') {
        if (radius > 0) node.cornerRadius = radius;
      } else {
        node.rectangleCornerRadii = radius;
      }
      const shadow = parseShadow(s.boxShadow);
      if (shadow) node.effects = [shadow];
      const opacity = Number(s.opacity);
      if (Number.isFinite(opacity) && opacity < 1) node.opacity = opacity;
      if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowY === 'hidden') {
        node.clipsContent = true;
      }

      // Children: element children recurse; direct text nodes become TEXT.
      const children = [];
      for (const child of el.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (SKIP_TAGS.has(child.tagName)) continue;
          const c = elementNode(child);
          if (c) children.push(c);
        } else if (child.nodeType === Node.TEXT_NODE) {
          const text = child.nodeValue;
          if (!text || !text.trim()) continue;
          const t = textNode(child, text, s);
          if (t) children.push(t);
        }
      }
      if (children.length) node.children = children;
      return node;
    }

    function textNode(child, text, parentStyle) {
      if (nodeCount >= MAX_NODES) {
        truncated = true;
        return null;
      }
      const r = textRect(child);
      if (!r || r.width <= 0 || r.height <= 0) return null;
      nodeCount += 1;
      const s = parentStyle;
      const family = firstFamily(s.fontFamily);
      const italic = s.fontStyle === 'italic' || s.fontStyle === 'oblique';
      const style = fontStyleName(s.fontWeight, italic);
      noteFont(family, style);
      const lh = s.lineHeight === 'normal' ? undefined : px(s.lineHeight);
      const ls = px(s.letterSpacing);
      const align =
        s.textAlign === 'center' ? 'CENTER'
        : s.textAlign === 'right' || s.textAlign === 'end' ? 'RIGHT'
        : s.textAlign === 'justify' ? 'JUSTIFIED'
        : 'LEFT';
      const color = parseColor(s.color) || { r: 0, g: 0, b: 0, a: 1 };
      const node = {
        type: 'TEXT',
        name: text.trim().slice(0, 40),
        x: r.left + sx,
        y: r.top + sy,
        width: Math.ceil(r.width) + 1,
        height: Math.ceil(r.height),
        characters: text.replace(/\s+/g, ' ').trim(),
        fontFamily: family,
        fontStyle: style,
        fontSize: px(s.fontSize) || 16,
        textAlign: align,
        color: { r: color.r, g: color.g, b: color.b },
        opacity: color.a,
      };
      if (lh) node.lineHeight = lh;
      if (ls) node.letterSpacing = ls;
      return node;
    }

    const root = elementNode(document.body) || {
      type: 'FRAME',
      name: 'body',
      x: 0,
      y: 0,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    };

    const fontList = Array.from(fonts.entries()).map(([family, styles]) => ({
      family,
      styles: Array.from(styles),
    }));

    return {
      ir: {
        version: IR_VERSION,
        source: {
          url: location.href,
          title: document.title,
          capturedAt: Date.now(),
          viewport: { width: window.innerWidth, height: window.innerHeight },
          dpr: window.devicePixelRatio || 1,
        },
        fonts: fontList,
        root,
      },
      nodeCount,
      truncated,
    };
  }

  // --- entry point ---------------------------------------------------------

  window.__odCapture = function (opts) {
    const options = opts || {};
    const includeImages = options.includeImages !== false;
    const resources = new Set();
    let html = '';
    let figma = null;
    try {
      html = buildHtml(resources, includeImages);
    } catch (e) {
      html = `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
    }
    try {
      figma = buildFigmaIr(resources, includeImages);
    } catch (e) {
      figma = null;
    }
    const list = Array.from(resources).filter(isHttp).slice(0, MAX_RESOURCES);
    return {
      html,
      figmaIr: figma ? figma.ir : null,
      figmaNodeCount: figma ? figma.nodeCount : 0,
      figmaTruncated: figma ? figma.truncated : false,
      resources: list,
      title: document.title,
      url: location.href,
    };
  };

  // Single-element capture. The content script marks the picked element with the
  // `marker` attribute on the LIVE DOM before calling this; we read it off the
  // clone, prune to that element, and hand the worker a self-contained HTML
  // snapshot of just that element plus the resource list to inline. The worker
  // removes the live marker afterwards.
  window.__odCaptureElement = function (opts) {
    const options = opts || {};
    const includeImages = options.includeImages !== false;
    const marker = typeof options.marker === 'string' && options.marker ? options.marker : 'data-od-clip-target';
    const resources = new Set();
    let html = '';
    try {
      html = buildElementHtml(marker, resources, includeImages);
    } catch (e) {
      const el = document.querySelector(`[${marker}]`);
      html = el
        ? `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><base href="${document.baseURI}"></head><body>${el.outerHTML}</body></html>`
        : '';
    }
    const list = Array.from(resources).filter(isHttp).slice(0, MAX_RESOURCES);
    return {
      html,
      resources: list,
      title: document.title,
      url: location.href,
    };
  };
})();
