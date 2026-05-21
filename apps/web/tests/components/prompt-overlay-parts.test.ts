import { describe, expect, it } from 'vitest';

import {
  buildPromptHighlightParts,
  type PromptHighlightPart,
} from '../../src/components/prompt-overlay-parts';

const TEMPLATE = 'Make a {{page-count}} page deck about {{topic}}.';
const VALUES = { 'page-count': '5', topic: 'birds' };
const RENDERED = 'Make a 5 page deck about birds.';

function kinds(parts: PromptHighlightPart[] | null): string {
  if (!parts) return 'null';
  return parts.map((p) => (p.kind === 'slot' ? `slot(${p.key}=${p.text})` : `text("${p.text}")`)).join(' | ');
}

describe('buildPromptHighlightParts (#2090)', () => {
  it('returns null when the template is missing', () => {
    expect(buildPromptHighlightParts(null, VALUES, RENDERED)).toBeNull();
  });

  it('returns null when the template has no slot placeholders', () => {
    expect(buildPromptHighlightParts('Just a plain prompt.', {}, 'Just a plain prompt.')).toBeNull();
  });

  it('returns slot+text parts when the prompt exactly matches the rendered template', () => {
    const parts = buildPromptHighlightParts(TEMPLATE, VALUES, RENDERED);
    expect(kinds(parts)).toBe(
      'text("Make a ") | slot(page-count=5) | text(" page deck about ") | slot(topic=birds) | text(".")',
    );
  });

  it('preserves slot chips when the user appends literal text to the prompt', () => {
    const edited = `${RENDERED} Please use a friendly tone.`;
    const parts = buildPromptHighlightParts(TEMPLATE, VALUES, edited);
    expect(parts).not.toBeNull();
    expect(parts!.filter((p) => p.kind === 'slot').map((p) => `${p.key}=${p.text}`)).toEqual([
      'page-count=5',
      'topic=birds',
    ]);
    // Trailing literal must include the user's addition.
    expect(parts![parts!.length - 1]).toEqual({ kind: 'text', text: '. Please use a friendly tone.' });
  });

  it('preserves slot chips when the user edits the literal text between slots', () => {
    const edited = 'Make a 5 page slide deck about birds.';
    const parts = buildPromptHighlightParts(TEMPLATE, VALUES, edited);
    expect(parts).not.toBeNull();
    const middleText = parts!.find((p, i) => p.kind === 'text' && i > 0 && i < parts!.length - 1);
    expect(middleText?.text).toBe(' page slide deck about ');
    expect(parts!.filter((p) => p.kind === 'slot').map((p) => p.key)).toEqual(['page-count', 'topic']);
  });

  it('preserves slot chips when the user prepends literal text before the first slot', () => {
    const edited = `Hey there! ${RENDERED}`;
    const parts = buildPromptHighlightParts(TEMPLATE, VALUES, edited);
    expect(parts).not.toBeNull();
    expect(parts![0]).toEqual({ kind: 'text', text: 'Hey there! Make a ' });
    expect(parts!.filter((p) => p.kind === 'slot')).toHaveLength(2);
  });

  it('falls back to null when a slot value has been edited out of the prompt', () => {
    // User deleted the '5' that backs the page-count slot.
    const edited = 'Make a  page deck about birds.';
    expect(buildPromptHighlightParts(TEMPLATE, VALUES, edited)).toBeNull();
  });

  it('falls back to null when slot text order is broken', () => {
    // User somehow moved the topic value before the count value.
    const edited = 'Make a birds page deck about 5.';
    expect(buildPromptHighlightParts(TEMPLATE, VALUES, edited)).toBeNull();
  });

  it('anchors a slot to its template-adjacent literal even when its value also appears in user-typed prose (review feedback)', () => {
    // nettee's #2329 review case: the literal `birds` the user typed
    // between `5 ` and ` page deck` must NOT swallow the topic slot —
    // the real slot lives after `about ` and stays anchored there.
    const edited = 'Make a 5 birds page deck about birds.';
    const parts = buildPromptHighlightParts(TEMPLATE, VALUES, edited);
    expect(parts).not.toBeNull();
    const sequence = kinds(parts);
    // The "birds" right after "about " (preceded by the literal that
    // sits next to {{topic}} in the template) is the slot; the earlier
    // user-typed "birds" stays inside the surrounding text part.
    expect(sequence).toBe(
      'text("Make a ") | slot(page-count=5) | text(" birds page deck about ") | slot(topic=birds) | text(".")',
    );
  });

  it('treats duplicate slot values as distinct positions when both still appear in order', () => {
    const template = 'A {{a}} and another {{a}}.';
    const values = { a: '5' };
    const rendered = 'A 5 and another 5.';
    const parts = buildPromptHighlightParts(template, values, rendered);
    expect(parts!.filter((p) => p.kind === 'slot')).toHaveLength(2);
    // Edit the literal between them.
    const edited = 'A 5 plus another 5.';
    const edited2 = buildPromptHighlightParts(template, values, edited);
    expect(edited2!.filter((p) => p.kind === 'slot')).toHaveLength(2);
    const middle = edited2!.find((p, i) => p.kind === 'text' && i > 0 && i < edited2!.length - 1);
    expect(middle?.text).toBe(' plus another ');
  });

  it('keeps unfilled slot placeholders styled when the prompt still shows the placeholder text', () => {
    const template = 'Make a {{page-count}} page deck about {{topic}}.';
    const values = { 'page-count': '5' }; // topic unfilled
    const rendered = 'Make a 5 page deck about {{topic}}.';
    const parts = buildPromptHighlightParts(template, values, rendered);
    expect(parts).not.toBeNull();
    const topicSlot = parts!.find((p) => p.kind === 'slot' && p.key === 'topic');
    expect(topicSlot?.filled).toBe(false);
    expect(topicSlot?.text).toBe('{{topic}}');
  });
});
