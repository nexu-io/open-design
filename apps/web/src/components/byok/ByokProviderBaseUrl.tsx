import type { Ref } from 'react';
import type { ApiProtocol } from '../../types';

interface ByokProviderBaseUrlProps {
  apiProtocol: ApiProtocol;
  inputRef: Ref<HTMLInputElement>;
  baseUrl: string;
  baseUrlError: string | null;
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
  baseUrlError,
  baseUrlInvalid,
  baseUrlPlaceholder,
  baseUrlReadOnly,
  labels,
  onBlur,
  onChange,
  onCustomize,
  onFocus,
}: ByokProviderBaseUrlProps) {
  const stateClassName = baseUrlReadOnly
    ? ' settings-base-url-readonly'
    : baseUrl.trim()
      ? ''
      : ' settings-base-url-empty';
  const hasBaseUrlError = baseUrlInvalid || Boolean(baseUrlError);

  return (
    <label className={'field' + stateClassName}>
      <span className="field-label settings-byok-field-label">
        {labels.baseUrl}
        <span className="field-required" aria-label={labels.required}>
          *
        </span>
        {baseUrlError ? (
          <span
            id="settings-base-url-error"
            className="field-label-error"
            role="alert"
          >
            {baseUrlError}
          </span>
        ) : null}
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
          aria-invalid={hasBaseUrlError || undefined}
          aria-describedby={
            hasBaseUrlError ? 'settings-base-url-error' : undefined
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
