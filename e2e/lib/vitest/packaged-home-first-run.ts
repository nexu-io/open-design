export const PACKAGED_HOME_FIRST_RUN_PROMPT =
  'Create a delayed deterministic smoke artifact';

export const PACKAGED_HOME_FIRST_RUN_OUTPUT =
  'I recovered the delayed reasoning path and will persist the artifact now.';

export type PackagedHomeFirstRunResult = {
  assistantText: string;
  conversationId: string;
  createRunRequestCount: number;
  createRunResponseStatuses: number[];
  daemonAssistantText: string;
  hrefAfter: string;
  hrefBefore: string;
  inputTextBeforeSubmit: string;
  injectedAuthorityOutageCount: number;
  navigationEntryCountAfter: number;
  navigationEntryCountBefore: number;
  performanceTimeOriginAfter: number;
  performanceTimeOriginBefore: number;
  projectId: string;
  runEventRequestCount: number;
  runEventResponseStatuses: number[];
  runEventsContainExpectedOutput: boolean;
  submitClicked: boolean;
  workspaceTabClicksBeforeOutput: number;
};

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
        injectedAuthorityOutageCount: 0,
        navigationEntryCountBefore: performance.getEntriesByType('navigation').length,
        performanceTimeOriginBefore: performance.timeOrigin,
        readiness,
        createRunRequestCount: 0,
        createRunResponseStatuses: [],
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
          if (state.injectedAuthorityOutageCount === 0) {
            state.injectedAuthorityOutageCount += 1;
            state.createRunResponseStatuses.push(503);
            return new Response(JSON.stringify({
              error: {
                code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
                message: 'workspace membership authority is temporarily unavailable',
                retryable: true,
              },
            }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
        if (isRunEvents) state.runEventRequestCount += 1;
        const response = await originalFetch(...args);
        if (isCreateRun) state.createRunResponseStatuses.push(response.status);
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

export function packagedHomeFirstRunSnapshotExpression(): string {
  return `
    (async () => {
      const expectedOutput = ${JSON.stringify(PACKAGED_HOME_FIRST_RUN_OUTPUT)};
      const state = globalThis.__odPackagedHomeFirstRun;
      const diagnosticFetch = typeof state?.originalFetch === 'function'
        ? state.originalFetch
        : globalThis.fetch.bind(globalThis);
      const diagnosticRequestInit = { headers: state?.workspaceRequestHeaders ?? {} };
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
      const terminalRun = runs.find((run) =>
        ['succeeded', 'failed', 'canceled'].includes(String(run?.status)),
      );
      const eventsResponse = terminalRun?.id
        ? await diagnosticFetch(
            '/api/runs/' + encodeURIComponent(terminalRun.id) + '/events',
            diagnosticRequestInit,
          )
        : null;
      const eventsText = eventsResponse?.ok ? await eventsResponse.text() : '';
      const messagesResponse = projectId && conversationId
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

      return {
        assistantText: assistant?.textContent ?? '',
        conversationId,
        createRunRequestCount: state?.createRunRequestCount ?? -1,
        createRunResponseStatuses: state?.createRunResponseStatuses ?? [],
        daemonAssistantText,
        hrefAfter: location.href,
        hrefBefore: state?.hrefBefore ?? '',
        inputTextBeforeSubmit: state?.inputTextBeforeSubmit ?? '',
        injectedAuthorityOutageCount: state?.injectedAuthorityOutageCount ?? -1,
        navigationEntryCountAfter: performance.getEntriesByType('navigation').length,
        navigationEntryCountBefore: state?.navigationEntryCountBefore ?? -1,
        performanceTimeOriginAfter: performance.timeOrigin,
        performanceTimeOriginBefore: state?.performanceTimeOriginBefore ?? -1,
        projectId,
        runEventRequestCount: state?.runEventRequestCount ?? -1,
        runEventResponseStatuses: state?.runEventResponseStatuses ?? [],
        runEventsContainExpectedOutput: eventsText.includes(expectedOutput),
        submitClicked: state?.submitClicked === true,
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
    || typeof candidate.inputTextBeforeSubmit !== 'string'
    || typeof candidate.injectedAuthorityOutageCount !== 'number'
    || typeof candidate.navigationEntryCountAfter !== 'number'
    || typeof candidate.navigationEntryCountBefore !== 'number'
    || typeof candidate.performanceTimeOriginAfter !== 'number'
    || typeof candidate.performanceTimeOriginBefore !== 'number'
    || typeof candidate.projectId !== 'string'
    || typeof candidate.runEventRequestCount !== 'number'
    || !Array.isArray(candidate.runEventResponseStatuses)
    || typeof candidate.runEventsContainExpectedOutput !== 'boolean'
    || typeof candidate.submitClicked !== 'boolean'
    || typeof candidate.workspaceTabClicksBeforeOutput !== 'number'
  ) {
    throw new Error(`unexpected packaged first Home run value: ${JSON.stringify(value)}`);
  }
  return candidate as PackagedHomeFirstRunResult;
}
