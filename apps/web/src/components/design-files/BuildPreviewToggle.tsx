import { useT } from '../../i18n';
import styles from './BuildPreviewToggle.module.css';

interface Props {
  /** True while the pane is showing the page the run is building. */
  checked: boolean;
  onChange: (next: boolean) => void;
}

/**
 * The pane's one build-preview control: on, the pane is the page taking shape
 * under a cursor that points at the part being written; off, it is the plain
 * file grid.
 *
 * It replaces the "show files" button that used to float on top of the
 * rendered page. A button could only ever go one way — once the preview was
 * dismissed the run had no way back to it — and it sat ON the artifact it was
 * about. A switch says both directions in one control, and it lives in the
 * topbar with the other file actions, clear of the page underneath.
 */
export function BuildPreviewToggle({ checked, onChange }: Props) {
  const t = useT();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.toggle}
      data-testid="design-files-preview-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className={styles.track} aria-hidden>
        <span className={styles.knob} />
      </span>
      <span>{t('designFiles.buildingPreview')}</span>
    </button>
  );
}
