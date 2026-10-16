import { useT } from '../i18n';
import styles from './LabsSection.module.css';

export interface LabsAutosaveController {
  claim(): number;
  settle(claim: number, status: 'saved' | 'error' | 'idle'): void;
}
export interface LabsSectionProps { autosave?: LabsAutosaveController }

export function LabsSection(_props: LabsSectionProps) {
  const t = useT();
  return <section className="settings-section"><p className={styles.pageDesc}>{t('labs.pageDesc')}</p></section>;
}
