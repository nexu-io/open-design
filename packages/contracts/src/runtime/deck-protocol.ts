export const DECK_PROTOCOL_VERSION = 1 as const;

export const DECK_NAVIGATE_MESSAGE_TYPE = 'od:slide' as const;
export const DECK_STATE_MESSAGE_TYPE = 'od:slide-state' as const;
export const DECK_READY_MESSAGE_TYPE = 'od:deck-ready' as const;

export const DECK_PROTOCOL_V1_CAPABILITIES = [
  'absolute-navigation',
  'state-events',
] as const;

export type DeckNavigationAction = 'next' | 'prev' | 'first' | 'last' | 'go';

interface DeckNavigateMessageBase {
  type: typeof DECK_NAVIGATE_MESSAGE_TYPE;
  /** Omitted by legacy hosts; v1 runtimes intentionally accept both forms. */
  protocolVersion?: typeof DECK_PROTOCOL_VERSION;
}

export type DeckNavigateMessage = DeckNavigateMessageBase & (
  | {
      action: 'go';
      /** Zero-based target index. */
      index: number;
    }
  | {
      action: Exclude<DeckNavigationAction, 'go'>;
      index?: never;
    }
);

export interface DeckStateMessage {
  type: typeof DECK_STATE_MESSAGE_TYPE;
  active: number;
  count: number;
  protocolVersion: typeof DECK_PROTOCOL_VERSION;
}

export interface DeckReadyMessage {
  type: typeof DECK_READY_MESSAGE_TYPE;
  protocolVersion: typeof DECK_PROTOCOL_VERSION;
  capabilities: typeof DECK_PROTOCOL_V1_CAPABILITIES;
}

/**
 * Canonical inline adapter used by the fixed Agent deck skeleton.
 *
 * The surrounding skeleton owns `idx`, `slides`, and `go(index)`. Keeping the
 * host protocol in one shared literal prevents the daemon and API/BYOK prompt
 * copies from growing different message dialects while leaving deck styling
 * and standalone keyboard/click navigation fully local to the artifact.
 */
export const DECK_PROTOCOL_V1_INLINE_RUNTIME = `      var OD_DECK_PROTOCOL_VERSION = ${DECK_PROTOCOL_VERSION};
      function postDeckState() {
        try {
          window.parent.postMessage({
            type: '${DECK_STATE_MESSAGE_TYPE}',
            protocolVersion: OD_DECK_PROTOCOL_VERSION,
            active: idx,
            count: slides.length
          }, '*');
        } catch (_) {}
      }
      function announceDeckProtocol() {
        try {
          window.parent.postMessage({
            type: '${DECK_READY_MESSAGE_TYPE}',
            protocolVersion: OD_DECK_PROTOCOL_VERSION,
            capabilities: ${JSON.stringify(DECK_PROTOCOL_V1_CAPABILITIES)}
          }, '*');
        } catch (_) {}
      }
      window.addEventListener('message', function (event) {
        var data = event && event.data;
        if (!data || data.type !== '${DECK_NAVIGATE_MESSAGE_TYPE}') return;
        if (data.protocolVersion != null && data.protocolVersion !== OD_DECK_PROTOCOL_VERSION) return;
        var target = idx;
        if (data.action === 'go') {
          if (typeof data.index !== 'number' || !isFinite(data.index)) return;
          target = Math.floor(data.index);
        } else if (data.action === 'next') target = idx + 1;
        else if (data.action === 'prev') target = idx - 1;
        else if (data.action === 'first') target = 0;
        else if (data.action === 'last') target = slides.length - 1;
        else return;
        go(target);
      });`;
