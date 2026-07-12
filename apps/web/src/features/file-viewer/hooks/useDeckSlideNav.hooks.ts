// Feature-local hook for HtmlViewer's deck/slide navigation (Cluster H of the
// FileViewer.tsx decomposition plan): the active-slide state, posting a nav
// action to the preview iframe, the host-side deck keyboard shortcut, and the
// chat "jump to slide" nonce request. The actual postMessage/`window`
// listener mechanics live behind `DeckSlideBridgePort` (bound to
// `providers/file-viewer/deck-slide-bridge.ts` in `dependencies.ts`) since a
// slice file may not touch bare `window`/`document`.
//
// This cluster is coupled to the not-yet-extracted srcDoc/URL-load transport
// engine (Cluster L) for `iframeRef`/`effectiveDeck`/`isOurPreviewIframeSource`/
// `isActivePreviewIframeSource`/`previewStateKey`/`mode`, so those come in as
// injected deps rather than being owned here — see EXTRACTION-PLAN.md
// Cluster H.
import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { shouldConsumeSlideNav } from '../../../runtime/slide-nav';
import { deckSlideBridgePort as realDeckSlideBridgePort } from '../dependencies';
import type { DeckSlideBridgePort } from '../ports';
import { getCachedSlideState, setCachedSlideState } from '../slide-state-cache';
import type { DeckSlideAction, SlideState } from '../types';

export interface DeckSlideNavDeps {
  effectiveDeck: boolean;
  mode: 'preview' | 'source';
  previewStateKey: string;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  isOurPreviewIframeSource: (source: MessageEventSource | null) => boolean;
  isActivePreviewIframeSource: (source: MessageEventSource | null) => boolean;
  /** Bumped nonce asking a deck preview to flip to `slideIndex` (chat "next step" follow-along). */
  slideNavRequest?: { slideIndex: number; nonce: number } | null;
}

export interface DeckSlideNavController {
  slideState: SlideState | null;
  postSlide: (action: DeckSlideAction) => void;
  syncCachedSlideStateToIframe: (target?: HTMLIFrameElement | null) => void;
}

export function useDeckSlideNav(port: DeckSlideBridgePort, deps: DeckSlideNavDeps): DeckSlideNavController {
  const {
    effectiveDeck,
    mode,
    previewStateKey,
    iframeRef,
    isOurPreviewIframeSource,
    isActivePreviewIframeSource,
    slideNavRequest,
  } = deps;

  // Slide deck nav state: the iframe posts the active index + total count
  // back to the host every time a slide settles. Host renders prev/next
  // controls in the toolbar and reflects the count beside them.
  const [slideState, setSlideState] = useState<SlideState | null>(
    () => getCachedSlideState(previewStateKey) ?? null,
  );

  const postSlide = useCallback((action: DeckSlideAction) => {
    port.postSlideAction(iframeRef.current, action);
  }, [port, iframeRef]);

  const syncCachedSlideStateToIframe = useCallback((target: HTMLIFrameElement | null = iframeRef.current) => {
    const active = getCachedSlideState(previewStateKey)?.active;
    if (typeof active !== 'number') return;
    port.postSlideIndex(target, active);
  }, [port, previewStateKey, iframeRef]);

  // Reset local state whenever the deck/file changes, and subscribe to the
  // iframe's `od:slide-state` reports while a deck is active.
  useEffect(() => {
    if (!effectiveDeck) {
      setSlideState(null);
      return;
    }
    setSlideState(getCachedSlideState(previewStateKey) ?? null);
    return port.subscribeSlideState(
      (source) => isOurPreviewIframeSource(source) && isActivePreviewIframeSource(source),
      (next) => {
        setCachedSlideState(previewStateKey, next);
        setSlideState(next);
      },
    );
  }, [effectiveDeck, isActivePreviewIframeSource, isOurPreviewIframeSource, previewStateKey, port]);

  // Keyboard nav on the host, so the user can press ←/→ even when focus
  // is on the chat composer or any other host control.
  useEffect(() => {
    if (!effectiveDeck || mode !== 'preview') return;
    return port.subscribeDeckKeyboardNav(() => iframeRef.current, postSlide);
  }, [effectiveDeck, mode, port, postSlide, iframeRef]);

  // A queued chat send for this deck just started: flip the preview to the
  // slide its marked element lives on. We write the cached slide state first so
  // a freshly-mounted iframe (the tab may have just been activated) restores to
  // the target on load via syncCachedSlideStateToIframe(), then post directly
  // to cover the already-loaded iframe. The consume-once guard lives in
  // `shouldConsumeSlideNav` (keyed by file outside this component) so it holds
  // across remounts — switching away from and back to the deck must not replay
  // the stale request and yank the preview off wherever the user navigated.
  useEffect(() => {
    const nonce = slideNavRequest?.nonce;
    if (nonce == null) return;
    if (!effectiveDeck) return;
    const requested = slideNavRequest?.slideIndex;
    if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 0) return;
    if (!shouldConsumeSlideNav(previewStateKey, nonce)) return;
    const target = Math.floor(requested);
    const cachedCount = getCachedSlideState(previewStateKey)?.count;
    const count = slideState?.count ?? cachedCount ?? target + 1;
    setCachedSlideState(previewStateKey, { active: target, count });
    setSlideState({ active: target, count });
    syncCachedSlideStateToIframe();
  }, [
    slideNavRequest?.nonce,
    slideNavRequest?.slideIndex,
    effectiveDeck,
    previewStateKey,
    slideState?.count,
    syncCachedSlideStateToIframe,
  ]);

  return { slideState, postSlide, syncCachedSlideStateToIframe };
}

export function useWiredDeckSlideNav(deps: DeckSlideNavDeps): DeckSlideNavController {
  return useDeckSlideNav(realDeckSlideBridgePort, deps);
}
