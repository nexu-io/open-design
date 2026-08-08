import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

import {
  MCP_SERVER_INSTRUCTIONS,
  _localeFromMcpToolMetadata,
  createLocalMcpBriefStore,
  handleMcpToolCall,
  localMcpResourceDefinitions,
  localMcpToolDefinitions,
} from '../src/mcp.js';
import { OPEN_DESIGN_BRIEF_APP_HTML } from '../src/mcp-apps/brief-resource.js';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
  JSDOM: new (
    html: string,
    options: {
      beforeParse(window: any): void;
      pretendToBeVisual: boolean;
      referrer: string;
      runScripts: 'dangerously';
      url: string;
    },
  ) => { window: any };
};

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
};

const WEBSITE_BRIEF_PAYLOAD = {
  view: 'brief-form',
  artifactType: 'website',
  locale: 'en',
  localeSource: 'provided',
  briefDraftId: 'brief-draft-test',
  nonce: 'brief-nonce-test',
  questionForm: {
    title: 'Choose the website direction',
    description: 'Choose one option.',
    submitLabel: 'Confirm brief',
    questions: [
      {
        id: 'website.goal',
        label: 'What should this website do?',
        defaultValue: 'launch-product',
        options: [
          {
            value: 'launch-product',
            label: 'Launch a product',
            description: 'Explain the value and drive sign-ups.',
          },
        ],
      },
    ],
  },
};

async function eventually(assertion: () => void, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

function createBriefAppHarness(options: {
  deferInitialization?: boolean;
  hostCapabilities?: Record<string, unknown>;
  initialPayload?: typeof WEBSITE_BRIEF_PAYLOAD;
  failFirstMessage?: boolean;
  failFirstLegacyFollowUp?: boolean;
  legacyFollowUp?: boolean;
  nativeToolOutput?: typeof WEBSITE_BRIEF_PAYLOAD;
} = {}) {
  const requests: JsonRpcMessage[] = [];
  const legacyFollowUps: Array<{ prompt: string; scrollToBottom?: boolean }> = [];
  let failNextMessage = options.failFirstMessage === true;
  let failNextLegacyFollowUp = options.failFirstLegacyFollowUp === true;
  let pendingInitializationId: string | null = null;
  let widgetWindow: any;

  function confirmationResult(): Record<string, unknown> {
    return {
      structuredContent: {
        view: 'brief-confirmed',
        artifactType: 'website',
        briefConfirmationId: 'brief-confirmation-test',
        summary: 'What should this website do?: Launch a product',
      },
    };
  }

  function initializationResult(): Record<string, unknown> {
    return {
      hostContext: { locale: 'en' },
      hostCapabilities: options.hostCapabilities ?? {
        message: { text: true },
        serverTools: {},
        updateModelContext: { text: true },
      },
      ...(options.initialPayload
        ? { structuredContent: options.initialPayload }
        : {}),
    };
  }

  const parent = {
    postMessage(message: JsonRpcMessage): void {
      requests.push(message);
      if (!message.id || !message.method) return;
      queueMicrotask(() => {
        if (message.method === 'ui/message' && failNextMessage) {
          failNextMessage = false;
          respond(message.id!, undefined, {
            code: -32_000,
            message: 'Host rejected the follow-up message.',
          });
          return;
        }
        if (message.method === 'ui/initialize') {
          if (options.deferInitialization) {
            pendingInitializationId = message.id!;
            return;
          }
          respond(message.id!, initializationResult());
          return;
        }
        if (message.method === 'tools/call') {
          respond(message.id!, confirmationResult());
          return;
        }
        respond(message.id!, {});
      });
    },
  };

  function dispatch(message: JsonRpcMessage): void {
    widgetWindow.dispatchEvent(new widgetWindow.MessageEvent('message', {
      data: message,
      origin: 'https://host.test',
      source: parent as never,
    }));
  }

  function respond(
    id: string,
    result?: Record<string, unknown>,
    error?: { code: number; message: string },
  ): void {
    dispatch({
      jsonrpc: '2.0',
      id,
      ...(error ? { error } : { result }),
    } as JsonRpcMessage);
  }

  const dom = new JSDOM(OPEN_DESIGN_BRIEF_APP_HTML, {
    beforeParse(window) {
      widgetWindow = window;
      if (options.legacyFollowUp || options.nativeToolOutput) {
        const openai: Record<string, unknown> = {};
        if (options.nativeToolOutput) {
          openai.toolOutput = options.nativeToolOutput;
          openai.callTool = async () => confirmationResult();
        }
        if (options.legacyFollowUp) {
          openai.sendFollowUpMessage = async (
            input: { prompt: string; scrollToBottom?: boolean },
          ) => {
            legacyFollowUps.push(input);
            if (failNextLegacyFollowUp) {
              failNextLegacyFollowUp = false;
              throw new Error('Host rejected the follow-up message.');
            }
          };
        }
        Object.defineProperty(window, 'openai', {
          configurable: true,
          value: openai,
        });
      }
      Object.defineProperty(window, 'parent', {
        configurable: true,
        value: parent,
      });
      Object.defineProperty(window, 'ResizeObserver', {
        configurable: true,
        value: class {
          observe(): void {}
          disconnect(): void {}
        },
      });
    },
    pretendToBeVisual: true,
    referrer: 'https://host.test/task',
    runScripts: 'dangerously',
    url: 'https://widget.test/brief',
  });
  widgetWindow = dom.window;

  return {
    dom,
    legacyFollowUps,
    requests,
    rejectInitialization(): void {
      if (!pendingInitializationId) {
        throw new Error('No deferred initialization request is pending.');
      }
      const id = pendingInitializationId;
      pendingInitializationId = null;
      respond(id, undefined, {
        code: -32_000,
        message: 'Host rejected initialization.',
      });
    },
    resolveInitialization(): void {
      if (!pendingInitializationId) {
        throw new Error('No deferred initialization request is pending.');
      }
      const id = pendingInitializationId;
      pendingInitializationId = null;
      respond(id, initializationResult());
    },
    notifyToolResult(payload: typeof WEBSITE_BRIEF_PAYLOAD): void {
      dispatch({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: {
          result: { structuredContent: payload },
        },
      });
    },
  };
}

describe('local Open Design MCP brief app', () => {
  it('exposes collect_brief through the canonical MCP Apps resource', () => {
    const collectBrief = localMcpToolDefinitions().find(
      (tool) => tool.name === 'collect_brief',
    );

    expect(collectBrief).toMatchObject({
      name: 'collect_brief',
      _meta: {
        ui: {
          resourceUri: 'ui://open-design/artifact-card-v8.html',
        },
        'ui/resourceUri': 'ui://open-design/artifact-card-v8.html',
        'openai/outputTemplate': 'ui://open-design/artifact-card-v8.html',
      },
    });
    expect(localMcpResourceDefinitions()).toContainEqual(
      expect.objectContaining({
        uri: 'ui://open-design/artifact-card-v8.html',
        mimeType: 'text/html;profile=mcp-app',
      }),
    );

    const confirmBrief = localMcpToolDefinitions().find(
      (tool) => tool.name === 'confirm_brief',
    );
    expect(confirmBrief).not.toHaveProperty('_meta');
  });

  it('keeps one brief card without a self-triggering resize observer', () => {
    expect(OPEN_DESIGN_BRIEF_APP_HTML).not.toContain('ResizeObserver');
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'ui/notifications/size-changed',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain('{ width, height }');
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain('document.body.scrollHeight');
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'width: Math.ceil(window.innerWidth)',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'width === lastWidth && height === lastHeight',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain('notifyIntrinsicHeight');
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain('requestAnimationFrame');
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'ui/notifications/host-context-changed',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'updateHostLocale(result && result.hostContext)',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'draft.localeSource === "fallback"',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'payload.questionFormsByLocale',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'draft.briefDraftId === payload.briefDraftId',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).toContain(
      'candidate.value === (previousValue || item.defaultValue)',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).not.toContain(
      'error instanceof Error ? error.message',
    );
    expect(OPEN_DESIGN_BRIEF_APP_HTML).not.toContain('setWidgetState');
  });

  it('keeps a confirmed brief locked and retries only Host publication', async () => {
    const harness = createBriefAppHarness({
      initialPayload: WEBSITE_BRIEF_PAYLOAD,
      failFirstMessage: true,
    });
    const { document } = harness.dom.window;

    await eventually(() => {
      expect(document.querySelector('form')?.hidden).toBe(false);
    });
    const submitEvent = () => new harness.dom.window.Event('submit', {
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('form')?.dispatchEvent(submitEvent());
    document.querySelector('form')?.dispatchEvent(submitEvent());

    await eventually(() => {
      expect(document.querySelector('#continue')?.hidden)
        .toBe(false);
    });
    expect(document.querySelector('#confirm')?.disabled)
      .toBe(true);
    expect(document.querySelector('input')?.disabled)
      .toBe(true);
    expect(document.querySelector('#status')?.textContent)
      .toContain('already confirmed');
    expect(harness.requests.filter((request) => request.method === 'tools/call'))
      .toHaveLength(1);

    document.querySelector('#continue')?.click();
    await eventually(() => {
      expect(document.querySelector('#continue')?.hidden)
        .toBe(true);
      expect(document.querySelector('#status')?.textContent)
        .toContain('sent');
    });
    expect(harness.requests.filter((request) => request.method === 'tools/call'))
      .toHaveLength(1);
    expect(harness.requests.filter((request) => request.method === 'ui/message'))
      .toHaveLength(2);

    harness.notifyToolResult(WEBSITE_BRIEF_PAYLOAD);
    await eventually(() => {
      expect(document.querySelector('#confirm')?.hidden).toBe(true);
      expect(document.querySelector('input')?.disabled).toBe(true);
      expect(document.querySelector('#status')?.textContent)
        .toContain('sent');
    });
    expect(harness.requests.filter((request) => request.method === 'tools/call'))
      .toHaveLength(1);

    harness.dom.window.close();
  });

  it('publishes a readable message when the Host omits optional context updates', async () => {
    const harness = createBriefAppHarness({
      hostCapabilities: {
        message: { text: true },
        serverTools: {},
      },
      initialPayload: WEBSITE_BRIEF_PAYLOAD,
    });
    const { document } = harness.dom.window;

    await eventually(() => {
      expect(document.querySelector('form')?.hidden).toBe(false);
    });
    document.querySelector('form')?.dispatchEvent(
      new harness.dom.window.Event('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );

    await eventually(() => {
      expect(document.querySelector('#status')?.textContent).toContain('sent');
    });
    expect(
      harness.requests.filter(
        (request) => request.method === 'ui/update-model-context',
      ),
    ).toHaveLength(0);
    expect(
      harness.requests.filter((request) => request.method === 'ui/message'),
    ).toHaveLength(1);

    harness.dom.window.close();
  });

  it('prefers the Codex host follow-up bridge so the user turn has visible text', async () => {
    const harness = createBriefAppHarness({
      initialPayload: WEBSITE_BRIEF_PAYLOAD,
      legacyFollowUp: true,
    });
    const { document } = harness.dom.window;

    await eventually(() => {
      expect(document.querySelector('form')?.hidden).toBe(false);
    });
    document.querySelector('form')?.dispatchEvent(
      new harness.dom.window.Event('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );

    await eventually(() => {
      expect(harness.legacyFollowUps).toHaveLength(1);
    });
    expect(harness.legacyFollowUps[0]?.prompt).toContain(
      'What should this website do?: Launch a product',
    );
    expect(
      harness.requests.filter((request) => request.method === 'ui/message'),
    ).toHaveLength(0);
    const contextUpdates = harness.requests.filter(
      (request) => request.method === 'ui/update-model-context',
    );
    expect(contextUpdates).toHaveLength(1);
    expect(contextUpdates[0]?.params).toEqual({});

    harness.dom.window.close();
  });

  it('waits for delayed bridge initialization before clearing native brief context', async () => {
    const harness = createBriefAppHarness({
      deferInitialization: true,
      legacyFollowUp: true,
      nativeToolOutput: WEBSITE_BRIEF_PAYLOAD,
    });
    const { document } = harness.dom.window;
    const contextUpdates = () => harness.requests.filter(
      (request) => request.method === 'ui/update-model-context',
    );

    await eventually(() => {
      expect(document.querySelector('form')?.hidden).toBe(false);
    });
    document.querySelector('form')?.dispatchEvent(
      new harness.dom.window.Event('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );

    await eventually(() => {
      expect(harness.legacyFollowUps).toHaveLength(1);
    });
    expect(contextUpdates()).toHaveLength(0);
    expect(document.querySelector('#status')?.textContent)
      .toContain('Sending confirmed brief');

    harness.resolveInitialization();
    await eventually(() => {
      expect(contextUpdates()).toHaveLength(1);
      expect(document.querySelector('#status')?.textContent).toContain('sent');
    });
    expect(contextUpdates()[0]?.params).toEqual({});

    harness.dom.window.close();
  });

  it('warns after native publication when bridge initialization is rejected', async () => {
    const harness = createBriefAppHarness({
      deferInitialization: true,
      legacyFollowUp: true,
      nativeToolOutput: WEBSITE_BRIEF_PAYLOAD,
    });
    const { document } = harness.dom.window;

    await eventually(() => {
      expect(document.querySelector('form')?.hidden).toBe(false);
    });
    document.querySelector('form')?.dispatchEvent(
      new harness.dom.window.Event('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );

    await eventually(() => {
      expect(harness.legacyFollowUps).toHaveLength(1);
    });
    harness.rejectInitialization();
    await eventually(() => {
      expect(document.querySelector('#status')?.textContent)
        .toContain('could not be cleared');
    });
    expect(
      harness.requests.filter(
        (request) => request.method === 'ui/update-model-context',
      ),
    ).toHaveLength(0);

    harness.dom.window.close();
  });

  it('keeps Codex brief context for retry and clears it after publication succeeds', async () => {
    const harness = createBriefAppHarness({
      initialPayload: WEBSITE_BRIEF_PAYLOAD,
      failFirstLegacyFollowUp: true,
      legacyFollowUp: true,
    });
    const { document } = harness.dom.window;
    const contextUpdates = () => harness.requests.filter(
      (request) => request.method === 'ui/update-model-context',
    );

    await eventually(() => {
      expect(document.querySelector('form')?.hidden).toBe(false);
    });
    document.querySelector('input')?.dispatchEvent(
      new harness.dom.window.Event('change', { bubbles: true }),
    );
    await eventually(() => {
      expect(contextUpdates()).toHaveLength(1);
    });

    document.querySelector('form')?.dispatchEvent(
      new harness.dom.window.Event('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );
    await eventually(() => {
      expect(document.querySelector('#continue')?.hidden).toBe(false);
    });
    expect(contextUpdates()).toHaveLength(1);

    document.querySelector('#continue')?.click();
    await eventually(() => {
      expect(document.querySelector('#status')?.textContent).toContain('sent');
      expect(contextUpdates()).toHaveLength(2);
    });
    expect(harness.legacyFollowUps).toHaveLength(2);
    expect(contextUpdates().at(-1)?.params).toEqual({});

    harness.dom.window.close();
  });

  it('renders one compact loading instance and replaces it with a late tool result', async () => {
    const harness = createBriefAppHarness();
    const { document } = harness.dom.window;

    await eventually(() => {
      expect(document.querySelector('main')?.hidden).toBe(false);
      expect(document.querySelector('form')?.hidden).toBe(true);
      expect(document.querySelector('#status')?.textContent)
        .toContain('Loading brief');
    });

    const originalForm = document.querySelector('form');
    harness.notifyToolResult(WEBSITE_BRIEF_PAYLOAD);

    await eventually(() => {
      expect(document.querySelector('form')).toBe(originalForm);
      expect(document.querySelector('form')?.hidden).toBe(false);
      expect(document.querySelectorAll('form')).toHaveLength(1);
      expect(document.querySelectorAll('fieldset')).toHaveLength(1);
    });

    harness.notifyToolResult(WEBSITE_BRIEF_PAYLOAD);
    await eventually(() => {
      expect(document.querySelectorAll('form')).toHaveLength(1);
      expect(document.querySelectorAll('fieldset')).toHaveLength(1);
    });

    harness.dom.window.close();
  });

  it('lets Host context localize an otherwise language-neutral brief', async () => {
    const briefStore = createLocalMcpBriefStore();
    const collected = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'collect_brief',
      {
        artifactType: 'website',
        projectTitle: 'Host localized website',
      },
      { briefStore },
    );
    const payload = collected.structuredContent as {
      locale: string;
      localeSource: string;
      briefDraftId: string;
      nonce: string;
      questionForm: {
        questions: Array<{ id: string; defaultValue: string }>;
      };
      questionFormsByLocale: Record<
        string,
        {
          title: string;
          submitLabel: string;
          questions: Array<{ label: string }>;
        }
      >;
    };

    expect(payload).toMatchObject({
      locale: 'en',
      localeSource: 'fallback',
    });
    expect(payload.questionFormsByLocale['zh-CN']).toMatchObject({
      title: '选择网站方向',
      submitLabel: '确认需求',
    });
    expect(
      payload.questionFormsByLocale['zh-CN']?.questions[0],
    ).toMatchObject({
      label: '这个网站需要实现什么目标？',
    });

    const answers = Object.fromEntries(
      payload.questionForm.questions.map((question) => [
        question.id,
        [question.defaultValue],
      ]),
    );
    const confirmed = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'confirm_brief',
      {
        briefDraftId: payload.briefDraftId,
        nonce: payload.nonce,
        answers,
        locale: 'zh-CN',
      },
      { briefStore },
    );

    expect(confirmed.structuredContent).toMatchObject({ locale: 'zh-CN' });
    expect(String(confirmed.structuredContent?.summary)).toContain(
      '这个网站需要实现什么目标？',
    );
    expect(confirmed.content[0]?.text).toContain('需求已确认。');
  });

  it('accepts host locale metadata only as the collect_brief fallback', () => {
    expect(_localeFromMcpToolMetadata({
      'openai/locale': 'zh-CN',
    })).toBe('zh-CN');
    expect(_localeFromMcpToolMetadata({ locale: 'ja-JP' })).toBe('ja-JP');
    expect(_localeFromMcpToolMetadata({
      'openai/locale': ' ',
      locale: 42,
    })).toBeUndefined();
  });

  it('collects and confirms a human-readable website brief locally', async () => {
    const briefStore = createLocalMcpBriefStore();
    const collected = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'collect_brief',
      {
        artifactType: 'website',
        projectTitle: 'AI analytics startup',
      },
      { briefStore },
    );

    expect(collected.structuredContent).toMatchObject({
      view: 'brief-form',
      artifactType: 'website',
      questionForm: {
        submitLabel: 'Confirm brief',
      },
    });
    const draft = collected.structuredContent as {
      briefDraftId: string;
      nonce: string;
      questionForm: {
        questions: Array<{
          id: string;
          defaultValue?: string;
          options: Array<{ value: string }>;
        }>;
      };
    };
    const answers = Object.fromEntries(
      draft.questionForm.questions.map((question) => [
        question.id,
        [
          question.defaultValue
            ?? question.options[0]?.value
            ?? '',
        ],
      ]),
    );

    const confirmed = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'confirm_brief',
      {
        briefDraftId: draft.briefDraftId,
        nonce: draft.nonce,
        answers,
      },
      { briefStore },
    );

    expect(confirmed.structuredContent).toMatchObject({
      view: 'brief-confirmed',
      artifactType: 'website',
    });
    expect(String(confirmed.structuredContent?.summary)).toContain(
      'What should this website do?',
    );
    expect(String(confirmed.structuredContent?.summary)).not.toMatch(
      /^brief-confirmation-v1\./u,
    );
    expect(confirmed.content[0]?.text).toContain('Brief confirmed.');
    expect(confirmed.content[0]?.text).toContain(
      'What should this website do?',
    );
    expect(confirmed.content[0]?.text).not.toContain(
      'brief-confirmation-v1.',
    );
    expect(confirmed.content[0]?.text).not.toContain(draft.briefDraftId);
    expect(confirmed.content[0]?.text).not.toContain(draft.nonce);

    const repeated = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'confirm_brief',
      {
        briefDraftId: draft.briefDraftId,
        nonce: draft.nonce,
        answers,
      },
      { briefStore },
    );
    expect(repeated.structuredContent).toEqual(confirmed.structuredContent);
  });

  it.each([
    ['zh-CN', '选择网站方向', '确认需求', '这个网站需要实现什么目标？'],
    ['zh-TW', '選擇網站方向', '確認需求', '這個網站需要達成什麼目標？'],
    ['ja', 'ウェブサイトの方向性を選択', 'ブリーフを確認', 'このウェブサイトの目的は何ですか？'],
  ] as const)(
    'localizes website brief copy for explicit request locale %s without translating protocol ids',
    async (locale, expectedTitle, expectedSubmit, expectedQuestion) => {
      const briefStore = createLocalMcpBriefStore();
      const collected = await handleMcpToolCall(
        'http://127.0.0.1:17456',
        'collect_brief',
        {
          artifactType: 'website',
          locale,
          projectTitle: 'Localized website',
        },
        { briefStore },
      );
      const payload = collected.structuredContent as {
        locale: string;
        briefDraftId: string;
        nonce: string;
        questionForm: {
          title: string;
          submitLabel: string;
          questions: Array<{
            id: string;
            label: string;
            defaultValue: string;
            options: Array<{ value: string; label: string }>;
          }>;
        };
      };

      expect(payload.locale).toBe(locale);
      expect(payload.questionForm.title).toBe(expectedTitle);
      expect(payload.questionForm.submitLabel).toBe(expectedSubmit);
      expect(payload.questionForm.questions[0]).toMatchObject({
        id: 'website.goal',
        label: expectedQuestion,
        defaultValue: 'launch-product',
        options: [
          expect.objectContaining({ value: 'launch-product' }),
          expect.objectContaining({ value: 'sell-service' }),
          expect.objectContaining({ value: 'showcase-work' }),
        ],
      });
      expect(payload.questionForm.questions[0]?.options[0]?.label).not.toBe(
        'Launch a product',
      );

      const answers = Object.fromEntries(
        payload.questionForm.questions.map((question) => [
          question.id,
          [question.defaultValue],
        ]),
      );
      const confirmed = await handleMcpToolCall(
        'http://127.0.0.1:17456',
        'confirm_brief',
        {
          briefDraftId: payload.briefDraftId,
          nonce: payload.nonce,
          answers,
        },
        { briefStore },
      );

      expect(confirmed.structuredContent).toMatchObject({ locale });
      expect(String(confirmed.structuredContent?.summary)).toContain(
        expectedQuestion,
      );
      expect(confirmed.content[0]?.text).not.toContain('Brief confirmed.');
    },
  );

  it('falls back unsupported request locales to English', async () => {
    const collected = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'collect_brief',
      {
        artifactType: 'website',
        locale: 'fr-FR',
      },
      { briefStore: createLocalMcpBriefStore() },
    );

    expect(collected.structuredContent).toMatchObject({
      locale: 'en',
      questionForm: {
        title: 'Choose the website direction',
        submitLabel: 'Confirm brief',
      },
    });
  });

  it('keeps user-facing MCP copy on public Open Design product terms', () => {
    const visibleToolCopy = localMcpToolDefinitions()
      .flatMap((tool) => [
        tool.description,
        tool.annotations?.title,
        ...Object.values(tool.inputSchema.properties ?? {})
          .map((property) => property.description),
      ])
      .filter((value): value is string => typeof value === 'string')
      .join('\n');
    const visibleResourceCopy = localMcpResourceDefinitions()
      .flatMap((resource) => [
        resource.name,
        resource.title,
        resource.description,
      ])
      .filter((value): value is string => typeof value === 'string')
      .join('\n');
    const userFacingCopy = [
      visibleToolCopy,
      visibleResourceCopy,
      MCP_SERVER_INSTRUCTIONS,
    ].join('\n');

    expect(userFacingCopy).toContain('Open Design Cloud');
    expect(userFacingCopy).toContain('Local Codex');
    expect(userFacingCopy).not.toContain('Secure BYOK');
    expect(userFacingCopy).not.toMatch(/\b(?:Vela|AMR)\b/u);
    expect(userFacingCopy).not.toMatch(/agent\s*:\s*["']?[a-z]/iu);
  });
});
