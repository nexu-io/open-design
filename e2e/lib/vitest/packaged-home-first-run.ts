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

/**
 * Instruments the first packaged Home send without recovering the renderer.
 * Output observation is polled through a separate expression, so this setup
 * never reloads the page or clicks a workspace tab after submission.
 */
export function packagedHomeFirstRunExpression(): string {
  return `
    (async () => {
      const prompt = ${JSON.stringify(PACKAGED_HOME_FIRST_RUN_PROMPT)};
      const stateKey = '__odPackagedHomeFirstRun';
      const state = {
        hrefBefore: location.href,
        inputTextBeforeSubmit: '',
        injectedAuthorityOutageCount: 0,
        navigationEntryCountBefore: performance.getEntriesByType('navigation').length,
        performanceTimeOriginBefore: performance.timeOrigin,
        createRunRequestCount: 0,
        createRunResponseStatuses: [],
        runEventRequestCount: 0,
        runEventResponseStatuses: [],
        submitClicked: false,
        workspaceRequestHeaders: {},
        workspaceTabClicksBeforeOutput: 0,
      };
      globalThis[stateKey] = state;

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

      const input = document.querySelector('[data-testid="home-hero-input"]');
      const visible = input instanceof HTMLElement && input.getClientRects().length > 0;
      if (!visible || !(input instanceof HTMLElement) || !input.isContentEditable) {
        throw new Error('packaged first Home run found no visible Lexical composer');
      }
      const editor = input.__lexicalEditor;
      if (!editor?.parseEditorState || !editor?.setEditorState) {
        throw new Error('packaged first Home run could not resolve the Lexical editor');
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
      state.inputTextBeforeSubmit = input.textContent?.trim() ?? '';

      return {
        hrefBefore: state.hrefBefore,
        inputTextBeforeSubmit: state.inputTextBeforeSubmit,
        navigationEntryCountBefore: state.navigationEntryCountBefore,
        performanceTimeOriginBefore: state.performanceTimeOriginBefore,
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
