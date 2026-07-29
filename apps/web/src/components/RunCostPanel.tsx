import { useEffect, useState } from 'react';
import type { RunCostResponse } from '@open-design/contracts';
import { useT } from '../i18n';
import styles from './RunCostPanel.module.css';

/**
 * Cost decomposition for one finished run, read from `GET /api/runs/:id/cost`.
 *
 * The daemon derives every figure from the run's persisted event log, so this
 * costs nothing to show and works on runs that finished long ago. It is the web
 * half of the dual-track surface whose CLI form is `od run cost <runId>`; both
 * call the same endpoint so the two can never report different numbers.
 *
 * Money figures are ESTIMATES against a fixed rate card, not billing truth —
 * the panel says so rather than letting a precise-looking dollar sign imply
 * more than it should.
 */

function usd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function tokens(value: number): string {
  return value.toLocaleString('en-US');
}

/** Share of the output total, so every rendered category uses one denominator. */
function outputShare(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '—';
}

export function RunCostPanel({ runId }: { runId: string }) {
  const t = useT();
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: RunCostResponse }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetch(`/api/runs/${encodeURIComponent(runId)}/cost`)
      .then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error(String(resp.status)))))
      .then((data: RunCostResponse) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (state.kind === 'loading') {
    return (
      <div className={styles.panel}>
        <p className={styles.status}>{t('runCost.loading')}</p>
      </div>
    );
  }
  if (state.kind === 'error' || !state.data.report) {
    // An aggregate-usage run is worth naming rather than folding into a generic
    // "unavailable": the cause is the agent's stream family, not the run, so
    // re-running it changes nothing and the user should not go looking.
    const reason =
      state.kind === 'ready' && state.data.unavailableReason === 'aggregate-usage-only'
        ? t('runCost.unavailableAggregate')
        : t('runCost.unavailable');
    return (
      <div className={styles.panel}>
        <p className={styles.status}>{reason}</p>
      </div>
    );
  }

  const { report } = state.data;
  const { usd: cost, terms, cacheHealth, anomalies, output, intake, steps } = report;
  const share = (value: number) =>
    cost.total > 0 ? `${((value / cost.total) * 100).toFixed(1)}%` : '—';
  const peak = steps.reduce((max, step) => Math.max(max, step.contextTokens), 0);

  const rows: Array<{ key: string; label: string; value: number; hint?: string }> = [
    {
      key: 'preamble',
      label: t('runCost.preamble'),
      value: cost.preamble,
      // The load-bearing caveat: this term is why splitting a run across
      // isolated sub-agents cannot pay off when it dominates.
      hint: t('runCost.preambleHint'),
    },
    { key: 'transcript', label: t('runCost.transcript'), value: cost.transcript },
    { key: 'cacheWrite', label: t('runCost.cacheWrite'), value: cost.cacheWrite },
    { key: 'uncachedInput', label: t('runCost.uncachedInput'), value: cost.uncachedInput },
    { key: 'output', label: t('runCost.output'), value: cost.output },
  ];

  return (
    <div className={styles.panel}>
      <p className={styles.note}>
        {t('runCost.estimateNote')} · {t('runCost.calls', { count: String(steps.length) })} ·{' '}
        {t('runCost.peakContext', { tokens: tokens(peak) })}
      </p>

      <div className={styles.scroll}>
        <div className={styles.rows}>
          {rows.map((row) => (
            <Row key={row.key} label={row.label} value={usd(row.value)} share={share(row.value)} hint={row.hint} />
          ))}
          <span className={`${styles.label} ${styles.total}`}>{t('runCost.total')}</span>
          <span className={`${styles.value} ${styles.total}`}>{usd(cost.total)}</span>
          <span className={styles.share} />
        </div>
      </div>

      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t('runCost.cacheHealth')}</p>
        <p className={styles.status}>
          {/* Zero comparable steps has two causes: a write is only judgeable
              against the NEXT call's context growth, so a single-call run has
              nothing to compare even when it wrote a large cache — separate
              from an adapter that never reports writes at all. Showing "no
              cache writes" for the first case contradicts the cache-write row
              rendered just above. */}
          {cacheHealth.comparableSteps === 0
            ? t(terms.cacheWriteTokens > 0
                ? 'runCost.cacheHealthNotComparable'
                : 'runCost.noCacheWrites')
            : t('runCost.cacheHealthSummary', {
                incremental: String(cacheHealth.incrementalSteps),
                comparable: String(cacheHealth.comparableSteps),
                rewritten: tokens(cacheHealth.rewrittenTokens),
              })}
        </p>
        {anomalies.map((anomaly, index) => (
          <p className={styles.anomaly} key={`${anomaly.kind}-${anomaly.stepIndex}-${index}`}>
            [{anomaly.kind}] {t('runCost.step', { index: String(anomaly.stepIndex) })}: {anomaly.detail}
          </p>
        ))}
      </section>

      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t('runCost.outputComposition')}</p>
        <div className={styles.rows}>
          {output.byTool.slice(0, 4).map((tool) => (
            <Row
              key={tool.tool}
              label={tool.tool}
              value={bytes(tool.bytes)}
              share={`${(tool.share * 100).toFixed(1)}%`}
            />
          ))}
          {/* Prose and thinking are both categories of `totalBytes`, so both
              must be rendered: showing prose alone leaves the visible shares
              short of 100% on any reasoning-heavy run, and drops the
              prose-vs-thinking split the API already supplies. */}
          <Row
            label={t('runCost.prose')}
            value={bytes(output.proseBytes)}
            share={outputShare(output.proseBytes, output.totalBytes)}
          />
          <Row
            label={t('runCost.thinking')}
            value={bytes(output.thinkingBytes)}
            share={outputShare(output.thinkingBytes, output.totalBytes)}
          />
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t('runCost.intake')}</p>
        <p className={styles.status}>{t('runCost.intakeHint')}</p>
        <ul className={styles.dragList}>
          {intake.items.slice(0, 4).map((item, index) => (
            <li className={styles.dragItem} key={`${item.label}-${item.stepIndex}-${index}`}>
              <span>{bytes(item.dragBytes)}</span>
              <span>{t('runCost.step', { index: String(item.stepIndex) })}</span>
              <span className={styles.dragLabel} title={item.label}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  share,
  hint,
}: {
  label: string;
  value: string;
  share: string;
  hint?: string;
}) {
  return (
    <>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      <span className={styles.share}>{share}</span>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </>
  );
}
