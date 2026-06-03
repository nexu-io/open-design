import { useMemo, useState, type Ref } from 'react';
import { API_KEY_PLACEHOLDERS } from '../../state/apiProtocols';
import type { ApiProtocol, ConnectionTestResponse } from '../../types';
import { Icon } from '../Icon';
import {
  cleanByokApiKey,
  type ByokDraftIssue,
  type ByokDraftValidation,
} from './validation';

type ByokProviderTestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: ConnectionTestResponse };

interface ByokKeyFieldProps {
  apiKey: string;
  apiKeyAuthFailed: boolean;
  apiKeyConsoleLink: { host: string; url: string };
  apiProtocol: ApiProtocol;
  baseUrlValid: boolean;
  canRunConnectionTest: boolean;
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
    test: string;
    testRetry: string;
    testRunning: string;
    testTitle: string;
  };
  providerTestState: ByokProviderTestState;
  draftValidation: ByokDraftValidation;
  renderTestMessage: (result: ConnectionTestResponse) => string;
  requiresApiKey: boolean;
  showApiKey: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
  onFocus: () => void;
  onTestProvider: () => void | Promise<void>;
  onToggleShowApiKey: () => void;
}

export function ByokKeyField({
  apiKey,
  apiKeyAuthFailed,
  apiKeyConsoleLink,
  apiProtocol,
  baseUrlValid,
  canRunConnectionTest,
  inputRef,
  labels,
  providerTestState,
  draftValidation,
  renderTestMessage,
  requiresApiKey,
  showApiKey,
  onBlur,
  onChange,
  onFocus,
  onTestProvider,
  onToggleShowApiKey,
}: ByokKeyFieldProps) {
  const [apiKeyCleanedNotice, setApiKeyCleanedNotice] = useState(false);
  const apiKeyDraftIssue = useMemo(
    () => firstApiKeyDraftIssue(draftValidation),
    [draftValidation],
  );
  const apiKeyErrorMessage = apiKeyDraftIssue
    ? apiKeyDraftIssue.message || labels.apiKeyInvalid
    : apiKeyAuthFailed && providerTestState.status === 'idle'
      ? labels.apiKeyInvalid
      : null;
  const handleChange = (value: string) => {
    setApiKeyCleanedNotice(false);
    onChange(value);
  };
  const handleBlur = () => {
    const cleaned = cleanByokApiKey(apiKey);
    if (cleaned !== apiKey) {
      setApiKeyCleanedNotice(Boolean(cleaned));
      onChange(cleaned);
    }
    onBlur();
  };

  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">
          {labels.apiKey}
          {requiresApiKey ? (
            <span className="field-required" aria-label={labels.required}>
              *
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
          aria-invalid={apiKeyDraftIssue ? 'true' : undefined}
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
      {apiKeyErrorMessage ? (
        <span className="field-error" role="alert">
          {apiKeyErrorMessage}
        </span>
      ) : null}
      {apiKeyCleanedNotice && !apiKeyErrorMessage ? (
        <span className="field-inline-status success" role="status">
          {labels.apiKeyCleaned}
        </span>
      ) : null}
      {providerTestState.status === 'running' ? (
        <span
          className="field-inline-status running"
          role="status"
          aria-live="polite"
        >
          {labels.testRunning}
        </span>
      ) : providerTestState.status === 'done' ? (
        <span
          className={
            providerTestState.result.ok
              ? 'field-inline-status success'
              : 'field-error'
          }
          role={providerTestState.result.ok ? 'status' : 'alert'}
        >
          {renderTestMessage(providerTestState.result)}
        </span>
      ) : null}
      <span className="field-inline-status">
        {labels.apiHint}
      </span>
      {canRunConnectionTest && baseUrlValid ? (
        <button
          type="button"
          className={
            'ghost icon-btn settings-test-btn' +
            (providerTestState.status === 'running' ? ' loading' : '')
          }
          onClick={() => void onTestProvider()}
          disabled={providerTestState.status === 'running'}
          title={labels.testTitle}
        >
          {providerTestState.status === 'running' ? (
            <>
              <Icon
                name="spinner"
                size={13}
                className="icon-spin"
              />
              <span>{labels.test}</span>
            </>
          ) : providerTestState.status === 'done' &&
            !providerTestState.result.ok ? (
            <>
              <Icon name="reload" size={13} />
              <span>{labels.testRetry}</span>
            </>
          ) : (
            labels.test
          )}
        </button>
      ) : null}
    </label>
  );
}

function firstApiKeyDraftIssue(
  draftValidation: ByokDraftValidation,
): ByokDraftIssue | null {
  return draftValidation.issues.find(
    (issue) =>
      issue.field === 'api_key' &&
      issue.level === 'error' &&
      (
        issue.code === 'api_key_malformed' ||
        issue.code === 'api_key_wrong_protocol'
      ),
  ) ?? null;
}
