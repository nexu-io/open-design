export const PACKAGED_HOME_FIRST_RUN_PROMPT =
  'Create a delayed deterministic smoke artifact';

export const PACKAGED_HOME_FIRST_RUN_OUTPUT =
  'I recovered the delayed reasoning path and will persist the artifact now.';

type CodexInvocationReceipt = {
  nonce: string; pid: number; mode: string; event: string; method?: string; failed?: boolean;
};

export function codexAppServerInvocationsCompleted(receipts: CodexInvocationReceipt[], nonce: string): boolean {
  if (receipts.length === 0 || receipts.some((entry) => entry.nonce !== nonce)) return false;
  // Capability/login probes also invoke the fixture. Keep their provenance,
  // but verify the protocol independently for each actual app-server process.
  const appServer = receipts.filter((entry) => entry.mode === 'app-server');
  const pids = [...new Set(appServer.map((entry) => entry.pid))];
  return pids.length > 0 && pids.every((pid) => {
    const processReceipts = appServer.filter((entry) => entry.pid === pid);
    const methods = processReceipts.filter((entry) => entry.event === 'request').map((entry) => entry.method);
    return methods[0] === 'initialize' && methods[1] === 'initialized'
      && ['thread/start', 'thread/resume'].includes(methods[2] ?? '')
      && methods[3] === 'turn/start'
      && processReceipts.some((entry) => entry.event === 'completed' && entry.failed === false);
  });
}

type CreatedHomeRun = { runId: string; conversationId: string | null };
type ObservedHomeRun = {
  id: string;
  conversationId?: string | null;
  status: string;
  strategyRolloutDecision?: unknown;
  strategyTask?: {
    taskExecutionId: string;
    activeRunId: string;
    terminal: boolean;
    outcome: string;
  } | null;
};

/** Follow only this submit's Run, or its daemon-owned OD Next continuation. */
export function selectPackagedHomeRun(
  runs: ObservedHomeRun[], created: CreatedHomeRun[], conversationId: string,
) {
  const identity = [...created].reverse().find((entry) => entry.conversationId === conversationId);
  const rootRun = identity && runs.find((run) =>
    run.id === identity.runId && run.conversationId === conversationId,
  );
  const task = rootRun?.strategyTask;
  const run = task ? runs.find((candidate) =>
    candidate.id === task.activeRunId
    && candidate.conversationId === conversationId
    && candidate.strategyTask?.taskExecutionId === task.taskExecutionId,
  ) : rootRun;
  let terminalStatus = '';
  if (run && ['failed', 'canceled'].includes(run.status)) terminalStatus = run.status;
  else if (run?.status === 'succeeded' && (!task || task.terminal)) {
    terminalStatus = !task || task.outcome === 'completed' ? 'succeeded'
      : task.outcome === 'canceled' ? 'canceled' : 'failed';
  }
  return { run, rootRun, terminalStatus };
}

export type PackagedHomeFirstRunResult = {
  assistantText: string;
  conversationId: string;
  createRunRequestCount: number;
  createRunResponseStatuses: number[];
  daemonAssistantText: string;
  hrefAfter: string;
  hrefBefore: string;
  inPageWaitedMs: number;
  inputTextBeforeSubmit: string;
  navigationEntryCountAfter: number;
  navigationEntryCountBefore: number;
  outputVisible: boolean;
  performanceTimeOriginAfter: number;
  performanceTimeOriginBefore: number;
  projectId: string;
  runId: string;
  strategyRolloutDecision: unknown;
  strategyTask: unknown;
  runEventRequestCount: number;
  runEventResponseStatuses: number[];
  runEventsContainExpectedOutput: boolean;
  runReachedTerminal: boolean;
  runStatuses: string[];
  submitClicked: boolean;
  terminalRunStatus: string;
  workspaceTabClicksBeforeOutput: number;
};

/**
 * The two things a cold packaged first Home run has to do, in order.
 *
 * They used to share one budget, so a timeout could not say whether the run was
 * still working or had already failed. Splitting them makes the distinction
 * structural: `run-terminal` only ends when the daemon owns a finished run row,
 * so anything `assistant-output` reports afterwards is about surfacing, never
 * about speed.
 */
export type PackagedHomeFirstRunStage = 'assistant-output' | 'run-terminal';

/**
 * Wall-clock budget per stage.
 *
 * `run-terminal` covers the whole cold chain — create project + conversation,
 * route transition, ProjectView mount, auto-send, daemon agent-CLI probe, agent
 * turn, persistence — on a cold packaged runtime with a cold daemon. The
 * previous single 15s budget covered all of that plus rendering, and only the
 * fastest CI machines made it, so this is sized for the chain rather than for
 * the fastest observed sample.
 */
export const PACKAGED_HOME_FIRST_RUN_STAGE_TIMEOUT_MS: Record<PackagedHomeFirstRunStage, number> = {
  'assistant-output': 30_000,
  'run-terminal': 60_000,
};

/**
 * How long one inspection may wait *inside* the page before returning.
 *
 * `tools-pack mac inspect --expr` resolves the sidecar EVAL over IPC with a hard
 * 5s timeout, and each inspection also pays a full Node + tsx cold start. Polling
 * from the Node side therefore spends most of the budget on process startup
 * rather than on observation; polling inside the page spends almost none of it.
 * Stay well under the IPC timeout so a slow daemon fetch on the last iteration
 * cannot turn a normal observation into a transport error.
 */
export const PACKAGED_HOME_FIRST_RUN_IN_PAGE_WINDOW_MS = 2_500;

export type PackagedHomeFirstRunReadiness = {
  composerContentEditable: boolean;
  composerFound: boolean;
  composerVisible: boolean;
  lexicalEditorReady: boolean;
  loadingVisible: boolean;
  onboardingVisible: boolean;
  pathname: string;
};

export type PackagedHomeFirstRunSetupResult = {
  hrefBefore: string;
  inputTextBeforeSubmit: string;
  instrumented: true;
  navigationEntryCountBefore: number;
  performanceTimeOriginBefore: number;
  readiness: PackagedHomeFirstRunReadiness;
  submitClicked: boolean;
};

export type PackagedHomeFirstRunWaitOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export async function waitForPackagedHomeFirstRunSetup(
  inspect: () => Promise<unknown>,
  options: PackagedHomeFirstRunWaitOptions = {},
): Promise<PackagedHomeFirstRunSetupResult> {
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const startedAt = Date.now();
  let lastObservation: unknown = null;

  do {
    try {
      lastObservation = await inspect();
      const setup = asPackagedHomeFirstRunSetupResult(lastObservation);
      if (setup != null) return setup;
    } catch (error) {
      lastObservation = {
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }

    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
  } while (Date.now() - startedAt < timeoutMs);

  throw new Error(
    `packaged first Home run composer did not become ready: ${formatSetupObservation(lastObservation)}`,
  );
}

function asPackagedHomeFirstRunSetupResult(
  value: unknown,
): PackagedHomeFirstRunSetupResult | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  const candidate = value as Partial<PackagedHomeFirstRunSetupResult>;
  if (
    candidate.instrumented !== true
    || typeof candidate.hrefBefore !== 'string'
    || candidate.inputTextBeforeSubmit !== PACKAGED_HOME_FIRST_RUN_PROMPT
    || typeof candidate.navigationEntryCountBefore !== 'number'
    || typeof candidate.performanceTimeOriginBefore !== 'number'
    || !isPackagedHomeFirstRunReadiness(candidate.readiness)
    || typeof candidate.submitClicked !== 'boolean'
  ) {
    return null;
  }
  return candidate as PackagedHomeFirstRunSetupResult;
}

function isPackagedHomeFirstRunReadiness(
  value: unknown,
): value is PackagedHomeFirstRunReadiness {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return false;
  const candidate = value as Partial<PackagedHomeFirstRunReadiness>;
  return (
    typeof candidate.composerContentEditable === 'boolean'
    && typeof candidate.composerFound === 'boolean'
    && typeof candidate.composerVisible === 'boolean'
    && typeof candidate.lexicalEditorReady === 'boolean'
    && typeof candidate.loadingVisible === 'boolean'
    && typeof candidate.onboardingVisible === 'boolean'
    && typeof candidate.pathname === 'string'
  );
}

function formatSetupObservation(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Probes the Home composer and instruments the first packaged send atomically
 * once it is ready, without recovering the renderer.
 * Output observation is polled through a separate expression, so this setup
 * never reloads the page or clicks a workspace tab after submission.
 */
export function packagedHomeFirstRunExpression(): string {
  return `
    (async () => {
      const prompt = ${JSON.stringify(PACKAGED_HOME_FIRST_RUN_PROMPT)};
      const stateKey = '__odPackagedHomeFirstRun';
      const existingState = globalThis[stateKey];
      if (
        existingState?.instrumented === true
        && existingState.inputTextBeforeSubmit === prompt
      ) {
        return {
          hrefBefore: existingState.hrefBefore,
          inputTextBeforeSubmit: existingState.inputTextBeforeSubmit,
          instrumented: true,
          navigationEntryCountBefore: existingState.navigationEntryCountBefore,
          performanceTimeOriginBefore: existingState.performanceTimeOriginBefore,
          readiness: existingState.readiness,
          submitClicked: existingState.submitClicked,
        };
      }

      const input = document.querySelector('[data-testid="home-hero-input"]');
      const loadingSurface = document.querySelector('.od-loading-shell, .centered-loader');
      const onboardingSurface = document.querySelector(
        '.entry-shell--onboarding, .entry-onboarding-modal',
      );
      const composerVisible =
        input instanceof HTMLElement && input.getClientRects().length > 0;
      const composerContentEditable =
        input instanceof HTMLElement && input.isContentEditable;
      const editor = input?.__lexicalEditor;
      const lexicalEditorReady =
        typeof editor?.parseEditorState === 'function'
        && typeof editor?.setEditorState === 'function';
      const readiness = {
        pathname: location.pathname,
        loadingVisible:
          loadingSurface instanceof HTMLElement && loadingSurface.getClientRects().length > 0,
        onboardingVisible:
          onboardingSurface instanceof HTMLElement && onboardingSurface.getClientRects().length > 0,
        composerFound: input != null,
        composerVisible,
        composerContentEditable,
        lexicalEditorReady,
      };
      if (!composerVisible || !composerContentEditable || !lexicalEditorReady) {
        return { instrumented: false, readiness };
      }

      input.focus();
      editor.setEditorState(editor.parseEditorState(JSON.stringify({
        root: {
          children: [{
            children: [{
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: prompt,
              type: 'text',
              version: 1,
            }],
            direction: null,
            format: '',
            indent: 0,
            type: 'paragraph',
            version: 1,
            textFormat: 0,
            textStyle: '',
          }],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const inputTextBeforeSubmit = input.textContent?.trim() ?? '';
      const currentInput = document.querySelector('[data-testid="home-hero-input"]');
      if (currentInput !== input || inputTextBeforeSubmit !== prompt) {
        throw new Error('packaged first Home run prompt was not retained on the current composer');
      }

      const state = {
        hrefBefore: location.href,
        inputTextBeforeSubmit,
        instrumented: true,
        navigationEntryCountBefore: performance.getEntriesByType('navigation').length,
        performanceTimeOriginBefore: performance.timeOrigin,
        readiness,
        createRunRequestCount: 0,
        createRunResponseStatuses: [],
        createdRuns: [],
        createRunCaptureErrors: [],
        runEventRequestCount: 0,
        runEventResponseStatuses: [],
        submitClicked: false,
        workspaceRequestHeaders: {},
        workspaceTabClicksBeforeOutput: 0,
      };

      const originalFetch = globalThis.fetch.bind(globalThis);
      state.originalFetch = originalFetch;
      globalThis.fetch = async (...args) => {
        const [input, init] = args;
        const requestUrl = input instanceof Request ? input.url : String(input);
        const requestMethod = (
          init?.method ?? (input instanceof Request ? input.method : 'GET')
        ).toUpperCase();
        const pathname = new URL(requestUrl, location.href).pathname;
        const isCreateRun = requestMethod === 'POST' && pathname === '/api/runs';
        const isRunEvents =
          requestMethod === 'GET'
          && pathname.startsWith('/api/runs/')
          && pathname.endsWith('/events')
          && pathname.split('/').length === 5;
        if (isCreateRun) {
          const requestHeaders = new Headers(
            input instanceof Request ? input.headers : init?.headers,
          );
          const workspaceId = requestHeaders.get('x-od-workspace-id');
          const workspaceMemberId = requestHeaders.get('x-od-workspace-member-id');
          state.workspaceRequestHeaders = {
            ...(workspaceId ? { 'x-od-workspace-id': workspaceId } : {}),
            ...(workspaceMemberId ? { 'x-od-workspace-member-id': workspaceMemberId } : {}),
          };
          state.createRunRequestCount += 1;
        }
        if (isRunEvents) state.runEventRequestCount += 1;
        const response = await originalFetch(...args);
        if (isCreateRun) {
          state.createRunResponseStatuses.push(response.status);
          if (response.ok) {
            try {
              const body = await response.clone().json();
              if (typeof body.runId !== 'string' || typeof body.conversationId !== 'string') {
                throw new Error('accepted Home run response has no run/conversation identity');
              }
              state.createdRuns.push({ runId: body.runId, conversationId: body.conversationId });
            } catch (error) {
              state.createRunCaptureErrors.push(String(error));
            }
          }
        }
        if (isRunEvents) state.runEventResponseStatuses.push(response.status);
        return response;
      };

      document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[role="tab"], [data-testid="workspace-home-chrome"]')) {
          state.workspaceTabClicksBeforeOutput += 1;
        }
      }, true);
      globalThis[stateKey] = state;

      return {
        hrefBefore: state.hrefBefore,
        inputTextBeforeSubmit: state.inputTextBeforeSubmit,
        instrumented: true,
        navigationEntryCountBefore: state.navigationEntryCountBefore,
        performanceTimeOriginBefore: state.performanceTimeOriginBefore,
        readiness,
        submitClicked: state.submitClicked,
      };
    })()
  `;
}

export function packagedHomeFirstRunSubmitExpression(): string {
  return `
    (() => {
      const state = globalThis.__odPackagedHomeFirstRun;
      const submit = document.querySelector('[data-testid="home-hero-submit"]');
      const visible = submit instanceof HTMLElement && submit.getClientRects().length > 0;
      const ready = submit instanceof HTMLButtonElement && visible && !submit.disabled;
      if (ready && state?.submitClicked !== true) {
        submit.click();
        state.submitClicked = true;
      }
      return { ready, submitClicked: state?.submitClicked === true };
    })()
  `;
}

export type PackagedHomeFirstRunSnapshotOptions = {
  /** How long the page may keep polling before returning its last observation. */
  awaitMs?: number;
  pollIntervalMs?: number;
  /** Which stage's stop condition ends the in-page wait early. */
  stage?: PackagedHomeFirstRunStage;
};

/**
 * Observe the first packaged run, polling *inside* the page until this stage's
 * stop condition holds or the caller's window expires.
 *
 * Every observation used to cost one `tools-pack mac inspect` process, so the
 * sampling rate was bounded by Node + tsx startup rather than by the product.
 * The wait now lives where the state does; the caller only pays process startup
 * once per window.
 */
export function packagedHomeFirstRunSnapshotExpression(
  options: PackagedHomeFirstRunSnapshotOptions = {},
): string {
  const stage: PackagedHomeFirstRunStage = options.stage ?? 'assistant-output';
  const awaitMs = Math.max(0, Math.trunc(options.awaitMs ?? 0));
  const pollIntervalMs = Math.max(0, Math.trunc(options.pollIntervalMs ?? 500));
  return `
    (async () => {
      const expectedOutput = ${JSON.stringify(PACKAGED_HOME_FIRST_RUN_OUTPUT)};
      const stage = ${JSON.stringify(stage)};
      const awaitMs = ${awaitMs};
      const pollIntervalMs = ${pollIntervalMs};
      const state = globalThis.__odPackagedHomeFirstRun;
      const selectRun = ${selectPackagedHomeRun.toString()};
      const diagnosticFetch = typeof state?.originalFetch === 'function'
        ? state.originalFetch
        : globalThis.fetch.bind(globalThis);
      const diagnosticRequestInit = { headers: state?.workspaceRequestHeaders ?? {} };

      async function collect() {
        const [route, encodedProjectId, conversationsRoute, encodedConversationId] =
          location.pathname.split('/').filter(Boolean);
        const projectId = route === 'projects' && encodedProjectId
          ? decodeURIComponent(encodedProjectId)
          : '';
        const conversationId = conversationsRoute === 'conversations' && encodedConversationId
          ? decodeURIComponent(encodedConversationId)
          : '';
        const assistant = Array.from(document.querySelectorAll('[data-assistant-message-id]')).find(
          (candidate) => candidate.textContent?.includes(expectedOutput),
        );
        const runsResponse = projectId
          ? await diagnosticFetch(
              '/api/runs?projectId=' + encodeURIComponent(projectId),
              diagnosticRequestInit,
            )
          : null;
        const runsBody = runsResponse?.ok ? await runsResponse.json() : { runs: [] };
        const runs = Array.isArray(runsBody?.runs) ? runsBody.runs : [];
        const runStatuses = runs.map((run) => String(run?.status ?? ''));
        const selection = selectRun(runs, state?.createdRuns ?? [], conversationId);
        const terminalRun = selection.terminalStatus ? selection.run : null;
        // Messages and events only become interesting once the daemon owns a
        // finished run, so a still-running first stage stays a single cheap
        // request instead of three.
        const eventsResponse = terminalRun?.id
          ? await diagnosticFetch(
              '/api/runs/' + encodeURIComponent(terminalRun.id) + '/events',
              diagnosticRequestInit,
            )
          : null;
        const eventsText = eventsResponse?.ok ? await eventsResponse.text() : '';
        const messagesResponse = terminalRun && projectId && conversationId
          ? await diagnosticFetch(
              '/api/projects/' + encodeURIComponent(projectId)
                + '/conversations/' + encodeURIComponent(conversationId) + '/messages',
              diagnosticRequestInit,
            )
          : null;
        const messagesBody = messagesResponse?.ok
          ? await messagesResponse.json()
          : { messages: [] };
        const messages = Array.isArray(messagesBody?.messages) ? messagesBody.messages : [];
        const daemonAssistantText = messages
          .filter((message) => message?.role === 'assistant')
          .map((message) => String(message?.content ?? ''))
          .join(String.fromCharCode(10));
        const assistantText = assistant?.textContent ?? '';
        const runEventsContainExpectedOutput = eventsText.includes(expectedOutput);

        return {
          assistantText,
          conversationId,
          createRunRequestCount: state?.createRunRequestCount ?? -1,
          createRunResponseStatuses: state?.createRunResponseStatuses ?? [],
          daemonAssistantText,
          hrefAfter: location.href,
          hrefBefore: state?.hrefBefore ?? '',
          inPageWaitedMs: 0,
          inputTextBeforeSubmit: state?.inputTextBeforeSubmit ?? '',
          navigationEntryCountAfter: performance.getEntriesByType('navigation').length,
          navigationEntryCountBefore: state?.navigationEntryCountBefore ?? -1,
          outputVisible:
            assistantText.includes(expectedOutput)
            && daemonAssistantText.includes(expectedOutput)
            && runEventsContainExpectedOutput,
          performanceTimeOriginAfter: performance.timeOrigin,
          performanceTimeOriginBefore: state?.performanceTimeOriginBefore ?? -1,
          projectId,
          runId: selection.run?.id ?? '',
          strategyRolloutDecision: selection.rootRun?.strategyRolloutDecision ?? null,
          strategyTask: selection.rootRun?.strategyTask ?? null,
          runEventRequestCount: state?.runEventRequestCount ?? -1,
          runEventResponseStatuses: state?.runEventResponseStatuses ?? [],
          runEventsContainExpectedOutput,
          runReachedTerminal: terminalRun != null,
          runStatuses,
          submitClicked: state?.submitClicked === true,
          terminalRunStatus: selection.terminalStatus,
          workspaceTabClicksBeforeOutput: state?.workspaceTabClicksBeforeOutput ?? -1,
        };
      }

      function satisfied(snapshot) {
        return stage === 'run-terminal' ? snapshot.runReachedTerminal : snapshot.outputVisible;
      }

      const startedAt = Date.now();
      let snapshot = await collect();
      while (!satisfied(snapshot) && Date.now() - startedAt < awaitMs) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        snapshot = await collect();
      }
      snapshot.inPageWaitedMs = Date.now() - startedAt;
      return snapshot;
    })()
  `;
}

/**
 * Read everything a post-mortem needs out of the page in one inspection.
 *
 * Deliberately raw: the three observations a failed first run leaves behind (the
 * rendered DOM, the daemon's conversation messages, the run event stream) each
 * only say "no output" on their own, and none of them can falsify the others.
 * The daemon's own run rows are what separate "still running" from "failed", so
 * capture them verbatim rather than as a derived boolean.
 */
export function packagedHomeFirstRunDiagnosticsExpression(maxTextChars = 64_000): string {
  const limit = Math.max(1_000, Math.trunc(maxTextChars));
  return `
    (async () => {
      const limit = ${limit};
      const state = globalThis.__odPackagedHomeFirstRun;
      const selectRun = ${selectPackagedHomeRun.toString()};
      const diagnosticFetch = typeof state?.originalFetch === 'function'
        ? state.originalFetch
        : globalThis.fetch.bind(globalThis);
      const diagnosticRequestInit = { headers: state?.workspaceRequestHeaders ?? {} };
      const clip = (value) => {
        const text = String(value ?? '');
        return text.length > limit ? text.slice(0, limit) + '…[truncated]' : text;
      };
      const read = async (path) => {
        try {
          const response = await diagnosticFetch(path, diagnosticRequestInit);
          return { path, status: response.status, body: clip(await response.text()) };
        } catch (error) {
          return {
            path,
            status: -1,
            body: '',
            error: error instanceof Error ? error.name + ': ' + error.message : String(error),
          };
        }
      };

      const [route, encodedProjectId, conversationsRoute, encodedConversationId] =
        location.pathname.split('/').filter(Boolean);
      const projectId = route === 'projects' && encodedProjectId
        ? decodeURIComponent(encodedProjectId)
        : '';
      const conversationId = conversationsRoute === 'conversations' && encodedConversationId
        ? decodeURIComponent(encodedConversationId)
        : '';

      const runs = await read(
        projectId ? '/api/runs?projectId=' + encodeURIComponent(projectId) : '/api/runs',
      );
      let parsedRuns = [];
      try {
        const parsed = JSON.parse(runs.body);
        parsedRuns = Array.isArray(parsed?.runs) ? parsed.runs : [];
      } catch {}
      const selection = selectRun(parsedRuns, state?.createdRuns ?? [], conversationId);
      const terminalRun = selection.run;
      const events = terminalRun?.id
        ? await read('/api/runs/' + encodeURIComponent(terminalRun.id) + '/events')
        : null;
      const messages = projectId && conversationId
        ? await read(
            '/api/projects/' + encodeURIComponent(projectId)
              + '/conversations/' + encodeURIComponent(conversationId) + '/messages',
          )
        : null;

      return {
        capturedAt: new Date().toISOString(),
        conversationId,
        createRunRequestCount: state?.createRunRequestCount ?? -1,
        createRunResponseStatuses: state?.createRunResponseStatuses ?? [],
        createdRuns: state?.createdRuns ?? [],
        createRunCaptureErrors: state?.createRunCaptureErrors ?? [],
        runId: selection.run?.id ?? '',
        strategyRolloutDecision: selection.rootRun?.strategyRolloutDecision ?? null,
        strategyTask: selection.rootRun?.strategyTask ?? null,
        events,
        href: location.href,
        instrumented: state?.instrumented === true,
        messages,
        projectId,
        runEventRequestCount: state?.runEventRequestCount ?? -1,
        runEventResponseStatuses: state?.runEventResponseStatuses ?? [],
        runStatuses: parsedRuns.map((run) => String(run?.status ?? '')),
        runs,
        submitClicked: state?.submitClicked === true,
        title: document.title,
        workspaceTabClicksBeforeOutput: state?.workspaceTabClicksBeforeOutput ?? -1,
      };
    })()
  `;
}

export function assertPackagedHomeFirstRunResult(
  value: unknown,
): PackagedHomeFirstRunResult {
  const candidate = value as Partial<PackagedHomeFirstRunResult> | null;
  if (
    candidate == null
    || typeof candidate !== 'object'
    || typeof candidate.assistantText !== 'string'
    || typeof candidate.conversationId !== 'string'
    || typeof candidate.createRunRequestCount !== 'number'
    || !Array.isArray(candidate.createRunResponseStatuses)
    || typeof candidate.daemonAssistantText !== 'string'
    || typeof candidate.hrefAfter !== 'string'
    || typeof candidate.hrefBefore !== 'string'
    || typeof candidate.inPageWaitedMs !== 'number'
    || typeof candidate.inputTextBeforeSubmit !== 'string'
    || typeof candidate.navigationEntryCountAfter !== 'number'
    || typeof candidate.navigationEntryCountBefore !== 'number'
    || typeof candidate.outputVisible !== 'boolean'
    || typeof candidate.performanceTimeOriginAfter !== 'number'
    || typeof candidate.performanceTimeOriginBefore !== 'number'
    || typeof candidate.projectId !== 'string'
    || typeof candidate.runId !== 'string'
    || typeof candidate.runEventRequestCount !== 'number'
    || !Array.isArray(candidate.runEventResponseStatuses)
    || typeof candidate.runEventsContainExpectedOutput !== 'boolean'
    || typeof candidate.runReachedTerminal !== 'boolean'
    || !Array.isArray(candidate.runStatuses)
    || typeof candidate.submitClicked !== 'boolean'
    || typeof candidate.terminalRunStatus !== 'string'
    || typeof candidate.workspaceTabClicksBeforeOutput !== 'number'
  ) {
    throw new Error(`unexpected packaged first Home run value: ${JSON.stringify(value)}`);
  }
  return candidate as PackagedHomeFirstRunResult;
}

/**
 * Clamp the caller's remaining budget into one in-page wait window.
 *
 * Returns 0 once the budget is spent so the caller stops issuing inspections
 * instead of paying for one more process it has no time to use.
 */
export function packagedHomeFirstRunInPageAwaitMs(
  remainingMs: number,
  windowMs: number = PACKAGED_HOME_FIRST_RUN_IN_PAGE_WINDOW_MS,
): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
  return Math.min(Math.trunc(remainingMs), Math.max(0, Math.trunc(windowMs)));
}

export function packagedHomeFirstRunStageSatisfied(
  stage: PackagedHomeFirstRunStage,
  snapshot: PackagedHomeFirstRunResult,
): boolean {
  return stage === 'run-terminal' ? snapshot.runReachedTerminal : snapshot.outputVisible;
}

/**
 * Name the one thing that did not happen, so a red gate is actionable without a
 * packaged runtime in hand.
 *
 * Three observations (DOM, daemon messages, run events) all report "no output"
 * when a run is merely slow AND when it has already failed. Ordering the checks
 * from "never left Home" down to "succeeded but nothing rendered" makes the
 * report say which of those it actually was.
 */
export function describePackagedHomeFirstRunStall(
  stage: PackagedHomeFirstRunStage,
  snapshot: PackagedHomeFirstRunResult | null,
): string {
  if (snapshot == null) {
    return 'no readable snapshot was collected: every packaged inspection failed or returned an unexpected shape';
  }
  if (!snapshot.submitClicked) {
    return 'the Home composer submit was never registered, so no run was ever requested';
  }
  if (stage === 'run-terminal') {
    if (snapshot.projectId === '') {
      return `the window never left Home (${snapshot.hrefAfter}): POST /api/projects did not route to /projects/:id`;
    }
    if (snapshot.createRunRequestCount <= 0) {
      return 'the project route mounted but POST /api/runs was never sent, so the auto-send effect did not fire';
    }
    if (snapshot.runStatuses.length === 0) {
      return `POST /api/runs was sent ${snapshot.createRunRequestCount} time(s) (statuses ${formatStatuses(snapshot.createRunResponseStatuses)}) but the daemon has no run row for this project`;
    }
    if (snapshot.runId === '') {
      return 'the submitted Home run could not be bound to its conversation/task; inspect createdRuns and createRunCaptureErrors';
    }
    return `the run is still ${snapshot.runStatuses.join(', ')} and never reached a terminal status`;
  }
  if (!snapshot.runReachedTerminal) {
    return `the run left its terminal status and is now ${snapshot.runStatuses.join(', ') || 'absent'}`;
  }
  if (snapshot.terminalRunStatus !== 'succeeded') {
    return `the run finished as ${snapshot.terminalRunStatus}: this is a failed run, not a slow one`;
  }
  const missing = [
    snapshot.assistantText.includes(PACKAGED_HOME_FIRST_RUN_OUTPUT) ? null : 'the rendered assistant message',
    snapshot.daemonAssistantText.includes(PACKAGED_HOME_FIRST_RUN_OUTPUT) ? null : 'the daemon conversation messages',
    snapshot.runEventsContainExpectedOutput ? null : 'the run event stream',
  ].filter((entry): entry is string => entry != null);
  if (missing.length === 0) return 'every observation carries the expected output';
  return `the run succeeded but the expected output is missing from ${missing.join(' and ')}`;
}

function formatStatuses(statuses: number[]): string {
  return statuses.length === 0 ? '(none)' : statuses.join(', ');
}
