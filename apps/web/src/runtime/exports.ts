// Client-side export helpers used by the Share menu in the HTML viewer.
// Four of the five formats run entirely in the browser:
//   - PDF  : open the artifact in a popup window and trigger window.print().
//            The user picks "Save as PDF" from the system print dialog.
//   - HTML : download the artifact as a single .html file via a Blob URL.
//   - ZIP  : pack the artifact with a coding handoff guide (see ./zip.ts).
//   - MD   : download the artifact's source verbatim with a `.md` extension
//            so it can be ingested by markdown-aware tooling (LLM context
//            windows, vault apps, etc.). No conversion is performed — the
//            file content is the same source the Source view shows. See
//            issue #279.
// PPTX export is fundamentally different — it asks the agent to convert the
// artifact server-side, so it lives in ProjectView.tsx (not here).

import { buildSrcdoc, type SrcdocOptions } from './srcdoc';
import { buildReactComponentSrcdoc } from './react-component';
import { buildZip } from './zip';
import { randomUUID } from '../utils/uuid';

const DESIGN_HANDOFF_FILENAME = 'DESIGN-HANDOFF.md';
const DESIGN_MANIFEST_FILENAME = 'DESIGN-MANIFEST.json';

function safeFilename(name: string, fallback: string): string {
  const slug = (name || fallback)
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke later — Safari sometimes hasn't finished reading the blob yet
  // when the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function exportAsHtml(html: string, title: string): void {
  const doc = buildSrcdoc(html);
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  triggerDownload(blob, `${safeFilename(title, 'artifact')}.html`);
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
export function requestPreviewSnapshot(
  iframe: HTMLIFrameElement,
  timeout = 2500,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  const win = iframe.contentWindow;
  if (!win) return Promise.resolve(null);
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
      if (d.dataUrl && d.w && d.h) resolve({ dataUrl: d.dataUrl, w: d.w, h: d.h });
      else resolve(null);
    }
    window.addEventListener('message', onMsg);
    try {
      win.postMessage({ type: 'od:snapshot', id }, '*');
    } catch {
      /* sandboxed */
    }
    setTimeout(() => {
      if (!done) {
        done = true;
        window.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, timeout);
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
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
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

export type ProjectPdfExportResult = 'desktop' | 'fallback';

export async function exportProjectAsPdf(opts: {
  deck: boolean;
  fallbackPdf: () => void;
  filePath: string;
  projectId: string;
  title: string;
}): Promise<ProjectPdfExportResult> {
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(opts.projectId)}/export/pdf`, {
      body: JSON.stringify({
        deck: opts.deck,
        fileName: opts.filePath,
        title: opts.title,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!resp.ok) throw new Error(`desktop PDF export unavailable (${resp.status})`);
    const body = await resp.json().catch(() => ({}));
    if (body && body.ok === false) throw new Error(body.error || 'desktop PDF export failed');
    return 'desktop';
  } catch (err) {
    console.warn('[exportProjectAsPdf] falling back to browser print:', err);
    opts.fallbackPdf();
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
}): Promise<void> {
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

export function openSandboxedPreviewInNewTab(
  html: string,
  title: string,
  srcdocOptions?: SrcdocOptions,
): void {
  const doc = buildSandboxedPreviewDocument(buildSrcdoc(html, srcdocOptions), title);
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
  opts?: SrcdocOptions & { sandboxedPreview?: boolean },
): Promise<void> {
  const sandboxedPreview = opts?.sandboxedPreview ?? true;
  // Generate a per-export nonce so the print-ready handshake is resistant to
  // spoofing by untrusted scripts inside the exported artifact.
  const nonce = randomUUID();
  let doc = buildSrcdoc(html, opts);
  if (opts?.deck) doc = injectDeckPrintStylesheet(doc);
  doc = injectPrintReadyHandshake(doc, nonce);

  // Desktop native print bridge — uses Electron's webContents.print() API
  // instead of window.open + window.print(). The sandboxed wrapper omits
  // allow-modals here because the native flow doesn't call window.print();
  // granting it would let untrusted artifact code call alert()/confirm()
  // and stall the hidden Electron window indefinitely.
  const desktopApi =
    typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>).__odDesktop as
          | { printPdf?: (html: string, nonce?: string) => Promise<void>; isDesktop?: boolean }
          | undefined
      : undefined;
  if (desktopApi?.printPdf) {
    if (sandboxedPreview) {
      doc = buildSandboxedPreviewDocument(doc, title);
    }
    doc = injectParentPrintReadyCache(doc, nonce);
    try {
      await desktopApi.printPdf(doc, nonce);
    } catch {
      if (typeof alert !== 'undefined') {
        alert('Print failed. Please try Export PDF again or use the browser version.');
      }
    }
    return;
  }

  // Browser fallback: wrap with allow-modals so the injected script can
  // call window.print(), then inject the self-printing script and open a
  // popup.
  if (sandboxedPreview) {
    doc = buildSandboxedPreviewDocument(doc, title, { allowModals: true });
    doc = injectParentPrintReadyCache(doc, nonce);
  }
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

function injectPrintScript(doc: string, title: string): string {
  const safeTitle = JSON.stringify(title || 'artifact');
  // setTimeout gives stylesheets and images one tick to settle before the
  // print dialog measures the page; without it some print previews come
  // out blank in Chrome.
  const script = `<script>try{document.title=${safeTitle}}catch(e){}window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print()}catch(e){}},300)})</script>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${script}</head>`);
  if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${script}</body>`);
  return doc + script;
}

function injectPrintReadyHandshake(doc: string, nonce: string): string {
  // Wait for fonts, the window load event (which covers initial images), and
  // any images that are still loading after load fires (dynamically added or
  // slow images that weren't complete by the time this script ran). This
  // mirrors the safety of the legacy waitForPrintableContent() helper and
  // prevents image-heavy exports from printing with blank images.
  //
  // The nonce is a per-export random UUID that verifies the readiness signal
  // came from our injected handshake, not a spoofed message from untrusted
  // artifact code.
  const script = `<script data-od-print-ready>(function(){Promise.all([document.fonts&&document.fonts.ready?document.fonts.ready.catch(function(){}):Promise.resolve(),new Promise(function(r){if(document.readyState==='complete')r();else window.addEventListener('load',r,{once:true})})]).then(function(){var imgs=Array.from(document.images).filter(function(img){return !img.complete});return Promise.all(imgs.map(function(img){return new Promise(function(r){img.addEventListener('load',r,{once:true});img.addEventListener('error',r,{once:true});if(img.complete)r()})}))}).then(function(){window.parent.postMessage({type:'OD_PRINT_READY',nonce:'${nonce}'},'*')})})();<\/script>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${script}</head>`);
  if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${script}</body>`);
  return doc + script;
}

function injectParentPrintReadyCache(doc: string, nonce: string): string {
  const script = `<script>window.__odPrintReady=false;window.addEventListener('message',function(e){if(e.data&&e.data.type==='OD_PRINT_READY'&&e.data.nonce==='${nonce}'&&(e.source===window||(window.frames&&e.source===window.frames[0])))window.__odPrintReady=true});<\/script>`;
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
