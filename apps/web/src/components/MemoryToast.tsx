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
import type { MemoryChangeEvent } from '@open-design/contracts';
import { useT } from '../i18n';

interface ActiveToast {
  key: number;
  count: number;
  source?: MemoryChangeEvent['source'];
}

interface Props {
  // Optional click handler. When provided, the pill becomes a button
  // and clicking it should jump the user into Settings → Memory.
  onOpenMemory?: () => void;
}

const VISIBLE_MS = 4500;

export function MemoryToast({ onOpenMemory }: Props) {
  const t = useT();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  // We keep the dismiss timer in a ref so a second event mid-flight
  // resets the countdown instead of double-dismissing.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast]);

  if (!toast) return null;

  const label = t('settings.memoryToastChanged');
  const detail =
    toast.source === 'llm'
      ? `(${toast.count} · LLM)`
      : `(${toast.count})`;
  const clickHint = t('settings.memoryToastClickHint');

  // Reset native button styling. The pill needs to look identical to
  // the previous div + carry button semantics so screen readers and
  // keyboard users can activate it.
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

  if (!onOpenMemory) {
    return (
      <div role="status" aria-live="polite" style={pillStyle}>
        <span aria-hidden style={{ fontSize: 14 }}>✦</span>
        <span>{label}</span>
        <span style={{ opacity: 0.65 }}>{detail}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-live="polite"
      aria-label={`${label} ${detail} — ${clickHint}`}
      title={clickHint}
      onClick={onOpenMemory}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.24)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.18)';
      }}
      style={pillStyle}
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
    </button>
  );
}
