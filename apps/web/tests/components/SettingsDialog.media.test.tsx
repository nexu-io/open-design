// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../../src/components/SettingsDialog';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AppConfig } from '../../src/types';

describe('SettingsDialog media providers', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows saved masked media provider keys like Composio does', () => {
    renderDialog({
      ...DEFAULT_CONFIG,
      mediaProviders: {
        openai: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: '1234',
          baseUrl: '',
        },
      },
    });

    expect(screen.getByText('Saved · ••••1234')).toBeTruthy();
    expect(screen.getByLabelText('OpenAI API key').getAttribute('placeholder')).toBe(
      'Paste a new key to replace the saved one',
    );
  });

  it('shows daemon fallback notice and reloads media providers from daemon', async () => {
    const reloadMock = vi.fn(async () => ({
      openai: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '9876',
        baseUrl: 'https://daemon.example/v1',
      },
    }));
    renderDialog(
      {
        ...DEFAULT_CONFIG,
        mediaProviders: {},
      },
      {
        mediaProvidersNotice:
          'Could not load media provider settings from the local daemon. Using browser-saved settings for now.',
        onReloadMediaProviders: reloadMock,
      },
    );

    expect(
      screen.getByText(
        'Could not load media provider settings from the local daemon. Using browser-saved settings for now.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reload from daemon' }));

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Saved · ••••9876')).toBeTruthy();
      expect(screen.getByText('Reloaded media provider settings from the local daemon.')).toBeTruthy();
    });

    expect((screen.getByLabelText('OpenAI Base URL') as HTMLInputElement).value).toBe(
      'https://daemon.example/v1',
    );
  });
});

function renderDialog(
  initial: AppConfig,
  options?: {
    mediaProvidersNotice?: string | null;
    onReloadMediaProviders?: () => Promise<AppConfig['mediaProviders'] | null>;
  },
) {
  return render(
    <SettingsDialog
      initial={initial}
      agents={[]}
      daemonLive
      appVersionInfo={null}
      initialSection="media"
      onSave={vi.fn()}
      onClose={vi.fn()}
      onRefreshAgents={vi.fn()}
      mediaProvidersNotice={options?.mediaProvidersNotice}
      onReloadMediaProviders={options?.onReloadMediaProviders}
    />,
  );
}
