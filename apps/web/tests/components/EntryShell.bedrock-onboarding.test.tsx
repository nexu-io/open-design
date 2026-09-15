// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

import { OnboardingByokSetupPanel } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import { BEDROCK_REGION_PRESETS } from '../../src/state/config';
import type { BedrockAuthMode } from '../../src/types';
import { byokRequestCredentials } from '../../src/utils/byokProvider';

function renderPanel(overrides: { authMode?: BedrockAuthMode; baseUrl?: string; selectedPreset?: boolean } = {}) {
  const onAuthModeChange = vi.fn();
  const onSsoSignIn = vi.fn();
  const onTest = vi.fn();
  const preset = BEDROCK_REGION_PRESETS[0]!;
  const baseUrl = overrides.baseUrl ?? preset.baseUrl;
  render(
    <I18nProvider initial="en">
      <OnboardingByokSetupPanel
        apiProtocol="bedrock"
        apiKey=""
        baseUrl={baseUrl}
        model="global.anthropic.claude-sonnet-5"
        selectedProvider={overrides.selectedPreset === false ? null : preset}
        providerOptions={BEDROCK_REGION_PRESETS.map((p) => ({ value: p.baseUrl, label: p.label }))}
        modelOptions={[]}
        bedrock={{
          authMode: overrides.authMode ?? 'profile',
          profile: 'sandbox',
          onAuthModeChange,
          onProfileChange: vi.fn(),
          onSsoSignIn,
        }}
        apiKeyVisible={false}
        onToggleApiKey={vi.fn()}
        onProtocolChange={vi.fn()}
        onProviderChange={vi.fn()}
        onApiKeyChange={vi.fn()}
        onModelChange={vi.fn()}
        onBaseUrlChange={vi.fn()}
        testState={{ status: 'idle' }}
        canTest
        onTest={onTest}
        modelsState={{ status: 'idle' }}
        canFetchModels
        onFetchModels={vi.fn()}
      />
    </I18nProvider>,
  );
  return { onAuthModeChange, onSsoSignIn, onTest };
}

describe('OnboardingByokSetupPanel (Amazon Bedrock)', () => {
  it('shows the profile field and the SSO sign-in as a sibling of the label in profile mode, no key field', () => {
    const { onSsoSignIn } = renderPanel({ authMode: 'profile' });
    expect(screen.queryByLabelText('API key')).toBeNull();
    const profileInput = screen.getByLabelText('AWS profile name');
    expect(profileInput).toHaveValue('sandbox');
    const ssoButton = screen.getByTestId('onboarding-bedrock-sso-sign-in');
    // A label must wrap a single control: the sign-in button lives outside it.
    expect(ssoButton.closest('label')).toBeNull();
    fireEvent.click(ssoButton);
    expect(onSsoSignIn).toHaveBeenCalledTimes(1);
  });

  it('hides the base URL behind a regional preset and labels the picker as the AWS region', () => {
    renderPanel({ selectedPreset: true });
    expect(screen.getByText('AWS Region')).toBeInTheDocument();
    expect(screen.queryByLabelText('Base URL')).toBeNull();
  });

  it('shows the base URL for a custom endpoint', () => {
    renderPanel({ selectedPreset: false, baseUrl: 'https://bedrock-runtime.eu-west-1.vpce-0abc.amazonaws.com' });
    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
  });

  it('switches auth mode through the segmented control', () => {
    const { onAuthModeChange } = renderPanel({ authMode: 'api_key' });
    fireEvent.click(screen.getByRole('button', { name: 'AWS profile' }));
    expect(onAuthModeChange).toHaveBeenCalledWith('profile');
  });
});

describe('byokRequestCredentials', () => {
  const bedrockProfile = { apiProtocol: 'bedrock' as const, awsAuthMode: 'profile' as const, awsProfile: ' sandbox ' };

  it('drops the key and sends the profile in Bedrock profile mode', () => {
    expect(byokRequestCredentials(bedrockProfile, 'ABSKleftover')).toEqual({ apiKey: '', awsProfile: 'sandbox' });
  });

  it('only sets the SSO sign-in flag when the caller asks for it explicitly', () => {
    expect(byokRequestCredentials(bedrockProfile, '', { awsSsoLogin: true })).toEqual({
      apiKey: '',
      awsProfile: 'sandbox',
      awsSsoLogin: true,
    });
    expect(byokRequestCredentials(bedrockProfile, '', { awsSsoLogin: false })).not.toHaveProperty('awsSsoLogin');
  });

  it('passes the key through for every other configuration', () => {
    expect(byokRequestCredentials({ apiProtocol: 'bedrock', awsAuthMode: 'api_key' }, 'ABSK')).toEqual({ apiKey: 'ABSK' });
    expect(byokRequestCredentials({ apiProtocol: 'anthropic', awsAuthMode: 'profile', awsProfile: 'x' }, 'sk')).toEqual({ apiKey: 'sk' });
  });
});