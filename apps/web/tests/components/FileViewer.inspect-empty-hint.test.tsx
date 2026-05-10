// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

// Regression coverage for nexu-io/open-design#890. When the agent emits
// an HTML artifact with no `data-od-id` / `data-screen-label`
// annotations (a freeform PRD → HTML pass without going through a
// skill, for example), the existing inspect-empty-hint banner lied:
// it said "Click any element with `data-od-id` to tune its style"
// even though no element on the page carried that attribute. The user
// would click, the bridge's click handler would walk up to <html>,
// find nothing tagged, and silently bail — no UI feedback. This test
// pins the new dispatch:
//
//   - liveCommentTargets.size === 0 → empty-state copy explaining
//     what's missing and how to fix it.
//   - liveCommentTargets.size > 0   → existing instruction copy.
//
// And mirrors the same affordance into Picker mode so both inspect
// surfaces give the user the same calibration signal.

function htmlFile(name = 'mock.html'): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Mock',
      entry: name,
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function postTargetsFromIframe(targets: Array<{ elementId: string }>): void {
  // FileViewer's message handler keys off `ev.source ===
  // iframeRef.current?.contentWindow` to defend against cross-frame
  // chatter on the host. Find the host's iframe in the rendered DOM
  // and dispatch a real MessageEvent with `source` set to its
  // contentWindow so the handler accepts the payload.
  const iframe = document.querySelector('iframe');
  if (!iframe) throw new Error('iframe not in DOM yet');
  const event = new MessageEvent('message', {
    data: {
      type: 'od:comment-targets',
      targets: targets.map((t) => ({
        elementId: t.elementId,
        selector: `[data-od-id="${t.elementId}"]`,
        label: 'div',
        text: '',
        position: { x: 0, y: 0, width: 100, height: 50 },
        htmlHint: '',
      })),
    },
    source: iframe.contentWindow,
  });
  window.dispatchEvent(event);
}

describe('FileViewer Inspect/Picker empty-annotation hint (#890)', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the empty-state copy in Inspect mode when the iframe reports zero annotated targets', async () => {
    render(
      <FileViewer
        projectId="project-1"
        file={htmlFile()}
        liveHtml="<html><body><h1>Plain PRD with no data-od-id</h1></body></html>"
      />,
    );

    // Activate Inspect — the toolbar button has a stable test id from
    // the surrounding viewer chrome.
    fireEvent.click(screen.getByTestId('inspect-mode-toggle'));

    // The bridge boot sequence ends with a `od:comment-targets` post
    // carrying an empty array for unannotated artifacts (pinned in
    // tests/runtime/srcdoc-bridge-empty-targets.test.ts). Simulate
    // that broadcast and assert the host renders the empty-state
    // copy instead of the instructive default.
    await act(async () => {
      postTargetsFromIframe([]);
    });

    expect(screen.queryByTestId('inspect-empty-hint-no-targets')).toBeTruthy();
    expect(screen.queryByTestId('inspect-empty-hint')).toBeNull();
    // The message must mention what's missing so the user knows what
    // to ask the agent for. We assert on the attribute name verbatim
    // — it's the exact token the agent has to add to the artifact.
    expect(screen.getByTestId('inspect-empty-hint-no-targets').textContent ?? '')
      .toMatch(/data-od-id/);
  });

  it('switches back to the instructive copy once the iframe reports at least one annotated target', async () => {
    render(
      <FileViewer
        projectId="project-1"
        file={htmlFile()}
        liveHtml="<html><body><main data-od-id='hero'>Hero</main></body></html>"
      />,
    );

    fireEvent.click(screen.getByTestId('inspect-mode-toggle'));

    await act(async () => {
      postTargetsFromIframe([{ elementId: 'hero' }]);
    });

    // Existing copy survives — pinning that the new dispatch doesn't
    // accidentally drop the long-standing affordance for users whose
    // artifacts already ship annotations.
    expect(screen.getByTestId('inspect-empty-hint')).toBeTruthy();
    expect(screen.queryByTestId('inspect-empty-hint-no-targets')).toBeNull();
  });

  it('shows the empty-state copy in Picker mode when the iframe reports zero annotated targets', async () => {
    // Picker mode (Comments → Picker tool) has the same failure
    // surface as Inspect: clicking an unannotated element no-ops.
    // This test mirrors the Inspect coverage above.
    render(
      <FileViewer
        projectId="project-1"
        file={htmlFile()}
        liveHtml="<html><body><h1>No annotations</h1></body></html>"
      />,
    );

    // Tweaks mode boots with the Picker tool already selected
    // (`boardTool` defaults to `'inspect'`), so the empty-state hint
    // path fires the moment we enter Tweaks — no inner button click
    // needed. The inner `comment-mode-toggle` only renders alongside
    // its Pods sibling once Tweaks is on.
    fireEvent.click(screen.getByTestId('board-mode-toggle'));

    await act(async () => {
      postTargetsFromIframe([]);
    });

    // The same testid surfaces the empty-state copy regardless of
    // which inspect surface is active — keeps the i18n-free copy
    // consolidated and makes future migration to translated strings
    // a single edit instead of two.
    expect(screen.queryByTestId('inspect-empty-hint-no-targets')).toBeTruthy();
    // Copy is mode-aware so the action is concrete: in Picker mode
    // the user is leaving comments, not tuning style.
    expect(screen.getByTestId('inspect-empty-hint-no-targets').textContent ?? '')
      .toMatch(/comment on/i);
  });
});
