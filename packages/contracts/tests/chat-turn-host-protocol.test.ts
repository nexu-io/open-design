import { describe, expect, it } from 'vitest';

import { renderChatTurnHostProtocolInstructions } from '../src/prompts/chat-turn-host-protocol.js';

const KEY = '0123456789abcdef';

describe('chat turn host protocol', () => {
  it('renders the same keyed done, next-step, and focus protocol for ordinary chat', () => {
    const result = renderChatTurnHostProtocolInstructions(KEY);

    expect(result.doneMarker).toContain(`<od-done key="${KEY}"/>`);
    expect(result.nextSteps).toContain(`<od-next key="${KEY}" value="Add an orders list page"/>`);
    expect(result.nextSteps).not.toContain('</od-next>');
    expect(result.artifactFocus).toContain(`<od-focus key="${KEY}"`);
    expect(result.text).not.toContain('OD Next host handoff gate');
  });

  it('gives the planning turn one keyed continuation marker and no other output protocol', () => {
    const result = renderChatTurnHostProtocolInstructions(KEY, 'od_next_request');
    expect(result.text).toContain(`<od-production-ready key="${KEY}" />`);
    expect(result.text).toContain('last');
    expect(result.doneMarker).toBe('');
    expect(result.nextSteps).toBe('');
    expect(result.artifactFocus).toBe('');
  });
  it('describes production completion without requiring retired model state declarations', () => {
    const result = renderChatTurnHostProtocolInstructions(KEY, 'od_next_production');

    expect(result.text).not.toContain('response declares');
    expect(result.text).not.toContain('inputStage=');
    expect(result.text).not.toContain('outcome=');
    expect(result.text).toContain('omit all three protocols');
    expect(result.text).toContain(`<od-next key="${KEY}" value="Add an orders list page"/>`);
    expect(renderChatTurnHostProtocolInstructions('', 'od_next_production')).toEqual({
      doneMarker: '',
      nextSteps: '',
      artifactFocus: '',
      text: '',
    });
  });
});
