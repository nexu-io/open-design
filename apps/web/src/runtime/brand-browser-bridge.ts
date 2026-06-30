// Bridge that lets non-browser code (the chat "I solved the Cloudflare wall"
// confirm handler) run scripts against a specific in-app browser tab's live
// Electron <webview>, without threading a webview ref through the whole
// ProjectView → ChatPane → AssistantMessage tree.
//
// The browser tab lives deep inside FileWorkspace → DesignBrowserPanel and holds
// its <webview> node only in local state. We expose a tiny module-level registry
// (the same module-latch shape as `brand-intent.ts`) keyed by project + tab id:
// DesignBrowserPanel registers an imperative handle whenever its webview mounts,
// and the confirm handler looks it up to serialize the unblocked DOM and re-run
// extraction from it.

/** The in-app browser tab id the brand-extraction project opens to the target
 *  site. Matches the daemon `BRAND_BROWSER_TAB_ID` and the web
 *  `FileWorkspace` BROWSER_TAB_PREFIX numbering. */
export const BRAND_BROWSER_TAB_ID = '__browser__:1';

export interface BrandBrowserPageSnapshotResult {
  ok: boolean;
  baseUrl?: string;
  htmlFile?: string;
  cssFile?: string;
  indexFile?: string;
  manifestFile?: string;
  message?: string;
}

export interface BrandBrowserHandle {
  /** Run a script inside the tab's webview. Returns null on the cross-origin
   *  <iframe> fallback (web-only host), where guest DOM access is impossible. */
  executeJavaScript: <T = unknown>(code: string, userGesture?: boolean) => Promise<T> | null;
  /** Save the currently rendered page as Design Files (HTML, CSS digest, and
   *  manifest) using the same action exposed in the Browser tab menu. This is
   *  the lightweight capture the extraction flow reads back — page assets are
   *  not downloaded, since extraction only consumes the HTML + CSS. */
  downloadPageSnapshot?: () => Promise<BrandBrowserPageSnapshotResult>;
  /** The webview's current committed URL. */
  getURL: () => string;
  /** True only for the desktop Electron <webview>; false for the web-only
   *  cross-origin <iframe>, where the rendered DOM cannot be read. */
  isDesktopWebview: boolean;
}

const registry = new Map<string, BrandBrowserHandle>();

function key(projectId: string, tabId: string): string {
  return `${projectId}::${tabId}`;
}

/** Register (or, with `handle === null`, unregister) the live browser handle for
 *  a tab. DesignBrowserPanel calls this from an effect as its webview mounts and
 *  unmounts. */
export function registerBrandBrowser(
  projectId: string,
  tabId: string,
  handle: BrandBrowserHandle | null,
): void {
  const k = key(projectId, tabId);
  if (handle) registry.set(k, handle);
  else registry.delete(k);
}

/** Look up the live browser handle for a tab, or null when no such tab is
 *  mounted (e.g. the user closed it, or this is a web-only host). */
export function getBrandBrowser(
  projectId: string,
  tabId: string,
): BrandBrowserHandle | null {
  return registry.get(key(projectId, tabId)) ?? null;
}
