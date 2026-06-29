// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectLocation, ScanProjectLocationsResponse } from '@open-design/contracts';
import { ProjectLocationsSection } from '../../src/components/ProjectLocationsSection';
import { I18nProvider } from '../../src/i18n';
import type { AppConfig } from '../../src/types';

const {
  fetchProjectLocationsMock,
  openProjectLocationFolderDialogMock,
  scanProjectLocationsMock,
  updateProjectLocationsMock,
} = vi.hoisted(() => ({
  fetchProjectLocationsMock: vi.fn(),
  openProjectLocationFolderDialogMock: vi.fn(),
  scanProjectLocationsMock: vi.fn(),
  updateProjectLocationsMock: vi.fn(),
}));

vi.mock('../../src/state/project-locations', () => ({
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

  it('focuses the manual path input when the native folder picker returns no path', async () => {
    fetchProjectLocationsMock.mockResolvedValue([builtInLocation]);
    openProjectLocationFolderDialogMock.mockResolvedValue(null);

    renderSection();

    const pathInput = await screen.findByRole('textbox', { name: 'Project path' });
    fireEvent.click(screen.getByRole('button', { name: /Add folder/i }));

    await waitFor(() => {
      expect(openProjectLocationFolderDialogMock).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(pathInput);
    });
    expect(screen.getByText('No folder selected. Enter a folder path')).toBeTruthy();
    expect(updateProjectLocationsMock).not.toHaveBeenCalled();
  });
});
