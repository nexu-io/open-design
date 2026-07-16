// Open Design web clipper service worker.
//
// Zero-config: there is no pairing and no token. The daemon is loopback-bound,
// and a web page cannot forge this extension's chrome-extension:// origin, so
// the daemon auto-trusts our requests to /api/library/*. All we need is the
// daemon URL (default below; overridable in the popup). host_permissions let
// the service worker reach the loopback daemon without CORS friction.
//
// The popup and the on-page toolbar both message this worker rather than
// talking to the daemon directly, so all daemon traffic lives in one place.

try {
  if (typeof importScripts === 'function') importScripts('i18n.js');
} catch {
  // The extension still works with English fallback if the helper cannot load.
}

const DEFAULT_DAEMON_URL = 'http://127.0.0.1:7456';
const I18N = globalThis.OD_CLIPPER_I18N;
const currentLocale = () => (I18N?.currentLocale ? I18N.currentLocale() : 'en');
const t = (key, vars) => (I18N?.t ? I18N.t(key, vars, currentLocale()) : key);

async function getDaemonUrl() {
  const { daemonUrl } = await chrome.storage.local.get(['daemonUrl']);
  return daemonUrl || DEFAULT_DAEMON_URL;
}

// Is Open Design running and reachable? We probe the narrow clipper route the
// daemon auto-trusts for extension origins and treat any 2xx as connected.
async function probe() {
  const daemonUrl = await getDaemonUrl();
  try {
    const resp = await fetch(`${daemonUrl}/api/library/clipper-probe`, { method: 'GET' });
    return resp.ok;
  } catch {
    return false;
  }
}

async function ingest(body) {
  const daemonUrl = await getDaemonUrl();
  let resp;
  try {
    resp = await fetch(`${daemonUrl}/api/library/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Network-level failure → the daemon almost certainly isn't running.
    throw new Error('not running');
  }
  if (!resp.ok) {
    // 413 means the capture is bigger than the daemon will accept — surface a
    // concise, actionable message instead of the server's full HTML error page.
    if (resp.status === 413) {
      throw new Error(t('errorCaptureTooLarge'));
    }
    const raw = await resp.text().catch(() => '');
    // Strip any HTML (Express error pages) and collapse whitespace so the popup
    // never shows a wall of markup.
    const snippet = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(`ingest ${resp.status}${snippet ? `: ${snippet}` : ''}`);
  }
  return resp.json();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('no active tab');
  return tab;
}

// Best-effort message to a tab's content script. Resolves regardless of whether
// a receiver exists (e.g. chrome:// pages have no content script).
function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (res) => {
        void chrome.runtime.lastError; // swallow "no receiving end"
        resolve(res);
      });
    } catch {
      resolve(undefined);
    }
  });
}

async function captureScreenshot() {
  const tab = await activeTab();
  // Pull our own on-page bar out of frame so it never lands in the screenshot.
  await sendToTab(tab.id, { type: 'odClipper:hideForCapture' });
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } finally {
    await sendToTab(tab.id, { type: 'odClipper:restoreAfterCapture' });
  }
  return ingest({
    dataUrl,
    kind: 'image',
    sourceUrl: tab.url,
    sourceTitle: tab.title,
    tags: ['screenshot'],
  });
}

// Runs in the page context (serialized by executeScript) — keep self-contained.
function collectImages() {
  const out = [];
  const seen = new Set();
  for (const el of document.images) {
    const src = el.currentSrc || el.src;
    if (!src || seen.has(src)) continue;
    if (!/^https?:/i.test(src)) continue;
    if ((el.naturalWidth || 0) < 64 || (el.naturalHeight || 0) < 64) continue;
    seen.add(src);
    out.push({ src, alt: el.alt || '' });
  }
  return out;
}

async function grabImages() {
  const tab = await activeTab();
  const [first] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectImages,
  });
  const images = Array.isArray(first?.result) ? first.result.slice(0, 30) : [];
  let count = 0;
  for (const img of images) {
    try {
      await ingest({ url: img.src, kind: 'image', sourceUrl: tab.url, sourceTitle: img.alt || tab.title });
      count += 1;
    } catch {
      // skip individual failures (hotlink-protected / oversized)
    }
  }
  return { count, total: images.length };
}

// --- page capture (high-fidelity HTML + Figma IR) --------------------------
//
// capture.js runs in the page and returns the snapshot with cross-origin
// resource URLs left intact; only the service worker can fetch those without
// CORS, so it does the fetch-and-inline pass here. One fetch per resource feeds
// both the HTML string and the Figma IR's image fills.

// Page captures inline cross-origin resources as base64 data URIs into both the
// HTML and the Figma IR before one JSON POST to the daemon (128MB ingest limit).
// To make a capture ALWAYS fit — even an image-heavy news front page — we:
//   1. compress large raster images (downscale + WebP) before inlining,
//   2. inline smallest-first within a fixed budget, leaving the largest as live
//      URLs (the HTML skeleton + styles are preserved either way),
//   3. drop the secondary Figma IR if the combined body would still be too big,
// so the HTML page itself can never fail to save.
const MAX_RESOURCE_BYTES = 16 * 1024 * 1024; // per-resource fetch ceiling
const MAX_TOTAL_INLINE_BYTES = 40 * 1024 * 1024; // total inlined data-URI budget
const SAFE_BODY_BYTES = 100 * 1024 * 1024; // drop the Figma IR past this body size

// Raster images above the threshold are re-encoded smaller; vectors (SVG),
// animations (GIF), small icons, and non-images are left untouched.
const COMPRESSIBLE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp']);
const IMAGE_COMPRESS_OVER_BYTES = 150 * 1024;
const MAX_IMAGE_DIM = 2000;
const COMPRESS_MIME = 'image/webp';
const COMPRESS_QUALITY = 0.8;

// Service workers have no FileReader/createObjectURL — base64 the bytes by hand.
function bytesToDataUri(bytes, mime) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${mime || 'application/octet-stream'};base64,${btoa(bin)}`;
}

// Re-encode a large raster image to a smaller, downscaled WebP so an image-heavy
// page's inlined payload stays small enough to always ingest. Service workers
// expose createImageBitmap + OffscreenCanvas, and because we fetched the bytes
// ourselves (not read them off a cross-origin <img>) the canvas isn't tainted,
// so convertToBlob works. Returns a data URI, or null to fall back to the
// original (decode failed, or re-encoding wasn't actually smaller).
async function compressImageToDataUri(buf, originalBase64Len) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([buf]), { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: COMPRESS_MIME, quality: COMPRESS_QUALITY });
    const dataUri = bytesToDataUri(new Uint8Array(await blob.arrayBuffer()), COMPRESS_MIME);
    return dataUri.length < originalBase64Len ? dataUri : null;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

async function fetchAsDataUri(url) {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error(String(resp.status));
  const declared = Number(resp.headers.get('content-length') || '0');
  if (declared && declared > MAX_RESOURCE_BYTES) throw new Error('too large');
  const buf = await resp.arrayBuffer();
  if (buf.byteLength > MAX_RESOURCE_BYTES) throw new Error('too large');
  const mime = (resp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  if (COMPRESSIBLE_MIMES.has(mime) && buf.byteLength > IMAGE_COMPRESS_OVER_BYTES) {
    const approxBase64Len = Math.ceil(buf.byteLength / 3) * 4;
    const compressed = await compressImageToDataUri(buf, approxBase64Len);
    if (compressed) return compressed;
  }
  return bytesToDataUri(new Uint8Array(buf), mime);
}

// Run an async fn over items with a bounded number in flight at once. Decoding
// and re-encoding images is memory-hungry, so a 300-image page must not fan all
// of them out at once or the service worker can OOM mid-capture.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function buildResourceMap(urls, includeImages) {
  const map = new Map();
  let skipped = 0;
  if (!includeImages || !Array.isArray(urls) || !urls.length) return { map, skipped };
  // Fetch (and compress) every candidate, then inline SMALLEST-FIRST until the
  // budget is spent — so we keep the most images and the ones we drop (left as
  // live URLs) are the largest. This bounds the inlined total by construction,
  // so the page's images can never push the body over the ingest limit.
  const candidates = await mapWithConcurrency(urls, 6, async (url) => {
    try {
      const dataUri = await fetchAsDataUri(url);
      return { url, dataUri, size: dataUri.length };
    } catch {
      return null; // hotlink-protected / oversized / offline — leave the URL
    }
  });
  let used = 0;
  for (const c of candidates.filter(Boolean).sort((a, b) => a.size - b.size)) {
    if (used + c.size > MAX_TOTAL_INLINE_BYTES) {
      skipped += 1; // budget spent — this (larger) resource stays a live URL
      continue;
    }
    used += c.size;
    map.set(c.url, c.dataUri);
  }
  return { map, skipped };
}

function inlineHtml(html, map) {
  let out = html;
  for (const [url, data] of map) out = out.split(url).join(data);
  return out;
}

function inlineFigmaIr(ir, map) {
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node.fills)) {
      node.fills = node.fills
        .map((f) => {
          if (f && f.type === 'IMAGE' && f.url) {
            const data = map.get(f.url);
            return data ? { type: 'IMAGE', scaleMode: f.scaleMode || 'FILL', dataUri: data } : null;
          }
          return f;
        })
        .filter(Boolean);
      if (!node.fills.length) delete node.fills;
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  if (ir && ir.root) walk(ir.root);
  return ir;
}

function slugify(title) {
  const slug = String(title || '')
    .slice(0, 60)
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'capture';
}

// Run capture.js in the active tab and inline its cross-origin resources.
async function capturePage(opts) {
  const includeImages = !opts || opts.includeImages !== false;
  const tab = await activeTab();
  // No hideForCapture here: this is a DOM/IR snapshot, not a pixel screenshot,
  // and capture.js already strips our own on-page UI by id ([id^="od-clipper-"])
  // from both the HTML clone and the Figma IR. So the bar stays put and keeps
  // showing its in-progress strip through the whole (often slow) snapshot —
  // hiding it here is what used to make the toolbar vanish mid-capture.
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] });
  const [out] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (o) => window.__odCapture(o),
    args: [{ includeImages }],
  });
  const cap = out && out.result;
  if (!cap || !cap.html) throw new Error('capture failed');
  const { map, skipped } = await buildResourceMap(cap.resources, includeImages);
  return {
    html: inlineHtml(cap.html, map),
    figmaIr: cap.figmaIr ? inlineFigmaIr(cap.figmaIr, map) : null,
    figmaNodeCount: cap.figmaNodeCount || 0,
    truncated: Boolean(cap.figmaTruncated),
    partialImages: skipped, // resources left as live URLs to fit the size budget
    title: cap.title || tab.title,
    url: cap.url || tab.url,
  };
}

async function capturePageToLibrary(opts) {
  const cap = await capturePage(opts);
  let figmaCapture = cap.figmaIr ? JSON.stringify(cap.figmaIr) : undefined;
  // The HTML page is the primary artifact. The Figma IR carries the same inlined
  // images a second time, so if pairing the two would push the body past the
  // safe ingest size, drop the IR — the page itself then always saves.
  let figmaDropped = false;
  if (figmaCapture && cap.html.length + figmaCapture.length > SAFE_BODY_BYTES) {
    figmaCapture = undefined;
    figmaDropped = true;
  }
  const r = await ingest({
    text: cap.html,
    kind: 'html',
    mime: 'text/html',
    sourceUrl: cap.url,
    sourceTitle: cap.title,
    tags: ['page-capture'],
    figmaCapture,
    figmaNodeCount: figmaCapture ? cap.figmaNodeCount : 0,
  });
  return {
    deduped: Boolean(r.deduped),
    hasFigma: Boolean(figmaCapture),
    truncated: cap.truncated,
    partialImages: cap.partialImages || 0,
    figmaDropped,
  };
}

async function downloadFigma(opts) {
  const cap = await capturePage(opts);
  if (!cap.figmaIr) throw new Error('no figma capture produced');
  const json = JSON.stringify(cap.figmaIr, null, 2);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  await chrome.downloads.download({
    url: dataUrl,
    filename: `${slugify(cap.title)}.od-figma.json`,
    saveAs: false,
  });
  return { truncated: cap.truncated, partialImages: cap.partialImages || 0 };
}

// --- design-system capture -------------------------------------------------
//
// brand-capture.js does not snapshot the page. It extracts brand/product
// signals and fills a stable HTML template, then the worker inlines the
// discovered logos/images/fonts exactly like the full-page capture path.

async function captureDesignSystem(opts) {
  const includeImages = !opts || opts.includeImages !== false;
  const tab = await activeTab();
  const locale = currentLocale();
  // No hideForCapture: brand-capture.js reads the page through the light DOM
  // (our toolbar lives in a shadow root it can't see) and skips any
  // [id^="od-clipper-"] node, so the bar stays visible with its progress strip
  // through the whole extraction instead of disappearing for several seconds.
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['i18n.js', 'brand-capture.js'] });
  const [out] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (captureLocale) => window.__odBrandCapture({ locale: captureLocale }),
    args: [locale],
  });
  const cap = out && out.result;
  if (!cap || !cap.html) throw new Error(t('errorDesignSystemCaptureFailed'));
  const { map, skipped } = await buildResourceMap(cap.resources, includeImages);
  return {
    html: inlineHtml(cap.html, map),
    partialImages: skipped,
    title: cap.title || t('brandFileTitle', { title: tab.title || t('brandFallbackTitle') }),
    url: cap.url || tab.url,
    summary: cap.summary || {},
  };
}

async function captureDesignSystemToLibrary(opts) {
  const cap = await captureDesignSystem(opts);
  const r = await ingest({
    text: cap.html,
    kind: 'design-system',
    mime: 'text/html',
    sourceUrl: cap.url,
    sourceTitle: cap.title,
    tags: ['design-system', 'brand-capture'],
    metadata: {
      designSystemCapture: {
        version: 1,
        capturedAt: Date.now(),
        ...cap.summary,
      },
    },
  });
  return { deduped: Boolean(r.deduped), partialImages: cap.partialImages || 0 };
}

// --- element + selected-image capture --------------------------------------

// Blob → base64 data URL (service workers have no FileReader).
async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(bin)}`;
}

// Crop a captured-tab PNG (data URL) to a viewport rect given in CSS pixels.
// The captured image is the visible viewport scaled by the device/zoom factor,
// so we derive the scale from the real image width vs the reported viewport
// width (robust against retina + page zoom, which a raw devicePixelRatio is
// not) and fall back to dpr when the viewport width is unknown.
async function cropToRect(tabDataUrl, rect, viewportWidth, dpr) {
  const blob = await (await fetch(tabDataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = viewportWidth && bmp.width ? bmp.width / viewportWidth : dpr || 1;
  const sx = Math.max(0, Math.round((rect.x || 0) * scale));
  const sy = Math.max(0, Math.round((rect.y || 0) * scale));
  const sw = Math.max(1, Math.min(Math.round((rect.width || 0) * scale), bmp.width - sx));
  const sh = Math.max(1, Math.min(Math.round((rect.height || 0) * scale), bmp.height - sy));
  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(out);
}

// Capture the picked element as ONE self-contained HTML asset. The content
// script marks the element with `data-od-clip-target` on the live DOM, then
// capture.js prunes the page to just that element (keeping the page CSS so its
// cascade resolves) and returns scoped HTML + the resources to inline. No
// screenshot, no separate `.element.html` markup sidecar — a single HTML file
// that opens, shares, and distributes as the element, styled as it was on the
// page. The worker inlines the element's own images exactly like a page capture.
async function captureElementHtml(payload) {
  const includeImages = !payload || payload.includeImages !== false;
  const tab = await activeTab();
  // A DOM snapshot, not a pixel screenshot: capture.js strips our own on-page UI
  // by id, so the bar never needs to leave the frame and keeps its progress strip.
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] });
  const [out] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (o) => window.__odCaptureElement(o),
    args: [{ includeImages, marker: 'data-od-clip-target' }],
  });
  const cap = out && out.result;
  if (!cap || !cap.html) throw new Error('element capture failed');
  const { map } = await buildResourceMap(cap.resources, includeImages);
  const html = inlineHtml(cap.html, map);
  const meta = payload.meta || {};
  const r = await ingest({
    text: html,
    kind: 'html',
    mime: 'text/html',
    sourceUrl: payload.sourceUrl || tab.url,
    sourceTitle: payload.sourceTitle || tab.title,
    tags: ['element', meta.tag].filter(Boolean),
    // The HTML asset IS the markup now, so there is no sidecar to advertise —
    // the lightweight element summary still rides along for the Library badge.
    metadata: { element: { ...meta, hasHtml: false } },
  });
  return { deduped: Boolean(r.deduped) };
}

// Screenshot a user-dragged region (cropped from the visible tab). A flat pixel
// asset — unlike element capture, which saves the picked node as live HTML.
async function captureRegion(payload) {
  const tab = await activeTab();
  // Hide the bar for the screenshot only if it would land inside the cropped
  // region; otherwise it stays put with its progress strip.
  const hideBar = Boolean(payload.hideBar);
  if (hideBar) await sendToTab(tab.id, { type: 'odClipper:hideForCapture' });
  let tabDataUrl;
  try {
    tabDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } finally {
    if (hideBar) await sendToTab(tab.id, { type: 'odClipper:restoreAfterCapture' });
  }
  const cropped = await cropToRect(tabDataUrl, payload.rect || {}, payload.viewportWidth, payload.dpr);
  const r = await ingest({
    dataUrl: cropped,
    kind: 'image',
    sourceUrl: payload.sourceUrl || tab.url,
    sourceTitle: payload.sourceTitle || tab.title,
    tags: ['region', 'screenshot'],
  });
  return { deduped: Boolean(r.deduped) };
}

// Ingest a user-chosen subset of page images (from the on-page picker).
async function ingestImages(payload) {
  const tab = await activeTab().catch(() => null);
  const images = Array.isArray(payload.images) ? payload.images.slice(0, 100) : [];
  let count = 0;
  for (const img of images) {
    if (!img || !img.src) continue;
    try {
      await ingest({
        url: img.src,
        kind: 'image',
        sourceUrl: payload.sourceUrl || (tab && tab.url),
        sourceTitle: img.alt || payload.sourceTitle || (tab && tab.title),
      });
      count += 1;
    } catch {
      // skip individual failures (hotlink-protected / oversized)
    }
  }
  return { count, total: images.length };
}

// Capture messages that should show a progress indicator. The on-page toolbar
// shows a rich step strip, but it dies if the page reloads mid-capture (hostile
// paywall sites do this). A per-tab badge on the EXTENSION ICON survives the
// reload — it's the one progress surface a page navigation can't take down.
const CAPTURE_TYPES = new Set([
  'captureScreenshot', 'capturePageToLibrary', 'downloadFigma',
  'captureDesignSystemToLibrary', 'captureElementHtml', 'captureRegion',
  'ingestImages', 'grabImages',
]);

async function setCaptureBadge(tabId, on) {
  if (tabId == null) return;
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
    await chrome.action.setBadgeText({ tabId, text: on ? '•••' : '' });
  } catch {
    // chrome.action may be unavailable in some embeds; the in-page strip still shows
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const isCapture = Boolean(msg && CAPTURE_TYPES.has(msg.type));
    let badgeTabId = null;
    if (isCapture) {
      badgeTabId = (_sender && _sender.tab && _sender.tab.id) ||
        (await activeTab().catch(() => null))?.id || null;
      setCaptureBadge(badgeTabId, true);
    }
    try {
      switch (msg && msg.type) {
        case 'getStatus': {
          const [daemonUrl, connected] = await Promise.all([getDaemonUrl(), probe()]);
          sendResponse({ ok: true, connected, daemonUrl });
          break;
        }
        case 'setDaemonUrl': {
          await chrome.storage.local.set({ daemonUrl: msg.url || DEFAULT_DAEMON_URL });
          const connected = await probe();
          sendResponse({ ok: true, connected });
          break;
        }
        case 'captureScreenshot': {
          const r = await captureScreenshot();
          sendResponse({ ok: true, deduped: Boolean(r.deduped) });
          break;
        }
        case 'grabImages': {
          const r = await grabImages();
          sendResponse({ ok: true, count: r.count, total: r.total });
          break;
        }
        case 'capturePageToLibrary': {
          const r = await capturePageToLibrary(msg.opts);
          sendResponse({
            ok: true,
            deduped: r.deduped,
            hasFigma: r.hasFigma,
            truncated: r.truncated,
            partialImages: r.partialImages,
            figmaDropped: r.figmaDropped,
          });
          break;
        }
        case 'downloadFigma': {
          const r = await downloadFigma(msg.opts);
          sendResponse({ ok: true, truncated: r.truncated, partialImages: r.partialImages });
          break;
        }
        case 'captureDesignSystemToLibrary': {
          const r = await captureDesignSystemToLibrary(msg.opts);
          sendResponse({ ok: true, deduped: r.deduped, partialImages: r.partialImages });
          break;
        }
        case 'captureElementHtml': {
          const r = await captureElementHtml(msg);
          sendResponse({ ok: true, deduped: r.deduped });
          break;
        }
        case 'captureRegion': {
          const r = await captureRegion(msg);
          sendResponse({ ok: true, deduped: r.deduped });
          break;
        }
        case 'ingestImages': {
          const r = await ingestImages(msg);
          sendResponse({ ok: true, count: r.count, total: r.total });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.message) || String(err) });
    } finally {
      if (isCapture) setCaptureBadge(badgeTabId, false);
    }
  })();
  return true; // keep the message channel open for the async response
});

// Right-click any image → save straight to the library.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'od-save-image',
    title: t('saveImageToLibrary'),
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'od-save-image' || !info.srcUrl) return;
  try {
    await ingest({
      url: info.srcUrl,
      kind: 'image',
      sourceUrl: tab && tab.url,
      sourceTitle: tab && tab.title,
    });
  } catch {
    // best-effort; the popup surfaces detailed errors
  }
});
