// Unit coverage for `countNewArtifacts`. Pins the v2
// `run_finished.artifact_count` invariant: incremental count of
// distinct artifact paths (HTML + image/video/audio) the run produced
// or modified, deduped by
// path, with Read ops never counted and FAILED ops never counted
// (mrcfps review on PR #2590 — earlier version counted every
// matching `tool_use` regardless of whether the matching
// `tool_result` landed `isError: true`, so a permission-denied
// `Write index.html` still bumped `artifact_count` to 1 and
// corrupted the same funnel this helper is trying to repair).
//
// `server.ts` previously emitted `artifact_count: 0` literally, which
// suppressed every dashboard tile that breaks "generation success" by
// whether an artifact landed. These tests keep the new helper honest
// for the shapes the daemon actually sees on the wire (claude-stream,
// codex, ACP/MCP proxies).

import { describe, expect, it } from 'vitest';

import {
  countDesignSystemPreviewModules,
  countNewArtifacts,
  deriveActivationMilestones,
  didRunCreateDesignSystemFile,
  runAskedUserQuestion,
} from '../../src/runtimes/run-artifacts.js';

let nextId = 0;
function freshId(prefix = 'tool'): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

// Helper: emit a tool_use+tool_result pair. `isError` defaults to
// false so the common "successful Write on .html" case stays one
// line at the call site.
function pair(
  name: string,
  filePath: string,
  isError = false,
  id = freshId(),
) {
  return [
    {
      event: 'agent',
      data: {
        type: 'tool_use',
        id,
        name,
        input: { file_path: filePath },
      },
    },
    {
      event: 'agent',
      data: {
        type: 'tool_result',
        toolUseId: id,
        isError,
      },
    },
  ];
}

// Helper: emit a tool_use with no matching tool_result. Used to pin
// the "tool still in flight" / "adapter swallowed result" behavior.
function unfinished(name: string, filePath: string, id = freshId()) {
  return [
    {
      event: 'agent',
      data: {
        type: 'tool_use',
        id,
        name,
        input: { file_path: filePath },
      },
    },
  ];
}

describe('countNewArtifacts', () => {
  it('returns 0 when the run produced no events', () => {
    expect(countNewArtifacts([])).toBe(0);
  });

  it('returns 0 when no tool_use targets an artifact file', () => {
    // .md/.css/.ts are text/code, not artifact outputs; Read never counts.
    expect(
      countNewArtifacts([
        ...pair('Write', '/proj/notes.md'),
        ...pair('Edit', '/proj/styles.css'),
        ...pair('Write', '/proj/app.ts'),
        ...pair('Read', '/proj/index.html'),
      ]),
    ).toBe(0);
  });

  it('counts generated image / video / audio / svg artifacts (not just HTML)', () => {
    // Media-kind projects produce non-HTML outputs; the old HTML-only
    // counter reported a false zero for these. Each distinct media file
    // is one artifact. SVG is a renderable artifact too (kindFor buckets
    // it as `sketch`), so a run that writes only `logo.svg` must count.
    expect(
      countNewArtifacts([
        ...pair('Write', '/proj/hero.png'),
        ...pair('Write', '/proj/promo.mp4'),
        ...pair('Write', '/proj/jingle.mp3'),
        ...pair('Write', '/proj/cover.webp'),
        ...pair('Write', '/proj/logo.svg'),
      ]),
    ).toBe(5);
  });

  it('counts a single successful Write on a .html path', () => {
    expect(
      countNewArtifacts(pair('Write', '/proj/index.html')),
    ).toBe(1);
  });

  it('does NOT count a tool_use whose tool_result reports isError=true', () => {
    // Permission denied, path outside cwd, parent missing — all bounce
    // the same way through the tool_result.isError channel and must
    // not increment artifact_count.
    expect(
      countNewArtifacts(pair('Write', '/proj/index.html', true)),
    ).toBe(0);
  });

  it('does NOT count a tool_use that has no matching tool_result yet', () => {
    // Run was sampled while a Write was still in flight; the
    // safe-default is to undercount rather than promise an
    // artifact we can't confirm landed.
    expect(
      countNewArtifacts(unfinished('Write', '/proj/index.html')),
    ).toBe(0);
  });

  it('dedupes multiple successful Write/Edit ops on the same path', () => {
    expect(
      countNewArtifacts([
        ...pair('Write', '/proj/index.html'),
        ...pair('Edit', '/proj/index.html'),
        ...pair('MultiEdit', '/proj/index.html'),
      ]),
    ).toBe(1);
  });

  it('keeps the path counted when a later edit on the same path fails', () => {
    // First Write succeeded — the artifact exists. A subsequent Edit
    // that errors doesn't take that fact away; the file is still on
    // disk. So this still reports 1.
    expect(
      countNewArtifacts([
        ...pair('Write', '/proj/index.html'),
        ...pair('Edit', '/proj/index.html', true),
      ]),
    ).toBe(1);
  });

  it('counts distinct .html paths separately', () => {
    expect(
      countNewArtifacts([
        ...pair('Write', '/proj/index.html'),
        ...pair('Write', '/proj/about.html'),
        ...pair('Write', '/proj/contact.html'),
      ]),
    ).toBe(3);
  });

  it('handles the Codex `create_file` / `str_replace_edit` aliases', () => {
    expect(
      countNewArtifacts([
        ...pair('create_file', '/proj/a.html'),
        ...pair('str_replace_edit', '/proj/b.html'),
      ]),
    ).toBe(2);
  });

  it('accepts both `file_path` and `path` input shapes', () => {
    const id = freshId();
    expect(
      countNewArtifacts([
        {
          event: 'agent',
          data: {
            type: 'tool_use',
            id,
            name: 'Write',
            input: { path: '/proj/page.html' },
          },
        },
        {
          event: 'agent',
          data: { type: 'tool_result', toolUseId: id, isError: false },
        },
      ]),
    ).toBe(1);
  });

  it('treats .HTML / .Html case-insensitively', () => {
    expect(
      countNewArtifacts([
        ...pair('Write', '/proj/Page.HTML'),
        ...pair('Write', '/proj/Other.Html'),
      ]),
    ).toBe(2);
  });

  it('ignores non-agent events and malformed payloads', () => {
    expect(
      countNewArtifacts([
        { event: 'start', data: { runId: 'r1' } },
        { event: 'stderr', data: { chunk: 'log' } },
        { event: 'agent', data: null },
        { event: 'agent', data: { type: 'text_delta', text: 'hi' } },
        ...pair('Write', '/proj/index.html'),
      ]),
    ).toBe(1);
  });

  it('ignores Read / Grep / Bash even when their input names a .html file', () => {
    expect(
      countNewArtifacts([
        ...pair('Read', '/proj/index.html'),
        ...pair('Grep', '/proj/index.html'),
        ...pair('Bash', '/proj/index.html'),
      ]),
    ).toBe(0);
  });
});

describe('didRunCreateDesignSystemFile', () => {
  it('is true when the run wrote a DESIGN.md', () => {
    expect(
      didRunCreateDesignSystemFile([
        ...pair('Write', '/proj/DESIGN.md'),
      ]),
    ).toBe(true);
  });

  it('matches DESIGN.md case-insensitively', () => {
    expect(
      didRunCreateDesignSystemFile([
        ...pair('Edit', '/proj/design.md'),
      ]),
    ).toBe(true);
  });

  it('is false when the matching tool_result reported isError', () => {
    expect(
      didRunCreateDesignSystemFile([
        ...pair('Write', '/proj/DESIGN.md', true),
      ]),
    ).toBe(false);
  });

  it('is false when no DESIGN.md was touched', () => {
    expect(
      didRunCreateDesignSystemFile([
        ...pair('Write', '/proj/index.html'),
        ...pair('Read', '/proj/DESIGN.md'),
      ]),
    ).toBe(false);
  });
});

describe('countDesignSystemPreviewModules', () => {
  it('counts distinct preview/*.html paths the run wrote', () => {
    expect(
      countDesignSystemPreviewModules([
        ...pair('Write', '/proj/preview/colors.html'),
        ...pair('Write', '/proj/preview/typography.html'),
        ...pair('Write', '/proj/preview/components.html'),
      ]),
    ).toBe(3);
  });

  it('dedupes Write-then-Edit on the same preview path', () => {
    expect(
      countDesignSystemPreviewModules([
        ...pair('Write', '/proj/preview/colors.html'),
        ...pair('Edit', '/proj/preview/colors.html'),
      ]),
    ).toBe(1);
  });

  it('counts preview/index.html as a module', () => {
    expect(
      countDesignSystemPreviewModules([
        ...pair('Write', '/proj/preview/index.html'),
      ]),
    ).toBe(1);
  });

  it('ignores non-preview html paths', () => {
    expect(
      countDesignSystemPreviewModules([
        ...pair('Write', '/proj/index.html'),
        ...pair('Write', '/proj/docs/intro.html'),
      ]),
    ).toBe(0);
  });

  it('skips preview writes whose tool_result reported isError', () => {
    expect(
      countDesignSystemPreviewModules([
        ...pair('Write', '/proj/preview/colors.html', true),
        ...pair('Write', '/proj/preview/typography.html'),
      ]),
    ).toBe(1);
  });
});

// Helper: emit a bare tool_use (no result) for a named tool.
function toolUse(name: string, id = freshId()) {
  return [
    {
      event: 'agent',
      data: { type: 'tool_use', id, name, input: {} },
    },
  ];
}

// A renderable question-form body — JSON with a non-empty `questions` array.
// `runAskedUserQuestion` requires a *closed, renderable* block, not a bare tag.
const RENDERABLE_BODY = '{"questions":[{"question":"Which framework?"}]}';

// Helper: emit assistant streamed text as a `text_delta` agent event. Note the
// real persisted shape carries the chunk on `delta` (not `text`) — see
// packages/contracts/src/sse/chat.ts. Building the wrong field here is exactly
// what made the old tests pass while production runs detected nothing.
function questionFormText(text = `Quick brief <question-form id="q">${RENDERABLE_BODY}</question-form>`) {
  return [{ event: 'agent', data: { type: 'text_delta', delta: text } }];
}

describe('runAskedUserQuestion', () => {
  it('returns false for an empty event list', () => {
    expect(runAskedUserQuestion([])).toBe(false);
  });

  it('returns true when the run emitted a renderable <question-form> clarification', () => {
    expect(runAskedUserQuestion(questionFormText())).toBe(true);
  });

  it('reads the `delta` field of text_delta events (the real persisted shape)', () => {
    // Guards the production bug where the helper read `text` and so appended
    // nothing for real runs, leaving run_finished.asked_user_question false.
    expect(
      runAskedUserQuestion([
        { event: 'agent', data: { type: 'text_delta', delta: `<question-form id="q">${RENDERABLE_BODY}</question-form>` } },
      ]),
    ).toBe(true);
  });

  it('reassembles a marker split across text_delta chunks', () => {
    expect(
      runAskedUserQuestion([
        { event: 'agent', data: { type: 'text_delta', delta: 'ask a <question-form id="q">{"questions":[' } },
        { event: 'agent', data: { type: 'text_delta', delta: '{"question":"X"}]}</question-form>' } },
      ]),
    ).toBe(true);
  });

  // `<ask-question>` is an accepted alias for `<question-form>` (whitelisted by
  // the UI parser and the daemon open-tag matcher). A model that drifts to the
  // alias still renders the clarification banner, so the analytics signal must
  // recognize it too — otherwise the run gets misclassified in the funnel.
  it('returns true for the renderable <ask-question> alias', () => {
    expect(
      runAskedUserQuestion([
        { event: 'agent', data: { type: 'text_delta', delta: `one quick check <ask-question id="q">${RENDERABLE_BODY}</ask-question>` } },
      ]),
    ).toBe(true);
  });

  it('returns false when the tag is only shown as literal markup (no renderable body)', () => {
    // A doc/code sample that mentions the markup must NOT be misclassified as a
    // clarification turn and excluded from the artifact funnel.
    expect(
      runAskedUserQuestion([
        { event: 'agent', data: { type: 'text_delta', delta: 'Use a `<question-form id="x">` block like this in your skill.' } },
      ]),
    ).toBe(false);
  });

  it('returns false for a run that only wrote artifacts', () => {
    expect(
      runAskedUserQuestion([
        ...pair('Write', '/proj/index.html'),
        ...toolUse('Read'),
      ]),
    ).toBe(false);
  });

  it('detects the form even when mixed with other tool calls', () => {
    expect(
      runAskedUserQuestion([
        ...pair('Write', '/proj/index.html'),
        ...questionFormText(),
      ]),
    ).toBe(true);
  });
});

// `deriveActivationMilestones` powers the `$set_once` person-property stamp on
// `run_finished` — the first-touch "produced an artifact / generated a design
// system (first observed since rollout)" segmentation. Pins: only successful runs count, a design
// system requires `designSystemCreated`, both can fire from one run, and a
// no-milestone run returns undefined so the caller omits `$set_once`.
describe('deriveActivationMilestones', () => {
  const ISO = '2026-06-15T12:00:00.000Z';

  it('stamps first_artifact_at when a successful run produced artifacts', () => {
    expect(
      deriveActivationMilestones({
        result: 'success',
        artifactCount: 2,
        designSystemCreated: false,
        isDesignSystemRun: false,
        capturedAtIso: ISO,
      }),
    ).toEqual({ first_artifact_at: ISO });
  });

  it('stamps first_design_system_at when a successful DS run wrote DESIGN.md', () => {
    expect(
      deriveActivationMilestones({
        result: 'success',
        artifactCount: 0,
        designSystemCreated: true,
        isDesignSystemRun: true,
        capturedAtIso: ISO,
      }),
    ).toEqual({ first_design_system_at: ISO });
  });

  it('does NOT stamp first_design_system_at for a non-DS run that wrote DESIGN.md', () => {
    // A plain chat run can write a `DESIGN.md` (finalize-design.ts, or a user
    // editing an existing DESIGN.md from the composer). `run_finished` only
    // emits `design_system_created` for DS runs, so the milestone must gate on
    // `isDesignSystemRun` too or the person property overstates DS activation
    // (nettee review on #4362). Here the run produced no artifact either, so
    // the result is undefined — no milestone stamped.
    expect(
      deriveActivationMilestones({
        result: 'success',
        artifactCount: 0,
        designSystemCreated: true,
        isDesignSystemRun: false,
        capturedAtIso: ISO,
      }),
    ).toBeUndefined();
  });

  it('stamps both when one DS run crossed both milestones', () => {
    expect(
      deriveActivationMilestones({
        result: 'success',
        artifactCount: 3,
        designSystemCreated: true,
        isDesignSystemRun: true,
        capturedAtIso: ISO,
      }),
    ).toEqual({ first_artifact_at: ISO, first_design_system_at: ISO });
  });

  it('returns undefined for a successful run that crossed no milestone', () => {
    expect(
      deriveActivationMilestones({
        result: 'success',
        artifactCount: 0,
        designSystemCreated: false,
        isDesignSystemRun: false,
        capturedAtIso: ISO,
      }),
    ).toBeUndefined();
  });

  it('returns undefined for a failed run even when it touched files', () => {
    // A failed/cancelled run that happened to write a file is not a
    // milestone — the funnel only credits successful generation.
    expect(
      deriveActivationMilestones({
        result: 'failed',
        artifactCount: 5,
        designSystemCreated: true,
        isDesignSystemRun: true,
        capturedAtIso: ISO,
      }),
    ).toBeUndefined();
    expect(
      deriveActivationMilestones({
        result: 'cancelled',
        artifactCount: 5,
        designSystemCreated: true,
        isDesignSystemRun: true,
        capturedAtIso: ISO,
      }),
    ).toBeUndefined();
  });
});
