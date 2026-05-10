// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  playSoundMock,
  requestNotificationPermissionMock,
  showCompletionNotificationMock,
  notificationPermissionMock,
  fetchCodexPetsMock,
  syncCommunityPetsMock,
  fetchSkillsMock,
  fetchDesignSystemsMock,
  fetchSkillMock,
  fetchDesignSystemMock,
} = vi.hoisted(() => ({
  playSoundMock: vi.fn(),
  requestNotificationPermissionMock: vi.fn(),
  showCompletionNotificationMock: vi.fn(),
  notificationPermissionMock: vi.fn(),
  fetchCodexPetsMock: vi.fn(),
  syncCommunityPetsMock: vi.fn(),
  fetchSkillsMock: vi.fn(),
  fetchDesignSystemsMock: vi.fn(),
  fetchSkillMock: vi.fn(),
  fetchDesignSystemMock: vi.fn(),
}));

vi.mock('../../src/utils/notifications', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/notifications')>(
    '../../src/utils/notifications',
  );
  return {
    ...actual,
    playSound: playSoundMock,
    requestNotificationPermission: requestNotificationPermissionMock,
    showCompletionNotification: showCompletionNotificationMock,
    notificationPermission: notificationPermissionMock,
  };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchCodexPets: fetchCodexPetsMock,
    syncCommunityPets: syncCommunityPetsMock,
    fetchSkills: fetchSkillsMock,
    fetchDesignSystems: fetchDesignSystemsMock,
    fetchSkill: fetchSkillMock,
    fetchDesignSystem: fetchDesignSystemMock,
    codexPetSpritesheetUrl: (pet: { spritesheetUrl: string }) => pet.spritesheetUrl,
  };
});

import { SettingsDialog } from '../../src/components/SettingsDialog';
import type { AgentInfo, AppConfig } from '../../src/types';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: '',
  apiProtocol: 'vendor',
  apiVersion: '',
  baseUrl: 'https://api.vendor.com',
  model: 'assistant-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.vendor.com',
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

const availableAgents: AgentInfo[] = [
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: '0.80.0',
    models: [{ id: 'default', label: 'Default' }],
  },
];

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  playSoundMock.mockReset();
  requestNotificationPermissionMock.mockReset();
  showCompletionNotificationMock.mockReset();
  notificationPermissionMock.mockReset();
  fetchCodexPetsMock.mockReset();
  syncCommunityPetsMock.mockReset();
  fetchSkillsMock.mockReset();
  fetchDesignSystemsMock.mockReset();
  fetchSkillMock.mockReset();
  fetchDesignSystemMock.mockReset();
  notificationPermissionMock.mockReturnValue('default');
  fetchCodexPetsMock.mockResolvedValue({
    pets: [],
    rootDir: '/Users/test/.codex/pets',
  });
  syncCommunityPetsMock.mockResolvedValue({
    wrote: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    rootDir: '/Users/test/.codex/pets',
    errors: [],
  });
  fetchSkillsMock.mockResolvedValue([]);
  fetchDesignSystemsMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.restoreAllMocks();
});

describe('SettingsDialog scroll reset on section change (issue #634)', () => {
  // Repro: when the sidebar is scrolled near the bottom and the user opens
  // About, the content panel should land at the top and the active sidebar
  // item should remain visible. The component owns this guarantee through
  // an effect that resets contentRef scroll offsets and calls scrollIntoView
  // on the active .settings-nav-item.
  it('resets the content panel scroll position and scrolls the active nav item into view when switching to About', () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const { container } = render(
      <SettingsDialog
        initial={baseConfig}
        agents={availableAgents}
        daemonLive={true}
        appVersionInfo={null}
        initialSection="execution"
        onPersist={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onClose={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );

    const contentPanel = container.querySelector('.settings-content') as HTMLElement;
    expect(contentPanel).toBeTruthy();

    // Simulate the user scrolling the right content panel away from the top
    // before the section change happens, mirroring the issue repro.
    contentPanel.scrollTop = 800;
    contentPanel.scrollLeft = 50;

    scrollIntoViewMock.mockClear();

    const aboutNavItem = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.settings-nav-item'),
    ).find((btn) => btn.textContent?.includes('About'));
    expect(aboutNavItem).toBeTruthy();
    fireEvent.click(aboutNavItem!);

    expect(contentPanel.scrollTop).toBe(0);
    expect(contentPanel.scrollLeft).toBe(0);

    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(scrollIntoViewMock.mock.calls[0]![0]).toMatchObject({ block: 'nearest' });

    // The element on which scrollIntoView fired must be the now-active About
    // button, otherwise the sidebar would still risk leaving it out of view.
    const aboutInvocation = scrollIntoViewMock.mock.instances.find(
      (el) =>
        el instanceof HTMLElement &&
        el.classList.contains('settings-nav-item') &&
        el.classList.contains('active'),
    );
    expect(aboutInvocation).toBeTruthy();
    expect((aboutInvocation as HTMLElement).textContent).toMatch(/About/);
  });
});
