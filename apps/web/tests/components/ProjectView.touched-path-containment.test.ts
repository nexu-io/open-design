// Absolute tool-path containment for touched-file resolution (#5352 follow-up).
//
// The turn-end auto-open selector restricts mtime-window candidates to files
// the agent's Write/Edit events touched, resolved through the same matching
// as trace attribution. Two gaps in that matching:
//
// 1. A ROOT-level project file (candidate has no `/`) never suffix-matched an
//    absolute event path like /workspace/index.html, so a mixed turn that
//    rewrote index.html plus any resolvable file excluded the rewritten HTML
//    from the touched set — and nothing auto-opened.
// 2. An out-of-root absolute path that merely shares a tail with a project
//    file (/tmp/site/index.html, or a `..` escape resolving outside the
//    root) COULD suffix-match and mis-attribute an external write to an
//    in-project file.
//
// With the project root threaded in, absolute paths resolve to their
// project-relative form when contained and are rejected outright otherwise.
import { describe, expect, it } from 'vitest';
import {
  computeTraceObjectFiles,
  resolveAgentTouchedFileNames,
} from '../../src/components/ProjectView';
import { selectAutoOpenTurnArtifact } from '../../src/components/auto-open-file';

const ROOT = '/workspace/project';

interface FileSeed {
  name: string;
  path?: string;
  kind?: string;
  mtime?: number;
  type?: string;
}

const file = (seed: FileSeed) => ({ type: 'file', ...seed }) as any;

const rootHtml = file({ name: 'index.html', path: 'index.html', kind: 'html', mtime: 1_005_000 });
const subJs = file({ name: 'app.js', path: 'assets/app.js', kind: 'text', mtime: 1_004_000 });
const planMd = file({ name: 'plan.md', path: 'plan.md', kind: 'text', mtime: 940_000 });

describe('resolveAgentTouchedFileNames — absolute paths under the project root', () => {
  it('resolves an absolute path to a ROOT-level project file', () => {
    const names = resolveAgentTouchedFileNames(
      [`${ROOT}/index.html`],
      [rootHtml, planMd],
      undefined,
      ROOT,
    );
    expect([...names]).toEqual(['index.html']);
  });

  it('resolves an absolute path to a subdirectory project file', () => {
    const names = resolveAgentTouchedFileNames(
      [`${ROOT}/assets/app.js`],
      [subJs, planMd],
      undefined,
      ROOT,
    );
    expect([...names]).toEqual(['app.js']);
  });

  it('resolves `..` segments that stay inside the root', () => {
    const names = resolveAgentTouchedFileNames(
      [`${ROOT}/assets/../index.html`],
      [rootHtml, planMd],
      undefined,
      ROOT,
    );
    expect([...names]).toEqual(['index.html']);
  });
});

describe('resolveAgentTouchedFileNames — out-of-root rejection before suffix matching', () => {
  it('rejects an out-of-root absolute path that shares a tail with a project file', () => {
    const names = resolveAgentTouchedFileNames(
      ['/tmp/site/assets/app.js'],
      [subJs, planMd],
      undefined,
      ROOT,
    );
    expect(names.size).toBe(0);
  });

  it('rejects a `..` escape that resolves outside the root', () => {
    const names = resolveAgentTouchedFileNames(
      [`${ROOT}/../elsewhere/assets/app.js`],
      [subJs, planMd],
      undefined,
      ROOT,
    );
    expect(names.size).toBe(0);
  });

  it('rejects a path whose `..` climbs above its own anchor', () => {
    const names = resolveAgentTouchedFileNames(
      ['/../etc/passwd'],
      [rootHtml],
      undefined,
      ROOT,
    );
    expect(names.size).toBe(0);
  });

  it('keeps legacy suffix matching when no root is known', () => {
    const names = resolveAgentTouchedFileNames(
      ['/anywhere/assets/app.js'],
      [subJs, planMd],
      undefined,
      null,
    );
    expect([...names]).toEqual(['app.js']);
  });
});

describe('resolveAgentTouchedFileNames — managed-project alias paths', () => {
  it('trusts a projects/<id>/ alias path even when it lives outside the resolved root', () => {
    const names = resolveAgentTouchedFileNames(
      ['/mnt/managed/projects/proj-1/index.html'],
      [rootHtml, planMd],
      'proj-1',
      ROOT,
    );
    expect([...names]).toEqual(['index.html']);
  });
});

describe('turn-end auto-open — mixed turn rewriting a root HTML file', () => {
  it('opens the rewritten root index.html when the turn also touched a resolvable file', () => {
    const touched = resolveAgentTouchedFileNames(
      [`${ROOT}/index.html`, `${ROOT}/assets/app.js`],
      [rootHtml, subJs, planMd],
      undefined,
      ROOT,
    );
    const pick = selectAutoOpenTurnArtifact([], [rootHtml, subJs, planMd], {
      turnStartedAt: 1_000_000,
      turnEndedAt: 1_030_000,
      agentTouchedFileNames: touched,
    });
    expect(pick).toBe('index.html');
  });
});

describe('computeTraceObjectFiles — root-file trace attribution', () => {
  it('marks a rewritten root file as modified from its absolute tool path', () => {
    const trace = computeTraceObjectFiles(
      new Set(['index.html', 'plan.md']),
      [rootHtml, planMd],
      [`${ROOT}/index.html`],
      undefined,
      ROOT,
    );
    expect(trace?.map((f) => [f.name, f.traceObjectReason])).toEqual([
      ['index.html', 'modified'],
    ]);
  });

  it('does not attribute an out-of-root write with a matching basename', () => {
    const trace = computeTraceObjectFiles(
      new Set(['index.html', 'plan.md']),
      [rootHtml, planMd],
      ['/tmp/site/index.html'],
      undefined,
      ROOT,
    );
    expect(trace).toEqual([]);
  });
});
