import { useEffect, useRef } from 'react';
import type { ReferralEntrySource } from '../runtime/referral-navigation';
import { observeAnalytics } from './observe';
import { useAnalytics } from './provider';

type ReferralNoticeState = 'registered' | 'exhausted';

export function useReferralAnalytics<T extends HTMLElement>(
  source: ReferralEntrySource,
  visibleScope: string | null,
  noticeState?: ReferralNoticeState,
) {
  const { track } = useAnalytics();
  const ref = useRef<T>(null);
  const viewedScope = useRef<string | null>(null);
  const properties = {
    page_name: 'home',
    area: source === 'client_entry' ? 'referral_entry' : 'referral_notice',
    client_surface: 'client',
    entry_source: source,
    ...(noticeState ? { notice_state: noticeState } : {}),
  };
  const latest = useRef(properties);
  latest.current = properties;

  useEffect(() => {
    if (viewedScope.current !== visibleScope) viewedScope.current = null;
    const node = ref.current;
    if (!visibleScope || !node || typeof IntersectionObserver === 'undefined') return;

    let intersects = false;
    let active = true;
    const report = () => {
      if (!active || !intersects || document.visibilityState !== 'visible'
        || viewedScope.current === visibleScope) return;
      viewedScope.current = visibleScope;
      observeAnalytics(() => track('surface_view', {
        ...latest.current,
        element: source === 'client_entry' ? 'invite' : 'notice',
        surface_instance_id: crypto.randomUUID(),
      }));
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry?.isIntersecting === true;
      report();
    });
    observer.observe(node);
    document.addEventListener('visibilitychange', report);
    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener('visibilitychange', report);
    };
  }, [source, track, visibleScope]);

  return {
    ref,
    click(element: 'invite' | 'subscribe' | 'close') {
      observeAnalytics(() => track('ui_click', { ...properties, element }));
    },
  };
}
