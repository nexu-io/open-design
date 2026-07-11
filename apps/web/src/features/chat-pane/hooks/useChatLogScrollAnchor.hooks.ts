import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { ChatMessage } from '../../../types';
import { chatPaneDomPort } from '../dependencies';
import type { ChatPaneDomPort } from '../ports';

// Gap left above the anchored user message when it is pinned to the top.
const ANCHOR_TOP_PADDING = 12;

/**
 * Owns the chat-log's scroll-anchoring subsystem: "anchor the just-sent turn
 * to the top" (ChatGPT-style), the initial-scroll-to-bottom-or-question-form
 * behavior, the jump-to-latest affordance, and the ResizeObserver/
 * MutationObserver-driven auto-follow while streaming. This is the single
 * most entangled cluster in the orchestrator (matches the equivalent "big
 * one" cluster in the ChatComposer decomposition) — see the extraction plan
 * handoff for why it lands last.
 */
export function useChatLogScrollAnchor(
  logRef: MutableRefObject<HTMLDivElement | null>,
  tailSpacerRef: MutableRefObject<HTMLDivElement | null>,
  queuedSendStripRef: MutableRefObject<HTMLDivElement | null>,
  {
    activeConversationId,
    displayMessages,
    streaming,
    tab,
    error,
  }: {
    activeConversationId: string | null;
    displayMessages: ChatMessage[];
    streaming: boolean;
    tab: string;
    error: string | null;
  },
  domPort: ChatPaneDomPort = chatPaneDomPort,
) {
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false);
  const [chatLogScrollable, setChatLogScrollable] = useState(false);
  const [chatLogScrolling, setChatLogScrolling] = useState(false);
  const chatLogScrollIdleTimerRef = useRef<(() => void) | null>(null);
  const didInitialScrollRef = useRef(false);
  // Tracks whether the user is glued close enough to the bottom that
  // streamed content should auto-follow. Distinct from the jump-button
  // state below, which uses a wider threshold (120px) so the affordance
  // stays visible for short scroll-ups. Auto-follow needs the tighter
  // 80px cutoff: scrolling ~90px up is an intentional pause that
  // shouldn't be yanked back the moment the next chunk streams in.
  const pinnedToBottomRef = useRef(true);
  const scrolledToFormRef = useRef<Set<string>>(new Set());
  // "Anchor the just-sent turn to the top" (ChatGPT-style). On send we pin
  // the user's message to the top of the viewport and let the reply stream
  // below it instead of following the bottom. `pending` is armed by the
  // composer's onSend; the messages effect promotes it to `active` once the
  // new user turn actually renders. A dynamic tail spacer reserves just
  // enough real, scrollable blank space below the turn so the message can
  // reach the top even when the reply is short. The spacer is only resized
  // while the message sits at its pinned position — once the user scrolls
  // below it, the reserved blank stays put (no collapse, no jump).
  const anchorPendingRef = useRef(false);
  const anchorActiveRef = useRef(false);
  const prevStreamingRef = useRef(streaming);
  const prevLastUserIdRef = useRef<string | undefined>(undefined);
  // Saved chat-log scroll state, preserved across tab switches. The
  // chat-log <div> is conditionally rendered so it unmounts when the
  // user switches to Comments. On remount it would default to
  // scrollTop: 0 and the initial-bottom-scroll effect skips because
  // didInitialScrollRef is already true. We capture either the absolute
  // scrollTop or a "pinned to bottom" flag while Chat is visible, so
  // bottom-followers stay pinned even when new messages stream in
  // off-tab. Issue #790.
  const savedChatScrollRef = useRef<
    { pinnedToBottom: true } | { pinnedToBottom: false; scrollTop: number } | null
  >(null);

  function resetTailSpacer() {
    const s = tailSpacerRef.current;
    if (s) s.style.height = '0px';
  }

  // Content offset (distance from the top of the scroll content) of the most
  // recent user message. Invariant to the current scrollTop, so it's safe to
  // call regardless of where the user has scrolled.
  function lastUserMsgTopInContent(el: HTMLDivElement): number | null {
    const userEls = el.querySelectorAll<HTMLElement>('.msg.user');
    const msgEl = userEls[userEls.length - 1];
    if (!msgEl) return null;
    const elRect = el.getBoundingClientRect();
    const msgRect = msgEl.getBoundingClientRect();
    return el.scrollTop + (msgRect.top - elRect.top);
  }

  // Resize the tail spacer so the anchored message can sit at the top with
  // just enough room below it — no more. This is a resize ONLY (never a
  // scroll): shrinking empty space below the fold can't shift what's visible
  // while the user is pinned near the top, so it never causes jitter. As the
  // reply streams in, `needed` shrinks monotonically toward 0.
  function sizeAnchorSpacer() {
    const el = logRef.current;
    const spacer = tailSpacerRef.current;
    if (!el || !spacer) return;
    const msgTopInContent = lastUserMsgTopInContent(el);
    if (msgTopInContent === null) return;
    const spacerH = spacer.offsetHeight;
    const contentBelow = el.scrollHeight - spacerH - msgTopInContent;
    const needed = Math.max(0, el.clientHeight - contentBelow - ANCHOR_TOP_PADDING);
    spacer.style.height = `${needed}px`;
  }

  // Smooth-scroll the anchored message to the top. Called ONCE per turn (on
  // send). The message then stays at the top on its own as the reply streams
  // below it, so we never re-scroll — re-scrolling each chunk is what caused
  // the scroll-down fight and the settle jitter.
  function scrollAnchorToTop() {
    const el = logRef.current;
    if (!el) return;
    const msgTopInContent = lastUserMsgTopInContent(el);
    if (msgTopInContent === null) return;
    const target = Math.max(0, msgTopInContent - ANCHOR_TOP_PADDING);
    el.scrollTo({ top: target, behavior: 'smooth' });
  }

  function jumpToBottom() {
    const el = logRef.current;
    if (!el) return;
    anchorActiveRef.current = false;
    pinnedToBottomRef.current = true;
    resetTailSpacer();
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  // Called by the composer's onSend, before the send-branch decides whether
  // this is a new turn or a queued-send edit — both paths reset the "glued
  // to bottom" tracking.
  function resetScrollTrackingForSend() {
    pinnedToBottomRef.current = true;
    scrolledToFormRef.current = new Set();
  }

  // Called by the composer's onSend for a genuine new turn (not a queued-send
  // edit) — arms the anchor-to-top behavior; the messages effect below
  // promotes it to `active` once the new user turn actually renders.
  function armAnchorForSend() {
    anchorActiveRef.current = false;
    resetTailSpacer();
    anchorPendingRef.current = true;
  }

  // Expanding an accordion (tool card / thinking block) should grow
  // downward with the clicked header staying put. While a run is glued to
  // the bottom, the ResizeObserver would re-pin to the bottom on the height
  // change and push the header up, so the chat-log's click-capture handler
  // calls this the moment the user toggles one open.
  function unpinFromBottom() {
    pinnedToBottomRef.current = false;
    anchorActiveRef.current = false;
    setScrolledFromBottom(true);
  }

  useEffect(() => {
    didInitialScrollRef.current = false;
    anchorPendingRef.current = false;
    anchorActiveRef.current = false;
    prevLastUserIdRef.current = undefined;
    resetTailSpacer();
    // A new conversation should land at the bottom (its own initial
    // scroll), not inherit the previous conversation's saved position —
    // including any anchor-to-top reserve still held by the tail spacer, which
    // would otherwise strand the freshly opened conversation below a dead gap.
    savedChatScrollRef.current = null;
    scrolledToFormRef.current = new Set();
    anchorActiveRef.current = false;
    anchorPendingRef.current = false;
    resetTailSpacer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  useEffect(() => {
    const el = logRef.current;
    if (!el || didInitialScrollRef.current || displayMessages.length === 0) return;
    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user sees the form first.
      const lastAssistantMsg = [...displayMessages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg?.content.includes('<question-form')) {
        const assistantEls = el.querySelectorAll('.msg.assistant');
        const lastAssistantEl = assistantEls[assistantEls.length - 1];
        const formEl = lastAssistantEl?.querySelector<HTMLElement>('[data-form-id]');
        if (formEl && !scrolledToFormRef.current.has(formEl.dataset.formId!)) {
          scrolledToFormRef.current.add(formEl.dataset.formId!);
          formEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
          pinnedToBottomRef.current = false;
          setScrolledFromBottom(true);
          return;
        }
        // Already handled by the auto-scroll effect — don't bottom-scroll.
        if (formEl) return;
      }
      // Initial-load bottom-pin must be instant — smooth scrollTo emits
      // intermediate scroll events that flip pinnedToBottomRef to false.
      el.scrollTop = el.scrollHeight;
      setScrolledFromBottom(false);
      pinnedToBottomRef.current = true;
    });
    // `tab` is in the deps so that switching conversations while
    // Comments is open doesn't strand the new conversation at scrollTop:
    // 0. The activeConversationId-reset effect above clears
    // didInitialScrollRef while the chat-log is unmounted; this effect
    // then re-runs when the user returns to Chat and the element is
    // available, scrolling the new conversation to its initial bottom.
  }, [activeConversationId, displayMessages, tab]);

  // When a turn finishes streaming, release the anchor-to-top reserve. The
  // tail spacer only exists to give a streaming reply room to grow while the
  // user message stays pinned at the top; once the reply is final it must not
  // linger, or a short turn (typical of a fresh fork) is left with a large
  // dead gap below it. Collapsing the spacer lets the bottom-anchored layout
  // settle the finished transcript against the composer.
  useEffect(() => {
    const was = prevStreamingRef.current;
    prevStreamingRef.current = streaming;
    // The tail spacer only ever holds the anchor-to-top reserve for an actively
    // streaming reply, so once the turn ends it must collapse unconditionally —
    // even if a mid-turn scroll already cleared `anchorActiveRef` (which leaves
    // the spacer sized). Collapsing it lets the bottom-anchored layout settle a
    // finished short turn against the composer instead of below a dead gap.
    if (was && !streaming) {
      anchorActiveRef.current = false;
      resetTailSpacer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    // Auto-scroll only when the user was already pinned near the bottom,
    // so a scrollback session reading earlier output isn't yanked to the
    // latest message. We key off the pre-content `pinnedToBottomRef`
    // (a ref so it doesn't itself re-fire this effect on scroll) instead
    // of recomputing distance from the just-grown scrollHeight: a single
    // streamed chunk can add 100+ px in one render, which made the
    // post-content distance check skip auto-scroll even when the user
    // was glued to the bottom. We deliberately use the tighter 80px
    // cutoff tracked by the ref (not the wider 120px jump-button
    // threshold) so a deliberate ~90px scroll-up isn't snapped back the
    // next time content streams in. Issue #983.

    // A brand-new user turn from a local send: switch to "anchor to top"
    // mode and smooth-scroll their message to the top of the viewport.
    const lastUser = [...displayMessages].reverse().find((m) => m.role === 'user');
    const prevUserId = prevLastUserIdRef.current;
    prevLastUserIdRef.current = lastUser?.id;
    if (anchorPendingRef.current && lastUser && lastUser.id !== prevUserId) {
      anchorPendingRef.current = false;
      resetTailSpacer();
      anchorActiveRef.current = true;
      pinnedToBottomRef.current = false;
      setScrolledFromBottom(true);
      requestAnimationFrame(() => {
        sizeAnchorSpacer();
        scrollAnchorToTop();
      });
      return;
    }
    // While anchored, the message stays at the top on its own (nothing above
    // it changes), so we only shrink the spacer as the reply grows — never
    // re-scroll. This is what keeps scrolling down and the final settle smooth.
    if (anchorActiveRef.current) {
      requestAnimationFrame(sizeAnchorSpacer);
      return;
    }

    if (pinnedToBottomRef.current) {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user lands on the form.
      const lastAssistantMsg = [...displayMessages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg?.content.includes('<question-form')) {
        const assistantEls = el.querySelectorAll('.msg.assistant');
        const lastAssistantEl = assistantEls[assistantEls.length - 1];
        const formEl = lastAssistantEl?.querySelector<HTMLElement>('[data-form-id]');
        if (formEl && !scrolledToFormRef.current.has(formEl.dataset.formId!)) {
          scrolledToFormRef.current.add(formEl.dataset.formId!);
          formEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
          pinnedToBottomRef.current = false;
          setScrolledFromBottom(true);
          return;
        }
        // Form tag in content but the DOM element isn't ready yet (partial
        // stream) — skip bottom-scroll to avoid a jarring jump that gets
        // undone when the form finishes rendering.
        if (streaming) return;
      }
      // Streaming bottom-pin must be instant — smooth scrollTo emits
      // intermediate scroll events that flip pinnedToBottomRef to false,
      // breaking auto-follow for subsequent chunks.
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMessages, error, streaming]);

  useEffect(() => {
    if (tab !== 'chat') return;
    const el = logRef.current;
    if (!el) return;

    function syncScrollable(target: HTMLDivElement) {
      const next = target.scrollHeight - target.clientHeight > 1;
      setChatLogScrollable((prev) => (prev === next ? prev : next));
      if (!next) setChatLogScrolling(false);
    }

    function markScrolling() {
      setChatLogScrolling(true);
      chatLogScrollIdleTimerRef.current?.();
      chatLogScrollIdleTimerRef.current = domPort.scheduleTimeout(() => {
        chatLogScrollIdleTimerRef.current = null;
        setChatLogScrolling(false);
      }, 650);
    }

    // Restore previously-saved position on remount. Defer to the next
    // frame so the conditional <> contents finish layout before the
    // scrollTop write lands.
    const saved = savedChatScrollRef.current;
    if (saved !== null) {
      requestAnimationFrame(() => {
        const target = logRef.current;
        if (!target) return;
        if (saved.pinnedToBottom) {
          target.scrollTop = target.scrollHeight;
        } else {
          target.scrollTop = saved.scrollTop;
        }
        syncScrollable(target);
        // Resync the jump-to-latest affordance with the restored
        // position. Without this, a user who left Chat ~60px from the
        // bottom and returns to find new messages stacked underneath
        // would land hundreds of pixels above the latest turn while
        // scrolledFromBottom remained false until they scrolled.
        const distance =
          target.scrollHeight - target.scrollTop - target.clientHeight;
        setScrolledFromBottom(distance > 120);
        pinnedToBottomRef.current = distance < 80;
      });
    }

    function snapshot(target: HTMLDivElement) {
      const distance =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      savedChatScrollRef.current =
        distance < 50
          ? { pinnedToBottom: true }
          : { pinnedToBottom: false, scrollTop: target.scrollTop };
    }

    function onScroll() {
      const target = logRef.current;
      if (!target) return;
      // A genuine user scroll (one that moves away from where the anchored
      // message currently sits) releases the auto-resize behavior. We do NOT
      // collapse the tail spacer: the reserved blank below stays as real,
      // scrollable space so scrolling down feels natural instead of snapping.
      if (anchorActiveRef.current) {
        const pinnedTop = lastUserMsgTopInContent(target);
        if (
          pinnedTop !== null &&
          Math.abs(target.scrollTop - (pinnedTop - ANCHOR_TOP_PADDING)) > 40
        ) {
          anchorActiveRef.current = false;
        }
      }
      syncScrollable(target);
      markScrolling();
      snapshot(target);
      const distance =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      // Functional updater bails out when the value is unchanged so a flood
      // of scroll events (e.g. programmatic scrollTop + ResizeObserver
      // follow-up during streaming) does not schedule a re-render per tick
      // and trip React's "Maximum update depth exceeded" guard.
      const next = distance > 120;
      setScrolledFromBottom((prev) => (prev === next ? prev : next));
      pinnedToBottomRef.current = distance < 80;
    }
    syncScrollable(el);
    el.addEventListener('scroll', onScroll);
    return () => {
      // Capture final scroll state before unmount; the ref normally
      // tracks via onScroll, but programmatic scrolls or layout shifts
      // right before unmount can leave it stale.
      snapshot(el);
      el.removeEventListener('scroll', onScroll);
      chatLogScrollIdleTimerRef.current?.();
      chatLogScrollIdleTimerRef.current = null;
      setChatLogScrolling(false);
    };
  }, [domPort, tab]);

  useEffect(() => {
    if (tab !== 'chat') return;
    const el = logRef.current;
    if (!el) return;

    let followFrame: number | null = null;
    const followLatestIfPinned = () => {
      // While anchored, only shrink the tail spacer as the reply grows
      // (resize-only, never scroll) so the user message stays put without
      // fighting a manual scroll-down.
      if (anchorActiveRef.current) {
        if (followFrame !== null) return;
        followFrame = requestAnimationFrame(() => {
          followFrame = null;
          if (!anchorActiveRef.current) return;
          sizeAnchorSpacer();
        });
        return;
      }
      if (!pinnedToBottomRef.current || followFrame !== null) return;
      followFrame = requestAnimationFrame(() => {
        followFrame = null;
        const target = logRef.current;
        if (!target || !pinnedToBottomRef.current) return;
        target.scrollTop = target.scrollHeight;
        setScrolledFromBottom(false);
      });
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const target = logRef.current;
            if (target) {
              const next = target.scrollHeight - target.clientHeight > 1;
              setChatLogScrollable((prev) => (prev === next ? prev : next));
              if (!next) setChatLogScrolling(false);
            }
            followLatestIfPinned();
          })
        : null;
    const observedChildren = new Set<Element>();
    const syncObservedChildren = () => {
      if (!resizeObserver) return;
      const currentChildren = new Set(Array.from(el.children));
      // The tail spacer's height is driven by the anchor logic; observing it
      // would feed its own resize back into followLatestIfPinned.
      if (tailSpacerRef.current) currentChildren.delete(tailSpacerRef.current);
      for (const child of currentChildren) {
        if (observedChildren.has(child)) continue;
        resizeObserver.observe(child);
        observedChildren.add(child);
      }
      for (const child of observedChildren) {
        if (currentChildren.has(child)) continue;
        resizeObserver.unobserve(child);
        observedChildren.delete(child);
      }
    };

    let observedQueuedSendStrip: Element | null = null;
    const syncQueuedSendStrip = () => {
      if (!resizeObserver) return;
      const queuedEl = queuedSendStripRef.current;
      if (queuedEl && observedQueuedSendStrip !== queuedEl) {
        if (observedQueuedSendStrip) {
          resizeObserver.unobserve(observedQueuedSendStrip);
        }
        resizeObserver.observe(queuedEl);
        observedQueuedSendStrip = queuedEl;
      } else if (!queuedEl && observedQueuedSendStrip) {
        resizeObserver.unobserve(observedQueuedSendStrip);
        observedQueuedSendStrip = null;
      }
    };

    syncObservedChildren();
    syncQueuedSendStrip();

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            syncObservedChildren();
            syncQueuedSendStrip();
            followLatestIfPinned();
          })
        : null;
    // childList + subtree only — NOT characterData. Auto-follow during
    // streaming is driven by the ResizeObserver on each message child (text
    // growth changes height), so observing per-character text mutations would
    // re-run the full sync sweep on every streamed frame for no extra benefit.
    mutationObserver?.observe(el, {
      childList: true,
      subtree: true,
    });
    // QueuedSendStrip lives outside the chat-log subtree (it is a sibling of
    // .chat-log-wrap inside .pane). The MutationObserver above only fires for
    // changes inside el, so it cannot detect that surface mounting or
    // unmounting. Watch the nearest common ancestor (.pane) with childList-only
    // to keep its observer current.
    const paneEl = el.parentElement?.parentElement ?? null;
    if (paneEl && mutationObserver) {
      mutationObserver.observe(paneEl, { childList: true });
    }

    return () => {
      if (followFrame !== null) cancelAnimationFrame(followFrame);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [queuedSendStripRef, tab, tailSpacerRef]);

  return {
    scrolledFromBottom,
    chatLogScrollable,
    chatLogScrolling,
    jumpToBottom,
    armAnchorForSend,
    resetScrollTrackingForSend,
    unpinFromBottom,
  };
}
