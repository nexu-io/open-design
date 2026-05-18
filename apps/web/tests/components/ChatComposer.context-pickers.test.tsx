// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';

const COMMUNITY_PLUGIN = {
  id: 'community-deck',
  title: 'Community Deck',
  version: '1.0.0',
  trust: 'restricted' as const,
  sourceKind: 'bundled' as const,
  source: 'bundled/community-deck',
  capabilitiesGranted: [],
  manifest: {
    name: 'community-deck',
    title: 'Community Deck',
    description: 'Official deck starter',
    od: { kind: 'skill' },
  },
  fsPath: '/plugins/community-deck',
  installedAt: 0,
  updatedAt: 0,
};

const USER_PLUGIN = {
  ...COMMUNITY_PLUGIN,
  id: 'my-export',
  title: 'My Export',
  sourceKind: 'local' as const,
  source: '/plugins/my-export',
  manifest: {
    ...COMMUNITY_PLUGIN.manifest,
    name: 'my-export',
    title: 'My Export',
    description: 'Private export workflow',
  },
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

const APPLY_RESULT = {
  ok: true,
  query: 'Run plugin.',
  contextItems: [],
  inputs: [],
  assets: [],
  mcpServers: [],
  trust: 'restricted',
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snap-1',
    pluginId: USER_PLUGIN.id,
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
  projectMetadata: {},
};

let fetchMock: ReturnType<typeof vi.fn>;
let plugins = [COMMUNITY_PLUGIN, USER_PLUGIN];
let skills = [SKILL];
let servers = [MCP_SERVER];

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
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
  plugins = [COMMUNITY_PLUGIN, USER_PLUGIN];
  skills = [SKILL];
  servers = [MCP_SERVER];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
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
    if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
      return new Response(JSON.stringify(APPLY_RESULT), {
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
    if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
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

describe('ChatComposer context pickers', () => {
  it('opens the @ panel even when every source is empty', async () => {
    plugins = [];
    skills = [];
    servers = [];
    renderComposer();

    fireEvent.change(screen.getByTestId('chat-composer-input'), {
      target: { value: '@', selectionStart: 1 },
    });

    expect(screen.getByTestId('mention-popover')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Plugins' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'MCP' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Design files' })).toBeTruthy();
    expect(screen.getByText('Search plugins, skills, MCP servers, and Design Files.')).toBeTruthy();
  });

  it('selects an MCP server from @ search and keeps the inline token visible', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@sl', selectionStart: 3 },
    });

    await waitFor(() => expect(screen.getByText('Slack MCP')).toBeTruthy());
    fireEvent.click(screen.getByText('Slack MCP'));

    expect(input.value).toBe('@Slack MCP ');
    expect(screen.getByTestId('chat-composer-mention-overlay').textContent).toContain('@Slack MCP');
  });

  it('applies a skill from @ search and reports the active project skill', async () => {
    const onProjectSkillChange = vi.fn();
    renderComposer({ onProjectSkillChange });
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@deck', selectionStart: 5 },
    });

    await waitFor(() => expect(screen.getByText('Deck Builder')).toBeTruthy());
    fireEvent.click(screen.getByText('Deck Builder'));

    await waitFor(() => expect(onProjectSkillChange).toHaveBeenCalledWith('deck-builder'));
    expect(input.value).toBe('@Deck Builder ');
    expect(screen.getByTestId('chat-composer-mention-overlay').textContent).toContain('@Deck Builder');
  });

  it('applies a plugin from @ search and keeps the plugin token inline', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@export', selectionStart: 7 },
    });

    await waitFor(() => expect(screen.getByText('My Export')).toBeTruthy());
    fireEvent.click(screen.getByText('My Export'));

    await waitFor(() => expect(input.value).toBe('@My Export '));
    expect(screen.getByTestId('chat-composer-mention-overlay').textContent).toContain('@My Export');
  });

  it('lets the tools panel switch between Official and My plugins', async () => {
    renderComposer();
    fireEvent.click(screen.getByLabelText('Open CLI and model settings'));

    await waitFor(() => expect(screen.getByText('Community Deck')).toBeTruthy());
    expect(screen.queryByText('My Export')).toBeNull();

    fireEvent.click(screen.getByText('My plugins'));
    expect(screen.getByText('My Export')).toBeTruthy();
    expect(screen.queryByText('Community Deck')).toBeNull();

    fireEvent.change(screen.getByLabelText('Search plugins'), {
      target: { value: 'private' },
    });
    expect(screen.getByText('Private export workflow')).toBeTruthy();
  });
});
