import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

type JsonRpcResponse = {
  id?: number;
  result?: Record<string, unknown>;
};

const STDIO_QUESTION_FORM = {
  id: 'website-launch-brief',
  title: '确认网站方向',
  description: '只选择需求中尚未确定的内容。',
  lang: 'zh-CN',
  submitLabel: '确认并继续',
  questions: [
    {
      id: 'audience',
      label: '主要受众',
      type: 'radio',
      required: true,
      allowCustom: false,
      default: 'developers',
      options: [
        { label: '开发者', value: 'developers' },
        { label: '产品团队', value: 'product-teams' },
      ],
    },
    {
      id: 'primaryCta',
      label: '主要行动按钮',
      type: 'radio',
      required: true,
      allowCustom: false,
      default: 'start-free',
      options: [
        { label: '免费开始', value: 'start-free' },
        { label: '预约演示', value: 'book-demo' },
      ],
    },
    {
      id: 'proof',
      label: '重点证明内容',
      type: 'checkbox',
      required: true,
      allowCustom: false,
      maxSelections: 2,
      default: ['customer-results'],
      options: [
        { label: '客户成果', value: 'customer-results' },
        { label: '产品数据', value: 'product-metrics' },
      ],
    },
  ],
};

function runChatGptStdioProbe(): Promise<{ code: number | null; stderr: string; responses: JsonRpcResponse[] }> {
  return new Promise((resolve, reject) => {
    const repositoryRoot = join(import.meta.dirname, '../../..');
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        join(import.meta.dirname, '../src/cli.ts'),
        'mcp',
        'chatgpt',
        '--daemon-url',
        'http://127.0.0.1:1',
      ],
      { cwd: repositoryRoot, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      const responses = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as JsonRpcResponse);
      resolve({ code, stderr, responses });
    });

    for (const message of [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'open-design-test', version: '1.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'collect_brief',
          arguments: {
            artifactType: 'website',
            projectTitle: 'Local Custom UI smoke test',
            knownAnswers: { audience: 'developers' },
            questionForm: STDIO_QUESTION_FORM,
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/read',
        params: { uri: 'ui://open-design/artifact-card-v10.html' },
      },
    ]) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    child.stdin.end();
  });
}

describe('ChatGPT stdio MCP surface', () => {
  it('registers the Cloud V1 tools and serves the brief Custom UI without a running daemon', async () => {
    const { code, stderr, responses } = await runChatGptStdioProbe();
    expect(code, stderr).toBe(0);

    const tools = responses.find((response) => response.id === 2)?.result?.tools as Array<{
      name: string;
      _meta?: Record<string, unknown>;
      inputSchema?: Record<string, any>;
    }>;
    expect(tools.map((tool) => tool.name)).toEqual([
      'create_project',
      'collect_brief',
      'get_cloud_account',
      'start_run',
      'get_run',
      'list_versions',
      'restore_version',
      'export_project',
      'cancel_run',
    ]);
    const collectBrief = tools.find((tool) => tool.name === 'collect_brief');
    expect(collectBrief?._meta).toMatchObject({
      'ui/resourceUri': 'ui://open-design/artifact-card-v10.html',
    });
    expect(collectBrief?.inputSchema?.required).toEqual(['artifactType', 'questionForm']);
    expect(collectBrief?.inputSchema?.properties).toMatchObject({
      projectTitle: { type: 'string' },
      knownAnswers: { type: 'object' },
      questionForm: { type: 'object' },
    });
    expect(collectBrief?.inputSchema?.properties?.questionForm?.properties?.questions).toMatchObject({
      minItems: 1,
      maxItems: 5,
    });

    const brief = responses.find((response) => response.id === 3)?.result as {
      structuredContent?: Record<string, unknown>;
    };
    expect(brief.structuredContent).toMatchObject({
      view: 'brief-form',
      artifactType: 'website',
      projectTitle: 'Local Custom UI smoke test',
      knownAnswers: { audience: 'developers' },
      questionForm: {
        id: 'website-launch-brief',
        title: '确认网站方向',
        lang: 'zh-CN',
      },
    });
    expect((brief.structuredContent?.questionForm as typeof STDIO_QUESTION_FORM).questions
      .map((question) => question.id)).toEqual(['primaryCta', 'proof']);

    const resource = responses.find((response) => response.id === 4)?.result as {
      contents?: Array<{ mimeType?: string; text?: string }>;
    };
    expect(resource.contents?.[0]?.mimeType).toBe('text/html;profile=mcp-app');
    expect(resource.contents?.[0]?.text).toContain('id="brief-form"');
    expect(resource.contents?.[0]?.text).toContain('id="brief-questions"');
    expect(resource.contents?.[0]?.text).toContain('questionForm.questions');
    expect(resource.contents?.[0]?.text).toContain('[form answers — ');
    expect(resource.contents?.[0]?.text).not.toContain('[OpenDesign brief confirmed]');
    expect(resource.contents?.[0]?.text).not.toContain('BRIEF_CHOICE_PRESETS');
    expect(resource.contents?.[0]?.text).not.toContain('id="brief-goal-options"');
    expect(resource.contents?.[0]?.text).not.toContain('<textarea');
  }, 20_000);
});
