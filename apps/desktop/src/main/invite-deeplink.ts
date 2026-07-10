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

app.on("open-url", (event, url) => {
  event.preventDefault();
  deeplinkDispatcher.dispatch(url);
});

/**
 * Register the `opendesign://` scheme and wire the OS deeplink events to
 * {@link continueInviteFromUrl}. macOS delivers via `open-url`; Windows/Linux via
 * a second-instance argv (requires the single-instance lock the app already
 * holds). A cold start through the deeplink carries it in the initial argv.
 */
export function registerInviteDeeplink(deps: InviteDeeplinkDeps): void {
  app.setAsDefaultProtocolClient(INVITE_DEEPLINK_SCHEME);
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
