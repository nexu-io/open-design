import { describe, expect, it } from 'vitest';
import {
  isPreviewRuntimeState,
  PREVIEW_RUNTIME_STATE_LIMITS,
  PREVIEW_RUNTIME_STATE_VERSION,
  type PreviewRuntimeState,
} from '../../src/runtime/preview-runtime-state';

function fixture(): PreviewRuntimeState {
  return {
    version: PREVIEW_RUNTIME_STATE_VERSION,
    hash: '#detail',
    bodyHtml: '<main id="detail">Ready</main>',
    roots: [],
    htmlAttrs: { class: 'dark' },
    bodyAttrs: {},
    entries: [{
      path: [0],
      tag: 'main',
      id: 'detail',
      attrs: { class: 'is-on' },
      scrollTop: 32,
    }],
  };
}

describe('preview runtime state contract', () => {
  it('accepts a capture payload shared by the daemon and web restore host', () => {
    expect(isPreviewRuntimeState(fixture())).toBe(true);
  });

  it('rejects payloads beyond the shared body, entry, and path bounds', () => {
    expect(isPreviewRuntimeState({
      ...fixture(),
      bodyHtml: 'x'.repeat(PREVIEW_RUNTIME_STATE_LIMITS.maxBodyHtmlLength + 1),
    })).toBe(false);
    expect(isPreviewRuntimeState({
      ...fixture(),
      entries: Array.from(
        { length: PREVIEW_RUNTIME_STATE_LIMITS.maxElements + 1 },
        () => fixture().entries[0],
      ),
    })).toBe(false);
    expect(isPreviewRuntimeState({
      ...fixture(),
      entries: [{
        ...fixture().entries[0],
        path: Array(PREVIEW_RUNTIME_STATE_LIMITS.maxPathLength + 1).fill(0),
      }],
    })).toBe(false);
  });
});
