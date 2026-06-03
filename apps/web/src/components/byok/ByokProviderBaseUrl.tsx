import type { Ref } from 'react';
import type { ApiProtocol } from '../../types';

interface ByokProviderBaseUrlProps {
  apiProtocol: ApiProtocol;
  inputRef: Ref<HTMLInputElement>;
  baseUrl: string;
  baseUrlInvalid: boolean;
  baseUrlPlaceholder?: string;
  baseUrlReadOnly: boolean;
  labels: {
    baseUrl: string;
    required: string;
    customize: string;
    invalid: string;
    defaultHint: string;
    azureHint: string;
  };
  onBlur: () => void;
  onChange: (value: string) => void;
  onCustomize: () => void;
  onFocus: () => void;
}

export function ByokProviderBaseUrl({
  apiProtocol,
  inputRef,
  baseUrl,
  baseUrlInvalid,
  baseUrlPlaceholder,
  baseUrlReadOnly,
  labels,
  onBlur,
  onChange,
  onCustomize,
  onFocus,
}: ByokProviderBaseUrlProps) {
  return (
    <label className={'field' + (baseUrlReadOnly ? ' settings-base-url-readonly' : '')}>
      <span className="field-label">
        {labels.baseUrl}
        <span className="field-required" aria-label={labels.required}>
          *
        </span>
      </span>
      <div className="field-row">
        <input
          ref={inputRef}
          aria-label={labels.baseUrl}
          type="url"
          inputMode="url"
          value={baseUrl}
          placeholder={baseUrlPlaceholder}
          readOnly={baseUrlReadOnly || undefined}
          aria-invalid={baseUrlInvalid || undefined}
          aria-describedby={
            baseUrlInvalid ? 'settings-base-url-error' : undefined
          }
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
        />
        {baseUrlReadOnly ? (
          <button
            type="button"
            className="ghost icon-btn settings-base-url-customize"
            onClick={onCustomize}
          >
            {labels.customize}
          </button>
        ) : null}
      </div>
      {baseUrlInvalid ? (
        <span
          id="settings-base-url-error"
          className="settings-field-error"
          role="alert"
        >
          {labels.invalid}
        </span>
      ) : null}
      {baseUrlReadOnly ? (
        <span className="field-inline-status">
          {labels.defaultHint}
        </span>
      ) : null}
      {apiProtocol === 'azure' ? (
        <span className="field-inline-status">
          {labels.azureHint}
        </span>
      ) : null}
    </label>
  );
}
