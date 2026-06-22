import type { ReactNode } from 'react';

import { Icon } from './Icon';

export function RunFailurePanel({
  title,
  description,
  rawError,
  rawLabel,
  expandLabel,
  collapseLabel,
  copyLabel,
  copiedLabel,
  tone = 'error',
  copied,
  rawExpanded,
  onRawExpandedChange,
  onCopy,
  children,
}: {
  title: string;
  description: string;
  rawError: string;
  rawLabel: string;
  expandLabel: string;
  collapseLabel: string;
  copyLabel: string;
  copiedLabel: string;
  tone?: 'error' | 'brand';
  copied: boolean;
  rawExpanded: boolean;
  onRawExpandedChange: (expanded: boolean) => void;
  onCopy: () => void;
  children?: ReactNode;
}) {
  const source = rawError.trim();
  const sourcePeek = source.split('\n').find((line) => line.trim().length > 0)?.trim() ?? null;
  const copyTitle = copied ? copiedLabel : copyLabel;

  return (
    <section className="run-error" data-tone={tone} aria-live="polite">
      <div className="run-error__main">
        <span className="run-error__icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 4.5v4M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <div className="run-error__copy">
          <p className="run-error__title">{title}</p>
          <p className="run-error__desc">{description}</p>
          {children ? (
            <div className="run-error__actions">{children}</div>
          ) : null}
        </div>
      </div>
      <div className={`run-error__source${rawExpanded ? ' is-open' : ''}`}>
        <div className="run-error__source-head">
          <button
            type="button"
            className="run-error__source-bar"
            onClick={() => onRawExpandedChange(!rawExpanded)}
            aria-expanded={rawExpanded}
            aria-label={rawExpanded ? collapseLabel : expandLabel}
          >
            <svg className="run-error__source-chevron" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="run-error__source-label">{rawLabel}</span>
            {sourcePeek ? (
              <span className="run-error__source-peek">{sourcePeek}</span>
            ) : null}
          </button>
          <button
            type="button"
            className="run-error__source-copy"
            onClick={onCopy}
            aria-label={copyTitle}
            title={copyTitle}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
          </button>
        </div>
        <div className="run-error__source-full">
          <pre>{source}</pre>
        </div>
      </div>
    </section>
  );
}
