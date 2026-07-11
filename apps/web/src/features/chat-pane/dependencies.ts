// The one file in this slice allowed to import `providers/` — everything
// else in the slice depends on the port, so swapping the adapter (or a fake
// in tests) touches only this file.
import {
  getDocumentBody,
  openExternalUrl,
  scheduleInterval,
  scheduleTimeout,
  subscribeComposerLayerHeight,
  subscribeComposerPortalRect,
  subscribeOutsideClickOrEscape,
  subscribeVisibleFocusOrVisibilityChange,
  subscribeWindowEvent,
} from '../../providers/dom';
import { fetchVelaLoginStatus } from '../../providers/daemon';
import type { AmrLoginPort, ChatPaneDomPort } from './ports';

/** Default binding: the real browser DOM. */
export const chatPaneDomPort: ChatPaneDomPort = {
  getDocumentBody,
  subscribeComposerPortalRect,
  subscribeComposerLayerHeight,
  subscribeOutsideClickOrEscape,
  subscribeWindowEvent,
  subscribeVisibleFocusOrVisibilityChange,
  scheduleInterval,
  scheduleTimeout,
  openExternalUrl,
};

/** Default binding: the real vela-login-status endpoint. */
export const amrLoginPort: AmrLoginPort = {
  fetchVelaLoginStatus,
};
