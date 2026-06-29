// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectLocation, ScanProjectLocationsResponse } from '@open-design/contracts';
import { ProjectLocationsSection } from '../../src/components/ProjectLocationsSection';
import { I18nProvider } from '../../src/i18n';
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

function renderSection(config: AppConfig = baseConfig) {
  const setCfg = vi.fn();
  const onProjectsRefresh = vi.fn();
  render(
    <I18nProvider initial="en">
      <ProjectLocationsSection cfg={config} setCfg={setCfg} onProjectsRefresh={onProjectsRefresh} />
    </I18nProvider>,
  );
  return { setCfg, onProjectsRefresh };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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

    const pathInput = await screen.findByRole('textbox', { name: 'Project path' });
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

  it('opens an in-app folder browser when the native folder picker returns no path', async () => {
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

    await screen.findByRole('textbox', { name: 'Project path' });
    fireEvent.click(screen.getByRole('button', { name: /Add folder/i }));

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

    await waitFor(() => {
      expect(updateProjectLocationsMock).toHaveBeenCalledWith([
        { path: '/home/abhishek/forge/design' },
      ]);
    });
    expect(scanProjectLocationsMock).toHaveBeenCalledTimes(1);
    expect(setCfg).toHaveBeenCalledWith(expect.any(Function));
    expect(onProjectsRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not show no-folder-selected status when a work base is already configured', async () => {
    fetchProjectLocationsMock.mockResolvedValue([builtInLocation, forgeLocation]);

    renderSection({
      ...baseConfig,
      projectLocations: [{ id: forgeLocation.id, name: forgeLocation.name, path: forgeLocation.path }],
      defaultProjectLocationId: forgeLocation.id,
    });

    const pathInput = await screen.findByRole('textbox', { name: 'Project path' });
    expect(screen.getByText('/home/abhishek/forge/design')).toBeTruthy();

    fireEvent.submit(pathInput.closest('form')!);

    await waitFor(() => {
      expect(screen.queryByText('No folder selected.')).toBeNull();
    });
  });

  it('clears stale no-folder-selected status after configured work bases load', async () => {
    const locations = deferred<ProjectLocation[]>();
    fetchProjectLocationsMock.mockReturnValue(locations.promise);

    renderSection();

    const pathInput = await screen.findByRole('textbox', { name: 'Project path' });
    fireEvent.submit(pathInput.closest('form')!);

    expect(screen.getByText('No folder selected.')).toBeTruthy();

    locations.resolve([builtInLocation, forgeLocation]);

    await waitFor(() => {
      expect(screen.getByText('/home/abhishek/forge/design')).toBeTruthy();
    });
    expect(screen.queryByText('No folder selected.')).toBeNull();
  });
});
