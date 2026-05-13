import { writeFile } from "node:fs/promises";

import { BrowserWindow, dialog } from "electron";
import type { DesktopExportPdfInput, DesktopExportPdfResult } from "@open-design/sidecar-proto";

type PageSize = { height: number; width: number };

const DECK_PAGE_SIZE: PageSize = { width: 13.333333, height: 7.5 };
const MAX_PAGE_INCHES = 200;

const DECK_PRINT_CSS = `
@media print {
  @page { size: 1920px 1080px; margin: 0; }
  html, body {
    width: 1920px !important;
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  body {
    display: block !important;
    scroll-snap-type: none !important;
    transform: none !important;
  }
  .slide, [data-screen-label], section.slide, .deck-slide, .ppt-slide {
    flex: none !important;
    width: 1920px !important;
    height: 1080px !important;
    min-height: 1080px !important;
    max-height: 1080px !important;
    page-break-after: always;
    break-after: page;
    scroll-snap-align: none !important;
    transform: none !important;
    position: relative !important;
    overflow: hidden !important;
  }
  .slide:last-child, [data-screen-label]:last-child { page-break-after: auto; break-after: auto; }
  .deck-counter, .deck-hint, .deck-nav,
  [aria-label="Previous slide"], [aria-label="Next slide"] {
    display: none !important;
  }
}
`;

export async function exportPdfFromHtml(input: DesktopExportPdfInput): Promise<DesktopExportPdfResult> {
  const save = await dialog.showSaveDialog({
    defaultPath: input.defaultFilename,
    filters: [
      { name: "PDF", extensions: ["pdf"] },
      { name: "All Files", extensions: ["*"] },
    ],
    title: "Save PDF",
  });
  if (save.canceled || !save.filePath) return { canceled: true, ok: true };

  const window = new BrowserWindow({
    height: input.deck ? 1080 : 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: input.deck ? 1920 : 1440,
  });

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildPrintableDocument(input))}`);
    await waitForPrintableContent(window);
    const pageSize = input.deck ? DECK_PAGE_SIZE : await inferPageSize(window);
    const pdf = await window.webContents.printToPDF({
      margins: { bottom: 0, left: 0, right: 0, top: 0 },
      pageSize,
      preferCSSPageSize: true,
      printBackground: true,
    });
    await writeFile(save.filePath, pdf);
    return { ok: true, path: save.filePath };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

function buildPrintableDocument(input: DesktopExportPdfInput): string {
  const source = injectBaseHref(input.html, input.baseHref);
  const withTitle = injectTitle(source, input.title);
  return input.deck ? injectPrintStylesheet(withTitle, DECK_PRINT_CSS) : withTitle;
}

function injectBaseHref(doc: string, baseHref: string | undefined): string {
  if (!baseHref) return doc;
  const tag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  if (/<html[^>]*>/i.test(doc)) return doc.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  return `<!doctype html><html><head>${tag}</head><body>${doc}</body></html>`;
}

function injectTitle(doc: string, title: string): string {
  const tag = `<title>${escapeHtmlText(title)}</title>`;
  if (/<title[^>]*>.*?<\/title>/is.test(doc)) return doc.replace(/<title[^>]*>.*?<\/title>/is, tag);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  if (/<html[^>]*>/i.test(doc)) return doc.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  return `<!doctype html><html><head>${tag}</head><body>${doc}</body></html>`;
}

function injectPrintStylesheet(doc: string, css: string): string {
  const tag = `<style data-od-desktop-pdf>${css}</style>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${tag}</head>`);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  return `${tag}${doc}`;
}

export async function waitForPrintableContent(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    `Promise.all([
      document.fonts && document.fonts.ready ? document.fonts.ready.catch(function(){}) : Promise.resolve(),
      Promise.all(Array.from(document.images || []).map(function(img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function(resolve) {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }))
    ]).then(function(){ return true; })`,
    true,
  );
}

export async function waitForPrintReadyHandshake(webContents: Electron.WebContents, nonce: string): Promise<void> {
  // The parent wrapper document caches 'OD_PRINT_READY' in
  // window.__odPrintReady as soon as it arrives (injected by
  // injectParentPrintReadyCache in apps/web/src/runtime/exports.ts).
  // Check the cache first to avoid missing a message that fired before
  // this listener was attached.
  // The nonce is a per-export random UUID embedded in the artifact's
  // handshake script; we verify it here to prevent spoofed messages
  // from untrusted artifact code.
  const handshake = webContents.executeJavaScript(
    `(function() {
      if (window.__odPrintReady) return Promise.resolve(true);
      return new Promise(function(resolve) {
        window.addEventListener('message', function handler(event) {
          if (event.data && event.data.type === 'OD_PRINT_READY' && event.data.nonce === '${nonce}') {
            window.__odPrintReady = true;
            window.removeEventListener('message', handler);
            resolve(true);
          }
        });
      });
    })()`,
    true,
  );

  // Prevent indefinite hangs if the document is malformed or the
  // injected handshake script was blocked (e.g. by a CSP violation).
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Print handshake timed out')), 30_000),
  );

  await Promise.race([handshake, timeout]);
}

async function inferPageSize(window: BrowserWindow): Promise<PageSize> {
  const size = await window.webContents.executeJavaScript(
    `(() => {
      const de = document.documentElement;
      const body = document.body || de;
      return {
        width: Math.max(de.scrollWidth, body.scrollWidth, de.clientWidth, 1440),
        height: Math.max(de.scrollHeight, body.scrollHeight, de.clientHeight, 900)
      };
    })()`,
    true,
  ) as { height?: unknown; width?: unknown };
  const widthPx = typeof size.width === "number" && Number.isFinite(size.width) ? size.width : 1440;
  const heightPx = typeof size.height === "number" && Number.isFinite(size.height) ? size.height : 900;
  return {
    width: clamp(widthPx / 96, 1, MAX_PAGE_INCHES),
    height: clamp(heightPx / 96, 1, MAX_PAGE_INCHES),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
