import { useT } from '../i18n';
import { LABS_EXPERIMENTS } from './labs-experiments';
import type { LabsExperiment, LabsExperimentProps } from './labs-experiments';
import styles from './LabsSection.module.css';

export type { LabsAutosaveController } from './labs-experiments';

export interface LabsSectionProps extends LabsExperimentProps {
  experiments?: readonly LabsExperiment[];
}

export function LabsSection({ experiments = LABS_EXPERIMENTS, autosave }: LabsSectionProps) {
  const t = useT();
  if (experiments.length === 0) return null;
  return (
    <section className="settings-section">
      <p className={styles.pageDesc}>{t('labs.pageDesc')}</p>
      {experiments.map(({ id, Component }) => <Component key={id} autosave={autosave} />)}
    </section>
  );
}
