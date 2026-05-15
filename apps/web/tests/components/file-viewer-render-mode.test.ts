import { describe, expect, it } from 'vitest';

import {
  htmlNeedsSandboxShim,
  parseForceInline,
  shouldUrlLoadHtmlPreview,
} from '../../src/components/file-viewer-render-mode';

describe('shouldUrlLoadHtmlPreview', () => {
  const base = { mode: 'preview' as const, isDeck: false, commentMode: false, forceInline: false };

  it('URL-loads a plain HTML preview by default', () => {
    expect(shouldUrlLoadHtmlPreview(base)).toBe(true);
  });

  it('falls back to srcDoc when the file is a deck (deck bridge required)', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, isDeck: true })).toBe(false);
  });

  it('falls back to srcDoc when comment mode is active (comment bridge required)', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true })).toBe(false);
  });

  it('falls back to srcDoc when inspect mode is active (selection bridge required)', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, inspectMode: true })).toBe(false);
  });

  it('falls back to srcDoc when draw mode is active (snapshot bridge required)', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, drawMode: true })).toBe(false);
  });

  it('falls back to srcDoc when the user opts in via forceInline', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, forceInline: true })).toBe(false);
  });

  it('does not URL-load while the source-code tab is active', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, mode: 'source' })).toBe(false);
  });

  it('treats any disqualifying flag as sufficient on its own', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, isDeck: true, commentMode: true })).toBe(false);
    expect(shouldUrlLoadHtmlPreview({ ...base, isDeck: true, forceInline: true })).toBe(false);
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true, forceInline: true })).toBe(false);
  });
});

describe('parseForceInline', () => {
  it('returns false when the parameter is absent', () => {
    expect(parseForceInline('')).toBe(false);
    expect(parseForceInline('?other=1')).toBe(false);
    expect(parseForceInline(null)).toBe(false);
    expect(parseForceInline(undefined)).toBe(false);
  });

  it('returns true for the documented opt-in values', () => {
    expect(parseForceInline('?forceInline=1')).toBe(true);
    expect(parseForceInline('?forceInline=true')).toBe(true);
    expect(parseForceInline('?forceInline=TRUE')).toBe(true);
    expect(parseForceInline('?forceInline=yes')).toBe(true);
    expect(parseForceInline('?forceInline=on')).toBe(true);
  });

  it('returns false for explicit opt-out values and unrelated strings', () => {
    expect(parseForceInline('?forceInline=0')).toBe(false);
    expect(parseForceInline('?forceInline=false')).toBe(false);
    expect(parseForceInline('?forceInline=no')).toBe(false);
    expect(parseForceInline('?forceInline=off')).toBe(false);
    expect(parseForceInline('?forceInline=banana')).toBe(false);
  });

  it('treats an empty value as absent (defensive: ?forceInline= shows up as "")', () => {
    expect(parseForceInline('?forceInline=')).toBe(false);
  });

  it('accepts a pre-built URLSearchParams', () => {
    const params = new URLSearchParams('forceInline=1&other=foo');
    expect(parseForceInline(params)).toBe(true);
  });

  it('survives surrounding whitespace in the value', () => {
    const params = new URLSearchParams();
    params.set('forceInline', '  1  ');
    expect(parseForceInline(params)).toBe(true);
  });
});

describe('htmlNeedsSandboxShim', () => {
  it('returns false for plain static HTML', () => {
    expect(htmlNeedsSandboxShim('<!doctype html><h1>hello</h1>')).toBe(false);
  });

  it('detects <script type="text/babel"> (Babel-standalone React prototypes)', () => {
    // Real agent-emitted shape with src= and double-quoted attributes.
    expect(
      htmlNeedsSandboxShim(
        '<script type="text/babel" src="components/Icon.jsx"></script>',
      ),
    ).toBe(true);
    // Single quotes.
    expect(htmlNeedsSandboxShim("<script type='text/babel'>const a = 1;</script>")).toBe(true);
    // Extra attributes before type=.
    expect(
      htmlNeedsSandboxShim('<script defer type="text/babel" src="app.jsx"></script>'),
    ).toBe(true);
    // Whitespace around the equals sign.
    expect(htmlNeedsSandboxShim('<script type = "text/babel"></script>')).toBe(true);
    // Case-insensitive type value.
    expect(htmlNeedsSandboxShim('<script type="TEXT/BABEL"></script>')).toBe(true);
  });

  it('detects unquoted <script type=text/babel> (HTML5 permits unquoted attrs)', () => {
    // Bare unquoted type value, no other attributes.
    expect(htmlNeedsSandboxShim('<script type=text/babel></script>')).toBe(true);
    // Unquoted with an unquoted src= following — terminates on whitespace.
    expect(
      htmlNeedsSandboxShim('<script type=text/babel src=app.jsx></script>'),
    ).toBe(true);
    // Mixed: unquoted type=, then a quoted src=.
    expect(
      htmlNeedsSandboxShim('<script type=text/babel src="components/Icon.jsx"></script>'),
    ).toBe(true);
    // Trailing `\b` rejects word continuations: `type=text/babelish` does
    // not match because `l`→`i` is a word-internal transition. Hyphenated
    // variants like `type=text/babel-other` still match per the helper
    // docstring (`l`→`-` is a word boundary) — that's the documented safe
    // false-positive direction, so it is intentionally not asserted here.
    expect(htmlNeedsSandboxShim('<script type=text/babelish></script>')).toBe(false);
  });

  it('does not match plain <script> tags or unrelated MIME types', () => {
    expect(htmlNeedsSandboxShim('<script src="app.js"></script>')).toBe(false);
    expect(htmlNeedsSandboxShim('<script type="module" src="app.js"></script>')).toBe(false);
    expect(htmlNeedsSandboxShim('<script type="application/json">{}</script>')).toBe(false);
    // Substring-only matches must not trigger (e.g. text/babel-like custom type).
    expect(htmlNeedsSandboxShim('<script type="text/babelish"></script>')).toBe(false);
  });

  it('detects direct localStorage / sessionStorage references in the source', () => {
    expect(htmlNeedsSandboxShim('<script>localStorage.getItem("k")</script>')).toBe(true);
    expect(htmlNeedsSandboxShim('<script>sessionStorage.setItem("k","v")</script>')).toBe(true);
    // Inside an external script tag's surrounding markup still trips the
    // scan when the literal name appears in the document the iframe loads.
    expect(htmlNeedsSandboxShim('// uses localStorage to persist theme')).toBe(true);
  });

  it('does not match incidental substrings that are not the storage globals', () => {
    expect(htmlNeedsSandboxShim('Storage')).toBe(false);
    expect(htmlNeedsSandboxShim('mylocalStorageWrapper')).toBe(false);
    expect(htmlNeedsSandboxShim('SuperLocalStorage')).toBe(false);
  });
});
