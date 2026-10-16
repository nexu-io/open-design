import { describe, expect, it } from 'vitest';
import { resolveCommentTargetTitle } from '../src/comment-target-title';

const target = { elementId: 'hero-heading', label: 'hero-heading', text: 'A closer look.', htmlHint: '<h1 data-od-id="hero-heading">' };
describe('comment target title', () => {
  it('prefers a screen label over visible element text', () => {
    expect(resolveCommentTargetTitle({ ...target, htmlHint: '<h1 data-screen-label="Product overview">' }).name).toBe('Product overview');
  });
  it('keeps a readable screen label that also serves as a screen-only anchor id', () => {
    expect(resolveCommentTargetTitle({ ...target, elementId: 'Overview', htmlHint: '<section data-screen-label="Overview">' }).name).toBe('Overview');
  });
  it('uses visible text, not the internal label or id', () => {
    expect(resolveCommentTargetTitle(target).name).toBe('A closer look.');
  });
  it('normalizes whitespace while preserving case and Unicode', () => {
    expect(resolveCommentTargetTitle({ ...target, text: '  更近\n 看看\t 👋  ' }).name).toBe('更近 看看 👋');
  });
  it('decodes screen-label entities once and accepts single/unquoted attributes', () => {
    expect(resolveCommentTargetTitle({ ...target, htmlHint: "<h1 data-screen-label='A &amp; B &#x1F44B;'>" }).name).toBe('A & B 👋');
    expect(resolveCommentTargetTitle({ ...target, htmlHint: '<h1 data-screen-label=Overview>' }).name).toBe('Overview');
  });
  it('ignores an attribute-looking value inside another attribute', () => {
    expect(resolveCommentTargetTitle({ ...target, htmlHint: '<h1 title="data-screen-label=Wrong">' }).name).toBe('A closer look.');
  });
  it('falls through empty or internal screen labels to real text', () => {
    for (const label of ['', '  ', 'hero-heading', 'pin-123', 'file-comment-123']) {
      expect(resolveCommentTargetTitle({ ...target, htmlHint: `<h1 data-screen-label="${label}">` }).name).toBe('A closer look.');
    }
  });
  it('never exposes raw internal ids as a title', () => {
    expect(resolveCommentTargetTitle({ ...target, text: 'hero-heading' })).toEqual({ kind: 'text' });
  });
  it('falls back to the element type when there is no readable text', () => {
    const cases: Array<[string, string]> = [['<h1>', 'text'], ['<img>', 'image'], ['<button>', 'control'], ['<a>', 'link'], ['<section>', 'section'], ['<div>', 'area']];
    for (const [htmlHint, kind] of cases) {
      expect(resolveCommentTargetTitle({ ...target, text: '', htmlHint })).toEqual({ kind });
    }
  });
  it('pin and whole-page comments never borrow arbitrary text or internal ids', () => {
    expect(resolveCommentTargetTitle({ ...target, elementId: 'pin-123' })).toEqual({ kind: 'pin' });
    expect(resolveCommentTargetTitle({ ...target, elementId: 'file-comment-123' })).toEqual({ kind: 'page' });
    expect(resolveCommentTargetTitle({ ...target, label: 'index.html' })).toEqual({ kind: 'page' });
  });
});
