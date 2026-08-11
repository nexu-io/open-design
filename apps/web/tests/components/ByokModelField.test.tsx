// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ByokModelField } from '../../src/components/byok/ByokModelField';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const labels = {
  customModel: 'Custom model',
  customModelLabel: 'Custom model id',
  customModelPlaceholder: 'Deployment name',
  fetchModelsUnsupported: 'Fetch models is unavailable.',
  model: 'Deployment name',
  required: 'Required',
  searchPlaceholder: 'Search models',
  suggestedModelsHint: 'Suggested models are shown.',
};

describe('ByokModelField', () => {
  it('keeps direct deployment input feedback visible', () => {
    const onCustomModelChange = vi.fn();

    render(
      <ByokModelField
        customActive={false}
        customInputRef={null}
        labels={labels}
        model="deployment-one"
        modelSelectRef={null}
        models={[{ id: 'suggested-model', label: 'Suggested model' }]}
        modelsLoadedFromAccountMessage="Loaded 1 model from your account."
        providerModelsFailureMessage="Provider models could not be loaded."
        forceTextInput
        showAzureModelFetchHint={false}
        showFetchModelsUnsupportedHint={false}
        showSuggestedModelsHint={false}
        azureModelFetchHint="Enter a deployment name."
        onCustomModelChange={onCustomModelChange}
        onCustomModelSelect={vi.fn()}
        onFocus={vi.fn()}
        onModelSelect={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Deployment name')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Deployment name' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Loaded 1 model');
    expect(screen.getByRole('alert').textContent).toContain('Provider models');

    fireEvent.change(screen.getByLabelText('Deployment name'), {
      target: { value: 'deployment-two' },
    });

    expect(onCustomModelChange).toHaveBeenCalledWith('deployment-two');
  });
});
