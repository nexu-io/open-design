import { describe, expect, it } from 'vitest';

import {
  hasUrlModeBridge,
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

  it('falls back to srcDoc when comment mode is active without an artifact-owned bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true })).toBe(false);
  });

  it('keeps URL-load when comment mode is active and the artifact owns the bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true, urlModeBridge: true })).toBe(true);
  });

  it('falls back to srcDoc when direct edit mode is active without an artifact-owned bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, editMode: true })).toBe(false);
  });

  it('keeps URL-load when direct edit mode is active and the artifact owns the bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, editMode: true, urlModeBridge: true })).toBe(true);
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
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true, urlModeBridge: true, inspectMode: true })).toBe(false);
  });
});

describe('hasUrlModeBridge', () => {
  it('detects an artifact-owned direct-edit bridge script', () => {
    expect(hasUrlModeBridge('<script src="od-direct-edit.js"></script>')).toBe(true);
    expect(hasUrlModeBridge('<script defer src="./assets/od-direct-edit.js?v=1"></script>')).toBe(true);
  });

  it('ignores comments, text nodes, and inline script bodies that only mention the bridge name', () => {
    expect(hasUrlModeBridge('<!-- TODO: ship od-direct-edit.js -->')).toBe(false);
    expect(hasUrlModeBridge('<p>Use od-direct-edit.js for editing</p>')).toBe(false);
    expect(hasUrlModeBridge('<script>console.log("od-direct-edit.js")</script>')).toBe(false);
  });

  it('ignores unrelated script URLs', () => {
    expect(hasUrlModeBridge('<script src="direct-edit.js"></script>')).toBe(false);
    expect(hasUrlModeBridge(null)).toBe(false);
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
