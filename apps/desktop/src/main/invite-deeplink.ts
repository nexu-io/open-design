import { app, BrowserWindow } from "electron";
import {
  INVITE_DEEPLINK_SCHEME,
  createInviteDeeplinkDispatcher,
  continueInviteFromUrl,
  findDeeplinkArg,
  type InviteDeeplinkDeps,
} from "./invite-deeplink-core.js";

// Desktop side of the invite hand-off ("桌面唤起", C's lane in the B-C invite
// contract). The cloud web app accepts the invite, then opens
// `opendesign://workspace/invite/continue?...&nonce=...` to wake this client. We
// register the scheme and route the deeplink to the daemon, which consumes the
// one-time continuation on B with the signed-in vela session; the client then
// focuses and the web re-reads the context to switch into the team workspace.

export {
  continueInviteFromUrl,
  createInviteDeeplinkDispatcher,
  findDeeplinkArg,
  INVITE_DEEPLINK_SCHEME,
  type InviteDeeplinkDeps,
} from "./invite-deeplink-core.js";

const deeplinkDispatcher = createInviteDeeplinkDispatcher();
let secondInstanceHandlerRegistered = false;

/**
 * Attach the macOS `open-url` handler at import time rather than inside
 * {@link registerInviteDeeplink}: registration only happens late in bootstrap
 * (after `app.whenReady()`), while a cold start through the deeplink delivers
 * `open-url` well before that. The dispatcher queues until deps arrive, so
 * listening this early is what makes the cold-start hand-off work at all.
 *
 * Importing this module must nevertheless stay side-effect-safe outside
 * Electron: `apps/desktop/src/main/index.ts` re-exports pure helpers that unit
 * tests import directly, and in a plain Node process the `electron` entry
 * resolves to the binary-path shim that has no `app`. Attaching unconditionally
 * would turn every such import into a TypeError at module load.
 */
function attachOpenUrlListenerWhenHosted(): void {
  if (typeof app?.on !== "function") return;
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deeplinkDispatcher.dispatch(url);
  });
}

attachOpenUrlListenerWhenHosted();

export function dispatchInviteDeeplink(url: string | null): void {
  deeplinkDispatcher.dispatch(url);
}

/**
 * Register the `opendesign://` scheme and wire the OS deeplink events to
 * {@link continueInviteFromUrl}. macOS delivers via `open-url`; Windows/Linux via
 * a second-instance argv (requires the single-instance lock the app already
 * holds). A cold start through the deeplink carries it in the initial argv.
 */
export function registerInviteDeeplink(deps: InviteDeeplinkDeps): void {
  if (process.platform === "win32" && deps.protocolClientPath) {
    app.setAsDefaultProtocolClient(INVITE_DEEPLINK_SCHEME, deps.protocolClientPath);
  } else {
    app.setAsDefaultProtocolClient(INVITE_DEEPLINK_SCHEME);
  }
  deeplinkDispatcher.setDeps(deps);

  if (!secondInstanceHandlerRegistered) {
    secondInstanceHandlerRegistered = true;
    app.on("second-instance", (_event, argv) => {
      deeplinkDispatcher.dispatch(findDeeplinkArg(argv));
    });
  }

  const initial = findDeeplinkArg(process.argv);
  if (initial) void app.whenReady().then(() => deeplinkDispatcher.dispatch(initial));
}

/** Best-effort bring-to-front for the deeplink hand-off. */
export function focusPrimaryWindow(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
}
