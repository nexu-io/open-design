// @ts-nocheck
// Project files registry. Each project is a folder under
// <projectRoot>/.od/projects/<projectId>/. The frontend's project list
// (localStorage) carries metadata; this module is the single owner of the
// on-disk content (HTML artifacts, sketches, uploaded images, pasted text).
//
// All paths flowing in from HTTP handlers are validated against the project
// directory to prevent path traversal — see resolveSafe().

import { link, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {
  inferLegacyManifest,
  parsePersistedManifest,
  validateArtifactManifestInput,
} from './artifact-manifest.js';
import {
  ArtifactRegressionError,
  STUB_GUARDED_MANIFEST_KINDS,
  evaluateArtifactStubGuard,
  readArtifactStubGuardConfigFromEnv,
} from './artifact-stub-guard.js';

const FORBIDDEN_SEGMENT = /^$|^\.\.?$/;
const RESERVED_PROJECT_FILE_SEGMENTS = new Set(['.live-artifacts']);
const DESIGN_HANDOFF_FILENAME = 'DESIGN-HANDOFF.md';
const DESIGN_MANIFEST_FILENAME = 'DESIGN-MANIFEST.json';
export const projectFileRenameTestHooks = {
  beforeCommit: null as null | ((paths: { source: string; target: string }) => Promise<void> | void),
};

export function projectDir(projectsRoot, projectId) {
  if (!isSafeId(projectId)) throw new Error('invalid project id');
  return path.join(projectsRoot, projectId);
}

// Returns the folder a project's files live in. For git-linked projects
// (metadata.baseDir set), this is the user's own folder. Otherwise falls
// back to the standard computed path under projectsRoot.
export function resolveProjectDir(projectsRoot, projectId, metadata?) {
  if (typeof metadata?.baseDir === 'string') {
    const p = path.normalize(metadata.baseDir);
    if (path.isAbsolute(p)) return p;
  }
  if (!isSafeId(projectId)) throw new Error('invalid project id');
  return path.join(projectsRoot, projectId);
}

export async function ensureProject(projectsRoot, projectId, metadata?) {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  // Git-linked folders already exist; skip mkdir to avoid side-effects.
  if (typeof metadata?.baseDir !== 'string') {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function listFiles(projectsRoot, projectId, opts = {}) {
  const metadata = opts?.metadata;
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const out = [];
  // Skip build/install dirs for linked folders so node_modules doesn't stall
  // the walk on large repos.
  const skipDirs = metadata?.baseDir ? SKIP_DIRS : undefined;
  await collectFiles(dir, '', out, skipDirs);
  // Newest first — matches the visual order users expect after generating.
  out.sort((a, b) => b.mtime - a.mtime);
  const since = Number(opts.since);
  if (Number.isFinite(since) && since > 0) {
    return out.filter((f) => Number(f.mtime) > since);
  }
  return out;
}

// Build/install dirs that should be hidden from the file panel when a
// project is rooted at metadata.baseDir (the user's own folder). Without
// this, the listing would be dominated by node_modules, lockfiles, and
// build output that have no design value.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.turbo',
  '.cache', '.output', 'out', 'coverage', '__pycache__', '.venv',
  'vendor', 'target', '.od', '.tmp',
]);

// Best-effort entry-file detector — looks for index.html at the root,
// then any *.html file. Returns null if nothing obvious is found, in
// which case the project simply opens to the file panel with no
// auto-selected tab.
export async function detectEntryFile(dir: string): Promise<string | null> {
  try {
    await stat(path.join(dir, 'index.html'));
    return 'index.html';
  } catch { /* not found */ }
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const htmlFile = entries.find((e) => e.isFile() && /\.html?$/i.test(e.name));
    if (htmlFile) return htmlFile.name;
  } catch { /* ignore */ }
  return null;
}

async function collectFiles(dir, relDir, out, skipDirs?: Set<string>) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs && skipDirs.has(e.name)) continue;
      await collectFiles(full, rel, out, skipDirs);
      continue;
    }
    if (!e.isFile()) continue;
    if (e.name.endsWith('.artifact.json')) continue;
    const st = await stat(full);
    const manifest = await readManifestForPath(dir, rel);
    out.push({
      name: rel,
      path: rel,
      type: 'file',
      size: st.size,
      mtime: st.mtimeMs,
      kind: kindFor(rel),
      mime: mimeFor(rel),
      artifactKind: manifest?.kind,
      artifactManifest: manifest,
    });
  }
}

// Build a ZIP of every file under the project directory (or under `root`,
// if it points at a subdirectory). Mirrors listFiles' filtering — dotfiles
// and `.artifact.json` sidecars are excluded — so the archive matches what
// the user sees in the file panel. Used by the "Download as .zip" share
// menu item, which exports the user's actual project tree (e.g. the
// uploaded `ui-design/` folder), not just the rendered HTML.
export async function buildProjectArchive(projectsRoot, projectId, root, metadata?) {
  const projectRoot = resolveProjectDir(projectsRoot, projectId, metadata);
  let archiveRoot = projectRoot;
  let archiveBaseName = '';
  if (typeof root === 'string' && root.trim().length > 0) {
    // Use the symlink-aware resolver so that an imported folder containing
    // e.g. `docs -> /Users/me/.ssh` cannot exfiltrate via
    // GET /api/projects/:id/archive?root=docs. resolveSafe()'s string
    // prefix check would let the literal path stay under projectRoot, then
    // collectArchiveEntries() / readFile() would follow the symlink at
    // open() time and zip files outside the project tree.
    archiveRoot = await resolveSafeReal(projectRoot, root);
    archiveBaseName = path.basename(archiveRoot);
  }

  // Stat the archive root up-front so a missing/non-directory target gives a
  // clear ENOENT/ENOTDIR error. Without this the recursive walk swallows
  // ENOENT and we'd report the directory as "empty" instead — confusing if
  // the project (or a subdir) was deleted concurrently with the download.
  let rootStat;
  try {
    rootStat = await stat(archiveRoot);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const e = new Error('archive root does not exist');
      e.code = 'ENOENT';
      throw e;
    }
    throw err;
  }
  if (!rootStat.isDirectory()) {
    const err = new Error('archive root is not a directory');
    err.code = 'ENOTDIR';
    throw err;
  }

  const entries = [];
  await collectArchiveEntries(archiveRoot, '', entries);
  if (entries.length === 0) {
    const err = new Error('archive root is empty');
    err.code = 'ENOENT';
    throw err;
  }

  const zip = new JSZip();
  for (const entry of entries) {
    const buf = await readFile(entry.fullPath);
    zip.file(entry.relPath, buf, {
      date: new Date(entry.mtime),
      binary: true,
    });
  }
  addDesignHandoff(zip, entries, archiveBaseName || path.basename(projectRoot));
  addDesignManifest(zip, entries, archiveBaseName || path.basename(projectRoot));
  // Level 6 is the zlib default — balances speed and ratio for typical
  // project trees (HTML/CSS/JS plus a handful of assets). Level 9 buys
  // <5% on already-compressed PNGs/fonts at 2-3× CPU; level 1 produces
  // noticeably larger archives. Revisit only if profiling says so.
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buffer, baseName: archiveBaseName };
}

export async function buildBatchArchive(projectsRoot, projectId, fileNames, metadata?) {
  const projectRoot = resolveProjectDir(projectsRoot, projectId, metadata);
  const zip = new JSZip();
  let packed = 0;
  const rejected = [];

  for (const name of fileNames) {
    let filePath;
    try {
      filePath = resolveSafe(projectRoot, name);
    } catch (err) {
      rejected.push({ name, reason: `invalid path: ${err?.message || err}` });
      continue;
    }

    // Mirror the visible-file allowlist from collectFiles/collectArchiveEntries:
    // reject any hidden segment, .artifact.json sidecars, and symlinks at any
    // level of the path (not just the final basename).
    const relSegments = path.relative(projectRoot, filePath).split(path.sep);
    let hidden = false;
    for (const seg of relSegments) {
      if (seg.startsWith('.')) {
        hidden = true;
        break;
      }
    }
    if (hidden) {
      rejected.push({ name, reason: 'hidden segments are not eligible for archive' });
      continue;
    }
    if (path.basename(filePath).endsWith('.artifact.json')) {
      rejected.push({ name, reason: 'artifact sidecars are not eligible for archive' });
      continue;
    }

    // Walk each path segment from projectRoot to the target with lstat,
    // rejecting intermediate symlinks that could escape the project tree.
    let walk = projectRoot;
    let symlinkFound = false;
    for (const seg of relSegments) {
      walk = path.join(walk, seg);
      let segStat;
      try {
        segStat = await lstat(walk);
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          rejected.push({ name, reason: `segment not found: ${seg}` });
          break;
        }
        throw err;
      }
      if (segStat.isSymbolicLink()) {
        symlinkFound = true;
        break;
      }
    }
    if (symlinkFound) {
      rejected.push({ name, reason: 'symlinks are not eligible for archive' });
      continue;
    }
    if (rejected.length > 0 && rejected[rejected.length - 1].name === name) continue;

    // Final stat on the resolved path (guards against TOCTOU between segment
    // walk and read, and catches non-regular files).
    let st;
    try {
      st = await lstat(filePath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        rejected.push({ name, reason: 'file not found' });
        continue;
      }
      throw err;
    }

    if (st.isSymbolicLink()) {
      rejected.push({ name, reason: 'symlinks are not eligible for archive' });
      continue;
    }
    if (!st.isFile()) {
      rejected.push({ name, reason: 'not a regular file' });
      continue;
    }

    const buf = await readFile(filePath);
    zip.file(name, buf, {
      date: new Date(st.mtimeMs),
      binary: true,
    });
    packed += 1;
  }

  // Fail-fast: any rejected entry means the request is invalid — mirror the
  // strict rejection semantics of the panel and full archive.
  if (rejected.length > 0) {
    const err = new Error(
      `${rejected.length} file(s) ineligible for archive: ${rejected.map((r) => r.name).join(', ')}`,
    );
    err.code = 'BAD_REQUEST';
    err.rejected = rejected;
    throw err;
  }

  if (packed === 0) {
    const err = new Error('no files could be packed');
    err.code = 'ENOENT';
    throw err;
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buffer, baseName: '' };
}

async function collectArchiveEntries(dir, relDir, out) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (!e.isDirectory() && !e.isFile()) continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await collectArchiveEntries(full, rel, out);
      continue;
    }
    if (e.name.endsWith('.artifact.json')) continue;
    const st = await stat(full);
    out.push({ relPath: rel, fullPath: full, mtime: st.mtimeMs });
  }
}

function addDesignHandoff(zip, entries, projectLabel) {
  if (entries.some((entry) => entry.relPath === DESIGN_HANDOFF_FILENAME)) return;
  zip.file(DESIGN_HANDOFF_FILENAME, buildDesignHandoff(entries, projectLabel), {
    date: new Date(0),
    binary: false,
  });
}

function addDesignManifest(zip, entries, projectLabel) {
  if (entries.some((entry) => entry.relPath === DESIGN_MANIFEST_FILENAME)) return;
  zip.file(DESIGN_MANIFEST_FILENAME, buildDesignManifest(entries, projectLabel), {
    date: new Date(0),
    binary: false,
  });
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

function projectFileMap(entries) {
  const files = entries.map((entry) => entry.relPath).sort((a, b) => a.localeCompare(b));
  const htmlFiles = files.filter((name) => /\.html?$/i.test(name));
  const screenHtmlFiles = htmlFiles.filter((name) => !isFrameWrapperHtmlFile(name));
  const cssFiles = files.filter((name) => /\.css$/i.test(name));
  const jsFiles = files.filter((name) => /\.[cm]?[jt]sx?$/i.test(name));
  const assetFiles = files.filter((name) => !htmlFiles.includes(name) && !cssFiles.includes(name) && !jsFiles.includes(name));
  const entryFile = screenHtmlFiles.find((name) => /(^|\/)index\.html$/i.test(name))
    || screenHtmlFiles[0]
    || htmlFiles.find((name) => /(^|\/)index\.html$/i.test(name))
    || htmlFiles[0]
    || files[0]
    || 'index.html';
  return { files, htmlFiles, screenHtmlFiles, cssFiles, jsFiles, assetFiles, entryFile };
}

function buildDesignManifest(entries, projectLabel) {
  const { files, htmlFiles, screenHtmlFiles, cssFiles, jsFiles, assetFiles, entryFile } = projectFileMap(entries);
  const screenFiles = screenHtmlFiles.length > 0 ? screenHtmlFiles : [entryFile];
  return JSON.stringify({
    schema: 'open-design.design-manifest.v1',
    title: projectLabel || 'Open Design project',
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

function buildDesignHandoff(entries, projectLabel) {
  const { files, htmlFiles, cssFiles, jsFiles, assetFiles, entryFile } = projectFileMap(entries);
  const accentLikelyBrandLed =
    files.some((name) => /(design|brand|tokens?|theme|style|tailwind|variables)\.(css|scss|sass|less|json|ts|tsx|js|jsx|md)$/i.test(name)) ||
    cssFiles.length > 0;
  const hasResponsiveClues =
    htmlFiles.length > 0 ||
    cssFiles.length > 0 ||
    files.some((name) => /(screens?|pages?|components?|app|src)\//i.test(name));
  const list = (items) => items.length > 0 ? items.map((name) => `- \`${name}\``).join('\n') : '- None detected';

  return `# ${projectLabel || 'Open Design project'} implementation handoff

This archive is the source of truth for turning the design into production code. Start from \`${entryFile}\`, then preserve the visual system, responsive behavior, and interactions found in the exported files.

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
${list(htmlFiles)}

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

export async function readProjectFile(projectsRoot, projectId, name, metadata?) {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const file = await resolveSafeReal(dir, name);
  const buf = await readFile(file);
  const st = await stat(file);
  const rootReal = await realpath(dir).catch(() => dir);
  const rel = toProjectPath(path.relative(rootReal, file));
  const manifest = await readManifestForPath(dir, rel);
  return {
    buffer: buf,
    name: rel,
    path: rel,
    size: st.size,
    mtime: st.mtimeMs,
    mime: mimeFor(rel),
    kind: kindFor(rel),
    artifactKind: manifest?.kind,
    artifactManifest: manifest,
  };
}

// Like readProjectFile but skips loading the file content into memory.
// Used by the media streaming endpoint so large video files are never buffered.
export async function resolveProjectFilePath(projectsRoot, projectId, name, metadata?) {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const file = await resolveSafeReal(dir, name);
  const st = await stat(file);
  const rel = toProjectPath(path.relative(dir, file));
  return {
    filePath: file,
    name: rel,
    size: st.size,
    mtime: st.mtimeMs,
    mime: mimeFor(rel),
    kind: kindFor(rel),
  };
}

export async function writeProjectFile(
  projectsRoot,
  projectId,
  name,
  body,
  { overwrite = true, artifactManifest = null } = {},
  metadata?,
) {
  const dir = await ensureProject(projectsRoot, projectId, metadata);
  const safeName = sanitizePath(name);
  const target = await resolveSafeReal(dir, safeName);
  if (!overwrite) {
    try {
      await stat(target);
      throw new Error('file already exists');
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }
  await mkdir(path.dirname(target), { recursive: true });
  let stubGuardWarning = null;
  let validatedManifest = null;
  if (artifactManifest && typeof artifactManifest === 'object') {
    const validated = validateArtifactManifestInput(artifactManifest, safeName);
    if (validated.ok && validated.value) {
      validatedManifest = validated.value;
      const identifier = typeof validatedManifest.metadata?.identifier === 'string'
        ? validatedManifest.metadata.identifier
        : '';
      // Stub-guard applies to HTML-rendered manifest kinds (html, deck).
      // Other kinds (markdown, svg, code-snippet) can legitimately be small
      // and are skipped.
      if (identifier.length > 0 && STUB_GUARDED_MANIFEST_KINDS.has(validatedManifest.kind)) {
        // Scan the directory the new file actually lands in, not the project
        // root — writeProjectFile accepts nested paths like reports/X.html
        // and a root-only scan would miss prior siblings in subdirectories.
        const guard = await evaluateArtifactStubGuard({
          scanDir: path.dirname(target),
          identifier,
          newSize: Buffer.byteLength(body),
          config: readArtifactStubGuardConfigFromEnv(),
        });
        if ((guard.outcome === 'reject' || guard.outcome === 'warn') && guard.warning) {
          // Operator-visible signal regardless of mode, so on-call can see
          // how often the guard fires without combing through 422s.
          console.warn(
            `[stub-guard] ${guard.outcome} identifier=${guard.warning.identifier} ` +
              `newSize=${guard.warning.newSize} priorSize=${guard.warning.priorSize} ` +
              `priorName=${guard.warning.priorName} project=${projectId}`,
          );
        }
        if (guard.outcome === 'reject' && guard.warning) {
          throw new ArtifactRegressionError(guard.warning.message, {
            identifier: guard.warning.identifier,
            newSize: guard.warning.newSize,
            priorSize: guard.warning.priorSize,
            priorName: guard.warning.priorName,
          });
        }
        if (guard.outcome === 'warn' && guard.warning) {
          stubGuardWarning = guard.warning;
        }
      }
    }
  }
  await writeFile(target, body);
  if (validatedManifest) {
    const manifestFileName = artifactManifestNameFor(safeName);
    const manifestTarget = await resolveSafeReal(dir, manifestFileName);
    await writeFile(manifestTarget, JSON.stringify(validatedManifest, null, 2));
  }
  const st = await stat(target);
  const persistedManifest = await readManifestForPath(dir, safeName);
  const result = {
    name: safeName,
    path: safeName,
    size: st.size,
    mtime: st.mtimeMs,
    kind: kindFor(safeName),
    mime: mimeFor(safeName),
    artifactKind: persistedManifest?.kind,
    artifactManifest: persistedManifest,
  };
  if (stubGuardWarning) result.stubGuardWarning = stubGuardWarning;
  return result;
}

function artifactManifestNameFor(name) {
  return `${name}.artifact.json`;
}

async function readManifestForPath(projectDirPath, relPath) {
  const manifestPath = path.join(projectDirPath, artifactManifestNameFor(relPath));
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = parseManifest(raw);
    if (parsed) return parsed;
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      // ignore malformed/invalid manifests and fallback to inference
    }
  }
  return inferLegacyManifest(relPath);
}

function parseManifest(raw) {
  return parsePersistedManifest(raw, '');
}

export async function deleteProjectFile(projectsRoot, projectId, name, metadata?) {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const file = await resolveSafeReal(dir, name);
  await unlink(file);
}

export async function renameProjectFile(projectsRoot, projectId, fromName, toName, metadata?) {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const oldName = validateProjectPath(fromName);
  const newName = sanitizePath(toName);
  try {
    await stat(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const missing = new Error('source file not found');
      missing.code = 'ENOENT';
      throw missing;
    }
    throw err;
  }
  const source = await resolveSafeReal(dir, oldName);
  const sourceStat = await stat(source);
  if (!sourceStat.isFile()) {
    const err = new Error('source is not a regular file');
    err.code = 'EISDIR';
    throw err;
  }

  if (oldName === newName) {
    const manifest = await readManifestForPath(dir, oldName);
    return {
      file: {
        name: oldName,
        path: oldName,
        size: sourceStat.size,
        mtime: sourceStat.mtimeMs,
        kind: kindFor(oldName),
        mime: mimeFor(oldName),
        artifactKind: manifest?.kind,
        artifactManifest: manifest,
      },
      oldName,
      newName: oldName,
    };
  }

  const target = await resolveSafeReal(dir, newName);
  const targetPath = source === target ? resolveSafe(dir, newName) : target;

  if (source !== target) {
    try {
      await stat(target);
      const err = new Error('target file already exists');
      err.code = 'EEXIST';
      throw err;
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }

  const manifestRename = await prepareArtifactManifestRename(dir, oldName, newName);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await projectFileRenameTestHooks.beforeCommit?.({ source, target: targetPath });
  await renameFilePath(source, targetPath, { noOverwrite: true });
  await commitArtifactManifestRename(manifestRename, newName);

  const st = await stat(targetPath);
  const manifest = await readManifestForPath(dir, newName);
  return {
    file: {
      name: newName,
      path: newName,
      size: st.size,
      mtime: st.mtimeMs,
      kind: kindFor(newName),
      mime: mimeFor(newName),
      artifactKind: manifest?.kind,
      artifactManifest: manifest,
    },
    oldName,
    newName,
  };
}

async function renameFilePath(source, target, opts = {}) {
  const { noOverwrite = false } = opts;
  if (source === target) return;
  const temp = await uniqueRenameTempPath(source);
  await rename(source, temp);
  try {
    if (noOverwrite) {
      await link(temp, target);
      try {
        await unlink(temp);
      } catch {
        // Preserve the target file even if cleanup of the temp link fails.
      }
    } else {
      await rename(temp, target);
    }
  } catch (err) {
    try {
      await rename(temp, source);
    } catch {
      // Preserve the original rename error even if restoring the source path fails.
    }
    throw err;
  }
}

async function uniqueRenameTempPath(source) {
  const dir = path.dirname(source);
  const base = path.basename(source);
  for (let i = 0; i < 10; i++) {
    const temp = path.join(dir, `.od-rename-${process.pid}-${Date.now()}-${i}-${base}.tmp`);
    try {
      await stat(temp);
    } catch (err) {
      if (err && err.code === 'ENOENT') return temp;
      throw err;
    }
  }
  const err = new Error('could not allocate temporary rename path');
  err.code = 'EEXIST';
  throw err;
}

async function prepareArtifactManifestRename(dir, oldName, newName) {
  const oldManifestName = artifactManifestNameFor(oldName);
  const oldManifestPath = await resolveSafeReal(dir, oldManifestName).catch((err) => {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  });
  if (!oldManifestPath) return null;

  let raw = null;
  try {
    raw = await readFile(oldManifestPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }

  const newManifestName = artifactManifestNameFor(newName);
  const newManifestPath = await resolveSafeReal(dir, newManifestName);
  const targetManifestPath = oldManifestPath === newManifestPath
    ? resolveSafe(dir, newManifestName)
    : newManifestPath;
  if (oldManifestPath !== newManifestPath) {
    try {
      await stat(newManifestPath);
      const err = new Error('target artifact manifest already exists');
      err.code = 'EEXIST';
      throw err;
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }

  return { oldManifestPath, newManifestPath: targetManifestPath, raw };
}

async function commitArtifactManifestRename(manifestRename, newName) {
  if (!manifestRename) return;
  const { oldManifestPath, newManifestPath, raw } = manifestRename;
  await mkdir(path.dirname(newManifestPath), { recursive: true });
  const parsed = parseManifest(raw);
  if (parsed) {
    const validated = validateArtifactManifestInput(parsed, newName);
    if (validated.ok && validated.value) {
      await writeFile(oldManifestPath, JSON.stringify(validated.value, null, 2));
      await renameFilePath(oldManifestPath, newManifestPath, { noOverwrite: true });
      return;
    }
  }
  await renameFilePath(oldManifestPath, newManifestPath, { noOverwrite: true });
}

export async function removeProjectDir(projectsRoot, projectId) {
  const dir = projectDir(projectsRoot, projectId);
  await rm(dir, { recursive: true, force: true });
}

function resolveSafe(dir, name) {
  const safePath = validateProjectPath(name);
  const target = path.resolve(dir, safePath);
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    throw new Error('path escapes project dir');
  }
  return target;
}

// Symlink-aware variant of resolveSafe. resolveSafe only does string-prefix
// validation, which is fooled by symlinks *inside* the project tree
// (a `assets/` symlink pointing at `/Users/me/.ssh` passes the prefix
// check because the literal path stays under dir, but the OS follows
// the link at open() time). This helper realpath()s the resolved
// candidate (or its existing prefix, for writes that haven't created
// the file yet) and re-validates against the realpath of dir, so
// descendant symlinks can't reach outside the project.
async function resolveSafeReal(dir, name) {
  const candidate = resolveSafe(dir, name);
  const rootReal = await realpath(dir).catch(() => dir);
  let real;
  try {
    real = await realpath(candidate);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
    // Write case: path doesn't exist yet. Realpath the longest existing
    // prefix and re-append the missing tail.
    real = await resolveExistingPrefix(candidate);
  }
  if (!real.startsWith(rootReal + path.sep) && real !== rootReal) {
    const e = new Error('path escapes project dir via symlink');
    e.code = 'EPATHESCAPE';
    throw e;
  }
  return real;
}

async function resolveExistingPrefix(p) {
  const parts = p.split(path.sep);
  for (let i = parts.length; i > 0; i--) {
    const prefix = parts.slice(0, i).join(path.sep) || path.sep;
    try {
      const real = await realpath(prefix);
      const rest = parts.slice(i).join(path.sep);
      return rest ? path.join(real, rest) : real;
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }
  return p;
}

export function sanitizePath(raw) {
  const normalized = validateProjectPath(raw);
  return normalized.split('/').map(sanitizeName).join('/');
}

export function validateProjectPath(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('invalid file name');
  }
  const normalized = raw.replace(/\\/g, '/');
  if (raw.includes('\0') || /^[A-Za-z]:/.test(normalized) || normalized.startsWith('/')) {
    throw new Error('invalid file name');
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((p) => FORBIDDEN_SEGMENT.test(p))) {
    throw new Error('invalid file name');
  }
  if (parts.some((part) => RESERVED_PROJECT_FILE_SEGMENTS.has(part))) {
    throw new Error('reserved project path');
  }
  return parts.join('/');
}

export function isReservedProjectFilePath(raw) {
  try {
    const normalized = String(raw ?? '').replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).some((part) => RESERVED_PROJECT_FILE_SEGMENTS.has(part));
  } catch {
    return false;
  }
}

// Keep Unicode letters/digits as-is; replace path separators, control
// characters, and reserved punctuation with underscore. Spaces collapse
// to dashes (matches the kebab-case style used by the agent's slugs).
// The previous ASCII-only filter collapsed every non-ASCII character to
// '_', so a Chinese filename like '测试文档.docx' became '____.docx'
// (issue #144).
export function sanitizeName(raw) {
  const cleaned = String(raw ?? '')
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '_')
    .replace(/^\.+/, '_')
    .trim();
  return cleaned || `file-${Date.now()}`;
}

// multer@1 decodes multipart filenames as latin1, which mangles any
// UTF-8 bytes (Chinese, Japanese, Cyrillic, ...) the user uploads. Re-
// decode as UTF-8 when the result round-trips back to the original
// bytes; otherwise the source was genuine latin1 and we leave it alone.
export function decodeMultipartFilename(name) {
  if (!name || typeof name !== 'string') return name ?? '';
  // If any code point exceeds 0xFF the source is already a properly
  // decoded Unicode string — for example, multer received an RFC 5987
  // `filename*` parameter and decoded it as UTF-8. Re-running latin1
  // -> utf8 here would corrupt those names, so exit early.
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 0xff) return name;
  }
  const buf = Buffer.from(name, 'latin1');
  const utf8 = buf.toString('utf8');
  return Buffer.from(utf8, 'utf8').equals(buf) ? utf8 : name;
}

function toProjectPath(raw) {
  return raw.split(path.sep).join('/');
}

// Validates an id string for use as a path segment under a daemon-managed
// directory (`.od/projects/<id>`, `design-systems/<id>`, etc.). The character
// class allows dots so ids like `my-project.v2` work, but pure-dot ids
// (`.`, `..`, `...`) MUST be rejected — they pass the char-class check but
// resolve to the parent directory when fed into `path.join`. Without the
// pure-dot guard, an attacker could create a project row with id `..` (or
// reach this code via a percent-encoded URL like `/api/projects/%2e%2e/...`
// which Express decodes before the route handler sees it) and steer
// finalize / write operations outside `.od/projects/`.
export function isSafeId(id) {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 128) return false;
  if (/^\.+$/.test(id)) return false; // reject `.`, `..`, `...`, etc.
  return /^[A-Za-z0-9._-]+$/.test(id);
}

const EXT_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  // `.tsx` previously served as `text/typescript`, which browser module
  // loaders and strict CSPs do not accept as a JavaScript MIME. Multi-file
  // React prototypes that load `.tsx` via Babel-standalone (`<script
  // type="text/babel" src="…">`) need a JS-family Content-Type for the
  // browser fetch to succeed. Upstream of issue #336.
  '.tsx': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

export function mimeFor(name) {
  const ext = path.extname(name).toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
}

// Parses an HTTP Range header (RFC 7233) for a single byte range.
// Returns { start, end } for a satisfiable range, 'unsatisfiable' for a
// 416-class range, or null if the header is absent/malformed/multi-range
// (callers fall back to a full 200 response in the null case).
export function parseByteRange(header, fileSize) {
  if (!header || !header.startsWith('bytes=')) return null;
  const spec = header.slice(6).trim();
  // Multi-range is valid RFC 7233 but uncommon for media; fall back to full.
  if (spec.includes(',')) return null;
  const dashIdx = spec.indexOf('-');
  if (dashIdx === -1) return null;
  const rawStart = spec.slice(0, dashIdx);
  const rawEnd = spec.slice(dashIdx + 1);
  let start, end;
  if (rawStart === '') {
    // Suffix range: bytes=-N → last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || !Number.isInteger(suffix) || suffix <= 0) {
      return 'unsatisfiable';
    }
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else {
    start = Number(rawStart);
    if (!Number.isFinite(start) || !Number.isInteger(start) || start < 0) return null;
    if (start >= fileSize) return 'unsatisfiable';
    if (rawEnd === '') {
      // Open-ended range: bytes=N- → from N to EOF.
      end = fileSize - 1;
    } else {
      end = Number(rawEnd);
      if (!Number.isFinite(end) || !Number.isInteger(end) || end < start) return null;
      end = Math.min(end, fileSize - 1); // clamp over-long end
    }
  }
  return { start, end };
}

export async function searchProjectFiles(projectsRoot, projectId, query, opts = {}) {
  const max = Math.min(Number(opts.max) || 200, 1000);
  const pattern = opts.pattern || null;
  const metadata = opts.metadata;
  const items = await listFiles(projectsRoot, projectId, { metadata });
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const escaped = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'i');
  const matches = [];
  for (const f of items) {
    if (!isTextualMime(f.mime)) continue;
    if (pattern && !globMatch(f.name, pattern)) continue;
    let content;
    try {
      content = await readFile(path.join(dir, f.name), 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        const snippet = lines[i].length > 220 ? lines[i].slice(0, 220) + '…' : lines[i];
        matches.push({ file: f.name, line: i + 1, snippet });
        if (matches.length >= max) return matches;
      }
    }
  }
  return matches;
}

function isTextualMime(mime) {
  if (!mime) return false;
  return (
    /^text\//i.test(mime) ||
    /^application\/(json|javascript|typescript|xml|x-(?:yaml|toml|httpd-php|sh))\b/i.test(mime) ||
    /\+(?:json|xml)\b/i.test(mime) ||
    /^image\/svg\+xml/i.test(mime)
  );
}

function globMatch(name, glob) {
  const re = new RegExp(
    '^' +
      glob
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
  );
  return re.test(name);
}

// Coarse kind buckets the frontend uses to pick a viewer.
export function kindFor(name) {
  // Editable sketches use a compound extension so they slot into the
  // "sketch" bucket while still being valid JSON on disk.
  if (name.endsWith('.sketch.json')) return 'sketch';
  const ext = path.extname(name).toLowerCase();
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.svg') return 'sketch';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'].includes(ext)) {
    if (name.startsWith('sketch-')) return 'sketch';
    return 'image';
  }
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.m4a'].includes(ext)) return 'audio';
  if (['.md', '.txt'].includes(ext)) return 'text';
  if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.css', '.py'].includes(ext)) {
    return 'code';
  }
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'document';
  if (ext === '.pptx') return 'presentation';
  if (ext === '.xlsx') return 'spreadsheet';
  return 'binary';
}
