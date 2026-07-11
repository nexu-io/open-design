// Shared constants for the file-viewer slice's pure rules. No React,
// transport, or DOM — plain data tables the rules/formatters index into.
import type { DeployProviderOption, PreviewViewportPreset } from './types';

// The two deploy provider ids. Mirrored here (rather than imported) because
// their source of truth, `providers/registry.ts`, is a transport module the
// guard forbids importing from a feature file — the values themselves are
// stable literals of the `DeployProviderId` union in `@open-design/contracts`.
const DEFAULT_DEPLOY_PROVIDER_ID = 'vercel-self';
export const CLOUDFLARE_PAGES_PROVIDER_ID = 'cloudflare-pages';

export const PREVIEW_VIEWPORT_PRESETS: PreviewViewportPreset[] = [
  {
    id: 'desktop',
    width: null,
    height: null,
    labelKey: 'fileViewer.viewportDesktop',
    titleKey: 'fileViewer.viewportDesktopTitle',
  },
  {
    id: 'tablet',
    width: 820,
    height: 1180,
    labelKey: 'fileViewer.viewportTablet',
    titleKey: 'fileViewer.viewportTabletTitle',
  },
  {
    id: 'mobile',
    width: 390,
    height: 844,
    labelKey: 'fileViewer.viewportMobile',
    titleKey: 'fileViewer.viewportMobileTitle',
  },
];

export const COMMENT_SIDE_DOCK_WIDTH = 320;
export const COMMENT_SIDE_DOCK_RAIL_WIDTH = 42;
export const COMMENT_SIDE_DOCK_GAP = 12;
export const COMMENT_SIDE_DOCK_PADDING = 8;
export const COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING = 24;
export const COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH = 280;
export const COMMENT_SIDE_DOCK_STACKED_PANEL_HEIGHT = 220;
export const COMMENT_SIDE_DOCK_STACKED_RAIL_HEIGHT = 48;
export const COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION =
  (COMMENT_SIDE_DOCK_PADDING * 2) + COMMENT_SIDE_DOCK_GAP + COMMENT_SIDE_DOCK_STACKED_PANEL_HEIGHT;
export const COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION =
  (COMMENT_SIDE_DOCK_PADDING * 2) + COMMENT_SIDE_DOCK_GAP + COMMENT_SIDE_DOCK_STACKED_RAIL_HEIGHT;

export const DEPLOY_PROVIDER_OPTIONS: DeployProviderOption[] = [
  {
    id: DEFAULT_DEPLOY_PROVIDER_ID,
    labelKey: 'fileViewer.vercelProvider',
    tokenLink: 'https://vercel.com/account/settings/tokens',
    tokenLinkKey: 'fileViewer.vercelTokenGetLink',
    tokenPlaceholderKey: 'fileViewer.vercelTokenPlaceholder',
    tokenReuseHintKey: 'fileViewer.vercelTokenReuseHint',
    tokenRequiredKey: 'fileViewer.vercelTokenRequired',
    tokenLabelKey: 'fileViewer.vercelToken',
  },
  {
    id: CLOUDFLARE_PAGES_PROVIDER_ID,
    labelKey: 'fileViewer.cloudflarePagesProvider',
    tokenLink: 'https://dash.cloudflare.com/profile/api-tokens',
    tokenLinkKey: 'fileViewer.cloudflareApiTokenGetLink',
    tokenPlaceholderKey: 'fileViewer.cloudflareApiTokenPlaceholder',
    tokenReuseHintKey: 'fileViewer.cloudflareApiTokenReuseHint',
    tokenRequiredKey: 'fileViewer.cloudflareApiTokenRequired',
    tokenLabelKey: 'fileViewer.cloudflareApiToken',
    accountIdLabelKey: 'fileViewer.cloudflareAccountId',
    accountIdHintKey: 'fileViewer.cloudflareAccountIdHint',
  },
];

// Allow-list of style facets the manual-edit inspector reads back from the
// od:pod-select bridge. Mirrors the iframe bridge's own allow-list so the
// host never persists a facet the bridge didn't actually sample.
export const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
] as const;

// Bridge coordinates are clamped to this range before being trusted from an
// iframe postMessage payload — keeps a hostile/buggy artifact from smuggling
// an out-of-range number into overlay math.
export const MAX_BRIDGE_COORDINATE = 1_000_000;

export const MARKDOWN_CODE_BLOCK_ATTR = 'data-markdown-code-block';
export const MARKDOWN_CODE_LANGUAGE_ATTR = 'data-code-language';
export const MARKDOWN_COPY_BLOCK_ATTR = 'data-copy-code-block';
export const MARKDOWN_COPY_BUTTON_CLASS = 'markdown-code-copy';
export const MARKDOWN_COPY_TOAST_CLASS = 'markdown-code-toast';

export const EXPORT_READY_NUDGE_STORAGE_PREFIX = 'open-design:export-ready-nudge:';
