// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PreviewModal, type PreviewView } from '../../src/components/PreviewModal';

/**
 * Preview-runtime convergence for the preview modal.
 *
 * Invariant: the document the user is actually looking at must be the one
 * real URL the daemon already serves for it. `buildSrcdoc` rebuilds a second
 * document out of the source text — it drops the origin's directory
 * semantics (relative script/style/font/dynamic-import URLs stop resolving)
 * and every bit of live document state. srcdoc stays legal only for
 * off-screen rendering and thumbnails, and as the compatibility fallback for
 * callers that own no URL for their HTML.
 *
 * Both transports are asserted through the same helper so a green reading
 * here always means "the assertion can tell the two apart", never "the
 * assertion never saw the other shape".
 */

const HTML = '<!doctype html><html><head><title>Doc</title></head><body><p>hi</p></body></html>';
const REAL_URL = '/api/skills/simple-deck/example?workspaceId=w1&workspaceMemberId=m1';

function renderStageFrame(view: PreviewView): HTMLIFrameElement {
  const { container } = render(
    <PreviewModal
      title="Preview"
      views={[view]}
      exportTitleFor={() => 'preview'}
      onClose={() => {}}
    />,
  );
  const frame = container.querySelector('iframe');
  if (!frame) throw new Error('preview stage iframe did not render');
  return frame as HTMLIFrameElement;
}

describe('PreviewModal preview transport', () => {
  afterEach(() => {
    cleanup();
  });

  // Control input: the same assertions applied to the shape that must stay
  // on srcdoc. Green before and after the convergence.
  it('keeps callers that own no document URL on the srcdoc fallback', () => {
    const frame = renderStageFrame({ id: 'preview', label: 'Preview', html: HTML });

    expect(frame.hasAttribute('srcdoc')).toBe(true);
    expect(frame.getAttribute('src')).toBeNull();
  });

  it('loads the document from its own real URL when the caller owns one', () => {
    const frame = renderStageFrame({
      id: 'preview',
      label: 'Preview',
      html: HTML,
      url: REAL_URL,
    });

    const src = frame.getAttribute('src') ?? '';
    expect(src.startsWith('/api/skills/simple-deck/example?')).toBe(true);
    // A second, rebuilt document must not exist alongside the real one.
    expect(frame.hasAttribute('srcdoc')).toBe(false);
  });

  it('keeps the workspace navigation scope on the document URL', () => {
    const frame = renderStageFrame({
      id: 'preview',
      label: 'Preview',
      html: HTML,
      url: REAL_URL,
    });

    const src = new URL(frame.getAttribute('src') ?? '', 'http://od.local');
    expect(src.searchParams.get('workspaceId')).toBe('w1');
    expect(src.searchParams.get('workspaceMemberId')).toBe('m1');
  });

  // Exact parity with what buildSrcdoc injects for this modal today: the
  // opaque-origin storage shim, the always-on redirect guard, and the
  // snapshot bridge the "Export as image" fallback talks to. Nothing more —
  // a converged transport must not quietly add or drop runtime behavior.
  it('asks the daemon for the guards and bridges srcdoc used to inject', () => {
    const frame = renderStageFrame({
      id: 'preview',
      label: 'Preview',
      html: HTML,
      url: REAL_URL,
    });

    const src = new URL(frame.getAttribute('src') ?? '', 'http://od.local');
    expect(src.searchParams.getAll('odPreviewBridge').sort()).toEqual([
      'redirect',
      'sandbox',
      'snapshot',
    ]);
  });

  it('does not append a second bridge query to an already-bridged URL', () => {
    const frame = renderStageFrame({
      id: 'preview',
      label: 'Preview',
      html: HTML,
      url: `${REAL_URL}&odPreviewBridge=snapshot`,
    });

    const src = new URL(frame.getAttribute('src') ?? '', 'http://od.local');
    expect(src.searchParams.getAll('odPreviewBridge')).toEqual(['snapshot']);
  });

  it('stamps the transport each frame actually used', () => {
    const urlFrame = renderStageFrame({
      id: 'preview',
      label: 'Preview',
      html: HTML,
      url: REAL_URL,
    });
    expect(urlFrame.getAttribute('data-od-render-mode')).toBe('url-load');

    cleanup();

    const srcdocFrame = renderStageFrame({ id: 'preview', label: 'Preview', html: HTML });
    expect(srcdocFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
  });

  it('does not weaken the frame sandbox to reach the real URL', () => {
    const frame = renderStageFrame({
      id: 'preview',
      label: 'Preview',
      html: HTML,
      url: REAL_URL,
    });

    expect(frame.getAttribute('sandbox')).toBe(
      'allow-scripts allow-popups allow-popups-to-escape-sandbox',
    );
  });

  // Deck paging is a runtime capability negotiated with a loaded Preview
  // Runtime, and the catalogue routes do not serve one yet. Until they do,
  // a deck view keeps the srcdoc deck bridge rather than silently losing
  // keyboard/stage handling. Named here so the exception stays visible.
  it('keeps deck views on srcdoc until the catalogue serves a preview runtime', () => {
    const frame = renderStageFrame({
      id: 'preview',
      label: 'Preview',
      html: HTML,
      url: REAL_URL,
      deck: true,
    });

    expect(frame.getAttribute('data-od-render-mode')).toBe('srcdoc');
    expect(frame.hasAttribute('srcdoc')).toBe(true);
    expect(frame.getAttribute('src')).toBeNull();
  });
});
