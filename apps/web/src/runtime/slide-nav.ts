// Dedupe deck slide-navigation requests across HtmlViewer remounts.
//
// A queued chat send arms a `slideNavRequest` that lives in parent (ProjectView)
// state and stays set after the viewer handles it. A per-mount ref would only
// suppress replays for the current mount: leaving the deck tab and coming back
// remounts HtmlViewer, the ref resets, and the stale nonce reads as fresh — so
// the preview yanks back to the queued slide and clobbers wherever the user had
// navigated manually. Keying consumed nonces by preview-state key *outside* the
// component makes "consume once" survive remounts.
//
// The map is keyed by `${projectId}:${fileName}`, so a fresh queued send (new
// nonce, via Date.now()) for the same deck still navigates, and each file is
// tracked independently. One entry per opened deck — bounded and tiny.
const consumedSlideNavNonces = new Map<string, number>();

/**
 * Returns true exactly once per (key, nonce) pair, recording it as consumed.
 * Returns false for a nonce already consumed under that key — including after a
 * remount — so the navigation fires only on the first handling of each request.
 */
export function shouldConsumeSlideNav(key: string, nonce: number): boolean {
  if (consumedSlideNavNonces.get(key) === nonce) return false;
  consumedSlideNavNonces.set(key, nonce);
  return true;
}

/** Test seam: drop all recorded consumptions. */
export function resetConsumedSlideNavForTests(): void {
  consumedSlideNavNonces.clear();
}

export interface SlideNavRequest {
  name: string;
  slideIndex: number;
  nonce: number;
}

// A slide-nav request is "follow-along only": it must flip the preview only if
// the target deck was already open when the queued send started. If the deck
// was closed at that moment, there is nothing to follow along, and the request
// must NOT resurface later when the user opens that file by hand. Deliverability
// is therefore decided once, at fire time, against the open-tab set — not
// re-evaluated on a later tab open.
export function isSlideNavDeliverableNow(
  request: Pick<SlideNavRequest, 'name'> | null | undefined,
  openTabs: readonly string[],
): boolean {
  return !!request && !!request.name && openTabs.includes(request.name);
}

// Gate what reaches the viewer: forward the request to the active file only
// when it both names that file AND was marked deliverable at fire time
// (`deliverableNonce` === the request's nonce). A request for a deck that was
// closed at fire time never became deliverable, so opening that deck afterwards
// matches the name but not the nonce → no jump.
export function deliverableSlideNavForActiveFile(
  request: SlideNavRequest | null | undefined,
  activeFileName: string | null | undefined,
  deliverableNonce: number | null,
): { slideIndex: number; nonce: number } | null {
  if (!request) return null;
  if (!activeFileName || request.name !== activeFileName) return null;
  if (request.nonce !== deliverableNonce) return null;
  return { slideIndex: request.slideIndex, nonce: request.nonce };
}
