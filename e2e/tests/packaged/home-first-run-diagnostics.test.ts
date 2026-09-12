import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  assertPackagedHomeFirstRunResult,
  describePackagedHomeFirstRunStall,
  PACKAGED_HOME_FIRST_RUN_IN_PAGE_WINDOW_MS,
  PACKAGED_HOME_FIRST_RUN_OUTPUT,
  PACKAGED_HOME_FIRST_RUN_STAGE_TIMEOUT_MS,
  packagedHomeFirstRunExpression,
  packagedHomeFirstRunInPageAwaitMs,
  packagedHomeFirstRunSnapshotExpression,
  packagedHomeFirstRunStageSatisfied,
  selectPackagedHomeRun,
  type PackagedHomeFirstRunResult,
} from '@/vitest/packaged-home-first-run';

type FakeResponse = Response;

function jsonResponse(value: unknown): FakeResponse {
  return new Response(JSON.stringify(value), { status: 200 });
}

function textResponse(body: string): FakeResponse {
  return new Response(body, { status: 200 });
}

type SnapshotFixtureOptions = {
  assistantText?: string;
  daemonAssistantText?: string;
  eventsText?: string;
  /** `/api/runs` status per call; the last entry repeats once exhausted. */
  runStatuses: string[];
};

function createSnapshotFixture(options: SnapshotFixtureOptions) {
  const requests: string[] = [];
  let runsCalls = 0;

  const sandbox: Record<string, unknown> = {
    __odPackagedHomeFirstRun: { createdRuns: [{ runId: 'run-1', conversationId: 'c1' }] },
    document: {
      querySelectorAll: (selector: string) =>
        selector === '[data-assistant-message-id]' && options.assistantText != null
          ? [{ textContent: options.assistantText }]
          : [],
      title: 'Open Design',
    },
    fetch: async (path: string): Promise<FakeResponse> => {
      const requestPath = String(path);
      requests.push(requestPath);
      if (requestPath.startsWith('/api/runs?')) {
        const index = Math.min(runsCalls, options.runStatuses.length - 1);
        runsCalls += 1;
        const status = options.runStatuses[index];
        return jsonResponse({ runs: status == null ? [] : [{ id: 'run-1', conversationId: 'c1', status }] });
      }
      if (requestPath.endsWith('/events')) return textResponse(options.eventsText ?? '');
      if (requestPath.endsWith('/messages')) {
        return jsonResponse({
          messages: [{ content: options.daemonAssistantText ?? '', role: 'assistant' }],
        });
      }
      return jsonResponse({});
    },
    location: {
      href: 'od://app/projects/p1/conversations/c1',
      pathname: '/projects/p1/conversations/c1',
    },
    performance: { getEntriesByType: () => [{}], timeOrigin: 1234 },
    setTimeout,
  };

  return {
    requests,
    runsCalls: () => runsCalls,
    sandbox,
    evaluate: async (expression: string): Promise<PackagedHomeFirstRunResult> =>
      assertPackagedHomeFirstRunResult(await runInNewContext(expression, sandbox)),
  };
}

function snapshotFor(overrides: Partial<PackagedHomeFirstRunResult>): PackagedHomeFirstRunResult {
  return {
    assistantText: '',
    conversationId: 'c1',
    createRunRequestCount: 1,
    createRunResponseStatuses: [202],
    daemonAssistantText: '',
    hrefAfter: 'od://app/projects/p1/conversations/c1',
    hrefBefore: 'od://app/',
    inPageWaitedMs: 0,
    inputTextBeforeSubmit: 'prompt',
    navigationEntryCountAfter: 1,
    navigationEntryCountBefore: 1,
    outputVisible: false,
    performanceTimeOriginAfter: 1,
    performanceTimeOriginBefore: 1,
    projectId: 'p1',
    runId: 'run-1',
    strategyRolloutDecision: null,
    strategyTask: null,
    runEventRequestCount: 1,
    runEventResponseStatuses: [200],
    runEventsContainExpectedOutput: false,
    runReachedTerminal: false,
    runStatuses: ['running'],
    submitClicked: true,
    terminalRunStatus: '',
    workspaceTabClicksBeforeOutput: 0,
    ...overrides,
  };
}

describe('packaged Home run identity', () => {
  const created = [{ runId: 'home', conversationId: 'c1' }];

  it('ignores another completed run while this submit is still running', () => {
    const other = { id: 'other', conversationId: 'c1', status: 'succeeded' };
    const home = { id: 'home', conversationId: 'c1', status: 'running' };
    expect(selectPackagedHomeRun([other, home], created, 'c1')).toMatchObject({ run: home, terminalStatus: '' });
    expect(selectPackagedHomeRun([other], [], 'c1').run).toBeUndefined();
    expect(selectPackagedHomeRun([home], created, 'other-conversation').run).toBeUndefined();
  });

  it('waits for the bound OD Next task and follows only its active Run', () => {
    const task = { taskExecutionId: 'task-1', activeRunId: 'production', terminal: false, outcome: 'running' };
    const root = { id: 'home', conversationId: 'c1', status: 'succeeded', strategyTask: task };
    const production = { id: 'production', conversationId: 'c1', status: 'running', strategyTask: task };
    expect(selectPackagedHomeRun([root, production], created, 'c1').terminalStatus).toBe('');
    task.terminal = true;
    task.outcome = 'completed';
    production.status = 'succeeded';
    expect(selectPackagedHomeRun([root, production], created, 'c1')).toMatchObject({ run: production, terminalStatus: 'succeeded' });
    task.outcome = 'blocked';
    expect(selectPackagedHomeRun([root, production], created, 'c1').terminalStatus).toBe('failed');
    const unrelated = { ...production, strategyTask: { ...task, taskExecutionId: 'unrelated' } };
    expect(selectPackagedHomeRun([root, unrelated], created, 'c1').run).toBeUndefined();
  });
});

describe('packaged Home first-run budget', () => {
  it('sizes each stage for its own chain instead of sharing one budget', () => {
    // The single 15s budget had to cover cold project creation *and* rendering,
    // which is why only the fastest machines passed. Both stages must now be
    // large enough that a slower-but-working runtime still finishes.
    expect(PACKAGED_HOME_FIRST_RUN_STAGE_TIMEOUT_MS['run-terminal']).toBeGreaterThanOrEqual(60_000);
    expect(PACKAGED_HOME_FIRST_RUN_STAGE_TIMEOUT_MS['assistant-output']).toBeGreaterThanOrEqual(30_000);
  });

  it('keeps one in-page wait comfortably inside the 5s inspect IPC timeout', () => {
    expect(PACKAGED_HOME_FIRST_RUN_IN_PAGE_WINDOW_MS).toBeLessThan(5_000);
  });

  it('clamps the remaining budget into one window and stops asking once it is spent', () => {
    expect(packagedHomeFirstRunInPageAwaitMs(60_000, 2_500)).toBe(2_500);
    expect(packagedHomeFirstRunInPageAwaitMs(900, 2_500)).toBe(900);
    expect(packagedHomeFirstRunInPageAwaitMs(0, 2_500)).toBe(0);
    expect(packagedHomeFirstRunInPageAwaitMs(-1_000, 2_500)).toBe(0);
    expect(packagedHomeFirstRunInPageAwaitMs(Number.NaN, 2_500)).toBe(0);
  });
});

describe('packaged Home first-run stage predicate', () => {
  it('ends the first stage on a terminal run and the second on visible output', () => {
    const running = snapshotFor({ runReachedTerminal: false });
    const finished = snapshotFor({ runReachedTerminal: true, terminalRunStatus: 'succeeded' });
    const rendered = snapshotFor({ outputVisible: true, runReachedTerminal: true });

    expect(packagedHomeFirstRunStageSatisfied('run-terminal', running)).toBe(false);
    expect(packagedHomeFirstRunStageSatisfied('run-terminal', finished)).toBe(true);
    expect(packagedHomeFirstRunStageSatisfied('assistant-output', finished)).toBe(false);
    expect(packagedHomeFirstRunStageSatisfied('assistant-output', rendered)).toBe(true);
  });
});

describe('packaged Home first-run stall report', () => {
  it('separates a run that is still going from a run that already failed', () => {
    expect(
      describePackagedHomeFirstRunStall('run-terminal', snapshotFor({ runStatuses: ['running'] })),
    ).toContain('still running');
    expect(
      describePackagedHomeFirstRunStall(
        'assistant-output',
        snapshotFor({ runReachedTerminal: true, runStatuses: ['failed'], terminalRunStatus: 'failed' }),
      ),
    ).toContain('failed run, not a slow one');
  });

  it('names the earliest missing step in the cold chain', () => {
    expect(
      describePackagedHomeFirstRunStall('run-terminal', snapshotFor({ submitClicked: false })),
    ).toContain('submit was never registered');
    expect(
      describePackagedHomeFirstRunStall(
        'run-terminal',
        snapshotFor({ hrefAfter: 'od://app/', projectId: '' }),
      ),
    ).toContain('never left Home');
    expect(
      describePackagedHomeFirstRunStall(
        'run-terminal',
        snapshotFor({ createRunRequestCount: 0, createRunResponseStatuses: [] }),
      ),
    ).toContain('POST /api/runs was never sent');
    expect(
      describePackagedHomeFirstRunStall('run-terminal', snapshotFor({ runStatuses: [] })),
    ).toContain('no run row for this project');
  });

  it('lists exactly which observation is missing once the run succeeded', () => {
    const message = describePackagedHomeFirstRunStall(
      'assistant-output',
      snapshotFor({
        daemonAssistantText: PACKAGED_HOME_FIRST_RUN_OUTPUT,
        runEventsContainExpectedOutput: true,
        runReachedTerminal: true,
        runStatuses: ['succeeded'],
        terminalRunStatus: 'succeeded',
      }),
    );

    expect(message).toContain('the rendered assistant message');
    expect(message).not.toContain('the daemon conversation messages');
    expect(message).not.toContain('the run event stream');
  });

  it('says so when no inspection ever produced a snapshot', () => {
    expect(describePackagedHomeFirstRunStall('run-terminal', null)).toContain('no readable snapshot');
  });
});

describe('packaged Home first-run in-page polling', () => {
  it('keeps polling inside one inspection until the run reaches a terminal status', async () => {
    const fixture = createSnapshotFixture({ runStatuses: ['running', 'running', 'succeeded'] });

    const snapshot = await fixture.evaluate(
      packagedHomeFirstRunSnapshotExpression({ awaitMs: 2_000, pollIntervalMs: 1, stage: 'run-terminal' }),
    );

    // One inspection, three observations: the sampling rate is no longer bounded
    // by how fast a `tools-pack mac inspect` process can start.
    expect(fixture.runsCalls()).toBe(3);
    expect(snapshot.runReachedTerminal).toBe(true);
    expect(snapshot.terminalRunStatus).toBe('succeeded');
    expect(snapshot.runStatuses).toEqual(['succeeded']);
  });

  it('skips the message and event reads while the run is still going', async () => {
    const fixture = createSnapshotFixture({ runStatuses: ['running'] });

    await fixture.evaluate(
      packagedHomeFirstRunSnapshotExpression({ awaitMs: 20, pollIntervalMs: 1, stage: 'run-terminal' }),
    );

    expect(fixture.requests.every((path) => path.startsWith('/api/runs?'))).toBe(true);
  });

  it('returns its last observation when the window expires instead of throwing', async () => {
    const fixture = createSnapshotFixture({ runStatuses: ['running'] });

    const snapshot = await fixture.evaluate(
      packagedHomeFirstRunSnapshotExpression({ awaitMs: 30, pollIntervalMs: 1, stage: 'run-terminal' }),
    );

    expect(snapshot.runReachedTerminal).toBe(false);
    expect(snapshot.runStatuses).toEqual(['running']);
    expect(snapshot.inPageWaitedMs).toBeGreaterThanOrEqual(30);
    expect(fixture.runsCalls()).toBeGreaterThan(1);
  });

  it('reports output as visible only when all three observations carry it', async () => {
    const partial = createSnapshotFixture({
      daemonAssistantText: PACKAGED_HOME_FIRST_RUN_OUTPUT,
      eventsText: 'nothing useful',
      assistantText: PACKAGED_HOME_FIRST_RUN_OUTPUT,
      runStatuses: ['succeeded'],
    });
    const complete = createSnapshotFixture({
      assistantText: PACKAGED_HOME_FIRST_RUN_OUTPUT,
      daemonAssistantText: PACKAGED_HOME_FIRST_RUN_OUTPUT,
      eventsText: `data: ${PACKAGED_HOME_FIRST_RUN_OUTPUT}`,
      runStatuses: ['succeeded'],
    });
    const expression = packagedHomeFirstRunSnapshotExpression({
      awaitMs: 20,
      pollIntervalMs: 1,
      stage: 'assistant-output',
    });

    await expect(partial.evaluate(expression)).resolves.toMatchObject({
      outputVisible: false,
      runEventsContainExpectedOutput: false,
    });
    await expect(complete.evaluate(expression)).resolves.toMatchObject({
      outputVisible: true,
      runEventsContainExpectedOutput: true,
    });
  });
});

describe('packaged Home first-run instrumentation', () => {
  it('observes run creation without faking a failure the daemon cannot produce', async () => {
    // `POST /api/runs` never answers WORKSPACE_AUTHORITY_UNAVAILABLE: local run
    // creation does not synchronously depend on Workspace membership authority
    // (apps/daemon/src/collab/project-request-authority.ts). Injecting that 503
    // here tested a branch production cannot reach and spent budget the cold
    // chain needed. Run-create retry semantics stay covered by the web unit test
    // in apps/web/tests/providers/sse.test.ts.
    const upstream: Array<{ method: string; url: string }> = [];
    class FixtureComposer {
      __lexicalEditor = {
        parseEditorState: (value: string) => JSON.parse(value) as unknown,
        setEditorState: (value: unknown) => {
          const state = value as { root?: { children?: Array<{ children?: Array<{ text?: string }> }> } };
          this.textContent = state.root?.children?.[0]?.children?.[0]?.text ?? '';
        },
      };

      isContentEditable = true;
      textContent = '';

      focus(): void {}

      getClientRects(): ArrayLike<unknown> {
        return [{}];
      }
    }
    const composer = new FixtureComposer();
    const sandbox: Record<string, unknown> = {
      Element: FixtureComposer,
      HTMLElement: FixtureComposer,
      Headers,
      Request,
      URL,
      document: {
        addEventListener: () => undefined,
        querySelector: (selector: string) =>
          selector === '[data-testid="home-hero-input"]' ? composer : null,
      },
      fetch: async (url: string, init?: { method?: string }) => {
        upstream.push({ method: init?.method ?? 'GET', url: String(url) });
        return jsonResponse({ runId: 'run-1', conversationId: 'c1' });
      },
      location: { href: 'od://app/', pathname: '/' },
      performance: { getEntriesByType: () => [{}], timeOrigin: 7 },
      setTimeout,
    };

    await runInNewContext(packagedHomeFirstRunExpression(), sandbox);
    const wrappedFetch = sandbox.fetch as (url: string, init?: { method?: string }) => Promise<FakeResponse>;
    const response = await wrappedFetch('/api/runs', { method: 'POST' });
    const state = sandbox.__odPackagedHomeFirstRun as {
      createRunRequestCount: number;
      createRunResponseStatuses: number[];
      createdRuns: unknown[];
    };

    expect(response.status).toBe(200);
    expect(upstream).toEqual([{ method: 'POST', url: '/api/runs' }]);
    expect(state.createRunRequestCount).toBe(1);
    expect(state.createRunResponseStatuses).toEqual([200]);
    expect(state.createdRuns).toEqual([{ runId: 'run-1', conversationId: 'c1' }]);
    expect(await response.json()).toEqual({ runId: 'run-1', conversationId: 'c1' });
  });
});
