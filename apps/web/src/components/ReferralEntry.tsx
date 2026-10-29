import { parseReferralSummary } from '@open-design/contracts';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { openReferralActivity } from '../runtime/referral-navigation';
import { getReferralEntryCopy } from './referral-entry-copy';
import styles from './ReferralEntry.module.css';

type EntryState = { active: boolean; profile: string | null; scopeKey: string };
const ReferralEntryContext = createContext<EntryState>({ active: false, profile: null, scopeKey: "" });

export function ReferralEntryProvider({ accountId, profile, children }: { accountId: string | null; profile: string | null; children: ReactNode }) {
  const [result, setResult] = useState<{ key: string; active: boolean } | null>(null);
  const key = `${profile}:${accountId}`;
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    let current = true;
    let generation = 0;
    const read = async () => {
      const request = ++generation;
      try {
        const response = await fetch('/api/integrations/vela/referral-summary', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('unavailable');
        const data = parseReferralSummary(await response.json());
        if (current && request === generation) setResult({ key, active: data?.campaignStatus === 'active' });
      } catch {
        if (current && request === generation) setResult({ key, active: false });
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 30_000);
    window.addEventListener('focus', read);
    return () => { current = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', read); };
  }, [accountId, key]);
  return <ReferralEntryContext.Provider value={{ active: Boolean(accountId && result?.key === key && result.active), profile, scopeKey: key }}>{children}</ReferralEntryContext.Provider>;
}

export function ReferralEntry({ compact = false }: { compact?: boolean }) {
  const { active, profile, scopeKey } = useContext(ReferralEntryContext);
  const { locale } = useI18n();
  const [failed, setFailed] = useState(false);
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  useEffect(() => setFailed(false), [scopeKey, active]);
  if (!active || compact) return null;
  const zh = locale === 'zh-CN' || locale === 'zh-TW';
  const [title, subtitle] = getReferralEntryCopy(locale);
  const open = async () => {
    try {
      const accepted = await openReferralActivity(profile, () => currentScope.current === scopeKey);
      if (currentScope.current === scopeKey) setFailed(!accepted);
    } catch { if (currentScope.current === scopeKey) setFailed(true); }
  };
  return <div className={styles.slot}><button type="button" className={styles.card} data-testid="referral-entry" aria-label={`${title} — ${subtitle}`} title={`${title} — ${subtitle}`} onClick={() => void open()}><span className={styles.art} aria-hidden="true" /><span className={styles.copy}><strong>{title}</strong><span>{subtitle}</span></span></button>{failed ? <span role="alert">{zh ? '无法打开页面，请重试。' : 'Unable to open the page. Please try again.'}</span> : null}</div>;
}
