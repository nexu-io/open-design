import type { Ref } from 'react';
import type { AgentModelOption } from '../../types';
import {
  CUSTOM_MODEL_SENTINEL,
  SearchableModelSelect,
} from '../modelOptions';

interface ByokModelFieldProps {
  customActive: boolean;
  customInputRef: Ref<HTMLInputElement>;
  labels: {
    customModel: string;
    customModelLabel: string;
    customModelPlaceholder: string;
    fetchModelsUnsupported: string;
    model: string;
    required: string;
    searchPlaceholder: string;
    suggestedModelsHint: string;
  };
  model: string;
  modelSelectRef: Ref<HTMLButtonElement>;
  models: AgentModelOption[];
  modelsLoadedFromAccountMessage: string | null;
  providerModelsFailureMessage: string | null;
  showAzureModelFetchHint: boolean;
  showFetchModelsUnsupportedHint: boolean;
  showSuggestedModelsHint: boolean;
  azureModelFetchHint: string;
  onCustomModelChange: (value: string) => void;
  onCustomModelSelect: () => void;
  onFocus: () => void;
  onModelSelect: (value: string) => void;
}

export function ByokModelField({
  customActive,
  customInputRef,
  labels,
  model,
  modelSelectRef,
  models,
  modelsLoadedFromAccountMessage,
  providerModelsFailureMessage,
  showAzureModelFetchHint,
  showFetchModelsUnsupportedHint,
  showSuggestedModelsHint,
  azureModelFetchHint,
  onCustomModelChange,
  onCustomModelSelect,
  onFocus,
  onModelSelect,
}: ByokModelFieldProps) {
  const selectValue = customActive
    ? CUSTOM_MODEL_SENTINEL
    : model;

  return (
    <>
      <label className="field">
        <span className="field-label">
          {labels.model}
          <span className="field-required" aria-label={labels.required}>
            *
          </span>
        </span>
        <SearchableModelSelect
          ref={modelSelectRef}
          className="inline-switcher__select settings-model-select settings-model-select--byok"
          aria-label={labels.model}
          searchPlaceholder={labels.searchPlaceholder}
          searchInputTestId="settings-byok-model-search"
          popoverTestId="settings-byok-model-popover"
          popoverClassName="settings-byok-select-popover"
          models={models}
          value={selectValue}
          onFocus={onFocus}
          onChange={(nextValue) => {
            if (nextValue === CUSTOM_MODEL_SENTINEL) {
              onCustomModelSelect();
            } else {
              onModelSelect(nextValue);
            }
          }}
          additionalOptions={[
            {
              value: CUSTOM_MODEL_SENTINEL,
              label: labels.customModel,
            },
          ]}
        />
        {modelsLoadedFromAccountMessage ? (
          <span className="field-inline-status success" role="status">
            {modelsLoadedFromAccountMessage}
          </span>
        ) : null}
        {providerModelsFailureMessage ? (
          <span className="field-error" role="alert">
            {providerModelsFailureMessage}
          </span>
        ) : null}
      </label>
      {showSuggestedModelsHint ? (
        <p className="hint">{labels.suggestedModelsHint}</p>
      ) : null}
      {customActive ? (
        <label className={'field' + (model.trim() ? '' : ' settings-byok-required-empty')}>
          <span className="field-label">
            {labels.customModelLabel}
            <span className="field-required" aria-label={labels.required}>
              *
            </span>
          </span>
          <input
            ref={customInputRef}
            aria-label={labels.customModelLabel}
            type="text"
            value={model}
            placeholder={labels.customModelPlaceholder}
            onChange={(e) => onCustomModelChange(e.target.value.trim())}
          />
        </label>
      ) : null}
      {showAzureModelFetchHint ? (
        <p className="hint">{azureModelFetchHint}</p>
      ) : null}
      {showFetchModelsUnsupportedHint ? (
        <p className="hint">{labels.fetchModelsUnsupported}</p>
      ) : null}
    </>
  );
}
