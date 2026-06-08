// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackChatPanelClickMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: trackChatPanelClickMock,
  };
});

import { ChatComposer } from '../../src/components/ChatComposer';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';
import { composerText, pressEnter, typeAndSettle } from '../helpers/lexical-composer';

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

function composerElement(
  overrides: Partial<ComponentProps<typeof ChatComposer>> = {},
) {
  return (
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
}

function renderComposer(
  overrides: Partial<ComponentProps<typeof ChatComposer>> = {},
  options: { locale?: Locale } = {},
) {
  const tree = composerElement(overrides);

  return options.locale
    ? render(<I18nProvider initial={options.locale}>{tree}</I18nProvider>)
    : render(tree);
}

// Flush the composer's lazy mount fetches (MCP servers, installed plugins,
// connectors) so the @-picker lists are populated before we drive the editor.
async function flushMounts() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// The contenteditable serializes newlines as `<br>`, which jsdom's
// `.textContent` drops — so use the Lexical-aware `composerText()` helper for
// every editor-text assertion (it walks the tree and emits real `\n`s).

beforeEach(() => {
  trackChatPanelClickMock.mockClear();
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
    // Any other lazy mount fetch (e.g. /api/connectors) returns an empty-OK
    // body. flushMounts() awaits these, so throwing here would surface as an
    // unhandled rejection during the await; an empty payload keeps the picker
    // lists empty without breaking the render.
    return new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ChatComposer context pickers', () => {
  it('auto-stages the active workspace context and re-stages after a tab change', async () => {
    const onSend = vi.fn();
    const fileContext = {
      id: 'file:index.html',
      kind: 'file' as const,
      label: 'index.html',
      path: 'index.html',
      tabId: 'index.html',
    };
    const browserContext = {
      id: 'browser:1',
      kind: 'browser' as const,
      label: 'Dribbble',
      url: 'https://dribbble.com/',
      tabId: '__browser__:1',
    };
    const view = renderComposer({ activeWorkspaceContext: fileContext, onSend });
    await flushMounts();

    expect(screen.getByTestId('staged-contexts').textContent).toContain('Currentindex.html');
    fireEvent.click(screen.getByLabelText('Remove index.html'));
    await waitFor(() => expect(screen.queryByText('index.html')).toBeNull());

    view.rerender(composerElement({ activeWorkspaceContext: browserContext, onSend }));
    await waitFor(() => expect(screen.getByTestId('staged-contexts').textContent).toContain('CurrentDribbble'));

    await typeAndSettle('Use the current tab.');
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    const meta = onSend.mock.calls[0]?.[3];
    expect(meta?.context?.workspaceItems).toEqual([browserContext]);
  });

  it('opens the @ panel even when every source is empty', async () => {
    plugins = [];
    skills = [];
    servers = [];
    renderComposer();
    await flushMounts();

    await typeAndSettle('@');

    await waitFor(() => expect(screen.getByTestId('mention-popover')).toBeTruthy());
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'All',
      'Design files',
      'Tabs',
      'Plugins',
      'Skills',
      'MCP',
      'Connectors',
    ]);
    expect(screen.getByRole('tab', { name: 'Plugins' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'MCP' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Connectors' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Design files' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tabs' })).toBeTruthy();
    expect(screen.getByText('Search Design Files, tabs, plugins, skills, MCP servers, and connectors.')).toBeTruthy();
  });

  it('localizes @ panel tabs and empty states in Chinese mode', async () => {
    plugins = [];
    skills = [];
    servers = [];
    renderComposer({}, { locale: 'zh-CN' });
    await flushMounts();

    await typeAndSettle('@');

    await waitFor(() => expect(screen.getByRole('tab', { name: '全部' })).toBeTruthy());
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '全部',
      '设计文件',
      '标签页',
      '插件',
      '技能',
      'MCP',
      '连接器',
    ]);
    expect(screen.getByRole('tab', { name: '插件' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '技能' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'MCP' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '连接器' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '设计文件' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '标签页' })).toBeTruthy();
    expect(screen.getByText('搜索设计文件、标签页、插件、技能、MCP 服务器和连接器。')).toBeTruthy();

    await typeAndSettle('@missing');

    await waitFor(() => expect(screen.getByText('没有找到“missing”的结果。')).toBeTruthy());
    expect(screen.queryByText('No results for “missing”.')).toBeNull();
  });

  it('lists Design Files first in All and picks the first file with Enter', async () => {
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
      workspaceContexts: [
        {
          id: 'browser:__browser__:1',
          kind: 'browser' as const,
          label: 'Dribbble',
          title: 'Dribbble - Discover designers',
          url: 'https://dribbble.com/',
          tabId: '__browser__:1',
        },
      ],
    });
    await flushMounts();

    await typeAndSettle('@');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    const labels = Array.from(
      screen.getByTestId('mention-popover').querySelectorAll('.mention-section-label'),
      (node) => node.textContent,
    );
    expect(labels[0]).toBe('Design files');
    expect(labels[1]).toBe('Tabs');

    pressEnter();

    await waitFor(() => expect(composerText()).toBe('@designs/landing.html '));
    expect(screen.getByTestId('staged-contexts').textContent).toContain('landing.html');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/apply'))).toBe(false);
  });

  it('searches workspace tabs from @ and sends the selected tab context', async () => {
    const onSend = vi.fn();
    const browserContext = {
      id: 'browser:__browser__:1',
      kind: 'browser' as const,
      label: 'Dribbble',
      title: 'Dribbble - Discover designers',
      url: 'https://dribbble.com/',
      tabId: '__browser__:1',
    };
    renderComposer({
      onSend,
      workspaceContexts: [browserContext],
    });
    await flushMounts();

    await typeAndSettle('@drib');

    await waitFor(() => expect(screen.getByText('Dribbble')).toBeTruthy());
    const labels = Array.from(
      screen.getByTestId('mention-popover').querySelectorAll('.mention-section-label'),
      (node) => node.textContent,
    );
    expect(labels[0]).toBe('Tabs');
    fireEvent.click(screen.getByText('Dribbble'));

    await waitFor(() => expect(composerText()).toBe('@Dribbble '));
    const pill = screen
      .getByTestId('chat-composer-input')
      .querySelector('.composer-inline-mention');
    expect(pill?.getAttribute('data-mention-kind')).toBe('workspace');
    expect(screen.getByTestId('staged-contexts').textContent).toContain('BrowserDribbble');

    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[3]?.context?.workspaceItems).toEqual([browserContext]);
  });

  it('selects an MCP server from @ search and keeps the inline token visible', async () => {
    renderComposer();
    await flushMounts();

    await typeAndSettle('@sl');

    await waitFor(() => expect(screen.getByText('Slack MCP')).toBeTruthy());
    fireEvent.click(screen.getByText('Slack MCP'));

    await waitFor(() => expect(composerText()).toBe('@Slack MCP '));
    const pill = screen
      .getByTestId('chat-composer-input')
      .querySelector('.composer-inline-mention');
    expect(pill?.textContent).toBe('@Slack MCP');
    expect(pill?.getAttribute('data-mention-kind')).toBe('mcp');
    expect(screen.getByTestId('staged-contexts').textContent).toContain('@Slack MCP');

    fireEvent.click(screen.getByLabelText('Remove Slack MCP'));
    await waitFor(() => expect(composerText().trim()).toBe(''));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
  });

  it('applies a skill from @ search and reports the active project skill', async () => {
    const onProjectSkillChange = vi.fn();
    renderComposer({ onProjectSkillChange });
    await flushMounts();

    await typeAndSettle('@deck');

    await waitFor(() => expect(screen.getByText('Deck Builder')).toBeTruthy());
    fireEvent.click(screen.getByText('Deck Builder'));

    await waitFor(() => expect(onProjectSkillChange).toHaveBeenCalledWith('deck-builder'));
    await waitFor(() => expect(composerText()).toBe('@Deck Builder '));
    const pill = screen
      .getByTestId('chat-composer-input')
      .querySelector('.composer-inline-mention');
    expect(pill?.textContent).toBe('@Deck Builder');
    expect(pill?.getAttribute('data-mention-kind')).toBe('skill');
    expect(screen.getByTestId('staged-contexts').textContent).toContain('@Deck Builder');

    fireEvent.click(screen.getByLabelText('Remove Deck Builder'));
    await waitFor(() => expect(composerText().trim()).toBe(''));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
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
    await flushMounts();

    await typeAndSettle('@audit');

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
    await flushMounts();

    await typeAndSettle('@export');

    await waitFor(() => expect(screen.getByText('My Export')).toBeTruthy());
    fireEvent.click(screen.getByText('My Export'));

    await waitFor(() => expect(composerText()).toBe('@My Export '));
    const pill = screen
      .getByTestId('chat-composer-input')
      .querySelector('.composer-inline-mention');
    expect(pill?.textContent).toBe('@My Export');
    expect(pill?.getAttribute('data-mention-kind')).toBe('plugin');
  });

  it('sends the applied plugin snapshot as per-turn context', async () => {
    const onSend = vi.fn();
    renderComposer({ onSend });
    await flushMounts();

    await typeAndSettle('@export');

    await waitFor(() => expect(screen.getByText('My Export')).toBeTruthy());
    fireEvent.click(screen.getByText('My Export'));

    await waitFor(() => expect(composerText()).toBe('@My Export '));
    // The applied-plugin chip now rides the shared staged-context row as a
    // `.staged-context--plugin` chip (rendered by the host, not PluginsSection's
    // own ContextChipStrip). It is keyed off the plugin id when no display title
    // is present in the applied snapshot.
    await waitFor(() => {
      const chip = screen
        .getByTestId('staged-contexts')
        .querySelector('.staged-chip.staged-context--plugin');
      expect(chip?.textContent).toContain(USER_PLUGIN.id);
    });

    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const meta = onSend.mock.calls[0]?.[3];
    expect(meta).toMatchObject({
      appliedPluginSnapshotId: 'snap-1',
      appliedPluginSnapshot: expect.objectContaining({
        snapshotId: 'snap-1',
        pluginId: USER_PLUGIN.id,
      }),
      context: { pluginIds: [USER_PLUGIN.id] },
    });
    // After sending, the applied plugin clears, so its staged chip is gone.
    await waitFor(() => {
      expect(
        screen.queryByTestId('staged-contexts')?.querySelector('.staged-context--plugin') ?? null,
      ).toBeNull();
    });
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
    await flushMounts();

    await typeAndSettle('Use @landing');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));

    await waitFor(() => expect(composerText()).toBe('Use @designs/landing.html '));
    expect(screen.getByTestId('staged-contexts').textContent).toContain('landing.html');

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove landing.html'));
      await Promise.resolve();
    });

    await waitFor(() => expect(composerText()).toBe('Use '));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
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
    await flushMounts();

    // Open the @ picker mid-draft and pick the file — that stages the
    // attachment AND inserts the atomic pill (typing alone never stages). The
    // surrounding `\n\n` runs are preserved as LineBreakNodes.
    await typeAndSettle('Plan:\n\n@landing');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));

    await waitFor(() =>
      expect(composerText()).toBe('Plan:\n\n@designs/landing.html '),
    );
    expect(screen.getByTestId('staged-contexts').textContent).toContain('landing.html');

    // The user keeps typing after the trailing space; re-seed the full draft to
    // capture that, then remove the staged chip.
    await typeAndSettle('Plan:\n\n@designs/landing.html \n\nKeep spacing');
    await waitFor(() =>
      expect(composerText()).toBe('Plan:\n\n@designs/landing.html \n\nKeep spacing'),
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove landing.html'));
      await Promise.resolve();
    });

    await waitFor(() => expect(composerText()).toBe('Plan:\n\n\n\nKeep spacing'));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
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
    await flushMounts();

    await typeAndSettle('Use @landing');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));
    await waitFor(() => expect(composerText()).toBe('Use @designs/landing.html '));

    await typeAndSettle('Use @designs/landing.html, please');

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove landing.html'));
      await Promise.resolve();
    });

    await waitFor(() => expect(composerText()).toBe('Use , please'));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
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
    await flushMounts();

    await typeAndSettle('@landing');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));
    await waitFor(() => expect(composerText()).toBe('@designs/landing.html '));

    await typeAndSettle('"@designs/landing.html"');

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove landing.html'));
      await Promise.resolve();
    });

    await waitFor(() => expect(composerText()).toBe('""'));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
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
    expect(screen.queryByTestId('staged-contexts')).toBeNull();

    fireEvent.change(input, {
      target: {
        files: [new File(['retry works'], 'recovered.txt', { type: 'text/plain' })],
      },
    });

    await waitFor(() => {
      expect(screen.queryByText('Attachment upload failed for 1 file(s) (storage offline).')).toBeNull();
    });
    expect(screen.getByTestId('staged-contexts').textContent).toContain('recovered.txt');
  });

  // The sliders "tools" popover (Official / My plugins switch, plugin search)
  // and the standalone "@" mention trigger button were removed from the
  // composer; plugins/skills/MCP are now reached via typed @-mentions and the
  // "+" menu, so their dedicated click-tracking coverage moved out with them.

  // The inline pet popover (the "Pets — wake, tuck, or pick one" button and
  // its `.composer-pet-menu` flyout) was removed from ChatComposer; only the
  // pet props survive to drive `/pet` slash handling. Assert the entry stays
  // gone even when every pet handler is wired.
  it('does not render the pet composer entry when pet handlers are wired', () => {
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

    expect(screen.queryByRole('button', { name: 'Pets — wake, tuck, or pick one' })).toBeNull();
    expect(screen.queryByText('Buddy')).toBeNull();
  });
});
