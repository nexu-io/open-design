import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BrowserWindow } from "electron";
import type {
  DesktopExportArtifactInput,
  DesktopExportArtifactResult,
} from "@open-design/sidecar-proto";

import { DECK_PAGE_SIZE, DECK_PRINT_CSS, inferPageSize, waitForPrintableContent } from "./pdf-export.js";

// Headless programmatic exporter for the `od export` CLI (PDF / image).
// The on-screen web Download menu rasterizes client-side; this is the daemon →
// Electron path so the CLI gets the desktop's bundled Chromium for pixel-perfect
// output without a print dialog. Renders into an off-screen BrowserWindow, writes
// the result to a temp file, and returns its path; the daemon streams those bytes
// to the HTTP caller and removes the temp file.

const MAX_IMAGE_EXPORT_HEIGHT_PX = 20_000;

export async function exportArtifact(
  input: DesktopExportArtifactInput,
): Promise<DesktopExportArtifactResult> {
  const width = input.width ?? (input.deck ? 1920 : 1440);
  const height = input.height ?? (input.deck ? 1080 : 900);

  const window = new BrowserWindow({
    height,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    width,
  });

  try {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildDocument(input))}`);
    await waitForPrintableContent(window);

    if (input.format === "pdf") return await renderPdf(window, input);
    return await renderImage(window, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

async function renderPdf(
  window: BrowserWindow,
  input: DesktopExportArtifactInput,
): Promise<DesktopExportArtifactResult> {
  const pageSize = input.deck ? DECK_PAGE_SIZE : await inferPageSize(window);
  const pdf = await window.webContents.printToPDF({
    margins: { bottom: 0, left: 0, right: 0, top: 0 },
    pageSize,
    preferCSSPageSize: true,
    printBackground: true,
  });
  const filePath = await writeTemp("pdf", Buffer.from(pdf));
  return { bytes: pdf.length, mime: "application/pdf", ok: true, path: filePath };
}

async function renderImage(
  window: BrowserWindow,
  input: DesktopExportArtifactInput,
): Promise<DesktopExportArtifactResult> {
  // For a non-deck page, grow the window to the content height so capturePage
  // grabs the full scrollable page rather than just the first viewport.
  if (!input.deck) {
    const contentHeight = (await window.webContents.executeJavaScript(
      `Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)`,
      true,
    )) as number;
    if (Number.isFinite(contentHeight) && contentHeight > 0) {
      if (contentHeight > MAX_IMAGE_EXPORT_HEIGHT_PX) {
        throw new Error(
          `Image export height exceeds supported image export limit (${Math.ceil(contentHeight)}px > ${MAX_IMAGE_EXPORT_HEIGHT_PX}px).`,
        );
      }
      const [w] = window.getContentSize();
      window.setContentSize(w, Math.ceil(contentHeight));
      await waitForPrintableContent(window);
    }
  }
  const image = await window.webContents.capturePage();
  // Only PNG and JPEG reach this point: the export contract and the sidecar
  // proto validator both reject any other image format (notably WebP) up front,
  // because Electron's nativeImage encoder supports only these two. Never
  // silently downgrade an unsupported format to PNG here.
  if (input.imageFormat === "jpeg") {
    const buf = image.toJPEG(92);
    return { bytes: buf.length, mime: "image/jpeg", ok: true, path: await writeTemp("jpg", buf) };
  }
  const buf = image.toPNG();
  return { bytes: buf.length, mime: "image/png", ok: true, path: await writeTemp("png", buf) };
}

function buildDocument(input: DesktopExportArtifactInput): string {
  let doc = injectBaseHref(input.html, input.baseHref);
  doc = injectTitle(doc, input.title);
  if (input.deck && input.format === "pdf") doc = injectStyle(doc, DECK_PRINT_CSS);
  return doc;
}

function injectBaseHref(doc: string, baseHref: string | undefined): string {
  if (!baseHref) return doc;
  const tag = `<base href="${escapeAttr(baseHref)}">`;
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  if (/<html[^>]*>/i.test(doc)) return doc.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  return `<!doctype html><html><head>${tag}</head><body>${doc}</body></html>`;
}

function injectTitle(doc: string, title: string): string {
  const tag = `<title>${escapeText(title)}</title>`;
  if (/<title[^>]*>.*?<\/title>/is.test(doc)) return doc.replace(/<title[^>]*>.*?<\/title>/is, tag);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  return doc;
}

function injectStyle(doc: string, css: string): string {
  const tag = `<style data-od-artifact-export>${css}</style>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${tag}</head>`);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  return `${tag}${doc}`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function writeTemp(extension: string, data: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "od-export-"));
  const filePath = path.join(dir, `artifact.${extension}`);
  await writeFile(filePath, data);
  return filePath;
}
