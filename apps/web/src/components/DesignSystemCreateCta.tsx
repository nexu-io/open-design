import { Icon } from './Icon';
import { useT } from '../i18n';
import styles from './DesignSystemCreateCta.module.css';

// Empty-state CTA shown in the chat column when the project carries an active
// design system. It surfaces the "build something new with this system" action
// right next to the conversation, mirroring the right-hand panel's "Create new
// design" button so the entry point is discoverable from both surfaces. The
// click runs the same canonical create-from-design-system flow.
export function DesignSystemCreateCta({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <div className={styles.card} role="note" data-testid="ds-create-design-cta">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden>
          <Icon name="palette" size={18} />
        </span>
        <span className={styles.copy}>
          <span className={styles.title}>{t('chat.createDesignFromSystemTitle')}</span>
          <span className={styles.text}>{t('chat.createDesignFromSystemBody')}</span>
        </span>
      </div>
      <button type="button" className={styles.cta} onClick={onCreate}>
        <Icon name="plus" size={13} />
        {t('chat.createDesignFromSystemCta')}
      </button>
    </div>
  );
}
