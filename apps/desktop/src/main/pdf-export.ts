import { writeFile } from "node:fs/promises";

import { BrowserWindow, dialog } from "electron";
import type { DesktopExportPdfInput, DesktopExportPdfResult } from "@open-design/sidecar-proto";

type PageSize = { height: number; width: number };

const DECK_PAGE_SIZE: PageSize = { width: 13.333333, height: 7.5 };
const MAX_PAGE_INCHES = 200;

export type PrintReadyPdfOptions = {
  deck?: boolean;
};

type PrintToPdfOptions = {
  margins: { bottom: number; left: number; right: number; top: number };
  pageSize: PageSize;
  preferCSSPageSize: boolean;
  printBackground: boolean;
};

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
    const pdf = await window.webContents.printToPDF(printToPdfOptions(pageSize));
    await writeFile(save.filePath, pdf);
    return { ok: true, path: save.filePath };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

/**
 * Default Save-dialog filename for a print-ready document. The
 * renderer's `printPdf()` bridge sends the document, nonce, and print
 * options — no title — but `buildSandboxedPreviewDocument` stamps the
 * export title into the wrapper's <title>, so we recover it from there.
 * Falls back to `artifact.pdf` when no usable title is present.
 */
export function pdfFilenameFromDocument(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match ? decodeBasicEntities(match[1]).trim() : "";
  return `${safeFilename(title, "artifact")}.pdf`;
}

/**
 * Electron surface consumed by {@link savePrintReadyDocumentAsPdf},
 * declared structurally — like `WindowFullscreenSurface` in runtime.ts
 * — so the save-as-PDF flow is unit-testable with plain stubs instead
 * of a real `dialog` + `BrowserWindow`.
 *
 * There is deliberately no `print()` here. Issue #1774's bug was the
 * `od:print-pdf` IPC handler reaching for `webContents.print()`, which
 * opens the printer-first OS dialog; `printToPdf()` is the only render
 * path this surface offers, so that regression cannot be reintroduced.
 */
export type PrintReadyPdfTarget = {
  /** Native "Save PDF" dialog. Resolves the chosen path, or null on cancel. */
  promptSavePath: (defaultFilename: string) => Promise<string | null>;
  /** Load the print-ready document into a hidden render surface. */
  load: (html: string, options: PrintReadyPdfOptions) => Promise<void>;
  /** Resolve once the document signals print-readiness for `nonce`. */
  waitUntilReady: (nonce: string) => Promise<void>;
  /** Measure non-deck content so dialogless PDFs do not fall back to Letter. */
  measurePageSize: () => Promise<PageSize>;
  /** Render the loaded document to PDF bytes (Electron printToPDF). */
  printToPdf: (options: PrintToPdfOptions) => Promise<Uint8Array>;
  /** Write the PDF bytes to `filePath`. */
  write: (filePath: string, data: Uint8Array) => Promise<void>;
  /** Tear down the render surface. Always invoked, including on cancel/error. */
  dispose: () => void;
};

/**
 * Direct Save-as-PDF flow for the renderer host PDF bridge (the
 * `od:print-pdf` IPC handler).
 *
 * Unlike {@link exportPdfFromHtml}, the document handed over here is
 * already a fully-wrapped sandboxed preview carrying the print-ready
 * handshake (built by apps/web/src/runtime/exports.ts#exportAsPdf), so
 * this flow does not build the printable document — it loads it as-is,
 * waits for the handshake, and renders straight to the file the user
 * picked.
 *
 * Invariant (issue #1774): PDF export shows the native Save dialog and
 * writes the file to disk. It never opens the printer-first OS print
 * dialog — `webContents.print()` is not on the {@link PrintReadyPdfTarget}
 * surface at all. A canceled Save dialog is a successful no-op.
 */
export async function savePrintReadyDocumentAsPdf(
  html: string,
  nonce: string,
  target: PrintReadyPdfTarget,
  options: PrintReadyPdfOptions = {},
): Promise<DesktopExportPdfResult> {
  const savePath = await target.promptSavePath(pdfFilenameFromDocument(html));
  if (savePath == null) {
    target.dispose();
    return { canceled: true, ok: true };
  }
  try {
    await target.load(html, options);
    await target.waitUntilReady(nonce);
    const pageSize = options.deck ? DECK_PAGE_SIZE : await target.measurePageSize();
    const pdf = await target.printToPdf(printToPdfOptions(pageSize));
    await target.write(savePath, pdf);
    return { ok: true, path: savePath };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  } finally {
    target.dispose();
  }
}

/**
 * Production {@link PrintReadyPdfTarget} backed by a real Electron
 * `dialog` and a hidden `BrowserWindow`. The render window is created
 * lazily in `load`, so a canceled Save dialog never spins one up.
 */
export function createElectronPdfTarget(): PrintReadyPdfTarget {
  let window: BrowserWindow | null = null;
  return {
    async promptSavePath(defaultFilename) {
      const save = await dialog.showSaveDialog({
        defaultPath: defaultFilename,
        filters: [
          { name: "PDF", extensions: ["pdf"] },
          { name: "All Files", extensions: ["*"] },
        ],
        title: "Save PDF",
      });
      return save.canceled || !save.filePath ? null : save.filePath;
    },
    async load(html, options) {
      const printWindow = new BrowserWindow({
        height: options.deck ? 1080 : 900,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
        width: options.deck ? 1920 : 1440,
      });
      window = printWindow;
      printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      printWindow.webContents.on("will-navigate", (event) => event.preventDefault());
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    },
    async waitUntilReady(nonce) {
      if (!window) throw new Error("PDF render window has not been loaded");
      await waitForPrintReadyHandshake(window.webContents, nonce);
    },
    async measurePageSize() {
      if (!window) throw new Error("PDF render window has not been loaded");
      return inferPageSize(window);
    },
    async printToPdf(options) {
      if (!window) throw new Error("PDF render window has not been loaded");
      // printToPDF() is the dialogless render path: the "Save as PDF"
      // equivalent of webContents.print() without the printer-first OS
      // dialog (issue #1774).
      return window.webContents.printToPDF(options);
    },
    async write(filePath, data) {
      await writeFile(filePath, data);
    },
    dispose() {
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
    },
  };
}

function printToPdfOptions(pageSize: PageSize): PrintToPdfOptions {
  return {
    margins: { bottom: 0, left: 0, right: 0, top: 0 },
    pageSize,
    preferCSSPageSize: true,
    printBackground: true,
  };
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

// Named entities the export pipeline can escape into a <title>
// (escapeHtmlAttribute / escapeHtmlText emit `& " < >`). `&amp;` is
// decoded last so a doubly-escaped `&amp;lt;` does not collapse to `<`.
const BASIC_HTML_ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&quot;/gi, '"'],
  [/&#39;/g, "'"],
  [/&amp;/gi, "&"],
];

function decodeBasicEntities(value: string): string {
  return BASIC_HTML_ENTITIES.reduce(
    (acc, [pattern, char]) => acc.replace(pattern, char),
    value,
  );
}

// Slugify a title into a filesystem-safe filename stem. Mirrors the
// `safeFilename` helpers in apps/daemon/src/pdf-export.ts and
// apps/web/src/runtime/exports.ts so the desktop Save dialog's default
// filename matches the daemon-backed export path.
function safeFilename(name: string, fallback: string): string {
  const slug = (name || fallback)
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}
