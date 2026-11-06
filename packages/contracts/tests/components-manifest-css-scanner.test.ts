import { describe, expect, it } from 'vitest';

import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

function manifestFor(css: string, bodyHtml = '') {
  return extractComponentsManifest({
    brandId: 'scanner-fixture',
    fixtureHtml: `<style>${css}</style>${bodyHtml}`,
  });
}

function groupTokens(css: string, groupId: string, bodyHtml = ''): string[] {
  const group = manifestFor(css, bodyHtml).groups.find((candidate) => candidate.id === groupId);
  if (!group) throw new Error(`Unknown group ${groupId}`);
  return group.tokenReferences;
}

describe('css rule scanning', () => {
  it('attributes tokens to every rule in a consecutive run', () => {
    const css = `
      .btn { color: var(--accent); }
      .card { background: var(--surface); }
      .badge { border-color: var(--border); }
    `;
    const bodyHtml = '<button class="btn"></button><div class="card"></div><span class="badge"></span>';

    expect(groupTokens(css, 'buttons', bodyHtml)).toEqual(['--accent']);
    expect(groupTokens(css, 'cards', bodyHtml)).toEqual(['--surface']);
    expect(groupTokens(css, 'badges', bodyHtml)).toEqual(['--border']);
  });

  it('keeps token attribution when rules are separated by a block at-rule', () => {
    const css = `
      .btn { color: var(--accent); }
      @media (min-width: 40rem) {
        .btn { padding: var(--space-4); }
      }
      .card { background: var(--surface); }
    `;
    const bodyHtml = '<button class="btn"></button><div class="card"></div>';

    expect(groupTokens(css, 'buttons', bodyHtml)).toEqual(['--accent', '--space-4']);
    expect(groupTokens(css, 'cards', bodyHtml)).toEqual(['--surface']);
  });

  it('reads tokens from a rule that owns a nested block', () => {
    const css = `
      .card {
        background: var(--surface);
        &:hover { border-color: var(--accent); }
      }
    `;

    expect(groupTokens(css, 'cards', '<div class="card"></div>')).toEqual(['--accent', '--surface']);
  });

  it('resolves nested selectors instead of emitting declaration text as a selector', () => {
    const css = `
      .card {
        background: var(--surface);
        &:hover { border-color: var(--accent); }
        .title { color: var(--fg); }
      }
    `;

    expect(manifestFor(css).selectors).toEqual(['.card', '.card .title', '.card:hover']);
  });

  it('does not treat a declaration block as a selector when a rule nests', () => {
    const css = '.card { background: var(--surface); &:hover { color: var(--fg); } }';

    for (const selector of manifestFor(css).selectors) {
      expect(selector).not.toContain('var(');
      expect(selector).not.toContain(';');
    }
  });
});

describe('statement at-rules', () => {
  // A top-level statement at-rule terminates at `;` and owns no block. Scanning
  // must step over it without consuming the rule that follows.
  it.each([
    ['@charset "utf-8";'],
    ['@namespace svg url(http://www.w3.org/2000/svg);'],
    ['@layer base, components;'],
    ['@import url("theme.css");'],
    ['@IMPORT url("theme.css");'],
  ])('does not swallow the first rule after %s', (statement) => {
    const css = `${statement}\n.btn { color: var(--accent); }`;

    expect(groupTokens(css, 'buttons', '<button class="btn"></button>')).toEqual(['--accent']);
  });

  it('steps over a statement at-rule whose prelude contains braces in a string', () => {
    const css = '@import url("a{b}.css");\n.btn { color: var(--accent); }';

    expect(groupTokens(css, 'buttons', '<button class="btn"></button>')).toEqual(['--accent']);
  });
});

describe('keyframes', () => {
  // Stops are animation positions, not component surface. The single-stop form
  // was filtered by prelude; a stop list was not, so `0%, 100%` reached the
  // persisted manifest as two selectors.
  it.each([
    ['a comma-separated percentage list', '@keyframes pulse { 0%, 100% { opacity: var(--opacity); } }'],
    ['a mixed from/to list', '@keyframes pulse { from, to { opacity: var(--opacity); } }'],
    ['a single stop', '@keyframes pulse { 50% { opacity: var(--opacity); } }'],
    ['a vendor-prefixed block', '@-webkit-keyframes pulse { 0%, 100% { opacity: var(--opacity); } }'],
    ['several stops', '@keyframes pulse { from { opacity: 0; } 50%, 75% { opacity: 0.5; } to { opacity: 1; } }'],
  ])('emits no selector for %s', (_label, css) => {
    expect(manifestFor(css).selectors).toEqual([]);
  });

  it('keeps scanning rules that follow a keyframes block', () => {
    const css = `
      @keyframes pulse { 0%, 100% { opacity: var(--opacity); } }
      .btn { color: var(--accent); }
    `;
    const manifest = manifestFor(css, '<button class="btn"></button>');

    expect(manifest.selectors).toEqual(['.btn']);
    expect(groupTokens(css, 'buttons', '<button class="btn"></button>')).toEqual(['--accent']);
  });

  it('does not attribute stop declarations to an enclosing rule', () => {
    const css = '.card { background: var(--surface); @keyframes pulse { 0%, 100% { color: var(--fg); } } }';

    expect(groupTokens(css, 'cards', '<div class="card"></div>')).toEqual(['--surface']);
  });
});

describe('lexical edge cases', () => {
  it('ignores braces inside string values', () => {
    const css = `
      .btn::before { content: "{"; color: var(--accent); }
      .card { background: var(--surface); }
    `;
    const bodyHtml = '<button class="btn"></button><div class="card"></div>';

    expect(groupTokens(css, 'buttons', bodyHtml)).toEqual(['--accent']);
    expect(groupTokens(css, 'cards', bodyHtml)).toEqual(['--surface']);
  });

  it('ignores braces inside an escaped selector', () => {
    const css = `
      .w-\\{full\\} { color: var(--accent); }
      .card { background: var(--surface); }
    `;

    expect(groupTokens(css, 'cards', '<div class="card"></div>')).toEqual(['--surface']);
  });

  it.each([
    ['LF', '\\\n'],
    ['CRLF', '\\\r\n'],
  ])('reads an escaped %s inside a string as a line continuation', (_label, continuation) => {
    // The escape consumes the whole newline, CRLF included, so the string is
    // not cut in half by the LF half of the pair.
    const css = `.btn::before { content: "a${continuation}b"; color: var(--accent); }\n.card { background: var(--surface); }`;

    expect(manifestFor(css).selectors).toEqual(['.btn::before', '.card']);
  });

  it('treats an ampersand inside quoted selector text as a value', () => {
    const css = '.card { &[data-state="&"] { background: var(--surface); } }';

    expect(manifestFor(css).selectors).toEqual(['.card', '.card[data-state="&"]']);
  });

  it('keeps a comma inside a selector function out of the selector split', () => {
    const css = '.card:is(.a, .b) { background: var(--surface); }';

    expect(manifestFor(css).selectors).toEqual(['.card:is(.a, .b)']);
  });
});

describe('malformed input', () => {
  // Recovery matters because one bad character used to be able to cost the rest
  // of the stylesheet: a scan that ends on a stray `}` silently drops every
  // later rule, and the manifest still looks complete.
  it('skips a stray closing brace at the top level', () => {
    const css = '} .btn { color: var(--accent); }';

    expect(groupTokens(css, 'buttons', '<button class="btn"></button>')).toEqual(['--accent']);
  });

  it('keeps scanning after an unbalanced closing brace between rules', () => {
    const css = '.card { background: var(--surface); } } .btn { color: var(--accent); }';
    const bodyHtml = '<button class="btn"></button><div class="card"></div>';

    expect(manifestFor(css, bodyHtml).selectors).toEqual(['.btn', '.card']);
    expect(groupTokens(css, 'buttons', bodyHtml)).toEqual(['--accent']);
  });

  // CSS ends a string at an unescaped newline, so the damage is bounded to the
  // declaration that opened the quote. Preprocessing folds CR, CRLF and form
  // feed into newlines, so a stylesheet saved with CR line endings has to
  // recover the same way an LF one does.
  it.each([
    ['LF', '\n'],
    ['CR', '\r'],
    ['CRLF', '\r\n'],
    ['form feed', '\f'],
  ])('bounds an unterminated string at a %s newline', (_label, newline) => {
    const css = `.btn::before { content: "unterminated; }${newline}.card { background: var(--surface); }`;

    expect(manifestFor(css).selectors.some((selector) => selector.includes('.card'))).toBe(true);
  });
});

describe('unterminated functions', () => {
  it('bounds an unterminated url() at the block brace', () => {
    const css = '.btn { background: url(unclosed; }\n.card { background: var(--surface); }';

    expect(manifestFor(css).selectors).toEqual(['.btn', '.card']);
  });

  it('bounds an unterminated selector function so later rules survive', () => {
    const css = '.btn:is(.a { color: var(--accent); }\n.card { background: var(--surface); }';

    expect(manifestFor(css).selectors.some((selector) => selector.includes('.card'))).toBe(true);
  });

  it('keeps a balanced nested function intact', () => {
    const css = '.btn { width: calc(var(--space-4) * (1 + 2)); }\n.card { background: var(--surface); }';
    const bodyHtml = '<button class="btn"></button><div class="card"></div>';

    expect(manifestFor(css, bodyHtml).selectors).toEqual(['.btn', '.card']);
    expect(groupTokens(css, 'buttons', bodyHtml)).toEqual(['--space-4']);
  });

  it('comments out the remainder of an unterminated comment, as CSS does', () => {
    const css = '.btn { color: var(--accent); }\n/* .card { background: var(--surface); }';

    expect(manifestFor(css).selectors).toEqual(['.btn']);
  });
});

describe('class matchers', () => {
  function classesFor(bodyHtml: string, groupId: string): string[] {
    const manifest = manifestFor('.x { color: var(--fg); }', bodyHtml);
    return manifest.groups.find((group) => group.id === groupId)?.classes ?? [];
  }

  it('matches whole class-name segments rather than substrings', () => {
    const bodyHtml = `
      <div class="platform"></div>
      <div class="icon-octagon"></div>
      <div class="form-field"></div>
      <div class="cta-primary"></div>
    `;

    expect(classesFor(bodyHtml, 'inputs')).toEqual(['form-field']);
    expect(classesFor(bodyHtml, 'buttons')).toEqual(['cta-primary']);
  });

  // Segment matching must not cost the families a group already owned. `status`
  // pluralizes to `statuses`, not `statuss`, and class names are written in
  // kebab, snake and camel case.
  it.each([
    ['singular', 'status'],
    ['irregular plural', 'statuses-list'],
    ['kebab case', 'icon-status'],
    ['snake case', 'icon_status'],
    ['camel case', 'statusBadge'],
    ['camel case with a leading word', 'iconStatus'],
    ['acronym boundary', 'HTMLStatus'],
  ])('claims a %s status class for the badges group', (_label, className) => {
    expect(classesFor(`<span class="${className}"></span>`, 'badges')).toEqual([className]);
  });

  it.each([
    ['platform', 'inputs'],
    ['transformation', 'inputs'],
    ['icon-octagon', 'buttons'],
    ['statusbar', 'badges'],
  ])('keeps %s out of the %s group', (className, groupId) => {
    expect(classesFor(`<div class="${className}"></div>`, groupId)).toEqual([]);
  });

  it('still claims a regular plural', () => {
    expect(classesFor('<div class="buttons"></div>', 'buttons')).toEqual(['buttons']);
  });
});
