import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  clearHostBrowserData,
  isOpenDesignHostAvailable,
} from '@open-design/host';
import {
  openExternalUrl,
  projectRawUrl,
  writeProjectBase64File,
  writeProjectTextFile,
} from '../providers/registry';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { captureHostRegionSnapshot } from '../runtime/exports';
import { buildBoardCommentAttachments, commentsToAttachments } from '../comments';
import type {
  ChatCommentAttachment,
  PreviewAnnotationStyle,
  PreviewComment,
  PreviewCommentTarget,
} from '../types';
import {
  BROWSER_CANCEL_PICKER_SCRIPT,
  BROWSER_SERIALIZE_HTML_SCRIPT,
  BROWSER_VIEWPORT_PRESETS,
  type BrowserElementSnapshot,
  browserApplyStyleScript,
  browserApplyTextScript,
  browserCommentFilePath,
  browserElementPickerScript,
  browserMeasureTargetsScript,
  browserSnapshotFromUnknown,
  isProjectHtmlBrowserUrl,
  projectRelativePathFromBrowserUrl,
  type BrowserViewportId,
} from './design-browser-tools';
import { Icon } from './Icon';
import { BoardComposerPopover } from './BoardComposerPopover';
import { PreviewDrawOverlay } from './PreviewDrawOverlay';
import { RemixIcon } from './RemixIcon';

type BrowserHistoryEntry = {
  iconUrl?: string;
  title: string;
  url: string;
  lastVisitedAt: number;
  visitCount: number;
};

type BrowserNavigationEntry = {
  title: string;
  url: string;
};

function browserViewportIcon(viewport: BrowserViewportId): string {
  if (viewport === 'tablet') return 'tablet-line';
  if (viewport === 'mobile') return 'smartphone-line';
  return 'computer-line';
}

type ReferenceSite = {
  label: string;
  url: string;
  detail: string;
};

type ReferenceGroup = {
  /** Stable key used for the category filter (lowercase, no spaces). */
  id: string;
  title: string;
  sites: ReferenceSite[];
};

export type BrowserUseCategoryId =
  | 'assets'
  | 'tokens'
  | 'motion'
  | 'visual'
  | 'structure'
  | 'project'
  | 'general';

export interface BrowserUseAction {
  id: string;
  label: string;
  input: string;
  output: string;
  prompt: string;
}

export interface BrowserUseCategory {
  id: BrowserUseCategoryId;
  title: string;
  titleKey: keyof Dict;
  searchTerms?: string[];
  actions: BrowserUseAction[];
}

const BROWSER_USE_INPUT_KEYS: Record<string, keyof Dict> = {
  none: 'browserUse.input.none',
  'kind: images|svgs|media|fonts, limit=200': 'browserUse.input.assetKind',
  'optional selector': 'browserUse.input.optionalSelector',
  'requirement, selector? optional': 'browserUse.input.requirementSelector',
  'selector? optional': 'browserUse.input.selectorOptional',
  'scale=1': 'browserUse.input.scaleOne',
  'selector, scale=2': 'browserUse.input.selectorScaleTwo',
  'columns=12, maxWidth=1200, gap=24': 'browserUse.input.gridOverlay',
  "selector='body'": 'browserUse.input.bodySelector',
  'url / domain / search terms': 'browserUse.input.navigate',
  selector: 'browserUse.input.selector',
  'selector, text': 'browserUse.input.selectorText',
  'pixels / top / bottom / page': 'browserUse.input.scroll',
  'command, timeoutMs=120000': 'browserUse.input.terminalRun',
  command: 'browserUse.input.command',
  'maxChars=8000': 'browserUse.input.maxChars',
};

function browserUseActionOutputKey(action: BrowserUseAction): keyof Dict {
  return `browserUse.action.${action.id}.output` as keyof Dict;
}

function browserUseActionInputKey(action: BrowserUseAction): keyof Dict {
  return BROWSER_USE_INPUT_KEYS[action.input] ?? 'browserUse.input.custom';
}

function localizedBrowserUseInput(
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string,
  action: BrowserUseAction,
): string {
  const key = browserUseActionInputKey(action);
  return key === 'browserUse.input.custom' ? t(key, { input: action.input }) : t(key);
}

export interface BrowserUsePromptContext {
  browserFilePath?: string;
  projectId?: string;
  resolvedDir?: string | null;
  tabLabel?: string;
  title?: string;
  url?: string;
}

type PageBrief = {
  title?: string;
  url?: string;
  description?: string;
  headings?: string[];
  images?: string[];
  links?: { text: string; url: string }[];
  colors?: { value: string; count: number }[];
};

type BrowserTool = 'comment' | 'inspect' | 'edit';
type BrowserStyleDraft = Required<Pick<
  PreviewAnnotationStyle,
  'backgroundColor' | 'borderRadius' | 'color' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'paddingTop' | 'textAlign'
>>;

type WebviewElement = HTMLElement & {
  canGoBack(): boolean;
  canGoForward(): boolean;
  capturePage(): Promise<{ toDataURL(): string }>;
  executeJavaScript<T = unknown>(code: string, userGesture?: boolean): Promise<T>;
  getTitle(): string;
  getURL(): string;
  goBack(): void;
  goForward(): void;
  isLoading(): boolean;
  loadURL?(url: string): void | Promise<void>;
  reload(): void;
  reloadIgnoringCache(): void;
};

type WebviewNavigationEvent = Event & {
  isMainFrame?: boolean;
  url?: string;
};

type WebviewTitleEvent = Event & {
  explicitSet?: boolean;
  title?: string;
};

type WebviewFaviconEvent = Event & {
  favicons?: string[];
};

interface DesignBrowserPanelProps {
  initialIconUrl?: string;
  initialTitle?: string;
  initialUrl?: string;
  projectId: string;
  resolvedDir?: string | null;
  onOpenFile: (name: string) => void;
  onRefreshFiles: () => Promise<void> | void;
  onPageInfoChange?: (info: BrowserPageInfo) => void;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images?: File[]) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[], images?: File[]) => Promise<boolean | void> | boolean | void;
  onRequestBrowserUsePrompt?: (prompt: string) => void;
  sendDisabled?: boolean;
}

export interface BrowserPageInfo {
  iconUrl?: string;
  title: string;
  url: string;
}

const EMPTY_URL = 'about:blank';
const DESIGN_BROWSER_PARTITION = 'persist:open-design-design-browser';
const HISTORY_LIMIT = 80;
const HISTORY_SUGGESTION_LIMIT = 20;
const EMPTY_PREVIEW_COMMENTS: PreviewComment[] = [];
// Cap the resource-hint (`dns-prefetch`/`preconnect`) links we leave in <head>.
// Hovering/typing origins used to accumulate them and their Set entries forever.
const WARMED_ORIGIN_LIMIT = 32;
const warmedOrigins = new Map<string, HTMLLinkElement[]>();

function browserHomeNavigationEntry(): BrowserNavigationEntry {
  return { title: 'Reference Board', url: EMPTY_URL };
}

function initialBrowserState(initialUrl?: string, initialTitle?: string): {
  addressValue: string;
  navigationIndex: number;
  navigationStack: BrowserNavigationEntry[];
  url: string;
} {
  const url = initialUrl?.trim() && isHistoryUrl(initialUrl.trim())
    ? initialUrl.trim()
    : EMPTY_URL;
  if (url === EMPTY_URL) {
    return {
      addressValue: '',
      navigationIndex: 0,
      navigationStack: [browserHomeNavigationEntry()],
      url,
    };
  }
  const title = initialTitle?.trim() || labelFromUrl(url);
  return {
    addressValue: url,
    navigationIndex: 0,
    navigationStack: [{ title, url }],
    url,
  };
}

// The Reference Board catalogue. Order is intentional: the categories a working
// designer reaches for most often (inspiration, real product UI) lead, followed
// by motion/color/type/asset references, then systems/guidelines/tooling.
// Adding a group here automatically adds its filter chip and address-bar
// suggestions — `id` is the stable filter key, `title` is the display label.
export const REFERENCE_GROUPS: ReferenceGroup[] = [
  {
    id: 'inspiration',
    title: 'Inspiration',
    sites: [
      { label: 'Dribbble', url: 'https://dribbble.com/', detail: 'Design shots and UI inspiration.' },
      { label: 'Behance', url: 'https://www.behance.net/', detail: 'Creative portfolios and case studies.' },
      { label: 'Awwwards', url: 'https://www.awwwards.com/', detail: 'Award-winning website design.' },
      { label: 'Godly', url: 'https://godly.website/', detail: 'Curated modern web design.' },
      { label: 'Land-book', url: 'https://land-book.com/', detail: 'Landing page gallery and patterns.' },
    ],
  },
  {
    id: 'interfaces',
    title: 'Real Interfaces',
    sites: [
      { label: 'Mobbin', url: 'https://mobbin.com/', detail: 'Real app screens and UI patterns.' },
      { label: 'Screenlane', url: 'https://screenlane.com/', detail: 'Latest UI design patterns from apps.' },
      { label: 'Page Flows', url: 'https://pageflows.com/', detail: 'Real product user flows and onboarding.' },
      { label: 'UI Sources', url: 'https://www.uisources.com/', detail: 'Interaction patterns from top apps.' },
      { label: 'Collect UI', url: 'https://collectui.com/', detail: 'Daily UI collection by category.' },
    ],
  },
  {
    id: 'motion',
    title: 'Motion',
    sites: [
      { label: 'GSAP', url: 'https://gsap.com/', detail: 'Production animation engine and examples.' },
      { label: 'Animations.dev', url: 'https://animations.dev/', detail: 'Animation patterns and interaction examples.' },
      { label: 'Transitions', url: 'https://transitions.dev/', detail: 'Transition patterns for modern interfaces.' },
      { label: 'Motion Sites', url: 'https://motionsites.ai/', detail: 'High-end motion and interaction references.' },
      { label: 'Motion.page Showcase', url: 'https://motion.page/showcase/', detail: 'Scroll and timeline animation inspiration.' },
      { label: 'Animography', url: 'https://animography.net/', detail: 'Animated type and kinetic lettering.' },
      { label: 'React Bits Shiny Text', url: 'https://reactbits.dev/text-animations/shiny-text', detail: 'React text animation reference for shiny kinetic type.' },
    ],
  },
  {
    id: 'color',
    title: 'Color',
    sites: [
      { label: 'Coolors', url: 'https://coolors.co/', detail: 'Fast color palette generator.' },
      { label: 'Color Hunt', url: 'https://colorhunt.co/', detail: 'Curated color palettes.' },
      { label: 'Realtime Colors', url: 'https://www.realtimecolors.com/', detail: 'Preview palettes on a real UI.' },
      { label: 'Adobe Color', url: 'https://color.adobe.com/', detail: 'Color wheel and harmony rules.' },
      { label: 'Happy Hues', url: 'https://www.happyhues.co/', detail: 'Palettes shown in real context.' },
    ],
  },
  {
    id: 'type',
    title: 'Typography',
    sites: [
      { label: 'Google Fonts', url: 'https://fonts.google.com/', detail: 'Open-source font library.' },
      { label: 'Fontshare', url: 'https://www.fontshare.com/', detail: 'Quality fonts free for commercial use.' },
      { label: 'Typewolf', url: 'https://www.typewolf.com/', detail: 'Fonts in use and pairing guidance.' },
      { label: 'Fontpair', url: 'https://www.fontpair.co/', detail: 'Font pairing suggestions.' },
      { label: 'Fonts In Use', url: 'https://fontsinuse.com/', detail: 'Typography in real-world design.' },
    ],
  },
  {
    id: 'icons',
    title: 'Icons',
    sites: [
      { label: 'The SVG', url: 'https://thesvg.org/', detail: 'SVG assets and vector references.' },
      { label: 'SVG Logos', url: 'https://svglogos.dev/', detail: 'Clean SVG logos for product and brand mocks.' },
      { label: 'Lobe Icons', url: 'https://icons.lobehub.com/', detail: 'Product and AI-brand icons for interfaces.' },
      { label: 'Iconify', url: 'https://icon-sets.iconify.design/', detail: '200k+ open-source icons in one place.' },
      { label: 'Lucide', url: 'https://lucide.dev/', detail: 'Clean, consistent open icon set.' },
      { label: 'Heroicons', url: 'https://heroicons.com/', detail: 'Tailwind-made SVG icons.' },
      { label: 'SVG Repo', url: 'https://www.svgrepo.com/', detail: 'Free SVG vectors and icons.' },
    ],
  },
  {
    id: 'illustration',
    title: 'Illustration',
    sites: [
      { label: 'Storyset', url: 'https://storyset.com/', detail: 'Customizable vector illustrations.' },
      { label: 'unDraw', url: 'https://undraw.co/', detail: 'Open-source MIT illustrations.' },
      { label: 'Blush', url: 'https://blush.design/', detail: 'Mix-and-match illustrations.' },
      { label: 'Lummi', url: 'https://www.lummi.ai/', detail: 'Free AI-generated visuals.' },
      { label: 'Whirrls', url: 'https://www.whirrls.com/', detail: 'Hand-drawn image references.' },
      { label: 'World in Dots', url: 'https://www.worldindots.com/', detail: 'Dot-map and data-viz references.' },
    ],
  },
  {
    id: 'photography',
    title: 'Photography',
    sites: [
      { label: 'Unsplash', url: 'https://unsplash.com/', detail: 'Free high-resolution photos.' },
      { label: 'Pexels', url: 'https://www.pexels.com/', detail: 'Free stock photos and video.' },
      { label: 'Pixabay', url: 'https://pixabay.com/', detail: 'Royalty-free images and media.' },
      { label: 'Cosmos', url: 'https://www.cosmos.so/', detail: 'Visual discovery and mood boards.' },
    ],
  },
  {
    id: '3d',
    title: '3D & Graphics',
    sites: [
      { label: 'Spline', url: 'https://spline.design/', detail: 'Browser-based 3D design.' },
      { label: 'Three.js Examples', url: 'https://threejs.org/examples/', detail: 'WebGL 3D references and demos.' },
      { label: 'Womp', url: 'https://womp.com/', detail: 'Easy in-browser 3D creation.' },
      { label: 'Pixcap', url: 'https://pixcap.com/', detail: '3D icons, mockups, and scenes.' },
    ],
  },
  {
    id: 'mockups',
    title: 'Mockups',
    sites: [
      { label: 'Shots', url: 'https://shots.so/', detail: 'Device and browser mockups.' },
      { label: 'Mockuuups Studio', url: 'https://mockuuups.studio/', detail: 'Drag-and-drop device mockups.' },
      { label: 'Angle', url: 'https://angle.sh/', detail: '3D device mockup library.' },
      { label: 'Rotato', url: 'https://rotato.app/', detail: 'Animated 3D product mockups.' },
    ],
  },
  {
    id: 'systems',
    title: 'Design Systems',
    sites: [
      { label: 'Impeccable Style', url: 'https://impeccable.style/', detail: 'High-quality style and interface references.' },
      { label: 'Styles Refero', url: 'https://styles.refero.design/', detail: 'Design style references and visual systems.' },
      { label: 'Brandfetch', url: 'https://brandfetch.com/', detail: 'Brand assets, logos, and identity.' },
      { label: 'Design Systems Repo', url: 'https://designsystemsrepo.com/', detail: 'Gallery of public design systems.' },
      { label: 'Startups Gallery', url: 'https://startups.gallery/', detail: 'Top startup product and brand references.' },
    ],
  },
  {
    id: 'components',
    title: 'Components',
    sites: [
      { label: 'Base UI', url: 'https://base-ui.com/', detail: 'Unstyled accessible primitives for custom systems.' },
      { label: 'shadcn/ui', url: 'https://ui.shadcn.com/', detail: 'Composable React components built on Radix and Tailwind.' },
      { label: 'HeroUI', url: 'https://www.heroui.com/', detail: 'Modern React component library and design system.' },
      { label: 'Radix UI', url: 'https://www.radix-ui.com/', detail: 'Accessible low-level UI primitives.' },
      { label: 'React Aria', url: 'https://react-spectrum.adobe.com/react-aria/', detail: 'Accessible behavior primitives from Adobe.' },
      { label: 'Headless UI', url: 'https://headlessui.com/', detail: 'Unstyled accessible components for Tailwind projects.' },
      { label: 'MUI', url: 'https://mui.com/', detail: 'Material-based React component ecosystem.' },
      { label: 'Mantine', url: 'https://mantine.dev/', detail: 'Full-featured React components and hooks.' },
      { label: 'Chakra UI', url: 'https://chakra-ui.com/', detail: 'Accessible React components with theme tokens.' },
      { label: 'Ant Design', url: 'https://ant.design/', detail: 'Enterprise component system and patterns.' },
      { label: 'Ark UI', url: 'https://ark-ui.com/', detail: 'Headless components across modern frameworks.' },
      { label: 'daisyUI', url: 'https://daisyui.com/', detail: 'Tailwind CSS component classes and themes.' },
    ],
  },
  {
    id: 'guidelines',
    title: 'Guidelines & A11y',
    sites: [
      { label: 'Apple HIG', url: 'https://developer.apple.com/design/human-interface-guidelines', detail: 'Apple platform design guidelines.' },
      { label: 'Material Design', url: 'https://m3.material.io/', detail: "Google's Material Design 3." },
      { label: 'Laws of UX', url: 'https://lawsofux.com/', detail: 'UX principles and heuristics.' },
      { label: 'WebAIM Contrast', url: 'https://webaim.org/resources/contrastchecker/', detail: 'Color contrast checker.' },
      { label: 'The A11y Project', url: 'https://www.a11yproject.com/', detail: 'Accessibility checklist and patterns.' },
    ],
  },
  {
    id: 'tools',
    title: 'Tools & Resources',
    sites: [
      { label: 'Toolfolio', url: 'https://toolfolio.io/', detail: 'Design tools, resources, and collections.' },
      { label: 'GetDesign', url: 'https://getdesign.md/', detail: 'Curated design resources.' },
      { label: 'Taste Skill', url: 'https://www.tasteskill.dev/', detail: 'Design taste training and critique references.' },
      { label: 'UI Goodies', url: 'https://www.uigoodies.com/', detail: 'Hand-picked design resources.' },
      { label: 'Sidebar', url: 'https://sidebar.io/', detail: 'Five design links, every day.' },
      { label: 'Superset', url: 'https://github.com/superset-sh/superset', detail: 'Reference implementation for embedded browser workflows.' },
    ],
  },
];

/** Total number of curated references across every category (drives the "All" chip badge). */
export const REFERENCE_TOTAL = REFERENCE_GROUPS.reduce((sum, group) => sum + group.sites.length, 0);

/**
 * Filter the reference catalogue by an active category and a free-text query.
 *
 * `category` is either the sentinel `'all'` or a {@link ReferenceGroup.id}. The
 * query matches a site's label, hostname, or detail, OR the owning group's
 * title (so searching "color" surfaces the whole Color group). Groups with no
 * surviving sites are dropped, so the result is always ready to render as-is.
 */
export function filterReferenceGroups(
  groups: ReferenceGroup[],
  category: string,
  query: string,
): ReferenceGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  return groups
    .filter((group) => category === 'all' || group.id === category)
    .map((group) => {
      if (!needle) return group;
      if (group.title.toLocaleLowerCase().includes(needle)) return group;
      const sites = group.sites.filter(
        (site) =>
          site.label.toLocaleLowerCase().includes(needle) ||
          site.detail.toLocaleLowerCase().includes(needle) ||
          hostnameFromUrl(site.url).toLocaleLowerCase().includes(needle),
      );
      return { ...group, sites };
    })
    .filter((group) => group.sites.length > 0);
}

export const BROWSER_USE_CATEGORIES: BrowserUseCategory[] = [
  {
    id: 'assets',
    title: 'Asset extraction',
    titleKey: 'browserUse.category.assets',
    searchTerms: ['assets', 'images', 'svg'],
    actions: [
      { id: 'extract_logo', label: 'extract_logo', input: 'none', output: 'Best logo candidates from header/nav/class/position plus og/favicon fallback.', prompt: 'Find likely site logo assets using DOM position, class names, header/nav context, OG image, and favicon evidence.' },
      { id: 'list_images', label: 'list_images', input: 'none', output: 'All img/srcset/source/CSS background images with dimensions and alt text.', prompt: 'Inventory every visible and CSS-referenced image, including dimensions, alt text, and source URLs.' },
      { id: 'download_assets', label: 'download_assets', input: 'kind: images|svgs|media|fonts, limit=200', output: 'Downloaded asset folder plus _manifest.json with referer/cookie support.', prompt: 'Download the requested asset kind from the bound Browser tab into the project and write a compact manifest.' },
      { id: 'extract_svgs', label: 'extract_svgs', input: 'none', output: 'Inline svg and linked .svg files saved as .svg.', prompt: 'Extract all inline and linked SVG assets from the page and save them as project files.' },
      { id: 'optimize_svgs', label: 'optimize_svgs', input: 'none', output: 'Optimized SVG files and compression ratio.', prompt: 'Extract page SVGs, lightly optimize comments/metadata/editor namespaces, and report compression ratios.' },
    ],
  },
  {
    id: 'tokens',
    title: 'Design language',
    titleKey: 'browserUse.category.tokens',
    searchTerms: ['tokens', 'palette', 'typography'],
    actions: [
      { id: 'extract_colors', label: 'extract_colors', input: 'none', output: 'Weighted palette plus :root CSS variables as palette.json and palette.html.', prompt: 'Extract the weighted color palette and CSS color variables, then save a JSON file and visual swatch preview.' },
      { id: 'extract_fonts', label: 'extract_fonts', input: 'none', output: 'Top font families, sizes, weights, and @font-face rules as typography.json.', prompt: 'Extract computed font families, size/weight usage, and @font-face declarations from the current page.' },
      { id: 'extract_design_tokens', label: 'extract_design_tokens', input: 'none', output: 'Radius, shadow, spacing, and CSS variables as tokens.json.', prompt: 'Extract reusable design tokens from computed CSS: radius, shadows, spacing, and custom properties.' },
      { id: 'extract_type_scale', label: 'extract_type_scale', input: 'none', output: 'h1-h6/p/button type scale with size, weight, line-height, and ratios.', prompt: 'Extract the effective typography scale for headings, body, buttons, labels, weights, line heights, and adjacent ratios.' },
      { id: 'extract_buttons', label: 'extract_buttons', input: 'none', output: 'Deduped button style library as buttons.html and buttons.json.', prompt: 'Extract a deduped gallery of button variants, states, labels, and computed styles.' },
      { id: 'extract_grid_system', label: 'extract_grid_system', input: 'none', output: 'Grid/flex containers, direction, gaps, columns, and max widths as layout.json.', prompt: 'Detect layout containers and grid/flex systems, including gaps, columns, directions, and max-width rules.' },
      { id: 'extract_breakpoints', label: 'extract_breakpoints', input: 'none', output: 'Responsive media-query breakpoints as breakpoints.json.', prompt: 'Extract responsive breakpoints from stylesheets and summarize what changes at each breakpoint.' },
      { id: 'extract_gradients', label: 'extract_gradients', input: 'none', output: 'CSS gradients as gradients.css, gradients.json, and preview HTML.', prompt: 'Find linear, radial, and conic gradients and save reusable CSS, JSON, and an HTML preview.' },
      { id: 'extract_shadows', label: 'extract_shadows', input: 'none', output: 'box-shadow, text-shadow, and drop-shadow as shadows.json plus preview.', prompt: 'Extract shadow styles from the page and generate a compact visual preview.' },
      { id: 'extract_easings', label: 'extract_easings', input: 'none', output: 'Transition/animation easing functions as easings.json.', prompt: 'Extract easing functions from CSS transitions and animations, including cubic-bezier, steps, and named easings.' },
      { id: 'export_tokens', label: 'export_tokens', input: 'none', output: 'tokens.css, tokens.scss, tailwind.theme.js, style-dictionary.tokens.json.', prompt: 'Export extracted tokens in CSS variables, SCSS, Tailwind theme, and Style Dictionary formats.' },
    ],
  },
  {
    id: 'motion',
    title: 'Motion',
    titleKey: 'browserUse.category.motion',
    searchTerms: ['animation', 'motion'],
    actions: [
      { id: 'extract_animations', label: 'extract_animations', input: 'optional selector', output: '@keyframes, transition/transform rules, detected motion libraries, motion.css, motion.json.', prompt: 'Extract animation evidence from the page or selector scope, including keyframes, transitions, transforms, and motion libraries.' },
    ],
  },
  {
    id: 'visual',
    title: 'Visual QA',
    titleKey: 'browserUse.category.visual',
    searchTerms: ['screenshot', 'accessibility', 'layout'],
    actions: [
      { id: 'validate_view', label: 'validate_view', input: 'requirement, selector? optional', output: 'Screenshot paths plus structured visual/layout issues.', prompt: 'Validate the current view against the requirement using screenshots plus layout audit evidence, then return issues and asset paths.' },
      { id: 'audit_layout', label: 'audit_layout', input: 'selector? optional', output: 'Layout defects: overflow, bounds, overlap, clipped text as audit.json.', prompt: 'Run a deterministic layout audit for overflow, out-of-bounds elements, text overlap, and clipped text.' },
      { id: 'audit_accessibility', label: 'audit_accessibility', input: 'selector? optional', output: 'A11y issues with selectors, labels, roles, focus, contrast, and screenshots where useful.', prompt: 'Audit accessibility evidence for the page or selector scope: names, roles, labels, focus order, contrast, and obvious keyboard traps.' },
      { id: 'responsive_screenshots', label: 'responsive_screenshots', input: 'none', output: 'Mobile 390, tablet 834, and desktop 1440 screenshots.', prompt: 'Capture mobile, tablet, and desktop screenshots for the current page and compare the main layout shifts.' },
      { id: 'screenshot_full', label: 'screenshot_full', input: 'scale=1', output: 'Full-page screenshot beyond the viewport.', prompt: 'Capture a full-page screenshot of the bound Browser tab and save it in the project.' },
      { id: 'screenshot_element', label: 'screenshot_element', input: 'selector, scale=2', output: 'Single element screenshot at 2x by default.', prompt: 'Capture a screenshot of the requested element selector, preferring a direct element capture over a cropped page image.' },
      { id: 'screenshot_with_grid', label: 'screenshot_with_grid', input: 'columns=12, maxWidth=1200, gap=24', output: 'Screenshot with layout grid overlay.', prompt: 'Overlay a responsive column grid on the page and capture a screenshot for alignment review.' },
      { id: 'screenshot_dark_mode', label: 'screenshot_dark_mode', input: 'none', output: 'Screenshot with prefers-color-scheme: dark.', prompt: 'Emulate dark color scheme and capture a screenshot of the page state.' },
      { id: 'generate_styleguide', label: 'generate_styleguide', input: 'none', output: 'One-page style guide with colors, type scale, radius, and shadows.', prompt: 'Generate a concise one-page style guide from page evidence: colors, typography, radius, shadows, and reusable UI notes.' },
    ],
  },
  {
    id: 'structure',
    title: 'Component structure',
    titleKey: 'browserUse.category.structure',
    searchTerms: ['html', 'copy', 'forms', 'nav'],
    actions: [
      { id: 'extract_html', label: 'extract_html', input: "selector='body'", output: 'Clean self-contained HTML without script/noscript/on* attributes.', prompt: 'Extract clean self-contained HTML for the selected area, removing scripts and inline event handlers.' },
      { id: 'extract_component_inventory', label: 'extract_component_inventory', input: 'none', output: 'Repeated component patterns, selectors, counts, and screenshots.', prompt: 'Inventory repeated component patterns such as cards, nav items, pricing rows, modals, accordions, and tables.' },
      { id: 'extract_copy', label: 'extract_copy', input: 'none', output: 'Headings, CTAs, body copy, descriptions as copy.md and copy.json.', prompt: 'Extract product copy from the page: headings, CTA labels, paragraphs, descriptions, and repeated text patterns.' },
      { id: 'extract_nav', label: 'extract_nav', input: 'none', output: 'Primary navigation and footer links as sitemap.md and nav.json.', prompt: 'Extract primary navigation, footer links, and sitemap-like structure from the current page.' },
      { id: 'extract_forms', label: 'extract_forms', input: 'none', output: 'Form fields, labels, validation hints, and submit actions as forms.json.', prompt: 'Extract form structure, labels, placeholders, validation hints, required states, and submit actions.' },
    ],
  },
  {
    id: 'project',
    title: 'Project runtime',
    titleKey: 'browserUse.category.project',
    searchTerms: ['dev server', 'framework'],
    actions: [
      { id: 'run_project', label: 'run_project', input: 'none', output: 'Detected dev server URL opened in Browser tab.', prompt: 'Detect, install if needed, run the project dev server, find the local URL, and open it in the Browser tab.' },
      { id: 'detect_project', label: 'detect_project', input: 'none', output: 'Framework, package manager, install command, dev command, and port.', prompt: 'Detect the project setup from package files, lockfiles, and framework config, then report install/dev commands and likely ports.' },
    ],
  },
  {
    id: 'general',
    title: 'General actions',
    titleKey: 'browserUse.category.general',
    searchTerms: ['metadata', 'navigate', 'terminal'],
    actions: [
      { id: 'page_info', label: 'page_info', input: 'none', output: 'URL, title, description, OG image, theme color, favicon, viewport.', prompt: 'Read compact metadata for the bound Browser tab: URL, title, description, OG/Twitter cards, theme color, favicon, and viewport.' },
      { id: 'snapshot', label: 'snapshot', input: 'none', output: 'Up to 120 visible interactive/text elements with tag, label, href, and coordinates.', prompt: 'Capture a compact DOM interaction snapshot for agent reasoning, capped to the most useful visible controls and text blocks.' },
      { id: 'navigate', label: 'navigate', input: 'url / domain / search terms', output: 'Open page and return page_info.', prompt: 'Navigate the bound Browser tab to the requested URL, domain, or search query, then report the resulting page_info.' },
      { id: 'click', label: 'click', input: 'selector', output: 'Click first matching element after scrolling it into view.', prompt: 'Click the first element matching the requested selector in the bound Browser tab, then report the visible result.' },
      { id: 'type_text', label: 'type_text', input: 'selector, text', output: 'Fill an input and dispatch input/change events.', prompt: 'Type the requested text into the selected input or editable element and dispatch the normal browser events.' },
      { id: 'scroll', label: 'scroll', input: 'pixels / top / bottom / page', output: 'Current and maximum scroll position.', prompt: 'Scroll the page by the requested amount or target, then report the resulting scroll position.' },
      { id: 'extract_og_metadata', label: 'extract_og_metadata', input: 'none', output: 'Meta title/description/canonical, OG/Twitter cards, social image, theme color.', prompt: 'Extract SEO and social preview metadata, including canonical, OG, Twitter card, image, and theme-color evidence.' },
      { id: 'terminal_run', label: 'terminal_run', input: 'command, timeoutMs=120000', output: 'stdout, stderr, and exit code.', prompt: 'Run the requested terminal command to completion in the shared project terminal and summarize stdout, stderr, and exit code.' },
      { id: 'terminal_run_background', label: 'terminal_run_background', input: 'command', output: 'Background task id and recent output.', prompt: 'Start the requested long-running terminal command in the background and report how to read its output.' },
      { id: 'terminal_read', label: 'terminal_read', input: 'maxChars=8000', output: 'Recent shared terminal output.', prompt: 'Read recent terminal output and extract URLs, errors, or readiness signals relevant to the bound Browser tab.' },
    ],
  },
];

export const BROWSER_USE_ACTION_TOTAL = BROWSER_USE_CATEGORIES.reduce(
  (sum, group) => sum + group.actions.length,
  0,
);

export function browserUseActionById(id: string): BrowserUseAction | null {
  for (const group of BROWSER_USE_CATEGORIES) {
    const action = group.actions.find((item) => item.id === id);
    if (action) return action;
  }
  return null;
}

export function filterBrowserUseCategories(
  groups: BrowserUseCategory[],
  query: string,
  localizeCategoryTitle?: (category: BrowserUseCategory) => string,
  localizeAction?: (action: BrowserUseAction) => string[],
): BrowserUseCategory[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => {
      const localizedTitle = localizeCategoryTitle?.(group) ?? group.title;
      const groupMatches = [
        group.title,
        localizedTitle,
        ...(group.searchTerms ?? []),
      ].some((value) => value.toLocaleLowerCase().includes(needle));
      const actions = groupMatches
        ? group.actions
        : group.actions.filter((action) =>
          [
            action.id,
            action.label,
            action.input,
            action.output,
            action.prompt,
            ...(localizeAction?.(action) ?? []),
          ].some((value) => value.toLocaleLowerCase().includes(needle)),
        );
      return { ...group, actions };
    })
    .filter((group) => group.actions.length > 0);
}

export function browserUsePrompt(action: BrowserUseAction, context: BrowserUsePromptContext = {}): string {
  const title = context.title?.trim() || '(untitled)';
  const url = context.url?.trim() || EMPTY_URL;
  const tabLabel = context.tabLabel?.trim() || title || labelFromUrl(url);
  const browserFilePath = context.browserFilePath?.trim();
  const resolvedDir = context.resolvedDir?.trim();
  return [
    '@agent-browser',
    '',
    'Use the selected Open Design Browser tab as the bound target.',
    'Browser tab context:',
    `- tab: ${tabLabel}`,
    `- title: ${title}`,
    `- url: ${url}`,
    ...(browserFilePath ? [`- browser context path: ${browserFilePath}`] : []),
    ...(context.projectId ? [`- project id: ${context.projectId}`] : []),
    ...(resolvedDir ? [`- project directory: ${resolvedDir}`] : []),
    '',
    `Operation: ${action.id}`,
    `Input contract: ${action.input}`,
    `Expected output: ${action.output}`,
    '',
    `Task: ${action.prompt}`,
    '',
    'Evidence rules:',
    '1. Use browser-use / browser-harness style evidence: page_info, DOM snapshot, screenshots, accessibility tree, OG metadata, computed CSS, fonts, colors, motion rules, and layout audit as relevant.',
    '2. First confirm the bound tab URL/title. If the tab is blank and the operation needs a page, ask for or navigate to the target before extracting evidence.',
    '3. Save bulky assets, screenshots, manifests, and HTML extracts in the project, then summarize paths instead of pasting large dumps into chat.',
    '4. Return a concise result with evidence paths, key selectors, and any follow-up action needed.',
  ].join('\n');
}

const PAGE_BRIEF_SCRIPT = `(() => {
  const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) || '';
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map((node) => clean(node.textContent))
    .filter(Boolean)
    .slice(0, 18);
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((node) => ({ text: clean(node.textContent), url: node.href }))
    .filter((item) => item.url && item.text)
    .slice(0, 28);
  const images = Array.from(document.images)
    .map((image) => image.currentSrc || image.src)
    .filter(Boolean)
    .slice(0, 24);
  const colorCounts = new Map();
  const transparent = new Set(['rgba(0, 0, 0, 0)', 'transparent']);
  for (const element of Array.from(document.querySelectorAll('body, body *')).slice(0, 700)) {
    const style = getComputedStyle(element);
    for (const prop of ['color', 'backgroundColor', 'borderColor']) {
      const value = style[prop];
      if (!value || transparent.has(value)) continue;
      colorCounts.set(value, (colorCounts.get(value) || 0) + 1);
    }
  }
  return {
    title: clean(document.title),
    url: location.href,
    description: clean(attr('meta[name="description"]', 'content') || attr('meta[property="og:description"]', 'content')),
    headings,
    images,
    links,
    colors: Array.from(colorCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 16)
      .map(([value, count]) => ({ value, count })),
  };
})()`;

export function DesignBrowserPanel({
  initialIconUrl,
  initialTitle,
  initialUrl,
  projectId,
  resolvedDir,
  onOpenFile,
  onPageInfoChange,
  onRefreshFiles,
  previewComments = EMPTY_PREVIEW_COMMENTS,
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  onRequestBrowserUsePrompt,
  sendDisabled = false,
}: DesignBrowserPanelProps) {
  const t = useT();
  const desktopHostAvailable = isOpenDesignHostAvailable();
  const initialState = initialBrowserState(initialUrl, initialTitle);
  // `loadUrl` is the navigation target bound to the <webview>/<iframe> `src`.
  // It changes ONLY on user-initiated navigation. `currentUrl` is the committed
  // location shown in the address bar and recorded in history, synced from the
  // webview's own navigation events. They are deliberately separate: if `src`
  // tracked every committed URL, a server redirect (e.g. adding a trailing
  // slash) would mutate `src` mid-load and Electron would abort the in-flight
  // navigation (ERR_ABORTED -3), leaving the page blank.
  const [loadUrl, setLoadUrl] = useState(initialState.url);
  const [currentUrl, setCurrentUrl] = useState(initialState.url);
  const [addressValue, setAddressValue] = useState(initialState.addressValue);
  const [addressEditing, setAddressEditing] = useState(false);
  const [history, setHistory] = useState<BrowserHistoryEntry[]>(() => loadHistory(projectId));
  const [navigationStack, setNavigationStack] = useState<BrowserNavigationEntry[]>(initialState.navigationStack);
  const [navigationIndex, setNavigationIndex] = useState(initialState.navigationIndex);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [browserUseOpen, setBrowserUseOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [webviewNode, setWebviewNode] = useState<WebviewElement | null>(null);
  const [drawOverlayOpen, setDrawOverlayOpen] = useState(false);
  const [viewport, setViewport] = useState<BrowserViewportId>('desktop');
  const [activeTool, setActiveTool] = useState<BrowserTool | null>(null);
  const [activeCommentTarget, setActiveCommentTarget] = useState<BrowserElementSnapshot | null>(null);
  const [activePreviewCommentId, setActivePreviewCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [queuedCommentNotes, setQueuedCommentNotes] = useState<string[]>([]);
  const [browserImages, setBrowserImages] = useState<File[]>([]);
  const [browserImagePreviews, setBrowserImagePreviews] = useState<{ file: File; url: string }[]>([]);
  const [browserPreviewIndex, setBrowserPreviewIndex] = useState<number | null>(null);
  const [sendingComment, setSendingComment] = useState(false);
  const [savingDomEdit, setSavingDomEdit] = useState(false);
  const [browserLiveCommentTargets, setBrowserLiveCommentTargets] = useState<Map<string, BrowserElementSnapshot>>(() => new Map());
  const [textDraft, setTextDraft] = useState('');
  const [captureChromeHidden, setCaptureChromeHidden] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState<'brief' | 'screenshot' | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const pickerRequestIdRef = useRef(0);
  const restoredIconUrlRef = useRef(initialIconUrl?.trim() ?? '');
  const restoredTitleRef = useRef(initialTitle?.trim() ?? '');
  const navigationStackRef = useRef<BrowserNavigationEntry[]>(initialState.navigationStack);
  const navigationIndexRef = useRef(initialState.navigationIndex);
  const pendingLoadTargetRef = useRef<string | null>(null);
  const canGoBack = navigationIndex > 0;
  const canGoForward = navigationIndex >= 0 && navigationIndex < navigationStack.length - 1;
  const assignWebviewNode = useCallback((node: HTMLWebViewElement | null) => {
    // Set `allowpopups` imperatively rather than as a JSX prop. React's DOM
    // renderer does not treat `allowpopups` as a known boolean attribute, so
    // passing it through JSX logs "Received `true` for a non-boolean
    // attribute" at runtime (only reproducible once the webview branch mounts
    // in the desktop host). The attribute must still reach Electron's <webview>
    // as a present string so the guest page may open popups.
    if (node) node.setAttribute('allowpopups', 'true');
    setWebviewNode(node as WebviewElement | null);
  }, []);

  useEffect(() => {
    setHistory(loadHistory(projectId));
    const nextInitialState = initialBrowserState(initialUrl, initialTitle);
    setLoadUrl(nextInitialState.url);
    setCurrentUrl(nextInitialState.url);
    setAddressValue(nextInitialState.addressValue);
    setAddressEditing(false);
    setNavigationStack(nextInitialState.navigationStack);
    setNavigationIndex(nextInitialState.navigationIndex);
    navigationStackRef.current = nextInitialState.navigationStack;
    navigationIndexRef.current = nextInitialState.navigationIndex;
    pendingLoadTargetRef.current = null;
    if (isHistoryUrl(nextInitialState.url)) {
      commitHistory(
        nextInitialState.url,
        { iconUrl: initialIconUrl, title: initialTitle },
        { countVisit: false },
      );
    }
    // `initial*` props are mount-time tab restore inputs. During normal
    // navigation the parent updates them from onPageInfoChange; that must not
    // reset the live webview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveHistory(projectId, history), 140);
    return () => window.clearTimeout(timer);
  }, [history, projectId]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!menuOpen && !suggestionsOpen && !browserUseOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const chrome = chromeRef.current;
      if (chrome && event.target instanceof Node && chrome.contains(event.target)) return;
      setMenuOpen(false);
      setSuggestionsOpen(false);
      setBrowserUseOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [browserUseOpen, menuOpen, suggestionsOpen]);

  const commitHistory = useCallback((url: string, meta: { title?: string; iconUrl?: string } = {}, options: { countVisit?: boolean } = {}) => {
    if (!isHistoryUrl(url)) return;
    setHistory((current) => {
      const now = Date.now();
      const existing = current.find((entry) => sameUrl(entry.url, url));
      const nextTitle = meta.title && meta.title.trim()
        ? meta.title.trim()
        : existing?.title || labelFromUrl(url);
      const nextIconUrl = cleanIconUrl(meta.iconUrl) || existing?.iconUrl || faviconUrl(url);
      const visitIncrement = options.countVisit === false ? 0 : 1;
      const entry = existing
        ? {
            ...existing,
            iconUrl: nextIconUrl,
            title: nextTitle,
            lastVisitedAt: visitIncrement > 0 ? now : existing.lastVisitedAt,
            visitCount: existing.visitCount + visitIncrement,
          }
        : { iconUrl: nextIconUrl, title: nextTitle, url, lastVisitedAt: now, visitCount: 1 };
      if (
        existing &&
        existing.title === entry.title &&
        existing.iconUrl === entry.iconUrl &&
        existing.lastVisitedAt === entry.lastVisitedAt &&
        existing.visitCount === entry.visitCount
      ) {
        return current;
      }
      return [entry, ...current.filter((item) => !sameUrl(item.url, url))]
        .slice(0, HISTORY_LIMIT);
    });
  }, []);

  const setNavigationState = useCallback((stack: BrowserNavigationEntry[], index: number) => {
    navigationStackRef.current = stack;
    navigationIndexRef.current = index;
    setNavigationStack(stack);
    setNavigationIndex(index);
  }, []);

  const recordNavigation = useCallback((url: string, title?: string, options?: { replacePendingTarget?: boolean }) => {
    if (url !== EMPTY_URL && !isHistoryUrl(url)) return;

    const stack = navigationStackRef.current;
    const index = navigationIndexRef.current;
    const nextTitle = url === EMPTY_URL
      ? browserHomeNavigationEntry().title
      : title && title.trim()
        ? title.trim()
        : labelFromUrl(url);
    const nextEntry: BrowserNavigationEntry = { title: nextTitle, url };
    const updateEntry = (entries: BrowserNavigationEntry[], entryIndex: number) => {
      const existing = entries[entryIndex];
      const next = entries.slice();
      next[entryIndex] = {
        title: nextTitle || existing?.title || labelFromUrl(url),
        url,
      };
      return next;
    };
    const currentEntry = index >= 0 ? stack[index] : undefined;
    const pendingTarget = pendingLoadTargetRef.current;
    const shouldReplacePending =
      Boolean(options?.replacePendingTarget && pendingTarget && currentEntry && sameUrl(currentEntry.url, pendingTarget));

    if (currentEntry && (sameUrl(currentEntry.url, url) || shouldReplacePending)) {
      setNavigationState(updateEntry(stack, index), index);
      if (options?.replacePendingTarget) pendingLoadTargetRef.current = null;
      return;
    }

    const previousIndex = index - 1;
    if (previousIndex >= 0 && sameUrl(stack[previousIndex]?.url ?? '', url)) {
      setNavigationState(updateEntry(stack, previousIndex), previousIndex);
      if (options?.replacePendingTarget) pendingLoadTargetRef.current = null;
      return;
    }

    const nextIndex = index + 1;
    if (nextIndex < stack.length && sameUrl(stack[nextIndex]?.url ?? '', url)) {
      setNavigationState(updateEntry(stack, nextIndex), nextIndex);
      if (options?.replacePendingTarget) pendingLoadTargetRef.current = null;
      return;
    }

    const base = index >= 0 ? stack.slice(0, index + 1) : [];
    const nextStack = [...base, nextEntry].slice(-HISTORY_LIMIT);
    setNavigationState(nextStack, nextStack.length - 1);
    if (options?.replacePendingTarget) pendingLoadTargetRef.current = null;
  }, [setNavigationState]);

  const updateCurrentNavigationTitle = useCallback((title?: string) => {
    const trimmedTitle = title?.trim();
    const index = navigationIndexRef.current;
    if (!trimmedTitle || index < 0) return;
    const stack = navigationStackRef.current;
    const currentEntry = stack[index];
    if (!currentEntry || currentEntry.title === trimmedTitle) return;
    const nextStack = stack.slice();
    nextStack[index] = { ...currentEntry, title: trimmedTitle };
    setNavigationState(nextStack, index);
  }, [setNavigationState]);

  const loadWebviewUrl = useCallback((url: string) => {
    if (!webviewNode) {
      setLoadUrl(url);
      return;
    }
    if (loadUrl === EMPTY_URL) {
      setLoadUrl(url);
      return;
    }
    try {
      const result = webviewNode.loadURL?.(url);
      if (result instanceof Promise) void result.catch(() => setLoadUrl(url));
      else if (!webviewNode.loadURL) setLoadUrl(url);
    } catch {
      setLoadUrl(url);
    }
  }, [loadUrl, webviewNode]);

  const navigateTo = useCallback((rawAddress: string) => {
    const nextUrl = normalizeBrowserAddress(rawAddress);
    warmBrowserOrigin(nextUrl);
    pendingLoadTargetRef.current = isHistoryUrl(nextUrl) ? nextUrl : null;
    setCurrentUrl(nextUrl);
    setAddressValue(nextUrl === EMPTY_URL ? '' : nextUrl);
    setAddressEditing(false);
    setSuggestionsOpen(false);
    setMenuOpen(false);
    setBrowserUseOpen(false);
    if (isHistoryUrl(nextUrl)) {
      commitHistory(nextUrl, undefined, { countVisit: true });
      recordNavigation(nextUrl);
    } else if (nextUrl === EMPTY_URL) {
      setLoadUrl(EMPTY_URL);
      recordNavigation(nextUrl);
    }
    if (nextUrl !== EMPTY_URL) loadWebviewUrl(nextUrl);
  }, [commitHistory, loadWebviewUrl, recordNavigation]);

  const updateLoadingState = useCallback((node: WebviewElement | null = webviewNode) => {
    if (!node) {
      setIsLoading(false);
      return;
    }
    // Electron's <webview> throws ("The WebView must be attached to the DOM and
    // the dom-ready event emitted before this method can be called") when
    // isLoading runs before the guest attaches. The mount effect calls this
    // immediately, so guard like safeGetWebviewUrl/Title do.
    try {
      setIsLoading(Boolean(node.isLoading()));
    } catch {
      // Pre-dom-ready: keep the existing loading state.
    }
  }, [webviewNode]);

  useEffect(() => {
    const node = webviewNode;
    if (!node) return;

    const syncFromWebview = (
      url?: string,
      title?: string,
      options?: { iconUrl?: string; recordNavigation?: boolean; recordVisit?: boolean },
    ) => {
      const nextUrl = url || safeGetWebviewUrl(node);
      if (nextUrl) {
        setCurrentUrl(nextUrl);
        if (!addressEditing) {
          setAddressValue(nextUrl === EMPTY_URL ? '' : nextUrl);
        }
      }
      const nextTitle = title || safeGetWebviewTitle(node);
      if (nextUrl) {
        commitHistory(nextUrl, { iconUrl: options?.iconUrl, title: nextTitle }, { countVisit: options?.recordVisit === true });
        if (options?.recordNavigation !== false) {
          recordNavigation(nextUrl, nextTitle, { replacePendingTarget: true });
        } else {
          updateCurrentNavigationTitle(nextTitle);
        }
      }
      updateLoadingState(node);
    };
    const onStart = () => {
      setIsLoading(true);
      updateLoadingState(node);
    };
    const onStop = () => {
      setIsLoading(false);
      syncFromWebview(undefined, undefined, { recordVisit: false });
    };
    const onNavigate = (event: Event) => {
      const navigationEvent = event as WebviewNavigationEvent;
      if (navigationEvent.isMainFrame === false) return;
      const pendingTarget = pendingLoadTargetRef.current;
      const nextUrl = navigationEvent.url || safeGetWebviewUrl(node);
      const isPendingCommit = Boolean(pendingTarget && nextUrl && sameUrl(pendingTarget, nextUrl));
      syncFromWebview(nextUrl, undefined, { recordVisit: !isPendingCommit });
    };
    const onTitle = (event: Event) => {
      const titleEvent = event as WebviewTitleEvent;
      syncFromWebview(undefined, titleEvent.title, { recordNavigation: false, recordVisit: false });
    };
    const onFavicon = (event: Event) => {
      const faviconEvent = event as WebviewFaviconEvent;
      const iconUrl = faviconEvent.favicons?.find(isHttpLikeUrl);
      if (!iconUrl) return;
      syncFromWebview(undefined, undefined, { iconUrl, recordNavigation: false, recordVisit: false });
    };
    const onFail = (event: Event) => {
      const navigationEvent = event as WebviewNavigationEvent;
      if (navigationEvent.isMainFrame === false) return;
      setIsLoading(false);
      pendingLoadTargetRef.current = null;
      updateLoadingState(node);
    };

    node.addEventListener('did-start-loading', onStart);
    node.addEventListener('did-stop-loading', onStop);
    node.addEventListener('did-navigate', onNavigate);
    node.addEventListener('did-navigate-in-page', onNavigate);
    node.addEventListener('page-title-updated', onTitle);
    node.addEventListener('page-favicon-updated', onFavicon);
    node.addEventListener('did-fail-load', onFail);
    node.addEventListener('dom-ready', onStop);
    updateLoadingState(node);
    return () => {
      node.removeEventListener('did-start-loading', onStart);
      node.removeEventListener('did-stop-loading', onStop);
      node.removeEventListener('did-navigate', onNavigate);
      node.removeEventListener('did-navigate-in-page', onNavigate);
      node.removeEventListener('page-title-updated', onTitle);
      node.removeEventListener('page-favicon-updated', onFavicon);
      node.removeEventListener('did-fail-load', onFail);
      node.removeEventListener('dom-ready', onStop);
    };
  }, [addressEditing, commitHistory, recordNavigation, updateCurrentNavigationTitle, updateLoadingState, webviewNode]);

  const suggestions = useMemo(() => {
    const query = addressValue.trim().toLocaleLowerCase();
    const showDefaultSuggestions = addressEditing && currentUrl !== EMPTY_URL && sameUrl(addressValue.trim(), currentUrl);
    const referenceSuggestions = REFERENCE_GROUPS.flatMap((group) =>
      group.sites.map((site) => ({
        detail: `${group.title} - ${site.detail}`,
        id: `site:${site.url}`,
        iconUrl: referenceIconUrl(site.url),
        label: site.label,
        type: 'Reference' as const,
        url: site.url,
      })),
    );
    const historySuggestions = history.slice(0, HISTORY_SUGGESTION_LIMIT).map((entry) => ({
      detail: entry.url,
      id: `history:${entry.url}`,
      iconUrl: entry.iconUrl || faviconUrl(entry.url),
      label: entry.title || labelFromUrl(entry.url),
      type: 'History' as const,
      url: entry.url,
    }));
    const all = [...historySuggestions, ...referenceSuggestions];
    if (!query || showDefaultSuggestions) return all;
    return all
      .filter((item) =>
        `${item.label} ${item.url} ${item.detail}`.toLocaleLowerCase().includes(query),
      )
      .slice(0, HISTORY_SUGGESTION_LIMIT + referenceSuggestions.length);
  }, [addressEditing, addressValue, currentUrl, history]);

  const pageHistoryEntry = history.find((entry) => sameUrl(entry.url, currentUrl));
  const pageTitle = pageHistoryEntry?.title || restoredTitleRef.current || labelFromUrl(currentUrl);
  const pageIconUrl = pageHistoryEntry?.iconUrl || restoredIconUrlRef.current || faviconUrl(currentUrl);
  const addressDisplayParts = addressEditing
    ? { url: '' }
    : formatAddressDisplayParts(currentUrl, pageTitle);
  const shownAddressValue = addressEditing ? addressValue : '';
  // Drive the start-page/webview branch off the load target, not the committed
  // URL, so a transient about:blank navigation event can't unmount the webview.
  const isBlank = loadUrl === EMPTY_URL;
  const browserFilePath = isBlank ? browserCommentFilePath(EMPTY_URL) : browserCommentFilePath(currentUrl, resolvedDir);
  const editableProjectHtml = !isBlank && isProjectHtmlBrowserUrl(currentUrl, resolvedDir);
  const browserUseContext = useMemo<BrowserUsePromptContext>(() => ({
    browserFilePath,
    projectId,
    resolvedDir,
    tabLabel: isBlank ? 'Browser' : pageTitle,
    title: isBlank ? 'Browser' : pageTitle,
    url: isBlank ? EMPTY_URL : currentUrl,
  }), [browserFilePath, currentUrl, isBlank, pageTitle, projectId, resolvedDir]);
  const visibleComments = useMemo(
    () => previewComments
      .filter((comment) => comment.filePath === browserFilePath && comment.status === 'open')
      .sort((left, right) => left.createdAt - right.createdAt),
    [browserFilePath, previewComments],
  );
  const activeSavedComment = activePreviewCommentId
    ? visibleComments.find((comment) => comment.id === activePreviewCommentId) ?? null
    : null;

  useEffect(() => {
    const node = webviewNode;
    if (!node || isBlank) {
      setBrowserLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      return;
    }

    const commentTargets = visibleComments.map((comment) => ({
      elementId: comment.elementId,
      key: `comment:${comment.id}`,
      selector: comment.selector,
    }));
    const activeTarget = activeCommentTarget
      ? [{
          elementId: activeCommentTarget.elementId,
          key: 'active',
          selector: activeCommentTarget.selector,
        }]
      : [];
    const targets = [...commentTargets, ...activeTarget].filter((target) => target.elementId && target.selector);
    if (targets.length === 0) {
      setBrowserLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      return;
    }

    let cancelled = false;
    let running = false;
    const refresh = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        const result = await node.executeJavaScript<unknown>(
          browserMeasureTargetsScript(browserFilePath, targets),
          true,
        );
        if (cancelled || !Array.isArray(result)) return;
        const next = new Map<string, BrowserElementSnapshot>();
        for (const item of result) {
          if (!item || typeof item !== 'object') continue;
          const key = String((item as { key?: unknown }).key || '');
          if (!key) continue;
          const snapshot = browserSnapshotFromUnknown(item, browserFilePath);
          if (snapshot) next.set(key, snapshot);
        }
        setBrowserLiveCommentTargets((current) => (
          browserSnapshotMapsEqual(current, next) ? current : next
        ));
        const activeSnapshot = next.get('active');
        if (activeSnapshot) {
          setActiveCommentTarget((current) => (
            current && current.selector === activeSnapshot.selector && !browserSnapshotsEqual(current, activeSnapshot)
              ? { ...current, ...activeSnapshot }
              : current
          ));
          setTextDraft((current) => (
            activeTool === 'inspect' || activeTool === 'edit'
              ? current
              : activeSnapshot.text
          ));
        }
      } catch {
        // Cross-origin navigations, transient loads, and detached webviews can
        // reject executeJavaScript. Keep the saved positions until the next tick.
      } finally {
        running = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 250);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeCommentTarget?.elementId, activeCommentTarget?.selector, activeTool, browserFilePath, isBlank, visibleComments, webviewNode]);

  useEffect(() => {
    const next = browserImages.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setBrowserImagePreviews(next);
    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [browserImages]);

  useEffect(() => {
    onPageInfoChange?.({
      title: isBlank ? 'Browser' : pageTitle,
      url: isBlank ? '' : currentUrl,
      ...(!isBlank && pageIconUrl ? { iconUrl: pageIconUrl } : {}),
    });
  }, [currentUrl, isBlank, onPageInfoChange, pageIconUrl, pageTitle]);

  useEffect(() => {
    pickerRequestIdRef.current += 1;
    setActiveTool(null);
    setActiveCommentTarget(null);
    setActivePreviewCommentId(null);
    setCommentDraft('');
    setQueuedCommentNotes([]);
    setBrowserImages([]);
    setBrowserPreviewIndex(null);
    setTextDraft('');
    void cancelBrowserPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserFilePath]);

  async function handleAddressSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateTo(addressValue);
    addressInputRef.current?.blur();
  }

  async function copyCurrentUrl() {
    const text = isBlank ? '' : currentUrl;
    if (!text) {
      setStatusMessage('No URL to copy');
      return;
    }
    await copyText(text);
    setStatusMessage('URL copied');
    setMenuOpen(false);
  }

  async function openCurrentExternally() {
    if (isBlank || !isHttpLikeUrl(currentUrl)) {
      setStatusMessage('Open an http URL first');
      return;
    }
    await openExternalUrl(currentUrl);
    setMenuOpen(false);
  }

  async function takeScreenshot() {
    if (!webviewNode || isBlank) {
      setStatusMessage('Open a page before taking a screenshot');
      return;
    }
    setSavingAction('screenshot');
    // Close the dropdown first so it cannot appear in a host compositor capture
    // (which screenshots the on-screen window region, not the guest surface).
    setMenuOpen(false);
    if (drawOverlayOpen) flushSync(() => setCaptureChromeHidden(true));
    try {
      // Let the dropdown unmount + repaint before the compositor capture.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const dataUrl = await captureBrowserPageDataUrl();
      if (!dataUrl) throw new Error('screenshot capture failed');
      // Put the capture on the clipboard first so it is paste-ready (e.g. into
      // the chat composer) the instant it is taken; the project file is the
      // durable artifact, the clipboard is the fast path.
      const copied = await copyImageToClipboard(dataUrl);
      const base64 = dataUrl.split(',', 2)[1] ?? '';
      const file = await writeProjectBase64File(
        projectId,
        browserFileName('browser-capture', currentUrl, 'png'),
        base64,
      );
      if (!file) throw new Error('screenshot save failed');
      await onRefreshFiles();
      // Stay on the browser so the confirmation toast is visible and the page
      // remains in view; the capture is reachable from Design Files. Show
      // whether it reached the clipboard so the user knows it is paste-ready.
      setStatusMessage(copied ? 'Screenshot copied to clipboard' : 'Screenshot saved to project');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Screenshot failed');
    } finally {
      setCaptureChromeHidden(false);
      setSavingAction(null);
      setMenuOpen(false);
    }
  }

  // Capture the live page as a PNG data URL. Prefers the desktop compositor
  // screenshot of the webview's on-screen region: the embedded <webview> guest
  // WebContents' own capturePage() frequently returns an all-black frame (its
  // GPU surface is not available to that capture path), whereas the host
  // window's composited surface clipped to the webview rect yields the real
  // page pixels the user sees — including authenticated content, since it is
  // the same logged-in session. Falls back to the guest capturePage() only when
  // no desktop host is present.
  async function captureBrowserPageDataUrl(): Promise<string | null> {
    const node = webviewNode;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const hostSnap = await captureHostRegionSnapshot({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    if (hostSnap) return hostSnap.dataUrl;
    try {
      const image = await node.capturePage();
      return image.toDataURL();
    } catch {
      return null;
    }
  }

  async function captureBrowserSnapshot(): Promise<{ dataUrl: string; w: number; h: number } | null> {
    if (!webviewNode || isBlank) return null;
    const rect = webviewNode.getBoundingClientRect();
    const hostSnap = await captureHostRegionSnapshot({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    if (hostSnap) return hostSnap;
    try {
      const image = await webviewNode.capturePage();
      const dataUrl = image.toDataURL();
      const size = await imageSizeFromDataUrl(dataUrl);
      if (size) return { dataUrl, ...size };
      const dpr = window.devicePixelRatio || 1;
      return {
        dataUrl,
        w: Math.max(1, Math.round(rect.width * dpr)),
        h: Math.max(1, Math.round(rect.height * dpr)),
      };
    } catch {
      return null;
    }
  }

  async function savePageBrief() {
    if (!webviewNode || isBlank) {
      setStatusMessage('Open a page before saving a brief');
      return;
    }
    setSavingAction('brief');
    try {
      const brief = await webviewNode.executeJavaScript<PageBrief>(PAGE_BRIEF_SCRIPT, true);
      const file = await writeProjectTextFile(
        projectId,
        browserFileName('browser-brief', currentUrl, 'md'),
        pageBriefMarkdown(brief, currentUrl),
      );
      if (!file) throw new Error('brief save failed');
      await onRefreshFiles();
      onOpenFile(file.name);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Brief save failed');
    } finally {
      setSavingAction(null);
      setMenuOpen(false);
    }
  }

  async function clearCookies(storage: boolean) {
    if (!desktopHostAvailable) {
      setStatusMessage('Desktop browser data is unavailable here');
      return;
    }
    const result = await clearHostBrowserData({ cookies: true, storage });
    setStatusMessage(result.ok ? 'Browser data cleared' : 'reason' in result ? result.reason : 'Browser data clear failed');
    if (storage) {
      setHistory([]);
      setLoadUrl(EMPTY_URL);
      setCurrentUrl(EMPTY_URL);
      setAddressValue('');
      setAddressEditing(false);
      setNavigationState([browserHomeNavigationEntry()], 0);
      pendingLoadTargetRef.current = null;
      saveHistory(projectId, []);
    }
    setMenuOpen(false);
  }

  function clearHistoryOnly() {
    setHistory([]);
    saveHistory(projectId, []);
    setStatusMessage('History cleared');
    setMenuOpen(false);
  }

  function navigateHistoryBy(delta: -1 | 1) {
    const targetIndex = navigationIndex + delta;
    const entry = navigationStack[targetIndex];
    if (!entry) return;
    pendingLoadTargetRef.current = null;
    setNavigationState(navigationStack.slice(), targetIndex);
    setCurrentUrl(entry.url);
    setAddressValue(entry.url === EMPTY_URL ? '' : entry.url);
    setAddressEditing(false);
    setSuggestionsOpen(false);
    setMenuOpen(false);
    if (entry.url === EMPTY_URL) {
      pendingLoadTargetRef.current = null;
      setLoadUrl(EMPTY_URL);
      return;
    }
    if (webviewNode && canUseNativeHistoryNavigation(webviewNode, delta)) {
      if (delta < 0) webviewNode.goBack();
      else webviewNode.goForward();
    } else {
      loadWebviewUrl(entry.url);
    }
  }

  function reload(hard = false) {
    if (isBlank) return;
    if (webviewNode) {
      // Reload is enabled as soon as a URL is set, which can be before the
      // <webview> emits dom-ready; reload()/reloadIgnoringCache() throw in that
      // window. Guard so an early click can't crash the panel.
      try {
        if (hard) webviewNode.reloadIgnoringCache();
        else webviewNode.reload();
      } catch {
        setLoadUrl((url) => `${url}${url.includes('?') ? '&' : '?'}odReload=${Date.now()}`);
      }
    } else {
      setLoadUrl((url) => `${url}${url.includes('?') ? '&' : '?'}odReload=${Date.now()}`);
    }
    setMenuOpen(false);
  }

  async function cancelBrowserPicker() {
    pickerRequestIdRef.current += 1;
    try {
      await webviewNode?.executeJavaScript(BROWSER_CANCEL_PICKER_SCRIPT, true);
    } catch {
      // The picker script only exists after a page is loaded; ignore misses.
    }
  }

  function clearBrowserTool() {
    void cancelBrowserPicker();
    setActiveTool(null);
    setActiveCommentTarget(null);
    setActivePreviewCommentId(null);
    setCommentDraft('');
    setQueuedCommentNotes([]);
    setBrowserImages([]);
    setBrowserPreviewIndex(null);
    setTextDraft('');
  }

  async function pickBrowserElement(tool: BrowserTool) {
    if (isBlank || !webviewNode) {
      setStatusMessage('Open a page before using browser tools');
      return;
    }
    const requestId = pickerRequestIdRef.current + 1;
    pickerRequestIdRef.current = requestId;
    setActiveTool(tool);
    setActiveCommentTarget(null);
    setActivePreviewCommentId(null);
    setCommentDraft('');
    setQueuedCommentNotes([]);
    setBrowserImages([]);
    setBrowserPreviewIndex(null);
    setTextDraft('');
    setDrawOverlayOpen(false);
    setMenuOpen(false);
    setStatusMessage(tool === 'comment' ? 'Click an element to comment' : 'Click an element to tune');
    try {
      await webviewNode.executeJavaScript(BROWSER_CANCEL_PICKER_SCRIPT, true);
      const result = await webviewNode.executeJavaScript<unknown>(
        browserElementPickerScript(browserFilePath),
        true,
      );
      if (pickerRequestIdRef.current !== requestId) return;
      const snapshot = browserSnapshotFromUnknown(result, browserFilePath);
      if (!snapshot) {
        setStatusMessage('No browser element selected');
        setActiveTool(null);
        return;
      }
      setActiveCommentTarget(snapshot);
      setTextDraft(snapshot.text);
      setActiveTool(tool);
      setStatusMessage(
        tool === 'comment'
          ? 'Add a browser comment'
          : editableProjectHtml
            ? 'Tune the element, then save HTML'
            : 'Tune is live only for non-project pages',
      );
    } catch (error) {
      if (pickerRequestIdRef.current !== requestId) return;
      setStatusMessage(error instanceof Error ? error.message : 'Browser element picker failed');
      setActiveTool(null);
    }
  }

  function toggleBrowserTool(tool: BrowserTool) {
    if (activeTool === tool) {
      clearBrowserTool();
      return;
    }
    void pickBrowserElement(tool);
  }

  function requestBrowserUsePrompt(action: BrowserUseAction) {
    if (!onRequestBrowserUsePrompt) {
      setStatusMessage(t('browserUse.unavailable'));
      setBrowserUseOpen(false);
      return;
    }
    onRequestBrowserUsePrompt(browserUsePrompt(action, browserUseContext));
    setBrowserUseOpen(false);
    setMenuOpen(false);
    setSuggestionsOpen(false);
    setStatusMessage(t('browserUse.added'));
  }

  function updateActiveTargetStyle(prop: keyof PreviewAnnotationStyle, value: string) {
    setActiveCommentTarget((current) => {
      if (!current) return current;
      const style = { ...(current.style ?? {}) };
      if (prop === 'paddingTop') {
        style.paddingTop = value;
        style.paddingRight = value;
        style.paddingBottom = value;
        style.paddingLeft = value;
      } else {
        style[prop] = value;
      }
      return { ...current, style };
    });
  }

  async function applyBrowserStyle(prop: keyof PreviewAnnotationStyle, value: string) {
    const target = activeCommentTarget;
    if (!target || !webviewNode) return;
    updateActiveTargetStyle(prop, value);
    const props: Array<keyof PreviewAnnotationStyle> = prop === 'paddingTop'
      ? ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']
      : [prop];
    try {
      for (const item of props) {
        await webviewNode.executeJavaScript(browserApplyStyleScript(target.selector, item, value), true);
      }
    } catch {
      setStatusMessage('Could not apply style in browser page');
    }
  }

  async function applyBrowserText(value: string) {
    const target = activeCommentTarget;
    setTextDraft(value);
    setActiveCommentTarget((current) => current ? { ...current, text: value } : current);
    if (!target || !webviewNode) return;
    try {
      await webviewNode.executeJavaScript(browserApplyTextScript(target.selector, value), true);
    } catch {
      setStatusMessage('Could not edit text in browser page');
    }
  }

  async function saveBrowserDomEdit() {
    if (!webviewNode) return;
    const relativePath = projectRelativePathFromBrowserUrl(currentUrl, resolvedDir);
    if (!relativePath) {
      setStatusMessage('Only project-local HTML pages can be saved');
      return;
    }
    setSavingDomEdit(true);
    try {
      const html = await webviewNode.executeJavaScript<string>(BROWSER_SERIALIZE_HTML_SCRIPT, true);
      const file = await writeProjectTextFile(projectId, relativePath, html);
      if (!file) throw new Error('HTML save failed');
      await onRefreshFiles();
      setStatusMessage('HTML changes saved');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'HTML save failed');
    } finally {
      setSavingDomEdit(false);
    }
  }

  function queueBrowserCommentDraft() {
    const note = commentDraft.trim();
    if (!note) return;
    setQueuedCommentNotes((current) => [...current, note]);
    setCommentDraft('');
  }

  function addBrowserImages(files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    setBrowserImages((current) => [...current, ...images]);
  }

  function removeBrowserImage(index: number) {
    setBrowserImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setBrowserPreviewIndex((current) => {
      if (current === null) return current;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  async function saveBrowserComment() {
    if (!activeCommentTarget || !onSavePreviewComment) {
      setStatusMessage('Comment saving is unavailable');
      return;
    }
    const note = commentDraft.trim();
    if (!note && browserImages.length === 0 && (activeSavedComment?.attachments?.length ?? 0) === 0) return;
    setSendingComment(true);
    try {
      const saved = await onSavePreviewComment(browserTargetFromSnapshot(activeCommentTarget), note, false, browserImages);
      if (saved) {
        setActivePreviewCommentId(saved.id);
        setCommentDraft(saved.note);
        setQueuedCommentNotes([]);
        setBrowserImages([]);
        setBrowserPreviewIndex(null);
        setStatusMessage('Browser comment saved');
      }
    } finally {
      setSendingComment(false);
    }
  }

  async function sendBrowserCommentBatch() {
    if (!activeCommentTarget || !onSendBoardCommentAttachments) {
      setStatusMessage('Comment sending is unavailable');
      return;
    }
    const notes = [...queuedCommentNotes];
    if (commentDraft.trim()) notes.push(commentDraft.trim());
    if (notes.length === 0 && browserImages.length === 0 && activeSavedComment) {
      setSendingComment(true);
      try {
        await onSendBoardCommentAttachments(commentsToAttachments([activeSavedComment]));
        clearBrowserTool();
      } finally {
        setSendingComment(false);
      }
      return;
    }
    if (notes.length === 0 && browserImages.length === 0) return;
    setSendingComment(true);
    try {
      const existingAttachments = activeSavedComment?.attachments ?? [];
      const attachments = buildBoardCommentAttachments({
        target: browserTargetFromSnapshot(activeCommentTarget),
        notes,
        includeImageOnly: browserImages.length > 0,
        imageAttachmentCount: browserImages.length,
      }).map((attachment) => (
        existingAttachments.length > 0
          ? { ...attachment, imageAttachments: existingAttachments }
          : attachment
      ));
      const accepted = await onSendBoardCommentAttachments(
        attachments,
        browserImages,
      );
      if (accepted === false) return;
      clearBrowserTool();
    } finally {
      setSendingComment(false);
    }
  }

  const viewportPreset =
    BROWSER_VIEWPORT_PRESETS.find((preset) => preset.id === viewport) ?? BROWSER_VIEWPORT_PRESETS[0]!;
  const viewportStyle = viewportPreset.width
    ? {
        '--db-viewport-width': `${viewportPreset.width}px`,
        '--db-viewport-height': `${viewportPreset.height}px`,
      } as CSSProperties
    : undefined;
  const browserPopoverBounds = (() => {
    const rect = webviewNode?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
    return { width: rect.width, height: rect.height };
  })();
  const activeBrowserPreviewImage =
    browserPreviewIndex !== null ? browserImagePreviews[browserPreviewIndex] ?? null : null;
  const browserPreviewImageModal = activeBrowserPreviewImage
    ? createPortal(
        <div
          className="staged-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={activeBrowserPreviewImage.file.name}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBrowserPreviewIndex(null);
          }}
        >
          <div className="staged-preview-card">
            <div className="staged-preview-head">
              <span title={activeBrowserPreviewImage.file.name}>{activeBrowserPreviewImage.file.name}</span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => setBrowserPreviewIndex(null)}
                aria-label={t('common.close')}
                title={t('common.close')}
                data-tooltip={t('common.close')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <img src={activeBrowserPreviewImage.url} alt={activeBrowserPreviewImage.file.name} />
          </div>
        </div>,
        document.body,
      )
    : null;
  const commentComposer = activeTool === 'comment' && activeCommentTarget ? (
    <BoardComposerPopover
      target={activeCommentTarget}
      existing={activeSavedComment}
      draft={commentDraft}
      notes={queuedCommentNotes}
      onDraft={setCommentDraft}
      onAddDraft={queueBrowserCommentDraft}
      onRemoveQueuedNote={(index) => setQueuedCommentNotes((current) => current.filter((_, itemIndex) => itemIndex !== index))}
      onClose={clearBrowserTool}
      onSaveComment={() => saveBrowserComment()}
      onSendBatch={() => sendBrowserCommentBatch()}
      onRemoveMember={() => {}}
      onDeleteComment={onRemovePreviewComment}
      images={browserImagePreviews}
      existingImages={(activeSavedComment?.attachments ?? []).map((attachment) => ({
        url: projectRawUrl(projectId, attachment.path),
        name: attachment.name,
      }))}
      onAttachImages={addBrowserImages}
      onRemoveImage={removeBrowserImage}
      onPreviewImage={setBrowserPreviewIndex}
      sending={sendingComment}
      queueOnSend={sendDisabled && Boolean(onSendBoardCommentAttachments)}
      sendDisabled={!onSendBoardCommentAttachments}
      t={t}
      scale={1}
      bounds={browserPopoverBounds}
      commenting
    />
  ) : null;

  return (
    <section className="design-browser" aria-label="Design Browser">
      <div className="db-chrome" ref={chromeRef}>
        <div className="db-nav">
          <IconTooltipButton
            label="Go Back"
            disabled={!canGoBack}
            onClick={() => navigateHistoryBy(-1)}
          >
            <Icon name="chevron-left" size={16} />
          </IconTooltipButton>
          <IconTooltipButton
            label="Go Forward"
            disabled={!canGoForward}
            onClick={() => navigateHistoryBy(1)}
          >
            <Icon name="chevron-right" size={16} />
          </IconTooltipButton>
          <IconTooltipButton
            label={isLoading ? 'Loading...' : 'Reload'}
            className={isLoading ? 'is-spinning' : ''}
            disabled={isBlank}
            onClick={() => reload(false)}
          >
            <Icon name="reload" size={15} />
          </IconTooltipButton>
          <BrowserViewportControls
            viewport={viewport}
            onViewport={setViewport}
            disabled={isBlank}
          />
        </div>
        <form className="db-address-form" onSubmit={handleAddressSubmit}>
          <BrowserSiteIcon
            className="db-address-site-icon"
            fallback="globe"
            iconUrl={isBlank ? undefined : pageIconUrl}
          />
          <div className="db-address-field">
            <input
              ref={addressInputRef}
              value={shownAddressValue}
              onChange={(event) => {
                setAddressEditing(true);
                setAddressValue(event.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={(event) => {
                setAddressEditing(true);
                setAddressValue(isBlank ? '' : currentUrl);
                setSuggestionsOpen(true);
                const input = event.currentTarget;
                window.requestAnimationFrame(() => input.select());
              }}
              onBlur={(event) => {
                if (event.currentTarget.form?.contains(event.relatedTarget as Node | null)) return;
                setSuggestionsOpen(false);
                window.setTimeout(() => setAddressEditing(false), 80);
              }}
              placeholder={addressDisplayParts.url ? '' : 'Enter URL or search...'}
              aria-label="Browser address"
              autoComplete="off"
              spellCheck={false}
            />
            {addressDisplayParts.url ? (
              <span className="db-address-display" aria-hidden>
                <span className="db-address-url">{addressDisplayParts.url}</span>
                {addressDisplayParts.title ? (
                  <>
                    <span className="db-address-separator">/</span>
                    <span className="db-address-title">{addressDisplayParts.title}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          {suggestionsOpen && suggestions.length > 0 ? (
            <div className="db-suggestions" role="listbox">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  onFocus={() => warmBrowserOrigin(item.url)}
                  onPointerEnter={() => warmBrowserOrigin(item.url)}
                  onClick={() => navigateTo(item.url)}
                >
                  <span className="db-suggestion-icon">
                    <BrowserSiteIcon
                      fallback={item.type === 'History' ? 'history' : 'globe'}
                      iconUrl={item.iconUrl}
                    />
                  </span>
                  <span className="db-suggestion-copy">
                    <span>{item.label}</span>
                    <small>{item.detail}</small>
                  </span>
                  <span className="db-suggestion-type">{item.type}</span>
                </button>
              ))}
            </div>
          ) : null}
        </form>
        <div className="db-actions">
          {desktopHostAvailable ? (
            <IconTooltipButton
              label={t('fileViewer.screenshot')}
              wrapperClassName="db-action-item db-action-secondary db-action-screenshot"
              disabled={isBlank || savingAction != null}
              onClick={takeScreenshot}
            >
              <RemixIcon name="screenshot-2-line" size={15} />
            </IconTooltipButton>
          ) : null}
          {desktopHostAvailable ? (
            <IconTooltipButton
              label={t('fileViewer.mark')}
              wrapperClassName="db-action-item db-action-mark"
              disabled={isBlank}
              className={drawOverlayOpen ? 'is-active' : ''}
              onClick={() => {
                clearBrowserTool();
                setDrawOverlayOpen((open) => !open);
              }}
            >
              <RemixIcon name="mark-pen-line" size={15} />
            </IconTooltipButton>
          ) : null}
          <IconTooltipButton
            label={t('fileViewer.comment')}
            wrapperClassName="db-action-item db-action-primary db-action-comment"
            disabled={isBlank || !desktopHostAvailable}
            className={activeTool === 'comment' ? 'is-active' : ''}
            onClick={() => toggleBrowserTool('comment')}
          >
            <Icon name="comment" size={15} />
          </IconTooltipButton>
          <IconTooltipButton
            label={t('browserUse.title')}
            wrapperClassName="db-action-item db-action-browser-use"
            className={browserUseOpen ? 'is-active' : ''}
            onClick={() => {
              setBrowserUseOpen((open) => !open);
              setMenuOpen(false);
              setSuggestionsOpen(false);
            }}
          >
            <Icon name="lightbulb" size={15} />
          </IconTooltipButton>
          {browserUseOpen ? (
            <BrowserUseMenu onPick={requestBrowserUsePrompt} />
          ) : null}
          <IconTooltipButton
            label="Save page brief"
            wrapperClassName="db-action-item db-action-secondary db-action-save"
            disabled={isBlank || savingAction != null}
            onClick={savePageBrief}
          >
            <Icon name="file-code" size={15} />
          </IconTooltipButton>
          <IconTooltipButton
            label="Browser menu"
            wrapperClassName="db-action-item db-action-menu"
            onClick={() => {
              setMenuOpen((open) => !open);
              setBrowserUseOpen(false);
              setSuggestionsOpen(false);
            }}
          >
            <Icon name="more-horizontal" size={16} />
          </IconTooltipButton>
          {menuOpen ? (
            <div className="db-menu" role="menu">
              {desktopHostAvailable ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    clearBrowserTool();
                    setDrawOverlayOpen((open) => !open);
                  }}
                  disabled={isBlank}
                >
                  <RemixIcon name="mark-pen-line" size={14} />
                  {t('fileViewer.mark')}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  toggleBrowserTool('comment');
                }}
                disabled={isBlank || !desktopHostAvailable}
              >
                <Icon name="comment" size={14} />
                {t('fileViewer.comment')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  toggleBrowserTool('inspect');
                }}
                disabled={isBlank || !desktopHostAvailable}
              >
                <RemixIcon name="contrast-drop-line" size={14} />
                Tune Element
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  toggleBrowserTool('edit');
                }}
                disabled={isBlank || !desktopHostAvailable}
              >
                <Icon name="edit" size={14} />
                {editableProjectHtml ? 'Edit HTML' : 'Edit Live DOM'}
              </button>
              <span className="db-menu-separator" />
              <button type="button" role="menuitem" onClick={takeScreenshot} disabled={isBlank || savingAction != null}>
                <Icon name="image" size={14} />
                Copy Screenshot
              </button>
              <button type="button" role="menuitem" onClick={() => reload(true)} disabled={isBlank}>
                <Icon name="reload" size={14} />
                Hard Reload
              </button>
              <button type="button" role="menuitem" onClick={copyCurrentUrl} disabled={isBlank}>
                <Icon name="copy" size={14} />
                Copy URL
              </button>
              <button type="button" role="menuitem" onClick={openCurrentExternally} disabled={isBlank || !isHttpLikeUrl(currentUrl)}>
                <Icon name="external-link" size={14} />
                Open in Browser
              </button>
              <span className="db-menu-separator" />
              <button type="button" role="menuitem" onClick={savePageBrief} disabled={isBlank || savingAction != null}>
                <Icon name="file" size={14} />
                Save Page Brief
              </button>
              <button type="button" role="menuitem" onClick={clearHistoryOnly}>
                <Icon name="history" size={14} />
                Clear Browsing History
              </button>
              <button type="button" role="menuitem" onClick={() => void clearCookies(false)}>
                <Icon name="trash" size={14} />
                Clear Cookies
              </button>
              <button type="button" role="menuitem" onClick={() => void clearCookies(true)}>
                <Icon name="trash" size={14} />
                Clear All Data
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {statusMessage ? <div className="db-status">{statusMessage}</div> : null}
      {browserPreviewImageModal}
      <div className={`db-content db-content-viewport-${isBlank ? 'desktop' : viewport}`}>
        <PreviewDrawOverlay
          active={drawOverlayOpen}
          captureTarget={activeCommentTarget ? browserTargetFromSnapshot(activeCommentTarget) : null}
          captureViewport={!isBlank}
          captureSnapshot={desktopHostAvailable ? captureBrowserSnapshot : undefined}
          captureFrameRect={() => webviewNode?.getBoundingClientRect() ?? null}
          filePath={isBlank ? undefined : currentUrl}
          hideChrome={captureChromeHidden}
          onActiveChange={setDrawOverlayOpen}
          sendDisabled={sendDisabled}
          sendDisabledReason={t('chat.annotationSendDisabledReason')}
        >
          <div
            className={`db-viewport-frame db-viewport-${isBlank ? 'desktop' : viewport}`}
            style={isBlank ? undefined : viewportStyle}
          >
            {isBlank ? (
              <DesignBrowserStart
                onNavigate={navigateTo}
              />
            ) : desktopHostAvailable ? (
              <webview
                ref={assignWebviewNode}
                className="db-webview"
                src={loadUrl}
                partition={DESIGN_BROWSER_PARTITION}
                title={pageTitle}
              />
            ) : (
              <div className="db-fallback">
                <iframe title={pageTitle} src={loadUrl} />
              </div>
            )}
            {!isBlank && desktopHostAvailable ? (
              <BrowserCommentMarkers
                comments={visibleComments}
                liveTargets={browserLiveCommentTargets}
                activeCommentId={activePreviewCommentId}
                onOpen={(comment) => {
                  const snapshot = browserLiveCommentTargets.get(`comment:${comment.id}`)
                    ?? browserSnapshotFromComment(comment, browserFilePath);
                  setActiveTool('comment');
                  setActiveCommentTarget(snapshot);
                  setActivePreviewCommentId(comment.id);
                  setCommentDraft(comment.note);
                  setQueuedCommentNotes([]);
                  setTextDraft(snapshot.text);
                  setDrawOverlayOpen(false);
                }}
              />
            ) : null}
            {commentComposer}
            {(activeTool === 'inspect' || activeTool === 'edit') && activeCommentTarget ? (
              <BrowserInspectPanel
                mode={activeTool}
                target={activeCommentTarget}
                textDraft={textDraft}
                canSave={editableProjectHtml}
                saving={savingDomEdit}
                onApplyStyle={(prop, value) => { void applyBrowserStyle(prop, value); }}
                onTextDraft={(value) => { void applyBrowserText(value); }}
                onSave={() => { void saveBrowserDomEdit(); }}
                onClose={clearBrowserTool}
              />
            ) : null}
          </div>
          {!isBlank && activeTool && !activeCommentTarget ? (
            <div className="db-tool-hint" role="status">
              {activeTool === 'comment' ? 'Click an element to comment' : 'Click an element to tune'}
            </div>
          ) : null}
        </PreviewDrawOverlay>
      </div>
    </section>
  );
}

function IconTooltipButton({
  label,
  className,
  wrapperClassName,
  children,
  ...buttonProps
}: {
  label: string;
  children: ReactNode;
  wrapperClassName?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <span
      className={['db-tooltip-anchor od-tooltip', wrapperClassName].filter(Boolean).join(' ')}
      data-tooltip={label}
      data-tooltip-placement="bottom"
    >
      <button
        {...buttonProps}
        type="button"
        className={['db-icon-btn', className].filter(Boolean).join(' ')}
        aria-label={label}
        title={label}
      >
        {children}
      </button>
    </span>
  );
}

function BrowserUseMenu({
  onPick,
}: {
  onPick: (action: BrowserUseAction) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const categories = useMemo(
    () => filterBrowserUseCategories(
      BROWSER_USE_CATEGORIES,
      query,
      (category) => t(category.titleKey),
      (action) => [t(browserUseActionOutputKey(action)), localizedBrowserUseInput(t, action)],
    ),
    [query, t],
  );
  const visibleTotal = useMemo(
    () => categories.reduce((sum, category) => sum + category.actions.length, 0),
    [categories],
  );

  return (
    <div className="db-menu db-browser-use-menu" role="menu" aria-label={t('browserUse.title')}>
      <div className="db-browser-use-head">
        <strong>{t('browserUse.title')}</strong>
        <small>{t('browserUse.summary', { count: BROWSER_USE_ACTION_TOTAL })}</small>
      </div>
      <label className="db-browser-use-search">
        <Icon name="search" size={13} />
        <input
          type="search"
          value={query}
          aria-label={t('browserUse.searchAria')}
          placeholder={t('browserUse.searchPlaceholder')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {query ? <span>{visibleTotal}</span> : null}
      </label>
      <div className="db-browser-use-list">
        {categories.map((category) => (
          <section key={category.id} className="db-browser-use-section">
            <div className="db-browser-use-section-title">
              <span>{t(category.titleKey)}</span>
              <span>{category.actions.length}</span>
            </div>
            {category.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                className="db-browser-use-action"
                onClick={() => onPick(action)}
              >
                <Icon name="sparkles" size={13} />
                <span className="db-browser-use-action-copy">
                  <span>{action.label}</span>
                  <small>{t(browserUseActionOutputKey(action))}</small>
                </span>
                <span className="db-browser-use-action-input">{localizedBrowserUseInput(t, action)}</span>
              </button>
            ))}
          </section>
        ))}
        {categories.length === 0 ? (
          <div className="db-browser-use-empty" role="status">{t('browserUse.empty')}</div>
        ) : null}
      </div>
    </div>
  );
}

function BrowserViewportControls({
  disabled,
  onViewport,
  viewport,
}: {
  disabled?: boolean;
  onViewport: (viewport: BrowserViewportId) => void;
  viewport: BrowserViewportId;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activePreset =
    BROWSER_VIEWPORT_PRESETS.find((preset) => preset.id === viewport) ?? BROWSER_VIEWPORT_PRESETS[0]!;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="db-viewport-switcher" ref={menuRef}>
      <IconTooltipButton
        label={activePreset.title}
        disabled={disabled}
        className={open ? 'is-active' : ''}
        onClick={() => setOpen((value) => !value)}
      >
        <RemixIcon
          name={browserViewportIcon(activePreset.id)}
          size={14}
          className="db-viewport-icon"
        />
        <span className="db-viewport-label">{activePreset.label}</span>
        <RemixIcon name="arrow-down-s-line" size={13} />
      </IconTooltipButton>
      {open ? (
        <div className="db-viewport-menu" role="listbox" aria-label="Browser viewport">
          {BROWSER_VIEWPORT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={preset.id === viewport}
              className={preset.id === viewport ? 'active' : ''}
              onClick={() => {
                onViewport(preset.id);
                setOpen(false);
              }}
            >
              <span className="db-viewport-menu-label">
                <RemixIcon name={browserViewportIcon(preset.id)} size={14} />
                <span>{preset.label}</span>
              </span>
              {preset.id === viewport ? <Icon name="check" size={13} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BrowserCommentMarkers({
  activeCommentId,
  comments,
  liveTargets,
  onOpen,
}: {
  activeCommentId: string | null;
  comments: PreviewComment[];
  liveTargets: Map<string, BrowserElementSnapshot>;
  onOpen: (comment: PreviewComment) => void;
}) {
  if (comments.length === 0) return null;
  return (
    <div className="db-comment-layer" aria-label="Browser comments">
      {comments.map((comment, index) => {
        const snapshot = liveTargets.get(`comment:${comment.id}`) ?? browserSnapshotFromComment(comment, comment.filePath);
        const bounds = browserOverlayBounds(snapshot);
        const active = comment.id === activeCommentId;
        const label = comment.label || comment.elementId || 'Browser comment';
        return (
          <button
            key={comment.id}
            type="button"
            className={`db-comment-marker${active ? ' active' : ''}`}
            style={{
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
            }}
            title={`${index + 1}. ${label}: ${comment.note}`}
            aria-label={`Open browser comment for ${label}`}
            onClick={() => onOpen(comment)}
          >
            <span>{index + 1}</span>
          </button>
        );
      })}
    </div>
  );
}

function browserSnapshotMapsEqual(
  current: Map<string, BrowserElementSnapshot>,
  next: Map<string, BrowserElementSnapshot>,
): boolean {
  if (current.size !== next.size) return false;
  for (const [key, snapshot] of current) {
    const candidate = next.get(key);
    if (!candidate || !browserSnapshotsEqual(snapshot, candidate)) return false;
  }
  return true;
}

function browserSnapshotsEqual(left: BrowserElementSnapshot, right: BrowserElementSnapshot): boolean {
  return (
    left.filePath === right.filePath &&
    left.elementId === right.elementId &&
    left.selector === right.selector &&
    left.label === right.label &&
    left.text === right.text &&
    left.htmlHint === right.htmlHint &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.position.width === right.position.width &&
    left.position.height === right.position.height &&
    JSON.stringify(left.style ?? null) === JSON.stringify(right.style ?? null)
  );
}

function BrowserCommentComposer({
  draft,
  existing,
  notes,
  onAddDraft,
  onClose,
  onDeleteComment,
  onDraft,
  onRemoveQueuedNote,
  onSaveComment,
  onSendBatch,
  sendDisabled,
  sending,
  target,
}: {
  draft: string;
  existing: PreviewComment | null;
  notes: string[];
  onAddDraft: () => void;
  onClose: () => void;
  onDeleteComment?: (commentId: string) => Promise<void> | void;
  onDraft: (value: string) => void;
  onRemoveQueuedNote: (index: number) => void;
  onSaveComment: () => void;
  onSendBatch: () => void;
  sendDisabled: boolean;
  sending: boolean;
  target: BrowserElementSnapshot;
}) {
  return (
    <div className="comment-popover db-comment-popover" role="dialog" aria-label="Browser comment">
      <div className="comment-popover-head">
        <div>
          <strong title={target.label}>{target.label || 'Browser element'}</strong>
          <span title={target.selector}>{target.selector}</span>
        </div>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close browser comment">
          <Icon name="close" size={12} />
        </button>
      </div>
      {notes.length > 0 ? (
        <div className="board-note-list">
          {notes.map((note, index) => (
            <div key={`${note}:${index}`} className="board-note-item">
              <span>{note}</span>
              <button type="button" className="ghost" onClick={() => onRemoveQueuedNote(index)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <textarea
        aria-label="Browser comment note"
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        placeholder="Describe the change or issue..."
      />
      <div className="comment-popover-actions">
        <div className="comment-popover-actions-start">
          {existing && onDeleteComment ? (
            <button type="button" className="ghost comment-popover-delete" disabled={sending} onClick={() => void onDeleteComment(existing.id)}>
              Delete
            </button>
          ) : null}
          <button type="button" className="ghost" disabled={sending || !draft.trim()} onClick={onAddDraft}>
            Add note
          </button>
        </div>
        <div className="comment-popover-actions-end">
          <button type="button" className="ghost" disabled={sending || (!draft.trim() && !existing)} onClick={onSaveComment}>
            Save comment
          </button>
          <button type="button" className="primary" disabled={sending || sendDisabled || (!draft.trim() && notes.length === 0 && !existing)} onClick={onSendBatch}>
            {sending ? 'Sending...' : 'Send to chat'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrowserInspectPanel({
  canSave,
  mode,
  onApplyStyle,
  onClose,
  onSave,
  onTextDraft,
  saving,
  target,
  textDraft,
}: {
  canSave: boolean;
  mode: 'inspect' | 'edit';
  onApplyStyle: (prop: keyof PreviewAnnotationStyle, value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onTextDraft: (value: string) => void;
  saving: boolean;
  target: BrowserElementSnapshot;
  textDraft: string;
}) {
  const draft = browserStyleDraftFromTarget(target);
  const fontSize = parsePx(draft.fontSize, 16);
  const padding = parsePx(draft.paddingTop, 0);
  const radius = parsePx(draft.borderRadius, 0);

  return (
    <aside className="inspect-panel db-inspect-panel" data-testid="browser-inspect-panel">
      <header className="inspect-panel-head">
        <div className="inspect-panel-title">
          <strong title={target.label}>{mode === 'edit' ? 'Edit HTML element' : 'Tune browser element'}</strong>
          <code title={target.selector}>{target.label || target.selector}</code>
        </div>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close browser tune">
          <Icon name="close" size={12} />
        </button>
      </header>

      <section className="inspect-section">
        <div className="inspect-section-label">Colors</div>
        <div className="inspect-row">
          <label htmlFor="db-inspect-color">Text</label>
          <input
            id="db-inspect-color"
            type="color"
            value={cssColorToHex(draft.color, '#1f1f1f')}
            onChange={(event) => onApplyStyle('color', event.target.value)}
          />
          <span className="inspect-row-value">{cssColorToHex(draft.color, '#1f1f1f')}</span>
        </div>
        <div className="inspect-row">
          <label htmlFor="db-inspect-bg">Fill</label>
          <input
            id="db-inspect-bg"
            type="color"
            value={cssColorToHex(draft.backgroundColor, '#ffffff')}
            onChange={(event) => onApplyStyle('backgroundColor', event.target.value)}
          />
          <span className="inspect-row-value">{cssColorToHex(draft.backgroundColor, '#ffffff')}</span>
        </div>
      </section>

      <section className="inspect-section">
        <div className="inspect-section-label">Type</div>
        <div className="inspect-row">
          <label htmlFor="db-inspect-font-size">Size</label>
          <input
            id="db-inspect-font-size"
            type="range"
            min={8}
            max={96}
            value={fontSize}
            onChange={(event) => onApplyStyle('fontSize', `${event.target.value}px`)}
          />
          <span className="inspect-row-value">{fontSize}px</span>
        </div>
        <div className="inspect-row">
          <label htmlFor="db-inspect-weight">Weight</label>
          <select
            id="db-inspect-weight"
            value={draft.fontWeight}
            onChange={(event) => onApplyStyle('fontWeight', event.target.value)}
          >
            <option value="300">300</option>
            <option value="400">400</option>
            <option value="500">500</option>
            <option value="600">600</option>
            <option value="700">700</option>
            <option value="800">800</option>
          </select>
          <span className="inspect-row-value">{draft.fontWeight}</span>
        </div>
      </section>

      <section className="inspect-section">
        <div className="inspect-section-label">Spacing</div>
        <div className="inspect-row">
          <label htmlFor="db-inspect-padding">Pad</label>
          <input
            id="db-inspect-padding"
            type="range"
            min={0}
            max={80}
            value={padding}
            onChange={(event) => onApplyStyle('paddingTop', `${event.target.value}px`)}
          />
          <span className="inspect-row-value">{padding}px</span>
        </div>
        <div className="inspect-row">
          <label htmlFor="db-inspect-radius">Radius</label>
          <input
            id="db-inspect-radius"
            type="range"
            min={0}
            max={80}
            value={radius}
            onChange={(event) => onApplyStyle('borderRadius', `${event.target.value}px`)}
          />
          <span className="inspect-row-value">{radius}px</span>
        </div>
      </section>

      {mode === 'edit' ? (
        <section className="inspect-section">
          <div className="inspect-section-label">Content</div>
          <textarea
            aria-label="Element text"
            className="db-inspect-text"
            value={textDraft}
            onChange={(event) => onTextDraft(event.target.value)}
          />
        </section>
      ) : null}

      <footer className="inspect-panel-footer">
        <button type="button" className="ghost" onClick={onClose}>Close</button>
        <button type="button" className="primary" disabled={!canSave || saving} onClick={onSave}>
          {saving ? 'Saving...' : canSave ? 'Save HTML' : 'Live only'}
        </button>
      </footer>
    </aside>
  );
}

function browserSnapshotFromComment(comment: PreviewComment, filePath: string): BrowserElementSnapshot {
  return {
    filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    text: comment.text,
    position: comment.position,
    htmlHint: comment.htmlHint,
    style: comment.style,
    selectionKind: 'element',
  };
}

function browserTargetFromSnapshot(snapshot: BrowserElementSnapshot): PreviewCommentTarget {
  return {
    filePath: snapshot.filePath,
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: snapshot.text.trim().slice(0, 500),
    position: snapshot.position,
    htmlHint: snapshot.htmlHint.trim().slice(0, 500),
    style: snapshot.style,
    selectionKind: 'element',
  };
}

function browserOverlayBounds(snapshot: BrowserElementSnapshot) {
  const position = snapshot.position;
  return {
    left: Math.round(position.x),
    top: Math.round(position.y),
    width: Math.max(1, Math.round(position.width)),
    height: Math.max(1, Math.round(position.height)),
  };
}

function browserCommentsToAttachments(comments: PreviewComment[]): ChatCommentAttachment[] {
  return comments.map((comment, index) => ({
    id: comment.id,
    order: index + 1,
    filePath: comment.filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    comment: comment.note.trim() || 'Saved browser comment',
    currentText: comment.text.trim().slice(0, 500),
    pagePosition: comment.position,
    htmlHint: comment.htmlHint.trim().slice(0, 500),
    style: comment.style,
    selectionKind: 'element',
    imageAttachments: comment.attachments && comment.attachments.length > 0
      ? comment.attachments
      : undefined,
    source: 'saved-comment',
  }));
}

function browserBoardCommentAttachments(input: {
  notes: string[];
  target: PreviewCommentTarget;
}): ChatCommentAttachment[] {
  return input.notes
    .map((note) => note.trim())
    .filter(Boolean)
    .map((note, index) => ({
      id: `${input.target.elementId}-browser-${index + 1}`,
      order: index + 1,
      filePath: input.target.filePath,
      elementId: input.target.elementId,
      selector: input.target.selector,
      label: input.target.label,
      comment: note,
      currentText: input.target.text.trim().slice(0, 500),
      pagePosition: input.target.position,
      htmlHint: input.target.htmlHint.trim().slice(0, 500),
      style: input.target.style,
      selectionKind: 'element',
      source: 'board-batch',
    }));
}

function browserStyleDraftFromTarget(target: BrowserElementSnapshot): BrowserStyleDraft {
  const style = target.style ?? {};
  return {
    backgroundColor: style.backgroundColor || '#ffffff',
    borderRadius: style.borderRadius || '0px',
    color: style.color || '#1f1f1f',
    fontSize: style.fontSize || '16px',
    fontWeight: style.fontWeight || '400',
    lineHeight: style.lineHeight || 'normal',
    paddingTop: style.paddingTop || style.paddingRight || style.paddingBottom || style.paddingLeft || '0px',
    textAlign: style.textAlign || 'start',
  };
}

function parsePx(value: string, fallback: number): number {
  const match = /^(-?\d+(?:\.\d+)?)px$/i.exec(value.trim());
  if (!match) return fallback;
  const next = Math.round(Number(match[1]));
  return Number.isFinite(next) ? next : fallback;
}

function cssColorToHex(value: string, fallback: string): string {
  const raw = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split('').map((char) => char + char).join('')}`;
  }
  const match = raw.match(/rgba?\(\s*([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)/i);
  if (!match) return fallback;
  const toHex = (part: string | undefined) => {
    const number = Math.max(0, Math.min(255, Math.round(Number(part ?? 0))));
    return number.toString(16).padStart(2, '0');
  };
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

const REFERENCE_ALL_CATEGORY = 'all';

function DesignBrowserStart({
  onNavigate,
}: {
  onNavigate: (url: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>(REFERENCE_ALL_CATEGORY);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  const visibleGroups = useMemo(
    () => filterReferenceGroups(REFERENCE_GROUPS, activeCategory, query),
    [activeCategory, query],
  );
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const resetFilters = () => {
    setQuery('');
    setActiveCategory(REFERENCE_ALL_CATEGORY);
    searchRef.current?.focus();
  };

  return (
    <div className="db-start">
      <div className="db-start-hero">
        <div className="db-start-hero-copy">
          <div className="db-kicker">Open Design browser</div>
          <h2>Reference Board</h2>
          <p className="db-start-sub">
            A curated set of references across inspiration, real product UI,
            motion, color, type, assets, and design systems. Open one to browse
            it live while gathering design language for the next artifact.
          </p>
        </div>
      </div>

      <div className="db-reference-toolbar">
        <div
          className="db-reference-chips"
          role="tablist"
          aria-label="Reference category"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === REFERENCE_ALL_CATEGORY}
            className={`db-reference-chip${activeCategory === REFERENCE_ALL_CATEGORY ? ' is-active' : ''}`}
            onClick={() => setActiveCategory(REFERENCE_ALL_CATEGORY)}
          >
            All
            <span className="db-reference-chip-count">{REFERENCE_TOTAL}</span>
          </button>
          {REFERENCE_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === group.id}
              className={`db-reference-chip${activeCategory === group.id ? ' is-active' : ''}`}
              onClick={() => setActiveCategory(group.id)}
            >
              {group.title}
              <span className="db-reference-chip-count">{group.sites.length}</span>
            </button>
          ))}
        </div>
        <div className="db-reference-search">
          <span className="db-reference-search-icon" aria-hidden>
            <Icon name="search" size={13} />
          </span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault();
                event.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="Search references…"
            aria-label="Search references"
          />
          {hasQuery ? (
            <button
              type="button"
              className="db-reference-search-clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
            >
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="db-reference-empty" role="status">
          <p className="db-reference-empty-title">
            No references match “{trimmedQuery}”.
          </p>
          <button
            type="button"
            className="db-reference-empty-action"
            onClick={resetFilters}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="db-reference-board">
          {visibleGroups.map((group) => (
            <section key={group.id} className="db-reference-group">
              <h3>
                {group.title}
                <span className="db-reference-group-count">{group.sites.length}</span>
              </h3>
              <div className="db-reference-list">
                {group.sites.map((site) => (
                  <article
                    key={site.url}
                    className="db-reference-card"
                    onPointerEnter={() => warmBrowserOrigin(site.url)}
                  >
                    <button type="button" onClick={() => onNavigate(site.url)}>
                      <BrowserSiteIcon
                        className="db-reference-icon"
                        fallback="globe"
                        iconUrl={referenceIconUrl(site.url)}
                      />
                      <span className="db-reference-title">
                        <span>{site.label}</span>
                        <small>{hostnameFromUrl(site.url)}</small>
                      </span>
                    </button>
                    <p>{site.detail}</p>
                    <div className="db-reference-actions">
                      <button type="button" onClick={() => onNavigate(site.url)}>
                        <Icon name="globe" size={13} />
                        Open
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BrowserSiteIcon({
  className,
  fallback,
  iconUrl,
}: {
  className?: string;
  fallback: 'globe' | 'history';
  iconUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  const cleanUrl = cleanIconUrl(iconUrl);
  return (
    <span className={['db-site-icon', className].filter(Boolean).join(' ')}>
      {cleanUrl && !failed ? (
        <img alt="" src={cleanUrl} onError={() => setFailed(true)} />
      ) : (
        <Icon name={fallback} size={13} />
      )}
    </span>
  );
}

export function loadHistory(projectId: string): BrowserHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(historyStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isHistoryEntry)
      .sort((left, right) => right.lastVisitedAt - left.lastVisitedAt)
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveHistory(projectId: string, history: BrowserHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(historyStorageKey(projectId), JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  } catch {
    // Ignore storage quota and private-mode failures.
  }
}

function historyStorageKey(projectId: string): string {
  return `od:design-browser:${projectId}:history:v1`;
}

export function isHistoryEntry(value: unknown): value is BrowserHistoryEntry {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.url === 'string' &&
    typeof record.title === 'string' &&
    typeof record.lastVisitedAt === 'number' &&
    typeof record.visitCount === 'number' &&
    (record.iconUrl === undefined || typeof record.iconUrl === 'string')
  );
}

export function normalizeBrowserAddress(rawAddress: string): string {
  const value = rawAddress.trim();
  if (!value) return EMPTY_URL;
  if (value === EMPTY_URL) return EMPTY_URL;
  if (/^(https?|file):\/\//i.test(value)) return value;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`;
  if (/^(127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`;
  if (value.startsWith('/')) {
    if (/^\/(api|artifacts|frames)(\/|$)/.test(value) && typeof window !== 'undefined') {
      return new URL(value, window.location.origin).toString();
    }
    return `file://${encodeURI(value)}`;
  }
  if (/^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function labelFromUrl(url: string): string {
  if (url === EMPTY_URL) return 'New Tab';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

export interface AddressDisplayParts {
  url: string;
  title?: string;
}

export function formatAddressDisplayParts(url: string, title?: string): AddressDisplayParts {
  if (url === EMPTY_URL) return { url: '' };
  const cleanTitle = title?.trim();
  if (!cleanTitle) return { url };
  const fallback = labelFromUrl(url);
  if (cleanTitle === fallback || cleanTitle === url) return { url };
  return { url, title: cleanTitle };
}

export function formatAddressDisplay(url: string, title?: string): string {
  const parts = formatAddressDisplayParts(url, title);
  if (!parts.url) return '';
  if (!parts.title) return parts.url;
  return `${parts.url} / ${parts.title}`;
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function faviconUrl(url: string): string | undefined {
  if (!isHttpLikeUrl(url)) return undefined;
  try {
    return new URL('/favicon.ico', new URL(url).origin).toString();
  } catch {
    return undefined;
  }
}

/**
 * Resolve a reliable, colored favicon for a curated reference site.
 *
 * The Reference Board lists well-known public design sites, and many of them do
 * not serve a usable icon at `/favicon.ico` (wrong path, 404, or non-image), so
 * {@link faviconUrl} falls back to a flat grey globe for most of them. Routing
 * the request through a favicon service returns a real, correctly-sized brand
 * icon for essentially every domain, so the board shows actual logos instead.
 * Returns `undefined` for non-http(s) URLs so the globe fallback still applies.
 */
export function referenceIconUrl(url: string, size = 64): string | undefined {
  if (!isHttpLikeUrl(url)) return undefined;
  try {
    const host = new URL(url).hostname;
    if (!host) return undefined;
    return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(host)}`;
  } catch {
    return undefined;
  }
}

export function isHistoryUrl(url: string): boolean {
  return url !== EMPTY_URL && (isHttpLikeUrl(url) || /^file:\/\//i.test(url));
}

function isHttpLikeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function sameUrl(left: string, right: string): boolean {
  return left.replace(/\/+$/, '') === right.replace(/\/+$/, '');
}

function safeGetWebviewUrl(node: WebviewElement): string {
  try {
    return node.getURL();
  } catch {
    return '';
  }
}

function safeGetWebviewTitle(node: WebviewElement): string {
  try {
    return node.getTitle();
  } catch {
    return '';
  }
}

function cleanIconUrl(url?: string): string | undefined {
  const value = url?.trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
  return undefined;
}

function warmBrowserOrigin(url: string): void {
  if (typeof document === 'undefined' || !isHttpLikeUrl(url)) return;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  if (warmedOrigins.has(origin)) return;
  const links: HTMLLinkElement[] = [];
  for (const rel of ['dns-prefetch', 'preconnect']) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = origin;
    if (rel === 'preconnect') link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    links.push(link);
  }
  warmedOrigins.set(origin, links);
  // FIFO-evict the oldest warmed origin once over the cap, removing its links.
  while (warmedOrigins.size > WARMED_ORIGIN_LIMIT) {
    const oldest = warmedOrigins.keys().next().value as string | undefined;
    if (oldest == null) break;
    warmedOrigins.get(oldest)?.forEach((link) => link.remove());
    warmedOrigins.delete(oldest);
  }
}

function canUseNativeHistoryNavigation(node: WebviewElement, delta: -1 | 1): boolean {
  try {
    if (delta < 0) return typeof node.canGoBack === 'function' && node.canGoBack();
    return typeof node.canGoForward === 'function' && node.canGoForward();
  } catch {
    return false;
  }
}

function imageSizeFromDataUrl(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({
      w: Math.max(1, img.naturalWidth || img.width),
      h: Math.max(1, img.naturalHeight || img.height),
    });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function browserFileName(prefix: string, url: string, extension: 'md' | 'png'): string {
  const host = labelFromUrl(url).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'page';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `browser/${prefix}-${host}-${stamp}.${extension}`;
}

export function pageBriefMarkdown(brief: PageBrief, fallbackUrl: string): string {
  const title = brief.title || labelFromUrl(fallbackUrl);
  const url = brief.url || fallbackUrl;
  const lines = [
    `# ${title}`,
    '',
    `Source: ${url}`,
    '',
  ];
  if (brief.description) {
    lines.push('## Description', '', brief.description, '');
  }
  appendList(lines, 'Headings', brief.headings);
  appendList(lines, 'Images', brief.images);
  appendList(lines, 'Links', brief.links?.map((link) => `${link.text} - ${link.url}`));
  appendList(lines, 'Colors', brief.colors?.map((color) => `${color.value} (${color.count})`));
  return `${lines.join('\n').trim()}\n`;
}

function appendList(lines: string[], title: string, values?: string[]) {
  const filtered = (values ?? []).map((value) => value.trim()).filter(Boolean);
  if (filtered.length === 0) return;
  lines.push(`## ${title}`, '');
  for (const value of filtered) lines.push(`- ${value}`);
  lines.push('');
}

// Writes a captured page image onto the system clipboard via the async
// Clipboard API. Decodes the data URL locally (no fetch) so it works under a
// strict connect-src CSP, and returns false instead of throwing when the
// browser lacks ClipboardItem or the write is blocked, so the caller can still
// fall back to the saved-to-project confirmation.
async function copyImageToClipboard(dataUrl: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    const [header = '', base64 = ''] = dataUrl.split(',', 2);
    const mime = /^data:([^;,]+)/.exec(header)?.[1] || 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: mime });
    await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
    return true;
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall back for desktop/web contexts where clipboard permission is blocked.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}
