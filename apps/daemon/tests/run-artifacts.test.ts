// Unit coverage for `countNewHtmlArtifacts`. Pins the v2
// `run_finished.artifact_count` invariant: incremental count of
// distinct `.html` paths the run produced or modified, deduped by
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
  countNewHtmlArtifacts,
  didRunCreateDesignSystemFile,
} from '../src/run-artifacts.js';

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

describe('countNewHtmlArtifacts', () => {
  it('returns 0 when the run produced no events', () => {
    expect(countNewHtmlArtifacts([])).toBe(0);
  });

  it('returns 0 when no tool_use targets a .html file', () => {
    expect(
      countNewHtmlArtifacts([
        ...pair('Write', '/proj/notes.md'),
        ...pair('Edit', '/proj/styles.css'),
        ...pair('Read', '/proj/index.html'),
      ]),
    ).toBe(0);
  });

  it('counts a single successful Write on a .html path', () => {
    expect(
      countNewHtmlArtifacts(pair('Write', '/proj/index.html')),
    ).toBe(1);
  });

  it('does NOT count a tool_use whose tool_result reports isError=true', () => {
    // Permission denied, path outside cwd, parent missing — all bounce
    // the same way through the tool_result.isError channel and must
    // not increment artifact_count.
    expect(
      countNewHtmlArtifacts(pair('Write', '/proj/index.html', true)),
    ).toBe(0);
  });

  it('does NOT count a tool_use that has no matching tool_result yet', () => {
    // Run was sampled while a Write was still in flight; the
    // safe-default is to undercount rather than promise an
    // artifact we can't confirm landed.
    expect(
      countNewHtmlArtifacts(unfinished('Write', '/proj/index.html')),
    ).toBe(0);
  });

  it('dedupes multiple successful Write/Edit ops on the same path', () => {
    expect(
      countNewHtmlArtifacts([
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
      countNewHtmlArtifacts([
        ...pair('Write', '/proj/index.html'),
        ...pair('Edit', '/proj/index.html', true),
      ]),
    ).toBe(1);
  });

  it('counts distinct .html paths separately', () => {
    expect(
      countNewHtmlArtifacts([
        ...pair('Write', '/proj/index.html'),
        ...pair('Write', '/proj/about.html'),
        ...pair('Write', '/proj/contact.html'),
      ]),
    ).toBe(3);
  });

  it('handles the Codex `create_file` / `str_replace_edit` aliases', () => {
    expect(
      countNewHtmlArtifacts([
        ...pair('create_file', '/proj/a.html'),
        ...pair('str_replace_edit', '/proj/b.html'),
      ]),
    ).toBe(2);
  });

  it('accepts both `file_path` and `path` input shapes', () => {
    const id = freshId();
    expect(
      countNewHtmlArtifacts([
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
      countNewHtmlArtifacts([
        ...pair('Write', '/proj/Page.HTML'),
        ...pair('Write', '/proj/Other.Html'),
      ]),
    ).toBe(2);
  });

  it('ignores non-agent events and malformed payloads', () => {
    expect(
      countNewHtmlArtifacts([
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
      countNewHtmlArtifacts([
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
