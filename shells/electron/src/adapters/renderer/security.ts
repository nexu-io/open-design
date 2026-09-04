import type { BrowserWindow, Event, WebContents } from "electron";

export const ELECTRON_DESIGN_BROWSER_PARTITION = "persist:open-design-design-browser";

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isAllowedChildWindowUrl(url: string, shellProtocol: string, shellHost = "app"): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "blob:"
      || (parsed.protocol === `${shellProtocol}:` && parsed.host === shellHost)
      || (parsed.protocol === "about:" && parsed.pathname === "blank");
  } catch {
    return false;
  }
}

export function isAllowedEmbeddedBrowserUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:"
      || parsed.protocol === "https:"
      || (parsed.protocol === "about:" && parsed.pathname === "blank");
  } catch {
    return false;
  }
}

type RendererSecurityWebContents = Pick<
  WebContents,
  "on" | "removeListener" | "setWindowOpenHandler"
>;

type RendererSecurityWindow = Pick<BrowserWindow, "webContents">;

/**
 * Install the product renderer's navigation boundary. The trusted main-frame
 * origin is fixed at mount time; renderer input can never widen it.
 */
export function installElectronRendererSecurity(input: Readonly<{
  openExternal(url: string): void | Promise<void>;
  shellProtocol: string;
  trustedMainFrameUrl: string;
  window: RendererSecurityWindow;
}>): Readonly<{ dispose(): void }> {
  const trustedMainFrame = new URL(input.trustedMainFrameUrl);
  const contents = input.window.webContents as RendererSecurityWebContents;

  const onWillNavigate = (event: Event, url: string): void => {
    let next: URL;
    try {
      next = new URL(url);
    } catch {
      event.preventDefault();
      return;
    }
    const internal = next.protocol === `${input.shellProtocol}:`
      && next.host === trustedMainFrame.host;
    const sameHttpOrigin = isHttpUrl(next.href)
      && isHttpUrl(trustedMainFrame.href)
      && next.origin === trustedMainFrame.origin;
    if (internal || sameHttpOrigin) return;
    event.preventDefault();
    if (isHttpUrl(url)) void input.openExternal(url);
  };

  const onWillAttachWebview = (
    event: Event,
    webPreferences: Electron.WebPreferences,
    params: Record<string, string>,
  ): void => {
    if (!isAllowedEmbeddedBrowserUrl(params.src ?? "")
      || params.partition !== ELECTRON_DESIGN_BROWSER_PARTITION) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
    webPreferences.sandbox = true;
  };

  const onDidAttachWebview = (_event: Event, guest: WebContents): void => {
    const blockDisallowed = (event: Event, url: string): void => {
      if (!isAllowedEmbeddedBrowserUrl(url)) event.preventDefault();
    };
    guest.on("will-navigate", blockDisallowed);
    guest.on("will-redirect", blockDisallowed);
    guest.setWindowOpenHandler(() => ({ action: "deny" }));
  };

  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedChildWindowUrl(url, input.shellProtocol, trustedMainFrame.host)) return { action: "allow" };
    if (isHttpUrl(url)) void input.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", onWillNavigate);
  contents.on("will-attach-webview", onWillAttachWebview);
  contents.on("did-attach-webview", onDidAttachWebview);

  return Object.freeze({
    dispose() {
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      contents.removeListener("will-navigate", onWillNavigate);
      contents.removeListener("will-attach-webview", onWillAttachWebview);
      contents.removeListener("did-attach-webview", onDidAttachWebview);
    },
  });
}
