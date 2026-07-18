// Pluggable-hooks panel — the toggles that wire the two-loop memory hooks to
// `PATCH /api/memory/config`. The master `enabled` switch (owned by the parent
// section header) kills everything; these toggle the individual hooks while
// memory stays on:
//   - chatExtractionEnabled — sediment new facts from chat turns.
//   - profileEnabled        — inject the structured profile into the prompt.
//   - rewriteEnabled        — PRE: expand a short query into a task-brief card.
//   - verifyEnabled         — POST: self-verify against rules + emit scorecard.
//
// State lives in the parent (MemorySection) so optimistic-set + rollback can
// share the reload() / SSE wiring; this panel is presentational and calls the
// passed toggle callbacks.
import { Icon, type IconName } from './Icon';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import styles from './MemoryHooksPanel.module.css';

export type MemoryHookKey =
  | 'profileEnabled'
  | 'rewriteEnabled'
  | 'verifyEnabled'
  | 'chatExtractionEnabled';

interface HookDef {
  key: MemoryHookKey;
  icon: IconName;
  labelKey: keyof Dict;
  descKey: keyof Dict;
}

const HOOKS: ReadonlyArray<HookDef> = [
  {
    key: 'profileEnabled',
    icon: 'home',
    labelKey: 'settings.memoryHooksProfileLabel',
    descKey: 'settings.memoryHooksProfileDesc',
  },
  {
    key: 'rewriteEnabled',
    icon: 'sparkles',
    labelKey: 'settings.memoryHooksRewriteLabel',
    descKey: 'settings.memoryHooksRewriteDesc',
  },
  {
    key: 'verifyEnabled',
    icon: 'check',
    labelKey: 'settings.memoryHooksVerifyLabel',
    descKey: 'settings.memoryHooksVerifyDesc',
  },
  {
    key: 'chatExtractionEnabled',
    icon: 'history',
    labelKey: 'settings.memoryHooksExtractionLabel',
    descKey: 'settings.memoryHooksExtractionDesc',
  },
];

export function MemoryHooksPanel({
  enabled,
  flags,
  onToggle,
}: {
  /** Master memory switch — when off, every hook toggle is disabled. */
  enabled: boolean;
  flags: Record<MemoryHookKey, boolean>;
  onToggle: (key: MemoryHookKey, next: boolean) => void;
}) {
  const t = useT();
  return (
    <div className={styles.panel} data-testid="memory-hooks-panel">
      <div className={styles.head}>
        <span className={styles.headIcon} aria-hidden>
          <Icon name="sliders" size={15} />
        </span>
        <div>
          <h4 className={styles.title}>{t('settings.memoryHooksTitle')}</h4>
          <p className={styles.hint}>{t('settings.memoryHooksHint')}</p>
        </div>
      </div>
      <ul className={styles.list}>
        {HOOKS.map((hook) => (
          <li key={hook.key} className={styles.row}>
            <span className={styles.rowIcon} aria-hidden>
              <Icon name={hook.icon} size={14} />
            </span>
            <span className={styles.rowCopy}>
              <span className={styles.rowLabel}>{t(hook.labelKey)}</span>
              <small className={styles.rowDesc}>{t(hook.descKey)}</small>
            </span>
            <label className={styles.toggle} title={t(hook.labelKey)}>
              <span className="toggle-switch toggle-switch-sm">
                <input
                  type="checkbox"
                  // aria-label belongs on the input itself — the visible label
                  // text is just the slider spans, so without this the checkbox
                  // has no accessible name for screen readers / role queries.
                  aria-label={t(hook.labelKey)}
                  checked={flags[hook.key]}
                  disabled={!enabled}
                  onChange={(e) => onToggle(hook.key, e.target.checked)}
                />
                <span className="toggle-slider" />
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
