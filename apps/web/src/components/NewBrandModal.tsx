import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { useT } from '../i18n';
import { useBrandExtract } from '../runtime/useBrandExtract';
import type { BrandReference } from '../runtime/brand-references';
import { BrandReferencePicker } from './BrandReferencePicker';
import styles from './NewBrandModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fires once the extraction project is created; the parent navigates into
   *  it (with auto-send) so the agent runs the extraction live. */
  onCreated: (brandId: string, projectId: string, conversationId: string) => void;
}

export function NewBrandModal({ open, onClose, onCreated }: Props) {
  const t = useT();
  const { state, run, reset } = useBrandExtract();
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const starting = state.phase === 'starting';
  const failed = state.phase === 'error';

  // Reset the form each time the modal opens fresh; focus the URL field.
  useEffect(() => {
    if (open) {
      setUrl('');
      reset();
      const id = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open, reset]);

  // On a successful kickoff, hand the ids up so the parent opens the project.
  useEffect(() => {
    if (state.phase === 'done' && state.brandId && state.projectId && state.conversationId) {
      onCreated(state.brandId, state.projectId, state.conversationId);
    }
  }, [state.phase, state.brandId, state.projectId, state.conversationId, onCreated]);

  const handleClose = useCallback(() => {
    if (starting) return; // don't dismiss mid-kickoff
    reset();
    onClose();
  }, [starting, reset, onClose]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed || starting) return;
      void run(trimmed);
    },
    [url, starting, run],
  );

  // Picking a reference brand fills the URL field for visible feedback and
  // immediately kicks off extraction against that domain.
  const handlePick = useCallback(
    (brand: BrandReference) => {
      if (starting) return;
      setUrl(brand.domain);
      void run(brand.domain);
    },
    [starting, run],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('newBrand.title')}
        data-testid="new-brand-modal"
      >
        <header className={styles.head}>
          <h2 className={styles.title}>{t('newBrand.title')}</h2>
          <p className={styles.subtitle}>{t('newBrand.subtitle')}</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>{t('newBrand.urlLabel')}</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              autoComplete="url"
              className={styles.input}
              placeholder={t('newBrand.urlPlaceholder')}
              value={url}
              disabled={starting}
              onChange={(e) => setUrl(e.target.value)}
              data-testid="new-brand-url"
            />
          </label>

          {failed ? (
            <p className={styles.errorLine} role="alert">
              {state.error ?? t('brand.failed')}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={handleClose} disabled={starting}>
              {t('newBrand.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={starting || url.trim().length === 0}
              data-testid="new-brand-extract"
            >
              {starting ? t('brand.extracting') : t('newBrand.extract')}
            </Button>
          </div>
        </form>

        <div className={styles.pickerWrap}>
          <BrandReferencePicker
            variant="compact"
            fillHeight
            busy={starting}
            error={failed ? state.error ?? t('brand.failed') : null}
            onPick={handlePick}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
