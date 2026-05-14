import { describe, expect, it } from 'vitest';

import { hasTweaksTemplate, parseForceInline, shouldUrlLoadHtmlPreview } from '../../src/components/file-viewer-render-mode';

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

  it('falls back to srcDoc when the artifact ships the class based tweaks template', () => {
    // Without this, a plain `.tw-panel` artifact would URL load on first
    // open, skip the tweaks bridge entirely, and leave the toolbar toggle
    // disabled (no `od:tweaks-available` ever fires).
    expect(shouldUrlLoadHtmlPreview({ ...base, tweaksBridge: true })).toBe(false);
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
    expect(shouldUrlLoadHtmlPreview({ ...base, tweaksBridge: true, forceInline: true })).toBe(false);
  });
});

describe('hasTweaksTemplate', () => {
  it('matches a plain `.tw-panel` artifact', () => {
    const source = '<!doctype html><html><body><aside class="tw-panel"></aside></body></html>';
    expect(hasTweaksTemplate(source)).toBe(true);
  });

  it('matches the `.tw-hidden` toggle class even without an explicit `.tw-panel`', () => {
    // Defensive: the template ships both selectors and either one signals a
    // tweaks-template artifact that needs the bridge.
    const source = '<style>.tw-hidden { display: none; }</style>';
    expect(hasTweaksTemplate(source)).toBe(true);
  });

  it('does not match unrelated identifiers that merely contain `tw`', () => {
    expect(hasTweaksTemplate('<div class="container">tweet</div>')).toBe(false);
    expect(hasTweaksTemplate('twk-panel, btw-panel, mtw-hidden')).toBe(false);
  });

  it('returns false for empty / null / undefined input', () => {
    expect(hasTweaksTemplate('')).toBe(false);
    expect(hasTweaksTemplate(null)).toBe(false);
    expect(hasTweaksTemplate(undefined)).toBe(false);
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
