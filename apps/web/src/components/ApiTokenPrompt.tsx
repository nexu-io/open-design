import { useRef } from 'react';
import { useT } from '../i18n';

interface Props {
  onSubmit: (token: string) => void;
}

export function ApiTokenPrompt({ onSubmit }: Props): JSX.Element {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

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
          <input
            ref={inputRef}
            type="password"
            autoComplete="off"
            placeholder={t('apiTokenPrompt.placeholder')}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 14,
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
          <button
            type="submit"
            className="action-btn"
            style={{ alignSelf: 'center' }}
          >
            {t('common.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
