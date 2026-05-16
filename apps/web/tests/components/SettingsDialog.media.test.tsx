// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../../src/components/SettingsDialog';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AgentInfo, AppConfig } from '../../src/types';

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

  it('preserves local-only providers when daemon reload returns a partial provider set', async () => {
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
        mediaProviders: {
          openai: {
            apiKey: 'sk-local-openai',
            baseUrl: 'https://local-openai.example/v1',
          },
          fal: {
            apiKey: 'sk-local-fal',
            baseUrl: 'https://queue.fal.run',
            model: 'fal-ai/imagen4/preview',
          },
        },
      },
      {
        mediaProvidersNotice:
          'Could not load media provider settings from the local daemon. Using browser-saved settings for now.',
        onReloadMediaProviders: reloadMock,
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reload from daemon' }));

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Saved · ••••9876')).toBeTruthy();
      expect(screen.getByText('Reloaded media provider settings from the local daemon.')).toBeTruthy();
    });

    expect((screen.getByLabelText('OpenAI Base URL') as HTMLInputElement).value).toBe(
      'https://daemon.example/v1',
    );
    // Fal.ai is a non-integrated (coming-soon) provider and no longer has
    // editable input fields in the UI; its config is preserved in state via
    // mergeDaemonMediaProviders (covered by state/config.test.ts).
  });

  it('preserves saved media keys when clearing only a non-secret field', async () => {
    const onPersist = vi.fn();
    renderDialog(
      {
        ...saveableConfig(),
        mediaProviders: {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: 'https://custom.example/v1',
          },
        },
      },
      { onPersist },
    );

    fireEvent.change(screen.getByLabelText('OpenAI Base URL'), { target: { value: '' } });

    await waitFor(() => {
      expect(onPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaProviders: {
            openai: {
              apiKey: '',
              apiKeyConfigured: true,
              apiKeyTail: '1234',
              baseUrl: '',
            },
          },
        }),
        expect.objectContaining({ forceMediaProviderSync: true }),
      );
    });
  });

  it('clears saved media keys only through the explicit Clear action', async () => {
    const onPersist = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDialog(
      {
        ...saveableConfig(),
        mediaProviders: {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: 'https://custom.example/v1',
          },
        },
      },
      { onPersist },
    );

    const openaiRow = screen.getByText('OpenAI').closest('.media-provider-row') as HTMLElement | null;
    if (!openaiRow) throw new Error('Expected OpenAI media provider row');
    fireEvent.click(within(openaiRow).getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(onPersist).toHaveBeenCalledWith(
        expect.objectContaining({ mediaProviders: {} }),
        expect.objectContaining({ forceMediaProviderSync: true }),
      );
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});

function renderDialog(
  initial: AppConfig,
  options?: {
    mediaProvidersNotice?: string | null;
    onReloadMediaProviders?: () => Promise<AppConfig['mediaProviders'] | null>;
    onPersist?: (cfg: AppConfig, options?: { forceMediaProviderSync?: boolean }) => void;
  },
) {
  return render(
    <SettingsDialog
      initial={initial}
      agents={SAVEABLE_AGENTS}
      daemonLive
      appVersionInfo={null}
      initialSection="media"
      onPersist={options?.onPersist ?? vi.fn()}
      onPersistComposioKey={vi.fn()}
      onClose={vi.fn()}
      onRefreshAgents={vi.fn()}
      mediaProvidersNotice={options?.mediaProvidersNotice}
      onReloadMediaProviders={options?.onReloadMediaProviders}
    />,
  );
}

const SAVEABLE_AGENTS: AgentInfo[] = [
  {
    id: 'codex',
    name: 'Codex',
    bin: 'codex',
    available: true,
  },
];

function saveableConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    agentId: 'codex',
  };
}
