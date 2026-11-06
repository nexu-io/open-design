// Structured editor for the singleton user profile (id `user_profile`, type
// `profile`). The profile is the PRE-loop foundation: the daemon injects it
// into every task brief, so a few labelled fields here become the default
// context the agent infers intent from.
//
// Persistence:
//   - GET  /api/memory/user_profile  → { entry: { body } } (404 → empty form)
//   - PUT  /api/memory/user_profile  → body assembled as `- <Label>: <value>`
//     lines; the daemon renders that as a key/value block in the prompt.
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import { PROFILE_MEMORY_ID } from '@open-design/contracts';
import type { MemoryEntry } from '@open-design/contracts';
import { Icon } from './Icon';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import styles from './MemoryProfilePanel.module.css';

// Ordered profile fields. Each `label` is the human key written to the body
// (`- <label>: <value>`); the `labelKey` is its localized caption. The labels
// are stable English strings so the body the daemon stores stays parseable
// regardless of the UI locale.
const PROFILE_FIELDS: ReadonlyArray<{
  label: string;
  labelKey: keyof Dict;
  placeholderKey: keyof Dict;
  multiline?: boolean;
}> = [
  { label: 'Role', labelKey: 'settings.memoryProfileRole', placeholderKey: 'settings.memoryProfileRolePlaceholder' },
  { label: 'Organization size', labelKey: 'settings.onboardingOrgSizeLabel', placeholderKey: 'settings.onboardingSelectPlaceholder' },
  { label: 'Use cases', labelKey: 'settings.onboardingUseCaseLabel', placeholderKey: 'settings.onboardingSelectMultiplePlaceholder', multiline: true },
  { label: 'Discovery source', labelKey: 'settings.onboardingSourceLabel', placeholderKey: 'settings.onboardingSelectPlaceholder' },
  { label: 'Company / Team', labelKey: 'settings.memoryProfileCompany', placeholderKey: 'settings.memoryProfileCompanyPlaceholder' },
  { label: 'Domain', labelKey: 'settings.memoryProfileDomain', placeholderKey: 'settings.memoryProfileDomainPlaceholder' },
  { label: 'Primary audience', labelKey: 'settings.memoryProfileAudience', placeholderKey: 'settings.memoryProfileAudiencePlaceholder' },
  { label: 'Aesthetic / taste', labelKey: 'settings.memoryProfileAesthetic', placeholderKey: 'settings.memoryProfileAestheticPlaceholder', multiline: true },
  { label: 'Default deliverables', labelKey: 'settings.memoryProfileDeliverables', placeholderKey: 'settings.memoryProfileDeliverablesPlaceholder' },
  { label: 'Locale / Language', labelKey: 'settings.memoryProfileLocale', placeholderKey: 'settings.memoryProfileLocalePlaceholder' },
  { label: 'Current goals', labelKey: 'settings.memoryProfileGoals', placeholderKey: 'settings.memoryProfileGoalsPlaceholder', multiline: true },
];

// Parse a stored profile body back into the structured fields. The body is a
// set of `- <Label>: <value>` lines; we match each known label case-
// insensitively so a hand-edited file still hydrates the form.
function parseProfileBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*-\s*([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const rawLabel = (m[1] ?? '').trim().toLowerCase();
    const value = (m[2] ?? '').trim();
    const field = PROFILE_FIELDS.find((f) => f.label.toLowerCase() === rawLabel);
    if (field) out[field.label] = value;
  }
  return out;
}

// Assemble the structured fields back into a `- <Label>: <value>` body. Empty
// fields are dropped so the stored body stays free of placeholder noise.
function assembleProfileBody(values: Record<string, string>): string {
  return PROFILE_FIELDS.map((f) => {
    const v = (values[f.label] ?? '').trim();
    return v ? `- ${f.label}: ${v}` : null;
  })
    .filter((line): line is string => line !== null)
    .join('\n');
}

export function MemoryProfilePanel({ enabled }: { enabled: boolean }) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/memory/${encodeURIComponent(PROFILE_MEMORY_ID)}`);
      if (resp.status === 404) {
        setValues({});
        return;
      }
      if (!resp.ok) return;
      const json = (await resp.json()) as { entry?: MemoryEntry };
      setValues(parseProfileBody(json.entry?.body ?? ''));
    } catch {
      // Network blips leave the form empty rather than crashing the panel.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async () => {
    setBusy(true);
    setSaved(false);
    try {
      const resp = await fetch(`/api/memory/${encodeURIComponent(PROFILE_MEMORY_ID)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'profile',
          name: t('settings.memoryProfileName'),
          description: t('settings.memoryProfileDescription'),
          body: assembleProfileBody(values),
        }),
      });
      if (resp.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    } finally {
      setBusy(false);
    }
  }, [values, t]);

  return (
    <div className={styles.panel} data-testid="memory-profile-panel">
      <div className={styles.head}>
        <span className={styles.headIcon} aria-hidden>
          <Icon name="home" size={15} />
        </span>
        <div>
          <h4 className={styles.title}>{t('settings.memoryProfileTitle')}</h4>
          <p className={styles.hint}>{t('settings.memoryProfileHint')}</p>
        </div>
      </div>

      <div className={styles.fields}>
        {PROFILE_FIELDS.map((field) => (
          <label key={field.label} className={styles.field}>
            <span className={styles.fieldLabel}>{t(field.labelKey)}</span>
            {field.multiline ? (
              <textarea
                rows={2}
                value={values[field.label] ?? ''}
                placeholder={t(field.placeholderKey)}
                disabled={!enabled || loading}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.label]: e.target.value }))
                }
              />
            ) : (
              <input
                type="text"
                value={values[field.label] ?? ''}
                placeholder={t(field.placeholderKey)}
                disabled={!enabled || loading}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.label]: e.target.value }))
                }
              />
            )}
          </label>
        ))}
      </div>

      <div className={styles.actions}>
        {saved ? (
          <span className={styles.savedPill} role="status" aria-live="polite">
            {t('settings.memoryProfileSaved')}
          </span>
        ) : null}
        <Button variant="primary" onClick={() => void onSave()} disabled={busy || !enabled}>
          {busy ? t('settings.memoryProfileSaving') : t('settings.memoryProfileSave')}
        </Button>
      </div>
    </div>
  );
}
