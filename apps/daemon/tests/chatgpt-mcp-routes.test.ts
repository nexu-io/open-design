import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { Script } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeChatGptMcpRequest,
  CHATGPT_MCP_SCOPES,
  registerChatGptMcpRoutes,
  resolveChatGptMcpDaemonUrl,
  rewriteManagedTenantResultUrls,
} from '../src/routes/chatgpt-mcp.js';
import { createChatGptCapabilityToken } from '../src/services/chatgpt-capabilities.js';
import { chatGptTenantKey } from '../src/services/chatgpt-tenant-daemons.js';

const CHOICE_ONLY_QUESTION_TYPES = [
  'radio',
  'checkbox',
  'select',
  'switch',
  'direction-cards',
] as const;

function choiceQuestion(
  id: string,
  label = id,
  type: (typeof CHOICE_ONLY_QUESTION_TYPES)[number] = 'radio',
) {
  if (type === 'switch') {
    return { id, label, type, required: true, defaultValue: 'true' };
  }
  return {
    id,
    label,
    type,
    required: true,
    allowCustom: false,
    default: `${id}-recommended`,
    options: [
      { label: `${label} · Recommended`, value: `${id}-recommended`, description: 'Recommended from the brief.' },
      { label: `${label} · Alternative`, value: `${id}-alternative` },
    ],
    ...(type === 'checkbox' ? { maxSelections: 2 } : {}),
  };
}

function tailoredQuestionForm(id: string, questionIds: string[]) {
  return {
    id,
    title: `Confirm ${id}`,
    description: 'Only answer the decisions that are still unknown.',
    lang: 'en',
    submitLabel: 'Continue with these choices',
    questions: questionIds.map((questionId, index) => choiceQuestion(
      questionId,
      questionId,
      index === 1 ? 'checkbox' : 'radio',
    )),
  };
}

describe('ChatGPT Streamable HTTP MCP', () => {
  const servers: Array<{ close: (callback: (error?: Error) => void) => void }> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
  });

  it('exposes the Open Design tools and MCP Apps resource over /mcp', async () => {
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:9',
      env: { OD_CHATGPT_WIDGET_FRAME_DOMAINS: 'https://preview.open-design.ai,not-a-url' },
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const client = new Client({ name: 'chatgpt-mcp-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        'cancel_run',
        'collect_brief',
        'create_project',
        'export_project',
        'get_cloud_account',
        'get_run',
        'list_versions',
        'restore_version',
        'start_run',
      ]);
      expect(Object.fromEntries(tools.tools.map((tool) => [tool.name, tool._meta?.securitySchemes]))).toMatchObject({
        collect_brief: [{ type: 'noauth' }],
        get_cloud_account: [{ type: 'oauth2', scopes: ['opendesign.account.read'] }],
        create_project: [{ type: 'oauth2', scopes: ['opendesign.projects.write'] }],
        start_run: [{ type: 'oauth2', scopes: ['opendesign.runs.write'] }],
        get_run: [{ type: 'oauth2', scopes: ['opendesign.runs.read'] }],
        cancel_run: [{ type: 'oauth2', scopes: ['opendesign.runs.write'] }],
        list_versions: [{ type: 'oauth2', scopes: ['opendesign.projects.read'] }],
        restore_version: [{ type: 'oauth2', scopes: ['opendesign.versions.write'] }],
        export_project: [{ type: 'oauth2', scopes: ['opendesign.exports.read'] }],
      });
      expect(tools.tools.every((tool) => tool.outputSchema?.type === 'object')).toBe(true);
      expect(tools.tools.every((tool) => (
        (tool._meta as any)?.ui?.visibility?.join(',') === 'model,app'
        && (tool._meta as any)?.['openai/widgetAccessible'] === true
      ))).toBe(true);
      expect((tools.tools.find((tool) => tool.name === 'get_run')?.outputSchema as any)?.properties).toMatchObject({
        status: { enum: ['queued', 'running', 'succeeded', 'failed', 'canceled'] },
        artifactCount: { type: 'number', minimum: 0 },
        previewUrl: { type: 'string' },
        studioUrl: { type: 'string' },
        errorCode: { type: ['string', 'null'] },
      });
      expect(tools.tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
        'write_file',
        'delete_file',
        'delete_project',
        'create_artifact',
      ]));
      const startRun = tools.tools.find((tool) => tool.name === 'start_run');
      const widgetUri = 'ui://open-design/artifact-card-v10.html';
      const collectBrief = tools.tools.find((tool) => tool.name === 'collect_brief');
      expect(collectBrief?._meta?.['openai/outputTemplate']).toBe(widgetUri);
      expect((collectBrief?._meta as any)?.ui?.resourceUri).toBe(widgetUri);
      expect(startRun?._meta?.['openai/outputTemplate']).toBe(widgetUri);
      expect((startRun?._meta as any)?.ui?.resourceUri).toBe(widgetUri);
      expect(startRun?._meta?.['ui/resourceUri']).toBe(widgetUri);
      expect(tools.tools.find((tool) => tool.name === 'get_cloud_account')?._meta?.['openai/outputTemplate']).toBe(
        widgetUri,
      );
      expect(tools.tools.find((tool) => tool.name === 'get_run')?._meta?.['openai/outputTemplate']).toBeUndefined();
      expect(tools.tools.find((tool) => tool.name === 'list_versions')?._meta?.['openai/outputTemplate']).toBeUndefined();
      expect((startRun?.inputSchema as any).required).toEqual(['project', 'artifactType', 'brief', 'confirmed']);
      expect((startRun?.inputSchema as any).properties.artifactType.enum).toEqual([
        'website',
        'product-prototype',
        'presentation',
        'design-system',
        'image',
        'video',
        'audio',
        'document',
      ]);
      expect((startRun?.inputSchema as any).properties.plugin).toBeUndefined();
      expect((startRun?.inputSchema as any).properties.agent).toBeUndefined();
      const createProject = tools.tools.find((tool) => tool.name === 'create_project');
      expect((createProject?.inputSchema as any).required).toEqual(['name', 'artifactType']);
      expect((createProject?.inputSchema as any).properties.artifactType.enum).toEqual(
        (startRun?.inputSchema as any).properties.artifactType.enum,
      );
      const collectBriefInput = collectBrief?.inputSchema as any;
      expect(collectBriefInput.required).toEqual(['artifactType', 'questionForm']);
      expect(collectBriefInput.properties.projectTitle).toMatchObject({ type: 'string' });
      expect(collectBriefInput.properties.knownAnswers).toMatchObject({ type: 'object' });
      expect(collectBriefInput.properties.questionForm).toMatchObject({
        type: 'object',
        required: ['id', 'title', 'questions'],
        additionalProperties: false,
      });
      expect(collectBriefInput.properties.questionForm.properties.questions).toMatchObject({
        type: 'array',
        minItems: 1,
        maxItems: 5,
      });
      expect(collectBriefInput.properties.questionForm.properties.questions.items.allOf).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ anyOf: [{ required: ['default'] }, { required: ['defaultValue'] }] }),
        ]),
      );
      expect(collectBriefInput.properties.questionForm.properties.questions.items.properties.type.enum).toEqual(
        CHOICE_ONLY_QUESTION_TYPES,
      );
      expect(collectBriefInput.properties.questionForm.properties.questions.items.properties.options.items).toMatchObject({
        type: 'object',
        required: ['label', 'value'],
        additionalProperties: false,
      });
      expect((collectBrief?.outputSchema as any).properties).toMatchObject({
        projectTitle: { type: 'string' },
        knownAnswers: { type: 'object' },
        questionForm: { type: 'object' },
      });
      expect(collectBrief?.description).toMatch(/tailor|dynamic/iu);
      expect(collectBrief?.description).toMatch(/already (?:known|answered)|do not re-ask/iu);

      const resources = await client.listResources();
      expect(resources.resources).toContainEqual(expect.objectContaining({
        uri: widgetUri,
        mimeType: 'text/html;profile=mcp-app',
        _meta: expect.objectContaining({
          ui: expect.objectContaining({ prefersBorder: true }),
        }),
      }));
      expect(resources.resources.map((resource) => resource.uri)).not.toContain('od://focus/active');
      const widget = await client.readResource({ uri: widgetUri });
      const widgetContent = widget.contents[0];
      expect(widgetContent?.mimeType).toBe('text/html;profile=mcp-app');
      const widgetHtml = widgetContent && 'text' in widgetContent ? widgetContent.text : '';
      for (const legacyUri of [
        'ui://open-design/artifact-card-v2.html',
        'ui://open-design/artifact-card-v3.html',
        'ui://open-design/artifact-card-v4.html',
        'ui://open-design/artifact-card-v5.html',
        'ui://open-design/artifact-card-v6.html',
        'ui://open-design/artifact-card-v7.html',
        'ui://open-design/artifact-card-v8.html',
        'ui://open-design/artifact-card-v9.html',
      ]) {
        const legacyWidget = await client.readResource({ uri: legacyUri });
        expect(legacyWidget.contents[0]).toEqual(expect.objectContaining({
          uri: legacyUri,
          mimeType: 'text/html;profile=mcp-app',
          text: widgetHtml,
        }));
      }
      expect(widgetHtml).toContain('window.openai');
      expect(widgetHtml).toContain("rpcRequest('ui/initialize'");
      expect(widgetHtml).toContain("rpcRequest('tools/call'");
      expect(widgetHtml).toContain("rpcRequest('ui/open-link'");
      expect(widgetHtml).toContain("rpcRequest('ui/message'");
      expect(widgetHtml).toContain("content: [{ type: 'text', text }]");
      expect(widgetHtml).not.toContain("content: { type: 'text', text }");
      expect(widgetHtml).toContain("rpcRequest('ui/update-model-context'");
      expect(widgetHtml).toContain(String.raw`const text = lines.join('\n')`);
      expect(widgetHtml).toContain('id="brief-form"');
      expect(widgetHtml).not.toContain('<header class="head">');
      expect(widgetHtml).not.toContain('<h1 class="title">OpenDesign</h1>');
      expect(widgetHtml).not.toContain('id="subtitle"');
      expect(widgetHtml).toContain('id="brief-questions"');
      expect(widgetHtml).not.toContain('id="brief-goal-options"');
      expect(widgetHtml).not.toContain('id="brief-audience-options"');
      expect(widgetHtml).not.toContain('id="brief-content-options"');
      expect(widgetHtml).not.toContain('id="brief-visual-options"');
      expect(widgetHtml).not.toContain('id="brief-output-options"');
      expect(widgetHtml).not.toContain('BRIEF_CHOICE_PRESETS');
      expect(widgetHtml).toContain('questionForm.questions');
      expect(widgetHtml).toContain('questionForm.submitLabel');
      expect(widgetHtml).toContain('[form answers — ');
      expect(widgetHtml).toContain('[value: ');
      expect(widgetHtml).not.toContain('[OpenDesign brief confirmed]');
      expect(widgetHtml).not.toMatch(/<textarea\b/iu);
      expect(widgetHtml).not.toMatch(/<input\b[^>]*\btype\s*=\s*['"](?:text|email|url|tel|search|number|password)['"]/iu);
      expect(widgetHtml).not.toMatch(/\binput\.type\s*=\s*['"](?:text|email|url|tel|search|number|password)['"]/iu);
      expect(widgetHtml).not.toMatch(/contenteditable/iu);
      const widgetScript = widgetHtml.match(/<script>([\s\S]+)<\/script>/u)?.[1];
      expect(widgetScript).toBeTruthy();
      expect(() => new Script(widgetScript ?? '')).not.toThrow();
      expect(widgetHtml).toContain("version: '0.2.13'");
      expect(widgetHtml).toContain('data-view="compact"');
      expect(widgetHtml).toContain('Authorization complete');
      expect(widgetHtml).toContain('Sign in / Register');
      expect(widgetHtml).toContain('Creating “');
      expect(widgetHtml).toContain('https://open-design.ai/amr/wallet');
      expect(widgetHtml).toContain('Edit in Open Design');
      expect(widgetHtml).toContain("current = { ...current, ...incoming }");
      expect(widgetHtml).toContain('exportButton.hidden = !projectId || !completed');
      expect(widgetHtml).not.toContain("}, 1000);");
      expect(widgetHtml).toContain('window.openai?.toolOutput ?? window.openai?.widgetState');
      expect(widgetHtml).toContain('ui/notifications/tool-result');
      expect(widgetHtml).toContain('message.params?.result ?? message.params');
      expect(widgetHtml).toContain('ui/notifications/size-changed');
      expect(widgetHtml).not.toContain('new ResizeObserver');
      expect(widgetHtml).toContain('lastReportedSize');
      expect(widgetHtml).toContain("byId('card').getBoundingClientRect()");
      expect(widgetHtml).not.toContain("root.style.height = 'max-content'");
      expect(widgetHtml.indexOf("window.addEventListener('message'")).toBeLessThan(
        widgetHtml.indexOf('const bridgeReady = initializeBridge()'),
      );
      expect(widgetHtml).toContain('setTimeout');
      expect((widgetContent as any)?._meta?.ui?.csp?.frameDomains).toEqual(expect.arrayContaining([
        'https://open-design.ai',
        'https://preview.open-design.ai',
        `http://127.0.0.1:${port}`,
      ]));

      const briefResult = await client.callTool({
        name: 'collect_brief',
        arguments: {
          artifactType: 'presentation',
          projectTitle: 'Series A story',
          knownAnswers: {
            audience: 'Seed-stage investors',
            scale: '10 slides',
          },
          questionForm: {
            id: 'presentation-fundraising',
            title: '补充融资演示信息',
            description: '只确认尚未从需求中获得的信息。',
            lang: 'zh-CN',
            submitLabel: '确认并继续',
            questions: [
              choiceQuestion('audience', '主要受众'),
              choiceQuestion('fundingAsk', '融资诉求'),
              choiceQuestion('tractionFocus', '重点数据', 'checkbox'),
              choiceQuestion('speakerNotes', '是否需要演讲者备注', 'switch'),
            ],
          },
        },
      }) as any;
      expect(briefResult.structuredContent).toMatchObject({
        view: 'brief-form',
        artifactType: 'presentation',
        projectTitle: 'Series A story',
        knownAnswers: {
          audience: 'Seed-stage investors',
          scale: '10 slides',
        },
        questionForm: {
          id: 'presentation-fundraising',
          title: '补充融资演示信息',
          lang: 'zh-CN',
        },
      });
      expect(briefResult.structuredContent.questionForm.questions.map((question: any) => question.id)).toEqual([
        'fundingAsk',
        'tractionFocus',
        'speakerNotes',
      ]);
      expect(briefResult.structuredContent.questionForm.questions).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'audience' }),
      ]));
      expect(briefResult.structuredContent.questionForm.questions
        .filter((question: any) => question.type !== 'switch')
        .every((question: any) => question.allowCustom === false)).toBe(true);

      const reviewBrief = await client.callTool({
        name: 'collect_brief',
        arguments: {
          artifactType: 'presentation',
          projectTitle: 'Quarterly product review',
          knownAnswers: { audience: 'Internal leadership' },
          questionForm: tailoredQuestionForm('presentation-quarterly-review', [
            'keyMetrics',
            'learnings',
            'nextDecision',
          ]),
        },
      }) as any;
      const fundraisingQuestionIds = briefResult.structuredContent.questionForm.questions
        .map((question: any) => question.id);
      const reviewQuestionIds = reviewBrief.structuredContent.questionForm.questions
        .map((question: any) => question.id);
      expect(reviewQuestionIds).toEqual(['keyMetrics', 'learnings', 'nextDecision']);
      expect(reviewQuestionIds).not.toEqual(fundraisingQuestionIds);
      expect(briefResult._meta).toMatchObject({
        'openai/outputTemplate': widgetUri,
        'ui/resourceUri': widgetUri,
      });
    } finally {
      await client.close();
    }
  });

  it('uses one adaptive QuestionForm pipeline for all eight artifact types', async () => {
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, { getDaemonUrl: () => 'http://127.0.0.1:9', env: {} });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const client = new Client({ name: 'chatgpt-adaptive-brief-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
    try {
      const cases = [
        ['website', ['primaryCta', 'proof', 'brand']],
        ['product-prototype', ['coreFlow', 'fidelity', 'states']],
        ['presentation', ['fundingAsk', 'traction', 'speakerNotes']],
        ['design-system', ['scope', 'componentDepth', 'governance']],
        ['image', ['heroSubject', 'copyPolicy', 'variants']],
        ['video', ['sceneArc', 'audioTreatment', 'cta']],
        ['audio', ['voiceStyle', 'pacing', 'musicBed']],
        ['document', ['evidence', 'recommendation', 'sections']],
      ] as const;

      for (const [artifactType, questionIds] of cases) {
        const result = await client.callTool({
          name: 'collect_brief',
          arguments: {
            artifactType,
            projectTitle: `${artifactType} tailored project`,
            knownAnswers: {
              audience: `${artifactType} audience supplied by the user`,
              output: `${artifactType} output supplied by the user`,
            },
            questionForm: {
              ...tailoredQuestionForm(`${artifactType}-brief`, ['audience', ...questionIds]),
              questions: [
                choiceQuestion('audience', 'Audience already supplied'),
                ...questionIds.map((questionId, index) => choiceQuestion(
                  questionId,
                  questionId,
                  index === 1 ? 'checkbox' : 'radio',
                )),
              ],
            },
          },
        }) as any;

        expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          artifactType,
          projectTitle: `${artifactType} tailored project`,
          questionForm: { id: `${artifactType}-brief` },
        });
        expect(result.structuredContent.questionForm.questions.map((question: any) => question.id)).toEqual(
          questionIds,
        );
        expect(result.structuredContent.questionForm.questions).toHaveLength(3);
        expect(result.structuredContent.questionForm.questions.every((question: any) => (
          CHOICE_ONLY_QUESTION_TYPES.includes(question.type)
        ))).toBe(true);
        expect(result.structuredContent.questionForm.questions
          .filter((question: any) => question.type !== 'switch')
          .every((question: any) => question.allowCustom === false)).toBe(true);
      }
    } finally {
      await client.close();
    }
  });

  it('treats Open Design metadata aliases as already answered brief decisions', async () => {
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, { getDaemonUrl: () => 'http://127.0.0.1:9', env: {} });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const client = new Client({ name: 'chatgpt-brief-alias-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
    try {
      const result = await client.callTool({
        name: 'collect_brief',
        arguments: {
          artifactType: 'presentation',
          knownAnswers: {
            slideCount: '10 slides',
            platform: 'browser',
            designSystem: 'Open Design brand',
          },
          questionForm: {
            ...tailoredQuestionForm('presentation-alias-brief', ['slides', 'surface', 'brand', 'evidence']),
            questions: [
              choiceQuestion('slides', 'How many slides?'),
              choiceQuestion('surface', 'Which platform?'),
              choiceQuestion('brand', 'Which brand direction?'),
              choiceQuestion('evidence', 'Which evidence should lead?'),
            ],
          },
        },
      }) as any;

      expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
      expect(result.structuredContent.questionForm.questions.map((question: any) => question.id)).toEqual([
        'evidence',
      ]);
    } finally {
      await client.close();
    }
  });

  it('rejects non-choice, overlong, duplicate, and free-form-override QuestionForms', async () => {
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, { getDaemonUrl: () => 'http://127.0.0.1:9', env: {} });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const client = new Client({ name: 'chatgpt-brief-validation-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
    try {
      const invalidForms = [
        {
          ...tailoredQuestionForm('typed-answer', ['audience']),
          questions: [{ id: 'audience', label: 'Audience', type: 'text', required: true }],
        },
        tailoredQuestionForm('too-many', ['one', 'two', 'three', 'four', 'five', 'six']),
        {
          ...tailoredQuestionForm('duplicate-ids', ['tone']),
          questions: [choiceQuestion('tone'), choiceQuestion('tone')],
        },
        {
          ...tailoredQuestionForm('free-form-override', ['tone']),
          questions: [{ ...choiceQuestion('tone'), allowCustom: true }],
        },
        {
          ...tailoredQuestionForm('unstable-string-options', ['tone']),
          questions: [{
            id: 'tone',
            label: 'Tone',
            type: 'radio',
            defaultValue: 'Editorial',
            allowCustom: false,
            options: ['Editorial', 'Utility'],
          }],
        },
        {
          ...tailoredQuestionForm('mismatched-direction-cards', ['direction']),
          questions: [{
            id: 'direction',
            label: 'Direction',
            type: 'direction-cards',
            defaultValue: 'editorial',
            allowCustom: false,
            options: [
              { label: 'Editorial', value: 'editorial' },
              { label: 'Utility', value: 'utility' },
            ],
            cards: [
              { id: 'editorial', label: 'Editorial', mood: 'Magazine-led' },
              { id: 'playful', label: 'Playful', mood: 'Expressive' },
            ],
          }],
        },
      ];

      for (const questionForm of invalidForms) {
        const result = await client.callTool({
          name: 'collect_brief',
          arguments: {
            artifactType: 'website',
            projectTitle: 'Invalid brief test',
            knownAnswers: {},
            questionForm,
          },
        }) as any;
        expect(result, questionForm.id).toMatchObject({ isError: true });
        expect(JSON.stringify(result.content)).toMatch(/question|choice|five|duplicate|custom|direction/iu);
      }
    } finally {
      await client.close();
    }
  });

  it('publishes one shared Open Design operating skill and eight artifact-specific skills', async () => {
    const skillNames = [
      'open-design-basics',
      'create-website-with-open-design',
      'create-prototype-with-open-design',
      'create-presentation-with-open-design',
      'create-design-system-with-open-design',
      'create-image-with-open-design',
      'create-video-with-open-design',
      'create-audio-with-open-design',
      'create-document-with-open-design',
    ];
    const skills = await Promise.all(skillNames.map((skillName) => readFile(
      new URL(`../../../plugins/open-design/skills/${skillName}/SKILL.md`, import.meta.url),
      'utf8',
    )));
    const basics = skills[0] ?? '';
    const repositoryInstructions = await readFile(
      new URL('../../../AGENTS.md', import.meta.url),
      'utf8',
    );
    expect(basics).toMatch(/call `collect_brief`/iu);
    expect(basics).toMatch(/never fall back[^\n]+`<question-form>`/iu);
    expect(basics).toContain('Custom UI');
    expect(basics).toContain('Fail closed when tools are unavailable');
    expect(basics).toContain('fully quit and relaunch Codex');
    expect(basics).toContain('Do not create substitute');
    expect(basics).toContain('choice-only');
    expect(basics).toContain('radio buttons for one choice and checkboxes for multiple choices');
    expect(basics).toMatch(/QuestionForm|question form/iu);
    expect(basics).toMatch(/drop|omit|do not re-ask/iu);
    expect(basics).toMatch(/already (?:answered|known|supplied)/iu);
    expect(basics).toMatch(/2[–-]3|two to three/iu);
    expect(basics).toMatch(/(?:at most|maximum|hard cap)[^\n]*5/iu);
    expect(basics).toContain('[form answers —');
    expect(basics).toMatch(/every fresh creation/iu);
    expect(basics).toMatch(/only skip/iu);
    expect(basics).not.toMatch(/preselected \*\*From your brief\*\* choice/iu);
    expect(skills.slice(1).every((skill) => skill.includes('`collect_brief`'))).toBe(true);
    expect(skills.slice(1).every((skill) => /tailor|adaptive|dynamically/iu.test(skill))).toBe(true);
    expect(skills.slice(1).every((skill) => /already (?:answered|known|supplied)|do not re-ask/iu.test(skill))).toBe(true);
    expect(skills.slice(1).every((skill) => skill.includes('`create_project`'))).toBe(true);
    expect(skills.slice(1).every((skill) => skill.includes('`start_run`'))).toBe(true);
    expect(skills[5]).toContain('`artifactType: image`');
    expect(skills[6]).toContain('`artifactType: video`');
    expect(skills[7]).toContain('`artifactType: audio`');
    expect(skills[8]).toContain('`artifactType: document`');
    expect(repositoryInstructions).toContain('only apply inside the Open Design daemon and `apps/web` chat host');
    expect(repositoryInstructions).toContain('must fail closed instead of synthesizing a form');
  });

  it('requires explicit remote auth and accepts the configured development bearer', async () => {
    const remote = (authorization?: string, body: unknown = {
      method: 'tools/call',
      params: { name: 'get_cloud_account' },
    }) => ({
      headers: authorization ? { authorization } : {},
      socket: { remoteAddress: '203.0.113.10' },
      protocol: 'https',
      body,
      get: (name: string) => name === 'host' ? 'mcp.example.com' : undefined,
    }) as any;

    await expect(authorizeChatGptMcpRequest(remote(undefined, { method: 'initialize' }), {})).resolves.toMatchObject({
      ok: true,
      principal: { mode: 'anonymous', subject: 'anonymous' },
    });
    await expect(authorizeChatGptMcpRequest(remote(), {})).resolves.toMatchObject({
      ok: false,
      status: 503,
      code: 'CHATGPT_MCP_AUTH_NOT_CONFIGURED',
    });
    await expect(authorizeChatGptMcpRequest(remote(), { OD_CHATGPT_MCP_TOKEN: 'secret' })).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
    await expect(authorizeChatGptMcpRequest(remote('Bearer secret'), { OD_CHATGPT_MCP_TOKEN: 'secret' })).resolves.toMatchObject({
      ok: true,
      principal: { mode: 'static', subject: 'single-tenant' },
    });
    await expect(authorizeChatGptMcpRequest(
      remote('Bearer invalid', { method: 'tools/list' }),
      { OD_CHATGPT_MCP_TOKEN: 'secret' },
    )).resolves.toMatchObject({
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_INVALID_TOKEN',
    });
  });

  it('does not treat a public reverse-proxy request as unauthenticated loopback', async () => {
    const request = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      protocol: 'https',
      body: { method: 'tools/call', params: { name: 'get_cloud_account' } },
      get: (name: string) => name === 'host' ? 'mcp.open-design.ai' : undefined,
    } as any;

    await expect(authorizeChatGptMcpRequest(request, {})).resolves.toMatchObject({
      ok: false,
      status: 503,
      code: 'CHATGPT_MCP_AUTH_NOT_CONFIGURED',
    });
    await expect(authorizeChatGptMcpRequest(
      { ...request, get: (name: string) => name === 'host' ? '127.0.0.1:7456' : undefined },
      {},
    )).resolves.toMatchObject({
      ok: true,
      principal: { mode: 'loopback', subject: 'local' },
    });
    await expect(authorizeChatGptMcpRequest(
      { ...request, get: (name: string) => name === 'host' ? '127.0.0.1:7456' : undefined },
      { OD_CHATGPT_OAUTH_ISSUER: 'https://auth.open-design.ai' },
    )).resolves.toMatchObject({
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_AUTH_REQUIRED',
    });
  });

  it('publishes OAuth protected-resource metadata', async () => {
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:9',
      env: {
        OD_PUBLIC_BASE_URL: 'https://mcp.open-design.ai',
        OD_CHATGPT_MCP_RESOURCE_URL: 'https://mcp.open-design.ai/mcp',
        OD_CHATGPT_OAUTH_ISSUER: 'https://auth.open-design.ai',
      },
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: 'https://mcp.open-design.ai/mcp',
      authorization_servers: ['https://auth.open-design.ai'],
      scopes_supported: CHATGPT_MCP_SCOPES,
    });
  });

  it('keeps brief discovery public while protecting account and project data', async () => {
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:9',
      env: {
        OD_PUBLIC_BASE_URL: 'https://mcp.open-design.ai',
        OD_CHATGPT_MCP_RESOURCE_URL: 'https://mcp.open-design.ai/mcp',
        OD_CHATGPT_OAUTH_ISSUER: 'https://auth.open-design.ai',
      },
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;
    const endpoint = `http://127.0.0.1:${port}/mcp`;
    const post = async (id: number, method: string, params: Record<string, unknown>) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
      const text = await response.text();
      const body = response.headers.get('content-type')?.includes('application/json')
        ? JSON.parse(text)
        : text.split(/\r?\n/u)
          .filter((line) => line.startsWith('data:'))
          .map((line) => JSON.parse(line.slice(5).trim()))
          .find((message) => message.result || message.error);
      return { body, response };
    };

    const publicClient = new Client({ name: 'anonymous-chatgpt-mcp-test', version: '1.0.0' });
    const publicTransport = new StreamableHTTPClientTransport(new URL(endpoint));
    await publicClient.connect(publicTransport as unknown as Parameters<typeof publicClient.connect>[0]);
    try {
      const listed = await publicClient.listTools();
      expect(listed.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'collect_brief',
          _meta: expect.objectContaining({ securitySchemes: [{ type: 'noauth' }] }),
        }),
        expect.objectContaining({ name: 'get_cloud_account' }),
      ]));
      const brief = await publicClient.callTool({
        name: 'collect_brief',
        arguments: {
          artifactType: 'website',
          projectTitle: 'Public brief',
          knownAnswers: { audience: 'Public users' },
          questionForm: tailoredQuestionForm('public-website-brief', ['primaryCta', 'brand']),
        },
      }) as any;
      expect(brief.structuredContent).toMatchObject({
        view: 'brief-form',
        projectTitle: 'Public brief',
        questionForm: { id: 'public-website-brief' },
      });
      for (const uri of [
        'ui://open-design/artifact-card-v2.html',
        'ui://open-design/artifact-card-v3.html',
        'ui://open-design/artifact-card-v4.html',
        'ui://open-design/artifact-card-v5.html',
        'ui://open-design/artifact-card-v6.html',
      ]) {
        const widget = await publicClient.readResource({ uri });
        expect(widget.contents[0]).toMatchObject({
          uri,
          mimeType: 'text/html;profile=mcp-app',
        });
      }
    } finally {
      await publicClient.close();
    }

    const account = await post(4, 'tools/call', { name: 'get_cloud_account', arguments: {} });
    expect(account.response.status).toBe(401);
    expect(account.response.headers.get('www-authenticate')).toMatch(/^Bearer\b/u);

    const catalog = await post(5, 'resources/read', { uri: 'od://design-systems/private/DESIGN.md' });
    expect(catalog.response.status).toBe(401);

    const resourceList = await post(6, 'resources/list', {});
    expect(resourceList.response.status).toBe(401);

    const unknownWidget = await post(7, 'resources/read', {
      uri: 'ui://open-design/artifact-card-v1.html',
    });
    expect(unknownWidget.response.status).toBe(401);

    const mixedBatch = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} },
        {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: { name: 'start_run', arguments: {} },
        },
      ]),
    });
    expect(mixedBatch.status).toBe(401);

    const publicBatch = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} },
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'resources/read',
          params: { uri: 'ui://open-design/artifact-card-v6.html' },
        },
      ]),
    });
    expect(publicBatch.status).toBe(401);
  });

  it('serves signed tenant previews and exchanges Studio links for an isolated API session', async () => {
    const tenantKey = chatGptTenantKey('managed-user-123');
    const signingSecret = 'test-chatgpt-capability-secret-1234567890';
    const daemon = express();
    daemon.use(express.json());
    daemon.get('/api/projects/:id/raw/*splat', (request, response) => {
      response.type('html').send(`<main data-project="${request.params.id}">${request.params.splat}</main>`);
    });
    daemon.get('/api/projects', (request, response) => {
      if (request.get('origin')) return response.status(403).json({ error: 'origin leaked' });
      return response.json({
        projects: [{ id: 'tenant-only', name: 'Tenant project' }],
      });
    });
    const daemonServer = daemon.listen(0, '127.0.0.1');
    servers.push(daemonServer);
    await new Promise<void>((resolve) => daemonServer.once('listening', resolve));
    const daemonPort = (daemonServer.address() as AddressInfo).port;

    const resolveTenantDaemonByKey = vi.fn(async (key: string) => {
      if (key !== tenantKey) throw new Error('wrong tenant');
      return `http://127.0.0.1:${daemonPort}`;
    });
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:9',
      resolveTenantDaemonByKey,
      env: {
        OD_PUBLIC_BASE_URL: 'https://mcp.open-design.ai',
        OD_CHATGPT_CAPABILITY_SIGNING_SECRET: signingSecret,
      },
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;

    const previewToken = createChatGptCapabilityToken({
      purpose: 'preview',
      tenantKey,
      projectId: 'tenant-only',
      entryFile: 'site/index.html',
    }, signingSecret);
    const preview = await fetch(`${origin}/chatgpt/preview/${previewToken}/raw/site/index.html`);
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain('data-project="tenant-only"');
    expect(resolveTenantDaemonByKey).toHaveBeenCalledWith(tenantKey);
    expect((await fetch(`${origin}/chatgpt/preview/${previewToken}x/raw/site/index.html`)).status).toBe(401);
    expect((await fetch(`${origin}/chatgpt/studio/${previewToken}`, { redirect: 'manual' })).status).toBe(401);

    const studioToken = createChatGptCapabilityToken({
      purpose: 'studio',
      tenantKey,
      projectId: 'tenant-only',
      conversationId: 'conversation-1',
      entryFile: 'site/index.html',
    }, signingSecret);
    const studio = await fetch(`${origin}/chatgpt/studio/${studioToken}`, { redirect: 'manual' });
    expect(studio.status).toBe(303);
    expect(studio.headers.get('location')).toBe(
      '/projects/tenant-only/conversations/conversation-1/files/site/index.html',
    );
    const cookie = studio.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toContain('od_chatgpt_studio=');

    const projects = await fetch(`${origin}/api/projects`, { headers: { cookie: String(cookie) } });
    expect(projects.status).toBe(200);
    await expect(projects.json()).resolves.toEqual({
      projects: [{ id: 'tenant-only', name: 'Tenant project' }],
    });
    const crossOrigin = await fetch(`${origin}/api/projects`, {
      headers: { cookie: String(cookie), origin: 'https://attacker.example' },
    });
    expect(crossOrigin.status).toBe(403);
  });

  it('replaces managed child loopback URLs with signed public result links', () => {
    const result = rewriteManagedTenantResultUrls({
      subject: 'managed-user-123',
      publicOrigin: 'https://mcp.open-design.ai',
      env: {
        OD_CHATGPT_CAPABILITY_SIGNING_SECRET: 'test-chatgpt-capability-secret-1234567890',
      },
      result: {
        structuredContent: {
          id: 'run-1',
          projectId: 'tenant-only',
          conversationId: 'conversation-1',
          status: 'succeeded',
          entryFile: 'site/index.html',
          previewUrl: 'http://127.0.0.1:4101/api/projects/tenant-only/raw/site/index.html',
          studioUrl: 'http://127.0.0.1:7456/projects/tenant-only/conversations/conversation-1/files/site/index.html',
        },
        content: [{ type: 'text', text: 'old loopback result' }],
      },
    });

    expect(result.structuredContent.previewUrl).toMatch(
      /^https:\/\/mcp\.open-design\.ai\/chatgpt\/preview\/.+\/raw\/site\/index\.html$/u,
    );
    expect(result.structuredContent.studioUrl).toMatch(
      /^https:\/\/mcp\.open-design\.ai\/chatgpt\/studio\/.+$/u,
    );
    expect(JSON.stringify(result)).not.toContain('127.0.0.1');
  });

  it('runs only the Cloud V1 workflows and removes daemon-private progress data', async () => {
    const createdBodies: unknown[] = [];
    const runBodies: unknown[] = [];
    let walletBalance = '8.40';
    const daemon = express();
    daemon.use(express.json());
    daemon.get('/api/design-systems', (_request, response) => response.json({ designSystems: [
      { id: 'acme', name: 'Acme' },
    ] }));
    daemon.get('/api/design-systems/acme', (_request, response) => response.json({
      designSystem: { id: 'acme', content: '# Acme Design System\n\nUse cobalt for primary actions.' },
    }));
    daemon.get('/api/integrations/vela/status', (_request, response) => response.json({
      loggedIn: true,
      user: { id: 'user-123', email: 'user@example.com' },
      account: { balanceUsd: walletBalance },
    }));
    daemon.get('/api/integrations/vela/wallet', (_request, response) => response.json({
      status: 'available',
      balanceUsd: walletBalance,
    }));
    daemon.get('/api/projects', (_request, response) => response.json({ projects: [{ id: 'p1', name: 'Launch' }] }));
    daemon.post('/api/projects', (request, response) => {
      createdBodies.push(request.body);
      response.json({ project: { id: 'p1', name: 'Launch' }, conversationId: 'c1' });
    });
    daemon.post('/api/runs', (request, response) => {
      runBodies.push(request.body);
      response.json({ id: 'r1', runId: 'r1', projectId: 'p1', conversationId: 'c1', status: 'queued' });
    });
    daemon.get('/api/runs/r1', (_request, response) => response.json({
      id: 'r1',
      projectId: 'p1',
      conversationId: 'c1',
      status: 'running',
      eventsLogPath: '/private/tenant/user-123/events.jsonl',
      access_token: 'must-not-leak',
      nested: { runtime_key: 'must-not-leak-either', safe: 'visible' },
    }));
    daemon.get('/api/mcp/install-info', (_request, response) => response.json({ webBaseUrl: 'https://studio.open-design.ai' }));
    const daemonServer = daemon.listen(0, '127.0.0.1');
    servers.push(daemonServer);
    await new Promise<void>((resolve) => daemonServer.once('listening', resolve));
    const daemonPort = (daemonServer.address() as AddressInfo).port;

    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => `http://127.0.0.1:${daemonPort}`,
      env: {},
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const client = new Client({ name: 'chatgpt-v1-flow-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)) as any);
    try {
      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toContain('od://design-systems/acme/DESIGN.md');
      expect(resources.resources.some((resource) => resource.uri.startsWith('od://skills/'))).toBe(false);
      const designSystem = await client.readResource({ uri: 'od://design-systems/acme/DESIGN.md' });
      expect(designSystem.contents[0]).toMatchObject({
        mimeType: 'text/markdown',
        text: expect.stringContaining('Use cobalt for primary actions.'),
      });

      const projectCases = [
        ['website', { kind: 'prototype' }],
        ['product-prototype', { kind: 'prototype' }],
        ['presentation', { kind: 'deck' }],
        ['design-system', { kind: 'brand' }],
        ['image', { kind: 'image' }],
        ['video', { kind: 'video' }],
        ['audio', { kind: 'audio' }],
        ['document', { kind: 'other', intent: 'document' }],
      ] as const;
      for (const [artifactType] of projectCases) {
        await client.callTool({
          name: 'create_project',
          arguments: {
            name: artifactType === 'website' ? 'Launch' : `New ${artifactType}`,
            artifactType,
            ...(artifactType === 'website' ? { designSystem: 'acme' } : {}),
          },
        });
      }
      expect(createdBodies).toEqual(projectCases.map(([artifactType, metadata]) => expect.objectContaining({
        name: artifactType === 'website' ? 'Launch' : `New ${artifactType}`,
        ...(artifactType === 'website' ? { designSystemId: 'acme' } : {}),
        metadata,
        skipDiscoveryBrief: true,
      })));

      const unconfirmed = await client.callTool({
        name: 'start_run',
        arguments: {
          project: 'p1',
          artifactType: 'website',
          brief: {
            audience: 'Prospective teams',
            outcome: 'Explain the product',
            contentAndFlows: 'Hero and CTA',
            visualDirection: 'Use Acme',
            outputFormat: 'Responsive website',
          },
          confirmed: false,
        },
      }) as any;
      expect(unconfirmed).toMatchObject({ isError: true });
      expect(unconfirmed._meta).toBeUndefined();
      expect(JSON.stringify(unconfirmed.content)).toContain('confirmed:true is required');
      expect(runBodies).toHaveLength(0);

      const started = await client.callTool({
        name: 'start_run',
        arguments: {
          project: 'p1',
          artifactType: 'website',
          brief: {
            audience: 'Prospective teams',
            outcome: 'Explain the product and drive signups',
            contentAndFlows: 'Hero, proof, feature sections, pricing CTA',
            visualDirection: 'Use the attached Acme Design System',
            outputFormat: 'Responsive website',
          },
          confirmed: true,
        },
      }) as any;
      expect(started.structuredContent).toMatchObject({
        artifactType: 'website',
        briefConfirmed: true,
        stage: 'queued',
      });
      expect(started._meta).toMatchObject({
        'openai/outputTemplate': 'ui://open-design/artifact-card-v10.html',
        'ui/resourceUri': 'ui://open-design/artifact-card-v10.html',
      });
      expect(runBodies).toEqual([expect.objectContaining({
        projectId: 'p1',
        message: expect.stringContaining('Website deliverable: create a polished responsive website with a real index.html entry file'),
        skillId: 'frontend-design',
        agentId: 'amr',
      })]);
      expect((runBodies[0] as any).message).toContain('Audience: Prospective teams');
      expect((runBodies[0] as any).message).toContain('Delivery contract: write the actual deliverable files');

      const mappingCases = [
        ['product-prototype', 'Interactive prototype', 'frontend-design', null],
        ['presentation', 'Browser deck', 'slides', null],
        ['design-system', 'DESIGN.md', 'design-md', null],
        ['image', 'Square PNG image · 1:1', null, 'od-media-generation'],
        ['video', 'Landscape MP4 video · 16:9', null, 'od-media-generation'],
        ['audio', '60-second music track', null, 'od-media-generation'],
        ['document', 'Markdown source + print-ready HTML', 'frontend-design', null],
      ] as const;
      for (const [artifactType, outputFormat, expectedSkill, expectedPlugin] of mappingCases) {
        await client.callTool({
          name: 'start_run',
          arguments: {
            project: 'p1',
            artifactType,
            brief: {
              audience: 'Product team',
              outcome: `Create the ${artifactType}`,
              contentAndFlows: 'Use the confirmed content and interaction requirements',
              visualDirection: 'Follow the Acme Design System',
              outputFormat,
            },
            confirmed: true,
          },
        });
        const lastRun = runBodies.at(-1) as any;
        expect(lastRun?.skillId ?? null).toBe(expectedSkill);
        expect(lastRun?.pluginId ?? null).toBe(expectedPlugin);
        expect(lastRun?.agentId).toBe('amr');
        if (['image', 'video', 'audio'].includes(artifactType)) {
          expect(lastRun?.pluginInputs).toMatchObject({ mediaKind: artifactType });
        }
      }

      const progress = await client.callTool({ name: 'get_run', arguments: { runId: 'r1' } }) as any;
      expect(progress.structuredContent).toMatchObject({ status: 'running', stage: 'generating', projectId: 'p1' });
      expect(progress.structuredContent.eventsLogPath).toBeUndefined();
      expect(progress.structuredContent.access_token).toBeUndefined();
      expect(progress.structuredContent.nested).toEqual({ safe: 'visible' });
      expect(JSON.stringify(progress.content)).not.toContain('/private/tenant');
      expect(JSON.stringify(progress.content)).not.toContain('must-not-leak');

      const rejected = await client.callTool({
        name: 'start_run',
        arguments: {
          project: 'p1',
          artifactType: 'model-3d',
          brief: {
            audience: 'Everyone', outcome: 'Make a video', contentAndFlows: 'Scenes', visualDirection: 'Cinematic', outputFormat: 'MP4',
          },
          confirmed: true,
        },
      }) as any;
      expect(rejected.isError).toBe(true);

      walletBalance = '0.00';
      const recharge = await client.callTool({
        name: 'start_run',
        arguments: {
          project: 'p1',
          artifactType: 'presentation',
          brief: {
            audience: 'Leadership', outcome: 'Approve launch', contentAndFlows: 'Ten-slide narrative', visualDirection: 'Executive', outputFormat: 'Browser deck',
          },
          confirmed: true,
        },
      }) as any;
      expect(recharge).toMatchObject({
        isError: true,
        structuredContent: {
          canUseCloud: false,
          nextAction: 'recharge',
          balanceStatus: 'empty',
        },
        _meta: {
          'openai/outputTemplate': 'ui://open-design/artifact-card-v10.html',
        },
      });
      expect(runBodies).toHaveLength(8);
    } finally {
      await client.close();
    }
  });

  it('reports a clean Cloud exit with zero artifacts as a failed V1 commission', async () => {
    const daemon = express();
    daemon.use(express.json());
    daemon.get('/api/runs/r-empty', (_request, response) => response.json({
      id: 'r-empty',
      projectId: 'p-empty',
      conversationId: 'c-empty',
      skillId: 'frontend-design',
      status: 'succeeded',
      artifactCount: 0,
      exitCode: 0,
    }));
    daemon.get('/api/runs/r-no-preview', (_request, response) => response.json({
      id: 'r-no-preview',
      projectId: 'p-no-preview',
      conversationId: 'c-no-preview',
      skillId: 'frontend-design',
      status: 'succeeded',
      artifactCount: 1,
      exitCode: 0,
    }));
    daemon.get('/api/runs/r-design', (_request, response) => response.json({
      id: 'r-design',
      projectId: 'p-design',
      conversationId: 'c-design',
      skillId: 'design-md',
      status: 'succeeded',
      artifactCount: 1,
      exitCode: 0,
    }));
    daemon.get('/api/runs/r-success', (_request, response) => response.json({
      id: 'r-success',
      projectId: 'p-success',
      conversationId: 'c-success',
      skillId: 'frontend-design',
      status: 'succeeded',
      artifactCount: 1,
      exitCode: 0,
    }));
    for (const mediaKind of ['image', 'video', 'audio']) {
      daemon.get(`/api/runs/r-${mediaKind}`, (_request, response) => response.json({
        id: `r-${mediaKind}`,
        projectId: `p-${mediaKind}`,
        conversationId: `c-${mediaKind}`,
        pluginId: 'od-media-generation',
        status: 'succeeded',
        artifactCount: 1,
        exitCode: 0,
      }));
    }
    daemon.get('/api/runs/r-no-studio', (_request, response) => response.json({
      id: 'r-no-studio',
      projectId: 'p-no-studio',
      skillId: 'frontend-design',
      status: 'succeeded',
      artifactCount: 1,
      exitCode: 0,
    }));
    daemon.get('/api/runs/r-missing-count', (_request, response) => response.json({
      id: 'r-missing-count',
      projectId: 'p-missing-count',
      conversationId: 'c-missing-count',
      skillId: 'frontend-design',
      status: 'succeeded',
      exitCode: 0,
    }));
    daemon.get('/api/projects/p-empty', (_request, response) => response.json({
      project: { id: 'p-empty', metadata: {} },
    }));
    daemon.get('/api/projects/p-empty/files', (_request, response) => response.json({ files: [] }));
    daemon.get('/api/projects/p-no-preview', (_request, response) => response.json({
      project: { id: 'p-no-preview', metadata: {} },
    }));
    daemon.get('/api/projects/p-no-preview/files', (_request, response) => response.json({
      files: [{ name: 'README.md' }],
    }));
    daemon.get('/api/projects/p-design', (_request, response) => response.json({
      project: { id: 'p-design', metadata: {} },
    }));
    daemon.get('/api/projects/p-design/files', (_request, response) => response.json({
      files: [{ name: 'DESIGN.md' }],
    }));
    daemon.get('/api/projects/p-success', (_request, response) => response.json({
      project: { id: 'p-success', metadata: { entryFile: 'index.html' } },
    }));
    daemon.get('/api/projects/p-success/files', (_request, response) => response.json({
      files: [{ name: 'index.html' }],
    }));
    daemon.get('/api/projects/p-success/raw/index.html', (_request, response) => response.type('html').send('<!doctype html><title>Success</title>'));
    const mediaFiles = {
      image: { path: 'media/result.png', type: 'image/png' },
      video: { path: 'media/result.mp4', type: 'video/mp4' },
      audio: { path: 'media/result.mp3', type: 'audio/mpeg' },
    } as const;
    for (const [mediaKind, media] of Object.entries(mediaFiles)) {
      daemon.get(`/api/projects/p-${mediaKind}`, (_request, response) => response.json({
        project: { id: `p-${mediaKind}`, metadata: { kind: mediaKind } },
      }));
      daemon.get(`/api/projects/p-${mediaKind}/files`, (_request, response) => response.json({
        files: [{ name: media.path.split('/').at(-1), path: media.path, kind: mediaKind }],
      }));
      daemon.get(`/api/projects/p-${mediaKind}/raw/media/${media.path.split('/').at(-1)}`, (_request, response) => {
        response.setHeader('content-type', media.type);
        response.send(Buffer.from('preview'));
      });
    }
    daemon.get('/api/projects/p-no-studio', (_request, response) => response.json({
      project: { id: 'p-no-studio', metadata: { entryFile: 'index.html' } },
    }));
    daemon.get('/api/projects/p-no-studio/raw/index.html', (_request, response) => response.type('html').send('<!doctype html><title>No Studio</title>'));
    daemon.get('/api/projects/p-missing-count', (_request, response) => response.json({
      project: { id: 'p-missing-count', metadata: { entryFile: 'index.html' } },
    }));
    daemon.get('/api/projects/p-missing-count/files', (_request, response) => response.json({
      files: [{ name: 'index.html' }],
    }));
    daemon.get('/api/runs/r-empty/events', (_request, response) => response.status(404).send('not found'));
    daemon.get('/api/mcp/install-info', (_request, response) => response.json({
      webBaseUrl: 'https://studio.open-design.ai',
    }));
    const daemonServer = daemon.listen(0, '127.0.0.1');
    servers.push(daemonServer);
    await new Promise<void>((resolve) => daemonServer.once('listening', resolve));
    const daemonPort = (daemonServer.address() as AddressInfo).port;

    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => `http://127.0.0.1:${daemonPort}`,
      env: {},
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const client = new Client({ name: 'chatgpt-empty-artifact-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)) as any);
    try {
      const result = await client.callTool({
        name: 'get_run',
        arguments: { runId: 'r-empty' },
      }) as any;
      expect(result.structuredContent).toMatchObject({
        status: 'failed',
        stage: 'failed',
        artifactCount: 0,
        errorCode: 'RUN_NO_DELIVERABLE',
        retryable: true,
      });
      expect(result.structuredContent.error).toContain('without creating or updating any project files');
      expect(result.structuredContent.previewUrl).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        status: 'failed',
        stage: 'failed',
        errorCode: 'RUN_NO_DELIVERABLE',
      });

      const noPreview = await client.callTool({
        name: 'get_run',
        arguments: { runId: 'r-no-preview' },
      }) as any;
      expect(noPreview.structuredContent).toMatchObject({
        status: 'failed',
        stage: 'failed',
        artifactCount: 1,
        errorCode: 'RUN_NO_PREVIEW',
      });

      const designSystem = await client.callTool({
        name: 'get_run',
        arguments: { runId: 'r-design' },
      }) as any;
      expect(designSystem.structuredContent).toMatchObject({
        status: 'succeeded',
        stage: 'ready',
        artifactCount: 1,
        skillId: 'design-md',
      });
      expect(designSystem.structuredContent.hint).toContain('exact studioUrl');

      const success = await client.callTool({
        name: 'get_run',
        arguments: { runId: 'r-success' },
      }) as any;
      expect(success.structuredContent).toMatchObject({
        status: 'succeeded',
        stage: 'ready',
        artifactCount: 1,
      });
      expect(success.structuredContent.previewUrl).toContain('/api/projects/p-success/raw/index.html');
      expect(success.structuredContent.hint).toContain('studioUrl and previewUrl in two separate tabs');

      for (const mediaKind of ['image', 'video', 'audio']) {
        const media = await client.callTool({
          name: 'get_run',
          arguments: { runId: `r-${mediaKind}` },
        }) as any;
        expect(media.structuredContent).toMatchObject({
          status: 'succeeded',
          stage: 'ready',
          artifactCount: 1,
          pluginId: 'od-media-generation',
        });
        expect(media.structuredContent.previewUrl).toContain(`/api/projects/p-${mediaKind}/raw/media/result.`);
        expect(media.structuredContent.studioUrl).toContain(`/projects/p-${mediaKind}/conversations/c-${mediaKind}/files/media/result.`);
      }

      const noStudio = await client.callTool({
        name: 'get_run',
        arguments: { runId: 'r-no-studio' },
      }) as any;
      expect(noStudio.structuredContent).toMatchObject({
        status: 'failed',
        stage: 'failed',
        artifactCount: 1,
        errorCode: 'RUN_NO_STUDIO_URL',
      });

      const missingCount = await client.callTool({
        name: 'get_run',
        arguments: { runId: 'r-missing-count' },
      }) as any;
      expect(missingCount.structuredContent).toMatchObject({
        status: 'failed',
        stage: 'failed',
        errorCode: 'RUN_NO_DELIVERABLE',
      });
    } finally {
      await client.close();
    }
  });

  it('validates OAuth audience, scopes, subject, and fail-closed tenant routing', async () => {
    const env = {
      OD_CHATGPT_OAUTH_ISSUER: 'https://auth.open-design.ai',
      OD_CHATGPT_OAUTH_INTROSPECTION_URL: 'https://auth.open-design.ai/introspect',
      OD_CHATGPT_MCP_RESOURCE_URL: 'https://mcp.open-design.ai/mcp',
      OD_CHATGPT_MCP_TENANT_URL_TEMPLATE: 'https://{sub}.tenant.open-design.internal',
    };
    const remote = {
      headers: { authorization: 'Bearer user-token' },
      socket: { remoteAddress: '203.0.113.10' },
      protocol: 'https',
      body: { method: 'tools/call', params: { name: 'start_run' } },
      get: (name: string) => name === 'host' ? 'mcp.open-design.ai' : undefined,
    } as any;
    const tokenResponse = (scope: string) => vi.fn(async () => new Response(JSON.stringify({
      active: true,
      sub: 'user-123',
      aud: 'https://mcp.open-design.ai/mcp',
      scope,
    })));

    const authorized = await authorizeChatGptMcpRequest(
      remote,
      env,
      tokenResponse('openid opendesign.runs.write') as any,
    );
    expect(authorized).toMatchObject({ ok: true, principal: { mode: 'oauth', subject: 'user-123' } });
    if (!authorized.ok) throw new Error('expected authorized principal');
    expect(resolveChatGptMcpDaemonUrl('http://127.0.0.1:7456', authorized.principal, env)).toBe(
      'https://user-123.tenant.open-design.internal',
    );

    await expect(authorizeChatGptMcpRequest(
      remote,
      env,
      tokenResponse('openid') as any,
    )).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: 'CHATGPT_MCP_INSUFFICIENT_SCOPE',
    });

    await expect(authorizeChatGptMcpRequest(
      {
        ...remote,
        body: {
          method: 'resources/read',
          params: { uri: 'ui://open-design/artifact-card-v6.html' },
        },
      },
      env,
      tokenResponse('openid') as any,
    )).resolves.toMatchObject({
      ok: true,
      principal: { mode: 'oauth', subject: 'user-123' },
    });

    await expect(authorizeChatGptMcpRequest(
      {
        ...remote,
        body: {
          method: 'resources/read',
          params: { uri: 'od://design-systems/private/DESIGN.md' },
        },
      },
      env,
      tokenResponse('openid') as any,
    )).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: 'CHATGPT_MCP_INSUFFICIENT_SCOPE',
    });

    expect(() => resolveChatGptMcpDaemonUrl(
      'http://127.0.0.1:7456',
      authorized.principal,
      { ...env, OD_CHATGPT_MCP_TENANT_URL_TEMPLATE: '' },
    )).toThrow(/shared user storage is refused/u);
  });

  it('validates Vela JWT access tokens through JWKS', async () => {
    const issuer = 'https://vela-api.powerformer.net/api/auth';
    const audience = 'https://mcp.open-design.ai/mcp';
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    const token = await new SignJWT({
      scope: 'openid opendesign.runs.write',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'vela-test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('vela-user-123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const fetchJwks = vi.fn(async () => Response.json({
      keys: [{ ...publicJwk, kid: 'vela-test-key', alg: 'ES256', use: 'sig' }],
    }));
    const remote = {
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: '203.0.113.10' },
      protocol: 'https',
      body: { method: 'tools/call', params: { name: 'start_run' } },
      get: (name: string) => name === 'host' ? 'mcp.open-design.ai' : undefined,
    } as any;
    const env = {
      OD_CHATGPT_OAUTH_ISSUER: issuer,
      OD_CHATGPT_MCP_RESOURCE_URL: audience,
      OD_CHATGPT_MCP_TENANT_URL_TEMPLATE: 'https://{sub}.tenant.open-design.internal',
    };

    await expect(authorizeChatGptMcpRequest(
      remote,
      env,
      fetchJwks as any,
    )).resolves.toMatchObject({
      ok: true,
      accessToken: token,
      principal: { mode: 'oauth', subject: 'vela-user-123' },
    });
    expect(fetchJwks).toHaveBeenCalledWith(
      `${issuer}/jwks`,
      expect.any(Object),
    );

    await expect(authorizeChatGptMcpRequest(
      remote,
      { ...env, OD_CHATGPT_MCP_RESOURCE_URL: 'https://other.example/mcp' },
      fetchJwks as any,
    )).resolves.toMatchObject({
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_INVALID_TOKEN',
    });
  });

  it('passes the verified OAuth subject and token to managed tenant routing', async () => {
    const issuer = 'https://vela-api.powerformer.net/api/auth';
    const audience = 'https://mcp.open-design.ai/mcp';
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    const token = await new SignJWT({ scope: 'openid profile' })
      .setProtectedHeader({ alg: 'ES256', kid: 'managed-tenant-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('managed-user-123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const resolveTenantDaemonUrl = vi.fn(async () => 'http://127.0.0.1:9');
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:8',
      resolveTenantDaemonUrl,
      env: {
        OD_CHATGPT_OAUTH_ISSUER: issuer,
        OD_CHATGPT_MCP_RESOURCE_URL: audience,
      },
      fetchImpl: vi.fn(async () => Response.json({
        keys: [{ ...publicJwk, kid: 'managed-tenant-key', alg: 'ES256', use: 'sig' }],
      })) as any,
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'managed-tenant-test', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(resolveTenantDaemonUrl).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'oauth', subject: 'managed-user-123' }),
      token,
    );
  });
});
