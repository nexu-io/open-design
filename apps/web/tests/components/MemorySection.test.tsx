// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemorySection } from '../../src/components/MemorySection';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;
const originalEventSource = globalThis.EventSource;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

class StubEventSource {
  url: string;
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  static instances: StubEventSource[] = [];
  constructor(url: string | URL) {
    this.url = String(url);
    StubEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }
  emit(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
  close() {}
}

function renderMemorySection(props: Partial<ComponentProps<typeof MemorySection>> = {}) {
  return render(
    <I18nProvider initial="en">
      <MemorySection {...props} />
    </I18nProvider>,
  );
}

async function findMemoryIndexTextarea() {
  const indexDetails = (await screen.findByText('MEMORY.md (index)'))
    .closest('details') as HTMLElement;
  return within(indexDetails).getByRole('textbox') as HTMLTextAreaElement;
}

describe('MemorySection', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    StubEventSource.instances = [];
    if (originalEventSource) {
      globalThis.EventSource = originalEventSource;
    } else {
      // @ts-expect-error jsdom shim cleanup
      delete globalThis.EventSource;
    }
    vi.restoreAllMocks();
    if (originalScrollIntoView) {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: Element['scrollIntoView'] }).scrollIntoView;
    }
    window.sessionStorage.clear();
  });

  it('shows the no-provider banner when the latest extraction skipped for missing credentials', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({
          extractions: [
            {
              id: 'ex-1',
              phase: 'skipped',
              reason: 'no-provider',
              kind: 'llm',
              startedAt: Date.now(),
              userMessagePreview: 'Remember my UI preferences',
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    expect(await screen.findByText('LLM memory extraction is not running')).toBeTruthy();
    expect(
      screen.getByText(/No API key found for the memory extractor/i),
    ).toBeTruthy();
  });

  it('creates a new memory entry and refreshes the list', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    let entries = [] as Array<{
      id: string;
      name: string;
      description: string;
      type: string;
      updatedAt: number;
    }>;
    const createBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries,
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        createBodies.push(body);
        entries = [
          {
            id: 'user_ui_preferences',
            name: body.name,
            description: body.description,
            type: body.type,
            updatedAt: Date.now(),
          },
        ];
        return new Response(JSON.stringify({
          entry: {
            id: 'user_ui_preferences',
            name: body.name,
            description: body.description,
            type: body.type,
            body: body.body,
            updatedAt: Date.now(),
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    fireEvent.click(await screen.findByRole('button', { name: 'New memory' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. UI preferences'), {
      target: { value: 'UI preferences' },
    });
    fireEvent.change(screen.getByPlaceholderText('One sentence — what is this memory about?'), {
      target: { value: 'Persistent UI rendering preferences' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/- Rule one[\s\S]*When to apply: optional scope/),
      {
        target: { value: '- Prefer dark mode\n- Prefer generous spacing' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('UI preferences')).toBeTruthy();
    });
    expect(screen.getByText('✓ Memory created')).toBeTruthy();
    expect(createBodies).toEqual([
      {
        name: 'UI preferences',
        description: 'Persistent UI rendering preferences',
        type: 'user',
        body: '- Prefer dark mode\n- Prefer generous spacing',
      },
    ]);
  });

  it('renders the memory tree and opens an entry editor from a tree node', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const entry = {
      id: 'project_design_agent_goal',
      name: 'Design agent goal',
      description: 'Open Design should evolve from accepted work',
      type: 'project',
      body: '- Keep design-system extraction in the loop',
      updatedAt: Date.now(),
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [entry],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/tree') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          tree: [
            {
              id: 'folder:project',
              parentId: null,
              path: '/project',
              name: 'Project',
              kind: 'folder',
              type: 'project',
              scope: 'project',
              sourcePacketIds: [],
              proposalIds: [],
              createdAt: new Date(entry.updatedAt).toISOString(),
              updatedAt: new Date(entry.updatedAt).toISOString(),
              childrenCount: 1,
            },
            {
              id: entry.id,
              parentId: 'folder:project',
              path: `/project/${entry.id}`,
              name: entry.name,
              description: entry.description,
              kind: 'entry',
              type: 'project',
              scope: 'project',
              sourcePacketIds: [],
              proposalIds: [],
              createdAt: new Date(entry.updatedAt).toISOString(),
              updatedAt: new Date(entry.updatedAt).toISOString(),
              childrenCount: 0,
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === `/api/memory/${entry.id}`) {
        return new Response(JSON.stringify({ entry }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const treeSummary = await screen.findByText('Memory tree');
    const treeDetails = treeSummary.closest('details')!;
    expect(within(treeDetails).getByText('/project')).toBeTruthy();
    expect(within(treeDetails).getByText('project_design_agent_goal')).toBeTruthy();

    fireEvent.click(within(treeDetails).getByTitle('Edit'));

    await waitFor(() => {
      expect((screen.getByPlaceholderText('e.g. UI preferences') as HTMLInputElement).value).toBe(
        'Design agent goal',
      );
    });
    expect(screen.getByDisplayValue('- Keep design-system extraction in the loop')).toBeTruthy();
  });

  it('shows unsaved index state and saves the updated index', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    let savedIndex = '# Memory\n\n- Existing bullet\n';
    const putBodies: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: savedIndex,
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/index' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        putBodies.push(body.index);
        savedIndex = body.index;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    fireEvent.click(await screen.findByText('MEMORY.md (index)'));
    const indexArea = await findMemoryIndexTextarea();
    fireEvent.change(indexArea, {
      target: { value: '# Memory\n\n- Existing bullet\n- New bullet\n' },
    });

    expect(await screen.findByText(/Unsaved changes/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save index' }));

    await waitFor(() => {
      expect(screen.getByText('✓ Index saved')).toBeTruthy();
    });
    expect(putBodies).toEqual(['# Memory\n\n- Existing bullet\n- New bullet\n']);
  });

  it('reveals the editor after editing an existing memory entry', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView as Element['scrollIntoView'];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [
            {
              id: 'user_ui_preferences',
              name: 'UI preferences',
              description: 'Persistent UI rendering preferences',
              type: 'user',
              updatedAt: Date.now(),
            },
          ],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/user_ui_preferences') {
        return new Response(JSON.stringify({
          entry: {
            id: 'user_ui_preferences',
            name: 'UI preferences',
            description: 'Persistent UI rendering preferences',
            type: 'user',
            body: '- Prefer dark mode',
            updatedAt: Date.now(),
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const entryCard = (await screen.findByText('UI preferences')).closest('.library-card') as HTMLElement;
    fireEvent.click(within(entryCard).getByTitle('Edit'));

    const nameInput = await screen.findByDisplayValue('UI preferences');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(document.activeElement).toBe(nameInput);
  });

  it('renders saved records in a separate memory records section', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [
	            {
	              id: 'user_ui_preferences',
	              name: 'UI preferences',
	              description: 'Initial preference',
	              type: 'user',
	              updatedAt: Date.now(),
	            },
	            {
	              id: 'feedback_density',
	              name: 'Feedback density',
	              description: 'Prefer compact review cards',
	              type: 'feedback',
	              updatedAt: Date.now(),
	            },
	            {
	              id: 'project_brand_rule',
	              name: 'Project brand rule',
	              description: 'Use the project brand kit',
	              type: 'project',
	              updatedAt: Date.now(),
	            },
          ],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({
          extractions: [
            {
              id: 'ex-1',
              phase: 'success',
              kind: 'llm',
              startedAt: Date.now(),
              finishedAt: Date.now() + 1200,
              userMessagePreview: 'Remember I prefer dark mode',
              writtenCount: 1,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const savedRow = await screen.findByText('UI preferences');
    const extractionRow = await screen.findByText('Remember I prefer dark mode');
    const indexSummary = screen.getByText('MEMORY.md (index)')
      .closest('summary') as HTMLElement;

    expect(savedRow.closest('.library-card')).toBeTruthy();
    expect(savedRow.closest('.memory-records-section')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Add manually' }).closest('.memory-records-section')).toBeNull();
    expect(extractionRow.closest('.library-card')?.className).toContain(
      'memory-extraction-card',
    );
    expect(indexSummary.closest('.memory-advanced-section')).toBeTruthy();
    expect(indexSummary.closest('.memory-records-section')).toBeNull();
	    expect(screen.queryByText('Extraction history')).toBeNull();
	    expect(indexSummary.className).toContain('memory-details-summary');
	    expect(document.querySelector('.memory-records-section .library-group-title')).toBeNull();
	  });

  it('suggests and saves memory from selected connected apps', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    let entries: Array<{
      id: string;
      name: string;
      description: string;
      type: string;
      updatedAt: number;
    }> = [];
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(authWindow as unknown as Window);
    const suggestionBodies: unknown[] = [];
    const createBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries,
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/connectors/discovery?hydrateTools=false') {
        return new Response(JSON.stringify({
          connectors: [
            {
              id: 'notion',
              name: 'Notion',
              provider: 'composio',
              category: 'Productivity',
              status: 'connected',
              accountLabel: 'Product wiki',
              tools: [{ name: 'notion.notion_search' }],
            },
            {
              id: 'github',
              name: 'GitHub',
              provider: 'composio',
              category: 'Developer',
              status: 'available',
              tools: [],
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/connectors/auth-configs/prepare' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/connectors/github/connect' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          connector: {
            id: 'github',
            name: 'GitHub',
            provider: 'composio',
            category: 'Developer',
            status: 'available',
            tools: [],
          },
          auth: {
            kind: 'redirect_required',
            redirectUrl: 'https://example.com/github-oauth',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/connectors/status') {
        return new Response(JSON.stringify({
          statuses: {
            github: { status: 'available' },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/connectors/suggest' && init?.method === 'POST') {
        suggestionBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({
          suggestions: [
            {
              id: 'project_memory_context_1',
              name: 'Memory context',
              description: 'Connector-derived context',
              type: 'project',
              body: 'OpenDesign connector memory should focus on design preferences, UI decisions, and visual references from Notion.',
              source: {
                kind: 'connector',
                connectorId: 'notion',
                connectorName: 'Notion',
                accountLabel: 'Product wiki',
                toolName: 'notion.notion_search',
                toolTitle: 'Search Notion',
              },
            },
          ],
          attemptedLLM: true,
          contextBytes: 128,
          connectors: [
            {
              connectorId: 'notion',
              connectorName: 'Notion',
              accountLabel: 'Product wiki',
              status: 'succeeded',
              toolName: 'notion.notion_search',
              toolTitle: 'Search Notion',
              summary: 'Found product memory notes.',
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/project_memory_context_1' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        createBodies.push(body);
        entries = [
          {
            id: 'project_memory_context_1',
            name: body.name,
            description: body.description,
            type: body.type,
            updatedAt: Date.now(),
          },
        ];
        return new Response(JSON.stringify({
          entry: {
            id: 'project_memory_context_1',
            name: body.name,
            description: body.description,
            type: body.type,
            body: body.body,
            updatedAt: Date.now(),
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection({
      chatAgentId: 'opencode',
      chatModel: 'openai/gpt-5',
    });

    fireEvent.click(await screen.findByRole('tab', { name: 'Import from apps' }));

    expect(await screen.findByText('Product wiki')).toBeTruthy();
    const notionRow = document.querySelector('[data-memory-connector-id="notion"]') as HTMLElement;
    const githubRow = document.querySelector('[data-memory-connector-id="github"]') as HTMLElement;
    expect(within(notionRow).getByText('Select')).toBeTruthy();
    expect(within(notionRow).queryByText('Connected')).toBeNull();
    const connectGitHubButton = within(githubRow).getByRole('button', { name: 'Connect GitHub' });
    expect(connectGitHubButton).toBeTruthy();
    expect(within(githubRow).queryByText('Not connected')).toBeNull();
    expect(screen.queryByText('Connect first')).toBeNull();
    const extractButton = await screen.findByRole('button', { name: /Select apps to scan/i });
    await waitFor(() => {
      expect((extractButton as HTMLButtonElement).disabled).toBe(true);
    });
    expect(screen.getByText('Selected 0 of 1 connected app.')).toBeTruthy();

    fireEvent.click(connectGitHubButton);
    await waitFor(() => {
      expect(authWindow.location.replace).toHaveBeenCalledWith('https://example.com/github-oauth');
    });
    expect(within(githubRow).getByText('Finish authorization in your browser, then return here')).toBeTruthy();
    expect(within(githubRow).queryByText('Select')).toBeNull();
    expect((within(githubRow).getByRole('button', { name: 'Connect GitHub' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Use Notion for memory extraction'));
    await waitFor(() => {
      expect((extractButton as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.getByText('Selected')).toBeTruthy();
    fireEvent.click(extractButton);

    await waitFor(() => {
      expect(screen.getByText(/Found 1 suggested memory from 1 app/)).toBeTruthy();
    });
    expect(screen.getByText('Last scan')).toBeTruthy();
    expect(screen.getByText('128 B read')).toBeTruthy();
    expect(screen.getByText('Read Notion')).toBeTruthy();
    expect(screen.getByText(/Search Notion · Found product memory notes/)).toBeTruthy();
    expect(screen.getByText('Suggested memories')).toBeTruthy();
    expect(suggestionBodies).toEqual([{
      connectorIds: ['notion'],
      chatAgentId: 'opencode',
      chatModel: 'openai/gpt-5',
    }]);
    expect(screen.getByText('Memory context')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Save selected/i }));

    await waitFor(() => {
      expect(screen.getByText(/Saved 1 memory from connected apps/)).toBeTruthy();
    });
    expect(createBodies).toEqual([
      {
        id: 'project_memory_context_1',
        name: 'Memory context',
        description: 'Connector-derived context',
        type: 'project',
        body: 'OpenDesign connector memory should focus on design preferences, UI decisions, and visual references from Notion.',
      },
    ]);
  });

  it('saves same-name connector suggestions as distinct memory records', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    let entries: Array<{
      id: string;
      name: string;
      description: string;
      type: string;
      updatedAt: number;
    }> = [];
    const putBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries,
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/connectors/discovery?hydrateTools=false') {
        return new Response(JSON.stringify({
          connectors: [
            {
              id: 'notion',
              name: 'Notion',
              provider: 'composio',
              category: 'Productivity',
              status: 'connected',
              accountLabel: 'Product wiki',
              tools: [{ name: 'notion.notion_search' }],
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/connectors/status') {
        return new Response(JSON.stringify({
          statuses: {
            notion: { status: 'connected', accountLabel: 'Product wiki' },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/connectors/suggest' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          suggestions: [
            {
              id: 'project_comfyui_logo_1',
              name: 'ComfyUI logo',
              description: 'Use the black logo in product visuals.',
              type: 'project',
              body: 'ComfyUI design work should use the black logo.',
            },
            {
              id: 'project_comfyui_logo_2',
              name: 'ComfyUI logo',
              description: 'Keep the visual style dark.',
              type: 'project',
              body: 'ComfyUI related layouts should prefer a dark visual style.',
            },
          ],
          attemptedLLM: true,
          contextBytes: 256,
          connectors: [
            {
              connectorId: 'notion',
              connectorName: 'Notion',
              accountLabel: 'Product wiki',
              status: 'succeeded',
              toolName: 'notion.notion_search',
              toolTitle: 'Search Notion',
              summary: 'Read page content: 设计思路.',
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/api/memory/project_comfyui_logo_') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        putBodies.push({ url, body });
        entries = [
          ...entries.filter((entry) => entry.id !== body.id),
          {
            id: body.id,
            name: body.name,
            description: body.description,
            type: body.type,
            updatedAt: Date.now(),
          },
        ];
        return new Response(JSON.stringify({
          entry: {
            id: body.id,
            name: body.name,
            description: body.description,
            type: body.type,
            body: body.body,
            updatedAt: Date.now(),
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    fireEvent.click(await screen.findByRole('tab', { name: 'Import from apps' }));
    fireEvent.click(await screen.findByLabelText('Use Notion for memory extraction'));
    fireEvent.click(await screen.findByRole('button', { name: /Scan selected apps/i }));

    await waitFor(() => {
      expect(screen.getByText(/Found 2 suggested memories from 1 app/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save selected/i }));

    await waitFor(() => {
      expect(screen.getByText(/Saved 2 memories from connected apps/)).toBeTruthy();
    });
    expect(putBodies).toEqual([
      expect.objectContaining({
        url: '/api/memory/project_comfyui_logo_1',
        body: expect.objectContaining({ id: 'project_comfyui_logo_1' }),
      }),
      expect.objectContaining({
        url: '/api/memory/project_comfyui_logo_2',
        body: expect.objectContaining({ id: 'project_comfyui_logo_2' }),
      }),
    ]);
    expect(entries.map((entry) => entry.id).sort()).toEqual([
      'project_comfyui_logo_1',
      'project_comfyui_logo_2',
    ]);
  });

  it('keeps connector authorization pending after the memory panel remounts', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(authWindow as unknown as Window);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/connectors/discovery?hydrateTools=false') {
        return new Response(JSON.stringify({
          connectors: [
            {
              id: 'github',
              name: 'GitHub',
              provider: 'composio',
              category: 'Developer',
              status: 'available',
              tools: [],
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/connectors/status') {
        return new Response(JSON.stringify({
          statuses: {
            github: { status: 'available' },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/connectors/auth-configs/prepare' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/connectors/github/connect' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          connector: {
            id: 'github',
            name: 'GitHub',
            provider: 'composio',
            category: 'Developer',
            status: 'available',
            tools: [],
          },
          auth: {
            kind: 'redirect_required',
            redirectUrl: 'https://example.com/github-oauth',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    const first = renderMemorySection();
    fireEvent.click(await screen.findByRole('tab', { name: 'Import from apps' }));
    const githubRow = await waitFor(() => {
      const row = document.querySelector('[data-memory-connector-id="github"]');
      expect(row).toBeTruthy();
      return row as HTMLElement;
    });
    fireEvent.click(within(githubRow).getByRole('button', { name: 'Connect GitHub' }));

    await waitFor(() => {
      expect(authWindow.location.replace).toHaveBeenCalledWith('https://example.com/github-oauth');
    });
    expect(within(githubRow).getByText('Finish authorization in your browser, then return here')).toBeTruthy();
    expect(within(githubRow).queryByText('Select')).toBeNull();

    first.unmount();

    renderMemorySection();
    fireEvent.click(await screen.findByRole('tab', { name: 'Import from apps' }));
    const remountedGithubRow = await waitFor(() => {
      const row = document.querySelector('[data-memory-connector-id="github"]');
      expect(row).toBeTruthy();
      return row as HTMLElement;
    });

    expect(within(remountedGithubRow).getByText('Finish authorization in your browser, then return here')).toBeTruthy();
    expect(within(remountedGithubRow).queryByText('Select')).toBeNull();
    expect((within(remountedGithubRow).getByRole('button', { name: 'Connect GitHub' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows reconnect guidance for memory connectors with stale authorization', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const lastError = 'GitHub authorization expired. Reconnect GitHub.';

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/connectors/discovery?hydrateTools=false') {
        return new Response(JSON.stringify({
          connectors: [
            {
              id: 'github',
              name: 'GitHub',
              provider: 'composio',
              category: 'Developer',
              status: 'error',
              lastError,
              tools: [],
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/connectors/status') {
        return new Response(JSON.stringify({
          statuses: {
            github: { status: 'error', lastError },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();
    fireEvent.click(await screen.findByRole('tab', { name: 'Import from apps' }));

    const githubRow = await waitFor(() => {
      const row = document.querySelector('[data-memory-connector-id="github"]');
      expect(row).toBeTruthy();
      return row as HTMLElement;
    });
    expect(within(githubRow).getByText(lastError)).toBeTruthy();
    expect(within(githubRow).getByRole('button', { name: 'Reconnect GitHub' })).toBeTruthy();
    expect(within(githubRow).queryByText('Select')).toBeNull();
  });

  it('shows connector read failures instead of a generic empty state', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/connectors/discovery?hydrateTools=false') {
        return new Response(JSON.stringify({
          connectors: [
            {
              id: 'notion',
              name: 'Notion',
              provider: 'composio',
              category: 'Productivity',
              status: 'connected',
              accountLabel: 'Product wiki',
              tools: [{ name: 'notion.notion_search' }],
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/connectors/suggest' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          suggestions: [],
          attemptedLLM: false,
          contextBytes: 0,
          connectors: [
            {
              connectorId: 'notion',
              connectorName: 'Notion',
              accountLabel: 'Product wiki',
              status: 'failed',
              summary: 'No safe connector read completed.',
              error: 'Tool NOTION_SEARCH not found',
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    fireEvent.click(await screen.findByRole('tab', { name: 'Import from apps' }));
    fireEvent.click(await screen.findByLabelText('Use Notion for memory extraction'));
    fireEvent.click(await screen.findByRole('button', { name: /Scan selected apps/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't read Notion.");
    expect(alert.textContent).toContain('Tool NOTION_SEARCH not found');
    expect(screen.getByText('Last scan')).toBeTruthy();
    expect(screen.getByText('No data read')).toBeTruthy();
    expect(screen.getByText('Could not read Notion')).toBeTruthy();
    expect(screen.getAllByText(/Tool NOTION_SEARCH not found/).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/could not read useful content from the selected app/i),
    ).toBeNull();
  });

  it('clears extraction history after clicking Clear', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const deletedUrls: string[] = [];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          extractions: [
            {
              id: 'ex-1',
              phase: 'success',
              kind: 'llm',
              startedAt: Date.now(),
              finishedAt: Date.now() + 1200,
              userMessagePreview: 'Remember I prefer dark mode',
              proposedCount: 1,
              writtenCount: 1,
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    expect(await screen.findByText('Remember I prefer dark mode')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(screen.queryByText('Remember I prefer dark mode')).toBeNull();
    });
    expect(deletedUrls).toEqual(['/api/memory/extractions']);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('does not clear extraction history when Clear is cancelled', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const deletedUrls: string[] = [];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          extractions: [
            {
              id: 'ex-1',
              phase: 'success',
              kind: 'llm',
              startedAt: Date.now(),
              finishedAt: Date.now() + 1200,
              userMessagePreview: 'Remember I prefer dark mode',
              proposedCount: 1,
              writtenCount: 1,
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    expect(await screen.findByText('Remember I prefer dark mode')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(deletedUrls).toEqual([]);
    expect(screen.getByText('Remember I prefer dark mode')).toBeTruthy();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('loads preview, edits an entry, and refreshes the saved content', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    let entryBody = '- Prefer compact cards';
    let entryDescription = 'Initial preference';
    const putBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [
            {
              id: 'user_ui_preferences',
              name: 'UI preferences',
              description: entryDescription,
              type: 'user',
              updatedAt: Date.now(),
            },
          ],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/user_ui_preferences' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          entry: {
            id: 'user_ui_preferences',
            name: 'UI preferences',
            description: entryDescription,
            type: 'user',
            body: entryBody,
            updatedAt: Date.now(),
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/user_ui_preferences' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        putBodies.push(body);
        entryDescription = body.description;
        entryBody = body.body;
        return new Response(JSON.stringify({
          entry: {
            id: 'user_ui_preferences',
            name: body.name,
            description: body.description,
            type: body.type,
            body: body.body,
            updatedAt: Date.now(),
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const card = await screen.findByText('UI preferences');
    const row = card.closest('.library-card') as HTMLElement;

    fireEvent.click(within(row).getByTitle('Preview'));
    expect(await screen.findByText('Prefer compact cards')).toBeTruthy();

    fireEvent.click(within(row).getByTitle('Edit'));
    fireEvent.change(await screen.findByDisplayValue('Initial preference'), {
      target: { value: 'Updated preference' },
    });
    fireEvent.change(
      await screen.findByDisplayValue('- Prefer compact cards'),
      { target: { value: '- Prefer spacious layouts' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('✓ Memory saved')).toBeTruthy();
    });
    expect(putBodies).toEqual([
      {
        id: 'user_ui_preferences',
        name: 'UI preferences',
        description: 'Updated preference',
        type: 'user',
        body: '- Prefer spacious layouts',
      },
    ]);
    expect(screen.getByText('Updated preference')).toBeTruthy();
  });

  it('keeps the expanded preview control visually distinct from delete', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [
            {
              id: 'project_scope',
              name: 'Project scope',
              description: 'Current project constraints',
              type: 'project',
              updatedAt: Date.now(),
            },
          ],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/project_scope' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          entry: {
            id: 'project_scope',
            name: 'Project scope',
            description: 'Current project constraints',
            type: 'project',
            body: '- Keep memory actions clear',
            updatedAt: Date.now(),
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const card = (await screen.findByText('Project scope')).closest('.library-card') as HTMLElement;
    const previewButton = within(card).getByTitle('Preview');
    const deleteButton = within(card).getByTitle('Delete');
    fireEvent.click(previewButton);

    await screen.findByText('Keep memory actions clear');
    const previewIcon = previewButton.querySelector('svg');
    const deleteIcon = deleteButton.querySelector('svg');
    const previewPaths = Array.from(
      previewIcon?.querySelectorAll('path') ?? [],
    ).map((path) => path.getAttribute('d'));
    const deletePaths = Array.from(
      deleteIcon?.querySelectorAll('path') ?? [],
    ).map((path) => path.getAttribute('d'));

    expect(previewIcon).toBeTruthy();
    expect(deleteIcon).toBeTruthy();
    expect(previewPaths).not.toEqual(deletePaths);
  });

  it('deletes an existing memory entry from the list', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    let entries = [
      {
        id: 'user_ui_preferences',
        name: 'UI preferences',
        description: 'Persistent UI rendering preferences',
        type: 'user',
        updatedAt: Date.now(),
      },
    ];
    const deletedUrls: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries,
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/user_ui_preferences' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        entries = [];
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const card = (await screen.findByText('UI preferences')).closest('.library-card') as HTMLElement;
    fireEvent.click(within(card).getByTitle('Delete'));

    await waitFor(() => {
      expect(screen.getByText('✓ Memory deleted')).toBeTruthy();
      expect(screen.getByText(/No memory yet\./)).toBeTruthy();
    });
    expect(deletedUrls).toEqual(['/api/memory/user_ui_preferences']);
  });

  it('keeps the editor open when saving a memory entry fails', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'write failed' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    fireEvent.click(await screen.findByRole('button', { name: 'New memory' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. UI preferences'), {
      target: { value: 'UI preferences' },
    });
    fireEvent.change(screen.getByPlaceholderText('One sentence — what is this memory about?'), {
      target: { value: 'Persistent UI rendering preferences' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/- Rule one[\s\S]*When to apply: optional scope/),
      {
        target: { value: '- Prefer dark mode\n- Prefer generous spacing' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('UI preferences')).toBeTruthy();
    });
    expect(screen.queryByText('✓ Memory created')).toBeNull();
    expect(screen.queryByText('UI preferences')).toBeTruthy();
  });

  it('keeps unsaved index edits when saving the index fails', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n\n- Existing bullet\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/index' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ error: 'disk full' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    fireEvent.click(await screen.findByText('MEMORY.md (index)'));
    const indexArea = await findMemoryIndexTextarea();
    fireEvent.change(indexArea, {
      target: { value: '# Memory\n\n- Existing bullet\n- New bullet\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save index' }));

    await waitFor(() => {
      expect(screen.getByText(/Unsaved changes/i)).toBeTruthy();
    });
    expect(indexArea.value).toContain('- New bullet');
    expect(screen.queryByText('✓ Index saved')).toBeNull();
  });

  it('deletes a single extraction row without clearing the whole history', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const deletedUrls: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          extractions: [
            {
              id: 'ex-1',
              phase: 'success',
              kind: 'llm',
              startedAt: Date.now(),
              userMessagePreview: 'Remember I prefer dark mode',
              writtenCount: 1,
            },
            {
              id: 'ex-2',
              phase: 'skipped',
              reason: 'no-match',
              kind: 'heuristic',
              startedAt: Date.now() - 1000,
              userMessagePreview: 'No durable memory in this turn',
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions/ex-1' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    expect(await screen.findByText('Remember I prefer dark mode')).toBeTruthy();
    expect(screen.getByText('No durable memory in this turn')).toBeTruthy();

    const row = screen.getByText('Remember I prefer dark mode')
      .closest('.library-card') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.queryByText('Remember I prefer dark mode')).toBeNull();
    });
    expect(screen.getByText('No durable memory in this turn')).toBeTruthy();
    expect(deletedUrls).toEqual(['/api/memory/extractions/ex-1']);
  });

  it('applies extraction and change SSE events to the visible lists', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    let entries = [
      {
        id: 'user_ui_preferences',
        name: 'UI preferences',
        description: 'Initial preference',
        type: 'user',
        updatedAt: Date.now(),
      },
    ];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries,
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();
    expect(await screen.findByText('UI preferences')).toBeTruthy();

    expect(screen.queryByText('Remember I prefer dark mode')).toBeNull();

    const es = StubEventSource.instances[0]!;
    es.emit('extraction', {
      id: 'ex-1',
      phase: 'running',
      kind: 'llm',
      startedAt: Date.now(),
      userMessagePreview: 'Remember I prefer dark mode',
    });

    await waitFor(() => {
      expect(screen.getByText('Remember I prefer dark mode')).toBeTruthy();
      expect(screen.getAllByText('Running…').length).toBeGreaterThan(0);
    });

    entries = [
      ...entries,
      {
        id: 'project_brief',
        name: 'Project brief',
        description: 'Pinned project context',
        type: 'project',
        updatedAt: Date.now(),
      },
    ];
    es.emit('change', { kind: 'upsert', id: 'project_brief' });
    fireEvent.click(screen.getByRole('tab', { name: 'Add manually' }));

    await waitFor(() => {
      expect(screen.getByText('Project brief')).toBeTruthy();
    });
  });

  it('renders failed extraction rows with user-facing error details', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({
          extractions: [
            {
              id: 'ex-failed',
              phase: 'failed',
              kind: 'llm',
              startedAt: Date.now(),
              finishedAt: Date.now() + 2500,
              userMessagePreview: 'Remember my dashboard preference',
              error: 'provider returned 429 quota exceeded',
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    expect(await screen.findByText('Remember my dashboard preference')).toBeTruthy();
    expect(screen.getByText('Memory model quota or rate limit hit')).toBeTruthy();
    expect(screen.getByText('Try again later or switch the Memory extraction model.')).toBeTruthy();
    expect(screen.queryByText('provider returned 429 quota exceeded')).toBeNull();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('renders connector model authentication failures without raw provider JSON', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({
          extractions: [
            {
              id: 'ex-connector-failed',
              phase: 'failed',
              kind: 'connector',
              provider: {
                kind: 'openai',
                model: 'gpt-4o-mini',
                credentialSource: 'memory-config',
              },
              startedAt: Date.now(),
              finishedAt: Date.now() + 1300,
              userMessagePreview: 'Suggest durable OpenDesign memories from connected apps.',
              error: 'openai 401: { "error": { "message": "Your authentication token has expired. Please try signing in again.", "type": "invalid_request_error", "code": "token_expired", "param": null }, "status": 401 }',
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

	  renderMemorySection();
	  fireEvent.click(screen.getByRole('tab', { name: 'Import from apps' }));

	  expect(await screen.findByText('Connected app scan failed')).toBeTruthy();
	  expect(
	    within(screen.getByLabelText('Connected app memory run status'))
	      .getByText('Connected app scan failed'),
	  ).toBeTruthy();
	  expect(
	    screen.queryByText('Suggest durable OpenDesign memories from connected apps.'),
	  ).toBeNull();
	  expect(
	    within(document.querySelector('.memory-unified-list') as HTMLElement)
	      .queryByText('Suggest durable OpenDesign memories from connected apps.'),
	  ).toBeNull();
	  expect(screen.getByText('OpenAI authentication expired')).toBeTruthy();
    expect(
      screen.getByText('Connected apps were read, but OpenDesign could not turn that context into memory.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Update the Memory extraction model key or sign in again.'),
    ).toBeTruthy();
    expect(screen.queryByText(/token_expired/)).toBeNull();
  });

  it('renders Local CLI extraction failures without API-key guidance', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({
          extractions: [
            {
              id: 'ex-cli-failed',
              phase: 'failed',
              kind: 'connector',
              provider: {
                kind: 'anthropic',
                model: 'default',
                credentialSource: 'chat-cli',
              },
              startedAt: Date.now(),
              finishedAt: Date.now() + 900,
              userMessagePreview: 'Suggest durable OpenDesign memories from connected apps.',
              error: 'Claude Code CLI exit 1: authentication token has expired',
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

	  renderMemorySection();
	  fireEvent.click(screen.getByRole('tab', { name: 'Import from apps' }));

	  expect(await screen.findByText('Claude Code authentication expired')).toBeTruthy();
	  expect(screen.getByLabelText('Connected app memory run status')).toBeTruthy();
	  expect(
	    screen.getByText('Sign in to the selected Local CLI or choose a different Memory model.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Update the Memory extraction model key/)).toBeNull();
  });

  it('renders the disabled banner when memory starts disabled', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(JSON.stringify({
          enabled: false,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('Memory is currently OFF.');
  });

  it('toggles memory injection off and persists the PATCH payload', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const patchBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/config' && init?.method === 'PATCH') {
        patchBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ enabled: false, extraction: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const toggle = await screen.findByRole('checkbox', { name: 'Enable memory injection' }) as HTMLInputElement;

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Memory is currently OFF.');
    });
    expect(patchBodies).toEqual([{ enabled: false }]);
  });

  it('toggles chat conversation learning off and persists the PATCH payload', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const patchBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          enabled: true,
          chatExtractionEnabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/memory/extractions') {
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/memory/config' && init?.method === 'PATCH') {
        patchBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({
          enabled: true,
          chatExtractionEnabled: false,
          extraction: null,
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    fireEvent.click(await screen.findByRole('tab', { name: 'Learn from chats' }));
    const toggle = screen.getByRole('checkbox', {
      name: 'Learn from chat conversations',
    }) as HTMLInputElement;

    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle.checked).toBe(false));
    expect(screen.getByText('Off')).toBeTruthy();
    expect(patchBodies).toEqual([{ chatExtractionEnabled: false }]);
  });
});
