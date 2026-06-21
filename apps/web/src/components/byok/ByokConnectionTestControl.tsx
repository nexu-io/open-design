import type { ConnectionTestResponse } from '../../types';
import { Icon } from '../Icon';

type ByokProviderTestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: ConnectionTestResponse };

interface ByokConnectionTestControlProps {
  baseUrlValid: boolean;
  canRunConnectionTest: boolean;
  labels: {
    readyToTest: string;
    test: string;
    testRetry: string;
    testRunning: string;
    testTitle: string;
  };
  providerTestState: ByokProviderTestState;
  renderTestMessage: (result: ConnectionTestResponse) => string;
  suppressResultStatus?: boolean;
  suppressReadyState?: boolean;
  onTestProvider: () => void | Promise<void>;
}

export function ByokConnectionTestControl({
  baseUrlValid,
  canRunConnectionTest,
  labels,
  providerTestState,
  renderTestMessage,
  suppressResultStatus = false,
  suppressReadyState = false,
  onTestProvider,
}: ByokConnectionTestControlProps) {
  const showTestButton = canRunConnectionTest && baseUrlValid;
  const showReadyState = showTestButton && !suppressReadyState;
  const showResultStatus =
    providerTestState.status === 'done' && !suppressResultStatus;
  const showStatus =
    providerTestState.status === 'running' || showResultStatus || showReadyState;
  if (!showTestButton && !showStatus) return null;

  return (
    <div className="settings-byok-connection-test">
      <div className="settings-byok-connection-test-status">
        {providerTestState.status === 'running' ? (
          <span
            className="field-inline-status running"
            role="status"
            aria-live="polite"
          >
            {labels.testRunning}
          </span>
        ) : showResultStatus && providerTestState.status === 'done' ? (
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
        ) : showReadyState ? (
          <span
            className="field-inline-status settings-byok-ready"
            role="status"
          >
            {labels.readyToTest}
          </span>
        ) : null}
      </div>
      {showTestButton ? (
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
    </div>
  );
}
