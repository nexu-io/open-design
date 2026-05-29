// Golden daemon-event snapshots — addresses the regression-signal point
// from review on #3241: smoke-testing that mocks RUN catches only crashes
// or protocol-level garbage; it does NOT catch a parser change that
// semantically reshapes the events the daemon emits to the UI.
//
// This test replays representative recordings through the actual daemon
// stream handlers and asserts the emitted event sequence matches a
// committed `mocks/golden/<trace>.events.json`. A parser tweak that
// drops a tool_result, changes a usage shape, or renames an event type
// fails this test loudly.
//
// Update flow when a parser change is INTENTIONAL:
//   MOCKS_GOLDEN_UPDATE=1 pnpm --filter @open-design/daemon test mocks-golden
// then `git diff mocks/golden/` and commit the new shapes.
//
// Auto-skips when the recording corpus hasn't been fetched yet (see
// `mocks/scripts/fetch-recordings.sh`); CI that exercises this test must
// fetch first.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClaudeStreamHandler } from '../src/claude-stream.js';
import { createJsonEventStreamHandler } from '../src/json-event-stream.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../..');
const MOCK_AGENT = join(REPO, 'mocks/mock-agent.mjs');
const GOLDEN_DIR = join(REPO, 'mocks/golden');
const RECORDINGS_DIR = join(REPO, 'mocks/recordings');

// Median-tool-count successful traces per agent (selected from manifest
// 2026-05-29). Each one's `.jsonl` lives in `mocks/recordings/` after
// `bash mocks/scripts/fetch-recordings.sh`.
const CASES: Array<{ agent: 'claude' | 'codex' | 'opencode'; trace: string }> = [
  { agent: 'claude',   trace: '314d6833-0377-4ac4-ba11-2b8d7eca5511' },
  { agent: 'codex',    trace: 'dcdff3b3-cd39-4dcd-be83-372830a29639' },
  { agent: 'opencode', trace: '9a9522ec-575f-432f-aeed-efc491e900aa' },
];

// Replace per-spawn-volatile fields with stable sentinels so the
// snapshot stays diffable across runs. Currently only `sessionId` —
// claude's mock emits a fresh UUID every spawn. Opencode/codex carry
// the recording's own session/thread id so they're already stable.
function normalizeVolatile(events: unknown[]): unknown[] {
  return events.map(e => {
    if (!e || typeof e !== 'object') return e;
    const rec = e as Record<string, unknown>;
    const out: Record<string, unknown> = { ...rec };
    if ('sessionId' in out) out.sessionId = '<normalized>';
    return out;
  });
}

function runMockAndCollectEvents(agent: string, trace: string): unknown[] {
  // Force no-delay so the spawn returns quickly + deterministically.
  const proc = spawnSync(
    process.execPath,
    [MOCK_AGENT, '--as', agent, '--no-delay'],
    {
      env: { ...process.env, OD_MOCKS_TRACE: trace, OD_MOCKS_NO_DELAY: '1' },
      input: 'golden-test-prompt',
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 50 * 1024 * 1024,
    },
  );
  if (proc.status !== 0) {
    throw new Error(
      `mock-agent --as ${agent} exit ${proc.status}: ${proc.stderr.slice(0, 500)}`,
    );
  }

  const events: unknown[] = [];
  const sink = (e: unknown) => events.push(e);
  const handler =
    agent === 'claude'
      ? createClaudeStreamHandler(sink)
      : createJsonEventStreamHandler(agent, sink);
  handler.feed(proc.stdout);
  return normalizeVolatile(events);
}

const recordingsAvailable =
  existsSync(RECORDINGS_DIR) &&
  CASES.every(c => existsSync(join(RECORDINGS_DIR, `${c.trace}.jsonl`)));

describe.skipIf(!recordingsAvailable)(
  'mocks goldens — daemon event shape regression',
  () => {
    for (const { agent, trace } of CASES) {
      it(`${agent} ${trace.slice(0, 8)}`, () => {
        const events = runMockAndCollectEvents(agent, trace);
        const goldenPath = join(GOLDEN_DIR, `${trace}.events.json`);

        if (process.env.MOCKS_GOLDEN_UPDATE === '1') {
          mkdirSync(GOLDEN_DIR, { recursive: true });
          writeFileSync(
            goldenPath,
            JSON.stringify({ agent, trace, events }, null, 2) + '\n',
          );
          return;
        }

        const golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
        expect({ agent, trace, events }).toEqual(golden);
      });
    }
  },
);
