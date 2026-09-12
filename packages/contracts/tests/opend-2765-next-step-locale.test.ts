/**
 * OPEND-2765 — the three follow-up suggestions must be written in the run's UI
 * locale.
 *
 * Reported on 0.21.1-beta.7 with the UI in `zh-CN` and a Chinese deliverable:
 * the row under a completed turn came back in English —
 *
 *   · "Add an evaluation request form section after the final CTA"
 *   · "Persist the ROI calculator inputs in localStorage"
 *   · "Switch the capabilities grid to a two-column layout"
 *
 * The third line is near-verbatim this prompt's own example ("Switch the
 * product cards to a two-column layout"), which is the tell: the only language
 * rule the follow-up block carried was "write them in the language the user is
 * speaking" — inference, sat directly under three English examples — while the
 * run's actual locale lived in `# UI locale override`, a section of the
 * cache-stable prompt head that `server.ts` deliberately DROPS on every resume
 * turn (`includeStableForPayload ? daemonSystemPrompt : ''`). The per-turn
 * slice that carries this marker is re-sent every turn; the locale that
 * governs it was not.
 *
 * These specs pin the seam we control — does the instruction the model reads
 * name the run's locale — not whether the model then obeys it.
 */
import { describe, expect, it } from 'vitest';

import { renderChatTurnHostProtocolInstructions } from '../src/prompts/chat-turn-host-protocol.js';

const KEY = '0123456789abcdef';

describe('OPEND-2765 next-step suggestions follow the run locale', () => {
  it('names the locale in the per-turn follow-up block for zh-CN', () => {
    const { nextSteps } = renderChatTurnHostProtocolInstructions(KEY, 'ordinary', 'zh-CN');

    expect(nextSteps).toContain('Follow-up suggestions:');
    expect(nextSteps).toContain('zh-CN');
    expect(nextSteps).toContain('Simplified Chinese');
  });

  it('keeps the mixed-script exception the ticket asks for', () => {
    // `localStorage` and `CTA` in the reported output are correct as-is; the
    // ticket only rejects the surrounding English prose. Wording is copied
    // from the existing `# UI locale override` section rather than invented.
    const { nextSteps } = renderChatTurnHostProtocolInstructions(KEY, 'ordinary', 'zh-CN');

    expect(nextSteps).toContain('Keep brand names, code, and technical identifiers as-is');
  });

  it('tells the model the English example is format-only', () => {
    // The reported third suggestion is a near-copy of the example below it.
    const { nextSteps } = renderChatTurnHostProtocolInstructions(KEY, 'ordinary', 'zh-CN');

    expect(nextSteps).toContain(
      `<od-next key="${KEY}" value="Switch the product cards to a two-column layout"/>`,
    );
    expect(nextSteps).toContain('marker format only, not the output language');
  });

  it('carries the locale on both OD Next stage policies too', () => {
    for (const policy of ['od_next_request', 'od_next_production'] as const) {
      const { nextSteps } = renderChatTurnHostProtocolInstructions(KEY, policy, 'zh-TW');
      expect(nextSteps).toContain('Traditional Chinese');
    }
  });

  it('falls back to the raw tag for a locale with no spelled-out name', () => {
    const { nextSteps } = renderChatTurnHostProtocolInstructions(KEY, 'ordinary', 'ja');

    expect(nextSteps).toContain('ja');
    expect(nextSteps).not.toContain('Simplified Chinese');
  });

  /*
   * Reverse anchor. The fix must be "follow the run's locale", never "always
   * write Chinese" — an English run has to render byte-for-byte what it
   * rendered before this change, including the inference-based wording that is
   * correct when no locale was selected.
   */
  it('leaves an English or absent locale byte-identical', () => {
    const noLocale = renderChatTurnHostProtocolInstructions(KEY, 'ordinary');

    expect(noLocale.nextSteps).toContain(
      'Write them in the language the user is speaking, and keep each under 120 characters.',
    );
    expect(noLocale.nextSteps).not.toContain('Simplified Chinese');

    for (const locale of ['en', 'EN', ' en ', '']) {
      expect(renderChatTurnHostProtocolInstructions(KEY, 'ordinary', locale))
        .toEqual(noLocale);
    }
  });

  it('still emits nothing without a turn key, locale or not', () => {
    expect(renderChatTurnHostProtocolInstructions('', 'ordinary', 'zh-CN')).toEqual({
      doneMarker: '',
      nextSteps: '',
      artifactFocus: '',
      text: '',
    });
  });
});
