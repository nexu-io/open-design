import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { Icon } from './Icon';
import styles from './FigmaHelpModal.module.css';

export function FigmaHelpModal({ onClose }: { onClose: () => void }) {
  const t = useT();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="figma-help-title">
        <header className={styles.head}>
          <h2 id="figma-help-title" className={styles.title}>
            {t('chat.figmaHelp.title')}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className={styles.body}>
          <p>{t('chat.figmaHelp.intro')}</p>
          <ol className={styles.steps}>
            <li>{t('chat.figmaHelp.step1')}</li>
            <li>{t('chat.figmaHelp.step2')}</li>
            <li>{t('chat.figmaHelp.step3')}</li>
          </ol>
          <p className={styles.note}>{t('chat.figmaHelp.note')}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
