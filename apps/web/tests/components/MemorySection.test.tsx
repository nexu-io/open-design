// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function renderMemorySection() {
  render(
    <I18nProvider initial="en">
      <MemorySection />
    </I18nProvider>,
  );
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
    const indexArea = screen.getByRole('textbox') as HTMLTextAreaElement;
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

  it('uses the same expandable affordance for extraction history and memory index', async () => {
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
        return new Response(JSON.stringify({ extractions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    renderMemorySection();

    const extractionSummary = (await screen.findByText('Extraction history'))
      .closest('summary') as HTMLElement;
    const indexSummary = screen.getByText('MEMORY.md (index)')
      .closest('summary') as HTMLElement;

    expect(extractionSummary.className).toContain('memory-details-summary');
    expect(indexSummary.className).toContain('memory-details-summary');
  });

  it('clears extraction history after clicking Clear', async () => {
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

    fireEvent.click(await screen.findByText('Extraction history'));
    expect(await screen.findByText('Remember I prefer dark mode')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(screen.getByText('No extractions yet. The next chat turn will populate this list.')).toBeTruthy();
    });
    expect(deletedUrls).toEqual(['/api/memory/extractions']);
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
    fireEvent.click(within(card).getByTitle('Preview'));

    await screen.findByText('Keep memory actions clear');
    const closeIconPaths = card.querySelectorAll('path[d="M18 6 6 18"]');

    expect(closeIconPaths).toHaveLength(1);
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
    const indexArea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(indexArea, {
      target: { value: '# Memory\n\n- Existing bullet\n- New bullet\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save index' }));

    await waitFor(() => {
      expect(screen.getByText(/Unsaved changes/i)).toBeTruthy();
    });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('- New bullet');
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

    fireEvent.click(await screen.findByText('Extraction history'));
    expect(await screen.findByText('Remember I prefer dark mode')).toBeTruthy();
    expect(screen.getByText('No durable memory in this turn')).toBeTruthy();

    const row = screen.getByText('Remember I prefer dark mode').closest('li') as HTMLElement;
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

    fireEvent.click(await screen.findByText('Extraction history'));
    expect(screen.getByText('UI preferences')).toBeTruthy();
    expect(screen.getByText('No extractions yet. The next chat turn will populate this list.')).toBeTruthy();

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

    await waitFor(() => {
      expect(screen.getByText('Project brief')).toBeTruthy();
    });
  });

  it('renders failed extraction rows with the error details', async () => {
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

    fireEvent.click(await screen.findByText('Extraction history'));
    expect(await screen.findByText('Remember my dashboard preference')).toBeTruthy();
    expect(screen.getByText('provider returned 429 quota exceeded')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
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
});
