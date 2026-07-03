// Client-side export helpers used by the Share menu in the HTML viewer.
// Export formats run entirely in the browser:
//   - PDF  : open the artifact in a popup window and trigger window.print().
//            The user picks "Save as PDF" from the system print dialog.
//   - HTML : download the artifact as a single .html file via a Blob URL.
//   - ZIP  : pack the artifact with a coding handoff guide (see ./zip.ts).
//   - MD   : download the artifact's source verbatim with a `.md` extension
//            so it can be ingested by markdown-aware tooling (LLM context
//            windows, vault apps, etc.). No conversion is performed — the
//            file content is the same source the Source view shows. See
//            issue #279.

import { buildSrcdoc, type SrcdocOptions } from './srcdoc';
import { buildReactComponentSrcdoc } from './react-component';
import { buildZip } from './zip';
import { randomUUID } from '../utils/uuid';
import {
  captureHostPage,
  isOpenDesignHostAvailable,
  printHostPdf,
} from '@open-design/host';

// Re-exported so app components can gate desktop-only export paths without
// importing the host package directly.
export { isOpenDesignHostAvailable } from '@open-design/host';

const DESIGN_HANDOFF_FILENAME = 'DESIGN-HANDOFF.md';
const DESIGN_MANIFEST_FILENAME = 'DESIGN-MANIFEST.json';

function safeFilename(name: string, fallback: string): string {
  const slug = (name || fallback)
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function triggerHrefDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Pulls the attachment filename out of a Content-Disposition header,
// preferring the RFC 5987 UTF-8 form. Returns null when absent so callers
// can fall back to a locally derived name.
function filenameFromContentDisposition(resp: Response): string | null {
  const header = resp.headers.get('content-disposition') || '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star && star[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // fall through
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain && plain[1] ? plain[1] : null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  triggerHrefDownload(url, filename);
  // Revoke later — Safari sometimes hasn't finished reading the blob yet
  // when the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function exportAsHtml(html: string, title: string): void {
  const doc = buildSrcdoc(html);
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  triggerDownload(blob, `${safeFilename(title, 'artifact')}.html`);
}

export async function exportProjectAsHtml(opts: {
  projectId: string;
  filePath: string;
  fallbackHtml: string;
  fallbackTitle: string;
  versionId?: string;
}): Promise<void> {
  const segments = opts.filePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const query = new URLSearchParams({ inline: '1' });
  if (opts.versionId) query.set('versionId', opts.versionId);
  const url = `/api/projects/${encodeURIComponent(opts.projectId)}/export/${segments}?${query.toString()}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`html export request failed (${resp.status})`);
    const blob = await resp.blob();
    triggerDownload(blob, `${safeFilename(opts.fallbackTitle, 'artifact')}.html`);
  } catch (err) {
    console.warn('[exportProjectAsHtml] falling back to source HTML export:', err);
    exportAsHtml(opts.fallbackHtml, opts.fallbackTitle);
  }
}

// A file is treated as a preview-chrome wrapper only when it lives inside
// a frames/ or device-frames/ directory, or its filename is an unambiguous
// wrapper template (browser-chrome.html, device-frame.html).  Filenames
// like phone.html or iphone-upgrade.html are legitimate product-screen
// deliverables and must not be dropped from manifest screens.
const FRAME_WRAPPER_FILE_RE = /(^|\/)(frames?\/|device-frames?\/)|(^|\/)(browser-chrome|device-frame)\.html?$/i;

function isFrameWrapperHtmlFile(file: string): boolean {
  return FRAME_WRAPPER_FILE_RE.test(file);
}

type DesignFileMap = {
  files: string[];
  htmlFiles: string[];
  screenHtmlFiles: string[];
  cssFiles: string[];
  jsFiles: string[];
  assetFiles: string[];
  entryFile: string;
};

function designFileMap(entryFile: string, files?: string[]): DesignFileMap {
  const all = Array.from(new Set([entryFile, ...(files ?? [])])).sort((a, b) => a.localeCompare(b));
  const htmlFiles = all.filter((name) => /\.html?$/i.test(name));
  const screenHtmlFiles = htmlFiles.filter((name) => !isFrameWrapperHtmlFile(name));
  const cssFiles = all.filter((name) => /\.css$/i.test(name));
  const jsFiles = all.filter((name) => /\.[cm]?[jt]sx?$/i.test(name));
  const assetFiles = all.filter((name) => !htmlFiles.includes(name) && !cssFiles.includes(name) && !jsFiles.includes(name));
  const preferredEntryFile = !isFrameWrapperHtmlFile(entryFile)
    ? entryFile
    : screenHtmlFiles.find((name) => /(^|\/)index\.html$/i.test(name)) || screenHtmlFiles[0] || entryFile;
  return { files: all, htmlFiles, screenHtmlFiles, cssFiles, jsFiles, assetFiles, entryFile: preferredEntryFile };
}

export function buildDesignManifestContent(opts: {
  title: string;
  entryFile: string;
  files?: string[];
  kind?: 'html' | 'react';
}): string {
  const title = opts.title || 'Open Design artifact';
  const requestedEntryFile = opts.entryFile || 'index.html';
  const { files, htmlFiles, screenHtmlFiles, cssFiles, jsFiles, assetFiles, entryFile } = designFileMap(requestedEntryFile, opts.files);
  const screenFiles = screenHtmlFiles.length > 0 ? screenHtmlFiles : [entryFile];
  return JSON.stringify({
    schema: 'open-design.design-manifest.v1',
    title,
    kind: opts.kind ?? 'html',
    entryFile,
    sourceFiles: {
      all: files,
      html: htmlFiles,
      css: cssFiles,
      scriptsAndComponents: jsFiles,
      assets: assetFiles,
    },
    screens: screenFiles.map((file) => {
      const isIndex = /(^|\/)index\.html?$/i.test(file);
      const isLanding = /(^|\/)(landing|marketing)\.html?$/i.test(file) || /landing|marketing/i.test(file);
      const isOsWidget = /widget|live-activity|lock-screen|home-screen/i.test(file);
      const isApp = /app|dashboard|workspace|generator|translator|editor|screen/i.test(file);
      return {
        file,
        role: isIndex && screenFiles.length > 1 ? 'launcher-overview' : isLanding ? 'landing-page' : isOsWidget ? 'os-widget-surface' : isApp ? 'product-screen' : 'screen',
        implementationNote: isIndex && screenFiles.length > 1
          ? 'Use this as the navigation/overview entry only; implement each linked screen file as its own route/surface.'
          : 'Preserve visual hierarchy, responsive behavior, and interactive states from this screen.',
      };
    }),
    screenFilePolicy: {
      mode: 'screen-file-first',
      entryFileRole: screenFiles.length > 1 && /(^|\/)index\.html?$/i.test(entryFile) ? 'launcher-overview' : 'primary-screen',
      rules: [
        'Each distinct user-facing screen or surface must be delivered and implemented as its own file/route.',
        'If a landing page is present or requested, keep it in landing.html and do not merge it into the product app screen.',
        'When multiple HTML screens exist, index.html is a launcher/overview only; it must not be treated as the combined final UI.',
        'Keep product app screens, landing pages, platform screens, and OS widget surfaces separate in production code.',
      ],
    },
    appModules: [
      'Identify domain-specific in-app modules from the exported UI; do not reduce them to generic cards.',
      'For each major module, implement purpose, default/loading/empty/error/success states, and responsive behavior.',
      'Keep app modules separate from OS home-screen widgets in the production component model.',
    ],
    osWidgets: [
      'If the export includes home-screen, lock-screen, Live Activity, tablet glance, or Android widget surfaces, implement them as platform quick-access surfaces outside the app UI.',
      'If none are present, do not invent OS widgets unless the product requirements request them.',
    ],
    landingPage: {
      detection: 'Inspect files and screen names for a marketing/landing page surface. If present, keep it separate from product app screens.',
      requiredSections: ['hero', 'value props', 'product proof/screenshots', 'feature proof', 'CTA'],
    },
    tokens: {
      source: cssFiles.length > 0 ? cssFiles : [entryFile],
      required: ['background', 'surface', 'foreground', 'muted text', 'border', 'accent', 'radius', 'shadow', 'spacing', 'type scale', 'motion'],
      note: 'Extract/freeze tokens before framework implementation so coding tools do not substitute default theme colors or typography.',
    },
    interactions: {
      source: jsFiles.length > 0 ? jsFiles : [entryFile],
      requiredStates: ['default', 'hover', 'focus', 'active', 'disabled', 'loading', 'empty', 'error', 'success'],
      requiredBehaviors: ['forms/validation where present', 'tabs/filters where present', 'dialogs/sheets/drawers where present', 'copy/generate/share actions where present', 'player or quick controls where present'],
      note: 'If the prototype is static, derive missing behavior from visible controls and document it before coding.',
    },
    responsiveViewports: [
      { name: 'mobile-compact', width: 360, height: 800, category: 'mobile', mustAvoidHorizontalScroll: true },
      { name: 'mobile-standard', width: 390, height: 844, category: 'mobile', mustAvoidHorizontalScroll: true },
      { name: 'mobile-large', width: 430, height: 932, category: 'mobile', mustAvoidHorizontalScroll: true },
      { name: 'foldable-small-tablet', width: 600, height: 960, category: 'foldable-tablet', mustAvoidHorizontalScroll: true },
      { name: 'tablet-portrait', width: 820, height: 1180, category: 'tablet', mustAvoidHorizontalScroll: true },
      { name: 'tablet-landscape', width: 1024, height: 768, category: 'tablet', mustAvoidHorizontalScroll: true },
      { name: 'laptop', width: 1366, height: 768, category: 'desktop', mustAvoidHorizontalScroll: true },
      { name: 'desktop', width: 1440, height: 900, category: 'desktop', mustAvoidHorizontalScroll: true },
      { name: 'wide', width: 1920, height: 1080, category: 'wide', mustAvoidHorizontalScroll: true },
    ],
    implementationChecklist: [
      'Open entryFile first and map screens, modules, tokens, and interactions.',
      'Extract tokens before writing framework components.',
      'Implement app-specific modules with real states instead of generic card grids.',
      'Preserve or rebuild JS interactions for meaningful UX actions.',
      'Validate screenshots at desktop/tablet/mobile viewports with no horizontal overflow.',
      'Keep landing pages, in-app modules, and OS widgets as separate implementation surfaces.',
    ],
  }, null, 2);
}

export function buildDesignHandoffContent(opts: {
  title: string;
  entryFile: string;
  files?: string[];
  kind?: 'html' | 'react';
}): string {
  const title = opts.title || 'Open Design artifact';
  const requestedEntryFile = opts.entryFile || 'index.html';
  const { files, htmlFiles, cssFiles, jsFiles, assetFiles, entryFile } = designFileMap(requestedEntryFile, opts.files);
  const accentLikelyBrandLed =
    files.some((name) => /(design|brand|tokens?|theme|style|tailwind|variables)\.(css|scss|sass|less|json|ts|tsx|js|jsx|md)$/i.test(name)) ||
    cssFiles.length > 0;
  const hasResponsiveClues =
    htmlFiles.length > 0 ||
    cssFiles.length > 0 ||
    files.some((name) => /(screens?|pages?|components?|app|src)\//i.test(name));
  const list = (items: string[]) => items.length > 0 ? items.map((name) => `- \`${name}\``).join('\n') : '- None detected';
  const sourceNote = opts.kind === 'react'
    ? 'Use the exported React source as the component contract, then preserve the rendered visual behavior in the target app.'
    : `Start from \`${entryFile}\`, then preserve the visual system, responsive behavior, and interactions found in the exported files.`;

  return `# ${title} implementation handoff

This archive is the source of truth for turning the design into production code. ${sourceNote}

## Implementation target
- Build production UI from the exported design, not a loose reinterpretation.
- Preserve typography scale, spacing rhythm, color tokens, border radii, shadows, motion timing, and component states.
- Replace static placeholders only when the target app has real data or functional equivalents.
- Keep generated product UI free of Open Design chrome, preview labels, or design-process annotations.
- Treat this handoff as a visual contract: if implementation choices conflict, match the exported pixels and behavior first, then refactor internals.

## Source map
- Primary entry: \`${entryFile}\`
- HTML screens detected: ${htmlFiles.length}
- Stylesheets detected: ${cssFiles.length}
- Script/component files detected: ${jsFiles.length}
- Supporting assets detected: ${assetFiles.length}

## Responsive contract
Validate the implementation across this 2025–2026 viewport matrix:
- Mobile compact: 360×800
- Mobile standard: 390×844
- Mobile large: 430×932
- Foldable / small tablet: 600×960
- Tablet portrait: 820×1180
- Tablet landscape: 1024×768
- Laptop: 1366×768
- Desktop: 1440×900
- Wide desktop: 1920×1080

For responsive web exports, treat these as a modern breakpoint system for one adaptive web experience, not three fixed screenshots. Do not split responsive web into unrelated native app screens unless the project explicitly includes native targets. Use semantic layout thresholds, fluid \`clamp()\` type/spacing, and container queries where component width matters more than viewport width. ${hasResponsiveClues ? 'Preserve any CSS media queries, container queries, fluid \`clamp()\` scales, and layout changes already present in the exported files.' : 'If responsive rules are not present in the export, add them in the target implementation before shipping.'}

## Design fidelity contract
- Extract reusable tokens before writing components: background, surface, foreground, muted text, border, accent, radius, shadow, spacing, type scale, and motion duration/easing.
- Map product screens, in-app modules/components, optional landing page, and optional OS widget surfaces before coding. Keep these surfaces separate in the target architecture.
- Match layout geometry: max-widths, gutters, grid columns, card proportions, sticky/fixed elements, and viewport-specific navigation.
- Preserve real copy, labels, and data shown in the export. Do not replace specific text with generic marketing filler.
- Preserve interactive affordances: hover, focus, pressed, disabled, loading, validation, copy/share, tab/accordion, modal/sheet, and keyboard states where present.
- Preserve accessibility semantics when converting: headings stay hierarchical, controls remain buttons/links/inputs, focus states stay visible.
- Do not keep prototype-only annotations, frame labels, or Open Design chrome in the production UI.

## CJX-ready UX contract
- Use \`${DESIGN_MANIFEST_FILENAME}\` as the machine-readable map for screens, app modules, OS widgets, landing pages, tokens, interactions, and viewport checks.
- Screen-file-first: when multiple user-facing surfaces exist, implement each HTML screen as its own route/file. Treat \`index.html\` as a launcher/overview when the manifest marks it that way, not as a combined final UI.
- If \`landing.html\`, app screens, platform screens, or OS widget files exist, preserve those boundaries in the target app instead of merging them into one page.
- A single self-contained \`${entryFile}\` is acceptable only when the export truly contains one user-facing screen and its CSS/JS are structured enough to extract tokens, components, states, and behavior.
- If separate \`css/\` or \`js/\` files exist, treat them as source of truth for token/component/interactions before porting to React, Vue, SwiftUI, Compose, or another target stack.
- In-app modules/components are product UI blocks inside the app. OS widgets are home-screen/lock-screen/quick-access surfaces outside the app. Do not merge those concepts.

## Color and brand contract
- Use the exported design tokens and product/domain context as the color source of truth.
- Do not introduce warm beige / cream / peach / pink / orange-brown background washes unless they are already explicit brand/reference colors in the export.
- ${accentLikelyBrandLed ? 'A stylesheet or design/token file was detected; inspect it for canonical color variables before choosing framework theme tokens.' : 'No obvious token stylesheet was detected; sample colors from the entry file and convert them into named tokens before coding.'}

## Implementation sequence for AI coding tools
1. Open \`${entryFile}\` and \`${DESIGN_MANIFEST_FILENAME}\`; identify every screen file, launcher/overview file, app module, and interaction before coding.
2. If multiple HTML screens exist, map them to separate routes/surfaces first; do not merge \`landing.html\`, product app screens, platform screens, or OS widgets into one route.
3. Extract a token table from CSS/root styles and inline styles before building framework components.
4. Build product screens and domain-specific in-app modules from largest layout regions down to controls; avoid starting with isolated atoms that lose spatial intent.
5. Port responsive behavior across the modern viewport matrix and test each semantic breakpoint before cleanup.
6. Port interactions and states, then replace static placeholders only with real app data or functional equivalents.
7. Keep optional landing page and OS widget surfaces as separate surfaces if present.
8. Compare final screenshots against the export at 360×800, 390×844, 430×932, 820×1180, 1024×768, 1366×768, 1440×900, and 1920×1080 before declaring done.

## Entry points
${list(htmlFiles.length > 0 ? htmlFiles : [entryFile])}

## Styles
${list(cssFiles)}

## Scripts/components
${list(jsFiles)}

## Assets and supporting files
${list(assetFiles)}

## Coding checklist for AI tools
1. Inspect \`${entryFile}\` and \`${DESIGN_MANIFEST_FILENAME}\` first and identify reusable components before coding.
2. Implement each user-facing screen file as its own route/surface; keep launcher, landing, app, platform, and OS widget files separate.
3. Extract design tokens into the target stack: colors, type scale, spacing, radius, shadows, and motion.
4. Implement layout with real 2025–2026 responsive breakpoints, fluid type/spacing, and container-query-aware component behavior; test with no horizontal overflow.
5. Preserve interactive controls, hover/focus/pressed states, form behavior, validation, and copy actions where present.
6. Implement domain-specific in-app modules with real states; do not flatten them into generic cards.
7. Keep landing page, product screens, and OS widget/quick-access surfaces separate when present.
8. Confirm the production result visually matches the exported design before refactoring internals.
9. Reject implementation shortcuts that flatten the design into generic cards, generic gradients, placeholder stats, or framework-default typography.
10. If a detail is ambiguous, keep the exported HTML/CSS/JS behavior rather than inventing a new pattern.
`;
}

export function exportAsZip(html: string, title: string): void {
  const doc = buildSrcdoc(html);
  const slug = safeFilename(title, 'artifact');
  const blob = buildZip([
    { path: `${slug}/index.html`, content: doc },
    {
      path: `${slug}/${DESIGN_HANDOFF_FILENAME}`,
      content: buildDesignHandoffContent({
        title: title || slug,
        entryFile: 'index.html',
        files: ['index.html'],
      }),
    },
    {
      path: `${slug}/${DESIGN_MANIFEST_FILENAME}`,
      content: buildDesignManifestContent({
        title: title || slug,
        entryFile: 'index.html',
        files: ['index.html'],
      }),
    },
  ]);
  triggerDownload(blob, `${slug}.zip`);
}

export function exportAsMd(source: string, title: string): void {
  // Pass-through download: the file body is the artifact source verbatim,
  // only the extension and Content-Type are flipped to markdown. No
  // HTML→markdown conversion happens here — users who pipe the file into
  // markdown-aware tooling (LLM context windows, vault apps) get the same
  // bytes the Source view displays.
  const blob = new Blob([source], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, `${safeFilename(title, 'artifact')}.md`);
}

// ---------------------------------------------------------------------------
// Image screenshot export
// ---------------------------------------------------------------------------

/**
 * Request a PNG screenshot of the current viewport from the snapshot bridge
 * injected into a srcdoc preview iframe. Returns null if the bridge is not
 * present (e.g. URL-load mode) or the capture times out.
 */
export type PreviewSnapshot = { dataUrl: string; w: number; h: number };

export type PreviewSnapshotOptions = { full?: boolean };

export type PreviewSnapshotResult =
  | { ok: true; snapshot: PreviewSnapshot }
  | { ok: false; reason: 'loading' | 'post-message-error' | 'render-error' | 'timeout'; error?: string };

export function requestPreviewSnapshotResult(
  iframe: HTMLIFrameElement,
  timeout = 8000,
  options: PreviewSnapshotOptions = {},
): Promise<PreviewSnapshotResult> {
  const win = iframe.contentWindow;
  if (!win) return Promise.resolve({ ok: false, reason: 'loading' });
  const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    let done = false;
    function onMsg(ev: MessageEvent) {
      if (ev.source !== win) return;
      const d = ev.data as {
        type?: string;
        id?: string;
        dataUrl?: string;
        w?: number;
        h?: number;
        error?: string;
      } | null;
      if (!d || d.type !== 'od:snapshot:result' || d.id !== id) return;
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      if (d.dataUrl && d.w && d.h) resolve({ ok: true, snapshot: { dataUrl: d.dataUrl, w: d.w, h: d.h } });
      else resolve({ ok: false, reason: 'render-error', error: d.error });
    }
    window.addEventListener('message', onMsg);
    try {
      win.postMessage({ type: 'od:snapshot', id, ...(options.full ? { full: true } : {}) }, '*');
    } catch {
      done = true;
      window.removeEventListener('message', onMsg);
      resolve({ ok: false, reason: 'post-message-error' });
    }
    setTimeout(() => {
      if (!done) {
        done = true;
        window.removeEventListener('message', onMsg);
        resolve({ ok: false, reason: 'timeout' });
      }
    }, timeout);
  });
}

export async function requestPreviewSnapshot(
  iframe: HTMLIFrameElement,
  timeout = 8000,
  options: PreviewSnapshotOptions = {},
): Promise<PreviewSnapshot | null> {
  const result = await requestPreviewSnapshotResult(iframe, timeout, options);
  return result.ok ? result.snapshot : null;
}

/**
 * Capture a rectangle of the on-screen window via the desktop host's
 * compositor (Electron `webContents.capturePage`). Unlike the in-iframe
 * SVG-foreignObject bridge, this returns the REAL rendered pixels — fonts,
 * external CSS, gradients, cross-origin images and embedded <webview> content
 * all paint faithfully and the canvas is never tainted, so it cannot produce
 * the black/blank frames the foreignObject path does. Returns null when no
 * desktop host is present (pure web), so callers fall back to the bridge.
 *
 * `clipRect` is in CSS pixels relative to the viewport (e.g. an iframe's
 * getBoundingClientRect()); capturePage expects DIP page coordinates, which
 * match 1:1 for the top-level window (it never scrolls).
 */
export async function captureHostRegionSnapshot(
  clipRect: { left: number; top: number; width: number; height: number } | null,
): Promise<PreviewSnapshot | null> {
  if (!isOpenDesignHostAvailable()) return null;
  const clip = clipRect && clipRect.width >= 1 && clipRect.height >= 1
    ? {
        x: Math.max(0, Math.round(clipRect.left)),
        y: Math.max(0, Math.round(clipRect.top)),
        width: Math.max(1, Math.round(clipRect.width)),
        height: Math.max(1, Math.round(clipRect.height)),
      }
    : undefined;
  try {
    const result = await captureHostPage(clip ? { clip } : undefined);
    if (result.ok && result.dataUrl && result.w >= 1 && result.h >= 1) {
      return { dataUrl: result.dataUrl, w: result.w, h: result.h };
    }
  } catch {
    /* fall through to null so the caller can use the bridge */
  }
  return null;
}

/**
 * Capture an iframe's on-screen region through the desktop compositor.
 * Convenience wrapper over captureHostRegionSnapshot using the iframe's
 * current bounding rect.
 */
export async function captureHostIframeSnapshot(
  iframe: HTMLIFrameElement | null,
): Promise<PreviewSnapshot | null> {
  if (!iframe) return null;
  const rect = iframe.getBoundingClientRect();
  return captureHostRegionSnapshot({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  });
}

/** Convert a data-URL to a Blob without re-encoding through canvas. */
function dataUrlToBlob(dataUrl: string): Blob {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL');
  }
  const [header, base64] = dataUrl.split(',');
  const mime = header?.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(base64 ?? '');
  if (bytes.length <= 0) {
    throw new Error('Image snapshot is empty');
  }
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

type ClipboardItemCtor = new (
  items: Record<string, Blob | Promise<Blob>>,
) => ClipboardItem;

/**
 * Copy a PNG (or other image) data-URL onto the system clipboard as a real
 * image item, so it can be pasted into the chat composer or any other app.
 * Returns 'copied' on success, 'denied' when the clipboard API is missing or
 * the browser refuses the write for permission/security reasons, and 'failed'
 * for any other error (e.g. a malformed data-URL).
 */
export async function copyImageDataUrlToClipboard(
  dataUrl: string,
): Promise<'copied' | 'denied' | 'failed'> {
  const clipboard = navigator.clipboard;
  const ClipboardItemRef = (globalThis as { ClipboardItem?: ClipboardItemCtor })
    .ClipboardItem;
  if (!clipboard || typeof clipboard.write !== 'function' || !ClipboardItemRef) {
    return 'denied';
  }
  try {
    const blob = dataUrlToBlob(dataUrl);
    // Safari only honours clipboard.write() inside the original user gesture,
    // so prefer the Promise<Blob> ClipboardItem form when supported — it lets
    // the browser resolve the blob lazily without losing the gesture context.
    let item: ClipboardItem;
    try {
      item = new ClipboardItemRef({ [blob.type]: Promise.resolve(blob) });
    } catch {
      item = new ClipboardItemRef({ [blob.type]: blob });
    }
    await clipboard.write([item]);
    return 'copied';
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'denied';
    }
    return 'failed';
  }
}

export type ImageExportFormat = 'png' | 'jpeg' | 'webp';

type ImageExportSpec = {
  extension: string;
  mime: `image/${string}`;
  pickerLabel: string;
};

const IMAGE_EXPORT_SPECS: Record<ImageExportFormat, ImageExportSpec> = {
  png: {
    extension: 'png',
    mime: 'image/png',
    pickerLabel: 'PNG image',
  },
  jpeg: {
    extension: 'jpg',
    mime: 'image/jpeg',
    pickerLabel: 'JPEG image',
  },
  webp: {
    extension: 'webp',
    mime: 'image/webp',
    pickerLabel: 'WebP image',
  },
};

type FileSystemWritableFileStreamLike = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};

type FileSystemFileHandleLike = {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
};

type SaveFilePickerOptionsLike = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptionsLike) => Promise<FileSystemFileHandleLike>;
};

export type ImageExportTarget = {
  filename: string;
  method: 'download' | 'picker';
  save: (blob: Blob) => Promise<void> | void;
};

type ImageExportTargetOptions = {
  useNativePicker?: boolean;
};

function imageExportFilename(title: string, format: ImageExportFormat): string {
  const spec = IMAGE_EXPORT_SPECS[format];
  return `${safeFilename(title, 'artifact')}.${spec.extension}`;
}

function downloadImageExportTarget(filename: string): ImageExportTarget {
  return {
    filename,
    method: 'download',
    save: (blob) => {
      triggerDownload(blob, filename);
    },
  };
}

export function downloadImageDataUrl(dataUrl: string, filename: string): void {
  // Validate the snapshot without converting the actual download path to a blob URL.
  dataUrlToBlob(dataUrl);
  triggerHrefDownload(dataUrl, filename);
}

function isDomExceptionNamed(err: unknown, names: ReadonlySet<string>): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return names.has(err.name);
  }
  if (!err || typeof err !== 'object' || !('name' in err)) return false;
  return typeof err.name === 'string' && names.has(err.name);
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image snapshot'));
    img.src = dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`Could not encode snapshot as ${mime}`));
        return;
      }
      if (blob.type && blob.type !== mime) {
        reject(new Error(`Browser encoded ${blob.type} instead of ${mime}`));
        return;
      }
      resolve(blob);
    }, mime, quality);
  });
}

export async function imageDataUrlToBlob(
  dataUrl: string,
  format: ImageExportFormat,
): Promise<Blob> {
  const spec = IMAGE_EXPORT_SPECS[format];
  if (format === 'png') {
    const blob = dataUrlToBlob(dataUrl);
    if (blob.type === spec.mime) return blob;
  }

  const img = await loadImageFromDataUrl(dataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (width <= 0 || height <= 0) {
    throw new Error('Image snapshot is empty');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  if (format === 'jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToBlob(canvas, spec.mime, format === 'jpeg' ? 0.92 : undefined);
}

export async function prepareImageExportTarget(
  title: string,
  format: ImageExportFormat,
  options: ImageExportTargetOptions = {},
): Promise<ImageExportTarget | null> {
  const spec = IMAGE_EXPORT_SPECS[format];
  const filename = imageExportFilename(title, format);
  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
  if (options.useNativePicker !== false && typeof picker === 'function') {
    try {
      const handle = await picker.call(window, {
        suggestedName: filename,
        types: [
          {
            description: spec.pickerLabel,
            accept: {
              [spec.mime]: [`.${spec.extension}`],
            },
          },
        ],
      });
      return {
        filename,
        method: 'picker',
        save: async (blob) => {
          const writable = await handle.createWritable();
          try {
            await writable.write(blob);
          } finally {
            await writable.close();
          }
        },
      };
    } catch (err) {
      if (isDomExceptionNamed(err, new Set(['AbortError']))) return null;
      if (isDomExceptionNamed(err, new Set(['NotAllowedError', 'SecurityError']))) {
        return downloadImageExportTarget(filename);
      }
      throw err;
    }
  }

  return downloadImageExportTarget(filename);
}

/** Download a snapshot data-URL as a PNG file. */
export function exportAsImage(dataUrl: string, title: string): void {
  try {
    const blob = dataUrlToBlob(dataUrl);
    triggerDownload(blob, `${safeFilename(title, 'artifact')}.png`);
  } catch (err) {
    console.warn('[exportAsImage] failed to convert snapshot:', err);
    // Re-throw the error to allow the caller to handle UI feedback
    throw err;
  }
}

export type ProjectPdfExportResult = 'desktop' | 'fallback' | 'cancelled';

export async function exportProjectAsPdf(opts: {
  deck: boolean;
  fallbackPdf: () => void | Promise<void>;
  filePath: string;
  projectId: string;
  title: string;
  versionId?: string;
}): Promise<ProjectPdfExportResult> {
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(opts.projectId)}/export/pdf`, {
      body: JSON.stringify({
        deck: opts.deck,
        fileName: opts.filePath,
        title: opts.title,
        ...(opts.versionId ? { versionId: opts.versionId } : {}),
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!resp.ok) throw new Error(`desktop PDF export unavailable (${resp.status})`);
    const body = await resp.json().catch(() => ({}));
    if (body?.canceled === true) return 'cancelled';
    if (body && body.ok === false) throw new Error(body.error || 'desktop PDF export failed');
    return 'desktop';
  } catch (err) {
    console.warn('[exportProjectAsPdf] falling back to programmatic PDF:', err);
    await opts.fallbackPdf();
    return 'fallback';
  }
}

type ReactSourceExtension = '.jsx' | '.tsx';

export function exportAsJsx(
  source: string,
  title: string,
  extension: ReactSourceExtension = '.jsx',
): void {
  const blob = new Blob([source], { type: 'text/jsx;charset=utf-8' });
  triggerDownload(blob, `${safeFilename(title, 'component')}${extension}`);
}

export function exportReactComponentAsHtml(source: string, title: string): void {
  const doc = buildReactComponentSrcdoc(source, { title });
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  triggerDownload(blob, `${safeFilename(title, 'component')}.html`);
}

export function exportReactComponentAsZip(
  source: string,
  title: string,
  extension: ReactSourceExtension = '.jsx',
): void {
  const slug = safeFilename(title, 'component');
  const componentFile = `${slug}${extension}`;
  const blob = buildZip([
    { path: `${slug}/${componentFile}`, content: source },
    {
      path: `${slug}/${DESIGN_HANDOFF_FILENAME}`,
      content: buildDesignHandoffContent({
        title: title || slug,
        entryFile: componentFile,
        files: [componentFile],
        kind: 'react',
      }),
    },
    {
      path: `${slug}/${DESIGN_MANIFEST_FILENAME}`,
      content: buildDesignManifestContent({
        title: title || slug,
        entryFile: componentFile,
        files: [componentFile],
        kind: 'react',
      }),
    },
  ]);
  triggerDownload(blob, `${slug}.zip`);
}

// Project ZIP export — asks the daemon to bundle the on-disk project tree.
// Used by FileViewer's share menu so the user gets the full uploaded
// project (e.g. the `ui-design/` folder with its subdirs and assets) rather
// than just a srcdoc snapshot of the rendered HTML. `filePath` is the
// active file's project-relative path; if it lives inside a top-level
// directory we scope the archive to that directory, otherwise we ask the
// daemon for the whole project. Falls back to the in-memory single-file
// ZIP on any failure so the action never silently no-ops.
export async function exportProjectAsZip(opts: {
  projectId: string;
  filePath: string;
  fallbackHtml: string;
  fallbackTitle: string;
  versionId?: string;
}): Promise<void> {
  if (opts.versionId) {
    const segments = opts.filePath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const query = new URLSearchParams({ inline: '1', versionId: opts.versionId });
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(opts.projectId)}/export/${segments}?${query.toString()}`);
      if (!resp.ok) throw new Error(`version html export request failed (${resp.status})`);
      exportAsZip(await resp.text(), opts.fallbackTitle);
      return;
    } catch (err) {
      console.warn('[exportProjectAsZip] falling back to single-file ZIP:', err);
      exportAsZip(opts.fallbackHtml, opts.fallbackTitle);
      return;
    }
  }
  const root = archiveRootFromFilePath(opts.filePath);
  const url = `/api/projects/${encodeURIComponent(opts.projectId)}/archive${
    root ? `?root=${encodeURIComponent(root)}` : ''
  }`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`archive request failed (${resp.status})`);
    const blob = await resp.blob();
    triggerDownload(blob, archiveFilenameFrom(resp, opts.fallbackTitle, root));
  } catch (err) {
    console.warn('[exportProjectAsZip] falling back to single-file ZIP:', err);
    exportAsZip(opts.fallbackHtml, opts.fallbackTitle);
  }
}

// Tri-state, mirroring exportProjectImageDataUrl: callers must distinguish a
// genuinely-unavailable off-screen renderer (no desktop host / 501 / transport
// failure) — where falling back to the vector/browser PDF is correct — from a
// SEMANTIC export failure (bad deck routing, unreadable renderer output, a
// renderer-side 502, "page too tall", …), which must be surfaced rather than
// silently masked by the old vector path (which can reintroduce the CJK-glyph /
// fidelity bugs this screenshot path exists to avoid).
export type ProjectScreenshotExportResult =
  | { ok: true }
  | { ok: false; unavailable: true }
  | { ok: false; error: string };

// Programmatic screenshot-based PPTX export. POSTs to the daemon, which renders
// each deck slide to a pixel-perfect PNG (via the desktop's Electron Chromium)
// and assembles a one-image-per-slide .pptx, then streams the bytes back for a
// blob download. Replaces the old "send a prompt and let the agent run
// python-pptx" path. `format: 'pdf'` produces the raster (screenshot) PDF.
export async function exportProjectAsPptx(opts: {
  projectId: string;
  fileName: string;
  title?: string;
  format?: 'pptx' | 'pdf';
  deck?: boolean;
  versionId?: string;
  // pptx only: produce an editable deck (native shapes/text) instead of a
  // screenshot one (one image per slide).
  editable?: boolean;
}): Promise<ProjectScreenshotExportResult> {
  const format = opts.format ?? 'pptx';
  const path = format === 'pdf' ? 'export/pdf-image' : 'export/pptx';
  const url = `/api/projects/${encodeURIComponent(opts.projectId)}/${path}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: opts.fileName,
        ...(opts.title ? { title: opts.title } : {}),
        ...(opts.versionId ? { versionId: opts.versionId } : {}),
        ...(format === 'pptx'
          ? { deck: true, ...(opts.editable ? { editable: true } : {}) }
          : typeof opts.deck === 'boolean'
            ? { deck: opts.deck }
            : {}),
      }),
    });
  } catch {
    // Transport-level failure (offline, daemon down) — genuinely unavailable, so
    // the caller may fall back to the vector/browser PDF.
    return { ok: false, unavailable: true };
  }
  if (!resp.ok) {
    // 501 = this runtime has no off-screen renderer → caller may fall back to
    // the vector/browser PDF. Everything else is a real (semantic) failure that
    // must surface, not be masked by the vector path.
    if (resp.status === 501) return { ok: false, unavailable: true };
    let message = `export request failed (${resp.status})`;
    try {
      const err = await resp.json();
      if (err?.error?.message) message = String(err.error.message);
    } catch {
      // non-JSON error body; keep the status-based message
    }
    return { ok: false, error: message };
  }
  // The renderer already produced bytes — a failure reading the body or
  // triggering the download is a real (post-response) export failure, NOT
  // "renderer unavailable". Returning `error` (not `unavailable`) keeps the
  // caller from silently downgrading to the lower-fidelity vector path.
  try {
    const blob = await resp.blob();
    const base = opts.fileName.replace(/^.*\//, '').replace(/\.html?$/i, '');
    const slug = safeFilename(opts.title || base, 'deck');
    const fromHeader = filenameFromContentDisposition(resp);
    triggerDownload(blob, fromHeader || `${slug}.${format}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'export download failed' };
  }
}

// Whether an HTML artifact carries a structured deck runtime for EXPORT
// purposes, beyond explicit project/file metadata. Runtime-managed decks render
// slides through a custom element (e.g. `<deck-stage>` with slotted
// `<section data-screen-label="...">` children toggled via `data-deck-active`)
// and can carry no literal `class="slide"`, so metadata-only checks can miss
// them. Older html-ppt templates use `.slide` together with deck-specific
// structure such as `data-title` or a `.deck` wrapper. Deliberately DO NOT treat
// a plain `.slide` class as proof of a deck: ordinary pages often use that token
// for carousels/testimonials and still need full-page/scroll-stitch capture.
export function sourceLooksLikeExportableDeck(source: string | null | undefined): boolean {
  if (!source) return false;
  return (
    /<deck-stage[\s/>]|\bdata-screen-label\s*=|class\s*=\s*['"](?:[^'"]*\s)?(?:deck-slide|ppt-slide)(?:\s|['"])/i.test(
      source,
    ) ||
    /<[^>]*\bclass\s*=\s*['"](?:[^'"]*\s)?slide(?:\s|['"])[^>]*\bdata-title\s*=|<[^>]*\bdata-title\s*=[^>]*\bclass\s*=\s*['"](?:[^'"]*\s)?slide(?:\s|['"])/i.test(
      source,
    ) ||
    /<[^>]*\bclass\s*=\s*['"](?:[^'"]*\s)?deck(?:\s|['"])[^>]*>\s*<[^>]*\bclass\s*=\s*['"](?:[^'"]*\s)?slide(?:\s|['"])/i.test(
      source,
    )
  );
}

// Decides how a current-slide / whole-deck / page image capture should run.
// The off-screen renderer needs a concrete slide `index` for a CURRENT-slide
// capture (Copy screenshot / annotation), but we only know the active slide when
// the viewer tracks it (`trackedActive`). Runtime-managed decks (`<deck-stage>` /
// `data-screen-label`) are deliberately kept out of the viewer's nav signal, so
// they have no active-slide bridge (`trackedActive === null`); a current-slide
// off-screen render would then always grab slide 0, exporting slide 1 instead of
// the slide on screen. For that case the caller must skip the off-screen path and
// use the visible host snapshot (which IS the current slide). Whole-deck (Export
// as image, omits index → stitches all), ordinary pages, and tracked `.slide`
// decks still use the off-screen renderer.
export function planDeckImageCapture(opts: {
  deck: boolean;
  wholeDeck: boolean;
  trackedActive: number | null;
}): { useOffscreen: boolean; index: number | undefined } {
  // Export as image: the whole page / whole deck, off-screen and
  // viewport-independent.
  if (opts.wholeDeck) return { useOffscreen: true, index: undefined };
  // A current-view capture (Copy screenshot / annotation) must stay
  // viewport-based: an ordinary page uses the visible host snapshot, NOT an
  // off-screen full-page render (which would copy the whole document instead of
  // what the user is looking at, and break captureViewport annotations). A deck
  // current-slide uses the off-screen renderer at the active slide ONLY when the
  // viewer tracks it; a runtime-managed deck with no tracked active slide also
  // falls back to the visible snapshot (we can't tell which slide it's on).
  if (!opts.deck || opts.trackedActive === null) return { useOffscreen: false, index: undefined };
  return { useOffscreen: true, index: opts.trackedActive };
}

// Programmatic image export: render a single pixel-perfect PNG via the daemon
// (off-screen Electron Chromium), independent of the preview pane size. For a
// deck pass the current slide `index` (Copy screenshot); omit it to stitch the
// WHOLE deck top-to-bottom into one long image (Export as image) or to capture an
// ordinary page at natural size. Returns a {dataUrl,w,h} snapshot compatible with
// the existing image-export pipeline, or null if unavailable.
// Discriminates a genuinely-unavailable off-screen renderer (no desktop host /
// 501 / network) — where the caller may fall back to a visible-preview capture —
// from a SEMANTIC export failure (e.g. "page is too tall — export as PDF"), which
// must be surfaced rather than silently downgraded to a partial viewport shot.
export type ProjectImageExportResult =
  | { ok: true; snapshot: PreviewSnapshot }
  | { ok: false; unavailable: true }
  | { ok: false; error: string };

export async function exportProjectImageDataUrl(opts: {
  projectId: string;
  fileName: string;
  index?: number;
  deck?: boolean;
  versionId?: string;
}): Promise<ProjectImageExportResult> {
  const url = `/api/projects/${encodeURIComponent(opts.projectId)}/export/image`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: opts.fileName,
        ...(typeof opts.index === 'number' ? { index: opts.index } : {}),
        ...(typeof opts.deck === 'boolean' ? { deck: opts.deck } : {}),
        ...(opts.versionId ? { versionId: opts.versionId } : {}),
      }),
    });
  } catch {
    // Transport-level failure (offline, daemon down) — genuinely unavailable, so
    // the caller may fall back to a visible-preview capture.
    return { ok: false, unavailable: true };
  }
  if (!resp.ok) {
    // 501 = this runtime has no off-screen renderer → caller may fall back.
    if (resp.status === 501) return { ok: false, unavailable: true };
    let message = `image export failed (${resp.status})`;
    try {
      const err = await resp.json();
      if (err?.error?.message) message = String(err.error.message);
    } catch {
      // non-JSON body; keep the status-based message
    }
    return { ok: false, error: message };
  }
  // A 200 with an unreadable/corrupt payload is a real export failure, NOT
  // "renderer unavailable" — surface it instead of silently downgrading to the
  // viewport screenshot.
  try {
    const blob = await resp.blob();
    const dataUrl = await blobToDataUrl(blob);
    const img = await loadImageFromDataUrl(dataUrl);
    return { ok: true, snapshot: { dataUrl, w: img.naturalWidth, h: img.naturalHeight } };
  } catch {
    return { ok: false, error: 'image export returned an unreadable response' };
  }
}

// Pixel-perfect screenshot PDF (one raster page per deck slide, or the whole
// page for a website) via the same off-screen renderer as image/PPTX. Used as
// the default UI PDF because Chromium's vector printToPDF drops CJK glyphs in
// the packaged runtime.
export function exportProjectScreenshotPdf(opts: {
  projectId: string;
  fileName: string;
  title?: string;
  deck?: boolean;
  versionId?: string;
}): Promise<ProjectScreenshotExportResult> {
  return exportProjectAsPptx({ ...opts, format: 'pdf' });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('blob read failed'));
    reader.readAsDataURL(blob);
  });
}

// Design system ZIP export — asks the daemon to bundle the whole brand
// directory plus a generated SKILLS.md usage guide so the user gets a
// self-contained, shareable package. Used by the Design Systems detail panel's
// download button. Returns false on failure so the caller can surface an error.
export async function downloadDesignSystemArchive(opts: {
  designSystemId: string;
  fallbackTitle: string;
}): Promise<boolean> {
  const url = `/api/design-systems/${encodeURIComponent(opts.designSystemId)}/archive`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`archive request failed (${resp.status})`);
    const blob = await resp.blob();
    triggerDownload(blob, archiveFilenameFrom(resp, opts.fallbackTitle, ''));
    return true;
  } catch (err) {
    console.warn('[downloadDesignSystemArchive] failed:', err);
    return false;
  }
}

export async function downloadProjectArchive(opts: {
  projectId: string;
  fallbackTitle: string;
  root?: string;
}): Promise<boolean> {
  const root = opts.root?.replace(/^\/+|\/+$/g, '') ?? '';
  const url = `/api/projects/${encodeURIComponent(opts.projectId)}/archive${
    root ? `?root=${encodeURIComponent(root)}` : ''
  }`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`archive request failed (${resp.status})`);
    const blob = await resp.blob();
    triggerDownload(blob, archiveFilenameFrom(resp, opts.fallbackTitle, root));
    return true;
  } catch (err) {
    console.warn('[downloadProjectArchive] failed:', err);
    return false;
  }
}

// Exported for unit tests. Pure string transform with no DOM dependency.
export function archiveRootFromFilePath(filePath: string): string {
  const trimmed = (filePath || '').replace(/^\/+/, '');
  const slash = trimmed.indexOf('/');
  if (slash <= 0) return '';
  return trimmed.slice(0, slash);
}

// Exported for unit tests so the Content-Disposition fallback chain
// (UTF-8 → legacy quoted → local slug) can be exercised against mock
// Response objects without spinning up the daemon.
export function archiveFilenameFrom(resp: Response, fallbackTitle: string, root: string): string {
  // Honor the daemon's Content-Disposition (it knows the project name and
  // handles RFC 5987 UTF-8 encoding). Fall back to the active directory
  // name, then to the active file title.
  const header = resp.headers.get('content-disposition') || '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star && star[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // fall through to the legacy filename= or local fallback
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  if (plain && plain[1]) return plain[1];
  const slug = safeFilename(root || fallbackTitle, 'project');
  return `${slug}.zip`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Blob documents inherit the origin of the page that created them. For
// generated preview HTML, opening the artifact itself as the top-level Blob
// document would bypass the preview contract documented in
// docs/architecture.md: the untrusted code must run in an iframe sandbox
// without `allow-same-origin`. This wrapper is same-origin, but it contains no
// generated script; the generated document lives in an opaque-origin child.
export function buildSandboxedPreviewDocument(
  doc: string,
  title: string,
  opts?: { allowModals?: boolean },
): string {
  const safeTitle = escapeHtmlAttribute(title || 'Preview');
  const sandbox = opts?.allowModals ? 'allow-scripts allow-modals' : 'allow-scripts';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>html,body,iframe{margin:0;width:100%;height:100%;border:0}body{overflow:hidden;background:#fff}</style>
</head>
<body>
  <iframe title="${safeTitle}" sandbox="${sandbox}" srcdoc="${escapeHtmlAttribute(doc)}"></iframe>
</body>
</html>`;
}

function currentOriginBaseHref(): string | undefined {
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return `${window.location.origin.replace(/\/+$/, '')}/`;
  }
  const base =
    typeof document !== 'undefined' && typeof document.baseURI === 'string'
      ? document.baseURI
      : typeof window !== 'undefined' && typeof window.location?.href === 'string'
        ? window.location.href
        : undefined;
  if (!base) return undefined;
  try {
    return new URL('/', base).href;
  } catch {
    return undefined;
  }
}

function buildBlobSafeSrcdoc(html: string, options?: SrcdocOptions): string {
  const baseHref =
    typeof options?.baseHref === 'string' ? options.baseHref : currentOriginBaseHref();
  return buildSrcdoc(html, {
    ...options,
    ...(baseHref ? { baseHref } : {}),
  });
}

export function openSandboxedPreviewInNewTab(
  html: string,
  title: string,
  srcdocOptions?: SrcdocOptions,
): void {
  const doc = buildSandboxedPreviewDocument(buildBlobSafeSrcdoc(html, srcdocOptions), title);
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Open the artifact in a new tab via a Blob URL with a self-printing
// script injected. Going through a Blob URL (rather than `window.open('')`
// + `document.write`) avoids two failure modes we hit before:
//   - `noopener` makes `window.open` return null, leaving an empty popup
//     and triggering a duplicate fallback tab.
//   - Cross-document writes are flaky in some browsers and don't always
//     fire load events the way an inline script tied to the document does.
// The injected script also sets the document title so "Save as PDF" picks
// a sensible default filename.
//
// `deck: true` injects an extra print stylesheet that lays every `.slide`
// section out one-per-page top-to-bottom. The deck framework already ships
// equivalent print rules; this is a safety net for older / partially
// regenerated decks where the framework was stripped — without it,
// horizontal-snap decks print only the visible slide.
export async function exportAsPdf(
  html: string,
  title: string,
  opts?: SrcdocOptions & { sandboxedPreview?: boolean; onProgress?: ExportProgress },
): Promise<void> {
  const sandboxedPreview = opts?.sandboxedPreview ?? true;
  // Generate a per-export nonce so the print-ready handshake is resistant to
  // spoofing by untrusted scripts inside the exported artifact.
  const nonce = randomUUID();
  let doc = buildBlobSafeSrcdoc(html, opts);
  if (opts?.deck) doc = injectDeckPrintStylesheet(doc);
  doc = injectPrintReadyHandshake(doc, nonce);

  // Desktop native PDF bridge — the main process runs a direct
  // Save-as-PDF flow: a native Save dialog, then Electron's
  // webContents.printToPDF() straight to the chosen file (issue #1774;
  // see apps/desktop/src/main/pdf-export.ts). The sandboxed wrapper
  // omits allow-modals here because the native flow never calls
  // window.print(); granting it would let untrusted artifact code call
  // alert()/confirm() and stall the hidden Electron window indefinitely.
  if (isOpenDesignHostAvailable()) {
    if (sandboxedPreview) {
      doc = buildSandboxedPreviewDocument(doc, title);
    }
    doc = injectParentPrintReadyCache(doc, nonce);
    try {
      const result = await printHostPdf(doc, nonce, opts?.deck ? { deck: true } : undefined);
      if (result.ok) return;
      if (typeof alert !== 'undefined') {
        alert('Print failed. Please try Export PDF again or use the browser version.');
      }
    } catch {
      if (typeof alert !== 'undefined') {
        alert('Print failed. Please try Export PDF again or use the browser version.');
      }
    }
    return;
  }

  // Browser fallback (pure web): assemble the PDF programmatically — capture
  // each slide (deck) or the full page through the export-capture bridge, then
  // build it with jsPDF. No print dialog, no agent. The window.print() popup
  // below is kept only as a last-resort fallback if the capture path throws.
  try {
    await exportArtifactAsPdf(html, title, { deck: !!opts?.deck, onProgress: opts?.onProgress });
    return;
  } catch (err) {
    console.warn('[exportAsPdf] programmatic PDF failed, falling back to print popup:', err);
  }

  // Last-resort: wrap with allow-modals so the injected script can call
  // window.print(), then inject the self-printing script and open a popup.
  if (sandboxedPreview) {
    doc = buildSandboxedPreviewDocument(doc, title, { allowModals: true });
  }
  // Even in the non-sandboxed browser fallback we keep the same readiness
  // cache contract as the desktop bridge so the popup can wait for actual
  // rendered content instead of printing after a blind fixed delay.
  doc = injectParentPrintReadyCache(doc, nonce);
  doc = injectPrintScript(doc, title);

  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Open an empty tab synchronously (without noopener) to reliably detect popup blocking.
  // Since window.open with 'noopener' returns null on success by specification,
  // this approach allows us to distinguish between a successful export and a blocked popup.
  const win = window.open('', '_blank');

  if (!win) {
    if (typeof alert !== 'undefined') {
      alert('Popup blocked! Click the popup-blocked icon in your browser address bar (or browser menu), choose "Always allow pop-ups" for this site, then retry Export PDF.');
    }
    URL.revokeObjectURL(url);
    return;
  }

  if (sandboxedPreview) {
    try {
      win.opener = null;
    } catch (e) {
      // Guard against potential context environment restrictions
    }
  }

  // Navigate the verified window to the generated Blob URL then release
  // the Blob URL after the tab has had time to start loading it.
  win.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A reported print size is only usable when both dimensions are positive,
 * finite numbers. The desktop bridge (apps/desktop/src/main/pdf-export.ts
 * inferPageSize) sizes the PDF page to this; a zero/invalid size makes it
 * fall back to measuring the wrapper viewport, which — per that function's
 * own docs — blanks artifacts whose visible content sits below the fold.
 * Exported so the injected handshake/cache scripts and unit tests share one
 * definition. See issue #4458.
 */
export function isUsablePrintSize(width: unknown, height: unknown): boolean {
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

/**
 * Poll `measure` once per animation frame until it returns a usable
 * (positive, finite) size, then call `report` with it. Bounded by
 * `maxFrames`: a genuinely empty artifact never gains a usable size, so the
 * last measurement is reported best-effort rather than hanging the desktop
 * readiness handshake forever.
 *
 * This fixes one #4458 blank-PDF path: the in-iframe handshake used to
 * report the content size after a fixed two animation frames, which can fire
 * before a heavier artifact has finished layout (size still 0). The desktop
 * bridge then has no usable `__odPrintSize`, falls back to the wrapper
 * viewport, and prints a blank page. Waiting for a non-zero size avoids that.
 *
 * Injected into the handshake via `toString()`; the function is self-contained
 * (no references to other module symbols) so production minification cannot
 * break the injected copy. The `raf` seam keeps it unit-testable.
 */
export function reportPrintSizeWhenStable(
  measure: () => { width: number; height: number },
  report: (size: { width: number; height: number }) => void,
  maxFrames: number,
  raf: (cb: () => void) => void = (cb) => requestAnimationFrame(() => cb()),
): void {
  const usable = (w: number, h: number): boolean =>
    typeof w === 'number' &&
    typeof h === 'number' &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w > 0 &&
    h > 0;
  const step = (remaining: number): void => {
    const size = measure();
    if (usable(size.width, size.height) || remaining <= 0) {
      report(size);
      return;
    }
    raf(() => step(remaining - 1));
  };
  step(maxFrames);
}

function injectPrintScript(doc: string, title: string): string {
  const safeTitle = JSON.stringify(title || 'artifact');
  // Browser fallback PDF export shares the same print-readiness signal as the
  // desktop native path. When the cache is present, wait for it so the popup
  // prints only after fonts, images, CSS image URLs, and final layout have
  // settled. If the handshake script is blocked entirely (for example by a
  // CSP that forbids inline scripts), fall back to the historical load+delay
  // behavior instead of waiting for the full ready deadline.
  const script = `<script>(function(){try{document.title=${safeTitle}}catch(e){}function doPrint(){try{window.focus();window.print()}catch(e){}}function afterStableFrames(fn){requestAnimationFrame(function(){requestAnimationFrame(fn)})}window.addEventListener('load',function(){if(typeof window.__odPrintReady!=='boolean'){setTimeout(doPrint,300);return}var deadline=Date.now()+30000;var handshakeStartDeadline=Date.now()+1000;(function waitForReady(){if(window.__odPrintReady===true){afterStableFrames(doPrint);return}if(window.__odPrintReadyStarted===false&&Date.now()>=handshakeStartDeadline){setTimeout(doPrint,300);return}if(Date.now()>=deadline){afterStableFrames(doPrint);return}setTimeout(waitForReady,50)})()})})();</script>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${script}</head>`);
  if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${script}</body>`);
  return doc + script;
}

function injectPrintReadyHandshake(doc: string, nonce: string): string {
  // Wait for fonts, the window load event (which covers initial images), and
  // any images that are still loading after load fires (dynamically added or
  // slow images that weren't complete by the time this script ran). Also wait
  // for CSS image URLs and two animation frames so background/list/border
  // images and final layout are settled before the desktop bridge prints.
  // This mirrors the safety of the legacy waitForPrintableContent() helper and
  // prevents image-heavy exports from printing with blank images.
  //
  // Once settled, the message also carries the artifact's own content
  // dimensions (scroll/offset size of its documentElement). This script runs
  // inside the sandboxed preview iframe, which the parent wrapper cannot
  // measure directly (sandbox="allow-scripts" has no allow-same-origin, so
  // iframe.contentDocument is null). Reporting the size from here lets the
  // desktop bridge size the PDF page to the real content instead of the
  // wrapper's viewport, which otherwise clips — or blanks — taller artifacts
  // (issue #4067). The parent caches it via injectParentPrintReadyCache and
  // inferPageSize() in apps/desktop/src/main/pdf-export.ts consumes it.
  //
  // The nonce is a per-export random UUID that verifies the readiness signal
  // came from our injected handshake, not a spoofed message from untrusted
  // artifact code.
  const script = `<script data-od-print-ready>(function(){window.parent.postMessage({type:'OD_PRINT_READY_STARTED',nonce:'${nonce}'},'*');function waitForImages(){var imgs=Array.from(document.images).filter(function(img){if(img.loading==='lazy')img.loading='eager';return !img.complete});return Promise.all(imgs.map(function(img){return new Promise(function(r){img.addEventListener('load',r,{once:true});img.addEventListener('error',r,{once:true});if(img.complete)r()})}))}function cssUrlValues(value){var urls=[];if(!value||value==='none')return urls;value.replace(/url\\((['"]?)(.*?)\\1\\)/g,function(_,q,rawUrl){if(rawUrl&&!/^data:/i.test(rawUrl))urls.push(rawUrl);return''});return urls}function waitForCssBackgroundImages(){var urls=new Set();Array.from(document.querySelectorAll('*')).forEach(function(el){var style=window.getComputedStyle(el);cssUrlValues(style.backgroundImage).forEach(function(url){urls.add(url)});cssUrlValues(style.borderImageSource).forEach(function(url){urls.add(url)});cssUrlValues(style.listStyleImage).forEach(function(url){urls.add(url)})});return Promise.all(Array.from(urls).map(function(url){return new Promise(function(r){var img=new Image();img.onload=r;img.onerror=r;img.src=url})}))}function nextFrame(){return new Promise(function(r){requestAnimationFrame(function(){r(true)})})}Promise.all([document.fonts&&document.fonts.ready?document.fonts.ready.catch(function(){}):Promise.resolve(),new Promise(function(r){if(document.readyState==='complete')r();else window.addEventListener('load',r,{once:true})})]).then(function(){return Promise.all([waitForImages(),waitForCssBackgroundImages()])}).then(nextFrame).then(nextFrame).then(function(){var __odReport=${reportPrintSizeWhenStable.toString()};function measure(){var de=document.documentElement;var b=document.body||de;return {width:Math.max(de.scrollWidth,b.scrollWidth,de.offsetWidth,b.offsetWidth),height:Math.max(de.scrollHeight,b.scrollHeight,de.offsetHeight,b.offsetHeight)}}__odReport(measure,function(size){window.parent.postMessage({type:'OD_PRINT_READY',nonce:'${nonce}',width:size.width,height:size.height},'*')},30)})})();<\/script>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${script}</head>`);
  if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${script}</body>`);
  return doc + script;
}

function injectParentPrintReadyCache(doc: string, nonce: string): string {
  // Cache the readiness flag and the content size the artifact reports through
  // the handshake. window.__odPrintSize is read by inferPageSize() in
  // apps/desktop/src/main/pdf-export.ts to size the PDF page to the real
  // artifact rather than the wrapper viewport (issue #4067). Width/height are
  // validated as positive finite numbers so a malformed message cannot poison
  // the page size; the nonce + source check keep untrusted frames from spoofing
  // either signal. window.__odPrintReadyStarted distinguishes a live handshake
  // from a CSP-blocked one so the browser fallback can preserve the historical
  // quick print path when the inner script never runs.
  const script = `<script>window.__odPrintReady=false;window.__odPrintReadyStarted=false;window.__odPrintSize=null;var __odUsable=${isUsablePrintSize.toString()};window.addEventListener('message',function(e){if(e.data&&e.data.nonce==='${nonce}'&&(e.source===window||(window.frames&&e.source===window.frames[0]))){if(e.data.type==='OD_PRINT_READY_STARTED'){window.__odPrintReadyStarted=true;return}if(e.data.type==='OD_PRINT_READY'){window.__odPrintReady=true;if(__odUsable(e.data.width,e.data.height))window.__odPrintSize={width:e.data.width,height:e.data.height}}}});<\/script>`;
  if (/<head>/i.test(doc)) return doc.replace(/<head>/i, `<head>${script}`);
  return script + doc;
}

// Stitches every .slide into a vertical multi-page PDF: 1920×1080 per page,
// no margins, scroll-snap and horizontal flex disabled. `!important` guards
// override skill-specific styles that pin the deck to `display: flex` /
// `overflow: hidden` for on-screen swiping.
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
    /* Decks commonly show one slide at a time via opacity; without this the
       inactive slides print as blank pages. Force every slide visible (and
       freeze entrance animations) so each becomes a real page. */
    opacity: 1 !important;
    visibility: visible !important;
    animation: none !important;
    transition: none !important;
  }
  .slide:last-child, [data-screen-label]:last-child { page-break-after: auto; break-after: auto; }
  .deck-counter, .deck-hint, .deck-nav,
  [aria-label="Previous slide"], [aria-label="Next slide"] {
    display: none !important;
  }
}
`;

function injectDeckPrintStylesheet(doc: string): string {
  const tag = `<style data-deck-print="injected">${DECK_PRINT_CSS}</style>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${tag}</head>`);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  return tag + doc;
}

// ===========================================================================
// Programmatic client-side capture + PDF assembly.
//
// The in-iframe capture half lives in ./srcdoc.ts (injectExportCaptureBridge).
// Here we drive it: spin up a hidden, full-resolution export iframe, collect
// one image per slide, then assemble the output with jsPDF — entirely in the
// browser, with no print dialog and no agent/model call. The library is
// dynamically imported so it stays out of the
// main bundle until an export actually runs.
// ===========================================================================

export type CapturedSlide = {
  index: number;
  dataUrl?: string;
  w: number;
  h: number;
  notes?: string;
};

/** Progress callback: `(slidesDone, totalSlides)`. */
export type ExportProgress = (done: number, total: number) => void;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForIframeWindow(iframe: HTMLIFrameElement, timeout = 15_000): Promise<Window> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const win = iframe.contentWindow;
      if (win) resolve(win);
      else reject(new Error('export iframe window unavailable'));
    };
    const timer = setTimeout(finish, timeout);
    iframe.addEventListener('load', finish, { once: true });
  });
}

type CaptureRequest = {
  id: string;
  mode: 'image';
  deck: boolean;
  single?: boolean;
  delay: number;
};

/**
 * Drive the in-iframe export-capture bridge for one window, invoking `onSlide`
 * for each captured slide. Resolves on the bridge's `done`, rejects on its
 * `error` or an inactivity timeout (so a wedged capture never hangs forever).
 */
function runExportCapture(
  win: Window,
  req: CaptureRequest,
  onSlide: (slide: CapturedSlide, total: number) => void,
  timeoutMs = 120_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let lastActivity = Date.now();
    const cleanup = () => {
      window.removeEventListener('message', onMsg);
      clearInterval(watchdog);
    };
    function onMsg(ev: MessageEvent) {
      if (ev.source !== win) return;
      const d = ev.data as {
        type?: string; id?: string; index?: number; total?: number;
        dataUrl?: string; w?: number; h?: number;
        notes?: string; error?: string;
      } | null;
      if (!d || d.id !== req.id) return;
      if (d.type === 'od:export-capture:slide') {
        lastActivity = Date.now();
        onSlide(
          {
            index: d.index ?? 0,
            dataUrl: d.dataUrl,
            w: d.w ?? 0,
            h: d.h ?? 0,
            notes: typeof d.notes === 'string' ? d.notes : '',
          },
          d.total ?? 1,
        );
      } else if (d.type === 'od:export-capture:done') {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
      } else if (d.type === 'od:export-capture:error') {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error(String(d.error || 'export capture failed')));
      }
    }
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > timeoutMs) {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('export capture timed out'));
      }
    }, 2_000);
    window.addEventListener('message', onMsg);
    try {
      win.postMessage({ type: 'od:export-capture', ...req }, '*');
    } catch (err) {
      finished = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Capture every slide of a deck (or the full page, for a non-deck artifact) by
 * rendering the HTML in a hidden, full-resolution export iframe and driving the
 * export-capture bridge. Returns the slides ordered by index.
 */
async function captureArtifactSlides(
  html: string,
  opts: {
    deck: boolean;
    mode: 'image';
    width?: number;
    height?: number;
    onProgress?: ExportProgress;
    timeoutMs?: number;
  },
): Promise<CapturedSlide[]> {
  const width = opts.width ?? (opts.deck ? 1920 : 1440);
  const height = opts.height ?? (opts.deck ? 1080 : 900);
  const timeoutMs = opts.timeoutMs ?? 45_000;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;border:0;background:#fff;`;
  iframe.srcdoc = buildSrcdoc(html, { deck: opts.deck });
  document.body.appendChild(iframe);

  const slides: CapturedSlide[] = [];
  try {
    const win = await waitForIframeWindow(iframe, Math.min(timeoutMs, 15_000));
    // Give the deck bridge time to fit fixed-canvas (transform: scale) layouts
    // to the iframe before the first capture.
    await delayMs(opts.deck ? 600 : 150);
    await runExportCapture(
      win,
      {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode: opts.mode,
        deck: opts.deck,
        delay: 350,
      },
      (slide, total) => {
        slides.push(slide);
        opts.onProgress?.(slides.length, total);
      },
      timeoutMs,
    );
  } finally {
    iframe.remove();
  }
  slides.sort((a, b) => a.index - b.index);
  return slides;
}

/** Programmatic, client-side image export for an in-memory HTML snapshot. */
export async function exportArtifactImageDataUrl(
  html: string,
  opts: { deck: boolean; onProgress?: ExportProgress; timeoutMs?: number },
): Promise<PreviewSnapshot> {
  const slides = await captureArtifactSlides(html, {
    deck: opts.deck,
    mode: 'image',
    onProgress: opts.onProgress,
    timeoutMs: opts.timeoutMs,
  });
  const images = slides.filter((s) => s.dataUrl && s.w > 0 && s.h > 0);
  if (!images.length) throw new Error('Nothing was captured for image export');
  if (images.length === 1) {
    const image = images[0]!;
    return { dataUrl: image.dataUrl!, w: image.w, h: image.h };
  }

  const width = Math.max(...images.map((image) => image.w));
  const height = images.reduce((sum, image) => sum + image.h, 0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  let top = 0;
  for (const image of images) {
    const element = await loadImageFromDataUrl(image.dataUrl!);
    ctx.drawImage(element, 0, top, image.w, image.h);
    top += image.h;
  }

  return { dataUrl: canvas.toDataURL('image/png'), w: width, h: height };
}

/** Programmatic, client-side PDF: image-per-slide (deck) or paginated full page. */
export async function exportArtifactAsPdf(
  html: string,
  title: string,
  opts: { deck: boolean; onProgress?: ExportProgress; timeoutMs?: number },
): Promise<void> {
  const slides = await captureArtifactSlides(html, {
    deck: opts.deck,
    mode: 'image',
    onProgress: opts.onProgress,
    timeoutMs: opts.timeoutMs,
  });
  const images = slides.filter((s) => s.dataUrl && s.w > 0 && s.h > 0);
  if (!images.length) throw new Error('Nothing was captured for PDF export');

  const { jsPDF } = await import('jspdf');
  const filename = `${safeFilename(title, 'artifact')}.pdf`;

  if (opts.deck) {
    const first = images[0]!;
    const pdf = new jsPDF({
      orientation: first.w >= first.h ? 'landscape' : 'portrait',
      unit: 'px',
      format: [first.w, first.h],
      compress: true,
    });
    images.forEach((s, i) => {
      if (i > 0) pdf.addPage([s.w, s.h], s.w >= s.h ? 'landscape' : 'portrait');
      pdf.addImage(s.dataUrl!, 'PNG', 0, 0, s.w, s.h);
    });
    triggerDownload(pdf.output('blob'), filename);
    return;
  }

  // Non-deck: slice the tall full-page capture into A4-proportioned pages.
  const img = images[0]!;
  const pageW = img.w;
  const pageH = Math.max(1, Math.round(pageW * Math.SQRT2)); // A4 portrait ≈ 1:1.414
  const pages = Math.max(1, Math.ceil(img.h / pageH));
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [pageW, pageH], compress: true });
  for (let p = 0; p < pages; p++) {
    if (p > 0) pdf.addPage([pageW, pageH], 'portrait');
    pdf.addImage(img.dataUrl!, 'PNG', 0, -p * pageH, img.w, img.h);
  }
  triggerDownload(pdf.output('blob'), filename);
}

/** Build a one-image PDF from an already-captured preview snapshot. */
export async function exportSnapshotAsPdf(
  snapshot: PreviewSnapshot,
  title: string,
): Promise<void> {
  if (!snapshot.dataUrl || snapshot.w <= 0 || snapshot.h <= 0) {
    throw new Error('Nothing was captured for PDF export');
  }
  const image = await loadImageFromDataUrl(snapshot.dataUrl);
  const width = snapshot.w || image.naturalWidth || image.width;
  const height = snapshot.h || image.naturalHeight || image.height;
  if (width <= 0 || height <= 0) throw new Error('Nothing was captured for PDF export');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: width >= height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
    compress: true,
  });
  pdf.addImage(snapshot.dataUrl, 'PNG', 0, 0, width, height);
  triggerDownload(pdf.output('blob'), `${safeFilename(title, 'artifact')}.pdf`);
}
