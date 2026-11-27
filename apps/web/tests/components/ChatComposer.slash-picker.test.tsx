// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { typeInComposer } from '../helpers/lexical-composer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mcpServers = [
  {
    id: 'srv-alpha',
    label: 'Figma Design Bridge',
    transport: 'sse' as const,
    enabled: true,
    url: 'https://mcp.example.com/figma',
  },
  {
    id: 'srv-beta',
    label: 'Linear Tracker',
    transport: 'stdio' as const,
    enabled: true,
    command: 'linear-mcp',
  },
  {
    id: 'srv-gamma',
    label: 'Notion Docs',
    transport: 'http' as const,
    enabled: true,
    url: 'https://mcp.example.com/notion',
  },
];

async function flushTick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountComposer(opts?: { researchAvailable?: boolean }) {
  render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      researchAvailable={opts?.researchAvailable ?? true}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onOpenMcpSettings={vi.fn()}
      skills={[]}
    />,
  );
  await flushTick();
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: mcpServers, templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cleanup();
});

describe('slash command picker behavior (#5822)', () => {
  it('lists built-in /search before per-server /mcp shortcuts', async () => {
    await mountComposer({ researchAvailable: true });
    typeInComposer('/');
    await flushTick();
    await flushTick();

    const labels = screen
      .getAllByRole('option')
      .map((el) => el.querySelector('.slash-item-label')?.textContent?.trim());

    const searchIdx = labels.indexOf('/search');
    const firstServerIdx = labels.indexOf('/mcp srv-alpha');
    expect(searchIdx).toBeGreaterThanOrEqual(0);
    expect(firstServerIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx).toBeLessThan(firstServerIdx);
  });

  it('filters commands by MCP display label, transport, and description', async () => {
    await mountComposer({ researchAvailable: true });
    typeInComposer('/figma');
    await flushTick();
    await flushTick();

    let labels = screen
      .getAllByRole('option')
      .map((el) => el.querySelector('.slash-item-label')?.textContent?.trim());
    expect(labels).toEqual(['/mcp srv-alpha']);

    // Also matches transport metadata even when argHint shows the display label.
    typeInComposer('/sse');
    await flushTick();
    labels = screen
      .getAllByRole('option')
      .map((el) => el.querySelector('.slash-item-label')?.textContent?.trim());
    expect(labels).toEqual(['/mcp srv-alpha']);

    // Matches description / hint text.
    typeInComposer('/settings');
    await flushTick();
    labels = screen
      .getAllByRole('option')
      .map((el) => el.querySelector('.slash-item-label')?.textContent?.trim());
    expect(labels).toContain('/mcp');
  });

  it('keeps the picker open with a no-results message on an unmatched query and dismisses on Escape', async () => {
    await mountComposer({ researchAvailable: true });
    typeInComposer('/zzznomatch');
    await flushTick();
    await flushTick();

    const popover = screen.getByTestId('slash-popover');
    expect(popover).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(popover.textContent).toContain('/zzznomatch');

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveAttribute('aria-controls', 'slash-listbox');
    expect(combobox).not.toHaveAttribute('aria-activedescendant');

    await act(async () => {
      fireEvent.keyDown(combobox, { key: 'Escape' });
    });
    await flushTick();
    expect(screen.queryByTestId('slash-popover')).not.toBeInTheDocument();
  });

  it('scrolls the active option into view and updates combobox ARIA attributes during keyboard navigation', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    await mountComposer({ researchAvailable: true });
    typeInComposer('/');
    await flushTick();
    await flushTick();

    const combobox = screen.getByRole('combobox');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('id', 'slash-listbox');
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveAttribute('aria-controls', 'slash-listbox');
    expect(combobox).toHaveAttribute('aria-activedescendant', 'slash-opt-0');

    scrollIntoView.mockClear();

    await act(async () => {
      fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    });
    await flushTick();

    expect(combobox).toHaveAttribute('aria-activedescendant', 'slash-opt-1');
    const secondOption = document.getElementById('slash-opt-1');
    expect(secondOption).toHaveAttribute('aria-selected', 'true');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
