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

export function buildDesignHandoffContent(opts: {
  title: string;
  entryFile: string;
  files?: string[];
  kind?: 'html' | 'react';
}): string {
  const title = opts.title || 'Open Design artifact';
  const entryFile = opts.entryFile || 'index.html';
  const files = Array.from(new Set([entryFile, ...(opts.files ?? [])])).sort((a, b) => a.localeCompare(b));
  const htmlFiles = files.filter((name) => /\.html?$/i.test(name));
  const cssFiles = files.filter((name) => /\.css$/i.test(name));
  const jsFiles = files.filter((name) => /\.[cm]?[jt]sx?$/i.test(name));
  const assetFiles = files.filter((name) => !htmlFiles.includes(name) && !cssFiles.includes(name) && !jsFiles.includes(name));
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
Validate the implementation at these minimum browser viewports:
- Desktop: 1440×900
- Tablet: 1024×768
- Mobile: 390×844

For responsive web exports, treat these as breakpoints for one adaptive web experience. Do not split responsive web into unrelated native app screens unless the project explicitly includes native targets. ${hasResponsiveClues ? 'Preserve any CSS media queries, container queries, fluid `clamp()` scales, and layout changes already present in the exported files.' : 'If responsive rules are not present in the export, add them in the target implementation before shipping.'}

## Design fidelity contract
- Extract reusable tokens before writing components: background, surface, foreground, muted text, border, accent, radius, shadow, spacing, type scale, and motion duration/easing.
- Match layout geometry: max-widths, gutters, grid columns, card proportions, sticky/fixed elements, and viewport-specific navigation.
- Preserve real copy, labels, and data shown in the export. Do not replace specific text with generic marketing filler.
- Preserve interactive affordances: hover, focus, pressed, disabled, loading, validation, copy/share, tab/accordion, modal/sheet, and keyboard states where present.
- Preserve accessibility semantics when converting: headings stay hierarchical, controls remain buttons/links/inputs, focus states stay visible.
- Do not keep prototype-only annotations, frame labels, or Open Design chrome in the production UI.

## Color and brand contract
- Use the exported design tokens and product/domain context as the color source of truth.
- Do not introduce warm beige / cream / peach / pink / orange-brown background washes unless they are already explicit brand/reference colors in the export.
- ${accentLikelyBrandLed ? 'A stylesheet or design/token file was detected; inspect it for canonical color variables before choosing framework theme tokens.' : 'No obvious token stylesheet was detected; sample colors from the entry file and convert them into named tokens before coding.'}

## Implementation sequence for AI coding tools
1. Open \`${entryFile}\` and identify screens/sections/components.
2. Extract a token table from CSS/root styles and inline styles before building framework components.
3. Build components from largest layout regions down to controls; avoid starting with isolated atoms that lose spatial intent.
4. Port responsive behavior at desktop/tablet/mobile breakpoints and test each viewport before cleanup.
5. Port interactions and states, then replace static placeholders only with real app data or functional equivalents.
6. Compare final screenshots against the export at 1440×900, 1024×768, and 390×844 before declaring done.

## Entry points
${list(htmlFiles.length > 0 ? htmlFiles : [entryFile])}

## Styles
${list(cssFiles)}

## Scripts/components
${list(jsFiles)}

## Assets and supporting files
${list(assetFiles)}

## Coding checklist for AI tools
1. Inspect \`${entryFile}\` first and identify reusable components before coding.
2. Extract design tokens into the target stack: colors, type scale, spacing, radius, shadows, and motion.
3. Implement layout with real responsive breakpoints and test desktop/tablet/mobile.
4. Preserve interactive controls, hover/focus/pressed states, form behavior, validation, and copy actions where present.
5. Confirm the production result visually matches the exported design before refactoring internals.
6. Reject implementation shortcuts that flatten the design into generic cards, generic gradients, placeholder stats, or framework-default typography.
7. If a detail is ambiguous, keep the exported HTML/CSS behavior rather than inventing a new pattern.
`;
}

export function exportAsZip(html: string, title: string): void {
  const doc = buildSrcdoc(html);
  const slug = safeFilename(title, 'artifact');
  const blob = buildZip([
    { path: `${slug}/index.html`, content: doc },
    {
      path: `${slug}/DESIGN-HANDOFF.md`,
      content: buildDesignHandoffContent({
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
      path: `${slug}/DESIGN-HANDOFF.md`,
      content: buildDesignHandoffContent({
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
export function exportAsPdf(
  html: string,
  title: string,
  opts?: SrcdocOptions & { sandboxedPreview?: boolean },
): void {
  const sandboxedPreview = opts?.sandboxedPreview ?? true;
  let doc = buildSrcdoc(html, opts);
  if (opts?.deck) doc = injectDeckPrintStylesheet(doc);
  doc = injectPrintScript(doc, title);
  if (sandboxedPreview) {
    // `allow-modals` is needed so the child can show the browser print dialog;
    // it still does not grant same-origin access to the generated document.
    doc = buildSandboxedPreviewDocument(doc, title, { allowModals: true });
  }
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Open an empty tab synchronously (without noopener) to reliably detect popup blocking.
  // Since window.open with 'noopener' returns null on success by specification,
  // this approach allows us to distinguish between a successful export and a blocked popup.
  const win = window.open('', '_blank');

  if (!win) {
    if (typeof alert !== 'undefined') {
      alert('Popup blocked! Please allow popups for this site to export as PDF.');
    }
    URL.revokeObjectURL(url); // Prevent memory leaks on early exit
    return;
  }

  if (sandboxedPreview) {
    try {
      // Disassociate the opener reference to preserve sandboxing/noopener behavior
      win.opener = null;
    } catch (e) {
      // Guard against potential context environment restrictions
    }
  }

  // Navigate the verified window to the generated Blob URL
  win.location.href = url;
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
