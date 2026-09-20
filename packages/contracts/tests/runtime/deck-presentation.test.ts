import { describe, expect, it } from 'vitest';
import {
  DECK_CHROME_HIDE_CSS,
  DECK_PRESENTATION_APPLIED_MESSAGE_TYPE,
  DECK_PRESENTATION_BRIDGE_MARKER,
  DECK_PRESENTATION_BRIDGE_TOKEN,
  DECK_PRESENTATION_BRIDGE_TOKENS,
  DECK_PRESENTATION_CAPABILITIES,
  DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE,
  DECK_PRESENTATION_PROTOCOL_VERSION,
  DECK_PRESENTATION_READY_MESSAGE_TYPE,
  DECK_PRESENTATION_SET_MESSAGE_TYPE,
  DECK_STAGE_SHADOW_CHROME_HIDE_CSS,
  DECK_STAGE_SHADOW_CHROME_HIDE_STYLE_ID,
  buildDeckPresentationBridge,
  createDeckPresentationSetMessage,
  deckPresentationMessageMatchesDocument,
  parseDeckPresentationMessage,
} from '../../src/runtime/deck-presentation';

const identity = { sessionId: 'session-1', documentVersion: 'version-1' };

describe('deck presentation protocol', () => {
  it('names one bridge token and one injection marker', () => {
    expect(DECK_PRESENTATION_BRIDGE_TOKEN).toBe('presentation');
    expect(DECK_PRESENTATION_BRIDGE_TOKENS).toContain('presentation');
    expect(DECK_PRESENTATION_BRIDGE_MARKER).toBe('data-od-deck-presentation-bridge');
  });

  it('builds one inert script carrying the shared marker', () => {
    const bridge = buildDeckPresentationBridge();
    expect(bridge.startsWith(`<script ${DECK_PRESENTATION_BRIDGE_MARKER}>`)).toBe(true);
    expect(bridge.endsWith('</script>')).toBe(true);
    // A second </script> inside the payload would terminate the tag early.
    expect(bridge.slice(0, -'</script>'.length)).not.toMatch(/<\/script/iu);
  });

  it('reuses the build-time chrome hiding CSS rather than restating it', () => {
    const bridge = buildDeckPresentationBridge();
    expect(bridge).toContain(JSON.stringify(DECK_CHROME_HIDE_CSS));
    expect(bridge).toContain(JSON.stringify(DECK_STAGE_SHADOW_CHROME_HIDE_CSS));
    expect(bridge).toContain(JSON.stringify(DECK_STAGE_SHADOW_CHROME_HIDE_STYLE_ID));
    expect(DECK_CHROME_HIDE_CSS).toContain('.deck-counter');
    expect(DECK_STAGE_SHADOW_CHROME_HIDE_CSS).toContain('.tapzones');
  });

  it('creates a host set message fenced by document identity', () => {
    expect(createDeckPresentationSetMessage({ ...identity, presenting: true, revision: 3 })).toEqual({
      type: DECK_PRESENTATION_SET_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      sessionId: 'session-1',
      documentVersion: 'version-1',
      presenting: true,
      revision: 3,
    });
    expect(() => createDeckPresentationSetMessage({
      ...identity,
      sessionId: '',
      presenting: true,
      revision: 1,
    })).toThrow(TypeError);
    expect(() => createDeckPresentationSetMessage({
      ...identity,
      presenting: true,
      revision: 0,
    })).toThrow(TypeError);
  });

  it('parses every runtime receipt and rejects malformed ones', () => {
    expect(parseDeckPresentationMessage({
      type: DECK_PRESENTATION_READY_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      capabilities: [...DECK_PRESENTATION_CAPABILITIES],
    })).toEqual({
      type: DECK_PRESENTATION_READY_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      capabilities: [...DECK_PRESENTATION_CAPABILITIES],
    });

    expect(parseDeckPresentationMessage({
      type: DECK_PRESENTATION_APPLIED_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      ...identity,
      revision: 2,
      presenting: true,
      chromeHidden: true,
      clickNavigation: true,
      deckStageCount: 1,
      deckStagesHidden: 1,
    })).toMatchObject({
      type: DECK_PRESENTATION_APPLIED_MESSAGE_TYPE,
      revision: 2,
      presenting: true,
      chromeHidden: true,
      deckStagesHidden: 1,
    });

    expect(parseDeckPresentationMessage({
      type: DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      ...identity,
      revision: 2,
      direction: 'prev',
    })).toMatchObject({ direction: 'prev' });

    // Wrong protocol version, unknown type, unbounded identity, bad direction.
    expect(parseDeckPresentationMessage({
      type: DECK_PRESENTATION_APPLIED_MESSAGE_TYPE,
      protocolVersion: 99,
      ...identity,
      revision: 1,
      presenting: false,
      chromeHidden: false,
      clickNavigation: false,
      deckStageCount: 0,
      deckStagesHidden: 0,
    })).toBeNull();
    expect(parseDeckPresentationMessage({ type: 'od:slide', protocolVersion: 1 })).toBeNull();
    expect(parseDeckPresentationMessage({
      type: DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      ...identity,
      revision: 1,
      direction: 'sideways',
    })).toBeNull();
    expect(parseDeckPresentationMessage(null)).toBeNull();
  });

  it('fences receipts against the document the host believes it is driving', () => {
    const applied = parseDeckPresentationMessage({
      type: DECK_PRESENTATION_APPLIED_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      ...identity,
      revision: 1,
      presenting: true,
      chromeHidden: true,
      clickNavigation: true,
      deckStageCount: 0,
      deckStagesHidden: 0,
    });
    expect(deckPresentationMessageMatchesDocument(applied, identity)).toBe(true);
    expect(deckPresentationMessageMatchesDocument(applied, {
      sessionId: 'session-1',
      documentVersion: 'version-2',
    })).toBe(false);
    expect(deckPresentationMessageMatchesDocument(null, identity)).toBe(false);
  });
});
