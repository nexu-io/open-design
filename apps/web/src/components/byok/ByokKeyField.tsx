import { useState, type Ref } from 'react';
import { API_KEY_PLACEHOLDERS } from '../../state/apiProtocols';
import type { ApiProtocol } from '../../types';
import { cleanByokApiKey } from './validation';

interface ByokKeyFieldProps {
  apiKey: string;
  apiKeyConsoleLink: { host: string; url: string };
  apiProtocol: ApiProtocol;
  inputRef: Ref<HTMLInputElement>;
  labels: {
    apiHint: string;
    apiKeyCleaned: string;
    apiKey: string;
    apiKeyGetLink: string;
    apiKeyInvalid: string;
    hide: string;
    hideKey: string;
    required: string;
    show: string;
    showKey: string;
  };
  requiresApiKey: boolean;
  showApiKeyInvalid: boolean;
  showApiKey: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
  onFocus: () => void;
  onToggleShowApiKey: () => void;
}

export function ByokKeyField({
  apiKey,
  apiKeyConsoleLink,
  apiProtocol,
  inputRef,
  labels,
  requiresApiKey,
  showApiKeyInvalid,
  showApiKey,
  onBlur,
  onChange,
  onFocus,
  onToggleShowApiKey,
}: ByokKeyFieldProps) {
  const [apiKeyCleanedNotice, setApiKeyCleanedNotice] = useState(false);
  const fieldClassName =
    requiresApiKey && !apiKey.trim()
      ? 'field settings-byok-required-empty'
      : 'field';
  const handleChange = (value: string) => {
    setApiKeyCleanedNotice(false);
    onChange(value);
  };
  const handleBlur = () => {
    setApiKeyCleanedNotice(cleanByokApiKey(apiKey) !== apiKey);
    onBlur();
  };

  return (
    <label className={fieldClassName}>
      <span className="field-label-row">
        <span className="field-label settings-byok-key-label">
          {labels.apiKey}
          {requiresApiKey ? (
            <span className="field-required" aria-label={labels.required}>
              *
            </span>
          ) : null}
          {showApiKeyInvalid ? (
            <span className="field-label-error" role="alert">
              {labels.apiKeyInvalid}
            </span>
          ) : null}
        </span>
        {requiresApiKey ? (
          <a
            className="field-label-link"
            href={apiKeyConsoleLink.url}
            target="_blank"
            rel="noreferrer"
          >
            {labels.apiKeyGetLink}
          </a>
        ) : null}
      </span>
      <div className="field-row">
        <input
          ref={inputRef}
          aria-label={labels.apiKey}
          type={showApiKey ? 'text' : 'password'}
          placeholder={API_KEY_PLACEHOLDERS[apiProtocol]}
          value={apiKey}
          aria-invalid={showApiKeyInvalid || undefined}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onFocus={onFocus}
          autoFocus
        />
        <button
          type="button"
          className="ghost icon-btn"
          onClick={onToggleShowApiKey}
          title={
            showApiKey ? labels.hideKey : labels.showKey
          }
        >
          {showApiKey ? labels.hide : labels.show}
        </button>
      </div>
      {apiKeyCleanedNotice && !showApiKeyInvalid ? (
        <span className="field-inline-status success" role="status">
          {labels.apiKeyCleaned}
        </span>
      ) : null}
      <span className="field-inline-status">
        {labels.apiHint}
      </span>
    </label>
  );
}
