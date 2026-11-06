// Floats above everything else and surfaces a transient "Memory updated"
// pill whenever the daemon emits a `kind: 'extract'` change event. We
// only fire on extraction events so a manual edit in the settings panel
// doesn't bounce a redundant toast back at the user (their click was the
// confirmation). The pill is clickable: tapping it opens Settings →
// Memory so the user can immediately see (and edit) the freshly
// extracted entries. The component owns its own EventSource so it can
// be dropped into App.tsx with no other plumbing.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  MemoryChangeEvent,
  MemoryExtractionEvent,
} from '@open-design/contracts';
import { useT } from '../i18n';
import { toastSlideUp } from '../motion';

interface ActiveToast {
  key: number;
  count: number;
  source?: MemoryChangeEvent['source'];
}

interface Props {
  // Optional click handler. When provided, the pill becomes a button
  // and clicking it should jump the user into Settings → Memory.
  onOpenMemory?: () => void;
  /**
   * `off` preserves the browser's HTTP/1.1 connection budget while a project
   * is hydrating. `activity` is used only while a project run can produce a
   * memory extraction; when that run ends we keep the stream just long enough
   * to observe the extraction's own terminal event. Other shell surfaces keep
   * the existing always-on notification behavior.
   */
  subscriptionMode?: MemoryToastSubscriptionMode;
}

const VISIBLE_MS = 4500;
const EXTRACTION_START_GRACE_MS = 10_000;

export type MemoryToastSubscriptionMode = 'always' | 'activity' | 'off';

export function memoryToastSubscriptionMode(input: {
  routeKind: string;
  projectRunActive: boolean;
  memorySurfaceOpen: boolean;
}): MemoryToastSubscriptionMode {
  // MemorySection owns the same endpoint while its surface is open, so a
  // second toast-only connection would be redundant.
  if (input.memorySurfaceOpen) return 'off';
  if (input.routeKind !== 'project') return 'always';
  return input.projectRunActive ? 'activity' : 'off';
}

export function MemoryToast({
  onOpenMemory,
  subscriptionMode = 'always',
}: Props) {
  const t = useT();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const [subscribed, setSubscribed] = useState(subscriptionMode !== 'off');
  // We keep the dismiss timer in a ref so a second event mid-flight
  // resets the countdown instead of double-dismissing.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionModeRef = useRef(subscriptionMode);
  const subscriptionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeExtractionIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const previousMode = subscriptionModeRef.current;
    subscriptionModeRef.current = subscriptionMode;
    if (subscriptionCloseTimerRef.current) {
      clearTimeout(subscriptionCloseTimerRef.current);
      subscriptionCloseTimerRef.current = null;
    }
    if (subscriptionMode !== 'off') {
      setSubscribed(true);
      return;
    }
    // Entering a project from Home must release the memory slot immediately.
    // Only a stream that was opened for an active run gets a short hand-off
    // window so the post-child-close extractor can announce its `running` id.
    if (previousMode !== 'activity') {
      activeExtractionIdsRef.current.clear();
      setSubscribed(false);
      return;
    }
    subscriptionCloseTimerRef.current = setTimeout(() => {
      subscriptionCloseTimerRef.current = null;
      if (
        subscriptionModeRef.current === 'off'
        && activeExtractionIdsRef.current.size === 0
      ) {
        setSubscribed(false);
      }
    }, EXTRACTION_START_GRACE_MS);
  }, [subscriptionMode]);

  useEffect(() => () => {
    if (subscriptionCloseTimerRef.current) {
      clearTimeout(subscriptionCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!subscribed) return;
    // Guard for environments without EventSource (jsdom in tests, SSR).
    // The toast is purely a UX nicety; no SSE just means no auto-pop-up.
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/memory/events');
    es.addEventListener('change', (raw) => {
      try {
        const event = JSON.parse((raw as MessageEvent).data) as MemoryChangeEvent;
        if (event.kind !== 'extract') return;
        if ((event.count ?? 0) <= 0) return;
        // Source defaults to heuristic but a manual extract via curl
        // would still be useful to surface. Only suppress when source is
        // 'manual' (won't currently fire, reserved for future settings
        // bulk-import hook).
        if (event.source === 'manual') return;
        setToast({
          key: Date.now(),
          count: event.count ?? 1,
          source: event.source,
        });
      } catch {
        // Malformed payload — ignore.
      }
    });
    es.addEventListener('error', () => {
      // The browser will auto-reconnect. We don't surface connection
      // failures because the SSE channel is purely a UX nicety; missing
      // a notification still lets the user see updates next time they
      // open Settings → Memory.
    });
    es.addEventListener('extraction', (raw) => {
      try {
        const event = JSON.parse((raw as MessageEvent).data) as MemoryExtractionEvent;
        if (!event?.id) return;
        if (event.phase === 'running') {
          activeExtractionIdsRef.current.add(event.id);
          if (subscriptionCloseTimerRef.current) {
            clearTimeout(subscriptionCloseTimerRef.current);
            subscriptionCloseTimerRef.current = null;
          }
          return;
        }
        activeExtractionIdsRef.current.delete(event.id);
        if (
          subscriptionModeRef.current === 'off'
          && activeExtractionIdsRef.current.size === 0
        ) {
          subscriptionCloseTimerRef.current = setTimeout(() => {
            subscriptionCloseTimerRef.current = null;
            if (subscriptionModeRef.current === 'off') setSubscribed(false);
          }, 0);
        }
      } catch {
        // Malformed payload — ignore.
      }
    });
    return () => {
      es.close();
    };
  }, [subscribed]);

  useEffect(() => {
    if (!toast) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast]);

  const label = toast ? t('settings.memoryToastChanged') : '';
  const detail = toast
    ? toast.source === 'llm'
      ? `(${toast.count} · LLM)`
      : toast.source === 'annotation'
        ? `(${toast.count} · annotations)`
        : `(${toast.count})`
    : '';
  const clickHint = toast ? t('settings.memoryToastClickHint') : '';

  const pillStyle: CSSProperties = {
    position: 'fixed',
    bottom: 20,
    right: 20,
    zIndex: 1000,
    padding: '8px 14px',
    borderRadius: 999,
    background: 'rgba(20, 20, 20, 0.92)',
    color: '#fff',
    fontSize: 13,
    boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backdropFilter: 'blur(8px)',
    border: 'none',
    font: 'inherit',
    cursor: onOpenMemory ? 'pointer' : 'default',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  };

  return (
    <AnimatePresence>
      {toast ? (
        !onOpenMemory ? (
          <motion.div
            key={toast.key}
            role="status"
            aria-live="polite"
            style={pillStyle}
            variants={toastSlideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <span aria-hidden style={{ fontSize: 14 }}>✦</span>
            <span>{label}</span>
            <span style={{ opacity: 0.65 }}>{detail}</span>
          </motion.div>
        ) : (
          <motion.button
            key={toast.key}
            type="button"
            aria-live="polite"
            aria-label={`${label} ${detail} — ${clickHint}`}
            title={clickHint}
            onClick={onOpenMemory}
            whileHover={{ y: -1, boxShadow: '0 10px 28px rgba(0,0,0,0.24)' }}
            style={pillStyle}
            variants={toastSlideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <span aria-hidden style={{ fontSize: 14 }}>✦</span>
            <span>{label}</span>
            <span style={{ opacity: 0.65 }}>{detail}</span>
            <span
              aria-hidden
              style={{
                marginLeft: 4,
                paddingLeft: 8,
                borderLeft: '1px solid rgba(255,255,255,0.18)',
                opacity: 0.85,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {clickHint} →
            </span>
          </motion.button>
        )
      ) : null}
    </AnimatePresence>
  );
}
