// Pure logic for the file-workspace slice: tab-bar drag/order/scroll math,
// browser-tab id/state helpers, and small file-name predicates. No React, no
// transport, no DOM — these test with zero doubles. Moved out of
// `components/FileWorkspace.tsx` as part of the ADR-0002 vertical-slice
// decomposition.
import type { DragEvent as ReactDragEvent } from 'react';
import {
  emptySketchScene,
  isSketchJsonFileName,
  parseSketchWorkspaceDocument,
  type ExcalidrawSketchScene,
} from '../../components/sketch-model';
import { designSystemGithubEvidenceState } from '../../components/design-system-github-evidence';
import type { DesignFilesNavState } from '../../components/DesignFilesPanel';
import { labelFromUrl } from '../../components/DesignBrowserPanel';
import { parseDesignMd } from '../../runtime/design-md-parse';
import { replaceDesignMdColorAtIndex } from '../../runtime/kit-edit';
import type { FileOpEntry } from '../../runtime/file-ops';
import type { KitColor } from '../../runtime/design-kit';
import type { TodoItem } from '../../runtime/todos';
import type {
  Conversation,
  DesignSystemSummary,
  LiveArtifactWorkspaceEntry,
  OpenTabsState,
  ProjectFile,
} from '../../types';
import {
  conversationIdFromSideChatTabId,
  isSideChatTabId,
  isTerminalTabId,
  terminalIdFromTabId,
} from '../../types';
import type { WorkspaceContextItem } from '@open-design/contracts';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import type { Dict } from '../../i18n/types';
import {
  BROWSER_TAB_PREFIX,
  DESIGN_FILES_TAB,
  DESIGN_SYSTEM_TAB,
  DESIGN_SYSTEM_CARD_MANIFEST_OPTIONAL_STRING_FIELDS,
  DESIGN_SYSTEM_GUIDANCE_FILES,
  DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS,
  QUESTIONS_TAB,
} from './constants';
import type {
  BrowserWorkspaceTab,
  DesignSystemCardManifestEntry,
  DesignSystemCardManifestMap,
  DesignSystemGenerationStep,
  DesignSystemPreviewAssetPath,
  DesignSystemProjectSection,
  DesignSystemProjectSectionReview,
  DesignSystemReviewAgentTask,
  DesignSystemReviewCategory,
  DesignSystemReviewDecision,
  DesignSystemReviewEntry,
  DesignSystemReviewPreviewDisplay,
  DesignSystemSectionActivity,
  DesignSystemSectionActivityPhase,
  DesignSystemSectionStatus,
  SaveSketchOptions,
  SketchState,
  TabDropEdge,
  TranslateFn,
  WorkspaceOrderedTab,
} from './types';

export function tabDropEdgeFromEvent(event: ReactDragEvent<HTMLDivElement>): TabDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
}

export function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function scrollWorkspaceTabsWithWheel(
  tabBar: Pick<HTMLDivElement, 'clientWidth' | 'scrollLeft' | 'scrollWidth'>,
  event: Pick<globalThis.WheelEvent, 'ctrlKey' | 'deltaMode' | 'deltaX' | 'deltaY' | 'preventDefault'>,
) {
  if (event.ctrlKey) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  if (tabBar.scrollWidth <= tabBar.clientWidth) return;

  const before = tabBar.scrollLeft;
  tabBar.scrollLeft += wheelDeltaToPixels(event.deltaY, event.deltaMode);
  if (tabBar.scrollLeft === before) return;

  event.preventDefault();
}

function wheelDeltaToPixels(delta: number, deltaMode: number): number {
  const WHEEL_DELTA_LINE = 1;
  const WHEEL_DELTA_PAGE = 2;

  if (deltaMode === WHEEL_DELTA_LINE) return delta * 16;
  if (deltaMode === WHEEL_DELTA_PAGE) return delta * 160;
  return delta;
}

export function kindIconName(
  kind?: string,
):
  | 'file-code'
  | 'globe'
  | 'image'
  | 'pencil'
  | 'file'
  | null {
  if (kind === 'browser') return 'globe';
  if (kind === 'live-artifact') return 'file-code';
  if (kind === 'html') return 'file-code';
  if (kind === 'image') return 'image';
  if (kind === 'sketch') return 'pencil';
  if (kind === 'code') return 'file-code';
  if (kind === 'text') return 'file';
  return 'file';
}

export function isBrowserTabId(tabId: string): boolean {
  return tabId.startsWith(BROWSER_TAB_PREFIX);
}

export function browserTabIndex(tabId: string): number {
  if (!isBrowserTabId(tabId)) return 0;
  const value = Number.parseInt(tabId.slice(BROWSER_TAB_PREFIX.length), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function browserTabsFromState(value: OpenTabsState['browserTabs']): BrowserWorkspaceTab[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tabs: BrowserWorkspaceTab[] = [];
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
    if (!item.id.startsWith(BROWSER_TAB_PREFIX)) continue;
    const label = item.label?.trim() || 'Browser';
    const tab: BrowserWorkspaceTab = {
      id: item.id,
      label,
    };
    if (item.insertAfter === null) tab.insertAfter = null;
    else if (typeof item.insertAfter === 'string') tab.insertAfter = item.insertAfter;
    if (item.title?.trim()) tab.title = item.title.trim();
    if (item.url?.trim()) tab.url = item.url.trim();
    if (item.iconUrl?.trim()) tab.iconUrl = item.iconUrl.trim();
    seen.add(item.id);
    tabs.push(tab);
  }
  return tabs;
}

export function maxBrowserTabSequence(tabs: BrowserWorkspaceTab[]): number {
  let max = 0;
  for (const tab of tabs) {
    const suffix = tab.id.slice(BROWSER_TAB_PREFIX.length);
    const value = Number.parseInt(suffix, 10);
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return max;
}

export function lastWorkspaceTabId(tabs: WorkspaceOrderedTab[]): string | null {
  return tabs[tabs.length - 1]?.id ?? null;
}

export function reanchorBrowserTabsToCurrentOrder(
  orderedTabs: WorkspaceOrderedTab[],
  browserTabs: BrowserWorkspaceTab[],
): BrowserWorkspaceTab[] {
  if (browserTabs.length === 0) return browserTabs;
  const anchorByBrowserId = new Map<string, string | null>();
  let previousId: string | null = DESIGN_FILES_TAB;
  for (const entry of orderedTabs) {
    if (entry.kind === 'browser') {
      anchorByBrowserId.set(entry.browserTab.id, previousId);
      previousId = entry.browserTab.id;
    } else {
      previousId = entry.name;
    }
  }

  let changed = false;
  const nextTabs = browserTabs.map((tab) => {
    if (!anchorByBrowserId.has(tab.id)) return tab;
    const nextInsertAfter = anchorByBrowserId.get(tab.id) ?? null;
    const currentInsertAfter = tab.insertAfter ?? null;
    if (currentInsertAfter === nextInsertAfter) return tab;
    changed = true;
    return { ...tab, insertAfter: nextInsertAfter };
  });
  return changed ? nextTabs : browserTabs;
}

export function orderWorkspaceTabs(
  fileTabNames: string[],
  browserTabs: BrowserWorkspaceTab[],
): WorkspaceOrderedTab[] {
  const ordered: WorkspaceOrderedTab[] = fileTabNames.map((name) => ({
    id: name,
    kind: 'file',
    name,
  }));
  let rootAnchorInsertIndex = 0;

  for (const browserTab of browserTabs) {
    const entry: WorkspaceOrderedTab = {
      id: browserTab.id,
      kind: 'browser',
      browserTab,
    };
    const anchor = browserTab.insertAfter;
    if (!anchor || anchor === DESIGN_FILES_TAB || anchor === DESIGN_SYSTEM_TAB) {
      ordered.splice(rootAnchorInsertIndex, 0, entry);
      rootAnchorInsertIndex += 1;
      continue;
    }
    const anchorIndex = ordered.findIndex((candidate) => candidate.id === anchor);
    if (anchorIndex === -1) {
      ordered.push(entry);
      continue;
    }
    ordered.splice(anchorIndex + 1, 0, entry);
  }

  return ordered;
}

export function isSketchName(name: string): boolean {
  return isSketchJsonFileName(name);
}

export function parentDirForProjectFile(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash > 0 ? normalized.slice(0, slash) : '';
}

export function sameFileName(a: string, b: string): boolean {
  return a === b || a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

export function isLiveArtifactImplementationPath(name: string): boolean {
  if (name === '.live-artifacts') return true;
  if (!name.startsWith('.live-artifacts/')) return false;
  // Live artifacts are exposed through virtual tree nodes only. In
  // particular, keep implementation-only snapshot and tile files hidden even
  // if a generic project-files endpoint returns them in older daemon builds.
  return true;
}

// --- Design-system project: pure section/status/manifest/color/todo helpers ---
// Moved out of components/FileWorkspace.tsx (DesignSystemProjectPanel's module-
// scope helpers) as part of the ADR-0002 vertical-slice decomposition.

export function normalizeDesignKitHex(value: string): string | null {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`.toUpperCase();
  }
  return null;
}

export function initialDesignKitColorHex(
  index: number,
  sources: {
    brandJson: string | null;
    designMdBody: string | null;
    swatches: string[] | undefined;
    currentColors: KitColor[];
  },
): string | null {
  const brandColor = colorHexFromBrandJson(sources.brandJson, index);
  if (brandColor) return brandColor;
  const designMdColor = colorHexFromDesignMd(sources.designMdBody ?? '', index);
  if (designMdColor) return designMdColor;
  return normalizeDesignKitHex(sources.swatches?.[index] ?? sources.currentColors[index]?.hex ?? '');
}

export function colorHexFromBrandJson(raw: string | null, index: number): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { colors?: Array<{ hex?: unknown }> };
    const hex = parsed.colors?.[index]?.hex;
    return typeof hex === 'string' ? normalizeDesignKitHex(hex) : null;
  } catch {
    return null;
  }
}

export function colorHexFromDesignMd(body: string, index: number): string | null {
  if (!body.trim()) return null;
  return normalizeDesignKitHex(parseDesignMd(body).colors[index]?.hex ?? '');
}

export function designMdBodyWithColor(
  body: string,
  colors: KitColor[],
  index: number,
  hex: string,
): string {
  const replaced = replaceDesignMdColorAtIndex(body, index, hex);
  if (replaced) return replaced;
  const nextColors = colors.length > 0
    ? colors.map((color, colorIndex) => ({
        ...color,
        hex: colorIndex === index ? hex : color.hex,
      }))
    : [];
  while (nextColors.length <= index) {
    nextColors.push({
      role: `color-${nextColors.length + 1}`,
      name: `Color ${nextColors.length + 1}`,
      hex: nextColors.length === index ? hex : '#000000',
      usage: '',
    });
  }
  if (nextColors[index]) {
    nextColors[index] = { ...nextColors[index], hex };
  }
  const table = [
    '## Color Palette',
    '',
    '| Role | Name | Hex | Usage |',
    '| --- | --- | --- | --- |',
    ...nextColors.map((color, colorIndex) => {
      const role = color.role || `color-${colorIndex + 1}`;
      const name = color.name || role;
      return `| ${role} | ${name} | \`${normalizeDesignKitHex(color.hex) ?? '#000000'}\` | ${color.usage || ''} |`;
    }),
  ].join('\n');
  return `${body.trimEnd()}\n\n${table}\n`;
}

export function designSystemHasSourceContext(system: DesignSystemSummary): boolean {
  const provenance = system.provenance;
  if (!provenance) return false;
  return Boolean(
    provenance.companyBlurb?.trim() ||
    provenance.githubUrls?.length ||
    provenance.localCodeFiles?.length ||
    provenance.figFiles?.length ||
    provenance.assetFiles?.length ||
    provenance.notes?.trim() ||
    provenance.sourceNotes?.trim(),
  );
}

export function slugForTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function designSystemSectionEditableFile(
  section: DesignSystemProjectSection,
  previewFile: ProjectFile | null,
  fileByName: Map<string, ProjectFile>,
): ProjectFile | null {
  if (previewFile && (previewFile.kind === 'html' || previewFile.kind === 'sketch')) return previewFile;
  const htmlFile = section.files
    .map((name) => fileByName.get(name))
    .find((file) => file?.kind === 'html');
  if (htmlFile) return htmlFile;
  return previewFile ?? section.files.map((name) => fileByName.get(name)).find(Boolean) ?? null;
}

export function designSystemSectionPreviewFile(
  names: string[],
  fileByName: Map<string, ProjectFile>,
): ProjectFile | null {
  for (const name of names) {
    const file = fileByName.get(name);
    if (!file) continue;
    if (file.kind === 'html' || file.kind === 'image' || file.kind === 'sketch') return file;
  }
  return null;
}

export function buildDesignSystemReviewSections(
  names: string[],
  fileByName: Map<string, ProjectFile>,
  cardManifest: DesignSystemCardManifestMap = new Map(),
): DesignSystemProjectSection[] {
  const artifactNames = names
    .filter((name) => isDesignSystemReviewArtifactFile(name, fileByName))
    .sort(designSystemReviewArtifactSort);
  if (artifactNames.length > 0) {
    const reviewNames = preferPreviewArtifactsOverRawAssets(artifactNames);
    return reviewNames.map((name) => {
      const manifestEntry = cardManifest.get(normalizeDesignSystemPath(name));
      const title = manifestEntry?.name?.trim() || designSystemReviewTitleFromPath(name);
      const category = inferDesignSystemReviewCategory(name, title, manifestEntry);
      return {
        title,
        subtitle: manifestEntry?.subtitle?.trim() || designSystemReviewSubtitle(title, category, name),
        category,
        files: designSystemRelatedFilesForCategory(name, category, names),
      };
    });
  }
  return designSystemFallbackReviewSections(names);
}

export function preferPreviewArtifactsOverRawAssets(names: string[]): string[] {
  const hasBrandPreview = names.some((name) => {
    const path = normalizeDesignSystemPath(name);
    const title = designSystemReviewTitleFromPath(name);
    return inferDesignSystemReviewCategory(name, title) === 'Brand'
      && (path.startsWith('preview/') || path.includes('/preview/') || path.endsWith('.html'));
  });
  if (!hasBrandPreview) return names;
  return names.filter((name) => {
    const path = normalizeDesignSystemPath(name);
    const title = designSystemReviewTitleFromPath(name);
    if (inferDesignSystemReviewCategory(name, title) !== 'Brand') return true;
    return path.startsWith('preview/') || path.includes('/preview/') || path.endsWith('.html');
  });
}

export function isDesignSystemReviewArtifactFile(
  name: string,
  fileByName: Map<string, ProjectFile>,
): boolean {
  const path = normalizeDesignSystemPath(name);
  const file = fileByName.get(name);
  if (!file || isDesignSystemEvidenceFile(path) || path === 'metadata.json') return false;
  const isRenderable = file.kind === 'html' || file.kind === 'image' || file.kind === 'sketch';
  if (!isRenderable) return false;
  if (isDesignSystemRawAssetFile(path)) return isDesignSystemReviewableAssetArtifact(path);
  if (path === 'index.html') return true;
  if (path.startsWith('preview/') || path.includes('/preview/')) return true;
  if (isDesignSystemUiKitFile(path)) return true;
  return false;
}

export function isDesignSystemRawAssetFile(path: string): boolean {
  return path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/assets/')
    || path.includes('/src/assets/')
    || path.includes('/fonts/')
    || path.includes('/logos/');
}

export function isDesignSystemReviewableAssetArtifact(path: string): boolean {
  return /\b(brand|logo|logos|mark|wordmark|icon)\b/u.test(path);
}

export function formatWorkspaceSnapshotElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${String(remainder).padStart(2, '0')}s`;
}

export function designSystemReviewArtifactSort(first: string, second: string): number {
  const firstCategory = inferDesignSystemReviewCategory(first, designSystemReviewTitleFromPath(first));
  const secondCategory = inferDesignSystemReviewCategory(second, designSystemReviewTitleFromPath(second));
  return designSystemReviewCategoryRank(firstCategory) - designSystemReviewCategoryRank(secondCategory)
    || designSystemReviewTitleFromPath(first).localeCompare(designSystemReviewTitleFromPath(second));
}

export function designSystemReviewTitleFromPath(name: string): string {
  const path = normalizeDesignSystemPath(name);
  const parts = path.split('/').filter(Boolean);
  let basename = parts[parts.length - 1] ?? path;
  if (/^index\.(html?|png|jpe?g|svg|webp|avif)$/iu.test(basename) && parts.length > 1) {
    basename = parts[parts.length - 2] ?? basename;
  }
  return basename
    .replace(/\.(html?|png|jpe?g|gif|webp|avif|svg|fig|pen)$/iu, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'overview';
}

export function inferDesignSystemReviewCategory(
  name: string,
  title: string,
  manifestEntry?: DesignSystemCardManifestEntry,
): DesignSystemReviewCategory {
  const text = `${normalizeDesignSystemPath(name)} ${title}`.toLowerCase();
  const group = manifestEntry?.group?.toLowerCase() ?? '';
  if (group.includes('ui kit')) return 'Components';
  if (/\b(type|typography|font|text)\b/u.test(text)) return 'Type';
  if (/\b(color|colors|palette|theme)\b/u.test(text)) return 'Colors';
  if (/\b(space|spacing|radius|radii|shadow|shadows|elevation|layout-grid)\b/u.test(text)) return 'Spacing';
  if (/\b(brand|logo|logos|mark|wordmark|icon|favicon)\b/u.test(text)) return 'Brand';
  if (group.includes('brand')) return 'Brand';
  return 'Components';
}

export function designSystemReviewSubtitle(title: string, category: DesignSystemReviewCategory, name = ''): string {
  const path = normalizeDesignSystemPath(name);
  const titleText = title.toLowerCase();
  const text = `${title} ${path}`.toLowerCase();
  if (isDesignSystemUiKitEntryPage(path)) return 'Applied UI kit example';
  if (text.includes('typography')) return 'Text hierarchy and styles';
  if (text.includes('type-')) return 'Typography scale and font guidance';
  if (text.includes('font')) return 'Font family specimens';
  if (text.includes('node')) return 'Data type color coding system';
  if (text.includes('ui-palette') || text.includes('palette')) return 'Interface color palette';
  if (text.includes('dark')) return 'Dark theme color palette';
  if (text.includes('spacing') || text.includes('radius') || text.includes('radii') || text.includes('shadow')) return 'Spacing scale and border radius tokens';
  if (text.includes('favicon')) return 'Brand app icon and favicon';
  if (text.includes('logo') || text.includes('brand')) return 'Brand logo marks';
  if (titleText.includes('interface') || titleText.includes('ui')) return 'Interface and component patterns';
  switch (category) {
    case 'Type':
      return 'Typography scale and font guidance';
    case 'Colors':
      return 'Color palette and token specimens';
    case 'Spacing':
      return 'Spacing and radius system';
    case 'Brand':
      return 'Brand assets and identity usage';
    case 'Components':
      return 'Reusable product interface examples';
  }
}

export function isDesignSystemUiKitEntryPage(path: string): boolean {
  return isDesignSystemUiKitFile(path) && /\.html?$/iu.test(path);
}

export function designSystemManifestCardError(index: number, detail: string): Error {
  const separator = detail.startsWith('.') ? '' : ' ';
  return new Error(`Invalid _ds_manifest.json: cards[${index}]${separator}${detail}.`);
}

export function optionalDesignSystemManifestString(
  record: Record<string, unknown>,
  field: (typeof DESIGN_SYSTEM_CARD_MANIFEST_OPTIONAL_STRING_FIELDS)[number],
  index: number,
): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw designSystemManifestCardError(index, `.${field} must be a string`);
  return value;
}

export function parseDesignSystemCardManifestEntry(card: unknown, index: number): DesignSystemCardManifestEntry {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    throw designSystemManifestCardError(index, 'must be an object');
  }
  const record = card as Record<string, unknown>;
  if (typeof record.path !== 'string' || !record.path.trim()) {
    throw designSystemManifestCardError(index, '.path must be a non-empty string');
  }
  const entry: DesignSystemCardManifestEntry = { path: normalizeDesignSystemPath(record.path) };
  for (const field of DESIGN_SYSTEM_CARD_MANIFEST_OPTIONAL_STRING_FIELDS) {
    entry[field] = optionalDesignSystemManifestString(record, field, index);
  }
  return entry;
}

export function parseDesignSystemCardManifest(text: string | null): DesignSystemCardManifestMap {
  if (!text) return new Map();
  let parsed: { cards?: unknown };
  try {
    parsed = JSON.parse(text) as { cards?: unknown };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid _ds_manifest.json: ${detail}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid _ds_manifest.json: expected an object with a cards array.');
  }
  if (parsed.cards !== undefined && !Array.isArray(parsed.cards)) {
    throw new Error('Invalid _ds_manifest.json: cards must be an array.');
  }
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const entries: Array<[string, DesignSystemCardManifestEntry]> = [];
  for (const [index, card] of cards.entries()) {
    const entry = parseDesignSystemCardManifestEntry(card, index);
    entries.push([entry.path, entry]);
  }
  return new Map(entries);
}

export function designSystemReviewPreviewDisplay(
  section: DesignSystemProjectSection,
  previewFile: ProjectFile | null,
): DesignSystemReviewPreviewDisplay {
  if (!previewFile) return 'specimen';
  const path = normalizeDesignSystemPath(previewFile.name);
  if (path.startsWith('ui_kits/') || path.includes('/ui_kits/')) return 'ui-kit';
  if (previewFile.kind !== 'html') return 'asset';
  if (section.category === 'Components' && !path.startsWith('preview/')) return 'ui-kit';
  return 'specimen';
}

export function designSystemRelatedFilesForCategory(
  artifactName: string,
  category: DesignSystemReviewCategory,
  names: string[],
): string[] {
  const related = names.filter((name) => {
    if (name === artifactName || isDesignSystemEvidenceFile(name)) return false;
    switch (category) {
      case 'Type':
      case 'Colors':
      case 'Spacing':
        return isDesignSystemTokenFile(name);
      case 'Components':
        return isDesignSystemUiKitFile(name);
      case 'Brand':
        return isDesignSystemAssetFile(name);
    }
  });
  return Array.from(new Set([artifactName, ...related])).slice(0, 12);
}

export function designSystemFallbackReviewSections(names: string[]): DesignSystemProjectSection[] {
  const tokenFiles = names.filter(isDesignSystemTokenFile).slice(0, 8);
  const uiKitFiles = names.filter(isDesignSystemUiKitFile).slice(0, 8);
  const assetFiles = names.filter(isDesignSystemAssetFile).slice(0, 8);
  const sections: Array<DesignSystemProjectSection | null> = [
    tokenFiles.length > 0
      ? {
        title: 'colors-and-type',
        subtitle: 'Color, type, spacing, and token guidance',
        category: 'Colors',
        files: tokenFiles,
      }
      : null,
    uiKitFiles.length > 0
      ? {
        title: 'components',
        subtitle: 'Reusable interface examples',
        category: 'Components',
        files: uiKitFiles,
      }
      : null,
    assetFiles.length > 0
      ? {
        title: 'assets',
        subtitle: 'Brand logos, fonts, and uploaded assets',
        category: 'Brand',
        files: assetFiles,
      }
      : null,
  ];
  return sections.filter((section): section is DesignSystemProjectSection => section !== null);
}

export function designSystemReviewGroups(
  reviews: DesignSystemProjectSectionReview[],
): Array<{ title: DesignSystemReviewCategory; items: DesignSystemProjectSectionReview[] }> {
  const categories: DesignSystemReviewCategory[] = ['Type', 'Colors', 'Spacing', 'Components', 'Brand'];
  return categories
    .map((title) => ({
      title,
      items: reviews.filter((review) => review.section.category === title),
    }))
    .filter((group) => group.items.length > 0);
}

export function designSystemReviewCategoryRank(category: DesignSystemReviewCategory): number {
  return ['Type', 'Colors', 'Spacing', 'Components', 'Brand'].indexOf(category);
}

export function designSystemReviewNeedsAttention(review: DesignSystemProjectSectionReview): boolean {
  return review.sectionStatus === 'needs-review'
    || review.sectionStatus === 'needs-work'
    || review.sectionStatus === 'updated'
    || review.sectionStatus === 'running'
    || review.sectionStatus === 'planned'
    || review.sectionStatus === 'missing';
}

export function isDesignSystemEvidenceFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  return path.startsWith('context/') || path.includes('/context/');
}

export function isDesignSystemGuidanceFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (path.includes('/')) return false;
  return DESIGN_SYSTEM_GUIDANCE_FILES.has(path);
}

export function designSystemGuidanceSort(first: string, second: string): number {
  const order = ['design.md', 'readme.md', 'readme-print.md', 'skill.md'];
  const firstRank = order.indexOf(normalizeDesignSystemPath(first));
  const secondRank = order.indexOf(normalizeDesignSystemPath(second));
  return (firstRank === -1 ? order.length : firstRank)
    - (secondRank === -1 ? order.length : secondRank)
    || first.localeCompare(second);
}

export function isDesignSystemTokenFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  if (
    path.startsWith('preview/')
    || path.startsWith('ui_kits/')
    || path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/preview/')
    || path.includes('/ui_kits/')
    || path.includes('/assets/')
    || path.includes('/src/assets/')
    || DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS.test(path)
  ) {
    return false;
  }
  const basename = designSystemBasename(path);
  if (basename.endsWith('.html')) return false;
  return basename === 'colors_and_type.css'
    || basename === 'tailwind.config.ts'
    || basename === 'tailwind.config.js'
    || basename === 'tailwind.config.mjs'
    || basename === 'theme.css'
    || basename === 'tokens.css'
    || basename === 'variables.css'
    || basename === 'design-tokens.json'
    || path.includes('/tokens/')
    || path.startsWith('src/tokens/')
    || path.startsWith('src/styles/')
    || path.startsWith('styles/')
    || /\b(color|colors|palette|typography|spacing|radius|theme|token)s?\b/u.test(path);
}

export function isDesignSystemPreviewFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path) || path.startsWith('ui_kits/')) return false;
  const basename = designSystemBasename(path);
  return path.startsWith('preview/')
    || (path.split('/').length === 1 && basename.endsWith('.html'))
    || (basename.endsWith('.html') && /\b(index|overview|preview|showcase|styleguide)\b/u.test(path));
}

export function isDesignSystemUiKitFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  if (isDesignSystemRawAssetFile(path)) return false;
  return path.startsWith('ui_kits/')
    || path.startsWith('src/components/')
    || path.startsWith('components/')
    || path.includes('/ui_kits/')
    || path.includes('/src/components/')
    || /\b(component|components|interface|ui-kit|uikit)\b/u.test(path);
}

export function isDesignSystemAssetFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  return path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/assets/')
    || path.includes('/src/assets/')
    || path.includes('/fonts/')
    || path.includes('/icons/')
    || path.includes('/logos/')
    || DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS.test(path);
}

export function designSystemGenerationReviewHasStarted(
  sectionReviews: DesignSystemProjectSectionReview[],
): boolean {
  return sectionReviews.some((review) => {
    const { previewFile, section, sectionActivity } = review;
    if (previewFile) return true;
    if (section.files.length > 0 && sectionActivity.phase !== 'idle') return true;
    return sectionActivity.phase === 'writing'
      || sectionActivity.phase === 'updated'
      || sectionActivity.phase === 'planned';
  });
}

export function designSystemSectionVisibleDuringGeneration(
  review: DesignSystemProjectSectionReview,
): boolean {
  const { section, reviewEntry, sectionActivity, previewFile } = review;
  if (reviewEntry) return true;
  if (previewFile) return true;
  if (sectionActivity.phase !== 'idle') return true;
  return section.files.length > 0;
}

export function designSystemSectionStatus(
  section: DesignSystemProjectSection,
  decision: DesignSystemReviewDecision | undefined,
  changedAfterFeedback: boolean,
  activity: DesignSystemSectionActivity,
): DesignSystemSectionStatus {
  if (activity.running) return 'running';
  if (activity.phase === 'planned') return 'planned';
  if (changedAfterFeedback || activity.mutated) return 'updated';
  if (section.files.length === 0) return 'missing';
  if (decision === 'looks-good') return 'approved';
  if (decision === 'needs-work') return 'needs-work';
  return 'needs-review';
}

export function designSystemSectionStatusLabel(
  t: TranslateFn,
  section: DesignSystemProjectSection,
  status: DesignSystemSectionStatus,
  activity: DesignSystemSectionActivity,
): string {
  switch (status) {
    case 'running':
      return designSystemSectionPhaseLabel(t, section, activity);
    case 'planned':
      return t('ds.sectionQueued');
    case 'updated':
      return t('ds.sectionReviewUpdatedFiles');
    case 'approved':
      return t('ds.reviewLooksGood');
    case 'needs-work':
      return t('ds.reviewNeedsWork');
    case 'needs-review':
      return t('ds.reviewNeedsReview');
    case 'missing':
      return section.requiredFile
        ? t('ds.sectionRequiredFileMissing', { file: section.requiredFile })
        : t('ds.sectionNoFilesYet');
  }
}

export function designSystemSectionStatusClass(status: DesignSystemSectionStatus): string {
  switch (status) {
    case 'running':
      return 'is-running';
    case 'planned':
      return 'is-planned';
    case 'updated':
      return 'is-review';
    case 'approved':
      return 'is-approved';
    case 'needs-work':
      return 'is-work';
    case 'needs-review':
      return 'is-ready';
    case 'missing':
      return 'is-missing';
  }
}

export function designSystemInitialGenerationSteps({
  files,
  sectionReviews,
  system,
  t,
}: {
  files: ProjectFile[];
  sectionReviews: DesignSystemProjectSectionReview[];
  system: DesignSystemSummary;
  t: TranslateFn;
}): DesignSystemGenerationStep[] {
  const hasSourceContext =
    designSystemGithubEvidenceState(system, files.map((file) => file.name)).ready
    && (
      files.some((file) => normalizeDesignSystemPath(file.name).startsWith('context/')) ||
      designSystemHasSourceContext(system)
    );
  const fileNames = files.map((file) => file.name);
  const categoryHasReview = (category: DesignSystemReviewCategory) =>
    sectionReviews.some((review) => review.section.category === category);
  const categoryIsRunning = (category: DesignSystemReviewCategory) =>
    sectionReviews.some((review) => review.section.category === category && review.sectionActivity.running);
  const guidanceRunning = sectionReviews.some((review) =>
    review.sectionActivity.running
    && review.section.files.some((name) => isDesignSystemGuidanceFile(name)),
  );
  const steps: DesignSystemGenerationStep[] = [
    {
      id: 'source-context',
      title: t('ds.generationSourceTitle'),
      detail: t('ds.generationSourceDetail'),
      status: hasSourceContext ? 'succeeded' : 'running',
    },
    {
      id: 'guidance',
      title: t('ds.generationGuidanceTitle'),
      detail: t('ds.generationGuidanceDetail'),
      status: fileNames.some(isDesignSystemGuidanceFile)
        ? 'succeeded'
        : guidanceRunning
          ? 'running'
          : 'pending',
    },
    {
      id: 'tokens',
      title: t('ds.generationTokensTitle'),
      detail: t('ds.generationTokensDetail'),
      status: fileNames.some(isDesignSystemTokenFile)
        ? 'succeeded'
        : (categoryIsRunning('Type') || categoryIsRunning('Colors') || categoryIsRunning('Spacing'))
          ? 'running'
          : 'pending',
    },
    {
      id: 'previews',
      title: t('ds.generationPreviewsTitle'),
      detail: t('ds.generationPreviewsDetail'),
      status: sectionReviews.some((review) => review.previewFile)
        ? 'succeeded'
        : (categoryIsRunning('Type') || categoryIsRunning('Colors') || categoryIsRunning('Spacing') || categoryIsRunning('Brand'))
          ? 'running'
          : 'pending',
    },
    {
      id: 'ui-kit',
      title: t('ds.generationUiKitTitle'),
      detail: t('ds.generationUiKitDetail'),
      status: categoryHasReview('Components') || fileNames.some(isDesignSystemUiKitFile)
        ? 'succeeded'
        : categoryIsRunning('Components')
          ? 'running'
          : 'pending',
    },
    {
      id: 'assets',
      title: t('ds.generationAssetsTitle'),
      detail: t('ds.generationAssetsDetail'),
      status: categoryHasReview('Brand') || fileNames.some(isDesignSystemAssetFile)
        ? 'succeeded'
        : categoryIsRunning('Brand')
          ? 'running'
          : 'pending',
    },
  ];
  if (!steps.some((step) => step.status === 'running')) {
    const firstPending = steps.find((step) => step.status === 'pending');
    if (firstPending) firstPending.status = 'running';
  }
  return steps;
}

export function designSystemGenerationProgress(steps: DesignSystemGenerationStep[]): number {
  if (steps.length === 0) return 8;
  const succeeded = steps.filter((step) => step.status === 'succeeded').length;
  const running = steps.some((step) => step.status === 'running') ? 0.45 : 0;
  return Math.max(8, Math.min(92, Math.round(((succeeded + running) / steps.length) * 100)));
}

export function designSystemSectionActivity(
  section: DesignSystemProjectSection,
  fileOps: FileOpEntry[],
  todos: TodoItem[],
): DesignSystemSectionActivity {
  const touched = fileOps.filter((entry) => designSystemFileOpBelongsToSection(entry, section));
  const touchedFiles = Array.from(new Set(touched.map((entry) => entry.path)));
  const todo = designSystemSectionTodo(section, todos);
  const hasRunningMutation = touched.some((entry) =>
    entry.status === 'running' && (entry.ops.includes('write') || entry.ops.includes('edit')),
  );
  const hasRunningRead = touched.some((entry) =>
    entry.status === 'running' && entry.ops.includes('read'),
  );
  const mutated = touched.some((entry) =>
    entry.status === 'done' && (entry.ops.includes('write') || entry.ops.includes('edit')),
  );
  const errored = touched.some((entry) => entry.status === 'error');
  const todoPhase = todo ? designSystemTodoActivityPhase(section, todo) : null;
  const hasRunningTodo = todo?.status === 'in_progress';
  const phase: DesignSystemSectionActivityPhase =
    errored
      ? 'error'
      : hasRunningMutation
        ? 'writing'
        : hasRunningRead
          ? 'reading'
          : hasRunningTodo && todoPhase
            ? todoPhase
            : mutated
              ? 'updated'
              : todoPhase
                ? todoPhase
                : 'idle';
  return {
    running: hasRunningMutation || hasRunningRead || hasRunningTodo,
    mutated,
    errored,
    phase,
    touchedFiles,
    todoText: todo?.content,
    todoStatus: todo?.status,
  };
}

export function designSystemSectionTodo(
  section: DesignSystemProjectSection,
  todos: TodoItem[],
): TodoItem | undefined {
  return todos
    .filter((todo) => todo.status !== 'completed')
    .filter((todo) => designSystemTodoBelongsToSection(todo, section))
    .sort((first, second) => designSystemTodoRank(first) - designSystemTodoRank(second))[0];
}

export function designSystemTodoRank(todo: TodoItem): number {
  if (todo.status === 'in_progress') return 0;
  if (todo.status === 'pending') return 1;
  return 2;
}

export function designSystemTodoActivityPhase(
  section: DesignSystemProjectSection,
  todo: TodoItem,
): DesignSystemSectionActivityPhase {
  if (todo.status === 'pending') return 'planned';
  const text = designSystemTodoSearchText(todo);
  const isMutation = [
    'build',
    'copy',
    'create',
    'edit',
    'generate',
    'import',
    'register',
    'update',
    'write',
  ].some((keyword) => text.includes(keyword));
  if (isMutation) return 'writing';
  const isReading = [
    'analy',
    'browse',
    'explore',
    'fetch',
    'github',
    'inspect',
    'read',
    'repo',
    'search',
  ].some((keyword) => text.includes(keyword));
  if (isReading) return 'reading';
  return section.title === 'Preview' || section.title === 'UI kit' ? 'writing' : 'reading';
}

export function designSystemTodoBelongsToSection(
  todo: TodoItem,
  section: DesignSystemProjectSection,
): boolean {
  const text = designSystemTodoSearchText(todo);
  if (section.files.some((name) => text.includes(designSystemReviewTitleFromPath(name)))) {
    return true;
  }
  switch (section.category) {
    case 'Type':
      return [
        'font',
        'type',
        'typography',
      ].some((keyword) => text.includes(keyword));
    case 'Colors':
      return [
        'color',
        'colors_and_type',
        'css variable',
        'palette',
        'theme',
        'token',
      ].some((keyword) => text.includes(keyword));
    case 'Spacing':
      return [
        'radius',
        'spacing',
        'space',
      ].some((keyword) => text.includes(keyword));
    case 'Components':
      return [
        'component',
        'interface',
        'prototype',
        'react',
        'ui kit',
        'ui_kit',
        'ui_kits',
      ].some((keyword) => text.includes(keyword));
    case 'Brand':
      return [
        'font',
        'icon',
        'logo',
        'brand',
        'asset',
        'upload',
      ].some((keyword) => text.includes(keyword));
  }
}

export function designSystemTodoSearchText(todo: TodoItem): string {
  return `${todo.content} ${todo.activeForm ?? ''}`.toLowerCase();
}

export function designSystemFileOpBelongsToSection(
  entry: FileOpEntry,
  section: DesignSystemProjectSection,
): boolean {
  const candidates = [entry.fullPath, entry.path].map(normalizeDesignSystemPath);
  const sectionFiles = [...section.files, section.requiredFile]
    .filter((name): name is string => Boolean(name))
    .map(normalizeDesignSystemPath);
  if (sectionFiles.some((name) => candidates.some((candidate) =>
    candidate === name || candidate.endsWith(`/${name}`),
  ))) {
    return true;
  }
  return candidates.some((path) => designSystemPathMatchesSection(path, section.category));
}

export function designSystemPathMatchesSection(path: string, sectionTitle: string): boolean {
  const basename = designSystemBasename(path);
  switch (sectionTitle) {
    case 'Type':
      return !isDesignSystemEvidenceFile(path)
        && (isDesignSystemTokenFile(path) || DESIGN_SYSTEM_GUIDANCE_FILES.has(basename))
        && /\b(type|typography|font|text)\b/u.test(path);
    case 'Colors':
      return isDesignSystemTokenFile(path)
        && /\b(color|colors|palette|theme|token)\b/u.test(path);
    case 'Spacing':
      return isDesignSystemTokenFile(path)
        && /\b(space|spacing|radius)\b/u.test(path);
    case 'Components':
      return isDesignSystemUiKitFile(path);
    case 'Brand':
      return isDesignSystemAssetFile(path);
    default:
      return false;
  }
}

export function normalizeDesignSystemPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

export function normalizeProjectFilePath(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
}

export function joinProjectFilePath(dir: string, name: string): string {
  const normalizedDir = normalizeProjectFilePath(dir);
  return normalizedDir ? `${normalizedDir}/${name}` : name;
}

export function nextMarkdownDocumentPath(files: ProjectFile[], dir: string): string {
  const existing = new Set(files.map((file) => normalizeProjectFilePath(file.name).toLowerCase()));
  for (let index = 1; index < 1000; index += 1) {
    const name = index === 1 ? 'document.md' : `document-${index}.md`;
    const candidate = joinProjectFilePath(dir, name);
    if (!existing.has(normalizeProjectFilePath(candidate).toLowerCase())) return candidate;
  }
  return joinProjectFilePath(dir, `document-${Date.now()}.md`);
}

export function initialMarkdownDocument(
  path: string,
  projectKind: TrackingProjectKind,
  t: TranslateFn,
): string {
  const title = normalizeProjectFilePath(path)
    .split('/')
    .pop()
    ?.replace(/\.mdx?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase()) || t('designFiles.documentTemplate.titleFallback');
  return `# ${title}

## ${t('designFiles.documentTemplate.goalHeading')}

${t('designFiles.documentTemplate.goalBody')}

## ${t('designFiles.documentTemplate.capabilitiesHeading')}

- ${t('designFiles.documentTemplate.capabilityMarkdown')}
- ${t('designFiles.documentTemplate.capabilityAgent')}
- ${t('designFiles.documentTemplate.capabilityImages')}

## ${t('designFiles.documentTemplate.scenarioHeading')}

${t(documentTemplateScenarioKey(projectKind))}

## ${t('designFiles.documentTemplate.nextHeading')}

${t('designFiles.documentTemplate.nextBody')}
`;
}

export function documentTemplateScenarioKey(projectKind: TrackingProjectKind): keyof Dict {
  switch (projectKind) {
    case 'prototype':
      return 'designFiles.documentTemplate.scenario.prototype';
    case 'wireframe':
      return 'designFiles.documentTemplate.scenario.wireframe';
    case 'mobile':
      return 'designFiles.documentTemplate.scenario.mobile';
    case 'slide_deck':
      return 'designFiles.documentTemplate.scenario.slideDeck';
    case 'document':
      return 'designFiles.documentTemplate.scenario.document';
    case 'image':
      return 'designFiles.documentTemplate.scenario.image';
    case 'video':
      return 'designFiles.documentTemplate.scenario.video';
    case 'hyperframes':
      return 'designFiles.documentTemplate.scenario.hyperframes';
    case 'audio':
      return 'designFiles.documentTemplate.scenario.audio';
    case 'live_artifact':
      return 'designFiles.documentTemplate.scenario.liveArtifact';
    case 'brand':
    case 'design_system':
      return 'designFiles.documentTemplate.scenario.designSystem';
    case 'template':
    default:
      return 'designFiles.documentTemplate.scenario.default';
  }
}

export function designSystemBasename(path: string): string {
  const segments = normalizeDesignSystemPath(path).split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalizeDesignSystemPath(path);
}

export function designSystemSectionPhaseLabel(
  t: TranslateFn,
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.phase === 'planned') {
    switch (section.category) {
      case 'Type':
        return t('ds.phaseQueuedTypography');
      case 'Colors':
        return t('ds.phaseQueuedTokens');
      case 'Spacing':
        return t('ds.phaseQueuedSpacing');
      case 'Components':
        return t('ds.phaseQueuedUiKit');
      case 'Brand':
        return t('ds.phaseQueuedAssets');
    }
  }
  if (activity.phase === 'reading') {
    switch (section.category) {
      case 'Type':
        return t('ds.phaseReadingTypography');
      case 'Colors':
        return t('ds.phaseReadingTokens');
      case 'Spacing':
        return t('ds.phaseReadingSpacing');
      case 'Components':
        return t('ds.phaseReadingUiKit');
      case 'Brand':
        return t('ds.phaseReadingAssets');
    }
  }
  if (activity.phase === 'writing') {
    switch (section.category) {
      case 'Type':
        return t('ds.phaseWritingTypography');
      case 'Colors':
        return t('ds.phaseWritingTokens');
      case 'Spacing':
        return t('ds.phaseWritingSpacing');
      case 'Components':
        return t('ds.phaseBuildingUiKit');
      case 'Brand':
        return t('ds.phaseUpdatingAssets');
    }
  }
  if (activity.phase === 'error') return t('ds.phaseNeedsAttention');
  if (activity.phase === 'updated') return t('ds.phaseUpdated');
  return t('ds.reviewNeedsReview');
}

export function designSystemSectionActivityLabel(
  t: TranslateFn,
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.touchedFiles.length === 0) {
    const phaseLabel = designSystemSectionPhaseLabel(t, section, activity);
    return activity.todoText
      ? t('ds.sectionActivityFromTodo', {
          phase: phaseLabel,
          todo: truncateDesignSystemActivityText(activity.todoText),
        })
      : phaseLabel;
  }
  const label = activity.touchedFiles.slice(0, 3).join(', ');
  const suffix = activity.touchedFiles.length > 3 ? ` +${activity.touchedFiles.length - 3}` : '';
  const files = `${label}${suffix}`;
  if (activity.phase === 'idle') return t('ds.sectionActivityReadFiles', { files });
  return t('ds.sectionActivityPhaseFiles', {
    phase: designSystemSectionPhaseLabel(t, section, activity),
    files,
  });
}

export function truncateDesignSystemActivityText(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

export function designSystemSectionRunningNotice(
  t: TranslateFn,
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.phase === 'reading') {
    return t('ds.sectionRunningReadingContext', { title: section.title });
  }
  return t('ds.sectionRunningNow', { phase: designSystemSectionPhaseLabel(t, section, activity) });
}

export function designSystemReviewTimeLabel(t: TranslateFn, value: string): string | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const formatted = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(time));
  return t('ds.reviewLastReviewed', { time: formatted });
}

export function designSystemReviewAgentTaskLabel(t: TranslateFn, task: DesignSystemReviewAgentTask): string {
  switch (task.status) {
    case 'queued':
      return t('ds.agentFeedbackQueued');
    case 'sent':
      if (!task.sentAt) return t('ds.agentFeedbackSent');
      {
        const time = Date.parse(task.sentAt);
        if (!Number.isFinite(time)) return t('ds.agentFeedbackSent');
        const formatted = new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(time));
        return t('ds.agentFeedbackSentAt', { time: formatted });
      }
    case 'failed':
      return task.error
        ? t('ds.agentFeedbackFailedWithError', { error: task.error })
        : t('ds.agentFeedbackFailed');
  }
  return t('ds.agentFeedbackUnknown');
}

export function designSystemSectionChangedAfterReview(
  names: string[],
  fileByName: Map<string, ProjectFile>,
  reviewEntry: DesignSystemReviewEntry | undefined,
): boolean {
  if (!reviewEntry || reviewEntry.decision !== 'needs-work') return false;
  const reviewedAt = Date.parse(reviewEntry.updatedAt);
  if (!Number.isFinite(reviewedAt)) return false;
  const trackedNames: string[] = reviewEntry.files && reviewEntry.files.length > 0
    ? reviewEntry.files
    : names;
  return trackedNames.some((name) => {
    const file = fileByName.get(name);
    return file ? file.mtime > reviewedAt : false;
  });
}

// ── design-system inline-preview URL rewriting ──────────────────────────────
// Pure resolution/rewrite helpers behind `DesignSystemInlinePreview`'s asset
// inlining: resolving a relative preview asset ref against its owning file,
// and rewriting HTML/CSS asset refs to point at the project's raw-file URLs.
// `rawUrl` is the slice's `projectRawUrl` port function, injected by the
// caller — these stay provider-free so they test with zero doubles.
export type DesignSystemPreviewRawUrl = (projectId: string, filePath: string) => string;

export function resolveDesignSystemPreviewRelativePath(ownerFileName: string, assetRef: string): string | null {
  return resolveDesignSystemPreviewAssetPath(ownerFileName, assetRef)?.filePath ?? null;
}

export function resolveDesignSystemPreviewAssetPath(ownerFileName: string, assetRef: string): DesignSystemPreviewAssetPath | null {
  const ref = assetRef.trim();
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(ref)) return null;
  if (isDesignSystemPreviewAppRootRef(ref)) return null;
  try {
    const url = new URL(ref, `https://od.local/${baseDirForDesignSystemPreviewFile(ownerFileName)}`);
    if (url.origin !== 'https://od.local') return null;
    return {
      filePath: decodeURIComponent(url.pathname.replace(/^\/+/, '')),
      suffix: `${url.search}${url.hash}`,
    };
  } catch {
    return null;
  }
}

export function isDesignSystemPreviewAppRootRef(ref: string): boolean {
  if (!ref.startsWith('/') || ref.startsWith('//')) return false;
  const pathOnly = ref.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  return pathOnly === '/api'
    || pathOnly.startsWith('/api/')
    || pathOnly === '/artifacts'
    || pathOnly.startsWith('/artifacts/')
    || pathOnly === '/frames'
    || pathOnly.startsWith('/frames/');
}

export function rewriteDesignSystemPreviewCssUrls(
  css: string,
  projectId: string,
  stylesheetFileName: string,
  rawUrl: DesignSystemPreviewRawUrl,
): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _quote: string, rawRef: string) => {
    const ref = rawRef.trim();
    const assetPath = resolveDesignSystemPreviewAssetPath(stylesheetFileName, ref);
    if (!assetPath) return match;
    return `url("${escapeDesignSystemPreviewCssUrl(rawUrl(projectId, assetPath.filePath) + assetPath.suffix)}")`;
  });
}

export function rewriteDesignSystemPreviewHtmlAssetUrls(
  html: string,
  projectId: string,
  ownerFileName: string,
  rawUrl: DesignSystemPreviewRawUrl,
): string {
  const directAssetTags = new RegExp(
    '(<(?:img|source|video|audio|track|embed|object|image|use)\\b[^>]*?\\s' +
      '(?:src|poster|data|href|xlink:href)\\s*=\\s*)([\'"])([\\s\\S]*?)\\2',
    'gi',
  );
  const withDirectAssets = html.replace(directAssetTags, (match, prefix: string, quote: string, rawRef: string) => {
    const rewritten = rewriteDesignSystemPreviewHtmlAssetRef(rawRef, projectId, ownerFileName, rawUrl);
    if (rewritten === rawRef) return match;
    return `${prefix}${quote}${escapeDesignSystemPreviewAttr(rewritten)}${quote}`;
  });
  const srcsetAssetTags = new RegExp(
    '(<(?:img|source)\\b[^>]*?\\ssrcset\\s*=\\s*)([\'"])([\\s\\S]*?)\\2',
    'gi',
  );
  return withDirectAssets.replace(srcsetAssetTags, (match, prefix: string, quote: string, rawSrcset: string) => {
    const rewritten = rewriteDesignSystemPreviewSrcset(rawSrcset, projectId, ownerFileName, rawUrl);
    if (rewritten === rawSrcset) return match;
    return `${prefix}${quote}${escapeDesignSystemPreviewAttr(rewritten)}${quote}`;
  });
}

export function rewriteDesignSystemPreviewInlineCssAssetUrls(
  html: string,
  projectId: string,
  ownerFileName: string,
  rawUrl: DesignSystemPreviewRawUrl,
): string {
  const withStyleBlocks = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (
    match,
    attrs: string,
    css: string,
  ) => {
    const rewritten = rewriteDesignSystemPreviewCssUrls(css, projectId, ownerFileName, rawUrl);
    if (rewritten === css) return match;
    return `<style${attrs}>${rewritten}</style>`;
  });
  return withStyleBlocks.replace(/(\sstyle\s*=\s*)(['"])([\s\S]*?)\2/gi, (
    match,
    prefix: string,
    quote: string,
    css: string,
  ) => {
    const rewritten = rewriteDesignSystemPreviewCssUrls(css, projectId, ownerFileName, rawUrl);
    if (rewritten === css) return match;
    return `${prefix}${quote}${escapeDesignSystemPreviewAttr(rewritten)}${quote}`;
  });
}

export function rewriteDesignSystemPreviewHtmlAssetRef(
  ref: string,
  projectId: string,
  ownerFileName: string,
  rawUrl: DesignSystemPreviewRawUrl,
): string {
  const assetPath = resolveDesignSystemPreviewAssetPath(ownerFileName, ref.trim());
  return assetPath ? rawUrl(projectId, assetPath.filePath) + assetPath.suffix : ref;
}

export function rewriteDesignSystemPreviewSrcset(
  srcset: string,
  projectId: string,
  ownerFileName: string,
  rawUrl: DesignSystemPreviewRawUrl,
): string {
  if (/\bdata:/i.test(srcset)) return srcset;
  return srcset
    .split(',')
    .map((candidate) => {
      const match = candidate.trim().match(/^(\S+)(\s+.+)?$/);
      if (!match) return candidate;
      const rewritten = rewriteDesignSystemPreviewHtmlAssetRef(match[1] ?? '', projectId, ownerFileName, rawUrl);
      return `${rewritten}${match[2] ?? ''}`;
    })
    .join(', ');
}

export function baseDirForDesignSystemPreviewFile(name: string): string {
  const index = name.lastIndexOf('/');
  return index >= 0 ? name.slice(0, index + 1) : '';
}

export function readDesignSystemPreviewHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

export function escapeDesignSystemPreviewAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeDesignSystemPreviewCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');
}

export function defaultSketchState(
  name: string,
  scene: ExcalidrawSketchScene = emptySketchScene(name),
): SketchState {
  return {
    version: 2,
    rawItems: [],
    discardRawItemsOnSave: false,
    items: [],
    scene,
    dirty: false,
    persisted: false,
    loaded: true,
    saving: false,
  };
}

export function loadedSketchStateFromDocument(
  doc: ReturnType<typeof parseSketchWorkspaceDocument>,
  sourceKey: string,
): SketchState {
  return {
    version: doc.version,
    rawItems: doc.rawItems,
    discardRawItemsOnSave: false,
    items: doc.items,
    scene: doc.scene,
    sourceKey,
    dirty: false,
    persisted: true,
    loaded: true,
    saving: false,
  };
}

export function sketchFileSourceKey(
  projectId: string,
  file: Pick<ProjectFile, 'name' | 'path' | 'size' | 'mtime'>,
): string {
  return `${projectId}:${file.path ?? file.name}:${file.size}:${file.mtime}`;
}

export function shouldKeepCurrentSketchState(
  current: SketchState | undefined,
  name: string,
  sourceKey: string,
  saveInFlight: Set<string>,
): boolean {
  if (!current) return false;
  if (!current.persisted) return true;
  if (current.dirty || current.saving || saveInFlight.has(name)) return true;
  return current.loaded && current.sourceKey === sourceKey;
}

export function mergeSketchSaveOptions(a: SaveSketchOptions, b: SaveSketchOptions): SaveSketchOptions {
  return {
    activate: a.activate !== false || b.activate !== false,
    refreshFiles: a.refreshFiles !== false || b.refreshFiles !== false,
    showSaving: a.showSaving !== false || b.showSaving !== false,
  };
}

export function consumeFileWorkspaceTabShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function formatBrowserTabUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!path || path === '/') return host || url;
    return `${host}${path}`;
  } catch {
    return url;
  }
}

export function joinDisplayPath(root: string, child: string): string {
  const cleanRoot = root.replace(/[\\/]+$/u, '');
  const cleanChild = child.replace(/^[\\/]+/u, '');
  return cleanChild ? `${cleanRoot}/${cleanChild}` : cleanRoot;
}

export function createDefaultDesignFilesNavState(): DesignFilesNavState {
  return {
    kindFilter: new Set(),
    currentDir: '',
    page: 0,
    pageSize: 30,
  };
}

// Tabs rendered are persisted tabs plus any pending (un-saved) sketches.
export function computeWorkspaceTabNames(
  persistedTabs: string[],
  sketches: Record<string, SketchState>,
): string[] {
  const seen = new Set(persistedTabs);
  const extras: string[] = [];
  for (const name of Object.keys(sketches)) {
    if (!sketches[name]?.persisted && !seen.has(name)) {
      extras.push(name);
      seen.add(name);
    }
  }
  return [...persistedTabs, ...extras];
}

export function computeWorkspaceTabIds(
  designSystemProject: DesignSystemSummary | null,
  orderedWorkspaceTabs: WorkspaceOrderedTab[],
  showQuestionsTab: boolean,
): string[] {
  const ids: string[] = [];
  if (designSystemProject) ids.push(DESIGN_SYSTEM_TAB);
  ids.push(DESIGN_FILES_TAB);
  if (showQuestionsTab) ids.push(QUESTIONS_TAB);
  for (const entry of orderedWorkspaceTabs) {
    ids.push(entry.kind === 'browser' ? entry.browserTab.id : entry.name);
  }
  return ids;
}

export interface ActiveWorkspaceContextParams {
  activeTab: string;
  designSystemProject: DesignSystemSummary | null;
  designFilesTabIsEmpty: boolean;
  uploadDir: string;
  resolvedDir?: string | null;
  t: TranslateFn;
  browserTabs: BrowserWorkspaceTab[];
  conversations: Conversation[];
  activeLiveArtifact: LiveArtifactWorkspaceEntry | null;
  activeFile: ProjectFile | null;
}

export function computeActiveWorkspaceContext(
  params: ActiveWorkspaceContextParams,
): WorkspaceContextItem | null {
  const {
    activeTab,
    designSystemProject,
    designFilesTabIsEmpty,
    uploadDir,
    resolvedDir,
    t,
    browserTabs,
    conversations,
    activeLiveArtifact,
    activeFile,
  } = params;
  if (activeTab === DESIGN_SYSTEM_TAB && designSystemProject) {
    return {
      id: 'workspace:design-system',
      kind: 'design-system',
      label: t('dsManager.tabDesignSystem'),
      tabId: activeTab,
    };
  }
  if (activeTab === DESIGN_FILES_TAB) {
    // Nothing to reference yet — don't auto-stage an empty "Design files" chip.
    if (designFilesTabIsEmpty) return null;
    const trimmedDir = uploadDir.trim();
    const label = trimmedDir.split('/').filter(Boolean).pop() || t('workspace.designFiles');
    return {
      id: trimmedDir ? `folder:${trimmedDir}` : 'workspace:design-files',
      kind: trimmedDir ? 'folder' : 'design-files',
      label,
      tabId: activeTab,
      ...(trimmedDir ? { path: trimmedDir } : {}),
      ...(resolvedDir ? { absolutePath: joinDisplayPath(resolvedDir, trimmedDir) } : {}),
    };
  }
  if (isBrowserTabId(activeTab)) {
    const tab = browserTabs.find((candidate) => candidate.id === activeTab);
    if (!tab) return null;
    const url = tab.url?.trim() ?? '';
    const label = url ? tab.title?.trim() || labelFromUrl(url) : tab.label;
    return {
      id: `browser:${tab.id}`,
      kind: 'browser',
      label,
      tabId: tab.id,
      ...(tab.title ? { title: tab.title } : {}),
      ...(url ? { url } : {}),
    };
  }
  if (isTerminalTabId(activeTab)) {
    const terminalId = terminalIdFromTabId(activeTab);
    return {
      id: `terminal:${terminalId}`,
      kind: 'terminal',
      label: t('workspace.newTerminal'),
      tabId: activeTab,
    };
  }
  if (isSideChatTabId(activeTab)) {
    const conversationId = conversationIdFromSideChatTabId(activeTab);
    const conversation = conversations.find((item) => item.id === conversationId);
    return {
      id: `side-chat:${conversationId}`,
      kind: 'side-chat',
      label: conversation?.title?.trim() || t('workspace.sideChatDefaultTitle'),
      tabId: activeTab,
    };
  }
  if (activeLiveArtifact) {
    return {
      id: `live-artifact:${activeLiveArtifact.artifactId}`,
      kind: 'live-artifact',
      label: activeLiveArtifact.title,
      tabId: activeLiveArtifact.tabId,
      path: activeLiveArtifact.slug,
    };
  }
  if (activeFile) {
    const filePath = activeFile.path ?? activeFile.name;
    return {
      id: `file:${filePath}`,
      kind: 'file',
      label: filePath.split('/').filter(Boolean).pop() || filePath,
      tabId: activeTab,
      path: filePath,
      ...(resolvedDir ? { absolutePath: joinDisplayPath(resolvedDir, filePath) } : {}),
    };
  }
  return null;
}

export interface WorkspaceContextsParams {
  designSystemProject: DesignSystemSummary | null;
  uploadDir: string;
  resolvedDir?: string | null;
  t: TranslateFn;
  visibleFiles: ProjectFile[];
  liveArtifactEntries: LiveArtifactWorkspaceEntry[];
  tabNames: string[];
  orderedWorkspaceTabs: WorkspaceOrderedTab[];
  conversations: Conversation[];
  sketches: Record<string, SketchState>;
}

export function computeWorkspaceContexts(
  params: WorkspaceContextsParams,
): WorkspaceContextItem[] {
  const {
    designSystemProject,
    uploadDir,
    resolvedDir,
    t,
    visibleFiles,
    liveArtifactEntries,
    tabNames,
    orderedWorkspaceTabs,
    conversations,
    sketches,
  } = params;
  const out: WorkspaceContextItem[] = [];
  const seen = new Set<string>();
  const push = (item: WorkspaceContextItem | null | undefined) => {
    if (!item) return;
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  if (designSystemProject) {
    push({
      id: 'workspace:design-system',
      kind: 'design-system',
      label: t('dsManager.tabDesignSystem'),
      tabId: DESIGN_SYSTEM_TAB,
    });
  }

  const trimmedDir = uploadDir.trim();
  const designFilesLabel = trimmedDir.split('/').filter(Boolean).pop() || t('workspace.designFiles');
  push({
    id: trimmedDir ? `folder:${trimmedDir}` : 'workspace:design-files',
    kind: trimmedDir ? 'folder' : 'design-files',
    label: designFilesLabel,
    tabId: DESIGN_FILES_TAB,
    ...(trimmedDir ? { path: trimmedDir } : {}),
    ...(resolvedDir ? { absolutePath: joinDisplayPath(resolvedDir, trimmedDir) } : {}),
  });

  const filesByName = new Map(visibleFiles.map((file) => [file.name, file] as const));
  const liveByTabId = new Map(liveArtifactEntries.map((entry) => [entry.tabId, entry] as const));
  const terminalTabNames = tabNames.filter(isTerminalTabId);

  for (const entry of orderedWorkspaceTabs) {
    if (entry.kind === 'browser') {
      const tab = entry.browserTab;
      const url = tab.url?.trim() ?? '';
      const label = url ? tab.title?.trim() || labelFromUrl(url) : tab.label;
      push({
        id: `browser:${tab.id}`,
        kind: 'browser',
        label,
        tabId: tab.id,
        ...(tab.title ? { title: tab.title } : {}),
        ...(url ? { url } : {}),
      });
      continue;
    }

    const name = entry.name;
    if (isTerminalTabId(name)) {
      const terminalId = terminalIdFromTabId(name);
      const ordinal = terminalTabNames.indexOf(name) + 1;
      push({
        id: `terminal:${terminalId}`,
        kind: 'terminal',
        label: ordinal > 1 ? `${t('workspace.newTerminal')} ${ordinal}` : t('workspace.newTerminal'),
        tabId: name,
      });
      continue;
    }

    if (isSideChatTabId(name)) {
      const conversationId = conversationIdFromSideChatTabId(name);
      const conversation = conversations.find((item) => item.id === conversationId);
      push({
        id: `side-chat:${conversationId}`,
        kind: 'side-chat',
        label: conversation?.title?.trim() || t('workspace.sideChatDefaultTitle'),
        tabId: name,
      });
      continue;
    }

    const liveArtifact = liveByTabId.get(name as LiveArtifactWorkspaceEntry['tabId']);
    if (liveArtifact) {
      push({
        id: `live-artifact:${liveArtifact.artifactId}`,
        kind: 'live-artifact',
        label: liveArtifact.title,
        tabId: liveArtifact.tabId,
        path: liveArtifact.slug,
      });
      continue;
    }

    const file = filesByName.get(name);
    if (file || (isSketchName(name) && sketches[name])) {
      const filePath = file?.path ?? file?.name ?? name;
      push({
        id: `file:${filePath}`,
        kind: 'file',
        label: filePath.split('/').filter(Boolean).pop() || filePath,
        tabId: name,
        path: filePath,
        ...(resolvedDir ? { absolutePath: joinDisplayPath(resolvedDir, filePath) } : {}),
      });
    }
  }

  return out;
}

