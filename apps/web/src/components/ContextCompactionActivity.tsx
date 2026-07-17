import { useEffect, useRef, useState } from 'react';
import { trackContextCompactionUiResult } from '../analytics/events';
import { useAnalytics } from '../analytics/provider';
import { useT } from '../i18n';
import type { AgentEvent } from '../types';
import styles from './ContextCompactionActivity.module.css';

type CompactionActivity = Extract<AgentEvent, { kind: 'activity' }>;

interface ContextCompactionActivityProps {
  activity: CompactionActivity;
  runId: string | null;
  projectId: string | null;
  conversationId: string | null;
  renderSource: 'live_stream' | 'persisted_history';
}

export function ContextCompactionActivity({
  activity,
  runId,
  projectId,
  conversationId,
  renderSource,
}: ContextCompactionActivityProps) {
  const t = useT();
  const analytics = useAnalytics();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackedViews = useRef(new Set<string>());
  const activeSeen = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const active = activity.phase === 'started' || activity.phase === 'progress';

  useEffect(() => {
    if (active) activeSeen.current = true;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const trackingKey = `${activity.activityId}:${activity.phase}:${renderSource}`;
    const captureVisibleState = () => {
      if (trackedViews.current.has(trackingKey)) return;
      trackedViews.current.add(trackingKey);
      const renderedPhaseValue = root.dataset.compactionPhase;
      const renderedPhase = (
        renderedPhaseValue === 'started' ||
        renderedPhaseValue === 'progress' ||
        renderedPhaseValue === 'completed' ||
        renderedPhaseValue === 'failed'
      ) ? renderedPhaseValue : 'missing';
      const observedAt = Date.now();
      const observedElapsedMs = active && typeof activity.startedAt === 'number'
        ? Math.max(0, observedAt - activity.startedAt)
        : typeof activity.elapsedMs === 'number'
          ? Math.max(0, activity.elapsedMs)
          : undefined;
      const visibility = document.visibilityState;
      trackContextCompactionUiResult(analytics.track, {
        page_name: 'chat_panel',
        area: 'assistant_message',
        element: 'context_compaction_activity',
        result: 'visible',
        activity_id: activity.activityId,
        run_id: runId,
        project_id: projectId,
        conversation_id: conversationId,
        event_phase: activity.phase,
        rendered_phase: renderedPhase,
        phase_match: renderedPhase === activity.phase,
        render_source: renderSource,
        elapsed_displayed: observedElapsedMs !== undefined,
        ...(observedElapsedMs !== undefined ? { elapsed_ms: observedElapsedMs } : {}),
        active_seen_before_terminal: activeSeen.current,
        reduced_motion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        document_visibility: visibility === 'visible' || visibility === 'hidden' || visibility === 'prerender'
          ? visibility
          : 'unknown',
        component_version: 'v1',
        ...(renderSource === 'live_stream'
          && typeof activity.startedAt === 'number'
          && observedAt >= activity.startedAt
          ? { time_to_visible_ms: observedAt - activity.startedAt }
          : {}),
      }, {
        insertId: `${activity.activityId}:ui:${activity.phase}:${renderSource}`,
      });
    };

    if (typeof IntersectionObserver === 'undefined') {
      captureVisibleState();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        captureVisibleState();
        observer.disconnect();
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [
    activity.activityId,
    activity.elapsedMs,
    activity.phase,
    activity.startedAt,
    analytics.track,
    conversationId,
    projectId,
    renderSource,
    runId,
  ]);

  const elapsedMs = active
    ? typeof activity.startedAt === 'number'
      ? Math.max(0, now - activity.startedAt)
      : null
    : typeof activity.elapsedMs === 'number'
      ? Math.max(0, activity.elapsedMs)
      : null;
  let title = t('assistant.compactionCompletedTitle');
  if (active) {
    title = t('assistant.compactionActiveTitle');
  } else if (activity.phase === 'failed') {
    title = t('assistant.compactionFailedTitle');
  }
  const detail = active ? t('assistant.compactionActiveDetail') : undefined;

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${active ? styles.active : styles.settled}`}
      data-compaction-phase={activity.phase}
      role="status"
      aria-live="polite"
      aria-label={detail ? `${title}. ${detail}` : title}
    >
      <div className={styles.visual} aria-hidden="true" data-testid="compaction-context-lines">
        <span className={`${styles.contextLine} ${styles.contextLineTop}`} />
        <span className={`${styles.contextLine} ${styles.contextLineUpper}`} />
        <span className={styles.retainedCore} />
        <span className={`${styles.contextLine} ${styles.contextLineLower}`} />
        <span className={`${styles.contextLine} ${styles.contextLineBottom}`} />
      </div>
      <div className={styles.copy}>
        <span className={styles.title}>{title}</span>
        {detail ? <span className={styles.detail}>{detail}</span> : null}
      </div>
      {elapsedMs !== null ? (
        <span className={styles.elapsed} aria-hidden="true">{formatElapsed(elapsedMs)}</span>
      ) : null}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}
