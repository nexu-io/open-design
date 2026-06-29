// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectLocation, ScanProjectLocationsResponse } from '@open-design/contracts';
import { ProjectLocationsSection } from '../../src/components/ProjectLocationsSection';
import { I18nProvider } from '../../src/i18n';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { Locale } from '../../src/i18n/types';
import type { AppConfig } from '../../src/types';

const {
  browseProjectLocationFoldersMock,
  fetchProjectLocationsMock,
  openProjectLocationFolderDialogMock,
  scanProjectLocationsMock,
  updateProjectLocationsMock,
} = vi.hoisted(() => ({
  browseProjectLocationFoldersMock: vi.fn(),
  fetchProjectLocationsMock: vi.fn(),
  openProjectLocationFolderDialogMock: vi.fn(),
  scanProjectLocationsMock: vi.fn(),
  updateProjectLocationsMock: vi.fn(),
}));

vi.mock('../../src/state/project-locations', () => ({
  browseProjectLocationFolders: browseProjectLocationFoldersMock,
  fetchProjectLocations: fetchProjectLocationsMock,
  openProjectLocationFolderDialog: openProjectLocationFolderDialogMock,
  scanProjectLocations: scanProjectLocationsMock,
  updateProjectLocations: updateProjectLocationsMock,
}));

const builtInLocation: ProjectLocation = {
  id: 'default',
  name: 'Open Design projects',
  path: '/tmp/open-design/.od/projects',
  builtIn: true,
};

const forgeLocation: ProjectLocation = {
  id: 'forge-design',
  name: 'Forge Design',
  path: '/home/abhishek/forge/design',
};

const scanResult: ScanProjectLocationsResponse = {
  scanned: 1,
  imported: [],
  existing: [],
  skipped: [],
};

const baseConfig = {
  mode: 'api',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
  projectLocations: [],
  defaultProjectLocationId: 'default',
} satisfies AppConfig;

function renderSection(config: AppConfig = baseConfig, locale: Locale = 'en') {
  const setCfg = vi.fn();
  const onProjectsRefresh = vi.fn();
  render(
    <I18nProvider initial={locale}>
      <ProjectLocationsSection cfg={config} setCfg={setCfg} onProjectsRefresh={onProjectsRefresh} />
    </I18nProvider>,
  );
  return { setCfg, onProjectsRefresh };
}

async function findEnabledAddFolderButton(name: string | RegExp = /Add folder/i) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => {
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  return button;
}

async function openAddLocationForm() {
  fireEvent.click(await findEnabledAddFolderButton());
  return screen.findByRole('textbox', { name: 'Project path' });
}

describe('ProjectLocationsSection', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('adds a manually entered project location when the native picker is unavailable', async () => {
    fetchProjectLocationsMock.mockResolvedValue([builtInLocation]);
    updateProjectLocationsMock.mockResolvedValue([builtInLocation, forgeLocation]);
    scanProjectLocationsMock.mockResolvedValue(scanResult);

    const { setCfg, onProjectsRefresh } = renderSection();

    await findEnabledAddFolderButton();
    expect(screen.queryByRole('textbox', { name: 'Project path' })).toBeNull();

    const pathInput = await openAddLocationForm();
    fireEvent.change(pathInput, { target: { value: '/home/abhishek/forge/design' } });
    fireEvent.submit(pathInput.closest('form')!);

    await waitFor(() => {
      expect(updateProjectLocationsMock).toHaveBeenCalledWith([
        { path: '/home/abhishek/forge/design' },
      ]);
    });
    expect(openProjectLocationFolderDialogMock).not.toHaveBeenCalled();
    expect(scanProjectLocationsMock).toHaveBeenCalledTimes(1);
    expect(setCfg).toHaveBeenCalledWith(expect.any(Function));
    expect(onProjectsRefresh).toHaveBeenCalledTimes(2);
  });

  it('fills the add-folder input from a native folder picker when it returns a path', async () => {
    fetchProjectLocationsMock.mockResolvedValue([builtInLocation]);
    openProjectLocationFolderDialogMock.mockResolvedValue('/home/abhishek/forge/design');
    updateProjectLocationsMock.mockResolvedValue([builtInLocation, forgeLocation]);
    scanProjectLocationsMock.mockResolvedValue(scanResult);

    renderSection();

    await openAddLocationForm();
    fireEvent.click(screen.getByRole('button', { name: 'Browse folders' }));

    const pathInput = await screen.findByRole('textbox', { name: 'Project path' });
    await waitFor(() => {
      expect((pathInput as HTMLInputElement).value).toBe('/home/abhishek/forge/design');
    });
    expect(updateProjectLocationsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateProjectLocationsMock).toHaveBeenCalledWith([
        { path: '/home/abhishek/forge/design' },
      ]);
    });
  });

  it('fills the add-folder input from the in-app folder browser when the native picker returns no path', async () => {
    fetchProjectLocationsMock.mockResolvedValue([builtInLocation]);
    openProjectLocationFolderDialogMock.mockResolvedValue(null);
    browseProjectLocationFoldersMock
      .mockResolvedValueOnce({
        path: '/home/abhishek',
        parentPath: null,
        entries: [{ name: 'forge', path: '/home/abhishek/forge' }],
      })
      .mockResolvedValueOnce({
        path: '/home/abhishek/forge',
        parentPath: '/home/abhishek',
        entries: [{ name: 'design', path: '/home/abhishek/forge/design' }],
      })
      .mockResolvedValueOnce({
        path: '/home/abhishek/forge/design',
        parentPath: '/home/abhishek/forge',
        entries: [],
      });
    updateProjectLocationsMock.mockResolvedValue([builtInLocation, forgeLocation]);
    scanProjectLocationsMock.mockResolvedValue(scanResult);

    const { setCfg, onProjectsRefresh } = renderSection();

    await openAddLocationForm();
    fireEvent.click(screen.getByRole('button', { name: 'Browse folders' }));

    await waitFor(() => {
      expect(openProjectLocationFolderDialogMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('/home/abhishek')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'forge' }));

    await waitFor(() => {
      expect(screen.getByText('/home/abhishek/forge')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'design' }));

    await waitFor(() => {
      expect(screen.getByText('/home/abhishek/forge/design')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use this folder' }));

    const pathInput = screen.getByRole('textbox', { name: 'Project path' });
    await waitFor(() => {
      expect((pathInput as HTMLInputElement).value).toBe('/home/abhishek/forge/design');
    });
    expect(updateProjectLocationsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateProjectLocationsMock).toHaveBeenCalledWith([
        { path: '/home/abhishek/forge/design' },
      ]);
    });
    expect(scanProjectLocationsMock).toHaveBeenCalledTimes(1);
    expect(setCfg).toHaveBeenCalledWith(expect.any(Function));
    expect(onProjectsRefresh).toHaveBeenCalledTimes(2);
  });

  it('localizes the in-app folder browser controls', async () => {
    fetchProjectLocationsMock.mockResolvedValue([builtInLocation]);
    openProjectLocationFolderDialogMock.mockResolvedValue(null);
    browseProjectLocationFoldersMock.mockResolvedValue({
      path: '/home/abhishek',
      parentPath: '/home',
      entries: [],
    });

    renderSection(baseConfig, 'zh-CN');

    fireEvent.click(await findEnabledAddFolderButton(zhCN['settings.projectLocationsAddFolder']));
    fireEvent.click(screen.getByRole('button', { name: zhCN['settings.projectLocationsBrowseFolders'] }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: zhCN['settings.projectLocationsBrowserDialogLabel'] })).toBeTruthy();
    });
    expect(screen.getByText(zhCN['settings.projectLocationsBrowserTitle'])).toBeTruthy();
    expect(screen.getByRole('button', { name: zhCN['settings.projectLocationsBrowserParentFolder'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: zhCN['settings.projectLocationsBrowserUseFolder'] })).toBeTruthy();
    expect(screen.getByText(zhCN['settings.projectLocationsBrowserEmpty'])).toBeTruthy();
    expect(screen.queryByText('Choose folder')).toBeNull();
    expect(screen.queryByText('Parent folder')).toBeNull();
    expect(screen.queryByText('Use this folder')).toBeNull();
  });

  it('does not show no-folder-selected status when a work base is already configured', async () => {
    fetchProjectLocationsMock.mockResolvedValue([builtInLocation, forgeLocation]);

    renderSection({
      ...baseConfig,
      projectLocations: [{ id: forgeLocation.id, name: forgeLocation.name, path: forgeLocation.path }],
      defaultProjectLocationId: forgeLocation.id,
    });

    expect(screen.getByText('/home/abhishek/forge/design')).toBeTruthy();

    const pathInput = await openAddLocationForm();
    fireEvent.submit(pathInput.closest('form')!);

    await waitFor(() => {
      expect(screen.queryByText('No folder selected.')).toBeNull();
    });
  });

  it('does not show no-folder-selected status after an empty add attempt', async () => {
    fetchProjectLocationsMock.mockResolvedValue([builtInLocation]);

    renderSection();

    const pathInput = await openAddLocationForm();
    fireEvent.submit(pathInput.closest('form')!);

    expect(screen.queryByText('No folder selected.')).toBeNull();
  });
});
