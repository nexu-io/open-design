import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineConnectorTool, type ConnectorCatalogDefinition } from '../src/connectors/catalog.js';
import type { ConnectorService } from '../src/connectors/service.js';
import {
  extractMemoryFromConnectors,
  suggestMemoryFromConnectors,
} from '../src/memory-connectors.js';
import { memoryDir, readMemoryEntry, writeMemoryConfig } from '../src/memory.js';
import {
  __resetExtractionsForTests,
  listExtractions,
} from '../src/memory-extractions.js';

const dataDir = path.join(process.env.OD_DATA_DIR ?? process.cwd(), 'memory-connectors-test');
const originalFetch = globalThis.fetch;

const notionDefinition: ConnectorCatalogDefinition = {
  id: 'notion',
  name: 'Notion',
  provider: 'composio',
  category: 'Productivity',
  description: 'Search and read Notion pages.',
  authentication: 'composio',
  tools: [
    defineConnectorTool({
      name: 'notion.notion_search',
      providerToolId: 'NOTION_SEARCH',
      title: 'Search Notion',
      description: 'Search Notion pages and databases.',
      inputSchemaJson: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      requiredScopes: ['read'],
      curation: {
        useCases: ['personal_daily_digest'],
        reason: 'Searches the workspace for personal context.',
      },
    }),
  ],
  allowedToolNames: ['notion.notion_search'],
  curatedToolNames: ['notion.notion_search'],
  minimumApproval: 'auto',
};

function createNotionService(
  executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [],
): ConnectorService {
  return {
    listFastDefinitions: () => [notionDefinition],
    listConnectorStatuses: () => ({
      notion: { status: 'connected', accountLabel: 'Product wiki' },
    }),
    getStatus: () => ({ status: 'connected', accountLabel: 'Product wiki' }),
    execute: async (request: { connectorId: string; toolName: string; input: unknown }) => {
      executeCalls.push(request);
      return {
        ok: true,
        connectorId: request.connectorId,
        accountLabel: 'Product wiki',
        toolName: request.toolName,
        safety: notionDefinition.tools[0]!.safety,
        outputSummary: 'Found OpenDesign design memory notes in Notion.',
        output: {
          pages: [
            {
              title: 'OpenDesign memory plan',
              text: 'OpenDesign connector memory should collect design preferences, UI decisions, and visual references from Notion.',
            },
          ],
        },
      };
    },
  } as unknown as ConnectorService;
}

describe('connector memory extraction', () => {
  beforeEach(async () => {
    await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
    __resetExtractionsForTests();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              entries: [
                {
                  type: 'project',
                  name: 'OpenDesign design memory',
                  description: 'Connector memories should stay design-related',
                  body: 'OpenDesign connector memories should focus on design preferences, UI decisions, and visual references rather than generic app activity.',
                },
              ],
            }),
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reads connected app context and returns reviewable memory suggestions', async () => {
    const executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [];
    const service = createNotionService(executeCalls);

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(result.attemptedLLM).toBe(true);
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        id: 'project_opendesign_design_memory_1',
        type: 'project',
        name: 'OpenDesign design memory',
        source: expect.objectContaining({
          kind: 'connector',
          connectorId: 'notion',
          connectorName: 'Notion',
        }),
      }),
    ]);
    expect(executeCalls).toEqual([
      expect.objectContaining({
        connectorId: 'notion',
        toolName: 'notion.notion_search',
        input: expect.objectContaining({ query: expect.any(String) }),
      }),
    ]);
    await expect(
      readMemoryEntry(dataDir, 'project_opendesign_design_memory'),
    ).resolves.toBeNull();
    expect(listExtractions()[0]).toMatchObject({
      kind: 'connector',
      phase: 'success',
      writtenCount: 0,
    });
  });

  it('tries additional connector queries when the first read is empty', async () => {
    const executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [];
    const service = {
      ...createNotionService(executeCalls),
      execute: async (request: { connectorId: string; toolName: string; input: unknown }) => {
        executeCalls.push(request);
        if (executeCalls.length === 1) {
          return {
            ok: true,
            connectorId: request.connectorId,
            accountLabel: 'Product wiki',
            toolName: request.toolName,
            safety: notionDefinition.tools[0]!.safety,
            outputSummary: 'No results',
            output: { pages: [] },
          };
        }
        return {
          ok: true,
          connectorId: request.connectorId,
          accountLabel: 'Product wiki',
          toolName: request.toolName,
          safety: notionDefinition.tools[0]!.safety,
          outputSummary: 'Found project notes.',
          output: {
            pages: [
              {
                title: 'Memory project',
                text: 'OpenDesign should summarize connector findings when no durable memory is obvious.',
              },
            ],
          },
        };
      },
    } as unknown as ConnectorService;

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(executeCalls.length).toBeGreaterThan(1);
    expect(executeCalls[0]).toEqual(expect.objectContaining({
      input: expect.objectContaining({
        query: '设计思路 设计偏好 UI UX 视觉风格 品牌 logo 设计系统 OpenDesign',
      }),
    }));
    expect(executeCalls[1]).toEqual(expect.objectContaining({
      input: expect.objectContaining({ query: '设计思路' }),
    }));
    expect(result.connectors).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        summary: 'Found project notes.',
      }),
    ]);
    expect(result.suggestions).toHaveLength(1);
  });

  it('continues past readable but off-topic results to find Chinese design notes', async () => {
    const executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [];
    const service = {
      ...createNotionService(executeCalls),
      execute: async (request: { connectorId: string; toolName: string; input: unknown }) => {
        executeCalls.push(request);
        if (executeCalls.length === 1) {
          return {
            ok: true,
            connectorId: request.connectorId,
            accountLabel: 'Product wiki',
            toolName: request.toolName,
            safety: notionDefinition.tools[0]!.safety,
            outputSummary: 'Found 2 readable items from Notion: clipping, sticker.',
            output: {
              pages: [
                { title: 'clipping', text: 'Saved shopping snippets and unrelated web clips.' },
                { title: 'sticker', text: 'Sticker collection notes for personal errands.' },
              ],
            },
          };
        }
        return {
          ok: true,
          connectorId: request.connectorId,
          accountLabel: 'Product wiki',
          toolName: request.toolName,
          safety: notionDefinition.tools[0]!.safety,
          outputSummary: 'Found Chinese design notes.',
          output: {
            pages: [
              {
                title: '设计思路',
                text: 'comfyui 用黑色 logo，整体视觉偏深色主题。',
              },
            ],
          },
        };
      },
    } as unknown as ConnectorService;

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(executeCalls.length).toBeGreaterThan(1);
    expect(executeCalls.map((call) => (call.input as { query?: string }).query)).toContain('设计思路');
    expect(result.connectors).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        summary: 'Found Chinese design notes.',
      }),
    ]);
    expect(result.attemptedLLM).toBe(true);
    expect(result.suggestions).toHaveLength(1);
  });

  it('uses the Notion empty-query fallback when specific title searches miss', async () => {
    const searchPagesTool = defineConnectorTool({
      name: 'notion.notion_search_notion_page',
      providerToolId: 'NOTION_SEARCH_NOTION_PAGE',
      title: 'Search Notion pages and databases',
      description: 'Searches Notion pages and databases by title. If a specific title search misses, try an empty query to list all accessible items and filter client-side.',
      inputSchemaJson: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            default: '',
            description: 'Text to search for in page titles. Try an empty query as a fallback.',
          },
          page_size: { type: 'integer' },
          timestamp: { type: 'string' },
          direction: { type: 'string' },
          filter_value: { type: 'string' },
          filter_property: { type: 'string' },
        },
        additionalProperties: false,
      },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      requiredScopes: ['read'],
      curation: {
        useCases: ['personal_daily_digest'],
        reason: 'Searches the workspace for personal context.',
      },
    });
    const definition: ConnectorCatalogDefinition = {
      ...notionDefinition,
      tools: [searchPagesTool],
      allowedToolNames: [searchPagesTool.name],
      curatedToolNames: [searchPagesTool.name],
    };
    const executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [];
    const service = {
      listFastDefinitions: () => [definition],
      listConnectorStatuses: () => ({
        notion: { status: 'connected', accountLabel: 'Product wiki' },
      }),
      getStatus: () => ({ status: 'connected', accountLabel: 'Product wiki' }),
      execute: async (request: { connectorId: string; toolName: string; input: unknown }) => {
        executeCalls.push(request);
        const query = (request.input as { query?: string }).query ?? '';
        if (query !== '') {
          return {
            ok: true,
            connectorId: request.connectorId,
            accountLabel: 'Product wiki',
            toolName: request.toolName,
            safety: searchPagesTool.safety,
            outputSummary: 'Found 2 readable items from Notion: clipping, sticker.',
            output: {
              pages: [
                { title: 'clipping', text: 'Saved shopping snippets and unrelated web clips.' },
                { title: 'sticker', text: 'Sticker collection notes for personal errands.' },
              ],
            },
          };
        }
        return {
          ok: true,
          connectorId: request.connectorId,
          accountLabel: 'Product wiki',
          toolName: request.toolName,
          safety: searchPagesTool.safety,
          outputSummary: 'Listed accessible Notion pages.',
          output: {
            pages: [
              { title: 'clipping', text: 'Saved shopping snippets.' },
              { title: '设计思路', text: 'comfyui 用黑色 logo，整体视觉偏深色主题。' },
            ],
          },
        };
      },
    } as unknown as ConnectorService;

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    const emptyFallbackCall = executeCalls.find((call) => (call.input as { query?: string }).query === '');
    expect(emptyFallbackCall).toEqual(expect.objectContaining({
      input: expect.objectContaining({
        query: '',
        page_size: 25,
        timestamp: 'last_edited_time',
        direction: 'descending',
        filter_value: 'page',
        filter_property: 'object',
      }),
    }));
    expect(result.connectors).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        summary: 'Listed accessible Notion pages.',
      }),
    ]);
    expect(result.suggestions).toHaveLength(1);
  });

  it('opens relevant Notion pages after search so page body reaches the memory model', async () => {
    const pageId = '21a58690-0954-80a9-8ab6-ea4c93f87da2';
    const searchPagesTool = defineConnectorTool({
      name: 'notion.notion_search_notion_page',
      providerToolId: 'NOTION_SEARCH_NOTION_PAGE',
      title: 'Search Notion pages and databases',
      description: 'Searches Notion pages and databases by title.',
      inputSchemaJson: {
        type: 'object',
        properties: {
          query: { type: 'string', default: '' },
          page_size: { type: 'integer' },
          timestamp: { type: 'string' },
          direction: { type: 'string' },
          filter_value: { type: 'string' },
          filter_property: { type: 'string' },
        },
        additionalProperties: false,
      },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      requiredScopes: ['read'],
      curation: {
        useCases: ['personal_daily_digest'],
        reason: 'Searches the workspace for memory context.',
      },
    });
    const getPageMarkdownTool = defineConnectorTool({
      name: 'notion.notion_get_page_markdown',
      providerToolId: 'NOTION_GET_PAGE_MARKDOWN',
      title: 'Get page markdown',
      description: 'Retrieve a Notion page full content rendered as markdown.',
      inputSchemaJson: {
        type: 'object',
        properties: {
          page_id: { type: 'string' },
          include_transcript: { type: 'boolean' },
        },
        required: ['page_id'],
        additionalProperties: false,
      },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      requiredScopes: ['read'],
    });
    const definition: ConnectorCatalogDefinition = {
      ...notionDefinition,
      tools: [searchPagesTool, getPageMarkdownTool],
      allowedToolNames: [searchPagesTool.name, getPageMarkdownTool.name],
      curatedToolNames: [searchPagesTool.name],
    };
    const executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [];
    const service = {
      listFastDefinitions: () => [definition],
      listConnectorStatuses: () => ({
        notion: { status: 'connected', accountLabel: 'Product wiki' },
      }),
      getStatus: () => ({ status: 'connected', accountLabel: 'Product wiki' }),
      execute: async (request: { connectorId: string; toolName: string; input: unknown }) => {
        executeCalls.push(request);
        if (request.toolName === getPageMarkdownTool.name) {
          return {
            ok: true,
            connectorId: request.connectorId,
            accountLabel: 'Product wiki',
            toolName: request.toolName,
            safety: getPageMarkdownTool.safety,
            outputSummary: 'Fetched page markdown.',
            output: {
              markdown: '设计思路\n\ncomfyui 用黑色 logo，整体视觉偏深色主题，信息密度可以更高。',
            },
          };
        }
        return {
          ok: true,
          connectorId: request.connectorId,
          accountLabel: 'Product wiki',
          toolName: request.toolName,
          safety: searchPagesTool.safety,
          outputSummary: 'Found 25 readable items from Notion: clipping.',
          output: {
            results: [
              {
                object: 'page',
                id: pageId,
                url: `https://www.notion.so/${pageId.replaceAll('-', '')}`,
                properties: {
                  Name: {
                    title: [{ plain_text: '设计思路' }],
                  },
                },
              },
            ],
          },
        };
      },
    } as unknown as ConnectorService;

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(executeCalls).toEqual([
      expect.objectContaining({ toolName: searchPagesTool.name }),
      expect.objectContaining({
        toolName: getPageMarkdownTool.name,
        input: expect.objectContaining({
          page_id: pageId,
          include_transcript: false,
        }),
      }),
    ]);
    expect(result.connectors).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        summary: expect.stringContaining('Read page content: 设计思路'),
      }),
    ]);
    const fetchMock = vi.mocked(globalThis.fetch);
    const [, init] = fetchMock.mock.calls[0]!;
    const requestBody = JSON.parse(String(init?.body));
    expect(requestBody.messages[1].content).toContain('comfyui 用黑色 logo');
    expect(result.suggestions).toHaveLength(1);
  });

  it('tries another search tool when the first tool only finds off-topic pages', async () => {
    const titleSearchTool = defineConnectorTool({
      name: 'notion.notion_search_notion_page',
      providerToolId: 'NOTION_SEARCH_NOTION_PAGE',
      title: 'Search Notion pages and databases',
      description: 'Searches Notion pages and databases by title. If a specific title search misses, try an empty query to list all accessible items.',
      inputSchemaJson: {
        type: 'object',
        properties: {
          query: { type: 'string', default: '' },
          page_size: { type: 'integer' },
        },
        additionalProperties: false,
      },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      requiredScopes: ['read'],
      curation: { useCases: ['personal_daily_digest'] },
    });
    const broadSearchTool = defineConnectorTool({
      name: 'notion.notion_search',
      providerToolId: 'NOTION_SEARCH',
      title: 'Search Notion',
      description: 'Search Notion pages and databases.',
      inputSchemaJson: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      requiredScopes: ['read'],
      curation: { useCases: ['personal_daily_digest'] },
    });
    const definition: ConnectorCatalogDefinition = {
      ...notionDefinition,
      tools: [titleSearchTool, broadSearchTool],
      allowedToolNames: [titleSearchTool.name, broadSearchTool.name],
      curatedToolNames: [titleSearchTool.name, broadSearchTool.name],
    };
    const executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [];
    const service = {
      listFastDefinitions: () => [definition],
      listConnectorStatuses: () => ({
        notion: { status: 'connected', accountLabel: 'Product wiki' },
      }),
      getStatus: () => ({ status: 'connected', accountLabel: 'Product wiki' }),
      execute: async (request: { connectorId: string; toolName: string; input: unknown }) => {
        executeCalls.push(request);
        if (request.toolName === titleSearchTool.name) {
          return {
            ok: true,
            connectorId: request.connectorId,
            accountLabel: 'Product wiki',
            toolName: request.toolName,
            safety: titleSearchTool.safety,
            outputSummary: 'Found 5 readable items from Notion: clipping.',
            output: { pages: [{ title: 'clipping', text: 'Saved shopping snippets.' }] },
          };
        }
        return {
          ok: true,
          connectorId: request.connectorId,
          accountLabel: 'Product wiki',
          toolName: request.toolName,
          safety: broadSearchTool.safety,
          outputSummary: 'Found design thinking note.',
          output: {
            pages: [
              {
                title: '设计思路',
                text: 'comfyui 用黑色 logo，整体视觉偏深色主题。',
              },
            ],
          },
        };
      },
    } as unknown as ConnectorService;

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(executeCalls.some((call) => call.toolName === broadSearchTool.name)).toBe(true);
    expect(result.connectors).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        toolName: broadSearchTool.name,
        summary: 'Found design thinking note.',
      }),
    ]);
    expect(result.suggestions).toHaveLength(1);
  });

  it('tries the next connector tool when a provider tool id is missing', async () => {
    const fallbackTool = defineConnectorTool({
      name: 'notion.notion_search_notion_page',
      providerToolId: 'NOTION_SEARCH_NOTION_PAGE',
      title: 'Search Notion pages and databases',
      description: 'Search Notion pages and databases.',
      inputSchemaJson: {
        type: 'object',
        properties: { query: { type: 'string' } },
        additionalProperties: false,
      },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      requiredScopes: ['read'],
    });
    const definition: ConnectorCatalogDefinition = {
      ...notionDefinition,
      tools: [...notionDefinition.tools, fallbackTool],
      allowedToolNames: ['notion.notion_search', 'notion.notion_search_notion_page'],
    };
    const executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [];
    const service = {
      listFastDefinitions: () => [definition],
      listConnectorStatuses: () => ({
        notion: { status: 'connected', accountLabel: 'Product wiki' },
      }),
      getStatus: () => ({ status: 'connected', accountLabel: 'Product wiki' }),
      execute: async (request: { connectorId: string; toolName: string; input: unknown }) => {
        executeCalls.push(request);
        if (request.toolName === 'notion.notion_search') {
          throw new Error('Tool NOTION_SEARCH not found');
        }
        return {
          ok: true,
          connectorId: request.connectorId,
          accountLabel: 'Product wiki',
          toolName: request.toolName,
          safety: fallbackTool.safety,
          outputSummary: 'Found Notion pages from the current search API.',
          output: {
            pages: [
              {
                title: 'Memory source notes',
                text: 'OpenDesign should read the currently available Notion search tool.',
              },
            ],
          },
        };
      },
    } as unknown as ConnectorService;

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(executeCalls.map((call) => call.toolName)).toEqual([
      'notion.notion_search',
      'notion.notion_search_notion_page',
    ]);
    expect(result.attemptedLLM).toBe(true);
    expect(result.connectors).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        toolName: 'notion.notion_search_notion_page',
        summary: 'Found Notion pages from the current search API.',
      }),
    ]);
  });

  it('does not invent suggestions when the model finds no design memory', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({ entries: [] }),
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    const service = createNotionService();

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(result.attemptedLLM).toBe(true);
    expect(result.suggestions).toEqual([]);
  });

  it('keeps derived read summaries out of suggested memories', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({ entries: [] }),
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    const service = {
      ...createNotionService(),
      execute: async (request: { connectorId: string; toolName: string; input: unknown }) => ({
        ok: true,
        connectorId: request.connectorId,
        accountLabel: 'Product wiki',
        toolName: request.toolName,
        safety: notionDefinition.tools[0]!.safety,
        outputSummary: 'notion.notion_search',
        output: {
          pages: [
            {
              title: 'Memory source notes',
              text: 'OpenDesign should summarize connector findings before saving them as memory.',
            },
          ],
        },
      }),
    } as unknown as ConnectorService;

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(result.connectors).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        summary: 'Found 1 readable item from Notion: Memory source notes.',
      }),
    ]);
    expect(result.suggestions).toEqual([]);
  });

  it('filters connector meta copy even when the model returns it', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              entries: [
                {
                  type: 'reference',
                  name: 'GitHub context summary',
                  description: 'Summary from GitHub',
                  body: 'OpenDesign read GitHub via List notifications. Summary: Found 5 readable items from GitHub. Save this if it should be reused as context in future chats.',
                },
                {
                  type: 'feedback',
                  name: 'UI density preference',
                  description: 'The user prefers denser design interfaces',
                  body: 'The user prefers OpenDesign UI to use higher information density with clear hierarchy instead of spacious marketing-style cards.',
                },
              ],
            }),
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service: createNotionService(),
    });

    expect(result.suggestions).toEqual([
      expect.objectContaining({
        type: 'feedback',
        name: 'UI density preference',
        body: expect.stringContaining('higher information density'),
      }),
    ]);
  });

  it('uses the current Local CLI for same-as-chat connector suggestions', async () => {
    await writeMemoryConfig(dataDir, { extraction: null });
    const localCliRunner = vi.fn(async () => JSON.stringify({
      entries: [
        {
          type: 'feedback',
          name: 'Design memory source',
          description: 'Connector memory should use Claude Code',
          body: 'OpenDesign connector memory extraction should use the same Claude Code Local CLI selected for chat when the memory model is set to same as chat.',
        },
      ],
    }));

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      chatAgentId: 'claude',
      chatModel: 'default',
      service: createNotionService(),
      localCliRunner,
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(localCliRunner).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'claude',
      model: 'default',
      projectRoot: process.cwd(),
      dataDir,
    }));
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        type: 'feedback',
        name: 'Design memory source',
      }),
    ]);
    expect(listExtractions()[0]).toMatchObject({
      kind: 'connector',
      phase: 'success',
      provider: {
        kind: 'anthropic',
        model: 'default',
        credentialSource: 'chat-cli',
      },
    });
  });

  it('uses OpenCode Local CLI for same-as-chat connector suggestions', async () => {
    await writeMemoryConfig(dataDir, { extraction: null });
    const localCliRunner = vi.fn(async () => JSON.stringify({
      entries: [
        {
          type: 'project',
          name: 'OpenCode design memory',
          description: 'Connector memory should use OpenCode',
          body: 'OpenDesign connector memory extraction should use the same OpenCode Local CLI selected for chat instead of falling back to an OpenAI API key.',
        },
      ],
    }));

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      chatAgentId: 'opencode',
      chatModel: 'openai/gpt-5',
      service: createNotionService(),
      localCliRunner,
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(localCliRunner).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'opencode',
      model: 'openai/gpt-5',
      projectRoot: process.cwd(),
      dataDir,
    }));
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        type: 'project',
        name: 'OpenCode design memory',
      }),
    ]);
    expect(listExtractions()[0]).toMatchObject({
      kind: 'connector',
      phase: 'success',
      provider: {
        kind: 'openai',
        model: 'openai/gpt-5',
        credentialSource: 'chat-cli',
      },
    });
  });

  it('uses Codex Local CLI for same-as-chat connector suggestions', async () => {
    await writeMemoryConfig(dataDir, { extraction: null });
    const localCliRunner = vi.fn(async () => JSON.stringify({
      entries: [
        {
          type: 'project',
          name: 'Codex design memory',
          description: 'Connector memory should use Codex',
          body: 'OpenDesign connector memory extraction should use the same Codex Local CLI selected for chat instead of falling back to an OpenAI API key.',
        },
      ],
    }));

    const result = await suggestMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      chatAgentId: 'codex',
      chatModel: 'gpt-5',
      service: createNotionService(),
      localCliRunner,
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(localCliRunner).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'codex',
      model: 'gpt-5',
      projectRoot: process.cwd(),
      dataDir,
    }));
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        type: 'project',
        name: 'Codex design memory',
      }),
    ]);
    expect(listExtractions()[0]).toMatchObject({
      kind: 'connector',
      phase: 'success',
      provider: {
        kind: 'openai',
        model: 'gpt-5',
        credentialSource: 'chat-cli',
      },
    });
  });

  it('runs Codex Local CLI through JSON event stream with stdin prompt', async () => {
    await writeMemoryConfig(dataDir, { extraction: null });
    const tempDir = await fsp.mkdtemp(path.join(tmpdir(), 'od-codex-memory-'));
    const binPath = path.join(tempDir, 'codex');
    const capturePath = path.join(tempDir, 'capture.json');
    const previousPath = process.env.PATH;
    const previousCapture = process.env.OD_MEMORY_CODEX_ARGS_OUT;

    await fsp.writeFile(
      binPath,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const stdin = fs.readFileSync(0, 'utf8');
fs.writeFileSync(process.env.OD_MEMORY_CODEX_ARGS_OUT, JSON.stringify({ args, stdin }));
process.stdout.write(JSON.stringify({
  type: 'item.completed',
  item: {
    type: 'agent_message',
    text: JSON.stringify({
      entries: [{
        type: 'project',
        name: 'Codex stdin prompt',
        description: 'Codex memory used stdin',
        body: 'OpenDesign connector memory extraction should pass the compacted prompt to Codex stdin and parse the JSON event stream response.'
      }]
    })
  }
}) + '\\n');
`,
      'utf8',
    );
    await fsp.chmod(binPath, 0o755);

    try {
      process.env.PATH = `${tempDir}${path.delimiter}${previousPath ?? ''}`;
      process.env.OD_MEMORY_CODEX_ARGS_OUT = capturePath;

      const result = await suggestMemoryFromConnectors(dataDir, {
        projectsRoot: process.cwd(),
        projectRoot: process.cwd(),
        connectorIds: ['notion'],
        chatAgentId: 'codex',
        chatModel: 'gpt-5',
        service: createNotionService(),
      });

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result.suggestions).toEqual([
        expect.objectContaining({
          type: 'project',
          name: 'Codex stdin prompt',
        }),
      ]);

      const captured = JSON.parse(await fsp.readFile(capturePath, 'utf8'));
      expect(captured.args).toEqual(expect.arrayContaining([
        'exec',
        '--json',
        '--skip-git-repo-check',
        '-C',
        process.cwd(),
        '--model',
        'gpt-5',
      ]));
      expect(captured.stdin).toContain('You are a design-memory extractor');
      expect(captured.stdin).toContain('OpenDesign connector memory should collect design preferences');
    } finally {
      if (previousPath == null) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
      if (previousCapture == null) {
        delete process.env.OD_MEMORY_CODEX_ARGS_OUT;
      } else {
        process.env.OD_MEMORY_CODEX_ARGS_OUT = previousCapture;
      }
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('runs OpenCode Local CLI memory extraction with the prompt on stdin', async () => {
    await writeMemoryConfig(dataDir, { extraction: null });
    const tempDir = await fsp.mkdtemp(path.join(tmpdir(), 'od-opencode-memory-'));
    const binPath = path.join(tempDir, 'opencode-cli');
    const capturePath = path.join(tempDir, 'capture.json');
    const previousPath = process.env.PATH;
    const previousCapture = process.env.OD_MEMORY_OPENCODE_ARGS_OUT;

    // Model the real `opencode run` arg parser: `-f, --file` is a yargs
    // *array* option, so it greedily swallows every following non-flag
    // token as a file path. Any captured path that doesn't exist makes the
    // real CLI exit 1 with "File not found: <token>" — which is exactly how
    // a trailing positional message after `--file` crashed extraction. The
    // supported one-shot shape is bare `run` with the prompt on stdin.
    await fsp.writeFile(
      binPath,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const stdin = fs.readFileSync(0, 'utf8');
const files = [];
const fileFlag = args.findIndex((a) => a === '--file' || a === '-f');
if (fileFlag >= 0) {
  for (let i = fileFlag + 1; i < args.length; i += 1) {
    if (args[i].startsWith('-')) break;
    files.push(args[i]);
  }
}
fs.writeFileSync(process.env.OD_MEMORY_OPENCODE_ARGS_OUT, JSON.stringify({ args, stdin, files }));
for (const f of files) {
  if (!fs.existsSync(f)) {
    process.stderr.write('Error: File not found: ' + f + '\\n');
    process.exit(1);
  }
}
process.stdout.write(JSON.stringify({
  type: 'text',
  part: {
    type: 'text',
    text: JSON.stringify({
      entries: [{
        type: 'project',
        name: 'OpenCode stdin prompt',
        description: 'OpenCode memory used stdin',
        body: 'OpenDesign connector memory extraction should pass the compacted prompt to OpenCode on stdin and parse the JSON event stream response.'
      }]
    })
  }
}) + '\\n');
`,
      'utf8',
    );
    await fsp.chmod(binPath, 0o755);

    try {
      process.env.PATH = `${tempDir}${path.delimiter}${previousPath ?? ''}`;
      process.env.OD_MEMORY_OPENCODE_ARGS_OUT = capturePath;

      const result = await suggestMemoryFromConnectors(dataDir, {
        projectsRoot: process.cwd(),
        projectRoot: process.cwd(),
        connectorIds: ['notion'],
        chatAgentId: 'opencode',
        chatModel: 'openai/gpt-5',
        service: createNotionService(),
      });

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result.suggestions).toEqual([
        expect.objectContaining({
          type: 'project',
          name: 'OpenCode stdin prompt',
        }),
      ]);

      const captured = JSON.parse(await fsp.readFile(capturePath, 'utf8'));
      expect(captured.args).toEqual(expect.arrayContaining([
        'run',
        '--format',
        'json',
        'openai/gpt-5',
      ]));
      // The prompt rides on stdin like the chat-run path; no `--file`
      // attachment (whose array option would swallow any trailing message).
      expect(captured.args).not.toContain('--file');
      expect(captured.args).not.toContain('-f');
      expect(captured.files).toEqual([]);
      expect(captured.stdin).toContain('You are a design-memory extractor');
      expect(captured.stdin).toContain('OpenDesign connector memory should collect design preferences');
    } finally {
      if (previousPath == null) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
      if (previousCapture == null) {
        delete process.env.OD_MEMORY_OPENCODE_ARGS_OUT;
      } else {
        process.env.OD_MEMORY_OPENCODE_ARGS_OUT = previousCapture;
      }
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('reads connected app context and saves connector-sourced memory', async () => {
    const executeCalls: Array<{ connectorId: string; toolName: string; input: unknown }> = [];
    const service = createNotionService(executeCalls);

    const result = await extractMemoryFromConnectors(dataDir, {
      projectsRoot: process.cwd(),
      projectRoot: process.cwd(),
      connectorIds: ['notion'],
      service,
    });

    expect(result.attemptedLLM).toBe(true);
    expect(result.connectors).toEqual([
      expect.objectContaining({
        connectorId: 'notion',
        connectorName: 'Notion',
        accountLabel: 'Product wiki',
        status: 'succeeded',
        toolName: 'notion.notion_search',
      }),
    ]);
    expect(executeCalls).toEqual([
      expect.objectContaining({
        connectorId: 'notion',
        toolName: 'notion.notion_search',
        input: expect.objectContaining({ query: expect.any(String) }),
      }),
    ]);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({
      id: 'project_opendesign_design_memory',
      type: 'project',
      name: 'OpenDesign design memory',
    });

    const stored = await readMemoryEntry(dataDir, 'project_opendesign_design_memory');
    expect(stored?.body).toContain('design preferences');
    expect(listExtractions()[0]).toMatchObject({
      kind: 'connector',
      phase: 'success',
      writtenCount: 1,
    });
  });
});
