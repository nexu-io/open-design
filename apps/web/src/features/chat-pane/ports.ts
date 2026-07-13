// The chat-pane slice's dependency on transport/DOM globals, expressed as an
// interface it owns. The slice depends on this port, never on `providers/`
// directly; a provider is bound to it in `dependencies.ts`.
import type { ComposerPortalRect, VelaLoginStatus } from './types';

/** Transport the AMR inline-login-status hook needs. */
export interface AmrLoginPort {
  fetchVelaLoginStatus(options?: { refresh?: boolean }): Promise<VelaLoginStatus | null>;
}

/** DOM reads/subscriptions this slice's hooks need. */
export interface ChatPaneDomPort {
  getDocumentBody(): HTMLElement | null;
  subscribeComposerPortalRect(
    slot: HTMLElement,
    onRect: (rect: ComposerPortalRect) => void,
  ): () => void;
  subscribeComposerLayerHeight(
    layer: HTMLElement,
    onHeight: (height: number) => void,
  ): () => void;
  subscribeOutsideClickOrEscape(
    container: { current: HTMLElement | null },
    onClose: () => void,
  ): () => void;
  subscribeWindowEvent(eventName: string, onEvent: (event: Event) => void): () => void;
  subscribeVisibleFocusOrVisibilityChange(onVisible: () => void): () => void;
  scheduleInterval(callback: () => void, ms: number): () => void;
  scheduleTimeout(callback: () => void, ms: number): () => void;
  openExternalUrl(url: string): void;
}
