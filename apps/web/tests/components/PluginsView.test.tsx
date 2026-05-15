// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord, PluginSourceKind, TrustTier } from '@open-design/contracts';
import { PluginsView } from '../../src/components/PluginsView';
import {
  addPluginMarketplace,
  applyPlugin,
  installPluginSource,
  listPluginMarketplaces,
  listPlugins,
  refreshPluginMarketplace,
  removePluginMarketplace,
  setPluginMarketplaceTrust,
  type PluginShareProjectOutcome,
  uploadPluginFolder,
  uploadPluginZip,
} from '../../src/state/projects';

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  addPluginMarketplace: vi.fn(),
  applyPlugin: vi.fn(),
  installPluginSource: vi.fn(),
  listPluginMarketplaces: vi.fn(),
  listPlugins: vi.fn(),
  refreshPluginMarketplace: vi.fn(),
  removePluginMarketplace: vi.fn(),
  setPluginMarketplaceTrust: vi.fn(),
  uninstallPlugin: vi.fn(),
  uploadPluginFolder: vi.fn(),
  uploadPluginZip: vi.fn(),
  upgradePlugin: vi.fn(),
}));

function makePlugin(
  id: string,
  sourceKind: PluginSourceKind,
  trust: TrustTier,
  title = id === 'official-plugin' ? 'Official Plugin' : 'User Plugin',
  description = `${id} description`,
): InstalledPluginRecord {
  return {
    id,
    title,
    version: '1.0.0',
    sourceKind,
    source: '/tmp',
    trust,
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: id,
      version: '1.0.0',
      title: id,
      description,
      od: {
        kind: 'scenario',
        mode: 'prototype',
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

const mockedListPlugins = vi.mocked(listPlugins);
const mockedListMarketplaces = vi.mocked(listPluginMarketplaces);
const mockedInstallPluginSource = vi.mocked(installPluginSource);
const mockedAddMarketplace = vi.mocked(addPluginMarketplace);
const mockedRefreshMarketplace = vi.mocked(refreshPluginMarketplace);
const mockedRemoveMarketplace = vi.mocked(removePluginMarketplace);
const mockedSetMarketplaceTrust = vi.mocked(setPluginMarketplaceTrust);
const mockedApplyPlugin = vi.mocked(applyPlugin);
const mockedUploadPluginFolder = vi.mocked(uploadPluginFolder);
const mockedUploadPluginZip = vi.mocked(uploadPluginZip);

beforeEach(() => {
  mockedListPlugins.mockResolvedValue([
    makePlugin('official-plugin', 'bundled', 'bundled'),
    makePlugin('user-plugin', 'github', 'restricted'),
  ]);
  mockedListMarketplaces.mockResolvedValue([
    {
      id: 'catalog-1',
      url: 'https://example.com/open-design-marketplace.json',
      trust: 'official',
      manifest: {
        name: 'Example Catalog',
        version: '1.0.0',
        plugins: [{
          name: 'remote-plugin',
          title: 'Remote Plugin',
          source: 'github:owner/repo',
          version: '1.2.0',
          description: 'Remote catalog plugin.',
          tags: ['deck'],
        }],
      },
    },
  ]);
  mockedAddMarketplace.mockResolvedValue({
    ok: true,
    message: 'Marketplace source added.',
  });
  mockedRefreshMarketplace.mockResolvedValue({
    ok: true,
    message: 'Marketplace source refreshed.',
  });
  mockedRemoveMarketplace.mockResolvedValue({
    ok: true,
    message: 'Marketplace source removed.',
  });
  mockedSetMarketplaceTrust.mockResolvedValue({
    ok: true,
    message: 'Marketplace trust updated.',
  });
  mockedInstallPluginSource.mockResolvedValue({
    ok: true,
    plugin: makePlugin('new-plugin', 'github', 'restricted'),
    warnings: [],
    message: 'Installed New Plugin.',
    log: ['Parsing manifest'],
  });
  mockedUploadPluginZip.mockResolvedValue({
    ok: true,
    plugin: makePlugin('zip-plugin', 'user', 'restricted'),
    warnings: [],
    message: 'Installed Zip Plugin.',
    log: [],
  });
  mockedUploadPluginFolder.mockResolvedValue({
    ok: true,
    plugin: makePlugin('folder-plugin', 'user', 'restricted'),
    warnings: [],
    message: 'Installed Folder Plugin.',
    log: [],
  });
  mockedApplyPlugin.mockResolvedValue({
    query: 'Make something.',
    contextItems: [],
    inputs: [],
    assets: [],
    mcpServers: [],
    trust: 'restricted',
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    appliedPlugin: {
      snapshotId: 'snap-1',
      pluginId: 'official-plugin',
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
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PluginsView', () => {
  it('starts guided plugin creation from the Plugins hero', async () => {
    const onCreatePlugin = vi.fn();
    render(<PluginsView onCreatePlugin={onCreatePlugin} />);

    fireEvent.click(await screen.findByTestId('plugins-create-button'));

    expect(onCreatePlugin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Import a plugin' })).toBeNull();
  });

  it('shows installed plugins and available registry entries', async () => {
    render(<PluginsView />);

    expect(await screen.findByText('Installed plugins')).toBeTruthy();
    expect(screen.getAllByText('User Plugin').length).toBeGreaterThan(0);
    expect(screen.queryByText('Official Plugin')).toBeNull();

    const availableTab = screen.getByTestId('plugins-tab-available');
    const sourcesTab = screen.getByTestId('plugins-tab-sources');
    expect(availableTab.getAttribute('aria-disabled')).toBeNull();
    expect(sourcesTab.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(availableTab);
    expect(await screen.findByText('Remote Plugin')).toBeTruthy();
    expect(screen.getAllByText('Example Catalog').length).toBeGreaterThan(0);
  });

  it('shows all installed plugins by default on the Plugins page', async () => {
    const createPlugin = makePlugin('create-plugin', 'github', 'restricted', 'Create Plugin');
    const importPlugin = makePlugin('import-plugin', 'github', 'restricted', 'Import Plugin');
    importPlugin.manifest.od = {
      kind: 'scenario',
      mode: 'scenario',
      taskKind: 'figma-migration',
    };
    mockedListPlugins.mockResolvedValue([createPlugin, importPlugin]);
    mockedListMarketplaces.mockResolvedValue([]);

    render(<PluginsView />);

    const list = await screen.findByRole('list');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('data-plugin-id'))
        .sort(),
    ).toEqual(['create-plugin', 'import-plugin']);
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });

  it('hands installed plugin Use actions to the host shell', async () => {
    const onUsePlugin = vi.fn();
    render(<PluginsView onUsePlugin={onUsePlugin} />);

    fireEvent.click(await screen.findByTestId('plugins-home-use-user-plugin'));

    expect(onUsePlugin).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user-plugin',
      title: 'User Plugin',
    }), 'use');
    expect(mockedApplyPlugin).not.toHaveBeenCalled();
  });

  it('hands Use with query actions to the host shell', async () => {
    const onUsePlugin = vi.fn();
    const user = makePlugin('query-plugin', 'github', 'restricted', 'Query Plugin');
    user.manifest.od = {
      ...user.manifest.od,
      useCase: { query: 'Make a query-backed artifact.' },
    };
    mockedListPlugins.mockResolvedValue([user]);
    mockedListMarketplaces.mockResolvedValue([]);

    render(<PluginsView onUsePlugin={onUsePlugin} />);

    fireEvent.click(await screen.findByTestId('plugins-home-use-menu-query-plugin'));
    fireEvent.click(screen.getByTestId('plugins-home-use-with-query-query-plugin'));

    expect(onUsePlugin).toHaveBeenCalledWith(expect.objectContaining({
      id: 'query-plugin',
      title: 'Query Plugin',
    }), 'use-with-query');
    expect(mockedApplyPlugin).not.toHaveBeenCalled();
  });

  it('installs from a supported source string', async () => {
    render(<PluginsView />);

    expect(screen.queryByTestId('plugins-tab-import')).toBeNull();
    fireEvent.click(await screen.findByTestId('plugins-import-button'));
    expect(screen.getByRole('dialog', { name: 'Import a plugin' })).toBeTruthy();
    expect(screen.queryByText('Create from template')).toBeNull();
    const source = 'github:nexu-io/open-design@garnet-hemisphere/plugins/community/registry-starter';
    fireEvent.change(screen.getByLabelText('GitHub, archive, or marketplace source'), {
      target: { value: source },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(mockedInstallPluginSource).toHaveBeenCalledWith(
        source,
      ),
    );
    expect(await screen.findByText('Installed New Plugin.')).toBeTruthy();
    expect(screen.getByTestId('plugins-tab-installed').getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('User Plugin').length).toBeGreaterThan(0);
  });

  it('installs an available marketplace entry by name', async () => {
    render(<PluginsView />);

    fireEvent.click(await screen.findByTestId('plugins-tab-available'));
    fireEvent.click(await screen.findByTestId('plugins-available-install-remote-plugin'));

    await waitFor(() =>
      expect(mockedInstallPluginSource).toHaveBeenCalledWith('remote-plugin'),
    );
    expect(await screen.findByText('Installed New Plugin.')).toBeTruthy();
    expect(screen.getByTestId('plugins-tab-installed').getAttribute('aria-selected')).toBe('true');
  });

  it('opens details for available marketplace entries', async () => {
    render(<PluginsView />);

    fireEvent.click(await screen.findByTestId('plugins-tab-available'));
    fireEvent.click(await screen.findByTestId('plugins-available-details-remote-plugin'));

    const dialog = await screen.findByTestId('plugins-available-details-modal');
    expect(within(dialog).getByText('Remote Plugin')).toBeTruthy();
    expect(dialog.textContent).toContain('Remote catalog plugin.');
    expect(dialog.textContent).toContain('github:owner/repo');

    fireEvent.click(within(dialog).getByTestId('plugins-available-details-install-remote-plugin'));

    await waitFor(() =>
      expect(mockedInstallPluginSource).toHaveBeenCalledWith('remote-plugin'),
    );
    expect(await screen.findByText('Installed New Plugin.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByTestId('plugins-available-details-modal')).toBeNull(),
    );
  });

  it('filters available marketplace entries by source and search', async () => {
    mockedListMarketplaces.mockResolvedValue([
      {
        id: 'catalog-1',
        url: 'https://example.com/open-design-marketplace.json',
        trust: 'official',
        manifest: {
          name: 'Example Catalog',
          version: '1.0.0',
          plugins: [{
            name: 'remote-plugin',
            title: 'Remote Plugin',
            source: 'github:owner/repo',
            version: '1.2.0',
            description: 'Remote catalog plugin.',
            tags: ['deck'],
          }],
        },
      },
      {
        id: 'catalog-2',
        url: 'https://team.example.com/open-design-marketplace.json',
        trust: 'restricted',
        manifest: {
          name: 'Team Catalog',
          version: '1.0.0',
          plugins: [{
            name: 'figma-importer',
            title: 'Figma Importer',
            source: 'github:team/figma-importer',
            version: '0.2.0',
            description: 'Imports a Figma source.',
            tags: ['figma', 'import'],
          }],
        },
      },
    ]);

    render(<PluginsView />);

    fireEvent.click(await screen.findByTestId('plugins-tab-available'));
    expect(await screen.findByText('Remote Plugin')).toBeTruthy();
    expect(screen.getByText('Figma Importer')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search available plugins'), {
      target: { value: 'figma' },
    });

    expect(await screen.findByText('Figma Importer')).toBeTruthy();
    expect(screen.queryByText('Remote Plugin')).toBeNull();

    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'catalog-1' },
    });

    expect(await screen.findByText('No available entries match your filters.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear available plugin search' }));

    expect(await screen.findByText('Remote Plugin')).toBeTruthy();
    expect(screen.queryByText('Figma Importer')).toBeNull();
  });

  it('keeps installed registry entries out of Available', async () => {
    const official = makePlugin('official-plugin', 'bundled', 'bundled', 'Official Plugin');
    official.sourceMarketplaceId = 'official';
    official.sourceMarketplaceEntryName = 'open-design/official-plugin';
    official.sourceMarketplaceEntryVersion = '1.0.0';
    official.marketplaceTrust = 'official';
    official.manifest.od = { ...official.manifest.od, hidden: true };
    mockedListPlugins.mockImplementation(async (options?: { includeHidden?: boolean }) =>
      options?.includeHidden ? [official] : [],
    );
    mockedListMarketplaces.mockResolvedValue([
      {
        id: 'official',
        url: 'https://open-design.ai/marketplace/open-design-marketplace.json',
        trust: 'official',
        manifest: {
          name: 'Open Design Official',
          version: '0.1.0',
          plugins: [{
            name: 'open-design/official-plugin',
            title: 'Official Plugin',
            source: 'github:nexu-io/open-design@main/plugins/_official/scenarios/official-plugin',
            version: '1.0.0',
            description: 'Bundled official starter.',
            tags: ['official'],
          }],
        },
      },
    ]);

    render(<PluginsView />);

    fireEvent.click(await screen.findByTestId('plugins-tab-available'));
    expect(await screen.findByText(/Installed catalog entries are removed from Available/i)).toBeTruthy();
    expect(screen.queryByText('Official Plugin')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    expect(mockedListPlugins).toHaveBeenCalledWith({ includeHidden: true });
    expect(mockedApplyPlugin).not.toHaveBeenCalled();
  });

  it('manages registry sources from the Sources tab', async () => {
    render(<PluginsView />);

    const sourceUrl =
      'https://raw.githubusercontent.com/nexu-io/open-design/main/plugins/registry/community/open-design-marketplace.json';
    fireEvent.click(await screen.findByTestId('plugins-tab-sources'));
    fireEvent.change(screen.getByLabelText('Source URL'), {
      target: { value: sourceUrl },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    await waitFor(() =>
      expect(mockedAddMarketplace).toHaveBeenCalledWith({
        url: sourceUrl,
        trust: 'restricted',
      }),
    );
    expect(await screen.findByText('Marketplace source added.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockedRefreshMarketplace).toHaveBeenCalledWith('catalog-1'));

    fireEvent.change(screen.getByLabelText('Trust for Example Catalog'), {
      target: { value: 'trusted' },
    });
    await waitFor(() =>
      expect(mockedSetMarketplaceTrust).toHaveBeenCalledWith('catalog-1', 'trusted'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mockedRemoveMarketplace).toHaveBeenCalledWith('catalog-1'));
  });

  it('uploads zip and folder plugins from the import dialog', async () => {
    render(<PluginsView />);

    fireEvent.click(await screen.findByTestId('plugins-import-button'));
    fireEvent.click(screen.getByRole('button', { name: /upload zip/i }));
    const zip = new File(['zip-bytes'], 'plugin.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByTestId('plugins-zip-input'), {
      target: { files: [zip] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(mockedUploadPluginZip).toHaveBeenCalledWith(zip));
    expect(await screen.findByText('Installed Zip Plugin.')).toBeTruthy();

    fireEvent.click(await screen.findByTestId('plugins-import-button'));
    fireEvent.click(screen.getByRole('button', { name: /upload folder/i }));
    const folderFile = new File(['{}'], 'open-design.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('plugins-folder-input'), {
      target: { files: [folderFile] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(mockedUploadPluginFolder).toHaveBeenCalledWith([folderFile]));
    expect(await screen.findByText('Installed Folder Plugin.')).toBeTruthy();
  });

  it('confirms a plugin share action before starting the GitHub repo task', async () => {
    mockedListPlugins.mockResolvedValue([
      makePlugin('official-plugin', 'bundled', 'bundled'),
      makePlugin('user-plugin', 'github', 'restricted'),
      makePlugin(
        'od-plugin-publish-github',
        'bundled',
        'bundled',
        'Publish Plugin to GitHub',
        'Creates a public GitHub repository for a local Open Design plugin using the GitHub CLI.',
      ),
      makePlugin(
        'od-plugin-contribute-open-design',
        'bundled',
        'bundled',
        'Contribute Plugin to Open Design',
        'Opens a pull request that adds a local Open Design plugin to the Open Design community catalog.',
      ),
    ]);
    const onCreatePluginShareProject = vi.fn(async (): Promise<PluginShareProjectOutcome> => ({
      ok: true as const,
      project: {
        id: 'share-project',
        name: 'Publish to GitHub: User Plugin',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 1,
        pendingPrompt: 'Publish it',
        metadata: { kind: 'prototype' },
      },
      conversationId: 'conversation-1',
      appliedPluginSnapshotId: 'snapshot-1',
      actionPluginId: 'od-plugin-publish-github',
      sourcePluginId: 'user-plugin',
      stagedPath: 'plugin-source/user-plugin',
      prompt: 'Publish it',
      message: 'Created a Publish to GitHub task.',
    }));

    render(
      <PluginsView
        onCreatePluginShareProject={onCreatePluginShareProject}
      />,
    );

    const publish = await screen.findByTestId('plugins-home-publish-github-user-plugin');
    expect(publish.textContent).toContain('Publish');
    fireEvent.click(publish);

    const dialog = await screen.findByRole('dialog', {
      name: /Publish Plugin to GitHub for User Plugin/i,
    });
    expect(dialog.textContent).toContain('Creates a public GitHub repository');
    expect(dialog.textContent).toContain('plugin-source/user-plugin');
    expect(onCreatePluginShareProject).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByTestId('plugin-share-confirm-start'));

    await waitFor(() =>
      expect(onCreatePluginShareProject).toHaveBeenCalledWith(
        'user-plugin',
        'publish-github',
        'en',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('plugin-share-confirm-modal')).toBeNull(),
    );
  });
});
