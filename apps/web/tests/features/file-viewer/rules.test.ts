import { describe, expect, it } from 'vitest';

import {
  serializeInspectOverrides,
  updateInspectOverride,
  parseInspectOverridesFromSource,
  applyInspectOverridesToSource,
} from '../../../src/features/file-viewer/rules';
import type { InspectOverrideMap } from '../../../src/features/file-viewer/types';

describe('serializeInspectOverrides', () => {
  it('re-derives a data-od-id selector and emits allow-listed props with !important', () => {
    const out = serializeInspectOverrides({
      hero: { selector: '[data-od-id="hero"]', props: { color: '#ff0000', 'font-size': '18px' } },
    });
    expect(out).toBe('[data-od-id="hero"] { color: #ff0000 !important; font-size: 18px !important }');
  });

  it('re-derives a data-screen-label selector when the inbound selector uses it', () => {
    const out = serializeInspectOverrides({
      '01 Cover': { selector: '[data-screen-label="01 Cover"]', props: { color: '#000' } },
    });
    expect(out).toBe('[data-screen-label="01 Cover"] { color: #000 !important }');
  });

  it('falls back to data-od-id when the inbound selector is not a string', () => {
    const out = serializeInspectOverrides({
      hero: { selector: 42, props: { color: '#000' } },
    });
    expect(out).toBe('[data-od-id="hero"] { color: #000 !important }');
  });

  it('returns empty string for non-object inputs', () => {
    expect(serializeInspectOverrides(null)).toBe('');
    expect(serializeInspectOverrides(undefined)).toBe('');
    expect(serializeInspectOverrides('str')).toBe('');
    expect(serializeInspectOverrides(42)).toBe('');
  });

  it('skips hostile elementIds and empty ids', () => {
    const out = serializeInspectOverrides({
      '': { selector: '', props: { color: '#000' } },
      'bad"id': { selector: '', props: { color: '#000' } },
      'badid': { selector: '', props: { color: '#000' } },
    });
    expect(out).toBe('');
  });

  it('skips non-object entries, missing props, and non-object props', () => {
    const out = serializeInspectOverrides({
      a: null,
      b: 'nope',
      c: {},
      d: { props: 'nope' },
      e: { props: null },
    });
    expect(out).toBe('');
  });

  it('drops non-string prop names/values, disallowed props, unsafe values, and empty values', () => {
    const out = serializeInspectOverrides({
      hero: {
        selector: '',
        props: {
          color: '#0f0',
          123: 'x', // numeric key survives as string 'name', so allow-list still gates it
          'z-index': '10', // not allow-listed
          'font-size': 'red;} evil', // unsafe value
          padding: '   ', // trims to empty
          'font-weight': 700, // non-string value
        },
      },
    });
    expect(out).toBe('[data-od-id="hero"] { color: #0f0 !important }');
  });

  it('emits nothing for an entry whose props all fail validation', () => {
    const out = serializeInspectOverrides({
      hero: { selector: '', props: { 'z-index': '10' } },
    });
    expect(out).toBe('');
  });
});

describe('updateInspectOverride', () => {
  const base: InspectOverrideMap = {
    hero: { selector: '[data-od-id="hero"]', props: { color: '#111' } },
  };

  it('adds a new prop to an existing element (new map identity)', () => {
    const next = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'font-size', '20px');
    expect(next).not.toBe(base);
    expect(next.hero!.props).toEqual({ color: '#111', 'font-size': '20px' });
  });

  it('adds a brand-new element with the given selector', () => {
    const next = updateInspectOverride(base, 'foot', '[data-od-id="foot"]', 'color', '#222');
    expect(next.foot).toEqual({ selector: '[data-od-id="foot"]', props: { color: '#222' } });
  });

  it('returns the same map on a no-op (same value + same selector)', () => {
    const next = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'color', '#111');
    expect(next).toBe(base);
  });

  it('clears a prop when value is empty and drops the element once empty', () => {
    const next = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'color', '');
    expect(next.hero).toBeUndefined();
  });

  it('returns the same map when clearing a prop that is not present', () => {
    const next = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'font-size', '');
    expect(next).toBe(base);
  });

  it('falls back to the existing selector when none is supplied', () => {
    const next = updateInspectOverride(base, 'hero', '', 'font-weight', '700');
    expect(next.hero!.selector).toBe('[data-od-id="hero"]');
  });

  it('rejects hostile ids, disallowed props, and unsafe values (same map)', () => {
    expect(updateInspectOverride(base, 'bad"id', 's', 'color', '#000')).toBe(base);
    expect(updateInspectOverride(base, 'hero', 's', 'z-index', '5')).toBe(base);
    expect(updateInspectOverride(base, 'hero', 's', 'color', 'red;}')).toBe(base);
    expect(updateInspectOverride(base, '', 's', 'color', '#000')).toBe(base);
  });

  it('coerces nullish prop/value inputs', () => {
    // prop coerces to '' -> not allow-listed -> unchanged
    expect(updateInspectOverride(base, 'hero', 's', undefined as unknown as string, 'x')).toBe(base);
    // value coerces to '' -> clears (color is present) -> element dropped
    const cleared = updateInspectOverride(base, 'hero', 's', 'color', null as unknown as string);
    expect(cleared.hero).toBeUndefined();
  });
});

describe('parseInspectOverridesFromSource', () => {
  it('returns {} for empty source and sources without an override block', () => {
    expect(parseInspectOverridesFromSource('')).toEqual({});
    expect(parseInspectOverridesFromSource('<!doctype html><html><body>x</body></html>')).toEqual({});
  });

  it('parses a persisted override block, stripping !important', () => {
    const source =
      '<head><style data-od-inspect-overrides>\n[data-od-id="hero"] { color: #ff0000 !important; font-size: 18px }\n</style></head>';
    const map = parseInspectOverridesFromSource(source);
    expect(map).toEqual({
      hero: { selector: '[data-od-id="hero"]', props: { color: '#ff0000', 'font-size': '18px' } },
    });
  });

  it('parses a data-screen-label rule', () => {
    const source =
      '<head><style data-od-inspect-overrides>[data-screen-label="Cover"] { color: #000 }</style></head>';
    const map = parseInspectOverridesFromSource(source);
    expect(map.Cover).toEqual({ selector: '[data-screen-label="Cover"]', props: { color: '#000' } });
  });

  it('skips disallowed props, unsafe values, malformed decls, and rules with no surviving props', () => {
    const source =
      '<head><style data-od-inspect-overrides>' +
      '[data-od-id="a"] { z-index: 10; color: #0f0; nocolon; :novalue }' +
      '[data-od-id="b"] { z-index: 99 }' +
      '</style></head>';
    const map = parseInspectOverridesFromSource(source);
    expect(map).toEqual({ a: { selector: '[data-od-id="a"]', props: { color: '#0f0' } } });
  });

  it('ignores a marker literal that lives inside a raw-text element', () => {
    const source =
      '<head><script>const s = "<style data-od-inspect-overrides>[data-od-id=\\"x\\"] { color: red }</style>";</script></head>';
    expect(parseInspectOverridesFromSource(source)).toEqual({});
  });
});

describe('applyInspectOverridesToSource', () => {
  it('inserts the block immediately before </head>', () => {
    const next = applyInspectOverridesToSource(
      '<head><title>t</title></head><body>x</body>',
      '[data-od-id="hero"] { color: #f00 !important }',
    );
    expect(next).toBe(
      '<head><title>t</title><style data-od-inspect-overrides>\n[data-od-id="hero"] { color: #f00 !important }\n</style>\n</head><body>x</body>',
    );
  });

  it('inserts after <head ...> open when there is no close tag', () => {
    const next = applyInspectOverridesToSource('<head>', 'a { color: red }');
    expect(next).toBe('<head><style data-od-inspect-overrides>\na { color: red }\n</style>\n');
  });

  it('prepends the block when there is no head at all', () => {
    const next = applyInspectOverridesToSource('<main data-od-id="x">x</main>', 'a { color: red }');
    expect(next.startsWith('<style data-od-inspect-overrides>')).toBe(true);
    expect(next.endsWith('<main data-od-id="x">x</main>')).toBe(true);
  });

  it('is idempotent — re-applying the same css yields the same document', () => {
    const base = '<head></head><body>x</body>';
    const css = '[data-od-id="hero"] { color: #f00 !important }';
    const once = applyInspectOverridesToSource(base, css);
    const twice = applyInspectOverridesToSource(once, css);
    expect(twice).toBe(once);
  });

  it('strips the block entirely when css is empty/whitespace', () => {
    const base = '<head></head><body>x</body>';
    const with_ = applyInspectOverridesToSource(base, 'a { color: red }');
    expect(applyInspectOverridesToSource(with_, '')).toBe(base);
    expect(applyInspectOverridesToSource(with_, '   ')).toBe(base);
  });

  it('does not strip a marker literal that lives inside a <textarea>', () => {
    const sourceWithTextarea =
      '<head></head><body><textarea><style data-od-inspect-overrides>a { color: red }</style></textarea></body>';
    const next = applyInspectOverridesToSource(sourceWithTextarea, 'b { color: blue }');
    expect(next).toContain('<textarea><style data-od-inspect-overrides>a { color: red }</style></textarea>');
  });

  it('treats a self-closing override <style/> as nothing to strip', () => {
    const next = applyInspectOverridesToSource('<head><style data-od-inspect-overrides/></head>', '');
    expect(next).toBe('<head></head>');
  });

  it('drops the remainder when the override block is unterminated', () => {
    const next = applyInspectOverridesToSource('<head><style data-od-inspect-overrides>a { color: red }', '');
    expect(next).toBe('<head>');
  });

  it('passes through comments, doctype and processing instructions verbatim', () => {
    const base = '<!doctype html><!-- note --><?xml v?><head></head>';
    const next = applyInspectOverridesToSource(base, 'a { color: red }');
    expect(next.startsWith('<!doctype html><!-- note --><?xml v?><head>')).toBe(true);
  });

  it('ignores a longer attribute name that merely prefixes the marker', () => {
    const src = '<head><style data-od-inspect-overrides-note="docs">.x{}</style></head>';
    const stripped = applyInspectOverridesToSource(src, '');
    expect(stripped).toContain('data-od-inspect-overrides-note="docs"');
  });

  it('ignores the marker spelled inside another attribute value', () => {
    const src = '<head><style title="data-od-inspect-overrides">.x{}</style></head>';
    const stripped = applyInspectOverridesToSource(src, '');
    expect(stripped).toContain('title="data-od-inspect-overrides"');
  });

  it('leaves an unterminated raw-text element intact and stops the walk', () => {
    const src = '<head><textarea>never closed';
    expect(applyInspectOverridesToSource(src, '')).toBe(src);
  });

  it('emits trailing text after the last tag verbatim', () => {
    const src = '<head></head>trailing text';
    expect(applyInspectOverridesToSource(src, '')).toBe(src);
  });

  it('emits an unterminated final tag (no closing >) verbatim and stops', () => {
    const src = '<head></head><nope';
    expect(applyInspectOverridesToSource(src, '')).toBe(src);
  });

  it('passes through a `<` that is neither a valid open nor close tag', () => {
    const src = '<head></head><1abc>tail';
    expect(applyInspectOverridesToSource(src, '')).toBe(src);
  });

  it('recognises the marker after a whitespaced, unquoted preceding attribute', () => {
    const src = '<head><style foo = bar data-od-inspect-overrides>a { color: red }</style></head>';
    const stripped = applyInspectOverridesToSource(src, '');
    expect(stripped).toBe('<head></head>');
  });

  it('skips a false `</style` close that lacks a name boundary before the real one', () => {
    const src =
      '<head><style data-od-inspect-overrides>[data-od-id="a"] { color: red }</stylexyz>x</style></head>';
    const map = parseInspectOverridesFromSource(src);
    expect(map.a).toEqual({ selector: '[data-od-id="a"]', props: { color: 'red' } });
  });

  it('drops an override <style> that opens at the very end of the document', () => {
    const src = '<head><style data-od-inspect-overrides>';
    expect(applyInspectOverridesToSource(src, '')).toBe('<head>');
  });
});

describe('parseInspectOverridesFromSource — decl and id edge cases', () => {
  it('skips empty id, hostile id, empty decl segments, and allow-listed props with empty/unsafe values', () => {
    const source =
      '<head><style data-od-inspect-overrides>' +
      '[data-od-id=""] { color: red }' + // empty id -> skipped
      '[data-od-id="a<b"] { color: red }' + // hostile id -> skipped
      '[data-od-id="ok"] { color: ; font-size: a<b ; color: #0f0 ;; }' + // empty, unsafe, valid, empty segment
      '</style></head>';
    const map = parseInspectOverridesFromSource(source);
    expect(map).toEqual({ ok: { selector: '[data-od-id="ok"]', props: { color: '#0f0' } } });
  });
});

describe('walker + attribute-parsing edge branches', () => {
  it('stores a brand-new element with an empty selector fallback', () => {
    const next = updateInspectOverride({}, 'solo', '', 'color', '#123');
    expect(next.solo).toEqual({ selector: '', props: { color: '#123' } });
  });

  it('bails out of a <style> attribute scan on an unterminated quoted value', () => {
    // `<style foo="bar>` never closes its quote, so the marker is never found;
    // the tag is not treated as an override block and is left intact.
    const src = '<head><style foo="bar>.x{}</style></head>';
    const stripped = applyInspectOverridesToSource(src, '');
    expect(stripped).toContain('<style foo="bar>');
  });

  it('passes through an unterminated HTML comment verbatim', () => {
    const src = '<head><!-- no close';
    expect(applyInspectOverridesToSource(src, '')).toBe(src);
  });

  it('passes through an unterminated doctype/processing instruction verbatim', () => {
    const src = '<head></head><!doctype-no-close';
    expect(applyInspectOverridesToSource(src, '')).toBe(src);
  });

  it('strips an override block whose closing </style has no closing >', () => {
    const src = '<head><style data-od-inspect-overrides>a { color: red }</style';
    expect(applyInspectOverridesToSource(src, '')).toBe('<head>');
  });

  it('emits a raw-text element whose close tag has no > up to end of source', () => {
    const src = '<body><textarea>x</textarea';
    expect(applyInspectOverridesToSource(src, '')).toBe(src);
  });
});
