import { describe, expect, it } from 'vitest';

import {
  PREVIEW_BUILD_FOCUS_BRIDGE_MARKER,
  PREVIEW_BUILD_FOCUS_MAX_ANCHOR_CHARS,
  PREVIEW_BUILD_FOCUS_MAX_LABEL_CHARS,
  PREVIEW_BUILD_FOCUS_MAX_SECTIONS,
  PREVIEW_BUILD_FOCUS_READY_TYPE,
  PREVIEW_BUILD_FOCUS_REQUEST_TYPE,
  PREVIEW_BUILD_FOCUS_RESULT_TYPE,
  PREVIEW_BUILD_FOCUS_SECTIONS_TYPE,
  buildPreviewBuildFocusBridge,
  isPreviewBuildFocusReady,
  parsePreviewBuildFocusResult,
  parsePreviewBuildFocusSections,
  previewBuildFocusRequest,
} from '../src/runtime/preview-build-focus';

function result(overrides: Record<string, unknown> = {}) {
  return {
    type: PREVIEW_BUILD_FOCUS_RESULT_TYPE,
    version: 1,
    requestId: 'req-1',
    found: true,
    x: 12,
    y: 340,
    width: 220,
    height: 48,
    viewportWidth: 900,
    viewportHeight: 700,
    ...overrides,
  };
}

describe('parsePreviewBuildFocusResult', () => {
  it('accepts a well-formed result and rebuilds it', () => {
    const payload = result();
    const parsed = parsePreviewBuildFocusResult(payload);
    expect(parsed).toEqual(payload);
    // Never the caller's object: the payload comes from generated page code.
    expect(parsed).not.toBe(payload);
  });

  it('rejects a foreign or mis-versioned message', () => {
    expect(parsePreviewBuildFocusResult(null)).toBeNull();
    expect(parsePreviewBuildFocusResult('od:preview-build-focus-rect')).toBeNull();
    expect(parsePreviewBuildFocusResult(result({ type: 'od:something-else' }))).toBeNull();
    expect(parsePreviewBuildFocusResult(result({ version: 2 }))).toBeNull();
  });

  it('rejects a result that carries no usable geometry', () => {
    expect(parsePreviewBuildFocusResult(result({ x: Number.NaN }))).toBeNull();
    expect(parsePreviewBuildFocusResult(result({ height: '48' }))).toBeNull();
    expect(parsePreviewBuildFocusResult(result({ requestId: '' }))).toBeNull();
    expect(parsePreviewBuildFocusResult(result({ found: 'yes' }))).toBeNull();
  });

  it('clamps a coordinate no layout could have produced', () => {
    const parsed = parsePreviewBuildFocusResult(result({ y: 10_000_000 }));
    expect(parsed?.y).toBe(20_000);
  });

  it('never reports a negative box', () => {
    const parsed = parsePreviewBuildFocusResult(result({ width: -40 }));
    expect(parsed?.width).toBe(0);
  });
});

describe('previewBuildFocusRequest', () => {
  it('caps an anchor and normalizes an empty one to null', () => {
    const long = 'x'.repeat(PREVIEW_BUILD_FOCUS_MAX_ANCHOR_CHARS + 40);
    expect(previewBuildFocusRequest('r', long).anchor).toHaveLength(
      PREVIEW_BUILD_FOCUS_MAX_ANCHOR_CHARS,
    );
    expect(previewBuildFocusRequest('r', '   ').anchor).toBeNull();
    expect(previewBuildFocusRequest('r', null).anchor).toBeNull();
    expect(previewBuildFocusRequest('r', ' hello ').anchor).toBe('hello');
  });
});

describe('isPreviewBuildFocusReady', () => {
  it('recognizes only its own ready notice', () => {
    expect(isPreviewBuildFocusReady({ type: PREVIEW_BUILD_FOCUS_READY_TYPE, version: 1 })).toBe(true);
    expect(isPreviewBuildFocusReady({ type: PREVIEW_BUILD_FOCUS_READY_TYPE, version: 9 })).toBe(false);
    expect(isPreviewBuildFocusReady({ type: 'od:other', version: 1 })).toBe(false);
    expect(isPreviewBuildFocusReady(undefined)).toBe(false);
  });
});

describe('buildPreviewBuildFocusBridge', () => {
  it('carries the marker and both message types', () => {
    const script = buildPreviewBuildFocusBridge();
    expect(script).toContain(PREVIEW_BUILD_FOCUS_BRIDGE_MARKER);
    expect(script).toContain(PREVIEW_BUILD_FOCUS_REQUEST_TYPE);
    expect(script).toContain(PREVIEW_BUILD_FOCUS_RESULT_TYPE);
    expect(script).toContain(PREVIEW_BUILD_FOCUS_READY_TYPE);
  });

  it('guards against running twice in one document', () => {
    expect(buildPreviewBuildFocusBridge()).toContain('__odPreviewBuildFocus');
  });

  // The anchor is model output. Handing it to querySelector would throw on a
  // stray bracket and, worse, could match something the agent never wrote.
  it('never turns the anchor into a selector', () => {
    const script = buildPreviewBuildFocusBridge();
    expect(script).not.toContain('querySelector(anchor');
    expect(script).toContain('createTreeWalker');
  });
});

describe('parsePreviewBuildFocusSections', () => {
  function sections(list: unknown) {
    return { type: PREVIEW_BUILD_FOCUS_SECTIONS_TYPE, version: 1, sections: list };
  }

  it('rebuilds a well-formed broadcast', () => {
    const parsed = parsePreviewBuildFocusSections(
      sections([{ key: '0|header|Studio', label: 'Studio' }]),
    );
    expect(parsed).toEqual([{ key: '0|header|Studio', label: 'Studio' }]);
  });

  it('rejects a foreign or mis-versioned broadcast', () => {
    expect(parsePreviewBuildFocusSections(null)).toBeNull();
    expect(parsePreviewBuildFocusSections({ ...sections([]), version: 2 })).toBeNull();
    expect(parsePreviewBuildFocusSections({ ...sections([]), type: 'od:other' })).toBeNull();
    expect(parsePreviewBuildFocusSections(sections('not-a-list'))).toBeNull();
  });

  // Labels are page content: generated, untrusted text that a hostile or
  // merely verbose page can make as long as it likes.
  it('caps the label, the count, and drops malformed entries', () => {
    const long = 'x'.repeat(200);
    const many = Array.from({ length: PREVIEW_BUILD_FOCUS_MAX_SECTIONS + 5 }, (_, i) => ({
      key: `${i}|section|part`,
      label: long,
    }));
    const parsed = parsePreviewBuildFocusSections(sections(many));
    expect(parsed).toHaveLength(PREVIEW_BUILD_FOCUS_MAX_SECTIONS);
    expect(parsed?.[0]?.label).toHaveLength(PREVIEW_BUILD_FOCUS_MAX_LABEL_CHARS);

    expect(
      parsePreviewBuildFocusSections(
        sections([{ key: '', label: 'a' }, { key: '1|section|b' }, null, { key: '2|x|c', label: 'c' }]),
      ),
    ).toEqual([{ key: '2|x|c', label: 'c' }]);
  });
});

describe('previewBuildFocusRequest with a section', () => {
  it('carries the section key alongside the anchor, both normalized', () => {
    expect(previewBuildFocusRequest('req-2', '  hello  ', '  0|header|Studio  ')).toMatchObject({
      anchor: 'hello',
      section: '0|header|Studio',
    });
    expect(previewBuildFocusRequest('req-3', null).section).toBeNull();
    expect(previewBuildFocusRequest('req-4', null, '   ').section).toBeNull();
  });
});

describe('the bridge script', () => {
  it('broadcasts the page parts and can locate one by key', () => {
    const bridge = buildPreviewBuildFocusBridge();
    expect(bridge).toContain(PREVIEW_BUILD_FOCUS_SECTIONS_TYPE);
    expect(bridge).toContain('function sectionRoots()');
    expect(bridge).toContain('function findSection(');
    // A section key is host-supplied data too; it is compared, never queried.
    expect(bridge).not.toContain('querySelector(key');
  });
});
