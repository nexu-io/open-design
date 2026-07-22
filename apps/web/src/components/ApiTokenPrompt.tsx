import { useRef, useState } from 'react';
import { useT } from '../i18n';

interface Props {
  onSubmit: (token: string) => void;
  submitting?: boolean;
  error?: string;
}

export function ApiTokenPrompt({ onSubmit, submitting, error }: Props): JSX.Element {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = inputRef.current?.value.trim();
    if (token) {
      onSubmit(token);
    }
  };

  return (
    <div className="entry-shell entry-shell--no-header">
      <div className="centered-loader" style={{ flexDirection: 'column', gap: 24, maxWidth: 440, margin: '0 auto', textAlign: 'center' }}>
        <span className="centered-loader-label" style={{ fontSize: 18, fontWeight: 600 }}>
          {t('apiTokenPrompt.title')}
        </span>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          {t('apiTokenPrompt.description')}
        </p>
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              ref={inputRef}
              type={showToken ? 'text' : 'password'}
              autoComplete="off"
              placeholder={t('apiTokenPrompt.placeholder')}
              style={{
                width: '100%',
                padding: '10px 14px',
                paddingRight: 44,
                fontSize: 14,
                borderRadius: 8,
                border: error ? '1px solid var(--error-primary)' : '1px solid var(--border-primary)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              title={showToken ? t('apiTokenPrompt.hideKey') : t('apiTokenPrompt.showKey')}
              style={{
                position: 'absolute',
                right: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                fontSize: 13,
                padding: '4px 6px',
                borderRadius: 4,
                lineHeight: 1,
              }}
            >
              {showToken ? t('apiTokenPrompt.hideKey') : t('apiTokenPrompt.showKey')}
            </button>
          </div>
          {error && (
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: 'var(--error-primary)', textAlign: 'left' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className="action-btn"
            style={{ alignSelf: 'center' }}
            disabled={submitting}
          >
            {submitting ? t('apiTokenPrompt.verifyingLabel') : t('apiTokenPrompt.submitLabel')}
          </button>
        </form>
      </div>
    </div>
  );
}
