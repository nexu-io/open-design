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

function makeSkill(overrides: Partial<typeof SKILL>): typeof SKILL {
  return {
    ...SKILL,
    id: overrides.id ?? SKILL.id,
    name: overrides.name ?? SKILL.name,
    description: overrides.description ?? SKILL.description,
    triggers: overrides.triggers ?? SKILL.triggers,
    mode: overrides.mode ?? SKILL.mode,
    previewType: overrides.previewType ?? SKILL.previewType,
    designSystemRequired: overrides.designSystemRequired ?? SKILL.designSystemRequired,
    defaultFor: overrides.defaultFor ?? SKILL.defaultFor,
    upstream: overrides.upstream ?? SKILL.upstream,
    hasBody: overrides.hasBody ?? SKILL.hasBody,
    examplePrompt: overrides.examplePrompt ?? SKILL.examplePrompt,
    aggregatesExamples: overrides.aggregatesExamples ?? SKILL.aggregatesExamples,
  };
}

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
    expect(screen.getByRole('tab', { name: 'Connectors' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Design files' })).toBeTruthy();
    expect(screen.getByText('Search plugins, skills, MCP servers, connectors, and Design Files.')).toBeTruthy();
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

  it('shows all matching skills and ranks exact prefix matches first', async () => {
    skills = [
      makeSkill({
        id: 'story-brief',
        name: 'Story Brief',
        description: 'Use when planning audit work.',
        triggers: ['writing'],
      }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeSkill({
          id: `audit-helper-${index + 1}`,
          name: `Audit Helper ${index + 1}`,
          description: `Audit support workflow ${index + 1}.`,
          triggers: [`audit-${index + 1}`],
        }),
      ),
      makeSkill({
        id: 'accessibility-review',
        name: 'Accessibility Review',
        description: 'Audit accessible interaction details.',
        triggers: ['a11y-audit'],
      }),
    ];
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@audit', selectionStart: 6 },
    });

    await waitFor(() => expect(screen.getByText('Audit Helper 9')).toBeTruthy());
    const skillNames = Array.from(
      screen.getByTestId('mention-popover').querySelectorAll('.mention-item strong'),
      (node) => node.textContent,
    );

    expect(skillNames).toContain('Audit Helper 9');
    expect(skillNames.indexOf('Audit Helper 1')).toBeLessThan(skillNames.indexOf('Story Brief'));
    expect(skillNames.indexOf('Audit Helper 9')).toBeLessThan(skillNames.indexOf('Accessibility Review'));
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
