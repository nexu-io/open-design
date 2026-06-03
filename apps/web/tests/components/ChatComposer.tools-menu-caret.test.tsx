// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';

// Regression coverage for #3195. The mention popover (typed `@`) prevents
// the textarea from losing focus on mousedown for every picker button —
// the comment at `ChatComposer.tsx:3039-3043` explains why: without it,
// `selectionStart` resets on the focus transfer and the insert handler
// targets the wrong substring (caret jumps to the start, the inserted
// token lands at offset 0 instead of at the user's cursor).
//
// The right-side `@`-button tools popover (`ToolsPluginsPanel`,
// `ToolsSkillsPanel`, `ToolsMcpPanel`) skips that protection — pick rows
// have `onClick` but no `onMouseDown={(e) => e.preventDefault()}`. So
// every insertion through the tools popover is at risk of the same caret
// reset whenever a real mouse triggers focus transfer first.
//
// We can't reliably observe the focus transfer in jsdom (it does not
// move focus on raw mousedown), so the test asserts the contract
// directly: the picker row must call `preventDefault()` on mousedown so
// that browsers never get to move focus before the click handler reads
// `textarea.selectionStart`.

const COMMUNITY_PLUGIN = {
  id: 'sample-plugin',
  title: 'Sample Plugin',
  version: '1.0.0',
  trust: 'restricted' as const,
  sourceKind: 'bundled' as const,
  source: 'bundled/sample',
  capabilitiesGranted: [],
  manifest: {
    name: 'sample-plugin',
    title: 'Sample Plugin',
    description: 'Sample',
    od: { kind: 'skill' },
  },
  fsPath: '/plugins/sample',
  installedAt: 0,
  updatedAt: 0,
};

const SKILL = {
  id: 'deck-builder',
  name: 'Deck Builder',
  description: 'Build a polished slide deck.',
  triggers: ['deck'],
  mode: 'deck' as const,
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Make a deck',
  aggregatesExamples: false,
};

const MCP_SERVER = {
  id: 'slack',
  label: 'Slack MCP',
  transport: 'stdio' as const,
  enabled: true,
  command: 'slack-mcp',
};

let fetchMock: ReturnType<typeof vi.fn>;
let plugins = [COMMUNITY_PLUGIN];
let skills = [SKILL];
let servers = [MCP_SERVER];

function renderComposer(
  overrides: Partial<ComponentProps<typeof ChatComposer>> = {},
) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onOpenMcpSettings={vi.fn()}
      skills={skills}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  plugins = [COMMUNITY_PLUGIN];
  skills = [SKILL];
  servers = [MCP_SERVER];
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/mcp/servers') {
      return new Response(JSON.stringify({ servers, templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/skills') {
      return new Response(JSON.stringify({ skills }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/projects/project-1') {
      return new Response(JSON.stringify({ project: { id: 'project-1', skillId: SKILL.id } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

async function openToolsPopover() {
  const trigger = document.querySelector(
    '.composer-tools-trigger',
  ) as HTMLButtonElement | null;
  expect(trigger).toBeTruthy();
  fireEvent.click(trigger!);
  await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
}

function selectTab(label: string) {
  const tab = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.composer-tools-tab'),
  ).find((el) => el.textContent?.trim() === label);
  expect(tab).toBeTruthy();
  fireEvent.click(tab!);
}

function rowByText(text: string): HTMLButtonElement {
  // Skill / MCP rows are themselves the picker `<button>` (.composer-tools-row).
  // Plugin rows wrap two buttons inside a `<div>`; the picker is the
  // `.composer-tools-row-main` child, so prefer that selector first.
  const row = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button.composer-tools-row-main, button.composer-tools-row'),
  ).find((btn) => btn.textContent?.includes(text));
  expect(row).toBeTruthy();
  return row!;
}

describe('ChatComposer tools-menu picker mousedown protection (#3195)', () => {
  it('the skills picker prevents default on mousedown so the caret survives focus transfer', async () => {
    renderComposer();
    await openToolsPopover();
    selectTab('Skills');

    const row = rowByText('Deck Builder');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('the plugins picker prevents default on mousedown so the caret survives focus transfer', async () => {
    renderComposer();
    await openToolsPopover();
    selectTab('Plugins');

    const row = rowByText('Sample Plugin');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('the MCP picker prevents default on mousedown so the caret survives focus transfer', async () => {
    renderComposer();
    await openToolsPopover();
    selectTab('MCP');

    const row = rowByText('Slack MCP');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
