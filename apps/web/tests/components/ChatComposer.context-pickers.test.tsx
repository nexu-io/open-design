// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';

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

function renderComposer(
  overrides: Partial<ComponentProps<typeof ChatComposer>> = {},
  options: { locale?: Locale } = {},
) {
  const tree = (
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
    />
  );

  if (options.locale) {
    return render(
      <I18nProvider initial={options.locale}>
        {tree}
      </I18nProvider>,
    );
  }

  return render(
    tree,
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

  it('localizes @ panel tabs and empty states in Chinese mode', async () => {
    plugins = [];
    skills = [];
    servers = [];
    renderComposer({}, { locale: 'zh-CN' });
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@', selectionStart: 1 },
    });

    expect(screen.getByRole('tab', { name: '全部' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '插件' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '技能' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'MCP' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '连接器' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '设计文件' })).toBeTruthy();
    expect(screen.getByText('搜索插件、技能、MCP 服务器、连接器和设计文件。')).toBeTruthy();

    fireEvent.change(input, {
      target: { value: '@missing', selectionStart: 8 },
    });

    expect(screen.getByText('没有找到“missing”的结果。')).toBeTruthy();
    expect(screen.queryByText('No results for “missing”.')).toBeNull();
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

  it('removes the inline design file token when its staged chip is removed', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
    });
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: 'Use @landing', selectionStart: 12 },
    });

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));

    expect(input.value).toBe('Use @designs/landing.html ');
    expect(screen.getByTestId('staged-attachments').textContent).toContain('landing.html');

    fireEvent.click(screen.getByLabelText('Remove landing.html'));

    expect(input.value).toBe('Use ');
    expect(screen.queryByTestId('staged-attachments')).toBeNull();
  });

  it('preserves surrounding draft formatting when removing a design file token', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
    });
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;
    const draft = 'Plan:\n\n@landing\n\nKeep spacing';

    fireEvent.change(input, {
      target: { value: draft, selectionStart: 'Plan:\n\n@landing'.length },
    });

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));

    expect(input.value).toBe('Plan:\n\n@designs/landing.html \n\nKeep spacing');

    fireEvent.click(screen.getByLabelText('Remove landing.html'));

    expect(input.value).toBe('Plan:\n\n\n\nKeep spacing');
    expect(screen.queryByTestId('staged-attachments')).toBeNull();
  });

  it('removes a design file token when punctuation follows it', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
    });
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: 'Use @landing', selectionStart: 12 },
    });

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));

    fireEvent.change(input, {
      target: {
        value: 'Use @designs/landing.html, please',
        selectionStart: 'Use @designs/landing.html, please'.length,
      },
    });

    fireEvent.click(screen.getByLabelText('Remove landing.html'));

    expect(input.value).toBe('Use , please');
    expect(screen.queryByTestId('staged-attachments')).toBeNull();
  });

  it('removes a quoted design file token when its chip is removed', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
    });
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@landing', selectionStart: 8 },
    });

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));

    fireEvent.change(input, {
      target: {
        value: '"@designs/landing.html"',
        selectionStart: '"@designs/landing.html"'.length,
      },
    });

    fireEvent.click(screen.getByLabelText('Remove landing.html'));

    expect(input.value).toBe('""');
    expect(screen.queryByTestId('staged-attachments')).toBeNull();
  });

  it('clears an attachment upload error after a later retry succeeds', async () => {
    let uploadAttempts = 0;
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
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/upload' && init?.method === 'POST') {
        uploadAttempts += 1;
        if (uploadAttempts === 1) {
          return new Response(JSON.stringify({ error: 'storage offline' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          files: [{ name: 'recovered.txt', path: 'uploads/recovered.txt', size: 24 }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderComposer();
    const input = screen.getByTestId('chat-file-input') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [new File(['first failure'], 'failed.txt', { type: 'text/plain' })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Attachment upload failed for 1 file(s) (storage offline).')).toBeTruthy();
    });
    expect(screen.queryByTestId('staged-attachments')).toBeNull();

    fireEvent.change(input, {
      target: {
        files: [new File(['retry works'], 'recovered.txt', { type: 'text/plain' })],
      },
    });

    await waitFor(() => {
      expect(screen.queryByText('Attachment upload failed for 1 file(s) (storage offline).')).toBeNull();
    });
    expect(screen.getByTestId('staged-attachments').textContent).toContain('recovered.txt');
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

  it('clears absolute anchors when the pet popover switches to fixed positioning', async () => {
    renderComposer({
      petConfig: {
        adopted: false,
        enabled: false,
        petId: 'custom',
        custom: {
          name: 'Buddy',
          glyph: '🐾',
          accent: '#7c3aed',
          greeting: 'hi',
        },
      },
      onAdoptPet: vi.fn(),
      onTogglePet: vi.fn(),
      onOpenPetSettings: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pets — wake, tuck, or pick one' }));

    const menu = screen.getByText('Show pet').closest('.composer-pet-menu') as HTMLElement | null;
    expect(menu).not.toBeNull();

    await waitFor(() => {
      expect(menu?.style.position).toBe('fixed');
      expect(menu?.style.bottom).toBe('auto');
      expect(menu?.style.right).toBe('auto');
    });
  });
});
