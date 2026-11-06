import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyManualEditPatch } from '../../src/edit-mode/source-patches';
import type { ManualEditPatch } from '../../src/edit-mode/types';

const id = '12345678-1234-4234-8234-123456789abc';
const childId = '12345678-1234-4234-8234-123456789abd';
const source = `<main><section data-od-id="target" data-od-comment-id="${id}"><span data-od-comment-id="${childId}">Original</span></section><p>Other</p></main>`;
function patch(value: ManualEditPatch): Document {
  const result = applyManualEditPatch(source, value);
  expect(result.ok).toBe(true);
  return new DOMParser().parseFromString(result.source, 'text/html');
}

describe('comment identity at the actual manual source patch boundary', () => {
  beforeEach(() => { globalThis.DOMParser = new JSDOM('').window.DOMParser; });
  afterEach(() => { Reflect.deleteProperty(globalThis, 'DOMParser'); });
  it('preserves same-node identities through text, style and drag style edits', () => {
    for (const value of [
      { kind: 'set-text', id: 'target', value: 'Updated' },
      { kind: 'set-style', id: 'target', styles: { color: 'blue', transform: 'translate(10px, 20px)' } },
    ] satisfies ManualEditPatch[]) {
      const doc = patch(value);
      expect(doc.querySelector('[data-od-id="target"]')?.getAttribute('data-od-comment-id')).toBe(id);
      expect(doc.querySelector('span')?.getAttribute('data-od-comment-id')).toBe(childId);
    }
  });
  it.each(['data-od-comment-id', 'DATA-OD-COMMENT-ID', 'Data-Od-Comment-Id'])('generic attrs cannot overwrite or remove %s', (name) => {
    for (const value of ['', childId]) {
      const doc = patch({ kind: 'set-attributes', id: 'target', attributes: { [name]: value, title: 'Allowed' } });
      expect(doc.querySelector('section')?.getAttribute('data-od-comment-id')).toBe(id);
      expect(doc.querySelector('section')?.getAttribute('title')).toBe('Allowed');
    }
  });
  it('retains only missing root identity on outerHTML replacement, never guesses descendants', () => {
    const doc = patch({ kind: 'set-outer-html', id: 'target', html: '<article><span>Original</span></article>' });
    expect(doc.querySelector('article')?.getAttribute('data-od-comment-id')).toBe(id);
    expect(doc.querySelector('span')?.hasAttribute('data-od-comment-id')).toBe(false);
    expect(doc.querySelector('article')?.getAttribute('data-od-id')).toBe('target');
  });
  it('treats an explicitly different replacement identity as different', () => {
    const doc = patch({ kind: 'set-outer-html', id: 'target', html: `<article data-od-comment-id="${childId}">New</article>` });
    expect(doc.querySelector('article')?.getAttribute('data-od-comment-id')).toBe(childId);
  });
  it.each(['', 'malformed'])('does not repair explicit replacement identity %j', (replacementId) => {
    const doc = patch({ kind: 'set-outer-html', id: 'target', html: `<article data-od-comment-id="${replacementId}">New</article>` });
    expect(doc.querySelector('article')?.getAttribute('data-od-comment-id')).toBe(replacementId);
  });
  it('does not introduce an identity via generic attrs on an unprepared element', () => {
    const result = applyManualEditPatch('<p data-od-id="target">Original</p>', {
      kind: 'set-attributes', id: 'target', attributes: { 'DATA-OD-COMMENT-ID': id },
    });
    expect(result.ok).toBe(true);
    expect(new DOMParser().parseFromString(result.source, 'text/html').querySelector('p')?.hasAttribute('data-od-comment-id')).toBe(false);
  });
  it('allows deletion and explicit full-source identity removal', () => {
    expect(patch({ kind: 'remove-element', id: 'target' }).querySelector('[data-od-comment-id]')).toBeNull();
    expect(patch({ kind: 'set-full-source', source: '<main><section>Original</section></main>' }).querySelector('[data-od-comment-id]')).toBeNull();
  });
  it('does not guess which copied identity belongs to the original on explicit source save', () => {
    const doc = patch({ kind: 'set-full-source', source: `<p data-od-comment-id="${id}">Same</p><p data-od-comment-id="${id}">Same</p>` });
    // No controlled copy seam exists here. The strict reader must reject this
    // ambiguous identity; source editing must not silently reassign either node.
    expect(doc.querySelectorAll(`[data-od-comment-id="${id}"]`)).toHaveLength(2);
  });
});
